/**
 * 四层记忆系统 · L4 适配器命令解析与决策时读取。
 *
 * 为什么这么设计：
 * 1) 适配器记的是「怎么做事」而不是「发生了什么」，判错会直接改变下一步出牌，
 *    所以作用域判定一律「宁可少生效，不要错误长期化」：拿不准就 session，绝不默认 game。
 * 2) 每步决策前必须读到最新规则（用户说「下一步别连」要立刻生效），
 *    但 5 个进程高频调用又不能每次都全量读盘，所以用 1 秒上限缓存 + 写入后主动失效。
 *    踩过的坑：早期用 5 分钟缓存，改了规则后连输三局还按老规则打。
 * 3) 解析与落盘分离：本模块只判意图，写文件全部交给 store.js。
 */
'use strict';

const C = require('./constants');
const store = require('./store');
const llm = require('./llm');

/** 缓存：{key, at, records}，最多 1 秒；任何写规则 / 局终后 invalidateCache()。 */
let cache = { key: '', at: 0, records: [] };

/** 让适配器缓存立刻失效。 */
function invalidateCache() {
  cache = { key: '', at: 0, records: [] };
}

/**
 * 判定作用域：显式词 > 局面锚点 > 安全默认 session。
 * 同时命中多个显式词时取「最窄」作用域（once < session < game），避免一句带「这局」的话被长期化。
 * @param {string} text 用户原话
 * @param {object} ctx 可带 imminentWin / currentTurn / board / situation 等局面信息
 * @returns {'once'|'session'|'game'}
 */
function classifyScope(text, ctx) {
  const t = String(text == null ? '' : text);
  const context = ctx && typeof ctx === 'object' ? ctx : {};
  // 1) 显式「只这一次 / 本局」最优先，避免把临时请求升级成长期规则
  if (C.ONCE_SCOPE_WORDS.some((w) => t.includes(w))) return C.SCOPE.ONCE;
  if (C.SESSION_SCOPE_WORDS.some((w) => t.includes(w))) return C.SCOPE.SESSION;
  if (C.GAME_SCOPE_WORDS.some((w) => t.includes(w))) return C.SCOPE.GAME;

  // 2) 局面锚点优先于打法纠正：「马上要连五了，别连」是让一手，不是改打法
  const anchorInText = C.SITUATION_ANCHORS.some((w) => t.includes(w));
  const anchorInCtx = Boolean(
    context.imminentWin ||
      context.imminent ||
      context.currentTurn != null ||
      context.currentStep != null ||
      context.board != null ||
      context.situation != null
  );
  if (anchorInText || anchorInCtx) return C.SCOPE.SESSION;

  // 3) 立约定（开局规则 / 玩法约定）→ 跨局长期、跨自然日不自动失效。
  //    AC-4：约定「每回合只能做一件事」隔天开新局仍须遵守。
  //    若落 session，局终即失效，正好复现用户最初的「隔天忘了规则」症状。
  //    只因「这条不算了」或被新约定取代而结束，不按时间自动过期。
  if (C.RULE_COMMAND_WORDS.some((w) => t.includes(w))) return C.SCOPE.GAME;

  // 4) 打法纠正 / 偏好 → 跨局长期。「你这样不对，先打给格挡的牌」属此类
  if (C.GAME_PREFERENCE_WORDS.some((w) => t.includes(w))) return C.SCOPE.GAME;

  // 4) 安全默认：说不清就按本局，宁可少生效也不要错误长期化
  return C.SCOPE.SESSION;
}

/**
 * 识别添加 / 撤销类适配器指令；非指令返回 null。
 * @param {string} text 用户原话
 * @param {object} ctx 局面上下文
 * @returns {{action:'add'|'revoke', rule:string, scope:string}|null}
 */
