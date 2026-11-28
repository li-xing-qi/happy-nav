/* ============================================================
   「并肩割草」联机队友：小鱼作为 guest 加入房主的房间
   ------------------------------------------------------------
   加入方式：只响应房主在开局前明确选择的「小鱼：当队友」邀请
   （/api/survivor/room/invites）。不主动找房、不占固定房号。
   没有邀请就安静待着。

   为什么是低频指令而不是逐帧：游戏模拟只在房主浏览器里跑，鱼只通过
   /api/survivor/room/input 发 move / skill / allyBuff / allyBuy。
   房主收到后调 window.__duo，和真人队友走同一条通道。

   无模型兜底：这里不调用模型，直接用局面摘要做本地策略：
     · 队友状态来自 state.ally（血、冷却、最近敌人方向 nx/ny、主角坐标）
     · 残血远离敌人，主角倒地时靠近救援，否则追最近的怪并放技能
   ============================================================ */
'use strict';
const core = require('../core.js');
const cfg = require('../config.js');

const log = core.makeLogger('survivor-coop');

const BASE = cfg.siteBase;
const PID = cfg.bots.survivorCoop.pid;
const NAME = cfg.bots.survivorCoop.name;
const TICK = Number(process.env.SURVIVOR_COOP_TICK_MS || 500);
const IDLE = Number(process.env.SURVIVOR_COOP_IDLE_MS || 3000);
const OFFLINE_LEAVE_MS = Number(process.env.SURVIVOR_COOP_OFFLINE_MS || 25000);
const OVER_LEAVE_MS = Number(process.env.SURVIVOR_COOP_OVER_MS || 60000);

let CODE = '';
let joinedAt = 0;
let hostOfflineSince = 0;
let overSince = 0;
let greeted = false;
let lastBuffSig = '';
let lastShopAt = 0;
let lastSkillAt = 0;
let lastMoveAt = 0;
let lastMove = { x: 0, y: 0 };
let cd = new Map();

function cdOk(code) { return Date.now() >= (cd.get(code) || 0); }
function cool(code, ms) { cd.set(code, Date.now() + (ms || 120000)); }

function logChat(role, text) {
  core.logChat(role, text, NAME, 'survivor-coop', 'owner');
}

