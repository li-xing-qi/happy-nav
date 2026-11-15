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
/* 目标文件可由 MEMORY_MD_FILE 指定：某些部署的工作区不在仓库内
 * （例如独立工作区 + 独立 agent-bot 目录），此时没有 config.js 也能用。 */
let cfg = null;
try { cfg = require('../config.js'); } catch {}

function memoryFile(opts) {
  if (opts && opts.file) return opts.file;
  if (process.env.MEMORY_MD_FILE) return process.env.MEMORY_MD_FILE;
  if (cfg && cfg.personaDir) return path.join(cfg.personaDir, 'MEMORY.md');
  return path.join(__dirname, '..', '..', 'workspace', 'MEMORY.md');
}

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
  const file = memoryFile(opts);

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

/* ============================================================
   语义门槛（异步）：判断权交给模型，脚本只做保守兜底
   ------------------------------------------------------------
   原实现由 detectRemember 的正则直接落盘，「我记住了，谢谢你」会被写成
   「了，谢谢你」。现在先由 llm.judgeFact 裁决，模型不可用时走保守兜底。
   ============================================================ */

/* 模型裁决器路径可配置：仓库布局是 ../../memory/llm.js，
 * 某些部署（如独立工作区）可用 MEMORY_LLM_MODULE 指向别处。
 * 找不到时降级为「永远返回 null」，由保守兜底接管，不影响主链路。 */
let llm;
try {
  llm = require(process.env.MEMORY_LLM_MODULE || '../../memory/llm.js');
} catch {
  llm = { judgeFact: async () => null };
}

/** 兜底时一票否决的表达（完成态 / 拖延 / 元语言否定 / 反问） */
const REJECT_WORDS = [
  '我记住了', '记住了，谢谢', '再说吧', '算了', '回头说', '下次吧',
  '我不是这个意思', '不是这个意思', '打不过', '不玩了', '记不住',
];
/** 兜底时只认这些显式祈使前缀 */
const STRICT_PREFIXES = ['记住：', '记住:', '记一下：', '记一下:', '帮我记', '别忘了', '记着：', '记着:'];

function conservativeFact(rawText) {
  const t = String(rawText || '').trim();
  if (!t || REJECT_WORDS.some((w) => t.includes(w))) return null;
  const hit = STRICT_PREFIXES.find((w) => t.startsWith(w));
  if (!hit) return null;
  const fact = t.slice(hit.length).replace(/^[，,：:\s]+/, '').replace(/[。.！!？?]+$/g, '').trim();
  if (fact.length < 2) return null;
  return fact;
}

/**
 * 带语义裁决的写入（主链路用这个）。
 * @param {string} text 用户原话（完整）
 * @param {object} [opts] {file}
 * @returns {Promise<{ok:boolean, skipped?:boolean, message:string, file?:string}>}
 */
async function rememberAsync(text, opts = {}) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { ok: false, message: '内容为空' };
  const verdict = await llm.judgeFact(raw);
  const fact = verdict ? (verdict.keep ? verdict.fact : null) : conservativeFact(raw);
  if (!fact) return { ok: true, skipped: true, message: '不是需要长期记住的事实，跳过' };
  return remember(fact, opts);
}

module.exports = { remember, rememberAsync, conservativeFact, MARK_LONG, MARK_RECENT };
