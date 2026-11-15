#!/usr/bin/env node
/**
 * 语义门槛验收脚本（本次改造的回归基线）
 *
 * 运行：node memory/verify-semantic.js
 *
 * 覆盖：
 *  - 6 条终版验收判据（顺序不可换，readAdapters 置顶）
 *  - 4 个真实反例 + 3 个 ctx + 幽灵规则 + 批量撤销误伤
 *  - 模型裁决路径（内置 mock LLM，验证「重写 rule」而不是脚本 slice）
 *  - 模型不可用时的保守兜底与「功能不被阉割」（正常约定仍可写入）
 *
 * 全程用隔离临时目录，不碰仓库的 workspace/ 与 memory/data/。
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/* ---------- mock 模型服务 ---------- */
const MOCK_PORT = 31991 + (process.pid % 200);
let mockVerdict = null;      // 测试里动态设置模型返回
let mockFactVerdict = null;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let content = '';
    try {
      const b = JSON.parse(body);
      const sys = (b.messages && b.messages[0] && b.messages[0].content) || '';
      content = sys.includes('长期事实写入裁决器')
        ? JSON.stringify(mockFactVerdict || { keep: false, fact: '', confidence: 1 })
        : JSON.stringify(mockVerdict || { action: 'none', rule: '', scope: 'session', confidence: 1 });
    } catch {
      content = '{"action":"none","rule":"","scope":"session","confidence":1}';
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});

process.env.LLM_BASE_URL = `http://127.0.0.1:${MOCK_PORT}/v1`;
process.env.LLM_API_KEY = 'mock-key';
process.env.LLM_MODEL = 'mock-model';
process.env.MEMORY_LLM = 'on';
process.env.MEMORY_LLM_TIMEOUT_MS = '1500';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-semantic-'));
const C = require('./constants.js');
C.setRoot(ROOT);
const store = require('./store.js');
const adapters = require('./adapters.js');
const bridge = require('./bridge.js');
const llm = require('./llm.js');
/* 记住模块路径可配置：某些部署的 agent-bot 与 memory 不在同一个父目录下。
   找不到时跳过「记住旁路」那组用例，其余判照常执行。 */
