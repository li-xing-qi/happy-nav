/* ============================================================
   「并肩割草」· 联机房间（survivor_coop.js）
   ------------------------------------------------------------
   目标：两个人在各自设备上打开 /survivor/，输入同一个房间号，
         一个人跑游戏（房主），另一个人拿到画面并操作同一个英雄。

   为什么不是「双人同屏」：上游 battle-of-heroes 是单主角、全局变量互相咬合
   的成品游戏，硬塞第二个英雄等于重写战斗系统。这里沿用站点已有的房间原语
   （房间码 / 限 2 人 / SSE 推送 / 轮询兜底），只中继两样东西：
     · 房主 → 队友：画布压缩帧 + 一份很小的局面摘要（血/波次/奖励/冷却）
     · 队友 → 房主：方向向量 / 技能序号 / 奖励序号
   游戏模拟始终只在房主浏览器里跑，所以不会出现两份世界各跑各的。

   路由前缀：/api/survivor/room/*
   风格对齐 server.js 里的聊天室、五子棋：内存房间 + 防抖落盘 + 1 秒 tick。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function createSurvivorCoop(ctx) {
  const { DATA, json, readBody } = ctx;
  const DIR = path.join(DATA, 'survivor_coop');
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) { console.error('[coop dir]', e.message); }

  const CODE_RE = /^[A-Za-z0-9_-]{1,12}$/;
  const MAX_MEMBERS = 2;
  const MAX_CHAT = 120;
  const FRAME_MAX = 1100 * 1024;        // base64 字符数上限（防止有人塞整部电影）
  const OFFLINE_MS = 15000;             // 15 秒没心跳算离线（和聊天室一致）
  const ZOMBIE_MS = 10 * 60 * 1000;     // 10 分钟没回来，座位可以被顶掉
  const ROOM_TTL = 6 * 3600 * 1000;     // 空房间 6 小时后回收
  const BODY_FRAME = 1200 * 1000;       // readBody 上限：帧比普通 JSON 大

  const rooms = new Map();
  const saveTimers = new Map();

  /* ---------- 小工具 ---------- */
  function safeCode(v) {
    const c = String(v == null ? '' : v).trim().toUpperCase();
    return CODE_RE.test(c) ? c : '';
  }
  function cleanText(v, n) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n || 40);
  }
  function int(v, lo, hi) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }
  function roomPath(code) {
    return path.join(DIR, code.replace(/[^A-Za-z0-9_-]/g, '') + '.json');
  }

  function blankRoom(code) {
    return {
      code,
      users: [],            // { pid, name, seat, lastSeen, hits:[], act, actAt }
      hostPid: '',          // 正在跑游戏的那台设备
      fishInvite: false,    // 房主开房时选择「小鱼当队友」才为 true
      chat: [],             // { id, type:'text'|'sys', name, seat, text, at }
      chatSeq: 0,
      chatRev: 1,
      rev: 1,
      state: null,          // 房主上报的局面摘要（只在内存）
      stateAt: 0,
      frame: null,          // { img, at, w, h }（只在内存）
      frameAt: 0,
      lastAt: Date.now(),
      subs: new Set(),
      peerSig: '',
    };
  }

  /* ---------- 落盘：只存成员和聊天，画面/摘要不写盘 ---------- */
  function loadRoom(code) {
    let r = rooms.get(code);
    if (r) return r;
    r = blankRoom(code);
    try {
      const f = roomPath(code);
      if (fs.existsSync(f)) {
        const j = JSON.parse(fs.readFileSync(f, 'utf8')) || {};
        r.hostPid = String(j.hostPid || '');
        r.fishInvite = !!j.fishInvite;
        if (Array.isArray(j.users)) {
          r.users = j.users
            .filter(u => u && u.pid)
            .map((u, i) => ({
              pid: String(u.pid),
              name: cleanText(u.name, 12) || '玩家',
              seat: Number.isInteger(u.seat) ? u.seat : i,
              lastSeen: 0,
            }))
            .slice(0, MAX_MEMBERS);
        }
        if (Array.isArray(j.chat)) {
          r.chat = j.chat.slice(-MAX_CHAT).map((m, i) => ({
            id: Number(m.id) || i + 1,
            type: m.type === 'sys' ? 'sys' : 'text',
            name: cleanText(m.name, 12),
            seat: Number.isInteger(m.seat) ? m.seat : -1,
            text: cleanText(m.text, 300),
            at: Number(m.at) || 0,
          }));
          r.chatSeq = r.chat.reduce((m, x) => Math.max(m, x.id || 0), 0);
          r.chatRev = r.chatSeq + 1;
        }
        // 房主不在成员里 → 视为没房主，等下一台设备开房
        if (r.hostPid && !r.users.some(u => u.pid === r.hostPid)) r.hostPid = '';
      }
    } catch (e) { console.error('[coop load]', code, e.message); }
    rooms.set(code, r);
    return r;
  }

  function saveSoon(room) {
    clearTimeout(saveTimers.get(room.code));
    saveTimers.set(room.code, setTimeout(() => {
      saveTimers.delete(room.code);
      const r = rooms.get(room.code);
      if (!r) return;
      try {
        fs.writeFileSync(roomPath(r.code), JSON.stringify({
          hostPid: r.hostPid,
          fishInvite: r.fishInvite,
          users: r.users.map(u => ({ pid: u.pid, name: u.name, seat: u.seat })),
          chat: r.chat.slice(-MAX_CHAT),
        }));
      } catch (e) { console.error('[coop save]', r.code, e.message); }
    }, 800));
  }

  /* ---------- 视图 ---------- */
  function usersView(room) {
    const now = Date.now();
    return room.users.map(u => ({
      name: u.name,
      seat: u.seat,
      online: now - Number(u.lastSeen || 0) < OFFLINE_MS,
      host: u.pid === room.hostPid,
    }));
  }
  function peerOf(room, me) {
    const p = room.users.find(u => u.pid !== me.pid);
    if (!p) return null;
    return {
      name: p.name,
      seat: p.seat,
      online: Date.now() - Number(p.lastSeen || 0) < OFFLINE_MS,
      host: p.pid === room.hostPid,
    };
  }
  function hostOnline(room) {
    const h = room.users.find(u => u.pid === room.hostPid);
    return !!h && Date.now() - Number(h.lastSeen || 0) < OFFLINE_MS;
  }
  function view(room, me) {
    return {
      ok: true,
      code: room.code,
      seat: me ? me.seat : -1,
      name: me ? me.name : '',
      isHost: !!me && me.pid === room.hostPid,
      hostPid: room.hostPid,
      hostOnline: hostOnline(room),
      fishInvite: !!room.fishInvite,
      users: usersView(room),
      peer: me ? peerOf(room, me) : null,
      chat: room.chat.slice(-60),
      chatRev: room.chatRev,
      state: room.state,
      stateAt: room.stateAt,
      frameAt: room.frameAt,
    };
  }

  /* ---------- SSE ---------- */
  function writeEvent(res, ev, data) {
    try {
      return res.write('event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n');
    } catch (e) { return false; }
  }
  function broadcast(room, ev, data, filter) {
    let backpressure = false;
    for (const s of room.subs) {
      if (filter && !filter(s)) continue;
      // 画面帧太大：上一次还没排空就跳过这一帧，宁可掉帧也不把内存顶爆
      if (ev === 'frame' && s.busy) { backpressure = true; continue; }
      const ok = writeEvent(s.res, ev, data);
      if (ok === false) {
        if (ev === 'frame') { s.busy = true; backpressure = true; }
      }
    }
    return backpressure;
  }
  function pushSys(room, text) {
    const msg = { id: ++room.chatSeq, type: 'sys', name: '', seat: -1, text: cleanText(text, 80), at: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > MAX_CHAT) room.chat.splice(0, room.chat.length - MAX_CHAT);
    room.chatRev++;
    room.lastAt = Date.now();
    saveSoon(room);
    broadcast(room, 'chat', msg);
    return msg;
  }

  /* ---------- 局面摘要：前端上报一律不可信 ---------- */
  const PHASES = ['lobby', 'fighting', 'buff', 'paused', 'dead', 'over'];
  function cleanState(b) {
    const s = b && typeof b === 'object' ? b : {};
    const buffs = Array.isArray(s.buffs) ? s.buffs.slice(0, 6).map(x => cleanText(x, 40)) : [];
    const cds = Array.isArray(s.cds) ? s.cds.slice(0, 4).map(x => int(x, 0, 9999)) : [0, 0, 0, 0];
    const a = (s.ally && typeof s.ally === 'object') ? s.ally : null;
    const unit = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
    const ally = a ? {
      hp: int(a.hp, 0, 1e9),
      maxHp: int(a.maxHp, 1, 1e9),
      alive: !!a.alive,
      name: cleanText(a.name, 12),
      heroKey: cleanText(a.heroKey, 20),
      heroName: cleanText(a.heroName, 16),
      skills: Array.isArray(a.skills) ? a.skills.slice(0, 4).map(x => cleanText(x, 16)) : [],
      skin: cleanText(a.skin, 24),
      artifact: cleanText(a.artifact, 20),
      gold: int(a.gold, 0, 1e9),
      respawn: int(a.respawn, 0, 999),
      aggro: int(a.aggro, 0, 9999),
      nearD: int(a.nearD, -1, 1e6),
      x: int(a.x, 0, 1e6),
      y: int(a.y, 0, 1e6),
      downed: !!a.downed,
      reviveHold: int(a.reviveHold, 0, 3000),
      reviveIn: int(a.reviveIn, 0, 999),
      buffOpen: !!a.buffOpen,
      buffs: Array.isArray(a.buffs) ? a.buffs.slice(0, 6).map(x => cleanText(x, 40)) : [],
      heroDowned: !!a.heroDowned,
      heroRescue: int(a.heroRescue, 0, 3000),
      cds: Array.isArray(a.cds) ? a.cds.slice(0, 4).map(x => int(x, 0, 99999)) : [0, 0, 0, 0],
      /* 给鱼队友用的最小导航信息：最近敌人方向、主角坐标、商店可买项 */
      nx: unit(a.nx),
      ny: unit(a.ny),
      heroX: int(a.heroX, 0, 1e6),
      heroY: int(a.heroY, 0, 1e6),
      shop: Array.isArray(a.shop) ? a.shop.slice(0, 6).map(x => ({
        id: cleanText(x && x.id, 20),
        text: cleanText(x && x.text, 60),
      })) : [],
    } : null;
    return {
      ver: int(s.ver, 0, 999),
      phase: PHASES.includes(s.phase) ? s.phase : 'lobby',
      hp: int(s.hp, 0, 1e9),
      maxHp: int(s.maxHp, 1, 1e9),
      wave: int(s.wave, 1, 999),
      kills: int(s.kills, 0, 1e9),
      alive: !!s.alive,
      hero: cleanText(s.hero, 12),
      buffOpen: !!s.buffOpen,
      buffs,
      cds,
      shopOpen: !!s.shopOpen,
      artOn: !!s.artOn,
      shopOn: !!s.shopOn,
      ally,
      at: Date.now(),
    };
  }

  /* ---------- tick：在线状态 / 回收 ---------- */
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const p0 = room.users[0], p1 = room.users[1];
      const sig = [p0 ? p0.name + (now - p0.lastSeen < OFFLINE_MS ? '1' : '0') : '-',
        p1 ? p1.name + (now - p1.lastSeen < OFFLINE_MS ? '1' : '0') : '-',
        room.hostPid, hostOnline(room) ? '1' : '0'].join('|');
      if (sig !== room.peerSig) {
        room.peerSig = sig;
        broadcast(room, 'peer', {
          users: usersView(room), hostPid: room.hostPid, hostOnline: hostOnline(room),
        });
      }
      // 画面只保留 30 秒，避免内存里一直压着一张旧图
      if (room.frame && now - room.frameAt > 30000) { room.frame = null; room.frameAt = 0; }
      const allGone = room.users.every(u => now - Number(u.lastSeen || 0) > 30 * 60 * 1000);
      if (allGone && now - room.lastAt > ROOM_TTL) {
        rooms.delete(room.code);
        try { fs.unlinkSync(roomPath(room.code)); } catch (e) {}
      }
    }
  }, 1000).unref();

  /* ---------- 路由 ---------- */
  async function api(req, res, u, p) {
    try {
      /* 进房：房主 host:true；队友 host:false。
       * 同一个 pid 重进会回到原来的座位（刷新页面不会把房间占死）。 */
      if (p === '/api/survivor/room/enter') {
        if (req.method !== 'POST') return json(res, { ok: false, error: '只支持 POST' });
        const b = await readBody(req);
        const code = safeCode(b.code);
        const pid = cleanText(b.pid, 40);
        if (!code) return json(res, { ok: false, error: '房间号只能是 1–12 位字母、数字、下划线或横杠' });
        if (!pid) return json(res, { ok: false, error: '缺少客户端标识，刷新一下再试' });
        const name = cleanText(b.name, 12) || '玩家';
        const asHost = !!b.host;
        const room = loadRoom(code);

        /* 房主掉线超过 15 秒：允许新的房主顶掉他的座位（观众刷新回来会重新抢回） */
        if (asHost && room.hostPid && !hostOnline(room)) {
          const oldPid = room.hostPid;
          if (oldPid !== pid) {
            room.users = room.users.filter(x => x.pid !== oldPid);
            room.users.forEach((x, i) => { x.seat = i; });
            room.hostPid = '';
            room.rev++;
          }
        }
        const wasEmpty = room.users.length === 0;
        let me = room.users.find(x => x.pid === pid);
        if (!me) {
          if (room.users.length >= MAX_MEMBERS) {
            // 清掉走了 10 分钟以上的僵尸座位
            const alive = room.users.filter(x => Date.now() - Number(x.lastSeen || 0) < ZOMBIE_MS);
            if (alive.length < room.users.length) {
              room.users = alive;
              room.users.forEach((x, i) => { x.seat = i; });
              if (room.hostPid && !room.users.some(x => x.pid === room.hostPid)) room.hostPid = '';
            }
          }
          if (room.users.length >= MAX_MEMBERS) {
            return json(res, { ok: false, error: `房间 ${code} 已经满了（最多 2 人）`, full: true });
          }
          if (!asHost && !room.hostPid) {
            return json(res, { ok: false, error: '房间还没有开，先让房主点「开房」' });
          }
          if (asHost && room.hostPid && room.hostPid !== pid && hostOnline(room)) {
            return json(res, { ok: false, error: '这个房间已经有房主了，点「加入」就行' });
          }
          let seat = 0;
          const used = new Set(room.users.map(x => x.seat));
          while (used.has(seat) && seat < 8) seat++;
          me = { pid, name, seat, lastSeen: Date.now(), hits: [] };
          room.users.push(me);
          room.users.sort((a, b) => a.seat - b.seat);
          room.rev++;
          pushSys(room, `${name} 加入了房间`);
        } else {
          me.name = name;
          me.lastSeen = Date.now();
        }

        // 谁跑游戏：显式开房优先；空房间第一个人默认房主（避免只能干等）。
        // 注意：房主掉线后队友重进，不能因为 hostPid 为空就把队友变成房主。
        if (asHost || (wasEmpty && !room.hostPid)) room.hostPid = me.pid;
        /* 鱼是否加入：只由房主在开局前决定；房里只有房主时允许改主意。
         * 已经有队友（真人或鱼）时不覆盖，避免把正在玩的人挤掉。 */
        const onlyHost = room.users.filter(x => x.pid !== me.pid).length === 0;
        if (asHost && (wasEmpty || (room.hostPid === me.pid && onlyHost))) {
          room.fishInvite = !!b.fish;
        }
        room.lastAt = Date.now();
        room.rev++;
        saveSoon(room);
        me.lastSeen = Date.now();
        return json(res, view(room, me));
      }

      /* 小鱼邀请列表：只返回房主明确选了「小鱼当队友」、且还有一个空位的房。
       * 鱼队友场景只轮询这里，不再自己找房或占固定房号。 */
      if (p === '/api/survivor/room/invites') {
        const list = [];
        for (const room of rooms.values()) {
          if (!room.fishInvite) continue;
          if (!hostOnline(room)) continue;
          const host = room.users.find(u => u.pid === room.hostPid) || null;
          if (!host) continue;
          const guest = room.users.find(u => u.pid !== room.hostPid) || null;
          if (guest) continue;   // 已经有人（含鱼）占了队友位
          const st = room.state || null;
          list.push({
            code: room.code,
            host: { name: host.name, online: true },
            phase: st ? st.phase : 'lobby',
            wave: st ? st.wave : 0,
            n: room.users.length,
            at: room.lastAt || 0,
          });
        }
        list.sort((a, b) => (b.at || 0) - (a.at || 0));
        return json(res, { ok: true, invites: list });
      }

      /* SSE：房主收 input，队友收 frame/state/chat/peer */
      if (p === '/api/survivor/room/stream') {
        const code = safeCode(u.searchParams.get('code'));
        const pid = cleanText(u.searchParams.get('pid'), 40);
        const room = loadRoom(code);
        const me = room.users.find(x => x.pid === pid);
        if (!me) return json(res, { ok: false, needJoin: true });
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        me.lastSeen = Date.now();
        const sub = { res, user: me, busy: false };
        room.subs.add(sub);
        res.on('drain', () => { sub.busy = false; });
        writeEvent(res, 'hello', view(room, me));

        const tick = setInterval(() => {
          try { me.lastSeen = Date.now(); } catch (e) {}
        }, 500);
        const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);

        req.on('close', () => {
          clearInterval(tick); clearInterval(ping);
          room.subs.delete(sub);
          me.lastSeen = Math.min(me.lastSeen, Date.now() - 20000);
        });
        return;
      }

      /* 房主推画面：img 可空（表示没在跑/暂停），state 每次都要带 */
      if (p === '/api/survivor/room/frame') {
        if (req.method !== 'POST') return json(res, { ok: false, error: '只支持 POST' });
        const b = await readBody(req, BODY_FRAME);
        const code = safeCode(b.code);
        const pid = cleanText(b.pid, 40);
        const room = loadRoom(code);
        const me = room.users.find(x => x.pid === pid);
        if (!me) return json(res, { ok: false, error: '先加入房间' });
        if (room.hostPid !== pid) return json(res, { ok: false, error: '只有房主能推画面' });
        me.lastSeen = Date.now();
        room.lastAt = Date.now();
        room.state = cleanState(b.state);
        room.stateAt = Date.now();
        const img = typeof b.img === 'string' ? b.img : '';
        if (img) {
          const okPrefix = /^data:image\/(jpeg|webp|png);base64,/.test(img);
          if (!okPrefix || img.length > FRAME_MAX) return json(res, { ok: false, error: '画面格式不对或太大' });
          room.frame = { img, at: Date.now(), w: int(b.w, 0, 4000), h: int(b.h, 0, 4000) };
          room.frameAt = room.frame.at;
        }
        // 只发给队友；房主自己不需要回显。
        // 有画面就跟着画面一起发摘要；没画面（未开局/暂停）就只发摘要。
        const toGuest = s => s.user.pid !== room.hostPid;
        if (img) {
          broadcast(room, 'frame', {
            img,
            w: room.frame ? room.frame.w : 0,
            h: room.frame ? room.frame.h : 0,
            at: Date.now(),
            state: room.state,
          }, toGuest);
        } else {
          broadcast(room, 'state', room.state, toGuest);
        }
        return json(res, { ok: true, frameAt: room.frameAt });
      }

      /* 队友操作：方向 / 技能 / 奖励。立即转给房主的 SSE。 */
      if (p === '/api/survivor/room/input') {
        if (req.method !== 'POST') return json(res, { ok: false, error: '只支持 POST' });
        const b = await readBody(req);
        const code = safeCode(b.code);
        const pid = cleanText(b.pid, 40);
        const room = loadRoom(code);
        const me = room.users.find(x => x.pid === pid);
        if (!me) return json(res, { ok: false, error: '先加入房间' });
        me.lastSeen = Date.now();
        room.lastAt = Date.now();
        const kind = cleanText(b.kind, 10);
        const toHost = s => s.user.pid === room.hostPid;
        if (kind === 'move') {
          const x = Math.max(-1, Math.min(1, Number(b.x) || 0));
          const y = Math.max(-1, Math.min(1, Number(b.y) || 0));
          broadcast(room, 'input', { kind: 'move', x, y, at: Date.now() }, toHost);
          return json(res, { ok: true });
        }
        if (kind === 'skill') {
          broadcast(room, 'input', { kind: 'skill', index: int(b.index, 0, 3), at: Date.now() }, toHost);
          return json(res, { ok: true });
        }
        if (kind === 'buff') {
          broadcast(room, 'input', { kind: 'buff', index: int(b.index, 0, 5), at: Date.now() }, toHost);
          return json(res, { ok: true });
        }
        if (kind === 'allyBuff') {
          broadcast(room, 'input', { kind: 'allyBuff', index: int(b.index, 0, 5), at: Date.now() }, toHost);
          return json(res, { ok: true });
        }
        if (kind === 'hero') {
          broadcast(room, 'input', { kind: 'hero', key: cleanText(b.key, 20), at: Date.now() }, toHost);
          return json(res, { ok: true });
        }
        if (kind === 'skin') {
          broadcast(room, 'input', { kind: 'skin', id: cleanText(b.id, 24), at: Date.now() }, toHost);
          return json(res, { ok: true });
        }
        if (kind === 'artifact') {
          broadcast(room, 'input', { kind: 'artifact', key: cleanText(b.key, 20), at: Date.now() }, toHost);
          return json(res, { ok: true });
        }
        if (kind === 'allyBuy') {
          broadcast(room, 'input', { kind: 'allyBuy', id: cleanText(b.id, 20), at: Date.now() }, toHost);
          return json(res, { ok: true });
        }
        if (kind === 'restart') {
          broadcast(room, 'input', { kind: 'restart', at: Date.now() }, toHost);
          return json(res, { ok: true });
        }
        return json(res, { ok: false, error: '未知操作' });
      }

      /* 聊天频道：两个人都在这里说话，消息落盘 */
      if (p === '/api/survivor/room/chat') {
        if (req.method !== 'POST') return json(res, { ok: false, error: '只支持 POST' });
        const b = await readBody(req);
        const code = safeCode(b.code);
        const pid = cleanText(b.pid, 40);
        const room = loadRoom(code);
        const me = room.users.find(x => x.pid === pid);
        if (!me) return json(res, { ok: false, error: '先加入房间' });
        const now = Date.now();
        me.lastSeen = now;
        me.hits = (me.hits || []).filter(t => now - t < 10000);
        if (me.hits.length > 24) return json(res, { ok: false, error: '发得太快了，喘口气' });
        me.hits.push(now);
        const text = cleanText(b.text, 300);
        if (!text) return json(res, { ok: false, error: '空消息' });
        const msg = { id: ++room.chatSeq, type: 'text', name: me.name, seat: me.seat, text, at: now };
        room.chat.push(msg);
        if (room.chat.length > MAX_CHAT) room.chat.splice(0, room.chat.length - MAX_CHAT);
        room.chatRev++;
        room.lastAt = now;
        saveSoon(room);
        broadcast(room, 'chat', msg);
        return json(res, { ok: true, msg });
      }

      /* 轮询兜底：SSE 被代理挡住时，队友至少还能拿到摘要；房主也能拉输入 */
      if (p === '/api/survivor/room/state') {
        const code = safeCode(u.searchParams.get('code'));
        const pid = cleanText(u.searchParams.get('pid'), 40);
        const room = loadRoom(code);
        const me = room.users.find(x => x.pid === pid);
        if (!me) return json(res, { ok: false, needJoin: true });
        me.lastSeen = Date.now();
        return json(res, view(room, me));
      }

      if (p === '/api/survivor/room/leave') {
        if (req.method !== 'POST') return json(res, { ok: false, error: '只支持 POST' });
        const b = await readBody(req);
        const code = safeCode(b.code);
        const pid = cleanText(b.pid, 40);
        const room = loadRoom(code);
        const idx = room.users.findIndex(x => x.pid === pid);
        if (idx >= 0) {
          const [me] = room.users.splice(idx, 1);
          room.users.forEach((x, i) => { x.seat = i; });
          if (room.hostPid === pid) room.hostPid = '';
          room.rev++;
          pushSys(room, `${me.name} 离开了房间`);
          saveSoon(room);
          broadcast(room, 'peer', { users: usersView(room), hostPid: room.hostPid, hostOnline: hostOnline(room) });
          for (const s of room.subs) {
            if (s.user.pid === pid) { try { s.res.write('event: bye\ndata: {}\n\n'); } catch (e) {} }
          }
        }
        return json(res, { ok: true });
      }

      return json(res, { ok: false, error: '未知的联机接口' });
    } catch (e) {
      return json(res, { ok: false, error: e.message });
    }
  }

  return { api, readRoom: loadRoom, view };
};
