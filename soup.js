/* ============================================================
   「海龟汤」· 联机房间服务  (soup.js)
   ------------------------------------------------------------
   玩法：一个主持人知道汤底，只回答「是 / 不是 / 不重要 / 部分 /
   无法确认」；一个或多个参与者提问、猜汤底。主持人也可以给提示、
   揭晓汤底或换一题。

   设计参考（不改动其它模块）：
     · 房间 / SSE / 落盘 / 裁剪视图的写法与 lx.js、五子棋一致；
     · 题目与判定协议参考 Soupbase（MIT，见 soup-content.js 头部）。
   服务端是唯一权威：汤底只下发给主持人；游戏结束后才向所有人公开。
   房间状态落盘 data/soup/<房间号>.json；零依赖。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const CONTENT = require('./soup-content.js');

module.exports = function createSoup(ctx) {
  const { DATA, json, readBody, normCode } = ctx;
  const DIR = path.join(DATA, 'soup');
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) { console.error('[soup dir]', e.message); }

  const CODE_RE = /^[A-Za-z0-9_-]{1,12}$/;
  const MAX_PLAYERS = 8;             // 参与者上限（主持人另算）
  const ONLINE_MS = 60 * 1000;
  const HOST_TAKEOVER_MS = 2 * 60 * 1000;  // 主持人掉线超过 2 分钟，允许别人接任
  const LOG_KEEP = 80;
  const QA_KEEP = 150;
  const CHAT_KEEP = 150;
  const GUESS_KEEP = 60;

  const VERDICTS = ['yes', 'no', 'irrelevant', 'partial', 'unknown'];
  const VERDICT_CN = {
    yes: '是', no: '不是', irrelevant: '不重要', partial: '部分是', unknown: '无法确认',
  };
  const JUDGES = ['correct', 'partial', 'no'];
  const JUDGE_CN = { correct: '猜对了', partial: '很接近', no: '还不对' };

  /* 鱼的加入方式：由建房/进房的人决定，不选就不加入。 */
  const FISH_MODES = ['none', 'host', 'player'];

  /* 汤品图鉴：全局记录打过的汤，默认不再重复出；主持人仍可手动重打。 */
  const CODEX_PATH = path.join(DATA, 'soup-codex.json');
  let codex = {};
  try {
    if (fs.existsSync(CODEX_PATH)) codex = JSON.parse(fs.readFileSync(CODEX_PATH, 'utf8')) || {};
  } catch (e) { console.error('[soup codex]', e.message); }
  let codexTimer = null;
  function saveCodex() {
    clearTimeout(codexTimer);
    codexTimer = setTimeout(() => {
      codexTimer = null;
      try { fs.writeFileSync(CODEX_PATH, JSON.stringify(codex, null, 2)); }
      catch (e) { console.error('[soup codex save]', e.message); }
    }, 500);
  }
  function codexEntry(id) {
    return id && codex[id] ? codex[id] : null;
  }
  function recordCodex(r, result) {
    const p = puzzleOf(r);
    if (!p) return;
    const now = Date.now();
    const e = codex[p.id] || (codex[p.id] = {
      title: p.title, difficulty: p.difficulty, times: 0, firstAt: now, lastAt: 0, lastResult: '', lastRoom: '',
    });
    e.title = p.title;
    e.difficulty = p.difficulty;
    e.times = (Number(e.times) || 0) + 1;
    e.firstAt = Number(e.firstAt) || now;
    e.lastAt = now;
    e.lastResult = result;
    e.lastRoom = r.code;
    saveCodex();
  }

  const rooms = new Map();
  const saveTimers = new Map();

  function roomPath(code) {
    return path.join(DIR, code.replace(/[^A-Za-z0-9_-]/g, '') + '.json');
  }
  function cleanStr(s, n) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').slice(0, n || 200);
  }
  function isOnline(u) {
    return !!u && Date.now() - (Number(u.lastSeen) || 0) < ONLINE_MS;
  }
  function puzzleOf(r) {
    return r.puzzleId ? CONTENT.get(r.puzzleId) : null;
  }
  function hostOf(r) {
    return r.users.find((u) => u.role === 'host') || null;
  }
  function members(r) {
    return r.users;
  }

  function blankRoom(code) {
    return {
      code,
      users: [],                 // { pid, name, role:'host'|'player', lastSeen, seat, hits:[] }
      fishMode: 'none',          // none | host | player：开局前由建房/进房的人选择
      phase: 'lobby',            // lobby | playing | over
      puzzleId: null,
      hintsShown: 0,
      qa: [],                    // { id, pid, name, text, at, verdict:null, note:'', by, answeredAt }
      guesses: [],               // { id, pid, name, text, at, verdict:null, note:'', by, judgedAt }
      chat: [],                  // { pid, name, text, at }
      log: [],                   // { text, at }
      seq: 0,
      rev: 1,
      startedAt: 0,
      overAt: 0,
      lastAt: Date.now(),
      subs: new Set(),
      onlineSig: '',
    };
  }

  function loadRoom(code) {
    /* 只读接口也可能收到奇怪的 code；不合规就返回一个不入内存的临时房，
     * 避免在 rooms Map 里堆垃圾（真正的建/进房在 enter 里已严格校验）。 */
    if (!CODE_RE.test(code)) return blankRoom(code);
    let r = rooms.get(code);
    if (r) return r;
    r = blankRoom(code);
    try {
      const f = roomPath(code);
      if (fs.existsSync(f)) {
        const j = JSON.parse(fs.readFileSync(f, 'utf8')) || {};
        r.phase = ['lobby', 'playing', 'over'].includes(j.phase) ? j.phase : 'lobby';
        r.fishMode = FISH_MODES.includes(j.fishMode) ? j.fishMode : 'none';
        r.puzzleId = j.puzzleId ? String(j.puzzleId).slice(0, 40) : null;
        if (r.puzzleId && !CONTENT.get(r.puzzleId)) { r.puzzleId = null; r.phase = 'lobby'; }
        r.hintsShown = Math.max(0, Number(j.hintsShown) || 0);
        r.seq = Math.max(0, Number(j.seq) || 0);
        r.rev = Math.max(1, Number(j.rev) || 1);
        r.startedAt = Number(j.startedAt) || 0;
        r.overAt = Number(j.overAt) || 0;
        r.lastAt = Number(j.lastAt) || Date.now();
        if (Array.isArray(j.users)) {
          r.users = j.users.slice(0, MAX_PLAYERS + 1)
            .filter((u) => u && u.pid)
            .map((u, i) => ({
              pid: cleanStr(u.pid, 40),
              name: cleanStr(u.name, 12) || '玩家',
              role: u.role === 'host' ? 'host' : 'player',
              lastSeen: Number(u.lastSeen) || 0,
              seat: i,
              hits: {},
            }));
          /* 存档里最多只能有一个主持人，多余的降为参与者 */
          let seenHost = false;
          r.users.forEach((u) => {
            if (u.role === 'host') {
              if (seenHost) u.role = 'player';
              seenHost = true;
            }
          });
        }
        if (Array.isArray(j.qa)) {
          r.qa = j.qa.slice(-QA_KEEP).filter((q) => q && q.text).map((q) => ({
            id: Number(q.id) || 0,
            pid: cleanStr(q.pid, 40),
            name: cleanStr(q.name, 12) || '玩家',
            text: cleanStr(q.text, 160),
            at: Number(q.at) || 0,
            verdict: VERDICTS.includes(q.verdict) ? q.verdict : null,
            note: cleanStr(q.note, 80),
            by: cleanStr(q.by, 12),
            answeredAt: Number(q.answeredAt) || 0,
          }));
        }
        if (Array.isArray(j.guesses)) {
          r.guesses = j.guesses.slice(-GUESS_KEEP).filter((g) => g && g.text).map((g) => ({
            id: Number(g.id) || 0,
            pid: cleanStr(g.pid, 40),
            name: cleanStr(g.name, 12) || '玩家',
            text: cleanStr(g.text, 200),
            at: Number(g.at) || 0,
            verdict: JUDGES.includes(g.verdict) ? g.verdict : null,
            note: cleanStr(g.note, 80),
            by: cleanStr(g.by, 12),
            judgedAt: Number(g.judgedAt) || 0,
          }));
        }
        if (Array.isArray(j.chat)) {
          r.chat = j.chat.slice(-CHAT_KEEP).filter((m) => m && m.text).map((m) => ({
            pid: cleanStr(m.pid, 40),
            name: cleanStr(m.name, 12) || '玩家',
            text: cleanStr(m.text, 300),
            at: Number(m.at) || 0,
          }));
        }
        if (Array.isArray(j.log)) {
          r.log = j.log.slice(-LOG_KEEP).filter((x) => x && x.text).map((x) => ({
            text: cleanStr(x.text, 200), at: Number(x.at) || 0,
          }));
        }
        /* 旧存档没走完的回合，提示数不能超过题库实际条数 */
        const p = puzzleOf(r);
        if (p) r.hintsShown = Math.min(r.hintsShown, p.hints.length);
      }
    } catch (e) { console.error('[soup load]', code, e.message); }
    rooms.set(code, r);
    return r;
  }

  function saveRoom(r) {
    clearTimeout(saveTimers.get(r.code));
    saveTimers.set(r.code, setTimeout(() => {
      saveTimers.delete(r.code);
      try {
        fs.writeFileSync(roomPath(r.code), JSON.stringify({
          code: r.code,
          users: r.users.map((u) => ({
            pid: u.pid, name: u.name, role: u.role, lastSeen: u.lastSeen, seat: u.seat,
          })),
          phase: r.phase,
          puzzleId: r.puzzleId,
          fishMode: r.fishMode,
          hintsShown: r.hintsShown,
          qa: r.qa.slice(-QA_KEEP),
          guesses: r.guesses.slice(-GUESS_KEEP),
          chat: r.chat.slice(-CHAT_KEEP),
          log: r.log.slice(-LOG_KEEP),
          seq: r.seq,
          rev: r.rev,
          startedAt: r.startedAt,
          overAt: r.overAt,
          lastAt: r.lastAt,
        }));
      } catch (e) { console.error('[soup save]', r.code, e.message); }
    }, 900));
  }

  function pushLog(r, text) {
    r.log.push({ text, at: Date.now() });
    if (r.log.length > LOG_KEEP) r.log.splice(0, r.log.length - LOG_KEEP);
  }

  /* ------------------------------------------------------------
     ★ 裁剪视图：汤底 / 事实 / 全部提示只给主持人；
       游戏结束后汤底才向所有人公开。每个订阅者单独计算，
       不能广播同一份（否则等于把汤底发给了玩家）。
     ------------------------------------------------------------ */
  function viewFor(r, pid) {
    const me = r.users.find((u) => u.pid === pid) || null;
    const isHost = !!me && me.role === 'host';
    const p = puzzleOf(r);
    const over = r.phase === 'over';
    const showSolution = !!p && (isHost || over);
    const cx = p ? codexEntry(p.id) : null;
    return {
      code: r.code,
      rev: r.rev,
      phase: r.phase,
      fishMode: r.fishMode,
      role: me ? me.role : '',
      isHost,
      me: me ? { name: me.name, role: me.role } : null,
      users: r.users.map((u) => ({
        name: u.name, role: u.role, online: isOnline(u), me: u.pid === pid,
      })),
      host: (() => {
        const h = hostOf(r);
        return h ? { name: h.name, online: isOnline(h), me: h.pid === pid } : null;
      })(),
      playerCount: r.users.filter((u) => u.role === 'player').length,
      puzzle: p ? {
        id: p.id,
        title: p.title,
        surface: p.surface,
        difficulty: p.difficulty,
        difficultyLabel: CONTENT.DIFFICULTY[p.difficulty] || p.difficulty,
        tags: p.tags.slice(),
        done: !!cx,
        times: cx ? Number(cx.times) || 0 : 0,
        source: { name: p.source.name, url: p.source.url, license: p.source.license },
      } : null,
      hintsShown: r.hintsShown,
      hints: p ? p.hints.slice(0, r.hintsShown) : [],
      solution: showSolution ? p.solution : null,
      facts: isHost && p ? p.facts.map((f) => ({ text: f.text, required: !!f.required })) : null,
      unknowns: isHost && p ? p.unknowns.slice() : null,
      allHints: isHost && p ? p.hints.slice() : null,
      qa: r.qa.slice(-80).map((q) => ({
        id: q.id, name: q.name, text: q.text, at: q.at,
        verdict: q.verdict, note: q.note, by: q.by, mine: q.pid === pid,
      })),
      guesses: r.guesses.slice(-40).map((g) => ({
        id: g.id, name: g.name, text: g.text, at: g.at,
        verdict: g.verdict, note: g.note, by: g.by, mine: g.pid === pid,
      })),
      chat: r.chat.slice(-100).map((m) => ({
        name: m.name, text: m.text, at: m.at, mine: m.pid === pid,
      })),
      log: r.log.slice(-40),
      openQuestions: r.qa.filter((q) => q.verdict == null).length,
      pendingGuesses: r.guesses.filter((g) => g.verdict == null).length,
      startedAt: r.startedAt,
      overAt: r.overAt,
    };
  }

  function broadcast(r) {
    for (const s of r.subs) {
      try {
        s.res.write('event: state\ndata: ' + JSON.stringify({
          rev: r.rev, state: viewFor(r, s.pid),
        }) + '\n\n');
      } catch (e) { /* 连接已断，等 close 清理 */ }
    }
  }
  function touch(r) {
    r.rev += 1;
    r.lastAt = Date.now();
    saveRoom(r);
    broadcast(r);
  }

  function findMe(r, pid) {
    return r.users.find((u) => u.pid === pid) || null;
  }
  function promoteHost(r, exceptPid) {
    const cand = r.users.find((u) => u.pid !== exceptPid && u.role === 'player');
    if (!cand) return null;
    cand.role = 'host';
    return cand;
  }
  function rateOk(u, kind, now, limit, windowMs) {
    /* 提问 / 猜底 / 聊天各自一个桶：共用一个数组会让「问得多的玩家
     * 反而不能猜底」，实测踩过。 */
    if (!u.hits || Array.isArray(u.hits)) u.hits = {};
    const arr = (u.hits[kind] || []).filter((t) => now - t < windowMs);
    u.hits[kind] = arr;
    if (arr.length >= limit) return false;
    arr.push(now);
    return true;
  }

  /* ================= 接口 ================= */
  async function api(req, res, u, p) {

    /* 题库列表：给主持人选题用，不含汤底；带图鉴通关状态 */
    if (p === '/api/soup/puzzles') {
      return json(res, {
        ok: true,
        puzzles: CONTENT.list().map((x) => {
          const c = codexEntry(x.id);
          return Object.assign({}, x, { done: !!c, times: c ? Number(c.times) || 0 : 0 });
        }),
      });
    }

    /* 汤品图鉴：全局记录，打过的汤默认不再重复出 */
    if (p === '/api/soup/codex') {
      const all = CONTENT.list();
      const items = all.filter((x) => codexEntry(x.id)).map((x) => {
        const c = codexEntry(x.id);
        return {
          id: x.id,
          title: x.title,
          difficulty: x.difficulty,
          difficultyLabel: x.difficultyLabel,
          times: Number(c.times) || 0,
          firstAt: Number(c.firstAt) || 0,
          lastAt: Number(c.lastAt) || 0,
          lastResult: c.lastResult || '',
          lastRoom: c.lastRoom || '',
        };
      }).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
      return json(res, { ok: true, total: all.length, done: items.length, items });
    }

    /* 房间一览：给「小鱼」陪玩适配器找房用，也供加入页展示。
     * 必须同时看内存和磁盘：刚开的房还在 900ms 的落盘防抖里，
     * 只扫目录会漏掉它，适配器就找不到刚开的房。 */
    if (p === '/api/soup/rooms') {
      const list = [];
      const codes = new Set(rooms.keys());
      let files = [];
      try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch (e) { files = []; }
      files.forEach((f) => codes.add(f.replace(/\.json$/, '')));
      const now = Date.now();
      for (const code of codes) {
        let r;
        try { r = loadRoom(code); } catch (e) { continue; }
        if (!r) continue;
        const alive = r.users.filter((x) => now - (Number(x.lastSeen) || 0) < 5 * 60 * 1000);
        if (!alive.length) continue;
        const h = alive.find((x) => x.role === 'host') || null;
        const pz = puzzleOf(r);
        list.push({
          code: r.code,
          people: alive.map((x) => ({ name: x.name, role: x.role, online: isOnline(x) })),
          host: h ? { name: h.name, online: isOnline(h) } : null,
          phase: r.phase,
          fishMode: r.fishMode,
          puzzleTitle: pz ? pz.title : '',
          n: alive.length,
          players: alive.filter((x) => x.role === 'player').length,
          at: r.lastAt || 0,
        });
      }
      list.sort((a, b) => (b.at || 0) - (a.at || 0));
      return json(res, { ok: true, rooms: list });
    }

    /* 小鱼邀请：只返回玩家在建房/进房时明确选了「让鱼加入」的房间。
     * 适配器只轮询这里，不再自己扫房间或占固定房号。 */
    if (p === '/api/soup/fish-invites') {
      const list = [];
      const codes = new Set(rooms.keys());
      let files = [];
      try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch (e) { files = []; }
      files.forEach((f) => codes.add(f.replace(/\.json$/, '')));
      for (const code of codes) {
        let r;
        try { r = loadRoom(code); } catch (e) { continue; }
        if (!r || r.fishMode === 'none') continue;
        const alive = r.users.filter((x) => isOnline(x));
        if (!alive.length) continue;
        const h = alive.find((x) => x.role === 'host') || null;
        const players = alive.filter((x) => x.role === 'player');
        const pz = puzzleOf(r);
        list.push({
          code: r.code,
          fishMode: r.fishMode,
          phase: r.phase,
          puzzleTitle: pz ? pz.title : '',
          host: h ? { name: h.name, online: true } : null,
          n: alive.length,
          players: players.length,
          users: alive.map((x) => ({ name: x.name, role: x.role })),
          at: r.lastAt || 0,
        });
      }
      list.sort((a, b) => (b.at || 0) - (a.at || 0));
      return json(res, { ok: true, invites: list });
    }

    if (p === '/api/soup/enter') {
      const b = await readBody(req);
      const code = normCode(b.code);
      const pid = cleanStr(b.pid, 40);
      if (!CODE_RE.test(code)) return json(res, { error: '房间号只能是 1–12 位字母、数字、下划线或横杠' });
      if (!pid) return json(res, { error: '缺少客户端标识，刷新一下再试' });

      const r = loadRoom(code);
      const now = Date.now();
      const want = b.role === 'host' ? 'host' : (b.role === 'player' ? 'player' : 'auto');
      const fishChoice = FISH_MODES.includes(b.fish) ? b.fish : '';
      const STALE_MS = 15 * 60 * 1000;
      let me = findMe(r, pid);
      let fresh = false;
      /* 只有真正开新房的人才决定鱼是否加入；中途加入别人的房沿用房主的安排。 */
      const wasEmpty = !me && r.users.filter((x) => now - (Number(x.lastSeen) || 0) < STALE_MS).length === 0;
      if (!me && wasEmpty && r.users.length) r.users = [];

      if (me) {
        me.name = cleanStr(b.name, 12) || me.name;
        me.lastSeen = now;
        if (want === 'host' && me.role !== 'host') {
          const h = hostOf(r);
          if (h && h.pid !== me.pid) {
            if (now - (Number(h.lastSeen) || 0) > HOST_TAKEOVER_MS) {
              h.role = 'player';
              me.role = 'host';
              pushLog(r, `${h.name} 离开太久，${me.name} 接任主持人`);
            } else {
              return json(res, { error: '房间已经有主持人了，换个房号或选择「参与者」' });
            }
          } else {
            me.role = 'host';
          }
        }
      } else {
        if (r.users.length >= MAX_PLAYERS + 1) {
          const alive = r.users.filter((x) => now - (Number(x.lastSeen) || 0) < 10 * 60 * 1000);
          if (alive.length < r.users.length) {
            r.users = alive;
            r.users.forEach((x, i) => { x.seat = i; });
          }
        }
        if (r.users.length >= MAX_PLAYERS + 1) return json(res, { error: '房间满了（最多 1 位主持人和 8 位参与者）', full: true });

        let role = 'player';
        if (want === 'host') {
          const h = hostOf(r);
          if (h && now - (Number(h.lastSeen) || 0) <= HOST_TAKEOVER_MS) {
            return json(res, { error: '房间已经有主持人了，换个房号或选择「参与者」' });
          }
          if (h) { h.role = 'player'; pushLog(r, `${h.name} 离开太久，主持人位置空出`); }
          role = 'host';
        } else if (want === 'auto' && !hostOf(r)) {
          role = 'host';
        }

        me = {
          pid,
          name: cleanStr(b.name, 12) || '玩家',
          role,
          lastSeen: now,
          seat: r.users.length,
          hits: {},
        };
        r.users.push(me);
        fresh = true;
        if (wasEmpty) r.fishMode = fishChoice || 'none';
        pushLog(r, role === 'host' ? `${me.name} 进来当主持人` : `${me.name} 加入了房间`);
      }

      r.users.forEach((x, i) => { x.seat = i; });
      touch(r);
      return json(res, { ok: true, fresh, seat: me.seat, state: viewFor(r, pid) });
    }

    /* 主持人选题开局：lobby / over 时开新题；playing 时等同于重开（页面会先确认） */
    if (p === '/api/soup/start') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = findMe(r, cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      if (me.role !== 'host') return json(res, { error: '只有主持人能选题开局' });
      const pz = CONTENT.get(String(b.puzzleId || ''));
      if (!pz) return json(res, { error: '没有这道题' });

      r.puzzleId = pz.id;
      r.phase = 'playing';
      r.hintsShown = 0;
      r.qa = [];
      r.guesses = [];
      r.startedAt = Date.now();
      r.overAt = 0;
      me.lastSeen = Date.now();
      pushLog(r, `新的一题：${pz.title}`);
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* 参与者提问 */
    if (p === '/api/soup/ask') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = findMe(r, cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      me.lastSeen = Date.now();
      if (r.phase !== 'playing') return json(res, { error: '现在不是提问时间' });
      if (me.role === 'host') return json(res, { error: '主持人不提问，你可以直接回答或给提示' });
      const now = Date.now();
      if (!rateOk(me, 'ask', now, 10, 30000)) return json(res, { error: '问得太快了，等几秒再问' });
      const text = cleanStr(b.text, 160).trim();
      if (!text) return json(res, { error: '先写下想问的问题' });
      r.qa.push({
        id: ++r.seq, pid: me.pid, name: me.name, text, at: now,
        verdict: null, note: '', by: '', answeredAt: 0,
      });
      if (r.qa.length > QA_KEEP) r.qa = r.qa.slice(-QA_KEEP);
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* 主持人回答一条提问 */
    if (p === '/api/soup/answer') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = findMe(r, cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      if (me.role !== 'host') return json(res, { error: '只有主持人能回答' });
      me.lastSeen = Date.now();
      const q = r.qa.find((x) => x.id === Number(b.qid));
      if (!q) return json(res, { error: '找不到这条问题' });
      if (q.verdict != null) return json(res, { error: '这条问题已经回答过了' });
      const verdict = String(b.verdict || '');
      if (!VERDICTS.includes(verdict)) return json(res, { error: '未知的回答' });
      q.verdict = verdict;
      q.note = cleanStr(b.note, 80).trim();
      q.by = me.name;
      q.answeredAt = Date.now();
      pushLog(r, `主持人回答「${q.text}」：${VERDICT_CN[verdict]}${q.note ? '（' + q.note + '）' : ''}`);
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* 参与者提交汤底猜测 */
    if (p === '/api/soup/guess') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = findMe(r, cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      me.lastSeen = Date.now();
      if (r.phase !== 'playing') return json(res, { error: '现在不是猜底时间' });
      if (me.role === 'host') return json(res, { error: '主持人知道汤底，不用猜' });
      const now = Date.now();
      if (!rateOk(me, 'guess', now, 5, 60000)) return json(res, { error: '猜得太频繁了，再想想' });
      const text = cleanStr(b.text, 200).trim();
      if (!text) return json(res, { error: '先写下你的猜测' });
      r.guesses.push({
        id: ++r.seq, pid: me.pid, name: me.name, text, at: now,
        verdict: null, note: '', by: '', judgedAt: 0,
      });
      if (r.guesses.length > GUESS_KEEP) r.guesses = r.guesses.slice(-GUESS_KEEP);
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* 主持人判定一条猜测 */
    if (p === '/api/soup/judge') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = findMe(r, cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      if (me.role !== 'host') return json(res, { error: '只有主持人能判定' });
      me.lastSeen = Date.now();
      const g = r.guesses.find((x) => x.id === Number(b.gid));
      if (!g) return json(res, { error: '找不到这条猜测' });
      if (g.verdict != null) return json(res, { error: '这条猜测已经判定过了' });
      const verdict = String(b.verdict || '');
      if (!JUDGES.includes(verdict)) return json(res, { error: '未知的判定' });
      g.verdict = verdict;
      g.note = cleanStr(b.note, 80).trim();
      g.by = me.name;
      g.judgedAt = Date.now();
      pushLog(r, `主持人判定「${g.text}」：${JUDGE_CN[verdict]}${g.note ? '（' + g.note + '）' : ''}`);
      if (verdict === 'correct') {
        if (r.phase !== 'over') {
          r.phase = 'over';
          r.overAt = Date.now();
          recordCodex(r, 'correct');
          pushLog(r, `${g.name} 猜对了，汤底公开`);
        }
      }
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* 主持人给提示 */
    if (p === '/api/soup/hint') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = findMe(r, cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      if (me.role !== 'host') return json(res, { error: '只有主持人能给提示' });
      me.lastSeen = Date.now();
      if (r.phase !== 'playing') return json(res, { error: '现在没有进行中的题目' });
      const pz = puzzleOf(r);
      if (!pz) return json(res, { error: '还没有选题' });
      if (r.hintsShown >= pz.hints.length) return json(res, { error: '提示已经全部给出了' });
      r.hintsShown += 1;
      pushLog(r, `主持人给出第 ${r.hintsShown} 条提示`);
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* 主持人揭晓汤底 */
    if (p === '/api/soup/reveal') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = findMe(r, cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      if (me.role !== 'host') return json(res, { error: '只有主持人能揭晓' });
      me.lastSeen = Date.now();
      if (r.phase !== 'playing') return json(res, { error: '现在没有进行中的题目' });
      r.phase = 'over';
      r.overAt = Date.now();
      recordCodex(r, 'revealed');
      pushLog(r, '主持人揭晓了汤底');
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* 主持人直接判赢：觉得大家猜得差不多了，不用等猜底正确就能收尾 */
    if (p === '/api/soup/win') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = findMe(r, cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      if (me.role !== 'host') return json(res, { error: '只有主持人能判赢' });
      me.lastSeen = Date.now();
      if (r.phase !== 'playing') return json(res, { error: '现在没有进行中的题目' });
      r.phase = 'over';
      r.overAt = Date.now();
      recordCodex(r, 'win');
      pushLog(r, '主持人直接判赢，本轮收尾');
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* 房间聊天（与问答分开，不影响判题） */
    if (p === '/api/soup/chat') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = findMe(r, cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      me.lastSeen = Date.now();
      const now = Date.now();
      if (!rateOk(me, 'chat', now, 20, 30000)) return json(res, { error: '说得太快了，喘口气' });
      const text = cleanStr(b.text, 300).trim();
      if (!text) return json(res, { error: '空消息' });
      r.chat.push({ pid: me.pid, name: me.name, text, at: now });
      if (r.chat.length > CHAT_KEEP) r.chat = r.chat.slice(-CHAT_KEEP);
      touch(r);
      return json(res, { ok: true });
    }

    /* 主持人掉线后，参与者可以接管；主持人还在线时不允许抢 */
    if (p === '/api/soup/host') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = findMe(r, cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      me.lastSeen = Date.now();
      const h = hostOf(r);
      if (me.role === 'host') return json(res, { ok: true, state: viewFor(r, me.pid) });
      if (h && h.pid !== me.pid && isOnline(h)) return json(res, { error: '主持人还在线，暂时不能接管' });
      if (h) h.role = 'player';
      me.role = 'host';
      pushLog(r, `${me.name} 接管了主持`);
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    if (p === '/api/soup/state') {
      const r = loadRoom(normCode(u.searchParams.get('code')));
      const me = findMe(r, cleanStr(u.searchParams.get('pid'), 40));
      if (!me) return json(res, { needJoin: true });
      me.lastSeen = Date.now();
      return json(res, { ok: true, rev: r.rev, state: viewFor(r, me.pid) });
    }

    if (p === '/api/soup/leave') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const i = r.users.findIndex((x) => x.pid === cleanStr(b.pid, 40));
      if (i >= 0) {
        const [me] = r.users.splice(i, 1);
        r.users.forEach((x, k) => { x.seat = k; });
        let next = null;
        if (me.role === 'host') next = promoteHost(r, me.pid);
        pushLog(r, `${me.name} 离开了房间` + (next ? `，${next.name} 成为新的主持人` : ''));
        touch(r);
      }
      return json(res, { ok: true });
    }

    if (p === '/api/soup/stream') {
      const r = loadRoom(normCode(u.searchParams.get('code')));
      const me = findMe(r, cleanStr(u.searchParams.get('pid'), 40));
      if (!me) return json(res, { needJoin: true });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
      });
      me.lastSeen = Date.now();
      const sub = { res, pid: me.pid, lastRev: r.rev, sig: '' };
      r.subs.add(sub);
      res.write('event: hello\ndata: ' + JSON.stringify({ rev: r.rev, state: viewFor(r, me.pid) }) + '\n\n');
      const tick = setInterval(() => {
        try {
          me.lastSeen = Date.now();
          const sig = r.users.map((x) => (isOnline(x) ? '1' : '0')).join('|');
          if (sub.lastRev !== r.rev || sig !== sub.sig) {
            sub.lastRev = r.rev;
            sub.sig = sig;
            res.write('event: state\ndata: ' + JSON.stringify({ rev: r.rev, state: viewFor(r, me.pid) }) + '\n\n');
          }
        } catch (e) { /* 连接已断 */ }
      }, 1000);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);
      req.on('close', () => {
        clearInterval(tick); clearInterval(ping);
        r.subs.delete(sub);
        /* 断开不等于立刻离房：保留座位，60 秒无心跳才显示离线 */
        me.lastSeen = Math.min(Number(me.lastSeen) || Date.now(), Date.now());
      });
      return;
    }

    return json(res, { error: '没有这个「海龟汤」接口' });
  }

  /* 在线状态兜底广播 + 空房间回收 */
  setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values()) {
      const sig = r.users.map((x) => (isOnline(x) ? '1' : '0')).join('|');
      if (sig !== r.onlineSig) {
        r.onlineSig = sig;
        broadcast(r);
      }
      if (r.users.length === 0 && now - r.lastAt > 12 * 3600 * 1000) rooms.delete(r.code);
    }
  }, 3000).unref();

  return { api };
};
