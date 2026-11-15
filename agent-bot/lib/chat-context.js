// 游戏队友读聊天室：给 duo-bot 提供「老板最近说了啥」的上下文。
// 只读 chatlog（不碰万象代码），带 mtime 缓存，每 60 秒最多重读一次。
// 注意：只取老板说的话 + 他刚收到的回复，不要把 AI 自己的碎碎念当上下文
// （否则「聊天室最近」全是自言自语，接话会跑偏）。
//
// 历史：原来这里有一行 `if (r.channel === 'game') continue`，
// 把游戏里说的话全过滤了，导致老板在五子棋里聊的事，聊天室的 AI 完全不知道
// （踩过）。现在放行 game 通道，但只保留「有内容的对话和结果」，
// 过滤掉每步落子的流水（那种量大且没营养）。
const fs = require('node:fs');

const LOG = require('../config.js').chatlog;
const CACHE_TTL = 60e3;

let cache = { v: '', at: 0 };

/* 判断一条 game 消息值不值得带进聊天室上下文 */
function keepGame(r) {
  const t = String((r && r.text) || '').trim();
  if (t.length < 4) return false;
  // 落子流水、状态播报这类一律不要
  if (/^(落子|规则兜底|LLM 选|动作|对局结束，已)/.test(t)) return false;
  // 「下了，F10」这种纯落子回复
  if (/^下了[，,。\s]*[A-O]\d{1,2}[。\s]*$/.test(t)) return false;
  // 对局结果摘要保留（这是最有价值的）
  if (t.startsWith('五子棋这局结束')) return true;
  // 其余按普通对话处理，太长的不带（避免刷屏内容挤占预算）
  return t.length <= 120;
}

/* 取最近 n 条「老板说的话」，附带紧随其后的那句 AI 回复（提供语境） */
function recentChat(n = 6, maxChars = 600) {
  const now = Date.now();
  if (now - cache.at < CACHE_TTL) return cache.v;
  cache.at = now;
  try {
    const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n');
    const rows = [];
    for (const line of lines) {
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (r.noise || !r.text) continue;
      if (r.channel === 'game' && !keepGame(r)) continue;   // 游戏流水过滤掉，对话留下
      // 与鱼/灵犀说的话是正经对话，不过滤；但括号里的旁白（我加的）太长的不带
      rows.push(r);
    }
    // 从后往前找老板的发言（最多取 n 条，按时间正序输出）
    const picked = [];
    const seenText = new Set();   // 去重：同样的话重复出现只保留最近一次
    for (let i = rows.length - 1; i >= 0 && picked.length < n; i--) {
      const r = rows[i];
      // 对局结果摘要虽然是 assistant 角色，但信息量最高，单独收
      const isResult = r.channel === 'game' && r.role === 'assistant' && String(r.text).startsWith('五子棋这局结束');
      if (r.role !== 'user' && !isResult) continue;
      const txt = String(r.text || '').trim();
      if (txt.length < 2) continue;
      // 同样的话（前 30 字相同）只留最近一次，别把上下文塞满
      const dedupKey = txt.slice(0, 30);
      if (!isResult && seenText.has(dedupKey)) continue;
      seenText.add(dedupKey);
      // 太老的不要（超过 3 天）
      const age = now - new Date(r.ts || 0).getTime();
      if (Number.isFinite(age) && age > 3 * 24 * 3600e3) continue;
      const next = r.channel !== 'game' && rows[i + 1] && rows[i + 1].role === 'assistant' ? rows[i + 1] : null;
      picked.unshift({ user: r, bot: next, isResult });
    }
    // 字符预算从最新的往前吃，保证留下的是最近的内容
    const kept = [];
    let used = 0;
    for (let k = picked.length - 1; k >= 0; k--) {
      const p = picked[k];
      const cost = String(p.user.text).length + (p.bot ? String(p.bot.text).length : 0);
      if (used + cost > maxChars) break;
      used += cost;
      kept.unshift(p);
    }
    let out = '';
    let prevWhen = '';
    for (const p of kept) {
      const where = p.user.channel === 'game' ? '游戏'
        : p.user.channel === 'qq' ? 'QQ'
          : p.user.channel === 'lx' ? '心有灵犀'
            : p.user.channel === 'yu' ? '与鱼'
              : '聊天室';
      if (p.isResult) {
        out += (out ? '\n' : '') + `我们还玩过：${String(p.user.text).slice(0, 150).replace(/\n/g, ' ')}`;
        continue;
      }
      // ★ 2026-11-11 改：不再点明「在哪个渠道」。
      //   原来写「老板（在聊天室里，3分钟前）」——这等于告诉她
      //   「那是在别的地方的另一个你」，记忆就不像自己的了。
      //   现在只说时间，就像人回忆时不强调「我在哪间屋子听到的」。
      const when = agoTag(p.user.ts);
      // 时间词说得自然一点：刚刚 / N分钟前 / 今天早些时候 / 昨天
      const whenNatural = when === '刚刚' ? '刚刚' : when;
      // ★ 连续同一时间段的发言合并，不重复写「老板刚刚说」——
      //   一次游戏里老板可能连说七八句，每句都带「刚刚说」读着像流水账。
      const lastWasSameWhen = (out && prevWhen && prevWhen === whenNatural);
      const head = lastWasSameWhen ? '' : `老板${whenNatural}说：`;
      prevWhen = whenNatural;
      const u = `${head}${String(p.user.text).slice(0, 60).replace(/\n/g, ' ')}`;
      const b = p.bot ? `\n我：${String(p.bot.text).slice(0, 40).replace(/\n/g, ' ')}` : '';
      out += (out ? '\n' : '') + u + b;
    }
    cache.v = out;
  } catch {
    cache.v = cache.v || '';
  }
  return cache.v;
}

/* 把时间戳变成「3 分钟前」这种，让模型能分清新旧。
 * 不加时间标记的话，它会把昨天说的和刚才说的混在一起（踩过）。 */
function agoTag(ts) {
  if (!ts) return '';
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60e3);
  if (mins < 1) return '刚刚';
  // 中文里数字和量词之间不加空格，写成「25分钟前」比「25 分钟前」自然
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  return `${Math.round(hrs / 24)}天前`;
}

/* 拼进系统提示词的那段（没有内容就返回空串） */
function chatBlock(n = 10) {
  const t = recentChat(n, 900);
  if (!t) return '';
  // ★ 2026-11-11：标题原来是「【老板最近说过的话（含游戏里）】」——
  //   像监控日志，也提醒她「游戏里那个不是我」。
  //   现在写成第一人称的「我记得」，读起来就是自己的记忆。
  return `---\n我记得最近和老板聊过这些：\n${t}`;
}

module.exports = { recentChat, chatBlock, keepGame };
