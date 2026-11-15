/**
 * 四层记忆系统 · 纯只读渲染层。
 *
 * 为什么这么设计：
 * 1) 本模块只负责「把旁路元数据 + 旧只读文件」拼成给模型的记忆块，绝不产生任何写盘动作；
 *    所有落盘集中在 store.js，避免多个 PM2 进程互相覆盖。
 * 2) 旧文件由 summarize.py 与聊天写入端持续更新，逐行 fingerprint 绑定元数据，
 *    这样 MEMORY.md 行号怎么变都不丢绑定。踩过的坑：早期按行号存元数据，03:20 一重写全错乱。
 * 3) 5 个进程都会读，逐层做 mtime + size + 存活时长缓存，避免每句聊天都重读数千行 chatlog。
 * 4) 渲染结果里任何裸 ISO 日期都会被换成相对表达，因为模型看到日期就容易在回复里照抄成日志腔。
 *
 * 坑：yu / qq 双写会让同一句话在 recent 里出现两次，必须按 turnId 或 text 前缀 + 时间容差去重。
 */
'use strict';

const fs = require('fs');
const C = require('./constants');
const store = require('./store');

/** 文件内容缓存：绝对路径 -> {mtimeMs, size, readAt, text}。切 root 时 key 不同，天然隔离。 */
const textCache = new Map();

/** 清空渲染缓存（写入后 / selftest 切换夹具时调用）。 */
function clearCache() {
  textCache.clear();
}

/** 带缓存地读文本；读不到返回空串，静默降级，绝不抛。 */
function readTextCached(file) {
  try {
    const st = fs.statSync(file);
    const hit = textCache.get(file);
    if (
      hit &&
      hit.mtimeMs === st.mtimeMs &&
      hit.size === st.size &&
      Date.now() - hit.readAt < C.CACHE_MAX_AGE_MS
    ) {
      return hit.text;
    }
    const text = fs.readFileSync(file, 'utf8');
    textCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, readAt: Date.now(), text });
    return text;
  } catch (err) {
    return '';
  }
}

/** 保留标题地裁剪正文，正文默认从尾部留（最新内容更重要）。 */
function withHeader(header, body, limit, preferHead) {
  const h = header ? header + '\n' : '';
  const room = Math.max(0, Number(limit) || 0) - C.byteLen(h);
  const clipped = preferHead ? C.clipHeadBytes(body, room) : C.clipTailBytes(body, room);
  return h + clipped;
}

/** 把时间戳（秒 / 毫秒 / ISO 字符串）统一成毫秒。 */
function toMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e11 ? value * 1000 : value;
  }
  const str = String(value == null ? '' : value).trim();
  if (!str) return NaN;
  const num = Number(str);
  if (Number.isFinite(num) && /^\d+(\.\d+)?$/.test(str)) {
    return num < 1e11 ? num * 1000 : num;
  }
  const parsed = Date.parse(str);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** 纯坐标判定（如 "7,7" / "(3,4)" / "g7" / "12 8"）。 */
function isPureCoordinate(text) {
  const s = String(text || '').trim();
  if (!s || s.length > 16 || !/\d/.test(s)) return false;
  return /^[\d\s,，.。:：()（）\[\]xX×\-a-hA-H一二三四五六七八九十]+$/.test(s);
}

/** 对局结果关键词：game 通道只保留这类，丢逐步落子流水。 */
const RESULT_WORDS = /结果|赢|胜|负|输|和棋|平局|结束|获胜|认输|连成|五连|得分|结算|通关|失败/;

/** 系统噪声 / 落子流水 / 纯坐标过滤。 */
function isNoise(row) {
  const s = String(row.text || '').trim();
  if (!s) return true;
  if (s.includes('<system-reminder>') || s.includes('[SCHEDULE')) return true;
  if (s.includes('落子')) return true;
  if (isPureCoordinate(s)) return true;
  const ch = String(row.channel || '');
  if (ch === 'game' || ch === 'lx') {
    if (!RESULT_WORDS.test(s) && (isPureCoordinate(s) || /^[\d\s,，()（）\-]+$/.test(s))) return true;
    if (!RESULT_WORDS.test(s) && s.length <= 8 && /\d/.test(s)) return true;
  }
  return false;
}

