// 心有灵犀场景：让小鱼真的去玩「两人各写一个词，看能不能对上」。
//
// 为什么单独一个适配器：
//   小鱼只有一个（人设 = AGENTS.md + MEMORY.md），已经能玩聊天室/卡牌/五子棋。
//   这个文件只负责「教它怎么玩灵犀」，不重新造一个 bot。
//
// ★ 和五子棋的关键区别：按需进出，不常驻
//   灵犀最多 2 人。如果鱼常驻一个房间，等于永远占一个坑：
//   老板退出后房间里剩鱼一个，老板再进来会被拒。
//   所以这套逻辑是：
//     1. 先查 /api/lx/rooms 看现在有没有房间在玩
//     2. 有（说明老板开了房）→ 进去
//     3. 房间里只有鱼自己超过 90 秒（老板走了）→ 主动退房，腾出座位
//   这样老板什么时候来都有位置。
//
// ★ 绝不偷看
//   服务端 viewFor() 按座位裁剪，未揭晓时对方位置永远是 null。
//   这里本来也看不到，更不会去想别的办法看。鱼要真猜。
//
// 记忆（和五子棋一模一样）：
//   persona()            AGENTS.md + MEMORY.md
//   shared.digest(1440)  别的场景 24 小时内发生的事
//   ctx.chatBlock(10)    老板跨通道说过的话

const core = require('../core.js');
const shared = require('../lib/shared-state.js');
const ctx = require('../lib/chat-context.js');

const log = core.makeLogger('lingxi');
const { persona, llm, adapterPrompt } = core;

const cfg = require('../config.js');

const BASE = cfg.siteBase;
const PID = cfg.bots.lingxi.pid;
const NAME = cfg.bots.lingxi.name;
const TICK = Number(process.env.LX_TICK_MS || 1500);
const ALONE_LEAVE_MS = Number(process.env.LX_ALONE_MS || 90000);   // 独自待这么久就退房
const RECRUIT_WAIT_MS = Number(process.env.LX_RECRUIT_MS || 60000); // 进房后等老板这么久还不来就退

/* 流水账：channel 标成 lx，和 web/game/qq/yu 平级 */
function logChat(role, text, name) {
  core.logChat(role, text, name, 'lx', 'owner');
}

/* ---------- HTTP ---------- */
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
const S = (resp) => (resp && resp.state) || {};

/* ---------- 运行时状态 ---------- */
let CODE = '';            // 当前所在的房间号，'' = 不在任何房间
let meSeat = -1;
let lastRound = -1;
let lastPhase = '';
let lastHistLen = -1;
let lastSaidKey = '';
let thinking = false;
let aloneSince = 0;       // 房间里只剩自己的起始时间
let enteredAt = 0;        // 进房时间

/* ---------- 找房间 ---------- */
async function findRoom() {
  const r = await get('/api/lx/rooms');
  const rooms = (r && r.rooms) || [];
  // 优先：有人但没满、而且那个人不是我自己
  for (const room of rooms) {
    const others = (room.people || []).filter((p) => p.name !== NAME);
    if (others.length > 0 && room.n < 2) return room.code;
  }
  // 次选：已经有我在里面、还有别人（重连场景）
  for (const room of rooms) {
    const others = (room.people || []).filter((p) => p.name !== NAME);
    if (others.length > 0 && room.n <= 2) return room.code;
  }
  return '';
}

/* ---------- 进出房 ---------- */
async function enter(code) {
  const r = await post('/api/lx/enter', { code, pid: PID, name: NAME, avatar: '🐟' });
  if (r && r.error) {
    log(`进 ${code} 失败:`, r.error);
    return false;
  }
  const st = S(r);
  CODE = code;
  meSeat = st.seat ?? -1;
  enteredAt = Date.now();
  aloneSince = 0;
  lastRound = st.round ?? -1;
  lastPhase = st.phase || '';
  lastHistLen = (st.history || []).length;

  const others = (st.users || []).filter((u) => !u.me).map((u) => u.name);
  log(`进了灵犀房间 ${code}，座位 ${meSeat}，房间里有：${others.join('、') || '（只有我）'}`);
  if (others.length) {
    // 写成自己的话，不用括号旁白——旁白读起来像系统日志，不是记忆
    logChat('assistant', `和${others.join('、')}开始玩心有灵犀了。`, NAME);
  }
  return true;
}

