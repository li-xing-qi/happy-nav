/**
 * 好感度 / 心情验收（零依赖、不联网、不碰真实数据）
 *
 * 验的是「轻微影响」这条线：
 *   · 默认不打扰日常对话（promptLine 返回空串）
 *   · 会因夸奖/被凶而动，但有冷却和回落的边界
 *   · 只有好感很低时才会在「让我一步」上不答应，且不是必然
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
console.log('\n[case] 默认状态不打扰对话');
reset();
ok(mood.read().affinity === mood.BASE.affinity, '初始亲密度 = 基准 55', String(mood.read().affinity));
ok(mood.promptLine() === '', '普通状态下 promptLine 返回空串（不塞进 prompt）');
ok(mood.band(55) === '平常', '分档：55 → 平常', mood.band(55));
ok(mood.shouldYield() === true, '默认会让棋');

console.log('\n[case] 夸奖会加分，但有冷却');
const p1 = mood.note('praise', '你好可爱');
ok(p1.affinity === 60, '夸一次 +5（55→60）', String(p1.affinity));
const line1 = mood.promptLine();
ok(line1.includes('亲密度') && line1.includes('被你夸了'), 'promptLine 里出现「亲密度」和事件描述', line1.split('\n')[0]);
const p2 = mood.note('praise', '又夸一次');
ok(p2.affinity === 60, '30 分钟内重复夸奖不再加分', String(p2.affinity));

console.log('\n[case] 被凶会掉分，但不会掉到负数，也不会一直记仇');
reset({ affinity: 8 });
const s1 = mood.note('scold', '笨蛋');
ok(s1.affinity >= 0, '扣分不会掉到负数', String(s1.affinity));
ok(/不高兴|情绪一般/.test(mood.promptLine()), '低好感时提示词会提示「话短/不高兴」', mood.promptLine().split('\n')[0]);
const back = mood.decay(Object.assign(mood.read(), { affinity: 20, updatedAt: Date.now() - 16 * 3600 * 1000 }));
ok(back.affinity === 22, '好感随时间向 55 回落（16 小时 +2）', String(back.affinity));

console.log('\n[case] 极端高低才有语气提示，中间档不加料');
reset({ affinity: 50 });
ok(mood.promptLine() === '', '50 分（平常）不产生任何提示词');
reset({ affinity: 90 });
ok(mood.promptLine().includes('放松'), '90 分会给「更主动」的提示', mood.promptLine().split('\n')[0]);
reset({ affinity: 20 });
ok(mood.promptLine().includes('不高兴'), '20 分会给「别热情」的提示', mood.promptLine().split('\n')[0]);

console.log('\n[case] 让我一步：只有好感很低才可能不答应');
reset({ affinity: 60 });
ok(mood.shouldYield() === true && mood.shouldYield(() => 0.01) === true, '好感正常时一定让（哪怕随机数很小）');
reset({ affinity: 10 });
const tries = [0.1, 0.2, 0.3, 0.44, 0.45, 0.7, 0.9].map((v) => mood.shouldYield(mood.read(), () => v));
ok(tries[0] === false, '低好感 + 随机 0.1 → 不让', String(tries[0]));
ok(tries[6] === true, '低好感 + 随机 0.9 → 仍然让（不是必然翻脸）', String(tries[6]));
const refused = tries.filter((x) => !x).length;
ok(refused >= 2 && refused <= 4, `低好感下拒绝概率约一半（实测 ${refused}/7）`);

console.log('\n[case] 从一句话里认情绪');
reset();
mood.noteFromText('你真是个小可爱');
ok(mood.read().affinity > 55, '夸奖被识别', String(mood.read().affinity));
reset();
mood.noteFromText('滚，别烦我');
ok(mood.read().affinity < 55, '被凶被识别', String(mood.read().affinity));
reset();
mood.noteFromText('今天天气不错');
ok(mood.read().affinity === 56, '普通闲聊只 +1（存在感，不刷分）', String(mood.read().affinity));
mood.noteFromText('今天天气还是不错');
ok(mood.read().affinity === 56, '30 分钟内再闲聊不再加分', String(mood.read().affinity));

console.log('\n[case] 状态栏上报是「装饰」，不该拖累主链路');
ok(presence.init({}) === false, '缺参数时不启用');
ok(presence.init({ base: 'http://127.0.0.1:1', room: 't', pid: 'p' }) === true, '参数齐全时启用');
ok(presence.idleText() === '发呆中' || presence.idleText() === '打盹中', '空闲文案按时间切换', presence.idleText());
const t0 = Date.now();
await presence.set('说话中');        // 端口 1 必定失败，但必须快速返回
const cost = Date.now() - t0;
ok(cost < 2000, '上报失败时快速返回，不阻塞发消息', `${cost}ms`);

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

console.log(`\n[verify-mood] 结果：${pass}/${pass + fail} 通过`);
if (fail) { console.log('[verify-mood] 有失败'); process.exit(1); }
console.log('[verify-mood] 全部通过');
})();
