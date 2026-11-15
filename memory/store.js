/**
 * 四层记忆系统 · 唯一写入模块。
 *
 * 为什么这么设计：
 * 1) 现网有多个进程同时读写（PM2 5 个服务），写 JSON 最怕写一半被别的进程读到，
 *    所以一律「同目录临时文件 + rename 原子替换」，rename 在同一文件系统内是原子的。
 * 2) 用户硬约束「不丢失信息」：所有失效（撤销 / 用掉 / 局终 / 被纠正）都只把 status
 *    改成 ended / consumed 归档，永不物理删除任何条目，也不删任何原始明细。
 * 3) 主链路是聊天与游戏响应，记忆写入属于旁路，任何异常都必须被吞掉并返回安全默认值，
 *    绝不能因为记忆文件坏掉就让小鱼不说话。踩过的坑：JSON.parse 抛错冒泡到 chat 路由，整站 500。
 *
 * 旧写入端（summarize.py / chatlog / shared-state）一律不碰，本模块只写 memory/data/ 下四个新文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./constants');

/** 各数据文件的空结构（也是首次部署时 data/ 下的初版内容）。 */
const EMPTY = Object.freeze({
  ephemeral: () => ({ version: 1, sessions: {} }),
  longtermMeta: () => ({ version: 1, entries: {} }),
  recentDigest: () => ({ version: 1, entries: [] }),
  adapters: () => ({ version: 1, rules: [] }),
  longtermFacts: () => ({ version: 1, entries: [] }),
  compactState: () => ({ version: 1, lastRunAt: 0 }),
});

/** 深拷贝，避免调用方拿到 fallback 引用后污染后续默认值。 */
function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return value;
  }
}

/** 安全读 JSON；文件不存在 / 损坏 / 权限问题一律返回 fallback 副本。 */
function readJson(file, fallback) {
  const base = fallback === undefined ? {} : fallback;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw || !raw.trim()) return clone(base);
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return clone(base);
    return parsed;
  } catch (err) {
    return clone(base);
  }
}

/** 原子写 JSON：先写同目录 .tmp，再 rename 覆盖；任何失败返回 false，绝不抛。 */
function writeJson(file, obj) {
  let tmp = '';
  try {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    tmp = path.join(
      dir,
      `.${path.basename(file)}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`
    );
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    if (tmp) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch (ignored) {
        /* 清理失败也无所谓，绝不冒泡 */
      }
    }
    return false;
  }
}

