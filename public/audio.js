/* 和鱼的开心导航 v5.001 · 全站音频（背景音乐 / 点击音效 / 音量与静音）
   · 只用 WebAudio 现场合成，不加载任何音频文件
   · 浏览器要求先有用户交互，所以 AudioContext 只在点击 / 按键时创建或恢复
   · 音量、静音、点击音效开关统一存在 localStorage，四页共用同一套设置
   · 页面要放背景音乐只需调用 WNAV_AUDIO.startBgm()（首页 / 五子棋 / 万象牌）
   静音 key：wnav_mute   音量 key：wnav_vol（0~1）   点击音效 key：wnav_sfx（'0' 为关） */
(function () {
  'use strict';
  var K_VOL = 'wnav_vol', K_MUTE = 'wnav_mute', K_SFX = 'wnav_sfx';
  function clamp(v, a, b) { v = Number(v); if (!isFinite(v)) return a; return Math.max(a, Math.min(b, v)); }

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

  function state() {
    return { vol: vol, muted: muted, sfxOn: sfxOn, bgm: playing, wanted: wanted };
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
    var wet = ctx.createGain(); wet.gain.value = 0.32;
    bgmBus = ctx.createGain(); bgmBus.gain.value = 0.0001;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6;
    bgmBus.connect(master); bgmBus.connect(rev); rev.connect(wet); wet.connect(master);
    sfxBus.connect(master);
    master.connect(ctx.destination);
    return ctx;
  }

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
    if (!playing || !ctx) return;
    var now = ctx.currentTime;
    if (nextAt < now + 0.1) nextAt = now + 0.15;
    while (nextAt < now + 2.2) { bar(nextAt, step); step = (step + 1) % 4; nextAt += 4.9; }
    timer = setTimeout(tick, 1200);
  }
  function fadeBgm(to, sec) {
    if (!bgmBus || !ctx) return;
    var n = ctx.currentTime;
    bgmBus.gain.cancelScheduledValues(n);
    bgmBus.gain.setValueAtTime(Math.max(0.0001, bgmBus.gain.value), n);
    bgmBus.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), n + sec);
  }

  function startBgm() {
    wanted = true;
    if (muted) return false;
    var c = ensure();
    if (!c) return false;
    if (c.state === 'suspended' && c.resume) { try { c.resume().catch(function () {}); } catch (e) {} }
    if (playing) return true;
    playing = true; step = 0; nextAt = c.currentTime + 0.2;
    fadeBgm(0.42, 1.2);
    tick();
    emit();
    return true;
  }
  function stopBgm(silent) {
    if (!playing && !wanted) { if (!silent) emit(); return; }
    playing = false;
    if (timer) { clearTimeout(timer); timer = null; }
    fadeBgm(0.0001, 0.5);
    if (!silent) emit();
  }

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
    if (muted) stopBgm(true);
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

  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { if (playing) stopBgm(true); }
    else if (wanted && !muted) { startBgm(); }
  });

  if (document.body) bindClicks();
  else document.addEventListener('DOMContentLoaded', bindClicks);

  window.WNAV_AUDIO = {
    get vol() { return vol; },
    get muted() { return muted; },
    get sfxOn() { return sfxOn; },
    get bgmOn() { return playing; },
    get clicks() { return clickCount; },
    state: state,
    ensure: ensure,
    startBgm: startBgm,
    stopBgm: stopBgm,
    click: click,
    setVol: setVol,
    setMuted: setMuted,
    toggleMute: toggleMute,
    setSfx: setSfx,
    onChange: onChange
  };
})();
