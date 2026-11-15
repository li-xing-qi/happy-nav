/**
 * 四层记忆系统 · 低频浓缩器（L2→L3 沉淀 + L3 久远压缩）。
 *
 * 为什么这么设计：
 * 1) 原实现里 L2 摘要 30 天后只是「淡出」，从未变成长期事实；L3 又没有低频删改压缩。
 *    本模块补齐这两条链路，但严格保持「不丢信息」：所有压缩只把 status 改成
 *    compacted 归档，文件里一条都不删，MEMORY.md 一个字节都不改。
 * 2) 用户要求「长期记忆压缩频率远远低于近期记忆」，所以用 compact-state.json 做
 *    30 天节流；L2 每次 render 都按 7 天窗口裁剪，L3 一个月才检查一次。
 * 3) 不调 LLM、零第三方依赖：摘要清洗用正则去掉归档前缀与频次统计，久远判定用词表。
 *    稳定身份偏好（喜欢 / 习惯 / 称呼…）永不因时间压缩，避免把人设当课表删掉。
 * 4) 全程 try/catch，单个文件损坏只影响该 Phase，绝不抛到调用方；dry-run 只读不写。
 *
 * 坑：不能用「跑完就删 digest」来做幂等，那会丢信息；正确做法是给 digest 打
 *    compactedAt 标记，渲染层跳过它，文件里仍保留原文以便回溯。
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const C = require('./constants');
const store = require('./store');

/** 计算 MEMORY.md 的 md5；读不到返回 null。 */
function memoryMd5(paths) {
  try {
    return crypto.createHash('md5').update(fs.readFileSync(paths.memoryMd)).digest('hex');
  } catch (err) {
    return null;
  }
}

/**
 * 把一条 L2 摘要清洗成可读的长期事实：
 * 去掉 [L1归档 xxx] / [局终] 前缀、去掉「共 N 条明细（kind×N）」频次统计、
 * 保留结论与关键节点、限长 200 字。
 */
function cleanDigestText(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/^\s*\[[^\]]+\]\s*/g, '');
  text = text.replace(/共\s*\d+\s*条明细（[^）]*）\s*。?/g, '');
  text = text.replace(/。{2,}/g, '。');
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/^[；;，,。.\s]+/, '').replace(/[；;，,。.\s]+$/, '');
  text = text.trim();
  if (text.length > C.COMPACT_FACT_MAX_CHARS) {
    text = text.slice(0, C.COMPACT_FACT_MAX_CHARS).trim();
  }
  return text;
}

/** Phase A：沉淀满 7 天的 L2 摘要 → 浓缩成 L3 长期事实（单次最多 50 条）。 */
function phaseA(now, dryRun) {
  const result = { scanned: 0, eligible: 0, added: 0, skipped: 0, marked: 0 };
  try {
    const entries = store.readRecentDigest().entries;
    result.scanned = entries.length;
    const cutoff = now - C.COMPACT_MIN_AGE_DAYS * C.DAY_MS;
    const candidates = entries
      .filter(
        (e) =>
          e &&
          Number(e.at) &&
          Number(e.at) <= cutoff &&
          !e.compactedAt &&
          String(e.summary || '').trim()
      )
      .slice(0, C.COMPACT_MAX_DIGESTS_PER_RUN);
    result.eligible = candidates.length;

    // 已有同文 active 事实就不重复新增，但仍标记 digest，保证幂等
    const existing = new Set();
    try {
      for (const f of store.readLongtermFacts()) {
        if (f && String(f.status) === 'active') existing.add(String(f.text || '').trim());
      }
    } catch (err) {
      /* 旁路文件读不到就按空集合处理 */
    }

    const markedIds = [];
    for (const d of candidates) {
      const text = cleanDigestText(d.summary);
      if (!text) {
        result.skipped += 1;
        continue;
      }
      if (existing.has(text)) {
        result.skipped += 1;
        markedIds.push(String(d.id));
        continue;
      }
      if (dryRun) {
        result.added += 1;
        markedIds.push(String(d.id));
        existing.add(text);
        continue;
      }
      const fact = store.appendLongtermFact({
        text,
        at: Number(d.at) || now,
        source: String(d.id || ''),
        kind: 'distilled',
      });
      if (fact) {
        result.added += 1;
        markedIds.push(String(d.id));
        existing.add(text);
      } else {
        result.skipped += 1;
      }
    }
    if (!dryRun && markedIds.length) {
      result.marked = store.markDigestsCompacted(markedIds).length;
    }
    return result;
  } catch (err) {
    return result;
  }
}

