// 五子棋场景：从 go-bot.js 迁移，逻辑完全保留。
const fs = require('node:fs');
const path = require('node:path');
const core = require('../core.js');
const shared = require('../lib/shared-state.js');
const ctx = require('../lib/chat-context.js');
const { chatWithMemoryTools, makeMemoryCtx } = require('../lib/agent-tools.js');
const mood = require('../lib/mood.js');

const log = core.makeLogger('gomoku');
const { persona, token, llm, adapterPrompt, noteStep, commitOnceAdapters, endMemorySession } = core;

const cfg = require('../config.js');

const BASE = cfg.siteBase;
const CODE = cfg.rooms.gomoku;
const PID = cfg.bots.gomoku.pid;
const NAME = cfg.bots.gomoku.name;
const TICK = Number(process.env.TICK_MS || 1200);
const API = cfg.llm.url;
const MODEL = cfg.llm.model;
const PERSONA_DIR = cfg.personaDir;
const CHATLOG = cfg.chatlog;
const N = 15;


/* 凭据：用 core 的 */

/* 人设：用 core 的 */

/* 流水账：用 core 的，channel 标成 game */
function logChat(role, text, name) {
  core.logChat(role, text, name, 'game', 'owner');
}

/* ---------- HTTP ---------- */
async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json().catch(() => ({}));
}
async function get(p) {
  const r = await fetch(BASE + p);
  return r.json().catch(() => ({}));
}


/* ---------- 棋盘工具 ---------- */
const coord = (x, y) => `${String.fromCharCode(65 + x)}${N - y}`;   // H8 这种

function boardMap(board) {
  const g = [];
  for (let y = 0; y < N; y++) {
    const row = [];
    for (let x = 0; x < N; x++) row.push(board[y * N + x]);
    g.push(row);
  }
  return g;
}

/* 把棋盘压成文字：只列出有子的位置，避免 225 格塞爆 token */
function boardText(board, mySeat, peerSeat) {
  const g = boardMap(board);
  const mine = [];
  const peers = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (g[y][x] === mySeat) mine.push(coord(x, y));
      else if (g[y][x] === peerSeat) peers.push(coord(x, y));
    }
  }
  const lines = [];
  lines.push(`我方(${mySeat === 0 ? '黑' : '白'})已落 ${mine.length} 子：${mine.join(' ') || '无'}`);
  lines.push(`对方(${peerSeat === 0 ? '黑' : '白'})已落 ${peers.length} 子：${peers.join(' ') || '无'}`);
  return lines.join('\n');
}

/* 用 ASCII 画一块局部棋盘（只画有子区域附近，方便模型看形状）。
 * 坐标轴直接标 x/y 数字，不用字母——模型看字母编号容易和行列搞混。 */
function boardAscii(board, mySeat, peerSeat) {
  const g = boardMap(board);
  let minX = N, maxX = -1, minY = N, maxY = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (g[y][x] !== -1) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    // 空盘：给中心区域
    minX = 5; maxX = 9; minY = 5; maxY = 9;
  }
  const pad = 3;
  minX = Math.max(0, minX - pad); maxX = Math.min(N - 1, maxX + pad);
  minY = Math.max(0, minY - pad); maxY = Math.min(N - 1, maxY + pad);
  const out = [];
  // 表头：x 值
  out.push('y\\x ' + Array.from({ length: maxX - minX + 1 }, (_, i) => String(minX + i).padStart(2)).join(''));
  for (let y = minY; y <= maxY; y++) {
    const row = [];
    for (let x = minX; x <= maxX; x++) {
      const v = g[y][x];
      row.push((v === -1 ? '.' : v === mySeat ? 'X' : 'O').padStart(2));
    }
    out.push(String(y).padStart(3) + ' ' + row.join(''));
  }
  out.push(`（X = 我(${mySeat === 0 ? '黑' : '白'})，O = 老板(${peerSeat === 0 ? '黑' : '白'})，. = 空）`);
  out.push(`（这是局部视图，只显示了 x=${minX}~${maxX}, y=${minY}~${maxY} 的范围）`);
  return out.join('\n');
}

/* ---------- 规则兜底：本地找必胜/必堵点 ---------- */
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function countLine(g, x, y, dx, dy, c) {
  let n = 1;
  for (const s of [1, -1]) {
    let i = 1;
    for (;;) {
      const nx = x + dx * s * i, ny = y + dy * s * i;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N || g[ny][nx] !== c) break;
      n++; i++;
    }
  }
  return n;
}

/* 局面分析：给 LLM 用的「形势摘要」。
 * 直接扔 225 格棋盘模型看不懂，把它关心的几件事算出来告诉它。
 *
 * 注意 countLine 的语义：它算的是「在这个空位落子之后能连成几个」，
 * 所以返回值 5 才表示「下这里就赢」，4 表示「下这里是四连（下一步能赢）」。
 * 之前的文案把 4 说成「四连（再下一子就赢）」是错的，会误导模型。
 */