/** L4 之外的身份块：只读 AGENTS.md，从头部保留人设开头。 */
function buildIdentity(paths, budget) {
  const raw = readTextCached(paths.agentsMd);
  if (!raw) return { text: '', missing: true };
  // 不丢信息硬约束：AGENTS.md 是完整人设 + 运维规则 + 工具说明，
  // 聊天室另有 30 余条手工规则依赖它。即使调用方给了很小的预算也不裁。
  // 改版前现网本来就是全文注入，这里保持一致。
  // 注意：不能走 withHeader(..., 无预算)，它的裁剪函数会把正文裁成空串。
  return { text: '【身份与运维】\n' + raw.trim(), missing: false };
}

/** L4 适配器块：只输出 active 且作用域匹配当前 game / sessionId 的规则。 */
function buildAdapters(paths, opts, budget) {
  const rules = store.readAdapters();
  const game = opts.game == null ? null : String(opts.game);
  const sid = opts.sessionId == null ? null : String(opts.sessionId);
  const onceIds = [];
  const lines = [];
  for (const r of rules) {
    if (!r || r.status !== 'active') continue;
    const scope = String(r.scope || C.SCOPE.SESSION);
    const ruleGame = r.game == null ? null : String(r.game);
    // 按 game 过滤：规则绑定了玩法就必须匹配；当前没有玩法上下文时不注入带玩法的规则
    if (ruleGame && game && ruleGame !== game) continue;
    if (ruleGame && !game) continue;
    if (scope === C.SCOPE.SESSION && (!sid || String(r.sessionId || '') !== sid)) continue;
    const text = String(r.text || '').trim();
    if (!text) continue;
    lines.push(`- ${text}`);
    if (scope === C.SCOPE.ONCE) onceIds.push(String(r.id));
  }
  return {
    text: lines.length ? withHeader('【行事约定 · 怎么做事】', lines.join('\n'), budget) : '',
    onceIds,
    missing: false,
  };
}

/** L3 长期记忆块：逐行查 fingerprint 元数据，跳过 ended / 被取代行，输出纠正文本 + 相对时间轻标记。 */
function buildLongterm(paths, asOf, budget) {
  const raw = readTextCached(paths.memoryMd);
  if (!raw) return { text: '', missing: true, skipped: 0 };
  const entries = store.readLongtermMeta().entries;
  // 收集所有被别的条目 supersedes 指向的 fingerprint
  const superseded = new Set();
  for (const e of Object.values(entries)) {
    if (!e || typeof e !== 'object') continue;
    const sup = e.supersedes;
    if (Array.isArray(sup)) sup.forEach((x) => superseded.add(String(x)));
    else if (sup) superseded.add(String(sup));
  }
  let fileMtime = Number(asOf) || Date.now();
  try {
    fileMtime = fs.statSync(paths.memoryMd).mtimeMs;
  } catch (err) {
    fileMtime = Number(asOf) || Date.now();
  }
  const lines = raw.split(/\r?\n/);
  const out = [];
  let skipped = 0;
  let minAt = Infinity;
  let maxAt = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || /^#{1,6}\s/.test(line)) continue;
    const fp = C.fingerprint(line);
    const m = entries[fp] && typeof entries[fp] === 'object' ? entries[fp] : null;
    if ((m && String(m.status) === 'ended') || superseded.has(fp)) {
      skipped += 1;
      continue;
    }
    const body = m && m.correctedText ? String(m.correctedText).trim() : line;
    if (!body) {
      skipped += 1;
      continue;
    }
    const at = Number(m && m.at) || fileMtime;
    if (Number.isFinite(at) && at > 0) {
      minAt = Math.min(minAt, at);
      maxAt = Math.max(maxAt, at);
    }
    out.push(`${body} · ${C.relativeLabel(at, asOf)}`);
  }
  const from = Number.isFinite(minAt) ? C.relativeLabel(minAt, asOf) : '早些时候';
  const to = maxAt > 0 ? C.relativeLabel(maxAt, asOf) : '最近';
  const head = `以下记录于 ${from} 至 ${to}（括号内时间只供你判断新旧，不要照搬进回复）`;
  // 不丢信息硬约束：MEMORY.md 的每一行都要进 system，渲染阶段不因行数多而截断。
  // 浓缩是 L2→L3 的异步动作（compact.js），不是这里偷偷丢行。
  const mdPart = out.length ? head + '\n' + out.join('\n') : '';

  // 新增：L2→L3 沉淀下来的长期事实（旁路文件，绝不动 MEMORY.md 原文）。
  // 只注入 status==='active'；被压缩的条目仍在文件里可追溯，这里跳过。
  const factLines = [];
  try {
    for (const f of store.readLongtermFacts()) {
      if (!f || String(f.status) !== 'active') continue;
      const body = String(f.text || '').trim();
      if (!body) continue;
      const factAt = Number(f.at) || fileMtime;
      factLines.push(`· ${body} · ${C.relativeLabel(factAt, asOf)}`);
    }
  } catch (err) {
    /* 旁路文件读不到就静默跳过，绝不影响 MEMORY.md 全文 */
  }
  const factsPart = factLines.length
    ? '【由近期记忆浓缩而成的长期事实】\n' + factLines.join('\n')
    : '';
  const text = [mdPart, factsPart].filter(Boolean).join('\n');
  if (!text) return { text: '', missing: true, skipped };
  return { text, missing: false, skipped };
}

