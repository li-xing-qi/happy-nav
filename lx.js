/* ============================================================
   「心有灵犀」· 联机房间服务  (v5 patch2)
   ------------------------------------------------------------
   把同屏双人游戏扩展成「同屏 + 异地联机」双模式中的联机后端。
   同屏玩法（public/lingxi/index.html 原作 IIFE）完全不依赖本文件。

   ⚠️ 变更边界（动这个文件之前请先读完）
     1. 玩法核心是「两人各写一个词 → 两边都提交后才同时揭晓 →
        完全相同即成功 → 不同则带着历史词进入下一轮」。
        任何改动都不得让先提交的一方提前看到对方的词。
     2. 服务端是唯一权威：前端不做本地揭晓、不存房间状态。
        裁剪视图 viewFor() 只允许在 revealed 之后下发两个词。
     3. 同屏模式不经过这里；不要在前端把同屏状态写进 localStorage。
     4. server.js 里的 [EXTERNAL-DEP] 8 个补丁 / [V5-CORE] 既有路由，
        与本模块无关，改动本文件时不要顺手去动它们。

   房间状态落盘 data/lx/<房间号>.json；零依赖，只用 Node 自带模块。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function createLx(ctx) {
  const { DATA, json, readBody, normCode } = ctx;
  const DIR = path.join(DATA, 'lx');
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) { console.error('[lx dir]', e.message); }

  const CODE_RE = /^[A-Za-z0-9_-]{1,12}$/;
  const MAX_MEMBERS = 2;
  const ONLINE_MS = 60 * 1000;      // 60 秒没心跳算离线
  const STALE_MS = 10 * 60 * 1000;  // 满房时允许顶掉 10 分钟没动静的旧座位
  const LOG_KEEP = 40;

  const rooms = new Map();
  const saveTimers = new Map();

  function roomPath(code) {
    return path.join(DIR, code.replace(/[^A-Za-z0-9_-]/g, '') + '.json');
  }
  function cleanStr(s, n) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').slice(0, n || 200);
  }
  function normalized(v) {
    return String(v == null ? '' : v).trim().replace(/[\s\u3000]+/g, '').toLowerCase();
  }
  function isOnline(u) { return !!u && Date.now() - u.lastSeen < ONLINE_MS; }

  function blankRoom(code) {
    return {
      code, users: [],
      phase: 'idle',          // idle | playing | reveal | over
      round: 0,
      words: [null, null],    // 本轮两人提交的词，null = 还没交
      revealed: false,        // 是否已揭晓
      result: null,           // 'hit' | 'miss'
      history: [],            // [{ round, a, b, hit }]
      score: 0,               // 累计成功次数
      ready: [false, false],  // idle / over 时「准备好了 / 再来一局」
      nextVotes: [false, false], // reveal 时两边都点才进入下一轮
      log: [],                // 系统消息
      rev: 1, lastAt: Date.now(),
      subs: new Set(), peerSig: ''
    };
  }

  function loadRoom(code) {
    let r = rooms.get(code);
    if (r) return r;
    r = blankRoom(code);
    try {
      const f = roomPath(code);
      if (fs.existsSync(f)) {
        const j = JSON.parse(fs.readFileSync(f, 'utf8')) || {};
        /* 逐字段恢复，旧存档缺字段时用默认值兜底 */
        if (['idle', 'playing', 'reveal', 'over'].includes(j.phase)) r.phase = j.phase;
        r.round = Math.max(0, Number(j.round) || 0);
        if (Array.isArray(j.words)) r.words = [j.words[0] == null ? null : String(j.words[0]).slice(0, 12),
          j.words[1] == null ? null : String(j.words[1]).slice(0, 12)];
        r.revealed = !!j.revealed;
        r.result = (j.result === 'hit' || j.result === 'miss') ? j.result : null;
        r.history = Array.isArray(j.history) ? j.history.slice(-60) : [];
        r.score = Math.max(0, Number(j.score) || 0);
        r.ready = [!!(j.ready && j.ready[0]), !!(j.ready && j.ready[1])];
        r.nextVotes = [!!(j.nextVotes && j.nextVotes[0]), !!(j.nextVotes && j.nextVotes[1])];
        r.log = Array.isArray(j.log) ? j.log.slice(-LOG_KEEP) : [];
        r.rev = Math.max(1, Number(j.rev) || 1);
        r.lastAt = Number(j.lastAt) || Date.now();
        if (Array.isArray(j.users)) {
          r.users = j.users.slice(0, MAX_MEMBERS)
            .filter(u => u && u.pid)
            .map((u, i) => ({
              pid: cleanStr(u.pid, 40), name: cleanStr(u.name, 12) || '小鱼',
              avatar: cleanStr(u.avatar, 16) || '🐟', seat: i,
              lastSeen: Number(u.lastSeen) || 0, hits: []
            }));
        }
      }
    } catch (e) { console.error('[lx load]', code, e.message); }
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
          users: r.users.map(u => ({ pid: u.pid, name: u.name, avatar: u.avatar, seat: u.seat, lastSeen: u.lastSeen })),
          phase: r.phase, round: r.round, words: r.words, revealed: r.revealed,
          result: r.result, history: r.history.slice(-60), score: r.score,
          ready: r.ready, nextVotes: r.nextVotes, log: r.log.slice(-LOG_KEEP),
          rev: r.rev, lastAt: r.lastAt
        }));
      } catch (e) { console.error('[lx save]', r.code, e.message); }
    }, 900));
  }

  function publicUser(u, me) {
    return {
      seat: u.seat, name: u.name, avatar: u.avatar || '🐟',
      online: isOnline(u), me: u.pid === me.pid
    };
  }

  /* ------------------------------------------------------------
     ★ 防作弊关键：裁剪视图。
       未揭晓时，对方即使已经提交，也只下发「已提交」这个布尔，
       绝不把词内容发给另一方。只有 revealed=true 才下发两个词。
       每个订阅者拿到的都是按自己座位单独算的一份，不能广播同一份。
     ------------------------------------------------------------ */
  function viewFor(r, pid) {
    const me = r.users.find(u => u.pid === pid) || null;
    const seat = me ? me.seat : -1;
    const revealed = !!r.revealed || r.phase === 'reveal' || r.phase === 'over';
    const words = revealed ? r.words.slice() : r.words.map((w, i) => (i === seat ? w : null));
    const users = r.users.map(u => publicUser(u, me || { pid: '' }));
    return {
      code: r.code, rev: r.rev,
      phase: r.phase, round: r.round, score: r.score,
      seat, me: me ? { name: me.name, avatar: me.avatar, seat: me.seat } : null,
      users,
      peer: (() => {
        const p = r.users.find(u => u.pid !== pid);
        return p ? publicUser(p, me || { pid: '' }) : null;
      })(),
      words, myWord: seat >= 0 ? r.words[seat] : null,
      submitted: r.words.map(w => w !== null),   // 只暴露「交没交」，不暴露内容
      revealed, result: r.result,
      history: r.history.slice(),
      ready: r.ready.slice(), nextVotes: r.nextVotes.slice(),
      log: r.log.slice()
    };
  }

  function pushLog(r, text) {
    r.log.push({ text, at: Date.now() });
    if (r.log.length > LOG_KEEP) r.log.splice(0, r.log.length - LOG_KEEP);
  }

  function broadcast(r) {
    for (const s of r.subs) {
      try {
        s.res.write('event: state\ndata: ' + JSON.stringify({
          rev: r.rev, state: viewFor(r, s.pid)
        }) + '\n\n');
      } catch (e) { /* 连接已断，等 close 事件清理 */ }
    }
  }
  function touch(r) {
    r.rev++; r.lastAt = Date.now();
    saveRoom(r); broadcast(r);
  }

  /* ================= 接口 ================= */
  async function api(req, res, u, p) {

    /* 房间一览：给「小鱼」这种陪玩客户端用。
     * 它不知道老板会开什么房号，所以需要一个「现在哪些房有人在玩」的列表。
     * 只暴露房间号和成员名，不暴露任何词（words/history），否则等于作弊。 */
    if (p === '/api/lx/rooms') {
      const list = [];
      let files = [];
      try { files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')); } catch (e) { files = []; }
      const now = Date.now();
      for (const f of files) {
        const code = f.replace(/\.json$/, '');
        let r;
        try { r = loadRoom(code); } catch (e) { continue; }
        if (!r) continue;
        const alive = (r.users || []).filter(u => now - (u.lastSeen || 0) < 5 * 60 * 1000);
        if (!alive.length) continue;
        list.push({
          code: r.code,
          people: alive.map(u => ({ name: u.name, seat: u.seat, online: isOnline(u) })),
          phase: r.phase, round: r.round, score: r.score,
          n: alive.length,
          at: r.lastAt || 0,
        });
      }
      list.sort((a, b) => (b.at || 0) - (a.at || 0));
      return json(res, { ok: true, rooms: list });
    }

    if (p === '/api/lx/enter') {
      const b = await readBody(req);
      const code = normCode(b.code);
      const pid = cleanStr(b.pid, 40);
      if (!CODE_RE.test(code)) return json(res, { error: '房间号只能是 1–12 位字母、数字、下划线或横杠' });
      if (!pid) return json(res, { error: '缺少客户端标识，刷新一下再试' });
      const r = loadRoom(code);
      let me = r.users.find(x => x.pid === pid), fresh = false;
      if (me) {
        /* 刷新 / 重连：沿用原座位与本轮已提交的词 */
        me.name = cleanStr(b.name || me.name, 12) || me.name;
        me.avatar = cleanStr(b.avatar || me.avatar, 16) || me.avatar;
        me.lastSeen = Date.now();
      } else {
        const now = Date.now();
        if (r.users.length >= MAX_MEMBERS) {
          const alive = r.users.filter(x => now - x.lastSeen < STALE_MS);
          if (alive.length < r.users.length) { r.users = alive; r.users.forEach((x, i) => x.seat = i); }
        }
        if (r.users.length >= MAX_MEMBERS) return json(res, { error: `房间 ${code} 已经满了（最多 2 人）`, full: true });
        me = { pid, name: cleanStr(b.name, 12) || '小鱼', avatar: cleanStr(b.avatar, 16) || '🐟',
          seat: r.users.length, lastSeen: Date.now(), hits: [] };
        r.users.push(me); fresh = true;
        pushLog(r, `${me.name} 游进了房间`);
      }
      touch(r);
      return json(res, { ok: true, fresh, state: viewFor(r, pid) });
    }

    if (p === '/api/lx/submit') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = r.users.find(x => x.pid === cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      me.lastSeen = Date.now();
      if (r.phase !== 'playing') return json(res, { error: '现在不是写词的回合' });
      if (r.words[me.seat] !== null) return json(res, { ok: true, already: true, state: viewFor(r, me.pid) });

      const now = Date.now();
      me.hits = (me.hits || []).filter(t => now - t < 10000);
      if (me.hits.length > 8) return json(res, { error: '写得太快了，喘口气' });
      me.hits.push(now);

      const word = cleanStr(b.word, 12).trim();
      if (!word) return json(res, { error: '先写点什么吧' });
      r.words[me.seat] = word;
      pushLog(r, `${me.name} 交了第 ${r.round} 轮的词`);

      /* ★ 只有两边都交了才揭晓；由服务端算结果并同时推给两个人 */
      if (r.words[0] !== null && r.words[1] !== null) {
        const a = r.words[0], b2 = r.words[1];
        const hit = normalized(a) === normalized(b2);
        r.history.push({ round: r.round, a, b: b2, hit });
        r.revealed = true; r.result = hit ? 'hit' : 'miss';
        if (hit) {
          r.phase = 'over'; r.score += 1;
          r.ready = [false, false];
          pushLog(r, `—— 第 ${r.round} 轮对上了「${a}」，默契 +1 ——`);
        } else {
          r.phase = 'reveal';
          r.nextVotes = [false, false];
          pushLog(r, `—— 第 ${r.round} 轮没对上，看看历史再写一次 ——`);
        }
      }
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* reveal → 下一轮：两边都点才推进，避免一方单方面翻页 */
    if (p === '/api/lx/next') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = r.users.find(x => x.pid === cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      me.lastSeen = Date.now();
      if (r.phase !== 'reveal') return json(res, { error: '现在不能进入下一轮' });
      r.nextVotes[me.seat] = true;
      if (r.nextVotes[0] && r.nextVotes[1]) {
        r.round += 1;
        r.words = [null, null];
        r.revealed = false; r.result = null;
        r.nextVotes = [false, false];
        r.phase = 'playing';
        pushLog(r, `—— 第 ${r.round} 轮开始，请再各写一个词 ——`);
      }
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* idle / over → 开局或再来一局：两人都准备好才开 */
    if (p === '/api/lx/ready') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = r.users.find(x => x.pid === cleanStr(b.pid, 40));
      if (!me) return json(res, { error: '先加入房间' });
      me.lastSeen = Date.now();
      if (r.phase !== 'idle' && r.phase !== 'over') return json(res, { error: '现在不需要准备' });
      r.ready[me.seat] = true;
      if (r.ready[0] && r.ready[1]) {
        r.phase = 'playing'; r.round = 1;
        r.words = [null, null]; r.revealed = false; r.result = null;
        r.history = []; r.ready = [false, false]; r.nextVotes = [false, false];
        pushLog(r, '—— 新的一局开始，两人各写一个词 ——');
      }
      touch(r);
      return json(res, { ok: true, state: viewFor(r, me.pid) });
    }

    /* 房间状态很小，始终返回按座位裁剪后的完整视图；since 供客户端去重 */
    if (p === '/api/lx/state') {
      const r = loadRoom(normCode(u.searchParams.get('code')));
      const me = r.users.find(x => x.pid === cleanStr(u.searchParams.get('pid'), 40));
      if (!me) return json(res, { needJoin: true });
      me.lastSeen = Date.now();
      return json(res, { ok: true, rev: r.rev, state: viewFor(r, me.pid) });
    }

    if (p === '/api/lx/ping') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const me = r.users.find(x => x.pid === cleanStr(b.pid, 40));
      if (me) me.lastSeen = Date.now();
      return json(res, { ok: true, state: me ? viewFor(r, me.pid) : null });
    }

    if (p === '/api/lx/leave') {
      const b = await readBody(req);
      const r = loadRoom(normCode(b.code));
      const i = r.users.findIndex(x => x.pid === cleanStr(b.pid, 40));
      if (i >= 0) {
        const [me] = r.users.splice(i, 1);
        /* 离座者本轮未揭晓的词要撤掉，否则新人进来会卡在「已提交」 */
        if (!r.revealed && r.words[i] !== null) r.words[i] = null;
        r.users.forEach((x, k) => { x.seat = k; });
        r.ready = [false, false]; r.nextVotes = [false, false];
        pushLog(r, `${me.name} 离开了，本轮保留，回来可以接着看`);
      }
      touch(r);
      return json(res, { ok: true });
    }

    if (p === '/api/lx/stream') {
      const r = loadRoom(normCode(u.searchParams.get('code')));
      const me = r.users.find(x => x.pid === cleanStr(u.searchParams.get('pid'), 40));
      if (!me) return json(res, { needJoin: true });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
      });
      me.lastSeen = Date.now();
      const sub = { res, pid: me.pid, lastRev: r.rev, peerSig: '' };
      r.subs.add(sub);
      res.write('event: hello\ndata: ' + JSON.stringify({ rev: r.rev, state: viewFor(r, me.pid) }) + '\n\n');
      const tick = setInterval(() => {
        try {
          me.lastSeen = Date.now();
          const sig = r.users.map(x => (isOnline(x) ? '1' : '0')).join('|');
          /* rev 变化由 touch() 立即广播；这里兜底断线漏推 + 在线状态变化 */
          if (sub.lastRev !== r.rev || sig !== sub.peerSig) {
            sub.lastRev = r.rev; sub.peerSig = sig;
            res.write('event: state\ndata: ' + JSON.stringify({ rev: r.rev, state: viewFor(r, me.pid) }) + '\n\n');
          }
        } catch (e) { /* 连接已断 */ }
      }, 1000);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);
      req.on('close', () => {
        clearInterval(tick); clearInterval(ping);
        r.subs.delete(sub);
        /* 断开后保留 lastSeen，60 秒后由前端显示离线 */
        me.lastSeen = Math.min(me.lastSeen, Date.now());
      });
      return;
    }

    return json(res, { error: '没有这个「心有灵犀」接口' });
  }

  /* 在线状态变化定期广播 + 空房间回收 */
  setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values()) {
      const sig = r.users.map(x => (now - x.lastSeen < ONLINE_MS ? '1' : '0')).join('|');
      if (sig !== r.peerSig) {
        r.peerSig = sig;
        for (const s of r.subs) {
          try {
            s.res.write('event: state\ndata: ' + JSON.stringify({ rev: r.rev, state: viewFor(r, s.pid) }) + '\n\n');
          } catch (e) {}
        }
      }
      if (r.users.length === 0 && now - r.lastAt > 12 * 3600 * 1000) rooms.delete(r.code);
    }
  }, 2000).unref();

  return { api };
};
