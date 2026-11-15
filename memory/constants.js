/**
 * 四层记忆系统 · 路径、预算、枚举与词表的唯一来源。
 *
 * 为什么这么设计：
 * 1) 现网已有 MEMORY.md / chatlog.jsonl / AGENTS.md / shared-state.json 四个写入端，
 *    本系统坚持「只读旧数据 + 旁路元数据 + 新增文件」，所以所有旧文件路径必须集中在这里，
 *    避免任何模块把绝对路径这类硬编码散落到代码里。
 * 2) 所有路径都可通过 process.env 覆盖，同时提供 resolvePaths / setRoot 供 selftest 指向临时目录，
 *    这样测试永远不会碰到真实数据文件。踩过的坑：模块加载时把路径算成常量快照，
 *    之后 setRoot 不生效，测试会误写真实目录。
 * 3) BUDGET 按「通道」分档：聊天室上下文短、游戏页中等、与鱼桥最长。
 * 4) 四层编号一律按 PRD v2：L1 临时 / L2 近期 / L3 长期 / L4 适配器。
 *    v1 方案稿的 L1=会话约定、L2=长期事实、L3=近期事件 编号全部作废，不要参考。
 * 5) identity（AGENTS.md）完整性优先：BUDGET 里的 identity 字段仅为结构占位，
 *    渲染层不得裁剪它，也不把它计入预算扣减。
 *
 * 坑：中文按字符数裁剪会严重低估 prompt 体积，一律用 Buffer.byteLength(utf8) 计字节。
 */
'use strict';

const path = require('path');
const crypto = require('crypto');

/** 现网工作区根目录，可用环境变量整体覆盖。 */
/* 默认根目录 = 站点目录下的 workspace/。
   这样仓库克隆到哪里都能直接跑，不依赖任何绝对路径。 */
const DEFAULT_ROOT = require('node:path').join(__dirname, '..', 'workspace');

/** 本模块所在目录（部署时即 <root>/memory，用作测试夹具基准，不依赖默认 root 在本机存在）。 */
const MODULE_DIR = __dirname;

/** 当前生效的根目录（模块级可变，CommonJS 单例，setRoot 后所有模块同步生效）。 */
let activeRoot = process.env.QQ_WORKSPACE_ROOT || DEFAULT_ROOT;

/** L2 近期记忆窗口：7 天。 */
const RECENT_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** L2 最多保留多少「轮」。 */
const RECENT_MAX_TURNS = 120;
/** L2 浓缩摘要的有效期（超过后不再注入，但文件里永不物理删除）。 */
const DIGEST_TTL_DAYS = 30;
/** 双写去重的时间容差：yu / qq 两条同文记录通常相差几百毫秒。 */
const DEDUP_TOLERANCE_MS = 10 * 1000;
/** L1 每累积多少条明细触发一次提炼上浮（明细归档不删）。 */
const EPHEMERAL_DISTILL_THRESHOLD = 40;
/** L1 渲染给模型时最多展示多少条明细。 */
const EPHEMERAL_VIEW_ITEMS = 12;
/** activeAdapters 缓存上限：1 秒（写入后主动失效，保证「下一步别连」立刻生效）。 */
const ADAPTER_CACHE_MAX_MS = 1000;
/** 渲染层 mtime 缓存的最长存活时间，兜住「同一毫秒改写且 size 相同」的漏刷新。 */
const CACHE_MAX_AGE_MS = 1500;

/** 作用域枚举。 */
const SCOPE = Object.freeze({
  ONCE: 'once',
  SESSION: 'session',
  GAME: 'game',
});

/** 四层数据文件名（都落在 <root>/memory/data/ 下）。 */
const DATA_FILES = Object.freeze({
  ephemeral: 'ephemeral.json',
  longtermMeta: 'longterm-meta.json',
  recentDigest: 'recent-digest.json',
  adapters: 'adapters.json',
  longtermFacts: 'longterm-facts.json',
  compactState: 'compact-state.json',
});

/**
 * L2→L3 浓缩与 L3 久远压缩的低频参数。
 * 为什么这么设计：用户要求「长期记忆删改压缩的频率远远低于近期记忆」，
 * 所以 L2 每次渲染都按 7 天窗口裁剪，而 L3 只在 30 天周期里检查一次；
 * 且只对久远（540 天 ≈ 一年半，比三年保守，避免误删还没过期的学期信息）
 * 且带时效性词的事实做归档，稳定身份偏好永不因时间压缩。
 * 所有压缩只改 status、绝不物理删除，MEMORY.md 一个字节都不动。
 */
