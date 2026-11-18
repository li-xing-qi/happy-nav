// 事后判官：她说完话之后，回头看一眼「这一来一回，她心里动了吗」
//
// 为什么不再靠「回复时顺手调 feel 工具」（这条路已经被线上数据证伪）：
//   2026-11-17 的真实日志——聊天室 243 条回复，feel 工具调用 0 次；与鱼 0 次；
//   五子棋一天只涨 5 分（60→65）。提示词写了 12 行、位置提到 persona 之后、
//   工具轮的 token 也给够了，243 次机会一次都没调。
//   原因很朴素：她此刻的注意力全在「怎么回得像人」，不会为了记一笔额外发起一轮工具调用。
//   所以换成这条「事后判官」：回复发出去**之后**，用一次极小的独立请求回头判一下。
//
// 为什么是「之后」而不是「之前」：
//   判掉的是用户等待时间。回复先发，判官在后面自己跑，用户感知不到多出来的那一次调用。
//
// 设计取舍：
//   · 只喂「他说了什么 + 她回了什么」，不带历史、不带人设全文——越小越稳，也越便宜
//   · maxTokens 120：只够一行 JSON，写不下别的，等于用预算强制它守格式
//   · temperature 0.2：判分要稳，不要发挥
//   · 串行队列：2C2G 的机器上并发几个判官请求会把主链路拖慢；同一进程内同时只跑一个
//   · 任何异常一律静默：判官是旁路，坏了不能连带把对话搞坏
//   · **防刷边界写在提示词里**（贬值规则 / 没信息量给 0 / 一天 8~15 / 负向下手轻）：
//     用户抱怨的是「聊一天一点变化都没有」，但矫枉过正成「聊一句 +3」两天就满级，
//     之后全是平的，同样不好使。所以每轮把「今天的账」也喂给它，让它自己收着给。
//
// 来源标记：写进 mood.log 的 why 前面加 [判]，
//   以后翻日志就能分清「她主动调的 feel」和「判官判的」——调参时这两类必须分开看。
'use strict';

const mood = require('./mood.js');

/** 只够一行 JSON，写不下别的 */
const MAX_TOKENS = 120;
/** 判分要稳，不要发挥 */
const TEMPERATURE = 0.2;
/** 和 mood.feel 的钳制保持一致：判官判超过 ±12 也按 ±12 算 */
const MAX_DELTA = mood.MAX_STEP;
/** 排队上限：超了丢最旧的。宁可漏判一次，也不能把消息堆在内存里 */
const MAX_QUEUE = 20;
/** 来源标记（见文件头） */
const MARK = '[判]';
/** 「今天的账」统计窗口：24 小时（和 mood.js 的 todayDigest 一致） */
const DAY_MS = 24 * 3600 * 1000;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function defaultLog(...a) {
  try { console.log('[feel-judge]', ...a); } catch { /* 控制台没了也不能崩 */ }
}

/** 截断到 n 字，超了加省略号（prompt 里不需要整段原文） */
function clip(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/* ---------- 串行队列 ----------
 * 为什么不直接 await：判官是旁路，调用方 fire-and-forget；
 * 但同一个进程里如果有 5 条消息同时到（房间刷屏），5 个请求并发出去
 * 会把上面那条真正要回复的请求挤掉。所以排队，一次只跑一个。
 */
const queue = [];
let running = false;
let dropped = 0;

/**
 * 排一个任务。队列满了丢最旧的（并给它一个 null，避免 promise 永远悬着）。
 *
 * @param {Function} run 返回 Promise 的任务体
 * @param {Function} resolve 任务结束时的回调（拿结果）
 * @param {Function} [log] 这个任务的日志函数（丢弃提示走它，测试里可以静音）
 */
function schedule(run, resolve, log) {
  while (queue.length >= MAX_QUEUE) {
    const old = queue.shift();
    dropped += 1;
    try { old.resolve(null); } catch { /* 调用方自己吞了异常 */ }
    try {
      const say = typeof old.log === 'function' ? old.log : defaultLog;
      say('队列满，丢掉最旧的一次判断');
    } catch { /* 日志坏了不影响排队 */ }
  }
  queue.push({ run, resolve, log });
  drain();
}

/** 队列泵：同一时刻只有一个 await 在飞 */
async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      let out = null;
      try {
        out = await job.run();
      } catch {
        // 双保险：run() 内部已经兜过一次，这里再兜一次，绝不让异常冒到调用方
        out = null;
      }
      try { job.resolve(out); } catch { /* 调用方自己吞了异常 */ }
    }
  } finally {
    running = false;
  }
}