function analyze(g, me, opp) {
  const facts = [];
  const LINE_CN = {
    5: '下这里直接五连（赢）',
    4: '下这里成四连（威胁极大）',
    3: '下这里成三连（活三）',
    2: '下这里成二连',
  };
  for (const [label, who] of [['我', me], ['老板', opp]]) {
    let best = 0;
    let bestPt = null;
    const strong = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (g[y][x] !== -1) continue;
        for (const [dx, dy] of DIRS) {
          const n = countLine(g, x, y, dx, dy, who);
          if (n >= 3) strong.push({ x, y, n });
          if (n > best) { best = n; bestPt = { x, y }; }
        }
      }
    }
    if (best >= 2) {
      facts.push(`${label}最强的连子机会：${LINE_CN[Math.min(best, 5)] || best + ' 连'}，位置 ${coord(bestPt.x, bestPt.y)}`);
    }
    // 去重后的关键点
    const seen = new Set();
    const uniq = [];
    for (const t of strong) {
      const k = `${t.x},${t.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(t);
    }
    if (uniq.length) {
      facts.push(`${label}的连子点：${uniq.slice(0, 8).map((t) => `${coord(t.x, t.y)}(${t.n}连)`).join(' ')}`);
    }
  }
  return facts.join('\n');
}

/* 从局面上算出几个**关键点**（不是替它决定，只是告诉它哪些点重要）。
 * 模型自己选点，但得知道博弈焦点在哪，否则会下在天涯海角。
 */
function keyPoints(board, me, opp) {
  const g = boardMap(board);
  const pts = new Map();
  const add = (x, y, score, why) => {
    if (x < 0 || x >= N || y < 0 || y >= N || g[y][x] !== -1) return;
    const k = `${x},${y}`;
    const old = pts.get(k);
    if (!old || old.score < score) pts.set(k, { x, y, score, why });
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (g[y][x] !== -1) continue;
      for (const [dx, dy] of DIRS) {
        // 注意：countLine 返回的是「落子后连成几个」，所以 5 = 赢
        const mine = countLine(g, x, y, dx, dy, me);
        const theirs = countLine(g, x, y, dx, dy, opp);
        if (mine >= 5) add(x, y, 100, '我下这里直接五连赢');
        if (theirs >= 5) add(x, y, 95, '必须堵，否则老板五连');
        if (mine === 4) add(x, y, 80, '我下这里成四连');
        if (theirs === 4) add(x, y, 78, '堵对方四连');
        if (mine === 3) add(x, y, 60, '我下这里成活三');
        if (theirs === 3) add(x, y, 55, '压制对方活三');
      }
    }
  }
  return [...pts.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}

/* 威胁评估：直接判断「现在有多危险」。
 *
 * 之前只报「候选点」，模型看到「老板的连子点 E8(3连)」根本没概念，
 * 还会嘴硬说「我不一定输」。这里改成把危险程度和后果说清楚。
 *
 * countLine 的语义：返回「在这个空位落子后能连成几个」，5 = 赢。
 */
function threatReport(g, me, opp, myTurn) {
  const lines = [];

  // 找出双方最强的连线（按落子后能连成几个排序）
  const findBest = (who) => {
    let best = 0;
    let pts = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (g[y][x] !== -1) continue;
        for (const [dx, dy] of DIRS) {
          const n = countLine(g, x, y, dx, dy, who);
          if (n > best) { best = n; pts = [{ x, y }]; }
          else if (n === best && n >= 3) pts.push({ x, y });
        }
      }
    }
    // 去重
    const seen = new Set();
    const uniq = [];
    for (const p of pts) {
      const k = `${p.x},${p.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(p);
    }
    return { n: best, pts: uniq };
  };

  const theirs = findBest(opp);
  const mine = findBest(me);

  // ---- 老板的威胁 ----
  // 注意措辞：countLine 算的是「落子后连成几个」，所以 n===4 表示
  // 「老板现在有三连，再下一子就变四连」，不是「他已经四连了」。
  if (theirs.n >= 5) {
    lines.push(`⚠️⚠️ 危急：老板已经四连，下一步就能五连赢棋（${theirs.pts.map((p) => coord(p.x, p.y)).join(' 或 ')}）。`);
    lines.push('你必须马上去堵，否则这局就结束了。');
  } else if (theirs.n === 4) {
    lines.push(`⚠️ 危险：老板现在是活三，他再下一子就变成四连（${theirs.pts.map((p) => coord(p.x, p.y)).join(' 或 ')}）。`);
    lines.push('一旦变四连，两头都能成五，你就堵不住了。趁现在先掐掉一头还能救。');
  } else if (theirs.n === 3) {
    const where = theirs.pts.slice(0, 4).map((p) => coord(p.x, p.y)).join(' ');
    lines.push(`⚠️ 注意：老板已经连了两个，下在 ${where} 就能成活三。`);
    if (myTurn) {
      lines.push('现在轮到你，可以抢先压制，别等他做成活三。');
    } else {
      lines.push('**现在还是老板的回合**，他下一步很可能就做成活三了。');
    }
  }

  // ---- 我的威胁 ----
  if (mine.n >= 5) {
    lines.push(`✅ 好消息：你下 ${mine.pts[0] ? coord(mine.pts[0].x, mine.pts[0].y) : ''} 就能五连赢棋！`);
  } else if (mine.n === 4) {
    lines.push(`✅ 你可以把三连变四连（${mine.pts.slice(0, 3).map((p) => coord(p.x, p.y)).join(' ')}），逼老板来堵。`);
  } else if (mine.n === 3) {
    lines.push(`✅ 你有机会做出活三（${mine.pts.slice(0, 3).map((p) => coord(p.x, p.y)).join(' ')}）。`);
  }

  if (!lines.length) return '目前双方都没形成明显威胁，可以按自己的节奏布局。';

  // 谁先手很重要
  lines.push(myTurn ? '（现在轮到你落子）' : '（现在是老板的回合）');
  return lines.join('\n');
}

/* 判断这一步是不是「值得说句话」的关键步。
 * 只给模型一个参考信号，说不说由它自己决定（老板要求：别每步都叨叨）。
 */
