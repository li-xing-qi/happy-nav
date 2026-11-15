// 表情库检索：解析 memes/INDEX.md，按情绪/关键词挑图。
// chat-bot 用它回答「我最喜欢的那张表情包是啥」这类问题，并按情绪自动挑图。
const fs = require('node:fs');
const path = require('node:path');

const DIR = require('../config.js').memesDir;
const INDEX = path.join(DIR, 'INDEX.md');

let cache = { items: [], mtime: 0 };

function parse() {
  let mtime = 0;
  try { mtime = fs.statSync(INDEX).mtimeMs; } catch {}
  let items = [];
  try {
    const txt = fs.readFileSync(INDEX, 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
      if (!m) continue;
      const file = m[1].trim();
      if (file === '文件' || /^-+$/.test(file)) continue;
      if (!/\.(png|jpe?g|gif|webp)$/i.test(file)) continue;
      items.push({ file, desc: m[2].trim() });
    }
  } catch {}
  return { items, mtime };
}

function all() {
  let mtime = 0;
  try { mtime = fs.statSync(INDEX).mtimeMs; } catch {}
  if (mtime !== cache.mtime || !cache.items.length) {
    const p = parse();
    cache = { items: p.items, mtime: p.mtime };
  }
  return cache.items;
}

/* 按关键词找图：命中描述里的字就加分，取前 n 个 */
function search(query, n = 3) {
  const items = all();
  if (!items.length) return [];
  const q = String(query || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  const keyChars = new Set(q.split(''));
  const scored = items.map((it) => {
    let s = 0;
    for (const c of keyChars) if (it.desc.includes(c) || it.file.includes(c)) s += 1;
    // 连续两字命中权重更高
    for (let i = 0; i < q.length - 1; i++) {
      const bi = q.slice(i, i + 2);
      if (it.desc.includes(bi)) s += 3;
    }
    return { ...it, s };
  });
  scored.sort((a, b) => b.s - a.s);
  const top = scored.filter((x) => x.s > 0).slice(0, n);
  return (top.length ? top : items.slice(0, n)).map(({ file, desc }) => ({ file, desc }));
}

/* 随机挑一张（够用场景：想发图但没指定情绪） */
function random() {
  const items = all();
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

/* 生成一段目录摘要，供模型参考（太长就截断） */
function catalog(max = 40) {
  const items = all();
  return items.slice(0, max).map((it) => `${it.file}：${it.desc}`).join('\n');
}

module.exports = { all, search, random, catalog };