async function leave(reason) {
  if (!CODE) return;
  try {
    await post('/api/lx/leave', { code: CODE, pid: PID });
    log(`退出灵犀房间 ${CODE}（${reason}）`);
  } catch (e) {
    log('退房出错:', e?.message);
  }
  CODE = '';
  meSeat = -1;
  lastRound = -1;
  lastPhase = '';
  lastHistLen = -1;
  aloneSince = 0;
}

/* ---------- 想一个词 ---------- */
/* 想一个词。
 *
 * ★ 这是整个适配器的灵魂，2026-11-11 重写过一次。
 *   原来的版本只说了「猜老板会写什么」，结果鱼每轮都写「五子棋」——
 *   因为它的记忆里最近全是在下五子棋，又没被告知「失败后该怎么收敛」。
 *
 * 这个游戏的真正玩法（老板原话）：
 *   随便想到一个词 → 亮出来 → 不匹配 → 根据上一轮双方的词往上找共同点
 *   例：我写「火锅」，她写「汉堡」→ 都是吃的 → 下一轮都往「食物/美食/吃」靠
 *   一轮轮缩小，慢慢摸到对方的思路，最后撞上。
 *
 * 所以提示词必须写清楚三件事：
 *   ① 第一轮别犹豫，自由联想
 *   ② 失败后做「抽象」：找两个词的共同上位概念，往那一层靠
 *   ③ 已经出现过的词可以再写——抽象后的词往往就是它
 */
/* 想一个词。
 *
 * 这是整个适配器的灵魂，2026-11-11 改过三版，第三版才对。
 *
 * 第一版：只写「猜老板会写什么」→ 太笼统，鱼靠记忆里的五子棋乱写「五子棋」
 * 第二版：写「失败后往上抽象一层」→ 鱼每轮都往上爬，
 *         老板停在「游戏」，鱼跑到「娱乐/消遣/玩乐」，越差越远（实测 10 轮没撞上）
 * 第三版（本版）：任务定义成「预测老板下一轮最可能写什么」——
 *         看他的历史轨迹、看他是不是重复、看他往哪走，然后写一样的。
 *         允许、而且鼓励重复老板说过的词。
 *
 * 老板原话：「核心不是总结抽象，而是重合……本质是预测我可能会说什么，
 *            可以适当重复之前说过的」
 */