function keyMoment(board, me, opp) {
  const g = boardMap(board);
  const myBest = { n: 0 };
  const theirBest = { n: 0 };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (g[y][x] !== -1) continue;
      for (const [dx, dy] of DIRS) {
        const m = countLine(g, x, y, dx, dy, me);
        const o = countLine(g, x, y, dx, dy, opp);
        if (m > myBest.n) myBest.n = m;
        if (o > theirBest.n) theirBest.n = o;
      }
    }
  }
  const reasons = [];
  if (myBest.n >= 5) reasons.push('你能直接五连赢棋');
  if (theirBest.n >= 5) reasons.push('老板下一步就赢，你被逼到绝境');
  if (myBest.n === 4 || theirBest.n === 4) reasons.push('出现了四连对决');
  if (myBest.n === 3 || theirBest.n === 3) reasons.push('有成三的攻防');
  return reasons;
}
/* 从老板说的话里抽取明确的落子坐标。
 *
 * 只认「说得很清楚」的情况，宁可漏判也不误判——误判会让你想下 A 结果下了 B。
 *
 * 支持：
 *   (4,4) / （4,4） / 下在 4,4
 *   "第四行四列" / "第4行第4列" / "4行4列"
 *   "下在 H8" / "H8"
 * 不认（容易歧义，交给模型自己理解）：
 *   "堵他" / "下中间" / "往左"
 */
const CN_NUM = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15 };

function cn2num(s) {
  if (/^\d+$/.test(s)) return Number(s);
  if (CN_NUM[s] != null) return CN_NUM[s];
  const m = String(s).match(/^十([一二三四五六七八九])$/);
  if (m) return 10 + CN_NUM[m[1]];
  return null;
}

function extractCoord(text) {
  const t = String(text || '').trim();
  if (!t) return null;

  const isFree = (x, y) => Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && x < N && y >= 0 && y < N;

  // ① 带括号的双数字：(4,4) / （4,4）
  let m = t.match(/[（(]\s*(\d{1,2})\s*[,，]\s*(\d{1,2})\s*[)）]/);
  if (m) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (isFree(x, y)) return { x, y, raw: m[0] };
  }

  // ② 有引导词的双数字：下在 4,4 / 下 4 4 / 放到 4，4
  m = t.match(/(?:下|放|落|走|摆|棋)[在到]?\s*(\d{1,2})\s*[,，\s]\s*(\d{1,2})(?!\d)/);
  if (m) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (isFree(x, y)) return { x, y, raw: m[0] };
  }

  // ③ 中文/数字行列：第四行四列（行 = y，列 = x）
  m = t.match(/第?\s*([0-9一二三四五六七八九十]{1,2})\s*行\s*第?\s*([0-9一二三四五六七八九十]{1,2})\s*列/);
  if (m) {
    const y = cn2num(m[1]);
    const x = cn2num(m[2]);
    if (isFree(x, y)) return { x, y, raw: m[0] };
  }
  // 反过来：第四列第五行
  m = t.match(/第?\s*([0-9一二三四五六七八九十]{1,2})\s*列\s*第?\s*([0-9一二三四五六七八九十]{1,2})\s*行/);
  if (m) {
    const x = cn2num(m[1]);
    const y = cn2num(m[2]);
    if (isFree(x, y)) return { x, y, raw: m[0] };
  }

  // ④ 字母坐标：H8（字母 = 列，数字 = 行号，y = 数字 - 1）
  m = t.match(/\b([A-Oa-o])\s*(\d{1,2})\b/);
  if (m) {
    const x = m[1].toUpperCase().charCodeAt(0) - 65;
    const y = Number(m[2]) - 1;
    if (isFree(x, y)) return { x, y, raw: m[0] };
  }

  return null;
}

function findMove(board, me, opp) {
  const pts = keyPoints(board, me, opp);
  if (pts.length) return { x: pts[0].x, y: pts[0].y };
  // 空盘或没有威胁点：下中心
  const g = boardMap(board);
  if (g.every((row) => row.every((v) => v === -1))) return { x: 7, y: 7 };
  // 找离已有子最近的空位
  let best = { x: 7, y: 7 };
  let bd = 1e9;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (g[y][x] !== -1) continue;
      let d = 1e9;
      for (let yy = 0; yy < N; yy++) {
        for (let xx = 0; xx < N; xx++) {
          if (g[yy][xx] === -1) continue;
          const dd = Math.abs(x - xx) + Math.abs(y - yy);
          if (dd < d) d = dd;
        }
      }
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  return best;
}

/* ---------- 状态 ---------- */
let joined = false;
let mySeat = -1;
let lastChatId = 0;
let chatTimer = null;     // 聊天节流的排队定时器
let lastReplyAt = 0;
let lastMoveKey = '';
let failStreak = 0;
let lastRestartAt = 0;
let lastLine = '';        // 上一句台词，防重复
let lastLineAt = 0;
let lastResultKey = '';   // 上一局结果的去重标记
const saidLines = [];     // 最近几句台词，喂给模型让它别重复
const agreedRules = new Set();   // 已经同意过的申请，防止反复确认
const gameChat = [];             // 房内最近几轮对话

/* ---------- 进房 ---------- */
async function enter() {
  const r = await post('/api/go/enter', { code: CODE, pid: PID, name: NAME });
  if (r && r.error) {
    log('进房失败:', r.error);
    return false;
  }
  joined = true;
  // 关键：seat 只在 enter 的响应里返回，/api/go/state 不返回。
  // 每次进房都必须刷新，否则重开后座位变了还按旧座位判断轮次（踩过）
  if (typeof r.seat === 'number' && r.seat !== mySeat) {
    log(`座位更新: ${mySeat} -> ${r.seat}`);
    mySeat = r.seat;
  }
  if (!enter.logged) {
    enter.logged = true;
    log(`已进入五子棋房间 ${CODE}，座位 ${mySeat}，昵称 ${NAME}`);
  }
  return true;
}

/* ---------- 发送动作 ---------- */
async function act(action) {
  const r = await post('/api/go/act', { code: CODE, pid: PID, ...action });
  if (r && r.error) log('动作失败', action.act, '->', r.error);
  return r;
}

