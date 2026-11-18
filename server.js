/* ============================================================
   和鱼的开心导航 v5.001 · 一个进程跑几件事
     /          首页导航（模式卡片入口 + 背景主题 + 声音设置）
     /game      万象牌（双人合作卡牌 + 队友频道 + AI 助手）
     /chat      双人聊天室（房间号加入 / 创建，图片 / GIF / 表情包）
     /yu        与鱼（加强版聊天室：文件 / 语音 / 图片 / 表情包 / 颜文字 / 资料）
     /lingxi    心有灵犀（同屏双人默契游戏）
     /gomoku    五子棋
     /api/lx/*  心有灵犀联机房间（同屏模式仍走页面本地逻辑，不经过这里）
   零依赖：只用 Node 自带模块（http/fs/path/crypto），2核2G 的小机器也能跑
   启动：node server.js      访问：http://你的IP:3000
   ============================================================ */

/* ============================================================
   ⚠️ 变更边界契约 —— 动这个文件之前请先读完
   ------------------------------------------------------------
   本文件里有两类「不可动」代码。重构、重写、合并分支、让 AI 重新生成
   server.js 之前，必须确认它们被原样保留；历史上正是因为基于旧版本
   重写，把下面 8 个补丁全弄丢了。

   [EXTERNAL-DEP] 外部系统依赖（PATCH 1/8 ~ 8/8，来源：v5补丁迁移提示词.md）
     这台机器与 workspace 目录下的外部系统联动（默认站点目录下 workspace/）：
       AGENTS.md / MEMORY.md   聊天机器人「小鱼」的人设与长期记忆
       chatlog.jsonl           跨通道流水账（QQ / 聊天室 / 游戏都往里写）
       shared-state.json       跨通道实时状态（隔壁游戏刚发生的事）
       memes/  pics/           表情库（68 张）/ AI 自己画的图片库
     少了这些补丁 = 小鱼失忆、表情库和图片库发不出来。
     位置索引：
       PATCH 1/2  SYSTEM_PROMPT 之后的常量与 5 个记忆函数
       PATCH 3    /api/chat 改用完整人设，并把问答写进流水账
       PATCH 4    proxyStream 累积回答文本，正常结束时回调
       PATCH 5    /api/room/sticker-lib（读 memes 目录）
       PATCH 6/7  /sticker/ 与 /pics/ 静态资源路由
       PATCH 8    /api/room/send 放行 /sticker/、/pics/ 图片地址
     路径可用环境变量覆盖：MEM_DIR / CHATLOG / SHARED_STATE /
     MEME_DIR / PICS_DIR。文件不存在时全部静默降级，本地开发零副作用。

   [V5-CORE] v5 新增板块，同样不得改动：
     /api/yu/* → yu.js、/yu-f/*、/yu、/lingxi、/api/codex。
     「与鱼」是独立于 /chat 的第二套聊天，房间号与附件区互不干扰。
     /api/lx/* → lx.js 是 patch2 新增的「心有灵犀」联机房间，同样不得改动；
       它的同屏玩法在前端本地跑，与这些接口无关；服务端是联机状态的唯一权威，
       viewFor() 的裁剪视图保证两边都提交前不会把词泄露给对方。

   改动守则：
     1. 只做增量；上述两类标记块不要删改、不要「顺手整理」。
     2. 新增静态路由必须放在「其它静态文件」兜底之前，别被 /api/ 兜底吞掉。
     3. 改完跑 node --check server.js、接口冒烟，并同步更新包内更新说明。
     4. 自检：grep -n "EXTERNAL-DEP" server.js 应能看到 8 个 PATCH 标记。
   ============================================================ */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { Room, MAX_PLAYERS } = require('./engine.js');
const CONTENT = require('./content.js');

/* ============================================================
   .env 自动加载（零依赖，必须先于任何 process.env 读取执行）
   为什么自己写：本项目零第三方依赖，不引入 dotenv；
   但既然提供了 .env.example，就必须真的读它，否则配置项全是摆设。
   规则：已存在的真实环境变量优先（方便 docker/CI 覆盖），.env 只补空缺。
   ============================================================ */
(function loadDotEnv() {
  try {
    const file = path.join(__dirname, '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s[0] === '#') continue;
      const eq = s.indexOf('=');
      if (eq < 1) continue;
      const key = s.slice(0, eq).trim();
      let val = s.slice(eq + 1).trim();
      if (val.length >= 2) {
        const a = val[0], b = val[val.length - 1];
        if ((a === '"' && b === '"') || (a === "'" && b === "'")) val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (e) { /* 读不到就用默认值，不阻断启动 */ }
})();

/* ============================================================
   工作区自举：首次启动时把人设模板与记忆文件准备好
   为什么需要：workspace/ 属于运行时数据（不进版本库），
   如果只靠部署脚本复制，直接 `node server.js` 的人会得到一个没有人设的 AI。
   这里做幂等补齐：缺什么补什么，已有的绝不覆盖。
   ============================================================ */
(function bootstrapWorkspace() {
  try {
    const ws = process.env.WORKSPACE_DIR || path.join(__dirname, 'workspace');
    fs.mkdirSync(ws, { recursive: true });
    const seed = path.join(__dirname, 'workspace.example', 'AGENTS.md');
    const target = path.join(ws, 'AGENTS.md');
    if (!fs.existsSync(target) && fs.existsSync(seed)) {
      fs.copyFileSync(seed, target);
      console.log('     [初始化] 已从模板生成 workspace/AGENTS.md（可自行修改人设）');
    }
    const mem = path.join(ws, 'MEMORY.md');
    if (!fs.existsSync(mem)) {
      fs.writeFileSync(mem, '', 'utf8');
      console.log('     [初始化] 已创建空白 workspace/MEMORY.md（长期记忆写入这里）');
    }
    for (const d of ['memes', 'pics']) {
      fs.mkdirSync(path.join(ws, d), { recursive: true });
    }
  } catch (e) { /* 目录不可写也不该阻断启动 */ }
})();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const CHATDIR = path.join(DATA, 'chat');
const GODIR = path.join(DATA, 'gomoku');
const MAX_UPLOAD = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 10)) * 1024 * 1024;

for (const d of [DATA, UPLOADS, CHATDIR, GODIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { console.error('[data]', e.message); }
}

/* 「与鱼」：独立房间与附件区，不改动原聊天室 */
const YU = require('./yu.js')({ DATA, MAX_UPLOAD, json, send, readBody, readRaw, normCode });

/* 「心有灵犀」联机：独立房间服务；同屏玩法完全不走这里 */
const LX = require('./lx.js')({ DATA, json, readBody, normCode });

/* ================= 图鉴只读快照 ================= */
let CODEX = null;
function buildCodex() {
  const C = CONTENT;
  const cards = Object.keys(C.POOL).map(id => {
    const c = C.POOL[id];
    return { id, name: c.name, cat: c.cat || '', kind: c.kind || '', cost: c.cost == null ? 0 : c.cost,
      desc: c.desc || '', word: c.word || '', school: c.school || '',
      shopPrice: c.shopPrice == null ? null : c.shopPrice };
  });
  const talents = Object.keys(C.TALENTS).map(id => {
    const t = C.TALENTS[id], cat = C.talentCat(id);
    return { id, name: t.name || id, desc: t.desc || '', price: t.price || 0,
      cat: cat.key, catName: cat.name, catColor: cat.color };
  });
  const bosses = Object.keys(C.BOSS_DEFS).map(k => {
    const b = C.BOSS_DEFS[k];
    return { key: k, tier: b.tier || 0, name: b.name, avatar: b.avatar, hp: b.hp, attack: b.attack,
      armor: b.armor || 0, mech: b.mech || [], tip: b.tip || '', art: C.BOSS_ART[k] || '' };
  });
  const schools = C.SCHOOL_KEYS.map(k => ({ key: k, name: C.SCHOOLS[k].name,
    color: C.SCHOOLS[k].color, count: (C.SCHOOLS[k].pool || []).length }));
  return { version: 'v5.001', cards, talents, bosses, schools,
    bossPool: C.BOSS_POOL, startPickN: C.START_PICK_N, prefSeats: C.PREF_SEATS,
    gu: { max: C.GU_MAX, curseCap: C.GU_CURSE_CAP, absorb: C.GU_ABSORB, heal: C.GU_HEAL,
      temperCost: C.GU_TEMPER_COST, poisonPct: C.GU_POISON_PCT, cursePct: C.GU_CURSE_PCT } };
}

/* ================= 卡牌房间 ================= */
const rooms = new Map();
const ROOM_TTL = 30 * 60 * 1000;
function getRoom(id) {
  id = String(id || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'main';
  let r = rooms.get(id);
  if (!r) { r = new Room(id); rooms.set(id, r); }
  return r;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, r] of rooms) if (now - r.lastAct > ROOM_TTL) rooms.delete(k);
}, 5 * 60 * 1000).unref();
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    try { r.tickIdle(now); } catch (e) { console.error('[tickIdle]', e && e.message); }
  }
}, 2000).unref();

/* ================= deepseek 接入（AI 标签用，可选） ================= */
/* 变量名统一：对外文档与 .env.example 用 LLM_*，同时兼容历史 DEEPSEEK_* 写法。
   两种都支持是为了老部署升级时不用改配置，新用户按文档填 LLM_* 即可生效。 */
const DEEPSEEK_BASE = (process.env.LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'http://localhost:11434/v1').replace(/\/+$/, '');
const DEEPSEEK_KEY = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.LLM_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-r1:7b';
const DEEPSEEK_FORMAT = (process.env.LLM_FORMAT || process.env.DEEPSEEK_FORMAT || 'auto').toLowerCase();
const DEEPSEEK_TEMP = Number(process.env.LLM_TEMP || process.env.DEEPSEEK_TEMP || 0.7);
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || '你是一个友善、聪明的聊天助手，请用简体中文自然地交流。';
const MAX_HIST = Math.max(2, Number(process.env.MAX_HIST || 40));

