// 好感度 / 心情
//
// 为什么要有它：她本来每句话都一个调子，聊久了会像客服。这里给她一个
// 慢变量（好感度 0~100）和一个快变量（心情），只做**轻微**影响：
//   · 好感高 → 更主动、更黏一点
//   · 好感低 → 话短、不主动找话题，但不阴阳怪气、不报复
//   · 五子棋里被要求「让我一步」时，好感很低才有一定概率不让
//
// 三条纪律（防止它变成影响日常对话的负担）：
//   1. 默认 55 分，正常聊天时 promptLine() 返回空串 —— 大多数时候她不受影响
//   2. 只有「特别好 / 特别差 / 刚发生事」才往 prompt 里加一行，最多两行
//   3. 好感度按天缓慢回落到 55，不会因为一次吵架永久坏掉
//
// 存盘：<workspace>/data/mood.json（可用 MOOD_FILE 覆盖）
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let cfg = null;
try { cfg = require('../config.js'); } catch { /* 独立工作区部署没有 config.js */ }

/* 工作区判定：仓库布局用仓库内 workspace/；独立工作区（站点与 agent-bot 分开放，
 * 例如 /root/qq-workspace + /root/agent-bot）靠环境变量或约定路径兜底。
 * 判定顺序写死在这里，免得换台机器又要改代码。 */
function guessWorkspace() {
  const env = process.env.WORKSPACE_DIR || process.env.WS_DIR
    || process.env.QQ_WORKSPACE_ROOT || process.env.PERSONA_DIR;
  if (env) return env;
  if (cfg && cfg.workspace) return cfg.workspace;
  const split = '/root/qq-workspace';   // 现网这种分离部署的约定位置
  try { if (fs.statSync(split).isDirectory()) return split; } catch { /* 没有就往下走 */ }
  return path.join(__dirname, '..', '..', 'workspace');
}

const DEFAULT_FILE = path.join(guessWorkspace(), 'data', 'mood.json');
const FILE = () => process.env.MOOD_FILE || DEFAULT_FILE;

const BASE = { affinity: 55, energy: 70 };
const MIN = 0;
const MAX = 100;
/** 好感度回落到基准的速度：每 8 小时 1 点，最多一次补 3 点 */
const DECAY_PER_MS = 1 / (8 * 3600 * 1000);
const DECAY_MAX = 3;
/** 同一类事件的最短间隔，避免「谢谢」刷分 */
const COOLDOWN_MS = 30 * 60 * 1000;

