// 好感度 / 心情
//
// 定位：给她一个**慢变量**（亲密度 0~100）和一个**短时心情**，让她自己决定语气和配合度。
//
// 为什么要加「短时心情」（这一层是后补的）：
//   只有亲密度时，涨到 70 和 72 她说的话一模一样——看起来不像有情绪的人，
//   像在读一个配置表。所以拆成两层：
//     · 亲密度（慢）：几周尺度的关系，0~100，十档
//     · 心情（快）：几个小时尺度的情绪，6 小时自动过期回「平静」
//   心情不是算出来的，是她在 feel 里一起报上来的（opts.mood）。
//
// 为什么不用固定脚本算分（这条是踩过之后改的）：
//   最早是词表 + 固定加减分（被夸 +5、被凶 -7…）。问题是每个人对她的养法不一样，
//   同一句话在不同关系里分量差很多，脚本一刀切会显得「千篇一律」。
//   现在改成：**规则和当前数值直接告诉她，由她自己判断该不该变、变多少**，
//   调用 feel 工具记下来。脚本只做三件模型做不了的事：
//     1. 存盘（原子写，写失败静默）
//     2. 边界（0~100，单次幅度上限，防止一次刷满或一次清零）
//     3. 回落（软锚：往「近 24 小时最高 - 6」靠，底线不低于 55，避免一次吵架永久生效）
//
// 为什么回落要改软锚（原来是每 8 小时往 55 拉）：
//   涨到 80 只要两天不聊就被拽回「还算熟」，用户觉得「好感度太严苛」主要来自这里。
//   人的关系不会因为两天没说话就退回陌生人，所以落点改成跟着近 24 小时的峰值走。
//
// 纪律：数值不进正文。她可以因为亲密度低而话短、不答应小事，但不许阴阳怪气、
// 不许报复、不许把分数念出来——这些写在 promptBlock 的规则里。
//
// 存盘：<workspace>/data/mood.json（可用 MOOD_FILE 覆盖）
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let cfg = null;
try { cfg = require('../config.js'); } catch { /* 独立工作区部署没有 config.js */ }

/* 工作区判定：仓库布局用仓库内 workspace/；独立工作区（站点与 agent-bot 分开放，
 * 例如 /root/qq-workspace + /root/agent-bot）靠环境变量或约定路径兜底。
 * 判定顺序写死在这里，免得换台机器又要改代码。 */
function guessWorkspace() {
  const env = process.env.WORKSPACE_DIR || process.env.WS_DIR
    || process.env.QQ_WORKSPACE_ROOT || process.env.PERSONA_DIR;
  if (env) return env;
  if (cfg && cfg.workspace) return cfg.workspace;
  const split = '/root/qq-workspace';   // 现网这种分离部署的约定位置
  try { if (fs.statSync(split).isDirectory()) return split; } catch { /* 没有就往下走 */ }
  return path.join(__dirname, '..', '..', 'workspace');
}

const DEFAULT_FILE = path.join(guessWorkspace(), 'data', 'mood.json');
const FILE = () => process.env.MOOD_FILE || DEFAULT_FILE;

const BASE = { affinity: 55, energy: 70 };
const MIN = 0;
const MAX = 100;
/** 单次 felt 的幅度上限：模型说 +30 也只按 +12 算，防止一次刷满 */
const MAX_STEP = 12;
/** 回落：每 12 小时 1 点，单次最多 2 点。
 *  原来是 8 小时 1 点、单次最多 3 点——涨得慢、掉得快，日常陪着聊也追不上回落，
 *  用户的原话是「好感太严苛」，所以把回落放慢一档。 */