/* ============================================================
   访问控制（可选，但破坏性接口默认只允许本机）
   为什么需要：房间号只是「知道就能进」，不是身份认证。
   一旦把站点放到公网，任何人都能调接口——尤其是删文件的接口。
   策略：
     - 设了 AUTH_TOKEN：破坏性接口必须带对令牌（请求头 x-auth-token 或 ?token=）
     - 没设 AUTH_TOKEN：破坏性接口只允许本机回环地址调用
   普通页面与聊天接口不受影响，避免把自用门槛抬得太高。
   ============================================================ */
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
function isLoopback(req) {
  const ip = (req.socket && req.socket.remoteAddress) || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
function guardAdmin(req, res) {
  if (AUTH_TOKEN) {
    let given = req.headers['x-auth-token'] || '';
    if (!given) {
      try { given = new URL(req.url, 'http://x').searchParams.get('token') || ''; } catch (e) {}
    }
    if (given === AUTH_TOKEN) return true;
    json(res, { error: '未授权：需要有效的 AUTH_TOKEN' });
    return false;
  }
  if (isLoopback(req)) return true;
  json(res, { error: '该接口默认仅限本机调用；如需远程使用，请设置 AUTH_TOKEN 并在请求中携带' });
  return false;
}

/* ============================================================
   [EXTERNAL-DEP · PATCH 1/8] 外部系统依赖，勿删改
   作用：声明与 workspace 目录联动的三个路径（可用环境变量覆盖，默认站点目录下 workspace/）。
   删掉后果：下面 PATCH 2/8 的函数读不到人设、状态与流水账，小鱼失忆。
   ============================================================ */
// 默认放在站点目录下的 workspace/，开箱即用；也可用环境变量指向别处。
const WORKSPACE = process.env.WORKSPACE_DIR || path.join(__dirname, 'workspace');
const MEM_DIR = process.env.MEM_DIR || WORKSPACE;
const CHATLOG_PATH = process.env.CHATLOG || path.join(WORKSPACE, 'chatlog.jsonl');
const SHARED_FILE = process.env.SHARED_STATE || path.join(WORKSPACE, 'shared-state.json');

/* 四层记忆 · 可选增强（PATCH 之外的新增，不改动上面任何 PATCH 块）
 * 加载失败 / 渲染为空时，fullSystemPrompt() 自动回落到下面的原有实现。
 * 设 FOUR_LAYER=0 可一键关掉，无需改代码。 */
/* 让 memory/ 模块跟随站点的工作区：
 * 它自己读 QQ_WORKSPACE_ROOT，默认指向仓库内 workspace/；
 * 不注入的话，站点用了 WORKSPACE_DIR 时，记忆会写到另一个目录去。 */
if (!process.env.QQ_WORKSPACE_ROOT) process.env.QQ_WORKSPACE_ROOT = WORKSPACE;

/* ============================================================
   她的状态（只读）：聊天室 / 五子棋 / 万象牌页面顶部那一行小字用的。
   返回档位词 + 心情 + 「今天的账」，**不露分数**（分数只留在文件里）。

   为什么不 require agent-bot 的 lib/mood.js：
     站点和 agent-bot 是分开部署的（现网 /root/qq-workspace 与 /root/agent-bot 各一份），
     目录结构不稳定。站点进程去 require 那边，等于把两个部署绑死 ——
     那边一改目录就白屏。所以这里纯读文件 + 自己算，读不到就 {ok:false}，绝不 500。

   路径优先级：MOOD_FILE 环境变量 → /root/qq-workspace/data/mood.json → 仓库 workspace/data/mood.json
   （和 mood.js 的 guessWorkspace()、yu.js 的 MOOD_FILE 保持同一套习惯）
   ============================================================ */
const MOOD_JSON = (() => {
  if (process.env.MOOD_FILE) return process.env.MOOD_FILE;
  const split = '/root/qq-workspace/data/mood.json';   // 分离部署的约定位置
  try { if (fs.statSync(split).isFile()) return split; } catch (e) {}
  return path.join(WORKSPACE, 'data', 'mood.json');
})();

/* 心情 6 小时过期（与 mood.js 的 MOOD_TTL 一致）：早上撒的娇不该晚上还挂着 */
const MOOD_TTL_MS = 6 * 3600 * 1000;
const MOOD_CALM = '平静';
const MOOD_LABELS = ['开心', '黏人', '撒娇', '有点醋', '低落', '累了', '得意', '平静'];

/* 「今天的账」的说法。和 agent-bot/lib/mood.js 的 DIGEST_CASES 一字不差地保持一致；
 * 跨部署没法共享模块，所以这份重复是刻意的 —— 不一致只会导致措辞不同，不影响统计。 */
const MOOD_DIGEST = {
  陪着: (n) => `陪你聊了 ${n} 次`,
  报备: (n) => `跟你讲了自己的事 ${n} 次`,
  昵称: (n) => `叫了你 ${n} 次昵称`,
  想你: (n) => `说了 ${n} 次想你`,
  暧昧: (n) => `撩了你 ${n} 次`,
  被需要: (n) => `找你说了 ${n} 次事`,
  一起玩: (n) => `一起玩了 ${n} 次`,
  记得: (n) => `提起过 ${n} 次你以前说过的事`,
  敷衍: (n) => `敷衍了你 ${n} 次`,
  失联: (n) => `晾了你 ${n} 次`,
  凶: (n) => `凶了你 ${n} 次`,
  越界: (n) => `玩笑开过头 ${n} 次`,
  工具化: (n) => `有事才找你 ${n} 次`,
};

/** 最近 24 小时各路径发生了几次，取最多的 4 类；没有就返回空串 */
function moodToday(log, now) {
  const counts = new Map();
  for (const e of (Array.isArray(log) ? log : [])) {
    const kind = String((e && e.kind) || '').trim();
    if (!kind) continue;                       // 老记录没有 kind，不产生条目
    const t = Number(e && e.ts) || 0;
    if (!t || now - t > 24 * 3600 * 1000) continue;
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  if (!counts.size) return '';
  return [...counts.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([k, n]) => (MOOD_DIGEST[k] ? MOOD_DIGEST[k](n) : `${k} ${n} 次`))
    .join('、');
}

/** 读 mood.json 拼一份只读快照。任何异常都退化成 {ok:false}（页面显示「还没见过」） */
function moodSnapshot() {
  let o = null;
  try { o = JSON.parse(fs.readFileSync(MOOD_JSON, 'utf8')); } catch (e) { return { ok: false }; }
  if (!o || typeof o !== 'object') return { ok: false };
  const now = Date.now();
  const log = Array.isArray(o.log) ? o.log : [];
  const last = log.length ? log[log.length - 1] : null;
  const rawLabel = o.mood && typeof o.mood === 'object' ? String(o.mood.label || '') : '';
  const moodAt = o.mood && typeof o.mood === 'object' ? Number(o.mood.at) || 0 : 0;
  const fresh = MOOD_LABELS.includes(rawLabel) && moodAt && now - moodAt <= MOOD_TTL_MS;
  return {
    ok: true,
    band: String(o.band || ''),
    mood: fresh ? rawLabel : MOOD_CALM,
    today: moodToday(log, now),
    at: Number((last && last.ts) || o.updatedAt) || 0,
  };
}

let fourLayer = null;
try { fourLayer = require(path.join(__dirname, 'memory', 'bridge.js')); } catch {}
const FOUR_LAYER_OFF = process.env.FOUR_LAYER === '0';

/* ============================================================
   [EXTERNAL-DEP · PATCH 2/8] 外部系统依赖，勿删改
   作用：拼出聊天机器人的完整 system prompt，并把问答记进跨通道流水账。
   函数：memoryPrompt / sharedDigest / recentChatLines /
        fullSystemPrompt / logChat
   说明：全部带缓存与 try/catch，外部目录不存在时静默降级为
        SYSTEM_PROMPT，本地开发不会报错、不会写文件。
   删掉后果：聊天室里的小鱼读不到 AGENTS.md / MEMORY.md，
        不知道隔壁五子棋、卡牌刚发生了什么。
   ============================================================ */
let _memCache = { v: '', key: '' };
function memoryPrompt() {
  const files = ['AGENTS.md', 'MEMORY.md'];
  const key = files.map((f) => { try { return fs.statSync(path.join(MEM_DIR, f)).mtimeMs; } catch { return 0; } }).join('|');
  if (key === _memCache.key) return _memCache.v;
  let out = '';
  for (const f of files) {
    try {
      const t = fs.readFileSync(path.join(MEM_DIR, f), 'utf8').trim();
      if (t) out += (out ? '\n\n---\n\n' : '') + t;
    } catch {}
  }
  _memCache = { v: out, key };
  return out;
}

/* 跨通道共享状态：五子棋/卡牌那边刚发生的事 */
let _sharedCache = { v: '', at: 0, mtime: 0 };
function sharedDigest(maxAgeMin = 180) {
  try {
    const now = Date.now();
    const mt = fs.statSync(SHARED_FILE).mtimeMs;
    if (now - _sharedCache.at < 10000 && mt === _sharedCache.mtime) return _sharedCache.v;
    const obj = JSON.parse(fs.readFileSync(SHARED_FILE, 'utf8'));
    const bits = [];
    if (obj.lastGame && obj.lastGame.at) {
      const t = new Date(obj.lastGame.at).getTime();
      if (Number.isFinite(t) && now - t < maxAgeMin * 60 * 1000) {
        const mins = Math.round((now - t) / 60000);
        const when = mins < 1 ? '刚刚' : mins < 60 ? `${mins} 分钟前` : `${Math.round(mins / 60)} 小时前`;
        const kind = obj.lastGame.type === 'gomoku' ? '五子棋' : '游戏';
        bits.push(`【${when}的一局${kind}】${obj.lastGame.text}`);
      }
    }
    if (Array.isArray(obj.notes)) {
      for (const n of obj.notes) {
        if (!n || !n.text || !n.at) continue;
        const ttl = Number(n.ttlMin) > 0 ? Number(n.ttlMin) : maxAgeMin;
        const t = new Date(n.at).getTime();
        if (!Number.isFinite(t) || now - t > ttl * 60 * 1000) continue;
        const mins = Math.round((now - t) / 60000);
        const when = mins < 1 ? '刚刚' : mins < 60 ? `${mins} 分钟前` : `${Math.round(mins / 60)} 小时前`;
        bits.push(`【${when}，QQ 那边帮你弄好的】${n.text}`);
      }
    }
    if (!bits.length) {
      _sharedCache = { v: '', at: now, mtime: mt };
      return '';
    }
    const out = [
      '【刚刚发生的事（实时状态，比 MEMORY.md 里的旧记录更新）】',
      ...bits,
      '👉 老板问起这些，直接用上面的内容回答。不要说「没存下来」「没有记录」——就在这儿。',
    ].join('\n');
    _sharedCache = { v: out, at: now, mtime: mt };
    return out;
  } catch (e) {
    return _sharedCache.v || '';
  }
}

/* 老板最近说过的话（含游戏里） */
let _recentCache = { v: '', at: 0, mtime: 0 };
function recentChatLines(n = 12, maxChars = 1000) {
  try {
    const now = Date.now();
    const mt = fs.statSync(CHATLOG_PATH).mtimeMs;
    if (now - _recentCache.at < 10000 && mt === _recentCache.mtime) return _recentCache.v;
    const lines = fs.readFileSync(CHATLOG_PATH, 'utf8').trim().split('\n');
    const rows = [];
    for (const line of lines) {
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (r.noise || !r.text) continue;
      const t = String(r.text).trim();
      if (t.length < 2) continue;
      if (r.channel === 'game') {
        if (/^(落子|规则兜底|LLM 选|动作|下了[，,。]?\s*[A-O]\d)/.test(t)) continue;
        if (t.length > 150) continue;
      }
      const age = now - new Date(r.ts || 0).getTime();
      if (Number.isFinite(age) && age > 12 * 3600 * 1000) continue;
      rows.push(r);
    }
    const picked = [];
    const seenText = new Set();
    for (let i = rows.length - 1; i >= 0 && picked.length < n; i--) {
      const r = rows[i];
      const isResult = r.channel === 'game' && r.role === 'assistant' && String(r.text).startsWith('五子棋这局结束');
      if (r.role !== 'user' && !isResult) continue;
      const txt = String(r.text || '').trim();
      const dedupKey = txt.slice(0, 30);
      if (!isResult && seenText.has(dedupKey)) continue;
      seenText.add(dedupKey);
      picked.unshift(r);
    }
    const agoTag = (ts) => {
      const t = new Date(ts || 0).getTime();
      if (!Number.isFinite(t)) return '';
      const mins = Math.round((Date.now() - t) / 60000);
      if (mins < 1) return '刚刚';
      if (mins < 60) return mins + ' 分钟前';
      const hrs = Math.round(mins / 60);
      if (hrs < 24) return hrs + ' 小时前';
      return Math.round(hrs / 24) + ' 天前';
    };
    const kept = [];
    let used = 0;
    for (let k = picked.length - 1; k >= 0; k--) {
      const cost = String(picked[k].text).length;
      if (used + cost > maxChars) break;
      used += cost;
      kept.unshift(picked[k]);
    }
    const out = kept.map((r) => {
      const where = r.channel === 'game' ? '游戏' : r.channel === 'qq' ? 'QQ' : '聊天室';
      const when = agoTag(r.ts);
      if (r.channel === 'game' && r.role === 'assistant') {
        return `【${where}${when ? `，${when}` : ''}】${String(r.text).slice(0, 140).replace(/\n/g, ' ')}`;
      }
      const tag = where === '聊天室' ? '老板' : `老板（在${where}里${when ? `，${when}` : ''}）`;
      return `${tag}：${String(r.text).slice(0, 70).replace(/\n/g, ' ')}`;
    }).join('\n');
    _recentCache = { v: out, at: now, mtime: mt };
    return out;
  } catch (e) {
    return _recentCache.v || '';
  }
}

function fullSystemPrompt() {
  /* 四层记忆可用时优先走统一渲染层（含 identity 全文、适配器、长期/近期/临时分块）。
   * 任一异常都静默回落到原有三段拼装，保证聊天室不会因记忆增强而中断。 */
  if (!FOUR_LAYER_OFF && fourLayer) {
    try {
      const enhanced = fourLayer.renderFor('api-chat');
      if (enhanced && enhanced.length > 200) return enhanced;
    } catch {}
  }
  const mem = memoryPrompt();
  const sharedInfo = sharedDigest(1440);
  const said = recentChatLines(12, 1000);
  const parts = [];
  if (mem) parts.push(mem);
  if (sharedInfo) parts.push(sharedInfo);
  if (said) parts.push('【老板最近说过的话（含游戏里，这是真的发生过）】\n' + said);
  if (!parts.length) return SYSTEM_PROMPT;
  return parts.join('\n\n---\n\n')
    + '\n\n---\n\n（以上是你的完整人设与记忆，以及刚在别的频道发生的事。'
    + '老板问起游戏里的事，用上面这些回答，不要说「没记录」。接下来是聊天室的对话。）';
}

/* 往跨通道流水账里记一条（给夜间摘要用） */
function logChat(role, text, name) {
  try {
    fs.appendFileSync(CHATLOG_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      channel: 'web',
      uid: 'owner',
      name: name || (role === 'assistant' ? '小鱼' : '老板'),
      role,
      text: String(text || '').slice(0, 2000),
    }) + '\n');
  } catch {}
}