function parseAdapterCommand(text, ctx) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return null;

  const revokeWord = C.REVOKE_COMMAND_WORDS.find((w) => raw.includes(w));
  if (revokeWord) {
    const rest = raw.replace(revokeWord, '').replace(/[，,。.、！!？?\s]+/g, ' ').trim();
    // 「这条不算了 / 规则取消」没有点名具体规则时，语义是取消当前生效的约定。
    // 返回空 rule，由 applyAdapterCommand 按作用域撤销；不要把触发词本身当规则文本去匹配。
    const rule = (!rest || rest.length < 4) ? '' : rest;
    return { action: 'revoke', rule, scope: classifyScope(raw, ctx) };
  }

  const addWord = C.ADD_COMMAND_WORDS.find((w) => raw.includes(w));
  if (addWord) {
    const idx = raw.indexOf(addWord);
    let body = raw.slice(idx + addWord.length);
    body = body.replace(/^[，,：:、\s]+/, '').replace(/[。.！!？?]+$/g, '').trim();
    return { action: 'add', rule: body || raw, scope: classifyScope(raw, ctx) };
  }

  // 「你这样不对，先打给格挡的牌」这类没有显式触发词的纠正句，
  // 也要能写进适配器（用户明确要求「她就会写到适配器」）。
  // 只认含打法词的纠正句，避免把普通吐槽当成规则。
  const correction = C.CORRECTION_WORDS.find((w) => raw.includes(w));
  const hasTactic = C.GAME_PREFERENCE_WORDS.some((w) => raw.includes(w));
  if (correction && hasTactic && raw.length <= 80) {
    return { action: 'add', rule: raw, scope: classifyScope(raw, ctx) };
  }

  // 没有显式命令词，但明显是「眼下这一步怎么打」的即时指令，也算适配器
  const looksLikeDirective =
    C.ONCE_SCOPE_WORDS.some((w) => raw.includes(w)) ||
    C.SESSION_SCOPE_WORDS.some((w) => raw.includes(w)) ||
    C.SITUATION_ANCHORS.some((w) => raw.includes(w));
  const hasVerb = /别|不要|先|打|出|连|走|下|挡|让|给|改/.test(raw);
  if (looksLikeDirective && hasVerb) {
    return { action: 'add', rule: raw, scope: classifyScope(raw, ctx) };
  }
  return null;
}

/**
 * 当前有效规则记录（带 id），每步决策前调用；强制重读，缓存最多 1 秒。
 * @param {object} opts {game, sessionId, force}
 * @returns {Array<{id:string,text:string,scope:string,game:string|null,sessionId:string|null,status:string,supersedes:*,source:string|null,at:number}>}
 */
function activeAdapterRecords(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const game = o.game == null ? null : String(o.game);
  // 与鱼/聊天室这类通用通道没有玩法上下文；允许显式声明 includeAllGames，
  // 让「先打格挡牌」这类 game 档长期偏好也能被同一条鱼看见（一条鱼要求）。
  const includeAllGames = o.includeAllGames === true && !game;
  const sid = o.sessionId == null ? null : String(o.sessionId);
  // 缓存 key 必须包含 includeAllGames：否则先按「无玩法上下文」查一次，
  // 再用 includeAllGames 查会命中同一个 key、拿到被过滤后的旧结果。
  const key = `${game || '*'}::${sid || '*'}::${includeAllGames ? 'all' : 'one'}`;
  const now = Date.now();
  if (!o.force && cache.key === key && now - cache.at <= C.ADAPTER_CACHE_MAX_MS) {
    return cache.records.slice();
  }
  let rules = [];
  try {
    rules = store.readAdapters();
  } catch (err) {
    rules = [];
  }
  const records = [];
  for (const r of rules) {
    if (!r || r.status !== 'active') continue;
    const scope = String(r.scope || C.SCOPE.SESSION);
    const ruleGame = r.game == null ? null : String(r.game);
    if (ruleGame && game && ruleGame !== game) continue;
    if (ruleGame && !game && !includeAllGames) continue;
    if (scope === C.SCOPE.SESSION && (!sid || String(r.sessionId || '') !== sid)) continue;
    const text = String(r.text || '').trim();
    if (!text) continue;
    records.push({
      id: String(r.id),
      text,
      scope,
      game: ruleGame,
      sessionId: r.sessionId == null ? null : String(r.sessionId),
      status: 'active',
      supersedes: r.supersedes == null ? null : r.supersedes,
      source: r.source == null ? null : String(r.source),
      at: Number(r.at) || 0,
    });
  }
  cache = { key, at: now, records };
  return records.slice();
}

/** 当前有效规则文本数组（决策链便捷入口）。 */
function activeAdapters(opts) {
  return activeAdapterRecords(opts).map((r) => r.text);
}

/**
 * 解析并落地一条适配器命令，返回给小鱼的简短确认语；非命令返回 null。
 * @param {string} text 用户原话
 * @param {object} ctx {game, sessionId, channel}
 * @returns {string|null}
 */
/* ============================================================
   语义门槛：判断权交给模型，脚本只做候选召回与保守兜底
   ------------------------------------------------------------
   背景：「这局打不过，以后再说吧」原本靠词表命中「以后」被截成规则「再说吧」。
   现在由模型裁决意图、重写规则正文、判定作用域；模型不可用时走保守兜底。

   保守兜底刻意比旧词表严格得多：只认显式立约定词，且拒绝拖延/放弃类残句。
   没配模型时宁可少记，也不要错记 —— 这是「止血 ≠ 根治」里可离线生效的那一半。
   ============================================================ */

