#!/usr/bin/env node
/**
 * 与鱼 ↔ dsh 桥接（可选组件）
 *
 * 干什么：
 *   把「与鱼」房间里的消息，通过 OneBot 协议推给 dsh；
 *   dsh 的回复再写回与鱼房间。
 *   这样 dsh 就成了与鱼房间里的一个成员，能跑命令、看文件、画图。
 *
 * 为什么需要这个桥：
 *   dsh 只提供两种入口——网页界面、OneBot 反向 WS。
 *   网页要人操作，做不了「房间里自动回复」；反向 WS 是标准协议，我们可以冒充客户端连进去。
 *
 * 数据流：
 *   与鱼页面 → POST /api/yu/send → 房间 msgs[]
 *        ↓ 本桥每 1.5 秒轮询 /api/yu/state
 *   发现新消息 → 组 OneBot 事件 → WebSocket → dsh
 *        ↓ dsh 处理（可能跑工具，10~20 秒）
 *   dsh 调 OneBot action「send_msg」→ 本桥收到
 *        ↓ POST /api/yu/send
 *   写回房间 → 页面上显示
 *
 * 依赖：ws（dsh 反向 WS 只认 Authorization 头，Node 内置 WebSocket 不支持自定义头）
 *   安装：cd bridge && npm install
 *
 * 启动：
 *   cd bridge && npm start
 *   或 node yufish-bridge.js
 *
 * 环境变量（全部有默认值，见下方 CONF）：
 *   YU_BASE     与鱼站点地址，默认 http://127.0.0.1:3000
 *   YU_ROOM     房间号，默认 0000
 *   YU_BOT_PID  桥在与鱼里的身份标识，默认 dsh-fish（不能和真人重复）
 *   YU_BOT_NAME 桥在与鱼里的显示名，默认 小鱼
 *   OB_URL      dsh 的 OneBot 反向 WS 地址，默认 ws://127.0.0.1:6199/ws
 *   OB_TOKEN    与 dsh 配置里的 accessToken 一致，必填
 *   BOT_QQ      模拟的 bot QQ 号（要和 dsh 配置里的 botQQ 一致）
 *   OWNER_QQ    你的 QQ 号（dsh 只认这个 user_id 为管理员）
 *   POLL_MS     轮询间隔，默认 1500
 */

'use strict';

const http = require('http');
let WebSocket;
try {
  WebSocket = require('ws');
} catch {
  console.error('[启动失败] 缺少依赖 ws。请在 bridge/ 目录执行：npm install');
  console.error('          （dsh 反向 WS 只认 Authorization 头，Node 内置 WebSocket 不支持自定义头，所以需要它）');
  process.exit(1);
}

/* ---------- 配置 ---------- */
const CONF = {
  yuBase: process.env.YU_BASE || 'http://127.0.0.1:3000',
  room: process.env.YU_ROOM || '0000',
  botPid: process.env.YU_BOT_PID || 'dsh-fish',
  botName: process.env.YU_BOT_NAME || '小鱼',
  obUrl: process.env.OB_URL || 'ws://127.0.0.1:6199/ws',
  obToken: process.env.OB_TOKEN || '',
  botQQ: process.env.BOT_QQ || '',
  ownerQQ: process.env.OWNER_QQ || '',
  pollMs: Number(process.env.POLL_MS || 1500),
  heartbeatMs: Number(process.env.HEARTBEAT_MS || 20000),
  dupWindowMs: Number(process.env.DUP_WINDOW_MS || 8000),
};

if (!CONF.obToken) {
  console.error('[启动失败] 必须设置 OB_TOKEN，且要与 dsh 配置里的 accessToken 完全一致。');
  process.exit(1);
}
if (!CONF.botQQ || !CONF.ownerQQ) {
  console.error('[启动失败] 必须设置 BOT_QQ 与 OWNER_QQ（dsh 用它们判断谁是管理员）。');
  process.exit(1);
}

function log(...a) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`${t} [bridge]`, ...a);
}

/* ---------- 与鱼 HTTP ---------- */
function yuReq(method, p, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(CONF.yuBase + p);
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      method,
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      headers: data
        ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }
        : {},
      timeout: 15000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf }); }
      });
    });
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout')));
    if (data) r.write(data);
    r.end();
  });
}

/* ---------- 状态 ---------- */
let joined = false;
let lastId = 0;
const seenIds = new Set();
let ws = null;
let wsReady = false;
let stopped = false;
let reconnectDelay = 3000;
let heartbeatTimer = null;
const recentTexts = new Map();   // 防 dsh 重连后补发造成的重复

/* ---------- OneBot 连接 ---------- */
function sendEvent(obj) {
  if (!wsReady || !ws) return false;
  try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
}