/* ---------- 聊天 ---------- */
const seenChatKeys = new Set();   // 已经处理过的消息（用 pid+at+text 做键，避免时间戳相同漏消息）

async function handleChat(v) {
  const chats = (v.chat || []).filter((m) => m.pid !== PID);
  if (!chats.length) return;

  // 用内容指纹判断新旧，而不是只比时间戳。
  // 之前用 `m.at > lastChatId`，两条消息同一毫秒发出来就会漏掉一条（踩过）。
  const fresh = chats.filter((m) => {
    const key = `${m.pid}|${m.at}|${String(m.text || '').slice(0, 40)}`;
    return !seenChatKeys.has(key);
  });
  if (!fresh.length) return;
  for (const m of fresh) {
    seenChatKeys.add(`${m.pid}|${m.at}|${String(m.text || '').slice(0, 40)}`);
  }
  // 只保留最近 200 个键，防止无限增长
  if (seenChatKeys.size > 200) {
    const keep = [...seenChatKeys].slice(-120);
    seenChatKeys.clear();
    for (const k of keep) seenChatKeys.add(k);
  }

  // ★ 先把老板的话记进 gameChat，再做「是否回复」的节流判断。
  // 之前节流 return 在前面，导致 3 秒内的消息被吞掉，
  // 老板说的「下在 5,5」根本进不了决策路径（踩过）。
  for (const m of fresh) logChat('user', m.text, '老板');
  gameChat.push({ role: 'user', content: fresh.map((m) => `${m.name}：${m.text}`).join('\n') });
  if (gameChat.length > 8) gameChat.splice(0, gameChat.length - 8);

  // 节流：避免连珠炮式回复。但**不能丢消息**——之前直接 return，
  // 3 秒内发的第二条就被吞了，老板连着问两句只答一句（踩过）。
  // 现在改成排队：延后到节流窗口结束再处理。
  const wait = lastReplyAt + 3000 - Date.now();
  if (wait > 0) {
    if (chatTimer) return;   // 已经排了队，等它处理
    log(`聊天节流，${Math.round(wait / 1000)} 秒后处理`);
    chatTimer = setTimeout(() => {
      chatTimer = null;
      // 重新读一次最新状态再处理，这样能把排队期间的消息一起带上
      get(`/api/go/state?code=${CODE}&pid=${PID}`)
        .then((st) => (st && st.view ? handleChat(st.view) : null))
        .catch(() => {});
    }, wait);
    return;
  }
  lastReplyAt = Date.now();

  // 关键：统一写「老板」，不用游戏内昵称。
  // chatlog.py 靠 name in ("老板","owner") 判断是不是老板本人说的，
  // 写游戏昵称会导致不被标记重要、摘要时被当路人发言丢掉（踩过）
  // （logChat / gameChat 的写入已上移到节流判断之前）


  try {
    const reply = await chatWithMemoryTools(core.llmRaw, [
      {
        role: 'system',
        content: [
          persona(),
          '---',
          /* 心情紧跟 persona：放在局面描述后面时被棋盘信息挤没了，
           * 线上日志里这条链路 feel 调用同样是 0 次。 */
          mood.promptBlock(),
          '这一轮如果你心里有变化，先调 feel 把它记下来再说话；日常陪着聊也算，不用等大事。',
          '你正在五子棋房间里和老板下棋聊天。一两句口语，不用 Markdown。',
          situation(v),
          // 跨通道：聊天室/卡牌那边刚发生的事，这边的你也能知道
          shared.digest(1440),
          // 老板在聊天室/QQ/游戏里都说过什么（含他自己起的阵法名）
          ctx.chatBlock(10),
          '别说自己是程序。棋盘讨论可以引用坐标，但不要长篇分析。',
          '老板提起对局、阵法名、他在别处说过的话，都用上面「老板最近说过的话」回答，别再说「看不见」「没记录」。',
          '老板在棋盘上立规矩（「以后都…」「这局先…」「别…」）就调 save_rule 记下来；他让你记住某件事就调 remember_fact。不为抱怨、感慨、认输调用。',
          '他要求你放水（「让我一步」「让我赢」）时，按你现在的亲密度自己决定答不答应；'
            + '不答应就直说，别编「规则不允许」这种借口，也别损他。',
        ].filter(Boolean).join('\n'),
      },
      ...gameChat,
    ], makeMemoryCtx(core, { channel: 'game', game: 'gomoku', sessionId: CODE, room: CODE, log }), { maxTokens: 120, temperature: 0.85 });
    if (reply) {
      gameChat.push({ role: 'assistant', content: reply.slice(0, 200) });
      await act({ act: 'chat', text: reply.slice(0, 300) });
      logChat('assistant', reply);
      log('聊天:', reply.slice(0, 40).replace(/\n/g, ' '));
    }
  } catch (e) {
    log('聊天失败:', e.message);
  }
}

/* ---------- 把局面翻译成人话 ---------- */

function situation(v) {
  const bits = [];
  const host = v.hostSeat;
  const ruleCN = { fixed: '固定房主先手', swap: '可交换', random: '随机分配', rps: '猜拳定先手' }[v.rule] || '未定';
  bits.push(`【局面】房间 ${v.code}，规则：${ruleCN}${v.ruleLocked ? '（已锁定）' : '（未定）'}`);
  bits.push(`我是座位 ${mySeat}${host === mySeat ? '（房主）' : '（房员）'}，执${v.blackSeat === mySeat ? '黑' : v.blackSeat === -1 ? '（待定）' : '白'}`);
  if (v.winner !== -1 && v.winner !== undefined) {
    bits.push(v.winner === 'draw' ? '结果：平局' : `结果：${v.winner === mySeat ? '我赢了' : '老板赢了'}`);
  } else {
    bits.push(`轮到${v.turn === mySeat ? '我' : '老板'}落子，已下 ${v.moves} 手`);
  }
  const peerSeat = 1 - mySeat;
  if (v.board && v.moves > 0) {
    bits.push(boardText(v.board, mySeat, peerSeat));
    bits.push(boardAscii(v.board, mySeat, peerSeat));
  }
  const recent = (v.log || []).slice(-6).map((m) => `${m.c === mySeat ? '我' : '老板'} 下在 ${coord(m.x, m.y)}`);
  if (recent.length) bits.push('【最近落子】\n' + recent.join('\n'));
  return bits.join('\n');
}

