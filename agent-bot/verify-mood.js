/**
 * 好感度 / 心情验收（零依赖、不联网、不碰真实数据）
 *
 * 这一版的重点变了：分数不再由词表算，而是**她自己判断后调 feel 工具**。
 * 所以这里验的是「工具和边界」，不是「词表命中」：
 *   · feel 的钳制（单次 ±12、总分 0~100、极端处收力）
 *   · 回落（每 12 小时 1 点、单次最多 2 点、软锚不低于 55）
 *   · 短时心情（6 小时过期回平静）
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

  console.log('\n[case] 读档：0 是合法值，band 不能和 affinity 打架');
  /* 踩过（QA 回归时发现的真 bug）：`Number(o.affinity) || 55` 把 0 当「缺失」，
   * 于是 12 分吃一发 -12 落到 0（冷透了），下次启动读档就复活成 55。
   * 同时存档里的 band 是缓存，不能盲信——否则会出现「55 分 / 冷透了」这种错位。 */
  fs.writeFileSync(process.env.MOOD_FILE, JSON.stringify({
    affinity: 0, energy: 0, updatedAt: Date.now(), band: '冷透了', log: [],
  }));
  const zeroState = mood.read();
  ok(zeroState.affinity === 0, 'affinity 0 读回来还是 0（不是 55）', String(zeroState.affinity));
  ok(zeroState.energy === 0, 'energy 0 读回来还是 0（不是 70）', String(zeroState.energy));
  ok(zeroState.band === '冷透了', 'band 与 affinity 一致', zeroState.band);
  fs.writeFileSync(process.env.MOOD_FILE, JSON.stringify({
    affinity: 55, updatedAt: Date.now(), band: '冷透了', log: [],
  }));
  ok(mood.read().band === '还算熟', '存档 band 错位时按 affinity 重算', mood.read().band);
  reset({ affinity: 12 });
  const dropped = mood.feel(-12, '他凶我');
  ok(dropped.state.affinity === 0, '真实路径：12 分吃一发 -12 落到 0', String(dropped.state.affinity));
  ok(mood.read().affinity === 0, '再读档仍是 0，不会复活成 55', String(mood.read().affinity));

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

  console.log('\n[case] 回落：一次吵架不会永久生效，但也别硬拽回陌生档');
  /* 间隔从 8 小时放宽到 12 小时、单次上限 3 点降到 2 点：
   * 用户嫌「好感太严苛」，涨得慢掉得快是主因，所以这里的期望值跟着放宽。 */
  const back = mood.decay(Object.assign(mood.read(), { affinity: 20, updatedAt: Date.now() - 16 * 3600 * 1000 }));
  ok(back.affinity === 21, '16 小时向 55 靠 1 点（20→21）', String(back.affinity));
  const cap = mood.decay(Object.assign(mood.read(), { affinity: 20, updatedAt: Date.now() - 30 * 24 * 3600 * 1000 }));
  ok(cap.affinity === 22, '一次补最多 2 点（30 天也只 +2）', String(cap.affinity));

  console.log('\n[case] 软锚：落点跟着近 24 小时峰值走');
  /* 80 分的人两天不聊，旧逻辑会一路拽回 55（陌生档）。
   * 现在落点是 max(55, 峰值-6)：低于落点就不动，高于落点才慢慢降。 */
  const soft = mood.decay(Object.assign(mood.read(), {
    affinity: 80, peak24: 90, peakAt: Date.now() - 3600 * 1000, updatedAt: Date.now() - 48 * 3600 * 1000,
  }));
  ok(soft.affinity === 80, '低于落点（90-6=84）时不硬拽', String(soft.affinity));
  const slid = mood.decay(Object.assign(mood.read(), {
    affinity: 90, peak24: 90, peakAt: Date.now() - 3600 * 1000, updatedAt: Date.now() - 48 * 3600 * 1000,
  }));
  ok(slid.affinity === 88, '高于落点时每次最多降 2 点（90→88）', String(slid.affinity));

  console.log('\n[case] 短时心情：6 小时过期回平静');
  const fresh = mood.promptBlock(Object.assign(mood.read(), { mood: { label: '撒娇', at: Date.now() - 60 * 1000 } }));
  ok(/心情：撒娇/.test(fresh), '新心情会写进提示词', fresh.split('\n')[0]);
  const stale = mood.promptBlock(Object.assign(mood.read(), { mood: { label: '撒娇', at: Date.now() - 7 * 3600 * 1000 } }));
  ok(/心情：平静/.test(stale), '超过 6 小时按平静算', stale.split('\n')[0]);
  const junk = mood.promptBlock(Object.assign(mood.read(), { mood: { label: '想吃烤鱼', at: Date.now() } }));
  ok(/心情：平静/.test(junk), '不在枚举里的心情不会污染提示词', junk.split('\n')[0]);

  console.log('\n[case] feel 第三参：心情与方向（不参与算分）');
  reset({ affinity: 60 });
  const f3 = mood.feel(3, '他说想我', { mood: '黏人', kind: '暧昧' });
  ok(f3.applied === 3 && f3.state.affinity === 63, '两参/三参并存，分数照旧', `${f3.applied}/${f3.state.affinity}`);
  ok(f3.state.mood && f3.state.mood.label === '黏人', '心情标签落库', JSON.stringify(f3.state.mood));
  ok(f3.state.log[f3.state.log.length - 1].kind === '暧昧', 'kind 只进日志（分类用）', JSON.stringify(f3.state.log[f3.state.log.length - 1]));
  const f2 = mood.feel(1, '日常');
  ok(f2.applied === 1, '老的两参调用仍然可用（兼容 dsh 插件 / verify-tools）', String(f2.applied));

  console.log('\n[case] 路径表：路子要分开，反应不能是同一句');
  /* 用户的原话是「增加的路子多一点，不是单纯的增加数值」。
   * 所以这张表必须一条一条分开、每条有自己的反应，否则模型还是只有一个笼统的热情度。 */
  const pos = mood.PATHS.filter((p) => p.dir > 0);
  const neg = mood.PATHS.filter((p) => p.dir < 0);
  ok(pos.length >= 8, '正向路径 ≥ 8 条（陪着/报备/昵称/想你/暧昧/被需要/一起玩/记得）', String(pos.length));
  ok(neg.length >= 5, '反向路径 ≥ 5 条（敷衍/失联/凶/越界/工具化）', String(neg.length));
  ok(mood.PATHS.every((p) => p.key && p.when && p.act), '每条都有 key / when / act');
  ok(new Set(mood.PATHS.map((p) => p.key)).size === mood.PATHS.length, 'key 不重名');
  ok(new Set(mood.PATHS.map((p) => p.act)).size === mood.PATHS.length, '「怎么反应」两两不同（防复读同一句）');
  ok(mood.PATHS.every((p) => p.when.length <= 20), 'when 都是一句短话（≤20 字）');
  ok(mood.PATHS.every((p) => p.act.length <= 30), 'act 都是一句短话（≤30 字）');
  ok(mood.PATHS.every((p) => Number.isFinite(p.lo) && Number.isFinite(p.hi) && p.lo <= p.hi), '分值区间合法（只作参照）');
  ok(mood.FEEL_KINDS.length === mood.PATHS.length, 'FEEL_KINDS 与路径表同步（工具枚举用这一份）');

  console.log('\n[case] 今天的账：她记住的是细节，不是分数');
  const T = Date.now();
  const logOf = (arr) => Object.assign(mood.read(), { log: arr });
  const dg = mood.todayDigest(logOf([
    { ts: T - 3600 * 1000, d: 2, why: '陪着', kind: '陪着' },
    { ts: T - 2 * 3600 * 1000, d: 2, why: '昵称', kind: '昵称' },
    { ts: T - 3 * 3600 * 1000, d: 3, why: '想你', kind: '昵称' },
    { ts: T - 4 * 3600 * 1000, d: 3, why: '想你', kind: '想你' },
    { ts: T - 25 * 3600 * 1000, d: 2, why: '昨天的', kind: '一起玩' },
    { ts: T - 5 * 3600 * 1000, d: 2, why: '老记录没有 kind' },
  ]), T);
  ok(/陪你聊了 1 次/.test(dg), '计数对得上：陪着 1 次', dg);
  ok(/叫了你 2 次昵称/.test(dg), '同一条路径累加：昵称 2 次', dg);
  ok(/说了 1 次想你/.test(dg), '想你 1 次', dg);
  ok(!/一起玩/.test(dg), '25 小时前的那条不算进今天', dg);
  ok(!/老记录/.test(dg), '没有 kind 的旧记录不产生条目', dg);
  ok(mood.todayDigest(logOf([]), T) === '', '没有可统计的就返回空串（头行不留空括号）');
  const many = mood.todayDigest(logOf(
    ['陪着', '陪着', '昵称', '昵称', '昵称', '想你', '暧昧', '记得', '一起玩']
      .map((k, i) => ({ ts: T - (i + 1) * 60 * 1000, d: 1, why: k, kind: k })),
  ), T);
  ok((many.match(/次/g) || []).length <= 4, '最多只报 4 类（头行不能太长）', many);
  ok(/^今天他：/.test(many), '统一以「今天他：」开头', many);

  console.log('\n[case] promptBlock：清单式，不再一句话罗列');
  reset({ affinity: 61 });
  mood.feel(2, '他陪我聊', { kind: '陪着' });
  mood.feel(2, '他叫我小傻鱼', { kind: '昵称' });
  const blk = mood.promptBlock();
  const blines = blk.split('\n');
  const pathLines = blines.filter((l) => l.startsWith('· ') && l.includes('→'));
  ok(pathLines.length >= 8, '路径行 ≥ 8（一条一行，不是压成一句）', String(pathLines.length));
  ok(pathLines.every((l) => /^· [^：]+：.+→ [+-]-?\d/.test(l) || /^· 反向：/.test(l)), '每行都是「名字：什么算 → 分值，反应」');
  ok(!/被夸、被照顾、他陪你聊天/.test(blk), '旧版那句「压成一句」的写法已经不存在');
  ok(/调 feel 记下来/.test(blk) && /哪一类/.test(blk), '仍然明确要求调 feel 并标 kind');
  ok(/同一条路别每次都用同一种反应/.test(blk), '要求同一条路换着反应');
  ok(blines.length <= 12, '行数控制在 12 行以内', String(blines.length));
  ok(/今天他：/.test(blines[0]), '头行带「今天的账」', blines[0]);

  console.log('\n[case] kind 传疯了也不该出事');
  reset({ affinity: 55 });
  const wild = mood.feel(2, '他自己编的路径', { kind: '半夜发疯' });
  ok(wild.applied === 2, '不认识的 kind 不影响算分', String(wild.applied));
  ok(wild.state.log[wild.state.log.length - 1].kind === '半夜发疯', '原样进 log（不报错、不丢弃）', JSON.stringify(wild.state.log.slice(-1)));

  console.log('\n[case] 十档语气：每档都要有具体说法');
  const tones = mood.BANDS.map((b) => mood.toneOf(b));
  ok(mood.BANDS.length === 10, 'BANDS 是十档', String(mood.BANDS.length));
  ok(new Set(tones).size === 10, '十档语气互不相同（中间档不许被抹平）', String(new Set(tones).size));
  ok(!tones.some((t) => /语气自然就行/.test(t)), '不再出现「语气自然就行」这种和事佬建议');
  ok(tones.every((t) => t.length >= 12), '每档都是一句能照做的话，不是两个字的形容词');

  console.log('\n[case] 憋太久没记心情会催一句');
  reset({ affinity: 62 });
  mood.setState({ roundsSinceFeel: 6 });
  ok(/已经聊了 \d+ 轮/.test(mood.promptBlock()), '连续 6 轮没记就催她先判断一次');
  mood.feel(2, '日常陪伴');
  ok(!/已经聊了 \d+ 轮/.test(mood.promptBlock()), '记过之后催的话撤掉');

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
  /* 踩过两次：
   *   ① 万象牌给了 feel 工具，却忘了往提示词里放数值 → 打牌时亲密度基本不动；
   *   ② 断言原来写成 `hasTools === hasMood`，于是「两边都没有」也算绿，
   *      结果灵犀那条通道漏接被写成了「通过」。假绿比没测更糟。
   * 现在改成显式名单：名单内的必须两个都有，名单外的必须显式列在排除表里并写原因。 */
  const MOOD_SCENES = ['chat', 'gomoku', 'card'];
  /* 灵犀不收：它每轮只让模型回一个词（maxTokens 20），塞 12 行心情进去既没地方放也没有工具循环 */
  const MOOD_EXCLUDED = { lingxi: '每轮只回一个词，没有工具循环' };
  for (const name of MOOD_SCENES) {
    const src = fs.readFileSync(path.join(__dirname, 'scenes', `${name}.js`), 'utf8');
    const hasTools = /chatWithMemoryTools\(|llmWithTools\(/.test(src);
    const hasMood = /mood\.promptBlock\(\)/.test(src);
    ok(hasTools && hasMood, `${name}.js：必须同时有工具和心情提示`, `工具=${hasTools} 提示=${hasMood}`);
  }
  /* 新场景忘了接心情会在这里红：要么加进 MOOD_SCENES，要么加进 MOOD_EXCLUDED 并写明原因 */
  const sceneFiles = fs.readdirSync(path.join(__dirname, 'scenes')).filter((f) => f.endsWith('.js'));
  for (const f of sceneFiles) {
    const name = f.replace(/\.js$/, '');
    const known = MOOD_SCENES.includes(name) || Object.prototype.hasOwnProperty.call(MOOD_EXCLUDED, name);
    ok(known, `scenes/${f} 的去留已登记（接入心情或写明排除原因）`);
  }
  for (const name of Object.keys(MOOD_EXCLUDED)) {
    const src = fs.readFileSync(path.join(__dirname, 'scenes', `${name}.js`), 'utf8');
    ok(!/mood\.promptBlock\(\)/.test(src), `${name}.js 声明了排除，就不要再偷偷注入（${MOOD_EXCLUDED[name]}）`);
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
