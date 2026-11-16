// 好感度 / 心情
//
// 定位：给她一个**慢变量**（亲密度 0~100）和一个心情标签，让她自己决定语气和配合度。
//
// 为什么不用固定脚本算分（这条是踩过之后改的）：
//   最早是词表 + 固定加减分（被夸 +5、被凶 -7…）。问题是每个人对她的养法不一样，
//   同一句话在不同关系里分量差很多，脚本一刀切会显得「千篇一律」。
//   现在改成：**规则和当前数值直接告诉她，由她自己判断该不该变、变多少**，
//   调用 feel 工具记下来。脚本只做三件模型做不了的事：
//     1. 存盘（原子写，写失败静默）
//     2. 边界（0~100，单次幅度上限，防止一次刷满或一次清零）
//     3. 回落（每 8 小时往 55 靠一点，避免一次吵架永久生效）
//
// 纪律：数值不进正文。她可以因为亲密度低而话短、不答应小事，但不许阴阳怪气、
// 不许报复、不许把分数念出来——这些写在 promptBlock 的规则里。
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
/** 单次 felt 的幅度上限：模型说 +30 也只按 +12 算，防止一次刷满 */
const MAX_STEP = 12;
/** 回落：每 8 小时 1 点，单次最多 3 点 */
const DECAY_PER_MS = 1 / (8 * 3600 * 1000);
const DECAY_MAX = 3;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => Date.now();

function blank() {
  return { affinity: BASE.affinity, energy: BASE.energy, updatedAt: now(), log: [] };
}

function read() {
  try {
    const o = JSON.parse(fs.readFileSync(FILE(), 'utf8'));
    if (!o || typeof o !== 'object') return blank();
    return {
      affinity: clamp(Number(o.affinity) || BASE.affinity, MIN, MAX),
      energy: clamp(Number(o.energy) || BASE.energy, MIN, MAX),
      updatedAt: Number(o.updatedAt) || now(),
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

/** 按时间把亲密度往基准拉。加 1e-6：dt 常比整点少几毫秒，不减会少算一步。 */
function decay(state, ts = now()) {
  const dt = Math.max(0, ts - state.updatedAt);
  if (!dt) return state;
  const step = Math.min(DECAY_MAX, Math.floor(dt * DECAY_PER_MS + 1e-6));
  if (step > 0) {
    if (state.affinity > BASE.affinity) state.affinity = Math.max(BASE.affinity, state.affinity - step);
    else if (state.affinity < BASE.affinity) state.affinity = Math.min(BASE.affinity, state.affinity + step);
  }
  state.updatedAt = ts;
  return state;
}

/**
 * 她自己的判断：这件事让她心里上升/下降多少。
 * @param {number} delta 建议幅度（-12 ~ +12，超出按上限算）
 * @param {string} why 一句话理由（只留 24 字，用于排查，不进正文）
 * @returns {{state:object, applied:number}} applied 是实际生效的分值
 */
function feel(delta, why = '') {
  const d0 = Number(delta);
  if (!Number.isFinite(d0) || Math.round(d0) === 0) {
    const state = decay(read());
    return { state, applied: 0 };
  }
  const state = decay(read());
  let d = clamp(Math.round(d0), -MAX_STEP, MAX_STEP);
  /* 已经在极高/极低处时收着点：她可以更亲近，但别一句话从 90 到 100。 */
  if (d > 0 && state.affinity >= 88) d = Math.max(1, Math.round(d * 0.6));
  if (d < 0 && state.affinity <= 12) d = Math.min(-1, Math.round(d * 0.6));
  state.affinity = clamp(state.affinity + d, MIN, MAX);
  state.log.push({ ts: now(), d, why: String(why || '').replace(/\s+/g, ' ').slice(0, 24) });
  state.log = state.log.slice(-20);
  write(state);
  return { state, applied: d };
}

/** 粗档，只用于给她的提示，不给用户看分数 */
function band(a) {
  if (a >= 80) return '很亲近';
  if (a >= 65) return '亲近';
  if (a >= 40) return '平常';
  if (a >= 25) return '有点疏';
  return '冷';
}

/** 最近一次「为什么变」（1 小时内才算「刚发生」，帮她判断语气） */
function recentWhy(state, ts = now()) {
  const last = state.log[state.log.length - 1];
  if (!last) return '';
  if (ts - Number(last.ts || 0) > 3600 * 1000) return '';
  return String(last.why || '');
}

/**
 * 给 system prompt 的一段：当前数值 + 规则，让她自己决定怎么说话、听不听指挥。
 *
 * 和上一版的区别：以前只在极端时才注入，现在是**每次都给**——因为判断权在她手上，
 * 不给数值她就没法判断。为了不膨胀，固定 3 行、不写历史。
 */
function promptBlock(state = decay(read())) {
  const a = Math.round(state.affinity);
  const why = recentWhy(state);
  const head = `【亲密度 ${a}/100（${band(a)}）${why ? `·刚因为「${why}」` : ''}】`;
  const rules = '怎么变由你判断：被夸、被照顾、一起玩得开心 → 升；被凶、被敷衍、被晾很久 → 降。'
    + '一次一般 ±3~8，别为一句客套大涨，也别为一句玩笑翻脸。觉得该变就调 feel 工具记下来。';
  const tone = a >= 72
    ? '你现在心情不错：可以更主动、更黏一点，但别腻到失真。'
    : a <= 28
      ? '你现在不太高兴：话可以短、可以不主动找话题，他不算过分的小要求（比如棋类让子）你可以不答应。'
        + '但别阴阳怪气、别翻旧账、别威胁——只是没那么热情。'
      : '语气自然就行，不用刻意表现情绪。';
  return `${head}\n${rules}\n${tone}\n（这些数字是你自己的感觉，回复里不要念出来。）`;
}

function describe(state = decay(read())) {
  return { affinity: state.affinity, energy: state.energy, band: band(state.affinity), recent: recentWhy(state) };
}

/** 测试/维护：直接覆盖状态 */
function setState(patch = {}) {
  const state = Object.assign(decay(read()), patch);
  state.updatedAt = now();
  write(state);
  return state;
}

module.exports = {
  feel, promptBlock, describe, band, setState, decay, read, FILE, BASE, MAX_STEP,
};
