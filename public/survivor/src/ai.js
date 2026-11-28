/* ============================================================
   小鱼 · AI 驾驶层（battle-of-heroes 适配）
   ------------------------------------------------------------
   为什么不改上游源码：
     上游是 2 万行、单作用域、全局变量互相咬合的成品游戏。改它的技能/绘制/
     UI 去塞第二个角色，等于重写战斗系统。这里换一条更稳的路：
     上游的移动只读全局 keys、技能只走 useSkill(n)、每波奖励只点 .buff-btn，
     这三处就是干净的输入面。本文件只写这三处，其余一律不碰。

   两层决策（这是「丝滑」和「有想法」能同时成立的原因）：
     · 高频层（本文件，每帧）：跟随 / 清怪 / 捡掉落 / 撤退 / 打大的，
       用势场选方向，反应间隔可调；模型永远不参与逐帧操作。
     · 低频层（站点 /api/survivor/*，由 agent-bot 写）：
       数值适配器（接战距离、撤退血量、权重、绕圈方向……）、
       高层意图、升级选卡、台词。她改参数，不改手指。

   接管：
     你按 WASD / 方向键 → 立刻切手动并清掉她按住的键；
     点「我接管 / 还给她」来回切。她绝不和你抢键盘。
   ============================================================ */
(function () {
  'use strict';

  var CODE = 'main';
  var NAME = '小鱼';

  var DEFAULTS = {
    intent: 'auto', intentUntil: 0, note: '',
    engageDist: 230, retreatHp: 0.35, farmWeight: 1, killWeight: 1,
    dangerWeight: 2, pickupRange: 420, reaction: 120, strafe: 1,
    skillAggro: 0.55, autoBuff: 1
  };
  var INTENT_CN = { auto: '自己判断', clear: '清怪', farm: '捡掉落', retreat: '撤退', focus: '专打大的', idle: '待命' };

  var P = {};
  for (var k in DEFAULTS) P[k] = DEFAULTS[k];

  var mode = 'auto';           // auto | manual
  var coopHold = false;        // 联机时挂起：AI 不抢键盘、不自动选奖励
  var state = '待命';
  var lastDir = { x: 0, y: 0 };
  var lastThink = 0;
  var lastSkillAt = 0;
  var skillTick = 0;
  var lastBuffKey = '';
  var buffOpenedAt = 0;
  var serverPick = null;
  var seenLine = 0;
  var sessionId = '';
  var netOk = false;
  var lastChatAt = 0;
  var lastWave = -1;
  var lowHpSaid = false;

  var SYN = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  var MOVE_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  /* ---------- 小工具 ---------- */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function norm(x, y) { var d = Math.sqrt(x * x + y * y) || 1; return { x: x / d, y: y / d }; }
  function nowMs() { return Date.now(); }

  /* ---------- 界面 ---------- */
  var css = ''
    + '#fishPanel{position:fixed;left:14px;bottom:14px;z-index:9200;width:308px;max-width:calc(100vw - 28px);'
    + 'font:13px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#e8eef7;'
    + 'background:rgba(16,22,34,.82);border:1px solid rgba(255,255,255,.14);border-radius:12px;'
    + 'box-shadow:0 10px 30px rgba(0,0,0,.35);backdrop-filter:blur(8px);overflow:hidden}'
    + '#fishPanel.min{width:auto}'
    + '#fishPanel .fp-bar{display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,.05)}'
    + '#fishPanel .fp-dot{width:7px;height:7px;border-radius:50%;background:#7ee0a3;flex:0 0 auto}'
    + '#fishPanel .fp-dot.off{background:#8a94a6}'
    + '#fishPanel .fp-name{font-weight:600;letter-spacing:.3px}'
    + '#fishPanel .fp-state{color:#9fb0c8;font-size:12px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '#fishPanel button{cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);'
    + 'color:#dfe8f5;border-radius:7px;padding:3px 8px;font-size:12px;font-family:inherit}'
    + '#fishPanel button:hover{background:rgba(255,255,255,.12)}'
    + '#fishPanel .fp-body{padding:8px 10px 10px;display:block}'
    + '#fishPanel.min .fp-body{display:none}'
    + '#fishBubble{margin:0 0 8px;padding:6px 8px;border-left:2px solid #7ee0a3;background:rgba(126,224,163,.08);'
    + 'border-radius:0 7px 7px 0;color:#d8e8de;min-height:18px;font-size:12.5px;display:none}'
    + '#fishBubble.on{display:block}'
    + '#fishLog{max-height:74px;overflow:auto;color:#93a4bd;font-size:12px;margin-bottom:8px;line-height:1.6}'
    + '#fishLog div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '#fishPanel form{display:flex;gap:6px}'
    + '#fishPanel input{flex:1;min-width:0;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.16);'
    + 'border-radius:7px;padding:5px 8px;color:#e8eef7;font:inherit;font-size:12px;outline:none}'
    + '#fishPanel input:focus{border-color:rgba(126,224,163,.6)}'
    + '#fishPanel .fp-tools{display:flex;gap:6px;margin-top:7px}'
    + '#fishPanel .fp-tools button{flex:1;font-size:11.5px;color:#a9b8cc}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var panel = document.createElement('div');
  panel.id = 'fishPanel';
  panel.innerHTML = ''
    + '<div class="fp-bar">'
    + '  <span class="fp-dot off" id="fishDot"></span>'
    + '  <span class="fp-name">' + NAME + '</span>'
    + '  <span class="fp-state" id="fishState">待命</span>'
    + '  <button id="fishTake" type="button">我接管</button>'
    + '  <button id="fishMin" type="button" title="收起">–</button>'
    + '</div>'
    + '<div class="fp-body">'
    + '  <div id="fishBubble"></div>'
    + '  <div id="fishLog"></div>'
    + '  <form id="fishForm"><input id="fishInput" maxlength="60" placeholder="跟她说：清怪 / 捡东西 / 撤 / 打大的"><button type="submit">说</button></form>'
    + '  <div class="fp-tools"><button id="fishBuffBtn" type="button">奖励：她选</button><button id="fishAutoBtn" type="button">切到自动</button></div>'
    + '</div>';
  document.body.appendChild(panel);

  var $ = function (id) { return document.getElementById(id); };
  var dotEl = $('fishDot'), stateEl = $('fishState'), bubbleEl = $('fishBubble'), logEl = $('fishLog');

  function setState(t) {
    state = t;
    if (stateEl) stateEl.textContent = t;
  }
  function showBubble(text, keepMs) {
    if (!bubbleEl || !text) return;
    bubbleEl.textContent = text;
    bubbleEl.classList.add('on');
    clearTimeout(showBubble._t);
    showBubble._t = setTimeout(function () { bubbleEl.classList.remove('on'); }, keepMs || 5200);
  }
  function logLine(text) {
    if (!logEl || !text) return;
    var d = document.createElement('div');
    d.textContent = text;
    logEl.appendChild(d);
    while (logEl.children.length > 30) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function say(text) {
    if (!text) return;
    showBubble(text);
    logLine('她：' + text);
    post('/api/survivor/say', { code: CODE, text: text }).catch(function () {});
  }

  /* ---------- 网络 ---------- */
  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }
  function mergePolicy(src) {
    if (!src || typeof src !== 'object') return;
    if (src.policy) src = src.policy;
    for (var key in DEFAULTS) {
      if (key in src) {
        if (key === 'intent') { if (typeof src.intent === 'string') P.intent = src.intent; }
        else if (typeof src[key] === 'number' && isFinite(src[key])) P[key] = src[key];
      }
    }
    if (typeof src.intentUntil === 'number') P.intentUntil = src.intentUntil;
    if (typeof src.note === 'string') P.note = src.note;
    updateBuffBtn();
  }

  function effectiveIntent(t) {
    if (P.intent && P.intent !== 'auto' && (!P.intentUntil || t < P.intentUntil)) return P.intent;
    return 'auto';
  }

  /* ---------- 遥控按键 ---------- */
  function clearSynthetic() {
    for (var i = 0; i < SYN.length; i++) {
      try { keys[SYN[i]] = false; } catch (e) {}
    }
  }
  function setMove(d) {
    clearSynthetic();
    if (!keys) return;
    if (d.x < -0.35) keys['KeyA'] = true;
    if (d.x > 0.35) keys['KeyD'] = true;
    if (d.y < -0.35) keys['KeyW'] = true;
    if (d.y > 0.35) keys['KeyS'] = true;
  }

  /* ---------- 战场读取 ---------- */
  function aliveEnemies() {
    var out = [];
    if (!enemies || !hero) return out;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || e.hp <= 0) continue;
      out.push(e);
    }
    return out;
  }
  function nearbyEnemies(radius, max) {
    var list = aliveEnemies(), out = [];
    for (var i = 0; i < list.length; i++) {
      var d = dist(list[i], hero);
      if (d <= radius) out.push({ e: list[i], d: d });
    }
    out.sort(function (a, b) { return a.d - b.d; });
    return out.slice(0, max || 20);
  }
  function nearestPickup(radius) {
    if (!pickups || !hero) return null;
    var best = null, bd = radius;
    for (var i = 0; i < pickups.length; i++) {
      var d = dist(pickups[i], hero);
      if (d < bd) { bd = d; best = pickups[i]; }
    }
    return best;
  }
  function isBig(e) {
    return e && (e.type === 'boss' || e.type === 'emperor' || e.type === 'elite' || e.radius >= 40);
  }
  function heroIsRanged() {
    try { return !!(HERO_DEFS && HERO_DEFS[currentHero] && HERO_DEFS[currentHero].ranged); }
    catch (e) { return false; }
  }
  function hpPct() {
    if (!hero || !hero.maxHp) return 1;
    return clamp(hero.hp / hero.maxHp, 0, 1);
  }

  /* ---------- 意图与目标 ---------- */
  function pickTarget(intent, threats) {
    var t = intent;
    if (t === 'auto') {
      if (hpPct() < P.retreatHp) return { mode: 'retreat', target: null };
      var orb = (P.farmWeight > 0) ? nearestPickup(P.pickupRange) : null;
      if (orb && (!threats.length || threats[0].d > 170)) return { mode: 'farm', target: orb };
      var big = null, bd = 1e9;
      for (var i = 0; i < threats.length; i++) {
        if (isBig(threats[i].e) && threats[i].d < bd) { bd = threats[i].d; big = threats[i].e; }
      }
      if (big && bd < 520) return { mode: 'clear', target: big };
      if (threats.length) return { mode: 'clear', target: threats[0].e };
      if (orb) return { mode: 'farm', target: orb };
      return { mode: 'idle', target: null };
    }
    if (t === 'retreat') return { mode: 'retreat', target: null };
    if (t === 'farm') return { mode: 'farm', target: nearestPickup(900) };
    if (t === 'focus') {
      var best = null, dd = 1e9;
      for (var j = 0; j < threats.length; j++) {
        if (isBig(threats[j].e) && threats[j].d < dd) { dd = threats[j].d; best = threats[j].e; }
      }
      return { mode: 'focus', target: best };
    }
    if (t === 'clear') {
      if (!threats.length) return { mode: 'idle', target: null };
      return { mode: 'clear', target: threats[0].e };
    }
    return { mode: 'idle', target: null };
  }

  /* ---------- 势场选向 ---------- */
  var DIRS = (function () {
    var a = [], n = 16;
    for (var i = 0; i < n; i++) {
      var r = (Math.PI * 2 * i) / n;
      a.push({ x: Math.cos(r), y: Math.sin(r) });
    }
    return a;
  })();

  function threatCentroid(threats) {
    if (!threats.length) return null;
    var sx = 0, sy = 0, sw = 0;
    for (var i = 0; i < threats.length; i++) {
      var w = 1 / Math.max(60, threats[i].d);
      sx += threats[i].e.x * w; sy += threats[i].e.y * w; sw += w;
    }
    if (!sw) return null;
    return { x: sx / sw, y: sy / sw };
  }

  function chooseDir(plan, threats) {
    var ranged = heroIsRanged();
    var desired = null;

    if (plan.mode === 'retreat') {
      var c = threatCentroid(threats);
      if (c) {
        var ax = hero.x - c.x, ay = hero.y - c.y;
        if (!ax && !ay) { ax = -1; ay = 0; }
        desired = norm(ax, ay);
      } else {
        desired = norm(hero.x - MAP_WIDTH / 2, hero.y - MAP_HEIGHT / 2);
      }
    } else if (plan.target) {
      var dx = plan.target.x - hero.x, dy = plan.target.y - hero.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / d, uy = dy / d;
      if (ranged && (plan.mode === 'clear' || plan.mode === 'focus')) {
        if (d < P.engageDist * 0.62) { ux = -ux; uy = -uy; }            // 太近：拉开
        else if (d < P.engageDist && P.strafe) {                        // 差不多：绕圈
          var s = P.strafe > 0 ? 1 : -1;
          var tx = -uy * s, ty = ux * s;
          ux = tx; uy = ty;
        }
      }
      desired = { x: ux, y: uy };
    } else {
      // 没事干也慢慢绕，别像根木头
      var ang = (nowMs() / 2600) % (Math.PI * 2);
      desired = { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 };
    }

    var best = null, bestScore = -1e9;
    for (var i = 0; i < DIRS.length; i++) {
      var dir = DIRS[i], s = 0;

      if (desired) {
        var w = (plan.mode === 'retreat') ? 2.6 : 2.2;
        s += w * (dir.x * desired.x + dir.y * desired.y);
        if (plan.mode === 'farm') s += 0.8 * (dir.x * desired.x + dir.y * desired.y);
      }

      // 远离怪群：越近的怪权重越大
      for (var j = 0; j < threats.length; j++) {
        var th = threats[j];
        var k = Math.max(0, 1 - th.d / 460);
        if (k <= 0) continue;
        var aw = norm(hero.x - th.e.x, hero.y - th.e.y);
        s += P.dangerWeight * k * k * (dir.x * aw.x + dir.y * aw.y);
      }

      // 贴边惩罚
      var nx = hero.x + dir.x * 110, ny = hero.y + dir.y * 110;
      if (nx < 150 || nx > MAP_WIDTH - 150 || ny < 170 || ny > MAP_HEIGHT - 170) s -= 2.6;

      // 惯性：避免左右横跳
      s += 0.35 * (dir.x * lastDir.x + dir.y * lastDir.y);

      if (s > bestScore) { bestScore = s; best = dir; }
    }
    return best || { x: 0, y: 0 };
  }

  /* ---------- 技能 ---------- */
  function maybeSkill(t, threats) {
    if (P.skillAggro <= 0) return;
    var gap = 1200 - 700 * P.skillAggro;
    if (t - lastSkillAt < gap) return;
    var near = 0, boss = false;
    for (var i = 0; i < threats.length; i++) {
      if (threats[i].d <= 430) near++;
      if (isBig(threats[i].e)) boss = true;
    }
    if (!near) return;
    if (typeof useSkill !== 'function') return;
    var idx = boss ? 3 : (1 + (skillTick++ % 3));
    try {
      if (typeof skillCooldown !== 'undefined' && skillCooldown && skillCooldown[idx] > 0) return;
      useSkill(idx);
      lastSkillAt = t;
    } catch (e) {}
  }

  /* ---------- 每波奖励 ---------- */
  var BUFF_SCORE = [
    [/最大生命|生命上限|回满|回血|恢复/, 3.0],
    [/攻击/, 3.0],
    [/伤害减免/, 2.6],
    [/暴击率/, 2.4],
    [/暴击伤害/, 2.2],
    [/技能/, 2.2],
    [/移速/, 2.0]
  ];
  function heuristicPick(btns) {
    var best = 0, bs = -1;
    for (var i = 0; i < btns.length; i++) {
      var text = btns[i].textContent || '';
      var s = 1;
      for (var j = 0; j < BUFF_SCORE.length; j++) if (BUFF_SCORE[j][0].test(text)) s += BUFF_SCORE[j][1];
      if (s > bs) { bs = s; best = i; }
    }
    return best;
  }
  function maybeBuff(t) {
    if (!showingBuff) {
      lastBuffKey = ''; buffOpenedAt = 0;
      return;
    }
    if (!P.autoBuff) return;
    var btns = document.querySelectorAll('#buffButtons .buff-btn');
    if (!btns.length) return;
    var key = wave + '|' + btns.length + '|' + ((btns[0].textContent || '').slice(0, 12));
    if (key !== lastBuffKey) { lastBuffKey = key; buffOpenedAt = t; return; }
    if (t - buffOpenedAt < 700) return;   // 留一点时间给模型插手
    var idx = -1;
    if (serverPick && serverPick.round === wave && typeof serverPick.index === 'number') idx = serverPick.index;
    if (idx < 0 || idx >= btns.length) idx = heuristicPick(btns);
    var text = (btns[idx] && btns[idx].textContent) || '';
    try { btns[idx].click(); } catch (e) { return; }
    showBubble('我选：' + text);
    logLine('她选了：' + text);
  }
  function updateBuffBtn() {
    var b = $('fishBuffBtn');
    if (!b) return;
    b.textContent = P.autoBuff ? '奖励：她选' : '奖励：我选';
  }

  /* ---------- 每帧 ---------- */
  function step() {
    try {
      var t = nowMs();
      if (coopHold) return;   // 联机房间接管：她的手指先放下
      if (typeof gameRunning === 'undefined' || !hero) { setState('待命'); return; }
      if (!gameRunning) { clearSynthetic(); setState(hero && !hero.alive ? '她倒了' : '待命'); return; }
      if (gamePaused) { clearSynthetic(); setState('暂停中'); return; }
      if (showingBuff) { clearSynthetic(); setState('选奖励'); maybeBuff(t); return; }
      if (!hero.alive) { clearSynthetic(); setState('她倒了'); return; }

      if (mode === 'manual') { setState('你接管中'); return; }

      maybeBuff(t);

      if (t - lastThink < Math.max(40, P.reaction)) return;
      lastThink = t;

      var threats = nearbyEnemies(460, 20);
      var intent = effectiveIntent(t);
      var plan = pickTarget(intent, threats);
      setState((INTENT_CN[plan.mode] || '自己判断') + (P.intent !== 'auto' && (!P.intentUntil || t < P.intentUntil) ? '（听你的）' : ''));

      lastDir = chooseDir(plan, threats);
      setMove(lastDir);
      maybeSkill(t, threats);

      // 自己的小情绪（不遮住她的正事）
      if (lastWave !== wave) {
        if (lastWave >= 0 && wave > lastWave) {
          var line = '第 ' + wave + ' 波了。';
          if (wave % 5 === 0) line = '第 ' + wave + ' 波，大的要来了。';
          if (t - lastChatAt > 5000) { showBubble(line); lastChatAt = t; }
        }
        lastWave = wave;
      }
      if (hpPct() < 0.3 && !lowHpSaid) {
        lowHpSaid = true;
        if (t - lastChatAt > 4000) { showBubble('我血不多了，先撤一下。'); lastChatAt = t; }
      }
      if (hpPct() > 0.55) lowHpSaid = false;
    } catch (e) {
      // 上游变量还没准备好时静默，下一帧再试
    }
  }

  function loop() { step(); requestAnimationFrame(loop); }

  /* ---------- 快照上报 ---------- */
  function buildSnap() {
    var al = aliveEnemies();
    var ns = [], os = [];
    for (var i = 0; i < al.length; i++) {
      ns.push({ e: al[i], d: dist(al[i], hero) });
    }
    ns.sort(function (a, b) { return a.d - b.d; });
    var nearest = ns.slice(0, 6).map(function (x) {
      return { x: Math.round(x.e.x), y: Math.round(x.e.y), type: x.e.type || '', d: Math.round(x.d) };
    });
    if (pickups) {
      var ps = [];
      for (var j = 0; j < pickups.length; j++) ps.push({ p: pickups[j], d: dist(pickups[j], hero) });
      ps.sort(function (a, b) { return a.d - b.d; });
      os = ps.slice(0, 4).map(function (x) {
        return { x: Math.round(x.p.x), y: Math.round(x.p.y), type: x.p.type || '', d: Math.round(x.d) };
      });
    }
    var buffs = [];
    if (showingBuff) {
      var btns = document.querySelectorAll('#buffButtons .buff-btn');
      for (var b = 0; b < btns.length; b++) buffs.push((btns[b].textContent || '').slice(0, 40));
    }
    return {
      wave: wave,
      hp: Math.round(hero.hp),
      maxHp: Math.round(hero.maxHp),
      alive: !!hero.alive,
      state: state,
      enemies: al.length,
      elites: al.filter(isBig).length,
      boss: al.some(function (e) { return e.type === 'boss' || e.type === 'emperor'; }),
      pickups: pickups ? pickups.length : 0,
      nearest: nearest,
      orbs: os,
      buffOpen: !!showingBuff,
      buffs: buffs,
      dead: !hero.alive
    };
  }

  function sync() {
    if (typeof hero === 'undefined' || !hero) return;
    var snap;
    try { snap = buildSnap(); } catch (e) { return; }
    post('/api/survivor/state', { code: CODE, snap: snap }).then(function (j) {
      netOk = true;
      if (dotEl) dotEl.classList.remove('off');
      if (j.policy) mergePolicy(j.policy);
      if (j.sessionId) sessionId = j.sessionId;
      if (j.pick) serverPick = j.pick;
      if (Array.isArray(j.lines)) {
        for (var i = 0; i < j.lines.length; i++) {
          var l = j.lines[i];
          if (!l || !(l.id > seenLine)) continue;
          seenLine = l.id;
          if (l.text) { showBubble(l.text); logLine('她：' + l.text); }
        }
      }
    }).catch(function () {
      netOk = false;
      if (dotEl) dotEl.classList.add('off');
    });
  }

  /* ---------- 交互 ---------- */
  $('fishTake').addEventListener('click', function () {
    if (mode === 'auto') {
      mode = 'manual';
      clearSynthetic();
      this.textContent = '还给她';
      setState('你接管中');
      showBubble('你来。');
    } else {
      mode = 'auto';
      this.textContent = '我接管';
      showBubble('那我继续。');
    }
  });
  $('fishMin').addEventListener('click', function () {
    panel.classList.toggle('min');
    this.textContent = panel.classList.contains('min') ? '+' : '–';
  });
  $('fishAutoBtn').addEventListener('click', function () {
    mode = 'auto';
    $('fishTake').textContent = '我接管';
    P.intent = 'auto'; P.intentUntil = 0;
    post('/api/survivor/policy', { code: CODE, intent: 'auto', intentMs: 0 }).catch(function () {});
    showBubble('好，我自己判断。');
  });
  $('fishBuffBtn').addEventListener('click', function () {
    P.autoBuff = P.autoBuff ? 0 : 1;
    updateBuffBtn();
    post('/api/survivor/policy', { code: CODE, patch: { autoBuff: P.autoBuff } }).catch(function () {});
  });
  $('fishForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('fishInput');
    var text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    logLine('你：' + text);
    post('/api/survivor/command', { code: CODE, text: text }).then(function (j) {
      if (j.policy) mergePolicy(j.policy);
      if (j.reply) { showBubble(j.reply); logLine('她：' + j.reply); }
    }).catch(function () {
      showBubble('站点没连上，指令先记着。');
    });
  });

  // 用户一按移动键就接管（捕获阶段，先于游戏自己的 keydown）
  document.addEventListener('keydown', function (e) {
    // 正在输入指令时不算操作游戏
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (MOVE_CODES.indexOf(e.code) < 0) return;
    if (typeof gameRunning === 'undefined' || !gameRunning) return;
    if (mode === 'auto') {
      mode = 'manual';
      clearSynthetic();
      var btn = $('fishTake'); if (btn) btn.textContent = '还给她';
      setState('你接管中');
      showBubble('你来。');
    }
  }, true);

  // 面板里打字不要触发游戏的空格暂停 / 技能键
  panel.addEventListener('keydown', function (e) { e.stopPropagation(); }, false);
  panel.addEventListener('keyup', function (e) { e.stopPropagation(); }, false);

  // 重开一局：清掉上一局的意图和选卡
  document.addEventListener('click', function (e) {
    var id = e.target && e.target.id;
    if (id === 'restartBtn' || id === 'pauseRestartBtn') {
      P.intent = 'auto'; P.intentUntil = 0;
      lastWave = -1; lowHpSaid = false; serverPick = null;
      post('/api/survivor/reset', { code: CODE }).catch(function () {});
    }
  }, true);

  /* ---------- 启动 ---------- */
  updateBuffBtn();
  setState('待命');
  setInterval(sync, 700);
  loop();
  showBubble('我在，选好英雄就开始。');
  logLine('她：我在，选好英雄就开始。');
  // 暴露一点调试口子，方便以后 agent-bot / 控制台看状态
  window.__fish = {
    get policy() { return P; },
    get mode() { return mode; },
    get state() { return state; },
    setMode: function (m) { mode = m === 'manual' ? 'manual' : 'auto'; },
    hold: function (v) { coopHold = !!v; if (coopHold) clearSynthetic(); },
    get held() { return coopHold; },
    say: say
  };
})();
