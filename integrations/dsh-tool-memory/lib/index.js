// 与鱼（dsh 侧）的记忆工具
//
// 为什么要有这个插件：与鱼的回复是 dsh 生成的，不是 agent-bot 的循环，
// 所以聊天室/棋局里那四个工具它看不见。以前只能靠 yufish.js 在转发前
// 「旁路裁决」——每条消息多一次模型调用，而且确认语和真实写入是两条线，
// 会出现嘴上说「记下了」实际没写。装了这个插件，四条通道就是同一套语义。
//
// 与 agent-bot/tools.js 的关系：判断标准、守卫、落盘全在 memory/ 层，
// 这里只是把同一批能力包装成 dsh 的模型工具，不重写任何规则。
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

/* defineTool 要从 dsh 自带的包里拿。
 * 插件装在 profile 的 node_modules 时，裸名解析不到 dsh 安装目录里的包，
 * 所以先试裸名、再退回标准安装路径（可用 DSH_TOOLS_MODULE 覆盖）。
 * 用动态 import 是为了让「找不到就换一条路」成为可能——静态 import 失败就整个插件崩。 */
const DSH_TOOLS_FALLBACK = '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
const defineTool = await (async () => {
  const candidates = [
    process.env.DSH_TOOLS_MODULE,
    '@deepseek-ai/dsh-tools',
    DSH_TOOLS_FALLBACK,
  ].filter(Boolean);
  for (const spec of candidates) {
    try {
      const m = await import(spec);
      if (m && typeof m.defineTool === 'function') return m.defineTool;
    } catch { /* 试下一个 */ }
  }
  throw new Error('[tool-memory] 找不到 @deepseek-ai/dsh-tools，可用 DSH_TOOLS_MODULE 指定入口文件');
})();

/* dsh 是 ESM，记忆层是 CommonJS —— 用 createRequire 桥一下。
 *
 * 目录判定顺序（仓库布局优先，独立工作区兜底）：
 *   1. QQ_MEM_DIR / QQ_AGENT_BOT 环境变量
 *   2. 插件所在仓库根（本文件在 <repo>/integrations/dsh-tool-memory/lib/）
 *   3. /root/qq-workspace ← 现网这种「站点与工作区分离」的部署
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
function pickRoot(envKey, probe, fallback) {
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv;
  if (existsSync(path.join(REPO_ROOT, probe))) return REPO_ROOT;
  return fallback;
}
const MEM_DIR = pickRoot('QQ_MEM_DIR', path.join('memory', 'bridge.js'), '/root/qq-workspace');
const AGENT_BOT = process.env.QQ_AGENT_BOT
  || (existsSync(path.join(REPO_ROOT, 'agent-bot', 'lib', 'remember.js')) ? path.join(REPO_ROOT, 'agent-bot') : '/root/agent-bot');
const req = createRequire(`${MEM_DIR}/`);

let bridge = null;
try { bridge = req('./memory/bridge.js'); } catch (e) { console.warn('[tool-memory] 记忆层不可用：', e.message); }

let rememberLib = null;
try { rememberLib = createRequire(`${AGENT_BOT}/`)('./lib/remember.js'); } catch (e) { console.warn('[tool-memory] 记住模块不可用：', e.message); }

/* 心情：规则和数值由 prompt 提供，这里只给她一个「记一笔」的入口 */
let moodLib = null;
try { moodLib = createRequire(`${AGENT_BOT}/`)('./lib/mood.js'); } catch (e) { console.warn('[tool-memory] 心情模块不可用：', e.message); }

/* sessionId 必须与 yufish.js 注入时用的那个一致（房间号），
 * 否则写进去的 session 档规则注入端看不见，又变成幽灵规则。 */
const SESSION_ID = String(process.env.QQ_MEM_SESSION || process.env.YU_ROOM || '0000');
const CTX = { channel: 'yu', game: '', sessionId: SESSION_ID, room: SESSION_ID };

const SCOPE_CN = { once: '只这一步', session: '本局内', game: '以后一直' };

