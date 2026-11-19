# dsh-tool-memory

给 [dsh](https://github.com/deepseek-ai/deepseek-harness) 加六个工具：四个管记忆，两个管嗓子。

| 工具 | 干什么 |
|---|---|
| `save_rule` | 记一条约定（`once` 只这一步 / `session` 本局 / `game` 以后一直） |
| `remember_fact` | 记一条长期事实（写进 `MEMORY.md` 的「关于老板」段） |
| `list_rules` | 列出当前生效的约定（含 id） |
| `revoke_rule` | 按 id 精确撤销一条 |
| `speak` | 把一句话合成语音（带情绪、可换音色、`sing=true` 才是唱），返回路径交给 `qq_send_voice` |
| `my_voice` | 看现在走哪家 TTS / 哪个音色 / 还能选哪些；传 id 就换默认嗓子 |

后两个工具依赖第三方的 `dsh-plugin-tts`，链路、配置字段、额度、唱歌为什么必须另配 key，
全在 **[docs/语音.md](../../docs/语音.md)**。

## 为什么需要它

与鱼的回复是 dsh 生成的，不是 `agent-bot` 的循环，所以聊天室/棋局里的那四个工具它看不见。没有这个插件时，桥接脚本只能在转发前「旁路裁决」——每条消息多一次模型调用，而且确认语和落盘是两条线，会出现嘴上说「记下了」实际没写。

## 它不做什么

不重写任何判断规则。守卫和落盘全在 `memory/` 层：

- 缺有效上下文（房间/对局）→ 不落库
- 抱怨、放弃、拖延、反话（「这局打不过，以后再说吧」）→ 不落库，返回原因
- 作用域不在白名单 → 收敛成 `session`，绝不默认长期化
- 撤销必须给 id，不猜、不批量

判断权在模型，否决权在代码。

## 装

```bash
dsh plugin --profile web add file:/path/to/happy-nav/integrations/dsh-tool-memory
```

然后把 `dsh-tool-memory` 加进 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`，重启 dsh。

完整步骤、环境变量、验证方法见仓库文档 [`docs/接入dsh.md`](../../docs/接入dsh.md) 第 10 节。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `QQ_MEM_DIR` | 仓库根，找不到则 `/root/qq-workspace` | 记忆层目录，需含 `memory/bridge.js` |
| `QQ_AGENT_BOT` | 仓库根下 `agent-bot`，找不到则 `/root/agent-bot` | 需含 `lib/remember.js` |
| `QQ_MEM_SESSION` | `0000`（也认 `YU_ROOM`） | 必须与桥接房间号一致，否则规则会变成「写进去但注入不到」的幽灵规则 |
| `DSH_TOOLS_MODULE` | 自动探测 | `defineTool` 所在模块，装到非标准路径时用 |
