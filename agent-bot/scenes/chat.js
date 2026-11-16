// 聊天室场景：从 chat-bot.js 迁移过来，逻辑完全保留。
// 迁移时只改了：导入方式、共用 core 的 token/persona/llm/logChat、日志加 [chat] 前缀。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../core.js');
const hist = require('../lib/chat-history.js');
const memes = require('../lib/meme-index.js');
const shared = require('../lib/shared-state.js');

const log = core.makeLogger('chat');
const { token } = core;   // llm 用自己的版本（走 ds-proxy，签名也不同）

const cfg = require('../config.js');

/* 可选：用 conf.json 覆盖个别参数（路径不存在时忽略） */
const CONF = process.env.CONF || '';
let conf = {
  base: cfg.siteBase,
  room: cfg.rooms.chat,
  name: cfg.bots.chat.name,
  pid: cfg.bots.chat.pid,
  personaDir: cfg.personaDir,
  memesDir: cfg.memesDir,
  chatlog: cfg.chatlog,
  proxy: cfg.llm.url,
  model: cfg.llm.model,
  pollMs: 1500,
  replyQuietMs: 2500,
  heartbeatMs: 30000,
  memeChance: 0.25,
  warmup: 8,
  proactive: { enabled: true, idleMinutes: 6, maxPerHour: 3 },
};
if (CONF) { try { Object.assign(conf, JSON.parse(fs.readFileSync(CONF, 'utf8'))); } catch {} }


/* 人设与记忆：用 core 的共享缓存 */
const persona = core.persona;

/* ---------- HTTP ---------- */
function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(conf.base + p);
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      method, hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search,
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf, status: res.statusCode }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

/* 上传图片（原始二进制 + 查询参数） */
function upload(file) {
  return new Promise((resolve, reject) => {
    const buf = fs.readFileSync(file);
    const u = new URL(`${conf.base}/api/room/upload?code=${encodeURIComponent(conf.room)}&pid=${encodeURIComponent(conf.pid)}`);
    const r = http.request({
      method: 'POST', hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search,
      headers: { 'content-type': 'application/octet-stream', 'content-length': buf.length },
    }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch { resolve({ raw: s }); } });
    });
    r.on('error', reject);
    r.write(buf);
    r.end();
  });
}

