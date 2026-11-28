/* ============================================================
   「并肩割草」场景：替老板打《英雄之战》
   ------------------------------------------------------------
   和五子棋/卡牌的分工一样：
     · 页面里的 src/ai.js 负责逐帧操作（走位、清怪、捡掉落、放技能）；
     · 本文件负责低频判断：改数值适配器、升级选卡、读老板指令、说人话。

   为什么不让模型逐帧操作：割草是 60fps，模型一次回复 1~3 秒。
   把「手」交给脚本、把「判断」交给模型，才既有丝滑又有想法。

   降级：
     没配模型 / 模型挂了 → 只轮询，不发请求；关键词指令与本地选卡仍由
     站点 survivor.js 兜底，游戏照常能玩。
   ============================================================ */
'use strict';
const core = require('../core.js');
const cfg = require('../config.js');

const log = core.makeLogger('survivor');
const { persona, llm, adapterPrompt, handleMemoryCommand, endMemorySession } = core;

const BASE = cfg.siteBase;
const ROOM = cfg.rooms.survivor || 'main';
const NAME = cfg.identity.aiName;
const HAS_LLM = !!cfg.llm.key;

const TICK = Number(process.env.SURVIVOR_TICK_MS || 2500);
const THINK_MIN = Number(process.env.SURVIVOR_THINK_MS || 12000);   // 有事件时最快
const THINK_IDLE = Number(process.env.SURVIVOR_THINK_IDLE_MS || 30000); // 没事时

let lastCmdAt = 0;
let lastThinkAt = 0;
let lastBuffRound = -1;
let lastWave = -1;
let lastRunId = -1;
let ended = false;

/* ---------- HTTP ---------- */
async function get(p) {
  const r = await fetch(BASE + p);
  return r.json().catch(() => ({}));
}
async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return r.json().catch(() => ({}));
}