/** 只在离线兜底时认可的显式立约定词（不含「以后」「记住」这类宽词） */
const STRICT_ADD_WORDS = [
  '约定', '规则：', '规则:', '定个规矩', '记住这条规则', '从今往后', '开局规则',
  '以后都', '都这样', '每次', '默认', '规则改成', '打法改成',
];
/** 明确的「只影响下一步」指令，兜底时也可以安全接受 */
const STRICT_ONCE_WORDS = ['这次', '这一手', '下一步', '就这一次', '就这一下'];
/** 兜底时一票否决的拖延 / 放弃 / 敷衍表达 */
const DISCOURSE_WORDS = ['再说吧', '算了', '回头说', '下次吧', '先这样', '不玩了', '打不过', '以后再说', '到时候再说'];

function conservativeParse(text, ctx) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { action: 'none', source: 'fallback' };
  if (DISCOURSE_WORDS.some((w) => raw.includes(w))) {
    return { action: 'none', source: 'fallback' };
  }
  const revokeWord = C.REVOKE_COMMAND_WORDS.find((w) => raw.includes(w));
  if (revokeWord) {
    const rest = raw.replace(revokeWord, '').replace(/[，,。.、！!？?\s]+/g, ' ').trim();
    // 未点名时绝不批量撤销；返回候选交给用户看，由精确撤销收尾
    return { action: 'revoke', rule: rest, revokeId: '', scope: classifyScope(raw, ctx), source: 'fallback' };
  }
  const addWord = STRICT_ADD_WORDS.find((w) => raw.includes(w));
  if (addWord) {
    const body = raw.slice(raw.indexOf(addWord) + addWord.length)
      .replace(/^[，,：:、\s]+/, '').replace(/[。.！!？?]+$/g, '').trim();
    if (body.length < 4) return { action: 'none', source: 'fallback' };
    return { action: 'add', rule: body, scope: classifyScope(raw, ctx), source: 'fallback' };
  }
  // 「下一步别连」这类即时指令：有显式 once 词 + 动作动词才接受
  const onceWord = STRICT_ONCE_WORDS.find((w) => raw.includes(w));
  if (onceWord && /别|不要|先|打|出|连|走|下|挡|让|给|改/.test(raw)) {
    return { action: 'add', rule: raw, scope: C.SCOPE.ONCE, source: 'fallback' };
  }
  return { action: 'none', source: 'fallback' };
}

/**
 * 语义裁决（异步）。模型可用时以模型为准；不可用/超时/低置信度 → 保守兜底。
 * @returns {Promise<{action:string, rule?:string, scope?:string, revokeId?:string, source:string}>}
 */
async function judgeAdapterCommand(text, ctx = {}) {
  let active = [];
  try { active = store.readAdapters().filter((r) => r && r.status === 'active'); } catch {}
  const verdict = await llm.judge(text, ctx, active);
  if (verdict) return Object.assign({}, verdict, { source: 'llm' });
  return conservativeParse(text, ctx);
}

/** 可见 / 审计：列出当前仍生效的规则（含 id，供按 id 精确撤销）。 */
function listActive(ctx = {}) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const game = c.game == null ? null : String(c.game);
  const sid = c.sessionId == null ? null : String(c.sessionId);
  try {
    return store.readAdapters().filter((r) => {
      if (!r || r.status !== 'active') return false;
      if (game && r.game && String(r.game) !== game) return false;
      if (String(r.scope) === C.SCOPE.SESSION && sid && r.sessionId && String(r.sessionId) !== sid) return false;
      return true;
    }).map((r) => ({ id: r.id, text: r.text, scope: r.scope, game: r.game, at: r.at }));
  } catch { return []; }
}

/** 精确撤销：只按 id，绝不按模糊文本，更不批量。 */
function revokeById(id) {
  const key = String(id || '').trim();
  if (!key) return [];
  try {
    const hit = store.revokeAdapter(key);
    if (hit.length) invalidateCache();
    return hit;
  } catch { return []; }
}

/**
 * 止血守卫（第 0 步，唯一安全方向＝不落库）：
 * 缺有效 ctx 的通道一律不允许写入适配器。
 *
 * 为什么不「改 scope / 降级 once / 补 sid 放通」：注入端的 sid 校验只作用于
 * session 档，改成 once 或 game 档反而会让错误规则立刻进 prompt 生效；
 * 补齐 sid 同理。任何让规则变可见的动作都会把未修的语义误判暴露到决策链。
 * 所以唯一安全的止血是「根本不写」。
 */