function resolveFormat() {
  if (DEEPSEEK_FORMAT === 'openai' || DEEPSEEK_FORMAT === 'ollama') return DEEPSEEK_FORMAT;
  if (DEEPSEEK_BASE.includes('/v1')) return 'openai';
  if (DEEPSEEK_BASE.includes('11434') || DEEPSEEK_BASE.includes('/api')) return 'ollama';
  return 'openai';
}
const FMT = resolveFormat();
const chatURL = () => FMT === 'ollama' ? DEEPSEEK_BASE.replace(/\/v1$/, '') + '/api/chat' : DEEPSEEK_BASE + '/chat/completions';

/* ================= 通用工具 ================= */
function safe(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      console.error('[err]', (req.url || '').slice(0, 60), e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
      if (!res.headersSent) try { json(res, { error: '服务端异常：' + String(e && e.message || e) }); } catch (_) {}
      else try { res.end(); } catch (_) {}
    }
  };
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8'
};
function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({ 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}));
  res.end(body);
}
function json(res, obj) { send(res, 200, JSON.stringify(obj)); }
function readBody(req, limit) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > (limit || 5e5)) { req.destroy(); resolve({}); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); } });
  });
}
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, dead = false;
    req.on('data', c => {
      if (dead) return;
      size += c.length;
      if (size > limit) { dead = true; reject(Object.assign(new Error('TOO_LARGE'), { code: 'TOO_LARGE' })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!dead) resolve(Buffer.concat(chunks)); });
    req.on('error', e => { if (!dead) reject(e); });
  });
}

/* ============================================================
   聊天室
   · 一个房间最多 2 人；凭 pid 重进可以回到自己那个座位
   · 消息只在内存里，顺便落盘到 data/chat/<房间>.json（重启不丢）
   · 图片 / GIF 上传后存在 data/uploads，用 /m/<id>.<ext> 直接给浏览器
   ============================================================ */
const MAX_CHAT_MEMBERS = 2;
const chatRooms = new Map();
const MSG_KEEP = 200;          // 每个房间保留最近 200 条
const STICKER_KEEP = 48;       // 表情包抽屉最多 48 个
const CODE_RE = /^[A-Za-z0-9_-]{1,12}$/;

function normCode(s) { return String(s || '').trim().toUpperCase(); }

function chatPath(code) { return path.join(CHATDIR, code.replace(/[^A-Za-z0-9_-]/g, '') + '.json'); }

function loadChat(code) {
  let room = chatRooms.get(code);
  if (room) return room;
  room = { code, users: [], msgs: [], stickers: [], rev: 1, seq: 0, lastAt: Date.now(), subs: new Set(), peerSig: '' };
  try {
    const f = chatPath(code);
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      room.msgs = Array.isArray(j.msgs) ? j.msgs.slice(-MSG_KEEP) : [];
      room.stickers = Array.isArray(j.stickers) ? j.stickers.slice(-STICKER_KEEP) : [];
      room.seq = Math.max(0, ...room.msgs.map(m => m.id || 0));
      room.rev = room.seq + 1;
    }
  } catch (e) { console.error('[chat load]', code, e.message); }
  chatRooms.set(code, room);
  return room;
}

let saveTimers = new Map();
function saveChat(room) {
  clearTimeout(saveTimers.get(room.code));
  saveTimers.set(room.code, setTimeout(() => {
    saveTimers.delete(room.code);
    try {
      fs.writeFileSync(chatPath(room.code), JSON.stringify({ code: room.code, msgs: room.msgs.slice(-MSG_KEEP), stickers: room.stickers.slice(-STICKER_KEEP) }));
    } catch (e) { console.error('[chat save]', room.code, e.message); }
  }, 1200));
}

/* 状态栏的 act 有效期：45 秒。
 * 和 yu.js 的 actOf()、agent-bot/lib/presence.js 的 ACT_TTL_MS、engine.js 的 actLabelOf 同一套语义。
 * 超过就返回空串，页面自动退回「在线」——不能让她永远停在「思考中」。 */
const MEMBER_ACT_MS = 45000;
function memberActOf(u) {
  if (!u || !u.act) return '';
  return Date.now() - Number(u.actAt || 0) < MEMBER_ACT_MS ? String(u.act) : '';
}

function peerOf(room, me) {
  const p = room.users.find(u => u.pid !== me.pid);
  if (!p) return null;
  const online = Date.now() - p.lastSeen < 15000;
  /* act 是「她在干嘛」（思考中 / 说话中 / 落子中），和 online 是两件事：
   * online 只说明心跳还在（机器人 1.2 秒一跳，永远为真），act 才有信息量。 */
  return { name: p.name, online, seat: p.seat, act: memberActOf(p) };
}

function pushMsg(room, msg) {
  msg.id = ++room.seq;
  msg.at = Date.now();
  room.msgs.push(msg);
  if (room.msgs.length > MSG_KEEP) room.msgs.splice(0, room.msgs.length - MSG_KEEP);
  room.rev++;
  room.lastAt = Date.now();
  saveChat(room);
  return msg;
}

function chatTick() {
  const now = Date.now();
  for (const room of chatRooms.values()) {
    const p0 = room.users[0], p1 = room.users[1];
    /* 签名里带上 act：只比 online 的话，「思考中 → 说话中」这种变化永远不会广播，
     * 页面就停在第一个状态上（看起来像卡住）。 */
    const sig = [p0 ? (p0.name + (now - p0.lastSeen < 15000 ? '1' : '0') + memberActOf(p0)) : '-', p1 ? (p1.name + (now - p1.lastSeen < 15000 ? '1' : '0') + memberActOf(p1)) : '-'].join('|');
    if (sig !== room.peerSig) {
      room.peerSig = sig;
      for (const s of room.subs) {
        const peer = peerOf(room, s.user);
        s.res.write('event: peer\ndata: ' + JSON.stringify({ peer, members: room.users.map(u => u.name) }) + '\n\n');
      }
    }
    // 没人活跃超过 12 小时就从内存里回收（消息已经落盘，下次进来重新读）
    const active = room.users.some(u => now - u.lastSeen < 60000);
    if (!active && now - room.lastAt > 12 * 3600 * 1000) chatRooms.delete(room.code);
  }
}
setInterval(() => { try { chatTick(); } catch (e) { console.error('[chatTick]', e.message); } try { goTick(); } catch (e) { console.error('[goTick]', e.message); } }, 1000).unref();

// 上传文件的登记表（只用于校验 /m/ 的 URL 是不是我们发的）
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return { ext: 'gif', type: 'image/gif' };
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

/* ================= 表情包：内容寻址 + 索引 + 清理 ================= */
const UPLOAD_INDEX = path.join(UPLOADS, 'index.json');            // { "<md5>": { orig, size, firstSeen } }
const UPLOAD_NAME_RE = /^[a-f0-9]{16}\.(png|jpg|gif|webp)$/;      // 文件名 = md5 前 16 位 + 扩展名

function loadUploadIndex() {
  try { return JSON.parse(fs.readFileSync(UPLOAD_INDEX, 'utf8')) || {}; }
  catch (e) { return {}; }
}
function saveUploadIndex(idx) {
  try { fs.writeFileSync(UPLOAD_INDEX, JSON.stringify(idx, null, 2)); }
  catch (e) { console.error('[upload index]', e.message); }
}
function rememberUpload(md5, orig, size) {
  const idx = loadUploadIndex();
  const cur = idx[md5];
  if (!cur) idx[md5] = { orig: String(orig || '').slice(0, 160), size, firstSeen: new Date().toISOString() };
  else {
    // 已有记录时保留 firstSeen，只补 orig（比如前面没拿到原始文件名）
    if (orig && (!cur.orig || cur.orig === 'upload.' + String(orig).split('.').pop())) cur.orig = String(orig).slice(0, 160);
    if (size !== cur.size) cur.size = size;
  }
  saveUploadIndex(idx);
}
// 扫所有聊天存档 + 内存里的房间，收集在用的 /m/ 文件名（cleanup 与迁移共用）
function collectUploadRefs() {
  const refs = new Set();
  const addFrom = txt => {
    if (!txt) return;
    const re = /\/m\/([a-f0-9]{16}\.(?:png|jpg|gif|webp))/g;
    let m; while ((m = re.exec(txt))) refs.add(m[1]);
  };
  let files = [];
  try { files = fs.readdirSync(CHATDIR).filter(f => f.endsWith('.json')); } catch (e) {}
  for (const f of files) {
    try { addFrom(fs.readFileSync(path.join(CHATDIR, f), 'utf8')); } catch (e) {}
  }
  for (const room of chatRooms.values()) {
    try { addFrom(JSON.stringify({ msgs: room.msgs, stickers: room.stickers })); } catch (e) {}
  }
  return refs;
}

