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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  ctx.tools.register(defineTool({
    name: 'feel',
    description:
      '记下你此刻的感受变化（亲密度）。被夸、被照顾、一起玩得开心就往上调；被凶、被敷衍、被晾很久就往下降。' +
      '一次一般 3~8，最多 12。这是你自己的判断，不是命令——觉得没什么可变的就别调。' +
      '不要在回复里提分数，也不要说「我的好感度是多少」。',
    parameters: {
      delta: { type: 'number', required: true, description: '-12 ~ 12 的整数：正数=更亲近，负数=更疏远' },
      why: { type: 'string', description: '一句话理由，比如「他夸我今天回得好」' },
    },
    output: TEXT_OUTPUT,
    execute(args) {
      if (!moodLib || typeof moodLib.feel !== 'function') return { text: '记不了：心情模块没加载起来' };
      const r = moodLib.feel(Number(args && args.delta), args && args.why);
      if (!r || !r.applied) return { text: '心情没有变化。' };
      return { text: r.applied > 0 ? '记下了，你现在对他更亲近了一点。' : '记下了，你现在有点疏远。' };
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