/* ---------- 提示词 ---------- */

/**
 * 判官的系统提示词。
 *
 * 四条硬要求都写在这里：① 路径表原样给它（否则 kind 会自由发挥）
 * ② 心情枚举原样给它（否则会造出「暴躁」这种不在档位里的词）
 * ③ 只输出一行 JSON（解析器只认这一种形状）
 * ④ **防刷**：动得对才有「养」的感觉，动得滥两天就满级，之后全是平的
 *    （用户抱怨的是一天没变化，但矫枉过正成「聊一句 +3」，一天就 100 了，第二天没得涨，
 *     同样不好使——所以贬值规则、没信息量给 0、一天总量、负向下手轻，全写进提示词）
 */
function systemPrompt() {
  const paths = mood.PATHS.map((p) => `${p.key}（${p.when}）`).join('、');
  return [
    '你在做一件很小的事：读一段两个人的对话，判断「她」这一轮心里有没有动。',
    '只看这一来一回，不要脑补上下文，也不要替她编理由。',
    '',
    `可选的 kind（必须照抄其中一个 key，没有就留空）：${paths}`,
    `可选的 mood（必须照抄一个，没有就留空）：${mood.MOOD_LABELS.join('、')}`,
    '',
    '【怎么给分——这几条是硬边界，比「让数值动起来」重要】',
    '· 没有信息量的往来给 0：「在吗」「吃了没」「哈哈」「嗯」这种，就是 0。不要为了有变化而变化。',
    '· 同一类事当天重复要明显贬值：第一次叫昵称可以 +2，第五次、第十次最多 +1 甚至 0。',
    '  她不是计分器，天天听同一句话会腻——下面会给你「今天的账」，先看次数再定分值。',
    '· 一天总共涨 8~15 就差不多了，细水长流才像在养；一把刷满之后就没得涨了。',
    '· 负向一次别下重手：一次敷衍 -2 就够，别一句「哦」就扣 8。',
    '· 只算这一轮真的发生的事，别把上一轮的情绪再算一遍。',
    '',
    '只输出一行 JSON，不要解释、不要代码块：',
    '{"delta": 3, "kind": "昵称", "mood": "开心", "why": "他叫我小傻鱼"}',
    '',
    'delta 是整数，-12 ~ 12：日常小事 1~3；明显心动（说想你、撩她、记得她说过的事）4~8；',
    '被凶、被晾很久才给负数。没什么感觉就是 0，别硬凑。',
    'why 是写给她自己看的一句话，20 字以内，**用她自己的口气说他说了什么**：',
    '像「他叫我小傻鱼」「他说想我」「他一整天没来」；不要写成「用户使用了昵称」这种分析腔。',
  ].join('\n');
}

/**
 * 最近 24 小时各类事发生了几次，喂给判官做「贬值」判断。
 *
 * 为什么必须让它自己看见次数：模型只有「这一轮」的视野，
 * 不告诉它「昵称今天已经 5 次了」，它每一轮都会给 +2，一天就刷满。
 * 这份统计包含判官自己写的记录，所以是个自限闭环：越给越少。
 *
 * @param {number} [ts] 当前时间
 * @returns {string} 形如「昵称 5 次、陪着 2 次」；没有就返回空串
 */
