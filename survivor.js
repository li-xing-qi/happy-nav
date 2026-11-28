/* ============================================================
   「并肩割草」· AI 驾驶适配层  (survivor.js)
   ------------------------------------------------------------
   游戏本体是 stationch/battle-of-heroes（MIT），放在 public/survivor/，
   不改它的源码；AI 的高频操作由页面内的 src/ai.js 行为脚本完成，
   本文件只负责「低频」的那一半：

     1. 数值适配器：她可以改的只有白名单里的键，且全部钳制在安全区间；
        越界不生效，未知键丢弃 —— 这是「自由调节」和「把游戏调坏」的边界。
     2. 局面快照：页面每 700ms 上报一次紧凑摘要，供 agent-bot 读；
        只存在内存里，不落盘（快照高频写盘会毁盘）。
     3. 指令通道：用户说的话先按关键词立刻生效一条意图，
        同时留给 agent-bot 做语义理解与改写（它可以再调参）。
     4. 升级选卡 / 台词：agent-bot 写，页面读；页面不判断好坏。

   零依赖，只用 Node 自带模块；风格与 lx.js 保持一致。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function createSurvivor(ctx) {
  const { DATA, json, readBody } = ctx;
  const DIR = path.join(DATA, 'survivor');
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) { console.error('[survivor dir]', e.message); }

  const CODE_RE = /^[A-Za-z0-9_-]{1,12}$/;
  const SNAP_STALE_MS = 10000;   // 10 秒没上报视为已离开
  const MAX_LINES = 12;
  const MAX_CMDS = 30;
  const DEFAULT_CODE = 'main';

  /* ---------- 数值适配器白名单 ----------
   * [最小值, 最大值, 默认值]
   * 为什么是白名单：模型可以「自由发挥」，但它写错一个键名、或把撤退阈值
   * 写成 5，游戏就会当场抽搐。区间钳制 + 键名白名单，是唯一可靠的护栏。 */
  const SPEC = {
    engageDist:    [80, 620, 230],   // 远程英雄保持的接战距离
    retreatHp:     [0.05, 0.90, 0.35], // 自己血量低于这个比例就撤
    farmWeight:    [0, 4, 1.0],      // 捡掉落的权重
    killWeight:    [0, 4, 1.0],      // 主动清怪的权重
    dangerWeight:  [0, 8, 2.0],      // 远离怪群的权重
    pickupRange:   [80, 900, 420],   // 多远之内的掉落值得绕路
    reaction:      [40, 600, 120],   // 方向重估间隔（毫秒），越大越稳
    strafe:        [-1, 1, 1],       // 远程绕圈方向：1 顺时针，-1 逆时针，0 不绕
    skillAggro:    [0, 1, 0.55],     // 技能释放频率
    autoBuff:      [0, 1, 1],        // 升级奖励是否由她来选
  };
  const INTENTS = ['auto', 'clear', 'farm', 'retreat', 'focus'];
  const INTENT_CN = {
    auto: '自己判断', clear: '清怪', farm: '捡掉落',
    retreat: '撤退', focus: '专打大的',
  };

  function num(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(hi, Math.max(lo, n));
  }
  function clampText(s, n) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n || 120);
  }
  function safeCode(v) {
    const c = String(v == null ? '' : v).trim();
    return CODE_RE.test(c) ? c : DEFAULT_CODE;
  }
  function roomPath(code) {
    return path.join(DIR, code.replace(/[^A-Za-z0-9_-]/g, '') + '.json');
  }

  function defaultPolicy() {
    const p = { intent: 'auto', intentUntil: 0, note: '', updatedAt: 0, rev: 0 };
    for (const k in SPEC) p[k] = SPEC[k][2];
    return p;
  }

  const rooms = new Map();
  const saveTimers = new Map();

  function blankRoom(code) {
    return {
      code,
      runId: 1,
      rev: 0,
      policy: defaultPolicy(),
      lines: [],            // 她最近说的话
      cmds: [],             // 用户最近的指令（给 agent-bot 读）
      lineSeq: 1,
      cmdSeq: 1,
      pick: null,           // { round, index, reason, at }
      snap: null,           // 最近一次局面快照（只在内存）
      snapAt: 0,
      lastAt: Date.now(),
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
        if (j.policy && typeof j.policy === 'object') {
          const base = defaultPolicy();
          for (const k in SPEC) {
            const v = num(j.policy[k], SPEC[k][0], SPEC[k][1]);
            if (v != null) base[k] = v;
          }
          if (INTENTS.includes(j.policy.intent)) base.intent = j.policy.intent;
          base.intentUntil = Number(j.policy.intentUntil) || 0;
          base.note = clampText(j.policy.note, 80);
          base.rev = Number(j.policy.rev) || 0;
          base.updatedAt = Number(j.policy.updatedAt) || 0;
          r.policy = base;
        }
        r.runId = Math.max(1, Number(j.runId) || 1);
        if (Array.isArray(j.lines)) r.lines = j.lines.slice(-MAX_LINES);
        if (r.lines.length) r.lineSeq = Math.max(...r.lines.map(x => Number(x.id) || 0)) + 1;
        if (j.pick && typeof j.pick === 'object') r.pick = j.pick;
      }
    } catch (e) {
      console.error('[survivor load]', e.message);
    }
    rooms.set(code, r);
    return r;
  }

  function saveSoon(code) {
    clearTimeout(saveTimers.get(code));
    saveTimers.set(code, setTimeout(() => {
      saveTimers.delete(code);
      const r = rooms.get(code);
      if (!r) return;
      try {
        const out = {
          runId: r.runId,
          policy: r.policy,
          lines: r.lines.slice(-MAX_LINES),
          pick: r.pick,
        };
        const f = roomPath(code);
        const tmp = f + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(out));
        fs.renameSync(tmp, f);
      } catch (e) {
        console.error('[survivor save]', e.message);
      }
    }, 400));
  }

  function addLine(code, text) {
    const r = loadRoom(code);
    const t = clampText(text, 120);
    if (!t) return null;
    const line = { id: r.lineSeq++, at: Date.now(), text: t };
    r.lines.push(line);
    if (r.lines.length > MAX_LINES) r.lines.splice(0, r.lines.length - MAX_LINES);
    saveSoon(code);
    return line;
  }

  /* ---------- 数值补丁：只接受白名单键，全部钳制 ---------- */
  function applyPatch(code, body) {
    const r = loadRoom(code);
    const b = body && typeof body === 'object' ? body : {};
    const patch = b.patch && typeof b.patch === 'object' ? b.patch : b;
    const next = Object.assign({}, r.policy);
    let touched = 0;
    let noteTouched = false;
    for (const k in SPEC) {
      if (!(k in patch)) continue;
      const v = num(patch[k], SPEC[k][0], SPEC[k][1]);
      if (v == null) continue;
      next[k] = v;
      touched++;
    }
    if (typeof b.intent === 'string' && INTENTS.includes(b.intent)) {
      next.intent = b.intent;
      const ms = num(b.intentMs, 0, 30 * 60 * 1000);
      next.intentUntil = ms ? Date.now() + ms : 0;
      touched++;
    }
    if (typeof b.note === 'string' && b.note.trim()) {
      next.note = clampText(b.note, 80);
      noteTouched = true;
    }
    if (!touched && !noteTouched) return { ok: false, reason: '没有可用的字段', policy: r.policy };
    next.rev = (r.policy.rev || 0) + 1;
    next.updatedAt = Date.now();
    r.policy = next;
    saveSoon(code);
    return { ok: true, policy: r.policy };
  }

  /* ---------- 指令：关键词先立刻生效，语义留给 agent-bot ---------- */
  const CMD_RULES = [
    { re: /撤|跑|保命|躲|退/, intent: 'retreat', reply: '好，先撤。' },
    { re: /经验|捡|球|吃/, intent: 'farm', reply: '我去把掉落捡了。' },
    { re: /boss|首领|精英|大的/i, intent: 'focus', reply: '盯着大的打。' },
    { re: /清|杀|怼|怪|上去|上啊/, intent: 'clear', reply: '去清了。' },
    { re: /随便|自动|听你|你定|随你|你看着办/, intent: 'auto', reply: '那我看着办。' },
  ];
  const TUNE_RULES = [
    { re: /别贴太近|远一点|拉开/, patch: { engageDist: 60 }, reply: '我拉开点距离。' },
    { re: /贴脸|近一点|上去打/, patch: { engageDist: -60 }, reply: '我贴上去。' },
    { re: /稳|小心|保守/, patch: { retreatHp: 0.08, dangerWeight: 0.6 }, reply: '稳一点。' },
    { re: /猛|激进|冲|凶一点/, patch: { retreatHp: -0.08, killWeight: 0.5 }, reply: '那我凶一点。' },
    { re: /别捡|不用捡|别管掉落/, patch: { farmWeight: 0 }, reply: '不捡了。' },
  ];

  function applyCommand(code, text) {
    const raw = clampText(text, 120);
    if (!raw) return { ok: false, reply: '说点什么我才知道要干嘛。' };
    const r = loadRoom(code);
    const cmd = { id: r.cmdSeq++, at: Date.now(), text: raw, reply: '' };
    let reply = '';
    let result = null;

    // 先匹配调参，再匹配意图：两类可以同时命中（例如「稳一点，先撤」）
    for (const t of TUNE_RULES) {
      if (!t.re.test(raw)) continue;
      const patch = {};
      for (const k in t.patch) {
        const base = r.policy[k];
        patch[k] = num(base + t.patch[k], SPEC[k][0], SPEC[k][1]);
      }
      const res = applyPatch(code, { patch });
      if (res.ok) { result = res; reply = reply ? reply + ' ' + t.reply : t.reply; }
      break;
    }
    for (const c of CMD_RULES) {
      if (!c.re.test(raw)) continue;
      const res = applyPatch(code, { intent: c.intent, intentMs: 25000 });
      if (res.ok) { result = res; reply = reply ? reply + ' ' + c.reply : c.reply; }
      break;
    }
    if (!reply) reply = '这句我没太听懂，试试「清怪 / 捡东西 / 撤 / 打大的 / 随便」。';

    cmd.reply = reply;
    r.cmds.push(cmd);
    if (r.cmds.length > MAX_CMDS) r.cmds.splice(0, r.cmds.length - MAX_CMDS);
    addLine(code, reply);
    return { ok: true, reply, policy: r.policy };
  }

  /* ---------- 快照清洗：前端上报的东西一律不可信 ---------- */
  function cleanSnap(code, s) {
    const b = s && typeof s === 'object' ? s : {};
    const r = loadRoom(code);
    const prev = r.snap;
    const wave = Math.max(0, Math.min(999, Math.round(Number(b.wave) || 0)));
    const hp = Math.max(0, Math.min(1e9, Math.round(Number(b.hp) || 0)));
    const maxHp = Math.max(1, Math.min(1e9, Math.round(Number(b.maxHp) || 1)));
    const nearest = Array.isArray(b.nearest) ? b.nearest.slice(0, 6).map(e => ({
      x: Math.round(Number(e.x) || 0), y: Math.round(Number(e.y) || 0),
      type: clampText(e.type, 12), d: Math.round(Number(e.d) || 0),
    })) : [];
    const orbs = Array.isArray(b.orbs) ? b.orbs.slice(0, 4).map(e => ({
      x: Math.round(Number(e.x) || 0), y: Math.round(Number(e.y) || 0),
      type: clampText(e.type, 12), d: Math.round(Number(e.d) || 0),
    })) : [];
    const buffs = Array.isArray(b.buffs) ? b.buffs.slice(0, 6).map(x => clampText(x, 40)) : [];
    return {
      wave, hp, maxHp,
      alive: !!b.alive,
      state: clampText(b.state, 12),
      enemies: Math.max(0, Math.min(999, Math.round(Number(b.enemies) || 0))),
      elites: Math.max(0, Math.min(99, Math.round(Number(b.elites) || 0))),
      boss: !!b.boss,
      pickups: Math.max(0, Math.min(99, Math.round(Number(b.pickups) || 0))),
      nearest, orbs,
      buffOpen: !!b.buffOpen,
      buffs,
      dead: !!b.dead,
      // 服务端补两项，agent-bot 不用自己算
      waveChanged: !!prev && prev.wave !== wave,
      hpDropped: !!prev && (prev.hp / prev.maxHp) - (hp / maxHp) >= 0.15,
      at: Date.now(),
    };
  }

  function viewOf(code) {
    const r = loadRoom(code);
    return {
      ok: true,
      rev: r.policy.rev,
      policy: r.policy,
      lines: r.lines,
      pick: r.pick,
      runId: r.runId,
      sessionId: `survivor-${code}-${r.runId}`,
    };
  }

  /* ---------- 路由 ---------- */
  async function api(req, res, u, p) {
    try {
      if (p === '/api/survivor/state') {
        if (req.method === 'POST') {
          const b = await readBody(req);
          const code = safeCode(b.code);
          const r = loadRoom(code);
          r.snap = cleanSnap(code, b.snap);
          r.snapAt = r.snap.at;
          r.lastAt = Date.now();
          return json(res, viewOf(code));
        }
        const code = safeCode(u.searchParams.get('code'));
        const r = loadRoom(code);
        return json(res, {
          ok: true,
          hasSnap: !!r.snap,
          snapAge: r.snapAt ? Date.now() - r.snapAt : -1,
          snap: r.snap,
          policy: r.policy,
          lines: r.lines,
          pick: r.pick,
          runId: r.runId,
          sessionId: `survivor-${code}-${r.runId}`,
        });
      }

      if (p === '/api/survivor/policy') {
        if (req.method === 'POST') {
          const b = await readBody(req);
          const code = safeCode(b.code);
          return json(res, applyPatch(code, b));
        }
        const code = safeCode(u.searchParams.get('code'));
        return json(res, { ok: true, policy: loadRoom(code).policy });
      }

      if (p === '/api/survivor/command') {
        const b = await readBody(req);
        const code = safeCode(b.code);
        const out = applyCommand(code, b.text);
        return json(res, Object.assign({ code }, out));
      }

      if (p === '/api/survivor/commands') {
        const code = safeCode(u.searchParams.get('code'));
        const since = Number(u.searchParams.get('since')) || 0;
        const r = loadRoom(code);
        return json(res, { ok: true, cmds: r.cmds.filter(c => c.at > since) });
      }

      if (p === '/api/survivor/choice') {
        const b = await readBody(req);
        const code = safeCode(b.code);
        const r = loadRoom(code);
        const round = Math.max(0, Math.min(999, Math.round(Number(b.round) || 0)));
        const index = Math.max(0, Math.min(5, Math.round(Number(b.index) || 0)));
        r.pick = { round, index, reason: clampText(b.reason, 80), at: Date.now() };
        if (b.text) addLine(code, b.text);
        saveSoon(code);
        return json(res, { ok: true, pick: r.pick });
      }

      if (p === '/api/survivor/say') {
        const b = await readBody(req);
        const code = safeCode(b.code);
        const line = addLine(code, b.text);
        return json(res, { ok: !!line, line });
      }

      if (p === '/api/survivor/reset') {
        const b = await readBody(req);
        const code = safeCode(b.code);
        const r = loadRoom(code);
        r.runId++;
        r.snap = null; r.snapAt = 0; r.pick = null;
        r.policy.intent = 'auto'; r.policy.intentUntil = 0;
        r.policy.rev++;
        r.policy.updatedAt = Date.now();
        saveSoon(code);
        return json(res, viewOf(code));
      }

      return json(res, { ok: false, error: '未知的割草接口' });
    } catch (e) {
      return json(res, { ok: false, error: e.message });
    }
  }

  /* 给 agent-bot 复用：读快照 / 写策略 / 选卡 / 说一句 */
  return {
    api,
    readRoom: loadRoom,
    viewOf,
    applyPatch,
    applyCommand,
    addLine,
    INTENTS,
    INTENT_CN,
    SPEC,
    defaultPolicy,
  };
};