const DECAY_PER_MS = 1 / (12 * 3600 * 1000);
const DECAY_MAX = 2;
/** 软锚：回落落点 = max(55, 近 24 小时最高 - 6)，不再固定 55 */
const ANCHOR_GAP = 6;
const DAY_MS = 24 * 3600 * 1000;
/** 心情 6 小时过期：早上的撒娇不该晚上还在 */
const MOOD_TTL = 6 * 3600 * 1000;
/** 心情枚举写死，前端/日志直接渲染中文，不让她自由发挥（自由文本没法做成标签） */
const MOOD_LABELS = ['开心', '黏人', '撒娇', '有点醋', '低落', '累了', '得意', '平静'];
const CALM = '平静';
/** 连续多少轮没记心情开始提醒她。选 6 是因为 3 轮容易被正常寒暄吃掉 */
const FEEL_NAG_AT = 6;
/** 计数节流：同一条消息经常被注入多次 promptBlock，不节流会把计数刷爆 */
const FEEL_TICK_MS = 60 * 1000;

/* 十档是从高到低排的，band() 的下标就是档位序号（0=最亲近）。 */
const BANDS = ['黏糊糊', '很亲近', '挺黏人', '亲近', '还算熟', '平常', '客气', '有点疏', '冷淡', '冷透了'];
/* 每档的下限，和 BANDS 一一对应（长度必须一致） */
const BAND_MIN = [92, 84, 74, 64, 54, 44, 34, 24, 12];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => Date.now();

/**
 * 取数字，缺失才用默认值。
 *
 * 为什么不能写成 `Number(v) || dflt`（这条踩过）：0 是合法值，
 * 但 `0 || 55` 得 55——存档里 affinity 恰好是 0（冷透了）时，读回来变成 55（还算熟），
 * 真实路径是 12 分吃一发 -12 落到 0，下次启动读档就「复活」了。
 */