/** 把 chatlog 行按「一轮 = user + 可选 assistant」分组，并按时间窗与噪声过滤。 */
function buildTurns(rows, asOf) {
  const now = Number(asOf) || Date.now();
  const from = now - C.RECENT_WINDOW_DAYS * C.DAY_MS;
  const turns = [];
  let current = null;
  for (const row of rows) {
    const at = toMillis(row.ts);
    if (!Number.isFinite(at) || at < from || at > now + C.DEDUP_TOLERANCE_MS) continue;
    if (isNoise(row)) continue;
    const role = String(row.role || 'user').toLowerCase();
    const text = String(row.text || '').trim();
    if (!text) continue;
    const turnId = row.turnId == null ? '' : String(row.turnId);
    if (role === 'assistant' || role === 'bot' || role === 'yu' || role === '和鱼' || role === '鱼') {
      if (current) current.assistant = text;
      else turns.push({ at, user: '', assistant: text, turnId });
      continue;
    }
    current = { at, user: text, assistant: '', turnId };
    turns.push(current);
  }
  return turns;
}

/** 双写去重：同 turnId 或同 text 前缀且时间差在容差内，只留一条；被吞掉的 assistant 合并过去。 */
function dedupeTurns(turns) {
  const lastByKey = new Map();
  const kept = [];
  for (const t of turns) {
    const key = t.turnId ? `id:${t.turnId}` : `txt:${(t.user || t.assistant).slice(0, 30)}`;
    const prev = lastByKey.get(key);
    if (prev && Math.abs(t.at - prev.at) <= C.DEDUP_TOLERANCE_MS) {
      if (!prev.turn.user && t.user) prev.turn.user = t.user;
      if (!prev.turn.assistant && t.assistant) prev.turn.assistant = t.assistant;
      continue;
    }
    const slot = { at: t.at, turn: t };
    lastByKey.set(key, slot);
    kept.push(t);
  }
  return kept;
}

