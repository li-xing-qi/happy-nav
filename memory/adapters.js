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
function applyAdapterCommand(text, ctx) {
  const parsed = parseAdapterCommand(text, ctx);
  if (!parsed) return null;
  const context = ctx && typeof ctx === 'object' ? ctx : {};
  if (parsed.action === 'revoke') {
    let revoked = [];
    if (parsed.rule) {
      revoked = store.revokeAdapter(parsed.rule);
    } else {
      // 未点名：撤销当前玩法下所有仍生效的约定（含 game / session / once）。
      // 用户说「这条不算了」通常就是指「刚才那条」，按作用域批量撤更符合直觉。
      const game = context.game == null ? null : String(context.game);
      const sid = context.sessionId == null ? null : String(context.sessionId);
      for (const r of store.readAdapters()) {
        if (!r || r.status !== 'active') continue;
        if (game && r.game && String(r.game) !== game) continue;
        if (String(r.scope) === C.SCOPE.SESSION && sid && r.sessionId && String(r.sessionId) !== sid) continue;
        const hit = store.revokeAdapter(String(r.id || ''));
        revoked = revoked.concat(hit);
      }
    }
    invalidateCache();
    return revoked.length ? '好，那条不算了' : '没找到那条规则，你再说清楚点是哪条';
  }
  const rule = store.addAdapter({
    text: parsed.rule,
    scope: parsed.scope,
    game: context.game == null ? null : String(context.game),
    sessionId: parsed.scope === C.SCOPE.GAME ? null : context.sessionId == null ? null : String(context.sessionId),
    source: context.channel == null ? null : String(context.channel),
    replacePrevious: parsed.scope === C.SCOPE.GAME,
  });
  invalidateCache();
  if (!rule) return '这条我没记下来，等下再试一次';
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
  endSession,
  invalidateCache,
};
