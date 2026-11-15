// 「记住：……」的实现：往长期记忆的「关于老板」段追加一行
//
// 为什么用 JS 重写（移植时新增）：
//   原版调用外部脚本，多一个 Python 依赖、且脚本里写死了绝对路径。
//   这里改成纯 JS、走集中配置，行为与原脚本一致：
//     - 没有「关于老板」段就补一个
//     - 新条目插在「关于老板」段末尾、「最近动态」段之前
//     - 前 12 个字撞了就跳过（避免同一句话说两次写两条）
//   注意：这个函数只改长期记忆文件，不经过任何摘要器，所以「记住」是立即生效的。
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cfg = require('../config.js');

const MARK_LONG = '## 关于老板';
const MARK_RECENT = '## 最近动态';

/**
 * 追加一条长期记忆。
 * @param {string} raw 用户说的内容（不需要带「- 」前缀）
 * @param {object} [opts] { file } 可覆盖目标文件（测试用）
 * @returns {{ok:boolean, skipped?:boolean, message:string, file?:string}}
 */
function remember(raw, opts = {}) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return { ok: false, message: '内容为空' };

  const line = text.startsWith('- ') ? text : `- ${text}`;
  const file = opts.file || path.join(cfg.personaDir, 'MEMORY.md');

  let txt = '';
  try {
    txt = fs.readFileSync(file, 'utf8');
  } catch {
    txt = '';
  }

  // 没有目标章节就补一个
  if (!txt.includes(MARK_LONG)) {
    txt = `${txt.replace(/\s+$/, '')}\n\n${MARK_LONG}\n\n`;
  }

  const at = txt.indexOf(MARK_LONG);
  const head = txt.slice(0, at);
  const rest = txt.slice(at + MARK_LONG.length);

  let body = rest;
  let tail = '';
  const recentAt = rest.indexOf(MARK_RECENT);
  if (recentAt >= 0) {
    body = rest.slice(0, recentAt);
    tail = rest.slice(recentAt);
  }

  // 去重：取内容的紧凑前 12 个字，已在正文里出现就跳过
  const key = line.slice(2).replace(/\s+/g, '').slice(0, 12);
  if (key && body.replace(/\s+/g, '').includes(key)) {
    return { ok: true, skipped: true, message: '已有类似记录，跳过', file };
  }

  const nextBody = `${body.replace(/\s+$/, '')}\n${line}\n`;
  const out = `${head.replace(/\s+$/, '')}\n\n${MARK_LONG}${nextBody}${tail ? `\n${tail}` : ''}`;

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, out, 'utf8');
    fs.renameSync(tmp, file);   // 原子替换，避免摘要器读到半截
    return { ok: true, skipped: false, message: '已记住', file };
  } catch (e) {
    return { ok: false, message: `写入失败：${e.message}`, file };
  }
}

module.exports = { remember, MARK_LONG, MARK_RECENT };
