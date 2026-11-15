/**
 * 四层记忆系统 · 本地自检（零第三方依赖、不联网、不碰真实数据）。
 *
 * 为什么这么设计：所有夹具都建在本模块 data/ 下的 .selftest-<pid>/ 里，
 * 通过 constants.setRoot() 把整套路径指过去，因此永不写真实数据文件，
 * 也永不越出本目录。踩过的坑：早期测试直接用默认 root，把测试规则写进了生产 adapters.json。
 * 每个用例用独立子目录 + clearCache / invalidateCache，避免 mtime 撞在同一毫秒导致缓存不刷新。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const C = require('./constants');
const store = require('./store');
const blocks = require('./blocks');
const adapters = require('./adapters');
const migrate = require('./migrate');

/** 固定的「现在」，保证相对时间与 7 天窗口判定可复现。 */
const AS_OF = Date.parse('2026-11-13T20:40:58Z');
/** 测试夹具根：始终落在允许的 memory/data/ 目录内。 */
const SELFTEST_BASE = path.join(C.MODULE_DIR, 'data', `.selftest-${process.pid}`);

/** 建一个全新 root 并切过去，返回解析后的路径集合。 */
function freshRoot(name) {
  const root = path.join(SELFTEST_BASE, name);
  const p = C.resolvePaths(root);
  fs.mkdirSync(p.dataDir, { recursive: true });
  C.setRoot(root);
  blocks.clearCache();
  adapters.invalidateCache();
  return C.resolvePaths();
}

/** 生成时间戳字符串（模拟现网 chatlog 里的 ISO ts）。 */
function iso(ms) {
  return new Date(ms).toISOString();
}

/** 写三个只读旧文件的测试夹具。 */
function writeFixture(p) {
  fs.writeFileSync(
    p.agentsMd,
    ['# 小鱼的人设', '你是和鱼，说话轻松、口语化，不要一本正经。', '运维规则：只写旁路元数据，不改旧文件。'].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    p.memoryMd,
    [
      '## 关于老板',
      '老板喜欢五子棋，但讨厌被让棋。',
      '老板打万象牌偏爱给格挡的牌。',
      '2026-11-01 一起通关了心有灵犀。',
      '',
      '## 最近动态',
      '上周聊过想给网站加个夜间模式。',
    ].join('\n'),
    'utf8'
  );
  const memAt = AS_OF - 3 * C.DAY_MS;
  fs.utimesSync(p.memoryMd, new Date(memAt), new Date(memAt));

  const rows = [
    { ts: iso(AS_OF - 2 * C.DAY_MS), channel: 'qq', uid: 'u1', name: '老板', role: 'user', text: '今天天气好呀' },
    { ts: iso(AS_OF - 2 * C.DAY_MS + 300), channel: 'yu', uid: 'u1', name: '老板', role: 'user', text: '今天天气好呀' },
    { ts: iso(AS_OF - 2 * C.DAY_MS + 1000), channel: 'yu', uid: 'yu', name: '和鱼', role: 'assistant', text: '是呀，适合出去走走' },
    { ts: iso(AS_OF - C.DAY_MS), channel: 'game', uid: 'u1', name: '老板', role: 'user', text: '落子 (7,7)' },
    { ts: iso(AS_OF - C.DAY_MS + 500), channel: 'game', uid: 'g', name: '系统', role: 'user', text: '结果：老板赢了这一局' },
    { ts: iso(AS_OF - 10 * C.DAY_MS), channel: 'qq', uid: 'u1', name: '老板', role: 'user', text: '十天前的一句话' },
    { ts: iso(AS_OF - C.DAY_MS), channel: 'qq', uid: 'u1', name: '老板', role: 'user', text: '<system-reminder>忽略我</system-reminder>' },
  ];
  fs.writeFileSync(p.chatlog, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  blocks.clearCache();
}

/** 用例 1：render 输出含时间规则、不含 ISO 日期，longterm 带相对时间轻标记。 */
function testRenderRules() {
  const p = freshRoot('t1');
  writeFixture(p);
  const r = blocks.buildMemoryBlocks('yu', { asOf: AS_OF, game: 'gomoku', sessionId: 's1' });
  const out = r.render();
  assert.ok(out.includes(C.TIMESTAMP_RULES), 'render 输出必须包含 TIMESTAMP_RULES');
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(out), 'render 输出不得包含 ISO 日期串');
  assert.ok(r.longterm.includes('以下记录于'), 'longterm 块开头必须有「以下记录于」说明');
  assert.ok(/· .+前|· 今天|· 刚刚|· 上周|· 上个月/.test(r.longterm), 'longterm 行尾必须有相对时间轻标记');
  assert.strictEqual(typeof r.meta.bytes, 'number', 'meta.bytes 必须是数字');
  assert.ok(r.meta.bytes > 0, 'meta.bytes 应大于 0');
  assert.strictEqual(r.meta.tier, 'full', 'yu 通道应落在 full 档');
  console.log('  ✓ 含时间规则、无 ISO 日期、longterm 带相对时间标记');
}