/* ---------- LLM ---------- */
/* 底层调用：支持 tools，返回原始 message 对象 */
async function llmRaw(messages, opts = {}) {
  const { maxTokens = 200, temperature = 0.85, tools = null } = opts;
  const body = { model: conf.model, messages, max_tokens: maxTokens, temperature, stream: false };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  const r = await fetch(conf.proxy, {
    method: 'POST',
    headers: cfg.llm.headers(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const j = await r.json();
  return j.choices?.[0]?.message || {};
}

/* 纯文本调用（不需要工具的场合，比如主动搭话） */
async function llm(messages, maxTokens = 200, temperature = 0.85) {
  const m = await llmRaw(messages, { maxTokens, temperature });
  return (m.content || '').trim();
}

/* 带工具循环的调用。
 * 模型返回 tool_calls → 执行 → 把结果塞回对话 → 再问一次，最多 3 轮。
 * 这是「真工具」方案：模型自己决定发哪张图，代码不用猜。
 */
async function llmWithTools(messages, ctx, opts = {}) {
  // ★ 2026-11-08 大修：
  //   原来 maxTokens=220、maxRounds=3，画图几乎必然失败。真实事故：
  //     老板：画个好看的
  //     小鱼：（我画了一张图发给老板：11-08-0100-圆脸两只眼睛一张嘴.png）  ← 图根本没画出来
  //
  //   原因链条：
  //     ① 模型第 1 轮调 draw，html 上千字符，220 token 写不完 → 参数截断成空
  //     ② 第 2、3 轮同样给 220 → 还是写不完
  //     ③ 3 轮用完，走最后的兜底 llmRaw，**还是 220**（第 155 行）
  //     ④ 模型在 220 token 里只能挤出一句「（我画了一张图发给老板：xxx）」
  //     ⑤ 这句话被当正文发出去 → 老板看到一个描述，文件夹里没图
  //
  //   2026-11-08 二次修正：先改成 2000 还是不够。
  //   实测模型画一张稍微复杂的图，arguments 有 4475 字符 ≈ 1661 token，
  //   而且前面还要说一句话占掉十几个 token，2000 贴着上限，稍复杂就被截。
  //   现在给 4000，留一倍余量。
  const { maxTokens = 220, temperature = 0.85, maxRounds = 5 } = opts;
  const tools = require('../tools.js');
  const convo = [...messages];
  // 工具轮次里模型可能要写很长的 HTML/SVG，统一给足预算
  const toolBudget = Math.max(maxTokens, 4000);

  for (let round = 0; round < maxRounds; round++) {
    const msg = await llmRaw(convo, { maxTokens: toolBudget, temperature, tools: tools.TOOLS });
    const calls = msg.tool_calls || [];
    if (!calls.length) {
      return (msg.content || '').trim();
    }
    // 记录模型这一轮的工具调用
    convo.push({
      role: 'assistant',
      content: msg.content || '',
      tool_calls: calls,
    });
    // 逐个执行
    const emptyArgs = [];
    for (const c of calls) {
      const fn = c.function || {};
      let args = {};
      try { args = JSON.parse(fn.arguments || '{}'); } catch { args = {}; }
      // 参数完全为空 = 模型输出被截断了。记下来，这一轮结束就别再试了，
      // 否则会出现「连调 3 次 draw({}) 全失败，最后吐一坨 DSML 代码」的场面（踩过）。
      if (!Object.keys(args).length) emptyArgs.push(fn.name);
      log(`调用工具 ${fn.name}(${JSON.stringify(args).slice(0, 80)})`);
      let result;
      try {
        result = await tools.runTool(fn.name, args, ctx);
      } catch (e) {
        result = `工具执行出错：${e.message}`;
      }
      log(`工具返回: ${String(result).slice(0, 80)}`);
      // search_chatlog 要回查 20 条对话，500 字会截成半截，
      // 单条给到 4000，够放 20~30 条记录
      convo.push({ role: 'tool', tool_call_id: c.id, content: String(result).slice(0, 4000) });
    }
    // 这一轮所有工具调用都是空参数 → 再循环也是白搭，直接退出去让上层兜底
    if (emptyArgs.length && emptyArgs.length === calls.length) {
      log(`工具参数全空（${emptyArgs.join('、')}），停止工具循环`);
      return '';
    }
  }
  // 轮数用完还没给出最终回复：要一次不带工具的
  // ★ 这里也要给够 token，否则模型只能在 220 里挤出一句干巴巴的描述
  const finalMsg = await llmRaw(convo, { maxTokens: toolBudget, temperature });
  return (finalMsg.content || '').trim();
}

/* ---------- 状态 ---------- */
let lastSeenId = 0;
let lastUserAt = Date.now();
let lastBotAt = 0;
let proactiveCount = 0;
let proactiveFrom = Date.now();
let pending = null;
let joined = false;
let myName = conf.name;
let busy = false;
let peerOnline = false;      // 老板在不在线（房间 peer 的 online）
let peerName = '老板';
let memberCount = 0;         // 房间里有几个人
let noReplyStreak = 0;       // 主动搭话后连续几条没人回

/* ---------- 动作 ---------- */
async function enterRoom() {
  const r = await req('POST', '/api/room/enter', { code: conf.room, pid: conf.pid, name: conf.name });
  if (r && r.ok) {
    if (!joined) log(`已进入房间 ${conf.room}（昵称 ${conf.name}）`);
    joined = true;
    // 关键：以进房时刻的最新消息为起点，避免把历史消息当新消息重放
    const msgs = r.msgs || [];
    if (msgs.length) lastSeenId = Math.max(...msgs.map((m) => m.id || 0));
    return true;
  }
  log('进房失败:', JSON.stringify(r).slice(0, 160));
  return false;
}

/* 判断回复是不是在假装用工具（聊天室没有工具能力） */
function looksLikeToolUse(s) {
  const t = String(s || '');
  if (/<[a-z_]*tool[a-z_]*>/i.test(t)) return true;
  // qq_send_image 这类工具标签也要认（AGENTS.md 里写了，模型会照抄）
  if (/<qq_send_image/i.test(t)) return true;
  if (/^(qq_|dsh_)[a-z_]+\(/i.test(t.trim())) return true;
  if (/qq_send_image\s*\(/.test(t)) return true;
  if (/`?\bops\s+(memory|status|free|health)\b/i.test(t)) return true;
  if (/`?(python3|node|cat|ls|grep)\s+\S/i.test(t)) return true;
  if (/(我(先|这?就|去)?(查|跑|读)一?下?|让我)(看看?)?\s*(记忆文件|日志|文件)/.test(t)) return true;
  // 「我查一下记忆。」「我去看看记录」这种
  if (/(我|让我)\s*(先|这就|去)?\s*(查|看|读|翻)\s*(一下|下)?\s*(记忆|记录|日志|文件)/.test(t)) return true;
  return false;
}

/* 去掉模型误输出的工具调用 XML。
 * 背景：AGENTS.md 是给 QQ 侧那个有工具的 agent 写的，里面有大量「你可以跑 ops xxx」。
 * 聊天室读的是同一份人设，但没有任何工具，模型就会学着吐 <qq_send_tool> 这种标签。
 * 服务器只把 content 拼成回答，标签会把整条消息变成空白（踩过）。
 */
function stripToolXml(s) {
  let out = String(s);

  // ① 整段工具调用：<qq_send_image>…</qq_send_image>、<xxx_tool>…</xxx_tool>
  //    AGENTS.md 给 QQ 侧写的是 qq_send_image，聊天室没这个工具，模型会照抄（踩过）
  out = out.replace(/<([a-z][a-z0-9_]*)[^>]*>[\s\S]*?<\/\1>/gi, (m, tag) => {
    // 只认像工具名的标签（含 tool / send / image / call / use）
    return /tool|send|image|call|use|file|read|write/i.test(tag) ? '' : m;
  });

  // ② 零散的 HTML/XML 标签（工具相关的）
  out = out.replace(/<\/?[a-z_]*(tool|tool_name|parameters|param|path|args|arg|call|use|send|image)[a-z_]*>/gi, '');

  // ③ 裸露的表情库路径（没有标签包着的情况）
  out = out.replace(/\/?root\/qq-workspace\/memes\/[^\s，。！？、"'）)]+/g, '');
  out = out.replace(/\/?root\/\.dsh\/[^\s，。！？、"'）)]+/g, '');

  // ④ 假装用工具的句子：不管词序，「跑一下 ops memory」「ops memory 跑一下」都清掉
  const TOOLWORD = /(ops\s+(memory|status|free|health|backup)|python3|\bnode\b|\bcat\b|\bls\b|\bgrep\b|`)/;
  out = out.split('\n').filter((line) => {
    const t = line.trim();
    if (!t) return true;
    // 整行都在说工具 → 丢
    if (TOOLWORD.test(t) && /(跑|执行|调用|查|读|看|一下|看看)/.test(t)) return false;
    return true;
  }).join('\n');

  // ⑥ DeepSeek 自己的工具调用格式 DSML：
  //    <|｜DSML｜｜calls> <|｜DSML｜｜invoke name="draw">…</|｜DSML｜｜invoke>
  //    模型输出被 max_tokens 截断时，会把这段半截的调用当正文吐出来（踩过）。
  //    注意分隔符全角竖线 ｜ 和普通竖线 | 都可能出现，两种都认。
  out = out.replace(/<[|｜]+\s*DSML\s*[|｜]+[\s\S]*$/gi, '');   // 从标记开始整段砍掉
  out = out.replace(/<[|｜]+\s*DSML\s*[|｜]+[^>]*>/gi, '');     // 零散的标记

  // ⑦ 模型偶尔直接吐 JSON 形式的调用残留（{"name":"draw","arguments":...}）
  out = out.replace(/^\s*\{\s*"(name|tool_calls?|function)"[\s\S]*$/i, '');

  // ⑧ 清掉残留的空括号、空行
  out = out.replace(/[（(]\s*[）)]/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');

  return out;
}

async function say(text, memeWillFollow = false) {
  if (!text) return;
  // 模型看到历史里都是「名字：内容」，有时会自己带上前缀，导致房间里出现「小鱼：小鱼：…」
  let out = String(text).trim();
  // ① 先剥时间戳前缀（历史里 user 侧带 [MM-DD HH:MM]，模型会照抄）
  //    支持 [11-06 07:42] / 【11-06 07:42】/ [07:42] 这几种写法
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/^[\[【]\s*\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}\s*[\]】]\s*/, '')
                     .replace(/^[\[【]\s*\d{1,2}:\d{2}\s*[\]】]\s*/, '');
    if (next === out) break;
    out = next;
  }
  // ② 再剥名字前缀，可能叠了多层（「小鱼：小鱼：」）
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/^(小鱼|小肥鱼|我|老板)\s*[：:]\s*/, '');
    if (next === out) break;
    out = next;
  }
  // ③ 有的模型会写成「名字 [时间]：内容」，再来一轮
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/^(小鱼|小肥鱼)\s*[\[【]\s*[\d\s:\-/]+\s*[\]】]\s*[：:]?\s*/, '');
    if (next === out) break;
    out = next;
  }
  // 聊天室没有工具能力，但人设里写了 QQ 侧能跑命令，
  // 模型偶尔会照猫画虎吐出 XML 工具调用（<qq_send_tool>…）或「跑一下 ops memory」，得剔掉
  out = stripToolXml(out);
  // 「（我发了一个表情包：xxx.jpg，画面是...）」这种是机器人在描述自己的动作，
  // 人不会这么说。图会由代码真的发出去，这里把描述删掉（踩过）
  out = out.replace(/[（(]\s*我发了?[一个张]+表情包[:：][^）)]*[）)]/g, '');
  out = out.replace(/我发了?[一个张]+表情包[:：][^\n。]*[。]?/g, '');
  out = out.replace(/[（(]\s*我发了?[一个张]+表情[^）)]*[）)]/g, '');
  // ★ 2026-11-08 新增：模型只说不做——「（我画了一张图发给老板：xxx.png）」
  //   真实事故：老板要画图，模型没调 draw，只把这句话当正文发出来，
  //   文件夹里啥也没有，老板看到一句描述。这里统统剥掉。
  out = out.replace(/[（(]\s*我画了?[一张个]+图[^）)]*[）)]/g, '');
  out = out.replace(/我画了?[一张个]+图?发给[^\n。]*[。]?/g, '');
  out = out.replace(/[（(]\s*我画了?[一张个]*[^）)]*\.(png|jpe?g|gif|webp)[^）)]*[）)]/gi, '');
  // 剔完可能只剩半句空话，整条都像在说工具就直接换掉
  if (/^我(先|这就|去)?(查|跑|看|读)(一下|下)?(记忆|日志|文件)?[。.！!]?$/.test(out.trim())) {
    out = '';
  }
  out = out.trim();
  if (!out) {
    // 整条都被过滤掉了（多半是「（我发了一个表情包：xxx）」这种描述）
    // 别什么都不说——补一句自然的话，图照样会发（踩过）
    if (memeWillFollow) {
      log('回复被过滤，补一句「喏」');
      out = '喏';
    } else {
      log('回复被过滤（疑似工具调用），跳过');
      return;
    }
  }
  lastBotAt = Date.now();
  // ★ 不再存「小鱼：xxx」。模型会照抄历史格式，看见自己前面永远带名字，
  // 回答时就会输出「小鱼：小鱼：…」（这个坑之前修过一次，加时间戳后又复发了）。
  // assistant 这个 role 本身就代表「我说的话」，不需要名字前缀。
  hist.push('assistant', out);
  const r = await req('POST', '/api/room/send', { code: conf.room, pid: conf.pid, type: 'text', text: out.slice(0, 1000) });
  if (r && r.error) log('发消息失败:', r.error);
  else log('说:', out.slice(0, 40).replace(/\n/g, ' '));
}

/* 按文件名发一张表情（工具调用走这里）
 * 和 sendMeme 不同：这里文件名是模型给的，必须严格校验存在性。
 */
async function sendStickerByName(fileName) {
  const files = (() => {
    try { return fs.readdirSync(conf.memesDir).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)); } catch { return []; }
  })();
  const f = String(fileName || '').trim();
  if (!files.includes(f)) {
    throw new Error(`表情库里没有 ${f}`);
  }
  const url = `/sticker/${encodeURIComponent(f)}`;
  const r = await req('POST', '/api/room/send', { code: conf.room, pid: conf.pid, type: 'sticker', url });
  if (r && r.error) throw new Error(r.error);
  lastBotAt = Date.now();
  const desc = (() => {
    try { return memes.all().find((m) => m.file === f)?.desc || ''; } catch { return ''; }
  })();
  hist.push('assistant', `（我发了一个表情包：${f}${desc ? `，画面是${desc.slice(0, 30)}` : ''}）`);
  log('发图（工具）:', f, '->', url);
  return true;
}

/* 发一张「图片库」里的图（AI 自己画的）。
 * 和表情包不同：图片库 workspace/pics/ 是各通道共用的，
 * QQ 侧的 DSH 也会把图存这儿。走 /pics/ 路由。 */
async function sendPicByName(fileName) {
  const dir = cfg.picsDir;
  const files = (() => {
    try { return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)); } catch { return []; }
  })();
  const f = String(fileName || '').trim();
  if (!files.includes(f)) throw new Error(`图片库里没有 ${f}`);
  const url = `/pics/${encodeURIComponent(f)}`;
  const r = await req('POST', '/api/room/send', { code: conf.room, pid: conf.pid, type: 'img', url });
  if (r && r.error) throw new Error(r.error);
  lastBotAt = Date.now();
  hist.push('assistant', `（我画了一张图发给老板：${f}）`);
  log('发图（图片库）:', f, '->', url);
  return true;
}

async function sendMeme(want, context = '') {
  // want：指定的文件名（按语义挑出来的），给不出来就随机
  const files = (() => { try { return fs.readdirSync(conf.memesDir).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)); } catch { return []; } })();
  if (!files.length) return false;
  const f = want && files.includes(want) ? want : files[Math.floor(Math.random() * files.length)];
  try {
    // ★ 直接用 /sticker/ 直链，不再上传复制。
    // 原来走 upload 会往 data/uploads 里写一份新副本：
    //   - 同一张图发 N 次就存 N 份（实测 56 个文件里只有 7 个被引用）
    //   - 而且上传接口才往 room.stickers 托盘里加，导致托盘看起来"丢图"
    // 直链是稳定的，重启不变，零复制。
    const url = `/sticker/${encodeURIComponent(f)}`;
    const r = await req('POST', '/api/room/send', { code: conf.room, pid: conf.pid, type: 'sticker', url });
    if (r && r.error) {
      log('发消息失败:', r.error, '，退回上传方式');
      // 兜底：万一服务端不认外部 URL，还是走上传
      const up = await upload(path.join(conf.memesDir, f));
      if (!up || !up.ok) { log('上传表情也失败了'); return false; }
      await req('POST', '/api/room/send', { code: conf.room, pid: conf.pid, type: 'sticker', url: up.url || up.path });
    }
    lastBotAt = Date.now();
    // 关键：把自己发过图这件事写进上下文。
    // 之前只打了服务器日志、没进 hist，导致它坚信「我没发过」，看着像撒谎（踩过）
    const desc = (() => {
      try { return memes.all().find((m) => m.file === f)?.desc || ''; } catch { return ''; }
    })();
    hist.push('assistant', `（我发了一个表情包：${f}${desc ? `，画面是${desc.slice(0, 30)}` : ''}）`);
    log('发表情:', f, '->', url);
    return true;
  } catch (e) {
    log('发表情异常:', e.message);
    return false;
  }
}

/* 流水账：用 core 的 */
const logChat = (role, text, name) => core.logChat(role, text, name, 'web', 'owner');

/* ---------- 回复 ---------- */
/* 读图片文件转 base64 data URL，供视觉模型识别 */
function imageDataUrl(url) {
  try {
    const name = String(url).split('/').pop();
    const p = path.join(cfg.REPO_ROOT, 'data', 'uploads', name);
    const ext = (name.split('.').pop() || 'png').toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const buf = fs.readFileSync(p);
    if (buf.length > 4 * 1024 * 1024) return null;
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  } catch { return null; }
}

/* 把一批新消息拼成一条 user content（可能带图） */
function buildUserContent(msgs) {
  const textLines = [];
  const images = [];
  for (const m of msgs) {
    if (m.type === 'text') textLines.push(`${m.name}：${m.text}`);
    else if (m.url) {
      const d = imageDataUrl(m.url);
      if (d) {
        images.push({ type: 'image_url', image_url: { url: d } });
        textLines.push(`${m.name}：${m.type === 'sticker' ? '（发了一个表情包）' : '（发了一张图）'}`);
      } else {
        textLines.push(`${m.name}：${m.type === 'sticker' ? '（发了表情包，但没读出来）' : '（发了图，但没读出来）'}`);
      }
    }
  }
  const flat = textLines.join('\n');
  return images.length ? [{ type: 'text', text: flat }, ...images] : flat;
}

/* 给旧轮次的图片降级成文字，避免每轮都重发 base64 烧 token */
function compactTurns(list) {
  return list.map((t) => (typeof t.content === 'string'
    ? t
    : { role: t.role, content: t.content.map((c) => (c.type === 'text' ? c.text : '（一张图）')).join('\n') }));
}

async function reply(msgs) {
  const content = buildUserContent(msgs);
  const flat = typeof content === 'string' ? content : content[0].text;
  hist.push('user', flat);

  // 硬规则：说「记住/记一下」就直接落盘，不等夜里摘要。
  // 之前这里的模型只把 remember.py 命令「念」出来、并没有执行，
  // 结果看着像记住了其实没写（踩过）。
  const remembered = detectRemember(flat);
  log('记忆检测:', JSON.stringify(flat.slice(0, 60)), '=>', JSON.stringify(remembered));

  // 表情清单：让模型知道有哪些图可以调工具发（只给文件名，省 token）
  const memeCatalogHint = (() => {
    try {
      const files = fs.readdirSync(conf.memesDir).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f));
      return files.join('、');
    } catch { return ''; }
  })();

  // 老板问起表情包时，把匹配得上的那几张塞进提示词，让它能说具体的
  const memeHint = /表情|表情包|那张图|发张图|配图|梗图/.test(flat)
    ? `【表情库里相关的几张】\n${memes.search(flat, 4).map((m) => `${m.file}：${m.desc}`).join('\n')}`
    : '';

  // 服务器真实时间（时区 Asia/Shanghai）。没有这个，它连「明天」是哪天都算不出来，
  // 被问「明天上啥课」只能含糊（踩过）。
  const now = new Date();
  const dateStr = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const sys = [
    persona(),
    '---',
    `现在是 ${dateStr}（北京时间）。算「明天/后天/这周」一律以这个时间为准，不许自己猜。`,
    // 跨通道：五子棋/卡牌那边刚发生的事，聊天室的你也能知道
    // 窗口给足 24 小时，避免「刚打完就说没记忆」（踩过）
    shared.digest(1440),
    '你正在「聊天室」里和老板实时聊天（像微信），就当自己是他的朋友「小肥鱼」。',
    '规则：',
    '- 口语短句、别写小作文、不用 Markdown，一般 1~3 句',
    '- **上面有你们的对话记录，接着上一句聊**；他说「那个/它/刚才说的」就指前面聊过的内容',
    '- 被问在哪、在干嘛之类，就说你在这边盯着服务器；**别说自己是程序/AI/模型**，也别解释技术细节',
    '- 他发图你就看图说话：图里是什么、好不好笑、什么梗，直接聊',
    '- 他随口一说，你就随口一接；没话聊就别硬找话题',
    '- 对话记录里出现「（我发了一个表情包：…）」就是**你自己真的发过**，别否认；他问起就照实说',
    '- 他让你发表情，系统会自动挑一张真图发出去。**你只管说人话**：',
    '  · 不要说「我发了个表情包：xxx.jpg」这种描述性的话（那是机器人腔）',
    '  · 不要输出文件名、路径、链接',
    '  · 最多顺口说一句「发你了」「喏」，或者干脆不说',
    '- 问安排/日程：先按上面「关于老板」里记录的安排推算，对得上就直接答，别再说「我查一下」',
    '- **上面如果有「刚刚发生的事」区块，那就是真的发生过**。他说「刚才那局」「我上的哪手」，直接从那儿答，不许说「没存下来」「没有记录」',
    '- 老板问「你还记得吗」时，先看上面有没有相关内容，有就答有，没有再说没有。别一上来就翻旧记忆说没有',
    '- **你有工具可以发图**：想发表情包就调用 `qq_send_image`，传表情库里的文件名。',
    '  · 老板要图就直接调用，别只嘴上说「发你了」',
    '  · 一次最多 1 张，别连发',
    '  · **不要**在正文里输出 `<qq_send_image>` 标签、文件路径或「我发了个表情包：xxx」这种话',
    '  · 发完图可以顺口说一句「喏」「发你了」，或者什么都不说',
    '- **你有 search_chatlog 可以回查历史对话**。老板问「我之前说过什么」「几点几分说的」「上周那个事」',
    '  「你还记得我提过 XX 吗」，**必须真调 search_chatlog 去查**，不许凭印象编、也不许说「翻不到记录」。',
    '  · 他说「今天上午 7 点多」→ 调 search_chatlog({ hours: 14, around: "07:42" })，**around 是关键**，',
    '    只给 hours 会返回最新的几十条，把最早那段正好挤掉（踩过）',
    '  · 他说「昨天」→ hours: 48',
    '  · 查出来就照实说，查不到才说没有',
    '  · **工具返回的「[时间] 老板：…」只是给你看的检索结果格式，你的回复里绝对不要带这种前缀**',
    '- **你说话时不要带任何前缀**：不要写「小鱼：」「老板：」，也不要写「[11-06 07:42]」这种时间戳。',
    '  直接说内容就行，名字和时间系统会自动加。带前缀是机器人腔，很难看。',
    '- **要用 say_lines 才能发多条消息**。老板说「连发两条」「分开发」「一条一条发」，',
    '  或者你要说两件互不相关的事，**必须调 say_lines**，不能自己在一条回复里打回车。',
    '  你自己的回复永远只算**一条**消息，里面的换行只是同一颗气泡里的空行。',
    '  · 例：老板说「连发两条说早安晚安」→ 调 say_lines({lines:["早安","晚安"]})',
    '  · 一次最多 3 条，每条别超过 60 字',
    '- **老板要图，你必须真的调用 draw**。调用后才会有图，光说话不会发出任何东西。',
    '  · ❌ 绝对不要只在回复里写「画好了」「画了一只猫」「图发你了」——那样老板什么都收不到',
    '  · ✅ 正确做法：直接调 draw({html:"...", content:"猫"})，工具会真的渲染并发送',
    '  · 老板说「再画个」「画个…」「做个图」「来张图」「画好看的」都是同一个意思：调 draw',
    '  · 老板问「图呢」「搁哪了」「怎么没发」→ 说明上次没调成功，**立刻重新调 draw**，别解释',
    '  · 调用返回后，你才可以说一句「画好了」，也可以什么都不说',
    '- draw 的写法：内联 HTML/CSS/SVG，**风格不限，你自己设计**（渐变、圆角、阴影、手绘都行）。',
    '  · 只能用内联样式，不能引用外部图片/字体（会被拦）',
    '  · content 里写一句这是什么（用于文件名和索引）',
    '- **你有 list_pics 和 send_pic**。老板说「之前画的那张再发一次」，用 list_pics 找出文件名，再用 send_pic 发。',
    '  你画过的图都在这儿存着，随时能再发。',
    '- **你有 server_status 可以查服务器**。老板问「内存多少」「磁盘够不够」「服务器卡不卡」',
    '  「你那边怎么样」「开了多久」，调 server_status({what:"status"}) 查了再答。**不许瞎猜数字。**',
    '  · what 可选：status（默认，最全）/ memory / disk / uptime / processes',
    '  · 它**只能读，不能改**。想重启、关服务、改配置，你在这儿做不了，直说就行。',
    '- 除了发图、回查聊天记录、查服务器状态，你没有别的工具：不能跑任意命令、不能读写系统文件。',
    '  绝对不要输出 `ops memory`、`python3 ...` 这类命令。',
    '【表情库里有这些图（文件名 = 你调工具时传的路径最后一段）】',
    memeCatalogHint,
    memeHint ? `\n${memeHint}` : '',
    remembered
      ? `\n【系统】老板这句是让我记住：「${remembered}」。我已经写进长期记忆了，你只要自然地回一句「记好了」之类，**不要输出任何命令或代码**。`
      : '',
  ].filter(Boolean).join('\n');

  busy = true;
  try {
    const msgsOut = [{ role: 'system', content: sys }, ...compactTurns(hist.history().slice(0, -1)), { role: 'user', content }];

    // ★ 真工具模式：模型自己决定调不调 qq_send_image，代码不再猜
    let stkSent = false;
    const out = await llmWithTools(msgsOut, {
      log,
      sendSticker: async (fileName) => {
        await sendStickerByName(fileName);
        stkSent = true;
      },
      sendPic: async (fileName) => {
        await sendPicByName(fileName);
        stkSent = true;
      },
      // 连发多条：一条条发，中间留点间隔，像真人打字
      sendLines: async (lines) => {
        const arr = (Array.isArray(lines) ? lines : [])
          .map((x) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 3);
        for (let i = 0; i < arr.length; i++) {
          await say(arr[i]);
          if (i < arr.length - 1) {
            // 60~180 毫秒随机间隔，太整齐反而不像人
            await new Promise((r) => setTimeout(r, 600 + Math.random() * 1200));
          }
        }
        return arr.length;
      },
      /* ---------- 记忆工具 ----------
       * 判断权交给模型（它看得见整段对话），这里只提供落库入口。
       * 房间号当 sessionId：同一房间内的 session 档约定能互相看见。
       */
      memCtx: { channel: 'chat', game: '', sessionId: String(conf.room || 'chat'), room: conf.room },
      writeRule: core.writeRule,
      listRules: core.listRules,
      revokeRule: core.revokeRule,
      // 模型已经裁决过「该记」，别再问一遍模型，直接落盘（skipJudge）
      rememberFact: async (fact) => memoryWrite.remember(fact),
    }, { maxTokens: 220, temperature: 0.85 });

    if (!out) {
      // 工具参数全空被中止，或者模型没说话。
      // ★ 2026-11-08 修正：原来一律回「我这边卡了一下」，结果老板连着看到好几遍，
      //   像复读机。改成：图已经发出去了就当成功（不用再说话）；
      //   没发出去就再问模型一次「刚才想说什么」，让它自己说，而不是套模板。
      if (!stkSent) {
        log('本轮没有产出，让模型重说一次');
        try {
          const again = await llmRaw(
            [...msgsOut, { role: 'user', content: '（刚才那步没成功，用一句话自然地说一下现在什么情况，别道歉别解释技术细节）' }],
            { maxTokens: 120, temperature: 0.9 },
          );
          const line = (again.content || '').trim();
          if (line) await say(line);
        } catch { /* 说不出就不说 */ }
      }
      return;
    }
    // 模型已经通过工具发过图了，就不再补
    // 没发过、但你明确要图 → 兜底发一张（防止模型忘了调用工具）
    let pick = null;
    if (!stkSent) {
      const want = shouldSendMeme(flat);
      if (want === 'asked') {
        const claimed = extractClaimedMeme(out);
        pick = claimed || pickMemeFor(flat);
        if (!pick) {
          const r = memes.random();
          if (r) pick = r.file;
        }
        if (pick) log('模型没调工具，兜底发:', pick);
      }
    }
    // ★ 2026-11-08 兜底：老板明确要求连发，但模型没调 say_lines，
    //   而是自己在一条回复里打回车。代码帮他拆成真·多条消息发出去。
    //   只在「老板确实要求连发」时才拆，避免把正常的分段回复拆碎。
    const wantsMulti = /(连发|分开发|分开说|一条一条|两条消息|发两条|多条)/.test(flat);
    const parts = String(out || '')
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (wantsMulti && parts.length >= 2 && parts.length <= 3 && !pick) {
      log(`老板要连发，模型没调工具 → 自动拆成 ${parts.length} 条`);
      for (let i = 0; i < parts.length; i++) {
        await say(parts[i]);
        if (i < parts.length - 1) {
          await new Promise((r) => setTimeout(r, 600 + Math.random() * 1200));
        }
      }
    } else {
      await say(out, !!pick);
    }
    logChat('assistant', out);
    // 说「记住 XX」→ 先落盘，再回一句「记好了」（不是只念命令）
    let wrote = false;
    if (remembered) wrote = await remember(remembered);
    if (remembered && !wrote) {
      await say('我这边写记忆的时候卡了一下，你回头再说一遍我重试下。');
    }
    if (pick) {
      setTimeout(() => sendMeme(pick, flat).catch(() => {}), 1200);
    }
  } catch (e) {
    log('回复失败:', e.message);
  } finally {
    busy = false;
  }
}

/* ---------- 显式记忆：说「记住 XX」就真的写进 MEMORY.md ---------- */
/* 显式「记住 X」的兜底网：模型忘调 remember_fact 时，这一层保证不漏。
 *
 * 2026-11-16 修：原来只把**整段第一条**消息的「老板：」前缀剥一次，再拿正则
 * 从整段开头匹配。一批里连着来两条（「老板：在吗\n老板：记住：下周考离散」）时，
 * 剥完是「在吗\n老板：记住…」，锚定在 ^ 的正则对不上 → 静默漏记。
 * 现在按行拆开逐条匹配，一批里几条「记住」都能落地，也不会把后一条吞进 fact。
 */
function detectRemember(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const RE = /^(记住|记一下|记着|帮我记|存一下|别忘了)\s*[：:，,]?\s*(.+)$/;
  for (const line of t.split(/\r?\n/)) {
    // 每行各自剥一次说话人前缀：「老板：记住 下周考离散」→「记住 下周考离散」
    const body = line.trim().replace(/^[^：:]{1,8}[：:]\s*/, '').trim();
    const m = body.match(RE);
    if (!m) continue;
    const fact = m[2].trim();
    if (fact.length < 2) continue;
    // 「你记住了吗」这类反问不算
    if (/^(吗|么|了[吗么]?|没|没有|啥|什么|不)/.test(fact)) continue;
    return fact;
  }
  return null;
}

const memoryWrite = require('../lib/remember.js');

/* 显式「记住 X」的落盘（兜底网）。
 *
 * 不再走 rememberAsync：那条路会再问一次模型（judgeFact），而这里能进来的
 * 只有「一句话以『记住：』开头」这种确定性祈使句，判断已经由句式完成了。
 * 省下的是每条消息 0.7~0.9 秒。
 */
function remember(fact) {
  const r = memoryWrite.remember(fact);
  if (r.ok) {
    log(r.skipped ? '记忆已有类似条目，跳过:' : '已写入长期记忆:', fact, '|', r.message);
    return true;
  }
  log('写记忆失败:', r.message);
  return false;
}

/* 按场合挑表情。
 *
 * 旧版是「语义命中就发，否则随机」——结果老板说正经事甚至心情不好的时候，
 * 随机甩一张「脑残片」「您不配」这种嘲讽图，非常破坏气氛。
 *
 * 现在分三档：
 *   1. 老板明确说要图 → 按他的词找
 *   2. 语境是负面/正经（累、烦、考试、生气、忙）→ 只挑温和的，或者干脆不发
 *   3. 其余 → 优先用温和/正面/中性图，嘲讽类只在高相似度命中时才用
 */

// 一看就不该在「正经/低落」场合发的图（文件名或描述命中即排除）
const HARSH = /脑残|不配|嘲讽|骂|蠢|丑|嘲|鄙视|轻蔑|喝点尿|拍砖|刷踩|白眼|狗头怼|嫌弃/i;
// 温和、万能、不冒犯的
const GENTLE = /猫|cat|milk|牛奶|抱|hug|wave|招手|鼓掌|applause|ok|收到|加油|cheer|期待|rose|花|睡觉|asleep|peace|赞|thumbs_up/i;

const NEGATIVE_CTX = /累|烦|困|难过|不开心|郁闷|烦死|气死|生气|崩了|寄了|挂科|考砸|没考好|忙死|加班|熬夜|头疼|难受|哭|唉|完了|翻车/i;

/* 从老板的话里抽取「找图关键词」。
 * 「你发那个表情包，那个一样是开心果的表情包」→ 关键词应该是「开心果」，
 * 不能因为句子里有「表情包」就把整个句子拿去匹配。
 */
const MEME_STOP = [
  '表情包', '表情', '那个', '这个', '一样', '选那个', '你觉得', '最好的', '回答',
  '发一个', '发个', '给我', '来一张', '来张', '图片', '张图', '你发', '发张',
  '一个', '什么', '怎么', '就是', '还是', '可以', '帮我', '看看', '一下',
  // 这些是废话词，提取成关键词会导致匹配失败
  '顺便', '随便', '随你', '也行', '嘛', '呗', '吧', '啊', '呀', '呢',
  '来一个', '来个', '整一个', '整个', '发一下', '发个吧',
];

function extractMemeQuery(text) {
  let t = String(text || '');
  // 去掉句首的「老板：」之类
  t = t.replace(/^[^：:]{1,8}[：:]\s*/, '');
  // 去掉停用词
  for (const w of MEME_STOP) {
    t = t.split(w).join(' ');
  }
  // 去掉标点
  t = t.replace(/[，。！？、；：""''（）()\[\]【】\s]+/g, ' ').trim();
  // 取剩下的非空片段里最长的那个当关键词
  const parts = t.split(/\s+/).filter((x) => x.length >= 2);
  if (!parts.length) return '';
  parts.sort((a, b) => b.length - a.length);
  return parts[0];
}

/* 从模型回复里提取它声称要发的表情包。
 * 模型有时会说「我发了个开心果的表情」，得真的发那张，
 * 而不是代码自己再挑一张（不然说的和发的对不上，踩过）。
 */
function extractClaimedMeme(text) {
  const t = String(text || '');
  const items = (() => { try { return memes.all(); } catch { return []; } })();
  if (!items.length) return null;

  // ① 直接提到文件名
  for (const m of items) {
    if (t.includes(m.file)) return m.file;
  }

  // ② 提到图里的内容：「发了个开心果的表情」「给你发张无语的」
  // 注意 char class 要排除「个张一了个」，否则会捕获成「个开心果」
  const NOT_ARTICLE = '[^\\s，。！？、个张一了的]';
  const pats = [
    new RegExp(`(?:发|来|给|整|甩|扔)(?:了个|张|个|一个|一张)?\\s*(${NOT_ARTICLE}{2,12}?)\\s*的?\\s*(?:表情|图|梗)`),
    new RegExp(`(${NOT_ARTICLE}{2,12}?)\\s*的?\\s*(?:表情|图|梗)\\s*(?:发给|给你|来|整)`),
    new RegExp(`(?:发|来|给|整|甩|扔)(?:个|张|一个|一张)?\\s*(${NOT_ARTICLE}{2,10})\\s*(?:的|给你|吧|。|$)`),
  ];
  for (const re of pats) {
    const m = t.match(re);
    if (!m) continue;
    const kw = m[1];
    const hits = items
      .map((it) => ({
        it,
        s: (it.desc.includes(kw) ? 10 : 0)
          + [...new Set(kw.split(''))].filter((c) => it.desc.includes(c)).length,
      }))
      .sort((a, b) => b.s - a.s);
    if (hits[0] && hits[0].s >= 10) {
      log('模型说它要发「' + kw + '」，匹配到:', hits[0].it.file);
      return hits[0].it.file;
    }
  }
  return null;
}

/* 按语义挑表情。
 *
 * ★ 这个函数被重写过两次，教训是「评分权重」极难调对：
 *
 * 第一版：语义命中就发，否则随机 → 正经场合甩嘲讽图
 * 第二版：给「温和图」白送 10 分，门槛 8 分 → 11 张猫图永远胜出，
 *         你说「开心果的表情包」它发猫脸麻木（GENTLE 命中 cat 白拿 10 分，
 *         把真正匹配的开心果图压下去了）
 *
 * 现在：**先看有没有真实匹配，匹配上了就只在匹配集里选；**
 *       温和/嘲讽只是同分时的次要权重，绝不压过匹配度。
 */
function pickMemeFor(text) {
  const items = (() => { try { return memes.all(); } catch { return []; } })();
  if (!items.length) return null;

  const query = extractMemeQuery(text) || String(text || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  const negative = NEGATIVE_CTX.test(String(text || ''));

  // 1. 先算纯匹配分（只算字面命中，不加任何偏好）
  const withScore = items.map((m) => {
    let s = 0;
    const q = query;
    // 完整关键词出现在描述/文件名里，权重最高
    if (q.length >= 2 && (m.desc.includes(q) || m.file.toLowerCase().includes(q.toLowerCase()))) s += 50;
    // 二字片段命中
    for (let i = 0; i < q.length - 1; i++) {
      const bi = q.slice(i, i + 2);
      if (m.desc.includes(bi)) s += 8;
    }
    // 单字命中（很弱，只做微调）
    let single = 0;
    for (const c of new Set(q.split(''))) {
      if (c.trim() && m.desc.includes(c)) single += 1;
    }
    s += Math.min(single, 5);
    return { m, match: s };
  });

  // 2. 有没有「真的匹配上」的图？有就只在这些图里挑
  const matched = withScore.filter((x) => x.match >= 20);
  let pool = matched.length ? matched : withScore;
  const strict = matched.length > 0;

  // 3. 在同分区间里用温和/嘲讽做次要排序
  for (const x of pool) {
    let bonus = 0;
    if (GENTLE.test(x.m.file) || GENTLE.test(x.m.desc)) bonus += 2;
    if (HARSH.test(x.m.file) || HARSH.test(x.m.desc)) bonus -= negative ? 100 : 2;
    x.final = x.match === 0 ? bonus - 5 : x.match + bonus;   // 零匹配的图默认不该被选
  }
  pool.sort((a, b) => b.final - a.final);

  const best = pool[0];
  if (!best) return null;
  // 严格模式下，只要有真实匹配就一定发；宽松模式下要求达到基本门槛
  if (strict) return best.m.file;
  if (best.final >= 6) return best.m.file;
  return null;
}

/* 是否应该在这条消息后配图：结合概率与语境 */
function shouldSendMeme(text) {
  const t = String(text || '');
  // 老板明确要图 → 一定发（这个判断必须在概率之前，否则被概率拦掉，踩过）
  // 注意：{0,3} 太窄，「发个开心果的表情包」中间有 6 个字就匹配不到（踩过），
  // 改成 {0,12} 并且放宽几种说法。
  const ASK = /发.{0,12}(表情|图|梗)|来[张个].{0,6}(图|表情)|给我[发来].{0,6}|整个?表情|来个?图|发一个?/;
  if (ASK.test(t)) return 'asked';
  // 低落语境下低调一点，别配图
  if (NEGATIVE_CTX.test(t)) return false;
  // 其余按概率
  return Math.random() < conf.memeChance;
}

/* ---------- 主动搭话 ----------
 * 关键设计：**判断交给提示词，不写死规则**。
 * 之前是「多久没说话就开口」，结果凌晨四点还在问「你咋还不睡」（踩过）。
 * 现在把三样东西告诉模型，让它自己决定说不说：
 *   1. 现在几点（安静时段 0~7 点由它自己把握）
 *   2. 房间里有几个人、老板在不在线
 *   3. 最后一条消息是多久以前
 * 老板明确要求「现在发」时，优先级高于一切（提示词里写明了）。
 */
async function proactive() {
  const now = Date.now();
  if (now - proactiveFrom > 3600e3) { proactiveCount = 0; proactiveFrom = now; }
  if (proactiveCount >= conf.proactive.maxPerHour) return;
  if (now - lastBotAt < 20 * 60e3) return;
  // 连续好几条没人回，就别再自言自语了（除非老板叫他发）
  if (noReplyStreak >= 2) { log('主动搭话：已连续', noReplyStreak, '条没人回，安静等着'); return; }
  proactiveCount += 1;

  const idleMin = Math.round((now - lastUserAt) / 60e3);
  const timeStr = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const hour = Number(timeStr.split(':')[0]);
  const alone = memberCount <= 1;
  const away = !peerOnline || idleMin > 60;

  const scene = [
    `【现在】${timeStr}（北京时间）`,
    `【聊天室情况】房间里有 ${memberCount} 个人${alone ? '（只有你自己，老板不在）' : ''}。`,
    peerOnline ? `老板在房间里，但他最后一次说话是 ${idleMin} 分钟前。` : '老板不在线。',
    away ? '→ 他很可能不在电脑前（或者已经睡了/走了），你发消息他未必立刻看到。' : '→ 他应该就在。',
  ].join('\n');

  const sys = [
    persona(),
    '---',
    '你在聊天室，可以主动说句话，也可以不说。',
    '',
    '【判断依据】',
    '- 深夜 0 点到 7 点：一般人这个点睡了，**除非老板明确让你这个点发消息**，否则别开口。',
    '- 老板不在房间或可能离开：可以留一句话，但要意识到他可能很久才看到，别一晚上发好几条。',
    '- 老板明显在线：可以正常搭话。',
    '- **老板明确要求「现在发」「叫我」之类，优先级最高，不管几点都发。**',
    '',
    '【怎么说】',
    '- 一两句，口语，别煽情，别硬找话题',
    '- 可以接着上面聊过的内容，但别重复已经说过的话',
    '',
    '【输出】',
    '想说话就直接说你那句话。',
    '不想说话，只输出 [SKIP]。',
  ].join('\n');

  try {
    const out = await llm([
      { role: 'system', content: sys },
      ...compactTurns(hist.history()),
      { role: 'user', content: `${scene}\n\n说点什么吗？不想说就回 [SKIP]。` },
    ], 120, 0.9);
    if (out && !out.includes('[SKIP]')) {
      await say(out);
      logChat('assistant', out);
      noReplyStreak += 1;
      log(`主动搭话（${timeStr}，${alone ? '房间只有我' : peerOnline ? '老板在线' : '老板离线'}）`);
    } else {
      log(`主动搭话：这次不说（${timeStr}）`);
    }
  } catch (e) {
    log('主动搭话失败:', e.message);
  }
}

/* ---------- 拉消息 ---------- */
async function poll() {
  if (!joined) { await enterRoom(); return; }
  const r = await req('GET', `/api/room/state?code=${encodeURIComponent(conf.room)}&pid=${encodeURIComponent(conf.pid)}&since=${lastSeenId}`);
  if (!r || r.needJoin) { joined = false; return; }
  if (!r.ok) return;

  // 成员状态要在「有没有新消息」之前更新：没有新消息时也要知道老板在不在
  if (r.peer) {
    peerOnline = !!r.peer.online;
    peerName = r.peer.name || peerName;
  } else {
    peerOnline = false;
  }
  memberCount = (r.members || []).length;

  const msgs = r.msgs || [];
  if (!msgs.length) return;

  // 文字 + 图片都要处理；sys（进出房间提示）不算
  const fresh = msgs.filter((m) => m.pid !== conf.pid && m.type !== 'sys' && (
    (m.type === 'text' && (m.text || '').trim()) ||
    (m.type === 'img' && m.url) ||
    (m.type === 'sticker' && m.url)
  ));
  lastSeenId = Math.max(lastSeenId, ...msgs.map((m) => m.id || 0));

  if (fresh.length) {
    lastUserAt = Date.now();
    // 老板开口了，说明他在：清零「连续没人回」计数
    noReplyStreak = 0;
    for (const m of fresh) {
      if (m.type === 'text') logChat('user', m.text, m.name);
      else logChat('user', `[${m.type === 'sticker' ? '表情' : '图片'}] ${m.url}`, m.name);
    }
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      reply(fresh).catch((e) => log('异常:', e.message));
    }, conf.replyQuietMs);
  }
}

/* ---------- 心跳 ---------- */
async function beat() {
  if (!joined) return;
  try { await req('POST', '/api/room/ping', { code: conf.room, pid: conf.pid }); } catch {}
}

/* ---------- 启动预热：用 chatlog 最近几条把上下文垫上 ---------- */
function warmup() {
  const n = conf.warmup || 0;
  if (!n) return;
  try {
    const lines = fs.readFileSync(conf.chatlog, 'utf8').trim().split('\n');
    const rows = [];
    for (let i = lines.length - 1; i >= 0 && rows.length < n * 2; i--) {
      let r;
      try { r = JSON.parse(lines[i]); } catch { continue; }
      if (r.noise) continue;
      if (!['web', 'qq', 'lx', 'yu'].includes(r.channel)) continue;
      rows.unshift(r);
    }
    for (const r of rows.slice(-n)) {
      // 预热也不能带「名字：」前缀，否则模型照抄格式（见 say() 里的说明）
      if (r.role === 'user' || r.role === 'assistant') hist.push(r.role, r.text);
    }
    log(`上下文预热 ${hist.size()} 条`);
  } catch (e) {
    /* 首次部署时流水账还不存在，属于正常情况，不该当成错误刷屏。
     * 站点只在自己被使用时才写这个文件，所以「还没人聊过」= 没有文件。 */
    if (e && e.code === 'ENOENT') {
      try {
        fs.mkdirSync(require('node:path').dirname(conf.chatlog), { recursive: true });
        fs.writeFileSync(conf.chatlog, '', { flag: 'a' });
        log('流水账尚未创建，已初始化空文件（等第一次聊天后开始记录）');
      } catch {
        log('流水账尚未创建，跳过预热（等第一次聊天后会生成）');
      }
    } else {
      log('预热失败:', e.message);
    }
  }
}

/* ---------- 主循环 ---------- */
async function start() {
  log(`启动聊天室陪聊 v2：房间=${conf.room} 昵称=${conf.name} 人设=${persona().length}字 表情库=${conf.memesDir}`);
  warmup();
  await enterRoom();
  setInterval(() => poll().catch((e) => log('poll:', e.message)), conf.pollMs);
  setInterval(() => beat().catch(() => {}), conf.heartbeatMs);
  if (conf.proactive.enabled) {
    setInterval(() => {
      if (busy) return;
      if (Date.now() - lastUserAt >= conf.proactive.idleMinutes * 60e3) proactive().catch(() => {});
    }, 60e3);
  }
}

/* detectRemember 一起导出：批量消息漏记是踩过的坑，留个可回归的入口 */
module.exports = { start, detectRemember };
