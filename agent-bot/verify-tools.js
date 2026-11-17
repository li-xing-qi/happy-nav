/**
 * 记忆工具验收（零依赖、不联网、不碰真实数据）。
 *
 * 验的是「工具通道」这一层：模型给参数 → tools.runTool → core.writeRule →
 * memory/adapters.addRuleFromModel → store。判断权在模型，这里只验
 * 「否决权还在代码里」：缺上下文、放弃类措辞、非法 scope、假 id 都必须被拦。
 *
 * 另外钉住**工具定义的形状**：线上出过一次 list_rules 少写 type:'function'，
 * 服务端反序列化阶段直接 422（tools[11]: missing field type），三条通道一起不回话。
 * 这种故障没有任何弹窗，用户只会觉得「她不理我」，所以必须用断言守住。
 *
 * 跑：node agent-bot/verify-tools.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TMP = process.env.VERIFY_TMP || path.join(__dirname, '..', 'memory', 'data', `.verify-tools-${process.pid}`);
fs.mkdirSync(path.join(TMP, 'data'), { recursive: true });
process.env.QQ_WORKSPACE_ROOT = TMP;
process.env.MEMORY_LLM = 'off';                       // 工具通道不该调模型
process.env.MEMORY_MD_FILE = path.join(TMP, 'MEMORY.md');

const core = require('./core.js');
const tools = require('./tools.js');
const rememberLib = require('./lib/remember.js');

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}${extra ? ` → ${extra}` : ''}`); }
}

const memCtx = { channel: 'chat', game: '', sessionId: '0000' };
const ctx = {
  log: () => {},
  memCtx,
  writeRule: core.writeRule,
  listRules: core.listRules,
  revokeRule: core.revokeRule,
  rememberFact: (f) => rememberLib.remember(f),
  /* 故意保持两参调用：这就是线上 dsh 插件 / 老代码的写法，
   * mood.feel 的第三参（mood/kind）必须可选，改坏了这里会先炸。 */
  feel: (d, why) => require('./lib/mood.js').feel(d, why),
};

/**
 * 校验工具定义的结构，返回不合规的条数。
 * 服务端要的是 OpenAI 那套形状：{ type:'function', function:{ name, parameters } }，
 * 少一个字段就在反序列化阶段整体 422——不是这个工具有问题，是**整批请求**被拒。
 * 所以失败时一定要把 index 和 name 打出来，不然 13 个工具里找不出是哪个。
 */
function checkToolShape(list, label) {
  let bad = 0;
  (Array.isArray(list) ? list : []).forEach((t, i) => {
    const fn = t && t.function;
    const okShape = t && typeof t === 'object'
      && t.type === 'function'
      && fn && typeof fn === 'object'
      && typeof fn.name === 'string' && fn.name.trim().length > 0
      && fn.parameters && typeof fn.parameters === 'object' && !Array.isArray(fn.parameters);
    if (!okShape) {
      bad += 1;
      const name = fn && fn.name;
      console.log(`  ✗ ${label}[${i}] 形状不合规 → name=${JSON.stringify(name)} type=${JSON.stringify(t && t.type)}`);
    }
  });
  return bad;
}