function connectOb() {
  if (stopped) return;
  log('连接 dsh OneBot…', CONF.obUrl);

  ws = new WebSocket(CONF.obUrl, {
    headers: { Authorization: `Bearer ${CONF.obToken}` },
    handshakeTimeout: 10000,
  });

  ws.on('open', () => {
    wsReady = true;
    reconnectDelay = 3000;
    log('dsh OneBot 已连接');

    // 发 lifecycle 事件，让 dsh 知道我们上线了
    sendEvent({
      time: Math.floor(Date.now() / 1000),
      self_id: Number(CONF.botQQ),
      post_type: 'meta_event',
      meta_event_type: 'lifecycle',
      sub_type: 'connect',
    });

    /* 必须报活：dsh 侧有心跳检查，超过两倍心跳周期没收到就判定连接死亡、
     * 主动断开。表现为连接反复 1006，且 dsh 把回复排进「超时补发」队列，
     * 重连后重发一遍 —— 与鱼里就会出现重复消息。 */
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      sendEvent({
        time: Math.floor(Date.now() / 1000),
        self_id: Number(CONF.botQQ),
        post_type: 'meta_event',
        meta_event_type: 'heartbeat',
        status: { online: true, good: true },
        interval: CONF.heartbeatMs,
      });
    }, CONF.heartbeatMs);
  });

  ws.on('message', (buf) => {
    let obj;
    try { obj = JSON.parse(buf.toString()); } catch { return; }
    if (obj && obj.action) handleAction(obj).catch((e) => log('动作处理异常:', e.message));
  });

  ws.on('close', (code) => {
    wsReady = false;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (stopped) return;
    log(`连接断开 (code=${code})，${reconnectDelay / 1000} 秒后重连`);
    setTimeout(connectOb, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });

  ws.on('error', (e) => log('连接错误:', e.message));
}

/* ---------- 处理 dsh 下发的动作 ---------- */
async function handleAction(obj) {
  const { action, params, echo } = obj;
  const reply = (data, status = 'ok', retcode = 0) => {
    if (echo !== undefined && wsReady) {
      try { ws.send(JSON.stringify({ status, retcode, data, echo })); } catch {}
    }
  };

  try {
    if (action === 'send_msg' || action === 'send_private_msg') {
      const segs = Array.isArray(params && params.message) ? params.message : [];
      const text = segs.filter((s) => s && s.type === 'text')
        .map((s) => (s.data && s.data.text) || '').join('');
      const images = segs.filter((s) => s && s.type === 'image')
        .map((s) => (s.data && (s.data.file || s.data.url)) || '');

      let sent = null;
      if (text) {
        // 同一个文本短时间内重复，说明是 dsh 重连后的补发，跳过
        const now = Date.now();
        const last = recentTexts.get(text);
        if (last && now - last < CONF.dupWindowMs) {
          log('跳过重复消息:', text.slice(0, 40).replace(/\n/g, ' '));
          reply({ message_id: Date.now() });
          return;
        }
        recentTexts.set(text, now);
        if (recentTexts.size > 200) recentTexts.clear();

        const r = await yuReq('POST', '/api/yu/send', {
          code: CONF.room, pid: CONF.botPid, type: 'text',
          text: String(text).slice(0, 2000),
        });
        if (r && r.error) throw new Error(r.error);
        sent = r && r.msg;
        log('→ 与鱼 文本:', text.slice(0, 40).replace(/\n/g, ' '));
      }

      // 图片：dsh 可能给 base64:// 或 http(s):// 或本地路径
      for (const img of images.slice(0, 1)) {
        try {
          const url = await uploadImage(img);
          if (url) {
            await yuReq('POST', '/api/yu/send', {
              code: CONF.room, pid: CONF.botPid, type: 'img', url,
            });
            log('→ 与鱼 图片');
          }
        } catch (e) {
          log('图片发送失败:', e.message);
        }
      }

      reply({ message_id: (sent && sent.id) || Date.now() });
      return;
    }

    if (action === 'get_login_info') {
      reply({ user_id: Number(CONF.botQQ), nickname: CONF.botName });
      return;
    }

    // 其它动作一律回 ok，避免 dsh 侧等待超时
    reply({});
  } catch (e) {
    log('动作失败:', action, e.message);
    reply({}, 'failed', 1);
  }
}