/** 把一轮渲染成可读文本（不输出时间戳，避免裸日期进入 prompt）。 */
function renderTurns(turns) {
  return turns
    .map((t) => {
      const parts = [];
      if (t.user) parts.push(`老板：${t.user}`);
      if (t.assistant) parts.push(`小鱼：${t.assistant}`);
      return parts.join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

/** L2 近期块：最近 7 天对话（去重 + 去噪）+ 未过期的浓缩摘要。 */
function buildRecent(paths, asOf, budget) {
  const raw = readTextCached(paths.chatlog);
  const rows = [];
  if (raw) {
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj && typeof obj === 'object') rows.push(obj);
      } catch (err) {
        /* 坏行跳过，不影响其余 */
      }
    }
  }
  rows.sort((a, b) => toMillis(a.ts) - toMillis(b.ts));
  let turns = dedupeTurns(buildTurns(rows, asOf));
  if (turns.length > C.RECENT_MAX_TURNS) turns = turns.slice(-C.RECENT_MAX_TURNS);
  const chunks = [];
  const turnText = renderTurns(turns);
  if (turnText) chunks.push(withHeader('【近期对话】', turnText, Math.max(0, budget - 200)));

  const entries = store.readRecentDigest().entries;
  const ttl = C.DIGEST_TTL_DAYS * C.DAY_MS;
  const now = Number(asOf) || Date.now();
  // 已浓缩成长期事实的 digest 不再在 L2 重复注入（文件里仍保留，可追溯）
  const alive = entries.filter(
    (e) =>
      e &&
      Number(e.at) &&
      now - Number(e.at) <= ttl &&
      String(e.summary || '').trim() &&
      !e.compactedAt
  );
  if (alive.length) {
    const lines = alive.slice(-8).map((e) => `- ${String(e.summary).trim()}`);
    chunks.push(withHeader('【近期提炼摘要】', lines.join('\n'), Math.max(0, budget - 200)));
  }
  return { text: C.clipTailBytes(chunks.join('\n'), budget), missing: !raw };
}

/** L1 临时块：当前 session 的最近若干条明细 + 已生成 summary，只在该 game / sessionId 下输出。 */
function buildEphemeral(opts, budget) {
  const sid = opts.sessionId == null ? null : String(opts.sessionId);
  if (!sid) return { text: '', missing: true };
  const db = store.readEphemeral();
  const s = db.sessions && db.sessions[sid];
  if (!s || typeof s !== 'object') return { text: '', missing: true };
  if (opts.game && s.game && String(s.game) !== String(opts.game)) return { text: '', missing: true };
  if (opts.room && s.room && String(s.room) !== String(opts.room)) return { text: '', missing: true };
  const items = Array.isArray(s.items) ? s.items : [];
  const chunks = [];
  if (s.summary) chunks.push(`已提炼：${String(s.summary).trim()}`);
  const recent = items.slice(-C.EPHEMERAL_VIEW_ITEMS);
  if (recent.length) {
    const lines = recent.map((it) => {
      const data = it && it.data;
      let body = '';
      if (typeof data === 'string') body = data;
      else if (data !== undefined && data !== null) {
        try {
          body = JSON.stringify(data);
        } catch (err) {
          body = '';
        }
      }
      return `- ${String((it && it.kind) || 'step')}${body ? '：' + body : ''}`;
    });
    chunks.push(lines.join('\n'));
  }
  if (chunks.length === 0) return { text: '', missing: true };
  return { text: withHeader('【本局临时明细】', chunks.join('\n'), budget), missing: false };
}

/**
 * 构建四层记忆块。
 * @param {string} channel 'chat' | 'game' | 'api-chat' | 'yu'
 * @param {object} opts 支持 {game, sessionId, room, budgetBytes, tier, asOf, root}
 * @returns {{identity:string, adapters:string, longterm:string, recent:string, ephemeral:string, meta:object, render:function}}
 */
