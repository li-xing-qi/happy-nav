// 聊天室可用工具：和 QQ 侧同名同行为，人设不用改
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const render = require('./lib/render.js');

const cfg = require('./config.js');

const MEME_DIR = cfg.memesDir;
const CHATLOG = cfg.chatlog;
const PICS = cfg.picsDir;

/* ---------- 只读查询白名单 ----------
 *
 * 聊天室的鱼没有 QQ 侧 DSH 的 bash 工具，回答「内存多少」「磁盘还剩多少」
 * 只能瞎猜。这里给它一个「只读、只认识几条固定命令」的入口。
 *
 * 安全设计（重要）：
 *   1. 不接受任意命令字符串，只接受下面这几个「动作名」
 *   2. 用 execFileSync，不经过 shell，天然没有注入
 *   3. 每条命令都是固定的、只读的，不带任何用户参数
 *   4. 超时 3 秒，输出截断到 800 字
 *   5. **没有任何写/删/重启能力**
 */
const READONLY = {
  memory: {
    desc: '内存占用（总内存、已用、可用、swap）',
    cmd: 'free',
    args: ['-h'],
  },
  disk: {
    desc: '磁盘占用（只看真实分区，不含内存盘）',
    cmd: 'df',
    args: ['-h', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'udev', '--output=source,size,used,avail,pcent,target'],
  },
  uptime: {
    desc: '服务器开了多久、负载多少',
    cmd: 'uptime',
    args: [],
  },
  processes: {
    desc: 'pm2 管理的进程列表（名字、状态、内存）',
    cmd: 'pm2',
    args: ['jlist'],
  },
};


