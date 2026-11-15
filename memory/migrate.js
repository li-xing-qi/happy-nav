/**
 * 四层记忆系统 · 一次性初始化（幂等，可反复运行）。
 *
 * 为什么这么设计：MEMORY.md 由 summarize.py 每天 03:20 重写，行号会漂移，
 * 所以不能按行号存元数据，只能按「行的稳定短哈希」建立旁路索引。
 * 本脚本只读 MEMORY.md，为每条非空非标题行补一条 longterm-meta 记录，
 * 时间用文件 mtime 推断并标 atKnown:false（诚实标注「这是猜的」）。
 * 绝不修改 MEMORY.md 任何一个字节，也不碰任何旧写入端。
 * --dry-run 只预览不落盘。
 */
'use strict';

const fs = require('fs');
const C = require('./constants');
const store = require('./store');

/** 执行导入，返回统计结果。 */
function migrate(options) {
  const o = options && typeof options === 'object' ? options : {};
  const dryRun = o.dryRun === true;
  if (o.root) C.setRoot(o.root);
  const paths = C.resolvePaths();
  let raw = '';
  let mtime = Date.now();
  try {
    raw = fs.readFileSync(paths.memoryMd, 'utf8');
    mtime = fs.statSync(paths.memoryMd).mtimeMs;
  } catch (err) {
    return {
      total: 0,
      imported: 0,
      skipped: 0,
      dryRun,
      source: paths.memoryMd,
      error: 'MEMORY.md 不可读',
    };
  }
  const meta = store.readLongtermMeta();
  const lines = raw.split(/\r?\n/);
  let total = 0;
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || /^#{1,6}\s/.test(line)) continue;
    total += 1;
    const fp = C.fingerprint(line);
    if (Object.prototype.hasOwnProperty.call(meta.entries, fp)) {
      skipped += 1;
      continue;
    }
    meta.entries[fp] = {
      at: mtime,
      atKnown: false,
      status: 'active',
      supersedes: null,
      correctedText: null,
      source: `MEMORY.md:L${i + 1}`,
    };
    imported += 1;
  }
  if (!dryRun && imported > 0) store.writeJson(paths.longtermMeta, meta);
  return { total, imported, skipped, dryRun, source: paths.memoryMd, error: null };
}

/** 命令行入口：node migrate.js [--dry-run]。 */
function main(argv) {
  const dryRun = (argv || []).includes('--dry-run');
  const result = migrate({ dryRun });
  if (result.error) {
    console.log(`[migrate] 跳过：${result.error}（${result.source}）`);
    return result;
  }
  console.log(
    `[migrate] ${dryRun ? '预览' : '导入'}：MEMORY.md 有效行 ${result.total} 条，` +
      `新增 ${result.imported} 条，已存在跳过 ${result.skipped} 条` +
      (dryRun ? '（未写入任何文件）' : '')
  );
  return result;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { migrate, main };