function buildMemoryBlocks(channel, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const ch = String(channel || 'chat');
  const asOf = Number(o.asOf) || Date.now();
  // 传入 root 时先切全局，保证 store 的读取与这里解析出的路径完全一致
  if (o.root) C.setRoot(o.root);
  const paths = C.resolvePaths();
  const tierName = o.tier && C.BUDGET[o.tier] ? o.tier : C.CHANNEL_TIER[ch] || 'standard';
  const tier = C.BUDGET[tierName] || C.BUDGET.standard;
  const totalBudget = Number(o.budgetBytes) > 0 ? Number(o.budgetBytes) : tier.total;

  let identity = '';
  let adapterText = '';
  let longterm = '';
  let recent = '';
  let ephemeral = '';
  let onceIds = [];
  const sources = [];
  let degraded = false;

  const layers = [
    ['adapters', () => buildAdapters(paths, o, tier.adapters), (r) => {
      adapterText = r.text;
      onceIds = r.onceIds;
    }],
    ['longterm', () => buildLongterm(paths, asOf, tier.longterm), (r) => { longterm = r.text; }],
    ['ephemeral', () => buildEphemeral(o, tier.ephemeral), (r) => { ephemeral = r.text; }],
    ['recent', () => buildRecent(paths, asOf, tier.recent), (r) => { recent = r.text; }],
    ['identity', () => buildIdentity(paths, tier.identity), (r) => { identity = r.text; }],
  ];
  for (const [name, make, assign] of layers) {
    let available = false;
    try {
      const result = make();
      assign(result);
      available = result.missing !== true;
      if (result.missing) degraded = true;
    } catch (err) {
      degraded = true;
    }
    // 只记录真正读到的来源（取绝对路径，便于部署后追溯）
    if (available) {
      const key = {
        adapters: paths.adapters,
        longterm: paths.memoryMd,
        ephemeral: paths.ephemeral,
        recent: paths.chatlog,
        identity: paths.agentsMd,
      }[name];
      sources.push(key);
    }
  }

  /** 组装最终 prompt：时间规则在最前，块间用分隔线，超预算按优先级从低到高削减。 */
  const meta = {
    bytes: 0,
    budget: totalBudget,
    tier: tierName,
    sources: Array.from(new Set(sources)),
    degraded,
    onceIds,
    channel: ch,
    asOf,
    game: o.game == null ? null : String(o.game),
    room: o.room == null ? null : String(o.room),
  };

  const order = [
    { name: 'adapters', text: adapterText },
    { name: 'longterm', text: longterm },
    { name: 'ephemeral', text: ephemeral },
    { name: 'recent', text: recent },
    { name: 'identity', text: identity },
  ];
  // 削减顺序：只动 recent / ephemeral。
  // identity（人设）、longterm（长期事实）、adapters（用户刚说的约定）一律不裁。
  // 若这两块裁光仍超预算就停手，宁可 meta.degraded 标 true，也不丢信息。
  const cutOrder = C.CUTTABLE_BLOCKS;
  const sep = '\n\n---\n\n';

  /** 拼接当前块集合。 */
  function compose(bs) {
    const body = bs.map((b) => b.text).join(sep);
    return C.TIMESTAMP_RULES + (body ? sep + body : '');
  }

  /** 渲染：按 BUDGET 尾部对齐裁剪，并把裸 ISO 日期换成相对表达。 */
  function render() {
    const initial = order.filter((b) => b.text && b.text.trim());
    let bs = initial.map((b) => ({ name: b.name, text: b.text }));
    let out = compose(bs);
    let trimmed = false;
    let guard = 0;
    while (C.byteLen(out) > totalBudget && bs.length > 0 && guard < 200) {
      guard += 1;
      let target = null;
      for (const name of cutOrder) {
        const found = bs.find((b) => b.name === name);
        if (found) {
          target = found;
          break;
        }
      }
      if (!target) break;
      const size = C.byteLen(target.text);
      const minKeep = target.name === 'adapters' ? Math.ceil(size * 0.5) : 0;
      if (size <= minKeep) {
        if (target.name === 'adapters') break;
        bs = bs.filter((b) => b !== target);
        trimmed = true;
        out = compose(bs);
        continue;
      }
      const nextSize = Math.max(minKeep, Math.floor(size * 0.6));
      const candidate = C.clipTailBytes(target.text, nextSize);
      if (C.byteLen(candidate) >= size) {
        if (target.name === 'adapters') break;
        bs = bs.filter((b) => b !== target);
      } else {
        target.text = candidate;
        if (!target.text.trim()) bs = bs.filter((b) => b !== target);
      }
      trimmed = true;
      out = compose(bs);
    }
    const finalText = C.scrubIsoDates(out, asOf);
    meta.bytes = C.byteLen(finalText);
    meta.degraded = degraded || trimmed || bs.length < initial.length;
    return finalText;
  }

  return { identity, adapters: adapterText, longterm, recent, ephemeral, meta, render };
}

module.exports = { buildMemoryBlocks, clearCache };
