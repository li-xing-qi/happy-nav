/* ============================================================
   双人合作战斗引擎 —— 由单机版 solo.html 的战斗逻辑搬运改造
   · 所有随机 / 结算都在服务端完成，客户端只负责渲染
   · 两个玩家共享楼层与敌人，各自拥有牌组 / 金币 / 天赋
   ============================================================ */
const C = require('./content.js');
const { POOL, TALENTS, SHOP_POOL, SETUP_POOL, TEMP_POOL, BOSS_DEFS, BOSS_ART,
        BASE_DECK, PICK_COUNT, TALENT_TAGS, TALENT_CAT, talentCat, mk, mkEntry, shuffle,
        TEMP_GEN_PER_TURN, CHAIN_MAX, MAX_SETUP, ALL_READY_PER_TURN,
        ECHO_EXTRA, MAXHP_CAP_PER_COMBAT, INTENT_HARM,
        SCHOOLS, SCHOOL_KEYS, START_PICK_N, PREF_SEATS, SCHOOL_START_TALENTS,
        cardBlocked, activeSchools, GU_MAX, GU_CURSE_CAP, GU_ABSORB, GU_HEAL,
        GU_TEMPER_COST, GU_POISON_PCT, GU_CURSE_PCT, GU_TALENTS } = C;

const MAX_PLAYERS = 2;
// 双人合作：两人各有一套手牌与能量、共同打一个敌人，输出约等于单人的两倍。
// 原版 1.5 倍血量偏软，v4.2 提到 1.8 倍，攻击抬 15%（BOSS 蓄力/连击也会跟着水涨船高），
// 但保留原本「小怪爽快清场、BOSS 靠机制而不是堆数值」的设计意图。
const DUO_HP_MULT  = 1.8;
const DUO_ATK_MULT = 1.15;
const MAX_FLOOR   = 15;
const MAX_UP      = 1;        // 每张牌组条目只能升级一次

// 天赋视图：服务端直接给出中文名 / 分类 / 完整说明，客户端不再拿 id 当名字显示
function talentView(id) {
  const T = TALENTS[id] || {};
  const cat = talentCat(id) || TALENT_CAT.other;
  return {
    id,
    name: T.name || id,
    desc: T.desc || '',
    price: T.price || 0,
    cat: cat.key,
    catName: cat.name,
    catColor: cat.color,
  };
}
const LOG_MAX     = 260;
const TURN_CARD_CAP = 60;     // 每回合出牌上限（保险丝）
// 托管 / 掉线保护：单回合「连续无动作」超时自动结束；掉线后自动推进卡住的流程
// 注意：计时基准是「最后一次有效动作」而不是「回合开始」，出牌 / 聊天 / 保持活跃都会顺延
const TURN_IDLE_MS = Math.max(5000, Number(process.env.TURN_IDLE_MS || 90000));
const OFFLINE_MS   = Math.max(5000, Number(process.env.OFFLINE_MS || 60000));
// 整备（选天赋 / 选牌）阶段的兜底：在线但一直不动的人，超时自动替他选完，避免队友被永久锁住
const SETUP_IDLE_MS = Math.max(20000, Number(process.env.SETUP_IDLE_MS || 90000));
const NUDGE_MIN_MS = Math.max(5000, Number(process.env.NUDGE_MIN_MS || 15000));   // 对方多久没动静，才允许你替他选

/* 状态栏的 act 有效期：45 秒（和 server.js 的 memberActOf、yu.js 的 actOf、
 * agent-bot/lib/presence.js 的 ACT_TTL_MS 同一套语义）。
 * 超过就返回空串，页面自动退回「在线」——不能让她永远停在「出牌中」。 */
const ACT_TTL_MS = 45000;
function actLabelOf(p) {
  if (!p || !p.act) return '';
  return Date.now() - Number(p.actAt || 0) < ACT_TTL_MS ? String(p.act) : '';
}

let applyDepth = 0;           // 联动链深度
let fxDepth = 0;              // 日志缩进

// ============================ 房间 ============================
class Room {
  constructor(id) {
    this.id = id;
    this.players = [];
    this.phase = 'lobby';      // lobby / setup / combat / reward / shop / end
    this.floor = 1;
    this.maxFloor = MAX_FLOOR;
    this.enemy = null;
    this.log = [];
    this.turnNo = 0;
    this.combatCards = 0;      // 本场两人合计出牌数（BOSS 战意）
    this.over = null;          // 'win' | 'lose'
    this.rev = 0;              // 状态版本号
    this.lastAct = Date.now();
    this.chat = [];            // 队友频道消息（房间内广播）
    this.chatSeq = 0;
    // 五流派：房间级配置（整备开始前可改，开局后锁定；'' / 'random' / 具体流派）
    this.banConfig = '';          // 玩家设置的原始值（'' / 'random' / 具体流派）
    this.banSchool = '';          // 本局实际生效的禁用系（random 会在开局时解析）
    this.talentPref = '';
    this.banLocked = false;
  }

  // ---------------- 玩家 ----------------
  newPlayer(pid, name) {
    const p = {
      pid, seat: this.players.length, name, online: true,
      lastSeen: Date.now(), offlineSince: 0, turnStartAt: 0, lastActAt: Date.now(),
      act: '', actAt: 0,          // 状态栏：她正在干嘛（思考中 / 出牌中 / 说话中），由 /api/act 写
      hp: 50, maxHp: 50, energy: 3, maxEnergy: 3, block: 0, strength: 0, poison: 0,
      gu: 0, guHealUsed: 0, guTemper: 0,        // 蛊术：不随回合衰减、每场战斗清零
      masterDeck: BASE_DECK.map(mkEntry),
      hand: [], draw: [], discard: [], playedList: [],
      setupCards: [], setupSeq: 0, entries: [], downNextTurn: undefined, entryDone: false,
      setupTrig: 0, setupSeen: {}, setupLearned: {}, setupLinkUsed: 0,
      combatCards: 0, talents: [], canAct: false, gold: 0,
      hpPaid: 0, selfPaid: 0, paidTurn: 0, paidLast: 0,
      bloodBurstUsed: 0, bloodMightUsed: 0, bloodWardUsed: 0, bloodGoldUsed: 0,
      bloodFlowUsed: 0, bloodResUsed: 0,
      lastStandUsed: 0, lastStandArmed: false, maxHpGain: 0, maxHpGainCombat: 0,
      talentBought: 0, dead: false, ready: false,
      pendingCombatBlock: 0,
      // 流程
      setupStage: 'talent',    // talent → deck → done
      talentPicks: [], deckCands: [], deckPicks: [],
      rewardPicks: [], rewardDone: false,
      shop: null, shopDone: false,
    };
    return p;
  }

  join(pid, name) {
    const old = this.players.find(x => x.pid === pid);
    if (old) { old.name = name; old.online = true; this.touch(); return old; }
    if (this.players.length >= MAX_PLAYERS && this.phase !== 'lobby') return null;
    if (this.players.length >= MAX_PLAYERS) return null;
    const p = this.newPlayer(pid, (name || '玩家').slice(0, 8));
    this.players.push(p);
    this.addLog(`🎮 ${p.name} 加入了房间（${this.players.length}/${MAX_PLAYERS}）`, 'info', p.seat);
    if (this.players.length === MAX_PLAYERS && this.phase === 'lobby') this.beginSetup();
    this.touch();
    return p;
  }

  seatOf(pid) { const p = this.players.find(x => x.pid === pid); return p ? p.seat : -1; }
  touch() { this.rev++; this.lastAct = Date.now(); }
  alive() { return this.players.filter(p => !p.dead); }

  // ---------------- 在线状态 / 掉线托管 ----------------
  markSeen(pid) {
    const p = this.players.find(x => x.pid === pid);
    if (!p) return;
    p.lastSeen = Date.now();
    if (p.online === false) { p.online = true; p.offlineSince = 0; this.touch(); }
  }
  setOnline(pid, on) {
    const p = this.players.find(x => x.pid === pid);
    if (!p || p.online === on) return;
    p.online = on;
    if (!on) p.offlineSince = Date.now();
    else p.offlineSince = 0;
    this.touch();
  }
  // SSE 断开后延迟判定离线：避免刷新页面时被误判成掉线
  scheduleOffline(pid, delay) {
    setTimeout(() => {
      const p = this.players.find(x => x.pid === pid);
      if (!p) return;
      if (Date.now() - (p.lastSeen || 0) > (delay || 5000)) this.setOnline(pid, false);
    }, (delay || 5000) + 50).unref?.();
  }

  /**
   * 定时巡检：把「卡住没人推进」的流程往前推。
   * · 战斗：某人有行动权却长时间不动 → 自动结束他的回合
   * · 整备 / 战利品 / 商店：有人掉线很久 → 替他做完（保底选择），别把队友永久锁死
   * 两人都在线时只做战斗托管，绝不替玩家做选择。
   */
  tickIdle(now) {
    now = now || Date.now();
    if (this.phase === 'end' || this.phase === 'lobby') return;
    if (!this.players.some(p => p.online !== false)) return;   // 都掉线了就别自己打自己

    if (this.phase === 'combat') {
      for (const p of this.players) {
        if (p.dead || p.ready || !p.canAct) continue;
        if (!p.turnStartAt) p.turnStartAt = now;
        const limit = p.online === false ? Math.min(TURN_IDLE_MS, 15000) : TURN_IDLE_MS;
        if (now - p.turnStartAt < limit) continue;
        this.addLog(`⏱ ${p.name} ${p.online === false ? '已掉线' : `连续 ${Math.round(TURN_IDLE_MS / 1000)} 秒没有动作`}，自动结束回合（托管）`, 'info', p.seat);
        this.endTurn(p, false);
        return;
      }
      return;
    }

    // 整备：在线但迟迟不动的人，超时替他选完（否则队友会被永久锁在「等待对方完成整备」）
    if (this.phase === 'setup') {
      for (const p of this.players) {
        if (p.setupStage === 'done') continue;
        if (!p.lastActAt) p.lastActAt = now;
        const lim = p.online === false ? Math.min(SETUP_IDLE_MS, 30000) : SETUP_IDLE_MS;
        if (now - p.lastActAt < lim) continue;
        this.addLog(`⏱ ${p.name} 整备停留超过 ${Math.round(lim / 1000)} 秒，自动替他完成`, 'info', p.seat);
        this.autoFinishSetup(p);
        return;
      }
    }

    for (const p of this.players) {
      if (p.online !== false || !p.offlineSince) continue;
      if (now - p.offlineSince < OFFLINE_MS) continue;
      if (this.phase === 'setup' && p.setupStage !== 'done') { this.autoFinishSetup(p); return; }
      if (this.phase === 'reward' && !p.rewardDone) {
        this.addLog(`🕹 ${p.name} 掉线，自动替他拿走 30 金币`, 'info', p.seat);
        this.takeReward(p, null, true); return;
      }
      if (this.phase === 'shop' && !p.shopDone) {
        this.addLog(`🕹 ${p.name} 掉线，自动替他「备好」`, 'info', p.seat);
        this.shopAct(p, { t: 'leave' }); return;
      }
    }
  }

  // 队友主动点「替他选完」：只在对方真的长时间没动静时才允许，避免误伤正在操作的人
  nudge(p) {
    if (this.phase !== 'setup') return { error: '现在不需要催' };
    const o = this.players.find(x => x.seat !== p.seat);
    if (!o) return { error: '还没有队友' };
    if (o.setupStage === 'done') return { error: `${o.name} 已经准备好了` };
    const idle = Date.now() - (o.lastActAt || Date.now());
    if (idle < NUDGE_MIN_MS) return { error: `${o.name} 刚刚还在操作，再等一会儿` };
    this.addLog(`🕹 ${p.name} 帮 ${o.name} 完成了整备（对方已 ${Math.round(idle / 1000)} 秒没动作）`, 'info', o.seat);
    this.autoFinishSetup(o);
    return { ok: true };
  }

  autoFinishSetup(p) {
    if (p.setupStage === 'talent') {
      let t = (p.talentPicks || [])[0];
      if (!t || !TALENTS[t]) t = this.rollStartTalents()[0];   // 候选丢了也别卡死
      if (t && TALENTS[t]) {
        this.buyTalent(p, t);
        p.deckCands = this.buildDeckCandidates(p);
        p.deckPicks = [];
        p.setupStage = 'deck';
        this.addLog(`🕹 ${p.name} 自动选择开局天赋【${TALENTS[t].name}】`, 'info', p.seat);
      } else {
        p.deckCands = this.buildDeckCandidates(p);
        p.deckPicks = [];
        p.setupStage = 'deck';
      }
    }
    if (p.setupStage === 'deck') {
      const need = Math.min(PICK_COUNT, (p.deckCands || []).length);
      p.deckPicks = (p.deckCands || []).slice(0, need).map(c => (typeof c === 'string' ? c : c.id));
      p.deckPicks.forEach(id => p.masterDeck.push(mkEntry(id)));
      p.setupStage = 'done';
      this.addLog(`🕹 ${p.name} 自动组建了牌组（${p.masterDeck.length} 张）`, 'info', p.seat);
    }
    if (this.players.every(x => x.setupStage === 'done')) this.startCombat();
    this.touch();
  }

  // ---------------- 日志 ----------------
  addLog(t, cls, who) {
    this.log.push({ t, cls: cls || '', d: Math.max(0, fxDepth - 1), who: (who === undefined ? null : who) });
    if (this.log.length > LOG_MAX) this.log.shift();
  }
  logSep(t, who) { this.log.push({ t, cls: 'sec', sep: true, d: 0, who: who === undefined ? null : who }); }
  logOpen(label, cls, who) { this.log.push({ t: label, cls: cls || 'info', d: Math.max(0, fxDepth), ph: true, who: who === undefined ? null : who }); return this.log[this.log.length - 1]; }
  logClose(o, txt, cls) {
    if (!o) return;
    if (txt) { o.t = txt; if (cls) o.cls = cls; delete o.ph; }
    else { const i = this.log.indexOf(o); if (i >= 0) this.log.splice(i, 1); }
  }

  // ============================================================
  //  开局：各选 1 个天赋 → 各选 4 张牌
  // ============================================================
  beginSetup() {
    this.phase = 'setup';
    // 'random' 每局重掷，且不会砸到爱好流派；开局后锁定，改设置只影响下一局
    if (this.banConfig === 'random') {
      const keys = SCHOOL_KEYS.filter(k => k !== this.talentPref);
      this.banSchool = keys[Math.floor(Math.random() * keys.length)] || '';
    } else this.banSchool = this.banConfig || '';
    this.banLocked = true;
    for (const p of this.players) { p.setupStage = 'talent'; p.talentPicks = this.rollStartTalents(); p.lastActAt = Date.now(); }
    const bn = this.banSchool ? SCHOOLS[this.banSchool] : null;
    this.addLog(`⚔️ 两人到齐，开始整备：各自选 1 个开局天赋，再挑 ${PICK_COUNT} 张牌${bn ? `（本局禁用【${bn.name}】）` : ''}`, 'info');
    this.touch();
  }