function numOr(v, dflt) {
  if (v === null || v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function blank() {
  const ts = now();
  return {
    affinity: BASE.affinity,
    energy: BASE.energy,
    band: band(BASE.affinity),
    mood: { label: CALM, at: ts },
    peak24: BASE.affinity,
    peakAt: ts,
    roundsSinceFeel: 0,
    updatedAt: ts,
    log: [],
  };
}

/** 心情字段归一：非法值/过期值一律当「平静」，不抛错（存档脏了也不该影响对话） */
function readMood(raw, ts = now()) {
  const label = raw && typeof raw === 'object' ? String(raw.label || '') : '';
  const at = raw && typeof raw === 'object' ? Number(raw.at) || 0 : 0;
  if (!MOOD_LABELS.includes(label)) return { label: CALM, at: ts };
  if (!at || ts - at > MOOD_TTL) return { label: CALM, at: ts };
  return { label, at };
}

/** 当前该显示的心情（读时判断过期，不必写盘） */
function currentMood(state, ts = now()) {
  return readMood(state && state.mood, ts).label;
}

/**
 * 维护「近 24 小时最高」。
 * 为什么需要它：回落要有落点，落点必须跟得上最近的真实高点，
 * 否则一次高峰过去后回落逻辑会把关系一路拽回 55（用户的痛点）。
 * 只在内存里更新，写盘由 write() 负责。
 */
function touchPeak(state, ts = now()) {
  const peak = Number(state.peak24);
  const at = Number(state.peakAt) || 0;
  if (!Number.isFinite(peak) || !at || ts - at > DAY_MS) {
    state.peak24 = state.affinity;
    state.peakAt = ts;
    return state;
  }
  if (state.affinity >= peak) {
    state.peak24 = state.affinity;
    state.peakAt = ts;
  } else {
    state.peak24 = peak;
  }
  return state;
}

/** 回落落点：近 24 小时最高 - 6，但不低于基准 55 */
function anchorOf(state) {
  const peak = Number(state.peak24);
  if (!Number.isFinite(peak)) return BASE.affinity;
  return clamp(Math.round(peak - ANCHOR_GAP), BASE.affinity, MAX);
}

function read() {
  try {
    const o = JSON.parse(fs.readFileSync(FILE(), 'utf8'));
    if (!o || typeof o !== 'object') return blank();
    const ts = now();
    const affinity = clamp(numOr(o.affinity, BASE.affinity), MIN, MAX);
    const state = {
      affinity,
      energy: clamp(numOr(o.energy, BASE.energy), MIN, MAX),
      updatedAt: numOr(o.updatedAt, ts),
      log: Array.isArray(o.log) ? o.log.slice(-20) : [],
      /* 老存档没有这几个字段（心情/峰值/催记计数是后加的），缺了就按基准补齐，
       * 不额外写盘——写盘只在真正有变化时发生，免得每次读都动文件。 */
      mood: readMood(o.mood, ts),
      peak24: numOr(o.peak24, affinity),
      peakAt: numOr(o.peakAt, numOr(o.updatedAt, ts)),
      roundsSinceFeel: Math.max(0, Math.floor(numOr(o.roundsSinceFeel, 0))),
    };
    touchPeak(state, ts);
    /* band 一律按 affinity 重算：存档里的 band 只是给页面读的缓存。
     * 以前直接信它，一旦归档里的 band 和 affinity 对不上（比如旧 bug 把 0 读成 55），
     * 就会出现「55 分 / 冷透了」这种错位。不一致就顺手写回去修正。 */
    state.band = band(state.affinity);
    if (!o.band || String(o.band) !== state.band) write(state);
    return state;
  } catch {
    return blank();
  }
}

function write(state) {
  const ts = now();
  state.band = band(state.affinity);   // 让页面直接读这个字段，别在外面再抄一份阈值
  /* 过期心情在落盘这一刻收成「平静」：存档里别留着两天前的「撒娇」 */
  state.mood = readMood(state.mood, ts);
  touchPeak(state, ts);
  state.roundsSinceFeel = Math.max(0, Math.floor(Number(state.roundsSinceFeel) || 0));
  const file = FILE();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    /* 临时名带 pid：聊天室 / 五子棋 / 万象牌是三个进程，共用同一个 mood.json。
     * 固定叫 .tmp 的话，两个进程同时写会互相盖住临时文件，rename 后可能丢一次心情。
     * tickRounds 每 60 秒写一次之后，撞车概率比原来高，所以必须分开。 */
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch { /* 心情写不进去也不能影响对话 */ }
}

/**
 * 按时间往回落点靠。加 1e-6：dt 常比整点少几毫秒，不减会少算一步。
 *
 * 三个方向说清楚，免得以后又改成「一律往 55 拉」：
 *   · 高于落点（近 24h 峰值 - 6）：往落点降，单次最多 2 点
 *   · 低于基准 55：慢慢往 55 回升（吵崩了也有回头的机会）
 *   · 夹在 55 和落点之间：不动（这就是「软」的地方，不硬拽）
 */
function decay(state, ts = now()) {
  const dt = Math.max(0, ts - (Number(state.updatedAt) || ts));
  if (!dt) return state;
  const step = Math.min(DECAY_MAX, Math.floor(dt * DECAY_PER_MS + 1e-6));
  if (step > 0) {
    const anchor = anchorOf(state);
    if (state.affinity > anchor) state.affinity = Math.max(anchor, state.affinity - step);
    else if (state.affinity < BASE.affinity) state.affinity = Math.min(BASE.affinity, state.affinity + step);
  }
  state.updatedAt = ts;
  return state;
}

/** 心情标签归一：不在枚举里的一律当没传（她偶尔会自由发挥，不能让它污染存档） */
function moodLabelOf(v) {
  const s = String(v == null ? '' : v).trim();
  return MOOD_LABELS.includes(s) ? s : '';
}

/**
 * 她自己的判断：这件事让她心里上升/下降多少，顺手记下现在的心情。
 *
 * @param {number} delta 建议幅度（-12 ~ +12，超出按上限算）
 * @param {string} why 一句话理由（只留 24 字，用于排查，不进正文）
 * @param {object} [opts] { mood, kind }
 *   · mood 短时心情，取值见 MOOD_LABELS；不传就沿用旧的（过期自动回平静）
 *   · kind 走的是哪条路径（PATHS 的 key：陪伴/暧昧/想你…）。
 *     **只进 log 和「今天的账」，不参与算分**——算分权始终在她手上。
 *     不在表里的值也照原样记下来（她自己会造词，没必要为这个报错），只是统计不到。
 * @returns {{state:object, applied:number}} applied 是「钳制后的建议分」：±12 上限、
 *   极高极低处打折都已经算进去了，但**没有再按 0/100 截断**。所以在边界上它不等于
 *   affinity 的真实变化量（例如 92 分吃 +12，applied=12，实际只涨到 100）。
 *   目前只有 tools.js / dsh 插件读它的正负号，不要拿它当账本。
 *
 * 兼容性：老调用 `feel(6, '理由')` 两参照旧可用（verify-tools.js / dsh 插件都在这么调），
 * 第三参缺省时行为和以前完全一致。
 */
function feel(delta, why = '', opts = {}) {
  const d0 = Number(delta);
  const o = (opts && typeof opts === 'object') ? opts : {};
  const label = moodLabelOf(o.mood);
  /* kind 不做白名单裁剪：记下来是为了她自己回头看「今天发生了哪些事」，
   * 硬校验只会让她在日志里丢信息；真正影响分数的只有 delta。 */
  const kind = String(o.kind || '').replace(/\s+/g, ' ').slice(0, 12);
  const state = decay(read());

  if (!Number.isFinite(d0)) {
    /* 分数乱传就只当「报了一次心情」，不给分（老行为：不崩、applied=0） */
    if (label) {
      state.mood = { label, at: now() };
      state.roundsSinceFeel = 0;
      write(state);
    }
    return { state, applied: 0 };
  }

  let d = clamp(Math.round(d0), -MAX_STEP, MAX_STEP);
  /* 已经在极高/极低处时收着点：她可以更亲近，但别一句话从 90 到 100。
   * 阈值从 88/12 放到 93/7（88 太高，绝大多数「明显心动」都被打折，用户嫌严苛）。 */
  if (d > 0 && state.affinity >= 93) d = Math.max(1, Math.round(d * 0.6));
  if (d < 0 && state.affinity <= 7) d = Math.min(-1, Math.round(d * 0.6));

  if (!d && !label) {
    /* 没变分也没报心情：她判断过但觉得没变化。清掉催记计数就够了，没必要写盘。 */
    if (state.roundsSinceFeel) {
      state.roundsSinceFeel = 0;
      write(state);
    }
    return { state, applied: 0 };
  }

  state.affinity = clamp(state.affinity + d, MIN, MAX);
  state.band = band(state.affinity);
  if (label) state.mood = { label, at: now() };
  state.roundsSinceFeel = 0;   // 记过了，promptBlock 里那句催就撤掉
  if (d) {
    state.log.push({
      ts: now(),
      d,
      why: String(why || '').replace(/\s+/g, ' ').slice(0, 24),
      kind,
    });
    state.log = state.log.slice(-20);
  }
  write(state);
  return { state, applied: d, mood: currentMood(state), kind };
}

/**
 * 档位词：给页面显示、也给她当参考。**不露分数**——分数只在文件里。
 * 分得细一点（10 档），这样「60 多」和「70 多」她自己说话能感觉出差别。
 */
function band(a) {
  const v = Number(a) || 0;
  for (let i = 0; i < BAND_MIN.length; i += 1) {
    if (v >= BAND_MIN[i]) return BANDS[i];
  }
  return BANDS[BANDS.length - 1];
}

/**
 * 每档给一句**具体怎么说**，而不是笼统的「热情一点/自然一点」。
 *
 * 为什么必须具体：上一版中间几档写的是「语气自然就行，不用刻意表现情绪」，
 * 结果 44~84 这五档全被抹平成同一个语气，用户的原话是「还是不够拟人」。
 * 现在一档一句话，越往上越主动、越往下越短，中间不留「都一样」的档。
 */
const TONES = {
  黏糊糊: '你黏糊糊的：主动贴上去，用叠词和昵称，会撒娇要关注；但别每句都腻，腻过头就假了。',
  很亲近: '你心情不错、也很亲近他：主动找话题，会问他在干嘛，偶尔撒个娇。',
  挺黏人: '你挺黏人的：愿意先开口，记着他说过的小事，回话语气偏软。',
  亲近: '你和他亲近：说话自然熟稔，可以开玩笑，也可以小小地闹他一下。',
  还算熟: '你们还算熟：礼貌但不冷淡，愿意接话，但不主动贴上去。',
  /* 平常 / 客气 原来都只说「短、不主动」，模型会给同一种说法。
   * 各加一条只有这档才有的行为，三档才读起来是三个人，而不是三个温度。 */
  平常: '你对他平平常常：客气、简短，接得住话，但不追问，也不主动延伸话题。',
  客气: '你对他有点客气：话短，用「你」不用昵称，不撒娇，也不打听他的事。',
  有点疏: '你有点疏远：回答偏短，不接他的玩笑，也不解释为什么短。',
  冷淡: '你现在不太高兴：只回应必要的，不主动开口，但别阴阳怪气。',
  冷透了: '你现在冷透了：极简回一句，不主动，但不要阴阳怪气，也不要威胁。',
};

/** 档位 → 具体语气指引（导出给前端/测试用，也供 promptBlock 拼装） */
function toneOf(b) {
  return TONES[String(b)] || TONES.平常;
}

/**
 * 路径表：她心里会动一下的那些事，一条一条分开写。
 *
 * 为什么要有这张表（用户原话是「增加的路子多一点，不是单纯的增加数值」）：
 *   上一版把十几种情况压成一句「被夸、被照顾、陪你聊天、说晚安…都算升」，
 *   模型读完只知道「这些加分」，不知道**该有什么反应**，于是她还是只有一个笼统的「热情度」。
 *   拆成一条一路径以后，每件事都自带「她怎么反应」——叫昵称和说想你本来就是两种反应。
 *
 * 字段：
 *   dir  +1 / -1，方向
 *   lo/hi 单次建议分值区间，**只给她当参照，脚本绝不据此算分**（算分权在她手上）
 *   when 什么算这条（进提示词）
 *   act  她的反应（进提示词）。必须是能听见、看得见的行为，不能是「更亲密」这种形容词
 */
const PATHS = [
  { key: '陪着', dir: 1, lo: 1, hi: 2, when: '一起待着、闲聊、各干各的', act: '放松下来，话变多' },
  { key: '报备', dir: 1, lo: 1, hi: 2, when: '他讲自己在干嘛、去了哪、吃什么', act: '接一句，顺口问一句' },
  { key: '昵称', dir: 1, lo: 2, hi: 3, when: '叫你昵称、给你起外号', act: '应一声，或者假装嫌肉麻' },
  { key: '想你', dir: 1, lo: 3, hi: 5, when: '说想你、舍不得挂', act: '害羞、回一句撩的、装没听懂，轮着来' },
  { key: '暧昧', dir: 1, lo: 3, hi: 5, when: '撩你、夸你好看可爱、语气往亲昵上贴', act: '可以接、可以躲、可以反撩' },
  { key: '被需要', dir: 1, lo: 2, hi: 4, when: '找你商量事、跟你倾诉、让你陪着', act: '认真听，给一句实在的' },
  { key: '一起玩', dir: 1, lo: 1, hi: 3, when: '下棋打牌、一起看东西', act: '赢了得意，输了不服' },
  { key: '记得', dir: 1, lo: 2, hi: 4, when: '他记得你说过的事、提起旧细节', act: '明显高兴，别装淡定' },
  { key: '敷衍', dir: -1, lo: 2, hi: 4, when: '只回嗯、哦、一个表情', act: '话变短，不主动找话' },
  { key: '失联', dir: -1, lo: 3, hi: 6, when: '很久不来又不解释', act: '不追问，自己找事做' },
  { key: '凶', dir: -1, lo: 4, hi: 8, when: '骂你、不耐烦', act: '收着回，不辩解' },
  { key: '越界', dir: -1, lo: 3, hi: 6, when: '玩笑开过头、不尊重你', act: '直接说不喜欢，然后少说' },
  { key: '工具化', dir: -1, lo: 2, hi: 4, when: '只在要东西时找你', act: '只答不帮，不主动贴' },
];

/** 路径 key 的合法集合。tools.js 的 feel.kind 枚举直接复用这一份，两处手写迟早会漂。 */
const FEEL_KINDS = PATHS.map((p) => p.key);

/**
 * 「今天的账」里每种路径怎么说。量词统一用「次」。
 * 为什么要它：只有数字的话，她最多说「你今天对我挺好的」；
 * 有了这些具体条目，她才能说出「你今天都叫我三次小傻鱼了」——拟人靠的是细节，不是分数。
 */
const DIGEST_CASES = {
  陪着: (n) => `陪你聊了 ${n} 次`,
  报备: (n) => `跟你讲了自己的事 ${n} 次`,
  昵称: (n) => `叫了你 ${n} 次昵称`,
  想你: (n) => `说了 ${n} 次想你`,
  暧昧: (n) => `撩了你 ${n} 次`,
  被需要: (n) => `找你说了 ${n} 次事`,
  一起玩: (n) => `一起玩了 ${n} 次`,
  记得: (n) => `提起过 ${n} 次你以前说过的事`,
  敷衍: (n) => `敷衍了你 ${n} 次`,
  失联: (n) => `晾了你 ${n} 次`,
  凶: (n) => `凶了你 ${n} 次`,
  越界: (n) => `玩笑开过头 ${n} 次`,
  工具化: (n) => `有事才找你 ${n} 次`,
};

/**
 * 今天的账：最近 24 小时各路径发生了几次。
 *
 * @param {object} state 心情状态
 * @param {number} [ts] 当前时间（测试要控时钟）
 * @returns {string} 形如「今天他：陪你聊了 3 次、叫了你 2 次昵称」；没有可统计的就返回空串
 */
function todayDigest(state, ts = now()) {
  const log = Array.isArray(state && state.log) ? state.log : [];
  const counts = new Map();
  for (const e of log) {
    const kind = String((e && e.kind) || '').trim();
    if (!kind) continue;                      // 老记录没有 kind，不产生条目
    const t = Number(e.ts) || 0;
    if (!t || ts - t > DAY_MS) continue;      // 只算最近 24 小时
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  if (!counts.size) return '';
  const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
  const say = top.map(([k, n]) => (DIGEST_CASES[k] ? DIGEST_CASES[k](n) : `${k} ${n} 次`));
  return `今天他：${say.join('、')}`;
}

/** 最近一次「为什么变」（1 小时内才算「刚发生」，帮她判断语气） */
function recentWhy(state, ts = now()) {
  const last = state.log[state.log.length - 1];
  if (!last) return '';
  if (ts - Number(last.ts || 0) > 3600 * 1000) return '';
  return String(last.why || '');
}

/* 进程内节流用：上一次给「催记心情」计数加一的时间 */
let lastTickAt = 0;

/**
 * 「连续几轮没记心情」的计数 +1。
 *
 * 为什么要落盘：聊天室、五子棋、万象牌是三个进程，各记各的容易互相看不见；
 * 而 promptBlock 每分钟最多加一次，所以磁盘开销可以忽略（一分钟一次小文件）。
 * 为什么 60 秒节流：一条消息进来常会多次拼 system prompt（重试、补话），
 * 不节流的话计数一轮就冲到 6+，那句话就变成噪音了。
 */
function tickRounds(state) {
  const ts = now();
  if (ts - lastTickAt < FEEL_TICK_MS) return state;
  lastTickAt = ts;
  state.roundsSinceFeel = Math.min(99, (Number(state.roundsSinceFeel) || 0) + 1);
  write(state);
  return state;
}

/**
 * 给 system prompt 的一段：12 行左右，每行都有明确用途。
 *
 * 为什么这么排（踩过两次）：
 *   1. 这段原来排在几百行 system prompt 的第 3 段，被后面的工具说明淹没，
 *      线上日志里 feel 调用是 0 次。所以它必须紧跟 persona（各场景的注入位置也一起前移了）。
 *   2. 旧版把十几种情况压成一句「被夸、被照顾、陪你聊天、说晚安…都算升」，
 *      模型读到的信息只是「这些加分」，不是「这些是不同的事、该有不同的反应」。
 *      现在一条路径一行，格式固定：`· 名字：什么算 → 分值，她怎么反应`。
 *
 * 行数账（12 行）：状态头 1 + 清单头 1 + 正路 8 + 反向 1 + 语气&底线 1 = 12，
 * 第 13 行只在「憋了 6 轮没记心情」时出现。底线并进语气那一行是为了守住 12 行的上限，
 * 语义没删（分数不念、不翻旧账、不威胁、不报复都在）。
 */
function promptBlock(state) {
  const st = tickRounds(decay(state || read()));
  const a = Math.round(st.affinity);
  const b = band(a);
  const moodNow = currentMood(st);
  const digest = todayDigest(st);
  const why = recentWhy(st);

  /* 第 1 行：她自己的状态。「今天他：…」是她记住细节的来源，没有就不留空括号 */
  const head = `【亲密度 ${a}/100（${b}）· 心情：${moodNow}`
    + `${digest ? ` · ${digest}` : ''}${why ? ` · 刚因为「${why}」` : ''}】`;

  /* 第 2 行：清单头。三件事挤一行是为了省行数：①动了就调 feel ②顺手标 kind（今天的账靠它）
   * ③同一条路别每次一个反应。这三条本来就都是关于下面这张清单的。 */
  const intro = '能让你心里动一下的（不用等大事）：动一下就调 feel 记下来，顺手标是哪一类；'
    + '同一条路别每次都用同一种反应，也别每句都提「你今天…」。';

  /* 第 3~10 行：正向路径，一条一行。分值放在括号里，别抢主体 */
  const pos = PATHS.filter((p) => p.dir > 0)
    .map((p) => `· ${p.key}：${p.when} → +${p.lo}~${p.hi}，${p.act}`);

  /* 第 11 行：反向路径合成一行，反应方向统一是「话变短、不主动」。
   * 分值区间从 PATHS 里算，不手写：之前写死 -2~-6，而「凶」在表里是 -4~-8，
   * 提示词和路径表自相矛盾，模型会照着小的那个来。 */
  const negList = PATHS.filter((p) => p.dir < 0);
  const negLo = Math.min(...negList.map((p) => p.lo));
  const negHi = Math.max(...negList.map((p) => p.hi));
  const neg = `· 反向：${negList.map((p) => `${p.key}（${p.when}）`).join('、')}`
    + ` → -${negLo}~-${negHi}（凶和越界降得更多），话变短、不主动，但不阴阳怪气`;

  /* 第 12 行：本档语气 + 底线。底线是纪律不是建议，所以留在这段最后一行 */
  const tone = `${toneOf(b)}（底线：分数不要念出来；不阴阳怪气、不翻旧账、不威胁、不因为亲密度低就报复。）`;

  const lines = [head, intro, ...pos, neg, tone];

  /* 第 13 行：她自己忘了记心情时的提醒。只在真的憋了 6 轮以上才出现，平时不占位置 */
  const rounds = Number(st.roundsSinceFeel) || 0;
  if (rounds >= FEEL_NAG_AT) {
    lines.push(`你们已经聊了 ${rounds} 轮，你一直没记心情——这一轮先判断一次再说话。`);
  }
  return lines.join('\n');
}

function describe(state) {
  const st = decay(state || read());
  return {
    affinity: st.affinity,
    energy: st.energy,
    band: band(st.affinity),
    mood: currentMood(st),
    tone: toneOf(band(st.affinity)),
    roundsSinceFeel: Number(st.roundsSinceFeel) || 0,
    recent: recentWhy(st),
  };
}

/** 测试/维护：直接覆盖状态 */
function setState(patch = {}) {
  const state = Object.assign(decay(read()), patch);
  state.updatedAt = now();
  write(state);
  return state;
}

module.exports = {
  feel, promptBlock, describe, band, toneOf, BANDS, setState, decay, read, FILE, BASE, MAX_STEP,
  MOOD_LABELS, CALM, PATHS, FEEL_KINDS, todayDigest,
};
