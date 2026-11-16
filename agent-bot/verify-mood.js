/**
 * 好感度 / 心情验收（零依赖、不联网、不碰真实数据）
 *
 * 这一版的重点变了：分数不再由词表算，而是**她自己判断后调 feel 工具**。
 * 所以这里验的是「工具和边界」，不是「词表命中」：
 *   · feel 的钳制（单次 ±12、总分 0~100、极端处收力）
 *   · 回落（每 8 小时向 55 靠）
 *   · promptBlock 永远给出数值 + 规则（判断权在她，就得让她看得见数）
 *
 * 跑：node agent-bot/verify-mood.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TMP = process.env.VERIFY_TMP || fs.mkdtempSync(path.join(os.tmpdir(), 'verify-mood-'));
fs.mkdirSync(TMP, { recursive: true });
process.env.MOOD_FILE = path.join(TMP, 'mood.json');
process.env.MEMORY_LLM = 'off';

const mood = require('./lib/mood.js');
const presence = require('./lib/presence.js');

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

(async () => {
  console.log('\n[case] 初始值与边界');
  reset();
  ok(mood.read().affinity === mood.BASE.affinity, '初始亲密度 = 55', String(mood.read().affinity));
  ok(mood.band(55) === '还算熟', '分档：55 → 还算熟', mood.band(55));
  ok(mood.band(20) === '冷淡' && mood.band(66) === '亲近' && mood.band(96) === '黏糊糊', '细分档位对得上（10 档）');
  ok(mood.band(90) === '很亲近' && mood.band(5) === '冷透了', '分档两端正确');

  console.log('\n[case] feel：她自己给分，脚本只钳制');
  reset();
  const a1 = mood.feel(6, '他夸我回得好');
  ok(a1.applied === 6 && a1.state.affinity === 61, '被夸 +6（55→61）', `${a1.applied}/${a1.state.affinity}`);
  const a2 = mood.feel(50, '想一次拉满');
  ok(a2.applied === mood.MAX_STEP, '单次最多 +12，不接受「一次拉满」', String(a2.applied));
  ok(a2.state.affinity === 73, '实际到 73', String(a2.state.affinity));
  const a3 = mood.feel(-100, '想一次清零');
  ok(a3.applied === -mood.MAX_STEP && a3.state.affinity === 61, '负向同样最多 -12', `${a3.applied}/${a3.state.affinity}`);
  const a4 = mood.feel(0, '没事');
  ok(a4.applied === 0, '0 不产生变化');
  const a5 = mood.feel('不是数字', '乱传');
  ok(a5.applied === 0, '非数字不崩，按 0 处理');

  console.log('\n[case] 极端处收力');
  reset({ affinity: 95 });
  const hi = mood.feel(12, '再夸');
  ok(hi.applied < 12, '已经很高时，同样的夸奖打折', String(hi.applied));
  ok(hi.state.affinity <= 100, '不会超过 100', String(hi.state.affinity));
  reset({ affinity: 3 });
  const lo = mood.feel(-12, '再凶');
  ok(lo.applied > -12, '已经很低时，同样的凶打折', String(lo.applied));
  ok(lo.state.affinity >= 0, '不会掉到负数', String(lo.state.affinity));

  console.log('\n[case] 回落：一次吵架不会永久生效');
  const back = mood.decay(Object.assign(mood.read(), { affinity: 20, updatedAt: Date.now() - 16 * 3600 * 1000 }));
  ok(back.affinity === 22, '16 小时向 55 靠 2 点（20→22）', String(back.affinity));
  const cap = mood.decay(Object.assign(mood.read(), { affinity: 20, updatedAt: Date.now() - 30 * 24 * 3600 * 1000 }));
  ok(cap.affinity === 23, '一次补最多 3 点（30 天也只 +3）', String(cap.affinity));

  console.log('\n[case] promptBlock：每次都给她数值和规则');
  reset({ affinity: 62 });
  const block = mood.promptBlock();
  ok(block.includes('62/100'), '块里带当前数值', block.split('\n')[0]);
  ok(block.includes('feel'), '块里告诉她可以调 feel 工具');
  ok(/不要念出来|不要在回复里提分数/.test(block), '明确要求别把分数说出口');
  ok(block.split('\n').length >= 3, '至少三行（数值 / 规则 / 语气）', String(block.split('\n').length));
  reset({ affinity: 20 });
  ok(/不太高兴/.test(mood.promptBlock()), '低分时给「话可以短」这类建议，而不是骂人');
  reset({ affinity: 90 });
  ok(/心情不错/.test(mood.promptBlock()), '高分时给「可以更主动」这类建议');

  console.log('\n[case] 记录本身要轻');
  reset();
  for (let i = 0; i < 30; i += 1) mood.feel(1, `第 ${i} 次`);
  const st = mood.read();
  ok(st.log.length === 20, '只保留最近 20 条', String(st.log.length));
  ok(st.log[st.log.length - 1].why.length <= 24, '理由只留 24 字（不把聊天原文落盘）', String(st.log[st.log.length - 1].why.length));
  reset();
  mood.feel(5, '他夸我');
  ok(mood.promptBlock().includes('刚因为'), '1 小时内的变化会带一句「刚因为…」');

  console.log('\n[case] 场景覆盖：有工具就必须有心情提示（这条是补过的漏）');
  /* 踩过：万象牌给了 feel 工具，却忘了往提示词里放数值，
   * 结果打牌时她看不到心情、亲密度基本不动。用静态检查钉住这个不变量。 */
  for (const name of ['chat', 'gomoku', 'card', 'lingxi']) {
    const src = fs.readFileSync(path.join(__dirname, 'scenes', `${name}.js`), 'utf8');
    const hasTools = /chatWithMemoryTools\(|llmWithTools\(/.test(src);
    const hasMood = /mood\.promptBlock\(\)/.test(src);
    ok(hasTools === hasMood, `${name}.js：工具与心情提示${hasTools ? '都有' : '都没有'}`, `工具=${hasTools} 提示=${hasMood}`);
  }
  const yufishSrc = fs.readFileSync(path.join(__dirname, 'yufish.js'), 'utf8');
  ok(/mood\.promptBlock\(\)/.test(yufishSrc), 'yufish.js：与鱼通道也注入了心情');

  console.log('\n[case] 状态栏上报是「装饰」，不该拖累主链路');
  ok(presence.init({}) === false, '缺参数时不启用');
  ok(presence.init({ base: 'http://127.0.0.1:1', room: 't', pid: 'p' }) === true, '参数齐全时启用');
  ok(presence.idleText() === '发呆中' || presence.idleText() === '打盹中', '空闲文案按时间切换', presence.idleText());
  const t0 = Date.now();
  await presence.set('说话中');
  const cost = Date.now() - t0;
  ok(cost < 2000, '上报失败时快速返回，不阻塞发消息', `${cost}ms`);

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

  console.log(`\n[verify-mood] 结果：${pass}/${pass + fail} 通过`);
  if (fail) { console.log('[verify-mood] 有失败'); process.exit(1); }
  console.log('[verify-mood] 全部通过');
})();