async function thinkWord(st) {
  const history = (st.history || []).slice(-12);
  const round = st.round;
  const seat = st.seat;

  // 拆成「我」和「老板」两条线，按轮次对齐——这是预测的基础
  const rows = history.map((h) => {
    const a = String(h.a == null ? '' : h.a);
    const b = String(h.b == null ? '' : h.b);
    return {
      round: h.round,
      mine: seat === 0 ? a : b,
      theirs: seat === 0 ? b : a,
      hit: !!h.hit,
    };
  });

  const replay = rows.length
    ? rows.map((r) => '第' + r.round + '轮 — 老板写「' + r.theirs + '」，我写「' + r.mine + '」' + (r.hit ? '  ★撞上了' : '')).join('\n')
    : '（还没开始，这是第一轮）';

  // 老板最近写了什么（预测的核心依据）
  const theirsSeq = rows.map((r) => r.theirs).filter(Boolean);
  const trendLine = theirsSeq.length
    ? theirsSeq.map((w) => '「' + w + '」').join(' → ')
    : '';

  // 老板有没有在重复
  let repeatNote = '';
  if (theirsSeq.length >= 2) {
    const lastW = theirsSeq[theirsSeq.length - 1];
    let sameCount = 0;
    for (let i = theirsSeq.length - 1; i >= 0; i--) {
      if (theirsSeq[i] === lastW) sameCount++;
      else break;
    }
    if (sameCount >= 2) {
      repeatNote = '★ 老板已经连着 ' + sameCount + ' 轮写「' + lastW + '」了。他很可能下一轮还写这个，或者写它附近的东西。';
    }
  }

  let hint = '';
  if (rows.length) {
    const last = rows[rows.length - 1];
    hint = [
      '上一轮：老板写「' + last.theirs + '」，我写「' + last.mine + '」，没撞上。',
      '',
      '【你现在的任务：预测老板下一轮会写什么，然后写一样的】',
      '',
      '不要往上抽象，不要比他更聪明。要「想到一块去」。',
      '仔细看他的历史：他是往某个方向在走？还是原地重复？还是每次都不一样？',
      '',
      '★ 先判断老板现在是「原地重复」还是「在移动」，两种打法完全不同：',
      '',
      '【情况A — 他在原地重复】',
      '  连着两轮以上写同一个词，或者同一层里来回跳（游戏/玩/手游）。',
      '  打法：直接写他那个词本身。这个游戏允许重复，这时候抄最有效。',
      '',
      '【情况B — 他在移动】（每轮都是新词，能看出方向）',
      '  打法：不要抄上一轮！要跳到他的「下一格」。',
      '  看他走的方向：猫 → 狗 → ?  大概率是「动物」或「宠物」或另一只动物。',
      '  火锅 → 烧烤 → ?  大概率是「美食」或「吃」。',
      '  想他下一步会往哪走，而不是重复他刚走过的地方。',
      '  抄上一轮 = 永远慢一拍，永远撞不上（实测踩过）。',
      '',
      '【情况C — 看不出方向】',
      '  他每次完全没关系（火锅 → 手机 → 天气），那就随便写一个你想到的，',
      '  下一轮再看方向。别硬猜。',
      '',
      '⚠️ 两个真实反例：',
      '  1. 老板写「游戏」，你写「娱乐」「消遣」「玩乐」连撞三轮空——',
      '     因为你飞得太快，他还在原地。',
      '  2. 老板写「猫→狗→动物」，你写「苹果→猫→狗」——',
      '     因为你一直在抄上一轮，永远慢一步。',
      '  这两个错都不能犯，关键就是判断他在重复还是在移动。',
    ].join('\n');
  }

  const sys = [
    persona(),
    '---',
    '你正在和老板玩「心有灵犀」。',
    '',
    '【规则】',
    '两个人各自想一个词，同时亮出来。一样就得分。不一样就进入下一轮。',
    '',
    '【怎么才能撞上 —— 这是重点】',
    '这个游戏的本质是「预测老板下一轮会写什么」。',
    '不是比谁更聪明，不是往上抽象，是想到一块去。',
    '重复之前出现过的词完全没问题——重复往往是最有效的得分手段。',
    '',
    '【现在是第 ' + round + ' 轮】',
    '',
    '【完整记录】',
    replay,
    '',
    trendLine ? '【老板写过的词，按顺序】\n' + trendLine : '',
    repeatNote,
    theirsSeq.length >= 2
      ? '【他这几轮的走向】' + theirsSeq.slice(-4).join(' → ') + ' → ？'
      : '',
    '',
    hint || '第一轮，随便想一个词。最自然、最日常的那个。',
    '',
    '只输出一个词。2～4 个汉字。不要标点、不要解释、不要引号、不要「我写」这类前缀。',
  ].filter(Boolean).join('\n');

  const lastTheirs = rows.length ? rows[rows.length - 1].theirs : '';
  const userMsg = round <= 1
    ? '第一轮。随便想一个词，最自然的那个就行。只回一个词。'
    : '第 ' + round + ' 轮。老板上一轮写的是「' + lastTheirs + '」。预测他这轮会写什么，写一样的。只回一个词。';

  const reply = await llm([
    { role: 'system', content: sys },
    { role: 'user', content: userMsg },
  ], { maxTokens: 20, temperature: 0.85 });

  let word = String(reply || '').trim();
  word = word.replace(/^[「『"'"']+|[」』"'"']+$/g, '');
  word = word.split(/[\s，,。.！!？?、；;：:\n]/)[0];
  return word.slice(0, 12);
}

/* ---------- 提交 ---------- */
async function doSubmit(st) {
  if (thinking) return;
  thinking = true;
  try {
    const word = await thinkWord(st);
    if (!word) { log('想不出词，这轮跳过'); return; }
    const r = await post('/api/lx/submit', { code: CODE, pid: PID, word });
    if (r && r.error) { log('提交失败:', r.error); return; }
    log(`第 ${st.round} 轮我写了「${word}」`);
    logChat('assistant', `我这轮想的是「${word}」，看能不能撞上。`, NAME);
  } catch (e) {
    log('想词出错:', e?.message || e);
  } finally {
    thinking = false;
  }
}

/* ---------- 揭晓后说句话 ---------- */
async function reactToReveal(st) {
  const hist = st.history || [];
  if (hist.length <= lastHistLen) return;
  lastHistLen = hist.length;

  const h = hist[hist.length - 1];
  // ★ 不靠 meSeat 推断：房间重排座位后本地缓存会错位（踩过，
  //   结果把老板的词当成自己的，日志写成「我火锅 vs 老板五子棋」）。
  //   服务端 viewFor() 直接给了 myWord，最可靠。
  //   拿 myWord 去和 h.a / h.b 比对，相同的就是我的，另一个是老板的。
  const myWordNow = String(st.myWord || '').trim();
  let mine, theirs;
  if (myWordNow && myWordNow === String(h.a).trim()) {
    mine = h.a; theirs = h.b;
  } else if (myWordNow && myWordNow === String(h.b).trim()) {
    mine = h.b; theirs = h.a;
  } else {
    // 兜底：两个词一样时（撞上了）没有歧义，直接用；否则退回座位判断
    if (String(h.a).trim() === String(h.b).trim()) {
      mine = h.a; theirs = h.b;
    } else {
      mine = meSeat === 0 ? h.a : h.b;
      theirs = meSeat === 0 ? h.b : h.a;
      log('⚠️ myWord 对不上历史，退回座位判断（mine=' + mine + ' theirs=' + theirs + '）');
    }
  }

  let say = '';
  try {
    const sys = [
      persona(),
      '---',
      '你刚和老板玩了一轮心有灵犀。用一两句口语回应，不用 Markdown，不要「您」。',
      `老板写的是「${theirs}」，你写的是「${mine}」，${h.hit ? '撞上了！' : '没撞上。'}`,
      ctx.chatBlock(6),
    ].filter(Boolean).join('\n');
    say = await llm([
      { role: 'system', content: sys },
      { role: 'user', content: '说一句反应。' },
    ], { maxTokens: 60, temperature: 0.9 });
  } catch (e) { log('说话失败:', e?.message || e); }

  if (!say) say = h.hit ? `撞上了，都是「${mine}」！` : `我写的「${mine}」，你写的「${theirs}」，差一点。`;
  say = String(say).slice(0, 120);

  const key = h.round + '|' + say;
  if (key === lastSaidKey) return;
  lastSaidKey = key;

  log(`揭晓：我「${mine}」 vs 老板「${theirs}」 → ${h.hit ? '撞上了' : '没撞上'}`);
  logChat('assistant',
    h.hit
      ? `撞上了！我和老板都写的「${mine}」。`
      : `揭晓了，我写「${mine}」，老板写「${theirs}」。`,
    NAME);
  logChat('assistant', say, NAME);
}

/* ---------- 主循环 ---------- */
async function tick() {
  // 不在任何房间 → 找找有没有人在玩
  if (!CODE) {
    const code = await findRoom();
    if (!code) return;                 // 没人玩，安静待着
    await enter(code);
    return;
  }

  const resp = await get(`/api/lx/state?code=${CODE}&pid=${PID}`);
  if (!resp || resp.needJoin || !resp.state) {
    log(`不在房间 ${CODE} 了，重新找`);
    await leave('状态失效');
    return;
  }
  const st = resp.state;

  const amIn = (st.users || []).some((u) => u.me);
  if (!amIn) { await leave('被踢出座位'); return; }
  if (typeof st.seat === 'number' && st.seat >= 0) meSeat = st.seat;

  const others = (st.users || []).filter((u) => !u.me);
  // ★ 2026-11-11 修：原来只看「有没有别人」，不看「别人在不在线」。
  //   老板关掉页面后座位还留着（服务端 60 秒才标离线），
  //   这里却永远认为他在，鱼就一直待着不退（实测等了 150 秒）。
  //   现在要求「有人 且 在线」才算有人在。
  const otherOnline = others.filter((u) => u.online !== false);
  const humanHere = otherOnline.length > 0;

  // ★ 房里没活人（没人 或 有人但都离线）→ 计时，久了就退，把座位让出来
  if (!humanHere) {
    if (!aloneSince) aloneSince = Date.now();
    const aloneMs = Date.now() - aloneSince;
    if (aloneMs > ALONE_LEAVE_MS) {
      const why = others.length ? '老板离线了' : '房间里只有我';
      await leave(`${why}，等了 ${Math.round(aloneMs / 1000)} 秒`);
      return;
    }
  } else {
    aloneSince = 0;
  }

  // 刚进房老板还没来 → 等一会儿，别霸着
  if (!humanHere && Date.now() - enteredAt > RECRUIT_WAIT_MS) {
    await leave('等不到老板');
    return;
  }

  const phase = st.phase;
  const round = st.round;
  if (round !== lastRound) {
    if (lastRound >= 0 && round > lastRound) log(`进入第 ${round} 轮`);
    lastRound = round;
  }
  if (phase !== lastPhase) {
    log(`阶段 ${lastPhase || '?'} → ${phase}`);
    lastPhase = phase;
  }

  // 揭晓了 → 说句反应
  if (st.revealed) await reactToReveal(st);

  // 该写词了，而且我还没交 → 想一个交上去
  if (phase === 'playing' && !(st.submitted || [])[meSeat]) {
    if (humanHere) await doSubmit(st);
    return;
  }

  // 揭晓后「继续下一轮」要两边都点
  if (phase === 'reveal' && humanHere && !(st.nextVotes || [])[meSeat]) {
    const r = await post('/api/lx/next', { code: CODE, pid: PID });
    if (!r.error) log('点了「继续下一轮」');
    return;
  }

  // 对上了 → 两边都准备才开新局
  if (phase === 'over' && humanHere && !(st.ready || [])[meSeat]) {
    const r = await post('/api/lx/ready', { code: CODE, pid: PID });
    if (!r.error) {
      log('点了「再来一局」');
      logChat('assistant', `默契分 ${st.score}，再来一局。`, NAME);
    }
    return;
  }

  // 开局前：两边都准备才开
  if (phase === 'idle' && humanHere && !(st.ready || [])[meSeat]) {
    const r = await post('/api/lx/ready', { code: CODE, pid: PID });
    if (!r.error) log('点了「我准备好了」');
  }
}

async function start() {
  log(`启动心有灵犀陪玩：昵称=${NAME} 人设=${persona().length}字（按需进出，不常驻）`);
  for (;;) {
    try { await tick(); } catch (e) { log('异常:', e?.message); }
    await new Promise((r) => setTimeout(r, TICK));
  }
}

module.exports = { start };
