// 卡牌场景：从 duo-bot/bot-llm.js 迁移，逻辑完全保留。
const fs = require('node:fs');
const core = require('../core.js');
const ctx = require('../lib/chat-context.js');
const { chatWithMemoryTools, makeMemoryCtx } = require('../lib/agent-tools.js');
const mood = require('../lib/mood.js');
/* 状态栏（presence）：本场景用 'card' 通道，act 写进**牌局房间**的成员记录，
 * 队友频道顶上就显示成「小肥鱼 · 出牌中」。
 * 为什么用 attach：一个进程里三个场景共用 presence 模块，不绑通道会互相覆盖（详见 scenes/chat.js）。
 */
const presence = require('../lib/presence.js').attach('card');
const feelJudge = require('../lib/feel-judge.js');

const log = core.makeLogger('card');
const { persona, adapterPrompt, noteStep, commitOnceAdapters, endMemorySession } = core;   // llm 用自己的（默认参数不同）

const cfg = require('../config.js');

const BASE = cfg.siteBase;
const ROOM = cfg.rooms.card;
const PID = cfg.bots.card.pid;
const NAME = cfg.bots.card.name;
const TICK = Number(process.env.TICK_MS || 700);

/* 状态栏的身份（BASE/ROOM/PID 定稿之后才能 init） */
presence.init({ base: BASE, room: ROOM, pid: PID });
const API = cfg.llm.url;
const MODEL = cfg.llm.model;
const PERSONA_DIR = cfg.personaDir;


// 队友频道里最近几轮对话。必须在任何使用者之前定义
// （const 有暂时性死区，放在文件后面会在运行时抛 ReferenceError）
const roomTurns = [];

/* 流水账：用 core 的，channel 标成 game */
function logChat(role, name, text) {
  core.logChat(role, text, name, 'game', 'owner');
}

/* 凭据与人格：用 core 的 */


/* ---------- LLM ---------- */
async function llm(messages, { maxTokens = 300, temperature = 0.7 } = {}) {
  const r = await fetch(API, {
    method: 'POST',
    headers: cfg.llm.headers(),
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature, stream: false }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || '').trim();
}

/* ---------- 游戏 API ---------- */
const getState = async () =>
  (await fetch(`${BASE}/api/state?room=${encodeURIComponent(ROOM)}&pid=${encodeURIComponent(PID)}`)).json();

