// agent-bot 集中配置：所有路径、模型、房间、身份都从这里取
//
// 为什么单独抽一层（移植时新增）：
//   原版每个场景各自写死工作区绝对路径、各自写死模型地址与鉴权头，
//   换一台机器就要改 5 个文件。这里统一收口，改一处全生效。
//
// 设计原则：
//   1. 全部可用环境变量覆盖，不填就走默认值（默认值指向本仓库内的 workspace/）
//   2. 不依赖任何绝对路径；不假设部署在 /root
//   3. 鉴权支持两种：普通 API Key（Bearer）与 dsh 账号凭据（x-dsh-auth-token）
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

/* ---------- 自动加载仓库根的 .env ----------
 * 站点进程有自己的加载器，agent-bot 是独立进程，以前只认 shell 里 export 的变量，
 * 用户照 README 填了 .env 却不生效。这里补上，规则与站点一致：
 * 已存在的真实环境变量优先，.env 只补空缺。 */
(function loadDotEnv() {
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const file = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t[0] === '#') continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (val.length >= 2) {
        const a = val[0], b = val[val.length - 1];
        if ((a === '"' && b === '"') || (a === "'" && b === "'")) val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {}
})();

/** 仓库根目录（agent-bot 的上一级） */
const REPO_ROOT = path.join(__dirname, '..');

/** 取第一个非空环境变量 */
function pick(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

/* ---------- 工作区（人设、记忆、流水账、表情库、图片库）---------- */
const WORKSPACE = pick('WORKSPACE_DIR', 'WS_DIR')
  || path.join(REPO_ROOT, 'workspace');

/* 让 memory/ 模块跟随同一个工作区：
 * 它自己读 QQ_WORKSPACE_ROOT，默认指向仓库内 workspace/；
 * 这里统一注入，避免「人设读一个目录、记忆写另一个目录」。 */
if (!process.env.QQ_WORKSPACE_ROOT) process.env.QQ_WORKSPACE_ROOT = WORKSPACE;

/* ---------- 站点地址（各场景通过 HTTP 与站点交互）---------- */
const SITE_BASE = (pick('BASE', 'SITE_BASE') || 'http://127.0.0.1:3000').replace(/\/+$/, '');

/* ---------- 模型服务 ---------- */
/** 把用户填的 base 补成完整的 chat/completions 地址 */
function toChatUrl(base) {
  const b = String(base || '').replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(b)) return b;
  if (/\/v1$/.test(b)) return `${b}/chat/completions`;
  return `${b}/v1/chat/completions`;
}

/** 读 dsh 账号凭据里的 token（可选回退，不是必需） */
let _dsh = { v: '', mtime: 0, read: false };
function dshToken() {
  if (_dsh.read) return _dsh.v;
  try {
    const p = pick('DSH_CRED') || path.join(os.homedir(), '.dsh', '.credentials.yaml');
    const mt = fs.statSync(p).mtimeMs;
    if (mt !== _dsh.mtime) {
      const txt = fs.readFileSync(p, 'utf8');
      const m = txt.match(/token:\s*([A-Za-z0-9+/=_-]+)/);
      _dsh = { v: m ? m[1] : '', mtime: mt, read: false };
    }
  } catch {
    _dsh = { v: '', mtime: 0, read: true };
  }
  return _dsh.v;
}

const LLM_KEY = pick('LLM_API_KEY', 'DEEPSEEK_API_KEY');
/** 鉴权模式：显式指定 > 有 API Key 用 bearer > 有 dsh 凭据用 dsh > 无 */
const LLM_AUTH = (pick('LLM_AUTH') || (LLM_KEY ? 'bearer' : (dshToken() ? 'dsh' : 'none'))).toLowerCase();

const LLM = {
  /** 完整地址，例如 https://api.deepseek.com/v1/chat/completions */
  url: toChatUrl(pick('LLM_BASE_URL', 'DEEPSEEK_BASE_URL') || 'https://api.deepseek.com'),
  model: pick('LLM_MODEL', 'MODEL', 'DEEPSEEK_MODEL') || 'deepseek-chat',
  temperature: Number(pick('LLM_TEMP', 'DEEPSEEK_TEMP') || 0.85),
  maxTokens: Number(pick('LLM_MAX_TOKENS') || 400),
  auth: LLM_AUTH,
  key: LLM_KEY || (LLM_AUTH === 'dsh' ? dshToken() : ''),
  /** 组装鉴权头；没有凭据时返回空对象（由上游报错提示） */
  headers(extra) {
    const h = Object.assign({ 'content-type': 'application/json' }, extra || {});
    const k = this.key;
    if (!k) return h;
    if (this.auth === 'dsh') h['x-dsh-auth-token'] = k;
    else h.authorization = `Bearer ${k}`;
    return h;
  },
  /** 兼容老代码：需要原始 token 的地方 */
  token: dshToken,
  /** 启动时的自检提示 */
  describe() {
    if (!this.key) return '未配置（设置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 后启用）';
    return `${this.auth} 鉴权 · 模型 ${this.model} · ${this.url}`;
  },
};

