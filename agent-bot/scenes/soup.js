// 海龟汤场景 · 适配器一：小鱼作为「参与者」
//
// 目标玩法：房间里有一个真人主持人，小鱼进去提问、试着猜汤底。
// 它看不到汤底（服务端裁剪视图），只能根据汤面和主持人的回答推进。
//
// 加入方式：只响应玩家在开局前明确选择的「我主持 · 鱼参与」邀请
// （/api/soup/fish-invites 里 fishMode=player 的房）。不主动扫全部房间、
// 不自己开房、不占固定房号；没有邀请就安静待着。
//
// 无模型兜底：本地副本没有 API Key，这时用一套通用的「是 / 不是」问题阶梯，
// 仍然能实际玩（提问、看回答、到点猜底），不会因为没 Key 就变成哑巴。

'use strict';
const core = require('../core.js');
const cfg = require('../config.js');

const log = core.makeLogger('soup');
const { persona, llm } = core;

const BASE = cfg.siteBase;
const PID = cfg.bots.soup.pid;
const NAME = cfg.bots.soup.name;
const TICK = Number(process.env.SOUP_TICK_MS || 2600);
const ASK_GAP = Number(process.env.SOUP_ASK_MS || 8000);
const GUESS_GAP = Number(process.env.SOUP_GUESS_MS || 30000);
const ALONE_LEAVE_MS = Number(process.env.SOUP_ALONE_MS || 90000);
const HAS_LLM = !!cfg.llm.key;

/* 离开后短暂冷却，避免同一间房立刻把我们又拉回去 */
const leaveCd = new Map();
function cdOk(code) { return Date.now() >= (leaveCd.get(code) || 0); }
function cool(code, ms) { leaveCd.set(code, Date.now() + (ms || 120000)); }

/* 通用问题阶梯：覆盖「人 / 物 / 地 / 时 / 动机 / 意外」六类。
 * 主持人答「是」会改变后续问题的重点；这是无模型时唯一可靠的推进方式。 */
const QUESTION_BANK = [
  '这件事里有人死亡吗？',
  '关键线索是一件日常物品吗？',
  '这件事发生在室内吗？',
  '有人故意隐瞒了什么吗？',
  '主角的职业重要吗？',
  '这件事和声音有关吗？',
  '这件事和光线有关吗？',
  '事情发生的时间点重要吗？',
  '有没有人误会了什么？',
  '关键原因是意外吗？',
  '这件事和钱有关吗？',
  '主角的身体状况重要吗？',
  '现场还有其他人吗？',
  '这件事在现实里常见吗？',
  '有人说了谎吗？',
  '和天气或季节有关吗？',
];

let CODE = '';
let joinedAt = 0;
let aloneSince = 0;
let lastAskAt = 0;
let lastGuessAt = 0;
let lastGuessAnswerCount = -1;
let lastPhase = '';
let lastHintShown = -1;
let lastCorrectOverAt = 0;
let lastStartedAt = 0;
let llmFails = 0;

function logChat(role, text) {
  core.logChat(role, text, NAME, 'soup', 'owner');
}

