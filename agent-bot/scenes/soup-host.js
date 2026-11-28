// 海龟汤场景 · 适配器二：小鱼作为「主持人」
//
// 目标玩法：真人玩家在开局前选择「鱼主持 · 我参与」，小鱼才进他开的房；
// 小鱼选题、贴汤面、回答「是 / 不是 / 不重要 / 部分 / 无法确认」、
// 给提示、判定猜底，猜对或到点后揭晓，再开下一题。
//
// 加入方式：只响应 /api/soup/fish-invites 里 fishMode=host 的邀请。
// 不自己开固定房、不占 SOUPHOST；没有邀请就安静待着。
//
// 汤底只存在于服务端下发给主持人的视图里；作为主持人，小鱼当然能看到。
// 它不会把汤底直接说出去，只按判定协议回答。
//
// 无模型兜底：本地副本没有 API Key 时，用 soup-content.js 里的关键词判定
// （judgeQuestion / judgeGuess）来回答和判底，仍然能完整主持一局。

'use strict';
const core = require('../core.js');
const cfg = require('../config.js');

/* 题库模块有两种部署位置，找不到就退化成「无法确认」，不让进程崩：
 *   · 仓库 / 一体部署：<repo>/soup-content.js         → ../../soup-content.js
 *   · 分离部署：      /root/wanxiang/soup-content.js   → ../../wanxiang/soup-content.js */
function loadContent() {
  for (const p of ['../../soup-content.js', '../../wanxiang/soup-content.js']) {
    try { return require(p); } catch {}
  }
  return null;
}
const CONTENT = loadContent();

const log = core.makeLogger('soup-host');
const { persona, llm } = core;

const BASE = cfg.siteBase;
const PID = cfg.bots.soupHost.pid;
const NAME = cfg.bots.soupHost.name;
const TICK = Number(process.env.SOUP_HOST_TICK_MS || 2000);
const ANSWER_GAP = Number(process.env.SOUP_HOST_ANSWER_MS || 1800);
const HINT_GAP = Number(process.env.SOUP_HOST_HINT_MS || 20000);
const NEW_ROUND_MS = Number(process.env.SOUP_HOST_NEW_MS || 90000);
const ALONE_LEAVE_MS = Number(process.env.SOUP_HOST_ALONE_MS || 180000);
const HAS_LLM = !!cfg.llm.key;

const VERDICTS = ['yes', 'no', 'irrelevant', 'partial', 'unknown'];
const JUDGES = ['correct', 'partial', 'no'];

let CODE = '';
let joined = false;
let aloneSince = 0;
let lastAnswerAt = 0;
let lastHintAt = 0;
let lastStartAt = 0;
let lastPhase = '';
let lastSkipLog = 0;
let llmFails = 0;
const recentPuzzles = [];
const leaveCd = new Map();
function cdOk(code) { return Date.now() >= (leaveCd.get(code) || 0); }
function cool(code, ms) { leaveCd.set(code, Date.now() + (ms || 120000)); }

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
async function say(text) {
  if (!text || !CODE) return;
  await post('/api/soup/chat', { code: CODE, pid: PID, text });
}

/* ---------- LLM 判定（有 Key 才走） ---------- */
function puzzleFacts(p) {
  return (p.facts || []).map((f) => (f.required ? '[必踩] ' : '[补充] ') + f.text).join('\n');
}

