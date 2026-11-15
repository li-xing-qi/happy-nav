// agent-bot 共享核心：人设、LLM、日志、token
// 三个场景（chat / card / gomoku）共用这一份，省内存也保证行为一致。
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('./config.js');

/* 路径与模型全部来自集中配置：换机器不用改文件，改环境变量即可 */
const PERSONA_DIR = cfg.personaDir;
const CHATLOG = cfg.chatlog;
const API = cfg.llm.url;
const MODEL = cfg.llm.model;

/* 四层记忆 · 安全接入层（可选增强）
 * 模块不存在 / 加载失败 / 渲染异常时一律返回空串，persona() 自动回落到
 * 下面的原始实现（AGENTS.md + MEMORY.md 全文），因此本依赖不是启动前置条件。
 * 这样即使记忆模块被摘掉，聊天室与四个游戏场景照常工作，不会丢失信息。 */
let memory = null;
/* 记忆模块可能有两种布局：仓库根的 memory/（推荐），或工作区内的 memory/（老部署） */
try { memory = require(path.join(cfg.REPO_ROOT, 'memory', 'bridge.js')); }
catch { try { memory = require(path.join(PERSONA_DIR, 'memory', 'bridge.js')); } catch {} }
const FOUR_LAYER_OFF = process.env.FOUR_LAYER === '0';

/* ---------- 日志：带场景前缀 ---------- */
function makeLogger(tag) {
  return (...a) => {
    const t = new Date().toISOString().slice(11, 19);
    console.log(`${t} [${tag}]`, ...a);
  };
}

/* ---------- 凭据（mtime 缓存，换账号自动跟随） ---------- */
let _tok = { v: '', mtime: 0 };
function token() {
  try {
    const mt = fs.statSync(CRED).mtimeMs;
    if (mt !== _tok.mtime) {
      const txt = fs.readFileSync(CRED, 'utf8');
      const m = txt.match(/token:\s*([A-Za-z0-9+/=_-]+)/);
      _tok = { v: m ? m[1] : '', mtime: mt };
    }
    return _tok.v;
  } catch {
    return _tok.v;
  }
}

/* ---------- 人设与记忆（三场景共用一份缓存） ----------
 * 优先走四层记忆渲染层；不可用时原样回落到 AGENTS.md + MEMORY.md 全文。
 * 注意：四层渲染层保证 identity 块是 AGENTS.md 全文（不裁剪），
 *      所以切换后不会丢人设与工具说明。 */
let _persona = { v: '', key: '' };
function legacyPersona() {
  const key = ['AGENTS.md', 'MEMORY.md'].map((f) => {
    try { return fs.statSync(path.join(PERSONA_DIR, f)).mtimeMs; } catch { return 0; }
  }).join('|');
  if (key !== _persona.key) {
    const parts = [];
    for (const f of ['AGENTS.md', 'MEMORY.md']) {
      try {
        const t = fs.readFileSync(path.join(PERSONA_DIR, f), 'utf8').trim();
        if (t) parts.push(t);
      } catch {}
    }
    _persona = { v: parts.join('\n\n---\n\n'), key };
  }
  return _persona.v;
}

function persona(channel = 'game', opts = {}) {
  if (!FOUR_LAYER_OFF && memory) {
    try {
      const enhanced = memory.renderFor(channel, opts);
      if (enhanced && enhanced.length > 200) return enhanced;
    } catch {}
  }
  return legacyPersona();
}

/** 当前生效的适配器规则（每步决策前重读，禁止缓存） */
function adapterPrompt(ctx = {}) {
  if (FOUR_LAYER_OFF || !memory) return '';
  try { return memory.adapterPrompt(ctx); } catch { return ''; }
}

/** 识别用户说的「约定 / 这条不算了」，返回确认语；非指令返回空串（异步：内部走语义裁决） */
async function handleMemoryCommand(text, ctx = {}) {
  if (FOUR_LAYER_OFF || !memory) return '';
  try { return await memory.handleCommand(text, ctx); } catch { return ''; }
}

/** 往 L1 临时记忆记一条局内数据（每步落子 / 每张出牌） */
function noteStep(sessionId, kind, data, ctx = {}) {
  if (FOUR_LAYER_OFF || !memory) return false;
  try { return memory.noteStep(sessionId, kind, data, ctx); } catch { return false; }
}

/** 局终归档 L1 + 让 session 档适配器失效 */
/** 决策成功后消费 once 档适配器（失败不消费，规则留到下一次）。 */
function commitOnceAdapters(ctx = {}) {
  if (FOUR_LAYER_OFF || !memory) return;
  try { memory.consumeOnce(memory.pendingOnceIds(ctx)); } catch {}
}

function endMemorySession(sessionId, summaryText = '') {
  if (FOUR_LAYER_OFF || !memory) return { ephemeral: false, adapters: false };
  try { return memory.endSession(sessionId, summaryText); } catch { return { ephemeral: false, adapters: false }; }
}

/* ---------- LLM 调用 ---------- */
async function llm(messages, { maxTokens = 200, temperature = 0.85 } = {}) {
  const r = await fetch(API, {
    method: 'POST',
    headers: cfg.llm.headers(),
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature, stream: false }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || '').trim();
}

/* ---------- 流水账（夜间摘要的原料） ---------- */
function logChat(role, text, name, channel = 'web', uid = 'owner') {
  if (!text) return;
  try {
    fs.appendFileSync(CHATLOG, JSON.stringify({
      ts: new Date().toISOString(),
      channel,
      uid,
      name: name || (role === 'assistant' ? cfg.identity.aiName : cfg.identity.ownerName),
      role,
      text: String(text).slice(0, 2000),
    }) + '\n');
  } catch {}
}

/* ---------- 时间工具 ---------- */
function agoTag(ts) {
  if (!ts) return '';
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60e3);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  return `${Math.round(hrs / 24)} 天前`;
}

function nowCN() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

module.exports = {
  makeLogger, token, persona, llm, logChat, agoTag, nowCN,
  adapterPrompt, handleMemoryCommand, noteStep, commitOnceAdapters, endMemorySession,
  PERSONA_DIR, CHATLOG, MODEL,
};