const KINDS = {
  praise: { d: 5, label: '被你夸了' },
  thanks: { d: 3, label: '被你谢了' },
  scold: { d: -7, label: '被你凶了' },
  chat: { d: 1, label: '一起聊天' },
  win: { d: 2, label: '赢了棋' },
  lose: { d: -2, label: '输了棋' },
  help: { d: 3, label: '帮上忙了' },
  ignore: { d: -1, label: '被晾在一边' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => Date.now();

function blank() {
  return { affinity: BASE.affinity, energy: BASE.energy, updatedAt: now(), lastKindAt: {}, log: [] };
}

function read() {
  try {
    const o = JSON.parse(fs.readFileSync(FILE(), 'utf8'));
    if (!o || typeof o !== 'object') return blank();
    return {
      affinity: clamp(Number(o.affinity) || BASE.affinity, MIN, MAX),
      energy: clamp(Number(o.energy) || BASE.energy, MIN, MAX),
      updatedAt: Number(o.updatedAt) || now(),
      lastKindAt: o.lastKindAt && typeof o.lastKindAt === 'object' ? o.lastKindAt : {},
      log: Array.isArray(o.log) ? o.log.slice(-20) : [],
    };
  } catch {
    return blank();
  }
}

function write(state) {
  const file = FILE();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch { /* 心情写不进去也不能影响对话 */ }
}

/** 按时间把好感度往基准拉，避免一次吵架永久生效。 */
function decay(state, ts = now()) {
  const dt = Math.max(0, ts - state.updatedAt);
  if (!dt) return state;
  /* 加 1e-6：dt 常比整点少几毫秒（Date.now 抖动），不减这个的话
   * 「整整 16 小时」会被算成 1 步而不是 2 步。 */
  const step = Math.min(DECAY_MAX, Math.floor(dt * DECAY_PER_MS + 1e-6));
  if (step > 0) {
    if (state.affinity > BASE.affinity) state.affinity = Math.max(BASE.affinity, state.affinity - step);
    else if (state.affinity < BASE.affinity) state.affinity = Math.min(BASE.affinity, state.affinity + step);
  }
  state.updatedAt = ts;
  return state;
}

/** 记录一次情绪事件。未知 kind 会被忽略，返回 null。 */
function note(kind, detail = '') {
  const spec = KINDS[kind];
  if (!spec) return null;
  const state = decay(read());
  const ts = now();
  // 同类事件冷却：一次「谢谢」不该顶十次
  const last = Number(state.lastKindAt[kind] || 0);
  if (ts - last < COOLDOWN_MS && kind !== 'win' && kind !== 'lose') return state;

  let d = spec.d;
  // 高处不飘、低处不崩：极端区间里增益/减益减半
  if (d > 0 && state.affinity >= 85) d *= 0.5;
  if (d < 0 && state.affinity <= 15) d *= 0.5;
  state.affinity = clamp(Math.round((state.affinity + d) * 10) / 10, MIN, MAX);
  state.lastKindAt[kind] = ts;
  /* detail 只在排查时看，存一小截就够——不要把整段聊天原样落盘 */
  state.log.push({ ts, kind, d, detail: String(detail || '').replace(/\s+/g, ' ').slice(0, 24) });
  state.log = state.log.slice(-20);
  write(state);
  return state;
}

/* ---------- 从一句话里认出情绪事件（不调模型，纯词表 + 冷却） ---------- */
const PRAISE = /(可爱|好乖|乖|厉害|聪明|喜欢你|爱你|宝贝|辛苦了|谢谢|真好|棒|牛|贴心|懂事)/;
const SCOLD = /(笨|蠢|滚|闭嘴|烦死|讨厌你|废物|没用|垃圾|别烦我)/;
const ASK_HELP = /(帮我看|看一下|查一下|跑一下|弄一下)/;

/**
 * 只做「明确信号」的识别，认不出来就当没发生。
 * @returns {object|null} 命中并记录时返回新状态
 */
function noteFromText(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t || t.length > 300) return null;
  if (SCOLD.test(t)) return note('scold', t);
  if (PRAISE.test(t)) return note('praise', t);
  if (ASK_HELP.test(t)) return note('help', t);
  return note('chat', t);
}

/** 好感度分档。数值只是给提示词用的粗档，不给用户看具体分。 */
function band(a) {
  if (a >= 80) return '很亲近';
  if (a >= 65) return '亲近';
  if (a >= 40) return '平常';
  if (a >= 25) return '有点疏';
  return '冷';
}

/** 最近一次事件（2 小时内才算「刚发生」） */
function recentEvent(state, ts = now()) {
  const last = state.log[state.log.length - 1];
  if (!last) return null;
  if (ts - Number(last.ts || 0) > 2 * 3600 * 1000) return null;
  const spec = KINDS[last.kind];
  return spec ? spec.label : null;
}

/** 当前状态的人类可读描述（给日志/调试用，不进 prompt 全文） */
function describe(state = decay(read())) {
  return { affinity: state.affinity, energy: state.energy, band: band(state.affinity), recent: recentEvent(state) };
}

/**
 * 给 system prompt 的一小段。**大多数时候返回空串**——这是「不影响日常对话」的关键。
 * 只有特别好、特别差、或刚发生情绪事件时才返回，最多两行。
 */
function promptLine(state = decay(read())) {
  const a = state.affinity;
  const recent = recentEvent(state);
  const notable = a >= 72 || a <= 32 || Boolean(recent);
  if (!notable) return '';

  const bits = [`【此刻的心情】亲密度 ${Math.round(a)}/100（${band(a)}）${recent ? `；${recent}` : ''}`];
  if (a >= 80) bits.push('你现在对他很放松，可以更主动一点、偶尔撒个娇，但别腻到失真。');
  else if (a >= 65) bits.push('你现在对他挺亲近，语气可以软一点。');
  else if (a <= 25) bits.push('你现在有点不高兴。话短一点、别主动找话题，也不要阴阳怪气或翻旧账——就只是没那么热情。');
  else if (a <= 32) bits.push('你现在情绪一般，回得简短些就行。');
  return bits.join('\n');
}

/**
 * 被要求「让我一步 / 让我赢」时，要不要照做。
 * 好感很低时有一定概率不照做（这是唯一一处会让好感「影响实际行为」的地方，
 * 所以给的概率很克制：只有 ≤22 分才触发，且 45%）。
 * @param {Function} rng 注入随机源，测试用
 */
function shouldYield(state = decay(read()), rng = Math.random) {
  // 允许 shouldYield(rng) 这种更省事的调用
  if (typeof state === 'function') { rng = state; state = decay(read()); }
  if (!state || typeof state.affinity !== 'number') state = decay(read());
  if (state.affinity > 22) return true;
  return rng() >= 0.45;
}

/** 测试/维护：直接覆盖状态（不写 lastKindAt 冷却） */
function setState(patch = {}) {
  const state = Object.assign(decay(read()), patch);
  state.updatedAt = now();
  write(state);
  return state;
}

module.exports = {
  note, noteFromText, promptLine, describe, shouldYield, band,
  setState, decay, read, FILE, KINDS, BASE,
};
