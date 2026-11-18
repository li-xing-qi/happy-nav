// 状态栏：把「她在干嘛」写到房间（与鱼 / 聊天室 / 五子棋 / 万象牌）
//
// 以前页面只显示「在线 / 暂时离开」，因为房间只知道 lastSeen。
// 这里加一个 act（当前动作），由她自己上报：
//   思考中 / 说话中 / 落子中 / 出牌中 / 巡视中 / 打盹中 / 发呆中
// （都控制在 4 个字内：页面那一行很窄）
//
// 为什么要按通道分开（2026-11-18）：
//   原来只有与鱼页面有这一栏。聊天室 / 五子棋 / 万象牌页面上只有「在线」，
//   而机器人每 1.2~1.5 秒心跳一次，那栏等于一个恒亮的灯 —— 用户说的「一直在线中」就是这个。
//   现在三个房间也各有 act 字段和上报端点，四条通道各写各的。
//
// 纪律：
//   1. 接口失败一律静默 —— 状态是装饰，不能影响消息
//   2. 同一个状态 8 秒内不重复发；上报超时 1.5 秒
//   3. 空闲 42 秒自动回到「发呆中 / 打盹中」，不会卡在「思考中」
//   4. 上报的 act 在服务端 45 秒后失效（yu.js 的 actOf），所以本地回收必须早于 45 秒，
//      否则中间会闪一下「在线」——原来 armIdle 是 90 秒，比有效期还长，必然闪。
//   5. 兜底看门狗：每 30 秒查一次「最后上报到现在超过 45 秒了吗」，超了就主动回空闲。
//      为什么需要它：只要有一条代码路径忘了上报（异常、提前 return、被节流的回复），
//      页面就会永远停在「说话中」——用户看到的原话是「一直卡在说话中」。
//   6. **一个进程里同时有多个通道**（agent-bot 一个进程跑 chat/card/gomoku），
//      所以配置必须按通道分开存（CHANNELS），不能只存一份 ——
//      否则后 init 的会盖掉前面那个，「落子中」会写到聊天室的房间上去，状态就串了。
//      场景里用 attach('go') 取一个绑定好通道的把手，调用点就不用每次传通道名。
'use strict';

/** 至少有一个通道 init 过（isOn 的无参形式用） */
let started = false;
let watchdog = null;

/**
 * 通道 → 配置与本地状态。
 * 每个槽位：{ conf: {base,room,pid,channel} | null, last: {act,at}, timer }
 */
const CHANNELS = new Map();

/**
 * 通道 → 上报端点。
 * 注意五子棋是 /api/go/presence 而不是 /api/go/act：
 *   /api/go/act 已经被对局动作占用（act = 'chat' / 'move' / 'setRule' …），
 *   复用同一个路径会把状态词当成「未知操作」，以后加动作名还会互相打架。
 */
const ENDPOINTS = {
  yu: '/api/yu/act',        // 与鱼（yufish.js，默认通道）
  room: '/api/room/act',    // 聊天室
  go: '/api/go/presence',   // 五子棋
  card: '/api/act',         // 万象牌
};

/** 空闲多久后回到「发呆中」。
 *  必须**明显早于**服务端 45 秒的 act 有效期（见文件头纪律 4）：
 *  原来是 50 秒，比有效期还长 5 秒 —— 第 45~50 秒那一小段，服务端已经把 act 判失效、
 *  页面退回「在线」，然后第 50 秒本地才补一条「发呆中」，看起来就是闪一下。
 *  现在取 42 秒（留 3 秒余量给网络）。 */
const IDLE_MS = 42 * 1000;
/** 服务端 act 的有效期。超过这个时间，页面就当成没上报，退回「在线」 */
const ACT_TTL_MS = 45 * 1000;
/** 看门狗巡检间隔：比 TTL 短，最多多显示 30 秒的旧状态 */
const WATCH_MS = 30 * 1000;

function chName(ch) { return String(ch || 'yu'); }

/** 取某个通道的槽位（没有就建一个空槽） */
function slotOf(ch) {
  const c = chName(ch);
  let s = CHANNELS.get(c);
  if (!s) {
    s = { conf: null, last: { act: '', at: 0 }, timer: null };
    CHANNELS.set(c, s);
  }
  return s;
}

/** 通道 → 端点路径（未知通道按与鱼处理，保证老调用不会打空） */
function pathOf(ch) { return ENDPOINTS[chName(ch)] || ENDPOINTS.yu; }

/**
 * 初始化某个通道。
 *
 * @param {object} opts { base, room, pid, channel }
 *   · channel 缺省 'yu'（yufish.js 的老三参调用行为不变）
 *   · 同一通道重复 init 会覆盖（换房间用得上），不同通道互不影响
 * @param {string} [channel] attach() 调用时的通道名（优先级高于 opts.channel）
 * @returns {boolean} 参数不全时 false（调用点不用判断，后续上报自己会 no-op）
 */
function init(opts = {}, channel) {
  const base = String(opts.base || '').replace(/\/+$/, '');
  const room = String(opts.room || '');
  const pid = String(opts.pid || '');
  if (!base || !room || !pid) return false;
  const ch = chName(opts.channel || channel);
  slotOf(ch).conf = { base, room, pid, channel: ch };
  started = true;
  startWatchdog();
  return true;
}

