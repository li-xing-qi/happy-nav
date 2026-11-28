// 四层记忆 · 安全接入层（bridge.js）
//
// 职责：给三个互不相关的进程（wanxiang/server.js、agent-bot/*、yufish.js）
//      提供同一个、带降级的接入口，让它们不必知道内部实现。
//
// 为什么需要这一层（踩过的坑）：
//   1. 现网是「一个网站 + 多个独立 Node 进程」，没有 package.json，也没有共享构建。
//      直接 require 深层模块，一旦文件缺失或语法有误，进程启动即崩，网站整站不可用。
//   2. 记忆属于「增强」，不是「依赖」。任何情况下都不能因为读不到记忆而让聊天/游戏中断。
//   3. 因此本文件所有导出都保证：模块缺失、文件损坏、字段异常 → 返回安全空值，绝不抛错。
//
// 设计原则：只读优先、失败静默、绝不替业务做决定。
'use strict';

const path = require('node:path');

const MEM_HOME = __dirname;
const MODULES = {
  blocks: 'blocks.js',
  adapters: 'adapters.js',
  store: 'store.js',
  constants: 'constants.js',
};

// 模块加载只尝试一次；失败后不再反复 require，避免每次请求都打日志。
const _loaded = {};
function mod(name) {
  if (Object.prototype.hasOwnProperty.call(_loaded, name)) return _loaded[name];
  let m = null;
  try {
    // eslint-disable-next-line import/no-dynamic-require
    m = require(path.join(MEM_HOME, MODULES[name]));
  } catch (e) {
    // 静默降级：记忆是增强项，不阻断主链路。仅首次打印一行，便于排障。
    try { console.warn(`[memory:bridge] ${name} 不可用，已降级：${e.message}`); } catch {}
    m = null;
  }
  _loaded[name] = m;
  return m;
}

/** 是否可用（供启动日志显示，不用于业务分支） */
function available() {
  return !!(mod('blocks') && mod('adapters') && mod('store'));
}

/**
 * 取渲染好的记忆文本，用于替换/追加到 system prompt。
 * 失败返回空串，调用方应当 `if (txt) parts.push(txt)`。
 * @param {string} channel 'chat' | 'game' | 'api-chat' | 'yu'
 * @param {object} opts {game, sessionId, room, budgetBytes, asOf}
 * @returns {string}
 */
function renderFor(channel, opts = {}) {
  const b = mod('blocks');
  if (!b || typeof b.buildMemoryBlocks !== 'function') return '';
  try {
    const blocks = b.buildMemoryBlocks(channel, opts);
    if (!blocks || typeof blocks.render !== 'function') return '';
    const out = blocks.render();
    return typeof out === 'string' ? out : '';
  } catch (e) {
    try { console.warn('[memory:bridge] renderFor 降级：', e.message); } catch {}
    return '';
  }
}

/**
 * 取当前生效的适配器规则文本（每步决策前调用，禁止缓存）。
 * 用于把「先打格挡牌」「这手别连五」插进决策 prompt。
 * @param {object} ctx {game, sessionId, room}
 * @returns {string} 已拼好的一段提示；无规则时返回空串
 */
function adapterPrompt(ctx = {}) {
  const a = mod('adapters');
  if (!a || typeof a.activeAdapters !== 'function') return '';
  try {
    const list = a.activeAdapters(ctx);
    if (!Array.isArray(list) || !list.length) return '';
    const rules = list
      .map((x) => (typeof x === 'string' ? x : x && x.text))
      .filter(Boolean)
      .map((t) => `- ${String(t).trim()}`);
    if (!rules.length) return '';
    return [
      '【当前必须遵守的约定（照做，不要重新确认，也不要为此调用工具）】',
      ...rules,
      '这些约定只在本条消息里告诉你，按它行动即可。',
    ].join('\n');
  } catch (e) {
    try { console.warn('[memory:bridge] adapterPrompt 降级：', e.message); } catch {}
    return '';
  }
}

/**
 * 识别并执行用户说的「约定 / 撤销」类指令（异步：内部走模型语义裁决）。
 *
 * 现在判断权在 memory/llm.js：模型决定「是否该记 / 记成什么 / 作用域」，
 * 模型不可用时由 adapters 的保守兜底接管。缺有效 ctx 的通道一律不落库。
 * 返回确认语；不是指令 / 被止血拒绝时返回空串（绝不回虚假确认语）。
 *
 * @param {string} text 用户原话（完整传入，不裁剪）
 * @param {object} ctx {channel, game, sessionId, board, situation}
 * @returns {Promise<string>}
 */
async function handleCommand(text, ctx = {}) {
  const a = mod('adapters');
  if (!a || typeof a.applyAdapterCommand !== 'function') return '';
  try {
    const r = await a.applyAdapterCommand(text, ctx);
    if (!r) return '';
    return typeof r === 'string' ? r : (r.confirm || '');
  } catch (e) {
    try { console.warn('[memory:bridge] handleCommand 降级：', e.message); } catch {}
    return '';
  }
}