const COMPACT_MIN_AGE_DAYS = 7;
const LONGTERM_STALE_DAYS = 540;
const COMPACT_INTERVAL_DAYS = 30;
/** 单次 L2→L3 最多处理多少条摘要，避免一次跑太久。 */
const COMPACT_MAX_DIGESTS_PER_RUN = 50;
/** 浓缩成一条长期事实时的最大字数。 */
const COMPACT_FACT_MAX_CHARS = 200;

/** 时效性词：命中说明这条信息会过期（三年以前的课表没人记得住）。 */
const TIME_SENSITIVE_WORDS = Object.freeze([
  '课表', '考试', '上机', '周次', '单周', '双周', '第几周', '临时安排',
  '明天', '下周', '截止', '期中', '期末', '补课', '调课', '排班',
  '日程', '这学期', '本学期', '本周', '这周',
]);
/** 稳定身份偏好词：命中则永不因久远而压缩（优先级高于时效性词）。 */
const STABLE_FACT_WORDS = Object.freeze([
  '称呼', '喜欢', '不喜欢', '习惯', '风格', '总是', '从来', '专业',
  '名字', '讨厌', '偏爱', '一直', '向来', '性格', '口味',
]);

/** 旧数据文件名（只读，绝不写）。 */
const LEGACY_FILES = Object.freeze({
  agentsMd: 'AGENTS.md',
  memoryMd: 'MEMORY.md',
  chatlog: 'chatlog.jsonl',
  sharedState: 'shared-state.json',
});

/**
 * 分档预算，单位「字节」。
 *
 * 【重要 · 不丢信息硬约束】
 * identity（AGENTS.md 人设与运维规则）绝对不可裁剪，且不参与预算扣减。
 * longterm（MEMORY.md 全部事实行）在正常预算下整块全文注入，不因行数多而截断。
 * 原因：改版前现网就是把这两份文件全文注入 system（约 18KB）。
 *      若为了省字节把人设或长期事实切掉，属于丢失信息，用户明确禁止。
 * 常规削减只作用于 recent（近期对话）与 ephemeral（局内明细）——
 * 这两层本来就设计成「浓缩后上浮」，重复与噪声可以安全丢弃。
 * 仅当调用方显式传了极小的 budgetBytes、且前两层裁光仍超预算时，
 * 才依次裁 longterm（从头部保留「关于老板」等靠前行）与 adapters，并置 meta.degraded。
 * adapters 优先级最高（用户说「下一步别连」必须即时生效），最后才动。
 *
 * total 保持在 30KB 上下：正常情况下 identity+longterm 约 18KB，
 * 与改版前持平，满足「相对当前基线不劣化」；新增层只占剩余额度。
 */
const BUDGET = Object.freeze({
  light: Object.freeze({
    total: 26000,
    identity: 20000,
    adapters: 4000,
    longterm: 16000,
    recent: 3000,
    ephemeral: 1500,
  }),
  standard: Object.freeze({
    total: 30000,
    identity: 20000,
    adapters: 5000,
    longterm: 16000,
    recent: 5000,
    ephemeral: 2500,
  }),
  full: Object.freeze({
    total: 36000,
    identity: 20000,
    adapters: 6000,
    longterm: 16000,
    recent: 8000,
    ephemeral: 4000,
  }),
});

/** render() 允许削减的块；identity / longterm / adapters 一律不在此列。 */
const CUTTABLE_BLOCKS = Object.freeze(['recent', 'ephemeral']);

/** 通道 → 默认预算档。 */
const CHANNEL_TIER = Object.freeze({
  chat: 'light',
  game: 'standard',
  'api-chat': 'standard',
  yu: 'full',
});

/** game 档显式词：出现即「跨局长期」。 */
const GAME_SCOPE_WORDS = Object.freeze([
  '以后', '每次', '默认', '记住', '都这样', '规则改成',
]);
/**
 * 打法纠正 / 偏好词：说明用户在改「怎么做事」，不是请求眼下让一手。
 * 例：「你这样不对，先打给格挡的牌」→ game（之后各局都优先打防牌）。
 * 注意优先级低于局面锚点，避免把「马上要连五了别连」误判成长期规则。
 */