/* ---------- 图片上传（把 base64 / URL 变成与鱼可用的附件）---------- */
async function uploadImage(src) {
  const s = String(src || '');
  if (!s) return null;

  if (s.startsWith('base64://')) {
    const buf = Buffer.from(s.slice(9), 'base64');
    const boundary = '----bridge' + Date.now();
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="img.png"\r\n` +
      'Content-Type: image/png\r\n\r\n'
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, buf, tail]);
    const u = new URL(CONF.yuBase + `/api/yu/upload?code=${encodeURIComponent(CONF.room)}&pid=${encodeURIComponent(CONF.botPid)}&kind=img`);
    return await new Promise((resolve) => {
      const r = http.request({
        method: 'POST', hostname: u.hostname, port: u.port || 80,
        path: u.pathname + u.search,
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': body.length },
        timeout: 30000,
      }, (res) => {
        let t = '';
        res.on('data', (c) => { t += c; });
        res.on('end', () => {
          try { const j = JSON.parse(t); resolve(j.url || null); } catch { resolve(null); }
        });
      });
      r.on('error', () => resolve(null));
      r.on('timeout', () => { r.destroy(); resolve(null); });
      r.write(body); r.end();
    });
  }

  // http(s) 或已是站内路径
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/yu-f/')) return CONF.yuBase + s;
  return null;
}

/* ---------- 与鱼 → dsh ---------- */
async function join() {
  try {
    const r = await yuReq('POST', '/api/yu/enter', {
      code: CONF.room, pid: CONF.botPid, name: CONF.botName, avatar: '🐟',
    });
    if (r && r.error) { log('进房失败:', r.error); return; }
    joined = true;
    const st = await yuReq('GET', `/api/yu/state?code=${CONF.room}&pid=${CONF.botPid}&since=0`);
    const msgs = (st && st.msgs) || [];
    lastId = msgs.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
    log(`已进入与鱼房间 ${CONF.room}（昵称 ${CONF.botName}），起始 id = ${lastId}（不转发历史）`);
  } catch (e) {
    log('进房请求失败:', e.message);
  }
}

function msgToText(m) {
  if (m.type === 'text') return String(m.text || '');
  if (m.type === 'emoji') return `[表情] ${m.label || m.emoji || ''}`;
  if (m.type === 'img') return '[图片]';
  if (m.type === 'sticker') return '[表情包]';
  if (m.type === 'voice') return '[语音]';
  if (m.type === 'file') return `[文件] ${m.fileName || ''}`;
  return '';
}

function forwardToDsh(m) {
  const raw = msgToText(m);
  if (!raw) return;

  const segs = [];
  if (m.type === 'img' || m.type === 'sticker') {
    const url = m.url ? (String(m.url).startsWith('/') ? CONF.yuBase + m.url : m.url) : '';
    if (!url) {
      segs.push({ type: 'text', data: { text: '[图片]（读不到）' } });
    } else if (/^https?:\/\//i.test(url)) {
      segs.push({ type: 'image', data: { url } });
    } else {
      segs.push({ type: 'text', data: { text: '[图片]' } });
    }
  } else {
    segs.push({ type: 'text', data: { text: raw } });
  }

  const ev = {
    time: Math.floor((m.at || Date.now()) / 1000),
    self_id: Number(CONF.botQQ),
    post_type: 'message',
    message_type: 'private',
    sub_type: 'friend',
    message_id: m.id,
    user_id: Number(CONF.ownerQQ),
    target_id: Number(CONF.botQQ),
    raw_message: raw,
    font: 0,
    sender: { user_id: Number(CONF.ownerQQ), nickname: m.name || '老板' },
    message: segs,
  };

  if (sendEvent(ev)) log(`→ dsh  [${m.type}] ${raw.slice(0, 50).replace(/\n/g, ' ')}`);
  else log('dsh 未连接，消息暂时丢弃:', raw.slice(0, 40));
}

async function poll() {
  if (stopped) return;
  if (!joined) { await join(); return; }

  let st;
  try {
    st = await yuReq('GET', `/api/yu/state?code=${CONF.room}&pid=${CONF.botPid}&since=${lastId}`);
  } catch { return; }

  if (st && st.needJoin) { joined = false; return; }

  const msgs = (st && st.msgs) || [];
  for (const m of msgs) {
    if (!m || !m.id || m.id <= lastId) continue;
    if (m.pid === CONF.botPid) continue;          // 自己发的
    if (seenIds.has(m.id)) continue;
    seenIds.add(m.id);
    lastId = Math.max(lastId, Number(m.id) || 0);
    forwardToDsh(m);
  }

  if (seenIds.size > 500) {
    const keep = [...seenIds].slice(-200);
    seenIds.clear();
    keep.forEach((x) => seenIds.add(x));
  }
}

/* ---------- 启动 ---------- */
function main() {
  log('启动');
  log(`  与鱼: ${CONF.yuBase} 房间 ${CONF.room}`);
  log(`  dsh : ${CONF.obUrl}`);
  connectOb();
  join().then(() => {
    setInterval(poll, CONF.pollMs);
  });

  const stop = () => {
    stopped = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    try { if (ws) ws.close(); } catch {}
    log('已退出');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main();
