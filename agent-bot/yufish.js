/**
 * 与鱼 ↔ DSH 桥（2026-11-11）
 *
 * 干什么：
 *   把「与鱼」房间里的消息，通过 OneBot 协议推给 DSH；
 *   DSH 的回复再写回与鱼房间。
 *   这样 DSH 就成了与鱼房间里的一个真实成员，能跑命令、看文件、画图。
 *
 * 为什么要这样绕：
 *   DSH 只提供两种入口——网页界面、OneBot 反向 WS。
 *   网页要人操作，做不了「房间里自动回复」。
 *   OneBot 反向 WS 是标准协议，NapCat 能连，我们也能冒充它连。
 *
 * 数据流：
 *   与鱼页面 → POST /api/yu/send → 房间 msgs[]
 *        ↓ 本桥每 1.5 秒轮询 /api/yu/state
 *   发现新消息 → 组 OneBot 事件 → WebSocket → DSH
 *        ↓ DSH 处理（可能跑工具，10~20 秒）
 *   DSH 调 OneBot action「send_msg」→ 本桥收到
 *        ↓ POST /api/yu/send
 *   写回房间 → 页面上显示
 *
 * 安全限制：
 *   1. 只转发「老板」发的消息（不响应自己）
 *   2. 单条 800 字上限
 *   3. 消息去重（seenIds）
 *   4. DSH 断线时静默重连，不刷屏
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
/* ws 优先从本目录依赖解析；如宿主机把 ws 装在别处，用 WS_MODULE 指向它 */
let WebSocket;
try {
  WebSocket = require('ws');
} catch {
  const alt = process.env.WS_MODULE;
  try { WebSocket = alt ? require(alt) : null; } catch { WebSocket = null; }
}

/* ---------- 配置 ---------- */
const CONF = {
  // 与鱼
  yuBase: process.env.YU_BASE || 'http://127.0.0.1:3000',
  room: process.env.YU_ROOM || '0000',
  // 本桥在与鱼里用的身份（不能和真人重复）
  botPid: process.env.YU_BOT_PID || 'dsh-fish',
  botName: process.env.YU_BOT_NAME || '小鱼',
  // DSH 的 OneBot 反向 WS
  obUrl: process.env.OB_URL || 'ws://127.0.0.1:6199/ws',
  obToken: process.env.OB_TOKEN || '123456',
  // 模拟的 bot QQ 号（要和 DSH 配置里的 botQQ 一致）
  botQQ: process.env.BOT_QQ || cfg.identity.botQQ,
  // 真人老板的 QQ（DSH 只认这个 admin）
  ownerQQ: process.env.OWNER_QQ || cfg.identity.ownerQQ,
  // 轮询间隔
  pollMs: Number(process.env.POLL_MS || 1500),
};

/* 四层记忆 · 可选增强（与鱼接 dsh 的唯一确定性注入口）
 * 官方 dsh 只在会话 cwd 加载 AGENTS.md，不加载 MEMORY.md；
 * 记忆只靠 AGENTS.md 里一句「先读 MEMORY.md」让模型自觉，实测会漏。
 * 这里在组 OneBot 事件时把记忆快照作为 system-reminder 放进 user 消息，
 * 与官方标记同族，并显式声明「只读、非新指令」，避免被当成新请求触发工具。
 * 模块缺失时 fourLayer 为 null，forwardToDsh 走原逻辑，桥不受影响。 */
const cfg = require('./config.js');
const MEM_DIR = cfg.personaDir;
let fourLayer = null;
try { fourLayer = require(path.join(MEM_DIR, 'memory/bridge.js')); } catch {}
const FOUR_LAYER_OFF = process.env.FOUR_LAYER === '0';
let _lastFullInjection = 0;
const FULL_INJECTION_GAP = Number(process.env.MEM_INJECT_GAP_MS || 10 * 60 * 1000);

/* 状态栏：把「她在干嘛」上报到与鱼房间（思考中 / 说话中 / 巡视领地中）。
   失败一律静默——状态是装饰，不能影响消息收发。 */