async function get(p) {
  try {
    const r = await fetch(BASE + p);
    return await r.json().catch(() => ({}));
  } catch (e) { return { _err: e.message }; }
}
async function post(p, body) {
  try {
    const r = await fetch(BASE + p, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    return await r.json().catch(() => ({}));
  } catch (e) { return { _err: e.message }; }
}

/* ---------- 找邀请 ---------- */
async function findInvite() {
  const r = await get('/api/survivor/room/invites');
  const list = (r && r.invites) || [];
  const ok = list.filter((x) => x.host && x.host.online
    && x.phase !== 'over'
    && cdOk(x.code));
  return (ok[0] || {}).code || '';
}

async function enter(code) {
  const r = await post('/api/survivor/room/enter', { code, pid: PID, name: NAME, host: false });
  if (!r || !r.ok) {
    log(`进 ${code} 失败:`, (r && r.error) || '未知错误');
    cool(code, 15000);
    return false;
  }
  if (r.isHost) {
    log(`误占了房主位，退出 ${code}`);
    await post('/api/survivor/room/leave', { code, pid: PID });
    cool(code, 60000);
    return false;
  }
  CODE = code;
  joinedAt = Date.now();
  hostOfflineSince = 0;
  overSince = 0;
  greeted = false;
  lastBuffSig = '';
  lastShopAt = 0;
  lastSkillAt = 0;
  lastMoveAt = 0;
  lastMove = { x: 0, y: 0 };
  log(`已加入联机房 ${code}，当队友`);
  logChat('assistant', `我来当队友，房间 ${code}。`);
  await post('/api/survivor/room/chat', { code: CODE, pid: PID, text: '我来当队友，跟你一起冲。' });
  greeted = true;
  return true;
}

async function leave(reason) {
  if (!CODE) return;
  const code = CODE;
  CODE = '';
  try { await post('/api/survivor/room/leave', { code, pid: PID }); } catch (e) {}
  cool(code, 120000);
  log(`离开联机房 ${code}（${reason}）`);
}

/* ---------- 指令 ---------- */
async function send(kind, extra) {
  if (!CODE) return;
  const body = Object.assign({ code: CODE, pid: PID, kind }, extra || {});
  const r = await post('/api/survivor/room/input', body);
  if (r && r.error) log(`发送 ${kind} 失败:`, r.error);
}

function steer(x, y, force) {
  x = Math.max(-1, Math.min(1, Number(x) || 0));
  y = Math.max(-1, Math.min(1, Number(y) || 0));
  const now = Date.now();
  const same = Math.abs(x - lastMove.x) < 0.08 && Math.abs(y - lastMove.y) < 0.08;
  if (!force && same && now - lastMoveAt < 450) return;
  lastMove = { x, y };
  lastMoveAt = now;
  send('move', { x, y });
}

/* 用「最近敌人方向」靠近；没有敌人就停 */
function chase(ally) {
  if (ally.nearD < 0) { steer(0, 0); return; }
  if (ally.nearD > 160) steer(ally.nx, ally.ny);
  else {
    /* 太近就侧移绕圈，别和怪叠在一起 */
    steer(-ally.ny, ally.nx);
  }
}

function flee(ally) {
  if (ally.nearD < 0) { steer(0, 0); return; }
  steer(-ally.nx, -ally.ny);
}

function steerTo(ally, tx, ty) {
  const dx = Number(tx) - Number(ally.x || 0);
  const dy = Number(ty) - Number(ally.y || 0);
  const d = Math.hypot(dx, dy) || 1;
  if (d < 26) { steer(0, 0); return; }
  steer(dx / d, dy / d);
}

function maybeCast(ally) {
  if (!ally.alive || ally.downed) return;
  if (ally.nearD < 0 || ally.nearD > 340) return;
  const now = Date.now();
  if (now - lastSkillAt < 900) return;
  const cds = ally.cds || [];
  for (let i = 1; i <= 3; i++) {
    if ((Number(cds[i]) || 0) <= 0) {
      lastSkillAt = now;
      send('skill', { index: i });
      return;
    }
  }
}

/* ---------- 强化 / 商店（纯本地评分） ---------- */
const BUFF_SCORE = [
  [/最大生命|生命上限|回血|恢复/, 3.0],
  [/攻击|伤害/, 2.8],
  [/减免|护甲|防御/, 2.5],
  [/暴击/, 2.2],
  [/技能/, 2.0],
  [/移速/, 1.8],
];
function pickBest(list) {
  let idx = 0, best = -1;
  for (let i = 0; i < list.length; i++) {
    const text = String((list[i] && (list[i].text || list[i])) || '');
    let score = 1;
    for (const [re, w] of BUFF_SCORE) if (re.test(text)) score += w;
    if (score > best) { best = score; idx = i; }
  }
  return idx;
}

function maybeBuff(ally) {
  if (!ally.buffOpen || !Array.isArray(ally.buffs) || !ally.buffs.length) return false;
  const sig = 'b|' + ally.buffs.join('|');
  if (sig === lastBuffSig) return false;
  lastBuffSig = sig;
  const idx = pickBest(ally.buffs);
  log(`选队友强化 ${idx + 1}. ${ally.buffs[idx]}`);
  send('allyBuff', { index: idx });
  return true;
}

function maybeBuy(st, ally) {
  if (!st.shopOpen || !Array.isArray(ally.shop) || !ally.shop.length) return;
  if ((Number(ally.gold) || 0) < 500) return;
  if (Date.now() - lastShopAt < 1800) return;
  lastShopAt = Date.now();
  const idx = pickBest(ally.shop);
  const item = ally.shop[idx];
  if (!item || !item.id) return;
  log(`买队友强化：${item.text || item.id}`);
  send('allyBuy', { id: item.id });
}

/* ---------- 房间内 ---------- */
async function inRoom() {
  const v = await get(`/api/survivor/room/state?code=${CODE}&pid=${PID}`);
  if (!v || v.needJoin) {
    log(`不在联机房里了（${CODE}）`);
    cool(CODE, 30000);
    CODE = '';
    return;
  }
  if (v.hostOnline === false) {
    if (!hostOfflineSince) hostOfflineSince = Date.now();
    if (Date.now() - hostOfflineSince > OFFLINE_LEAVE_MS) { await leave('房主离线'); return; }
  } else {
    hostOfflineSince = 0;
  }

  const st = v.state;
  const ally = st && st.ally;
  if (!st || !ally) {
    steer(0, 0);
    return;
  }

  /* 非战斗阶段：停下，顺手处理选卡 / 商店 */
  const phase = st.phase || 'lobby';
  if (phase === 'buff' || phase === 'paused' || phase === 'lobby') {
    steer(0, 0);
    maybeBuff(ally);
    maybeBuy(st, ally);
    overSince = 0;
    return;
  }
  if (phase === 'over' || phase === 'dead') {
    steer(0, 0);
    if (!overSince) overSince = Date.now();
    if (Date.now() - overSince > OVER_LEAVE_MS) await leave('本局结束');
    return;
  }
  overSince = 0;

  if (maybeBuff(ally)) { steer(0, 0); return; }
  maybeBuy(st, ally);

  /* 队友自己倒地：动不了，等主角来救 */
  if (!ally.alive || ally.downed) { steer(0, 0); return; }

  /* 主角倒地：靠近按住 3 秒救起 */
  if (ally.heroDowned) {
    steerTo(ally, ally.heroX, ally.heroY);
    return;
  }

  const ratio = (Number(ally.hp) || 0) / Math.max(1, Number(ally.maxHp) || 1);
  if (ratio < 0.32) {
    flee(ally);
    return;
  }

  chase(ally);
  maybeCast(ally);
}

/* ---------- 找房循环 ---------- */
async function tick() {
  if (!CODE) {
    const code = await findInvite();
    if (!code) return;
    await enter(code);
    return;
  }
  await inRoom();
}

async function start() {
  log(`启动英雄之战联机队友：昵称=${NAME} 只响应「小鱼当队友」邀请`);
  for (;;) {
    try { await tick(); } catch (e) { log('异常:', e && e.message); }
    await new Promise((r) => setTimeout(r, CODE ? TICK : IDLE));
  }
}

module.exports = { start, __test: { findInvite, pickBest } };