const TEXT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { text: { type: 'string', required: true } },
  },
  render: (_args, value) => [{ type: 'text', text: String((value && value.text) || '') }],
};

const name = 'tool-memory';
const inject = ['tools'];

function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'save_rule',
    description:
      '把老板立的一条「约定」记下来，以后自动遵守。' +
      '只在老板**明确立规矩**时调用：「约定：…」「以后都…」「每次…」「默认…」「这局先…」「别…」「改成…」。' +
      '**不要**为抱怨、放弃、拖延、反话、感叹调用 —— 例如「这局打不过，以后再说吧」不是约定，不要调用。' +
      '规则正文要重写成一句独立的祈使句，不要带「记住」「约定」这些字样。',
    parameters: {
      text: { type: 'string', required: true, description: '规则正文，一句话，例如「出牌优先打带格挡效果的牌」' },
      scope: {
        type: 'string',
        required: true,
        enum: ['once', 'session', 'game'],
        description: 'once=只影响下一步；session=本局 / 本房间内有效（拿不准就用它）；game=以后一直有效',
      },
    },
    output: TEXT_OUTPUT,
    execute(args) {
      if (!bridge || typeof bridge.writeRule !== 'function') return { text: '未记录：记忆层没加载起来' };
      const r = bridge.writeRule({ text: args && args.text, scope: args && args.scope }, CTX);
      if (!r || !r.ok) return { text: `未记录：${(r && r.reason) || '写入被拒绝'}` };
      return { text: `已记下 [${r.id}]（${SCOPE_CN[r.scope] || r.scope}）：${r.text}。以后按这个来。` };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'remember_fact',
    description:
      '把老板的一条长期事实写进长期记忆（他本人、家人、习惯、日程、偏好、常提的人和事）。' +
      '他说「记住…」或明确告知一件以后还用得上的事时调用。' +
      '**不要**为闲聊、感叹、临时安排、反问调用，也不要把他随口一句抱怨当成事实。',
    parameters: {
      fact: { type: 'string', required: true, description: '一条独立可读的事实，一句话，不带「记住」这类触发词' },
    },
    output: TEXT_OUTPUT,
    execute(args) {
      const fact = String((args && args.fact) || '').trim();
      if (fact.length < 2) return { text: '要记的内容是空的，没有写。' };
      if (!rememberLib || typeof rememberLib.remember !== 'function') return { text: '未记录：记住模块没加载起来' };
      const r = rememberLib.remember(fact);
      if (!r || !r.ok) return { text: `写入失败：${(r && r.message) || '未知错误'}` };
      if (r.skipped) return { text: `没有写入：${r.message}` };
      return { text: `已写进长期记忆：${fact}` };
    },
  }));

  /* feel 的可选参数按 moodLib 的导出动态拼：
   * 插件有可能在「心情模块没加载起来」的情况下运行（上面 try/catch 会吞掉），
   * 那种时候不能塞一个 undefined 进 schema —— dsh 的 schema 校验报错会让整个工具注册失败，
   * 与鱼就连记心情的入口都没有了。所以有就加，没有就只留 delta/why。 */
  const feelParams = {
    delta: { type: 'number', required: true, description: '-12 ~ 12 的整数：正数=更亲近，负数=更疏远' },
    why: { type: 'string', description: '一句话理由，比如「他夸我今天回得好」「他叫我小傻鱼」' },
  };
  if (moodLib && Array.isArray(moodLib.MOOD_LABELS)) {
    feelParams.mood = {
      type: 'string',
      enum: moodLib.MOOD_LABELS,
      description: '你此刻的心情（6 小时内有效）。不传就沿用上一个',
    };
  }
  if (moodLib && Array.isArray(moodLib.FEEL_KINDS)) {
    feelParams.kind = {
      type: 'string',
      enum: moodLib.FEEL_KINDS,
      description: '这次是哪一类：陪着他、他报备日常、叫昵称、说想你、撩你、找你商量事、'
        + '一起玩、记得你说过的事；反过来的敷衍、失联、凶、越界、工具化。顺手标上，之后你能想起他今天做了什么',
    };
  }

  ctx.tools.register(defineTool({
    name: 'feel',
    description:
      '记下你此刻的感受（亲密度 + 心情）。日常陪着聊也算：他陪你说话、讲自己的日常、叫你昵称、'
      + '说想你、撩你、夸你、照顾你、找你商量事、一起玩、记得你说过的事，这些都往上调；'
      + '只回嗯哦、很久不来又不解释、凶你、玩笑开过头、只在要东西时找你，往下降。'
      + '不用等大事，也别一次给太满：日常小事 1~3，明显心动 4~8，一次最多 12。'
      + '顺手把心情（mood）和是哪一类（kind）一起报上来，之后你能想起他今天都做了什么。'
      + '不要在回复里提分数，也不要说「我的好感度是多少」。',
    parameters: feelParams,
    output: TEXT_OUTPUT,
    execute(args) {
      if (!moodLib || typeof moodLib.feel !== 'function') return { text: '记不了：心情模块没加载起来' };
      /* 第三参透传 mood / kind：与鱼是用户一直在用的通道，
       * 不透传的话「今天的账」在那边永远是空的（promptBlock 头行少一半信息）。 */
      const r = moodLib.feel(Number(args && args.delta), args && args.why, {
        mood: args && args.mood,
        kind: args && args.kind,
      });
      if (!r || !r.applied) return { text: '心情没有变化。' };
      return { text: r.applied > 0 ? '记下了，你现在对他更亲近了一点。' : '记下了，你现在有点疏远。' };
    },
  }));

  /* ============ 说话（带情绪） ============
   * 她本来就会自己调 edge-tts 发语音，但每次都用一个默认嗓子和默认语速，
   * 听起来是「朗读」不是「说话」。这里把情绪翻译成 edge-tts 的三个物理参数：
   *   语速（rate）+ 音调（pitch）+ 音色（voice）
   * 同一个模型、同一句话，语速差 29% 就是「开心」和「低落」的区别（实测 2.83s vs 3.65s）。
   *
   * 音色只用两个女声：晓晓（温暖，大多数时候）、晓伊（活泼，开心/得意时）。
   * 不给她更多嗓子，因为她是同一个人，不该今天一个声音明天一个。 */
  const VOICE_STYLE = {
    开心: { voice: 'zh-CN-XiaoyiNeural', rate: '+12%', pitch: '+16Hz' },
    得意: { voice: 'zh-CN-XiaoyiNeural', rate: '+8%', pitch: '+10Hz' },
    撒娇: { voice: 'zh-CN-XiaoxiaoNeural', rate: '-6%', pitch: '+26Hz' },
    黏人: { voice: 'zh-CN-XiaoxiaoNeural', rate: '-3%', pitch: '+18Hz' },
    低落: { voice: 'zh-CN-XiaoxiaoNeural', rate: '-18%', pitch: '-16Hz' },
    累了: { voice: 'zh-CN-XiaoxiaoNeural', rate: '-22%', pitch: '-10Hz' },
    生气: { voice: 'zh-CN-XiaoxiaoNeural', rate: '+6%', pitch: '+2Hz' },
    有点醋: { voice: 'zh-CN-XiaoxiaoNeural', rate: '+2%', pitch: '+7Hz' },
    平常: { voice: 'zh-CN-XiaoxiaoNeural', rate: '-2%', pitch: '+3Hz' },
  };
  /* 生成到她的工作区：QQ 的媒体发送有目录白名单，/tmp 不一定能发出去 */
  const VOICE_DIR = process.env.QQ_VOICE_DIR || '/root/qq-workspace/voice';

  /* ---------- 换个嗓子：交给 dsh-tts 插件去合成 ----------
   *
   * 为什么不是自己拼协议：老板选的 Breeze 是 ElevenLabs 风格
   * （POST {base}/text-to-speech/{voice_id}），小米 MiMo 是 OpenAI 风格，
   * 两套请求体完全不一样，而 key / baseUrl / model / voice_id 全在 config.json 里。
   * 插件自己知道该走哪家、该拼什么 body，这里只把「说什么、什么情绪、哪个嗓子」
   * 交给它 —— 两边协议各写一遍迟早会写歪。
   *
   * 为什么不是 127.0.0.1：dsh 只监听内网地址 10.144.144.1，本机回环连不上。
   *
   * target 传空字符串 = 只合成不发送（插件那边为此加了分支）。
   * 返回的 file 是插件 voice 目录里的绝对路径，直接交给 qq_send_voice。
   * 插件没起来 / 没配 key / 401 / 超时 → 一律退回本机 edge-tts，她照常能说话。
   */
  const TTS_SPEAK_URL = process.env.DSH_TTS_SPEAK_URL || 'http://10.144.144.1:3080/dsh-tts/speak';
  const TTS_TIMEOUT_MS = 25000;
  const TTS_CONFIG = process.env.DSH_TTS_CONFIG || '/root/.dsh/dsh-tts/config.json';
  const TTS_STYLE_NAME = { breeze: 'Breeze', openai: 'MiMo' };

  /** 插件现在配的是哪家。只用来把报错说清楚（Breeze 还是 MiMo 没配 key） */
  function ttsApiStyle() {
    try {
      const c = JSON.parse(readFileSync(TTS_CONFIG, 'utf8'));
      const s = String((c && c.tts && c.tts.apiStyle) || '').trim();
      return TTS_STYLE_NAME[s] ? s : 'breeze';
    } catch { return 'breeze'; }
  }

  /** 让插件合成，成功返回插件给的 {file, audioId, route, mode}；失败一律抛 */
  async function synthByPlugin(text, mood, voice) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TTS_TIMEOUT_MS);
    try {
      const r = await fetch(TTS_SPEAK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        /* target:'' = 只合成不发送；voice 传 null = 用配置里的默认音色 */
        body: JSON.stringify({ text, style: mood || null, voice: voice || null, target: '' }),
        signal: ctl.signal,
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        const why = (j && (j.error || j.message)) || '';
        throw new Error(`${TTS_STYLE_NAME[ttsApiStyle()] || '插件'} 合成失败 ${r.status}${why ? '：' + why : ''}`);
      }
      if (!j || j.ok === false || !j.file) throw new Error((j && j.error) || '插件没返回音频文件');
      return j;
    } catch (e) {
      /* AbortController 抛的是 AbortError，换成她看得懂的一句话 */
      if (e && (e.name === 'AbortError' || /abort/i.test(String(e.message)))) throw new Error('插件合成超时');
      /* fetch 连不上时 message 只有一句 "fetch failed"，真正的原因在 cause.code 里
       * （ECONNREFUSED = 插件没起来）。不把 code 带出来，这条报错就白记了。 */
      const c = e && e.cause;
      const code = c && (c.code || c.errno || String(c.message || '').slice(0, 40));
      if (code) throw new Error(`连不上插件（${code}）`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  ctx.tools.register(defineTool({
    name: 'speak',
    description:
      '把一句话说成语音，声音会跟着你的情绪变（快/慢/软/沉）。'
      + '想换个嗓子就自己挑，不用问用户：voice 填一个音色 id 就用那个嗓子，'
      + '填 auto 或不填就用配置里的默认音色。'
      + '合成走本机的语音插件（默认是 Breeze）；插件没配 key 或没起来时会自动退回本机的 '
      + 'edge-tts，照样有声音，别因为一次失败就不说话了。'
      + '生成音频后返回路径，你再调 qq_send_voice 把它发出去。'
      + '说人话：短、口语、别念标点，一次 30 字以内；别把整段回复念出来。',
    parameters: {
      text: { type: 'string', required: true, description: '要说的话，口语，30 字以内' },
      mood: {
        type: 'string',
        description: '你此刻的情绪：开心 / 得意 / 撒娇 / 黏人 / 低落 / 累了 / 生气 / 有点醋 / 平常',
      },
      voice: {
        type: 'string',
        description: '音色 id（Breeze 的 voice_id，原样透传给插件）；'
          + 'auto 或不填 = 用配置里的默认音色。想换声音自己挑一个，不用问用户',
      },
    },
    output: TEXT_OUTPUT,
    async execute(args) {
      const text = String((args && args.text) || '').trim().slice(0, 80);
      if (!text) return { text: '没内容可说。' };
      const moodKey = String((args && args.mood) || '');
      const want = String((args && args.voice) || '').trim();
      const voice = (!want || want === 'auto') ? '' : want;

      /* ① 先走插件（Breeze / 配置里选的那家）。
       * 插件把音频写在自己的 dsh-tts/voice 目录，但 qq_send_voice 只放行
       * mediaDir 和会话 cwd（/root/qq-workspace）——那个目录不在白名单里，
       * 直接把路径交出去会被拒。先复制一份到 VOICE_DIR 再返回。
       * 复制失败就往下走 edge-tts，保证还有声音。 */
      let note = '';
      try {
        const j = await synthByPlugin(text, moodKey, voice);
        const who = j.route || TTS_STYLE_NAME[ttsApiStyle()] || '';
        const tag = [moodKey || '平常', who, voice].filter(Boolean).join(' · ');
        mkdirSync(VOICE_DIR, { recursive: true });
        const dst = `${VOICE_DIR}/tts-${Date.now()}${path.extname(j.file || '') || '.wav'}`;
        copyFileSync(j.file, dst);
        return { text: `语音好了：${dst}（${tag}）。用 qq_send_voice 发出去。` };
      } catch (e) {
        note = String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 110);
      }

      /* ② 插件这条路不通 → 本机 edge-tts 顶上。情绪照旧翻译成语速/音调。 */
      const style = VOICE_STYLE[moodKey] || VOICE_STYLE['平常'];
      try {
        mkdirSync(VOICE_DIR, { recursive: true });
        const file = `${VOICE_DIR}/yu-${Date.now()}.mp3`;
        await execFileAsync('edge-tts', [
          '--voice', style.voice,
          /* 必须用 --rate=-18% 的等号形式：负数开头的值会被 argparse 当成选项 */
          `--rate=${style.rate}`,
          `--pitch=${style.pitch}`,
          '--text', text,
          '--write-media', file,
        ], { timeout: 25000 });
        return { text: `语音好了：${file}（${moodKey || '平常'}；${note}，先用本机 edge-tts 顶上）。用 qq_send_voice 发出去。` };
      } catch (e) {
        const msg = String((e && e.message) || e).slice(0, 120);
        return { text: `语音没生成出来：${msg}（插件那边：${note}）` };
      }
    },
  }));

  ctx.tools.register(defineTool({
    name: 'list_rules',
    description: '看现在有哪些约定还在生效。老板问「你记着我哪些规矩」，或要撤销但不知道 id 时调用。',
    parameters: {},
    output: TEXT_OUTPUT,
    execute() {
      if (!bridge || typeof bridge.listAdapters !== 'function') return { text: '查不了：记忆层没加载起来' };
      const list = bridge.listAdapters(CTX) || [];
      if (!list.length) return { text: '现在没有任何生效的约定。' };
      return {
        text: `当前生效 ${list.length} 条约定：\n`
          + list.map((r) => `  [${r.id}]（${SCOPE_CN[r.scope] || r.scope}）${r.text}`).join('\n'),
      };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'revoke_rule',
    description: '按 id 撤销一条约定。id 必须先由 list_rules 拿到，不许猜，也不许一句话批量撤好几条。',
    parameters: {
      id: { type: 'string', required: true, description: '约定 id，从 list_rules 的返回里取' },
    },
    output: TEXT_OUTPUT,
    execute(args) {
      const id = String((args && args.id) || '').trim();
      if (!id) return { text: '要给约定 id，先用 list_rules 查。' };
      if (!bridge || typeof bridge.revokeAdapter !== 'function') return { text: '撤不了：记忆层没加载起来' };
      const hit = bridge.revokeAdapter(id) || [];
      if (!hit.length) return { text: `没有找到生效中的 id=${id}，先用 list_rules 看看。` };
      return { text: `已撤销：${hit.map((r) => r.text).join('；')}` };
    },
  }));
}

export { name, inject, apply };