/* 工具定义（OpenAI / DeepSeek function calling 格式） */
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'qq_send_image',
      description:
        '在聊天室发一张表情包图片。老板让你发表情、发图、来个梗图时调用。' +
        '一次最多 1 张。只能发表情库里已有的图。',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: '表情包文件名（见 list_memes 返回的列表），或表情库内的相对路径',
          },
        },
        required: ['paths'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_memes',
      description: '列出表情库里所有可用的表情包文件名（当你不确定有什么图时用）',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'server_status',
      description:
        '查服务器状态。老板问「内存多少」「磁盘还剩多少」「服务器卡不卡」「你那边怎么样」' +
        '「开了多久」时调用。**只能读，不能改任何东西。**' +
        '不要在没调用的情况下瞎猜数字。',
      parameters: {
        type: 'object',
        properties: {
          what: {
            type: 'string',
            enum: ['status', 'memory', 'disk', 'uptime', 'processes'],
            description:
              'status=整体状态（默认，最全）；' +
              'memory=内存；disk=磁盘；uptime=运行时长和负载；processes=进程列表。',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'say_lines',
      description:
        '连着发几条消息（像真人聊天那样一条条发，不是一条长消息里换行）。' +
        '老板问「能不能连发两条」「分开发」，或者你想补一句时调用。' +
        '**最多 3 条**，每条别超过 60 字，间隔会自动加，看起来像真人。',
      parameters: {
        type: 'object',
        properties: {
          lines: {
            type: 'array',
            items: { type: 'string' },
            description: '要依次发出去的内容，1~3 条。按顺序发。',
          },
        },
        required: ['lines'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draw',
      description:
        '自己画一张图发给老板。写 HTML/CSS/SVG，服务器会渲染成 PNG 发出去，并存进共享图片库（以后随时能再发）。' +
        '老板说「画个…」「做个图」「生成一张图」时调用。' +
        '**不限制风格，你想怎么设计都行**：渐变、圆角、阴影、SVG 手绘都支持。' +
        '注意：只能用内联样式，不能引用外部图片/字体/网络资源（会被拦）。',
      parameters: {
        type: 'object',
        properties: {
          html: {
            type: 'string',
            description:
              '要渲染的 HTML 片段（可以只写内部内容，也可以写完整 <html>）。' +
              '建议用 <div style="..."> 内联样式。中文字体已自动配好。' +
              '画 SVG 就直接放 <svg>。',
          },
          content: {
            type: 'string',
            description: '一句话说明这张图画的是什么（用于文件名和索引，15 字以内）。',
          },
          width: { type: 'number', description: '宽度像素，默认 800，范围 100~1600' },
          height: { type: 'number', description: '高度像素，默认 600，范围 100~2000' },
          bg: { type: 'string', description: '背景色，默认 #ffffff，可以写渐变' },
        },
        required: ['html'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pics',
      description:
        '看共享图片库里有哪些图（所有 AI 画的都在这里）。' +
        '老板问「你之前画过什么」「有哪些图」或者想找一张旧的再发时调用。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '最多列几张，默认 20' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_pic',
      description:
        '从共享图片库里挑一张发给老板（重新发以前的图用）。' +
        '传文件名，或者只传一部分名字也行（会自动模糊匹配）。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '图片文件名，比如 "11-07-2230-早八快乐.png"，可以只给 "早八快乐"' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_chatlog',
      description:
        '在历史聊天记录里回查。老板问「我之前说过什么」「几点几分说的」「上周那个事」' +
        '「你还记得我提过 XX 吗」时**必须调用**，不要凭印象瞎猜。' +
        '可以按关键词搜，也可以只按时间范围翻。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '要找的关键词或话题，比如「五子棋」「晚饭」「考试」。留空则只按时间翻。',
          },
          hours: {
            type: 'number',
            description: '往回翻多少小时内的记录。默认 24。老板说「今天上午」就传 12~14，「昨天」传 48。',
          },
          limit: {
            type: 'number',
            description: '最多返回几条，默认 20，最大 50。',
          },
          around: {
            type: 'string',
            description:
              '只想看某个时间点附近时填，格式「MM-DD HH:MM」，比如「11-06 07:42」。' +
              '老板说「7点42左右」就填这个，比只给 hours 准得多。',
          },
        },
        required: [],
      },
    },
  },
];

/* ---------- 历史回查 ---------- */
/* 时间戳是 ISO 字符串（带 +08:00 时区），这里统一转成本地时间显示 */
function stampCN(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return String(iso).slice(0, 16);
  }
}

function searchChatlog(args) {
  const keyword = String(args?.keyword || '').trim();
  const hours = Math.min(Math.max(Number(args?.hours) || 24, 1), 24 * 30);
  const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 50);
  // around 形如「11-06 07:42」或「07:42」；只有时分时自动补今年
  let around = String(args?.around || '').trim();
  if (around) {
    if (/^\d{1,2}:\d{2}$/.test(around)) {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      around = `${p(d.getMonth() + 1)}-${p(d.getDate())} ${around.padStart(5, '0')}`;
    }
  }

  let raw;
  try {
    raw = fs.readFileSync(CHATLOG, 'utf8');
  } catch (e) {
    return `读不到聊天记录：${e.message}`;
  }

  const cutoff = Date.now() - hours * 3600e3;
  const hits = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.noise || !r.text) continue;
    const t = new Date(r.ts || 0).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    // 关键词过滤：留空则全部
    if (keyword && !String(r.text).includes(keyword)) continue;
    // 游戏落子流水没营养，跳过（但对局结果保留）
    const txt = String(r.text).trim();
    if (/^(落子|规则兜底|LLM 选|下了[，,\s]*[A-O]\d{1,2})/.test(txt)) continue;
    hits.push({ ts: t, role: r.role, name: r.name, channel: r.channel, text: txt });
  }

  if (!hits.length) {
    return keyword
      ? `最近 ${hours} 小时里没找到含「${keyword}」的记录。可以换个词，或者把 hours 放大再试。`
      : `最近 ${hours} 小时没有对话记录。`;
  }

  // 取哪一段：模型说「7 点 42 左右」时，要的是那个时间点附近，不是「最新 N 条」。
  // 之前一律取最新，结果 14 小时内 76 条、limit 50，把最早那段正好挤掉了（实测踩过）。
  let picked;
  if (around !== '') {
    // 按时间点定位：取该时刻前后各若干条
    const pivot = hits.findIndex((h) => stampCN(h.ts) >= around);
    if (pivot === -1) {
      // 整个窗口都早于/晚于该时刻：取最接近的一端
      picked = hits.slice(0, limit);
    } else {
      const half = Math.floor(limit / 2);
      const start = Math.max(0, pivot - half);
      picked = hits.slice(start, start + limit);
    }
  } else {
    // 没指定时间点：默认取最新，但保证不少于 limit
    picked = hits.slice(-limit);
  }
  const lines = picked.map((h) => {
    const who = h.role === 'assistant' ? '我' : '老板';
    const where = h.channel === 'game' ? '游戏' : h.channel === 'qq' ? 'QQ' : '';
    return `[${stampCN(h.ts)}]${where ? `(${where})` : ''} ${who}：${h.text.slice(0, 150).replace(/\n/g, ' ')}`;
  });

  const range = picked.length
    ? `（${stampCN(picked[0].ts)} ~ ${stampCN(picked[picked.length - 1].ts)}）`
    : '';
  const head = keyword
    ? `最近 ${Math.round(hours)} 小时内，含「${keyword}」的记录共 ${hits.length} 条，返回 ${picked.length} 条${range}（按时间正序）：`
    : `最近 ${Math.round(hours)} 小时的记录共 ${hits.length} 条，返回 ${picked.length} 条${range}（按时间正序）：`;
  return `${head}\n${lines.join('\n')}`;
}

