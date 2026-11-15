#!/usr/bin/env node
/**
 * 记忆可见 / 审计命令行（让「一句话能改」真的能改）
 *
 *   node memory/audit.js list                    列出当前生效的约定
 *   node memory/audit.js all                    列出全部记录（含已归档）
 *   node memory/audit.js revoke <id>             按 id 精确撤销一条
 *   node memory/audit.js archive-ghosts          归档存量幽灵规则
 *   node memory/audit.js llm                    查看语义裁决器当前状态
 *
 * 为什么需要：原来规则写进去后既看不见也改不掉，说「这条不算了」还会
 * 把当前作用域所有规则一次清空。这个命令让规则可列出、可按 id 精确撤销。
 */
'use strict';

const C = require('./constants.js');
if (process.argv[2] && !['list', 'all', 'revoke', 'archive-ghosts', 'llm'].includes(process.argv[2])) {
  // 允许把 root 作为第二个参数传给验收脚本之外的调用；这里只做提示
}
const store = require('./store.js');
const adapters = require('./adapters.js');
const llm = require('./llm.js');

const cmd = process.argv[2] || 'list';

function fmt(r) {
  const when = r.at ? new Date(r.at).toISOString().slice(0, 10) : '-';
  return `  [${r.id}] ${r.status === 'active' ? '●' : '○'} ${String(r.scope).padEnd(7)} ${when}  ${r.text}`;
}

function main() {
  if (cmd === 'llm') {
    console.log('语义裁决器:', llm.describe());
    console.log('模式 MEMORY_LLM =', process.env.MEMORY_LLM || 'auto');
    console.log('未启用或超时时，自动走保守兜底（宁可少记，不可错记）。');
    return;
  }

  if (cmd === 'list' || cmd === 'all') {
    const all = store.readAdapters();
    const rows = cmd === 'list' ? all.filter((r) => r.status === 'active') : all;
    console.log(`共 ${rows.length} 条${cmd === 'list' ? '生效' : '记录'}：`);
    if (!rows.length) { console.log('  （空）'); return; }
    for (const r of rows) console.log(fmt(r));
    if (cmd === 'list') console.log('\n精确撤销：node memory/audit.js revoke <id>');
    return;
  }

  if (cmd === 'revoke') {
    const id = process.argv[3];
    if (!id) { console.error('用法：node memory/audit.js revoke <id>'); process.exit(1); }
    const hit = adapters.revokeById(id);
    if (!hit.length) { console.log(`没找到 id=${id} 的生效规则（用 list 查看）`); return; }
    for (const r of hit) console.log(`已归档：[${r.id}] ${r.text}`);
    return;
  }

  if (cmd === 'archive-ghosts') {
    const n = adapters.archiveGhosts();
    console.log(`已归档 ${n} 条幽灵规则（写入了但永远注入不到的 session 档规则）。`);
    console.log('注意：这一步只改状态，不删数据，也不改注入端。');
    return;
  }

  console.error('未知命令：' + cmd);
  process.exit(1);
}

main();