/* ================= 五子棋（复用聊天室房间原语：房间码 / 限 2 人 / SSE） ================= */
const N = 15;
const GO_WIN = 5;
const GO_UNDO_LIMIT = 3;      // 每方每局可悔棋次数
const GO_UNDO_MS = 15000;     // 悔棋请求等待对方确认的时限，超时自动取消
const goRooms = new Map();
function goPath(code) { return path.join(GODIR, code.replace(/[^A-Za-z0-9_-]/g, '') + '.json'); }
function loadGo(code) {
  let room = goRooms.get(code);
  if (room) return room;
  room = { code, users: [], board: new Array(N * N).fill(-1), turn: 0, winner: -1, winLine: [], moves: [], seq: 0,
    hostSeat: 0, blackSeat: 0, rule: 'fixed', ruleLocked: false, swapPending: false, hostReq: false,
    rps: { a: null, b: null }, chat: [],
    ready: [false, false], undoUsed: [0, 0], undoPending: null, lastResult: null,
    lastAt: Date.now(), subs: new Set(), peerSig: '', rev: 1, ruleRev: 1, chatRev: 1, rpsRev: 1 };
  try {
    const f = goPath(code);
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (Array.isArray(j.board) && j.board.length === N * N) room.board = j.board;
      room.turn = (j.turn == null) ? 0 : j.turn;
      room.winner = (j.winner == null) ? -1 : j.winner;
      room.winLine = Array.isArray(j.winLine) ? j.winLine : [];
      room.moves = Array.isArray(j.moves) ? j.moves : [];
      room.seq = room.moves.reduce((m, x) => Math.max(m, x.id || 0), 0);
      room.hostSeat = (j.hostSeat == null) ? 0 : j.hostSeat;
      room.blackSeat = (j.blackSeat == null) ? room.hostSeat : j.blackSeat;
      room.rule = ['fixed', 'swap', 'random', 'rps'].includes(j.rule) ? j.rule : 'fixed';
      room.ruleLocked = !!j.ruleLocked;
      room.swapPending = !!j.swapPending;
      room.hostReq = !!j.hostReq;
      room.rps = (j.rps && typeof j.rps === 'object') ? j.rps : { a: null, b: null };
      room.chat = Array.isArray(j.chat) ? j.chat.slice(-200) : [];
      room.ready = Array.isArray(j.ready) ? [!!j.ready[0], !!j.ready[1]] : [false, false];
      room.undoUsed = Array.isArray(j.undoUsed) ? [Math.min(GO_UNDO_LIMIT, j.undoUsed[0] || 0), Math.min(GO_UNDO_LIMIT, j.undoUsed[1] || 0)] : [0, 0];
      room.lastResult = (j.lastResult && typeof j.lastResult === 'object') ? j.lastResult : null;
      // 恢复成员，但不恢复在线状态：lastSeen 设 0，
      // 让他们下次进房时被当成"回来"，而不是"一直在线"
      if (Array.isArray(j.users)) {
        room.users = j.users
          .filter(u => u && u.pid)
          .map((u, i) => ({
            pid: String(u.pid),
            name: String(u.name || '玩家').slice(0, 12),
            seat: Number.isInteger(u.seat) ? u.seat : i,
            lastSeen: 0,
          }))
          .slice(0, 2);
      }
      // 保险：没有成员却有先手/规则锁定 → 老文件遗留的僵尸房间，重置成可开局状态
      if (!room.users.length && room.moves.length === 0) {
        room.blackSeat = 0;
        room.turn = 0;
        room.ruleLocked = false;
      }
    }
  } catch (e) { console.error('[go load]', code, e.message); }
  goRooms.set(code, room);
  return room;
}
const goSaveTimers = new Map();
function saveGo(room) {
  clearTimeout(goSaveTimers.get(room.code));
  goSaveTimers.set(room.code, setTimeout(() => {
    goSaveTimers.delete(room.code);
    try { fs.writeFileSync(goPath(room.code), JSON.stringify({ board: room.board, turn: room.turn, winner: room.winner, winLine: room.winLine, moves: room.moves, hostSeat: room.hostSeat, blackSeat: room.blackSeat, rule: room.rule, ruleLocked: room.ruleLocked, swapPending: room.swapPending, hostReq: room.hostReq, rps: room.rps, chat: room.chat.slice(-200), ready: room.ready, undoUsed: room.undoUsed, lastResult: room.lastResult || null,
      // 存成员身份（只存 pid/name/seat，不存 lastSeen）
      users: room.users.map(u => ({ pid: u.pid, name: u.name, seat: u.seat })) })); }
    catch (e) { console.error('[go save]', room.code, e.message); }
  }, 800));
}
const GO_DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
function inB(x, y) { return x >= 0 && x < N && y >= 0 && y < N; }
function checkWin(board, x, y, c) {
  for (const [dx, dy] of GO_DIRS) {
    const line = [[x, y]];
    for (let s = 1; s < GO_WIN; s++) { const nx = x + dx * s, ny = y + dy * s; if (inB(nx, ny) && board[ny * N + nx] === c) line.push([nx, ny]); else break; }
    for (let s = 1; s < GO_WIN; s++) { const nx = x - dx * s, ny = y - dy * s; if (inB(nx, ny) && board[ny * N + nx] === c) line.push([nx, ny]); else break; }
    if (line.length >= GO_WIN) return line.slice(0, GO_WIN);
  }
  return null;
}
/* 悔棋回滚：撤掉发起方最近一手；若对方已经应招（后面还有子），连带撤掉那些子，
   保证撤完后轮到发起方行棋、双方子数也回到正常交替状态。 */
function goUndoRollback(room, seat) {
  let idx = -1;
  for (let i = room.moves.length - 1; i >= 0; i--) { if (room.moves[i].c === seat) { idx = i; break; } }
  if (idx < 0) return 0;
  const removed = room.moves.slice(idx);
  for (const m of removed) room.board[m.y * N + m.x] = -1;
  room.moves = room.moves.slice(0, idx);
  room.seq = room.moves.length ? room.moves[room.moves.length - 1].id : 0;
  room.winner = -1; room.winLine = [];
  room.turn = seat;
  return removed.length;
}
/* 开新一局：清盘面、重置悔棋次数与准备状态，沿用本局的黑白与规则 */
function goNewRound(room) {
  room.board = new Array(N * N).fill(-1);
  room.turn = (room.blackSeat === -1) ? 0 : room.blackSeat;
  room.winner = -1; room.winLine = []; room.moves = []; room.seq = 0;
  room.ready = [false, false]; room.undoUsed = [0, 0]; room.undoPending = null;
  room.rev++;
}
function goView(room) {
  const last = room.moves.length ? room.moves[room.moves.length - 1] : null;
  const now = Date.now();
  const players = room.users.map(u => ({ seat: u.seat, name: u.name, online: (now - u.lastSeen < 15000), host: u.seat === room.hostSeat, act: memberActOf(u) }));
  return { ok: true, code: room.code, board: room.board, turn: room.turn, winner: room.winner,
    winLine: room.winLine, lastX: last ? last.x : -1, lastY: last ? last.y : -1, rev: room.rev,
    moves: room.moves.length, log: room.moves, players,
    blackSeat: room.blackSeat, hostSeat: room.hostSeat, rule: room.rule, ruleLocked: room.ruleLocked,
    swapPending: room.swapPending, hostReq: room.hostReq, rps: room.rps, chat: room.chat,
    ready: room.ready, undoUsed: room.undoUsed, undoLimit: GO_UNDO_LIMIT,
    lastResult: room.lastResult || null,
    undoPending: room.undoPending ? { seat: room.undoPending.seat, name: room.undoPending.name, at: room.undoPending.at } : null };
}
function goBroadcast(room, ev, data) {
  const payload = 'event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n';
  for (const s of room.subs) { try { s.res.write(payload); } catch (e) {} }
}
function goTick() {
  const now = Date.now();
  for (const room of goRooms.values()) {
    const p0 = room.users[0], p1 = room.users[1];
    /* 同上：签名里带 act，落子/说话的切换才会推给页面 */
    const sig = [p0 ? (p0.name + (now - p0.lastSeen < 15000 ? '1' : '0') + memberActOf(p0)) : '-', p1 ? (p1.name + (now - p1.lastSeen < 15000 ? '1' : '0') + memberActOf(p1)) : '-'].join('|');
    if (sig !== room.peerSig) {
      room.peerSig = sig;
      for (const s of room.subs) { const peer = peerOf(room, s.user); s.res.write('event: peer\ndata: ' + JSON.stringify({ peer }) + '\n\n'); }
    }
    const bothGone = room.users.every(u => now - u.lastSeen > 30 * 60 * 1000);
    const idle = now - room.lastAt > 2 * 3600 * 1000;
    if ((bothGone && idle) || room.users.length === 0) {
      goRooms.delete(room.code);
      try { fs.unlinkSync(goPath(room.code)); } catch (e) {}
      continue;
    }
    if (room.users.length === 1 && room.hostSeat !== room.users[0].seat) {
      room.hostSeat = room.users[0].seat; room.ruleRev++;
      goBroadcast(room, 'host', { hostSeat: room.hostSeat });
    }
    /* 悔棋请求超时 / 发起人离线 → 自动取消，保证棋局不会卡住 */
    if (room.undoPending) {
      const requester = room.users.find(u => u.seat === room.undoPending.seat);
      const gone = !requester || (now - requester.lastSeen > 15000);
      if (now - room.undoPending.at > GO_UNDO_MS || gone) {
        const info = room.undoPending; room.undoPending = null; room.lastAt = now;
        goBroadcast(room, 'undo', { pending: false, seat: info.seat, from: info.name, timeout: true });
      }
    }
  }
}

/* ================= 静态文件 ================= */
function serveStatic(res, rel) {
  const full = path.join(PUBLIC, rel);
  if (!full.startsWith(PUBLIC)) return send(res, 403, 'forbidden', 'text/plain; charset=utf-8');
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, '没找到这个页面', 'text/plain; charset=utf-8');
    send(res, 200, data, MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
  });
}