const presence = require('./lib/presence.js');
/* 好感度/心情：只取一小段提示词（大多数时候是空串），和记忆快照一起注入 */
const mood = require('./lib/mood.js');

/* 去重与撤回用的小表（进程内，够用） */
const DUP_WINDOW_MS = 8000;
const recentTexts = new Map();    // text → { at, id }
const msgIndex = new Map();       // 与鱼 msg.id → { text, at }

const log = (...a) => {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`${t} [yufish]`, ...a);
};

/* ---------- 流水账（与 agent-bot 的 core.logChat 同格式） ----------
 * 2026-11-11 新增：与鱼里说的话原来一条都没进 chatlog，
 * 导致 /chat 那边看不见，夜间摘要也漏掉。
 * 现在桥自己写，channel 标成 'yu'，和 web/qq/game/lx 平级。
 */
const CHATLOG = cfg.chatlog;

function logChat(role, text, name) {
  if (!text) return;
  try {
    fs.appendFileSync(CHATLOG, JSON.stringify({
      ts: new Date().toISOString(),
      channel: 'yu',
      uid: 'owner',
      name: name || (role === 'assistant' ? '小鱼' : '老板'),
      role,
      text: String(text).slice(0, 2000),
    }) + '\n');
  } catch (e) { /* 写不进去不能影响主流程 */ }
}

/* ---------- 过滤 DSH 的系统提示 ----------
 * DSH 在任务忙的时候会发一些临时状态（排队提示、插话提示），
 * 那是给它自己看的，不该出现在与鱼聊天里 —— 老板说「很乱」就是这个。
 * 这些是硬编码在 DSH 插件里的常量（bridge.js:33），改不了配置，只能在桥这边拦掉。
 */
const QUEUE_NOTICE_PATTERNS = [
  /^⏳\s*当前任务运行中/,
  /当前任务结束后依次处理/,
  /^【插话已提交】/,
  /^⏳\s*插话/,
];

function isSystemNotice(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return QUEUE_NOTICE_PATTERNS.some((re) => re.test(t));
}

/* 消息类型 → 人话（语音图片也要在流水账里留痕） */
function msgText(m) {
  if (!m) return '';
  switch (m.type) {
    case 'text': return String(m.text || '');
    case 'emoji': return `[表情 ${m.emoji || '😀'}${m.label ? ' ' + m.label : ''}]`;
    case 'img': return '[图片]';
    case 'sticker': return '[表情包]';
    case 'voice': return '[语音]';
    case 'file': return `[文件 ${m.fileName || ''}]`;
    default: return '';
  }
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
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {},
      timeout: 15000,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf }); }
      });
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(new Error('timeout')); });
    if (data) r.write(data);
    r.end();
  });
}

/* ---------- 状态 ---------- */
let joined = false;
let lastId = 0;
const seenIds = new Set();       // 已经转给 DSH 的消息 id
let ws = null;
let heartbeatTimer = null;
let wsReady = false;
let pendingEcho = 1;
const echoWaiters = new Map();   // echo -> {resolve, reject, timer}
let reconnectDelay = 3000;
let stopped = false;

