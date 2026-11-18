/**
 * 事后判官验收（零依赖、不联网、不碰真实数据）
 *
 * 验的是「判官这条旁路可靠不可靠」，不是「判得准不准」：
 *   · 解析抗造：正常 JSON / ```json 围栏 / 前后夹闲聊 / 纯垃圾 / 截断 → 都不许抛错
 *   · 边界：delta 超范围被钳到 ±12；非法 mood 落库前被丢；kind 原样进 log 但不参与算分
 *   · delta 0 不落盘（省一次写盘，一天几百轮）
 *   · 失败静默：模型报错 → delta 0，不抛到调用方（旁路不能带崩对话）
 *   · 串行队列：同一进程内同时只跑一个；队列超上限丢最旧的
 *   · 来源标记：写进 log 的 why 带 [判]，以后能和她主动调的 feel 分开统计
 *
 * 跑：node agent-bot/verify-judge.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TMP = process.env.VERIFY_TMP || fs.mkdtempSync(path.join(os.tmpdir(), 'verify-judge-'));
fs.mkdirSync(TMP, { recursive: true });
/* 先指到临时档，再 require：mood.js 在模块加载时就算出了默认路径 */
process.env.MOOD_FILE = path.join(TMP, 'mood.json');
process.env.MEMORY_LLM = 'off';