/** Phase B：L3 久远低频压缩（30 天节流）；只归档不删，稳定事实永不压缩。 */
function phaseB(now, dryRun) {
  const result = { ran: false, skippedByInterval: false, scanned: 0, compacted: 0, kept: 0 };
  try {
    const state = store.readCompactState();
    const last = Number(state.lastRunAt) || 0;
    if (last > 0 && now - last < C.COMPACT_INTERVAL_DAYS * C.DAY_MS) {
      result.skippedByInterval = true;
      return result;
    }
    result.ran = true;
    const facts = store.readLongtermFacts();
    result.scanned = facts.length;
    const cutoff = now - C.LONGTERM_STALE_DAYS * C.DAY_MS;
    const ids = [];
    for (const f of facts) {
      if (!f || String(f.status) !== 'active') continue;
      const at = Number(f.at) || 0;
      const text = String(f.text || '');
      const timeSensitive = C.TIME_SENSITIVE_WORDS.some((w) => text.includes(w));
      const stable = C.STABLE_FACT_WORDS.some((w) => text.includes(w));
      if (at > 0 && at <= cutoff && timeSensitive && !stable) {
        ids.push(String(f.id));
      } else {
        result.kept += 1;
      }
    }
    if (dryRun) {
      result.compacted = ids.length;
    } else {
      if (ids.length) result.compacted = store.markFactsCompacted(ids).length;
      store.writeCompactState({ lastRunAt: now });
    }
    return result;
  } catch (err) {
    return result;
  }
}

/** 执行两个 Phase，返回统计（含 MEMORY.md md5 前后对比）。 */
function compact(options) {
  const o = options && typeof options === 'object' ? options : {};
  const dryRun = o.dryRun === true;
  if (o.root) C.setRoot(o.root);
  const paths = C.resolvePaths();
  const now = Number(o.asOf) || Date.now();
  const md5Before = memoryMd5(paths);
  const a = phaseA(now, dryRun);
  const b = phaseB(now, dryRun);
  const md5After = memoryMd5(paths);
  return {
    dryRun,
    asOf: now,
    memoryMd: paths.memoryMd,
    md5Before,
    md5After,
    memoryMdUnchanged: md5Before === md5After,
    phaseA: a,
    phaseB: b,
  };
}

/** 命令行入口：node compact.js [--dry-run] [root]。 */
function main(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const dryRun = args.includes('--dry-run');
  const rootArg = args.find((a) => !String(a).startsWith('--'));
  const result = compact({ dryRun, root: rootArg });
  const fmt = (v) => (v === null ? '(不可读)' : String(v));
  console.log(`[compact] 模式：${dryRun ? '预览 dry-run（不写任何文件）' : '执行'}`);
  console.log(`[compact] MEMORY.md：${result.memoryMd}`);
  console.log(
    `[compact] md5 before=${fmt(result.md5Before)} after=${fmt(result.md5After)} 一致=${result.memoryMdUnchanged}`
  );
  const a = result.phaseA;
  console.log(
    `[compact] Phase A 扫描=${a.scanned} 够格=${a.eligible} 新增长期事实=${a.added} 跳过=${a.skipped} 标记digest=${a.marked}`
  );
  const b = result.phaseB;
  console.log(
    `[compact] Phase B ${b.skippedByInterval ? '因 30 天节流跳过' : '已执行'} 扫描=${b.scanned} 归档压缩=${b.compacted} 保留=${b.kept}`
  );
  if (dryRun) console.log('[compact] dry-run 未写入任何文件');
  return result;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { compact, main, cleanDigestText, memoryMd5 };