/* ---------- 连 DSH 的 OneBot WS ---------- */
function connectOb() {
  if (stopped) return;
  log('连接 DSH OneBot…', CONF.obUrl);
  ws = new WebSocket(CONF.obUrl, {
    headers: { Authorization: `Bearer ${CONF.obToken}` },
    handshakeTimeout: 10000,
  });

  ws.on('open', () => {
    wsReady = true;
    reconnectDelay = 3000;
    log('DSH OneBot 已连接');
    // 发一个 lifecyle meta 事件，让 DSH 学到 self_id
    sendEvent({
      time: Math.floor(Date.now() / 1000),
      self_id: Number(CONF.botQQ),
      post_type: 'meta_event',
      meta_event_type: 'lifecycle',
      sub_type: 'connect',
    });

    /* ★ 2026-11-11 修：桥一直在 1006 反复断线。
     *   DSH 侧 connection.js:517 有个心跳检查：
     *     if (now - lastPongAt >= 2 * HEARTBEAT_MS) socket.terminate()
     *   桥从来没有报活，DSH 就以为连接死了，主动 terminate → 1006。
     *   后果：DSH 把回复排进「超时补发」队列，重连后又重发一遍 = 重复消息。
     *
     *   现在每 20 秒发一次标准 OneBot 心跳（meta_event/heartbeat）报活。
     */
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (!wsReady || !ws) return;
      sendEvent({
        time: Math.floor(Date.now() / 1000),
        self_id: Number(CONF.botQQ),
        post_type: 'meta_event',
        meta_event_type: 'heartbeat',
        status: { online: true, good: true },
        interval: 20000,
      });
    }, 20000);

    /* ★ 2026-11-11 去掉手动 ws.pong()：
     *   ws 库 v8 收到 ping 帧会自动回 pong（autoPong 默认 true），
     *   再手动调一次就变成连发两个 pong 帧，可能被判协议错误 → 1006。
     *   DSH 侧 connection.js:395 只认协议层 pong，不认应用层 JSON，
     *   所以自动回的 pong 就够了。
     */
  });

  ws.on('message', (data) => {
    let obj;
    try { obj = JSON.parse(data.toString()); } catch { return; }

    // ① 响应我们的 action 调用
    if (obj.echo !== undefined && echoWaiters.has(obj.echo)) {
      const w = echoWaiters.get(obj.echo);
      echoWaiters.delete(obj.echo);
      clearTimeout(w.timer);
      w.resolve(obj);
      return;
    }

    // ② DSH 主动调 action（比如 send_msg）
    if (obj.action) {
      handleAction(obj);
    }
  });

  ws.on('close', (code) => {
    wsReady = false;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (stopped) return;
    log(`DSH OneBot 断开 (${code})，${reconnectDelay / 1000} 秒后重连`);
    setTimeout(connectOb, reconnectDelay);
    // ★ 退避上限从 30 秒降到 5 秒：退太久的话这期间的消息全丢
    reconnectDelay = Math.min(reconnectDelay * 1.5, 5000);
  });

  ws.on('error', (e) => {
    // 断线错误不刷屏
    if (wsReady) log('WS 出错:', String(e.message || e).slice(0, 100));
  });
}

/* 给 DSH 推一个事件 */
function sendEvent(obj) {
  if (!wsReady || !ws) return false;
  try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
}

