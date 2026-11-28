/* ============================================================
   账号系统 · 零依赖（只用 Node 内置 crypto / fs / path）
   ------------------------------------------------------------
   落盘：
     data/auth/accounts.json  { "<uid>": { uid, name, pass, isAdmin, avatar, createdAt, lastLogin, disabled } }
     data/auth/sessions.json  { "<token>": { uid, exp } }
   密码：scrypt$<salt hex>$<hash hex>，绝不明文。
   ID：管理员 1661973546；普通用户 0001 ~ 9999 取最小可用号。
   会话：cookie hn_sid，30 天；服务端 sessions.json 落盘，重启不掉登录。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ADMIN_UID = '1661973546';
const ADMIN_NAME = '老板';

/* ============================================================
   管理员初始密码（2026-11-28 安全修复）
   ------------------------------------------------------------
   仓库是公开的，这里绝对不能写明文密码。
   · 优先读环境变量 ADMIN_PASS（pm2 env / .env 里配）
   · 没设就 crypto.randomBytes(9).toString('base64url') 现场生成
   · 这个值只在「accounts.json 里还没有管理员」时用来建号；
     已有账号的 pass 永远不会被这里覆盖（loadAccounts 只在缺号时写）
   · 生成后不打印、不落盘：日志里只说「已生成」，避免密码进日志文件
   ============================================================ */
function initialAdminPass() {
  const env = String(process.env.ADMIN_PASS || '').trim();
  if (env) return { pass: env, from: 'env' };
  return { pass: crypto.randomBytes(9).toString('base64url'), from: 'random' };
}
const COOKIE_NAME = 'hn_sid';
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;   // 30 天
const MIN_UID = 1;
const MAX_UID = 9999;

const NAME_MAX = 16;
const PASS_MIN = 4;
const PASS_MAX = 64;

/* ============================================================
   功能权限（2026-11-28）
   ------------------------------------------------------------
   perms: { yu, chat, games } —— 只有这三把开关，服务端强制校验。
   · 缺字段 / 不是 false 一律视为 true（旧账号读到没有 perms 就是全开）
   · 管理员（isAdmin）永远不受限，UI 上也不给改
   · 127.0.0.1 放行由 server.js 的 isLocalReq 负责，不在这里
   ============================================================ */
const PERM_KEYS = ['yu', 'chat', 'games'];
const PERM_LABEL = { yu: '与鱼', chat: '聊天室', games: '小游戏' };
function normPerms(p) {
  const out = {};
  for (let i = 0; i < PERM_KEYS.length; i++) {
    const k = PERM_KEYS[i];
    out[k] = !(p && p[k] === false);
  }
  return out;
}
/* 管理员判定：isAdmin 标记，或者就是预置的那个 uid —— 两重保险 */
function isAdminAccount(acc) {
  return !!(acc && (acc.isAdmin || String(acc.uid) === ADMIN_UID));
}

/* 登录失败限流：同一 IP 10 分钟内失败 10 次 → 拒绝 10 分钟 */
const RL_WINDOW = 10 * 60 * 1000;
const RL_MAX_FAIL = 10;
const RL_BLOCK = 10 * 60 * 1000;