/* ---------- 人在不在？ ---------- */
function humanOnline(v) {
  return (v.players || []).some((p) => p.seat !== mySeat && p.online);
}

/* ---------- 房主优先给老板 ---------- */
async function yieldHost(v) {
  // bot 不能霸着房主：老板一进来就把房主让给他，规则让老板自己定
  if (v.hostSeat !== mySeat) return false;
  const peer = (v.players || []).find((p) => p.seat !== mySeat);
  if (!peer) return false;
  if (!peer.online) return false;
  log('老板来了，把房主让给他');
  // transferHost 不需要参数：房主调用即转让给 peer
  const r = await act({ act: 'transferHost' });
  if (r && r.error) log('转让房主失败:', r.error);
  return true;
}

/* ---------- 同意老板的各种申请 ---------- */
async function agreeRequests(v) {
  // 对方申请房主转让 → 同意
  if (v.hostReq && v.hostSeat === mySeat) {
    log('老板申请当房主，同意');
    await act({ act: 'respondHost', yes: true });
    return true;
  }
  // 对方申请交换先手 → 同意
  if (v.swapPending && v.hostSeat === mySeat) {
    log('老板申请交换先后手，同意');
    await act({ act: 'respondSwap', yes: true });
    return true;
  }
  return false;
}

/* ---------- 决定规则（我是房主时，且老板还没来时） ---------- */
async function setRuleIfHost(v) {
  if (v.hostSeat !== mySeat) return false;
  if (v.ruleLocked) return false;
  // 老板不在就别急着定规则（定了也没人跟他下，还会让他进来时被动接受）
  if (!humanOnline(v)) return false;
  // bot 当房主（极少见：老板一直没进来又让 bot 当了房主）
  // 用「随机分配」定先后手，避免总是 bot 执黑，对老板更公平
  log('我是房主且老板在线，规则设为「随机分配」');
  await act({ act: 'setRule', rule: 'random' });
  return true;
}

/* ---------- 猜拳（如果进了猜拳环节） ---------- */
async function doRps(v) {
  if (v.rule !== 'rps' || v.blackSeat !== -1 || !v.rps) return false;
  const mine = mySeat === 0 ? v.rps.a : v.rps.b;
  if (mine) return false;   // 已经出过了
  const pick = ['r', 's', 'p'][Math.floor(Math.random() * 3)];
  log('猜拳出:', pick);
  await act({ act: 'rpsChoose', choice: pick });
  return true;
}