/* ================= 路由 ================= */
const server = http.createServer(safe(async (req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'x'));
  const p = u.pathname.replace(/\/+$/, '') || '/';

  /* ---------- 页面 ---------- */
  if (p === '/' || p === '/index.html') return serveStatic(res, 'index.html');
  if (p === '/chat' || p === '/chat.html') return serveStatic(res, 'chat.html');
  if (p === '/game' || p === '/game/index.html') return serveStatic(res, path.join('game', 'index.html'));
  if (p === '/gomoku' || p === '/gomoku.html') return serveStatic(res, 'gomoku.html');
  if (p === '/yu' || p === '/yu.html') return serveStatic(res, 'yu.html');
  if (p === '/lingxi' || p === '/lingxi/index.html') return serveStatic(res, path.join('lingxi', 'index.html'));

  /* ---------- 「与鱼」附件：图片 / 语音 inline，文件 attachment ---------- */
  if (p.startsWith('/yu-f/')) return YU.file(req, res, u, p);

  /* ---------- 「与鱼」API ---------- */
  if (p.startsWith('/api/yu/')) return YU.api(req, res, u, p);

  /* ---------- 「心有灵犀」联机 API（patch2 新增） ---------- */
  if (p.startsWith('/api/lx/')) return LX.api(req, res, u, p);

  /* ---------- 她的状态（只读）：页面顶部那一行小字用 ----------
   * 只显示档位词 + 心情 + 今天的账，不返回分数。
   * 读不到文件也返回 200 + {ok:false}，页面自己退回「还没见过」。 */
  if (p === '/api/mood') return json(res, moodSnapshot());

  /* ---------- 上传的图片 / GIF ---------- */
  if (p.startsWith('/m/')) {
    const name = p.slice(3);
    if (!UPLOAD_NAME_RE.test(name)) return send(res, 404, 'not found', 'text/plain');
    const full = path.join(UPLOADS, name);
    return fs.readFile(full, (err, data) => {
      if (err) return send(res, 404, 'not found', 'text/plain');
      send(res, 200, data, MIME['.' + name.split('.').pop()] || 'application/octet-stream',
        { 'Cache-Control': 'public, max-age=31536000, immutable' });
    });
  }

  /* ============ 聊天室 API ============ */
  if (p === '/api/room/enter') {
    const b = await readBody(req);
    const code = normCode(b.code);
    const pid = String(b.pid || '').slice(0, 40);
    if (!CODE_RE.test(code)) return json(res, { error: '房间号只能是 1–12 位字母、数字、下划线或横杠' });
    if (!pid) return json(res, { error: '缺少客户端标识，刷新一下再试' });
    const room = loadChat(code);
    let me = room.users.find(x => x.pid === pid);
    let fresh = false;
    if (me) { me.name = String(b.name || me.name || '玩家').slice(0, 12); me.lastSeen = Date.now(); }
    else {
      if (room.users.length >= MAX_CHAT_MEMBERS) {
        // 坐满但人都走了 10 分钟以上：把僵尸座位清掉，别让房间号被永久占死
        const now = Date.now();
        const alive = room.users.filter(x => now - x.lastSeen < 10 * 60 * 1000);
        if (alive.length < room.users.length) {
          room.users = alive;
          room.users.forEach((x, i) => x.seat = i);
        }
      }
      if (room.users.length >= MAX_CHAT_MEMBERS) return json(res, { error: `房间 ${code} 已经满了（最多 2 人）`, full: true });
      me = { pid, name: String(b.name || '玩家').slice(0, 12) || '玩家', seat: room.users.length, lastSeen: Date.now() };
      room.users.push(me);
      fresh = true;
      pushMsg(room, { type: 'sys', text: `${me.name} 进入了房间` });
    }
    room.lastAt = Date.now(); room.rev++;
    return json(res, {
      ok: true, code, seat: me.seat, name: me.name,
      peer: peerOf(room, me), members: room.users.map(x => x.name),
      msgs: room.msgs, stickers: room.stickers, rev: room.rev, maxUpload: MAX_UPLOAD, fresh
    });
  }
  if (p === '/api/room/send') {
    const b = await readBody(req);
    const room = loadChat(normCode(b.code));
    const me = room.users.find(x => x.pid === String(b.pid || ''));
    if (!me) return json(res, { error: '先加入房间' });
    me.lastSeen = Date.now();
    const now = Date.now();
    me.hits = (me.hits || []).filter(t => now - t < 10000);
    if (me.hits.length > 24) return json(res, { error: '发得太快了，喘口气' });
    me.hits.push(now);

    const type = (b.type === 'img' || b.type === 'sticker') ? b.type : 'text';
    if (type === 'text') {
      const text = String(b.text || '').replace(/\s+$/, '').slice(0, 1000);
      if (!text.trim()) return json(res, { error: '空消息' });
      const m = pushMsg(room, { type: 'text', text, name: me.name, seat: me.seat, pid: me.pid });
      return json(res, { ok: true, msg: m });
    }
    /* [EXTERNAL-DEP · PATCH 8/8] 外部系统依赖，勿删改
       放行三种图片来源：本地上传 /m/、QQ 共用表情库 /sticker/、
       AI 画的图片库 /pics/。后两种由 PATCH 6/7 的静态路由提供。
       注意：v5 基线里连 /sticker/ 都没有放行，这里是一次补齐。 */
    const url = String(b.url || '');
    const _okUpload = /^\/m\/[a-f0-9]{16}\.(png|jpg|gif|webp)$/.test(url);
    const _okSticker = /^\/sticker\/[^\/?&#]+\.(png|jpg|jpeg|gif|webp)$/i.test(url) && !url.includes('..');
    const _okPic = /^\/pics\/[^\/?&#]+\.(png|jpg|jpeg|gif|webp)$/i.test(url) && !url.includes('..');
    if (!_okUpload && !_okSticker && !_okPic) return json(res, { error: '图片地址不对' });
    const m = pushMsg(room, { type, url, name: me.name, seat: me.seat, pid: me.pid, sticker: type === 'sticker' });
    return json(res, { ok: true, msg: m });
  }
  /* 手动清理：删除超过 keepDays 天、且没有被任何聊天存档引用的上传文件 */
  if (p === '/api/room/cleanup-uploads') {
    if (req.method !== 'POST') return json(res, { error: '只支持 POST' });
    if (!guardAdmin(req, res)) return;   // 删除类接口：默认只允许本机或持令牌者
    const rawDays = Number(u.searchParams.get('keepDays'));
    const keepDays = Number.isFinite(rawDays) && rawDays >= 1 ? Math.min(3650, rawDays) : 30;
    const cutoff = Date.now() - keepDays * 24 * 3600 * 1000;
    const refs = collectUploadRefs();
    const idx = loadUploadIndex();
    let names = [];
    try { names = fs.readdirSync(UPLOADS); } catch (e) {}
    let deleted = 0, freed = 0, kept = 0, scanned = 0;
    for (const name of names) {
      if (!UPLOAD_NAME_RE.test(name)) continue;      // index.json 等非图片文件跳过
      scanned++;
      const full = path.join(UPLOADS, name);
      let st;
      try { st = fs.statSync(full); } catch (e) { continue; }
      if (refs.has(name)) { kept++; continue; }      // 正在被历史消息引用，绝不删
      if (st.mtimeMs > cutoff) { kept++; continue; }  // 还没到 keepDays
      try {
        fs.unlinkSync(full);
        deleted++; freed += st.size;
        for (const k of Object.keys(idx)) if (k.slice(0, 16) === name.slice(0, 16)) delete idx[k];
      } catch (e) { console.error('[cleanup uploads]', name, e.message); }
    }
    saveUploadIndex(idx);
    return json(res, { ok: true, deleted, freed, keepDays, scanned, kept });
  }
  if (p === '/api/room/upload') {
    const code = normCode(u.searchParams.get('code'));
    const pid = String(u.searchParams.get('pid') || '');
    const room = loadChat(code);
    const me = room.users.find(x => x.pid === pid);
    if (!me) return json(res, { error: '先加入房间' });
    let buf;
    try { buf = await readRaw(req, MAX_UPLOAD); }
    catch (e) {
      if (e.code === 'TOO_LARGE') return json(res, { error: `文件太大，最多 ${Math.round(MAX_UPLOAD / 1048576)}MB` });
      return json(res, { error: '读取上传失败：' + e.message });
    }
    if (!buf || !buf.length) return json(res, { error: '没有收到文件' });
    const kind = sniff(buf);
    if (!kind) return json(res, { error: '只支持 PNG / JPG / GIF / WEBP 图片' });
    // 内容寻址：文件名 = md5 前 16 位 + 原扩展名；同内容只存一份
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    const name = md5.slice(0, 16) + '.' + kind.ext;
    const full = path.join(UPLOADS, name);
    let reused = false;
    if (fs.existsSync(full)) reused = true;
    else fs.writeFileSync(full, buf);
    const orig = String(req.headers['x-file-name'] || u.searchParams.get('name') || '').trim();
    rememberUpload(md5, orig || ('upload.' + kind.ext), buf.length);
    me.lastSeen = Date.now();
    const sticker = u.searchParams.get('sticker') === '1';
    if (sticker) {
      const url = '/m/' + name;
      if (!room.stickers.includes(url)) {
        room.stickers.push(url);
        if (room.stickers.length > STICKER_KEEP) room.stickers.splice(0, room.stickers.length - STICKER_KEEP);
        room.rev++;
        for (const s of room.subs) s.res.write('event: stickers\ndata: ' + JSON.stringify({ stickers: room.stickers }) + '\n\n');
      }
    }
    return json(res, { ok: true, url: '/m/' + name, ext: kind.ext, size: buf.length, sticker, dedup: reused });
  }
  if (p === '/api/room/ping') {
    const b = await readBody(req);
    const room = loadChat(normCode(b.code));
    const me = room.users.find(x => x.pid === String(b.pid || ''));
    if (me) me.lastSeen = Date.now();
    return json(res, { ok: true, peer: me ? peerOf(room, me) : null });
  }
  if (p === '/api/room/state') {
    const code = normCode(u.searchParams.get('code'));
    const pid = String(u.searchParams.get('pid') || '');
    const since = Number(u.searchParams.get('since') || 0);
    const room = loadChat(code);
    const me = room.users.find(x => x.pid === pid);
    if (!me) return json(res, { needJoin: true });
    me.lastSeen = Date.now();
    return json(res, {
      ok: true, rev: room.rev, seat: me.seat, peer: peerOf(room, me),
      members: room.users.map(x => x.name),
      msgs: room.msgs.filter(m => m.id > since), stickers: room.stickers
    });
  }
  /* 状态栏上报（聊天室）：只改自己那条成员记录的 act。
   * 为什么需要它：页面上原来只有「在线」，而机器人每 1.5 秒心跳一次，
   * 那一栏等于恒亮的灯（用户说的「一直在线中」）。
   * 极轻：不落盘、不广播消息、不动 rev；匹配不到成员就 {ok:false}，绝不新建成员。
   * act 是什么由上报方决定（agent-bot 的 presence 发「思考中 / 说话中 / 发呆中」）；
   * 传空串就是清除。 */
  if (p === '/api/room/act') {
    if (req.method !== 'POST') return json(res, { ok: false });
    const b = await readBody(req);
    const room = loadChat(normCode(b.code));
    const me = room.users.find(x => x.pid === String(b.pid || ''));
    if (!me) return json(res, { ok: false });
    me.act = String(b.act == null ? '' : b.act).slice(0, 12);
    me.actAt = Date.now();
    me.lastSeen = Date.now();          // 上报本身就是一次心跳，别再让页面闪「离线」
    return json(res, { ok: true, act: me.act });
  }
  if (p === '/api/room/leave') {
    const b = await readBody(req);
    const room = loadChat(normCode(b.code));
    const idx = room.users.findIndex(x => x.pid === String(b.pid || ''));
    if (idx >= 0) {
      const [me] = room.users.splice(idx, 1);
      room.users.forEach((x, i) => x.seat = i);
      pushMsg(room, { type: 'sys', text: `${me.name} 离开了房间` });
      for (const s of room.subs) s.res.write('event: bye\ndata: {}\n\n');
    }
    return json(res, { ok: true });
  }
  if (p === '/api/room/stream') {
    const code = normCode(u.searchParams.get('code'));
    const pid = String(u.searchParams.get('pid') || '');
    const room = loadChat(code);
    const me = room.users.find(x => x.pid === pid);
    if (!me) return json(res, { needJoin: true });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    me.lastSeen = Date.now();
    let lastId = Number(u.searchParams.get('since') || 0);
    let lastPeer = '';
    const sub = { res, user: me };
    room.subs.add(sub);
    res.write('event: hello\ndata: ' + JSON.stringify({ seat: me.seat, peer: peerOf(room, me), stickers: room.stickers }) + '\n\n');
    const tick = setInterval(() => {
      try {
        me.lastSeen = Date.now();
        const msgs = room.msgs.filter(m => m.id > lastId);
        if (msgs.length) {
          lastId = msgs[msgs.length - 1].id;
          res.write('event: msgs\ndata: ' + JSON.stringify({ msgs }) + '\n\n');
        }
        const peer = peerOf(room, me);
        const sig = JSON.stringify(peer);
        if (sig !== lastPeer) { lastPeer = sig; res.write('event: peer\ndata: ' + JSON.stringify({ peer }) + '\n\n'); }
      } catch (e) { /* 连接已断，等 close 收尾 */ }
    }, 500);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);
    req.on('close', () => {
      clearInterval(tick); clearInterval(ping);
      room.subs.delete(sub);
      me.lastSeen = Math.min(me.lastSeen, Date.now() - 20000);   // 立刻算离线，别让对方等 15 秒
      setTimeout(() => chatTick(), 30);
    });
    return;
  }

  /* 五子棋逻辑在模块作用域定义（loadGo / goRooms / goTick 等），以下仅做路由分发。 */

  if (p === '/api/go/enter') {
    const b = await readBody(req);
    const code = normCode(b.code);
    const pid = String(b.pid || '').slice(0, 40);
    if (!CODE_RE.test(code)) return json(res, { error: '房间号只能是 1–12 位字母、数字、下划线或横杠' });
    if (!pid) return json(res, { error: '缺少客户端标识，刷新一下再试' });
    const room = loadGo(code);
    let me = room.users.find(x => x.pid === pid);
    if (me) { me.name = String(b.name || me.name || '玩家').slice(0, 12); me.lastSeen = Date.now(); }
    else {
      if (room.users.length >= 2) {
        const alive = room.users.filter(x => Date.now() - x.lastSeen < 10 * 60 * 1000);
        if (alive.length < room.users.length) { room.users = alive; room.users.forEach((x, i) => x.seat = i); }
      }
      if (room.users.length >= 2) return json(res, { error: `房间 ${code} 已经满了（最多 2 人）`, full: true });
      me = { pid, name: String(b.name || '玩家').slice(0, 12) || '玩家', seat: room.users.length, lastSeen: Date.now() };
      room.users.push(me);
    }
    room.lastAt = Date.now(); room.rev++;
    const v = goView(room);
    return json(res, Object.assign({ seat: me.seat, name: me.name, peer: peerOf(room, me), members: room.users.map(x => x.name) }, v));
  }
  if (p === '/api/go/move') {
    const b = await readBody(req);
    const room = loadGo(normCode(b.code));
    const me = room.users.find(x => x.pid === String(b.pid || ''));
    if (!me) return json(res, { error: '先加入房间' });
    if (room.winner !== -1) return json(res, { error: '本局已经结束，点「重开」再来一局' });
    if (room.undoPending) return json(res, { error: '正在等待悔棋确认，稍等一下再落子' });
    if (room.blackSeat === -1) return json(res, { error: '先用猜拳/随机决定先后手再落子' });
    if (room.turn !== me.seat) return json(res, { error: '还没轮到你' });
    const x = Number(b.x), y = Number(b.y);
    if (!inB(x, y)) return json(res, { error: '落子位置不对' });
    const i = y * N + x;
    if (room.board[i] !== -1) return json(res, { error: '这里已经有子了' });
    room.board[i] = me.seat;
    const win = checkWin(room.board, x, y, me.seat);
    room.moves.push({ id: ++room.seq, x, y, c: me.seat, at: Date.now() });
    if (win) {
      room.winner = me.seat;
      room.winLine = win.map(([wx, wy]) => wy * N + wx);
      room.lastResult = {
        winner: me.seat,
        moves: room.moves.length,
        lastMove: { x, y, c: me.seat },
        winLine: room.winLine.slice(),
        at: Date.now(),
      };
    } else if (room.moves.length === N * N) {
      room.winner = 'draw';
      room.lastResult = {
        winner: 'draw',
        moves: room.moves.length,
        lastMove: { x, y, c: me.seat },
        winLine: [],
        at: Date.now(),
      };
    } else { room.turn = 1 - me.seat; }
    room.rev++; room.lastAt = Date.now();
    saveGo(room); goBroadcast(room, 'board', goView(room));
    return json(res, goView(room));
  }
  if (p === '/api/go/restart') {
    const b = await readBody(req);
    const room = loadGo(normCode(b.code));
    const me = room.users.find(x => x.pid === String(b.pid || ''));
    if (!me) return json(res, { error: '先加入房间' });
    const peer = peerOf(room, me);
    const can = !peer || !peer.online;   // 对手不在时保持原有「重开一局」能力
    if (!can && room.winner !== -1) return json(res, { error: '本局已结束，点「准备下一局」，两人都准备好后自动开始' });
    if (!can) return json(res, { error: '对局进行中，等这局结束再重开' });
    goNewRound(room);
    room.lastAt = Date.now(); saveGo(room);
    goBroadcast(room, 'ready', { ready: room.ready, started: true });
    goBroadcast(room, 'board', goView(room));
    return json(res, goView(room));
  }
  if (p === '/api/go/state') {
    const code = normCode(u.searchParams.get('code'));
    const pid = String(u.searchParams.get('pid') || '');
    const room = loadGo(code);
    const me = room.users.find(x => x.pid === pid);
    if (!me) return json(res, { needJoin: true });
    me.lastSeen = Date.now();
    // 能不能下：按「已结束 → 先后手待定 → 没轮到你 → 规则未确定 → 可下」的顺序判断
    let canMove = false, reason = '';
    if (room.winner !== -1 && room.winner !== undefined) reason = '本局已结束';
    else if (room.blackSeat === -1) reason = '先后手待定';
    else if (room.turn !== me.seat) reason = '还没轮到你';
    else if (!room.ruleLocked) reason = '规则未确定';
    else canMove = true;
    return json(res, { ok: true, view: goView(room), peer: peerOf(room, me), members: room.users.map(x => x.name), canMove, reason });
  }
  /* 状态栏上报（五子棋）：只改自己那条成员记录的 act。
   * 为什么不复用 /api/go/act：那个是**对局动作**端点（act = 'chat' / 'move' / 'setRule' …），
   * 把「落子中」塞进去会走到「未知操作」分支，以后加动作名还会和状态词打架。
   * 极轻：不落盘、不广播；匹配不到成员就 {ok:false}。 */
  if (p === '/api/go/presence') {
    if (req.method !== 'POST') return json(res, { ok: false });
    const b = await readBody(req);
    const room = loadGo(normCode(b.code));
    const me = room.users.find(x => x.pid === String(b.pid || ''));
    if (!me) return json(res, { ok: false });
    me.act = String(b.act == null ? '' : b.act).slice(0, 12);
    me.actAt = Date.now();
    me.lastSeen = Date.now();
    return json(res, { ok: true, act: me.act });
  }
  if (p === '/api/go/act') {
    const b = await readBody(req);
    const room = loadGo(normCode(b.code));
    const me = room.users.find(x => x.pid === String(b.pid || ''));
    if (!me) return json(res, { error: '先加入房间' });
    const peer = room.users.find(x => x.seat !== me.seat);
    const isHost = me.seat === room.hostSeat;
    const act = b.act;
    const RPS_WIN = { r: 's', s: 'p', p: 'r' };
    const RPS_CN = { r: '石头', s: '剪刀', p: '布' };
    const pushRule = () => goBroadcast(room, 'rule', { rule: room.rule, locked: room.ruleLocked, blackSeat: room.blackSeat, hostSeat: room.hostSeat, swapPending: room.swapPending, hostReq: room.hostReq, rps: room.rps });
    const pushHost = () => goBroadcast(room, 'host', { hostSeat: room.hostSeat });
    if (act === 'setRule') {
      if (!isHost) return json(res, { error: '只有房主能制定规则' });
      if (room.ruleLocked) return json(res, { error: '规则已锁定，本局不能再改' });
      const r = b.rule;
      if (!['fixed', 'swap', 'random', 'rps'].includes(r)) return json(res, { error: '未知规则' });
      room.rule = r; room.ruleLocked = true; room.ruleRev++;
      if (r === 'fixed') { room.blackSeat = room.hostSeat; room.swapPending = false; room.rps = { a: null, b: null }; }
      else if (r === 'swap') { room.blackSeat = room.hostSeat; room.swapPending = false; }
      else if (r === 'random') { room.blackSeat = Math.random() < 0.5 ? 0 : 1; room.rps = { a: null, b: null }; }
      else if (r === 'rps') { room.blackSeat = -1; room.rps = { a: null, b: null }; room.rpsRev++; }
      // 同步先手方：空盘时 turn 必须等于 blackSeat（blackSeat=-1 表示猜拳未定，不动 turn）
      if (room.moves.length === 0 && room.blackSeat >= 0) room.turn = room.blackSeat;
      room.rev++; saveGo(room); pushRule(); goBroadcast(room, 'board', goView(room));
      return json(res, goView(room));
    }
    if (act === 'requestSwap') {
      if (isHost) return json(res, { error: '你是房主，无需申请' });
      if (room.rule !== 'swap') return json(res, { error: '当前规则不允许交换先后手' });
      if (room.moves.length) return json(res, { error: '对局已开始，不能交换先后手' });
      if (room.swapPending) return json(res, { error: '已发送申请，等待房主确认' });
      room.swapPending = true; room.ruleRev++;
      goBroadcast(room, 'swap', { pending: true, from: me.name });
      return json(res, { ok: true });
    }
    if (act === 'respondSwap') {
      if (!isHost) return json(res, { error: '只有房主能确认' });
      if (!room.swapPending) return json(res, { error: '没有待确认的交换申请' });
      room.swapPending = false;
      if (b.yes) room.blackSeat = 1 - room.hostSeat;
      if (room.moves.length === 0 && room.blackSeat >= 0) room.turn = room.blackSeat;
      room.ruleRev++; room.rev++; saveGo(room);
      goBroadcast(room, 'swap', { pending: false, yes: !!b.yes });
      pushRule(); goBroadcast(room, 'board', goView(room));
      return json(res, goView(room));
    }
    if (act === 'requestRandom' || act === 'requestRps') {
      if (isHost) return json(res, { error: '你是房主，直接制定即可' });
      if (room.ruleLocked) return json(res, { error: '规则已锁定' });
      room._pendingRule = (act === 'requestRandom') ? 'random' : 'rps'; room.ruleRev++;
      goBroadcast(room, 'rulereq', { want: room._pendingRule, from: me.name });
      return json(res, { ok: true });
    }
    if (act === 'respondRule') {
      if (!isHost) return json(res, { error: '只有房主能确认' });
      if (!room._pendingRule) return json(res, { error: '没有待确认的规则请求' });
      const r = room._pendingRule; room._pendingRule = null;
      room.rule = r; room.ruleLocked = true; room.ruleRev++;
      if (r === 'random') { room.blackSeat = Math.random() < 0.5 ? 0 : 1; room.rps = { a: null, b: null }; }
      else if (r === 'rps') { room.blackSeat = -1; room.rps = { a: null, b: null }; room.rpsRev++; }
      // 同步先手方：空盘时 turn 必须等于 blackSeat（blackSeat=-1 表示猜拳未定，不动 turn）
      if (room.moves.length === 0 && room.blackSeat >= 0) room.turn = room.blackSeat;
      room.rev++; saveGo(room); pushRule(); goBroadcast(room, 'board', goView(room));
      return json(res, goView(room));
    }
    if (act === 'rpsChoose') {
      if (room.rule !== 'rps' || room.blackSeat !== -1) return json(res, { error: '当前不在猜拳环节' });
      const c = b.choice; if (!['r', 's', 'p'].includes(c)) return json(res, { error: '出拳无效' });
      room.rps[me.seat === 0 ? 'a' : 'b'] = c; room.rpsRev++;
      if (room.rps.a && room.rps.b) {
        let winner;
        if (room.rps.a === room.rps.b) winner = -1;
        else winner = (RPS_WIN[room.rps.a] === room.rps.b) ? 0 : 1;
        if (winner === -1) {
          room.rps = { a: null, b: null }; room.rpsRev++;
          goBroadcast(room, 'rps', { state: room.rps, tie: true, cn: RPS_CN });
          return json(res, { ok: true, tie: true });
        }
        room.blackSeat = winner;
        if (room.moves.length === 0 && room.blackSeat >= 0) room.turn = room.blackSeat;
        room.rev++; saveGo(room);
        goBroadcast(room, 'rps', { state: room.rps, winner, cn: RPS_CN });
        pushRule(); goBroadcast(room, 'board', goView(room));
        return json(res, goView(room));
      }
      goBroadcast(room, 'rps', { state: room.rps, cn: RPS_CN });
      return json(res, { ok: true });
    }
    if (act === 'transferHost') {
      if (isHost) {
        if (!peer) return json(res, { error: '没有房员可转让' });
        room.hostSeat = peer.seat; room.hostReq = false; room.ruleRev++; saveGo(room); pushHost();
        return json(res, { ok: true });
      }
      if (room.hostReq) return json(res, { error: '已发送申请' });
      room.hostReq = true; room.ruleRev++;
      goBroadcast(room, 'hostreq', { pending: true, from: me.name });
      return json(res, { ok: true });
    }
    if (act === 'respondHost') {
      if (!isHost) return json(res, { error: '只有房主能确认' });
      room.hostReq = false;
      if (b.yes && peer) room.hostSeat = peer.seat;
      room.ruleRev++; saveGo(room); pushHost();
      goBroadcast(room, 'hostreq', { pending: false, yes: !!b.yes });
      return json(res, { ok: true });
    }
    if (act === 'requestUndo') {
      if (room.winner !== -1) return json(res, { error: '本局已经结束，不能悔棋' });
      if (room.undoPending) return json(res, { error: '已有悔棋请求在等待确认' });
      if (room.blackSeat === -1 || !room.moves.length) return json(res, { error: '还没有落子，没什么可悔的' });
      if (!room.moves.some(m => m.c === me.seat)) return json(res, { error: '你还没有落子，没有可悔的棋' });
      if ((room.undoUsed[me.seat] || 0) >= GO_UNDO_LIMIT) return json(res, { error: '本局悔棋次数已用完（每方 ' + GO_UNDO_LIMIT + ' 次）' });
      if (!peer) return json(res, { error: '对方还没进房间，没人可确认' });
      const pv = peerOf(room, me);
      if (!pv || !pv.online) return json(res, { error: '对方不在线，暂时不能悔棋' });
      room.undoPending = { seat: me.seat, name: me.name, at: Date.now() };
      room.lastAt = Date.now();
      goBroadcast(room, 'undo', { pending: true, seat: me.seat, from: me.name, used: room.undoUsed });
      return json(res, { ok: true, undoPending: goView(room).undoPending });
    }
    if (act === 'respondUndo') {
      const p = room.undoPending;
      if (!p) return json(res, { error: '没有待确认的悔棋请求' });
      if (p.seat === me.seat) return json(res, { error: '这是你自己发出的请求' });
      room.undoPending = null;
      let removed = 0;
      if (b.yes) {
        const requester = room.users.find(u => u.seat === p.seat);
        if (requester && room.winner === -1) {
          removed = goUndoRollback(room, p.seat);
          room.undoUsed[p.seat] = Math.min(GO_UNDO_LIMIT, (room.undoUsed[p.seat] || 0) + 1);
        }
      }
      room.rev++; room.lastAt = Date.now(); saveGo(room);
      goBroadcast(room, 'undo', { pending: false, seat: p.seat, from: p.name, yes: !!b.yes, removed, used: room.undoUsed });
      goBroadcast(room, 'board', goView(room));
      return json(res, goView(room));
    }
    if (act === 'cancelUndo') {
      const p = room.undoPending;
      if (!p) return json(res, { error: '没有待确认的悔棋请求' });
      if (p.seat !== me.seat) return json(res, { error: '只能取消自己发出的请求' });
      room.undoPending = null; room.lastAt = Date.now();
      goBroadcast(room, 'undo', { pending: false, seat: p.seat, from: p.name, canceled: true });
      return json(res, { ok: true });
    }
    if (act === 'setReady') {
      if (room.winner === -1) return json(res, { error: '对局还没结束，不能准备下一局' });
      if (room.undoPending) return json(res, { error: '先处理完悔棋请求再准备' });
      room.ready[me.seat] = !!b.ready;
      room.lastAt = Date.now();
      const both = room.ready[0] && room.ready[1] && room.users.length === 2;
      if (both) goNewRound(room); else room.rev++;
      saveGo(room);
      goBroadcast(room, 'ready', { ready: room.ready, started: !!both, next: both ? { turn: room.turn, blackSeat: room.blackSeat } : null });
      if (both) goBroadcast(room, 'board', goView(room));
      return json(res, goView(room));
    }
    if (act === 'chat') {
      const text = String(b.text || '').slice(0, 500).trim();
      if (!text) return json(res, { error: '空消息' });
      const msg = { pid: me.pid, name: me.name, text, at: Date.now() };
      room.chat.push(msg); if (room.chat.length > 200) room.chat = room.chat.slice(-200);
      room.chatRev++; saveGo(room);
      goBroadcast(room, 'chat', msg);
      return json(res, { ok: true });
    }
    return json(res, { error: '未知操作' });
  }
  if (p === '/api/go/stream') {
    const code = normCode(u.searchParams.get('code'));
    const pid = String(u.searchParams.get('pid') || '');
    const room = loadGo(code);
    const me = room.users.find(x => x.pid === pid);
    if (!me) return json(res, { needJoin: true });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    me.lastSeen = Date.now();
    let lastRev = room.rev, lastPeer = '', lastRule = room.ruleRev, lastChat = room.chatRev, lastRps = room.rpsRev;
    const sub = { res, user: me }; room.subs.add(sub);
    const pushRule = () => res.write('event: rule\ndata: ' + JSON.stringify({ rule: room.rule, locked: room.ruleLocked, blackSeat: room.blackSeat, hostSeat: room.hostSeat, swapPending: room.swapPending, hostReq: room.hostReq, rps: room.rps }) + '\n\n');
    const pushChat = () => res.write('event: chat\ndata: ' + JSON.stringify(room.chat.slice(-50)) + '\n\n');
    const pushRps = () => res.write('event: rps\ndata: ' + JSON.stringify({ state: room.rps }) + '\n\n');
    res.write('event: hello\ndata: ' + JSON.stringify({ seat: me.seat, view: goView(room), peer: peerOf(room, me) }) + '\n\n');
    pushRule(); pushChat(); pushRps();
    const tick = setInterval(() => {
      try {
        me.lastSeen = Date.now();
        if (room.rev !== lastRev) { lastRev = room.rev; res.write('event: board\ndata: ' + JSON.stringify(goView(room)) + '\n\n'); }
        if (room.ruleRev !== lastRule) { lastRule = room.ruleRev; pushRule(); }
        if (room.chatRev !== lastChat) { lastChat = room.chatRev; pushChat(); }
        if (room.rpsRev !== lastRps) { lastRps = room.rpsRev; pushRps(); }
        const peer = peerOf(room, me); const sig = JSON.stringify(peer);
        if (sig !== lastPeer) { lastPeer = sig; res.write('event: peer\ndata: ' + JSON.stringify({ peer }) + '\n\n'); }
      } catch (e) {}
    }, 500);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);
    req.on('close', () => { clearInterval(tick); clearInterval(ping); room.subs.delete(sub); me.lastSeen = Math.min(me.lastSeen, Date.now() - 20000); setTimeout(() => goTick(), 30); });
    return;
  }

  /* ============ 万象牌 API ============ */
  /* 图鉴：全部卡牌 / 天赋 / BOSS / 流派的只读快照，随 content.js 一起走，不另存一份数据 */
  if (p === '/api/codex') {
    if (!CODEX) CODEX = buildCodex();
    return json(res, CODEX);
  }
  if (p === '/api/join') {
    const b = await readBody(req);
    const room = getRoom(b.room);
    const pid = String(b.pid || '').slice(0, 40);
    if (!pid) return json(res, { error: '缺少 pid' });
    const pl = room.join(pid, String(b.name || '玩家').slice(0, 8));
    if (!pl) return json(res, { error: '房间已满（2 人）' });
    return json(res, { ok: true, seat: pl.seat, room: room.id });
  }
  /* 状态栏上报（万象牌）：只改自己那条玩家记录的 act。
   * 极轻：不落盘（engine 的存档里没有 act）、不广播动作、不动 phase；
   * 匹配不到座位就 {ok:false}，绝不新建玩家。 */
  if (p === '/api/act') {
    if (req.method !== 'POST') return json(res, { ok: false });
    const b = await readBody(req);
    const room = getRoom(b.room);
    const pid = String(b.pid || '');
    const seat = room.seatOf(pid);
    if (seat < 0) return json(res, { ok: false });
    const pl = room.players[seat];
    pl.act = String(b.act == null ? '' : b.act).slice(0, 12);
    pl.actAt = Date.now();
    room.markSeen(pid);                 // 上报本身就是心跳
    return json(res, { ok: true, act: pl.act });
  }
  if (p === '/api/state') {
    const room = getRoom(u.searchParams.get('room'));
    const pid = String(u.searchParams.get('pid') || '');
    const seat = room.seatOf(pid);
    if (seat >= 0) room.markSeen(pid);
    if (seat < 0) return json(res, { needJoin: true, seats: room.players.length, need: MAX_PLAYERS, phase: room.phase });
    return json(res, room.view(seat));
  }
  if (p === '/api/action') {
    const b = await readBody(req);
    const room = getRoom(b.room);
    const seat = room.seatOf(String(b.pid || ''));
    if (seat < 0) return json(res, { error: '请先加入房间' });
    room.markSeen(String(b.pid || ''));
    return json(res, Object.assign({ seat }, room.act(seat, b.action || {})));
  }
  if (p === '/api/restart') {
    const b = await readBody(req);
    const room = getRoom(b.room);
    const seat = room.seatOf(String(b.pid || ''));
    if (seat < 0) return json(res, { error: '请先加入房间' });
    if (room.phase !== 'end' && b.confirm !== true) return json(res, { error: '需要确认才能重开' });
    room.restart();
    return json(res, { ok: true });
  }
  if (p === '/api/stream') {
    const room = getRoom(u.searchParams.get('room'));
    const pid = String(u.searchParams.get('pid') || '');
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    let last = -1, sentNeedJoin = false;
    room.markSeen(pid);
    const timer = setInterval(() => {
      try {
        const seat = room.seatOf(pid);
        if (seat < 0) {
          if (!sentNeedJoin) { res.write('event: state\ndata: {"needJoin":true}\n\n'); sentNeedJoin = true; }
          return;
        }
        sentNeedJoin = false;
        if (room.rev === last) return;
        last = room.rev;
        res.write('event: state\ndata: ' + JSON.stringify(room.view(seat)) + '\n\n');
      } catch (e) { console.error('[sse]', e && e.message); }
    }, 600);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(timer); clearInterval(ping); room.scheduleOffline(pid); });
    return;
  }
  /* ==========================================================
     [EXTERNAL-DEP · PATCH 5/8] 外部系统依赖，勿删改
     表情库清单：直接读 memes 目录，不上传、不入库、不占房间。
     QQ 侧与网页侧共用同一份；与鱼若要加一栏，也可直接 fetch 本接口。
     ========================================================== */
  if (p === '/api/room/sticker-lib') {
    const dir = process.env.MEME_DIR || path.join(WORKSPACE, 'memes');
    try {
      const files = fs.readdirSync(dir)
        .filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f))
        .sort();
      return json(res, { ok: true, stickers: files.map(f => '/sticker/' + encodeURIComponent(f)) });
    } catch (e) {
      return json(res, { ok: false, error: String(e.message || e), stickers: [] });
    }
  }

  if (p === '/api/health') {
    /* 不回显模型服务地址：那属于部署方内部信息，公开实例上没必要暴露 */
    return json(res, { ok: true, fmt: FMT, model: DEEPSEEK_MODEL, llm: Boolean(DEEPSEEK_KEY), upload: MAX_UPLOAD });
  }
  /* ==========================================================
     [EXTERNAL-DEP · PATCH 3/8] 外部系统依赖，勿删改
     用完整人设+记忆，并把这一问一答记进跨通道流水账（回调见 PATCH 4/8）。
     删掉后果：小鱼只拿到固定文案，且聊天内容不再进夜间摘要。
     ========================================================== */
  if (p === '/api/chat') {
    const b = await readBody(req);
    let msgs = Array.isArray(b.messages) ? b.messages.slice(-MAX_HIST) : [];
    // ★ 外部系统依赖：完整人设+记忆，别改回固定 SYSTEM_PROMPT
    if (!msgs.length || msgs[0].role !== 'system') msgs = [{ role: 'system', content: fullSystemPrompt() }, ...msgs];
    // ★ 外部系统依赖：把老板这句话记进跨通道流水账
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    if (lastUser && lastUser.content) {
      logChat('user', lastUser.content);
      /* 站点不写适配器：/api/chat 缺少 game / sessionId 这类局面信息，
       * 写进去的规则要么变成永远注入不到的幽灵规则，要么被语义误判污染。
       * 约定/撤销统一由 agent-bot 的与鱼通道处理（那边会补全 ctx 并走语义门槛）。 */
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    // ★ 外部系统依赖：流正常结束时把小鱼的回复也记进流水账
    try { proxyStream(req, res, msgs, (a) => logChat('assistant', a)); }
    catch (e) { res.write(`event: error\ndata: ${JSON.stringify({ message: String(e.message || e) })}\n\n`); res.end(); }
    return;
  }

  /* ==========================================================
     [EXTERNAL-DEP · PATCH 6/8] 外部系统依赖，勿删改
     表情库静态资源 /sticker/<文件名>，QQ 与网页共用 memes 目录。
     安全：禁 .. 穿越、禁子目录；目录不存在时返回 404，不影响其它页面。
     ========================================================== */
  if (p.startsWith('/sticker/')) {
    // ★ 跨平台修正（勿改回）：先 resolve，让 dir 与 full 的分隔符一致；
    //   否则 Windows 上 path.join 会把 / 换成 \，startsWith 误判成 403。
    const dir = path.resolve(process.env.MEME_DIR || path.join(WORKSPACE, 'memes'));
    const name = decodeURIComponent(p.slice('/sticker/'.length));
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return send(res, 400, 'bad request', 'text/plain; charset=utf-8');
    }
    const full = path.join(dir, name);
    if (!full.startsWith(dir)) return send(res, 403, 'forbidden', 'text/plain; charset=utf-8');
    fs.readFile(full, (err, data) => {
      if (err) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
      const ext = (name.split('.').pop() || '').toLowerCase();
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    });
    return;
  }

  /* ==========================================================
     [EXTERNAL-DEP · PATCH 7/8] 外部系统依赖，勿删改
     图片库静态资源 /pics/<文件名>：AI 自己画的图统一放在这里，
     聊天室和 QQ 两边共用。规则与 /sticker/ 完全相同。
     ========================================================== */
  if (p.startsWith('/pics/')) {
    // ★ 跨平台修正（勿改回）：同 /sticker/，先 resolve 再拼文件名。
    const dir = path.resolve(process.env.PICS_DIR || path.join(WORKSPACE, 'pics'));
    const name = decodeURIComponent(p.slice('/pics/'.length));
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return send(res, 400, 'bad request', 'text/plain; charset=utf-8');
    }
    const full = path.join(dir, name);
    if (!full.startsWith(dir)) return send(res, 403, 'forbidden', 'text/plain; charset=utf-8');
    fs.readFile(full, (err, data) => {
      if (err) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
      const ext = (name.split('.').pop() || '').toLowerCase();
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    });
    return;
  }

  /* ---------- 其它静态文件 ---------- */
  if (p.startsWith('/api/')) return json(res, { error: '没有这个接口' });
  return serveStatic(res, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
}));