  // 五流派席位制：每个未禁用系保底 1 席；指定爱好流派补到 PREF_SEATS 席；剩余席位各系随机
  rollStartTalents() {
    const ban = this.banSchool || '';
    const keys = activeSchools(ban);
    const seats = {}; keys.forEach(k => seats[k] = 1);
    const pref = (this.talentPref && keys.includes(this.talentPref)) ? this.talentPref : '';
    let left = Math.max(0, START_PICK_N - keys.length);
    if (pref) {
      const give = Math.min(Math.max(0, Math.min(PREF_SEATS, START_PICK_N) - seats[pref]), left);
      seats[pref] += give; left -= give;
    }
    while (left > 0) { seats[keys[Math.floor(Math.random() * keys.length)]]++; left--; }
    const used = new Set(), picks = [];
    for (const k of keys) {
      for (let i = 0; i < seats[k]; i++) {
        const av = (SCHOOLS[k].pool || []).filter(t => TALENTS[t] && !used.has(t));
        if (!av.length) break;
        const t = av[Math.floor(Math.random() * av.length)]; used.add(t); picks.push(t);
      }
    }
    const rest = SCHOOL_START_TALENTS.filter(t => TALENTS[t] && !used.has(t) && !(ban && talentCat(t).key === ban));
    while (picks.length < START_PICK_N && rest.length) {
      const t = rest.splice(Math.floor(Math.random() * rest.length), 1)[0]; used.add(t); picks.push(t);
    }
    return shuffle(picks);
  }

  // 房间内是否有人「沾蛊」：有蛊系天赋 / 蛊牌 / 蛊术 / 指定蛊毒爱好，蛊牌才进池
  guAffinity() {
    if ((this.banSchool || '') === 'gu') return false;
    return this.talentPref === 'gu' || this.players.some(p =>
      (p.gu || 0) > 0 ||
      (p.talents || []).some(t => GU_TALENTS.includes(t)) ||
      (p.masterDeck || []).some(en => POOL[typeof en === 'string' ? en : en.id] && POOL[typeof en === 'string' ? en : en.id].school === 'gu'));
  }
  visiblePool() {
    const ban = this.banSchool || '', gu = this.guAffinity();
    return SHOP_POOL.filter(id => POOL[id] && !cardBlocked(id, ban) && !(POOL[id].school === 'gu' && !gu));
  }

  buildDeckCandidates(p) {
    const picks = [];
    const push = id => { if (id && POOL[id] && id !== 'spring' && !picks.includes(id)) picks.push(id); };
    ['tactic', 'insight', 'herb', 'ironwave', 'anger', 'vamp'].forEach(push);
    const tags = new Set();
    p.talents.forEach(t => { const g = TALENT_TAGS[t]; if (g) tags.add(g); });
    const matchesTag = (id, tag) => {
      const c = POOL[id]; if (!c) return false;
      if (tag === 'poison') return !!(c.fx && (c.fx.poison || c.fx.poisonE));
      if (tag === 'gu') return c.school === 'gu' || c.cat === '蛊毒';
      if (tag === 'blood')  return !!(c.fx && (c.fx.selfDmg || c.fx.selfDmgPct)) || !!c.bloodCut;
      return c.kind === tag;
    };
    const vis = this.visiblePool();
    tags.forEach(tag => {
      const pool = vis.filter(id => !picks.includes(id) && id !== 'spring' && matchesTag(id, tag));
      const n = tag === 'gu' ? 3 : 2;
      for (let i = 0; i < n && pool.length; i++) push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    });
    const rest = vis.filter(id => !picks.includes(id) && id !== 'spring');
    while (picks.length < 11 && rest.length) push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    return picks;
  }

  has(p, id) { return p.talents.includes(id); }

  buyTalent(p, t) {
    p.talents.push(t);
    if (t === 'tough') { p.maxHp += 10; p.hp = Math.min(p.maxHp, p.hp + 10); }
    if (t === 'lastStand') { p.lastStandUsed = 0; p.lastStandArmed = false; }
  }

  // ============================================================
  //  战斗
  // ============================================================
  startCombat() {
    const f = this.floor;
    // 保险：把不存在的牌 id 剔掉，否则 mk() 抛异常会让整个房间永久卡在整备阶段
    for (const p of this.players) {
      const idOf = en => (typeof en === 'string' ? en : en && en.id);
      const bad = p.masterDeck.filter(en => !POOL[idOf(en)]);
      if (bad.length) {
        p.masterDeck = p.masterDeck.filter(en => POOL[idOf(en)]);
        this.addLog(`⚠ ${p.name} 的牌组里有 ${bad.length} 张无效牌，已自动剔除`, 'info', p.seat);
      }
      if (!p.masterDeck.length) p.masterDeck = BASE_DECK.map(mkEntry);
    }
    this.enemy = C.makeEnemy(f);
    this.enemy.maxHp = Math.round(this.enemy.maxHp * DUO_HP_MULT);
    this.enemy.hp = this.enemy.maxHp;
    this.enemy.attack = Math.round(this.enemy.attack * DUO_ATK_MULT);
    this.enemy.hitsThisTurn = 0; this.enemy.dmgTakenThisTurn = 0;
    this.setIntent();
    this.turnNo = 0; this.combatCards = 0;
    for (const p of this.players) {
      p.block = 0; p.strength = 0; p.energy = p.maxEnergy; p.hand = []; p.discard = [];
      p.setupCards = []; p.setupSeq = 0; p.entries = []; p.downNextTurn = undefined; p.entryDone = false;
      p.poison = 0; p.playedList = [];
      p.gu = 0; p.guHealUsed = 0; p.guTemper = 0;     // 蛊术每场战斗清零
      p.tempGen = 0; p.tempPlayed = 0; p.tempOpenUsed = 0; p.tempDrawUsed = 0; p.tempGoldUsed = 0;
      p.tempWardUsed = 0; p.openEchoUsed = 0;
      p.setupTrig = 0; p.setupSeen = {}; p.setupLearned = {}; p.setupLinkUsed = 0;
      p.draw = shuffle(p.masterDeck.map(mk));
      p.playedThisTurn = 0; p.combatCards = 0; p.springThisTurn = 0; p.openNext = false; p.thresh = {};
      p.hpPaid = 0; p.selfPaid = 0; p.paidTurn = 0; p.paidLast = 0;
      p.bloodBurstUsed = 0; p.bloodMightUsed = 0; p.bloodWardUsed = 0; p.bloodGoldUsed = 0;
      p.bloodFlowUsed = 0; p.bloodResUsed = 0;
      p.lastStandArmed = false; p.maxHpGainCombat = 0;
      p.entryGuardUsed = 0; p.entryGoldUsed = 0; p.entryDrawUsed = false;
      p.turnCards = 0;
      p.ready = false; p.canAct = false;
      if (p.dead) {   // 阵亡者在下一层以 40% 生命复活
        p.hp = Math.max(12, Math.round(p.maxHp * 0.4));
        p.dead = false;
        this.addLog(`💫 ${p.name} 在层间缓了过来，以 ${p.hp}/${p.maxHp} 生命重新参战`, 'heal', p.seat);
      }
      // 天赋：战斗开始
      if (this.has(p, 'sharp')) p.strength += 2;
      p.pendingCombatBlock = this.has(p, 'guardT') ? 8 : 0;
      if (this.has(p, 'venomT')) { this.enemy.poison += 5; this.addLog(`💠 ${p.name} 天赋【毒师】：敌人获得 5 层中毒`, 'info', p.seat); }
      if (this.has(p, 'guOpen')) {
        p.gu = Math.min(this.guCap(p), p.gu + 12);
        this.enemy.poison += 6;
        this.addLog(`💠 ${p.name} 天赋【蛊毒·引子】：开局 +12 蛊术、敌人 +6 层中毒`, 'info', p.seat);
      }
      if (this.has(p, 'setupFree')) {
        const ids = SHOP_POOL.filter(id => POOL[id] && POOL[id].kind === 'setup');
        if (ids.length) {
          const id = ids[Math.floor(Math.random() * ids.length)];
          this.placeSetup(mk(id), p);
          this.addLog(`💠 ${p.name} 天赋【整备·预置】：免费布置【${POOL[id].name}】`, 'info', p.seat);
        }
      }
    }
    this.phase = 'combat';
    const e = this.enemy;
    if (e.isBoss) {
      this.addLog(`—— 第 ${f} 层 · ${e.name} 登场（${e.hp} 血 / 攻击 ${e.attack}）——`, 'hit');
      e.mech.forEach(m => this.addLog(`${m[0]}：${m[1].replace(/<[^>]+>/g, '')}`, 'info'));
      this.addLog(`💡 ${e.tip}`, 'info');
      if (e.key === 'plague') { e.setups.push({ name: '共生菌毯', fx: { block: 6 } }); this.addLog('🍄 【共生菌毯】已布置：它每回合获得 6 点格挡', 'info'); }
      if (e.key === 'ironclad') { e.block = 20; this.addLog('🛡 【铁壁】：开局自带 20 点格挡', 'info'); }
      if (e.key === 'commander') { e.block = 16; this.addLog('🛡 【军阵】：开局自带 16 点格挡', 'info'); }
      if (e.key === 'titan') { e.block = 18; this.addLog('🪨 【坚岩】：开局自带 18 点格挡与 +4 力量', 'info'); }
    } else {
      this.addLog(`—— 第 ${f} 层战斗开始（守卫 · ${e.hp} 血 / 攻击 ${e.attack}）——`, 'info');
    }
    this.startPlayerTurn();
    this.touch();
  }

  maxPoison() { return Math.max(0, ...this.players.map(p => p.poison || 0)); }

  setIntent() {
    const e = this.enemy; if (!e) return;
    const hits = e.hitsThisTurn || 0;           // 上一回合被玩家打中的次数（千刃舞者的破绽）
    e.hitsThisTurn = 0; e.dmgTakenThisTurn = 0;
    const n = () => (e.pstep = (e.pstep || 0) + 1);
    switch (e.key) {
      case 'ironclad': {
        const k = n();
        if (k % 4 === 1) e.intent = { type: 'charge', turns: 1, dmg: Math.round(e.attack * 2.2), slam: 0.08, label: '蓄力重锤' };
        else if (k % 4 === 3) e.intent = { type: 'defend', val: 14 };
        else e.intent = { type: 'attack', val: e.attack, slam: 0.06 };
        break;
      }
      case 'ram': {                       // 攻城兽：每一击都带撞击，每 3 回合一次冲撞
        const k = n();
        e.intent = (k % 3 === 0)
          ? { type: 'charge', turns: 1, dmg: Math.round(e.attack * 1.6), slam: 0.15, label: '野蛮冲撞' }
          : { type: 'attack', val: e.attack, slam: 0.08 };
        break;
      }
      case 'plague': {
        if (e.poison >= 20 && !e.cleansed) { e.cleansed = true; e.intent = { type: 'cleanse', val: 0 }; }
        else if (this.maxPoison() < 10) e.intent = { type: 'venom', val: 4 };
        else {
          const k = n();
          e.intent = (k % 3 === 0) ? { type: 'defend', val: 12 } : { type: 'attack', val: e.attack, slam: 0.05 };
        }
        break;
      }
      case 'combo': {                     // 千刃舞者：磨刃 → 4 段连击；一回合被打中 4 次则剑路中断
        if (!e.mode) e.mode = 'sharpen';
        if (hits >= 4) {
          e.mode = 'sharpen'; e.sharpenCount = 0;
          e.intent = { type: 'buff', val: 2 };
        } else if (e.mode === 'combo') {
          e.mode = 'sharpen'; e.sharpenCount = 0;
          e.intent = { type: 'multiatk', val: Math.round(e.attack * 0.45), times: 4 };
        } else {
          e.sharpenCount = (e.sharpenCount || 0) + 1;
          if (e.sharpenCount >= 3) { e.mode = 'combo'; e.sharpenCount = 0; e.intent = { type: 'multiatk', val: Math.round(e.attack * 0.45), times: 4 }; }
          else e.intent = { type: 'buff', val: 4 };
        }
        break;
      }
      case 'breaker': {                   // 破盾者：格挡减半，每 3 回合一次无视格挡
        const k = n();
        if (k % 3 === 0) e.intent = { type: 'attack', val: Math.round(e.attack * 1.5), pierceAll: true };
        else if (k % 3 === 2) e.intent = { type: 'defend', val: 12 };
        else e.intent = { type: 'attack', val: e.attack, pierce: 0.5 };
        break;
      }
      case 'commander': {
        const k = n();
        if (e.hp < e.maxHp * 0.3 && !e.healed && !e.charge) { e.healed = true; e.intent = { type: 'heal', val: 60 }; }
        else if (e.charge) e.intent = { type: 'defend', val: 16 };
        else if (k % 4 === 0) e.intent = { type: 'charge', turns: 2, dmg: 62 + Math.floor(Math.random() * 9), slam: 0.10, label: '终末指令' };
        else if (k % 4 === 2) e.intent = { type: 'multiatk', val: Math.round(e.attack * 0.55), times: 2 };
        else e.intent = { type: 'attack', val: e.attack };
        break;
      }
      case 'titan': {                     // 磐石巨灵：高血高力，靠本回合承伤压制攻击
        const k = n();
        e.intent = (k % 4 === 0) ? { type: 'defend', val: 18 } : { type: 'attack', val: e.attack };
        break;
      }
      case 'devourer': {                  // 噬牌者：普通攻击 + 每 4 回合双段啃咬
        const k = n();
        e.intent = (k % 4 === 0) ? { type: 'multiatk', val: Math.round(e.attack * 0.6), times: 2 } : { type: 'attack', val: e.attack };
        break;
      }
      default: {
        const r = Math.random();
        if (r < 0.62) e.intent = { type: 'attack', val: e.attack };
        else if (r < 0.88) e.intent = { type: 'defend', val: 8 };
        else e.intent = { type: 'buff', val: 2 };
      }
    }
    // 双人：撞击按「被击中者自己的生命上限」在命中那一刻结算
    if (e.intent && e.intent.slam) e.intent.slamPct = e.intent.slam;
  }