let remember = null;
try {
  remember = require(process.env.REMEMBER_MODULE || '../agent-bot/lib/remember.js');
} catch {
  console.log('[verify-semantic] 提示：未找到记住模块，将跳过该组用例（可设 REMEMBER_MODULE）');
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`); }
}

const UTTERANCE = '这局打不过，以后再说吧';
const CTXS = [
  { name: 'game 通道', ctx: { channel: 'game', game: 'gomoku', sessionId: 's1' } },
  { name: '与鱼通道（现网真实）', ctx: { channel: 'yu', game: '', sessionId: '', room: '0000', includeAllGames: true } },
  { name: '站点 api-chat', ctx: { channel: 'api-chat' } },
];

async function reset() {
  // 清空规则文件
  const p = C.resolvePaths().adapters;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ version: 1, rules: [] }), 'utf8');
  adapters.invalidateCache();
}

async function main() {
  await new Promise((r) => server.listen(MOCK_PORT, '127.0.0.1', r));
  console.log('[verify-semantic] 语义门槛验收开始');
  console.log(`[verify-semantic] 隔离 root = ${ROOT}`);
  console.log(`[verify-semantic] 模型 = ${llm.describe()}`);
  console.log('');

  /* ========== 1. 六条终版判据 × 三个 ctx ========== */
  console.log('[case] 终版验收判据（readAdapters 置顶）× 3 个 ctx');
  for (const { name, ctx } of CTXS) {
    await reset();
    mockVerdict = { action: 'none', rule: '', scope: 'session', confidence: 0.95 };
    const before = store.readAdapters().filter((r) => r.status === 'active').length;
    const confirm = await bridge.handleCommand(UTTERANCE, ctx);
    const after = store.readAdapters();
    const active = adapters.activeAdapters(ctx);
    const prompt = bridge.adapterPrompt(ctx);
    const pending = bridge.pendingOnceIds ? bridge.pendingOnceIds(ctx) : [];

    // 判据 1（第一道门槛）：无新增 active，且不含该文本
    check(`${name} · ①readAdapters 无新增 active`,
      after.filter((r) => r.status === 'active').length === before && !after.some((r) => r.status === 'active' && r.text === '再说吧'),
      `before=${before} after=${after.filter((r) => r.status === 'active').length}`);
    // 判据 2：无肯定确认语
    const BAD_CONFIRMS = ['这局听你的', '记下了，以后都这样', '这步听你的'];
    check(`${name} · ②确认语为空且不含肯定语`,
      confirm === '' && !BAD_CONFIRMS.some((w) => String(confirm).includes(w)), `confirm=${JSON.stringify(confirm)}`);
    // 判据 3 / 4 / 5
    check(`${name} · ③activeAdapters 为空`, active.length === 0, JSON.stringify(active));
    check(`${name} · ④adapterPrompt 不含误判文本`, !String(prompt).includes('再说吧'));
    check(`${name} · ⑤pendingOnceIds 为空`, !pending || pending.length === 0);
  }
  console.log('');

  /* ========== 2. 四个反例 + 模型裁决重写 rule ========== */
  console.log('[case] 四个反例与模型「重写 rule」');
  const GOOD_CTX = { channel: 'game', game: 'gomoku', sessionId: 's1' };
  for (const t of ['我记住了，谢谢你', '不对，我不是这个意思', '这把先让我一手，以后都按新规则来']) {
    await reset();
    mockVerdict = { action: 'none', rule: '', scope: 'session', confidence: 0.95 };
    await bridge.handleCommand(t, GOOD_CTX);
    check(`反例「${t.slice(0, 12)}」不落库`, store.readAdapters().filter((r) => r.status === 'active').length === 0);
  }
  await reset();
  mockVerdict = { action: 'add', rule: '先让我一手', scope: 'session', confidence: 0.9 };
  const c2 = await bridge.handleCommand('这把先让我一手，以后都按新规则来', GOOD_CTX);
  const written = store.readAdapters().filter((r) => r.status === 'active').map((r) => r.text);
  check('模型重写 rule 生效（不是脚本截尾巴）', written.length === 1 && written[0] === '先让我一手', JSON.stringify(written));
  check('正确写入仍回确认语', c2 === '这局听你的', c2);
  console.log('');

  /* ========== 3. 撤销：不再批量误伤 ========== */
  console.log('[case] 「这条不算了」不再批量撤销、可列出、可按 id 精确撤销');
  await reset();
  mockVerdict = { action: 'add', rule: '先打给格挡的牌', scope: 'game', confidence: 0.9 };
  await bridge.handleCommand('约定：随便什么', GOOD_CTX);
  mockVerdict = { action: 'revoke', rule: '', revokeId: '', scope: 'session', confidence: 0.9 };
  const list = bridge.listAdapters(GOOD_CTX);
  check('⑥可见路径：能列出 active 规则（含 id）', list.length === 1 && Boolean(list[0].id), JSON.stringify(list));
  const revokeReply = await bridge.handleCommand('这条不算了', GOOD_CTX);
  const stillActive = store.readAdapters().filter((r) => r.status === 'active');
  check('未点名撤销不批量归档（一条都不动）', stillActive.length === 1, `remaining=${stillActive.length}`);
  check('未点名时给出候选而非虚假确认', String(revokeReply).includes('你想撤哪条'), String(revokeReply).slice(0, 60));
  const revoked = bridge.revokeAdapter(list[0].id);
  check('按 id 精确撤销生效', revoked.length === 1 && store.readAdapters().filter((r) => r.status === 'active').length === 0);
  check('撤销只归档不物理删除', store.readAdapters().some((r) => r.status === 'ended'));
  console.log('');

  /* ========== 4. 止血守卫：缺 ctx 一律不落库，且不能靠改档位放通 ========== */
  console.log('[case] 止血：缺有效 ctx 不落库（模型判 add 也不行）');
  await reset();
  mockVerdict = { action: 'add', rule: '再说吧', scope: 'game', confidence: 0.99 };
  const c3 = await bridge.handleCommand(UTTERANCE, { channel: 'api-chat' });
  check('缺 ctx 时模型判 add 也被拒', store.readAdapters().filter((r) => r.status === 'active').length === 0);
  check('缺 ctx 时不回确认语', c3 === '', JSON.stringify(c3));
  console.log('');

  /* ========== 5. 幽灵规则归档 ========== */
  console.log('[case] 存量幽灵规则单独归档');
  await reset();
  const p = C.resolvePaths().adapters;
  fs.writeFileSync(p, JSON.stringify({ version: 1, rules: [
    { id: 'ghost-1', text: '再说吧', scope: 'session', sessionId: null, status: 'active', at: Date.now() },
  ] }), 'utf8');
  adapters.invalidateCache();
  const n = bridge.archiveGhostAdapters();
  check('归档幽灵规则 = 1 条', n === 1, `n=${n}`);
  check('归档后不再是 active', store.readAdapters().filter((r) => r.status === 'active').length === 0);
  console.log('');

  /* ========== 6. 记住旁路：事实裁决 ========== */
  console.log('[case] 「记住：…」旁路的语义裁决');
  if (!remember) {
    console.log('  - 跳过（记住模块不可用）');
  } else {
  const memFile = path.join(ROOT, 'MEMORY.md');
  mockFactVerdict = { keep: false, fact: '', confidence: 0.98 };
  const r1 = await remember.rememberAsync('我记住了，谢谢你', { file: memFile });
  check('完成态陈述不写入长期事实', r1.skipped === true && !fs.existsSync(memFile));
  mockFactVerdict = { keep: true, fact: '我家猫叫咪咪', confidence: 0.95 };
  const r2 = await remember.rememberAsync('记住：我家猫叫咪咪', { file: memFile });
  check('真正的事实由模型重写后写入', r2.ok && !r2.skipped && fs.existsSync(memFile) && fs.readFileSync(memFile, 'utf8').includes('我家猫叫咪咪'));
  }
  console.log('');

  /* ========== 7. 降级：模型不可用时保守兜底且不阉割功能 ========== */
  console.log('[case] 模型不可用 → 保守兜底（错的不记、对的仍记）');
  server.close();
  await new Promise((r) => setTimeout(r, 100));
  await reset();
  const c4 = await bridge.handleCommand(UTTERANCE, GOOD_CTX);
  check('降级时误判句仍被拒', store.readAdapters().filter((r) => r.status === 'active').length === 0, `confirm=${JSON.stringify(c4)}`);
  const c5 = await bridge.handleCommand('约定：每回合只能做一件事', GOOD_CTX);
  const kept = store.readAdapters().filter((r) => r.status === 'active').map((r) => r.text);
  check('降级时显式约定仍可写入（功能不阉割）', kept.includes('每回合只能做一件事'), JSON.stringify(kept));
  check('降级时回正常确认语', c5 === '记下了，以后都这样' || c5 === '这局听你的', c5);
  console.log('');

  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(`[verify-semantic] 结果：${pass}/${pass + fail} 通过`);
  console.log(`[verify-semantic] ${fail ? '存在失败项' : '全部通过'}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('[verify-semantic] 异常:', e);
  try { server.close(); } catch {}
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