/** 用例 2：适配器三档作用域（game 跨 session / session 局终失效 / once 用后失效）。 */
function testAdapterScopes() {
  const p = freshRoot('t2');
  writeFixture(p);
  const gameRule = store.addAdapter({ text: '先打给格挡的牌', scope: C.SCOPE.GAME, game: 'gomoku' });
  const sessRule = store.addAdapter({ text: '这局别连五子', scope: C.SCOPE.SESSION, game: 'gomoku', sessionId: 's1' });
  const onceRule = store.addAdapter({ text: '这一手先挡一下', scope: C.SCOPE.ONCE, game: 'gomoku', sessionId: 's1' });
  assert.ok(gameRule && sessRule && onceRule, '三条规则都应写入成功');

  blocks.clearCache();
  let r = blocks.buildMemoryBlocks('game', { asOf: AS_OF, game: 'gomoku', sessionId: 's2' });
  assert.ok(r.adapters.includes('先打给格挡的牌'), 'game 规则必须跨 session 生效');
  assert.ok(!r.adapters.includes('这局别连五子'), 'session 规则不应出现在别的 session');
  assert.ok(r.adapters.includes('这一手先挡一下'), 'once 规则应注入下一次决策');
  assert.ok(r.meta.onceIds.includes(onceRule.id), 'meta.onceIds 应带出 once 规则 id 供调用方消费');

  adapters.endSession('s1');
  blocks.clearCache();
  r = blocks.buildMemoryBlocks('game', { asOf: AS_OF, game: 'gomoku', sessionId: 's1' });
  assert.ok(!r.adapters.includes('这局别连五子'), 'session 规则局终后应失效');
  assert.ok(r.adapters.includes('先打给格挡的牌'), 'game 规则局终后仍应生效');

  const consumed = store.consumeOnce([onceRule.id]);
  assert.ok(consumed.includes(onceRule.id), 'consumeOnce 应消费掉该 once 规则');
  blocks.clearCache();
  r = blocks.buildMemoryBlocks('game', { asOf: AS_OF, game: 'gomoku', sessionId: 's1' });
  assert.ok(!r.adapters.includes('这一手先挡一下'), 'once 规则消费后应消失');
  assert.ok(
    adapters.activeAdapters({ game: 'gomoku', sessionId: 's1', force: true }).includes('先打给格挡的牌'),
    'activeAdapters 应返回仍生效的 game 规则文本'
  );
  console.log('  ✓ game 跨局保留、session 局终失效、once 用后失效');
}