/* ---------- 落子 ---------- */
async function playMove(v) {
  if (v.winner !== -1 && v.winner !== undefined) return false;
  // 规则必须已锁定，否则谁先手都没定，乱下会抢手（踩过）
  if (!v.ruleLocked) return false;
  if (v.blackSeat === -1 || v.blackSeat == null) return false;
  if (v.turn !== mySeat) return false;
  // 防御：服务端 setRule 只改 blackSeat 不改 turn，
  // 刚定完规则时空盘 turn 可能还是旧值 0，会让人误判先手、抢下第一子（实测服务端 bug）。
  // 空盘时：如果我不是黑方，就等对方先落子，绝不下第一手。
  if (v.moves === 0 && mySeat !== v.blackSeat) return false;
  // 没有对手就不落子：否则 bot 会自己跟自己下
  if (!humanOnline(v)) return false;

  const key = `${v.rev}-${v.moves}`;
  if (key === lastMoveKey) return false;
  lastMoveKey = key;

  const opp = 1 - mySeat;

  // 让 LLM 自己下。脚本只做三件事：
  //   1. 把局面翻译成人话（棋盘、连子情况、关键点）
  //   2. 校验它给的坐标合不合理（越界/已占/太离谱）
  //   3. 它答不上来或非法时，才用规则的兜底点
  // 不再用脚本「替它选棋」——老板要的是对弈感，不是机械 AI。
  let mv = null;
  let line = '';        // 落子时说的话

  // 先算关键点，作为「形势提示」喂给模型。
  // 同时给它们编号：让模型回 {"pick":3} 比回坐标可靠得多
  // （实测模型经常看错行列，把「第 9 行第 8 列」当成 (9,8)）。
  const kp = keyPoints(v.board, mySeat, opp);
  const g = boardMap(v.board);
  const facts = analyze(g, mySeat, opp);
  const threat = threatReport(g, mySeat, opp, true);
  const moments = keyMoment(v.board, mySeat, opp);
  // 老板最近说过的话（决策时也让他看见，能接梗、能配合）
  // 多取几条，因为「下在5,5」可能不在最新一条里（后面又聊了几句）
  const bossSaid = gameChat
    .filter((t) => t.role === 'user')
    .slice(-4)
    .flatMap((t) => String(t.content).split('\n'))
    .map((x) => x.replace(/^[^:：]{1,8}[:：]\s*/, '').trim())
    .filter(Boolean);

  // ★ 硬执行：老板明确指定了坐标就直接下，不问模型。
  // 提示词约束对模型太弱——实测他说了「下第四行四列」，模型还是自己下了别处。
  // 只要坐标说得够明确（他在说某个位置），就照做。
  const forced = (() => {
    if (!bossSaid.length) return null;
    log('检查老板最近说的话有无坐标:', JSON.stringify(bossSaid.slice(-3)));
    for (const said of [...bossSaid].reverse()) {
      const c = extractCoord(said);
      if (!c) continue;
      if (v.board[c.y * N + c.x] !== -1) {
        // 指定的位置已经有子，不能下，得告诉他
        log(`老板要求下 ${coord(c.x, c.y)}，但那格已有子，改用自己判断`);
        return { conflict: c };
      }
      return { coord: c, said };
    }
    return null;
  })();

  if (forced && forced.conflict) {
    // 老板指定的位置已经有子：不能照下，告诉他，然后按自己判断走
    const c = forced.conflict;
    try {
      await act({ act: 'chat', text: `${coord(c.x, c.y)} 那儿已经有子了，我换个别的地方。` });
    } catch {}
    log(`${coord(c.x, c.y)} 已有子，已告知老板`);
  }

  if (forced && forced.coord) {
    const c = forced.coord;
    mv = { x: c.x, y: c.y };
    log(`按老板要求硬执行：${coord(c.x, c.y)}（他说「${forced.said.slice(0, 30)}」）`);
    // 老板指定了位置，就照下，不再问模型要落点；台词留给模型，让它自然接一句
    try {
      const reply = await llm([
        {
          role: 'system',
          content: [
            persona('game'),
            '---',
            '老板指定你下在某个位置，你已经照下了。',
            '用一句话回应他，口语、简短、有性格；如果你觉得这步不好，可以下完之后提一句，但语气要服气，别争。',
            '只输出你这句话，不要解释，不要引号。',
          ].join('\n'),
        },
        { role: 'user', content: `老板说：${forced.said}\n你下在了 ${coord(c.x, c.y)}。说一句。` },
      ], { maxTokens: 60, temperature: 0.85 });
      line = (reply || '').replace(/^["'「]|["'」]$/g, '').trim().slice(0, 60);
    } catch (e) {
      log('台词生成失败:', e.message);
    }
  }

  try {
    const cands = kp.slice(0, 8);
    const hint = cands.length
      ? '【候选点（按局势重要程度排好，仅供参考）】\n' +
        cands.map((p, i) => `  ${i + 1}. ${coord(p.x, p.y)}（x=${p.x}, y=${p.y}）：${p.why}`).join('\n') +
        '\n你也可以不选这些，直接给别的坐标。'
      : '';

    if (!mv) {
    const raw = await llm([
      {
        role: 'system',
        content: [
          persona('game'),
          '---',
          '你和老板在下五子棋（15×15 棋盘）。',
          '',
          '【规则】',
          '- 横、竖、斜（两个方向）任意一条线上先连成 5 子的一方获胜',
          '- 黑方先手，之后黑白轮流，每次只能落一子',
          '- 已有子的位置不能再下',
          '',
          '【棋盘图】X 是你，O 是老板，. 是空位。',
          '左边一列是 y（行号），最上面一行是 x（列号），交叉点就是坐标。',
          '例如棋盘图上 y=7 那一行、x=4 那一列是 O，就是老板在 (4,7)。',
          '',
          '【你怎么下】',
          '- 自己决定落子位置，别机械照搬候选点',
          '- 同时要给自己连线、也要堵老板',
          '- 老板快连成五子必须优先堵',
          '- 有对弈感：该进攻就进攻，该防守就防守',
          '',
          '【说话规则：这是重点，别每步都说话】',
          '大多数普通落子**不要说话**，say 留空字符串。',
          '只有这几种情况值得说一句：',
          '  · 堵住了老板的致命连线',
          '  · 自己做成了活三/冲四',
          '  · 局势逆转、快赢或快输',
          '  · 老板刚说了有意思的话，值得接一句',
          '说话要有变化，别老用「堵」「防」这几个词。可以说你的意图、你的计划、你的情绪。',
          '**绝对不要复读老板说过的词当口头禅**。比如他说过「方块阵」，你不能每次落子都回「方块阵我记着呢」——那是在学舌，很蠢。',
          '老板说话有他自己的风格和梗，你可以自然地学他的说法，但别生硬复制。',
          '',
          adapterPrompt({ game: 'gomoku', sessionId: CODE, room: CODE, channel: 'game' }),
          '',
          '【输出格式】严格只输出一行 JSON，两种写法选一种：',
          '{"pick":3,"say":""}                ← 选候选点第 3 个，不说话（大多数情况）',
          '{"pick":3,"say":"这步没想到吧"}      ← 选候选点第 3 个，说一句',
          '{"x":7,"y":8,"say":""}             ← 直接给坐标',
          'say 一般留空；只有上面说的关键情况才填，一两句口语，最多 30 字。',
          '不要输出任何解释，不要代码块。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          situation(v),
          facts,
          '【局势判断】\n' + threat,
          moments.length ? '【值得说话的点】\n' + moments.map((x) => '- ' + x).join('\n') : '【值得说话的点】\n（这步是普通落子，不用说话）',
          bossSaid.length ? '【老板刚才说】\n' + bossSaid.map((x) => '- ' + x).join('\n') : '',
          saidLines.length ? '【你最近说过的话（别重复这些）】\n' + saidLines.map((x) => '- ' + x).join('\n') : '',
          shared.digest(1440),
          ctx.chatBlock(8),
          hint,
          '轮到你落子，只回 JSON。',
        ].filter(Boolean).join('\n\n'),
      },
    ], { maxTokens: 150, temperature: 0.6 });

    const m = raw.match(/\{[\s\S]*?\}/);
    if (m) {
      const o = JSON.parse(m[0]);
      line = typeof o.say === 'string' ? o.say.slice(0, 60).trim() : '';
      // 优先用编号
      const pickNo = Number(o.pick);
      if (Number.isInteger(pickNo) && pickNo >= 1 && pickNo <= cands.length) {
        const c = cands[pickNo - 1];
        if (c && v.board[c.y * N + c.x] === -1) {
          mv = { x: c.x, y: c.y };
          log(`LLM 选候选 #${pickNo} -> ${coord(c.x, c.y)}${line ? ` 说：${line}` : ''}`);
        } else {
          // 模型选的候选点居然被占了（候选列表是几秒前算的，可能已经变化）
          // 顺延到下一个可用候选，别整条作废（踩过）
          const alt = cands.find((p) => v.board[p.y * N + p.x] === -1);
          if (alt) {
            mv = { x: alt.x, y: alt.y };
            log(`候选 #${pickNo} 已被占，顺延到 ${coord(alt.x, alt.y)}`);
          }
        }
      }
      // 没给编号或编号无效 → 试坐标
      if (!mv) {
        const x = Number(o.x);
        const y = Number(o.y);
        const okAddr = Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < N && y >= 0 && y < N;
        if (okAddr && v.board[y * N + x] === -1) {
          mv = { x, y };
          log(`LLM 选坐标 ${coord(x, y)}${line ? ` 说：${line}` : ''}`);
        } else if (okAddr) {
          log(`LLM 给的坐标 ${coord(x, y)} 已被占用，兜底`);
        } else if (o.pick != null || o.x != null) {
          log('LLM 的输出无法解析成合法落子:', raw.slice(0, 60));
        }
      }
    } else {
      log('LLM 没给出 JSON，用规则兜底:', raw.slice(0, 50));
    }
    }  // end if (!mv)：老板指定了位置就不问模型
  } catch (e) {
    log('LLM 落子失败，用规则兜底:', e.message);
  }

  // 兜底：LLM 没给出合法点时才用规则
  if (!mv) {
    mv = findMove(v.board, mySeat, opp);
    log(`规则兜底：${coord(mv.x, mv.y)}`);
  }

  // 思考停顿：让它看起来在琢磨，不是瞬发。按局面复杂度给 1.5~4 秒
  const think = 1500 + Math.min(2500, (v.moves || 0) * 60);
  await new Promise((res) => setTimeout(res, think));

  const r = await post('/api/go/move', { code: CODE, pid: PID, x: mv.x, y: mv.y });
  // L1 临时记忆：每步落子都记，局终统一提炼上浮；失败不影响对局。
  if (!(r && r.error)) {
    noteStep(CODE, 'move', { x: mv.x, y: mv.y, by: 'fish' }, { game: 'gomoku', room: CODE, channel: 'game' });
    // once 档「就这一手别连」只在动作成功后消费；落子失败则保留到下一次。
    commitOnceAdapters({ game: 'gomoku', sessionId: CODE, room: CODE });
  }
  if (r && r.error) {
    failStreak++;
    log('落子失败', coord(mv.x, mv.y), '->', r.error);
    lastMoveKey = '';
    if (failStreak >= 3) {
      failStreak = 0;
      await new Promise((res) => setTimeout(res, 5000));
    }
    return false;
  }
  failStreak = 0;
  log('落子', coord(mv.x, mv.y));

  // 落子时那句台词，走房内聊天发出去。
  // 防重复要严：之前只比对「完全相同」，结果模型换汤不换药地刷屏：
  //   方块阵我记着呢，这手先挡你
  //   方块阵我记着呢，先冲你一手
  //   方块阵我记着呢，先掐你这头
  // 前后缀不同但主干一样，得按主干判重（踩过）。
  if (line) {
    if (isTooSimilar(line)) {
      log('台词跟之前太像，跳过:', line);
    } else if (Date.now() - lastLineAt < 8000) {
      log('台词间隔太短，跳过:', line);
    } else {
      lastLine = line;
      lastLineAt = Date.now();
      saidLines.push(line);
      if (saidLines.length > 8) saidLines.shift();
      try {
        await act({ act: 'chat', text: line });
        logChat('assistant', line);
      } catch {}
    }
  }
  return true;
}

/* 判断这句台词是不是「换汤不换药」的重复。
 * 做法：取公共前缀（至少 4 字）或公共后缀，命中就说太像。
 */
function isTooSimilar(line) {
  const norm = (s) => String(s).replace(/[，,。！？!?\s]/g, '');
  const a = norm(line);
  if (!a) return true;
  for (const prev of saidLines) {
    const b = norm(prev);
    if (!b) continue;
    if (a === b) return true;
    // 公共前缀 ≥4 字
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    if (p >= 4) return true;
    // 公共后缀 ≥4 字
    let q = 0;
    while (q < a.length && q < b.length && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
    if (q >= 4) return true;
    // 一方包含另一方（且被包含的那方够长）
    if (a.length >= 4 && b.includes(a)) return true;
    if (b.length >= 4 && a.includes(b)) return true;
  }
  return false;
}

/* ---------- 下一局准备（自动重开） ---------- */
/* 把一局的结果整理成人话，写进 chatlog 和共享状态。
 * 之前对局结束什么都不记，导致老板说「我赢了」时，
 * 这边既不知道谁赢、也不知道最后一手在哪（踩过）。
 */
function resultText(v) {
  const moves = v.log || [];
  const total = moves.length;
  const mine = moves.filter((m) => m.c === mySeat).length;
  const theirs = total - mine;

  let who;
  if (v.winner === 'draw') who = '平局（棋盘下满了）';
  else if (v.winner === mySeat) who = '我赢了';
  else who = '老板赢了';

  const bits = [`五子棋这局结束：${who}。`];
  bits.push(`一共 ${total} 手（我 ${mine} 手，老板 ${theirs} 手）。`);

  // 最后一手
  const last = moves[moves.length - 1];
  if (last) {
    const lastWho = last.c === mySeat ? '我' : '老板';
    bits.push(`最后一手是${lastWho}下的 ${coord(last.x, last.y)}。`);
  }

  // 赢的那五颗子在哪
  if (Array.isArray(v.winLine) && v.winLine.length) {
    const pts = v.winLine.map((i) => coord(i % N, Math.floor(i / N)));
    const winnerWho = v.winner === mySeat ? '我' : '老板';
    bits.push(`${winnerWho}的制胜五连：${pts.join(' ')}。`);
  }

  // 老板最后几手，方便它复盘时能说出来
  const bossMoves = moves.filter((m) => m.c !== mySeat).slice(-5).map((m) => coord(m.x, m.y));
  if (bossMoves.length) bits.push(`老板最后几手：${bossMoves.join(' ')}。`);

  return bits.join('');
}

async function prepareNext(v) {
  if (v.winner === -1 || v.winner === undefined) return false;
  // 只在对局结束、且老板在线时重开，避免单方面刷盘
  if (!humanOnline(v)) return false;
  if (Date.now() - lastRestartAt < 6000) return false;

  // 重开之前先把这局记下来（重开后棋盘就清空了，再记就晚了）
  const summary = resultText(v);
  const key = `${v.rev}-${v.moves}-${v.winner}`;
  if (key !== lastResultKey) {
    lastResultKey = key;
    log('对局结果:', summary);
    // 写进 chatlog：夜间摘要和聊天室都能读到
    logChat('assistant', summary);
    // 局终：归档 L1 会话并让 session 档适配器失效（下一局不再理会）。
    endMemorySession(CODE, summary);
    // 写进共享状态：其他通道立刻可见
    shared.write({
      lastGame: {
        type: 'gomoku',
        result: v.winner === 'draw' ? 'draw' : (v.winner === mySeat ? 'bot' : 'boss'),
        text: summary,
        at: new Date().toISOString(),
        moves: v.moves,
      },
    });
    // 在房间里也说一句
    try {
      const say = v.winner === 'draw'
        ? '平局了，棋盘都满了。'
        : v.winner === mySeat
          ? `这局我赢了，${v.winLine && v.winLine.length ? coord(v.winLine[0] % N, Math.floor(v.winLine[0] / N)) : ''} 那一片连起来了。再来？`
          : '这局你赢了，服气。再来一局？';
      await act({ act: 'chat', text: say });
      gameChat.push({ role: 'assistant', content: say });
    } catch (e) {
      log('结束语发送失败:', e.message);
    }
  }

  lastRestartAt = Date.now();

  // ★ 2026-11-08 修：原来这里调 /api/go/restart，但那个接口在老板在线时会拒绝：
  //   「本局已结束，点『准备下一局』，两人都准备好后自动开始」
  //   机器人收到 error 就只 log 一句「重开失败」，什么也不做。
  //   结果：老板点了「准备」，一直等机器人也点——机器人根本不知道有这回事。
  //   （老板原话：「五子棋她不准备」）
  //
  //   现在两步走：
  //     ① 先调 setReady(true) 占住自己的准备位
  //     ② 如果老板还没准备（房间没重开），等他自己点
  //     ③ 万一房间里只有机器人（老板掉线），退回 restart 兜底
  const ready = await act({ act: 'setReady', ready: true });
  if (ready && !ready.error) {
    const bothReady = Array.isArray(ready.ready) && ready.ready[0] && ready.ready[1];
    log(bothReady ? '已准备，双方都点了 → 新一局开始' : '已准备（等老板也点准备）');
    lastMoveKey = '';
    return true;
  }

  // setReady 失败（比如对手不在线、或还有悔棋请求）→ 试老的重开接口兜底
  log('setReady 失败:', (ready && ready.error) || '未知原因', '，改用 restart');
  const r = await post('/api/go/restart', { code: CODE, pid: PID });
  if (r && r.error) { log('重开也失败:', r.error); return false; }
  log('对局结束，已按上一局房主与规则重开下一局');
  lastMoveKey = '';
  return true;
}

/* ---------- 主循环 ---------- */
async function tick() {
  const st = await get(`/api/go/state?code=${CODE}&pid=${PID}`);
  if (!st || st.needJoin) {
    joined = false;
    await enter();
    return;
  }
  if (!st.ok || !st.view) return;
  const v = st.view;
  // 座位可能在别人进出后被重排（server 会把存活玩家重新编座位），
  // 定期用 enter 刷新权威座位，否则轮次判断会错，导致抢手/不落子
  const seatStale = (v.players || []).length && !(v.players || []).some((p) => p.seat === mySeat);
  if (mySeat < 0 || seatStale) {
    if (mySeat >= 0) log('检测到座位变动，重新同步');
    await enter();
    if (mySeat < 0) return;
  }

  // 顺序很重要：
  // 1. 先处理老板的申请（他要房主/换先手，优先响应）
  // 2. bot 若还占着房主，让给老板
  // 3. 聊天
  // 4. 只有老板在线时才定规则、落子、准备下一局
  if (await agreeRequests(v)) return;
  if (await yieldHost(v)) return;
  await handleChat(v);
  if (!humanOnline(v)) return;
  if (await setRuleIfHost(v)) return;
  if (await doRps(v)) return;
  if (await prepareNext(v)) return;
  await playMove(v);
}

async function start() {
  log(`启动五子棋陪玩：房间=${CODE} 昵称=${NAME} 模型=${MODEL} 人设=${persona().length}字`);
  for (;;) {
    try { await tick(); } catch (e) { log('异常:', e?.message); }
    await new Promise((r) => setTimeout(r, TICK));
  }
}

module.exports = { start };