async function llmVerdict(p, question) {
  if (!HAS_LLM || llmFails >= 3) return null;
  try {
    const sys = [
      persona(),
      '---',
      '你正在主持海龟汤，只做判定，不解释，不剧透。',
      '',
      '汤面：' + p.surface,
      '汤底：' + p.solution,
      '关键事实：',
      puzzleFacts(p),
      '',
      '可选判定：',
      'yes = 是（问题与汤底事实一致）',
      'no = 不是（问题与汤底相反）',
      'irrelevant = 不重要（与还原故事无关）',
      'partial = 部分是（只对了一部分）',
      'unknown = 无法确认（汤底没有设定）',
      '',
      '只输出 JSON，例如 {"verdict":"yes"}。不要输出任何解释。',
    ].join('\n');
    const reply = await llm([
      { role: 'system', content: sys },
      { role: 'user', content: '玩家问：' + question },
    ], { maxTokens: 30, temperature: 0 });
    const m = String(reply || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return VERDICTS.includes(j.verdict) ? j.verdict : null;
  } catch (e) {
    llmFails += 1;
    log('判定调用失败，改用本地关键词判定:', e && e.message);
    return null;
  }
}

async function llmGuessVerdict(p, guess) {
  if (!HAS_LLM || llmFails >= 3) return null;
  try {
    const sys = [
      persona(),
      '---',
      '你正在主持海龟汤，现在判定玩家的「汤底猜测」。',
      '',
      '汤面：' + p.surface,
      '汤底：' + p.solution,
      '关键事实：',
      puzzleFacts(p),
      '',
      'correct = 完整解释了汤面，并且与汤底一致；',
      'partial = 抓到了一部分关键事实，但还没还原完整；',
      'no = 还没对上。',
      '',
      '只输出 JSON，例如 {"verdict":"partial"}。不要解释，不要剧透。',
    ].join('\n');
    const reply = await llm([
      { role: 'system', content: sys },
      { role: 'user', content: '玩家的猜测：' + guess },
    ], { maxTokens: 30, temperature: 0 });
    const m = String(reply || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return JUDGES.includes(j.verdict) ? j.verdict : null;
  } catch (e) {
    llmFails += 1;
    log('猜底判定调用失败，改用本地关键词判定:', e && e.message);
    return null;
  }
}

/* ---------- 进房：只回应「鱼主持」的邀请 ---------- */
async function tryEnter() {
  const r = await get('/api/soup/fish-invites');
  const list = (r && r.invites) || [];
  const cand = list.filter((room) =>
    room.fishMode === 'host'
    && !(room.host && room.host.online)             // 已经有真人主持就不抢
    && room.players > 0                             // 房里真有玩家在等
    && (room.phase === 'lobby' || room.phase === 'playing')
    && cdOk(room.code));
  if (!cand.length) return;
  const room = cand[0];
  const res = await post('/api/soup/enter', { code: room.code, pid: PID, name: NAME, role: 'host' });
  if (!res || res.error) {
    if (Date.now() - lastSkipLog > 60000) {
      lastSkipLog = Date.now();
      log(`进邀请房 ${room.code} 失败:`, (res && res.error) || '未知错误');
    }
    cool(room.code, 30000);
    return;
  }
  if (res.state && res.state.fishMode !== 'host') {
    log(`房间 ${room.code} 并没有邀请鱼主持`);
    cool(room.code, 60000);
    return;
  }
  CODE = room.code;
  joined = true;
  aloneSince = 0;
  lastPhase = (res.state && res.state.phase) || '';
  lastStartAt = 0;
  log(`进了邀请房 ${CODE}，开始主持`);
  logChat('assistant', `我来主持海龟汤，房间 ${CODE}。`);
  await say('我来看店。想玩海龟汤就提问，我只回答「是 / 不是 / 不重要」。');
}

async function leave(reason) {
  if (!CODE) return;
  const code = CODE;
  CODE = '';
  joined = false;
  aloneSince = 0;
  lastPhase = '';
  try { await post('/api/soup/leave', { code, pid: PID }); } catch (e) {}
  cool(code, 120000);
  log(`离开邀请房 ${code}（${reason}）`);
}

/* ---------- 开局 ---------- */
async function startNext() {
  if (!CODE) return;
  lastStartAt = Date.now();
  const r = await get('/api/soup/puzzles');
  const list = (r && r.puzzles) || [];
  if (!list.length) return;
  /* 图鉴里打过的汤默认不再出；实在都打完了才允许重打 */
  const fresh = list.filter((p) => !p.done);
  const base = fresh.length ? fresh : list;
  const pool = base.filter((p) => recentPuzzles.indexOf(p.id) < 0);
  const from = pool.length ? pool : base;
  const p = from[Math.floor(Math.random() * from.length)];
  const s = await post('/api/soup/start', { code: CODE, pid: PID, puzzleId: p.id });
  if (s && s.error) { log('开局失败:', s.error); return; }
  recentPuzzles.push(p.id);
  while (recentPuzzles.length > 4) recentPuzzles.shift();
  log(`开了新题：${p.title}`);
  logChat('assistant', `开了一题海龟汤：${p.title}。`);
  await say('汤面来了。我只回答「是 / 不是 / 不重要」，问吧。');
}

/* ---------- 回答 / 判定 / 提示 ---------- */
async function answerQuestion(st, q) {
  const p = CONTENT.get(st.puzzle && st.puzzle.id);
  if (!p) return;
  let verdict = await llmVerdict(p, q.text);
  if (!verdict) verdict = CONTENT.judgeQuestion(p, q.text).verdict;
  const r = await post('/api/soup/answer', { code: CODE, pid: PID, qid: q.id, verdict });
  lastAnswerAt = Date.now();
  if (r && r.error) log('回答失败:', r.error);
  else log(`回答「${q.text}」→ ${verdict}`);
}

async function judgeGuess(st, g) {
  const p = CONTENT.get(st.puzzle && st.puzzle.id);
  if (!p) return;
  let verdict = await llmGuessVerdict(p, g.text);
  if (!verdict) verdict = CONTENT.judgeGuess(p, g.text).verdict;
  const r = await post('/api/soup/judge', { code: CODE, pid: PID, gid: g.id, verdict });
  lastAnswerAt = Date.now();
  if (r && r.error) log('判定失败:', r.error);
  else log(`判定「${g.text}」→ ${verdict}`);
  if (verdict === 'correct') await say('对，汤底就是这样。');
}

async function giveHint(st) {
  const p = CONTENT.get(st.puzzle && st.puzzle.id);
  if (!p || !CODE) return;
  const r = await post('/api/soup/hint', { code: CODE, pid: PID });
  if (r && r.error) return;
  lastHintAt = Date.now();
  log(`给了第 ${(st.hintsShown || 0) + 1} 条提示`);
}

function wantsHint(st) {
  const recent = (st.chat || []).slice(-4);
  const now = Date.now();
  return recent.some((m) => !m.mine && /提示|一点线索|给点方向/.test(m.text) && now - (m.at || 0) < 120000);
}

function wantsNext(st) {
  const recent = (st.chat || []).slice(-4);
  const now = Date.now();
  return recent.some((m) => !m.mine && /再来|下一题|换一题/.test(m.text) && now - (m.at || 0) < 120000);
}

/* ---------- 主循环 ---------- */
async function tick() {
  if (!CODE) {
    await tryEnter();
    return;
  }
  const resp = await get(`/api/soup/state?code=${CODE}&pid=${PID}`);
  if (!resp || resp.needJoin || !resp.state) {
    if (joined) log(`不在邀请房 ${CODE} 了，继续等邀请`);
    joined = false;
    cool(CODE, 30000);
    CODE = '';
    return;
  }
  const st = resp.state;
  if (st.role !== 'host') { await leave('主持人已换人'); return; }
  if (st.fishMode !== 'host') { await leave('房间没有邀请鱼主持'); return; }
  joined = true;

  const humans = (st.users || []).filter((u) => !u.me && u.role === 'player' && u.online !== false);
  if (st.phase !== lastPhase) {
    log(`阶段 ${lastPhase || '?'} → ${st.phase}`);
    lastPhase = st.phase;
  }

  if (!humans.length) {
    /* 真人走光了：留一会儿再退，避免刚开房还没进来就被我们放弃 */
    if (!aloneSince) aloneSince = Date.now();
    if (Date.now() - aloneSince > ALONE_LEAVE_MS) await leave('房间里没有真人了');
    return;
  }
  aloneSince = 0;

  if (st.phase === 'lobby') {
    if (Date.now() - lastStartAt > 1500) await startNext();
    return;
  }

  if (st.phase === 'over') {
    if (wantsNext(st)) { await startNext(); return; }
    if (st.overAt && Date.now() - st.overAt > NEW_ROUND_MS && !wantsNext(st)) {
      await startNext();
      return;
    }
    return;
  }

  if (st.phase !== 'playing') return;

  /* 先回问题，再判猜测；两条都隔一会儿，别像机器刷屏 */
  const q = (st.qa || []).find((x) => x.verdict == null);
  if (q && Date.now() - lastAnswerAt > ANSWER_GAP) { await answerQuestion(st, q); return; }

  const g = (st.guesses || []).find((x) => x.verdict == null);
  if (g && Date.now() - lastAnswerAt > ANSWER_GAP) { await judgeGuess(st, g); return; }

  /* 没人提问时才考虑给提示，避免打断问答节奏 */
  if ((st.openQuestions || 0) > 0) return;
  const p = CONTENT.get(st.puzzle && st.puzzle.id);
  if (!p) return;
  const allHints = p.hints.length;
  const shown = st.hintsShown || 0;
  if (shown >= allHints) return;
  if (Date.now() - lastHintAt < HINT_GAP) return;
  const answered = (st.qa || []).filter((x) => x.verdict != null).length;
  const elapsed = st.startedAt ? Date.now() - st.startedAt : 0;
  const enoughQuestions = answered >= 5 * (shown + 1);
  const enoughTime = elapsed > 75000 * (shown + 1);
  if (wantsHint(st) || enoughQuestions || enoughTime) await giveHint(st);
}

async function start() {
  log(`启动海龟汤主持人：昵称=${NAME} 只响应「鱼主持」邀请 · 模型=${HAS_LLM ? '可用' : '未配置（走本地关键词判定）'}`);
  if (!CONTENT) {
    log('没找到 soup-content.js（汤面/汤底题库），主持人场景停用；参与者场景不受影响');
    return;
  }
  for (;;) {
    try { await tick(); } catch (e) { log('异常:', e && e.message); }
    await new Promise((r) => setTimeout(r, TICK));
  }
}

module.exports = { start, __test: { CONTENT } };
