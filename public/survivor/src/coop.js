/* ============================================================
   「并肩割草」· 联机（coop.js）
   ------------------------------------------------------------
   两个人各自用设备打开 /survivor/，输入同一个房间号：
     · 房主（开房）：本机照常跑游戏。上游单主角不改，房主把自己的画布
       压成小图，连同血/波次/奖励一起推给服务器。
     · 队友（加入）：拿到房主画面 + 局面摘要，自己的方向/技能/奖励操作
       通过服务器转给房主，作用在同一个英雄身上。
     · 聊天频道：两人共用一个房间聊天，消息落盘。

   网络与房间完全沿用站点已有的做法：房间码、限 2 人、SSE 推送、轮询兜底。
   画面中继是这个游戏特有的（它是 Canvas 实时游戏，不像棋类可以只同步棋盘），
   但通道仍是同一套 SSE，不另起协议。

   联机期间 AI 挂起（window.__fish.hold(true)），避免她跟人抢键盘、抢选奖励；
   离开房间后恢复。
   ============================================================ */
(function () {
  'use strict';

  var PID = localStorage.getItem('sv_pid');
  if (!PID) {
    PID = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('sv_pid', PID);
  }

  var S = {
    joined: false,
    code: '',
    name: localStorage.getItem('sv_name') || '',
    seat: -1,
    isHost: false,
    hostPid: '',
    hostOnline: false,
    fishInvite: false,
    users: [],
    chat: [],
    state: null,
    joinedAt: 0,
  };
  var es = null;
  var seenChat = 0;
  var host = { streamTimer: null, posting: false, tick: 0, capQ: 0.55, capLast: 0, capW: 0, capH: 0 };
  var guest = {
    active: false, dir: { x: 0, y: 0 }, held: { up: false, down: false, left: false, right: false },
    frame: null, frameAt: 0, lastStateAt: 0, unread: 0, lastSent: 0, sendTimer: null, buffSig: '', img: null,
    lastMoveAt: 0,
  };
  var panelEl = null, fabEl = null, modalEl = null, guestEl = null;
  var fishOn = false;   /* 每次开局前由玩家重新选择，默认不加入 */

  function $(id) { return document.getElementById(id); }
  function enc(s) { return encodeURIComponent(String(s == null ? '' : s)); }
  function sv(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json(); });
  }
  function toast(text, bad) {
    var d = document.createElement('div');
    d.className = 'coop-toast' + (bad ? ' bad' : '');
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add('out'); }, 2400);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3000);
  }

  /* ================= 样式 ================= */
  var css = `
  .coop-fab{position:fixed;right:12px;top:10px;z-index:9310;cursor:pointer;
    border:1px solid rgba(255,255,255,.22);border-radius:9px;padding:6px 11px;
    background:rgba(16,22,34,.78);color:#e8eef7;font:12.5px/1.3 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
    box-shadow:0 6px 18px rgba(0,0,0,.35);backdrop-filter:blur(8px)}
  .coop-fab:hover{background:rgba(46,120,90,.55)}
  .coop-fab .d{display:inline-block;width:7px;height:7px;border-radius:50%;background:#7ee0a3;margin-right:6px;vertical-align:1px}
  .coop-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9700;
    background:rgba(16,22,34,.94);color:#e8eef7;border:1px solid rgba(255,255,255,.16);border-radius:9px;
    padding:8px 14px;font:13px/1.4 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
    box-shadow:0 10px 26px rgba(0,0,0,.4);transition:opacity .35s,transform .35s;max-width:86vw}
  .coop-toast.out{opacity:0;transform:translate(-50%,8px)}
  .coop-toast.bad{border-color:rgba(255,120,120,.5);color:#ffd9d9}

  .coop-modal{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;
    background:rgba(4,8,14,.66);backdrop-filter:blur(3px);
    font:13px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#e8eef7}
  .coop-card{width:360px;max-width:94vw;background:rgba(18,25,38,.98);border:1px solid rgba(255,255,255,.15);
    border-radius:15px;box-shadow:0 24px 60px rgba(0,0,0,.5);padding:16px 16px 14px;position:relative}
  .coop-card h3{margin:0 0 4px;font-size:16px;letter-spacing:.5px}
  .coop-card p{margin:0 0 12px;color:#93a4bd;font-size:12px;line-height:1.6}
  .coop-card .x{position:absolute;right:10px;top:8px;background:none;border:0;color:#8b9ab0;font-size:18px;cursor:pointer}
  .coop-card label{display:block;font-size:12px;color:#9fb0c8;margin:9px 0 4px}
  .coop-card input{width:100%;box-sizing:border-box;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.16);
    border-radius:8px;padding:8px 10px;color:#e8eef7;font:13px/1.3 inherit;outline:none}
  .coop-card input:focus{border-color:rgba(126,224,163,.6)}
  .coop-card .btns{display:flex;gap:8px;margin-top:14px}
  .coop-card button{flex:1;cursor:pointer;border:1px solid rgba(255,255,255,.18);border-radius:8px;
    padding:9px 8px;background:rgba(255,255,255,.06);color:#dfe8f5;font:13px/1.2 inherit}
  .coop-card button:hover{background:rgba(255,255,255,.12)}
  .coop-card button.primary{background:rgba(46,120,90,.85);border-color:rgba(126,224,163,.45)}
  .coop-card button.primary:hover{background:rgba(56,142,106,.95)}
  .coop-card .err{color:#ff9d9d;font-size:12px;min-height:16px;margin-top:8px}
  .coop-card .seg{display:flex;gap:4px;padding:3px;border:1px solid rgba(255,255,255,.14);
    border-radius:9px;background:rgba(0,0,0,.22)}
  .coop-card .seg button{flex:1;padding:6px 4px;border:0;border-radius:6px;background:transparent;
    font-size:12px;color:#9fb0c8;box-shadow:none}
  .coop-card .seg button.on{background:rgba(46,120,90,.75);color:#eafff2}
  .coop-card .hint{font-size:11px;color:#7f8da4;margin:4px 0 0;line-height:1.5}

  .coop-panel{position:fixed;right:12px;top:10px;z-index:9310;width:308px;max-width:calc(100vw - 24px);
    font:12.5px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#e8eef7;
    background:rgba(16,22,34,.9);border:1px solid rgba(255,255,255,.14);border-radius:12px;
    box-shadow:0 10px 30px rgba(0,0,0,.35);backdrop-filter:blur(8px);overflow:hidden}
  .coop-panel .cp-bar{display:flex;align-items:center;gap:7px;padding:7px 10px;background:rgba(255,255,255,.05)}
  .cp-dot{width:7px;height:7px;border-radius:50%;background:#7ee0a3;flex:0 0 auto}
  .cp-dot.off{background:#8a94a6}
  .cp-title{font-weight:600}
  .cp-state{flex:1;min-width:0;color:#9fb0c8;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .coop-panel button{cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);
    color:#dfe8f5;border-radius:7px;padding:3px 8px;font-size:11.5px;font-family:inherit}
  .coop-panel button:hover{background:rgba(255,255,255,.12)}
  .cp-body{padding:9px 10px 10px}
  .cp-roomline{display:flex;align-items:center;gap:7px;margin-bottom:7px}
  .cp-roomline b{font-size:15px;letter-spacing:2px;color:#c8f2d8}
  .cp-roomline .role{font-size:11px;color:#9fb0c8;flex:1}
  .cp-users{display:flex;flex-direction:column;gap:3px;margin-bottom:7px}
  .cp-users .u{display:flex;align-items:center;gap:6px;color:#cfdcec}
  .cp-users .u i{width:6px;height:6px;border-radius:50%;background:#7ee0a3;display:inline-block}
  .cp-users .u i.off{background:#77839a}
  .cp-users .u em{font-style:normal;color:#7ee0a3;font-size:10.5px;border:1px solid rgba(126,224,163,.4);border-radius:4px;padding:0 4px}
  .cp-chat{height:118px;overflow:auto;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.08);
    border-radius:8px;padding:6px 8px;font-size:12px;line-height:1.55;margin-bottom:7px}
  .cp-chat .m{margin-bottom:3px;word-break:break-word}
  .cp-chat .m b{color:#9fd8b8;font-weight:600;margin-right:5px}
  .cp-chat .m.sys{color:#7f8da4;text-align:center;font-size:11px}
  .cp-chat .empty{color:#6f7d92;text-align:center;font-size:11px;padding-top:38px}
  .coop-panel form{display:flex;gap:6px;margin-bottom:7px}
  .coop-panel form input{flex:1;min-width:0;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.16);
    border-radius:7px;padding:5px 8px;color:#e8eef7;font:12px/1.3 inherit;outline:none}
  .cp-foot{display:flex;align-items:center;gap:7px}
  .cp-foot .note{flex:1;color:#8090a8;font-size:11px;line-height:1.4}

  /* ---------- 队友端全屏 ---------- */
  .coop-guest{position:fixed;inset:0;z-index:9600;display:flex;flex-direction:column;background:#070b12;
    font:13px/1.4 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#e8eef7;overflow:hidden}
  .cg-top{display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(18,25,38,.96);
    border-bottom:1px solid rgba(255,255,255,.1);flex:0 0 auto}
  .cg-top .dot{width:8px;height:8px;border-radius:50%;background:#7ee0a3;flex:0 0 auto}
  .cg-top .dot.off{background:#e07070}
  .cg-top .room{font-weight:700;letter-spacing:2px;color:#c8f2d8}
  .cg-top .who{color:#9fb0c8;font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cg-top .sp{flex:1}
  .cg-top button{cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);
    color:#dfe8f5;border-radius:7px;padding:4px 9px;font:12px/1.2 inherit}
  .cg-top button:hover{background:rgba(255,255,255,.13)}
  .cg-stage{position:relative;flex:1;min-height:0;background:#000}
  .cg-stage canvas{display:block;width:100%;height:100%}
  .cg-hud{position:absolute;left:10px;top:9px;pointer-events:none;text-shadow:0 1px 4px rgba(0,0,0,.9)}
  .cg-hud .hname{font-size:12px;color:#d7e6f5;margin-bottom:4px}
  .cg-hp{width:190px;max-width:46vw;height:11px;border-radius:6px;background:rgba(0,0,0,.6);
    border:1px solid rgba(255,255,255,.22);overflow:hidden;position:relative}
  .cg-hp i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#e05252,#ff8a5c);transition:width .15s}
  .cg-hp span{position:absolute;inset:0;font-size:9.5px;text-align:center;line-height:11px;color:#fff}
  .cg-wave{margin-top:4px;font-size:11.5px;color:#c8d6e6}
  .cg-wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    background:rgba(4,8,14,.58);color:#cfdcec;font-size:14px;letter-spacing:1px;text-align:center;padding:20px}
  .cg-wait.hide{display:none}
  .cg-buffs{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:none;flex-wrap:wrap;
    gap:7px;justify-content:center;width:min(92%,640px)}
  .cg-buffs button{cursor:pointer;border:1px solid rgba(126,224,163,.5);background:rgba(26,52,40,.94);
    color:#dff5e8;border-radius:9px;padding:8px 11px;font:12.5px/1.35 inherit;min-width:110px;max-width:48%}
  .cg-buffs button:hover{background:rgba(40,78,60,.98)}
  .cg-buffs button:disabled{opacity:.45;cursor:default}
  .cg-bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:10px 12px 14px;
    background:rgba(18,25,38,.96);border-top:1px solid rgba(255,255,255,.08);flex:0 0 auto}
  .cg-pad{display:grid;grid-template-columns:repeat(3,50px);grid-template-rows:repeat(3,50px);gap:5px;flex:0 0 auto}
  .cg-pad button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#dbe7f5;
    border-radius:11px;font-size:17px;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
  .cg-pad button.on{background:rgba(126,224,163,.35);border-color:rgba(126,224,163,.7)}
  .cg-pad .up{grid-area:1/2}.cg-pad .left{grid-area:2/1}.cg-pad .right{grid-area:2/3}.cg-pad .down{grid-area:3/2}
  .cg-skills{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;flex:1;max-width:430px}
  .cg-skills button{position:relative;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);
    color:#dbe7f5;border-radius:10px;padding:10px 4px 8px;font-size:15px;cursor:pointer;min-width:0}
  .cg-skills button small{display:block;font-size:9.5px;color:#93a4bd;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cg-skills button .cd{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    background:rgba(4,8,14,.66);border-radius:9px;font-size:15px;color:#ffd9a0}
  .cg-skills button:disabled{cursor:default}
  .cg-chat-pane{position:absolute;right:0;top:0;bottom:0;width:min(340px,92vw);z-index:20;display:flex;flex-direction:column;
    background:rgba(14,20,30,.98);border-left:1px solid rgba(255,255,255,.12);transform:translateX(102%);
    transition:transform .22s ease;box-shadow:-12px 0 30px rgba(0,0,0,.35)}
  .cg-chat-pane.on{transform:translateX(0)}
  .cg-chat-head{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.1)}
  .cg-chat-head b{flex:1;font-size:13px}
  .cg-chat-list{flex:1;overflow:auto;padding:8px 10px;font-size:12.5px;line-height:1.55}
  .cg-chat-list .m{margin-bottom:4px;word-break:break-word}
  .cg-chat-list .m b{color:#9fd8b8;font-weight:600;margin-right:5px}
  .cg-chat-list .m.sys{color:#7f8da4;text-align:center;font-size:11px}
  .cg-chat-list .empty{color:#6f7d92;text-align:center;font-size:11px;padding-top:60px}
  .cg-chat-pane form{display:flex;gap:6px;padding:8px 10px 12px;border-top:1px solid rgba(255,255,255,.08)}
  .cg-chat-pane input{flex:1;min-width:0;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.16);
    border-radius:8px;padding:7px 9px;color:#e8eef7;font:12.5px/1.3 inherit;outline:none}
  .cg-chat-pane button{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#dfe8f5;
    border-radius:8px;padding:7px 11px;font:12.5px/1.2 inherit;cursor:pointer}
  .cg-hero{position:absolute;inset:0;z-index:26;display:none;background:rgba(6,10,16,.94);padding:16px;overflow:auto}
  .cg-hero.on{display:block}
  .cg-hero h4{margin:0 0 4px;font-size:15px;color:#d7e6f5}
  .cg-hero p{margin:0 0 12px;font-size:11.5px;color:#93a4bd}
  .cg-hero .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}
  .cg-hero .grid button{padding:11px 6px;border-radius:10px;border:1px solid rgba(255,255,255,.18);
    background:rgba(255,255,255,.06);color:#dbe7f5;font:13px/1.3 inherit;cursor:pointer}
  .cg-hero .grid button:hover{background:rgba(126,224,163,.22);border-color:rgba(126,224,163,.6)}
  .cg-hero .grid button small{display:block;font-size:10px;color:#93a4bd;margin-top:3px}
  .cg-hero .x{position:absolute;right:12px;top:10px;background:none;border:0;color:#8b9ab0;font-size:22px;cursor:pointer}
  .cg-hero h5{margin:16px 0 3px;font-size:13px;color:#a9d8ff}
  .cg-hero .hint{margin:0 0 8px;font-size:10.5px;color:#7f8da4}
  .cg-shop{position:absolute;inset:0;z-index:24;display:none;background:rgba(6,10,16,.93);padding:16px;overflow:auto}
  .cg-shop.on{display:block}
  .cg-shop h4{margin:0 0 4px;font-size:15px;color:#ffe6a8}
  .cg-shop .gold{color:#ffd76b;font-size:13px;margin:0 0 10px}
  .cg-shop .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
  .cg-shop .grid button{padding:10px 8px;border-radius:9px;border:1px solid rgba(255,215,107,.35);
    background:rgba(60,46,18,.55);color:#ffeccb;font:12.5px/1.35 inherit;cursor:pointer;text-align:left}
  .cg-shop .grid button:hover{background:rgba(96,74,28,.7)}
  .cg-shop .grid button:disabled{opacity:.45;cursor:default}
  .cg-shop .cost{display:block;font-size:10.5px;color:#ffd76b;margin-top:4px}
  .cg-shop .note{margin-top:10px;font-size:11px;color:#8b9ab0}
  .cg-chat-btn{position:relative}
  .cg-chat-btn .badge{position:absolute;right:-5px;top:-5px;background:#e05252;color:#fff;border-radius:9px;
    font-size:9px;padding:0 4px;line-height:14px;min-width:14px}
  @media (max-width:560px){
    .cg-pad{grid-template-columns:repeat(3,44px);grid-template-rows:repeat(3,44px)}
    .cg-skills button{font-size:13px;padding:8px 2px 6px}
    .cg-hp{width:140px}
    .cg-bottom{padding:8px 8px 12px;gap:7px}
  }
  `;

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ================= 聊天 ================= */
  function activeChatEl() {
    if (guest.active && $('cgChatList')) return $('cgChatList');
    return $('cpChat');
  }
  function chatEmpty(el) {
    if (!el) return;
    el.innerHTML = '<div class="empty">还没有人说话</div>';
  }
  function appendChatDom(msg) {
    var el = activeChatEl();
    if (!el || !msg) return;
    var empty = el.querySelector('.empty');
    if (empty) el.removeChild(empty);
    var d = document.createElement('div');
    if (msg.type === 'sys') {
      d.className = 'm sys';
      d.textContent = msg.text || '';
    } else {
      d.className = 'm';
      var b = document.createElement('b');
      b.textContent = (msg.name || '玩家') + '：';
      d.appendChild(b);
      d.appendChild(document.createTextNode(msg.text || ''));
    }
    el.appendChild(d);
    while (el.children.length > 120) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }
  function addChat(msg) {
    if (!msg || !msg.id || msg.id <= seenChat) return;
    seenChat = msg.id;
    S.chat.push(msg);
    if (S.chat.length > 160) S.chat.splice(0, S.chat.length - 160);
    appendChatDom(msg);
    if (guest.active && msg.type !== 'sys' && msg.name && msg.name !== S.name) {
      var pane = $('cgChatPane');
      if (!pane || !pane.classList.contains('on')) {
        guest.unread++;
        var badge = $('cgChatBadge');
        if (badge) { badge.textContent = guest.unread > 9 ? '9+' : String(guest.unread); badge.style.display = ''; }
      }
    }
  }
  function resetChat(msgs) {
    seenChat = 0;
    S.chat = [];
    var el = activeChatEl();
    if (el) el.innerHTML = '';
    var list = Array.isArray(msgs) ? msgs : [];
    if (!list.length) { chatEmpty(el); return; }
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || !m.id) continue;
      seenChat = Math.max(seenChat, m.id);
      S.chat.push(m);
      appendChatDom(m);
    }
    var el2 = activeChatEl();
    if (el2) el2.scrollTop = el2.scrollHeight;
  }
  function sendChat(text) {
    text = String(text || '').trim();
    if (!text) return;
    if (!S.joined) { toast('先加入房间'); return; }
    post('/api/survivor/room/chat', { code: S.code, pid: PID, text: text }).then(function (j) {
      if (j && j.msg) addChat(j.msg);
      else if (j && j.error) toast(j.error, true);
    }).catch(function () { toast('聊天没发出去，检查一下网络', true); });
  }

  /* ================= 房间面板（房主/未加入） ================= */
  function buildUI() {
    fabEl = document.createElement('button');
    fabEl.className = 'coop-fab';
    fabEl.type = 'button';
    fabEl.innerHTML = '<span class="d"></span>联机';
    fabEl.addEventListener('click', openModal);
    document.body.appendChild(fabEl);

    modalEl = document.createElement('div');
    modalEl.className = 'coop-modal';
    modalEl.style.display = 'none';
    modalEl.innerHTML = `
      <div class="coop-card">
        <button class="x" type="button" id="coopClose">×</button>
        <h3>两个人，一局割草</h3>
        <p>各自用设备打开本页。一个人开房跑游戏，另一个人输入同一个房间号加入，画面和操作会同步。</p>
        <label>房间号</label>
        <input id="coopCode" maxlength="12" placeholder="例如 FISH01" autocomplete="off">
        <label>你的昵称</label>
        <input id="coopName" maxlength="12" placeholder="玩家" autocomplete="off">
        <label>小鱼</label>
        <div class="seg" id="coopFishSeg">
          <button type="button" data-fish="0" class="on">不加入</button>
          <button type="button" data-fish="1">当队友</button>
        </div>
        <p class="hint">只有「开房」时生效：选了以后，小鱼会作为独立英雄加入你的队伍。</p>
        <div class="err" id="coopErr"></div>
        <div class="btns">
          <button class="primary" type="button" id="coopHost">开房（我来跑）</button>
          <button type="button" id="coopGuest">加入房间</button>
        </div>
      </div>`;
    modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeModal(); });
    document.body.appendChild(modalEl);
    modalEl.addEventListener('keydown', function (e) { e.stopPropagation(); }, false);
    modalEl.addEventListener('keyup', function (e) { e.stopPropagation(); }, false);

    panelEl = document.createElement('div');
    panelEl.className = 'coop-panel';
    panelEl.style.display = 'none';
    panelEl.innerHTML = `
      <div class="cp-bar">
        <span class="cp-dot" id="cpDot"></span>
        <span class="cp-title">联机</span>
        <span class="cp-state" id="cpState">准备中</span>
        <button type="button" id="cpMin">–</button>
      </div>
      <div class="cp-body" id="cpBody">
        <div class="cp-roomline"><b id="cpCode">----</b><span class="role" id="cpRole"></span><button type="button" id="cpCopy">复制</button></div>
        <div class="cp-users" id="cpUsers"></div>
        <div class="cp-chat" id="cpChat"></div>
        <form id="cpChatForm"><input id="cpChatInput" maxlength="200" placeholder="和队友聊天…" autocomplete="off"><button type="submit">发送</button></form>
        <div class="cp-foot"><button type="button" id="cpLeave">离开房间</button><span class="note" id="cpNote"></span></div>
      </div>`;
    document.body.appendChild(panelEl);
    panelEl.addEventListener('keydown', function (e) { e.stopPropagation(); }, false);
    panelEl.addEventListener('keyup', function (e) { e.stopPropagation(); }, false);

    $('coopClose').addEventListener('click', closeModal);
    $('coopHost').addEventListener('click', function () { enter(true); });
    $('coopGuest').addEventListener('click', function () { enter(false); });
    Array.prototype.forEach.call(document.querySelectorAll('#coopFishSeg button'), function (b) {
      b.addEventListener('click', function () {
        fishOn = b.getAttribute('data-fish') === '1';
        syncFishSeg();
      });
    });
    $('cpMin').addEventListener('click', function () {
      var body = $('cpBody');
      var hide = body.style.display !== 'none';
      body.style.display = hide ? 'none' : 'block';
      this.textContent = hide ? '+' : '–';
    });
    $('cpCopy').addEventListener('click', function () {
      try {
        navigator.clipboard.writeText(S.code).then(function () { toast('房间号已复制'); });
      } catch (e) { toast('房间号：' + S.code); }
    });
    $('cpLeave').addEventListener('click', function () { leaveRoom(true); });
    $('cpChatForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('cpChatInput');
      sendChat(input.value);
      input.value = '';
      input.blur();   // 把键盘还给游戏
    });
    chatEmpty($('cpChat'));
  }
  function syncFishSeg() {
    Array.prototype.forEach.call(document.querySelectorAll('#coopFishSeg button'), function (b) {
      b.classList.toggle('on', (b.getAttribute('data-fish') === '1') === fishOn);
    });
  }
  function openModal() {
    if (!modalEl) return;
    $('coopCode').value = S.code || localStorage.getItem('sv_code') || '';
    $('coopName').value = S.name || '';
    $('coopErr').textContent = '';
    syncFishSeg();
    modalEl.style.display = 'flex';
    setTimeout(function () { try { $('coopCode').focus(); } catch (e) {} }, 30);
  }
  function closeModal() { if (modalEl) modalEl.style.display = 'none'; }

  function renderRoomPanel() {
    if (!panelEl) return;
    $('cpCode').textContent = S.code;
    $('cpRole').textContent = S.isHost ? '房主 · 你控主角' : (S.hostOnline ? '队友 · 你控战友' : '等待房主');
    var dot = $('cpDot');
    if (dot) dot.className = 'cp-dot' + (es && es.readyState === 1 ? '' : ' off');
    var state = $('cpState');
    if (state) {
      if (S.isHost) state.textContent = S.users.length > 1 ? '画面发送中'
        : (S.fishInvite ? '等小鱼进房' : '等队友加入');
      else state.textContent = S.hostOnline ? '已连接房主' : '房主离线';
    }
    var users = $('cpUsers');
    if (users) {
      users.innerHTML = '';
      (S.users || []).forEach(function (u) {
        var d = document.createElement('div');
        d.className = 'u';
        var i = document.createElement('i');
        if (!u.online) i.className = 'off';
        var name = document.createElement('span');
        name.textContent = u.name + (u.name === S.name ? '（你）' : '');
        d.appendChild(i); d.appendChild(name);
        if (u.host) {
          var em = document.createElement('em');
          em.textContent = '房主';
          d.appendChild(em);
        }
        users.appendChild(d);
      });
    }
    var note = $('cpNote');
    if (note) note.textContent = S.isHost
      ? (S.fishInvite && S.users.length < 2
        ? '已邀请小鱼当队友，稍等她进房…'
        : '队友是独立英雄：自己的属性、技能、每波选卡，倒地要你去救。')
      : '你控自己的英雄，技能与成长和房主完全对等。';
  }

  /* ================= 进入 / 离开 ================= */
  function enter(asHost) {
    var code = String($('coopCode').value || '').trim().toUpperCase();
    var name = String($('coopName').value || '').trim() || '玩家';
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(code)) {
      $('coopErr').textContent = '房间号只能是 1–12 位字母、数字、下划线或横杠';
      return;
    }
    $('coopErr').textContent = '连接中…';
    sv('sv_code', code);
    sv('sv_name', name);
    S.code = code;
    S.name = name;

    post('/api/survivor/room/enter', { code: code, pid: PID, name: name, host: !!asHost, fish: !!fishOn }).then(function (j) {
      if (!j || !j.ok) {
        $('coopErr').textContent = (j && j.error) || '进不去，换个房间号试试';
        return;
      }
      if (asHost && !j.isHost) {
        $('coopErr').textContent = (j && j.error) || '这个房间已经有房主了，点「加入房间」';
        return;
      }
      closeModal();
      S.joined = true;
      S.code = j.code;
      S.seat = j.seat;
      S.isHost = !!j.isHost;
      S.hostPid = j.hostPid || '';
      S.hostOnline = !!j.hostOnline;
      S.fishInvite = !!j.fishInvite;
      S.users = j.users || [];
      S.state = j.state || null;
      S.joinedAt = Date.now();

      if (S.isHost) startHost(j);
      else startGuest(j);
      openStream(true);
      toast(S.isHost ? '房间已开：' + S.code : '已加入房间 ' + S.code);
    }).catch(function () {
      $('coopErr').textContent = '连不上服务器，稍后再试';
    });
  }

  function leaveRoom(notify) {
    if (!S.joined) return;
    var wasHost = S.isHost;
    if (notify) {
      post('/api/survivor/room/leave', { code: S.code, pid: PID }).catch(function () {});
    }
    if (es) { try { es.close(); } catch (e) {} es = null; }
    stopHost();
    stopGuest();
    S.joined = false;
    S.isHost = false;
    S.hostPid = '';
    S.hostOnline = false;
    S.fishInvite = false;
    S.users = [];
    S.chat = [];
    S.state = null;
    seenChat = 0;
    if (panelEl) panelEl.style.display = 'none';
    if (fabEl) fabEl.style.display = '';
    if (wasHost) toast('已离开房间');
  }

  function openStream(fresh) {
    if (es) { try { es.close(); } catch (e) {} }
    es = new EventSource('/api/survivor/room/stream?code=' + enc(S.code) + '&pid=' + enc(PID));
    es.addEventListener('hello', function (e) {
      var j = {};
      try { j = JSON.parse(e.data); } catch (err) { return; }
      S.users = j.users || S.users;
      S.hostPid = j.hostPid || S.hostPid;
      S.hostOnline = !!j.hostOnline;
      if (typeof j.fishInvite === 'boolean') S.fishInvite = j.fishInvite;
      S.state = j.state || S.state;
      if (fresh) resetChat(j.chat);
      else resetChat(j.chat);
      fresh = false;
      syncUi();
    });
    es.addEventListener('frame', function (e) {
      var j = {};
      try { j = JSON.parse(e.data); } catch (err) { return; }
      if (S.isHost) return;
      if (j.state) applyGuestState(j.state);
      if (j.img) drawGuestFrame(j.img, j.w, j.h);
    });
    es.addEventListener('state', function (e) {
      if (S.isHost) return;
      var s = {};
      try { s = JSON.parse(e.data); } catch (err) { return; }
      applyGuestState(s);
    });
    es.addEventListener('input', function (e) {
      if (!S.isHost) return;
      var d = {};
      try { d = JSON.parse(e.data); } catch (err) { return; }
      onHostInput(d);
    });
    es.addEventListener('chat', function (e) {
      var m = {};
      try { m = JSON.parse(e.data); } catch (err) { return; }
      addChat(m);
    });
    es.addEventListener('peer', function (e) {
      var j = {};
      try { j = JSON.parse(e.data); } catch (err) { return; }
      S.users = j.users || S.users;
      S.hostPid = j.hostPid || S.hostPid;
      S.hostOnline = !!j.hostOnline;
      if (typeof j.fishInvite === 'boolean') S.fishInvite = j.fishInvite;
      syncUi();
    });
    es.addEventListener('bye', function () {
      toast('房间已关闭', true);
      leaveRoom(false);
    });
    es.onerror = function () {
      var dot = $('cpDot');
      if (dot) dot.className = 'cp-dot off';
      if (guest.active) setGuestLink(false);
      // EventSource 会自动重连；不在这里 leave，避免网络抖一下就掉房
    };
  }

  function syncUi() {
    if (!S.joined) return;
    if (S.isHost) {
      if (panelEl) { panelEl.style.display = ''; }
      if (fabEl) fabEl.style.display = 'none';
      renderRoomPanel();
      updateDuo();
      if (S.users.some(function (u) { return !u.host && u.online; })) startStream();
      else stopStreamTimer();
    } else {
      if (panelEl) panelEl.style.display = 'none';
      if (fabEl) fabEl.style.display = 'none';
      if (guestEl) {
        $('cgRoom').textContent = S.code;
        var hostUser = null;
        for (var i = 0; i < S.users.length; i++) if (S.users[i].host) hostUser = S.users[i];
        $('cgWho').textContent = hostUser ? ('房主 ' + hostUser.name) : '等待房主';
        setGuestLink(!!S.hostOnline);
        if (!S.hostOnline) showGuestWait('房主离开了，等一下或者让房主重新开房…');
      }
    }
  }

  /* ================= 房主：画面推流 ================= */
  var capCanvas = document.createElement('canvas');
  var capCtx = capCanvas.getContext('2d');

  function captureFrame() {
    var src = $('gameCanvas');
    if (!src || !src.width || src.width < 10) return '';
    var now = Date.now();
    if (now - host.capLast < 110) return '';
    host.capLast = now;
    var w = Math.min(880, src.width);
    var h = Math.max(1, Math.round(src.height * w / src.width));
    if (capCanvas.width !== w || capCanvas.height !== h) {
      capCanvas.width = w; capCanvas.height = h;
    }
    try { capCtx.drawImage(src, 0, 0, w, h); } catch (e) { return ''; }
    // 队友角色画在覆盖画布上，推流时叠进来
    var allyCv = $('coopAllyCanvas');
    if (allyCv && allyCv.width) {
      try { capCtx.drawImage(allyCv, 0, 0, w, h); } catch (e) {}
    }
    var url = '';
    try { url = capCanvas.toDataURL('image/webp', host.capQ); } catch (e) { return ''; }
    if (url.indexOf('data:image/webp') !== 0) {
      try { url = capCanvas.toDataURL('image/jpeg', host.capQ); } catch (e) { return ''; }
    }
    host.capW = w; host.capH = h;
    if (url.length > 220000 && host.capQ > 0.3) host.capQ = Math.max(0.3, host.capQ - 0.05);
    else if (url.length < 110000 && host.capQ < 0.6) host.capQ = Math.min(0.6, host.capQ + 0.02);
    return url;
  }

  function hostState() {
    var st = { ver: 4, phase: 'lobby', hp: 0, maxHp: 1, wave: 1, kills: 0, alive: false, hero: '', buffOpen: false, buffs: [], cds: [0, 0, 0, 0], ally: null };
    var duel = null;
    try { duel = (window.__duo && window.__duo.state) ? window.__duo.state() : null; } catch (e) { duel = null; }
    try {
      if (typeof gameRunning !== 'undefined' && gameRunning) {
        if (showingBuff) st.phase = 'buff';
        else if (gamePaused) st.phase = 'paused';
        else if (hero && !hero.alive) st.phase = 'dead';
        else st.phase = 'fighting';
      } else if (hero && !hero.alive) {
        st.phase = 'dead';
      }
      // 联机：主角倒地但战友还活着 → 战斗继续（救援阶段）
      if (duel && duel.heroDowned && duel.alive) st.phase = 'fighting';
      if (hero) {
        st.hp = Math.round(hero.hp || 0);
        st.maxHp = Math.round(hero.maxHp || 1);
        st.alive = !!hero.alive;
      }
      st.wave = typeof wave !== 'undefined' ? wave : 1;
      st.kills = typeof totalKills !== 'undefined' ? totalKills : 0;
      try { st.hero = (HERO_DEFS && HERO_DEFS[currentHero] && HERO_DEFS[currentHero].name) || ''; } catch (e) {}
      st.buffOpen = !!showingBuff;
      // 商店/神器模式（给队友端显示各自那一份）
      try {
        var shopEl = document.getElementById('shopScreen');
        st.shopOpen = !!(shopEl && shopEl.style.display === 'block');
      } catch (e2) { st.shopOpen = false; }
      try { st.artOn = !!enableArtifact; st.shopOn = !!enableShop; } catch (e3) { st.artOn = false; st.shopOn = false; }
      var btns = document.querySelectorAll('#buffButtons .buff-btn');
      for (var i = 0; i < btns.length && i < 6; i++) st.buffs.push((btns[i].textContent || '').trim().slice(0, 40));
      for (var j = 0; j < 4; j++) {
        try { st.cds[j] = Math.round(skillCooldown[j] || 0); } catch (e) { st.cds[j] = 0; }
      }
    } catch (e) {}
    // 队友状态单独兜底：上面的 try 万一抛错，也不能让房主端看起来像旧版本
    st.ally = duel;
    return st;
  }

  function startHost(j) {
    document.body.classList.add('coop-on');
    try { if (window.__fish && window.__fish.hold) window.__fish.hold(true); } catch (e) {}
    var fish = $('fishPanel');
    if (fish) fish.style.display = 'none';
    if (panelEl) panelEl.style.display = '';
    if (fabEl) fabEl.style.display = 'none';
    renderRoomPanel();
    updateDuo();
    if (S.users.some(function (u) { return !u.host && u.online; })) startStream();
  }
  function stopStreamTimer() {
    if (host.streamTimer) { clearInterval(host.streamTimer); host.streamTimer = null; }
  }
  function stopHost() {
    document.body.classList.remove('coop-on');
    if (host.streamTimer) { clearInterval(host.streamTimer); host.streamTimer = null; }
    try {
      if (window.__duo) window.__duo.setDesired(false);
      if (window.__fish && window.__fish.hold) window.__fish.hold(false);
    } catch (e) {}
    var fish = $('fishPanel');
    if (fish) fish.style.display = '';
  }

  function startStream() {
    if (host.streamTimer) return;
    startStreamTick();
  }
  function startStreamTick() {
    host.streamTimer = setInterval(function () {
      if (!S.joined || !S.isHost) return;
      if (host.posting) return;
      var hasGuest = false;
      for (var gi = 0; gi < S.users.length; gi++) if (!S.users[gi].host && S.users[gi].online) hasGuest = true;
      if (!hasGuest) return;
      var running = false;
      try { running = (typeof gameRunning !== 'undefined' && gameRunning); } catch (e) {}
      host.tick++;
      // 没开局时不用 7 帧/秒地推空摘要，1.2 秒一次就够
      if (!running && host.tick % 6 !== 0) return;
      var st = hostState();
      var img = '';
      if (running && !document.hidden) img = captureFrame();
      host.posting = true;
      post('/api/survivor/room/frame', {
        code: S.code, pid: PID, img: img, state: st, w: host.capW, h: host.capH,
      }).then(function () { host.posting = false; }).catch(function () { host.posting = false; });
    }, 130);
  }

  /* 房主这边：有队友在线就让第二个角色出现，并让 AI 让位；队友走了就收回角色、恢复 AI */
  function updateDuo() {
    var hasGuest = false;
    for (var i = 0; i < S.users.length; i++) if (!S.users[i].host && S.users[i].online) hasGuest = true;
    var on = S.isHost && S.joined && hasGuest;
    try {
      if (window.__duo) window.__duo.setDesired(on);
      if (window.__fish && window.__fish.hold) window.__fish.hold(on);
    } catch (e) {}
  }

  function onHostInput(d) {
    if (!d) return;
    if (d.kind === 'move') {
      guest.dir = {
        x: Math.max(-1, Math.min(1, Number(d.x) || 0)),
        y: Math.max(-1, Math.min(1, Number(d.y) || 0)),
      };
      guest.lastMoveAt = Date.now();
      try { if (window.__duo) window.__duo.setInput(guest.dir.x, guest.dir.y); } catch (e) {}
      return;
    }
    if (d.kind === 'skill') {
      try { if (window.__duo) window.__duo.cast(d.index); } catch (e) {}
      return;
    }
    if (d.kind === 'buff') {
      hostPickBuff(d.index);
      return;
    }
    if (d.kind === 'allyBuff') {
      try { if (window.__duo && window.__duo.applyBuff) window.__duo.applyBuff(d.index); } catch (e) {}
      return;
    }
    if (d.kind === 'hero') {
      try { if (window.__duo && window.__duo.setHeroKey) window.__duo.setHeroKey(d.key); } catch (e) {}
      return;
    }
    if (d.kind === 'skin') {
      try { if (window.__duo && window.__duo.setSkin) window.__duo.setSkin(d.id); } catch (e) {}
      return;
    }
    if (d.kind === 'artifact') {
      try { if (window.__duo && window.__duo.setArtifact) window.__duo.setArtifact(d.key); } catch (e) {}
      return;
    }
    if (d.kind === 'allyBuy') {
      try { if (window.__duo && window.__duo.buy) window.__duo.buy(d.id); } catch (e) {}
      return;
    }
  }
  function hostUseSkill(i) {
    try {
      if (typeof gameRunning === 'undefined' || !gameRunning) return;
      if (gamePaused || showingBuff) return;
      if (!hero || !hero.alive) return;
      if (typeof useSkill === 'function') useSkill(i);
    } catch (e) {}
  }
  function hostPickBuff(i) {
    try {
      if (!showingBuff) return;
      var btns = document.querySelectorAll('#buffButtons .buff-btn');
      if (i >= 0 && i < btns.length) btns[i].click();
    } catch (e) {}
  }

  /* ================= 队友：全屏远控 ================= */
  function buildGuestUI() {
    if (guestEl) return;
    guestEl = document.createElement('div');
    guestEl.className = 'coop-guest';
    guestEl.innerHTML = `
      <div class="cg-top">
        <span class="dot" id="cgDot"></span>
        <span class="room" id="cgRoom">----</span>
        <span class="who" id="cgWho">连接中</span>
        <span class="sp"></span>
        <button type="button" id="cgHeroBtn">英雄/皮肤</button>
        <button type="button" class="cg-chat-btn" id="cgChatBtn">聊天<span class="badge" id="cgChatBadge" style="display:none">0</span></button>
        <button type="button" id="cgLeave">退出</button>
      </div>
      <div class="cg-stage" id="cgStage">
        <canvas id="cgCanvas"></canvas>
        <div class="cg-hud">
          <div class="hname" id="cgHero"></div>
          <div class="cg-hp"><i id="cgHpFill"></i><span id="cgHpText"></span></div>
          <div class="cg-wave" id="cgWave"></div>
        </div>
        <div class="cg-wait" id="cgWait">等待房主开始…</div>
        <div class="cg-buffs" id="cgBuffs"></div>
        <div class="cg-chat-pane" id="cgChatPane">
          <div class="cg-chat-head"><b>聊天</b><button type="button" id="cgChatClose">收起</button></div>
          <div class="cg-chat-list" id="cgChatList"></div>
          <form id="cgChatForm"><input id="cgChatInput" maxlength="200" placeholder="和房主说点什么…" autocomplete="off"><button type="submit">发送</button></form>
        </div>
        <div class="cg-hero" id="cgHeroPane">
          <button type="button" class="x" id="cgHeroClose">×</button>
          <h4>选你的英雄</h4>
          <p>技能、属性、每波强化都是你自己的一份，和房主完全对等。</p>
          <div class="grid" id="cgHeroGrid"></div>
          <h5>神器</h5>
          <p class="hint" id="cgArtHint">房主开了「神器开局」才生效，中途加入也能补选。</p>
          <div class="grid" id="cgArtGrid"></div>
          <h5>皮肤</h5>
          <div class="grid" id="cgSkinGrid"></div>
        </div>
        <div class="cg-shop" id="cgShopPane">
          <h4>战友商店</h4>
          <p class="gold" id="cgShopGold">金币：0</p>
          <div class="grid" id="cgShopGrid"></div>
          <p class="note">每件 500 金币 · 房主关店后继续下一波</p>
        </div>
      </div>
      <div class="cg-bottom">
        <div class="cg-pad">
          <button type="button" class="up" data-k="up">▲</button>
          <button type="button" class="left" data-k="left">◀</button>
          <button type="button" class="right" data-k="right">▶</button>
          <button type="button" class="down" data-k="down">▼</button>
        </div>
        <div class="cg-skills">
          <button type="button" data-skill="0">0<small>普攻</small><span class="cd"></span></button>
          <button type="button" data-skill="1">1<small>旋风斩</small><span class="cd"></span></button>
          <button type="button" data-skill="2">2<small>突进</small><span class="cd"></span></button>
          <button type="button" data-skill="3">3<small>战吼</small><span class="cd"></span></button>
        </div>
      </div>`;
    document.body.appendChild(guestEl);

    chatEmpty($('cgChatList'));
    bindGuestControls();
    window.addEventListener('resize', function () { if (guest.active) paintGuest(); });
  }

  function startGuest(j) {
    S.isHost = false;
    buildGuestUI();
    guest.active = true;
    guest.frameAt = 0;
    guest.lastStateAt = 0;
    guest.unread = 0;
    document.body.classList.add('coop-guest-on');
    var fish = $('fishPanel');
    if (fish) fish.style.display = 'none';
    if (panelEl) panelEl.style.display = 'none';
    if (fabEl) fabEl.style.display = 'none';
    if (guestEl) guestEl.style.display = 'flex';
    resetChat(j.chat);
    $('cgRoom').textContent = S.code;
    setGuestLink(true);
    if (j.state) applyGuestState(j.state);
    // 队友端不用跑本地模拟，按键全部由我们接管
    updateGuestWaitByPhase();
    // 英雄选择：记得上次的就不再打扰；否则先让他选一个
    var savedHero = '';
    try { savedHero = localStorage.getItem('coopAllyHero') || ''; } catch (e) {}
    if (savedHero && window.__duo && window.__duo.setHeroKey) {
      try { window.__duo.setHeroKey(savedHero); } catch (e) {}
      sendInput('hero', { key: savedHero });
    } else {
      openHeroPane(true);
    }
    // 神器 / 皮肤：记得上次的直接同步给房主
    try {
      var savedArt = localStorage.getItem('coopAllyArtifact') || '';
      var savedSkin = localStorage.getItem('coopAllySkin') || '';
      if (savedArt) sendInput('artifact', { key: savedArt });
      if (savedSkin) sendInput('skin', { id: savedSkin });
    } catch (e) {}
  }
  function stopGuest() {
    guest.active = false;
    document.body.classList.remove('coop-guest-on');
    if (guest.sendTimer) { clearInterval(guest.sendTimer); guest.sendTimer = null; }
    if (guestEl && guestEl.parentNode) guestEl.parentNode.removeChild(guestEl);
    guestEl = null;
    guest.dir = { x: 0, y: 0 };
    guest.held = { up: false, down: false, left: false, right: false };
    var fish = $('fishPanel');
    if (fish) fish.style.display = '';
  }

  function setGuestLink(on) {
    var dot = $('cgDot');
    if (dot) dot.className = 'dot' + (on ? '' : ' off');
  }
  function showGuestWait(text) {
    var w = $('cgWait');
    if (!w) return;
    if (text) { w.textContent = text; w.classList.remove('hide'); }
    else w.classList.add('hide');
  }
  function updateGuestWaitByPhase() {
    var s = S.state;
    if (!s) { showGuestWait('等待房主开始…'); return; }
    if (!S.hostOnline) { showGuestWait('房主离开了，等一下或者让房主重新开房…'); return; }
    if (s.phase === 'lobby') { showGuestWait('房主还没开始，等一下…'); return; }
    if (s.phase === 'dead') { showGuestWait('这局倒了 · 第 ' + (s.wave || 1) + ' 波'); return; }
    if (s.phase === 'over') { showGuestWait('本局结束'); return; }
    if (s.phase === 'paused') { showGuestWait('房主暂停了'); return; }
    if (s.ally && !s.ally.alive) {
      showGuestWait('你倒地了 · 等房主靠近 3 秒救援' + (s.ally.reviveIn ? '（' + s.ally.reviveIn + ' 秒后自行归队）' : ''));
      return;
    }
    if (guest.frameAt && Date.now() - guest.frameAt > 2800) { showGuestWait('画面中断，正在等房主…'); return; }
    showGuestWait('');
  }

  function applyGuestState(s) {
    if (!s || typeof s !== 'object') return;
    S.state = s;
    guest.lastStateAt = Date.now();
    // HUD 显示队友自己的角色；没有队友状态时退回主角
    var ally = s.ally || null;
    var hpNow = ally ? ally.hp : s.hp;
    var hpMax = ally ? ally.maxHp : s.maxHp;
    var hpFill = $('cgHpFill'), hpText = $('cgHpText');
    var pct = Math.max(0, Math.min(1, (Number(hpNow) || 0) / Math.max(1, Number(hpMax) || 1)));
    if (hpFill) hpFill.style.width = (pct * 100).toFixed(1) + '%';
    if (hpText) hpText.textContent = Math.round(Number(hpNow) || 0) + ' / ' + Math.round(Number(hpMax) || 0);
    var heroEl = $('cgHero');
    if (heroEl) {
      heroEl.textContent = ally
        ? ('战友 ' + (ally.heroName || '') + ' · 主角 ' + Math.round(Number(s.hp) || 0) + '/' + Math.round(Number(s.maxHp) || 1))
        : (s.hero || '');
    }
    // 技能名跟着战友的英雄走
    if (ally && ally.skills && ally.skills.length) {
      var ksig = ally.skills.join('|');
      if (ksig !== guest.skillSig) {
        guest.skillSig = ksig;
        var sbtns = document.querySelectorAll('.cg-skills button');
        for (var k = 0; k < sbtns.length; k++) {
          var small = sbtns[k].querySelector('small');
          if (small) small.textContent = ally.skills[k] || '';
        }
      }
    }
    var waveEl = $('cgWave');
    if (waveEl) {
      var phaseCn = { lobby: '等待开始', fighting: '战斗中', buff: '选奖励', paused: '已暂停', dead: '阵亡', over: '结束' }[s.phase] || '';
      var hint = '';
      if (ally && ally.heroDowned) hint = ' · 主角倒地，靠近 3 秒救起';
      else if (ally && !ally.alive) hint = ' · 你倒地了';
      waveEl.textContent = '第 ' + (s.wave || 1) + ' 波 · 击杀 ' + (s.kills || 0) + ' · ' + phaseCn + hint;
    }
    // 技能冷却：用队友自己的冷却；倒地时整排禁用
    var allyDead = !!(ally && !ally.alive);
    var cds = ally ? (ally.cds || []) : (s.cds || []);
    var btns = document.querySelectorAll('.cg-skills button');
    for (var i = 0; i < btns.length; i++) {
      var cd = Number(cds[i] || 0);
      var sec = Math.ceil(cd / 60);
      var cdEl = btns[i].querySelector('.cd');
      if (cdEl) {
        cdEl.textContent = sec > 0 ? String(sec) : '';
        cdEl.style.display = sec > 0 ? '' : 'none';
      }
      btns[i].disabled = allyDead || sec > 0;
    }
    // 奖励选项：队友用自己那一份；没有战友状态时退回房主的
    var bOpen = ally ? !!ally.buffOpen : !!s.buffOpen;
    var bList = ally ? (ally.buffs || []) : (s.buffs || []);
    var sig = (bOpen ? '1' : '0') + '|' + bList.join('|');
    if (sig !== guest.buffSig) {
      guest.buffSig = sig;
      var box = $('cgBuffs');
      if (box) {
        box.innerHTML = '';
        if (bOpen && bList.length) {
          box.style.display = 'flex';
          (function (arr, kind) {
            arr.forEach(function (text, idx) {
              var b = document.createElement('button');
              b.type = 'button';
              b.textContent = (idx + 1) + '. ' + text;
              b.addEventListener('click', function () {
                sendInput(kind, { index: idx });
                b.disabled = true;
              });
              box.appendChild(b);
            });
          })(bList, ally ? 'allyBuff' : 'buff');
        } else {
          box.style.display = 'none';
        }
      }
    }
    // 商店：房主进店时，队友也进自己那一份商店
    var shopOpen = !!(ally && s.shopOpen);
    var shopPane = $('cgShopPane');
    if (shopPane) shopPane.classList.toggle('on', shopOpen);
    if (shopOpen) {
      try { openHeroPane(false); } catch (e) {}
      var goldEl = $('cgShopGold');
      if (goldEl) goldEl.textContent = '金币：' + (Number(ally.gold) || 0);
      var ssig = 'v1|' + (ally.heroKey || '') + '|' + (Number(ally.gold) || 0);
      if (ssig !== guest.shopSig) { guest.shopSig = ssig; buildShopGrid(ally); }
    }
    // 神器模式提示
    var artHint = $('cgArtHint');
    if (artHint && typeof s.artOn === 'boolean') {
      artHint.textContent = s.artOn
        ? '已开启：选一个神器，和房主各拿各的。'
        : '房主没开「神器开局」，本轮选不了。';
    }
    updateGuestWaitByPhase();
  }

  // 队友自己的商店：用战友英雄的强化池，各花各的金币
  function buildShopGrid(ally) {
    var grid = $('cgShopGrid');
    if (!grid) return;
    grid.innerHTML = '';
    var hd = null;
    try { hd = HERO_DEFS[ally.heroKey]; } catch (e) {}
    var pool = (hd && hd.buffs && hd.buffs.length) ? hd.buffs
      : ((typeof buffOptions !== 'undefined' && buffOptions) ? buffOptions : []);
    if (!pool || !pool.length) return;
    var gold = Number(ally.gold) || 0;
    pool.forEach(function (buff) {
      var text = String(buff.text || '');
      if (hd && hd.skills) {
        text = text.replace('一技能', hd.skills[0] ? hd.skills[0].name : '一技能')
                   .replace('二技能', hd.skills[1] ? hd.skills[1].name : '二技能')
                   .replace('三技能', hd.skills[2] ? hd.skills[2].name : '三技能');
      }
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      var cost = document.createElement('span');
      cost.className = 'cost';
      cost.textContent = '500 金币';
      b.appendChild(cost);
      if (gold < 500) b.disabled = true;
      b.addEventListener('click', function () {
        sendInput('allyBuy', { id: buff.id });
        b.disabled = true;
      });
      grid.appendChild(b);
    });
  }

  /* ---------- 画面 ---------- */
  function drawGuestFrame(dataUrl, w, h) {
    if (!guest.img) {
      guest.img = new Image();
      guest.img.onload = function () { if (guest.active) paintGuest(); };
    }
    guest.img.src = dataUrl;
    guest.frameAt = Date.now();
    guest.pendingW = w || 0;
    guest.pendingH = h || 0;
    updateGuestWaitByPhase();
  }
  function paintGuest() {
    var c = $('cgCanvas');
    var stage = $('cgStage');
    if (!c || !stage || !guest.img || !guest.img.naturalWidth) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var box = stage.getBoundingClientRect();
    var cw = Math.max(1, Math.round(box.width * dpr));
    var ch = Math.max(1, Math.round(box.height * dpr));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    var ctx = c.getContext('2d');
    var iw = guest.img.naturalWidth, ih = guest.img.naturalHeight;
    var sc = Math.min(cw / iw, ch / ih);
    var dw = iw * sc, dh = ih * sc;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(guest.img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }

  /* ---------- 队友操作 ---------- */
  function sendInput(kind, extra) {
    if (!S.joined) return Promise.resolve();
    var body = { code: S.code, pid: PID, kind: kind };
    if (extra) for (var k in extra) body[k] = extra[k];
    return post('/api/survivor/room/input', body).catch(function () {});
  }
  function recomputeDir() {
    var x = 0, y = 0;
    if (guest.held.left) x -= 1;
    if (guest.held.right) x += 1;
    if (guest.held.up) y -= 1;
    if (guest.held.down) y += 1;
    guest.dir = { x: x, y: y };
  }
  function sendMove(force) {
    if (!guest.active) return;
    var now = Date.now();
    if (!force && now - guest.lastSent < 90) return;
    guest.lastSent = now;
    sendInput('move', { x: guest.dir.x, y: guest.dir.y });
  }
  function bindGuestControls() {
    Array.prototype.forEach.call(guestEl.querySelectorAll('.cg-pad button'), function (b) {
      var k = b.getAttribute('data-k');
      function press(e) {
        e.preventDefault();
        guest.held[k] = true;
        b.classList.add('on');
        try { b.setPointerCapture(e.pointerId); } catch (err) {}
        recomputeDir();
        sendMove(true);
      }
      function release(e) {
        if (e) e.preventDefault();
        if (!guest.held[k]) return;
        guest.held[k] = false;
        b.classList.remove('on');
        recomputeDir();
        sendMove(true);
      }
      b.addEventListener('pointerdown', press);
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('lostpointercapture', release);
    });
    Array.prototype.forEach.call(guestEl.querySelectorAll('.cg-skills button'), function (b) {
      b.addEventListener('click', function () {
        sendInput('skill', { index: Number(b.getAttribute('data-skill')) || 0 });
      });
    });
    $('cgLeave').addEventListener('click', function () { leaveRoom(true); });
    $('cgHeroBtn').addEventListener('click', function () { openHeroPane(true); });
    $('cgHeroClose').addEventListener('click', function () { openHeroPane(false); });
    $('cgChatBtn').addEventListener('click', function () { toggleGuestChat(true); });
    $('cgChatClose').addEventListener('click', function () { toggleGuestChat(false); });
    $('cgChatForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('cgChatInput');
      sendChat(input.value);
      input.value = '';
      input.blur();   // 发完就把方向键还给操作
    });
    guestEl.addEventListener('keydown', function (e) { e.stopPropagation(); }, false);
    guestEl.addEventListener('keyup', function (e) { e.stopPropagation(); }, false);

    // 按住方向时每 360ms 补发一次，丢了也能自己回来
    guest.sendTimer = setInterval(function () {
      if (guest.active && (guest.dir.x || guest.dir.y)) sendMove(true);
      if (guest.active) updateGuestWaitByPhase();
    }, 360);
  }
  function toggleGuestChat(on) {
    var pane = $('cgChatPane');
    if (!pane) return;
    var show = typeof on === 'boolean' ? on : !pane.classList.contains('on');
    pane.classList.toggle('on', show);
    if (show) {
      guest.unread = 0;
      var badge = $('cgChatBadge');
      if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
      var list = $('cgChatList');
      if (list) list.scrollTop = list.scrollHeight;
      setTimeout(function () { try { $('cgChatInput').focus(); } catch (e) {} }, 60);
    }
  }

  /* ---------- 队友选英雄 ---------- */
  function openHeroPane(on) {
    var pane = $('cgHeroPane');
    if (!pane) return;
    var show = typeof on === 'boolean' ? on : !pane.classList.contains('on');
    if (show) { buildHeroGrid(); buildArtifactGrid(); buildSkinGrid(); }
    pane.classList.toggle('on', show);
  }
  function buildHeroGrid() {
    var grid = $('cgHeroGrid');
    if (!grid) return;
    var keys = [];
    try { keys = Object.keys(HERO_DEFS); } catch (e) { keys = []; }
    if (!keys.length) return;
    grid.innerHTML = '';
    var current = '';
    try { current = localStorage.getItem('coopAllyHero') || ''; } catch (e) {}
    keys.forEach(function (key) {
      var def = null;
      try { def = HERO_DEFS[key]; } catch (e) {}
      if (!def) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = def.name || key;
      var s = document.createElement('small');
      s.textContent = (def.title || '').slice(0, 12);
      b.appendChild(s);
      if (key === current) b.style.borderColor = 'rgba(126,224,163,.8)';
      b.addEventListener('click', function () { pickAllyHero(key); });
      grid.appendChild(b);
    });
  }
  function buildArtifactGrid() {
    var grid = $('cgArtGrid');
    if (!grid) return;
    grid.innerHTML = '';
    var current = '';
    try { current = localStorage.getItem('coopAllyArtifact') || ''; } catch (e) {}
    function addCard(key, name, desc, icon) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = (icon ? icon + ' ' : '') + name;
      var s = document.createElement('small');
      s.textContent = (desc || '').slice(0, 22);
      b.appendChild(s);
      if (key === current) b.style.borderColor = 'rgba(255,215,107,.9)';
      b.addEventListener('click', function () { pickAllyArtifact(key); });
      grid.appendChild(b);
    }
    addCard('', '不选', '保持空手', '');
    try {
      for (var key in ARTIFACT_DEFS) {
        var a = ARTIFACT_DEFS[key];
        addCard(key, a.name || key, a.desc || '', a.icon || '');
      }
    } catch (e) {}
  }
  function buildSkinGrid() {
    var grid = $('cgSkinGrid');
    if (!grid) return;
    grid.innerHTML = '';
    var heroKey = '';
    try { heroKey = localStorage.getItem('coopAllyHero') || ''; } catch (e) {}
    if (!heroKey) {
      try { heroKey = (S.state && S.state.ally && S.state.ally.heroKey) || ''; } catch (e) {}
    }
    var current = '';
    try { current = localStorage.getItem('coopAllySkin') || ''; } catch (e) {}
    function addCard(id, name, desc, color) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      if (color) b.style.color = color;
      var s = document.createElement('small');
      s.textContent = desc || '';
      b.appendChild(s);
      if ((id || '') === current) b.style.borderColor = 'rgba(126,224,163,.9)';
      b.addEventListener('click', function () { pickAllySkin(id); });
      grid.appendChild(b);
    }
    addCard('', '原色', '默认外观', '');
    var list = [];
    try { list = (heroKey && SKIN_DEFS[heroKey]) ? SKIN_DEFS[heroKey] : []; } catch (e) { list = []; }
    list.forEach(function (sk) {
      addCard(sk.id, sk.name || sk.id, (sk.type === 'legend' ? '传说' : '皮肤'), sk.color || '');
    });
  }
  function pickAllyHero(key) {
    if (!key) return;
    try { localStorage.setItem('coopAllyHero', key); } catch (e) {}
    try { if (window.__duo && window.__duo.setHeroKey) window.__duo.setHeroKey(key); } catch (e) {}
    sendInput('hero', { key: key });
    var def = null;
    try { def = HERO_DEFS[key]; } catch (e) {}
    toast('战友英雄：' + ((def && def.name) || key));
    buildSkinGrid();
  }
  function pickAllyArtifact(key) {
    key = key || '';
    try { localStorage.setItem('coopAllyArtifact', key); } catch (e) {}
    try { if (window.__duo && window.__duo.setArtifact) window.__duo.setArtifact(key); } catch (e) {}
    sendInput('artifact', { key: key });
    var name = '不选';
    try { if (key && ARTIFACT_DEFS[key]) name = ARTIFACT_DEFS[key].name; } catch (e) {}
    toast('战友神器：' + name);
  }
  function pickAllySkin(id) {
    id = id || '';
    try { localStorage.setItem('coopAllySkin', id); } catch (e) {}
    try { if (window.__duo && window.__duo.setSkin) window.__duo.setSkin(id); } catch (e) {}
    sendInput('skin', { id: id });
    var name = '原色';
    try {
      var heroKey = localStorage.getItem('coopAllyHero') || '';
      var list = (heroKey && SKIN_DEFS[heroKey]) || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) name = list[i].name || id;
    } catch (e) {}
    toast('战友皮肤：' + name);
  }

  /* 队友端键盘：方向 + 技能。window 捕获阶段拦住，别让本页游戏自己吃键。 */
  window.addEventListener('keydown', function (e) {
    if (!guest.active) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (e.code === 'Escape') { toggleGuestChat(false); return; }
    var k = null;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') k = 'up';
    else if (e.code === 'KeyS' || e.code === 'ArrowDown') k = 'down';
    else if (e.code === 'KeyA' || e.code === 'ArrowLeft') k = 'left';
    else if (e.code === 'KeyD' || e.code === 'ArrowRight') k = 'right';
    if (k) {
      e.preventDefault(); e.stopPropagation();
      if (!guest.held[k]) { guest.held[k] = true; recomputeDir(); sendMove(true); }
      return;
    }
    var skill = -1;
    if (e.code === 'Digit0' || e.code === 'Numpad0') skill = 0;
    else if (e.code === 'Digit1' || e.code === 'Numpad1') skill = 1;
    else if (e.code === 'Digit2' || e.code === 'Numpad2') skill = 2;
    else if (e.code === 'Digit3' || e.code === 'Numpad3') skill = 3;
    if (skill >= 0) {
      e.preventDefault(); e.stopPropagation();
      sendInput('skill', { index: skill });
    }
  }, true);
  window.addEventListener('keyup', function (e) {
    if (!guest.active) return;
    var k = null;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') k = 'up';
    else if (e.code === 'KeyS' || e.code === 'ArrowDown') k = 'down';
    else if (e.code === 'KeyA' || e.code === 'ArrowLeft') k = 'left';
    else if (e.code === 'KeyD' || e.code === 'ArrowRight') k = 'right';
    if (k && guest.held[k]) {
      e.preventDefault(); e.stopPropagation();
      guest.held[k] = false; recomputeDir(); sendMove(true);
    }
  }, true);

  /* 页面关掉时尽量通知服务器（不保证送达，服务器还有 15 秒心跳兜底） */
  window.addEventListener('beforeunload', function () {
    if (!S.joined) return;
    try {
      var blob = new Blob([JSON.stringify({ code: S.code, pid: PID })], { type: 'application/json' });
      navigator.sendBeacon('/api/survivor/room/leave', blob);
    } catch (e) {}
  });

  /* ================= 启动 ================= */
  buildUI();

  /* 分享链接：/survivor/?room=FISH01 打开就把房间号填好，
   * 两个人不用互相报一串容易打错的字符。 */
  var shareRoom = '';
  try {
    var q = new URLSearchParams(location.search);
    var qr = String(q.get('room') || '').trim().toUpperCase();
    if (/^[A-Za-z0-9_-]{1,12}$/.test(qr)) {
      shareRoom = qr;
      S.code = qr;
      sv('sv_code', qr);
    }
    var qn = String(q.get('name') || '').trim();
    if (qn) {
      S.name = qn.slice(0, 12);
      sv('sv_name', S.name);
    }
  } catch (e) {}
  if (shareRoom) setTimeout(openModal, 60);

  // 联机面板别挡住游戏里的暂停键/技能键：输入框里的按键不外泄
  if (modalEl) modalEl.addEventListener('click', function (e) { e.stopPropagation(); }, false);
})();