/**
 * 取一个绑定到某个通道的把手。
 *
 * 为什么要它：agent-bot 一个进程跑三个场景，共用这一个模块实例。
 * 如果每个场景都调无参的 speaking()，它们会互相盖掉对方的配置。
 * attach('go') 把通道名闭包在把手里面，调用点写起来和以前一样。
 *
 * @param {string} channel yu / room / go / card
 * @returns {object} init / set / speaking / thinking / act / idle / isOn
 */
function attach(channel) {
  const ch = chName(channel);
  return {
    channel: ch,
    init: (opts = {}) => init(opts, ch),
    set: (a) => set(a, ch),
    speaking: () => speaking(ch),
    thinking: (t) => thinking(t, ch),
    act: (n, ms) => act(n, ms, ch),
    idle: () => idle(ch),
    idleText,
    isOn: () => isOn(ch),
  };
}

function idleText() {
  const h = new Date().getHours();
  return h >= 0 && h < 7 ? '打盹中' : '发呆中';
}

/** 直接设置状态（内部走节流 + 静默失败）
 *  @param {string} act 动作词（≤12 字，实际都用 3~4 字）
 *  @param {string} [channel] 通道，缺省 yu */
async function set(act, channel) {
  const s = slotOf(channel);
  if (!s.conf) return false;
  const a = String(act || '').slice(0, 12);
  const t = Date.now();
  if (a === s.last.act && t - s.last.at < 8000) return true;
  s.last = { act: a, at: t };
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), 1500);
  try {
    await fetch(`${s.conf.base}${pathOf(s.conf.channel)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: s.conf.room, pid: s.conf.pid, act: a }),
      signal: ctrl.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(killer);
  }
}

/**
 * 兜底看门狗：解决「一直卡在说话中」。
 *
 * 为什么不能只靠 armIdle 的定时器：armIdle 是「安排一次未来动作」，
 * 任何一条路径忘了调它（异常提前 return、被节流的回复、进程里别的定时器把它
 * clearTimeout 掉了），状态就永远停在上一次的「说话中」，页面看着像卡死。
 * 看门狗是「定期回头检查」，不依赖任何一次上报是否成功——它是最后一道网。
 *
 * 30 秒一次，unref 掉（不能把进程吊着不退出）。
 * 一次巡检遍历所有通道（agent-bot 一个进程里有 room/go/card 三条）。
 */
function startWatchdog() {
  if (watchdog) return;
  watchdog = setInterval(() => {
    try {
      const now = Date.now();
      for (const [ch, s] of CHANNELS) {
        if (!s.conf || !s.last.at) continue;             // 没配置 / 从没上报过，没什么可回收
        if (now - s.last.at <= ACT_TTL_MS) continue;     // 还在有效期内，别乱改
        set(idleText(), ch).catch(() => {});
      }
    } catch { /* 看门狗自己出错也不能带崩进程 */ }
  }, WATCH_MS);
  if (watchdog.unref) watchdog.unref();
}

/** 重置某个通道的空闲计时：一段时间没动静就回默认状态 */
function armIdle(ms = IDLE_MS, channel) {
  const s = slotOf(channel);
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => { set(idleText(), s.conf && s.conf.channel).catch(() => {}); }, ms);
  if (s.timer.unref) s.timer.unref();
}

/** 她在说话（发消息时用） */
function speaking(channel) { set('说话中', channel).catch(() => {}); armIdle(IDLE_MS, channel); }

/**
 * 她在想事情。
 * text 里带服务器/日志这类运维词时显示「巡视中」——她其实在干活，不是在聊天。
 * （原来是「巡视领地中」5 个字，页面那一行放不下，改成 3 个字的「巡视中」）
 */
function thinking(text = '', channel) {
  const t = String(text || '');
  const ops = /(服务器|内存|磁盘|负载|日志|进程|部署|备份|重启|跑一下|看一下.*情况|巡视|修一下|报错)/;
  set(ops.test(t) ? '巡视中' : '思考中', channel).catch(() => {});
  armIdle(IDLE_MS, channel);
}

/** 明确指定一个状态（棋局落子、卡牌出牌等） */
function act(name, ms = IDLE_MS, channel) { set(name, channel).catch(() => {}); armIdle(ms, channel); }

/** 收工：回到空闲状态 */
function idle(channel) { set(idleText(), channel).catch(() => {}); }

/** 这个通道接过上了吗（不传通道就是「任意通道」） */
function isOn(channel) {
  if (channel === undefined) return started;
  const s = CHANNELS.get(chName(channel));
  return Boolean(s && s.conf);
}

/** 调试用：当前各通道的配置（断言「三个场景互不覆盖」时打印它） */
function channels() {
  return [...CHANNELS.entries()].map(([ch, s]) => ({ channel: ch, conf: s.conf, last: s.last }));
}

module.exports = {
  init, set, speaking, thinking, act, idle, idleText, attach, isOn, channels,
  IDLE_MS, ACT_TTL_MS, WATCH_MS, ENDPOINTS,
};