/* ---------- 身份 ---------- */
const IDENTITY = {
  /** AI 自己的名字 */
  aiName: pick('AI_NAME') || '小鱼',
  /**
   * 对用户的称呼。
   * 注意：这个值同时写进 chatlog 的 name 字段，摘要脚本靠它判断「是不是本人发言」，
   * 改了要同步改摘要脚本里的判断条件，否则重要发言会被当路人丢掉。
   */
  ownerName: pick('OWNER_NAME') || '老板',
  /** 数字 ID（与鱼桥、OneBot 用）；留空表示不使用桥接 */
  botQQ: pick('BOT_QQ'),
  ownerQQ: pick('OWNER_QQ'),
};

/* ---------- 房间号 ---------- */
const ROOMS = {
  chat: pick('CHAT_ROOM') || '0000',
  card: pick('CARD_ROOM') || 'main',
  gomoku: pick('GOMOKU_ROOM') || '0000',
  lingxi: pick('LINGXI_ROOM') || '',
};

/* ---------- 各场景的 bot 身份（在与鱼/房间里显示）---------- */
const BOTS = {
  chat: { pid: pick('CHAT_PID') || 'chat-fish', name: pick('CHAT_NAME') || IDENTITY.aiName },
  card: { pid: pick('CARD_PID') || 'ai-teammate', name: pick('CARD_NAME') || IDENTITY.aiName },
  gomoku: { pid: pick('GOMOKU_PID') || 'go-fish', name: pick('GOMOKU_NAME') || IDENTITY.aiName },
  lingxi: { pid: pick('LINGXI_PID') || 'lx-fish', name: pick('LINGXI_NAME') || IDENTITY.aiName },
};

/* ---------- 截图渲染（画图功能，可选）---------- */
/** 常见 Chromium/Chrome 安装位置，按顺序探测 */
function detectChrome() {
  const explicit = pick('CHROME_BIN');
  if (explicit) return explicit;
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return '';
}

const RENDER = {
  chromeBin: detectChrome(),
  /** 截图脚本：优先用环境变量，其次用仓库内自带的 */
  shotScript: pick('SHOT_SCRIPT') || path.join(__dirname, 'lib', 'shot-safe.mjs'),
  picsDir: pick('PICS_DIR') || path.join(WORKSPACE, 'pics'),
  memesDir: pick('MEME_DIR', 'MEMES_DIR') || path.join(WORKSPACE, 'memes'),
  get ready() {
    if (!this.chromeBin || !fs.existsSync(this.shotScript)) return false;
    try { require.resolve('puppeteer-core'); return true; } catch { return false; }
  },
  /** 给工具回执用的说明 */
  whyNot() {
    if (!this.chromeBin) return '没有找到 Chromium/Chrome，设置 CHROME_BIN 指向可执行文件';
    if (!fs.existsSync(this.shotScript)) return `缺少截图脚本 ${this.shotScript}`;
    try {
      require.resolve('puppeteer-core');
    } catch {
      return '缺少依赖 puppeteer-core，在 agent-bot/ 目录执行 npm install';
    }
    return '';
  },
};

module.exports = {
  REPO_ROOT,
  workspace: WORKSPACE,
  personaDir: pick('PERSONA_DIR') || WORKSPACE,
  chatlog: pick('CHATLOG') || path.join(WORKSPACE, 'chatlog.jsonl'),
  sharedState: pick('SHARED_STATE') || path.join(WORKSPACE, 'shared-state.json'),
  siteBase: SITE_BASE,
  llm: LLM,
  identity: IDENTITY,
  rooms: ROOMS,
  bots: BOTS,
  render: RENDER,
  /** 老代码可能直接用这几个变量名 */
  memesDir: RENDER.memesDir,
  picsDir: RENDER.picsDir,
  pick,
};
