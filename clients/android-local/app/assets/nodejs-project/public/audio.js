/* 和鱼的开心导航 v5.002 · 全站音频（背景音乐 / 点击音效 / 音量与静音）
   · 背景音乐：/music/ 下的真实曲目（Mixkit 免费授权），按场景轮播 + 交叉淡入淡出
   · 合成器兜底：曲子加载失败 / 离线时退回 WebAudio 现场合成，绝不静音
   · 点击音效：WebAudio 现场合成，不占带宽
   · 浏览器要求先有用户交互，所以 AudioContext 只在点击 / 按键时创建或恢复
   · 音量、静音、点击音效开关统一存在 localStorage，四页共用同一套设置
   页面要放背景音乐只需调用 WNAV_AUDIO.startBgm()（可选场景：daily / night / love / focus）
   静音 key：wnav_mute   音量 key：wnav_vol（0~1）   点击音效 key：wnav_sfx（'0' 为关）
   播放模式 key：wnav_mode（order / shuffle / repeat1） */
(function () {
  'use strict';
  var K_VOL = 'wnav_vol', K_MUTE = 'wnav_mute', K_SFX = 'wnav_sfx', K_MODE = 'wnav_mode';
  function clamp(v, a, b) { v = Number(v); if (!isFinite(v)) return a; return Math.max(a, Math.min(b, v)); }

  /* 播放模式：order 顺序 / shuffle 随机 / repeat1 单曲循环 */
  function fixMode(m) { return (m === 'shuffle' || m === 'repeat1') ? m : 'order'; }
  var playMode = fixMode(localStorage.getItem(K_MODE));

  /* 兼容 v3 的五子棋音量：老用户不用重新调 */
  var vol = (function () {
    var s = localStorage.getItem(K_VOL);
    if (s != null && s !== '') return clamp(s, 0, 1);
    var old = localStorage.getItem('wx_go_vol');
    if (old != null && old !== '') return clamp(old, 0, 1);
    return 0.7;
  })();
  var muted = localStorage.getItem(K_MUTE) === '1';
  var sfxOn = localStorage.getItem(K_SFX) !== '0';

  var ctx = null, master = null, bgmBus = null, sfxBus = null;
  var timer = null, step = 0, nextAt = 0, playing = false, wanted = false;
  var clickCount = 0;
  var listeners = [];

  var BGM_LEVEL = 0.5;      // 背景音乐总线电平（相对 master）
  var XFADE = 2.2;          // 换曲交叉淡化的时长

  var music = {
    scene: '', title: '', manifest: null, loading: null,
    tracks: {}, queue: [], idx: 0, last: ''
  };
  var usingFiles = false;
  var deck = null;          // 两个播放器轮换，实现交叉淡化
  var activeDeck = 0;
  var curIdx = -1;          // 此刻真正在放的那一副（ended 只认它）
  var errCount = 0;
  var needsGesture = false; // 自动播放被浏览器拦了，需要用户点一下

  function state() {
    return {
      vol: vol, muted: muted, sfxOn: sfxOn, bgm: playing, wanted: wanted,
      scene: music.scene, title: music.title, id: usingFiles ? music.last : '',
      source: usingFiles ? 'files' : (playing ? 'synth' : ''),
      mode: playMode, needsGesture: needsGesture
    };
  }
  function emit() {
    var s = state();
    listeners.forEach(function (fn) { try { fn(s); } catch (e) {} });
  }
  function save() {
    localStorage.setItem(K_VOL, String(vol));
    localStorage.setItem(K_MUTE, muted ? '1' : '0');
    localStorage.setItem(K_SFX, sfxOn ? '1' : '0');
  }

  function makeReverb() {
    var len = Math.floor(ctx.sampleRate * 2.0);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    var c = ctx.createConvolver(); c.buffer = buf; return c;
  }

  function ensure() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (ctx) {
      if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume().catch(function () {}); } catch (e) {} }
      return ctx;
    }
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain();
    master.gain.value = muted ? 0.0001 : Math.max(0.0001, vol);
    var rev = makeReverb();
    var wet = ctx.createGain(); wet.gain.value = 0.28;
    bgmBus = ctx.createGain(); bgmBus.gain.value = 0.0001;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6;
    bgmBus.connect(master); bgmBus.connect(rev); rev.connect(wet); wet.connect(master);
    sfxBus.connect(master);
    master.connect(ctx.destination);
    return ctx;
  }

  /* ============ 点击音效（合成，不占带宽） ============ */
  function click() {
    if (!sfxOn || muted) return false;
    var c = ensure();
    if (!c) return false;
    if (c.state === 'suspended' && c.resume) { try { c.resume().catch(function () {}); } catch (e) {} }
    try {
      var t = c.currentTime + 0.015;
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(760, t);
      o.frequency.exponentialRampToValueAtTime(420, t + 0.085);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g); g.connect(sfxBus);
      o.start(t); o.stop(t + 0.12);
      clickCount++;
      return true;
    } catch (e) { return false; }
  }

  /* ============ 兜底：WebAudio 现场合成（离线 / 曲子挂了才用） ============ */
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function note(freq, t, dur, gain, type) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0003, gain), t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bgmBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* 轻缓四小节循环：C - Am - F - G，慢铺底 + 稀疏高音 */
  var BARS = [
    { root: 48, ch: [0, 4, 7, 11] },
    { root: 45, ch: [0, 3, 7, 10] },
    { root: 41, ch: [0, 4, 7, 11] },
    { root: 43, ch: [0, 4, 7, 10] }
  ];
  function bar(t, idx) {
    var b = BARS[idx % 4];
    b.ch.forEach(function (iv, k) {
      note(midi(b.root + iv - 12), t, 5.6, k === 0 ? 0.05 : 0.028, 'sine');
    });
    note(midi(b.root - 12), t, 5.6, 0.04, 'triangle');
    [0.9, 2.0, 3.1].forEach(function (dt, k) {
      var iv = b.ch[(k + 1) % b.ch.length];
      note(midi(b.root + iv + 12), t + dt, 1.8, 0.012, 'sine');
    });
  }
  function tick() {
    if (!playing || !ctx || usingFiles) return;
    var now = ctx.currentTime;
    if (nextAt < now + 0.1) nextAt = now + 0.15;
    while (nextAt < now + 2.2) { bar(nextAt, step); step = (step + 1) % 4; nextAt += 4.9; }
    timer = setTimeout(tick, 1200);
  }

  /* ============ 背景音乐：真实曲目轮播 ============ */
  function sceneByClock() {
    var h = new Date().getHours();
    if (h >= 23 || h < 6) return 'night';
    if (h >= 18) return 'love';
    return 'daily';
  }

  function loadManifest() {
    if (music.manifest) return Promise.resolve(music.manifest);
    if (music.loading) return music.loading;
    music.loading = fetch('/music/manifest.json', { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.tracks || !j.scenes) throw new Error('manifest 格式不对');
        music.manifest = j;
        for (var i = 0; i < j.tracks.length; i++) music.tracks[j.tracks[i].id] = j.tracks[i];
        return j;
      })
      .catch(function () { music.loading = null; return null; });
    return music.loading;
  }

  function buildQueue(scene) {
    var j = music.manifest;
    if (!j) return [];
    var ids = j.scenes[scene] || j.scenes.daily || [];
    var q = [];
    for (var i = 0; i < ids.length; i++) if (music.tracks[ids[i]]) q.push(music.tracks[ids[i]]);
    /* 顺序模式：保持清单原顺序；随机模式：洗牌，但别让同一首连着放 */
    if (playMode === 'shuffle') {
      for (var k = q.length - 1; k > 0; k--) {
        var r = Math.floor(Math.random() * (k + 1)); var t = q[k]; q[k] = q[r]; q[r] = t;
      }
      if (q.length > 1 && q[0].id === music.last) { var t2 = q[0]; q[0] = q[1]; q[1] = t2; }
    }
    return q;
  }

  function mkDeck() {
    var el = new Audio();
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    var g = null;
    try {
      if (ctx) {
        var src = ctx.createMediaElementSource(el);
        g = ctx.createGain(); g.gain.value = 0.0001;
        src.connect(g); g.connect(bgmBus);
      }
    } catch (e) { g = null; }
    return { el: el, gain: g, killTimer: null };
  }

  function fadeGain(g, el, to, sec) {
    if (!g || !ctx) { try { el.volume = Math.min(1, to); } catch (e) {} return; }
    var n = ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), n + sec);
    } catch (e) { try { g.gain.value = to; } catch (e2) {} }
  }

  function playTrack(track) {
    if (!track) return false;
    if (!deck) {
      deck = [mkDeck(), mkDeck()];
      /* 注意：监听里比的是 curIdx（正在放的那一副），不是 activeDeck。
       * activeDeck 在开播后立刻翻到下一副，用它判断的话 ended 永远对不上，
       * 一首放完就再也不会自动往下走。 */
      deck.forEach(function (d, i) {
        d.el.addEventListener('ended', function () { if (i === curIdx) nextTrack(); });
        d.el.addEventListener('error', function () { if (i === curIdx) onTrackError(); });
      });
    }
    var cur = deck[activeDeck];
    var old = deck[1 - activeDeck];
    curIdx = activeDeck;
    /* 两副 deck 轮换：上一轮留给这一副的「清理定时器」必须取消，
     * 否则快速切歌时 2.4 秒后会把刚起播的这首 pause 掉 → 表现成「点了没声」。 */
    if (cur.killTimer) { clearTimeout(cur.killTimer); cur.killTimer = null; }
    try {
      cur.el.src = '/music/' + track.file;
      cur.el.load();
    } catch (e) { return false; }
    var p = cur.el.play();
    if (p && p.catch) {
      p.catch(function (err) {
        /* AbortError = 我们自己又 load() 打断了上一次 play()（快速切歌），
         * 不是曲目坏，绝不能算进 errCount —— 否则连点几下就掉进合成器兜底，
         * 而旧歌其实还在响，界面和声音就对不上了。 */
        if (err && err.name === 'AbortError') return;
        /* 自动播放被拦不算文件坏；其他错误才跳过这首 */
        if (!err || err.name !== 'NotAllowedError') onTrackError();
        else { needsGesture = true; emit(); }
      });
    }
    if (p && p.then) p.then(function () { if (needsGesture) { needsGesture = false; emit(); } }, function () {});
    fadeGain(cur.gain, cur.el, 1, XFADE * 0.6);
    fadeGain(old.gain, old.el, 0.0001, XFADE);
    old.killTimer = setTimeout(function () {
      old.killTimer = null;
      try { old.el.pause(); old.el.removeAttribute('src'); } catch (e) {}
    }, XFADE * 1000 + 200);
    activeDeck = 1 - activeDeck;
    music.title = track.title || track.id;
    music.last = track.id;
    usingFiles = true;
    if (timer) { clearTimeout(timer); timer = null; }
    emit();
    return true;
  }

  function nextTrack() {
    if (!playing || muted) return;
    if (!music.queue.length) music.queue = buildQueue(music.scene);
    if (!music.queue.length) { fallbackSynth(); return; }
    /* 单曲循环：重放当前这首，不前进 */
    if (playMode === 'repeat1' && music.queue[music.idx]) {
      if (!playTrack(music.queue[music.idx])) fallbackSynth();
      return;
    }
    /* 随机：取一首和当前不同的（队列只有一首就重放它） */
    if (playMode === 'shuffle') {
      var n = music.queue.length;
      if (n === 1) { music.idx = 0; }
      else {
        var curId = music.queue[music.idx] && music.queue[music.idx].id;
        var ni = music.idx;
        for (var k = 0; k < 12 && (ni === music.idx || music.queue[ni].id === curId); k++) {
          ni = Math.floor(Math.random() * n);
        }
        if (ni === music.idx) ni = (music.idx + 1) % n;
        music.idx = ni;
      }
      if (!playTrack(music.queue[music.idx])) fallbackSynth();
      return;
    }
    music.idx = (music.idx + 1) % music.queue.length;
    if (!playTrack(music.queue[music.idx])) fallbackSynth();
  }

  /* ---- 播放模式 ---- */
  function getPlayMode() { return playMode; }
  function setPlayMode(m) {
    var next = fixMode(m);
    if (next === playMode) { emit(); return playMode; }
    playMode = next;
    try { localStorage.setItem(K_MODE, playMode); } catch (e) {}
    /* 切回顺序：按清单原顺序重建队列，但不动正在放的那首 */
    if (playMode === 'order' && music.manifest) {
      var q = buildQueue(music.scene);
      if (q.length) {
        music.queue = q;
        music.idx = 0;
        for (var i = 0; i < q.length; i++) if (q[i].id === music.last) { music.idx = i; break; }
      }
    }
    emit();
    return playMode;
  }

  /* 只有真正的媒体错误（曲目 404 / 解码失败）才会走到这里。
   * play() 被自己打断的 AbortError 已在 playTrack 里 return 掉，不会累加 errCount。 */
  function onTrackError() {
    errCount++;
    if (errCount >= 3) { fallbackSynth(); return; }
    nextTrack();
  }

  function fadeBgm(to, sec) {
    if (!bgmBus || !ctx) return;
    var n = ctx.currentTime;
    bgmBus.gain.cancelScheduledValues(n);
    bgmBus.gain.setValueAtTime(Math.max(0.0001, bgmBus.gain.value), n);
    bgmBus.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), n + sec);
  }

  function fallbackSynth() {
    /* 先把两副 deck 真正停掉：否则切进合成器后界面显示「合成器兜底 / 标题 —」，
     * 耳朵里其实还是上一首文件在放（还会跟着静音状态一起漏音）。 */
    if (deck) {
      deck.forEach(function (d) {
        if (d.killTimer) { clearTimeout(d.killTimer); d.killTimer = null; }
        try { d.el.pause(); } catch (e) {}
        try { d.el.removeAttribute('src'); } catch (e) {}
      });
      curIdx = -1;
    }
    if (!ctx || muted || !playing) return;
    usingFiles = false;
    music.title = '';
    step = 0; nextAt = ctx.currentTime + 0.2;
    fadeBgm(BGM_LEVEL * 0.8, 1.2);
    tick();
    emit();
  }

  function startBgm(scene) {
    wanted = true;
    if (muted) return false;
    var c = ensure();
    if (!c) return false;
    if (c.state === 'suspended' && c.resume) { try { c.resume().catch(function () {}); } catch (e) {} }
    music.scene = scene || music.scene || sceneByClock();
    if (playing) return true;
    playing = true;
    errCount = 0;
    fadeBgm(BGM_LEVEL, 1.2);
    emit();

    loadManifest().then(function (j) {
      if (!playing || muted) return;
      if (!j) { fallbackSynth(); return; }
      music.queue = buildQueue(music.scene);
      music.idx = 0;
      if (!playTrack(music.queue[0])) fallbackSynth();
    });
    return true;
  }

  function setScene(scene) {
    if (!scene || scene === music.scene) return;
    music.scene = scene;
    music.queue = buildQueue(scene);
    music.idx = 0;
    if (playing && !muted && music.queue[0]) playTrack(music.queue[0]);
    emit();
  }

  /* ---- 手动选歌（页面上的「♪」面板用） ---- */
  function trackList() {
    return music.manifest ? music.manifest.tracks.slice() : [];
  }

  function playById(id) {
    var t = music.tracks[id];
    if (!t) return false;
    if (muted) setMuted(false);
    if (!music.scene) music.scene = sceneByClock();
    /* 手动点的这首放队首，后面接当前场景的其余曲目（否则「下一首」只会重放这一首） */
    var rest = buildQueue(music.scene).filter(function (x) { return x.id !== id; });
    music.queue = [t].concat(rest);
    music.idx = 0;
    if (!playing) {
      /* 不走 startBgm：它是异步拉清单再放第一首，会把这一首顶掉 */
      var c = ensure();
      if (!c) return false;
      if (c.state === 'suspended' && c.resume) { try { c.resume().catch(function () {}); } catch (e) {} }
      wanted = true; playing = true; errCount = 0;
      fadeBgm(BGM_LEVEL, 1.2);
      return playTrack(t);
    }
    return playTrack(t);
  }

  function next() {
    if (muted) setMuted(false);
    if (!playing) return startBgm();
    nextTrack();
    return true;
  }

  function prev() {
    if (!playing || muted) return false;
    if (!music.queue.length) return false;
    music.idx = (music.idx - 1 + music.queue.length) % music.queue.length;
    return playTrack(music.queue[music.idx]);
  }

  function stopBgm(silent) {
    if (!playing && !wanted) { if (!silent) emit(); return; }
    playing = false;
    wanted = false;
    if (timer) { clearTimeout(timer); timer = null; }
    if (deck) {
      deck.forEach(function (d) {
        if (d.killTimer) { clearTimeout(d.killTimer); d.killTimer = null; }
        fadeGain(d.gain, d.el, 0.0001, 0.4);
        try { d.el.pause(); d.el.removeAttribute('src'); } catch (e) {}
      });
    }
    fadeBgm(0.0001, 0.6);
    if (!silent) emit();
  }

  /* ============ 音量 / 静音 ============ */
  function applyMaster() {
    if (!ctx || !master) return;
    var n = ctx.currentTime;
    master.gain.cancelScheduledValues(n);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), n);
    master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : Math.max(0.0001, vol), n + 0.2);
  }

  function setVol(v) {
    vol = clamp(v, 0, 1);
    save(); applyMaster(); emit();
    return vol;
  }
  function setMuted(m) {
    muted = !!m;
    save();
    if (muted) { var keep = wanted; stopBgm(true); wanted = keep; }
    else if (wanted) startBgm();
    applyMaster(); emit();
    return muted;
  }
  function toggleMute() { return setMuted(!muted); }
  function setSfx(on) { sfxOn = !!on; save(); emit(); return sfxOn; }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  /* 全站点击音效：按钮 / 链接 / role=button；棋盘格与显式 data-nosfx 除外 */
  function bindClicks() {
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('button, a[href], [role="button"]') : null;
      if (!t) return;
      if (t.getAttribute('data-nosfx') === 'true') return;
      if (t.classList && (t.classList.contains('cell') || t.classList.contains('grid'))) return;
      click();
    }, true);
  }

  /* 切到后台就停，回来接着放（手机省电，也避免 iOS 切回来不响） */
  document.addEventListener('visibilitychange', function () {
    if (!ctx && !deck) return;
    if (document.hidden) { if (playing) stopBgm(true); wanted = true; }
    else if (wanted && !muted) { startBgm(); }
  });

  if (document.body) bindClicks();
  else document.addEventListener('DOMContentLoaded', bindClicks);

  window.WNAV_AUDIO = {
    get vol() { return vol; },
    get muted() { return muted; },
    get sfxOn() { return sfxOn; },
    get bgmOn() { return playing; },
    get bgmTitle() { return music.title; },
    get clicks() { return clickCount; },
    get mode() { return playMode; },
    state: state,
    ensure: ensure,
    startBgm: startBgm,
    stopBgm: stopBgm,
    setScene: setScene,
    loadManifest: loadManifest,
    tracks: trackList,
    playById: playById,
    next: next,
    prev: prev,
    click: click,
    setVol: setVol,
    setMuted: setMuted,
    toggleMute: toggleMute,
    setSfx: setSfx,
    getPlayMode: getPlayMode,
    setPlayMode: setPlayMode,
    onChange: onChange
  };
})();