module.exports = function createAuth(ctx) {
  const { DATA, json, send, readBody } = ctx;

  const DIR = path.join(DATA, 'auth');
  const ACC_FILE = path.join(DIR, 'accounts.json');
  const SES_FILE = path.join(DIR, 'sessions.json');
  try {
    fs.mkdirSync(DIR, { recursive: true });
    /* 账号与会话文件只给 root 读：里面是密码哈希和登录令牌 */
    try { fs.chmodSync(DIR, 0o700); } catch (e) {}
  } catch (e) { console.error('[auth dir]', e.message); }

  let accounts = {};
  let sessions = {};
  const fails = new Map();   // ip -> { n, first, until }

  /* ---------------- 落盘 ---------------- */
  function readJson(file, fb) {
    try {
      const s = fs.readFileSync(file, 'utf8');
      const o = JSON.parse(s);
      return o && typeof o === 'object' ? o : fb;
    } catch (e) { return fb; }
  }
  function writeJson(file, obj) {
    const tmp = file + '.tmp';
    try {
      /* mode 600：rename 会保留临时文件的权限，所以每次写盘都是私有权限 */
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
      try { fs.chmodSync(file, 0o600); } catch (e) {}
    } catch (e) { console.error('[auth save]', path.basename(file), e.message); }
  }

  /* ---------------- 密码 ---------------- */
  function hashPass(pass) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(pass), salt, 64).toString('hex');
    return 'scrypt$' + salt + '$' + hash;
  }
  function verifyPass(pass, stored) {
    if (typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = parts[1];
    let want;
    try { want = Buffer.from(parts[2], 'hex'); } catch (e) { return false; }
    let got;
    try { got = crypto.scryptSync(String(pass), salt, 64); } catch (e) { return false; }
    if (want.length !== got.length || !want.length) return false;
    try { return crypto.timingSafeEqual(want, got); } catch (e) { return false; }
  }

  /* ---------------- 账号读写 ---------------- */
  function loadAccounts() {
    accounts = readJson(ACC_FILE, {});
    let dirty = false;
    /* 预置管理员：文件不存在 / 被删 / 没设 isAdmin 都自愈，密码不会被覆盖 */
    if (!accounts[ADMIN_UID]) {
      const init = initialAdminPass();
      accounts[ADMIN_UID] = {
        uid: ADMIN_UID, name: ADMIN_NAME, pass: hashPass(init.pass),
        isAdmin: true, avatar: '', createdAt: Date.now(), lastLogin: 0, disabled: false,
        perms: normPerms(null)
      };
      dirty = true;
      console.log('     [auth] 已创建管理员账号 ' + ADMIN_UID + '（' + ADMIN_NAME + '）');
      if (init.from === 'random') {
        console.log('     [auth] 初始密码（只显示这一次，登录后请立刻修改）：' + init.pass);
      } else {
        console.log('     [auth] 管理员初始密码取自环境变量 ADMIN_PASS，请立即登录修改');
      }
    }
    if (dirty) writeJson(ACC_FILE, accounts);
    /* 旧账号没有 perms：只在内存里补默认全开，不因为这一件事写盘；
       下次任何一次正常保存（登录时间、改昵称…）会顺带把 perms 补进文件。 */
    for (const uid of Object.keys(accounts)) {
      const a = accounts[uid];
      if (!a || typeof a !== 'object') continue;
      a.perms = normPerms(a.perms);
    }
  }

  function loadSessions() {
    sessions = readJson(SES_FILE, {});
    const now = Date.now();
    let dirty = false;
    for (const t of Object.keys(sessions)) {
      const s = sessions[t];
      if (!s || !s.uid || !(s.exp > now)) { delete sessions[t]; dirty = true; }
    }
    if (dirty) writeJson(SES_FILE, sessions);
  }

  function saveAccounts() { writeJson(ACC_FILE, accounts); }
  function saveSessions() { writeJson(SES_FILE, sessions); }

  /* ---------------- 工具 ---------------- */
  function cleanName(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX);
  }
  function cleanAvatar(s) {
    /* 只接受 emoji / 短文本 / 本站上传的 /yu-f/ 图片地址 */
    const v = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160);
    if (!v) return '';
    if (/^\/yu-f\/[a-f0-9]{20}$/.test(v)) return v;
    if (/^https?:/i.test(v) || /[<>"']/.test(v)) return '';
    return v.slice(0, 12);
  }
  function pub(acc, withAvatar) {
    const o = {
      uid: acc.uid, name: acc.name, isAdmin: !!acc.isAdmin,
      createdAt: acc.createdAt || 0, lastLogin: acc.lastLogin || 0, disabled: !!acc.disabled,
      perms: normPerms(acc.perms)
    };
    if (withAvatar) o.avatar = acc.avatar || '';
    return o;
  }
  function findByName(name) {
    const k = name.toLowerCase();
    for (const uid of Object.keys(accounts)) {
      if (String(accounts[uid].name || '').toLowerCase() === k) return accounts[uid];
    }
    return null;
  }
  function allocUid() {
    for (let i = MIN_UID; i <= MAX_UID; i++) {
      const uid = String(i).padStart(4, '0');
      if (!accounts[uid]) return uid;
    }
    return '';
  }

  /* ---------------- cookie ---------------- */
  function parseCookies(req) {
    const out = {};
    const raw = req.headers && req.headers.cookie;
    if (!raw) return out;
    for (const part of String(raw).split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      if (!k) continue;
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }
  function sidOf(req) {
    const t = parseCookies(req)[COOKIE_NAME];
    return t && /^[a-f0-9]{48}$/.test(t) ? t : '';
  }
  function cookieHeader(token, maxAgeSec) {
    let c = COOKIE_NAME + '=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + Math.max(0, Math.floor(maxAgeSec));
    return c;
  }
  function setSessionCookie(res, token) {
    return { 'Set-Cookie': cookieHeader(token, SESSION_TTL / 1000) };
  }
  function clearSessionCookie(res) {
    return { 'Set-Cookie': cookieHeader('', 0) };
  }

  /* ---------------- 会话 ---------------- */
  function createSession(res, uid) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions[token] = { uid, exp: Date.now() + SESSION_TTL };
    saveSessions();
    return token;
  }
  function sessionOf(req) {
    const t = sidOf(req);
    if (!t) return null;
    const s = sessions[t];
    if (!s) return null;
    if (!(s.exp > Date.now())) {
      delete sessions[t];
      saveSessions();
      return null;
    }
    /* 滑动续期：用超过一半有效期就往后延一次，避免长期使用突然掉线 */
    if (s.exp - Date.now() < SESSION_TTL / 2) {
      s.exp = Date.now() + SESSION_TTL;
      saveSessions();
    }
    return Object.assign({ token: t }, s);
  }
  function userOf(req) {
    const s = sessionOf(req);
    if (!s) return null;
    const acc = accounts[s.uid];
    if (!acc || acc.disabled) return null;
    return acc;
  }
  function uidOf(req) {
    const acc = userOf(req);
    return acc ? acc.uid : '';
  }
  function isAdminReq(req) {
    const acc = userOf(req);
    return !!(acc && acc.isAdmin);
  }

  /* ---------------- 限流 ---------------- */
  /* 只用真实连接地址：这台机器是直连 3000 的，X-Forwarded-For 谁都能伪造，
     拿它当限流键等于把限流关掉。以后真放到反向代理后面再单独放开。 */
  function ipOf(req) {
    return String((req.socket && req.socket.remoteAddress) || 'unknown');
  }
  function blocked(ip) {
    const r = fails.get(ip);
    if (!r) return 0;
    const now = Date.now();
    if (r.until && r.until > now) return Math.ceil((r.until - now) / 1000);
    if (r.until && r.until <= now) { fails.delete(ip); return 0; }
    if (now - r.first > RL_WINDOW) { fails.delete(ip); return 0; }
    return 0;
  }
  function noteFail(ip) {
    const now = Date.now();
    let r = fails.get(ip);
    if (!r || now - r.first > RL_WINDOW) { r = { n: 0, first: now, until: 0 }; fails.set(ip, r); }
    r.n++;
    if (r.n >= RL_MAX_FAIL) { r.until = now + RL_BLOCK; r.n = 0; r.first = now; }
  }
  function noteOk(ip) { fails.delete(ip); }

  /* ---------------- 页面访问控制 ---------------- */
  function redirect(res, to) {
    send(res, 302, '', 'text/html; charset=utf-8', { Location: to });
  }
  /* need: 'user' | 'admin'；不满足就地发跳转，返回 false */
  function pageAccess(req, res, need) {
    const acc = userOf(req);
    if (!acc) { redirect(res, '/login.html?next=' + encodeURIComponent(req.url || '/')); return false; }
    if (need === 'admin' && !acc.isAdmin) { redirect(res, '/'); return false; }
    return true;
  }

  /* ---------------- 启动 ---------------- */
  loadAccounts();
  loadSessions();
  setInterval(() => {
    const now = Date.now();
    let dirty = false;
    for (const t of Object.keys(sessions)) {
      if (!sessions[t] || !(sessions[t].exp > now)) { delete sessions[t]; dirty = true; }
    }
    if (dirty) saveSessions();
  }, 60 * 60 * 1000).unref();

  /* ============================================================
     接口
     ============================================================ */
  async function api(req, res, u, p) {
    const method = req.method === 'POST' ? 'POST' : 'GET';

    /* ---------- 注册：创建并直接登录 ---------- */
    if (p === '/api/auth/register') {
      if (method !== 'POST') return json(res, { error: '只支持 POST' });
      const b = await readBody(req);
      const name = cleanName(b.name);
      const pass = String(b.pass == null ? '' : b.pass);
      if (!name) return json(res, { error: '昵称不能为空' });
      if (name === ADMIN_NAME) return json(res, { error: '昵称已被占用' });
      if (findByName(name)) return json(res, { error: '昵称已被占用' });
      if (pass.length < PASS_MIN) return json(res, { error: '密码至少 ' + PASS_MIN + ' 位' });
      if (pass.length > PASS_MAX) return json(res, { error: '密码最长 ' + PASS_MAX + ' 位' });
      const uid = allocUid();
      if (!uid) return json(res, { error: '注册名额已满' });
      accounts[uid] = {
        uid, name, pass: hashPass(pass), isAdmin: false, avatar: '',
        createdAt: Date.now(), lastLogin: Date.now(), disabled: false,
        perms: normPerms(null)
      };
      saveAccounts();
      const token = createSession(res, uid);
      return send(res, 200, JSON.stringify({ ok: true, uid, name, isAdmin: false }),
        'application/json; charset=utf-8', setSessionCookie(res, token));
    }

    /* ---------- 登录：账号可以是 uid 或昵称 ---------- */
    if (p === '/api/auth/login') {
      if (method !== 'POST') return json(res, { error: '只支持 POST' });
      const ip = ipOf(req);
      const wait = blocked(ip);
      if (wait) return json(res, { error: '失败次数太多，请 ' + Math.ceil(wait / 60) + ' 分钟后再试' });
      const b = await readBody(req);
      const account = String(b.account == null ? '' : b.account).trim();
      const pass = String(b.pass == null ? '' : b.pass);
      if (!account || !pass) return json(res, { error: '账号和密码都要填' });
      const acc = accounts[account] || findByName(account);
      /* 账号不存在也走一次哈希校验，避免时间差泄露账号是否存在 */
      let okPass = false;
      if (acc) okPass = verifyPass(pass, acc.pass);
      else { try { crypto.scryptSync(pass, 'x'.repeat(32), 64); } catch (e) {} }
      if (!acc || !okPass) { noteFail(ip); return json(res, { error: '账号或密码不对' }); }
      if (acc.disabled) return json(res, { error: '这个账号已被停用' });
      noteOk(ip);
      acc.lastLogin = Date.now();
      saveAccounts();
      const token = createSession(res, acc.uid);
      return send(res, 200, JSON.stringify({ ok: true, uid: acc.uid, name: acc.name, isAdmin: !!acc.isAdmin }),
        'application/json; charset=utf-8', setSessionCookie(res, token));
    }

    /* ---------- 退出 ---------- */
    if (p === '/api/auth/logout') {
      const t = sidOf(req);
      if (t && sessions[t]) { delete sessions[t]; saveSessions(); }
      return send(res, 200, JSON.stringify({ ok: true }), 'application/json; charset=utf-8', clearSessionCookie(res));
    }

    /* ---------- 当前登录者 ---------- */
    if (p === '/api/auth/me') {
      const acc = userOf(req);
      if (!acc) return json(res, { ok: false });
      return json(res, { ok: true, uid: acc.uid, name: acc.name, isAdmin: !!acc.isAdmin, avatar: acc.avatar || '' });
    }

    /* ---------- 改昵称 / 头像 ---------- */
    if (p === '/api/auth/profile') {
      if (method !== 'POST') return json(res, { error: '只支持 POST' });
      const acc = userOf(req);
      if (!acc) return json(res, { error: '请先登录' });
      const b = await readBody(req);
      if (b.name != null) {
        const name = cleanName(b.name);
        if (!name) return json(res, { error: '昵称不能为空' });
        const other = findByName(name);
        if (other && other.uid !== acc.uid) return json(res, { error: '昵称已被占用' });
        acc.name = name;
      }
      if (b.avatar != null) acc.avatar = cleanAvatar(b.avatar);
      saveAccounts();
      return json(res, { ok: true, uid: acc.uid, name: acc.name, isAdmin: !!acc.isAdmin, avatar: acc.avatar || '' });
    }

    /* ---------- 改密码 ---------- */
    if (p === '/api/auth/pass') {
      if (method !== 'POST') return json(res, { error: '只支持 POST' });
      const acc = userOf(req);
      if (!acc) return json(res, { error: '请先登录' });
      const b = await readBody(req);
      const oldPass = String(b.old == null ? '' : b.old);
      const newPass = String(b.new == null ? '' : b.new);
      if (!verifyPass(oldPass, acc.pass)) return json(res, { error: '原密码不对' });
      if (newPass.length < PASS_MIN) return json(res, { error: '新密码至少 ' + PASS_MIN + ' 位' });
      if (newPass.length > PASS_MAX) return json(res, { error: '新密码最长 ' + PASS_MAX + ' 位' });
      acc.pass = hashPass(newPass);
      saveAccounts();
      return json(res, { ok: true });
    }

    /* ================= 管理员 ================= */
    if (p.startsWith('/api/admin/')) {
      const acc = userOf(req);
      if (!acc) return send(res, 403, JSON.stringify({ error: '请先登录' }), 'application/json; charset=utf-8');
      if (!acc.isAdmin) return send(res, 403, JSON.stringify({ error: '需要管理员权限' }), 'application/json; charset=utf-8');

      if (p === '/api/admin/users') {
        const list = Object.keys(accounts)
          .map(uid => pub(accounts[uid]))
          .sort((a, b) => (a.isAdmin === b.isAdmin ? a.uid.localeCompare(b.uid) : (a.isAdmin ? -1 : 1)));
        return json(res, list);
      }

      if (p === '/api/admin/users/create') {
        if (method !== 'POST') return json(res, { error: '只支持 POST' });
        const b = await readBody(req);
        const name = cleanName(b.name);
        const pass = String(b.pass == null ? '' : b.pass);
        if (!name) return json(res, { error: '昵称不能为空' });
        if (findByName(name)) return json(res, { error: '昵称已被占用' });
        if (pass.length < PASS_MIN) return json(res, { error: '密码至少 ' + PASS_MIN + ' 位' });
        const uid = allocUid();
        if (!uid) return json(res, { error: '注册名额已满' });
        accounts[uid] = {
          uid, name, pass: hashPass(pass), isAdmin: false, avatar: '',
          createdAt: Date.now(), lastLogin: 0, disabled: false,
          perms: normPerms(null)
        };
        saveAccounts();
        return json(res, { ok: true, uid, name });
      }

      if (p === '/api/admin/users/update') {
        if (method !== 'POST') return json(res, { error: '只支持 POST' });
        const b = await readBody(req);
        const uid = String(b.uid || '');
        const target = accounts[uid];
        if (!target) return json(res, { error: '没有这个账号' });
        if (b.name != null) {
          const name = cleanName(b.name);
          if (!name) return json(res, { error: '昵称不能为空' });
          const other = findByName(name);
          if (other && other.uid !== uid) return json(res, { error: '昵称已被占用' });
          target.name = name;
        }
        if (b.disabled != null) {
          if (isAdminAccount(target) && b.disabled) return json(res, { error: '不能停用管理员账号' });
          target.disabled = !!b.disabled;
          if (target.disabled) {
            /* 停用即踢下线 */
            for (const t of Object.keys(sessions)) if (sessions[t].uid === uid) delete sessions[t];
            saveSessions();
          }
        }
        if (b.resetPass != null) {
          const np = String(b.resetPass);
          if (np.length < PASS_MIN) return json(res, { error: '新密码至少 ' + PASS_MIN + ' 位' });
          target.pass = hashPass(np);
          for (const t of Object.keys(sessions)) if (sessions[t].uid === uid) delete sessions[t];
          saveSessions();
        }
        saveAccounts();
        return json(res, { ok: true, user: pub(target) });
      }

      /* ---------- 重置密码为「该账号的 ID」（2026-11-28） ----------
       * 用户要求：重置后密码就是 uid，方便口头转达（如 0001 / 0001）。
       * 仍然走 hashPass（scrypt），文件里不留明文。 */
      if (p === '/api/admin/users/resetpass') {
        if (method !== 'POST') return json(res, { error: '只支持 POST' });
        const b = await readBody(req);
        const uid = String(b.uid || '');
        const target = accounts[uid];
        if (!target) return json(res, { error: '没有这个账号' });
        const newPass = uid;
        target.pass = hashPass(newPass);
        saveAccounts();
        /* 踢掉目标账号的旧会话，逼它用新密码重登；
           管理员给自己重置时保留当前这条会话，否则刚点完就把自己踢下线。 */
        if (uid !== acc.uid) {
          let kicked = false;
          for (const t of Object.keys(sessions)) {
            if (sessions[t] && sessions[t].uid === uid) { delete sessions[t]; kicked = true; }
          }
          if (kicked) saveSessions();
        }
        return json(res, { ok: true, uid, name: target.name, newPass });
      }

      /* ---------- 功能权限：只认白名单键 yu / chat / games ---------- */
      if (p === '/api/admin/users/perms') {
        if (method !== 'POST') return json(res, { error: '只支持 POST' });
        const b = await readBody(req);
        const uid = String(b.uid || '');
        const target = accounts[uid];
        if (!target) return json(res, { error: '没有这个账号' });
        if (isAdminAccount(target)) return json(res, { error: '管理员账号不受权限限制，不用改' });
        const src = b.perms && typeof b.perms === 'object' && !Array.isArray(b.perms) ? b.perms : null;
        if (!src) return json(res, { error: 'perms 格式不对' });
        const next = normPerms(target.perms);
        let touched = 0;
        for (const k of PERM_KEYS) {
          if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
          if (typeof src[k] !== 'boolean') return json(res, { error: '权限值只能是 true / false' });
          next[k] = src[k];
          touched++;
        }
        if (!touched) return json(res, { error: '没有可改的权限项' });
        target.perms = next;
        saveAccounts();
        return json(res, { ok: true, uid, perms: next });
      }

      if (p === '/api/admin/users/delete') {
        if (method !== 'POST') return json(res, { error: '只支持 POST' });
        const b = await readBody(req);
        const uid = String(b.uid || '');
        if (!accounts[uid]) return json(res, { error: '没有这个账号' });
        if (uid === acc.uid) return json(res, { error: '不能删除自己' });
        if (isAdminAccount(accounts[uid])) return json(res, { error: '不能删除管理员账号' });
        delete accounts[uid];
        saveAccounts();
        for (const t of Object.keys(sessions)) if (sessions[t].uid === uid) delete sessions[t];
        saveSessions();
        return json(res, { ok: true });
      }

      /* ---------- 账号切换：把当前 session 的 uid 换成目标 ---------- */
      if (p === '/api/admin/switch') {
        if (method !== 'POST') return json(res, { error: '只支持 POST' });
        const b = await readBody(req);
        const uid = String(b.uid || '');
        const target = accounts[uid];
        if (!target) return json(res, { error: '没有这个账号' });
        if (target.disabled) return json(res, { error: '这个账号已被停用' });
        const s = sessionOf(req);
        if (!s) return json(res, { error: '会话已失效，请重新登录' });
        s.uid = uid;
        sessions[s.token] = { uid, exp: s.exp };
        saveSessions();
        return json(res, { ok: true, uid: target.uid, name: target.name, isAdmin: !!target.isAdmin });
      }
    }

    return json(res, { error: '没有这个接口' });
  }

  return {
    api,
    uidOf,
    userOf,
    isAdminReq,
    pageAccess,
    redirect,
    /* 权限：server.js 的权限守卫用这两个 */
    permAllowed(acc, key) {
      if (!acc) return false;
      if (isAdminAccount(acc)) return true;
      return normPerms(acc.perms)[key] !== false;
    },
    isAdminAccount,
    PERM_KEYS,
    PERM_LABEL,
    ADMIN_UID
  };
};