  // ---------------- 蛊术（单机版 v4.2 迁移） ----------------
  hasAny(id) { return this.players.some(x => this.has(x, id)); }
  isGuCard(c) { return !!(c && (c.school === 'gu' || c.cat === '蛊毒')); }
  guCap(p) { return this.has(p, 'guCurse') ? GU_CURSE_CAP : GU_MAX; }
  poisonBonus(p) { return (this.has(p, 'venomT') ? 2 : 0) + (this.has(p, 'guCurse') ? 2 : 0); }
  enemyPoisonAmt(n, p) {
    const v = Math.max(0, Math.round(n));
    return this.has(p, 'guCurse') ? Math.round(v * 1.5) : v;
  }
  guExecNeed(ratio) {
    const e = this.enemy; if (!e) return Infinity;
    return Math.ceil((e.maxHp || e.hp || 1) * ratio);
  }
  doGuExec(reason, need, p) {
    const e = this.enemy; if (!e || e.hp <= 0) return false;
    const before = e.hp; e.hp = 0;
    this.addLog(`☠☠ ${reason}：毒层 ${e.poison} ≥ 斩杀线 ${need} —— 直接斩杀！${before} → 0`, 'hit', p ? p.seat : null);
    return true;
  }
  checkGuCurseExec(p) {
    const owner = (p && this.has(p, 'guCurse')) ? p : this.players.find(x => this.has(x, 'guCurse'));
    if (!owner) return false;
    const e = this.enemy; if (!e || e.hp <= 0) return false;
    const need = this.guExecNeed(GU_CURSE_PCT);
    if ((e.poison || 0) < need) return false;
    return this.doGuExec('天赋【病入膏肓】', need, owner);
  }
  // 病入膏肓：中毒结算完之后，敌毒 / 全员自毒 / 蛊术一起翻倍，敌人上限跟着涨，斩杀线往前推
  guCurseEscalate() {
    const e = this.enemy;
    if (!this.hasAny('guCurse') || !e || this.phase !== 'combat' || e.hp <= 0) return false;
    if ((e.poison || 0) <= 0 && !this.players.some(x => (x.poison || 0) > 0)) return false;
    const ep = e.poison || 0;
    e.poison = ep * 2;
    for (const p of this.players) {
      p.poison = (p.poison || 0) * 2;
      p.gu = Math.min(this.guCap(p), (p.gu || 0) * 2);
    }
    const maxGu = Math.max(0, ...this.players.map(x => x.gu || 0));
    const add = Math.max(0, Math.floor(maxGu * 0.5));
    if (add > 0) e.maxHp += add;
    this.addLog(`☠ 天赋【病入膏肓】：毒伤结算完毕 —— 敌毒 ${ep}→${e.poison}、全员毒/蛊术 ×2${add > 0 ? `；敌人生命上限 +${add}（斩杀线 ${this.guExecNeed(GU_CURSE_PCT)}）` : ''}`, 'heal');
    this.checkGuCurseExec();
    return true;
  }
  gainGu(n, p) {
    if (!p || !n) return 0;
    const before = p.gu || 0;
    p.gu = Math.min(this.guCap(p), before + Math.max(0, Math.round(n)));
    const got = p.gu - before;
    if (got > 0 && this.has(p, 'guBond') && this.enemy) {
      const q = this.enemyPoisonAmt(Math.floor(got * 0.6) + this.poisonBonus(p), p);
      if (q > 0) {
        this.enemy.poison += q;
        this.addLog(`💠 ${p.name} 天赋【蛊毒·同归】：获得 ${got} 蛊术 → 敌人也沾上 ${q} 层中毒`, 'info', p.seat);
        this.checkGuCurseExec(p);
      }
    }
    return got;
  }
  payGu(n, p) {
    if (!p) return 0;
    const used = Math.min(p.gu || 0, Math.max(0, Math.round(n)));
    p.gu = (p.gu || 0) - used; return used;
  }
  guTemperFromPaid(paid, maxGain, p) {
    if (!p || p.hp <= 0) return 0;
    const capLeft = Math.max(0, MAXHP_CAP_PER_COMBAT - (p.maxHpGainCombat || 0));
    const gain = Math.min(maxGain, capLeft, Math.floor((paid || 0) / GU_TEMPER_COST));
    if (gain <= 0) return 0;
    p.maxHp += gain; p.hp += gain;
    p.maxHpGainCombat = (p.maxHpGainCombat || 0) + gain;
    p.maxHpGain = (p.maxHpGain || 0) + gain;
    p.guTemper = (p.guTemper || 0) + gain;
    return gain;
  }
  guRoundEndHeal() {
    let total = 0;
    for (const p of this.players) {
      if (p.dead || p.hp <= 0) continue;
      const miss = p.maxHp - p.hp;
      if (miss > 0 && (p.gu || 0) > 0) {
        const use = Math.min(p.gu, Math.ceil(miss / GU_HEAL));
        const before = p.hp;
        p.gu -= use; p.hp = Math.min(p.maxHp, p.hp + use * GU_HEAL);
        const got = p.hp - before; total += got;
        if (got > 0) this.addLog(`🐛 蛊术养身：${p.name} 消耗 ${use} 蛊术，回复 ${got} 生命（剩 ${p.gu}）`, 'heal', p.seat);
      }
    }
    return total;
  }
  devourCards(e) {
    if ((e.devoured || 0) >= 5) return;
    const alive = this.players.filter(p => !p.dead && (p.draw.length || p.discard.length));
    if (!alive.length) return;
    const p = alive[Math.floor(Math.random() * alive.length)];
    const pile = p.draw.length ? p.draw : p.discard;
    const c = pile.splice(Math.floor(Math.random() * pile.length), 1)[0];
    e.devoured = (e.devoured || 0) + 1; e.attack += 1;
    this.addLog(`🕷 【噬牌者】吞掉了 ${p.name} 牌堆里的【${c.name}】——本场不再回来（已吞 ${e.devoured}/5，攻击力 ${e.attack}）`, 'hit', p.seat);
  }

  // ---------------- 伤害 / 生命 ----------------
  dealToEnemy(raw, p) {
    const e = this.enemy;
    if (!e || e.hp <= 0) return 0;
    let dmg = raw + (p ? p.strength : 0);
    if (e.vuln > 0) dmg = Math.floor(dmg * 1.5);
    if (e.armor > 0) dmg = Math.max(1, dmg - e.armor);
    let blocked = 0;
    if (e.block > 0) { blocked = Math.min(e.block, dmg); dmg -= blocked; e.block -= blocked; }
    e.hp = Math.max(0, e.hp - dmg);
    e.hitsThisTurn = (e.hitsThisTurn || 0) + 1;
    e.dmgTakenThisTurn = (e.dmgTakenThisTurn || 0) + dmg;
    if (blocked > 0) this.addLog(`敌人格挡吸收了 ${blocked} 点伤害（剩余 ${e.block}）`, 'info', p ? p.seat : null);
    return dmg;
  }

  tickPoison(consume) {
    const e = this.enemy;
    if (!e || e.hp <= 0 || e.poison <= 0) return 0;
    if (this.hasAny('guCurse')) { this.checkGuCurseExec(); return 0; }
    const d = e.poison;
    e.hp = Math.max(0, e.hp - d);
    e.dmgTakenThisTurn = (e.dmgTakenThisTurn || 0) + d;
    if (consume) e.poison--;
    this.addLog(`☠ 敌人中毒结算：失去 ${d} 生命`, 'heal');
    this.checkGuCurseExec();
    return d;
  }

  losePlayerHp(n, label, p, opts) {
    if (this.phase === 'end' || !p) return 0;
    n = Math.max(0, Math.round(n || 0));
    if (!n || p.hp <= 0) return 0;
    const before = p.hp;
    p.hp = Math.max(0, p.hp - n);
    const lost = before - p.hp;
    if (lost <= 0) return 0;
    p.hpPaid = (p.hpPaid || 0) + lost;
    p.paidTurn = (p.paidTurn || 0) + lost;
    if (opts && opts.self) p.selfPaid = (p.selfPaid || 0) + lost;
    this.bloodTalents(lost, label || '失血', p);
    this.checkLastStand(p);
    if (p.hp <= 0) this.onPlayerDown(p);
    return lost;
  }

  bloodTalents(lost, label, p) {
    const bs = [], miss = Math.max(0, p.maxHp - p.hp);
    if (this.has(p, 'bloodBurst') && (p.bloodBurstUsed || 0) < 4) {
      p.bloodBurstUsed = (p.bloodBurstUsed || 0) + 1;
      const d = this.dealToEnemy(Math.max(2, Math.floor(miss * 0.10)), p);
      bs.push(`血怒 ${d} 伤`);
    }
    if (this.has(p, 'bloodMight') && (p.bloodMightUsed || 0) < 3) {
      p.bloodMightUsed = (p.bloodMightUsed || 0) + 1; p.strength += 1;
      bs.push(`血勇 +1 力量（${p.bloodMightUsed}/3）`);
    }
    if (this.has(p, 'bloodWard') && (p.bloodWardUsed || 0) < 6) {
      p.bloodWardUsed = (p.bloodWardUsed || 0) + 1; p.block += 3;
      bs.push(`血盾 +3 格挡（${p.bloodWardUsed}/6）`);
    }
    if (this.has(p, 'bloodGold') && (p.bloodGoldUsed || 0) < 3) {
      p.bloodGoldUsed = (p.bloodGoldUsed || 0) + 1; p.gold += 5;
      bs.push(`血金 +5 金币（${p.bloodGoldUsed}/3）`);
    }
    if (this.has(p, 'bloodFlow') && (p.bloodFlowUsed || 0) < 2) {
      p.bloodFlowUsed = (p.bloodFlowUsed || 0) + 1; p.energy += 1;
      bs.push(`血行 +1 能量（${p.bloodFlowUsed}/2）`);
    }
    if (this.has(p, 'bloodRes') && (p.bloodResUsed || 0) < 4) {
      p.bloodResUsed = (p.bloodResUsed || 0) + 1;
      const heal = Math.max(1, Math.floor(miss * 0.15));
      const b = p.hp; p.hp = Math.min(p.maxHp, p.hp + heal);
      if (p.hp > b) bs.push(`血之回响 +${p.hp - b} 生命（${p.bloodResUsed}/4）`);
    }
    if (bs.length) this.addLog(`🩸 ${p.name} ${label} → 自残联动：${bs.join('、')}`, 'info', p.seat);
  }

  checkLastStand(p) {
    if (!this.has(p, 'lastStand') || this.phase !== 'combat' || p.hp <= 0) return;
    const ratio = p.hp / p.maxHp;
    if (ratio >= 0.30) { p.lastStandArmed = false; return; }
    if ((p.lastStandUsed || 0) >= 1 && ratio <= 0.15) {
      const i = p.talents.indexOf('lastStand');
      if (i >= 0) p.talents.splice(i, 1);
      p.lastStandUsed = 0; p.lastStandArmed = false;
      this.addLog(`💔 ${p.name} 的天赋【临危受命】破碎`, 'hit', p.seat);
      return;
    }
    if (!p.lastStandArmed) {
      const c = mk('last_stand'); c.temp = true; c.cost = 0;
      if (p.hand.length < 12) p.hand.push(c); else p.discard.push(c);
      p.lastStandArmed = true; p.lastStandUsed = (p.lastStandUsed || 0) + 1;
      this.addLog(`🩸 ${p.name} 天赋【临危受命】：获得转瞬牌【临危受命】`, 'hit', p.seat);
    }
  }

  onPlayerDown(p) {
    if (p.dead) return;
    p.dead = true; p.canAct = false; p.ready = true;
    this.addLog(`☠️ ${p.name} 倒下了（下一层会以 40% 生命归队）`, 'hit', p.seat);
    if (this.players.every(x => x.dead)) { this.over = 'lose'; this.endGame(false); }
  }

