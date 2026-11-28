/* ============================================================
   「与鱼」· 加强版聊天室服务端  (v5)
   文字 / 图片 / 语音 / 文件 / 表情包 / 颜文字 / 头像昵称
   独立房间与独立文件区，不影响原聊天室 /chat
   零依赖：只用 Node 自带模块
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ============================================================
   [EXTERNAL-DEP · TTS] 文字转语音（App 内嵌版改造，2026-11-28）
   ------------------------------------------------------------
   服务器版靠 python3 + edge-tts（/root/bin/tts.py）合成；
   手机沙箱里没有 python3，这里改为 Node 直连微软 Edge 免费接口：
     edge-tts.js（同目录，零依赖）—— 手写最小 RFC6455 WebSocket
     客户端 + Sec-MS-GEC 鉴权，直接产出 mp3 Buffer。
   生成的文件走与鱼已有的上传通道（kind='voice'），
   所以前端拿到的是一个正常的 /yu-f/<id> 语音消息。

   环境变量：
     TTS_VOICE  默认 zh-CN-XiaoxiaoNeural（女声，活泼，最适合小鱼）
     TTS_ENABLE 设成 0 可以整体关闭这个接口
     TTS_PLUGIN 取值 'edge'（默认）/ 'none'（强制关闭，返回明确错误 JSON）

   安全：文字上限 800 字；超时 30 秒；失败返回 {ok:false,error}，
         绝不崩溃、绝不同步阻塞。
   ============================================================ */
const edgeTts = require('./edge-tts.js');
const TTS_VOICE = process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural';
const TTS_ENABLE = process.env.TTS_ENABLE !== '0' && process.env.TTS_PLUGIN !== 'none';
const TTS_MAX_CHARS = 800;
/* App 内嵌版：临时文件写进调用方传入的目录（yu-files），目录已存在 */

async function synthSpeech(text, voice, dir) {
  try {
    const buf = await edgeTts.synthesize(text, voice || TTS_VOICE);
    if (!buf || !buf.length) return { ok: false, error: '合成的音频是空的' };
    const file = path.join(dir, `yu-tts-${crypto.randomBytes(6).toString('hex')}.mp3`);
    fs.writeFileSync(file, buf);
    return { ok: true, file, voice: voice || TTS_VOICE, chars: String(text).length };
  } catch (e) {
    return { ok: false, error: `语音合成失败：${e && e.message || e}` };
  }
}