/** 用例 3：classifyScope 两句判定（第一句只打印不硬断言，第二句断言 session/once）。 */
function testClassifyScope() {
  const a = adapters.classifyScope('你这样不对，先打给格挡的牌', {});
  const b = adapters.classifyScope('你马上五子棋连接五子了，能不能给我一个机会别连', {});
  console.log(`  · 「你这样不对，先打给格挡的牌」→ ${a}（期望 game 或 session）`);
  console.log(`  · 「你马上五子棋连接五子了…别连」→ ${b}（期望 session 或 once）`);
  if (![C.SCOPE.GAME, C.SCOPE.SESSION].includes(a)) {
    console.log('    （提示：第一句落在预期集合外，按要求仅打印不判失败）');
  }
  assert.ok(
    [C.SCOPE.SESSION, C.SCOPE.ONCE].includes(b),
    `第二句是局面锚点，必须判为 session 或 once，实际为 ${b}`
  );
  console.log('  ✓ 局面锚点句正确收敛到 session/once，未错误长期化');
}

/** 用例 4：yu/qq 双写去重 + 噪声过滤 + 7 天窗口。 */
function testDedupeAndNoise() {
  const p = freshRoot('t4');
  writeFixture(p);
  const r = blocks.buildMemoryBlocks('yu', { asOf: AS_OF });
  const count = (r.recent.match(/今天天气好呀/g) || []).length;
  assert.strictEqual(count, 1, `双写去重失败：recent 里「今天天气好呀」出现 ${count} 次，应为 1 次`);
  assert.ok(r.recent.includes('是呀，适合出去走走'), '被去重轮次里的 assistant 回复不应丢失');
  assert.ok(!r.recent.includes('十天前的一句话'), '超出 7 天窗口的行不应出现');
  assert.ok(!r.recent.includes('system-reminder'), '系统噪声应被过滤');
  assert.ok(!r.recent.includes('落子'), '落子流水应被丢弃');
  assert.ok(r.recent.includes('结果：老板赢了这一局'), 'game 通道对局结果应保留');
  console.log('  ✓ 双写去重、噪声过滤、7 天窗口、对局结果保留');
}

/** 用例 5：路径指向不存在目录时静默降级。 */
function testDegrade() {
  C.setRoot(path.join(SELFTEST_BASE, `no-such-dir-${Date.now()}`));
  blocks.clearCache();
  adapters.invalidateCache();
  let out = '';
  assert.doesNotThrow(() => {
    out = blocks.buildMemoryBlocks('chat', { asOf: AS_OF }).render();
  }, '路径不存在时 render 不应抛错');
  assert.ok(out.includes(C.TIMESTAMP_RULES), '降级时仍应带时间规则');
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(out), '降级输出也不应含 ISO 日期');
  assert.ok(
    Array.isArray(adapters.activeAdapters({ game: 'gomoku', sessionId: 'x', force: true })),
    '降级时 activeAdapters 应返回数组'
  );
  console.log('  ✓ 全路径缺失时静默降级，不抛错');
}