/* ================= deepseek 流式代理 ================= */
/* [EXTERNAL-DEP · PATCH 4/8] 外部系统依赖，勿删改
   第 4 个参数 onAnswer + 累积变量：流「正常结束」时把整段回答回调出去，
   供 PATCH 3/8 写入跨通道流水账。出错 / 客户端断开一律不记（见下方 finish 调用点）。
   删掉后果：流水账只有老板的提问，没有小鱼的回答，夜间摘要残缺。 */
function proxyStream(req, res, messages, onAnswer) {
  // ★ 外部系统依赖：同一个回答只回调一次；sse('error') 分支不要调用 finish()
  let answer = '';
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (typeof onAnswer === 'function' && answer) {
      try { onAnswer(answer); } catch {}
    }
  };
  const url = new URL(chatURL());
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;
  const body = FMT === 'ollama'
    ? { model: DEEPSEEK_MODEL, messages, stream: true, options: { temperature: DEEPSEEK_TEMP } }
    : { model: DEEPSEEK_MODEL, messages, stream: true, temperature: DEEPSEEK_TEMP };
  const headers = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' };
  if (DEEPSEEK_KEY) headers['Authorization'] = 'Bearer ' + DEEPSEEK_KEY;
  const opt = { method: 'POST', hostname: url.hostname, port: url.port || (isHttps ? 443 : 80), path: url.pathname + url.search, headers };
  const sse = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const upstream = lib.request(opt, upstreamRes => {
    if (upstreamRes.statusCode >= 400) {
      let err = '';
      upstreamRes.on('data', d => err += d);
      upstreamRes.on('end', () => {
        try { err = JSON.parse(err).error?.message || err; } catch (e) {}
        sse('error', { message: `deepseek 返回 ${upstreamRes.statusCode}：${err}` });
        res.end();
      });
      return;
    }
    let buf = '', thinkOpen = false;
    upstreamRes.setEncoding('utf8');
    upstreamRes.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        let line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line || !line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') { sse('done', {}); finish(); res.end(); return; } // ★ 外部系统依赖：正常结束才记流水账
        let obj; try { obj = JSON.parse(payload); } catch (e) { continue; }
        if (FMT === 'ollama') {
          if (obj.done) { sse('done', {}); finish(); res.end(); return; } // ★ 外部系统依赖：正常结束才记流水账
          const text = obj.message?.content || '';
          if (!text) continue;
          let rest = text;
          while (rest) {
            if (thinkOpen) {
              const c = rest.indexOf('</think>');
              if (c < 0) { sse('reasoning', { text: rest }); rest = ''; }
              else { sse('reasoning', { text: rest.slice(0, c) }); rest = rest.slice(c + 8); thinkOpen = false; }
            } else {
              const o = rest.indexOf('<think>');
              if (o < 0) { sse('content', { text: rest }); answer += rest; rest = ''; } // ★ 外部系统依赖：累积回答
              else { if (o > 0) { sse('content', { text: rest.slice(0, o) }); answer += rest.slice(0, o); } rest = rest.slice(o + 7); thinkOpen = true; }
            }
          }
        } else {
          const rc = obj.choices?.[0]?.delta?.reasoning_content || '';
          const ct = obj.choices?.[0]?.delta?.content || '';
          if (rc) sse('reasoning', { text: rc });
          if (ct) { sse('content', { text: ct }); answer += ct; } // ★ 外部系统依赖：累积回答
        }
      }
    });
    upstreamRes.on('end', () => { sse('done', {}); finish(); res.end(); }); // ★ 外部系统依赖：上游正常结束
    upstreamRes.on('error', e => { sse('error', { message: String(e.message || e) }); res.end(); });
  });
  upstream.on('error', e => {
    sse('error', { message: `连不上模型服务（${chatURL()}）：${e.message || e}。请检查 .env 里的 LLM_BASE_URL 是否正确、对应服务是否已启动。` });
    res.end();
  });
  res.on('close', () => { if (!res.writableEnded) { try { upstream.destroy(); } catch (_) {} } });
  upstream.write(JSON.stringify(body));
  upstream.end();
}