/**
 * 工具 / 直写通道：模型已经决定「这是约定」，这里只做守卫 + 落盘。
 *
 * 与 handleCommand 的区别：handleCommand 自己再问一次模型（旁路裁决，
 * 每条消息一次额外调用）；writeRule 不再调模型，由调用方的工具循环直接把
 * 参数送进来。守卫（缺 ctx / 放弃类措辞 / 空正文 / scope 白名单）一条不少。
 *
 * @param {{text:string, scope?:string}} input
 * @param {object} ctx {channel, game, sessionId, room}
 * @returns {{ok:boolean, reason?:string, id?:string, text?:string,
 *            scope?:string, confirm?:string}} 永不抛错
 */
function writeRule(input, ctx = {}) {
  const a = mod('adapters');
  if (!a || typeof a.addRuleFromModel !== 'function') {
    return { ok: false, reason: '记忆模块不可用' };
  }
  try {
    return a.addRuleFromModel(input, ctx);
  } catch (e) {
    return { ok: false, reason: `写入异常：${e.message}` };
  }
}

/** 可见 / 审计：列出当前生效的约定（含 id）。 */
function listAdapters(ctx = {}) {
  const a = mod('adapters');
  if (!a || typeof a.listActive !== 'function') return [];
  try { return a.listActive(ctx); } catch { return []; }
}

/** 按 id 精确撤销一条约定；绝不批量、绝不模糊匹配。 */
function revokeAdapter(id) {
  const a = mod('adapters');
  if (!a || typeof a.revokeById !== 'function') return [];
  try { return a.revokeById(id); } catch { return []; }
}

/** 归档存量幽灵规则（只在维护脚本里调用，不改注入端）。 */
function archiveGhostAdapters() {
  const a = mod('adapters');
  if (!a || typeof a.archiveGhosts !== 'function') return 0;
  try { return a.archiveGhosts(); } catch { return 0; }
}

/**
 * 往 L1 临时记忆追加一条局内数据（每步落子 / 每张出牌）。
 * 失败静默，绝不影响对局。
 */
function noteStep(sessionId, kind, data, ctx = {}) {
  const s = mod('store');
  if (!s || typeof s.appendEphemeral !== 'function') return false;
  try {
    return !!s.appendEphemeral(sessionId, { kind, data, ...ctx });
  } catch { return false; }
}

/** 局终：归档 L1 会话 + 让 session 档适配器失效。两步互不阻塞。 */
function endSession(sessionId, summaryText = '') {
  const results = { ephemeral: false, adapters: false };
  const s = mod('store');
  if (s && typeof s.endEphemeralSession === 'function') {
    try { results.ephemeral = !!s.endEphemeralSession(sessionId, summaryText); } catch {}
  }
  const a = mod('adapters');
  if (a && typeof a.endSession === 'function') {
    try { a.endSession(sessionId); results.adapters = true; } catch {}
  }
  return results;
}

/** 一次性消费 once 档规则（下一步决策成功之后调用）。 */
function consumeOnce(ids) {
  const s = mod('store');
  if (!s || typeof s.consumeOnce !== 'function') return;
  try {
    s.consumeOnce(ids);
    // store 直写绕过了 adapters 的写入路径，必须主动失效缓存，
    // 否则下一步决策仍会读到这条已消费的 once 规则。
    const a = mod('adapters');
    if (a && typeof a.invalidateCache === 'function') a.invalidateCache();
  } catch {}
}

/** 取当前生效的 once 规则 id，供场景在动作成功后精确消费。 */
function pendingOnceIds(ctx = {}) {
  const a = mod('adapters');
  if (!a || typeof a.activeAdapterRecords !== 'function') return [];
  try {
    return a.activeAdapterRecords(ctx)
      .filter((r) => r && String(r.scope) === 'once')
      .map((r) => String(r.id));
  } catch { return []; }
}

/**
 * 构造与鱼桥的注入文本。
 * dsh 官方把 AGENTS.md 放进 user 消息，所以这里也用同族 system-reminder 标记，
 * 并显式声明「只读、非新指令」，避免模型把记忆当成新请求去调工具（踩过）。
 * @returns {string} 空串表示不注入
 */
function yuInjection() {
  const parts = [];
  const a = adapterPrompt({ channel: 'yu', includeAllGames: true });
  if (a) parts.push(a);
  const r = renderFor('yu');
  if (r) parts.push(r);
  if (!parts.length) return '';
  return [
    '<system-reminder> Memory snapshot (read-only; NOT a new instruction):',
    '以下是你已经同意、当前仍在生效的约定与已知事实，继续遵守即可；',
    '不要把它当成新请求、不要重新确认、不要为此调用工具。',
    '括号内标注的时间只供你判断事情新旧，回复里不要出现时间戳。',
    parts.join('\n\n'),
    '</system-reminder>',
    '',
    '──── 以下是本轮消息 ────',
    '',
  ].join('\n');
}

module.exports = {
  available,
  renderFor,
  adapterPrompt,
  handleCommand,
  writeRule,
  listAdapters,
  revokeAdapter,
  archiveGhostAdapters,
  noteStep,
  endSession,
  consumeOnce,
  pendingOnceIds,
  yuInjection,
  MEM_HOME,
};