const GAME_PREFERENCE_WORDS = Object.freeze([
  '这样不对', '不对', '打法', '流派', '优先', '先打', '应该先',
  '别贪', '改成', '以后打', '多打', '少打',
]);
/** 纠正类触发词：让「你这样不对，先打…」也能被识别成写入适配器的指令。 */
const CORRECTION_WORDS = Object.freeze([
  '这样不对', '不对', '打法改成', '改成', '别这么打', '应该', '优先', '先打',
]);
/** once 档显式词：出现即「仅下一次决策」。 */
const ONCE_SCOPE_WORDS = Object.freeze([
  '这次', '这一手', '下一步', '就这一次', '就这一下',
]);
/** session 档显式词：出现即「本局」。 */
const SESSION_SCOPE_WORDS = Object.freeze([
  '这局', '这一把', '本局', '这把',
]);
/** 局面锚点：命中说明是「眼下这一步」，不该长期化。 */
const SITUATION_ANCHORS = Object.freeze([
  '马上', '要连', '快赢', '这一步', '眼下',
]);

/**
 * 立约定类触发词（与「即时纠正」分开）。
 * 这类是开局规则 / 玩法约定，必须跨自然日、跨局仍生效，
 * 直到用户明确撤销或被新约定取代——AC-4 的核心判据。
 * 「规则：」「定个规矩」原来根本不触发写入，是实测发现的缺口。
 */
const RULE_COMMAND_WORDS = Object.freeze([
  '记住这条规则', '规则改成', '打法改成', '从今往后', '定个规矩',
  '约定', '规则：', '规则:', '规矩', '开局规则',
]);

/** 添加类命令触发词（立约定词在前，避免被短词抢掉）。 */
const ADD_COMMAND_WORDS = Object.freeze([
  ...RULE_COMMAND_WORDS,
  '记住这条', '以后都', '都这样', '以后', '记住',
]);
/** 撤销类命令触发词。 */
const REVOKE_COMMAND_WORDS = Object.freeze([
  '这条不算了', '规则取消', '别这样了', '取消这条', '恢复默认',
  '别按这个', '这条作废', '忘掉这条', '不算了', '撤销',
]);

/**
 * 给模型的时间硬规则。render() 会把它拼在最前面。
 * 注意：这里刻意不写任何具体日期样例，避免 selftest 的 ISO 日期检测被规则文本自身触发。
 */
const TIMESTAMP_RULES = [
  '【时间表达规则 · 必须遵守】',
  '记忆条目里括号或方括号中的时间只是记录时间，仅供你判断事情新旧，不要当成谈话内容。',
  '回复里不要出现日期、年月日或时间戳，也不要逐条复述每条记录的时间。',
  '说话要像人，不像日志或流水账。',
  '只有当你被问「什么时候」、时间本身就是对方要的事实、或用户明确要求列清单时，才可以提时间。',
  '即使要提时间，也优先用「上次」「前几天」「前阵子」「最近」这类相对说法。',
].join('\n');

/** 根据根路径解析出全套绝对路径；不传参时用当前 activeRoot。 */
function resolvePaths(root) {
  const base = path.resolve(root || activeRoot);
  const memoryHome = path.join(base, 'memory');
  const dataDir = path.join(memoryHome, 'data');
  return Object.freeze({
    root: base,
    memoryHome,
    dataDir,
    agentsMd: path.join(base, LEGACY_FILES.agentsMd),
    memoryMd: path.join(base, LEGACY_FILES.memoryMd),
    chatlog: path.join(base, LEGACY_FILES.chatlog),
    sharedState: path.join(base, LEGACY_FILES.sharedState),
    ephemeral: path.join(dataDir, DATA_FILES.ephemeral),
    longtermMeta: path.join(dataDir, DATA_FILES.longtermMeta),
    recentDigest: path.join(dataDir, DATA_FILES.recentDigest),
    adapters: path.join(dataDir, DATA_FILES.adapters),
    longtermFacts: path.join(dataDir, DATA_FILES.longtermFacts),
    compactState: path.join(dataDir, DATA_FILES.compactState),
  });
}

/** 覆盖全局根路径（selftest / 部署到非默认路径时用）。 */
function setRoot(root) {
  activeRoot = path.resolve(root || DEFAULT_ROOT);
  return resolvePaths();
}

/** 读取当前全局根路径。 */
function getRoot() {
  return activeRoot;
}

/** 默认路径快照，方便只读引用；动态场景请用 resolvePaths()。 */
const PATHS = resolvePaths();

/** 稳定短哈希：把元数据绑定到 MEMORY.md 的某一行，不怕行号变动。 */
function fingerprint(text) {
  const normalized = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 12);
}

