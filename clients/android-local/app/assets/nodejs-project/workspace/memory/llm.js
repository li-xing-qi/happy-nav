// 记忆语义裁决：全模块唯一的模型出口
//
// 为什么要有这一层（本次改造的核心）：
//   原实现里「是否该记 / 记成什么 / 作用域多长 / 撤销哪条」全靠词表 includes
//   和字符串 slice。像「这局打不过，以后再说吧」会被截成规则「再说吧」，
//   因为脚本没有能力区分「立约定」与「放弃 / 拖延 / 反话 / 元语言否定」。
//
// 设计原则：
//   1. 模型只做「判断」，不做写入、不碰归档、不碰裁剪——那些仍由 store 负责
//   2. 严格 JSON 输出 + schema 白名单校验，模型说什么都不能绕过枚举
//   3. 超时 / 未配置 / 解析失败一律返回 null，由调用方走保守兜底，绝不阻断主链路
//   4. 零第三方依赖，只用 Node 内置 fetch
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/* 自己读一次 .env：站点进程有加载器，agent-bot 进程没有，两边都要能用。
   不覆盖已存在的真实环境变量。 */
(function loadDotEnv() {
  try {
    const file = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s[0] === '#') continue;
      const eq = s.indexOf('=');
      if (eq < 1) continue;
      const key = s.slice(0, eq).trim();
      let val = s.slice(eq + 1).trim();
      if (val.length >= 2) {
        const a = val[0], b = val[val.length - 1];
        if ((a === '"' && b === '"') || (a === "'" && b === "'")) val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {}
})();

/* ---------- 配置 ---------- */
const MODE = (process.env.MEMORY_LLM || 'auto').toLowerCase(); // auto | on | off
const BASE = String(process.env.LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '';
const MODEL = process.env.LLM_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const TIMEOUT = Math.max(500, Number(process.env.MEMORY_LLM_TIMEOUT_MS || 3500));
const MIN_CONFIDENCE = Number(process.env.MEMORY_LLM_MIN_CONFIDENCE || 0.6);
const SCOPES = ['once', 'session', 'game'];
const ACTIONS = ['add', 'revoke', 'none'];

function chatUrl(base) {
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v1$/.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/** 是否应该尝试调用模型。没配密钥就自动走保守兜底，不报错。 */
function enabled() {
  if (MODE === 'off') return false;
  if (MODE === 'on') return Boolean(BASE && KEY);
  return Boolean(BASE && KEY);   // auto：配了才用
}

function describe() {
  if (!enabled()) return '未启用（未配置模型，走保守兜底）';
  return `${MODEL} @ ${chatUrl(BASE)}，超时 ${TIMEOUT}ms`;
}

/* ---------- Prompt ---------- */

const SYSTEM_PROMPT = `你是「记忆写入裁决器」。用户随口说的一句话，可能是在下达一条长期/本局/单次的约定，也可能只是闲聊、感叹、放弃、反话或否定上一句表述。

请判断这句话是否应该被写成一条「约定/偏好」记录，并输出严格 JSON（不要 markdown、不要解释、不要多余字段）：

{
  "action": "add" | "revoke" | "none",
  "rule": "规则正文（由你重写成一条清晰、可执行的指令；不是截取原话）",
  "scope": "once" | "session" | "game",
  "confidence": 0.0~1.0,
  "revokeId": "要撤销的规则 id（仅 action=revoke 且能明确对应某条时填写，否则空字符串）"
}

判定要点：
- 「以后再说吧」「算了」「回头说」「下次吧」「打不过，不玩了」是放弃/拖延，action=none。
- 「我记住了，谢谢你」里的「记住」是完成态陈述，不是命令，action=none。
- 「不对，我不是这个意思」是元语言否定，否定的是上一轮表述，不是打法，action=none。
- 「这把先让我一手，以后都按新规则来」里真正的指令是「先让我一手」，rule 必须重写成它，不能只截尾巴。
- scope：只影响下一步=once；只影响本局=session；长期跨局=game。
- 撤销时若用户没点名具体是哪条，revokeId 留空，绝不能猜。
- 拿不准就 action=none。宁可漏记，不可错记。`;

/**
 * 让模型裁决一句话。
 * @param {string} text 用户原话（完整，不裁剪）
 * @param {object} ctx 局面上下文 {channel, game, sessionId, board, situation}
 * @param {Array} activeRules 当前 active 规则（含 id/text/scope），供 revoke 精确对应
 * @returns {Promise<object|null>} 校验后的 JSON；任何异常返回 null（调用方走兜底）
 */
async function judge(text, ctx = {}, activeRules = []) {
  if (!enabled()) return null;
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return null;

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          utterance: raw,
          ctx: {
            channel: ctx.channel || '',
            game: ctx.game || '',
            sessionId: ctx.sessionId || '',
            board: ctx.board || null,
            situation: ctx.situation || '',
          },
          activeRules: (activeRules || []).map((r) => ({
            id: r.id, text: r.text, scope: r.scope,
          })),
        }),
      },
    ],
    stream: false,
    temperature: 0,
    max_tokens: 200,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const headers = { 'content-type': 'application/json' };
    if (KEY) headers.authorization = `Bearer ${KEY}`;
    const res = await fetch(chatUrl(BASE), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    return validate(content);
  } catch {
    return null;   // 超时、网络错、解析错，一律静默降级
  } finally {
    clearTimeout(timer);
  }
}