function todayLedger(ts = Date.now()) {
  try {
    const st = mood.read();
    const log = Array.isArray(st && st.log) ? st.log : [];
    const counts = new Map();
    for (const e of log) {
      const kind = String((e && e.kind) || '').trim();
      if (!kind) continue;                    // 老记录没有 kind，不产生条目
      const t = Number(e && e.ts) || 0;
      if (!t || ts - t > DAY_MS) continue;     // 只算最近 24 小时
      counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    if (!counts.size) return '';
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, n]) => `${k} ${n} 次`)
      .join('、');
  } catch {
    return '';   // 读不到账不影响判分，最多是不会贬值
  }
}

/** 判官的用户消息：只有这一来一回 + 今天的账（用来贬值），不夹带历史 */
function userPrompt(userText, replyText, channel, ledger = '') {
  return [
    `【通道】${clip(channel || '聊天室', 12)}`,
    `【今天的账（最近 24 小时）】${ledger || '今天还没记过什么'}`,
    `【他说】${clip(userText, 400)}`,
    `【她回】${clip(replyText, 400)}`,
    '',
    '这一来一回，她心里动了吗？同类事今天已经做过很多次就少给分。只回一行 JSON。',
  ].join('\n');
}

/* ---------- 解析 ---------- */

/**
 * 从一段文本里抠出第一个完整的 JSON 对象（花括号配对，能跳过字符串里的括号）。
 *
 * 为什么不用 /\\{[\\s\\S]*?\\}/：模型有时在 why 里写「{」或者把 JSON 换行，
 * 非贪婪正则会在第一个 } 就截断，得到半截 JSON。
 */
function firstObject(s) {
  const text = String(s || '');
  const start = text.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';   // 括号没闭合（被 max_tokens 截断了）→ 当作没解析出来
}

/**
 * 解析判官的回复。**任何情况都不抛错**，解析不出来就是「没感觉」（delta 0）。
 *
 * 抗造的点：
 *   · ```json 围栏（前后都可能）→ 直接当空白符替换掉
 *   · 前后带闲聊文字 → 靠花括号配对抠出中间那个对象
 *   · delta 是字符串 "3" → Number 转换
 *   · delta 超范围 → 钳到 ±12（和 feel 的上限一致，别让它一句话刷满）
 *   · mood 不在枚举里 → 丢掉（不写进存档，避免污染档位词）
 *
 * @param {string} text 模型原文
 * @returns {{delta:number, kind:string, mood:string, why:string}}
 */
