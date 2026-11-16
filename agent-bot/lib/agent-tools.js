// 工具循环（给「棋局 / 卡牌」这类只有一次模型调用的场景用）
//
// 为什么不用 chat.js 那套：聊天室的循环里带着发表情、画图这些工具，
// 在棋盘上让模型「发个表情包」是纯干扰；这里只放记忆四件套。
//
// 为什么要有这一层：约定以前只能「读」不能「写」——五子棋 / 万象牌
// 只调 adapterPrompt 注入，没有任何写入入口，老板在牌桌上立的规矩全都丢了。
'use strict';

const tools = require('../tools.js');

/** 只给记忆工具：棋局里不该出现「画图 / 发表情」 */
const MEMORY_TOOL_NAMES = ['save_rule', 'remember_fact', 'list_rules', 'revoke_rule'];
const MEMORY_TOOLS = tools.TOOLS.filter((t) => t && t.function && MEMORY_TOOL_NAMES.includes(t.function.name));

/**
 * 跑一次带记忆工具的对话。
 *
 * 没有工具调用时行为与原来的 llm() 完全一致（返回正文），所以场景可以无痛替换。
 * 工具轮数上限 3：真写完一句确认就够了，再多只会拖慢出牌。
 *
 * @param {Function} rawLlm 返回整条 message 的函数（core.llmRaw）
 * @param {Array} messages 原始消息
 * @param {object} ctx 工具上下文（writeRule / listRules / revokeRule / rememberFact / memCtx / log）
 * @param {object} [opts] { maxTokens, temperature, maxRounds }，其余透传给 rawLlm
 * @returns {Promise<string>} 最终正文
 */
async function chatWithMemoryTools(rawLlm, messages, ctx, opts = {}) {
  const convo = Array.isArray(messages) ? messages.slice() : [];
  const rounds = Math.max(1, Math.min(Number(opts.maxRounds) || 3, 5));
  const log = (ctx && ctx.log) || (() => {});

  for (let i = 0; i < rounds; i += 1) {
    const msg = await rawLlm(convo, Object.assign({}, opts, { tools: MEMORY_TOOLS }));
    const calls = (msg && Array.isArray(msg.tool_calls)) ? msg.tool_calls : [];
    if (!calls.length) return String((msg && msg.content) || '').trim();

    convo.push({ role: 'assistant', content: (msg && msg.content) || '', tool_calls: calls });
    for (const c of calls) {
      const fn = (c && c.function) || {};
      let args = {};
      try { args = JSON.parse(fn.arguments || '{}'); } catch { args = {}; }
      let out;
      try { out = await tools.runTool(fn.name, args, ctx); } catch (e) { out = `工具执行出错：${e.message}`; }
      if (log) log(`工具 ${fn.name} → ${String(out).slice(0, 60)}`);
      convo.push({ role: 'tool', tool_call_id: c.id, content: String(out).slice(0, 600) });
    }
  }

  // 轮数用完还没收尾：不再给工具，只要一句人话，保证场面不空
  const fin = await rawLlm(convo, opts);
  return String((fin && fin.content) || '').trim();
}

/** 把记忆工具的上下文拼好，免得每个场景各写一遍 */
function makeMemoryCtx(core, { channel, game, sessionId, room, log, remember }) {
  return {
    log,
    memCtx: { channel, game, sessionId, room },
    writeRule: core.writeRule,
    listRules: core.listRules,
    revokeRule: core.revokeRule,
    rememberFact: remember || ((fact) => require('./remember.js').remember(fact)),
  };
}

module.exports = { MEMORY_TOOLS, MEMORY_TOOL_NAMES, chatWithMemoryTools, makeMemoryCtx };