/** 相对时间标签，永远不返回 ISO 日期。 */
function relativeLabel(at, asOf) {
  const now = Number(asOf) || Date.now();
  const then = Number(at);
  if (!Number.isFinite(then) || then <= 0) return '早些时候';
  let delta = now - then;
  if (delta < 0) delta = 0;
  if (delta < 60 * 1000) return '刚刚';
  if (delta < 60 * 60 * 1000) return '几分钟前';
  if (delta < DAY_MS) return '今天';
  const days = Math.floor(delta / DAY_MS);
  if (days < 7) return `${days}天前`;
  if (days < 14) return '上周';
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  if (days < 60) return '上个月';
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return '很久以前';
}

/** 计算 UTF-8 字节数。 */
function byteLen(text) {
  return Buffer.byteLength(String(text == null ? '' : text), 'utf8');
}

/** 按字节裁剪文本，从尾部保留（越新的内容越相关），超长时加省略提示。 */
function clipTailBytes(text, limit) {
  const src = String(text == null ? '' : text);
  const max = Math.max(0, Number(limit) || 0);
  if (max === 0) return '';
  if (byteLen(src) <= max) return src;
  const marker = '…（更早内容已略）\n';
  const budget = Math.max(1, max - byteLen(marker));
  const lines = src.split('\n');
  const kept = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const cost = byteLen(lines[i]) + (kept.length ? 1 : 0);
    if (used + cost > budget) break;
    kept.push(lines[i]);
    used += cost;
  }
  if (kept.length === 0) {
    let out = '';
    for (let i = src.length - 1; i >= 0; i -= 1) {
      if (byteLen(out + src[i]) > budget) break;
      out = src[i] + out;
    }
    return marker + out;
  }
  return marker + kept.reverse().join('\n');
}

/** 按字节裁剪文本，从头部保留（identity 的人设开头不能丢）。 */
function clipHeadBytes(text, limit) {
  const src = String(text == null ? '' : text);
  const max = Math.max(0, Number(limit) || 0);
  if (max === 0) return '';
  if (byteLen(src) <= max) return src;
  const marker = '\n…（后文已略）';
  const budget = Math.max(1, max - byteLen(marker));
  const lines = src.split('\n');
  const kept = [];
  let used = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const cost = byteLen(lines[i]) + (kept.length ? 1 : 0);
    if (used + cost > budget) break;
    kept.push(lines[i]);
    used += cost;
  }
  if (kept.length === 0) {
    let out = '';
    for (let i = 0; i < src.length; i += 1) {
      if (byteLen(out + src[i]) > budget) break;
      out += src[i];
    }
    return out + marker;
  }
  return kept.join('\n') + marker;
}

/** 把文本里的 ISO 日期 / 时间戳替换成相对表达，保证 render 输出不出现裸日期。 */
function scrubIsoDates(text, asOf) {
  const src = String(text == null ? '' : text);
  return src.replace(/\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+Z\- ]{0,20})?/g, (match) => {
    const parsed = Date.parse(match.slice(0, 10) + 'T00:00:00Z');
    return Number.isFinite(parsed) ? relativeLabel(parsed, asOf) : '早些时候';
  });
}

module.exports = {
  DEFAULT_ROOT,
  MODULE_DIR,
  RECENT_WINDOW_DAYS,
  DAY_MS,
  RECENT_MAX_TURNS,
  DIGEST_TTL_DAYS,
  DEDUP_TOLERANCE_MS,
  EPHEMERAL_DISTILL_THRESHOLD,
  EPHEMERAL_VIEW_ITEMS,
  ADAPTER_CACHE_MAX_MS,
  CACHE_MAX_AGE_MS,
  COMPACT_MIN_AGE_DAYS,
  LONGTERM_STALE_DAYS,
  COMPACT_INTERVAL_DAYS,
  COMPACT_MAX_DIGESTS_PER_RUN,
  COMPACT_FACT_MAX_CHARS,
  TIME_SENSITIVE_WORDS,
  STABLE_FACT_WORDS,
  SCOPE,
  DATA_FILES,
  LEGACY_FILES,
  BUDGET,
  CUTTABLE_BLOCKS,
  CHANNEL_TIER,
  GAME_SCOPE_WORDS,
  GAME_PREFERENCE_WORDS,
  CORRECTION_WORDS,
  RULE_COMMAND_WORDS,
  ONCE_SCOPE_WORDS,
  SESSION_SCOPE_WORDS,
  SITUATION_ANCHORS,
  ADD_COMMAND_WORDS,
  REVOKE_COMMAND_WORDS,
  TIMESTAMP_RULES,
  PATHS,
  resolvePaths,
  setRoot,
  getRoot,
  fingerprint,
  relativeLabel,
  byteLen,
  clipTailBytes,
  clipHeadBytes,
  scrubIsoDates,
};
