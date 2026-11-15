#!/usr/bin/env node
/* ============================================================
   一次性迁移：把 data/uploads 里的随机文件名改成内容寻址（md5 前 16 位）
   同时把 data/chat/*.json 里的 /m/ 旧引用改成新文件名，并补全 index.json。

   用法（在站点根目录，建议先停服务 / pm2 stop wanxiang）：
     node scripts/migrate-uploads.js --dry-run     # 只看计划，不改动
     node scripts/migrate-uploads.js               # 真跑（会先备份整个 data/）
     DATA_DIR=./data node scripts/migrate-uploads.js

   幂等：已经是 <md5前16位>.<ext> 的文件不会重复处理；重复内容只保留一份。
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const CHATDIR = path.join(DATA, 'chat');
const INDEX = path.join(UPLOADS, 'index.json');

const DRY = process.argv.includes('--dry-run');
const NO_BACKUP = process.argv.includes('--no-backup');
const TARGET_RE = /^[a-f0-9]{16}\.(png|jpg|gif|webp)$/;
const IMG_RE = /\.(png|jpe?g|gif|webp)$/i;

function log(...a) { console.log('[migrate]', ...a); }
function md5OfFile(full) {
  return crypto.createHash('md5').update(fs.readFileSync(full)).digest('hex');
}
function extOf(name) {
  let e = path.extname(name).toLowerCase().replace(/^\./, '');
  if (e === 'jpeg') e = 'jpg';
  return e;
}
function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')) || {}; } catch (e) { return {}; }
}
function backupData() {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);   // YYYYMMDDHHmmss
  const dst = DATA.replace(/[\\/]+$/, '') + '.bak-' + stamp;
  if (fs.existsSync(dst)) throw new Error('备份目录已存在：' + dst);
  if (typeof fs.cpSync === 'function') fs.cpSync(DATA, dst, { recursive: true });
  else copyDir(DATA, dst);
  log('已备份 data/ →', dst);
  return dst;
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name), d = path.join(dst, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
// 把一个旧文件名替换成新文件名（只替换 /m/ 引用，避免误伤别的文本）
function patchArchive(full, mapping) {
  const raw = fs.readFileSync(full, 'utf8');
  let out = raw, changed = 0;
  for (const [oldName, newName] of mapping) {
    const needle = '/m/' + oldName;
    const repl = '/m/' + newName;
    if (!out.includes(needle)) continue;
    changed += out.split(needle).length - 1;
    out = out.split(needle).join(repl);
  }
  if (!changed) return 0;
  if (!DRY) fs.writeFileSync(full, out);
  return changed;
}

(function main() {
  try { run(); } catch (e) { console.error('[migrate] 失败：', e && e.stack || e); process.exit(1); }
})();

function run() {
  if (!fs.existsSync(UPLOADS)) {
    log('没有找到 uploads 目录：' + UPLOADS);
    process.exit(0);
  }
  const files = fs.readdirSync(UPLOADS).filter(n => {
    const full = path.join(UPLOADS, n);
    try { return fs.statSync(full).isFile() && IMG_RE.test(n); } catch (e) { return false; }
  });

  const plans = [];        // { from, to, md5, size, ext, already }
  const keptIndex = {};    // md5 -> 信息（用于 index.json）
  for (const name of files) {
    const full = path.join(UPLOADS, name);
    let md5, st, size;
    try { md5 = md5OfFile(full); st = fs.statSync(full); size = st.size; }
    catch (e) { log('跳过（读不了）', name, e.message); continue; }
    const ext = extOf(name);
    const to = md5.slice(0, 16) + '.' + (['png', 'jpg', 'gif', 'webp'].includes(ext) ? ext : 'jpg');
    const already = (name === to && TARGET_RE.test(name));
    plans.push({ from: name, to, md5, size, ext, already, mtime: st.mtime });
    if (!keptIndex[md5]) keptIndex[md5] = { size, orig: already ? ('upload.' + ext) : name, firstSeen: st.mtime.toISOString() };
  }

  const mapping = [];   // [旧名, 新名]
  for (const p of plans) if (!p.already) mapping.push([p.from, p.to]);
  if (DRY) {
    log('将处理', files.length, '个文件，其中需要改名/去重', mapping.length, '个');
    mapping.forEach(([a, b]) => log('  ', a, '→', b));
  }

  // 备份（只有真的要改动时才备份）
  if (mapping.length && !DRY && !NO_BACKUP) backupData();
  else if (mapping.length && NO_BACKUP) log('（--no-backup：跳过备份）');

  // 改名 / 去重（目标已存在说明内容重复，直接删掉旧文件）
  const deleted = new Set();
  for (const [from, to] of mapping) {
    const src = path.join(UPLOADS, from), dst = path.join(UPLOADS, to);
    if (DRY) { log('[dry] rename', from, '→', to); continue; }
    try {
      if (fs.existsSync(dst)) { fs.unlinkSync(src); deleted.add(from); }
      else fs.renameSync(src, dst);
    } catch (e) {
      try { fs.copyFileSync(src, dst); fs.unlinkSync(src); } catch (e2) { log('改名失败', from, e2.message); }
    }
  }

  // 更新聊天存档里的 /m/ 引用
  let totalRefs = 0, touched = 0;
  let archives = [];
  try { archives = fs.readdirSync(CHATDIR).filter(f => f.endsWith('.json')); } catch (e) {}
  const mappingForPatch = mapping.filter(([from]) => true);   // 被去重的旧文件同样需要改引用
  for (const f of archives) {
    const n = patchArchive(path.join(CHATDIR, f), mappingForPatch);
    if (n) { totalRefs += n; touched++; }
  }

  // 补全 index.json
  const prev = loadIndex();
  const next = Object.assign({}, prev);
  for (const [md5, info] of Object.entries(keptIndex)) {
    if (!next[md5]) next[md5] = { orig: info.orig, size: info.size, firstSeen: info.firstSeen };
  }
  if (!DRY && JSON.stringify(prev) !== JSON.stringify(next)) fs.writeFileSync(INDEX, JSON.stringify(next, null, 2));

  log(DRY ? '[dry-run] 未写入任何文件' : '完成');
  log('文件数', files.length, '· 改名/去重', mapping.length, '（其中内容重复删除', deleted.size, '）',
    '· 更新引用', totalRefs, '处（涉及存档', touched, '个）');
  log('index.json 条目', Object.keys(next).length);
}