(async () => {
  console.log('\n[case] 工具清单');
  const names = tools.TOOLS.map((t) => t.function.name);
  for (const n of ['save_rule', 'remember_fact', 'list_rules', 'revoke_rule', 'feel']) {
    ok(names.includes(n), `TOOLS 里有 ${n}`);
  }
  ok(names.length === new Set(names).size, '工具名无重复');

  console.log('\n[case] 工具定义形状（线上「她不回话」事故的回归点）');
  /* 事故复盘：线上 tools.js 的 list_rules 少了 type:'function'，
   * 只要请求带 tools 就 422（tools[11]: missing field type），模型一次都没被调用。
   * 表现是「她不回我」，不是报错，所以只能靠断言守。 */
  const badMain = checkToolShape(tools.TOOLS, 'TOOLS');
  ok(badMain === 0, `TOOLS 全部合规（${tools.TOOLS.length} 个：type / function.name / parameters 齐全）`, `${badMain} 个不合规`);
  /* 往返检查：如果有人塞进 undefined 或函数，序列化时字段会静默丢掉，
   * 发出去的 JSON 就少了 type/parameters，服务端同样 422。 */
  const roundTrip = JSON.parse(JSON.stringify(tools.TOOLS));
  ok(JSON.stringify(roundTrip) === JSON.stringify(tools.TOOLS), 'JSON 序列化往返后结构不变（没有 undefined/函数）');
  ok(names.length === new Set(names).size, '工具名唯一（重名时服务端行为不可预期）', `${names.length}/${new Set(names).size}`);

  /* 棋牌场景只传这 5 个：tools[3] 报错的现场就是从这儿来的，单独再核一遍 */
  const memTools = require('./lib/agent-tools.js').MEMORY_TOOLS;
  ok(memTools.length === 5, 'MEMORY_TOOLS 是 5 个（棋牌链路的全部工具）', String(memTools.length));
  const badMem = checkToolShape(memTools, 'MEMORY_TOOLS');
  ok(badMem === 0, 'MEMORY_TOOLS 形状同样合规（五子棋 / 万象牌）', `${badMem} 个不合规`);

  console.log('\n[case] save_rule 正常落库');
  const r1 = await tools.runTool('save_rule', { text: '出牌优先打带格挡效果的牌', scope: 'game' }, ctx);
  ok(/^已记下/.test(r1), '返回「已记下」', r1);
  const list1 = core.listRules(memCtx);
  ok(list1.length === 1, '生效列表里有 1 条', JSON.stringify(list1));
  ok(list1[0].text.includes('格挡'), '正文正确', JSON.stringify(list1[0]));
  ok(list1[0].id && r1.includes(list1[0].id), '返回里带 id，可与列表对上');

  console.log('\n[case] list_rules / revoke_rule');
  const lr = await tools.runTool('list_rules', {}, ctx);
  ok(lr.includes(list1[0].id) && lr.includes('格挡'), 'list_rules 能列出它', lr);
  const rr = await tools.runTool('revoke_rule', { id: list1[0].id }, ctx);
  ok(/^已撤销/.test(rr), '按 id 撤销成功', rr);
  ok(core.listRules(memCtx).length === 0, '撤销后不再生效');
  const rr2 = await tools.runTool('revoke_rule', { id: 'r-不存在' }, ctx);
  ok(/没有找到/.test(rr2), '假 id 不会乱撤，返回找不到', rr2);

  console.log('\n[case] 否决权：缺上下文 / 放弃类措辞 / 非法 scope');
  const noCtx = await tools.runTool('save_rule', { text: '以后都先防守', scope: 'game' }, Object.assign({}, ctx, { memCtx: {} }));
  ok(/^未记录/.test(noCtx) && /上下文/.test(noCtx), '缺 ctx 被拒且说明原因', noCtx);
  ok(core.listRules({ channel: 'chat' }).length === 0, '缺 ctx 时确实没落库');

  const bad = await tools.runTool('save_rule', { text: '这局打不过，以后再说吧', scope: 'game' }, ctx);
  ok(/^未记录/.test(bad) && /不构成约定/.test(bad), '放弃/拖延类被拒', bad);
  ok(core.listRules(memCtx).length === 0, '放弃类没有落库');

  const weird = await tools.runTool('save_rule', { text: '以后都先看对面手牌', scope: 'forever' }, ctx);
  ok(/^已记下/.test(weird), '非法 scope 不报错，仍然写', weird);
  const wl = core.listRules(memCtx);
  ok(wl.length === 1 && wl[0].scope === 'session', '非法 scope 收敛成 session（不长期化）', JSON.stringify(wl));
  core.revokeRule(wl[0].id);

  console.log('\n[case] remember_fact 落盘与去重');
  const f1 = await tools.runTool('remember_fact', { fact: '老板下周三考离散数学' }, ctx);
  ok(/^已写进长期记忆/.test(f1), '事实写入成功', f1);
  const txt = fs.readFileSync(process.env.MEMORY_MD_FILE, 'utf8');
  ok(txt.includes('下周三考离散数学'), 'MEMORY.md 里真的有这条');
  const f2 = await tools.runTool('remember_fact', { fact: '老板下周三考离散数学' }, ctx);
  ok(/没有写入/.test(f2), '同一条写两次会被去重', f2);
  const f3 = await tools.runTool('remember_fact', { fact: '' }, ctx);
  ok(/是空的/.test(f3), '空内容不写', f3);

  console.log('\n[case] feel：她给分，脚本只钳制');
  const m1 = await tools.runTool('feel', { delta: 6, why: '他夸我' }, ctx);
  ok(/更亲近/.test(m1), '正数 → 更亲近', m1);
  const m2 = await tools.runTool('feel', { delta: -4, why: '他敷衍我' }, ctx);
  ok(/疏远/.test(m2), '负数 → 疏远', m2);
  const m3 = await tools.runTool('feel', { delta: 0 }, ctx);
  ok(/没有变化/.test(m3), '0 不产生变化', m3);
  const m4 = await tools.runTool('feel', { delta: 999 }, ctx);
  ok(m4 && !/999/.test(m4), '超大值被钳制，且不把数字念给模型', m4);
  /* 心情标签在两处各写了一份（工具 schema 的 enum / mood.js 的枚举表）。
   * 两份漂移的后果是「模型报了心情，代码不认」，所以钉住它们必须一致。 */
  const feelDef = tools.TOOLS.find((t) => t.function.name === 'feel');
  const moodEnum = feelDef && feelDef.function.parameters.properties.mood.enum;
  const labels = require('./lib/mood.js').MOOD_LABELS;
  ok(Array.isArray(moodEnum) && moodEnum.join('|') === labels.join('|'), 'feel 的 mood 枚举与 mood.js 的标签表一致', String(moodEnum));
  const kindEnum = feelDef && feelDef.function.parameters.properties.kind.enum;
  const kinds = require('./lib/mood.js').FEEL_KINDS;
  ok(Array.isArray(kindEnum) && kindEnum.join('|') === kinds.join('|'), 'feel 的 kind 枚举与 mood.js 的路径表一致', String(kindEnum));

  console.log('\n[case] 场景没接记忆时降级不报错');
  const bare = await tools.runTool('save_rule', { text: '以后都先防守', scope: 'game' }, { log: () => {} });
  ok(/不支持写约定/.test(bare), '未接线时明确说「不支持」而不是抛错', bare);

  console.log('\n[case] 工具循环（棋局 / 卡牌走这条）');
  const { chatWithMemoryTools, MEMORY_TOOLS, makeMemoryCtx } = require('./lib/agent-tools.js');
  ok(MEMORY_TOOLS.length === 5, '只暴露记忆/心情工具（不含画图 / 发表情）', String(MEMORY_TOOLS.length));
  const gameCtx = makeMemoryCtx(core, { channel: 'game', game: 'gomoku', sessionId: 'S9', room: 'S9', log: () => {} });
  let round = 0;
  const stub = async (msgs, opts) => {
    round += 1;
    if (round === 1) {
      ok(Array.isArray(opts.tools) && opts.tools.length === 5, '第一轮请求里带了 5 个工具');
      return {
        content: '',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'save_rule', arguments: JSON.stringify({ text: '以后都先补盾再进攻', scope: 'game' }) } }],
      };
    }
    const last = msgs[msgs.length - 1] || {};
    ok(last.role === 'tool' && /已记下/.test(String(last.content)), '第二轮看得到工具回执', JSON.stringify(last).slice(0, 90));
    return { content: '行，记住了。' };
  };
  const out = await chatWithMemoryTools(stub, [{ role: 'user', content: '以后都先补盾再进攻' }], gameCtx, { maxTokens: 100 });
  ok(out === '行，记住了。', '最终正文原样返回', out);
  ok(core.listRules(gameCtx.memCtx).some((r) => r.text.includes('补盾')), '规则真的落库了（不是只回了句话）');

  let round2 = 0;
  const plain = async () => { round2 += 1; return { content: '嗯。' }; };
  const out2 = await chatWithMemoryTools(plain, [{ role: 'user', content: '你好' }], gameCtx, {});
  ok(out2 === '嗯。' && round2 === 1, '模型不调工具时，行为和原来的 llm() 一致（一次调用）', `${out2}/${round2}`);

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

  console.log(`\n[verify-tools] 结果：${pass}/${pass + fail} 通过`);
  if (fail) { console.log('[verify-tools] 有失败'); process.exit(1); }
  console.log('[verify-tools] 全部通过');
})();