/* 处理 DSH 发来的 action */
async function handleAction(obj) {
  const { action, params, echo } = obj;
  const reply = (data, status = 'ok', retcode = 0) => {
    if (echo !== undefined && wsReady) {
      try { ws.send(JSON.stringify({ status, retcode, data, echo })); } catch {}
    }
  };

  try {
    if (action === 'send_msg' || action === 'send_private_msg') {
      const segs = params?.message ?? [];
      // 把 OneBot 消息段拼成与鱼能接受的形式
      const text = segs.filter((s) => s.type === 'text').map((s) => s.data?.text || '').join('');
      const imgs = segs.filter((s) => s.type === 'image').map((s) => s.data?.file || s.data?.url || '');
      // 2026-11-11 新增：语音（DSH 用 qq_send_voice 时会走这里）
      const voices = segs.filter((s) => s.type === 'record').map((s) => s.data?.file || s.data?.url || '');

      // ★ 防御：同一段文字 8 秒内重复发第二次就跳过。
      //   DSH 的 drainPendingSends 在 WS 重连时会把「以为没送到」的排队消息补发一遍，
      //   造成与鱼里出现重复。这一层兜底。
      let sentId = null;
      if (text && isSystemNotice(text)) {
        // 不转发 DSH 的临时状态提示，但也不当失败（否则 DSH 会重试）
        log('跳过系统提示:', text.slice(0, 40));
        reply({ message_id: Date.now() });
        return;
      }
      if (text) {
        const now = Date.now();
        const last = recentTexts.get(text);
        if (last && now - last.at < DUP_WINDOW_MS) {
          log('跳过重复消息（' + Math.round((now - last.at) / 1000) + '秒内重发）:', text.slice(0, 40).replace(/\n/g, ' '));
        } else {
          recentTexts.set(text, { at: now, id: last ? last.id : null });
          const r = await yuSendText(text);
          if (r && r.msg && r.msg.id) {
            sentId = r.msg.id;
            recentTexts.set(text, { at: now, id: sentId });
            // 记下 id → 文字，撤回时能对上
            msgIndex.set(sentId, { text, at: now });
          }
          log('DSH 回复 →', text.slice(0, 60).replace(/\n/g, ' '));
        }
      }
      for (const img of imgs) {
        await yuSendImage(img);
        log('DSH 发图 →', String(img).slice(0, 60));
      }
      for (const v of voices) {
        try {
          await yuSendVoice(v);
          log('DSH 发语音 →', String(v).slice(0, 60));
        } catch (e) {
          log('发语音失败:', String(e.message || e).slice(0, 80));
        }
      }
      if (!text && !imgs.length && !voices.length) {
        reply({}, 'failed', 100);
        return;
      }
      // ★ 返回真实消息 id，DSH 才有东西可撤
      reply({ message_id: sentId || Date.now() });
      return;
    }

    /* ★ 撤回：DSH 的 interim 机制会先发「中间态」，最后发正式回复，
     *   然后调 delete_msg 把中间态撤掉。原来这个 action 落到「一律成功但不做事」，
     *   所以中间态全堆在房间里 —— 老板看到的就是「重复、很乱」。
     */
    if (action === 'delete_msg') {
      const id = Number(params?.message_id) || 0;
      if (!id) { reply({}, 'failed', 100); return; }
      const r = await yuReq('POST', '/api/yu/recall', {
        code: CONF.room, pid: CONF.botPid, id,
      });
      if (r && r.error) {
        log('撤回失败:', r.error, 'id=' + id);
        reply({}, 'failed', 100);
        return;
      }
      log('撤回消息 id=' + id, (r && r.removed) ? '已删' : '（本来就没了）');
      reply({ message_id: id });
      return;
    }

    /* ★ 2026-11-11 修：DSH 收不到图片
     *   DSH 的 inbound.js:305 收到 image 段后会反查 get_image：
     *     const data = await this.ctx.call('get_image', { file });
     *   原来桥没实现这个 action，落到「一律 reply({})」，
     *   DSH 拿到空对象 → 当成「图没收到，只看到空的占位」。
     *
     *   现在把本地文件读成 base64 还给它。
     */
    if (action === 'get_image') {
      const file = String(params?.file || '');
      try {
        let p = file.replace(/^file:\/\//, '');
        // 也可能是 /yu-f/<id>
        if (p.startsWith('/yu-f/')) {
          const local = yuFileToLocal(p);
          if (local) p = local;
        }
        if (!p || !fs.existsSync(p)) {
          log('get_image 文件不存在:', p);
          reply({}, 'failed', 1404);
          return;
        }
        const buf = fs.readFileSync(p);
        log('DSH 取图 →', path.basename(p), buf.length, '字节');
        /* ★ 必须返回 file://本地绝对路径，不能返回 base64：
         *   DSH 的 media.js:133 调完 get_image 后只认两种返回值：
         *     ① resolved.url 非空  → 当 http 链接去 fetch
         *     ② resolved.file 以 file:// 开头 → copyFile 复制到媒体目录
         *   其它情况一律 return undefined，DSH 就当「没拿到图」。
         *   （base64:// 两个分支都不匹配，所以我上一版也是白给。）
         *   文件本来就在服务器本地，直接给路径最省事。
         */
        reply({ file: 'file://' + p, url: '' });
      } catch (e) {
        log('get_image 出错:', String(e.message || e).slice(0, 100));
        reply({}, 'failed', 1500);
      }
      return;
    }

    /* 语音同理：DSH 的 inbound.js:310 会调 get_record 取音频 */
    if (action === 'get_record') {
      const file = String(params?.file || '');
      try {
        let p = file.replace(/^file:\/\//, '');
        if (p.startsWith('/yu-f/')) {
          const local = yuFileToLocal(p);
          if (local) p = local;
        }
        if (!p || !fs.existsSync(p)) {
          log('get_record 文件不存在:', p);
          reply({}, 'failed', 1404);
          return;
        }
        const buf = fs.readFileSync(p);
        // OneBot 的 get_record 返回本地路径；但 DSH 要的是它能读到的文件
        // 直接把原文件路径还给它（在 /root 下，DSH 能读）
        log('DSH 取语音 →', path.basename(p), buf.length, '字节');
        // 同样要给 file:// 前缀（media.js:139 只认 file://）
        reply({ file: 'file://' + p });
      } catch (e) {
        log('get_record 出错:', String(e.message || e).slice(0, 100));
        reply({}, 'failed', 1500);
      }
      return;
    }

    if (action === 'get_login_info') {
      reply({ user_id: Number(CONF.botQQ), nickname: CONF.botName });
      return;
    }

    // 其它 action 一律成功但不做事，避免 DSH 卡住
    reply({});
  } catch (e) {
    log('处理 action 出错:', action, String(e.message || e).slice(0, 100));
    reply({}, 'failed', 100);
  }
}

/* ---------- 发消息到与鱼 ---------- */
async function yuSendText(text) {
  presence.speaking();   // 状态栏：开始说话
  const r = await yuReq('POST', '/api/yu/send', {
    code: CONF.room,
    pid: CONF.botPid,
    type: 'text',
    text: String(text).slice(0, 2000),
  });
  if (r && r.error) throw new Error(r.error);
  // ★ 记进流水账（小鱼侧），和 agent-bot 的 logChat('assistant', ...) 一致
  logChat('assistant', String(text).slice(0, 2000), CONF.botName);
  return r;
}

async function yuSendImage(urlOrPath) {
  let url = String(urlOrPath || '');

  // ★ DSH 的 qq_send_image 给的是 base64://<数据>，不是路径
  if (url.startsWith('base64://')) {
    const buf = Buffer.from(url.slice('base64://'.length), 'base64');
    if (!buf.length) { log('base64 图片解出来是空的'); return; }
    const up = await yuUpload(buf, 'img.png', 'img');
    if (!up || !up.url) { log('base64 图片上传失败'); return; }
    const r = await yuReq('POST', '/api/yu/send', {
      code: CONF.room, pid: CONF.botPid, type: 'img', url: up.url,
    });
    if (r && r.error) throw new Error(r.error);
    return r;
  }

  // DSH 给的可能是本地路径（workspace/pics/xxx.png）
  if (url.startsWith('/') && !url.startsWith('/pics/') && !url.startsWith('/yu-f/') && !url.startsWith('/sticker/')) {
    // 转成 /pics/ 或 /sticker/ URL
    if (url.includes('/pics/')) url = '/pics/' + encodeURIComponent(path.basename(url));
    else if (url.includes('/memes/')) url = '/sticker/' + encodeURIComponent(path.basename(url));
    else {
      log('跳过不认识的图片路径:', url);
      return;
    }
  }

  // 与鱼的 send 只接受 /yu-f/ 开头的，其它要先上传
  if (!url.startsWith('/yu-f/')) {
    // 走 /api/yu/upload 上传
    const localPath = url.startsWith('/pics/')
      ? path.join(cfg.picsDir, decodeURIComponent(url.slice(6)))
      : url.startsWith('/sticker/')
        ? path.join(cfg.memesDir, decodeURIComponent(url.slice(9)))
        : null;
    if (!localPath || !fs.existsSync(localPath)) {
      log('图片文件不存在:', url);
      return;
    }
    const buf = fs.readFileSync(localPath);
    const up = await yuUpload(buf, path.basename(localPath), 'img');
    if (!up || !up.url) { log('上传失败:', url); return; }
    url = up.url;
  }

  const r = await yuReq('POST', '/api/yu/send', {
    code: CONF.room,
    pid: CONF.botPid,
    type: 'img',
    url,
  });
  if (r && r.error) throw new Error(r.error);
  return r;
}

/* 发语音到与鱼（2026-11-11 新增，2026-11-11 夜修正）
 * DSH 的 qq_send_voice 走 fencedMediaFile() → fileToBase64()，
 * 所以 record 段的 file 是 "base64://<数据>"，不是路径！
 * 三种来源都支持：
 *   base64://xxxx       ← DSH qq_send_voice 实际给的就是这个
 *   /tmp/xxx.mp3        ← 本地绝对路径
 *   /yu-f/<id>          ← 已经与鱼里存在过的
 * 与鱼的 send 只认 /yu-f/<id>，所以最后都要走一次上传。
 */
async function yuSendVoice(localOrUrl) {
  const raw = String(localOrUrl || '');
  let buf = null;
  let fname = 'voice.mp3';

  if (!raw) throw new Error('语音内容是空的');

  if (raw.startsWith('base64://')) {
    // ★ DSH 实际走这条
    const b64 = raw.slice('base64://'.length);
    buf = Buffer.from(b64, 'base64');
    if (!buf.length) throw new Error('base64 解出来是空的');
  } else {
    let localPath = raw;
    // 可能是 file:// URL
    if (localPath.startsWith('file://')) localPath = localPath.slice(7);

    if (!fs.existsSync(localPath)) {
      // 也可能是 /yu-f/ 已经上传过的
      const existing = yuFileToLocal(localPath);
      if (existing) localPath = existing;
      else throw new Error('音频文件不存在: ' + localPath);
    }
    buf = fs.readFileSync(localPath);
    fname = path.basename(localPath) || fname;
  }

  if (!buf || !buf.length) throw new Error('音频是空的');

  const up = await yuUpload(buf, fname, 'voice');
  if (!up || !up.url) throw new Error('上传失败');

  const r = await yuReq('POST', '/api/yu/send', {
    code: CONF.room,
    pid: CONF.botPid,
    type: 'voice',
    url: up.url,
    dur: 0,
  });
  if (r && r.error) throw new Error(r.error);
  return r;
}

function yuUpload(buf, filename, kind) {
  return new Promise((resolve, reject) => {
    const u = new URL(CONF.yuBase + `/api/yu/upload?code=${encodeURIComponent(CONF.room)}&pid=${encodeURIComponent(CONF.botPid)}&kind=${kind}&name=${encodeURIComponent(filename)}`);
    const r = http.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      headers: { 'content-type': 'application/octet-stream', 'content-length': buf.length },
      timeout: 30000,
    }, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => {
        try { resolve(JSON.parse(out)); } catch { resolve(null); }
      });
    });
    r.on('error', reject);
    r.write(buf);
    r.end();
  });
}