  // ---------------- 临时牌 / 整备 ----------------
  grantTempCard(id, reason, p, silent) {
    if (!POOL[id]) return null;
    if (p.hand.length >= 12) { this.addLog(`✨ ${reason}：${p.name} 手牌已满（12）`, 'info', p.seat); return null; }
    if ((p.tempGen || 0) >= TEMP_GEN_PER_TURN) return null;
    const c = mk(id); c.temp = true; c.cost = 0;
    p.hand.push(c); p.tempGen = (p.tempGen || 0) + 1;
    if (!silent) this.addLog(`✨ ${reason}：${p.name} 获得转瞬牌【${c.name}】`, 'info', p.seat);
    return c;
  }
  grantRandomTemp(reason, p, silent) {
    const ids = TEMP_POOL.filter(id => POOL[id]);
    if (!ids.length) return null;
    return this.grantTempCard(ids[Math.floor(Math.random() * ids.length)], reason, p, silent);
  }
  grantTempCopy(reason, p, silent) {
    const last = p.playedList[p.playedList.length - 1];
    if (!last) return null;
    return this.grantTempCard(last.id, `${reason}·复制【${last.name}】`, p, silent);
  }
  randomTempCard(kind, p) {
    let ids = SHOP_POOL.filter(id => POOL[id]);
    if (kind) ids = ids.filter(id => POOL[id].kind === kind);
    if (!ids.length) ids = ['strike'];
    const id = ids[Math.floor(Math.random() * ids.length)];
    if (p.hand.length >= 12) return null;
    const c = mk(id); c.temp = true; c.cost = 0; p.hand.push(c);
    this.addLog(`✨ ${p.name} 获得临时牌【${c.name}】（转瞬）`, 'info', p.seat);
    return c;
  }
  grantSetupCard(id, reason, p) {
    if (!POOL[id]) return null;
    if (p.hand.length >= 12) return null;
    const c = mk(id); c.temp = true; c.cost = 0; p.hand.push(c);
    this.addLog(`🎴 ${reason}：${p.name} 获得整备牌【${c.name}】（0 费转瞬）`, 'info', p.seat);
    return c;
  }
  grantRandomSetup(reason, p) {
    const pool = SETUP_POOL.filter(id => id !== 'all_ready');
    if (!pool.length) return null;
    return this.grantSetupCard(pool[Math.floor(Math.random() * pool.length)], reason, p);
  }
  onSetupRemoved(s, p) {
    if (!this.has(p, 'setupSalvage')) return;
    p.block += 8; p.gold += 5;
    this.addLog(`💠 ${p.name} 天赋【整备·拆解】：+8 格挡、+5 金币`, 'heal', p.seat);
  }
  retireSetup(s, reason, p) {
    const i = p.setupCards.indexOf(s);
    if (i < 0) return 0;
    p.setupCards.splice(i, 1);
    const f = s.fx || {};
    let gain = 5 + (f.block || 0) + Math.floor((f.dmg || 0) / 2) + (f.poison || 0) * 2 + (f.heal || 0);
    gain = Math.max(4, Math.min(28, gain));
    p.block += gain;
    this.addLog(`♻️ ${reason}：${p.name} 卸下【${s.name}】，化为 ${gain} 点格挡`, 'heal', p.seat);
    this.onSetupRemoved(s, p);
    return gain;
  }
  removeRandomSetup(reason, p) {
    if (!p.setupCards.length) return null;
    const i = Math.floor(Math.random() * p.setupCards.length);
    const s = p.setupCards.splice(i, 1)[0];
    this.addLog(`💥 ${reason}：${p.name} 的整备【${s.name}】被移除`, 'hit', p.seat);
    this.onSetupRemoved(s, p);
    return s;
  }
  placeSetup(s, p) {
    p.setupSeq = (p.setupSeq || 0) + 1; s.seq = p.setupSeq;
    p.setupCards.push(s);
    return s;
  }
  oldestSetup(p) {
    let best = null;
    for (const s of (p.setupCards || [])) if (!best || (s.seq || 0) < (best.seq || 0)) best = s;
    return best;
  }
  fireSetupCard(s, label, p) {
    this.applyFx(s.fx, label, p);
    p.setupTrig = (p.setupTrig || 0) + 1;
    const sid = s.id;
    if (sid) p.setupSeen[sid] = (p.setupSeen[sid] || 0) + 1;
    const ar = p.setupCards.find(x => x.id === 'all_ready');
    if (ar) {
      const every = ar.setupEvery || 3;
      if (p.setupTrig % every === 0 && (p.allReadyGiven || 0) < ALL_READY_PER_TURN) {
        if (this.grantRandomSetup('万事俱备', p)) p.allReadyGiven = (p.allReadyGiven || 0) + 1;
      }
    }
    if (this.has(p, 'deepLearn') && sid && (p.setupSeen[sid] || 0) >= 5 && !p.setupLearned[sid]) {
      p.setupLearned[sid] = 1;
      this.grantSetupCard(sid, '深度学习', p);
    }
    if (this.has(p, 'setupCycle') && p.setupTrig % 6 === 0) {
      this.drawCards(1, p);
      this.addLog(`💠 ${p.name} 天赋【整备·轮回】：累计触发 ${p.setupTrig} 次 → 抽 1 张牌`, 'info', p.seat);
    }
    if (this.has(p, 'setupAegis') && (p.setupAegisUsed || 0) < 8) {
      p.setupAegisUsed = (p.setupAegisUsed || 0) + 1; p.block += 2;
      this.addLog(`💠 ${p.name} 天赋【整备·铁壁】：+2 格挡（${p.setupAegisUsed}/8）`, 'heal', p.seat);
    }
    if (this.has(p, 'setupLink') && (p.setupLinkUsed || 0) < 3 && applyDepth < CHAIN_MAX && Math.random() < 0.25) {
      const others = p.setupCards.filter(x => x !== s);
      if (others.length) {
        const t = others[Math.floor(Math.random() * others.length)];
        p.setupLinkUsed = (p.setupLinkUsed || 0) + 1;
        this.addLog(`💠 ${p.name} 天赋【整备·连动】：【${s.name}】→ 额外触发【${t.name}】`, 'info', p.seat);
        applyDepth++; this.fireSetupCard(t, `🔗 连动【${t.name}】`, p); applyDepth--;
      }
    }
  }
  fireRandomSetups(n, safe, label, p) {
    let pool = p.setupCards.filter(s => !(safe && s.fx && s.fx.randomEntry));
    if (!pool.length) return 0;
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      if (applyDepth >= CHAIN_MAX) { p.chainCapped = true; break; }
      pool = pool.filter(s => p.setupCards.includes(s));
      if (!pool.length) break;
      const s = pool[Math.floor(Math.random() * pool.length)];
      applyDepth++; this.fireSetupCard(s, `${label}【${s.name}】`, p); applyDepth--;
      cnt++;
    }
    return cnt;
  }

  // ---------------- 通用效果结算 ----------------
  applyFx(fx, label, p) {
    const slot = this.logOpen(label, '', p.seat);
    let parts = [];
    fxDepth++;
    try { parts = this.applyFxBody(fx, label, p) || []; } finally { fxDepth--; }
    if (parts.length) this.logClose(slot, `${label}：${parts.join('，')}`, fx.dmg ? 'hit' : (fx.heal ? 'heal' : (fx.gold ? 'gold' : 'info')));
    else this.logClose(slot, '');
    return parts;
  }

  applyFxBody(fx, label, p) {
    const e = this.enemy, parts = [];
    if (fx.dmg) { const d = this.dealToEnemy(fx.dmg, p); parts.push(`造成 ${d} 点伤害`); }
    if (fx.dmgMissing) {
      const miss = Math.max(0, p.maxHp - p.hp);
      const extra = Math.max(fx.dmgMin || 1, Math.floor(miss * fx.dmgMissing));
      const d = this.dealToEnemy(extra, p); parts.push(`按已损失生命追加 ${d} 点伤害`);
    }
    if (fx.bloodPaid) {
      const paid = (p.paidTurn || 0) + (p.paidLast || 0);
      const extra = Math.min(fx.bloodPaidCap || 25, Math.max(fx.bloodPaidMin || 1, Math.floor(paid * (fx.bloodPaid || 1))));
      const d = this.dealToEnemy(extra, p); parts.push(`按失血(${paid})追加 ${d} 点伤害`);
    }
    if (fx.block) { p.block += fx.block; parts.push(`获得 ${fx.block} 点格挡`); }
    if (fx.blockPlayed) { const pv = (p.playedThisTurn || 0) + 1; p.block += pv; parts.push(`获得 ${pv} 点格挡（等同本回合打出牌数）`); }
    // 蛊·续命：先支付蛊术，heal 按实际支付比例折算；血满则把药钱炼成生命上限
    let guCostRatio = 1, guPaid = 0;
    if (fx.guCost) {
      guPaid = this.payGu(fx.guCost, p);
      guCostRatio = guPaid / Math.max(1, fx.guCost);
      parts.push(guPaid >= fx.guCost ? `消耗 ${guPaid} 点蛊术` : `蛊术不足：只支付了 ${guPaid}/${fx.guCost} 点`);
    }
    if (fx.heal) {
      const amt = Math.max(1, Math.round(fx.heal * guCostRatio));
      if (guPaid > 0 && p.hp >= p.maxHp) {
        const gain = this.guTemperFromPaid(guPaid, 3, p);
        parts.push(gain > 0 ? `血量已满，${guPaid} 点蛊术化入血肉 → 生命上限 +${gain}` : '血量已满，蛊术不足以再炼体');
      } else {
        const b = p.hp; p.hp = Math.min(p.maxHp, p.hp + amt); parts.push(`恢复 ${p.hp - b} 生命`);
      }
    }
    if (fx.draw || fx.drawIfPaid) {
      const extra = (fx.drawIfPaid && (p.paidTurn || 0) > 0) ? fx.drawIfPaid : 0;
      const n = (fx.draw || 0) + extra;
      if (n) { this.drawCards(n, p); parts.push(`抽 ${n} 张牌${extra ? '（本回合已失血 +' + extra + '）' : ''}`); }
    }
    if (fx.gold) { p.gold += fx.gold; parts.push(`获得 ${fx.gold} 金币`); }
    if (fx.poison) { const n = this.enemyPoisonAmt(fx.poison + this.poisonBonus(p), p); e.poison += n; parts.push(`施加 ${n} 层中毒${this.has(p, 'guCurse') ? '（病入膏肓 ×1.5）' : ''}`); }
    // ---- 蛊毒：新的效果字段（guCost 定义在前，供 heal 按比例折算） ----
    if (fx.poisonE) { const n = this.enemyPoisonAmt(fx.poisonE + this.poisonBonus(p), p); e.poison += n; parts.push(`敌人 +${n} 层中毒`); }
    if (fx.poisonSelf) { p.poison = (p.poison || 0) + fx.poisonSelf; parts.push(`你 +${fx.poisonSelf} 层中毒`); }
    if (fx.poisonCut) { const cut = Math.min(e.poison || 0, fx.poisonCut); e.poison -= cut; parts.push(cut ? `敌人中毒 -${cut} 层` : '敌人身上没有中毒可减'); }
    if (fx.poisonCutSelf) { const cut = Math.min(p.poison || 0, fx.poisonCutSelf); p.poison -= cut; parts.push(cut ? `你身上的毒 -${cut} 层` : '你身上没有中毒可减'); }
    if (fx.gu) {
      const got = this.gainGu(fx.gu, p);
      parts.push(got <= 0 ? `蛊术已满（${this.guCap(p)}）` : (got < fx.gu ? `获得 ${got} 点蛊术（上限 ${this.guCap(p)}）` : `获得 ${got} 点蛊术`));
    }
    if (fx.guConvert) {
      const base = (p.poison || 0) + Math.floor(p.gu || 0);
      const x = Math.floor(base * fx.guConvert / 100);
      if (x <= 0) parts.push('身上的毒与蛊术太少，转不出东西');
      else {
        const own = p.poison || 0, cut = Math.min(own, x);
        p.poison = Math.max(0, own - x); e.poison = (e.poison || 0) + x;
        parts.push(`转化 ${x} 层：敌人中毒 +${x}（现有 ${e.poison}），自毒 -${cut}（剩 ${p.poison}）`);
      }
    }
    if (fx.guRot) {
      const po = e.poison || 0;
      if (po <= 0) parts.push('敌人身上没有中毒，溃烂无从下手');
      else { const d = this.dealToEnemy(Math.max(1, Math.floor(po * fx.guRot / 100)), p); parts.push(`按 ${po} 层中毒溃烂 → 造成 ${d} 点伤害（层数不减）`); }
    }
    if (fx.guDoom) {
      const before = e.poison || 0;
      if (before <= 0) parts.push('敌人身上没有中毒，催不动');
      else { const add = Math.floor(before * fx.guDoom / 100); e.poison = before + add; parts.push(`敌人中毒 ${before} → ${e.poison}（+${add}）`); }
    }
    if (fx.guShift) {
      const half = Math.floor((p.poison || 0) / 2);
      if (half > 0) {
        p.poison -= half; e.poison += half;
        const g = Math.floor(half / 2);
        parts.push(`把 ${half} 层中毒转移给敌人（你剩 ${p.poison}）`);
        if (g > 0) parts.push(`获得 ${this.gainGu(g, p)} 点蛊术`);
      } else parts.push('你身上没有可转移的中毒');
    }
    if (fx.poisonTick) { let tot = 0; for (let i = 0; i < fx.poisonTick; i++) tot += this.tickPoison(false); parts.push(`引爆中毒伤害 ${tot}`); }
    if (fx.random) { for (let i = 0; i < fx.random; i++) this.randomTempCard(null, p); parts.push(`获得 ${fx.random} 张随机临时牌`); }
    if (fx.temp) {
      const tc = this.grantRandomTemp('开团·牌源', p, true);
      parts.push(tc ? `获得转瞬牌【${tc.name}】` : (p.hand.length >= 12 ? '手牌已满' : `转瞬牌已达本回合上限`));
    }
    if (fx.tempCopy) {
      const tc = this.grantTempCopy('开团·回响', p, true);
      parts.push(tc ? `获得转瞬版【${tc.name}】` : '没有可复制的上一张牌');
    }
    if (fx.energy) { p.energy += fx.energy; parts.push(`获得 ${fx.energy} 点能量`); }
    if (fx.randomEntry) {
      const n = fx.randomEntry;
      if (applyDepth >= CHAIN_MAX) parts.push('联动链已到上限');
      else if (p.entries.length) {
        let cnt = 0; applyDepth++;
        for (let i = 0; i < n; i++) { const en = p.entries[Math.floor(Math.random() * p.entries.length)]; this.applyFx(en.fx, `🔀 随机登场【${en.name}】`, p); cnt++; }
        applyDepth--; parts.push(`随机触发了 ${cnt} 个登场效果`);
      } else parts.push('没有已登记的登场效果');
    }
    if (fx.loseBlock) {
      const lost = Math.min(p.block, fx.loseBlock); p.block -= lost;
      parts.push(`失去 ${lost} 点格挡${lost < fx.loseBlock ? '（格挡不足）' : ''}`);
    }
    if (fx.randomSetup) {
      p.chainCapped = false;
      const cnt = this.fireRandomSetups(fx.randomSetup, !!fx.safeSetup, '🔀 随机整备', p);
      parts.push(cnt ? `随机触发了 ${cnt} 个整备效果${p.chainCapped ? '（联动链已到上限）' : ''}` : (p.chainCapped ? '联动链已到上限' : '没有可触发的整备'));
      p.chainCapped = false;
    }
    if (fx.fireAll) {
      const list = [...p.setupCards];
      let cnt = 0;
      for (const s of list) {
        if (!p.setupCards.includes(s)) continue;
        if (applyDepth >= CHAIN_MAX) { p.chainCapped = true; break; }
        applyDepth++; this.fireSetupCard(s, `🌪 东风【${s.name}】`, p); applyDepth--; cnt++;
        if (e.hp <= 0 || p.hp <= 0) break;
      }
      parts.push(cnt ? `引爆了 ${cnt} 个整备` : '身上没有整备');
      const per = fx.removePer || 4, cut = Math.floor(cnt / per);
      if (cut) {
        let removed = 0;
        for (let i = 0; i < cut; i++) { if (this.removeRandomSetup('只欠东风·损耗', p)) removed++; else break; }
        parts.push(`每 ${per} 个损耗 1 个 → 失去 ${removed} 个整备`);
      }
    }
    if (fx.removeSetup) {
      let removed = 0;
      for (let i = 0; i < fx.removeSetup; i++) { if (this.removeRandomSetup(label || '代价', p)) removed++; else break; }
      parts.push(removed ? `随机失去 ${removed} 个整备` : '身上没有整备可失去');
    }
    if (fx.blockSetup) {
      const per = fx.blockSetup.per || 4, cap = fx.blockSetup.cap || 99;
      const lost = p.block; p.block = 0;
      const times = Math.min(cap, Math.floor(lost / per));
      if (times > 0) { const cnt = this.fireRandomSetups(times, false, '🔀 格挡转化', p); parts.push(`消耗 ${lost} 点格挡 → 触发 ${cnt} 个整备`); }
      else parts.push(`消耗 ${lost} 点格挡，不足 ${per} 点，没能触发整备`);
    }
    if (fx.spring) { const got = this.doSpring(fx.spring, p); parts.push(`召回 ${got} 张牌为转瞬`); }
    if (fx.vuln) { e.vuln += fx.vuln; parts.push(`施加 ${fx.vuln} 层易伤`); }
    if (fx.strength) { p.strength += fx.strength; parts.push(`永久+${fx.strength} 力量`); }
    if (fx.selfDmg) { const lost = this.losePlayerHp(fx.selfDmg, label || '自损', p, { self: true }); parts.push(`自身失去 ${lost} 生命`); }
    if (fx.selfDmgPct) {
      const pct = Math.max(0.01, Math.min(0.5, fx.selfDmgPct));
      const cost = Math.max(fx.selfDmgPctMin || 1, Math.floor(p.maxHp * pct));
      const lost = this.losePlayerHp(cost, label || '自损', p, { self: true });
      parts.push(`失去生命上限 ${Math.round(pct * 100)}% 的生命（${lost} 点）`);
    }
    if (fx.maxHp) {
      const cap = Math.max(0, MAXHP_CAP_PER_COMBAT - (p.maxHpGainCombat || 0));
      const add = Math.min(fx.maxHp, cap);
      if (add > 0) {
        p.maxHp += add; p.maxHpGainCombat = (p.maxHpGainCombat || 0) + add; p.maxHpGain = (p.maxHpGain || 0) + add;
        parts.push(`生命上限 +${add}（本场 ${p.maxHpGainCombat}/${MAXHP_CAP_PER_COMBAT}）`);
      }
    }
    if (fx.maxHpCost) {
      const floor = 10;
      const cut = Math.min(fx.maxHpCost, Math.max(0, p.maxHp - floor));
      if (cut > 0) {
        p.maxHp -= cut; p.maxHpGain = (p.maxHpGain || 0) - cut;
        if (p.hp > p.maxHp) { p.hp = p.maxHp; parts.push(`生命上限 -${cut}，当前生命压到 ${p.hp}`); }
        else parts.push(`生命上限 -${cut}`);
      } else parts.push('生命上限已到底');
    }
    // 溃烂 / 催命 / 病入膏肓：斩杀判定统一放在效果结算末尾
    if (fx.guRot || fx.guDoom || fx.guConvert) {
      const need = e.hp;
      if (fx.guRot && (e.poison || 0) >= need && need > 0) this.doGuExec('蛊·溃烂', need, p);
      if (fx.guDoom && (e.poison || 0) >= need && need > 0) this.doGuExec('蛊·催命', need, p);
      this.checkGuCurseExec(p);
    }
    return parts;
  }

  // ---------------- 牌的费用 / 联动 ----------------
  springCount(p) { return p ? (p.springThisTurn || 0) : 0; }
  cardCost(c, p) {
    if (c.dynCost) return this.springCount(p);
    if (c.bloodCut && p && (p.paidLast || 0) > 0) return Math.max(c.minCost ?? 0, c.cost - 1);
    return c.cost;
  }
  chainCost(c, p) {
    const base = this.cardCost(c, p);
    if (c.dynCost) return base;
    return p.openNext ? Math.max(0, base - 1) : base;
  }
  scaleStacks(c, p) {
    if (!c.scale) return 0;
    return Math.floor((p.playedThisTurn || 0) / (c.scale.per || 1));
  }
  scaledFx(c, p) {
    if (!c.scale) return c.fx;
    const st = this.scaleStacks(c, p);
    if (st <= 0) return c.fx;
    const fx = { ...c.fx };
    for (const k of Object.keys(c.scale)) {
      if (k === 'per' || k === 'cap') continue;
      const add = Math.min(c.scale.cap ?? Infinity, c.scale[k] * st);
      fx[k] = (fx[k] || 0) + add;
    }
    return fx;
  }
  doSpring(bonus, p) {
    const x = p.springThisTurn || 0;
    const plus = Math.max(1, bonus || 1) + (this.has(p, 'springEcho') ? 1 : 0);
    const pool = p.playedList.filter(c => c.id !== 'spring');
    if (!pool.length) { this.addLog('🌸 春秋蝉鸣：本回合还没打出过别的牌，无牌可召回', 'info', p.seat); return 0; }
    const picks = pool.slice(0, x + plus);
    let got = 0, blocked = 0;
    picks.forEach(c => {
      if (p.hand.length >= 12) { blocked++; return; }
      p.hand.push({ ...c, uid: C.nextUid(), temp: true, cost: 0 });
      got++;
    });
    this.addLog(`🌸 春秋蝉鸣 X=${x}：${p.name} 召回 ${got} 张为转瞬`, 'info', p.seat);
    if (blocked) this.addLog(`⚠ ${p.name} 手牌上限 12，另有 ${blocked} 张没能召回`, 'info', p.seat);
    return got;
  }
  drawCards(n, p) {
    for (let i = 0; i < n; i++) {
      if (p.draw.length === 0) {
        if (p.discard.length === 0) break;
        p.draw = shuffle(p.discard); p.discard = [];
        this.addLog(`♻ ${p.name} 抽牌堆已空，弃牌堆洗回`, 'info', p.seat);
      }
      p.hand.push(p.draw.pop());
    }
  }
  condMet(cond, p) {
    if (!cond) return true;
    const e = this.enemy; let ok = true;
    if (cond.intentHarm) ok = ok && !!(e && e.intent && INTENT_HARM[e.intent.type]);
    if (cond.needSetup) ok = ok && !!(p.setupCards && p.setupCards.length);
    return ok;
  }
  condText(cond) {
    const a = [];
    if (cond && cond.intentHarm) a.push('敌人本回合进攻');
    if (cond && cond.needSetup) a.push('身上至少 1 个整备');
    return a.length ? '⛔ 条件：' + a.join(' + ') : '';
  }

  // ---------------- 出牌 ----------------
  playCard(uid, p) {
    if (this.phase !== 'combat' || !p.canAct || p.dead) return { error: '现在不能出牌' };
    const idx = p.hand.findIndex(c => c.uid === uid);
    if (idx < 0) return { error: '找不到这张牌' };
    if ((p.turnCards || 0) >= TURN_CARD_CAP) return { error: `本回合出牌已达上限（${TURN_CARD_CAP} 张）` };
    const c = p.hand[idx];
    if (c.cond && !this.condMet(c.cond, p)) return { error: `时机不对——${this.condText(c.cond)}` };
    const cost = this.chainCost(c, p);
    if (cost > p.energy) return { error: `⚡ 能量不足：需要 ${cost}，只剩 ${p.energy}` };

    const e = this.enemy;
    p.energy -= cost; p.hand.splice(idx, 1);
    if (c.bloodCut && (p.paidLast || 0) > 0) this.addLog(`🩸 血债血偿：${p.name} 上回合失血 → 费用 -1`, 'info', p.seat);
    const cfx = this.scaledFx(c, p);
    const stN = c.scale ? this.scaleStacks(c, p) : 0;
    if (stN > 0) this.addLog(`🔗 牌数联动：【${c.name}】强化 ${stN} 段`, 'info', p.seat);

    const isFirstCard = (p.combatCards || 0) === 0;
    const firstAsOpen = isFirstCard && this.has(p, 'firstOpen');
    const firstStrikeBonus = (isFirstCard && this.has(p, 'firstStrike') && c.fx && c.fx.dmg) ? 8 : 0;
    if (firstAsOpen) this.addLog(`💠 ${p.name} 天赋【首发开团】：第一张牌视为开团牌`, 'info', p.seat);
    if (firstStrikeBonus) this.addLog(`💠 ${p.name} 天赋【首击】：额外 ${firstStrikeBonus} 点伤害`, 'hit', p.seat);

    let endedByDown = false;
    const downBonus = (p.downNextTurn !== undefined && this.turnNo === p.downNextTurn);
    if (downBonus) delete p.downNextTurn;

    if (c.kind === 'setup') {
      if (p.setupCards.length >= MAX_SETUP) {
        const old = this.oldestSetup(p);
        if (old) this.retireSetup(old, `整备槽已满 ${MAX_SETUP}`, p);
      }
      this.placeSetup({ ...c, fx: cfx }, p);
      this.addLog(`⚡ ${p.name} 布置能力牌【${c.name}】：此后每回合开始触发`, 'info', p.seat);
      if (this.has(p, 'setupLevy')) { p.gold += 10; this.addLog(`💠 ${p.name} 天赋【整备·征粮】：+10 金币`, 'gold', p.seat); }
      if (this.has(p, 'setupMight')) { p.strength += 1; this.addLog(`💠 ${p.name} 天赋【整备·军威】：永久 +1 力量`, 'info', p.seat); }
    } else if (c.kind === 'entry') {
      this.registerEntry({ ...c, fx: cfx }, p);
      this.addLog(`🔥 ${p.name} 登场【${c.name}】：效果已登记（共 ${p.entries.length} 个）`, 'hit', p.seat);
      if (this.has(p, 'entryMight')) { p.strength += 1; this.addLog(`💠 ${p.name} 天赋【登场·威压】：永久 +1 力量`, 'info', p.seat); }
      this.triggerAllEntries(p);
      if (!p.entryDone) {
        p.entryDone = true;
        this.addLog(`✨ 初登场：【${c.name}】额外发动 1 次`, 'hit', p.seat);
        this.triggerAllEntries(p);
      }
    } else if (c.kind === 'down') {
      this.applyFx(cfx, `🌙 下场【${c.name}】`, p);
      p.discard.push(c);
      p.downNextTurn = this.turnNo + 1;
      endedByDown = true;
      this.addLog(`🌙 ${p.name} 下场【${c.name}】：本回合结束，下回合首牌额外触发 1 次登场`, 'info', p.seat);
    } else {
      const eff = firstStrikeBonus ? { ...cfx, dmg: cfx.dmg + firstStrikeBonus } : cfx;
      this.applyFx(eff, `${p.name} 打出【${c.name}】`, p);
      if (c.temp) this.addLog(`💨 临时牌【${c.name}】用完即散`, 'info', p.seat);
      else if (c.burn) this.addLog(`🔥 焚：【${c.name}】本场不再回到牌组`, 'info', p.seat);
      else if (c.id === 'spring') {
        if (!p.draw.some(x => x.id === 'spring')) p.draw.push(c); else p.discard.push(c);
      } else p.discard.push(c);
      if (isFirstCard && this.has(p, 'firstEntry') && !c.temp) {
        p.entries.push({ name: c.name, id: c.id, fx: cfx });
        this.addLog(`💠 ${p.name} 天赋【首发登场】：第一张牌已登记为登场`, 'info', p.seat);
      }
    }

    if (downBonus) {
      if (p.entries.length) {
        this.addLog(`🌙 下场余韵：${p.name} 额外触发 1 次登场`, 'info', p.seat);
        this.triggerAllEntries(p);
      }
    }

    // 蛊毒流派底层规则：每打出 1 张蛊毒牌 → +1 蛊术（蛊术精进再 +1），敌人按当前毒层 10% 继续叠毒
    if (this.isGuCard(c)) {
      let got = this.gainGu(1, p);
      if (this.has(p, 'guT')) got += this.gainGu(1, p);
      const beforePo = e.poison || 0;
      const amp = Math.max(1, Math.floor(beforePo * GU_POISON_PCT));
      e.poison = beforePo + amp;
      this.addLog(`🐛 蛊毒牌【${c.name}】：+${got} 蛊术（${p.gu}/${this.guCap(p)}）· 敌人中毒 +${amp}（${beforePo} → ${e.poison}）`, 'info', p.seat);
      this.checkGuCurseExec(p);
    }
    if (!c.burn) p.playedList.push(c);
    p.turnCards = (p.turnCards || 0) + 1;
    p.combatCards = (p.combatCards || 0) + 1;
    this.combatCards++;

    // BOSS 战意：两人合计每 N 张牌 +力量
    if (e.rageEvery && e.rageGain && this.combatCards > 0 && this.combatCards % e.rageEvery === 0) {
      e.strength = (e.strength || 0) + e.rageGain;
      this.addLog(`😡 【${e.name}】战意高涨：你们已打出 ${this.combatCards} 张牌，它永久 +${e.rageGain} 力量`, 'hit');
    }

    // 连锁计数
    const prevOpen = !!p.openNext;
    const realOpen = c.kind === 'open';
    const isTemp = !!c.temp;
    const isOpen = realOpen || prevOpen || firstAsOpen;
    const tempChain = isTemp && prevOpen;
    const chained = (realOpen && !isTemp && (prevOpen || firstAsOpen)) || tempChain;
    const step = chained ? 4 : (isOpen ? 2 : 1);
    p.playedThisTurn = (p.playedThisTurn || 0) + step;
    if (isTemp || realOpen) p.springThisTurn = (p.springThisTurn || 0) + 1;
    if (chained && !firstAsOpen && !tempChain) this.addLog(`⛓ 开团连锁：【${c.name}】按 4 张计入连锁`, 'info', p.seat);
    if (tempChain && realOpen) this.grantRandomTemp('⚔ 余韵·转瞬开团', p, true);
    p.openNext = (realOpen && !isTemp) || firstAsOpen;
    if (c.id === 'spring') { p.springThisTurn = 0; this.addLog('🌸 春秋蝉鸣：X 已归零', 'info', p.seat); }

    // 转瞬天赋
    if (isTemp) p.tempPlayed = (p.tempPlayed || 0) + 1;
    if (realOpen && !isTemp) p.openCountTurn = (p.openCountTurn || 0) + 1;
    if (isTemp) {
      if (this.has(p, 'tempWard') && (p.tempWardUsed || 0) < 4) { p.tempWardUsed = (p.tempWardUsed || 0) + 1; p.block += 4; this.addLog(`💠 ${p.name}【转瞬·护幕】：+4 格挡`, 'heal', p.seat); }
      if (this.has(p, 'tempGold') && (p.tempGoldUsed || 0) < 4) { p.tempGoldUsed = (p.tempGoldUsed || 0) + 1; p.gold += 3; this.addLog(`💠 ${p.name}【转瞬·拾遗】：+3 金币`, 'gold', p.seat); }
      if (this.has(p, 'tempOpen') && (p.tempPlayed % 2 === 0) && (p.tempOpenUsed || 0) < 3 && !p.openNext) { p.tempOpenUsed = (p.tempOpenUsed || 0) + 1; p.openNext = true; this.addLog(`💠 ${p.name}【转瞬·余韵】：挂上开团余韵`, 'info', p.seat); }
      if (this.has(p, 'tempDraw') && (p.tempPlayed % 3 === 0) && (p.tempDrawUsed || 0) < 2) { p.tempDrawUsed = (p.tempDrawUsed || 0) + 1; this.drawCards(1, p); this.addLog(`💠 ${p.name}【转瞬·流转】：抽 1 张牌`, 'info', p.seat); }
    }
    if (realOpen && !isTemp && this.has(p, 'openEcho') && (p.openCountTurn || 0) % 3 === 0 && (p.openEchoUsed || 0) < 2) {
      p.openEchoUsed = (p.openEchoUsed || 0) + 1;
      this.grantRandomTemp('💠 开团·回响', p);
    }
    // 连锁天赋
    p.thresh = p.thresh || {};
    const hitThresh = (key, need) => {
      if (!this.has(p, key)) return false;
      p.thresh[key] = (p.thresh[key] || 0) + step;
      if (p.thresh[key] >= need) { p.thresh[key] -= need; return true; }
      return false;
    };
    if (hitThresh('rushT', 3)) { const d = this.dealToEnemy(4, p); this.addLog(`💠 ${p.name}【连锁打击】：追加 ${d} 点伤害`, 'hit', p.seat); }
    if (hitThresh('weakenT', 3)) { e.vuln += 1; this.addLog(`💠 ${p.name}【连锁削弱】：敌人 +1 易伤`, 'info', p.seat); }
    if (hitThresh('surgeT', 6)) { p.energy += 1; this.addLog(`💠 ${p.name}【连锁蓄能】：+1 能量`, 'info', p.seat); }
    let gg = 0;
    if (hitThresh('openEcon', 4)) gg += 10;
    if (this.has(p, 'openEcon') && c.kind === 'open') gg += 2;
    if (gg) { p.gold += gg; this.addLog(`💠 ${p.name}【开团补给】：+${gg} 金币`, 'gold', p.seat); }

    if (e.hp <= 0) { this.onEnemyDead(); return { ok: true }; }
    if (p.hp <= 0) {
      // 自损 / 毒把自己打死：也必须把「全员已就绪 → 敌人回合」走完，
      // 否则两个人都动不了、敌人回合永不触发，整局硬卡死（自残流的致命坑）
      if (this.phase === 'combat' && this.players.every(x => x.ready || x.dead)) this.enemyTurn();
      this.touch();
      return { ok: true };
    }
    if (endedByDown) { this.endTurn(p, true); }
    this.touch();
    return { ok: true };
  }

  registerEntry(c, p) {
    p.entries.push({ name: c.name, id: c.id, fx: c.fx, uid: c.uid });
    if (this.has(p, 'showTalent')) { p.gold += 10; this.addLog(`💠 ${p.name}【登场·票房】：+10 金币`, 'gold', p.seat); }
    return p.entries[p.entries.length - 1];
  }
  triggerAllEntries(p) {
    if (!p.entries.length) return;
    this.addLog(`🔁 ${p.name} 触发全部 ${p.entries.length} 个登场效果`, 'info', p.seat);
    p.entries.forEach(en => this.applyFx(en.fx, `🔜 登场【${en.name}】`, p));
    if (this.has(p, 'entryGuard') && (p.entryGuardUsed || 0) < 4) { p.entryGuardUsed = (p.entryGuardUsed || 0) + 1; p.block += 2; this.addLog(`💠 ${p.name}【登场·护势】：+2 格挡`, 'heal', p.seat); }
    if (this.has(p, 'entryGold') && (p.entryGoldUsed || 0) < 3) { p.entryGoldUsed = (p.entryGoldUsed || 0) + 1; p.gold += 3; this.addLog(`💠 ${p.name}【登场·掠财】：+3 金币`, 'gold', p.seat); }
    if (this.has(p, 'entryDraw') && !p.entryDrawUsed) { p.entryDrawUsed = true; this.drawCards(1, p); this.addLog(`💠 ${p.name}【登场·气韵】：抽 1 张牌`, 'info', p.seat); }
    if (this.has(p, 'bloomT')) { const d = this.tickPoison(false); if (d > 0) this.addLog(`💠 ${p.name}【毒之绽放】：引爆中毒 ${d}`, 'heal', p.seat); }
  }

  // ---------------- 回合流程 ----------------
  // 每「一轮」（两人各行动一次）开始时结算一次敌人的中毒与易伤衰减
  roundStartTick() {
    const e = this.enemy;
    if (!e || e.hp <= 0) return;
    this.tickPoison(true);                 // 病入膏肓下毒只是倒计时，不扣血、不掉层
    if ((e.vuln || 0) > 0) {
      e.vuln--;
      this.addLog(`🩹 【${e.name}】的易伤衰减，剩余 ${e.vuln} 层`, 'info');
    }
  }

  startPlayerTurn() {
    if (this.phase !== 'combat') return;
    this.turnNo++;
    this.logSep(`—— 第 ${this.floor} 层 · 第 ${this.turnNo} 回合 ——`);
    this.roundStartTick();
    if (this.enemy.hp <= 0) { this.onEnemyDead(); return; }
    for (const p of this.players) {
      if (p.dead) { p.ready = true; p.canAct = false; continue; }
      this.beginTurnFor(p);
      if (this.enemy.hp <= 0) { this.onEnemyDead(); return; }
      if (this.phase !== 'combat') return;
    }
    this.guCurseEscalate();
    if (this.enemy.hp <= 0) { this.onEnemyDead(); return; }
    if (this.players.every(x => x.dead)) { this.endGame(false); return; }
    this.touch();
  }

  beginTurnFor(p) {
    const e = this.enemy;
    const resetRound = () => {
      p.playedThisTurn = 0; p.springThisTurn = 0; p.turnCards = 0; p.setupAegisUsed = 0;
      p.setupLinkUsed = 0; p.allReadyGiven = 0; p.playedList = []; p.thresh = {}; p.openNext = false;
      p.tempGen = 0; p.tempPlayed = 0; p.tempOpenUsed = 0; p.tempDrawUsed = 0; p.tempGoldUsed = 0;
      p.tempWardUsed = 0; p.openEchoUsed = 0; p.turn = this.turnNo;
    };
    p.paidLast = p.paidTurn || 0; p.paidTurn = 0;
    p.bloodBurstUsed = 0; p.bloodMightUsed = 0; p.bloodWardUsed = 0;
    p.bloodGoldUsed = 0; p.bloodFlowUsed = 0; p.bloodResUsed = 0;
    p.block = 0;
    // 自身中毒：蛊术先吞伤害（1 蛊术吞 3 点，只吃伤害不回血），穿透的部分才无视格挡扣血
    if ((p.poison || 0) > 0) {
      let d = p.poison;
      p.poison = Math.max(0, p.poison - 1);
      const guUse = Math.min(p.gu || 0, Math.ceil(d / GU_ABSORB));
      const absorb = Math.min(d, guUse * GU_ABSORB);
      if (guUse > 0) { p.gu -= guUse; d -= absorb; }
      if (absorb > 0) {
        this.addLog(`☠ ${p.name} 中毒：蛊术吞下 ${absorb} 点毒伤（耗 ${guUse} 蛊术，剩 ${p.gu}）`, 'info', p.seat);
        if (this.has(p, 'guBack')) {
          const bd = Math.floor(absorb / 4);
          if (bd > 0) { const dd = this.dealToEnemy(bd, p); this.addLog(`💠 ${p.name}【蛊毒·反噬】：吞毒 ${absorb} → 对敌人造成 ${dd} 点伤害`, 'hit', p.seat); }
        }
        if (this.has(p, 'guHeal')) {
          const left = Math.max(0, 12 - (p.guHealUsed || 0));
          const hl = Math.min(left, Math.max(1, Math.floor(absorb * 0.5)));
          if (hl > 0) {
            const b = p.hp; p.hp = Math.min(p.maxHp, p.hp + hl);
            p.guHealUsed = (p.guHealUsed || 0) + (p.hp - b);
            if (p.hp > b) this.addLog(`💠 ${p.name}【蛊毒·回生】：恢复 ${p.hp - b} 生命`, 'heal', p.seat);
          }
        }
      }
      if (d > 0) {
        const lost = this.losePlayerHp(d, '☠ 中毒', p);
        this.addLog(`☠ ${p.name} 中毒结算：穿透 ${lost} 点（剩余 ${p.poison} 层）`, 'hit', p.seat);
      }
      if (p.hp <= 0) return;                 // 毒发倒下：本回合不再发牌
      if (e.hp <= 0) return;
    }
    p.energy = p.maxEnergy;
    p.entryGuardUsed = 0; p.entryGoldUsed = 0; p.entryDrawUsed = false;
    const isFirstTurn = this.turnNo === 1;
    if (isFirstTurn && this.has(p, 'openingEnergy')) { p.energy += 1; this.addLog(`💠 ${p.name}【起势】：第 1 回合 +1 能量`, 'info', p.seat); }
    if (p.pendingCombatBlock) { p.block += p.pendingCombatBlock; p.pendingCombatBlock = 0; }
    if (this.has(p, 'sturdy')) p.block += 2;
    // 蛊毒系回合开始天赋
    if (this.has(p, 'guSym') && (p.poison || 0) > 0) {
      const g = this.gainGu(4, p);
      this.addLog(`💠 ${p.name}【蛊毒·共生】：身上有中毒 → +${g} 蛊术`, 'info', p.seat);
    }
    if (this.has(p, 'guErode')) {
      const n = this.enemyPoisonAmt(7 + this.poisonBonus(p), p);
      e.poison += n;
      this.addLog(`💠 ${p.name}【蛊毒·蚀心】：敌人 +${n} 层中毒（现有 ${e.poison}）`, 'info', p.seat);
      this.checkGuCurseExec(p);
      if (e.hp <= 0) return;
    }
    if (this.has(p, 'guFeast') && e.poison >= 25) {
      this.drawCards(1, p); this.gainGu(4, p);
      this.addLog(`💠 ${p.name}【蛊毒·垂涎】：敌人毒 ≥25 层 → 抽 1 张牌、+4 蛊术`, 'info', p.seat);
    }
    if (this.has(p, 'setupFund') && p.setupCards.length) {
      const gg = p.setupCards.length * 5; p.gold += gg;
      this.addLog(`💠 ${p.name}【整备·津贴】：${p.setupCards.length} 个整备 → +${gg} 金币`, 'gold', p.seat);
    }
    for (const s of [...p.setupCards]) {
      if (!p.setupCards.includes(s)) continue;
      this.fireSetupCard(s, `⚡ 整备【${s.name}】`, p);
      if (this.has(p, 'snareT')) { e.poison += 2; this.addLog(`💠 ${p.name}【毒药陷阱】：敌人 +2 中毒`, 'info', p.seat); }
      if (e.hp <= 0) return;
    }
    if (this.has(p, 'setupEcho') && p.setupCards.length) {
      const s = this.oldestSetup(p);
      if (s) {
        this.addLog(`💠 ${p.name}【整备·回响】：【${s.name}】额外触发 ${ECHO_EXTRA} 次`, 'info', p.seat);
        for (let k = 0; k < ECHO_EXTRA; k++) {
          this.fireSetupCard(s, `⚡ 整备【${s.name}】·回响`, p);
          if (e.hp <= 0) return;
        }
      }
    }
    if (this.has(p, 'setupArmor') && p.setupCards.length) { p.block += p.setupCards.length; this.addLog(`💠 ${p.name}【整备·常备】：+${p.setupCards.length} 格挡`, 'heal', p.seat); }
    if (this.has(p, 'setupPower') && p.setupCards.length) {
      const b = p.hp; p.hp = Math.min(p.maxHp, p.hp + p.setupCards.length);
      this.addLog(`💠 ${p.name}【整备之力】：恢复 ${p.hp - b} 生命`, 'heal', p.seat);
    }
    if (this.has(p, 'setupVigor') && p.setupCards.length >= 2) { this.drawCards(1, p); this.addLog(`💠 ${p.name}【整备·精研】：额外抽 1 张牌`, 'info', p.seat); }
    if (this.has(p, 'setupDraft') && p.hand.length < 10) {
      const pool = p.masterDeck.filter(x => (typeof x === 'string' ? POOL[x] : POOL[x.id]) && (typeof x === 'string' ? POOL[x] : POOL[x.id]).kind === 'setup');
      if (pool.length) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const nc = mk(pick); p.hand.push(nc);
        this.addLog(`💠 ${p.name}【整备·扩编】：调出【${nc.name}】`, 'info', p.seat);
      }
    }
    this.drawCards(5 + (this.has(p, 'scholar') ? 1 : 0) + (isFirstTurn && this.has(p, 'openingDraw') ? 2 : 0), p);
    resetRound();
    if (this.has(p, 'fleeting')) this.randomTempCard(null, p);
    if (this.has(p, 'entryPower') && this.turnNo % 3 === 0) { this.randomTempCard('entry', p); this.addLog(`💠 ${p.name}【登场之力】：获得 1 张临时登场牌`, 'info', p.seat); }
    p.canAct = true; p.ready = false; p.turnStartAt = Date.now();
  }

  endTurn(p, byDown) {
    if (this.phase !== 'combat' || p.ready || p.dead) return { error: '无法结束回合' };
    const keep = [], gone = [];
    p.hand.forEach(c => (c.temp ? gone : keep).push(c));
    p.discard.push(...keep); p.hand = [];
    if (gone.length) this.addLog(`💨 ${p.name} 转瞬消散：${gone.map(c => c.name).join('、')}`, 'info', p.seat);
    p.ready = true; p.canAct = false; p.turnStartAt = 0;
    this.addLog(byDown ? `🌙 ${p.name} 因下场牌结束回合` : `✅ ${p.name} 结束回合`, 'info', p.seat);
    if (this.players.every(x => x.ready || x.dead)) this.enemyTurn();
    this.touch();
    return { ok: true };
  }

  pickTarget(prefer) {
    const alive = this.alive();
    if (!alive.length) return null;
    if (prefer && !prefer.dead) return prefer;
    return alive[Math.floor(Math.random() * alive.length)];
  }

  hitPlayer(raw, label, p, pierce) {
    let dmg = raw;
    // 破盾：pierce=undefined 正常吃格挡；0.5 格挡半价；0 完全无视格挡
    const usable = (pierce === undefined) ? p.block : Math.floor((p.block || 0) * pierce);
    const blocked = Math.min(usable, dmg); dmg -= blocked; p.block = Math.max(0, p.block - blocked);
    this.addLog(`⚔ ${label} → ${p.name}：${blocked > 0 ? `被格挡 ${blocked}，` : ''}受到 ${dmg} 点伤害`, 'hit', p.seat);
    if (dmg > 0) {
      const lost = this.losePlayerHp(dmg, `⚔ ${label}`, p);
      // 蛊术：物理伤害「先扣血、再回血」，1 蛊术回 2 血，一次可用多点
      if (lost > 0 && (p.gu || 0) > 0 && p.hp > 0) {
        const use = Math.min(p.gu, Math.ceil(lost / GU_HEAL));
        const b = p.hp;
        p.gu -= use; p.hp = Math.min(p.maxHp, p.hp + Math.min(use * GU_HEAL, lost));
        if (p.hp > b) this.addLog(`🐛 蛊术：${p.name} 消耗 ${use} 蛊术，回复 ${p.hp - b} 生命（剩 ${p.gu}）`, 'heal', p.seat);
      }
    }
    return dmg;
  }

  enemyTurn() {
    if (this.phase !== 'combat') return;
    const e = this.enemy;
    this.logSep('—— 敌人回合 ——');
    e.block = 0;
    for (const s of (e.setups || [])) {
      if (s.fx.block) { e.block += s.fx.block; this.addLog(`🍄 【${e.name}】的能力【${s.name}】：+${s.fx.block} 格挡`, 'info'); }
    }
    // 磐石巨灵：本回合承受的伤害临时压低它的攻击（每 10 点 -1，可压到 0）
    const suppress = (e.key === 'titan') ? Math.floor((e.dmgTakenThisTurn || 0) / 10) : 0;
    if (suppress > 0) this.addLog(`🪨 【磐石巨灵】被压制：本回合承伤 ${e.dmgTakenThisTurn} → 攻击力 -${suppress}`, 'info');
    const st = Math.max(-99, (e.strength || 0) - suppress);
    const pierceOpt = e.intent && e.intent.pierceAll ? 0 : (e.intent && e.intent.pierce !== undefined ? e.intent.pierce : undefined);
    if (e.charge) {
      e.charge.left--;
      if (e.charge.left <= 0) {
        const label = e.charge.label || '蓄力技';
        const t = this.pickTarget();
        const slam = t && e.charge.slamPct ? Math.floor(t.maxHp * e.charge.slamPct) : 0;
        if (t) this.hitPlayer(e.charge.dmg + slam, `💥 ${label}${slam ? `（撞击 ${slam}）` : ''}`, t, pierceOpt);
        e.charge = null;
        if (this.afterEnemyAct()) return;
        this.guRoundEndHeal();
        if (e.key === 'devourer') this.devourCards(e);
        this.setIntent(); this.startPlayerTurn(); return;
      }
      this.addLog(`⏳ 【${e.charge.label}】还剩 ${e.charge.left} 个回合`, 'info');
    }
    const it = e.intent || { type: 'attack', val: e.attack };
    if (it.type === 'attack') {
      const t = this.pickTarget();
      const slam = t && it.slamPct ? Math.floor(t.maxHp * it.slamPct) : 0;
      const lab = it.pierceAll ? '💥 碎盾重击（无视格挡）' : (it.pierce ? '⚒ 破盾攻击（格挡减半）' : (slam ? `敌人攻击（🩸撞击 ${slam}）` : '敌人攻击'));
      if (t) this.hitPlayer(Math.max(0, it.val + st) + slam, lab, t, pierceOpt);
    } else if (it.type === 'multiatk') {
      for (let i = 0; i < (it.times || 2); i++) {
        const t = this.pickTarget();
        if (!t) break;
        const real = this.hitPlayer(Math.max(0, it.val + st), `敌人连击 ${i + 1}/${it.times}`, t, pierceOpt);
        if (this.players.every(x => x.dead)) break;
        if (e.hp <= 0) break;
        if (real <= 0) break;
      }
    } else if (it.type === 'defend') {
      e.block += it.val; this.addLog(`🛡 敌人防御：+${it.val} 格挡`, 'info');
    } else if (it.type === 'buff') {
      e.attack += it.val; this.addLog(`⬆ 敌人强化：攻击力 +${it.val}（当前 ${e.attack}）`, 'info');
    } else if (it.type === 'venom') {
      const t = this.pickTarget();
      if (t) { t.poison = (t.poison || 0) + it.val; this.addLog(`☠ 敌人施毒：${t.name} 获得 ${it.val} 层中毒`, 'info', t.seat); }
    } else if (it.type === 'charge') {
      e.charge = { left: it.turns, dmg: Math.max(0, it.dmg + st), slamPct: it.slam || 0, label: it.label || '蓄力技' };
      this.addLog(`📜 【${e.name}】开始蓄力【${e.charge.label}】：${it.turns} 回合后造成 ${e.charge.dmg} 点伤害`, 'hit');
    } else if (it.type === 'heal') {
      const b = e.hp; e.hp = Math.min(e.maxHp, e.hp + it.val);
      this.addLog(`💚 【${e.name}】重整军势：恢复 ${e.hp - b} 生命`, 'info');
    } else if (it.type === 'cleanse') {
      e.poison = 0; this.addLog(`🩸 【${e.name}】吞噬：清除自身全部中毒`, 'info');
    }
    if (this.afterEnemyAct()) return;
    this.guRoundEndHeal();
    if (e.key === 'devourer') this.devourCards(e);
    this.setIntent(); this.startPlayerTurn();
  }

  afterEnemyAct() {
    if (this.players.every(x => x.dead)) { this.endGame(false); return true; }
    if (this.enemy.hp <= 0) { this.onEnemyDead(); return true; }
    return false;
  }

  // ---------------- 战斗结束 ----------------
  onEnemyDead() {
    for (const p of this.players) {
      p.canAct = false; p.ready = true;
      const bonus = this.has(p, 'greedy') ? 12 : 0, base = 16 + bonus;
      p.gold += base;
      this.addLog(`🎉 ${p.name} 获得 ${base} 金币${bonus ? `（贪婪 +${bonus}）` : ''}`, 'gold', p.seat);
      if (this.has(p, 'bloodFeast') && (p.hpPaid || 0) > 0) {
        const heal = Math.min(20, Math.max(3, Math.round(p.hpPaid * 0.40)));
        const b = p.hp; p.hp = Math.min(p.maxHp, p.hp + heal);
        this.addLog(`💠 ${p.name}【嗜血】：恢复 ${p.hp - b} 生命`, 'heal', p.seat);
      }
      if (this.has(p, 'regen')) {
        const b = p.hp; p.hp = Math.min(p.maxHp, p.hp + 8);
        this.addLog(`💠 ${p.name}【战后休整】：恢复 ${p.hp - b} 生命`, 'heal', p.seat);
      }
    }
    this.addLog(`🏅 第 ${this.floor} 层守卫被击败！`, 'hit');
    if (this.floor >= this.maxFloor) { this.endGame(true); return; }
    this.enterReward();
  }

  rollReward(p) {
    const n = this.has(p, 'lucky') ? 4 : 3;
    const pool = [...SHOP_POOL], picks = [];
    for (let i = 0; i < n && pool.length; i++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return picks;
  }

  enterReward() {
    this.phase = 'reward';
    for (const p of this.players) { p.rewardDone = false; p.rewardPicks = this.rollReward(p); }
    this.addLog('🎁 选择战利品：各选 1 张卡加入牌组，或直接拿 30 金币', 'info');
    this.touch();
  }

  takeReward(p, id, gold) {
    if (this.phase !== 'reward' || p.rewardDone) return { error: '现在不能选战利品' };
    if (gold) { p.gold += 30; this.addLog(`🪙 ${p.name} 拿走 30 金币`, 'gold', p.seat); }
    else {
      if (!p.rewardPicks.includes(id) || !POOL[id]) return { error: '这张牌不在战利品里' };
      p.masterDeck.push(mkEntry(id));
      this.addLog(`🎁 ${p.name} 获得卡牌【${POOL[id].name}】`, 'info', p.seat);
    }
    p.rewardDone = true;
    if (this.players.every(x => x.rewardDone)) this.enterShop();
    this.touch();
    return { ok: true };
  }

  // ---------------- 商店（各自独立货架） ----------------
  rollCards() {
    const pool = [...this.visiblePool()], stock = [];
    for (let i = 0; i < 5 && pool.length; i++) {
      const id = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const base = POOL[id].shopPrice ?? (32 + POOL[id].cost * 9 + Math.random() * 12);
      stock.push({ id, price: Math.round(base / 5) * 5, sold: false });
    }
    return stock;
  }
  rollTalents(p) {
    const ban = this.banSchool || '', gu = this.guAffinity();
    const pool = Object.keys(TALENTS).filter(t => !this.has(p, t)
      && !(ban && talentCat(t).key === ban)
      && !(GU_TALENTS.includes(t) && !gu));
    const picks = [];
    for (let i = 0; i < 5 && pool.length; i++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    p.shop.tStock = picks;
  }
  enterShop() {
    this.phase = 'shop';
    for (const p of this.players) {
      p.hp = Math.min(p.maxHp, p.hp + 8);         // 层间小回复
      p.shopDone = false;
      p.shop = { cardStock: this.rollCards(), tStock: [], rPrice: 12, rerolls: 0 };
      this.rollTalents(p);
    }
    this.floor++;
    this.addLog(`🛒 第 ${this.floor} 层 · 商店（各自独立货架，备好后进入下一层）`, 'info');
    this.touch();
  }
  talentMult(p) {
    const n = p.talentBought || 0;
    if (n === 0) return 0.85;
    if (n === 1) return 1;
    return 1 + (n - 1) * 0.25;
  }
  talentPrice(p, base) { return Math.round(base * this.talentMult(p) / 5) * 5; }
  sellPrice(e) { const b = POOL[e.id]; return Math.max(8, Math.round(12 + b.cost * 7 + (e.fxm - 1) * 40 + (-e.cd) * 30)); }
  canReduce(e) { const minC = POOL[e.id].minCost ?? 0; return (POOL[e.id].cost + e.cd) > minC; }
  canUpgrade(e) { return (e.lv || 0) < MAX_UP; }
  upgradePrice(e, mode) {
    const base = mode === 'cost' ? 70 : 85;
    const rare = ['setup', 'entry', 'down'].includes(POOL[e.id].kind) ? 1.3 : 1;
    return Math.round(base * rare / 5) * 5;
  }
  deckGroups(p) {
    const m = new Map();
    p.masterDeck.forEach(e => {
      if (!e || !POOL[e.id]) return;              // 忽略脏数据，别让整页渲染挂掉
      const k = e.id + '|' + e.cd + '|' + e.fxm;
      if (!m.has(k)) m.set(k, { key: k, sample: e, list: [] });
      m.get(k).list.push(e);
    });
    return [...m.values()];
  }
  shopAct(p, a) {
    if (this.phase !== 'shop' || !p.shop) return { error: '不在商店阶段' };
    const s = p.shop;
    if (a.t === 'buyCard') {
      const it = s.cardStock[a.i];
      if (!it || it.sold) return { error: '这张牌已售出' };
      if (p.gold < it.price) return { error: '🪙 金币不足' };
      p.gold -= it.price; it.sold = true; p.masterDeck.push(mkEntry(it.id));
      this.addLog(`🛒 ${p.name} 购买【${POOL[it.id].name}】，花费 ${it.price} 金币`, 'gold', p.seat);
    } else if (a.t === 'buyTalent') {
      const T = TALENTS[a.tid];
      if (!T || this.has(p, a.tid)) return { error: '天赋不可用' };
      const pr = this.talentPrice(p, T.price);
      if (!s.tStock.includes(a.tid)) return { error: '这个天赋不在货架上' };
      if (p.gold < pr) return { error: '🪙 金币不足' };
      p.gold -= pr; this.buyTalent(p, a.tid); p.talentBought = (p.talentBought || 0) + 1;
      this.addLog(`🛒 ${p.name} 购买天赋【${T.name}】，花费 ${pr} 金币`, 'gold', p.seat);
    } else if (a.t === 'reroll') {
      const pr = s.rPrice || 12;
      if (p.gold < pr) return { error: `金币不足：需要 ${pr}` };
      p.gold -= pr; s.rPrice = pr + 6; s.rerolls = (s.rerolls || 0) + 1;
      s.cardStock = this.rollCards(); this.rollTalents(p);
    } else if (a.t === 'sell') {
      const e = p.masterDeck[a.i];
      if (!e || !POOL[e.id]) return { error: '找不到这张牌' };
      if (p.masterDeck.length <= 3) return { error: '牌组不能少于 3 张' };
      const pr = this.sellPrice(e);
      p.masterDeck.splice(a.i, 1); p.gold += pr;
      this.addLog(`💰 ${p.name} 卖出【${POOL[e.id].name}】，+${pr} 金币`, 'gold', p.seat);
    } else if (a.t === 'upgrade') {
      const e = p.masterDeck[a.i];
      if (!e || !POOL[e.id]) return { error: '找不到这张牌' };
      if (!this.canUpgrade(e)) return { error: '已升级过' };
      const pr = this.upgradePrice(e, a.mode);
      if (p.gold < pr) return { error: '🪙 金币不足' };
      if (a.mode === 'cost') {
        if (!this.canReduce(e)) return { error: '已到最低费用' };
        e.cd -= 1;
      } else e.fxm = (e.fxm || 1) + 0.5;
      e.lv = (e.lv || 0) + 1; p.gold -= pr;
      this.addLog(`⬆ ${p.name} 升级【${POOL[e.id].name}】（${a.mode === 'cost' ? '降费' : '增效'}），花费 ${pr} 金币`, 'gold', p.seat);
    } else if (a.t === 'leave') {
      p.shopDone = true;
      this.addLog(`🚪 ${p.name} 已备好`, 'info', p.seat);
      if (this.players.every(x => x.shopDone)) { this.startCombat(); return { ok: true }; }
    } else return { error: '未知操作' };
    this.touch();
    return { ok: true };
  }

  endGame(win) {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.over = win ? 'win' : 'lose';
    this.addLog(win ? `🏆 通关！${this.maxFloor} 层全清` : '💀 两人全部倒下……', win ? 'heal' : 'hit');
    this.touch();
  }

  restart() {
    const names = this.players.map(p => p.name);
    const pids = this.players.map(p => p.pid);
    this.players = [];
    this.phase = 'lobby'; this.floor = 1; this.enemy = null; this.log = [];
    this.turnNo = 0; this.combatCards = 0; this.over = null;
    this.chat = []; this.chatSeq = 0;
    this.banLocked = false; this.banSchool = this.banConfig;   // 下一局重新解析随机禁用
    pids.forEach((pid, i) => this.join(pid, names[i]));
    this.touch();
  }

  // ============================================================
  //  队友频道（只存文本，不参与任何结算）
  // ============================================================
  say(p, text) {
    const t = String(text == null ? '' : text)
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')   // 去控制字符
      .trim().slice(0, 400);
    if (!t) return { error: '空消息' };
    const now = Date.now();
    if (p._sayAt === undefined || now - p._sayAt > 2000) { p._sayAt = now; p._sayN = 0; }
    if (++p._sayN > 6) return { error: '说太快啦，缓一缓' };
    const m = { id: ++this.chatSeq, seat: p.seat, name: p.name, text: t, at: now };
    this.chat.push(m);
    if (this.chat.length > 200) this.chat.splice(0, this.chat.length - 200);
    if (p.canAct && !p.ready && !p.dead) p.turnStartAt = now;  // 发言 = 有效动作，顺延托管计时
    this.touch();
    return { ok: true, chatId: m.id };
  }

  // 打字保活：只顺延自己的托管计时，不推状态（避免每 5 秒刷一次界面）
  keep(p) {
    if (p.canAct && !p.ready && !p.dead) p.turnStartAt = Date.now();
    return { ok: true, quiet: true };
  }

  // ============================================================
  //  动作分发
  // ============================================================
  // 五流派设置：整备开始前可改，开局后锁定（只影响下一局）
  setConfig(p, a) {
    const ban = String(a.ban || ''), pref = String(a.pref || '');
    if (ban && ban !== 'random' && !SCHOOLS[ban]) return { error: '没有这个流派' };
    if (pref && !SCHOOLS[pref]) return { error: '没有这个流派' };
    this.banConfig = ban; this.talentPref = pref;
    const bn = ban ? (ban === 'random' ? '每局随机禁一系' : `禁用【${SCHOOLS[ban].name}】`) : '不禁用';
    const pf = pref ? `爱好【${SCHOOLS[pref].name}】` : '不指定';
    if (this.banLocked) {
      this.addLog(`⚙️ ${p.name} 调整流派设置：${bn} / ${pf}（本局不变，下一局生效）`, 'info', p.seat);
      this.touch(); return { ok: true, deferred: true };
    }
    this.banSchool = (ban === 'random' ? '' : ban);
    this.addLog(`⚙️ ${p.name} 调整流派设置：${bn} / ${pf}`, 'info', p.seat);
    this.touch();
    return { ok: true };
  }

  act(seat, a) {
    const p = this.players[seat];
    if (!p) return { error: '不在房间里' };
    this.lastAct = Date.now();
    p.lastActAt = Date.now();
    try {
      // 与阶段无关的能力：聊天、打字保活
      if (a.t === 'say') return this.say(p, a.text);
      if (a.t === 'keep') return this.keep(p);
      if (a.t === 'nudge') return this.nudge(p);
      if (a.t === 'config') return this.setConfig(p, a);
      switch (this.phase) {
        case 'setup':
          if (a.t === 'talent') {
            if (p.setupStage !== 'talent') return { error: '已经选过天赋了' };
            if (!p.talentPicks.includes(a.tid) || !TALENTS[a.tid]) return { error: '没有这个天赋' };
            this.buyTalent(p, a.tid);
            p.deckCands = this.buildDeckCandidates(p);
            p.deckPicks = [];
            p.setupStage = 'deck';
            this.addLog(`💠 ${p.name} 选定开局天赋：${TALENTS[a.tid].name}`, 'info', seat);
          } else if (a.t === 'deckToggle') {
            if (p.setupStage !== 'deck') return { error: '现在不能选牌' };
            const id = String(a.id == null ? '' : a.id);
            if (!POOL[id] || !(p.deckCands || []).includes(id)) return { error: '这张牌不在你的候选里' };
            const i = p.deckPicks.indexOf(id);
            if (i >= 0) p.deckPicks.splice(i, 1);
            else {
              if (p.deckPicks.length >= PICK_COUNT) return { error: `最多 ${PICK_COUNT} 张` };
              p.deckPicks.push(id);
            }
          } else if (a.t === 'deckConfirm') {
            if (p.setupStage !== 'deck') return { error: '现在不能确认' };
            if (p.deckPicks.length !== PICK_COUNT) return { error: `需要选 ${PICK_COUNT} 张` };
            // 再校验一次：任何一个无效 id 都不能进牌组（否则 startCombat 会抛错，房间永久卡死）
            if (!p.deckPicks.every(id => POOL[id] && (p.deckCands || []).includes(id)))
              return { error: '选牌数据异常，请重新选择' };
            p.deckPicks.forEach(id => p.masterDeck.push(mkEntry(id)));
            p.setupStage = 'done';
            this.addLog(`🎴 ${p.name} 组建完成（${p.masterDeck.length} 张）`, 'info', seat);
            if (this.players.every(x => x.setupStage === 'done')) this.startCombat();
          } else return { error: '未知操作' };
          break;
        case 'combat': {
          let r;
          if (a.t === 'play') r = this.playCard(a.uid, p);
          else if (a.t === 'end') r = this.endTurn(p, false);
          else return { error: '未知操作' };
          if (!r || !r.error) {
            // 出牌 / 结束回合都算「有动作」，把托管计时从这一刻重新算
            p.turnStartAt = (p.canAct && !p.ready && !p.dead) ? Date.now() : 0;
            this.touch();
          }
          return r || { ok: true };
        }
        case 'reward':
          if (a.t === 'reward') return this.takeReward(p, a.id, a.gold);
          return { error: '未知操作' };
        case 'shop':
          return this.shopAct(p, a);
        default:
          return { error: '当前阶段不接受操作' };
      }
    } catch (err) {
      return { error: '服务器开小差了：' + err.message };
    }
    this.touch();
    return { ok: true };
  }

  // ============================================================
  //  视图（发给某个座位的玩家）
  // ============================================================
  view(seat) {
    const p = this.players[seat];
    if (!p) return { error: 'no seat' };
    const other = this.players.find(x => x.seat !== seat) || null;
    const e = this.enemy;
    // 托管倒计时：只在「轮到他、还没结束回合」时才有值
    const idleLeft = (x) => {
      if (this.phase !== 'combat' || !x || !x.canAct || x.ready || x.dead) return null;
      const limit = x.online === false ? Math.min(TURN_IDLE_MS, 15000) : TURN_IDLE_MS;
      return Math.max(0, limit - (Date.now() - (x.turnStartAt || Date.now())));
    };
    const cardView = (c) => ({
      uid: c.uid, id: c.id, name: c.name, kind: c.kind, cat: c.cat,
      cost: this.chainCost(c, p), baseCost: this.cardCost(c, p),
      desc: this.cardDesc(c, p), temp: !!c.temp, level: c.level || 0,
      // 牌面注释（原版的长按词条）：服务端下发，客户端长按卡牌时展开
      word: (POOL[c.id] && POOL[c.id].word) || '',
      school: c.school || '',
      baseDesc: (POOL[c.id] && POOL[c.id].desc) || '',
      cond: c.cond ? this.condText(c.cond) : '',
      scaleText: this.scaleNote(c, p),
      ok: this.phase === 'combat' && p.canAct && !p.dead && this.condMet(c.cond, p) && this.chainCost(c, p) <= p.energy,
    });
    return {
      room: this.id, phase: this.phase, rev: this.rev, floor: this.floor, maxFloor: this.maxFloor,
      turnNo: this.turnNo, over: this.over,
      seats: this.players.length, need: MAX_PLAYERS,
      banSchool: this.banSchool || '', banConfig: this.banConfig || '',
      talentPref: this.talentPref || '', banLocked: !!this.banLocked,
      schools: SCHOOL_KEYS.map(k => ({ key: k, name: SCHOOLS[k].name, color: SCHOOLS[k].color })),
      enemy: e ? {
        name: e.name, key: e.key, isBoss: !!e.isBoss, avatar: e.avatar, art: e.isBoss ? (BOSS_ART[e.key] || null) : null,
        hp: e.hp, maxHp: e.maxHp, block: e.block, poison: e.poison, vuln: e.vuln, strength: e.strength,
        armor: e.armor, attack: e.attack,
        intent: e.intent ? { ...e.intent } : null,
        charge: e.charge ? { left: e.charge.left, dmg: e.charge.dmg, label: e.charge.label, slamPct: e.charge.slamPct } : null,
        mech: e.mech || [], tip: e.tip || '',
        devoured: e.devoured || 0, hitsThisTurn: e.hitsThisTurn || 0, dmgTakenThisTurn: e.dmgTakenThisTurn || 0,
      } : null,
      me: {
        seat: p.seat, name: p.name, hp: p.hp, maxHp: p.maxHp, block: p.block, energy: p.energy, maxEnergy: p.maxEnergy,
        strength: p.strength, poison: p.poison, gold: p.gold, dead: p.dead, canAct: p.canAct, ready: p.ready,
        gu: p.gu || 0, guCap: this.guCap(p),
        online: p.online !== false,
        idleLeft: idleLeft(p), idleLimit: TURN_IDLE_MS,
        hand: p.hand.map(cardView),
        drawCount: p.draw.length, discardCount: p.discard.length, deckCount: p.masterDeck.length,
        setups: p.setupCards.map(s => ({ id: s.id, name: s.name, desc: s.desc || (s.fx && s.fx.dmg ? `每回合开始造成 ${s.fx.dmg} 伤害` : '') , seq: s.seq })),
        entries: p.entries.map(x => ({ name: x.name, id: x.id })),
        talents: p.talents.map(t => ({ id: t, name: TALENTS[t] ? TALENTS[t].name : t, desc: TALENTS[t] ? TALENTS[t].desc : '' })),
        talentPicks: (p.talentPicks || []).map(t => talentView(t)), setupStage: p.setupStage,
        deckCands: (p.deckCands || []).filter(id => POOL[id]).map(id => ({ id, name: POOL[id].name, kind: POOL[id].kind, cat: POOL[id].cat, cost: POOL[id].cost, desc: this.previewDesc(id), word: POOL[id].word || '', school: POOL[id].school || '', scaleText: this.scaleNote(POOL[id], null) })),
        deckPicks: p.deckPicks, pickNeed: PICK_COUNT,
        rewardPicks: p.rewardPicks.map(id => ({ id, name: POOL[id].name, kind: POOL[id].kind, cat: POOL[id].cat, cost: POOL[id].cost, desc: this.previewDesc(id), word: POOL[id].word || '', school: POOL[id].school || '', scaleText: this.scaleNote(POOL[id], null) })),
        rewardDone: p.rewardDone,
        shop: p.shop ? {
          cards: p.shop.cardStock.map(it => ({ id: it.id, name: POOL[it.id].name, kind: POOL[it.id].kind, cat: POOL[it.id].cat, cost: POOL[it.id].cost, desc: this.previewDesc(it.id), word: POOL[it.id].word || '', school: POOL[it.id].school || '', scaleText: this.scaleNote(POOL[it.id], null), price: it.price, sold: it.sold })),
          /* owned：买过之后货架仍保留该天赋，但前端要显示「已拥有」并禁止重复购买 */
          talents: (p.shop.tStock || []).map(t => {
            const cat = talentCat(t) || TALENT_CAT.other;
            return { id: t, name: TALENTS[t].name, desc: TALENTS[t].desc, price: this.talentPrice(p, TALENTS[t].price), owned: this.has(p, t), catName: cat.name, catColor: cat.color };
          }),
          rPrice: p.shop.rPrice, mult: this.talentMult(p),
          deck: this.deckGroups(p).map(g => ({
            i: p.masterDeck.indexOf(g.sample), id: g.sample.id, name: POOL[g.sample.id].name,
            kind: POOL[g.sample.id].kind, cat: POOL[g.sample.id].cat,
            desc: this.previewDesc(g.sample), word: POOL[g.sample.id].word || '',
            scaleText: this.scaleNote(POOL[g.sample.id], null),
            cnt: g.list.length, lv: g.sample.lv || 0,
            cost: Math.max(0, POOL[g.sample.id].cost + g.sample.cd), fxm: g.sample.fxm,
            sell: this.sellPrice(g.sample), upCost: this.upgradePrice(g.sample, 'cost'), upFx: this.upgradePrice(g.sample, 'effect'),
            canUp: this.canUpgrade(g.sample), canReduce: this.canReduce(g.sample),
          })),
          done: p.shopDone,
        } : null,
      },
      ally: other ? {
        seat: other.seat, name: other.name, hp: other.hp, maxHp: other.maxHp, block: other.block,
        energy: other.energy, maxEnergy: other.maxEnergy, strength: other.strength, poison: other.poison,
        gold: other.gold, dead: other.dead, ready: other.ready, handCount: other.hand.length,
        gu: other.gu || 0,
        online: other.online !== false, idleLeft: idleLeft(other),
        /* 状态栏：队友在干嘛（45 秒有效，过期给空串，页面退回「在线」） */
        act: actLabelOf(other),
        drawCount: other.draw.length, discardCount: other.discard.length, deckCount: other.masterDeck.length,
        setups: other.setupCards.map(s => ({ name: s.name })),
        talents: other.talents.map(t => ({ name: TALENTS[t] ? TALENTS[t].name : t })),
        setupStage: other.setupStage, rewardDone: other.rewardDone, shopDone: other.shopDone,
        // 整备进度：让队友能看见「他到底卡在哪一步」，而不是干等
        setupProgress: other.setupStage === 'deck' ? (other.deckPicks || []).length : 0,
        setupPickNeed: PICK_COUNT,
        setupIdleSec: Math.max(0, Math.round((Date.now() - (other.lastActAt || Date.now())) / 1000)),
        setupIdleLimit: Math.round(SETUP_IDLE_MS / 1000),
        setupNudgeSec: Math.round(NUDGE_MIN_MS / 1000),
      } : null,
      log: this.log.slice(-90),
      chat: this.chat.slice(-60),
    };
  }

  // 卡面描述（含牌数联动后的实时数值；措辞对齐单机版 v4.2 的 fxText）
  // 牌数联动的规则说明（长按详情用；p 为空时只给规则、不算当前层数）
  scaleNote(c, p) {
    if (!c || !c.scale) return '';
    const NM = { dmg: '伤害', block: '格挡', heal: '回复', gold: '金币', poison: '中毒', draw: '抽牌', vuln: '易伤' };
    const parts = [];
    for (const k of Object.keys(c.scale)) {
      if (k === 'per' || k === 'cap') continue;
      parts.push(`${NM[k] || k}+${c.scale[k]}`);
    }
    const st = p ? this.scaleStacks(c, p) : 0;
    return `每 ${c.scale.per} 张：${parts.join('、')}${c.scale.cap != null ? `（上限 +${c.scale.cap}）` : ''}` + (p ? ` · 当前 ${st} 层` : '');
  }
  cardDesc(c, p, preview) {
    const fx = this.scaledFx(c, p);
    const t = [];
    if (fx.dmg) t.push(`造成 ${fx.dmg} 点伤害`);
    if (fx.dmgMissing) t.push(`额外造成已损失生命 ${Math.round(fx.dmgMissing * 100)}% 的伤害（至少 ${fx.dmgMin || 1}）`);
    if (fx.bloodPaid) {
      const k = fx.bloodPaid, lo = fx.bloodPaidMin || 1, hi = fx.bloodPaidCap || 25;
      t.push(k === 1 ? `额外造成「等于本回合+上回合你失去的生命」的伤害（至少 ${lo}，最多 ${hi}）`
                     : `额外造成「本回合+上回合你失去的生命 ×${k}」的伤害（至少 ${lo}，最多 ${hi}）`);
    }
    if (fx.block) t.push(`获得 ${fx.block} 点格挡`);
    if (fx.guCost) t.push(`消耗 ${fx.guCost} 点蛊术`);
    if (fx.heal) t.push(`恢复 ${fx.heal} 生命${fx.guCost ? '（蛊术不足按比例减；血满转生命上限）' : ''}`);
    if (fx.selfDmg) t.push(`自身失去 ${fx.selfDmg} 生命`);
    if (fx.selfDmgPct) t.push(`失去生命上限 ${Math.round(fx.selfDmgPct * 100)}% 的生命（至少 ${fx.selfDmgPctMin || 1}）`);
    if (fx.maxHp) t.push(`生命上限 +${fx.maxHp}（不回血）`);
    if (fx.maxHpCost) t.push(`生命上限 -${fx.maxHpCost}`);
    if (fx.draw || fx.drawIfPaid) t.push(`抽 ${fx.draw || 0} 张牌${fx.drawIfPaid ? `；本回合已失血则再抽 ${fx.drawIfPaid} 张` : ''}`);
    if (fx.gold) t.push(`获得 ${fx.gold} 金币`);
    if (fx.energy) t.push(`获得 ${fx.energy} 点能量`);
    if (fx.poison) t.push(`施加 ${fx.poison} 层中毒`);
    if (fx.poisonE) t.push(`敌人 +${fx.poisonE} 层中毒`);
    if (fx.poisonSelf) t.push(`你 +${fx.poisonSelf} 层中毒`);
    if (fx.poisonCut) t.push(`敌人中毒 -${fx.poisonCut} 层`);
    if (fx.poisonCutSelf) t.push(`你身上的毒 -${fx.poisonCutSelf} 层`);
    if (fx.gu) t.push(`获得 ${fx.gu} 点蛊术`);
    if (fx.guShift) t.push('把你身上一半的中毒转移给敌人（每 2 层 +1 蛊术）');
    if (fx.guConvert) t.push(`把你「中毒+蛊术」的 ${fx.guConvert}% 转成敌人中毒，并从你身上扣掉同样层数的毒`);
    if (fx.guRot) t.push(`造成「敌人中毒层数×${fx.guRot}%」的伤害（不消耗层数）；毒层≥其当前生命则直接斩杀`);
    if (fx.guDoom) t.push(`敌人中毒 +${fx.guDoom}%；之后毒层≥其当前生命则直接斩杀`);
    if (fx.poisonTick) t.push(`立即结算 ${fx.poisonTick} 次中毒伤害`);
    if (fx.random) t.push(`获得 ${fx.random} 张随机临时牌`);
    if (fx.temp) t.push('获得 1 张随机转瞬');
    if (fx.tempCopy) t.push('复制上一张牌（转瞬版）');
    if (fx.blockPlayed) t.push(`获得 ${((p && p.playedThisTurn) || 0) + 1} 点格挡（＝本回合牌数）`);
    if (fx.spring) t.push(`召回本回合打出的前 X+${fx.spring} 张牌，全部变为转瞬`);
    if (fx.loseBlock) t.push(`失去 ${fx.loseBlock} 点格挡`);
    if (fx.randomEntry) t.push(`随机触发 ${fx.randomEntry} 个已登记的登场效果`);
    if (fx.randomSetup) t.push(`随机触发 ${fx.randomSetup} 个已布置的整备效果${fx.safeSetup ? '（不会选到「会触发登场」的整备）' : ''}`);
    if (fx.fireAll) t.push(`引爆你身上全部整备效果${fx.removePer ? `；每引爆 ${fx.removePer} 个随机失去 1 个整备` : ''}`);
    if (fx.removeSetup) t.push(`随机失去 ${fx.removeSetup} 个整备`);
    if (fx.blockSetup) t.push(`消耗全部格挡，每 ${fx.blockSetup.per} 点随机触发 1 个整备效果（最多 ${fx.blockSetup.cap} 次）`);
    if (fx.vuln) t.push(`施加 ${fx.vuln} 层易伤`);
    if (fx.strength) t.push(`永久 +${fx.strength} 力量`);
    if (c.setupEvery) t.push(`每触发 ${c.setupEvery} 次整备 → 1 张随机整备牌（每回合最多 ${ALL_READY_PER_TURN} 张）`);
    if (c.burn) t.push('本场战斗限用一次（用完即焚）');
    if (c.bloodCut) t.push('上个回合扣过血时费用 -1');
    if (c.dynCost && !preview) t.push(`X = ${this.springCount(p)}`);
    let s = t.join('，') || c.desc || '';
    // 整备牌的原始 desc 往往已经以「每回合开始」开头，别再加一次前缀
    if (c.kind === 'setup' && !/^每回合开始/.test(s)) s = '每回合开始：' + s;
    if (c.temp) s += '（转瞬）';
    return s;
  }

  // 非战斗场景（商店 / 选牌 / 图鉴）的卡面说明：和手牌同一套生成逻辑，数值取基础值
  previewDesc(entry) {
    const id = typeof entry === 'string' ? entry : (entry && entry.id);
    if (!POOL[id]) return '';
    const c = mk(entry || id);
    return this.cardDesc(c, { playedThisTurn: 0, springThisTurn: 0 }, true);
  }
}

let _previewRoom = null;
function previewCardDesc(id) {
  if (!_previewRoom) _previewRoom = new Room('__preview');
  return _previewRoom.previewDesc(id);
}

module.exports = { Room, MAX_PLAYERS, MAX_FLOOR, previewCardDesc };
