// 聊天室「眼前上下文」：保留最近若干轮真实对话，组装成 messages 数组发给模型。
// 为什么需要：原来每条回话只带「刚到的这一批消息」，模型看不到上一句，
// 所以经常驴头不对马嘴。这里在进程内存里滚动保留最近 N 轮，拼成标准对话历史。
//
// ★ 2026-11-06 改造（老板上午聊多一点就忘事的根因）：
//   1) MAX_TURNS 14 → 200：14 条只覆盖十几分钟，聊 60 条就把早上的话挤没了。
//   2) 停用 GAP_RESET：原来断 30 分钟就把窗口砍到只剩 2 条，等于二次丢失。
//      现在靠「每条历史带时间戳」让模型自己判断新旧，不再由代码硬清。
//   3) 每条历史前面加 [MM-DD HH:MM]：跨天时能分清「昨天说的」和「刚才说的」。
const MAX_TURNS = 200;          // 最多保留多少条对话（user/assistant 各算一条）
const GAP_RESET_MS = 0;         // 0 = 停用。保留常量是为了以后想恢复时好改。

let turns = [];   // { role: 'user'|'assistant', content: string, ts: number }
let lastPushAt = 0;

function push(role, content) {
  const now = Date.now();
  if (!content) return;
  // GAP_RESET_MS = 0 时这段永不触发（停用重置）
  if (GAP_RESET_MS > 0 && lastPushAt && now - lastPushAt > GAP_RESET_MS && turns.length > 2) {
    turns = turns.slice(-2);
  }
  lastPushAt = now;
  turns.push({ role, content: String(content).slice(0, 1200), ts: now });
  if (turns.length > MAX_TURNS) turns = turns.slice(-MAX_TURNS);
}

/* 把毫秒时间戳变成「11-06 07:42」这种，模型靠它分辨哪句是刚说的、哪句是昨天的 */
function stamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  // 用服务器本地时区（Asia/Shanghai），和 system prompt 里的「现在是」保持一致
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* 返回给模型看的最近历史（已含刚才的 user 那条时用 seed=false 避免重复） */
function history(extraSystem) {
  return turns.map((t) => {
    // ★ 关键：assistant 侧不加时间戳、不加名字前缀。
    // 模型会照抄历史格式——给它看「[11-06 07:42] 小鱼：早啊」，
    // 它回答时就真的输出「[11-06 19:20] 小鱼：…」，房间里就难看了（踩过）。
    // user 侧加时间戳：它得知道老板这句话是什么时候说的，才能回答「7点42说了啥」。
    if (t.role !== 'user') return { role: t.role, content: t.content };
    const s = stamp(t.ts);
    return { role: t.role, content: s ? `[${s}] ${t.content}` : t.content };
  });
}

function reset() {
  turns = [];
  lastPushAt = 0;
}

function size() {
  return turns.length;
}

module.exports = { push, history, reset, size, stamp, MAX_TURNS, GAP_RESET_MS };