const mood = require('./lib/mood.js');
const judge = require('./lib/feel-judge.js');

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}${extra ? ` → ${extra}` : ''}`); }
}
function reset(patch = {}) {
  try { fs.rmSync(process.env.MOOD_FILE, { force: true }); } catch {}
  if (Object.keys(patch).length) mood.setState(patch);
}
/** 假模型：返回固定文本 */
const fakeLlm = (content) => async () => ({ role: 'assistant', content });
/** 假模型：直接抛错 */
const boomLlm = async () => { throw new Error('模拟模型 500'); };

(async () => {
  console.log('\n[case] 解析：正常 JSON');
  const p1 = judge.parse('{"delta": 3, "kind": "昵称", "mood": "开心", "why": "他叫我小傻鱼"}');
  ok(p1.delta === 3, 'delta 解析正确', String(p1.delta));
  ok(p1.kind === '昵称', 'kind 解析正确', p1.kind);
  ok(p1.mood === '开心', 'mood 解析正确', p1.mood);
  ok(p1.why === '他叫我小傻鱼', 'why 解析正确', p1.why);

  console.log('\n[case] 解析：```json 围栏');
  const p2 = judge.parse('```json\n{"delta": 5, "kind": "想你", "mood": "撒娇", "why": "他说想我"}\n```');
  ok(p2.delta === 5 && p2.kind === '想你' && p2.mood === '撒娇', '围栏包裹也能抠出来', JSON.stringify(p2));

  console.log('\n[case] 解析：前后带闲聊文字');
  const p3 = judge.parse('她这一轮动了一下：{"delta": 2, "kind": "陪着", "mood": "", "why": "一起待着"} 就这样吧');
  ok(p3.delta === 2 && p3.kind === '陪着', '前后夹着闲聊也能找到 JSON', JSON.stringify(p3));
  /* why 里带花括号：非贪婪正则会截断，这里用的是花括号配对，必须扛得住 */
  const p3b = judge.parse('{"delta": 1, "kind": "陪着", "mood": "", "why": "他说{今天}好累"}');
  ok(p3b.why === '他说{今天}好累', 'why 里的花括号不会把 JSON 截断', p3b.why);

  console.log('\n[case] 解析：纯垃圾 / 空 / 截断 → delta 0，不抛错');
  for (const bad of ['', '我不知道', '嗯', null, undefined, '{坏掉的 JSON', '{"delta": 3, "kind": "昵称"']) {
    let threw = false;
    let out = null;
    try { out = judge.parse(bad); } catch { threw = true; }
    ok(!threw && out && out.delta === 0, `垃圾输入 ${JSON.stringify(bad)} → delta 0 且不抛错`);
  }

  console.log('\n[case] 解析：delta 边界');
  ok(judge.parse('{"delta": 99}').delta === judge.MAX_DELTA, `超上限钳到 +${judge.MAX_DELTA}`);
  ok(judge.parse('{"delta": -99}').delta === -judge.MAX_DELTA, `超下限钳到 -${judge.MAX_DELTA}`);
  ok(judge.parse('{"delta": "7"}').delta === 7, '字符串数字也认', 'string 7');
  ok(judge.parse('{"delta": "很多"}').delta === 0, 'delta 不是数字 → 0');

  console.log('\n[case] 解析：kind / mood 的合法性');
  ok(judge.parse('{"delta":2,"mood":"暴躁"}').mood === '', '非法 mood 被丢掉（不写进档位词）');
  ok(judge.parse('{"delta":2,"mood":"得意"}').mood === '得意', '合法 mood 保留');
  ok(judge.parse('{"delta":2,"kind":"自己编的类"}').kind === '自己编的类', 'kind 不裁剪（只进 log，不参与算分）');

  console.log('\n[case] 提示词：路径表与心情枚举必须原样给它');
  const sys = judge.systemPrompt();
  const missingPaths = mood.PATHS.filter((p) => !sys.includes(`${p.key}（`));
  ok(missingPaths.length === 0, `13 条路径 key 都在提示词里`, missingPaths.map((p) => p.key).join(','));
  const missingMoods = mood.MOOD_LABELS.filter((l) => !sys.includes(l));
  ok(missingMoods.length === 0, '心情枚举都在提示词里', missingMoods.join(','));
  ok(/\{"delta"/.test(sys), '提示词里给了输出样例');

  console.log('\n[case] 防刷边界：动得对才有「养」的感觉（这条比「让数值动起来」更重要）');
  ok(/没有信息量的往来给 0/.test(sys) && /在吗/.test(sys) && /吃了没/.test(sys),
    '没信息量的寒暄明确给 0（不为了有变化而变化）');
  ok(/贬值/.test(sys) && /第五次/.test(sys), '同类事当天重复要明显贬值，且给了具体次数参照');
  ok(/8~15/.test(sys), '一天总增量给了 8~15 的参照（写在提示词，不硬限制代码）');
  ok(/-2 就够/.test(sys) && /别一句「哦」就扣 8/.test(sys), '负向下手轻：一次敷衍 -2 就够');
  ok(/用她自己的口气/.test(sys) && /不要写成「用户使用了昵称」/.test(sys),
    'why 要照抄她的口吻，不许写成分析腔');

  console.log('\n[case] 今天的账：让判官自己看见「同类事今天几次了」');
  reset({ affinity: 60 });
  const nowTs = Date.now();
  mood.setState({
    affinity: 60,
    log: [
      { ts: nowTs - 1000, d: 2, why: '他叫我小傻鱼', kind: '昵称' },
      { ts: nowTs - 2000, d: 2, why: '他又叫我小傻鱼', kind: '昵称' },
      { ts: nowTs - 3000, d: 1, why: '他陪我聊天', kind: '陪着' },
      { ts: nowTs - 4000, d: 1, why: '很久以前', kind: '昵称' },
      { ts: nowTs - (judge.DAY_MS + 60000), d: 3, why: '两天前的', kind: '想你' },   // 超窗口，不算
    ],
  });
  const ledger = judge.todayLedger();
  ok(/昵称 3 次/.test(ledger), '今天的账统计到「昵称 3 次」', ledger);
  ok(/陪着 1 次/.test(ledger), '顺带统计到「陪着 1 次」', ledger);
  ok(!/想你/.test(ledger), '超过 24 小时的不进账', ledger);
  const up = judge.userPrompt('叫我小傻鱼', '讨厌啦', 'chat', ledger);
  ok(/【今天的账/.test(up) && /昵称 3 次/.test(up), '账目进了判官的 user 消息', up.split('\n')[1]);
  ok(/今天还没记过什么/.test(judge.userPrompt('在吗', '在', 'chat', '')), '没账时给一句兜底文案，不留空');

  console.log('\n[case] 真的判一次：落库 + 来源标记');
  reset({ affinity: 60 });
  const seenOpts = [];
  const spyLlm = async (messages, opts) => {
    seenOpts.push({ opts, messages });
    return { role: 'assistant', content: '```json\n{"delta": 4, "kind": "想你", "mood": "撒娇", "why": "他说想我"}\n```' };
  };
  const out = await judge.judge(spyLlm, {
    userText: '想你了', replyText: '我也想你', channel: 'chat', sessionId: 'r1', log: () => {},
  });
  ok(out && out.delta === 4 && out.applied === 4, '判官返回 delta/applied', JSON.stringify(out && { d: out.delta, a: out.applied }));
  const st = mood.read();
  const last = st.log[st.log.length - 1] || {};
  ok(last.d === 4, '分数变化落进了 log', String(last.d));
  ok(last.kind === '想你', 'kind 落进了 log', last.kind);
  ok(String(last.why || '').startsWith(judge.MARK), `why 带来源标记 ${judge.MARK}`, last.why);
  ok(st.mood && st.mood.label === '撒娇', '心情落库', st.mood && st.mood.label);
  ok(Math.round(st.affinity) === 64, '亲密度按 delta 走（60 → 64）', String(st.affinity));
  const first = seenOpts[0] || {};
  ok(first.opts && first.opts.maxTokens === 120, '请求是极小的：maxTokens 120', String(first.opts && first.opts.maxTokens));
  ok(first.opts && first.opts.temperature === 0.2, 'temperature 0.2（判分要稳）', String(first.opts && first.opts.temperature));
  ok(Array.isArray(first.messages) && first.messages.length === 2, '只发两条消息（不夹带历史）', String(first.messages && first.messages.length));
  ok(/【今天的账/.test(String(first.messages && first.messages[1] && first.messages[1].content)),
    '请求里带了今天的账（判官贬值判断的依据）');

  console.log('\n[case] delta 0 不落盘（省一次写盘）');
  reset({ affinity: 70 });
  const realFeel = mood.feel;
  let feelCalls = 0;
  mood.feel = (...args) => { feelCalls += 1; return realFeel(...args); };
  const zero = await judge.judge(fakeLlm('{"delta": 0, "kind": "", "mood": "", "why": ""}'), {
    userText: '嗯', replyText: '嗯嗯', channel: 'chat', log: () => {},
  });
  mood.feel = realFeel;
  ok(feelCalls === 0, 'delta 0 时不调 mood.feel', `调用 ${feelCalls} 次`);
  ok(zero && zero.delta === 0 && zero.applied === 0, 'delta 0 正常返回', JSON.stringify(zero && { d: zero.delta, a: zero.applied }));

  console.log('\n[case] 落库前的过滤（kind 原样进 log 但不参与算分）');
  reset({ affinity: 60, mood: { label: '平静', at: Date.now() } });
  mood.feel(4, '他凶我', { kind: '乱七八糟', mood: '暴躁' });
  const after = mood.read();
  const lastAfter = after.log[after.log.length - 1] || {};
  ok(lastAfter.kind === '乱七八糟', 'kind 原样进 log（不在表里也照记）', lastAfter.kind);
  ok(Math.round(after.affinity) === 64, 'kind 不参与算分：只跟 delta 走', String(after.affinity));
  ok(after.mood && after.mood.label === '平静', '非法 mood 没有污染存档', after.mood && after.mood.label);

  console.log('\n[case] 失败静默：模型报错不能抛到调用方');
  reset({ affinity: 55 });
  let threw = false;
  let errOut = null;
  try {
    errOut = await judge.judge(boomLlm, { userText: '在吗', replyText: '在', channel: 'chat', log: () => {} });
  } catch { threw = true; }
  ok(!threw, '模型报错时 judge 不 reject');
  ok(errOut && errOut.delta === 0 && errOut.applied === 0, '报错按「没感觉」处理', JSON.stringify(errOut && { d: errOut.delta }));
  ok(Math.round(mood.read().affinity) === 55, '报错时不改分数', String(mood.read().affinity));

  console.log('\n[case] 缺一边就不判（不浪费一次请求）');
  let called = 0;
  const countLlm = async () => { called += 1; return { content: '{"delta":1}' }; };
  const none = await judge.judge(countLlm, { userText: '   ', replyText: '', channel: 'chat' });
  ok(none === null && called === 0, '用户空 / 回复空 → 直接跳过，不发请求');

  console.log('\n[case] 同一轮不许计两次分：她记过了，判官就不许再判（上线后实测踩过）');
  /* 现场长这样：
   *   [gomoku] 工具 feel → 记下了，你现在对他更亲近了一点。   ← 她自己调的（d:3）
   *   [gomoku] 判 +2 一起玩 开心「他叫我鱼鱼，还邀我下棋」    ← 判官 1 秒后又判（d:2）
   * 一轮 +5，日闸门 15 分三四条消息就吃光，用户只会觉得「聊几句又不动了」。
   * 所以 since（本轮开始处理的时刻）之后只要她自己记过，judge 必须整个跳过、连请求都不发。 */
  reset({ affinity: 60 });
  mood.feel(3, '他叫我鱼鱼', { kind: '一起玩' });          // 她这一轮自己记的
  let skipCalled = 0;
  const skipLlm = async () => { skipCalled += 1; return { content: '{"delta":2}' }; };
  const skipLogs = [];
  const skipped = await judge.judge(skipLlm, {
    userText: '鱼鱼下棋吗', replyText: '来呀', channel: 'gomoku',
    since: Date.now() - 1000, log: (m) => skipLogs.push(String(m)),
  });
  ok(skipped === null, '跳过时返回 null', JSON.stringify(skipped));
  ok(skipCalled === 0, '一次模型请求都没发（省 token 也省延迟）', `调用 ${skipCalled} 次`);
  ok(skipLogs.some((l) => /跳过/.test(l)), '日志里写了「跳过」', skipLogs.join(' | '));
  const scored = mood.read();
  ok(scored.affinity === 63 && scored.log.filter((e) => e.kind === '一起玩').length === 1,
    '这一轮只有她记的那一条（+3），没有被判官叠成 +5', `${scored.affinity}/${scored.log.length}`);

  console.log('\n[case] 她这一轮没记 → 判官照常补判');
  fs.writeFileSync(process.env.MOOD_FILE, JSON.stringify({
    affinity: 60, updatedAt: Date.now(), band: '还算熟',
    log: [{ ts: Date.now() - 3600 * 1000, d: 2, why: '很久以前', kind: '陪着' }],
  }));
  const fill = await judge.judge(fakeLlm('{"delta":2,"kind":"昵称","mood":"开心","why":"他叫我小傻鱼"}'), {
    userText: '小傻鱼', replyText: '嗯？', channel: 'chat',
    since: Date.now() - 1000, log: () => {},
  });
  ok(fill && fill.applied === 2, '判官正常判了 +2', JSON.stringify(fill && { d: fill.delta, a: fill.applied }));
  ok(Math.round(mood.read().affinity) === 62, '分数落库（60 → 62）', String(mood.read().affinity));

  console.log('\n[case] 上一轮判官自己的记录不该挡住这一轮');
  /* 上一轮的判官记录时间戳可能落在这轮消息之后（用户在她回复期间又补一句）。
   * 那种记录 why 带 [判]，不算「她记过了」，否则这一轮会被误跳过、白漏一次评分。 */
  reset({ affinity: 60 });
  mood.feel(2, `${judge.MARK}上一轮判的`, { kind: '陪着' });   // 模拟上一轮判官的记录
  let againCalled = 0;
  const againLlm = async () => { againCalled += 1; return { content: '{"delta":3}' }; };
  const again = await judge.judge(againLlm, {
    userText: '在吗', replyText: '在', channel: 'chat', since: Date.now() - 1000, log: () => {},
  });
  ok(againCalled === 1, '没有被 [判] 记录误拦，照常发请求', `调用 ${againCalled} 次`);
  ok(again && again.applied === 3, '这一轮照常判分', JSON.stringify(again && { a: again.applied }));

  console.log('\n[case] 不传 since → 保持老行为（向后兼容）');
  const legacy = await judge.judge(fakeLlm('{"delta":1,"kind":"陪着","mood":"","why":"一起待着"}'), {
    userText: '在吗', replyText: '在呀', channel: 'chat', log: () => {},
  });
  ok(legacy && legacy.applied === 1, '没传 since 时照常判', JSON.stringify(legacy && { a: legacy.applied }));

  console.log('\n[case] 串行队列：同时只跑一个');
  reset({ affinity: 55 });
  let live = 0;
  let maxLive = 0;
  const slowLlm = async () => {
    live += 1;
    maxLive = Math.max(maxLive, live);
    await new Promise((r) => setTimeout(r, 15));
    live -= 1;
    return { content: '{"delta": 1, "kind": "陪着", "mood": "", "why": "一起待着"}' };
  };
  await Promise.all([1, 2, 3, 4].map(() => judge.judge(slowLlm, {
    userText: '在吗', replyText: '在呀', channel: 'chat', log: () => {},
  })));
  ok(maxLive === 1, '并发发 4 次，实际同时只跑 1 个', `最大并发 ${maxLive}`);

  console.log('\n[case] 队列上限：超了丢最旧的，不堆内存');
  const before = judge.stats().dropped;
  const burst = [];
  for (let i = 0; i < judge.MAX_QUEUE + 10; i += 1) {
    burst.push(judge.judge(slowLlm, { userText: '在吗', replyText: '在呀', channel: 'chat', log: () => {} }));
  }
  const results = await Promise.all(burst);
  const dropped = judge.stats().dropped - before;
  ok(dropped > 0, `队列上限 ${judge.MAX_QUEUE}：超出的被丢掉`, `丢了 ${dropped} 次`);
  ok(results.some((r) => r === null), '被丢掉的那几次 resolve(null)，不会永远悬着');
  ok(judge.stats().queued === 0 && judge.stats().running === false, '跑完之后队列是空的', JSON.stringify(judge.stats()));

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

  console.log(`\n[verify-judge] 结果：${pass}/${pass + fail} 通过`);
  if (fail) { console.log('[verify-judge] 有失败'); process.exit(1); }
  console.log('[verify-judge] 全部通过');
})();