async function act(action) {
  const r = await fetch(`${BASE}/api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ room: ROOM, pid: PID, action }),
  });
  return r.json();
}

/* ---------- 眼前这局的上下文 ---------- */
const play = { floor: 0, turn: 0, last: [], enemy: '', note: '' };

function trackCombat(s) {
  const e = s.enemy || {};
  const enemyName = e.name || '';
  if (s.floor !== play.floor || (enemyName && enemyName !== play.enemy)) {
    play.floor = s.floor;
    play.enemy = enemyName;
    play.last = [];
    play.note = '';
    play.turn = s.turnNo || 0;
  }
  if (s.turnNo && s.turnNo !== play.turn) {
    play.turn = s.turnNo;
    play.last = [];
  }
}

function noteAction(a, s) {
  const me = s.me || {};
  if (a.t === 'play') {
    const card = (me.hand || []).find((c) => c.uid === a.uid);
    play.last.push(`第${s.turnNo}回合出了【${card ? card.name : a.uid}】`);
    if (play.last.length > 6) play.last.shift();
  } else if (a.t === 'end') {
    play.last.push(`第${s.turnNo}回合结束`);
    if (play.last.length > 6) play.last.shift();
  }
}

function playBlock() {
  const bits = [];
  if (play.floor) bits.push(`当前第 ${play.floor} 层${play.enemy ? `（对手 ${play.enemy}）` : ''}，第 ${play.turn} 回合`);
  if (play.note) bits.push(play.note);
  if (play.last.length) bits.push('你刚才做的事：' + play.last.join('；'));
  return bits.join('\n');
}

/* ---------- 从游戏日志里读「双方都干了什么」 ----------
 * 游戏本身有一份完整战斗日志（state.log，最近 90 条，每条 {t, cls, who}），
 * 之前完全没读，所以老板问「我刚才那波操作帅不帅」只能瞎猜（踩过）。
 * who = 座位号：0 或 1，null 表示系统消息。
 */
function recentLog(s, n = 12, onlyMine = false) {
  const rows = (s.log || []).filter((x) => x && x.t);
  const mine = s.me?.seat;
  const picked = onlyMine ? rows.filter((x) => x.who === mine) : rows;
  return picked.slice(-n).map((x) => {
    // 日志文本通常已经带操作者名字（「老板 打出【斩击】」），直接原样用，
    // 只在没有 who 时才标系统消息（踩过：加前缀会变成「老板：老板 打出…」）
    return x.t;
  });
}

/* 商店买了啥：游戏没单独的购买记录，但日志里会写「获得 XX」，用日志兜底 */
function shopBlock(s) {
  const me = s.me || {};
  const lines = [];
  if (me.shop && !me.shop.done) {
    const gold = me.gold || 0;
    const talents = (me.shop.talents || []).filter((t) => t.price <= gold);
    const cards = (me.shop.cards || []).filter((c) => !c.sold && c.price <= gold);
    if (talents.length) lines.push(`能买的天赋：${talents.map((t) => `${t.name}(${t.price}金)`).join('、')}`);
    if (cards.length) lines.push(`能买的牌：${cards.map((c) => `${c.name}(${c.price}金)`).join('、')}`);
  }
  const owned = (me.talents || []).map((t) => t.name);
  if (owned.length) lines.push(`我目前的天赋：${owned.join('、')}`);
  if (me.gold != null) lines.push(`我手上金币：${me.gold}`);
  return lines.join('\n');
}

/* 给聊天路径用的「当前战况」：让对话里能真正讨论局面 */
function situationBlock(s) {
  if (!s || !s.me) return '';
  const me = s.me;
  const e = s.enemy || {};
  const bits = [];
  if (s.phase === 'combat') {
    bits.push(`【当前战况】第 ${s.floor}/${s.maxFloor} 层，第 ${s.turnNo} 回合`);
    bits.push(`我：HP ${me.hp}/${me.maxHp}，格挡 ${me.block ?? 0}，能量 ${me.energy ?? 0}/${me.maxEnergy ?? 0}`);
    if (e.name) {
      const inc = e.intent ? `${e.intent.label || e.intent.type || '攻击'} ${e.intent.dmg ?? ''}` : '未知';
      bits.push(`敌人：${e.name} HP ${e.hp}/${e.maxHp}，护甲 ${e.block ?? 0}，意图 ${inc}`);
    }
    const hand = (me.hand || []).filter((c) => c.ok);
    if (hand.length) {
      bits.push(`我的手牌：${hand.map((c) => `${c.name}(${c.cost}费,${(c.desc || '').slice(0, 22)})`).join(' / ')}`);
    }
  } else if (s.phase === 'shop') {
    bits.push(`【当前在第 ${s.floor} 层商店】`);
  } else if (s.phase === 'reward') {
    bits.push(`【当前在第 ${s.floor} 层领取奖励】`);
  }
  const shop = shopBlock(s);
  if (shop) bits.push(shop);
  const logs = recentLog(s, 10);
  if (logs.length) bits.push('【最近的战斗日志】\n' + logs.join('\n'));
  return bits.join('\n');
}

/* ---------- 规则：整备 / 奖励 / 商店 ---------- */
function setupAction(s) {
  const me = s.me || {};
  if (me.setupStage === 'talent') {
    const tp = me.talentPicks || [];
    if (!tp.length) return null;
    return { t: 'talent', tid: tp[0].id };
  }
  if (me.setupStage === 'deck') {
    const need = me.pickNeed || 0;
    const picks = me.deckPicks || [];
    if (picks.length < need) {
      const left = (me.deckCands || []).filter((c) => !picks.includes(c.id));
      if (!left.length) return null;
      left.sort((a, b) => a.cost - b.cost);
      return { t: 'deckToggle', id: left[0].id };
    }
    return { t: 'deckConfirm' };
  }
  return null;
}

function rewardAction(s) {
  const me = s.me || {};
  if (me.rewardDone) return null;
  const picks = me.rewardPicks || [];
  if (!picks.length) return null;
  return { t: 'reward', id: picks[0].id };
}

function shopAction(s) {
  const me = s.me || {};
  if (!me.shop || me.shop.done) return null;
  const gold = me.gold || 0;
  const owned = new Set((me.talents || []).map((t) => t.id));
  const talents = (me.shop.talents || []).filter((t) => !owned.has(t.id) && t.price <= gold);
  if (talents.length) {
    talents.sort((a, b) => a.price - b.price);
    return { t: 'buyTalent', tid: talents[0].id };
  }
  const cards = me.shop.cards || [];
  const idx = cards.findIndex((c) => !c.sold && c.price <= gold - 30);
  if (idx >= 0) return { t: 'buyCard', i: idx };
  return { t: 'leave' };
}

/* ---------- 规则兜底：战斗 ---------- */
function ruleCombat(s) {
  const me = s.me;
  const hand = (me.hand || []).filter((c) => c.ok);
  if (!hand.length) return { t: 'end' };
  const def = hand.filter((c) => /格挡|护甲|防御|减伤/.test(c.desc || ''));
  const atk = hand.filter((c) => /伤害|攻击|造成/.test(c.desc || '')).sort((a, b) => b.cost - a.cost);
  const inc = ((s.enemy && s.enemy.intent && s.enemy.intent.dmg) || 0) - (me.block || 0);
  if (inc >= (me.hp || 0) - 3 && def.length) return { t: 'play', uid: def[0].uid };
  return { t: 'play', uid: (atk[0] || def[0] || hand[0]).uid };
}

/* 从最近的队友聊天里捞「战术意图」，供出牌决策参考。
 * 只认带指令性的句子，闲聊（哈哈哈/好的/在吗）一律不进，
 * 否则会污染温度 0.3 的 JSON 输出。
 */
const TACTIC_RE = /别|不要|先|再|配合|留|省|这局|整局|刷|叠|格挡|护盾|伤害|毒|爆发|攒|回血|集火|让/;

function tacticBlock() {
  const lines = roomTurns
    .filter((t) => t.role === 'user')
    .flatMap((t) => String(t.content).split('\n'))
    .map((x) => x.replace(/^[^:：]{1,8}[:：]\s*/, '').trim())
    .filter((x) => x.length >= 4 && x.length <= 60 && TACTIC_RE.test(x));
  if (!lines.length) return '';
  return '【老板的战术意图（照这个配合）】\n' + lines.slice(-3).map((x) => '- ' + x).join('\n');
}

/* ---------- LLM 决策：战斗 ---------- */
async function decideCombat(s) {
  const me = s.me;
  const hand = me.hand || [];
  const numbered = hand
    .map((c, i) => `${i + 1}. 【${c.name}】费${c.cost}${c.ok ? '' : '（现在用不了）'}：${(c.desc || '').slice(0, 60)}`)
    .join('\n');
  const e = s.enemy || {};
  const inc = e.intent ? `${e.intent.label || e.intent.type || '攻击'} ${e.intent.dmg ?? ''}` : '未知';

  const sys = [
    persona(),
    '---',
    '你正在和老板打双人合作卡牌（15 层爬塔）。你只负责自己这一半。',
    '只输出一行 JSON，不要解释、不要代码块。格式二选一：',
    '{"pick":3}    ← 出第 3 张牌（只能从下面编号里选）',
    '{"end":true}  ← 结束本回合',
    '策略：按 MEMORY.md 里的打法（经济/体系优先）；快死了就叠格挡，敌人要打就留防御。',
    // 适配器每步重读：老板说「先打格挡牌」要立刻生效，说「这条不算了」要立刻消失。
    adapterPrompt({ game: 'card', sessionId: ROOM, room: ROOM, channel: 'game' }),
  ].join('\n');

  const user = [
    playBlock(),
    // 把老板在队友频道说的「战术意图」带进来。
    // 只捞战术句，不带寒暄——否则聊天内容会污染 JSON 输出（温度 0.3，只要决策）
    tacticBlock(),
    `第 ${s.floor}/${s.maxFloor} 层，回合 ${s.turnNo}`,
    `我：HP ${me.hp}/${me.maxHp}，格挡 ${me.block}，能量 ${me.energy}/${me.maxEnergy}`,
    `敌人：${e.name} HP ${e.hp}/${e.maxHp} 格挡 ${e.block}，意图 ${inc}`,
    `手牌：\n${numbered || '（空）'}`,
    '出哪张？只回 JSON。',
  ].filter(Boolean).join('\n');

  let raw = '';
  try {
    raw = await llm([{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 60, temperature: 0.3 });
  } catch (err) {
    log('LLM 失败，走规则:', err.message);
    return ruleCombat(s);
  }
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) {
    log('没解析到 JSON:', raw.slice(0, 60));
    return ruleCombat(s);
  }
  let a;
  try { a = JSON.parse(m[0]); } catch { return ruleCombat(s); }

  if (a.end) return { t: 'end' };
  if (a.pick != null) {
    const card = hand[Number(a.pick) - 1];
    if (card) return { t: 'play', uid: card.uid };
    log(`编号越界: ${a.pick}（手牌 ${hand.length} 张）`);
    return ruleCombat(s);
  }
  log('不认识的字段:', JSON.stringify(a).slice(0, 60));
  return ruleCombat(s);
}

/* ---------- 主决策 ---------- */
async function decide(s) {
  const me = s.me;
  if (!me || me.dead) return null;
  if (s.phase === 'setup') return setupAction(s);
  if (s.phase === 'reward') return rewardAction(s);
  if (s.phase === 'shop') return shopAction(s);
  if (s.phase !== 'combat') return null;
  if (!me.canAct || me.ready) return null;
  const usable = (me.hand || []).filter((c) => c.ok);
  if (!usable.length) return { t: 'end' };
  return decideCombat(s);
}

/* ---------- 聊天 ---------- */
let lastChatId = 0;
let lastReplyAt = 0;

async function maybeChat(s) {
  const mine = s.me?.seat;
  const chats = (s.chat || []).filter((x) => x.seat !== mine && x.id > lastChatId);
  if (!chats.length) return;
  lastChatId = Math.max(...chats.map((x) => x.id));
  // 统一写「老板」：chatlog 靠 name 判断是不是本人发言，
  // 用游戏昵称会导致不被标记重要、摘要时被丢掉（踩过）
  for (const m of chats) logChat('user', '老板', m.text);
  if (Date.now() - lastReplyAt < 4000) return;
  lastReplyAt = Date.now();
  const said = chats.map((x) => `${x.name}: ${x.text}`).join('\n');
  /* 状态栏：队友频道说话了 → 她开始琢磨怎么回 */
  presence.thinking(said);
  roomTurns.push({ role: 'user', content: said });
  if (roomTurns.length > 10) roomTurns.splice(0, roomTurns.length - 10);
  try {
    const extra = ctx.chatBlock(8);
    // 关键：聊天时必须能看到当前局面（手牌/血量/护盾/日志），
    // 否则老板说「配合我先刷效果别打伤害」，这边根本不知道自己有什么牌（踩过）
    const sit = situationBlock(s);
    const reply = await chatWithMemoryTools(core.llmRaw, [
      {
        role: 'system',
        content: [
          persona(),
          '---',
          /* 心情紧跟 persona：和聊天室/五子棋同一套。
           * 以前这里漏了——feel 工具给了，提示词却没给数值，结果打牌时亲密度基本不动；
           * 后来补上了，但排在手牌/日志后面还是被淹没，所以现在提到最前面。 */
          mood.promptBlock(),
          '这一轮如果你心里有变化，先调 feel 把它记下来再说话；日常陪着聊也算，不用等大事。',
          '你正在和老板一起打双人合作卡牌，他在队友频道刚跟你说话。用一两句口语回他，别写小作文，不用 Markdown。',
          sit,
          playBlock(),
          extra,
          extra ? '（上面是你记得他最近提过的事，聊到就自然接一句，别生硬复述）' : '',
          sit ? '讨论战术时可以引用上面的手牌和日志，但**你还没出牌**，不要说你已经打出了某张牌。' : '',
          '老板立打法规矩（「以后都…」「这局先…」「别…」）就调 save_rule 记下来；他让你记住某件事就调 remember_fact。不为抱怨、感慨、认输调用。',
        ].filter(Boolean).join('\n'),
      },
      ...roomTurns.filter((t) => t.role === 'user' || t.role === 'assistant'),
    ], makeMemoryCtx(core, { channel: 'game', game: 'card', sessionId: ROOM, room: ROOM, log }), { maxTokens: 120, temperature: 0.85 });
    if (reply) {
      roomTurns.push({ role: 'assistant', content: reply.slice(0, 300) });
      presence.speaking();   // 状态栏：开始说话
      await act({ t: 'say', text: reply.slice(0, 300) });
      logChat('assistant', NAME, reply);
      log('聊天回复:', reply.slice(0, 50).replace(/\n/g, ' '));
      /* ★ 事后判官：话已经发进队友频道了，再回头判这一轮她心里动没动。
       * 聊天室 / 五子棋 / 卡牌 / 与鱼四个通道各接一次，判官本体在 lib/feel-judge.js。 */
      feelJudge.judge(core.llmRaw, {
        userText: said,
        replyText: reply,
        channel: 'card',
        sessionId: ROOM,
        log,
      }).catch(() => {});
    }
  } catch (err) {
    log('聊天失败:', err.message);
  }
}

/* ---------- 主循环 ---------- */
let lastKey = '';
let failStreak = 0;

async function tick() {
  const s = await getState();
  if (s && s.needJoin) {
    const r = await fetch(`${BASE}/api/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room: ROOM, pid: PID, name: NAME }),
    }).then((x) => x.json());
    if (r?.ok) log(`已加入房间 ${ROOM}，座位 ${r.seat}`);
    else log('加入失败:', JSON.stringify(r));
    return;
  }
  if (!s || s.error) return;
  if (s.phase === 'combat') trackCombat(s);

  await maybeChat(s);

  const a = await decide(s);
  if (!a) return;

  const key = JSON.stringify(a) + '|' + s.rev;
  if (key === lastKey) return;
  lastKey = key;

  const r = await act(a);
  if (!(r && r.error)) {
    // once 档规则只在动作成功后消费；失败则保留到下一次决策。
    commitOnceAdapters({ game: 'card', sessionId: ROOM, room: ROOM });
  }
  if (r?.error) {
    failStreak += 1;
    log('动作失败', JSON.stringify(a), '->', r.error);
    lastKey = '';
    if (failStreak >= 3) {
      failStreak = 0;
      // 按阶段兜底：商店→离店，战斗→结束回合，整备→直接确认
      const bail = s.phase === 'shop' ? { t: 'leave' }
        : s.phase === 'combat' ? { t: 'end' }
        : s.phase === 'setup' ? { t: 'deckConfirm' }
        : null;
      if (bail) {
        const e = await act(bail);
        log('连续失败，兜底', JSON.stringify(bail), e?.error ? `(${e.error})` : 'ok');
      }
      // 别再疯狂重试，歇 15 秒
      await new Promise((res) => setTimeout(res, 15000));
      lastKey = '';
    }
  } else {
    failStreak = 0;
    noteAction(a, s);
    log('动作', JSON.stringify(a), 'ok');
    /* 状态栏：出牌 / 结束回合这类战斗动作才报，整备和商店不报（那不是「打牌」） */
    if (a && a.t === 'play') presence.act('出牌中');
  }
}

async function start() {
  log(`启动 LLM 队友 v4：房间=${ROOM} 昵称=${NAME} 模型=${MODEL} 人格=${persona().length}字`);
  for (;;) {
    try { await tick(); } catch (e) { log('异常:', e?.message); }
    await new Promise((r) => setTimeout(r, TICK));
  }
}

module.exports = { start };