module.exports = function createYu(ctx) {
  const { DATA, MAX_UPLOAD, json, send, readBody, readRaw, normCode } = ctx;
  /* App 内嵌版：小鱼自动回复 hook（消息入库成功后异步触发） */
  const yuHook = typeof ctx.yuHook === 'function' ? ctx.yuHook : null;
  /* 心情存档：站点只读，不做任何判断（档位词由 agent-bot 写进文件）。
   * 路径按「仓库布局 → 分离部署」的顺序猜，和记忆层保持同一套约定。 */
  const WS_ROOT = process.env.WORKSPACE_DIR || process.env.MEM_DIR || process.env.QQ_WORKSPACE_ROOT
    || (fs.existsSync('/root/qq-workspace') ? '/root/qq-workspace' : path.join(__dirname, 'workspace'));
  const MOOD_FILE = process.env.MOOD_FILE || path.join(WS_ROOT, 'data', 'mood.json');

  const DIR = path.join(DATA, 'yu');
  const FILES = path.join(DATA, 'yu-files');
  const META = path.join(FILES, 'index.json');
  try { fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync(FILES, { recursive: true }); } catch (e) { console.error('[yu dir]', e.message); }

  const CODE_RE = /^[A-Za-z0-9_-]{1,12}$/;
  const MSG_KEEP = 300;
  const STK_KEEP = 60;
  const KAO_KEEP = 80;
  const MAX_MEMBERS = 2;

  const rooms = new Map();
  const saveTimers = new Map();

  function roomPath(code) { return path.join(DIR, code.replace(/[^A-Za-z0-9_-]/g, '') + '.json'); }

  function loadMeta() {
    try { return JSON.parse(fs.readFileSync(META, 'utf8')) || {}; } catch (e) { return {}; }
  }
  function saveMeta(m) {
    try { fs.writeFileSync(META, JSON.stringify(m)); } catch (e) { console.error('[yu meta]', e.message); }
  }

  function loadRoom(code) {
    let r = rooms.get(code);
    if (r) return r;
    r = { code, users: [], msgs: [], stickers: [], kaomojis: [], rev: 1, seq: 0,
      lastAt: Date.now(), subs: new Set(), peerSig: '' };
    try {
      const f = roomPath(code);
      if (fs.existsSync(f)) {
        const j = JSON.parse(fs.readFileSync(f, 'utf8'));
        r.msgs = Array.isArray(j.msgs) ? j.msgs.slice(-MSG_KEEP) : [];
        r.stickers = Array.isArray(j.stickers) ? j.stickers.slice(-STK_KEEP) : [];
        r.kaomojis = Array.isArray(j.kaomojis) ? j.kaomojis.slice(-KAO_KEEP) : [];
        r.seq = r.msgs.reduce((m, x) => Math.max(m, x.id || 0), 0);
        r.rev = r.seq + 1;
      }
    } catch (e) { console.error('[yu load]', code, e.message); }
    rooms.set(code, r);
    return r;
  }

  function saveRoom(r) {
    clearTimeout(saveTimers.get(r.code));
    saveTimers.set(r.code, setTimeout(() => {
      saveTimers.delete(r.code);
      try {
        fs.writeFileSync(roomPath(r.code), JSON.stringify({
          code: r.code, msgs: r.msgs.slice(-MSG_KEEP),
          stickers: r.stickers.slice(-STK_KEEP), kaomojis: r.kaomojis.slice(-KAO_KEEP)
        }));
      } catch (e) { console.error('[yu save]', r.code, e.message); }
    }, 900));
  }

  function cleanStr(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').slice(0, n || 200); }
  /* 「在线」判定窗口。原来是 15 秒 —— 她每隔十几秒才动一次（说话中 / 发呆中来回切），
   * 15 秒的窗口会把「暂时离开」和「在线」交替刷出来，用户看到的就是「状态一直在跳」。
   * 现在放宽到 45 秒，和 act 的有效期（actOf 里的 45000）对齐：
   *   动过 → 45 秒内都算在线；超过 45 秒没动静才算走了。
   * 注意：线上这个文件在 /root/wanxiang/yu.js（不在 agent-bot 目录里），
   * 改仓库版后部署时要单独同步这一处。 */
  const ONLINE_MS = 45000;
  /** 当前动作只在 45 秒内有效，避免「思考中」卡死在那里 */
  function actOf(u) {
    if (!u || !u.act) return '';
    return Date.now() - Number(u.actAt || 0) < 45000 ? String(u.act) : '';
  }
  function peerOf(r, me) {
    const p = r.users.find(u => u.pid !== me.pid);
    if (!p) return null;
    return { name: p.name, avatar: p.avatar || '🐟', bubble: p.bubble || '', online: Date.now() - p.lastSeen < ONLINE_MS, seat: p.seat, act: actOf(p) };
  }
  function publicUser(u) {
    return { name: u.name, avatar: u.avatar || '🐟', bubble: u.bubble || '', fontSize: u.fontSize || 0,
      seat: u.seat, online: Date.now() - u.lastSeen < ONLINE_MS, act: actOf(u) };
  }
  function broadcast(r, ev, data) {
    const payload = 'event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n';
    for (const s of r.subs) { try { s.res.write(payload); } catch (e) {} }
  }
  function push(r, msg) {
    msg.id = ++r.seq;
    msg.at = Date.now();
    r.msgs.push(msg);
    if (r.msgs.length > MSG_KEEP) r.msgs.splice(0, r.msgs.length - MSG_KEEP);
    r.rev++; r.lastAt = Date.now();
    saveRoom(r);
    broadcast(r, 'msgs', { msgs: [msg] });
    for (const s of r.subs) s.lastId = Math.max(s.lastId || 0, msg.id);
    return msg;
  }

  /* ---------- App 内嵌版：给 ai-hook 的进程内接口 ----------
   * yuBotSend：小鱼直接往房间发一条文字消息（不走 HTTP）。
   * yuRecent：取房间最近 n 条消息（含 pid，供 hook 过滤 bot 自己）。
   * 房间不存在时 yuBotSend 会惰性建房；异常全部吞掉只打日志。 */
  function yuBotSend(code, text) {
    try {
      const r = loadRoom(normCode(code));
      const m = push(r, {
        pid: 'ai-fish', name: '小鱼', avatar: '🐟', seat: -1,
        type: 'text', text: String(text || '').slice(0, 2000),
      });
      return m;
    } catch (e) { console.error('[yu bot send]', e.message); return null; }
  }
  function yuRecent(code, n) {
    try {
      const r = loadRoom(normCode(code));
      return r.msgs.slice(-n).map(m => ({ pid: m.pid, name: m.name, type: m.type, text: m.text }));
    } catch (e) { return []; }
  }

  /* ---------- 上传：图片 / 语音 / 文件 / 自定义表情 ---------- */
  const IMG_MAGIC = [
    { ok: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, ext: 'png', mime: 'image/png' },
    { ok: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, ext: 'jpg', mime: 'image/jpeg' },
    { ok: b => b.slice(0, 4).toString('ascii') === 'GIF8', ext: 'gif', mime: 'image/gif' },
    { ok: b => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP', ext: 'webp', mime: 'image/webp' }
  ];
  const FILE_ID_RE = /^[a-f0-9]{20}$/;

  function extOf(name) {
    const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,6})$/);
    return m ? m[1] : '';
  }
  function mimeFor(kind, ext) {
    if (kind === 'voice') {
      return ({ webm: 'audio/webm', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4',
        wav: 'audio/wav', mp4: 'audio/mp4', aac: 'audio/aac' })[ext] || 'audio/webm';
    }
    return 'application/octet-stream';
  }

  async function upload(req, res, u) {
    const code = normCode(u.searchParams.get('code'));
    const pid = cleanStr(u.searchParams.get('pid'), 40);
    const kind = ['img', 'voice', 'file', 'sticker', 'avatar'].includes(u.searchParams.get('kind')) ? u.searchParams.get('kind') : 'file';
    const r = loadRoom(code);
    const me = r.users.find(x => x.pid === pid);
    if (!me) return json(res, { error: '先加入房间' });

    let rawName = '';
    try { rawName = decodeURIComponent(String(req.headers['x-file-name'] || u.searchParams.get('name') || '')); }
    catch (e) { rawName = String(req.headers['x-file-name'] || ''); }
    rawName = cleanStr(rawName, 120) || ('文件.' + (extOf(rawName) || 'bin'));

    let buf;
    try { buf = await readRaw(req, MAX_UPLOAD); }
    catch (e) {
      if (e.code === 'TOO_LARGE') return json(res, { error: `文件太大，最多 ${Math.round(MAX_UPLOAD / 1048576)}MB` });
      return json(res, { error: '读取上传失败：' + e.message });
    }
    if (!buf || !buf.length) return json(res, { error: '没有收到文件' });

    let ext = extOf(rawName), mime, inline = false;
    if (kind === 'img' || kind === 'sticker' || kind === 'avatar') {
      const hit = IMG_MAGIC.find(x => x.ok(buf));
      if (!hit) return json(res, { error: '图片只支持 PNG / JPG / GIF / WEBP' });
      ext = hit.ext; mime = hit.mime; inline = true;
    } else if (kind === 'voice') {
      if (!['webm', 'ogg', 'mp3', 'm4a', 'wav', 'mp4', 'aac'].includes(ext)) ext = 'webm';
      mime = mimeFor('voice', ext); inline = true;
    } else {
      mime = 'application/octet-stream'; inline = false;
    }

    const id = crypto.createHash('md5').update(buf).digest('hex').slice(0, 16) + crypto.randomBytes(2).toString('hex');
    fs.writeFileSync(path.join(FILES, id), buf);
    const meta = loadMeta();
    meta[id] = { name: rawName, mime, size: buf.length, kind, inline, at: Date.now() };
    saveMeta(meta);

    const out = { ok: true, url: '/yu-f/' + id, id, name: rawName, size: buf.length, mime, kind };
    /* 自定义表情顺手收进房间表情库 */
    if (kind === 'sticker') {
      if (!r.stickers.includes(out.url)) {
        r.stickers.push(out.url);
        if (r.stickers.length > STK_KEEP) r.stickers.splice(0, r.stickers.length - STK_KEEP);
        r.rev++; saveRoom(r);
        broadcast(r, 'stickers', { stickers: r.stickers });
      }
      out.sticker = true;
    }
    if (kind === 'avatar') out.avatar = true;
    me.lastSeen = Date.now();
    return json(res, out);
  }

  function file(req, res, u, p) {
    const id = p.slice('/yu-f/'.length);
    if (!FILE_ID_RE.test(id)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    const meta = loadMeta()[id];
    const full = path.join(FILES, id);
    if (!meta || !fs.existsSync(full)) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    let data;
    try { data = fs.readFileSync(full); } catch (e) { return send(res, 404, 'not found', 'text/plain; charset=utf-8'); }
    const disp = meta.inline ? 'inline' : 'attachment';
    const encoded = encodeURIComponent(meta.name || 'file');
    send(res, 200, data, meta.mime, {
      'Content-Disposition': `${disp}; filename="download"; filename*=UTF-8''${encoded}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable'
    });
  }

  /* ---------- API ---------- */
  async function api(req, res, u, p) {
    if (p === '/api/yu/upload') return upload(req, res, u);

    if (p === '/api/yu/enter') {
      const b = await readBody(req);
      const code = normCode(b.code);
      const pid = cleanStr(b.pid, 40);
      if (!CODE_RE.test(code)) return json(res, { error: '房间号只能是 1–12 位字母、数字、下划线或横杠' });
      if (!pid) return json(res, { error: '缺少客户端标识，刷新一下再试' });
      const r = loadRoom(code);
      let me = r.users.find(x => x.pid === pid), fresh = false;
      if (me) {
        me.name = cleanStr(b.name || me.name || '小鱼', 12) || '小鱼';
        me.avatar = cleanStr(b.avatar || me.avatar || '🐟', 120);
        me.bubble = cleanStr(b.bubble || me.bubble || '', 24);
        me.fontSize = Number(b.fontSize) || 0;
        me.lastSeen = Date.now();
      } else {
        const now = Date.now();
        if (r.users.length >= MAX_MEMBERS) {
          const alive = r.users.filter(x => now - x.lastSeen < 10 * 60 * 1000);
          if (alive.length < r.users.length) { r.users = alive; r.users.forEach((x, i) => x.seat = i); }
        }
        if (r.users.length >= MAX_MEMBERS) return json(res, { error: `房间 ${code} 已经满了（最多 2 人）`, full: true });
        me = { pid, name: cleanStr(b.name, 12) || '小鱼', avatar: cleanStr(b.avatar, 120) || '🐟',
          bubble: cleanStr(b.bubble, 24), fontSize: Number(b.fontSize) || 0,
          seat: r.users.length, lastSeen: Date.now(), hits: [] };
        r.users.push(me); fresh = true;
        push(r, { type: 'sys', text: `${me.name} 游进了房间` });
      }
      r.lastAt = Date.now(); r.rev++;
      broadcast(r, 'members', { members: r.users.map(publicUser) });
      return json(res, { ok: true, code, seat: me.seat, me: publicUser(me), peer: peerOf(r, me),
        members: r.users.map(publicUser), msgs: r.msgs, stickers: r.stickers,
        kaomojis: r.kaomojis, rev: r.rev, maxUpload: MAX_UPLOAD, fresh });
    }
    /* ---------- [EXTERNAL-DEP · TTS] 文字转语音 ----------
     * POST /api/yu/tts  { code, pid, text, voice? }
     * 返回 { ok, url, id, dur? }，其中 url 就是 /yu-f/<id>，可以直接当语音消息发。
     * 也可以传 ?direct=1 让它顺便把语音消息发进房间。
     */
    if (p === '/api/yu/tts') {
      if (!TTS_ENABLE) return json(res, { error: '语音合成已关闭（TTS_ENABLE=0）' });
      const b = await readBody(req);
      const code = normCode(b.code);
      const pid = cleanStr(b.pid, 40);
      const r = loadRoom(code);
      const me = r.users.find(x => x.pid === pid);
      if (!me) return json(res, { error: '先加入房间' });
      me.lastSeen = Date.now();

      const text = String(b.text || '').trim();
      if (!text) return json(res, { error: '没有要念的文字' });
      if (text.length > TTS_MAX_CHARS) return json(res, { error: `一次最多念 ${TTS_MAX_CHARS} 个字` });

      const out = await synthSpeech(text, b.voice, FILES);
      if (!out.ok) return json(res, { ok: false, error: out.error || '合成失败' });

      // 读回 mp3，走和普通上传一样的存储路径
      let buf;
      try { buf = fs.readFileSync(out.file); } catch (e) { return json(res, { error: '合成文件读不到' }); }
      try { fs.unlinkSync(out.file); } catch (e) { /* 临时文件删不掉不影响 */ }
      if (!buf.length) return json(res, { error: '合成的音频是空的' });

      const id = crypto.createHash('md5').update(buf).digest('hex').slice(0, 16) + crypto.randomBytes(2).toString('hex');
      fs.writeFileSync(path.join(FILES, id), buf);
      const meta = loadMeta();
      meta[id] = { name: '语音.mp3', mime: 'audio/mpeg', size: buf.length, kind: 'voice', inline: true, at: Date.now() };
      saveMeta(meta);

      const url = '/yu-f/' + id;
      const resp = { ok: true, url, id, size: buf.length, voice: out.voice || TTS_VOICE, chars: out.chars || text.length };

      // ?direct=1：顺便作为语音消息发进房间
      if (u.searchParams.get('direct') === '1') {
        const msg = {
          id: ++r.seq, pid: me.pid, name: me.name, avatar: me.avatar,
          type: 'voice', url, dur: 0, at: Date.now(),
        };
        r.msgs.push(msg);
        if (r.msgs.length > MSG_KEEP) r.msgs.splice(0, r.msgs.length - MSG_KEEP);
        r.rev++; r.lastAt = Date.now();
        saveRoom(r);
        broadcast(r, 'msg', msg);
        resp.msg = msg;
      }
      return json(res, resp);
    }

    if (p === '/api/yu/profile') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = r.users.find(x => x.pid === cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      const old = me.name;
      me.name = cleanStr(b.name, 12) || me.name;
      me.avatar = cleanStr(b.avatar, 120) || me.avatar;
      me.bubble = cleanStr(b.bubble, 24);
      me.fontSize = Number(b.fontSize) || 0;
      me.lastSeen = Date.now(); r.rev++;
      broadcast(r, 'members', { members: r.users.map(publicUser) });
      if (old !== me.name) push(r, { type: 'sys', text: `${old} 把昵称改成了 ${me.name}` });
      return json(res, { ok: true, me: publicUser(me) });
    }

    if (p === '/api/yu/send') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = r.users.find(x => x.pid === cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      me.lastSeen = Date.now();
      const now = Date.now();
      me.hits = (me.hits || []).filter(t => now - t < 10000);
      if (me.hits.length > 26) return json(res, { error: '游得太快了，喘口气' });
      me.hits.push(now);

      const base = { name: me.name, pid: me.pid, seat: me.seat,
        avatar: me.avatar || '🐟', bubble: me.bubble || '', fontSize: me.fontSize || 0 };
      const type = String(b.type || 'text');
      let m;
      if (type === 'text' || type === 'kaomoji') {
        const text = cleanStr(b.text, 2000).replace(/\s+$/, '');
        if (!text.trim()) return json(res, { error: '空消息' });
        m = Object.assign({}, base, { type: 'text', sub: type === 'kaomoji' ? 'kaomoji' : '', text });
      } else if (type === 'emoji') {
        m = Object.assign({}, base, { type: 'emoji', emoji: cleanStr(b.emoji, 16), label: cleanStr(b.label, 20) });
      } else if (['img', 'sticker', 'voice', 'file'].includes(type)) {
        const url = String(b.url || '');
        const id = url.startsWith('/yu-f/') ? url.slice(6) : '';
        const meta = FILE_ID_RE.test(id) ? loadMeta()[id] : null;
        if (!meta) return json(res, { error: '附件不存在或已过期' });
        m = Object.assign({}, base, { type, url, fileName: meta.name, size: meta.size, mime: meta.mime });
        if (type === 'voice') m.dur = Math.max(0, Math.min(600, Number(b.dur) || 0));
        if (type === 'sticker' && !r.stickers.includes(url)) {
          r.stickers.push(url);
          if (r.stickers.length > STK_KEEP) r.stickers.splice(0, r.stickers.length - STK_KEEP);
          broadcast(r, 'stickers', { stickers: r.stickers });
        }
      } else return json(res, { error: '不支持的消息类型' });
      const pushed = push(r, m);
      /* App 内嵌版：消息入库成功后触发小鱼自动回复 hook（异步，绝不阻塞） */
      if (yuHook) { try { yuHook(r.code, pushed); } catch (e) { console.error('[yu hook]', e.message); } }
      return json(res, { ok: true, msg: pushed });
    }

    if (p === '/api/yu/kaomoji') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = r.users.find(x => x.pid === cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      const text = cleanStr(b.text, 60).trim();
      if (!text) return json(res, { error: '颜文字不能是空的' });
      if (r.kaomojis.includes(text)) return json(res, { ok: true, exists: true, kaomojis: r.kaomojis });
      r.kaomojis.push(text);
      if (r.kaomojis.length > KAO_KEEP) r.kaomojis.splice(0, r.kaomojis.length - KAO_KEEP);
      r.rev++; saveRoom(r);
      broadcast(r, 'kaomojis', { kaomojis: r.kaomojis });
      push(r, { type: 'sys', text: `${me.name} 往颜文字库里添了一个 ${text}` });
      return json(res, { ok: true, kaomojis: r.kaomojis });
    }

    /* 状态栏：她自己上报「正在干嘛」（说话中 / 巡视领地中 / 打盹中）。
       只改 act 字段，不落任何消息，失败也不影响聊天。 */
    if (p === '/api/yu/act') {
      const b = await readBody(req);
      const code = normCode(b.code);
      const pid = cleanStr(b.pid, 40);
      if (!CODE_RE.test(code)) return json(res, { error: '房间号不合法' });
      const r = loadRoom(code);
      const me = r.users.find(x => x.pid === pid);
      if (!me) return json(res, { error: '先加入房间' });
      me.act = cleanStr(b.act, 12);
      me.actAt = Date.now();
      me.lastSeen = Date.now();
      /* 逐个下发：peerOf 是「相对于收信人」算的，不能共用一个包 */
      for (const s of r.subs) {
        if (!s.user) continue;   /* bg 订阅没有用户身份，不推 peer */
        try { s.res.write('event: peer\ndata: ' + JSON.stringify({ peer: peerOf(r, s.user) }) + '\n\n'); } catch (e) {}
      }
      return json(res, { ok: true, act: me.act });
    }

    /* 她现在的档位词（不露分数）。只读文件，读不到就返回空，页面显示「还没见过」。 */
    if (p === '/api/yu/mood') {
      let o = null;
      try { o = JSON.parse(fs.readFileSync(MOOD_FILE, 'utf8')); } catch {}
      const last = o && Array.isArray(o.log) && o.log.length ? o.log[o.log.length - 1] : null;
      return json(res, {
        ok: true,
        band: (o && o.band) || '',
        /* 去掉 "[判]" 这类来源标记：日志里要留（区分她主动调的 / 判官判的），
         * 但页面显示的是「刚因为「他叫我小傻鱼」」，带前缀就露馅了。 */
        why: String((last && last.why) || '').replace(/^\[[^\]]{1,4}\]\s*/, ''),
        at: (last && last.ts) || 0,
      });
    }

    if (p === '/api/yu/state') {
      const r = loadRoom(normCode(u.searchParams.get('code')));
      const me = r.users.find(x => x.pid === cleanStr(u.searchParams.get('pid'), 40));
      if (!me) return json(res, { needJoin: true });
      me.lastSeen = Date.now();
      const since = Number(u.searchParams.get('since') || 0);
      return json(res, { ok: true, rev: r.rev, peer: peerOf(r, me), members: r.users.map(publicUser),
        msgs: r.msgs.filter(m => m.id > since), stickers: r.stickers, kaomojis: r.kaomojis });
    }

    if (p === '/api/yu/ping') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = r.users.find(x => x.pid === cleanStr(b.pid, 40));
      if (me) me.lastSeen = Date.now();
      return json(res, { ok: true, peer: me ? peerOf(r, me) : null });
    }

    /* ---------- [BRIDGE] 撤回一条消息 ----------
     * POST /api/yu/recall  { code, pid, id }
     * 给 DSH 的 OneBot delete_msg 用：它先发中间态，再发正式回复，
     * 然后撤回中间态。没有这个接口的话，中间态就全堆在房间里了。
     * 只允许撤回自己发的消息。
     */
    if (p === '/api/yu/recall') {
      const b = await readBody(req);
      const code = normCode(b.code);
      const pid = cleanStr(b.pid, 40);
      const r = loadRoom(code);
      const me = r.users.find(x => x.pid === pid);
      if (!me) return json(res, { error: '先加入房间' });
      me.lastSeen = Date.now();
      const id = Number(b.id) || 0;
      if (!id) return json(res, { error: '缺少消息 id' });
      const i = r.msgs.findIndex(m => m.id === id);
      if (i < 0) return json(res, { ok: true, removed: 0, note: '消息不存在' });
      const m = r.msgs[i];
      if (m.pid !== me.pid) return json(res, { error: '只能撤回自己发的消息' });
      r.msgs.splice(i, 1);
      r.rev++; r.lastAt = Date.now();
      saveRoom(r);
      broadcast(r, 'recall', { id });
      return json(res, { ok: true, removed: 1, id });
    }

    if (p === '/api/yu/leave') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const i = r.users.findIndex(x => x.pid === cleanStr(b.pid, 40));
      if (i >= 0) {
        const [me] = r.users.splice(i, 1);
        r.users.forEach((x, k) => x.seat = k);
        push(r, { type: 'sys', text: `${me.name} 游走了` });
        broadcast(r, 'members', { members: r.users.map(publicUser) });
      }
      return json(res, { ok: true });
    }

    if (p === '/api/yu/stream') {
      const r = loadRoom(normCode(u.searchParams.get('code')));
      /* bg=1：手机壳的原生通知服务用的只读订阅。
       * 它不挂用户身份——不校验 pid、不参与在线状态、不推 peer，
       * 只在有新消息时推 msgs。这样后台守着也不会把用户顶成两个人。 */
      const bg = u.searchParams.get('bg') === '1';
      const me = bg ? null : r.users.find(x => x.pid === cleanStr(u.searchParams.get('pid'), 40));
      if (!bg && !me) return json(res, { needJoin: true });
      const since = Number(u.searchParams.get('since') || 0);
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      if (me) me.lastSeen = Date.now();
      /* bg 且 since=0：从「现在」开始算，别把整屋子历史当新消息弹一遍 */
      const sub = { res, user: me, bg, lastId: (bg && !since) ? r.seq : since };
      r.subs.add(sub);
      res.write('event: hello\ndata: ' + JSON.stringify(me
        ? { seat: me.seat, peer: peerOf(r, me), members: r.users.map(publicUser),
            stickers: r.stickers, kaomojis: r.kaomojis }
        : { bg: true, lastId: sub.lastId, code: r.code }) + '\n\n');
      /* msgs 事件由 push() 直接广播；这里只兜底补发断线期间漏掉的 */
      const tick = setInterval(() => {
        try {
          const missed = r.msgs.filter(m => m.id > (sub.lastId || 0));
          if (missed.length) {
            sub.lastId = missed[missed.length - 1].id;
            /* 只补 SSE 建立前 / 重连后的历史，实时消息已广播过，按 id 去重交给前端 */
            res.write('event: sync\ndata: ' + JSON.stringify({ msgs: missed }) + '\n\n');
          }
          if (!me) return;
          me.lastSeen = Date.now();
          const peer = peerOf(r, me), sig = JSON.stringify(peer);
          if (sig !== sub.peerSig) { sub.peerSig = sig; res.write('event: peer\ndata: ' + JSON.stringify({ peer }) + '\n\n'); }
        } catch (e) { /* 连接已断 */ }
      }, 1000);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);
      req.on('close', () => {
        clearInterval(tick); clearInterval(ping);
        r.subs.delete(sub);
        if (me) me.lastSeen = Math.min(me.lastSeen, Date.now() - ONLINE_MS);
      });
      return;
    }

    return json(res, { error: '没有这个「与鱼」接口' });
  }

  /* 在线状态变化定期广播 */
  setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values()) {
      const sig = r.users.map(u => u.name + (now - u.lastSeen < ONLINE_MS ? '1' : '0')).join('|');
      if (sig !== r.peerSig) {
        r.peerSig = sig;
        for (const s of r.subs) { if (!s.user) continue; try { s.res.write('event: peer\ndata: ' + JSON.stringify({ peer: peerOf(r, s.user) }) + '\n\n'); } catch (e) {} }
      }
      if (r.users.length === 0 && now - r.lastAt > 12 * 3600 * 1000) rooms.delete(r.code);
    }
  }, 2000).unref();

  return { api, file, yuBotSend, yuRecent };
};