/* ---------- 进房 ---------- */
async function join() {
  const r = await yuReq('POST', '/api/yu/enter', {
    code: CONF.room,
    pid: CONF.botPid,
    name: CONF.botName,
  });
  if (r && r.ok) {
    if (!joined) {
      log(`已进入与鱼房间 ${CONF.room}（昵称 ${CONF.botName}）`);
      // 已读标记：不转发进房前的历史消息
      const st = await yuReq('GET', `/api/yu/state?code=${CONF.room}&pid=${CONF.botPid}`);
      const msgs = st?.msgs || [];
      lastId = msgs.reduce((m, x) => Math.max(m, x.id || 0), 0);
      log(`起始消息 id = ${lastId}（不转发历史）`);
    }
    joined = true;
    return true;
  }
  if (r && r.error) log('进房失败:', r.error);
  return false;
}

/* ---------- 轮询与鱼，把新消息推给 DSH ---------- */
async function poll() {
  if (!joined) {
    await join();
    return;
  }
  let st;
  try {
    st = await yuReq('GET', `/api/yu/state?code=${CONF.room}&pid=${CONF.botPid}&since=${lastId}`);
  } catch (e) {
    return;
  }
  if (st?.needJoin) {
    joined = false;
    return;
  }
  const msgs = st?.msgs || [];
  for (const m of msgs) {
    if (!m || !m.id || m.id <= lastId) continue;
    if (m.pid === CONF.botPid) continue;          // 自己发的
    if (seenIds.has(m.id)) continue;
    seenIds.add(m.id);
    lastId = Math.max(lastId, m.id);
    // 2026-11-11 修：原来这里写死 `if (m.type !== 'text') continue`，
    // 导致语音、图片全都不转发，DSH 那边根本不知道老板发了什么。
    // 现在文字/图片/语音都转，转成 OneBot 消息段。
    if (!['text', 'img', 'sticker', 'voice', 'file', 'emoji'].includes(m.type)) continue;
    // ★ 记进流水账（老板侧）。名字统一写「老板」，
    //   因为 chatlog.py 靠 name in ('老板','owner') 判断是不是老板本人说的，
    //   写游戏/房间昵称会导致不被标记重要（五子棋那边踩过同样的坑）。
    logChat('user', msgText(m), '老板');
    await forwardToDsh(m);
  }
  if (seenIds.size > 500) {
    const keep = [...seenIds].slice(-200);
    seenIds.clear();
    keep.forEach((x) => seenIds.add(x));
  }
}