/** 生成本地唯一 id，形如 adp_m3x9k1_3f9a2b。 */
function genId(prefix) {
  const head = String(prefix || 'id').replace(/[^a-zA-Z0-9_-]/g, '') || 'id';
  return `${head}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

/** 稳定短哈希：把元数据绑定到 MEMORY.md 的某一行，不怕行号变动。 */
function fingerprint(text) {
  return C.fingerprint(text);
}

/** 幂等创建六个初版数据文件（只补不覆盖）。 */
function ensureDataFiles() {
  const p = C.resolvePaths();
  const pairs = [
    [p.ephemeral, EMPTY.ephemeral],
    [p.longtermMeta, EMPTY.longtermMeta],
    [p.recentDigest, EMPTY.recentDigest],
    [p.adapters, EMPTY.adapters],
    [p.longtermFacts, EMPTY.longtermFacts],
    [p.compactState, EMPTY.compactState],
  ];
  const created = [];
  for (const [file, make] of pairs) {
    try {
      if (!fs.existsSync(file) && writeJson(file, make())) created.push(path.basename(file));
    } catch (err) {
      /* 单个文件失败不影响其余 */
    }
  }
  return created;
}

/** 只读：全部适配器规则。 */
function readAdapters() {
  const db = readJson(C.resolvePaths().adapters, EMPTY.adapters());
  return Array.isArray(db.rules) ? db.rules : [];
}

/** 只读：L1 会话库。 */
function readEphemeral() {
  const db = readJson(C.resolvePaths().ephemeral, EMPTY.ephemeral());
  if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {};
  return db;
}

/** 只读：L3 行级元数据。 */
function readLongtermMeta() {
  const db = readJson(C.resolvePaths().longtermMeta, EMPTY.longtermMeta());
  if (!db.entries || typeof db.entries !== 'object') db.entries = {};
  return db;
}

/** 只读：L2 浓缩摘要。 */
function readRecentDigest() {
  const db = readJson(C.resolvePaths().recentDigest, EMPTY.recentDigest());
  if (!Array.isArray(db.entries)) db.entries = [];
  return db;
}

/** 把一条明细的 data 变成可读文本。 */
function describeItem(it) {
  const data = it && it.data;
  const kind = String((it && it.kind) || 'step');
  if (data === undefined || data === null || data === '') return kind;
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch (err) {
    return kind;
  }
}

/**
 * 把 L1 明细压成「有代表性或特殊性」的摘要文本（零依赖的启发式提炼）。
 * 特殊 kind 全留关键节点，普通 kind 每种取一条样本，再附频次统计；明细本身绝不删。
 */
function distillItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return '';
  const specialKinds = new Set(['result', 'win', 'lose', 'draw', 'special', 'error', 'milestone', 'summary']);
  const specials = [];
  const counts = new Map();
  for (const it of list) {
    const kind = String((it && it.kind) || 'step');
    counts.set(kind, (counts.get(kind) || 0) + 1);
    if (specialKinds.has(kind)) specials.push(it);
  }
  const seenKind = new Set();
  const samples = [];
  for (const it of list) {
    const kind = String((it && it.kind) || 'step');
    if (specialKinds.has(kind) || seenKind.has(kind)) continue;
    seenKind.add(kind);
    samples.push(it);
  }
  const kinds = Array.from(counts.entries()).map(([k, n]) => `${k}×${n}`).join('、');
  const parts = [`共 ${list.length} 条明细（${kinds}）`];
  if (specials.length) parts.push('关键节点：' + specials.slice(-6).map(describeItem).join('；'));
  if (samples.length) parts.push('典型步骤：' + samples.slice(0, 4).map(describeItem).join('；'));
  return parts.join('。') + '。';
}

/** 内部：把某 session 尚未提炼的明细上浮为 L2 摘要，明细保留不删。 */
function distillLocked(session, sessionId) {
  const items = Array.isArray(session.items) ? session.items : [];
  const from = Number(session.lastDistilledIndex) || 0;
  if (from >= items.length) return false;
  const pending = items.slice(from);
  const summary = distillItems(pending);
  if (!summary) return false;
  const now = Date.now();
  const firstAt = Number(pending[0] && pending[0].at) || now;
  const lastAt = Number(pending[pending.length - 1] && pending[pending.length - 1].at) || now;
  const digest = appendRecentDigest({
    at: now,
    windowFrom: firstAt,
    windowTo: lastAt,
    summary: `[L1归档 ${session.game || session.channel || 'game'}] ${summary}`,
    sourceCount: pending.length,
    sessionId,
  });
  if (!digest) return false;
  session.summary = [session.summary, summary].filter(Boolean).join(' ');
  session.lastDistilledIndex = items.length;
  session.distilledAt = now;
  return true;
}

/** L1：追加一条明细；达到条数阈值时自动提炼上浮 L2，原始明细保留不删。 */
function appendEphemeral(sessionId, item) {
  const sid = String(sessionId || 'default');
  const src = item && typeof item === 'object' ? item : {};
  try {
    const p = C.resolvePaths();
    const db = readEphemeral();
    let s = db.sessions[sid];
    if (!s || typeof s !== 'object') {
      s = {
        channel: String(src.channel || ''),
        game: String(src.game || ''),
        room: String(src.room || ''),
        startedAt: Date.now(),
        endedAt: null,
        items: [],
        summary: '',
        lastDistilledIndex: 0,
      };
      db.sessions[sid] = s;
    }
    if (!Array.isArray(s.items)) s.items = [];
    const record = {
      at: Number(src.at) || Date.now(),
      kind: String(src.kind || 'step'),
      data: Object.prototype.hasOwnProperty.call(src, 'data') ? src.data : null,
    };
    s.items.push(record);
    if (src.game && !s.game) s.game = String(src.game);
    if (src.channel && !s.channel) s.channel = String(src.channel);
    if (src.room && !s.room) s.room = String(src.room);

    const pendingCount = s.items.length - (Number(s.lastDistilledIndex) || 0);
    if (pendingCount >= C.EPHEMERAL_DISTILL_THRESHOLD) distillLocked(s, sid);
    writeJson(p.ephemeral, db);
    return record;
  } catch (err) {
    return { at: Date.now(), kind: 'step', data: null };
  }
}

/** L1 局终：标记 endedAt 并做最后一次提炼归档（不删任何明细）。 */
function endEphemeralSession(sessionId, summaryText) {
  const sid = String(sessionId || 'default');
  const external = typeof summaryText === 'string' ? summaryText.trim() : '';
  try {
    const p = C.resolvePaths();
    const db = readEphemeral();
    let s = db.sessions[sid];
    if (!s || typeof s !== 'object') {
      if (!external) return false;
      s = { channel: '', game: '', room: '', startedAt: Date.now(), endedAt: null,
            items: [], summary: '', lastDistilledIndex: 0 };
      db.sessions[sid] = s;
    }
    if (!Array.isArray(s.items)) s.items = [];
    distillLocked(s, sid);
    // 场景侧算好的局终摘要（含胜负与关键手）优先覆盖启发式摘要，
    // 并上浮 L2，保证局后在别的通道也能讨论具体细节。
    if (external) {
      s.summary = external;
      appendRecentDigest({ at: Date.now(), windowFrom: Number(s.startedAt) || Date.now(),
        windowTo: Date.now(), summary: `[局终] ${external}`,
        sourceCount: s.items.length, sessionId: sid });
    }
    if (!s.endedAt) s.endedAt = Date.now();
    writeJson(p.ephemeral, db);
    return true;
  } catch (err) {
    return false;
  }
}

/** L3：为 MEMORY.md 的某一行（用 fingerprint 定位）补 / 改一条旁路元数据。 */
function addFactMeta(fp, patch) {
  const key = String(fp || '');
  if (!key) return null;
  try {
    const p = C.resolvePaths();
    const db = readLongtermMeta();
    const prev = db.entries[key] && typeof db.entries[key] === 'object' ? db.entries[key] : {};
    const entry = Object.assign(
      {
        at: Date.now(),
        atKnown: true,
        status: 'active',
        supersedes: null,
        correctedText: null,
        source: null,
      },
      prev,
      patch || {}
    );
    db.entries[key] = entry;
    // 新条目显式取代旧条目时，把旧条目归档（ended），绝不物理删除
    const sup = entry.supersedes;
    const targets = Array.isArray(sup) ? sup : sup ? [sup] : [];
    for (const t of targets) {
      const oldKey = String(t);
      if (oldKey && oldKey !== key && db.entries[oldKey] && typeof db.entries[oldKey] === 'object') {
        db.entries[oldKey].status = 'ended';
      }
    }
    writeJson(p.longtermMeta, db);
    return entry;
  } catch (err) {
    return null;
  }
}

/** L4：新增一条适配器规则；同 game 下的旧「规则改成」会被 supersedes 归档。 */
function addAdapter(rule) {
  const r = rule && typeof rule === 'object' ? rule : {};
  try {
    const p = C.resolvePaths();
    const db = readJson(p.adapters, EMPTY.adapters());
    if (!Array.isArray(db.rules)) db.rules = [];
    const scopeKey = String(r.scope || '').toUpperCase();
    const record = {
      id: String(r.id || genId('adp')),
      at: Number(r.at) || Date.now(),
      text: String(r.text || '').trim(),
      scope: C.SCOPE[scopeKey] || String(r.scope || C.SCOPE.SESSION),
      game: r.game == null ? null : String(r.game),
      sessionId: r.sessionId == null ? null : String(r.sessionId),
      status: 'active',
      supersedes: r.supersedes == null ? null : r.supersedes,
      source: r.source == null ? null : String(r.source),
    };
    if (!record.text) return null;
    // 「规则改成 / 以后都」类新规则：把同 game 的旧 active 长期规则归档为被取代
    if (record.scope === C.SCOPE.GAME && (r.replacePrevious === true || /规则改成|以后都|默认/.test(record.text))) {
      for (const old of db.rules) {
        if (old && old.status === 'active' && old.scope === C.SCOPE.GAME && old.game === record.game) {
          old.status = 'ended';
          if (!Array.isArray(record.supersedes)) record.supersedes = [];
          record.supersedes.push(String(old.id));
        }
      }
    }
    db.rules.push(record);
    writeJson(p.adapters, db);
    return record;
  } catch (err) {
    return null;
  }
}

/** L4：把用掉的 once 规则标记 consumed（归档，不删）。 */
function consumeOnce(ids) {
  const list = Array.isArray(ids) ? ids.map(String) : ids ? [String(ids)] : [];
  if (list.length === 0) return [];
  const wanted = new Set(list);
  try {
    const p = C.resolvePaths();
    const db = readJson(p.adapters, EMPTY.adapters());
    if (!Array.isArray(db.rules)) return [];
    const done = [];
    for (const r of db.rules) {
      if (r && wanted.has(String(r.id)) && r.status === 'active' && r.scope === C.SCOPE.ONCE) {
        r.status = 'consumed';
        r.consumedAt = Date.now();
        done.push(String(r.id));
      }
    }
    if (done.length) writeJson(p.adapters, db);
    return done;
  } catch (err) {
    return [];
  }
}

/** L4：局终把该 session 的 session 档规则置 ended（归档，不删）。 */
function endSessionAdapters(sessionId) {
  const sid = String(sessionId || '');
  if (!sid) return 0;
  try {
    const p = C.resolvePaths();
    const db = readJson(p.adapters, EMPTY.adapters());
    if (!Array.isArray(db.rules)) return 0;
    let n = 0;
    for (const r of db.rules) {
      if (r && r.status === 'active' && r.scope === C.SCOPE.SESSION && String(r.sessionId) === sid) {
        r.status = 'ended';
        r.endedAt = Date.now();
        n += 1;
      }
    }
    if (n) writeJson(p.adapters, db);
    return n;
  } catch (err) {
    return 0;
  }
}

/** L4：按 id 或文本关键词撤销规则（归档，不删）。 */
function revokeAdapter(idOrText) {
  const needle = String(idOrText || '').trim();
  if (!needle) return [];
  try {
    const p = C.resolvePaths();
    const db = readJson(p.adapters, EMPTY.adapters());
    if (!Array.isArray(db.rules)) return [];
    const revoked = [];
    for (const r of db.rules) {
      if (!r || r.status !== 'active') continue;
      const id = String(r.id || '');
      const text = String(r.text || '');
      const partial = needle.length >= 4 && text.length >= 4 && (text.includes(needle) || needle.includes(text));
      if (id === needle || text === needle || partial) {
        r.status = 'ended';
        r.endedAt = Date.now();
        revoked.push({ id, text, scope: r.scope });
      }
    }
    if (revoked.length) writeJson(p.adapters, db);
    return revoked;
  } catch (err) {
    return [];
  }
}

/** L2：追加一条浓缩摘要（L1 上浮 / 未来旁路 summarize 都走这里），只追加不删。 */
function appendRecentDigest(entry) {
  const e = entry && typeof entry === 'object' ? entry : {};
  try {
    const p = C.resolvePaths();
    const db = readRecentDigest();
    const now = Date.now();
    const record = {
      id: String(e.id || genId('dg')),
      at: Number(e.at) || now,
      windowFrom: Number(e.windowFrom) || now,
      windowTo: Number(e.windowTo) || now,
      summary: String(e.summary || '').trim(),
      sourceCount: Number(e.sourceCount) || 0,
    };
    if (!record.summary) return null;
    if (e.sessionId != null) record.sessionId = String(e.sessionId);
    db.entries.push(record);
    writeJson(p.recentDigest, db);
    return record;
  } catch (err) {
    return null;
  }
}

/** 只读：L3 由 L2 浓缩而来的长期事实（防损坏，永远返回数组）。 */
function readLongtermFacts() {
  const db = readJson(C.resolvePaths().longtermFacts, EMPTY.longtermFacts());
  return Array.isArray(db.entries) ? db.entries : [];
}

/** 追加一条浓缩长期事实；同文本 active 已存在则跳过（幂等），返回记录或 null。 */
function appendLongtermFact(entry) {
  const e = entry && typeof entry === 'object' ? entry : {};
  const text = String(e.text || '').trim();
  if (!text) return null;
  try {
    const p = C.resolvePaths();
    const db = readJson(p.longtermFacts, EMPTY.longtermFacts());
    if (!Array.isArray(db.entries)) db.entries = [];
    for (const old of db.entries) {
      if (old && String(old.status) === 'active' && String(old.text || '').trim() === text) return old;
    }
    const record = {
      id: String(e.id || genId('lf')),
      at: Number(e.at) || Date.now(),
      text,
      status: 'active',
      source: e.source == null ? null : String(e.source),
      kind: e.kind == null ? 'distilled' : String(e.kind),
    };
    db.entries.push(record);
    writeJson(p.longtermFacts, db);
    return record;
  } catch (err) {
    return null;
  }
}

/** 把指定长期事实置 compacted（归档保留，永不物理删除）。 */
function markFactsCompacted(ids) {
  const list = Array.isArray(ids) ? ids.map(String) : ids ? [String(ids)] : [];
  if (list.length === 0) return [];
  const wanted = new Set(list);
  try {
    const p = C.resolvePaths();
    const db = readJson(p.longtermFacts, EMPTY.longtermFacts());
    if (!Array.isArray(db.entries)) return [];
    const done = [];
    for (const f of db.entries) {
      if (f && wanted.has(String(f.id)) && String(f.status) === 'active') {
        f.status = 'compacted';
        f.compactedAt = Date.now();
        done.push(String(f.id));
      }
    }
    if (done.length) writeJson(p.longtermFacts, db);
    return done;
  } catch (err) {
    return [];
  }
}

/** 只读：30 天节流状态；文件缺失 / 损坏时回落到最早时间 0。 */
function readCompactState() {
  const db = readJson(C.resolvePaths().compactState, EMPTY.compactState());
  return { lastRunAt: Number(db.lastRunAt) || 0 };
}

/** 写 30 天节流状态（原子替换）。 */
function writeCompactState(state) {
  const s = state && typeof state === 'object' ? state : {};
  try {
    const p = C.resolvePaths();
    return writeJson(p.compactState, {
      version: 1,
      lastRunAt: Number(s.lastRunAt) || Date.now(),
    });
  } catch (err) {
    return false;
  }
}

/** 给 L2 摘要打 compactedAt（不删条目），保证 L2→L3 幂等、可追溯。 */
function markDigestsCompacted(ids) {
  const list = Array.isArray(ids) ? ids.map(String) : ids ? [String(ids)] : [];
  if (list.length === 0) return [];
  const wanted = new Set(list);
  try {
    const p = C.resolvePaths();
    const db = readJson(p.recentDigest, EMPTY.recentDigest());
    if (!Array.isArray(db.entries)) return [];
    const done = [];
    for (const d of db.entries) {
      if (d && wanted.has(String(d.id)) && !d.compactedAt) {
        d.compactedAt = Date.now();
        done.push(String(d.id));
      }
    }
    if (done.length) writeJson(p.recentDigest, db);
    return done;
  } catch (err) {
    return [];
  }
}

module.exports = {
  EMPTY,
  readJson,
  writeJson,
  genId,
  fingerprint,
  clone,
  ensureDataFiles,
  appendEphemeral,
  endEphemeralSession,
  addFactMeta,
  addAdapter,
  consumeOnce,
  endSessionAdapters,
  revokeAdapter,
  appendRecentDigest,
  readAdapters,
  readEphemeral,
  readLongtermMeta,
  readRecentDigest,
  readLongtermFacts,
  appendLongtermFact,
  markFactsCompacted,
  readCompactState,
  writeCompactState,
  markDigestsCompacted,
};