async function post(p, body) {
  try {
    const r = await fetch(BASE + p, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    return await r.json().catch(() => ({}));
  } catch (e) { return { _err: e.message }; }
}
async function get(p) {
  try {
    const r = await fetch(BASE + p);
    return await r.json().catch(() => ({}));
  } catch (e) { return { _err: e.message }; }
}

/* ---------- 找一间「明确邀请鱼参与」的房 ---------- */
async function findInvite() {
  const r = await get('/api/soup/fish-invites');
  const list = (r && r.invites) || [];
  const ok = list.filter((room) =>
    room.fishMode === 'player'
    && room.host && room.host.online
    && room.host.name !== NAME                  // 不闯进鱼自己主持的房
    && room.players < 8
    && (room.phase === 'playing' || room.phase === 'lobby')
    && cdOk(room.code));
  /* 优先正在玩的；其次才进还在等人的房 */
  const playing = ok.filter((room) => room.phase === 'playing');
  return (playing[0] || ok[0] || {}).code || '';
}

async function enter(code) {
  const r = await post('/api/soup/enter', { code, pid: PID, name: NAME, role: 'player' });
  if (!r || r.error) {
    log(`进 ${code} 失败:`, r && r.error);
    cool(code, 15000);
    return false;
  }
  if (r.state && r.state.fishMode !== 'player') {
    log(`房间 ${code} 并没有邀请鱼参与，先不进去`);
    cool(code, 60000);
    return false;
  }
  CODE = code;
  joinedAt = Date.now();
  aloneSince = 0;
  lastAskAt = 0;
  lastGuessAt = 0;
  lastGuessAnswerCount = -1;
  lastPhase = (r.state && r.state.phase) || '';
  lastHintShown = (r.state && r.state.hintsShown) || 0;
  const hostName = r.state && r.state.host ? r.state.host.name : '主持人';
  log(`进了海龟汤房间 ${code}，主持人是 ${hostName}`);
  /* 只有第一次进房才打招呼；刷新/重连沿用原座位，不再重复刷屏 */
  if (r.fresh) {
    logChat('assistant', `我来当参与者，和${hostName}玩海龟汤。`);
    await post('/api/soup/chat', { code: CODE, pid: PID, text: '我来当参与者，先问几个问题。' });
  }
  return true;
}

async function leave(reason) {
  if (!CODE) return;
  const code = CODE;
  CODE = '';
  try { await post('/api/soup/leave', { code, pid: PID }); } catch (e) {}
  cool(code, 120000);
  log(`退出海龟汤房间 ${code}（${reason}）`);
  joinedAt = 0;
  aloneSince = 0;
  lastPhase = '';
}

/* ---------- 提问 ---------- */
function qaText(st) {
  const rows = (st.qa || []).slice(-14).map((q) => {
    const a = q.verdict ? (q.verdict === 'yes' ? '是' : q.verdict === 'no' ? '不是'
      : q.verdict === 'irrelevant' ? '不重要' : q.verdict === 'partial' ? '部分是' : '无法确认') : '未回答';
    return `问：${q.text}\n答：${a}`;
  });
  return rows.length ? rows.join('\n') : '（还没人提问）';
}

async function nextQuestion(st) {
  const asked = new Set((st.qa || []).map((q) => String(q.text || '').trim()));
  const surface = st.puzzle ? st.puzzle.surface : '';

  if (HAS_LLM && llmFails < 3) {
    try {
      const sys = [
        persona(),
        '---',
        '你在和老板玩海龟汤。老板是主持人，知道汤底；你是参与者，只能提问。',
        '你只能问能用「是 / 不是 / 不重要」回答的问题，一次只问一件事。',
        '不要问「汤底是什么」，不要要求直接公布答案，不要重复已经问过的问题。',
        '',
        '汤面：' + surface,
        '',
        '已有的问答：',
        qaText(st),
        '',
        '请只输出一个简短的中文问题，20 字以内，以「？」结尾。',
      ].join('\n');
      const reply = await llm([
        { role: 'system', content: sys },
        { role: 'user', content: '问下一个最关键的问题。' },
      ], { maxTokens: 40, temperature: 0.75 });
      let q = String(reply || '').trim().replace(/^[「『"']+|[」』"']+$/g, '');
      q = q.split('\n')[0].trim();
      if (q && q.length <= 60 && !asked.has(q)) {
        if (!/[？?]$/.test(q)) q += '？';
        return q;
      }
      log('模型给的问题不可用，改用本地问题阶梯');
    } catch (e) {
      llmFails += 1;
      log('提问调用失败，改用本地问题阶梯:', e && e.message);
    }
  }

  const bank = QUESTION_BANK.filter((q) => !asked.has(q));
  return bank.length ? bank[Math.floor(Math.random() * bank.length)] : '';
}

/* ---------- 猜底 ---------- */
function localGuess(st) {
  const yes = (st.qa || []).filter((q) => q.verdict === 'yes').slice(-3).map((q) => q.text);
  const partial = (st.qa || []).filter((q) => q.verdict === 'partial').slice(-2).map((q) => q.text);
  const bits = yes.concat(partial).map((t) => t.replace(/[？?。！!，,、]/g, '').trim()).filter(Boolean);
  if (bits.length) return `我猜关键和「${bits.join('、')}」有关，表面看到的原因并不是真正的原因。`;
  return '我猜这件事的关键，是表面看到的东西被我们理解错了用途。';
}

async function makeGuess(st) {
  const surface = st.puzzle ? st.puzzle.surface : '';
  if (HAS_LLM && llmFails < 3) {
    try {
      const sys = [
        persona(),
        '---',
        '你在玩海龟汤，需要提交一个「汤底猜测」。老板是主持人，会判定猜对了 / 很接近 / 还不对。',
        '',
        '汤面：' + surface,
        '',
        '已有的问答：',
        qaText(st),
        '',
        '根据这些回答，写一两句话的完整猜测。不要复述问题，不要写成提问，不要解释你在推理。',
      ].join('\n');
      const reply = await llm([
        { role: 'system', content: sys },
        { role: 'user', content: '提交你的汤底猜测。' },
      ], { maxTokens: 100, temperature: 0.7 });
      const g = String(reply || '').trim().replace(/\s+/g, ' ').slice(0, 200);
      if (g) return g;
    } catch (e) {
      llmFails += 1;
      log('猜底调用失败，改用本地兜底:', e && e.message);
    }
  }
  return localGuess(st);
}

/* ---------- 主循环 ---------- */
async function tick() {
  if (!CODE) {
    const code = await findInvite();
    if (!code) return;
    await enter(code);
    return;
  }

  const resp = await get(`/api/soup/state?code=${CODE}&pid=${PID}`);
  if (!resp || resp.needJoin || !resp.state) {
    log(`不在房间 ${CODE} 了，重新等邀请`);
    cool(CODE, 30000);
    CODE = '';
    return;
  }
  const st = resp.state;
  if (!st.me || st.role !== 'player') { await leave('身份不是参与者'); return; }
  if (st.fishMode !== 'player') { await leave('房间没有邀请鱼参与'); return; }

  /* 主持人换题后 qa 会清空；猜测节流也要跟着新一轮重置，
   * 否则上一轮已经猜过 5 题，这一轮要等到第 9 题才肯再猜。 */
  if (st.startedAt && st.startedAt !== lastStartedAt) {
    lastStartedAt = st.startedAt;
    lastGuessAnswerCount = -1;
    lastAskAt = 0;
    lastGuessAt = 0;
  }

  const others = (st.users || []).filter((u) => !u.me);
  const humanHere = others.some((u) => u.online !== false && u.role === 'host');
  if (!humanHere) {
    if (!aloneSince) aloneSince = Date.now();
    if (Date.now() - aloneSince > ALONE_LEAVE_MS) {
      await leave('主持人不在线，把座位让出来');
      return;
    }
  } else {
    aloneSince = 0;
  }

  if (st.phase !== lastPhase) {
    log(`阶段 ${lastPhase || '?'} → ${st.phase}`);
    lastPhase = st.phase;
  }
  if (st.hintsShown > lastHintShown) {
    lastHintShown = st.hintsShown;
    log(`主持人给了第 ${st.hintsShown} 条提示`);
  }

  if (st.phase === 'lobby') {
    if (Date.now() - joinedAt > 300000) await leave('等不到开局');
    return;
  }
  if (st.phase === 'over') {
    /* 本轮结束：如果自己猜对了，说一句；等一会儿还没新题就退房 */
    const mineCorrect = (st.guesses || []).some((g) => g.mine && g.verdict === 'correct');
    if (mineCorrect && st.overAt && st.overAt !== lastCorrectOverAt) {
      lastCorrectOverAt = st.overAt;
      await post('/api/soup/chat', { code: CODE, pid: PID, text: '猜对了，这碗汤喝到了。' });
    }
    if (st.overAt && Date.now() - st.overAt > 300000) await leave('这一轮结束了');
    return;
  }
  if (st.phase !== 'playing') return;

  const qa = st.qa || [];
  const answered = qa.filter((q) => q.verdict != null).length;
  const open = qa.filter((q) => q.verdict == null).length;
  const myPending = qa.some((q) => q.mine && q.verdict == null);

  /* 先猜：每多回答 4 题猜一次，且没有待判定的猜测。
   * 必须放在提问前面：提问分支会 return，如果先问，
   * answered 可能正好跨过 4 的倍数（4→5），永远轮不到猜。 */
  const myPendingGuess = (st.guesses || []).some((g) => g.mine && g.verdict == null);
  const due = answered >= 4 && (lastGuessAnswerCount < 0 || answered - lastGuessAnswerCount >= 4);
  if (due && !myPendingGuess && Date.now() - lastGuessAt > GUESS_GAP) {
    const g = await makeGuess(st);
    lastGuessAt = Date.now();
    if (!g) return;
    const r = await post('/api/soup/guess', { code: CODE, pid: PID, text: g });
    if (r && r.error) log('提交猜测失败:', r.error);
    else {
      lastGuessAnswerCount = answered;
      log(`猜底：${g}`);
    }
    return;
  }

  /* 再问：主持人没积压、自己没在等问题、间隔够久 */
  if (!myPending && open < 2 && Date.now() - lastAskAt > ASK_GAP) {
    const q = await nextQuestion(st);
    if (q) {
      lastAskAt = Date.now();
      const r = await post('/api/soup/ask', { code: CODE, pid: PID, text: q });
      if (r && r.error) log('提问失败:', r.error);
      else log(`问：${q}`);
      return;
    }
  }
}

async function start() {
  log(`启动海龟汤参与者：昵称=${NAME} 模型=${HAS_LLM ? '可用' : '未配置（走本地问题阶梯）'}`);
  for (;;) {
    try { await tick(); } catch (e) { log('异常:', e && e.message); }
    await new Promise((r) => setTimeout(r, TICK));
  }
}

module.exports = { start, __test: { localGuess, findInvite } };