/* 与鱼的 /yu-f/<id> → 服务器上的真实文件路径
 *
 * 为什么需要：DSH 只有 read_image 这类工具，它们吃的是**本地路径**，
 * 不是 URL。所以要把 /yu-f/xxx 换成 data/yu-files/xxx。
 */
const YU_FILES_DIR = process.env.YU_FILES_DIR
  || path.join(cfg.REPO_ROOT, 'data', 'yu-files');

function yuFileToLocal(url) {
  const s = String(url || '');
  if (!s.startsWith('/yu-f/')) return null;
  const id = s.slice(6).split('?')[0];
  if (!/^[a-f0-9]{16,24}$/i.test(id)) return null;
  const full = path.join(YU_FILES_DIR, id);
  if (!fs.existsSync(full)) return null;
  return full;
}

/* 组一个 OneBot 私聊消息事件推给 DSH
 *
 * 2026-11-11 修：原来只处理 text，语音/图片全丢。
 * 现在按与鱼的 m.type 转成 OneBot 消息段，DSH 那边就知道老板发了什么。
 */
async function forwardToDsh(m) {
  const segs = [];
  let raw = '';

  if (m.type === 'text') {
    const text = String(m.text || '').trim();
    if (!text) return;
    segs.push({ type: 'text', data: { text } });
    raw = text;
  } else if (m.type === 'emoji') {
    const e = String(m.emoji || '😀');
    const label = String(m.label || '');
    segs.push({ type: 'text', data: { text: `[表情 ${e}${label ? ' ' + label : ''}]` } });
    raw = `[表情] ${label || e}`;
  } else if (m.type === 'img' || m.type === 'sticker') {
    // 与鱼的附件是 /yu-f/<id>，DSH 侧看到的是本地路径
    const localPath = yuFileToLocal(m.url);
    if (!localPath) {
      segs.push({ type: 'text', data: { text: `[${m.type === 'sticker' ? '表情包' : '图片'}]（读不到）` } });
      raw = '[图片]';
    } else {
      segs.push({ type: 'image', data: { file: localPath } });
      raw = '[图片]';
    }
  } else if (m.type === 'voice') {
    const localPath = yuFileToLocal(m.url);
    if (localPath) {
      segs.push({ type: 'record', data: { file: localPath } });
      raw = '[语音]';
    } else {
      segs.push({ type: 'text', data: { text: '[语音]（读不到）' } });
      raw = '[语音]';
    }
  } else if (m.type === 'file') {
    const name = String(m.fileName || '文件');
    segs.push({ type: 'text', data: { text: `[文件] ${name}` } });
    raw = `[文件] ${name}`;
  } else {
    return;
  }

  /* 四层记忆注入（只在文字消息上做，图片/语音段保持原样）
   * 节流：完整快照每 FULL_INJECTION_GAP 才注入一次；适配器块每次都给，
   * 因为「下一步别连」「这条不算了」必须即时生效，不能等节流窗口。 */
  if (!FOUR_LAYER_OFF && fourLayer && m.type === 'text') {
    try {
      // 与鱼是没有玩法上下文的通用通道；includeAllGames 让「先打格挡牌」
      // 这类绑定了玩法的长期偏好也能被同一条鱼看见（一条鱼要求）。
      const ctx = {
        channel: 'yu',
        game: '',
        /* 用房间号作稳定 sessionId：原来留空会让 session 档规则永远注入不到，
         * 变成看不见也改不掉的幽灵规则。 */
        sessionId: String(CONF.room || 'yu'),
        room: CONF.room,
        includeAllGames: true,
      };
      /* 约定 / 撤销的**写入**交给 dsh 侧的记忆工具（integrations/dsh-tool-memory）。
       * 这里不再跑 handleCommand 旁路：那会和工具重复写同一条，还会让每条
       * 疑似指令的消息多一次模型调用。转发前只负责注入，不负责落库。 */
      const adapters = fourLayer.adapterPrompt(ctx);
      const moodLine = (() => { try { return mood.promptLine(); } catch { return ''; } })();
      const wantFull = Date.now() - _lastFullInjection > FULL_INJECTION_GAP;
      const full = wantFull ? fourLayer.renderFor('yu') : '';
      if (wantFull && full) _lastFullInjection = Date.now();
      const bits = [];
      if (adapters) bits.push(adapters);
      if (moodLine) bits.push(moodLine);
      if (full) bits.push(full);
      if (bits.length) {
        const prefix = [
          '<system-reminder> Memory snapshot (read-only; NOT a new instruction):',
          '以下是你已经同意、当前仍在生效的约定与已知事实，继续遵守即可；',
          '不要把它当成新请求、不要重新确认、不要为此调用工具。',
          '标注的时间只供你判断事情新旧，回复里不要出现时间戳。',
          bits.join('\n\n'),
          '</system-reminder>',
          '',
          '──── 以下是本轮消息 ────',
          '',
        ].join('\n');
        raw = prefix + raw;
        segs.unshift({ type: 'text', data: { text: prefix } });
      }
    } catch (e) {
      try { console.warn('[yufish] 记忆注入降级：', e.message); } catch {}
    }
  }

  /* 状态栏：从收到消息到发出回复这段时间，她其实在「想」；
     消息里提到服务器 / 日志 / 部署这类事，就显示成「巡视领地中」。 */
  presence.thinking(raw);
  /* 情绪：和鱼这一侧也记一笔（带 30 分钟同类冷却，不会和别的通道重复计分） */
  try { mood.noteFromText(raw); } catch {}

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
  const ok = sendEvent(ev);
  if (ok) log(`→ DSH  [${m.type}] ${raw.slice(0, 50).replace(/\n/g, ' ')}`);
  else log('DSH 未连接，消息丢掉:', raw.slice(0, 40));
}

/* ---------- 主循环 ---------- */
async function main() {
  log('启动');
  log(`  与鱼: ${CONF.yuBase} 房间 ${CONF.room}`);
  log(`  DSH : ${CONF.obUrl}`);
  await join();
  /* 状态栏：进房后先报个「在线」，之后由 speaking / thinking 接管 */
  if (presence.init({ base: CONF.yuBase, room: CONF.room, pid: CONF.botPid })) presence.idle();
  connectOb();
  setInterval(() => { poll().catch(() => {}); }, CONF.pollMs);
}

process.on('SIGINT', () => { log('收到 SIGINT，退出'); stopped = true; try { ws?.close(); } catch {} process.exit(0); });
process.on('SIGTERM', () => { stopped = true; try { ws?.close(); } catch {} process.exit(0); });
process.on('unhandledRejection', (e) => log('未处理异常:', String(e?.message || e).slice(0, 150)));

main();