/** 严格 schema 白名单：模型输出不可信，逐字段校验 */
function validate(content) {
  try {
    const s = String(content || '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const o = JSON.parse(s);
    if (!o || typeof o !== 'object') return null;
    const action = String(o.action || '');
    if (!ACTIONS.includes(action)) return null;
    const confidence = Number(o.confidence);
    if (!Number.isFinite(confidence)) return null;
    const out = {
      action,
      rule: String(o.rule || '').trim().slice(0, 200),
      scope: SCOPES.includes(String(o.scope)) ? String(o.scope) : 'session',
      confidence: Math.max(0, Math.min(1, confidence)),
      revokeId: String(o.revokeId || '').trim(),
    };
    if (out.action === 'add' && (!out.rule || out.rule.length < 2)) return null;
    if (out.confidence < MIN_CONFIDENCE) return null;
    return out;
  } catch {
    return null;
  }
}

/* ============================================================
   长期事实裁决（给「记住：……」直写 MEMORY.md 的旁路用）
   与约定裁决分开：事实是「发生了什么 / 是什么」，约定是「以后怎么做」。
   两者混用会把「记住：我家猫叫咪咪」误判成规则，反之亦然。
   ============================================================ */

const FACT_SYSTEM_PROMPT = `你是「长期事实写入裁决器」。判断用户这句话里是否包含一条值得长期记住的事实，并输出严格 JSON（不要 markdown、不要解释）：

{"keep": true|false, "fact": "重写成一条干净、独立、不带时间状语的事实（一行）", "confidence": 0.0~1.0}

判定要点：
- 保留：身份偏好、长期习惯、稳定事实、明确要求记住的内容。
- 拒绝：临时安排、闲聊、感叹、反问、放弃/拖延（「再说吧」「算了」）、
       完成态陈述（「我记住了，谢谢你」里的「记住」不是命令）、
       元语言否定（「不对，我不是这个意思」）。
- fact 必须是独立可读的一句话，不要带「记住」「帮我记」等触发词。
- 拿不准就 keep=false。宁可漏记，不可错记。`;

/**
 * @returns {Promise<{keep:boolean, fact:string, confidence:number}|null>}
 *          模型不可用 / 超时 / 低置信度一律返回 null（调用方走保守兜底）
 */
async function judgeFact(text) {
  if (!enabled()) return null;
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const headers = { 'content-type': 'application/json' };
    if (KEY) headers.authorization = `Bearer ${KEY}`;
    const res = await fetch(chatUrl(BASE), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: FACT_SYSTEM_PROMPT },
          { role: 'user', content: raw },
        ],
        stream: false, temperature: 0, max_tokens: 120,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    const s2 = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const o = JSON.parse(s2);
    if (!o || typeof o.keep !== 'boolean') return null;
    const confidence = Number(o.confidence);
    if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) return null;
    const fact = String(o.fact || '').trim().slice(0, 200).replace(/\n/g, ' ');
    if (o.keep && fact.length < 2) return null;
    return { keep: o.keep, fact, confidence };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { judge, judgeFact, enabled, describe, validate, SYSTEM_PROMPT, FACT_SYSTEM_PROMPT };