server.listen(PORT, HOST, () => {
  console.log(`\n  ✦ 和鱼的开心导航 v5.001 已启动`);
  console.log(`     本机：http://localhost:${PORT}`);
  console.log(`     手机/公网：http://<服务器IP>:${PORT}`);
  console.log(`     首页 /   ·  万象牌 /game   ·  五子棋 /gomoku   ·  聊天室 /chat`);
  console.log(`     与鱼 /yu  ·  心有灵犀 /lingxi`);
  console.log(`     心有灵犀联机：/lingxi 点「🌐 联机」，接口 /api/lx/*`);
  console.log(`     上传图片：单文件最大 ${Math.round(MAX_UPLOAD / 1048576)}MB，存在 ${UPLOADS}`);
  if (DEEPSEEK_KEY) {
    console.log(`     AI 助手：${FMT} 格式，模型 ${DEEPSEEK_MODEL}（已读取到密钥）`);
  } else {
    console.log('     AI 助手：未配置（在 .env 里填 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 后重启即可启用）');
  }
  console.log(`     记得在云服务器安全组放行 ${PORT} 端口\n`);
});
process.on('uncaughtException', e => console.error('[uncaught]', e && e.stack || e));
process.on('unhandledRejection', e => console.error('[unhandled]', e && e.stack || e));
server.requestTimeout = 30000;
server.headersTimeout = 35000;
server.keepAliveTimeout = 30000;