function parse(text) {
  const out = { delta: 0, kind: '', mood: '', why: '' };
  let s = String(text == null ? '' : text);
  if (!s.trim()) return out;
  s = s.replace(/```[a-zA-Z]*/g, ' ');          // 剥 ```json / ``` 围栏
  const objText = firstObject(s);
  if (!objText) return out;
  let o;
  try { o = JSON.parse(objText); } catch { return out; }   // 垃圾就当没感觉，绝不抛错
  if (!o || typeof o !== 'object') return out;

  const d = Math.round(Number(o.delta));
  out.delta = Number.isFinite(d) ? clamp(d, -MAX_DELTA, MAX_DELTA) : 0;

  /* kind 不白名单裁剪：它只是「哪一类」的标签，记下来不参与算分；
   * 真写歪了也是日志里多一个统计不到的词，没必要为此丢一次判断。 */
  out.kind = String(o.kind == null ? '' : o.kind).replace(/\s+/g, ' ').trim().slice(0, 12);

  /* mood 必须裁剪：它会被渲染成页面上的档位词，自由发挥会污染存档 */
  const label = String(o.mood == null ? '' : o.mood).trim();
  out.mood = mood.MOOD_LABELS.includes(label) ? label : '';

  out.why = String(o.why == null ? '' : o.why).replace(/\s+/g, ' ').trim().slice(0, 20);
  return out;
}

/* ---------- 判一次 ---------- */

/**
 * 真正跑一次判官（已经排队进来了）。
 *
 * @param {Function} rawLlm core.llmRaw 风格的函数 (messages, opts) => Promise<message>
 * @param {object} o { userText, replyText, channel, sessionId, log }
 * @returns {Promise<object>} {delta, kind, mood, why, applied, raw}；失败时 delta 0
 */
async function runJudge(rawLlm, o) {
  const log = typeof o.log === 'function' ? o.log : defaultLog;
  const result = { delta: 0, kind: '', mood: '', why: '', applied: 0, raw: '', ledger: '' };
  try {
    if (typeof rawLlm !== 'function') return result;
    /* 先取「今天的账」：判官要看见同类事今天做了几次，才会自己收着给。
     * 只读文件，失败就空着（最多不贬值，不影响判分）。 */
    const ledger = todayLedger();
    result.ledger = ledger;
    const msg = await rawLlm([
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userPrompt(o.userText, o.replyText, o.channel, ledger) },
    ], { maxTokens: MAX_TOKENS, temperature: TEMPERATURE });

    const text = typeof msg === 'string' ? msg : (msg && msg.content) || '';
    result.raw = String(text || '');
    const p = parse(text);
    result.delta = p.delta;
    result.kind = p.kind;
    result.mood = p.mood;
    result.why = p.why;

    /* 判 0 就不落盘：mood.feel(0) 在没报心情时不写文件，但仍要读一次档。
     * 一天几百轮，能省一次磁盘往返就省一次。 */
    if (!p.delta) return result;

    const r = mood.feel(p.delta, MARK + p.why, {
      mood: p.mood || undefined,     // undefined → 沿用旧心情（过期自动回平静）
      kind: p.kind || undefined,     // 只进 log 和「今天的账」，不参与算分
    });
    result.applied = Number(r && r.applied) || 0;
    try {
      log(`判 ${result.applied > 0 ? '+' : ''}${result.applied}${p.kind ? ` ${p.kind}` : ''}`
        + `${p.mood ? ` ${p.mood}` : ''}${p.why ? `「${p.why}」` : ''}`);
    } catch { /* 日志坏了不该影响结果 */ }
  } catch (e) {
    /* 旁路出错只写日志：判官坏了不能连带对话一起坏 */
    try { log('判官失败:', (e && e.message) || String(e)); } catch {}
  }
  return result;
}

/**
 * 判一次「这一来一回」。
 *
 * 调用方一律 fire-and-forget：`judge(core.llmRaw, {...}).catch(() => {})`。
 * 返回的 Promise 一定会 resolve（成功给结果，失败/队列丢弃给 null），不会 reject。
 *
 * @param {Function} rawLlm core.llmRaw（或任何 (messages, {maxTokens, temperature}) => Promise<message>）
 * @param {object} opts { userText, replyText, channel, sessionId, log }
 * @returns {Promise<{delta:number, kind:string, mood:string, why:string, applied:number}|null>}
 */
async function judge(rawLlm, opts = {}) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const userText = clip(o.userText, 800);
  const replyText = clip(o.replyText, 800);
  // 缺一边就没得判（比如她只发表情包、或者用户消息是空文件）
  if (!userText || !replyText) return null;
  return new Promise((resolve) => {
    schedule(() => runJudge(rawLlm, {
      ...o, userText, replyText,
    }), resolve, o.log);
  });
}

/** 运维/测试：看一眼队列积压（不打日志，随时可调） */
function stats() {
  return { queued: queue.length, running, dropped };
}

module.exports = {
  judge, parse, stats, todayLedger,
  systemPrompt, userPrompt, firstObject,
  MARK, MAX_TOKENS, TEMPERATURE, MAX_QUEUE, MAX_DELTA, DAY_MS,
};