/* 只读服务器查询：只认白名单里的动作名，不执行任意命令 */
function serverStatus(args) {
  const what = String(args?.what || 'status').toLowerCase().trim();

  // status = 内存 + 磁盘 + 负载 三样拼一起，说人话
  if (what === 'status') {
    const grab = (cmd, argv) => {
      try {
        return execFileSync(cmd, argv, {
          encoding: 'utf8', timeout: 3000, maxBuffer: 1024 * 256,
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
      } catch (e) {
        return `(取不到: ${String(e.message || e).slice(0, 60)})`;
      }
    };
    const mem = grab('free', ['-h']);
    // free 的输出是定列：total used free shared buff/cache available
    const memCols = (mem.split('\n').find((l) => l.startsWith('Mem:')) || '').trim().split(/\s+/);
    const swpCols = (mem.split('\n').find((l) => l.startsWith('Swap:')) || '').trim().split(/\s+/);
    const memText = memCols.length >= 7
      ? `内存：总 ${memCols[1]}，已用 ${memCols[2]}，空闲 ${memCols[3]}，可用 ${memCols[6]}`
      : '';
    const swapText = swpCols.length >= 4
      ? `Swap：总 ${swpCols[1]}，已用 ${swpCols[2]}，空闲 ${swpCols[3]}`
      : '';
    const disk = grab('df', ['-h', '/']);
    const diskLine = disk.split('\n').filter(Boolean).pop() || '';
    const up = grab('uptime', []);
    const load = (up.match(/load average:\s*(.+)$/) || [])[1] || '?';
    const dayPart = (up.match(/up\s+([^,]+(?:,\s*[^,]+)?)/) || [])[1] || '';
    const proc = grab('pm2', ['jlist']);
    let alive = '';
    try {
      const arr = JSON.parse(proc);
      const on = arr.filter((p) => p.pm2_env?.status === 'online').map((p) => p.name);
      alive = `进程在线 ${on.length}/${arr.length}：${on.join('、')}`;
    } catch { /* 忽略 */ }
    return [
      memText,
      swapText,
      `磁盘：${diskLine.replace(/\s+/g, ' ')}`,
      `运行：${dayPart.trim()}，负载 ${load}`,
      alive,
    ].filter(Boolean).join('\n');
  }

  const spec = READONLY[what];
  if (!spec) {
    return `不认识这个查询：${what}\n能查的有：status、${Object.keys(READONLY).join('、')}`;
  }
  try {
    const out = execFileSync(spec.cmd, spec.args, {
      encoding: 'utf8',
      timeout: 3000,
      maxBuffer: 1024 * 512,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const text = String(out).trim();
    // pm2 jlist 是 JSON，压成一行一进程，省 token
    if (what === 'processes') {
      try {
        const arr = JSON.parse(text);
        const lines = arr.map((p) => {
          const mem = Math.round((p.monit?.memory || 0) / 1024 / 1024);
          return `${p.name}: ${p.pm2_env?.status} ${mem}MB 重启${p.pm2_env?.restart_time}次`;
        });
        return `进程列表：\n${lines.join('\n')}`;
      } catch {
        /* 解析失败就返回原文 */
      }
    }
    return text.slice(0, 800) || '（命令没有输出）';
  } catch (e) {
    const msg = String(e.stderr || e.message || e).slice(0, 200);
    return `查询失败：${msg}`;
  }
}

/* 执行工具调用，返回给模型看的结果文本 */
async function runTool(name, args, ctx) {
  const log = ctx.log || (() => {});

  if (name === 'say_lines') {
    const arr = (Array.isArray(args?.lines) ? args.lines : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    if (!arr.length) return '没有要发的内容（lines 是空的）';
    if (!ctx.sendLines) return '当前场景不支持连发消息';
    const n = await ctx.sendLines(arr);
    if (log) log(`连发 ${n} 条`);
    return `已连续发出 ${n} 条消息。`;
  }

  if (name === 'draw') {
    const html = String(args?.html || '').trim();
    if (!html) {
      // 常见原因：模型输出的 html 被 max_tokens 截断了，参数变成空。
      // 明确告诉它，别让它以为工具坏了。
      return '画图失败：html 参数是空的。请把完整的 HTML 写进 html 参数里重试（不要只传 content）。';
    }
    const r = render.render(html, {
      width: args?.width,
      height: args?.height,
      bg: args?.bg,
      content: args?.content,
      slug: args?.content,
      author: '小鱼',
    });
    if (!r.ok) return `画图失败：${r.error}`;
    if (log) log('画图:', r.name, r.bytes + 'B');
    try {
      await ctx.sendPic(r.name);
      return `画好了，已发给老板：${r.name}（${Math.round(r.bytes / 1024)}KB）。存进图片库了，以后说「再发一次」我能找到。`;
    } catch (e) {
      return `图渲染好了（${r.name}），但发送失败：${e.message}`;
    }
  }

  if (name === 'list_pics') {
    const n = Math.min(Math.max(Number(args?.limit) || 20, 1), 100);
    const pics = render.listPics(n);
    if (!pics.length) return '图片库还是空的，一张图都没画过。';
    const d = (ms) => {
      const t = new Date(ms);
      return `${t.getMonth() + 1}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    };
    return `图片库共 ${pics.length} 张（新的在前）：\n` +
      pics.map((p) => `  ${p.file}  (${d(p.mtime)}, ${Math.round(p.size / 1024)}KB)`).join('\n');
  }

  if (name === 'send_pic') {
    const q = String(args?.name || '').trim();
    const found = render.findPic(q);
    if (!found) return `图片库里没找到「${q}」。可以用 list_pics 看看有哪些。`;
    try {
      await ctx.sendPic(path.basename(found));
      return `已发送：${path.basename(found)}`;
    } catch (e) {
      return `发送失败：${e.message}`;
    }
  }

  if (name === 'server_status') {
    if (log) log('查服务器:', JSON.stringify(args || {}));
    return serverStatus(args);
  }

  if (name === 'list_memes') {
    try {
      const files = fs.readdirSync(MEME_DIR).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f));
      return `表情库共 ${files.length} 张：\n${files.join('\n')}`;
    } catch (e) {
      return `读取表情库失败：${e.message}`;
    }
  }

  if (name === 'search_chatlog') {
    if (log) log('回查记忆:', JSON.stringify(args || {}));
    return searchChatlog(args);
  }

  if (name === 'qq_send_image') {
    const paths = Array.isArray(args?.paths) ? args.paths : [];
    if (!paths.length) return '没有指定要发的图片路径';

    // 只发第一张（一次最多 1 张）
    const p = String(paths[0]);
    // 安全检查：必须在表情库目录内
    const base = path.basename(p);
    const full = path.join(MEME_DIR, base);
    if (!fs.existsSync(full)) {
      const files = (() => {
        try { return fs.readdirSync(MEME_DIR).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)); } catch { return []; }
      })();
      return `找不到这张图：${p}\n表情库里有的文件（前 20 个）：\n${files.slice(0, 20).join('\n')}\n请用上面的文件名重试。`;
    }
    if (paths.length > 1) log(`模型一次要发 ${paths.length} 张，只发第一张`);
    try {
      await ctx.sendSticker(base);
      return `已发送表情包：${base}`;
    } catch (e) {
      return `发送失败：${e.message}`;
    }
  }

  return `不认识的工具：${name}`;
}

module.exports = { TOOLS, runTool, MEME_DIR, CHATLOG, PICS, searchChatlog, serverStatus, READONLY };
