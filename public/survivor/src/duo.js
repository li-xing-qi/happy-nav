/* ============================================================
   「并肩割草」· 第二个玩家角色（duo.js）
   ------------------------------------------------------------
   上游是单主角，这里补一个真正独立的战友：
     · 房主控主角；队友在另一台设备上控这个角色（联机输入由 coop.js 转进来）
     · 独立坐标 / 血量 / 属性 / 暴击 / 增伤 / 减伤 / 技能冷却 / 金币
     · 技能复用上游 useSkill：调用前把全局 hero/stats/currentHero/
       skillCooldown/skillMaxCooldown/暴击/增伤/减伤/神器状态临时换成战友，
       调用后写回并还原——所有英雄的普攻 + 三个技能、特效、位移、
       回血、神器触发都和主角完全一致。
     · 英雄、皮肤、神器、每波选卡、商店都是各人一份。
     · 倒地不是自动复活：另一人靠近 3 秒把他拉起来；两人都倒才结束。
     · 掉落吸附按“离谁近”算，回血和增益落到捡到的人身上。

   角色画在一张覆盖在游戏画布上的透明 canvas 上：
   这样不用改上游的绘制顺序，房主推流时把两张画布叠起来就行。
   ============================================================ */
(function () {
  'use strict';

  var desired = false;      // 房间里有队友在线 → 需要有这个角色
  var E = null;             // 角色实体
  var overlay = null, octx = null;
  var fx = [];              // 自己的特效（环 / 光束）
  var lastAt = 0;
  var lastWave = 0;
  var input = { x: 0, y: 0, at: 0 };
  var AUTO_KEY = 'coopAllyHero';
  var ART_KEY = 'coopAllyArtifact';
  var SKIN_KEY = 'coopAllySkin';
  var wantedHero = '';      // 队友选的英雄
  var wantedArtifact = '';  // 队友选的神器
  var wantedSkin = '';      // 队友选的皮肤
  var offers = null;        // 本波战友可选强化 { wave, list:[{text,buff}] }
  var wasShowingBuff = false;
  var weatherId = '';       // 当前世界天气（给战友也镜像一份）
  var heroDowned = false;   // 主角倒地待救
  var heroRescue = 0;       // 主角救援进度（毫秒）
  var bothDown = false;     // 两人都倒 → 结束
  var FRAME_MS = 16.67;     // 上游冷却单位是帧
  var REVIVE_HOLD = 3000;   // 拉人需要按住靠近的时间
  var REVIVE_RANGE = 90;    // 救援距离
  var BASE_MAX_CD = [0, 180, 300, 180];

  function nowMs() { return Date.now(); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function defOf(key) {
    try { return (typeof HERO_DEFS !== 'undefined' && HERO_DEFS[key]) || null; } catch (e) { return null; }
  }
  function artifactOf(key) {
    try { return (typeof ARTIFACT_DEFS !== 'undefined' && ARTIFACT_DEFS[key]) || null; } catch (e) { return null; }
  }
  function allHeroKeys() {
    try { return Object.keys(HERO_DEFS); } catch (e) { return []; }
  }
  function heroNameOf(key) {
    var d = defOf(key);
    return d && d.name ? d.name : key;
  }
  function skillNamesOf(key) {
    var d = defOf(key);
    var names = ['普攻'];
    if (d && d.skills) {
      for (var i = 0; i < d.skills.length && i < 3; i++) names.push(d.skills[i].name || ('技能' + (i + 1)));
    }
    while (names.length < 4) names.push('技能' + names.length);
    return names;
  }
  function isShowingBuff() {
    try { return !!showingBuff; } catch (e) { return false; }
  }
  function isPaused() {
    try { return !!gamePaused; } catch (e) { return false; }
  }
  function artifactEnabled() {
    try { return !!enableArtifact; } catch (e) { return false; }
  }
  function shopEnabled() {
    try { return !!enableShop; } catch (e) { return false; }
  }

  /* ---------- 覆盖画布 ---------- */
  function ensureOverlay() {
    var src = document.getElementById('gameCanvas');
    if (!src) return false;
    if (overlay && document.body.contains(overlay)) return true;
    overlay = document.createElement('canvas');
    overlay.id = 'coopAllyCanvas';
    overlay.style.cssText = 'position:absolute;pointer-events:none;z-index:6;';
    var parent = src.parentElement;
    if (parent) parent.appendChild(overlay);
    octx = overlay.getContext('2d');
    syncOverlaySize();
    return true;
  }
  function syncOverlaySize() {
    var src = document.getElementById('gameCanvas');
    if (!overlay || !src) return;
    if (overlay.width !== src.width) overlay.width = src.width;
    if (overlay.height !== src.height) overlay.height = src.height;
    overlay.style.width = src.style.width || (src.width + 'px');
    overlay.style.height = src.style.height || (src.height + 'px');
    overlay.style.left = (src.offsetLeft || 0) + 'px';
    overlay.style.top = (src.offsetTop || 0) + 'px';
  }
  function clearOverlay() {
    if (!octx || !overlay) return;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
  }

  /* ---------- 选择英雄 / 神器 / 皮肤 ---------- */
  function pickHeroKey() {
    if (wantedHero && defOf(wantedHero)) return wantedHero;
    var saved = '';
    try { saved = localStorage.getItem(AUTO_KEY) || ''; } catch (e) {}
    if (saved && defOf(saved)) return saved;
    var cur = (typeof currentHero !== 'undefined') ? currentHero : 'lubu';
    var keys = allHeroKeys();
    for (var i = 0; i < keys.length; i++) if (keys[i] !== cur) return keys[i];
    return cur;
  }
  function readSaved() {
    try { wantedArtifact = localStorage.getItem(ART_KEY) || ''; } catch (e) { wantedArtifact = ''; }
    try { wantedSkin = localStorage.getItem(SKIN_KEY) || ''; } catch (e) { wantedSkin = ''; }
  }
  readSaved();

  function baseStats() {
    var fb = { hp: 200, attack: 40, skill1: 60, skill2: 30, skill3: 90 };
    try {
      if (typeof stats === 'object' && stats) {
        return {
          hp: Number(stats.hp) || fb.hp,
          attack: Number(stats.attack) || fb.attack,
          skill1: Number(stats.skill1) || fb.skill1,
          skill2: Number(stats.skill2) || fb.skill2,
          skill3: Number(stats.skill3) || fb.skill3,
        };
      }
    } catch (e) {}
    return fb;
  }

  /* ---------- 角色 ---------- */
  function create() {
    const h = hero;
    if (!h) return null;
    var key = pickHeroKey();
    var st = baseStats();
    var hostGold = 0;
    try { hostGold = Number(gameGold) || 0; } catch (e) {}
    E = {
      x: clamp(h.x + 52, 40, MAP_WIDTH - 40),
      y: clamp(h.y + 20, 40, MAP_HEIGHT - 120),
      hp: st.hp, maxHp: st.hp, alive: true, downed: false, name: '战友',
      heroKey: key, facing: 1, radius: 20, shield: 0, rageTime: 0,
      stats: st,
      // ===== 各人一份的战斗数值 =====
      maxCd: BASE_MAX_CD.slice(),
      critRate: 0.2, critDmg: 1.5, dmgBonus: 0, damageReduction: 0,
      // ===== 各人一份的神器状态 =====
      artifact: artifactEnabled() ? (wantedArtifact || '') : '',
      artifactApplied: false, undyingUsed: false,
      skillCast: 0, doomTarget: null, doomTimer: 0, shadowTimer: 0, phantom: false,
      // ===== 皮肤 / 金币 / 召唤物 =====
      skinId: wantedSkin || '',
      gold: Math.max(0, hostGold), lastHostGold: hostGold,
      clones: [], ghosts: [],
      invincibleTime: 90,        // 帧
      atkReady: 0,
      cd: [0, 0, 0, 0],          // 毫秒
      downAt: 0, reviveHold: 0, respawnAt: 0,
      lastWave: wave,
      hitFlash: 0,
    };
    window.__coopHero2 = E;
    lastWave = wave;
    wasShowingBuff = isShowingBuff();
    applyArtifact();
    if (weatherId) applyWeatherToAlly(weatherId);
    return E;
  }

  function despawn() {
    // 主角正倒地等救时队友却走了：不能把游戏晾在冻结状态，直接按阵亡结算
    var wasHeroDown = heroDowned;
    if (E) E.alive = false;
    E = null;
    window.__coopHero2 = null;
    fx.length = 0;
    input = { x: 0, y: 0, at: 0 };
    offers = null;
    heroDowned = false;
    heroRescue = 0;
    bothDown = false;
    if (wasHeroDown) {
      try { gameRunning = false; } catch (e) {}
      try {
        var el = document.getElementById('gameOver');
        if (el) el.style.display = 'block';
      } catch (e) {}
    }
    clearOverlay();
  }

  function nearestEnemy(maxD, from) {
    var src = from || E;
    var best = null, bd = maxD || 260;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || !e.alive || e.hp <= 0) continue;
      var d = Math.hypot(e.x - src.x, e.y - src.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { e: best, d: bd } : null;
  }

  function damage(e, dmg, color, n) {
    try {
      if (typeof dealDamage === 'function') dealDamage(e, dmg, color, n || 4);
    } catch (err) {}
  }

  function addRing(x, y, maxR, color) {
    fx.push({ type: 'ring', x: x, y: y, r: 12, maxR: maxR, life: 360, maxLife: 360, color: color });
  }
  function addBeam(x1, y1, x2, y2, color) {
    fx.push({ type: 'beam', x1: x1, y1: y1, x2: x2, y2: y2, life: 160, maxLife: 160, color: color });
  }

  /* ---------- 上下文切换：让上游逻辑作用在战友身上 ---------- */
  // 技能、暴击、增伤、减伤、神器计数全部是各人一份，调用期间临时替换，
  // 调用后把可能被技能改过的值写回 E，再还原全局。
  function withHero(fn) {
    var sH = hero, sS = stats, sK = currentHero, sC = skillCooldown, sM = skillMaxCooldown;
    var sA = selectedArtifactKey, sCR = critRate, sCD = critDmgMult;
    var sB = heroDamageBonus, sR = heroDamageReduction;
    var sCast = artifactSkillCastCount, sDoomT = artifactDoomMarkTarget, sDoomTm = artifactDoomMarkTimer;
    var sShadow = artifactShadowCloneTimer, sPhantom = artifactPhantomCloakActive;
    var tmpCd = [0, 0, 0, 0];
    hero = E;
    stats = E.stats;
    currentHero = E.heroKey;
    skillCooldown = tmpCd;
    skillMaxCooldown = E.maxCd || BASE_MAX_CD.slice();
    selectedArtifactKey = E.artifact || null;
    critRate = Number(E.critRate) || 0;
    critDmgMult = Number(E.critDmg) || 1.5;
    heroDamageBonus = Number(E.dmgBonus) || 0;
    heroDamageReduction = Number(E.damageReduction) || 0;
    artifactSkillCastCount = Number(E.skillCast) || 0;
    artifactDoomMarkTarget = E.doomTarget || null;
    artifactDoomMarkTimer = Number(E.doomTimer) || 0;
    artifactShadowCloneTimer = Number(E.shadowTimer) || 0;
    artifactPhantomCloakActive = !!E.phantom;
    try {
      fn(tmpCd);
    } finally {
      // 写回 E
      E.maxCd = skillMaxCooldown;
      E.critRate = critRate;
      E.critDmg = critDmgMult;
      E.dmgBonus = heroDamageBonus;
      E.damageReduction = heroDamageReduction;
      E.skillCast = artifactSkillCastCount;
      E.doomTarget = artifactDoomMarkTarget;
      E.doomTimer = artifactDoomMarkTimer;
      E.shadowTimer = artifactShadowCloneTimer;
      E.phantom = artifactPhantomCloakActive;
      for (var i = 0; i < 4; i++) {
        var f = Number(tmpCd[i]) || 0;
        if (f > 0) E.cd[i] = Math.max(E.cd[i], f * FRAME_MS);
      }
      // 还原全局
      hero = sH; stats = sS; currentHero = sK; skillCooldown = sC; skillMaxCooldown = sM;
      selectedArtifactKey = sA; critRate = sCR; critDmgMult = sCD;
      heroDamageBonus = sB; heroDamageReduction = sR;
      artifactSkillCastCount = sCast; artifactDoomMarkTarget = sDoomT; artifactDoomMarkTimer = sDoomTm;
      artifactShadowCloneTimer = sShadow; artifactPhantomCloakActive = sPhantom;
    }
    return tmpCd;
  }

  /* ---------- 神器 ---------- */
  function applyArtifact() {
    if (!E || E.artifactApplied) return false;
    if (!artifactEnabled()) return false;
    var key = E.artifact;
    if (!key) return false;
    var d = artifactOf(key);
    if (!d || typeof d.apply !== 'function') return false;
    E.artifactApplied = true;
    try { withHero(function () { d.apply(); }); } catch (e) {}
    return true;
  }

  /* ---------- 天气：世界天气对两个人一样 ---------- */
  // 上游天气只改主角的全局数值；这里把同样的加减镜像到战友身上，
  // 并在天气切换时精确回滚。
  function clearWeatherOnAlly() {
    weatherId = '';
    if (!E || !E.weather) return;
    var w = E.weather;
    E.critRate = clamp((Number(E.critRate) || 0) - (w.critAdd || 0), 0, 1);
    if (w.critDmgAdd) E.critDmg = Math.max(1, (Number(E.critDmg) || 1.5) - w.critDmgAdd);
    E.dmgBonus = Math.max(0, (Number(E.dmgBonus) || 0) - (w.dmgAdd || 0));
    E.damageReduction = Math.max(0, (Number(E.damageReduction) || 0) - (w.reductAdd || 0));
    if (w.hpDelta) {
      E.maxHp = Math.max(1, E.maxHp + w.hpDelta);
      E.stats.hp = E.maxHp;
      E.hp = Math.min(E.hp, E.maxHp);
    }
    E.weather = null;
    E.weatherSpeed = 1;
    E.weatherDrain = false;
    E.weatherDrainFrame = 0;
  }
  function applyWeatherToAlly(id) {
    clearWeatherOnAlly();
    weatherId = id || '';
    if (!E) return;
    var m = { crit: 0, dmg: 0, reduct: 0, hpPct: 0, speed: 1, drain: false };
    switch (id) {
      case 'rain': m.crit = -0.10; m.speed = 1.15; break;
      case 'thunder': m.dmg = 0.15; m.drain = true; break;
      case 'snow': m.reduct = 0.15; m.speed = 0.90; break;
      case 'heat': m.dmg = 0.15; m.hpPct = 0.20; break;
      case 'storm': m.speed = 1.30; break;
      case 'moon': m.crit = 0.25; m.dmg = 0.10; break;
      case 'curse': m.speed = 1.20; break;
      case 'm_spread': m.speed = 1.40; break;
      case 'm_rampage': m.speed = 1.20; break;
      default: break;
    }
    var w = { critAdd: 0, critDmgAdd: 0, dmgAdd: m.dmg, reductAdd: m.reduct, hpDelta: 0 };
    if (m.crit > 0) {
      var cur = Number(E.critRate) || 0;
      if (cur >= 1.0) {
        w.critDmgAdd = m.crit * 1.5;
        E.critDmg = (Number(E.critDmg) || 1.5) + w.critDmgAdd;
      } else if (cur + m.crit > 1.0) {
        var ov = cur + m.crit - 1.0;
        w.critAdd = m.crit - ov;
        w.critDmgAdd = ov * 1.5;
        E.critRate = 1.0;
        E.critDmg = (Number(E.critDmg) || 1.5) + w.critDmgAdd;
      } else {
        w.critAdd = m.crit;
        E.critRate = cur + m.crit;
      }
    } else if (m.crit < 0) {
      var c0 = Number(E.critRate) || 0;
      var cut = Math.min(c0, -m.crit);
      w.critAdd = -cut;
      E.critRate = c0 - cut;
    }
    if (m.dmg) E.dmgBonus = (Number(E.dmgBonus) || 0) + m.dmg;
    if (m.reduct) E.damageReduction = Math.min(0.95, (Number(E.damageReduction) || 0) + m.reduct);
    if (m.hpPct) {
      var d = Math.floor(E.maxHp * m.hpPct);
      w.hpDelta = d;
      E.maxHp = Math.max(50, E.maxHp - d);
      E.stats.hp = E.maxHp;
      E.hp = Math.min(E.hp, E.maxHp);
    }
    E.weather = w;
    E.weatherSpeed = m.speed || 1;
    E.weatherDrain = !!m.drain;
    E.weatherDrainFrame = 0;
  }

  /* ---------- 每波选卡 ---------- */
  function fmtBuffText(b, def) {
    var t = String((b && b.text) || '');
    if (def && def.skills) {
      t = t.replace('一技能', def.skills[0] ? def.skills[0].name : '一技能')
           .replace('二技能', def.skills[1] ? def.skills[1].name : '二技能')
           .replace('三技能', def.skills[2] ? def.skills[2].name : '三技能');
    }
    return t;
  }
  function buffPoolOf(heroKey) {
    var def = defOf(heroKey);
    if (def && def.buffs && def.buffs.length) return def.buffs;
    try { if (typeof buffOptions !== 'undefined' && buffOptions) return buffOptions; } catch (e) {}
    return null;
  }
  function rollOffers() {
    if (!E) return;
    // 商店模式：强化从商店买，双方都不发免费三选一
    if (shopEnabled()) { offers = null; return; }
    // 上一波还没选就自动补一个，别让战友白亏成长
    if (offers) autoPickOffer();
    var def = defOf(E.heroKey);
    var pool = buffPoolOf(E.heroKey);
    if (!pool || !pool.length) { offers = null; return; }
    var shuffled = pool.slice().sort(function () { return Math.random() - 0.5; });
    var seen = {}, list = [];
    for (var i = 0; i < shuffled.length; i++) {
      var b = shuffled[i];
      if (!b || seen[b.id]) continue;
      seen[b.id] = 1;
      list.push({ text: fmtBuffText(b, def), buff: b });
      if (list.length >= 3) break;
    }
    offers = list.length ? { wave: wave, list: list } : null;
  }
  function applyOffer(idx) {
    if (!offers) return false;
    var pick = offers.list[idx];
    if (!pick || !pick.buff || typeof pick.buff.apply !== 'function') return false;
    try { withHero(function () { pick.buff.apply(); }); } catch (e) {}
    E.maxHp = Math.max(1, E.stats.hp);
    E.hp = Math.min(E.hp, E.maxHp);
    if (E.hp <= 0 && E.alive) E.hp = E.maxHp * 0.5;
    offers = null;
    return true;
  }
  function autoPickOffer() {
    if (!offers) return;
    applyOffer(Math.floor(Math.random() * offers.list.length));
  }

  /* ---------- 商店（各人一份金币） ---------- */
  function syncGold() {
    if (!E) return;
    var g = 0;
    try { g = Number(gameGold) || 0; } catch (e) { return; }
    if (E.lastHostGold == null) E.lastHostGold = g;
    var delta = g - E.lastHostGold;
    if (delta > 0) E.gold = (Number(E.gold) || 0) + delta;
    E.lastHostGold = g;
  }
  function buy(id) {
    if (!E || !E.alive) return false;
    if (!shopEnabled()) return false;
    if ((Number(E.gold) || 0) < 500) return false;
    var pool = buffPoolOf(E.heroKey) || [];
    var b = null;
    for (var i = 0; i < pool.length; i++) if (pool[i] && pool[i].id === id) { b = pool[i]; break; }
    if (!b || typeof b.apply !== 'function') return false;
    E.gold = (Number(E.gold) || 0) - 500;
    try { withHero(function () { b.apply(); }); } catch (e) {}
    E.maxHp = Math.max(1, E.stats.hp);
    if (E.hp > E.maxHp) E.hp = E.maxHp;
    return true;
  }

  /* ---------- 神器持续效果（影分身 / 审判之眼） ---------- */
  function tickArtifacts(dt) {
    if (!E || !E.alive) return;
    var frames = dt / FRAME_MS;
    // 影之分身：每 10 秒召唤一个持续 4 秒的分身
    if (E.artifact === 'shadowClone') {
      E.shadowTimer = (Number(E.shadowTimer) || 0) - frames;
      if (E.shadowTimer <= 0) {
        E.shadowTimer = 600;
        if (E.clones.length < 6) {
          E.clones.push({ angle: Math.random() * Math.PI * 2, life: 240, atk: 30, tick: 60 });
        }
      }
    }
    // 审判之眼：每 15 秒标记最近敌人，对其伤害翻倍
    if (E.artifact === 'doomMark') {
      E.doomTimer = (Number(E.doomTimer) || 0) - frames;
      if (E.doomTimer <= 0) {
        E.doomTimer = 900;
        var near = nearestEnemy(2000, E) || nearestEnemy(99999, E);
        E.doomTarget = near ? near.e : null;
      }
    }
    // 分身行动
    for (var i = E.clones.length - 1; i >= 0; i--) {
      var c = E.clones[i];
      c.life -= frames;
      c.angle += 0.05 * frames;
      c.atk -= frames;
      c.tick -= frames;
      var cx = E.x + Math.cos(c.angle) * 70;
      var cy = E.y + Math.sin(c.angle) * 70;
      if (c.atk <= 0) {
        c.atk = 30;
        withHero(function () {
          for (var k = 0; k < enemies.length; k++) {
            var en = enemies[k];
            if (!en || !en.alive) continue;
            if (Math.hypot(en.x - cx, en.y - cy) < 80) damage(en, E.stats.skill3 * 0.5, '#ff66cc', 5);
          }
        });
      }
      if (c.tick <= 0) {
        c.tick = 60;
        withHero(function () {
          for (var k2 = 0; k2 < enemies.length; k2++) {
            var en2 = enemies[k2];
            if (!en2 || !en2.alive) continue;
            if (Math.hypot(en2.x - cx, en2.y - cy) < 80) damage(en2, E.stats.skill3, '#ff66cc', 5);
          }
        });
      }
      if (c.life <= 0) E.clones.splice(i, 1);
    }
    // 残影 / 审判标记寿命
    for (var g = E.ghosts.length - 1; g >= 0; g--) {
      E.ghosts[g].life -= frames;
      if (E.ghosts[g].life <= 0) E.ghosts.splice(g, 1);
    }
    if (E.doomTarget && (!E.doomTarget.alive || E.doomTarget.hp <= 0)) E.doomTarget = null;
  }

  /* ---------- 生死 ---------- */
  function die() {
    // 不灭之心：首次阵亡满血复活
    if (E.artifact === 'undyingHeart' && !E.undyingUsed) {
      E.undyingUsed = true;
      E.alive = true;
      E.hp = E.maxHp;
      E.invincibleTime = 60;
      addRing(E.x, E.y, 80, '#ffdd44');
      return;
    }
    E.alive = false;
    E.downed = true;
    E.hp = 0;
    E.downAt = nowMs();
    E.reviveHold = 0;
    E.respawnAt = 0;
    E.clones.length = 0;
    addRing(E.x, E.y, 70, '#ff6666');
    if (heroDowned) endBothDown();
  }
  function reviveAlly(ratio) {
    if (!E) return;
    E.alive = true;
    E.downed = false;
    E.hp = Math.max(1, Math.round(E.maxHp * (ratio || 0.5)));
    E.invincibleTime = 120;
    E.reviveHold = 0;
    E.downAt = 0;
    addRing(E.x, E.y, 90, '#7ee0a3');
  }
  function reviveHero() {
    try {
      heroDowned = false;
      heroRescue = 0;
      hero.alive = true;
      hero.hp = Math.max(1, Math.round(hero.maxHp * 0.5));
      hero.invincibleTime = Math.max(Number(hero.invincibleTime) || 0, 120);
      try { gameRunning = true; } catch (e) {}
      var ov = document.getElementById('gameOver');
      if (ov) ov.style.display = 'none';
      if (typeof resumeMusic === 'function') { try { resumeMusic(); } catch (e) {} }
      if (typeof gameLoop === 'function') gameLoop();
    } catch (e) {}
  }
  function endBothDown() {
    if (bothDown) return;
    bothDown = true;
    try { gameRunning = false; } catch (e) {}
    try {
      var el = document.getElementById('gameOver');
      if (el) el.style.display = 'block';
    } catch (e) {}
  }

  /* ---------- 更新 ---------- */
  function update(dt) {
    const h = hero;
    if (!h) return;

    // 金币：只同步“新增”的部分，房主花掉的不影响战友的钱包
    syncGold();

    // 波次切换：给战友也开一份独立的三选一
    if (wave !== lastWave) {
      lastWave = wave;
      rollOffers();
    }
    // 房主选完关掉面板时，战友还没选就自动补选，避免卡成长
    var showing = isShowingBuff();
    if (wasShowingBuff && !showing && offers) autoPickOffer();
    wasShowingBuff = showing;

    if (bothDown) return;
    if (isPaused() || showing) return;

    if (E.alive) tickArtifacts(dt);

    // 主角倒地：战友靠近按住 3 秒救起
    if (heroDowned) {
      if (!h || h.alive) {
        heroDowned = false;
        heroRescue = 0;
      } else if (E.alive) {
        var dh = Math.hypot(E.x - h.x, E.y - h.y);
        if (dh < REVIVE_RANGE) {
          heroRescue += dt;
          if (heroRescue >= REVIVE_HOLD) reviveHero();
        } else {
          heroRescue = Math.max(0, heroRescue - dt * 0.5);
        }
      }
      if (bothDown) return;
    }

    // 自己倒地：等主角靠近救起；25 秒还没人管就自行归队 35% 血
    if (!E.alive) {
      if (h && h.alive) {
        var d0 = Math.hypot(h.x - E.x, h.y - E.y);
        if (d0 < REVIVE_RANGE) {
          E.reviveHold += dt;
          if (E.reviveHold >= REVIVE_HOLD) reviveAlly(0.5);
        } else {
          E.reviveHold = Math.max(0, E.reviveHold - dt * 0.5);
        }
        if (!E.alive && nowMs() - E.downAt > 25000) reviveAlly(0.35);
      }
      return;
    }

    if (E.invincibleTime > 0) E.invincibleTime -= Math.max(1, dt / FRAME_MS);
    if (E.hitFlash > 0) E.hitFlash--;
    for (var i = 0; i < 4; i++) E.cd[i] = Math.max(0, E.cd[i] - dt);
    // 雷电天气：每秒流失 2% 最大生命（和主角同一套规则，最低留 1 点）
    if (E.weatherDrain) {
      E.weatherDrainFrame = (Number(E.weatherDrainFrame) || 0) + dt / FRAME_MS;
      if (E.weatherDrainFrame >= 60) {
        E.weatherDrainFrame = 0;
        E.hp = Math.max(1, E.hp - Math.floor(E.maxHp * 0.02));
      }
    }

    // 输入超过 700ms 没更新就当作松手，防止队友掉线后一直走
    var fresh = nowMs() - (input.at || 0) < 700;
    var ix = fresh ? input.x : 0;
    var iy = fresh ? input.y : 0;
    if (ix || iy) {
      var len = Math.hypot(ix, iy) || 1;
      ix /= len; iy /= len;
      if (ix < -0.1) E.facing = -1;
      else if (ix > 0.1) E.facing = 1;
      var speed = ((typeof currentDifficulty !== 'undefined' && currentDifficulty.heroSpeed) || 2.3) * 1.06;
      if (E.artifact === 'windBoots') speed *= 1.25;
      speed *= (Number(E.weatherSpeed) || 1);
      E.x = clamp(E.x + ix * speed, 40, MAP_WIDTH - 40);
      E.y = clamp(E.y + iy * speed, 40, MAP_HEIGHT - 120);
      // 幻影斗篷：移动时 15% 概率留下残影
      if (E.artifact === 'phantomCloak' && Math.random() < 0.15) {
        E.ghosts.push({ x: E.x, y: E.y, heroKey: E.heroKey, skinId: E.skinId, life: 120 });
        if (E.ghosts.length > 10) E.ghosts.shift();
      }
    }

    // 和主角稍微分开，别叠在一起
    var sx = E.x - h.x, sy = E.y - h.y;
    var sd = Math.hypot(sx, sy);
    if (sd < 34 && sd > 0.1) {
      E.x += (sx / sd) * (34 - sd) * 0.5;
      E.y += (sy / sd) * (34 - sd) * 0.5;
    }

    // 普攻：交给上游 useSkill(0)，远程/近战/英雄特效和主角同一套
    if (nowMs() >= E.atkReady) {
      var near = nearestEnemy(520);
      if (near) {
        E.facing = near.e.x >= E.x ? 1 : -1;
        cast(0);
        E.atkReady = nowMs() + 480;
      }
    }

    if (E.hp <= 0 && E.alive) die();
  }

  /* ---------- 技能 ---------- */
  // i=0 普攻，1~3 英雄技能；冷却走战友自己的 E.cd
  function cast(i) {
    if (!E || !E.alive || heroDowned || bothDown) return false;
    i = Math.max(0, Math.min(3, Math.round(Number(i) || 0)));
    if (i > 0 && E.cd[i] > 0) return false;
    if (typeof useSkill !== 'function') return false;
    try {
      withHero(function () { useSkill(i); });
    } catch (e) { return false; }
    // 共鸣之石：第 3 次技能时上游会把其余技能冷却清零（当前技能仍进入冷却）
    if (i > 0 && E.artifact === 'resonanceStone' && (Number(E.skillCast) || 0) === 0) {
      for (var j = 1; j < 4; j++) if (j !== i) E.cd[j] = 0;
    }
    return true;
  }

  /* ---------- 绘制 ---------- */
  function drawFx(dt) {
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i];
      f.life -= dt;
      if (f.life <= 0) { fx.splice(i, 1); continue; }
      var p = 1 - f.life / f.maxLife;
      if (f.type === 'ring') {
        octx.strokeStyle = f.color;
        octx.globalAlpha = Math.max(0, 1 - p);
        octx.lineWidth = 4;
        octx.beginPath();
        octx.arc(f.x, f.y, f.r + (f.maxR - f.r) * p, 0, Math.PI * 2);
        octx.stroke();
        octx.globalAlpha = 1;
      } else if (f.type === 'beam') {
        octx.strokeStyle = f.color;
        octx.globalAlpha = Math.max(0, 1 - p);
        octx.lineWidth = 3;
        octx.beginPath();
        octx.moveTo(f.x1, f.y1);
        octx.lineTo(f.x2, f.y2);
        octx.stroke();
        octx.globalAlpha = 1;
      }
    }
  }

  // 用某个皮肤画英雄，画完把全局皮肤表还原，避免影响房主
  function drawAvatarWithSkin(x, y, heroKey, skinId, size) {
    var had = false, old = null;
    try {
      had = Object.prototype.hasOwnProperty.call(heroSkinOverrides, heroKey);
      old = heroSkinOverrides[heroKey];
      if (skinId && skinId !== 'default') heroSkinOverrides[heroKey] = skinId;
      else if (had) delete heroSkinOverrides[heroKey];
    } catch (e) {}
    try {
      if (typeof drawHeroAvatar === 'function') drawHeroAvatar(octx, x, y, heroKey, size, nowMs());
    } catch (err) {
      octx.fillStyle = '#7ee0a3';
      octx.beginPath(); octx.arc(x, y, 16, 0, Math.PI * 2); octx.fill();
    }
    try {
      if (skinId && skinId !== 'default') {
        if (had) heroSkinOverrides[heroKey] = old;
        else delete heroSkinOverrides[heroKey];
      } else if (had) {
        heroSkinOverrides[heroKey] = old;
      }
    } catch (e) {}
  }

  function draw(dt) {
    if (!overlay || !octx) return;
    clearOverlay();
    if (!E) return;
    var src = document.getElementById('gameCanvas');
    if (!src) return;
    if (overlay.width !== src.width || overlay.height !== src.height) syncOverlaySize();

    var scale = (overlay.width / Math.max(1, WIDTH)) || 1;
    octx.setTransform(scale, 0, 0, scale, 0, 0);
    octx.translate(-camX, -camY);

    // 幻影残影
    for (var g = 0; g < E.ghosts.length; g++) {
      var gh = E.ghosts[g];
      octx.save();
      octx.globalAlpha = Math.max(0, gh.life / 120) * 0.35;
      drawAvatarWithSkin(gh.x, gh.y, gh.heroKey, gh.skinId, 36);
      octx.restore();
    }
    // 影分身
    for (var c = 0; c < E.clones.length; c++) {
      var cl = E.clones[c];
      var cx = E.x + Math.cos(cl.angle) * 70;
      var cy = E.y + Math.sin(cl.angle) * 70;
      octx.save();
      octx.globalAlpha = 0.5;
      drawAvatarWithSkin(cx, cy, E.heroKey, E.skinId, 34);
      octx.restore();
    }

    // 脚下光圈，方便一眼找到队友
    octx.save();
    octx.globalAlpha = E.alive ? 0.45 : 0.2;
    octx.strokeStyle = '#7ee0a3';
    octx.lineWidth = 2;
    octx.beginPath();
    octx.arc(E.x, E.y + 12, 17, 0, Math.PI * 2);
    octx.stroke();
    octx.restore();

    if (E.alive) {
      if (E.invincibleTime > 0 && Math.floor(nowMs() / 90) % 2 === 0) octx.globalAlpha = 0.55;
      drawAvatarWithSkin(E.x, E.y, E.heroKey, E.skinId, 40);
      octx.globalAlpha = 1;
    } else {
      // 倒地：灰色轮廓 + 救援进度
      octx.globalAlpha = 0.5;
      octx.fillStyle = '#5b6b7f';
      octx.beginPath(); octx.arc(E.x, E.y, 15, 0, Math.PI * 2); octx.fill();
      octx.globalAlpha = 1;
      if (E.reviveHold > 0) {
        var rp = Math.min(1, E.reviveHold / REVIVE_HOLD);
        octx.strokeStyle = '#7ee0a3';
        octx.lineWidth = 3;
        octx.beginPath();
        octx.arc(E.x, E.y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rp);
        octx.stroke();
      }
    }

    // 审判之眼：标记最近敌人
    if (E.doomTarget && E.doomTarget.alive) {
      octx.save();
      octx.strokeStyle = '#cc44ff';
      octx.lineWidth = 2;
      octx.globalAlpha = 0.8;
      var tx = E.doomTarget.x, ty = E.doomTarget.y;
      var rr = (E.doomTarget.radius || 18) + 10;
      octx.beginPath(); octx.arc(tx, ty, rr, 0, Math.PI * 2); octx.stroke();
      octx.beginPath(); octx.moveTo(tx - rr, ty); octx.lineTo(tx + rr, ty);
      octx.moveTo(tx, ty - rr); octx.lineTo(tx, ty + rr); octx.stroke();
      octx.restore();
    }

    // 名字 + 血条
    octx.font = 'bold 11px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    octx.textAlign = 'center';
    octx.textBaseline = 'bottom';
    octx.fillStyle = E.alive ? '#a9f0c6' : '#96a3b5';
    var label = E.alive ? E.name : (E.name + ' · 待救');
    octx.fillText(label, E.x, E.y - 30);
    if (E.alive) {
      var w = 46, hh = 5, ratio = Math.max(0, Math.min(1, E.hp / E.maxHp));
      octx.fillStyle = 'rgba(0,0,0,.6)';
      octx.fillRect(E.x - w / 2, E.y - 27, w, hh);
      octx.fillStyle = '#5ee08e';
      octx.fillRect(E.x - w / 2, E.y - 27, w * ratio, hh);
      octx.strokeStyle = 'rgba(255,255,255,.5)';
      octx.lineWidth = 1;
      octx.strokeRect(E.x - w / 2, E.y - 27, w, hh);
    }
    drawFx(dt);
  }

  /* ---------- 主循环 ---------- */
  function loop() {
    var now = nowMs();
    var dt = Math.min(60, Math.max(1, now - (lastAt || now)));
    lastAt = now;
    try {
      var running = false;
      try {
        running = (typeof gameRunning !== 'undefined') && gameRunning && !!hero && (hero.alive || heroDowned) && !bothDown;
      } catch (e) { running = false; }
      if (desired && (running || bothDown)) {
        if (!ensureOverlay()) { requestAnimationFrame(loop); return; }
        if (!E) { if (running && hero) create(); }
        if (E) {
          if (running) update(dt);
          draw(dt);
        }
      } else {
        if (E) { window.__coopHero2 = null; E = null; }
        fx.length = 0;
        clearOverlay();
      }
    } catch (e) {}
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ---------- 对外接口 ---------- */
  window.__duo = {
    setDesired: function (v) {
      desired = !!v;
      if (!desired) despawn();
    },
    isDesired: function () { return desired; },
    isActive: function () { return !!E && E.alive; },
    setInput: function (x, y) {
      input.x = clamp(Number(x) || 0, -1, 1);
      input.y = clamp(Number(y) || 0, -1, 1);
      input.at = nowMs();
    },
    cast: cast,
    // 队友选英雄 / 皮肤 / 神器
    setHeroKey: function (key) {
      if (!defOf(key)) return false;
      wantedHero = key;
      try { localStorage.setItem(AUTO_KEY, key); } catch (e) {}
      if (E) {
        E.heroKey = key;
        E.cd = [0, 0, 0, 0];
        if (offers) rollOffers();
      }
      return true;
    },
    setSkin: function (id) {
      wantedSkin = String(id || '');
      try { localStorage.setItem(SKIN_KEY, wantedSkin); } catch (e) {}
      if (E) E.skinId = wantedSkin;
      return true;
    },
    setArtifact: function (key) {
      if (key && !artifactOf(key)) return false;
      wantedArtifact = String(key || '');
      try { localStorage.setItem(ART_KEY, wantedArtifact); } catch (e) {}
      // 神器只在开局生效一次；队友中途加入时也能补上
      if (E && !E.artifactApplied && artifactEnabled()) {
        E.artifact = wantedArtifact;
        if (wantedArtifact) applyArtifact();
      }
      return true;
    },
    // 队友买商店
    buy: buy,
    // 世界天气镜像（由 config.js 的天气切换调用）
    applyWeatherToAlly: applyWeatherToAlly,
    clearWeatherOnAlly: clearWeatherOnAlly,
    // 队友选本波强化
    applyBuff: applyOffer,
    // 主角血尽时由 gameloop 调用：战友还活着就先倒地待救
    tryHeroDown: function () {
      if (!E || !E.alive) return false;
      if (!hero) return false;
      heroDowned = true;
      heroRescue = 0;
      try { hero.alive = false; hero.hp = 0; } catch (e) {}
      return true;
    },
    state: function () {
      if (!E) return null;
      var now = nowMs();
      var aggro = 0;
      var nearD = -1;
      try {
        for (var i = 0; i < enemies.length; i++) {
          var en = enemies[i];
          if (!en || !en.alive) continue;
          if (en._coopTarget === E) aggro++;
          var d = Math.hypot(en.x - E.x, en.y - E.y);
          if (nearD < 0 || d < nearD) nearD = d;
        }
      } catch (e) {}
      /* 给联机队友（含鱼）的最小导航信息：最近敌人方向 + 主角坐标 */
      var nx = 0, ny = 0, hx = 0, hy = 0, shopList = [];
      try {
        var near = nearestEnemy(99999, E);
        if (near && near.e) {
          var ndx = near.e.x - E.x, ndy = near.e.y - E.y;
          var nd = Math.hypot(ndx, ndy) || 1;
          nx = ndx / nd;
          ny = ndy / nd;
        }
      } catch (e) {}
      try { if (hero) { hx = Math.round(hero.x); hy = Math.round(hero.y); } } catch (e) {}
      try {
        if (shopEnabled()) {
          var sdef = defOf(E.heroKey);
          var spool = buffPoolOf(E.heroKey) || [];
          shopList = spool.slice(0, 6).map(function (b) {
            return { id: b.id, text: fmtBuffText(b, sdef) };
          });
        }
      } catch (e) {}
      return {
        hp: Math.round(E.hp), maxHp: Math.round(E.maxHp), alive: !!E.alive,
        name: E.name, heroKey: E.heroKey, heroName: heroNameOf(E.heroKey),
        skills: skillNamesOf(E.heroKey),
        skin: E.skinId || '', artifact: E.artifact || '',
        gold: Math.round(Number(E.gold) || 0),
        x: Math.round(E.x), y: Math.round(E.y), aggro: aggro, nearD: Math.round(nearD),
        nx: Math.round(nx * 1000) / 1000, ny: Math.round(ny * 1000) / 1000,
        heroX: hx, heroY: hy, shop: shopList,
        downed: !E.alive,
        reviveHold: Math.round(E.reviveHold || 0),
        reviveIn: E.alive ? 0 : Math.max(0, Math.ceil((25000 - (now - E.downAt)) / 1000)),
        buffOpen: !!offers,
        buffs: offers ? offers.list.map(function (x) { return x.text; }) : [],
        heroDowned: heroDowned,
        heroRescue: Math.round(heroRescue || 0),
        cds: E.cd.map(function (ms) { return Math.ceil(ms / FRAME_MS); }),
      };
    },
    get entity() { return E; },
  };
})();
