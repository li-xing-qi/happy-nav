// 跨通道共享状态：聊天室 / 卡牌 / 五子棋 都能读到对方场景刚发生了什么。
//
// 为什么需要：之前三个 bot 各自独立，五子棋打完一局，聊天室的 AI 完全不知道
// （chat-context.js 还主动过滤掉了 game 通道）。老板去聊天室说「我刚赢了」，
// 那边一脸茫然。用一个小 JSON 文件做「黑板」，比大改动简单得多。
//
// 文件很小，读的时候带 mtime 缓存，写的时候原子替换防止读一半。
const fs = require('node:fs');
const path = require('node:path');

const FILE = require('../config.js').sharedState;
const TTL = 10e3;   // 10 秒内不重复读文件

let cache = { v: {}, at: 0, mtime: 0 };

function read() {
  const now = Date.now();
  try {
    const mt = fs.statSync(FILE).mtimeMs;
    if (now - cache.at < TTL && mt === cache.mtime) return cache.v;
    const txt = fs.readFileSync(FILE, 'utf8');
    const obj = JSON.parse(txt);
    cache = { v: obj && typeof obj === 'object' ? obj : {}, at: now, mtime: mt };
    return cache.v;
  } catch {
    return cache.v || {};
  }
}

function write(patch) {
  try {
    const cur = read();
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 1), 'utf8');
    fs.renameSync(tmp, FILE);   // 原子替换，避免别的进程读到半截
    cache = { v: next, at: Date.now(), mtime: fs.statSync(FILE).mtimeMs };
    return true;
  } catch {
    return false;
  }
}

/* 把共享状态翻译成给模型看的一段话（没有内容返回空串）
 *
 * 关键：必须明确告诉模型「这是刚发生的，直接用」。
 * 之前只把内容拼进去，模型看到老板问「看看记忆」，第一反应是去翻 MEMORY.md
 * （那是每天凌晨才更新的旧记录），然后回答「没存下来」（踩过）。
 */
function digest(maxAgeMin = 180) {
  const s = read();
  const bits = [];
  const now = Date.now();

  const fresh = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && now - t < maxAgeMin * 60e3;
  };

  if (s.lastGame && fresh(s.lastGame.at)) {
    const mins = Math.round((now - new Date(s.lastGame.at).getTime()) / 60e3);
    const when = mins < 1 ? '刚刚' : mins < 60 ? `${mins}分钟前` : `${Math.round(mins / 60)}小时前`;
    // text 本身已经是「五子棋这局结束：我赢了。一共 21 手（我 10 手，老板 11 手）…」
    // 所以只加时间，别再重复「下了一局五子棋」，否则读起来是
    // 「30分钟前我跟老板下了一局五子棋。五子棋这局结束：我赢了…」（重复两遍）
    const raw = String(s.lastGame.text || '').replace(/^五子棋这局结束[:：]/, '').trim();
    const gameName = s.lastGame.type === 'gomoku' ? '五子棋' : '那局游戏';
    bits.push(`${when}跟老板下了局${gameName}。${raw}`);
  }

  if (s.note && fresh(s.note.at)) {
    bits.push(`【备注】${s.note.text}`);
  }

  // ★ 2026-11-07 新增：QQ 侧 DSH 干完活留的备注（note.py 写入）
  //   聊天室的鱼没有 bash，不知道那边刚做了什么，靠这个同步。
  //   每条可以自己带 ttlMin，到期就不带了，避免「几小时前装的东西」还在刷屏。
  if (Array.isArray(s.notes)) {
    for (const n of s.notes) {
      if (!n || !n.text || !n.at) continue;
      const ttl = Number(n.ttlMin) > 0 ? Number(n.ttlMin) : maxAgeMin;
      const t = new Date(n.at).getTime();
      if (!Number.isFinite(t) || now - t > ttl * 60e3) continue;
      const mins = Math.round((now - t) / 60e3);
      const when = mins < 1 ? '刚刚' : mins < 60 ? `${mins}分钟前` : `${Math.round(mins / 60)}小时前`;
      // ★ 2026-11-11 改：原来写「QQ 那边帮你弄好的」，
      //   等于承认有另一个自己。现在直接说「我」做的。
      bits.push(`${when}我${n.text}`);
    }
  }

  if (!bits.length) return '';

  // ★ 2026-11-11：原来标题「【刚刚发生的事（实时状态…）】」像系统通知，
  //   还有一句「👉 老板问起这些，直接用上面的内容回答」——这是指令，不是记忆。
  //   现在写成「我自己想起的」，读起来自然。
  return [
    '我还记得刚刚：',
    ...bits,
  ].join('\n');
}

module.exports = { read, write, digest };
