// 状态栏：把「她在干嘛」写到与鱼房间里
//
// 以前页面只显示「在线 / 暂时离开」，因为房间只知道 lastSeen。
// 这里加一个 act（当前动作），由她自己上报：
//   思考中 / 说话中 / 巡视领地中 / 落子中 / 打盹中 / 发呆中
//
// 纪律：
//   1. 只在与鱼房间里生效；接口失败一律静默 —— 状态是装饰，不能影响消息
//   2. 同一个状态 8 秒内不重复发；上报超时 1.5 秒
//   3. 空闲一段时间自动回到「发呆中 / 打盹中」，不会卡在「思考中」
'use strict';

let conf = null;          // { base, room, pid }
let last = { act: '', at: 0 };
let timer = null;
let started = false;

/** 空闲多久后回到「发呆中」 */
const IDLE_MS = 90 * 1000;

function init(opts = {}) {
  const base = String(opts.base || '').replace(/\/+$/, '');
  const room = String(opts.room || '');
  const pid = String(opts.pid || '');
  if (!base || !room || !pid) return false;
  conf = { base, room, pid };
  started = true;
  return true;
}

function idleText() {
  const h = new Date().getHours();
  return h >= 0 && h < 7 ? '打盹中' : '发呆中';
}

/** 直接设置状态（内部走节流 + 静默失败） */
async function set(act) {
  if (!conf) return false;
  const a = String(act || '').slice(0, 12);
  const t = Date.now();
  if (a === last.act && t - last.at < 8000) return true;
  last = { act: a, at: t };
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), 1500);
  try {
    await fetch(`${conf.base}/api/yu/act`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: conf.room, pid: conf.pid, act: a }),
      signal: ctrl.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(killer);
  }
}

/** 重置空闲计时：一段时间没动静就回默认状态 */
function armIdle(ms = IDLE_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { set(idleText()).catch(() => {}); }, ms);
  if (timer.unref) timer.unref();
}

/** 她在说话（发消息时用） */
function speaking() { set('说话中').catch(() => {}); armIdle(); }

/** 她在想事情；text 里带服务器/日志这类词时显示「巡视领地中」 */
function thinking(text = '') {
  const t = String(text || '');
  const ops = /(服务器|内存|磁盘|负载|日志|进程|部署|备份|重启|跑一下|看一下.*情况|巡视|修一下|报错)/;
  set(ops.test(t) ? '巡视领地中' : '思考中').catch(() => {});
  armIdle();
}

/** 明确指定一个状态（棋局落子、卡牌出牌等） */
function act(name, ms = IDLE_MS) { set(name).catch(() => {}); armIdle(ms); }

/** 收工：回到空闲状态 */
function idle() { set(idleText()).catch(() => {}); }

module.exports = { init, set, speaking, thinking, act, idle, idleText, isOn: () => started };
