// 把模型写的 HTML 渲染成 PNG，存进共享图片库。
//
// 为什么要这么干（2026-11-07）：
//   聊天室的小鱼原本一张图都生成不了，只能发表情库里现成的图。
//   QQ 侧的 DSH 有 Chromium 能截图，但画完随手存在 game/shot.png 之类的地方，
//   两边互相找不到，也没法"把刚才那张再发一次"。
//
// 所以：所有 AI 生成的图统一进 workspace/pics/，配 INDEX.md 索引，
// 任何 AI 都能 ls 到、都能重新发。
//
// 安全限制（模型写的 HTML 不能全信）：
//   1. 禁掉一切外部网络请求（request interception 直接 abort 非 data/file）
//   2. 超时 12 秒
//   3. 尺寸限制 100～1600 宽，100～2000 高
//   4. 输出 PNG 最大 3MB
//   5. 强制中文字体，避免方块
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const cfg = require('../config.js');
const PICS = cfg.picsDir;
const INDEX = path.join(PICS, 'INDEX.md');
const CHROME = cfg.render.chromeBin;
// ★ 用 shot-safe（会掐断所有外部网络请求），不用 shot.mjs（放行一切）
const SHOT_JS = cfg.render.shotScript;
const MAX_BYTES = 3 * 1024 * 1024;

/* 字体：服务器上可用的中文字体，渲染时优先用 */
const FONT_STACK = `-apple-system, "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC",
  "WenQuanYi Zen Hei", "Microsoft YaHei", sans-serif`;

function pad(n) {
  return String(n).padStart(2, '0');
}

/* 文件名：MM-DD-HHMM-简短内容.png */
function makeName(text) {
  const d = new Date();
  const stamp = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  // 从内容里抽几个字做后缀，去掉不能进文件名的字符
  const slug = String(text || '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
    .slice(0, 12) || 'pic';
  let name = `${stamp}-${slug}.png`;
  // 同名（同一分钟同一内容）加序号
  let i = 2;
  while (fs.existsSync(path.join(PICS, name))) {
    name = `${stamp}-${slug}-${i}.png`;
    i += 1;
  }
  return name;
}

/* 把模型给的 HTML 片段包成完整页面，统一字体和默认边距 */
function wrapHtml(html, width, height, bg) {
  const body = String(html || '');
  // 已经是完整页面的就原样用，只补字体
  if (/<html[\s>]/i.test(body)) {
    return body.replace(
      /<body([^>]*)>/i,
      `<body$1 style="margin:0;font-family:${FONT_STACK}">`,
    );
  }
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${width}px; height: ${height}px;
    background: ${bg || '#ffffff'};
    font-family: ${FONT_STACK};
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
</style></head>
<body>${body}</body></html>`;
}

/* 追加一行索引 */
function appendIndex(name, content, author) {
  const d = new Date();
  const when = `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const line = `| ${name} | ${author || '小鱼'} | ${String(content || '').replace(/\|/g, '/').slice(0, 60)} | ${when} |\n`;
  try {
    fs.appendFileSync(INDEX, line, 'utf8');
  } catch { /* 索引写失败不影响出图 */ }
}

/* 渲染：返回 { ok, file, name, bytes } 或 { ok:false, error } */
function render(html, opts = {}) {
  const width = Math.min(Math.max(Number(opts.width) || 800, 100), 1600);
  const height = Math.min(Math.max(Number(opts.height) || 600, 100), 2000);

  if (!html || !String(html).trim()) {
    return { ok: false, error: 'HTML 内容为空' };
  }
  if (!fs.existsSync(CHROME)) {
    return { ok: false, error: `找不到 Chromium：${CHROME}` };
  }
  if (!fs.existsSync(SHOT_JS)) {
    return { ok: false, error: `找不到截图脚本：${SHOT_JS}` };
  }

  const full = wrapHtml(html, width, height, opts.bg);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'draw-'));
  const tmpHtml = path.join(tmpDir, 'page.html');
  const tmpPng = path.join(tmpDir, 'out.png');

  try {
    fs.writeFileSync(tmpHtml, full, 'utf8');
    // shot-safe.mjs 用 puppeteer 打开本地文件截图，并掐断所有外部请求
    execFileSync('node', [SHOT_JS, tmpHtml, tmpPng, String(width), String(height)], {
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.dirname(SHOT_JS),   // puppeteer-core 要在它自己的 node_modules 目录下才能 require
    });

    if (!fs.existsSync(tmpPng)) {
      return { ok: false, error: '截图没有生成文件' };
    }
    const size = fs.statSync(tmpPng).size;
    if (size > MAX_BYTES) {
      return { ok: false, error: `图太大（${(size / 1024 / 1024).toFixed(1)}MB），简化一下内容` };
    }

    const name = makeName(opts.slug || opts.content || '');
    const dest = path.join(PICS, name);
    fs.copyFileSync(tmpPng, dest);
    appendIndex(name, opts.content || opts.slug || '', opts.author || '小鱼');
    return { ok: true, file: dest, name, bytes: size };
  } catch (e) {
    const msg = String(e.stderr || e.message || e).slice(0, 200);
    return { ok: false, error: `渲染失败：${msg}` };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* 忽略 */ }
  }
}

/* 列出图片库里有什么 */
function listPics(limit = 30) {
  try {
    const files = fs.readdirSync(PICS)
      .filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(PICS, f));
        return { file: f, mtime: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, Math.min(Math.max(limit, 1), 100));
    if (!files.length) return [];
    return files;
  } catch {
    return [];
  }
}

/* 按文件名找一张图（允许模糊匹配：只给一部分名字也行） */
function findPic(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const files = fs.readdirSync(PICS).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f));
  // ① 完全相等
  if (files.includes(q)) return path.join(PICS, q);
  // ② 含这个名字
  const exactish = files.find((f) => f === q || f === `${q}.png`);
  if (exactish) return path.join(PICS, exactish);
  // ③ 模糊：文件名包含查询词
  const hit = files.find((f) => f.includes(q));
  return hit ? path.join(PICS, hit) : null;
}

module.exports = { render, listPics, findPic, PICS, INDEX, CHROME };