/* ---------- 模型输出：严格 JSON，失败就返回 null ---------- */
function parseJSON(text) {
  const s = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

function sysPrompt(extra) {
  const p = persona('game').slice(0, 1200);
  const rules = adapterPrompt({ game: 'survivor', sessionId: sessionIdOf() });
  return `你是${NAME}，正在替老板打一局《英雄之战》。说话自然、短，别念机制说明。`
    + (rules ? `\n老板定过的规矩：${rules}` : '')
    + `\n${p}`
    + (extra ? `\n${extra}` : '');
}

let _sessionId = '';
function sessionIdOf() { return _sessionId; }

/* ---------- 选卡 ---------- */
const BUFF_SCORE = [
  [/最大生命|生命上限|回满|回血|恢复/, 3.0],
  [/攻击/, 3.0],
  [/伤害减免/, 2.6],
  [/暴击率/, 2.4],
  [/暴击伤害/, 2.2],
  [/技能/, 2.2],
  [/移速/, 2.0],
];
function fallbackPick(buffs) {
  let idx = 0, best = -1;
  for (let i = 0; i < buffs.length; i++) {
    let s = 1;
    for (const [re, w] of BUFF_SCORE) if (re.test(buffs[i])) s += w;
    if (s > best) { best = s; idx = i; }
  }
  return idx;
}

async function pickBuff(snap) {
  const buffs = snap.buffs.slice(0, 6);
  let idx = fallbackPick(buffs);
  let reason = '看着最稳';
  let say = '';
  if (HAS_LLM) {
    try {
      const list = buffs.map((b, i) => `${i}. ${b}`).join('\n');
      const text = await llm([
        { role: 'system', content: sysPrompt('只输出 JSON，不要代码块。') },
        {
          role: 'user',
          content: `第 ${snap.wave} 波结束，要选一张强化。\n`
            + `我现在 ${snap.hp}/${snap.maxHp} 血，场上 ${snap.enemies} 个敌人、${snap.elites} 个大的。\n`
            + `候选：\n${list}\n`
            + '选一个最合适的。只输出：{"index":0,"reason":"不超过18字","say":"对老板说的一句话，不超过18字"}',
        },
      ], { maxTokens: 220, temperature: 0.6 });
      const j = parseJSON(text);
      if (j && Number.isInteger(j.index) && j.index >= 0 && j.index < buffs.length) {
        idx = j.index;
        reason = String(j.reason || '').slice(0, 40) || reason;
        say = String(j.say || '').slice(0, 40);
      }
    } catch (e) {
      log('选卡失败，走本地兜底:', e.message);
    }
  }
  await post('/api/survivor/choice', {
    code: ROOM, round: snap.wave, index: idx, reason,
    text: say || `选${buffs[idx] || ''}。${reason}`,
  });
  log(`第${snap.wave}波选卡 → ${idx}. ${buffs[idx]}（${reason}）`);
}

/* ---------- 调参 ---------- */
const NUM_KEYS = ['engageDist', 'retreatHp', 'farmWeight', 'killWeight', 'dangerWeight',
  'pickupRange', 'reaction', 'strafe', 'skillAggro', 'autoBuff'];
const INTENTS = ['auto', 'clear', 'farm', 'retreat', 'focus'];

async function think(snap, eventful) {
  if (!HAS_LLM) return;
  try {
    const text = await llm([
      { role: 'system', content: sysPrompt('只输出 JSON，不要代码块。') },
      {
        role: 'user',
        content: `当前局势：第 ${snap.wave} 波，我 ${snap.hp}/${snap.maxHp} 血，`
          + `场上 ${snap.enemies} 个敌人（大的 ${snap.elites} 个），掉落 ${snap.pickups} 个，状态「${snap.state}」。\n`
          + '你是驾驶员，可以微调自己的操作参数，让走位更顺。\n'
          + '可用参数：engageDist(接战距离80~620)、retreatHp(撤退血量比例0.05~0.9)、'
          + 'farmWeight(捡掉落0~4)、killWeight(清怪0~4)、dangerWeight(躲怪0~8)、'
          + 'pickupRange(绕路捡球80~900)、reaction(反应间隔ms 40~600)、'
          + 'strafe(绕圈方向-1~1)、skillAggro(技能频率0~1)、autoBuff(是否自己选奖励0/1)。\n'
          + '规则：一次最多改 2 个；幅度不超过原值的 30%；没把握就给空 patch。\n'
          + '只输出：{"intent":"auto|clear|farm|retreat|focus|","intentMs":15000,"patch":{},"note":"不超过20字","say":"不超过18字或空字符串"}',
      },
    ], { maxTokens: 300, temperature: 0.7 });
    const j = parseJSON(text);
    if (!j) return;
    const patch = {};
    if (j.patch && typeof j.patch === 'object') {
      let n = 0;
      for (const k of NUM_KEYS) {
        if (!(k in j.patch) || n >= 2) continue;
        const v = Number(j.patch[k]);
        if (Number.isFinite(v)) { patch[k] = v; n++; }
      }
    }
    const body = { code: ROOM, patch, note: String(j.note || '').slice(0, 40) };
    if (typeof j.intent === 'string' && INTENTS.includes(j.intent)) {
      body.intent = j.intent;
      body.intentMs = Math.max(0, Math.min(300000, Number(j.intentMs) || 15000));
    }
    await post('/api/survivor/policy', body);
    const say = String(j.say || '').trim();
    const quiet = !eventful && Math.random() < 0.5;   // 没事时少说两句
    if (say && !quiet) await post('/api/survivor/say', { code: ROOM, text: say });
    if (Object.keys(patch).length || body.intent) {
      log('调参:', JSON.stringify(patch), body.intent || '', j.note || '');
    }
  } catch (e) {
    log('调参失败:', e.message);
  }
}

/* ---------- 指令 ---------- */
async function handleCommand(text, snap) {
  log('老板指令:', text);
  let reply = '';
  let body = null;
  if (HAS_LLM) {
    try {
      const out = await llm([
        { role: 'system', content: sysPrompt('只输出 JSON，不要代码块。') },
        {
          role: 'user',
          content: `老板说：「${text}」\n当前：第 ${snap.wave} 波，我 ${snap.hp}/${snap.maxHp} 血，`
            + `场上 ${snap.enemies} 个敌人。\n`
            + '把这句话转成操作。只输出：'
            + '{"intent":"auto|clear|farm|retreat|focus|","intentMs":15000,"patch":{},"reply":"回他一句，不超过20字"}',
        },
      ], { maxTokens: 220, temperature: 0.6 });
      const j = parseJSON(out);
      if (j) {
        const patch = {};
        if (j.patch && typeof j.patch === 'object') {
          let n = 0;
          for (const k of NUM_KEYS) {
            if (!(k in j.patch) || n >= 3) continue;
            const v = Number(j.patch[k]);
            if (Number.isFinite(v)) { patch[k] = v; n++; }
          }
        }
        body = { code: ROOM, patch };
        if (typeof j.intent === 'string' && INTENTS.includes(j.intent)) {
          body.intent = j.intent;
          body.intentMs = Math.max(0, Math.min(600000, Number(j.intentMs) || 25000));
        }
        reply = String(j.reply || '').slice(0, 40);
      }
    } catch (e) {
      log('指令理解失败:', e.message);
    }
  }
  if (body && (Object.keys(body.patch).length || body.intent)) {
    await post('/api/survivor/policy', body);
  }
  // 「约定 / 这条不算了」这类长期规矩交给四层记忆；失败不影响本局
  try {
    const confirm = await handleMemoryCommand(text, { game: 'survivor', sessionId: sessionIdOf(), channel: 'survivor' });
    if (confirm) reply = reply ? `${reply} ${confirm}` : confirm;
  } catch {}
  if (reply) await post('/api/survivor/say', { code: ROOM, text: reply });
}

/* ---------- 主循环 ---------- */
async function tick() {
  let st;
  try {
    st = await get(`/api/survivor/state?code=${ROOM}`);
  } catch {
    return;   // 站点没起，下一轮再试
  }
  if (!st || !st.hasSnap || !st.snap) return;
  const snap = st.snap;
  if (snap.at && Date.now() - snap.at > 15000) return;   // 页面已经关了
  if (st.sessionId) _sessionId = st.sessionId;
  if (st.runId !== lastRunId) {
    lastRunId = st.runId;
    ended = false;
    lastBuffRound = -1;
    lastWave = -1;
    lastCmdAt = 0;
  }

  // 1) 老板的指令：先处理，保证「听指挥」优先于自己的判断
  try {
    const cs = await get(`/api/survivor/commands?code=${ROOM}&since=${lastCmdAt}`);
    if (cs && Array.isArray(cs.cmds)) {
      for (const c of cs.cmds) {
        lastCmdAt = Math.max(lastCmdAt, Number(c.at) || 0);
        await handleCommand(c.text, snap);
      }
    }
  } catch {}

  // 2) 倒下了：收个尾，这一局不再操作
  if (snap.dead) {
    if (!ended) {
      ended = true;
      try { endMemorySession(sessionIdOf(), `并肩割草第 ${snap.wave} 波倒下`); } catch {}
      await post('/api/survivor/say', { code: ROOM, text: '这波算我的，再来。' });
    }
    return;
  }

  // 3) 选卡
  if (snap.buffOpen && Array.isArray(snap.buffs) && snap.buffs.length && snap.wave !== lastBuffRound) {
    lastBuffRound = snap.wave;
    await pickBuff(snap);
  }

  // 4) 有事件就早点想，没事就慢点
  const now = Date.now();
  const eventful = snap.waveChanged || snap.hpDropped || lastWave === -1;
  const gap = eventful ? THINK_MIN : THINK_IDLE;
  if (now - lastThinkAt >= gap) {
    lastThinkAt = now;
    await think(snap, eventful);
  }
  lastWave = snap.wave;
}

function start() {
  log(`起步 → ${BASE} · 房间 ${ROOM} · 模型 ${HAS_LLM ? cfg.llm.describe() : '未配置（走关键词兜底）'}`);
  let busy = false;
  setInterval(() => {
    if (busy) return;
    busy = true;
    tick().catch(e => log('tick 异常:', e.message)).finally(() => { busy = false; });
  }, TICK);
}

module.exports = { start };