function hasEffectiveCtx(ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  return Boolean(String(c.sessionId || '').trim()) || Boolean(String(c.game || '').trim());
}

/** 存量幽灵规则（有 active 但永远注入不到）单独归档，不改注入端。 */
function archiveGhosts() {
  let n = 0;
  try {
    for (const r of store.readAdapters()) {
      if (!r || r.status !== 'active') continue;
      if (String(r.scope) === C.SCOPE.SESSION && !String(r.sessionId || '').trim()) {
        const hit = store.revokeAdapter(String(r.id || ''));
        n += hit.length;
      }
    }
    if (n) invalidateCache();
  } catch {}
  return n;
}

/**
 * 落地一条已裁决的命令。parsed 由 judgeAdapterCommand 提供（模型或保守兜底）。
 * 返回给小鱼的确认语；不是指令 / 被止血拒绝时返回空串 —— 绝不回虚假确认语。
 */
async function applyAdapterCommand(text, ctx) {
  const context = ctx && typeof ctx === 'object' ? ctx : {};
  const parsed = await judgeAdapterCommand(text, context);
  if (!parsed || parsed.action === 'none') return '';

  if (parsed.action === 'revoke') {
    // 未点名：不再批量撤销。列出候选让用户指定，一条都不动。
    if (!parsed.revokeId) {
      const list = listActive(context);
      if (!list.length) return '';
      return '你想撤哪条？现在生效的有：' + list.map((r) => `[${r.id}] ${r.text}`).join('；');
    }
    const revoked = revokeById(parsed.revokeId);
    return revoked.length ? '好，那条不算了' : '';
  }

  if (parsed.action !== 'add') return '';

  // 止血：缺有效 ctx 直接丢弃，不落库、不回确认语
  if (!hasEffectiveCtx(context)) return '';
  const ruleText = String(parsed.rule || '').trim();
  if (!ruleText || ruleText.length < 2) return '';

  const rule = store.addAdapter({
    text: ruleText,
    scope: parsed.scope,
    game: context.game == null ? null : String(context.game),
    sessionId: parsed.scope === C.SCOPE.GAME ? null : context.sessionId == null ? null : String(context.sessionId),
    source: parsed.source || (context.channel == null ? null : String(context.channel)),
    replacePrevious: parsed.scope === C.SCOPE.GAME,
  });
  invalidateCache();
  if (!rule) return '';
  if (parsed.scope === C.SCOPE.GAME) return '记下了，以后都这样';
  if (parsed.scope === C.SCOPE.SESSION) return '这局听你的';
  return '这步听你的';
}

/** 离线同步入口（仅测试 / 无模型环境用）：强制走保守兜底，不调模型。 */
function applyAdapterCommandSync(text, ctx) {
  const context = ctx && typeof ctx === 'object' ? ctx : {};
  const parsed = conservativeParse(text, context);
  if (!parsed || parsed.action !== 'add') return '';
  if (!hasEffectiveCtx(context)) return '';
  const rule = store.addAdapter({
    text: String(parsed.rule || '').trim(),
    scope: parsed.scope,
    game: context.game == null ? null : String(context.game),
    sessionId: parsed.scope === C.SCOPE.GAME ? null : context.sessionId == null ? null : String(context.sessionId),
    source: parsed.source,
    replacePrevious: parsed.scope === C.SCOPE.GAME,
  });
  if (rule) invalidateCache();
  if (!rule) return '';
  if (parsed.scope === C.SCOPE.GAME) return '记下了，以后都这样';
  if (parsed.scope === C.SCOPE.SESSION) return '这局听你的';
  return '这步听你的';
}

/** 局终：该 session 的适配器置 ended，并触发 L1 会话归档。 */
function endSession(sessionId) {
  const sid = String(sessionId || '');
  if (!sid) return { adaptersEnded: 0, sessionArchived: false };
  const adaptersEnded = store.endSessionAdapters(sid);
  const sessionArchived = store.endEphemeralSession(sid);
  invalidateCache();
  return { adaptersEnded, sessionArchived };
}

module.exports = {
  classifyScope,
  parseAdapterCommand,
  activeAdapters,
  activeAdapterRecords,
  applyAdapterCommand,
  applyAdapterCommandSync,
  judgeAdapterCommand,
  conservativeParse,
  listActive,
  revokeById,
  archiveGhosts,
  hasEffectiveCtx,
  endSession,
  invalidateCache,
};