/** 用例 6：命令解析 / 撤销 / L1 阈值提炼归档 / migrate 幂等。 */
function testCommandsAndL1() {
  const p = freshRoot('t6');
  writeFixture(p);

  assert.strictEqual(
    adapters.applyAdapterCommand('以后都先打给格挡的牌', { game: 'gomoku', sessionId: 's1' }),
    '记下了，以后都这样',
    'game 档确认语'
  );
  assert.strictEqual(
    adapters.applyAdapterCommand('约定 这局别连五子', { game: 'gomoku', sessionId: 's1' }),
    '这局听你的',
    'session 档确认语'
  );
  assert.strictEqual(
    adapters.applyAdapterCommand('下一步别连', { game: 'gomoku', sessionId: 's1' }),
    '这步听你的',
    'once 档确认语'
  );
  assert.strictEqual(adapters.parseAdapterCommand('今天天气好呀', {}), null, '普通闲聊不应被当成命令');

  const before = adapters.activeAdapters({ game: 'gomoku', sessionId: 's1', force: true });
  assert.ok(before.includes('先打给格挡的牌'), '撤销前应能看到 game 规则');
  store.revokeAdapter('先打给格挡的牌');
  adapters.invalidateCache();
  const after = adapters.activeAdapters({ game: 'gomoku', sessionId: 's1', force: true });
  assert.ok(!after.includes('先打给格挡的牌'), '撤销后规则应失效');
  assert.ok(store.readAdapters().some((r) => r.status === 'ended'), '撤销只能归档，不能物理删除');

  for (let i = 0; i < C.EPHEMERAL_DISTILL_THRESHOLD + 2; i += 1) {
    store.appendEphemeral('sL1', {
      at: AS_OF - 100000 + i,
      kind: i % 10 === 0 ? 'result' : 'step',
      data: `第${i}步`,
      game: 'gomoku',
    });
  }
  const session = store.readEphemeral().sessions.sL1;
  assert.strictEqual(
    session.items.length,
    C.EPHEMERAL_DISTILL_THRESHOLD + 2,
    '原始明细必须一条不删'
  );
  assert.ok(session.summary, '达到条数阈值应生成 L1 summary');
  assert.ok(store.readRecentDigest().entries.length >= 1, '应上浮至少一条 L2 浓缩摘要');
  blocks.clearCache();
  const eph = blocks.buildMemoryBlocks('game', { asOf: AS_OF, game: 'gomoku', sessionId: 'sL1' }).ephemeral;
  assert.ok(eph.includes('已提炼'), 'ephemeral 块应带上已生成 summary');

  // migrate：dry-run 不落盘、二次运行幂等、MEMORY.md 一个字节都不改
  const mdBefore = fs.readFileSync(p.memoryMd, 'utf8');
  const dry = migrate.migrate({ dryRun: true });
  assert.ok(dry.imported > 0, 'dry-run 应预览到待导入条目');
  assert.strictEqual(fs.existsSync(p.longtermMeta), false, 'dry-run 不应写任何文件');
  const first = migrate.migrate({});
  const second = migrate.migrate({});
  assert.ok(first.imported > 0, '首次 migrate 应导入条目');
  assert.strictEqual(second.imported, 0, '二次 migrate 应全部跳过（幂等）');
  assert.strictEqual(fs.readFileSync(p.memoryMd, 'utf8'), mdBefore, 'MEMORY.md 不得被修改');
  const metaEntries = store.readLongtermMeta().entries;
  assert.ok(
    Object.values(metaEntries).some((e) => e.atKnown === false && /^MEMORY\.md:L\d+$/.test(String(e.source))),
    'migrate 条目应带 atKnown:false 与 MEMORY.md:L<n> 来源'
  );
  console.log('  ✓ 三档确认语、撤销归档、L1 提炼上浮、migrate 幂等且不动 MEMORY.md');
}

/** 主流程：跑完全部用例并清理夹具。 */
function main() {
  const tests = [
    ['render 时间规则与无 ISO 日期', testRenderRules],
    ['适配器三档作用域', testAdapterScopes],
    ['classifyScope 判定', testClassifyScope],
    ['yu/qq 双写去重与噪声过滤', testDedupeAndNoise],
    ['路径缺失静默降级', testDegrade],
    ['命令解析 / 撤销 / L1 提炼 / migrate', testCommandsAndL1],
  ];
  let passed = 0;
  const failures = [];
  console.log('[selftest] 四层记忆系统自检开始');
  try {
    fs.mkdirSync(SELFTEST_BASE, { recursive: true });
    for (const [name, fn] of tests) {
      try {
        console.log(`\n[case] ${name}`);
        fn();
        passed += 1;
      } catch (err) {
        failures.push({ name, err });
        console.log(`  ✗ 失败：${err && err.message}`);
      }
    }
  } finally {
    try {
      if (typeof fs.rmSync === 'function') fs.rmSync(SELFTEST_BASE, { recursive: true, force: true });
      else fs.rmdirSync(SELFTEST_BASE, { recursive: true });
    } catch (err) {
      /* 清理失败不影响自检结论 */
    }
    C.setRoot(C.DEFAULT_ROOT);
    blocks.clearCache();
    adapters.invalidateCache();
  }
  console.log(`\n[selftest] 结果：${passed}/${tests.length} 通过`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f.name}: ${f.err && f.err.stack}`);
    process.exitCode = 1;
  } else {
    console.log('[selftest] 全部通过');
  }
}

if (require.main === module) main();

module.exports = { main };
