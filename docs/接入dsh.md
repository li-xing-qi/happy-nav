# 接入 dsh：让「与鱼」里的 AI 能动手干活

> 本文是 [`可选组件.md`](可选组件.md) 的操作篇：讲清楚 dsh 到底怎么装、怎么配、怎么接到与鱼房间里。
>
> **重要**：dsh 是第三方软件（MIT），本仓库**不分发**它。你按本文自己安装，许可证责任在你自己的部署上。

---

## 0. 接了和没接，差别在哪

| 能力 | 只有站点 | 接上 dsh |
|---|---|---|
| 与鱼里聊天 | ✅ 可以（需要模型 API） | ✅ 可以 |
| 让 AI **读文件** | ❌ | ✅ 它真的去读 |
| 让 AI **改代码 / 写文件** | ❌ | ✅ 它真的去改 |
| 让 AI **执行命令** | ❌ | ✅ 比如 `ls`、`git status` |
| 让 AI **画图** | ❌ | ✅ 生成 HTML/图片发回来 |
| 记忆（四层） | ✅ 站点自带 | ✅ 还能读它自己改过的文件 |
| 响应速度 | 秒级 | **10~20 秒**（要跑工具，正常） |

**一句话**：不接 dsh，与鱼是个聊天室；接了 dsh，与鱼是个能替你干活的助手。

---

## 1. 整体结构

```
浏览器 / 手机
    │  HTTP
    ▼
与鱼页面（yu.html）  ←── 站点自带
    │  POST /api/yu/send
    ▼
房间服务（yu.js）  ←── 站点自带，把消息存成房间数据
    │  GET /api/yu/state（每 1.5 秒轮询）
    ▼
桥接脚本（bridge/yufish-bridge.js）  ←── 本仓库提供
    │  OneBot 反向 WebSocket（ws://127.0.0.1:6199/ws）
    ▼
dsh（第三方）  ←── 你自己装
    │  调用模型 + 执行工具
    ▼
模型服务（DeepSeek 账号 / 你自己的配置）
```

**为什么要有桥接这一层**：dsh 只有两种入口——网页界面、OneBot 反向 WS。网页要人操作，做不了「房间里自动回复」；反向 WS 是标准协议，所以桥接脚本冒充一个 OneBot 客户端连进去。

---

## 2. 前提

| 项 | 要求 |
|---|---|
| Node.js | 18 或更高（推荐 22） |
| 系统 | Linux / macOS 实测可用；Windows 未验证 |
| dsh 账号 | **DeepSeek 账号**。dsh 用账号设备授权，不是填 API Key |
| 网络 | 能访问 npm 源；首次登录需要浏览器 |

---

## 3. 安装 dsh

```bash
npm install -g @deepseek-ai/dsh
dsh --version
# 期望输出类似 0.2.1-rc.5
```

> 用 `@deepseek-ai/dsh` 官方源。装完不要急着跑，先看下一步。

---

## 4. 首次登录（设备授权）

dsh 第一次启动会要求登录 DeepSeek 账号。**必须在交互式终端里跑**（不能挂在 pm2 后面，否则看不到授权提示）：

```bash
dsh --profile web
```

它会打印一段提示和授权地址。用浏览器打开那个地址、完成授权，之后凭据会存在：

```
~/.dsh/.credentials.yaml    # 权限 600，内含登录凭据
```

**这个文件是密钥级的东西**，不要提交、不要分享、不要放进任何仓库。丢了就重新登录一次。

授权完成后先按 `Ctrl+C` 退出，接下来配 OneBot。

---

## 5. 配置 OneBot 反向 WebSocket（关键一步）

dsh 的配置是「分层补丁」结构。你只需要在**你自己的补丁层**里加一段，不要去改 dsh 内部的 bundle。

编辑：

```
~/.dsh/profiles/web/cordis.patch.yml
```

加入这一段（YAML 顶层是数组，注意缩进）：

```yaml
- id: dsh-onebot
  name: 'dsh-onebot-qq'
  config:
    mode: reverse            # 反向模式：dsh 当服务端，桥接主动连进来
    host: 127.0.0.1          # 只监听本机，不要改成 0.0.0.0
    port: 6199
    accessToken: ''          # ← 换成你自己的随机串，见下方生成方法
    botQQ: '10000'           # ← 任意数字，虚拟的机器人 QQ 号
    workspacePath: ''        # 留空 = 用 dsh 进程的工作目录（见 §9 权限说明）
    requireMention: false    # 与鱼是私聊，不需要 @
```

**生成 accessToken**（不要用弱口令，反向模式会拒绝空值）：

```bash
openssl rand -hex 24
```

把输出填进 `accessToken`。**这个串桥接那边也要用，两边必须完全一致。**

### 各字段含义

| 字段 | 作用 | 注意 |
|---|---|---|
| `mode` | `reverse` = dsh 监听、桥接来连；`forward` = 反过来 | 接入与鱼用 `reverse` |
| `host` | 监听地址 | **必须 `127.0.0.1`**，改成 `0.0.0.0` 等于把 shell 暴露给公网 |
| `port` | 监听端口 | 默认 6199，改了就同步改桥接的 `OB_URL` |
| `accessToken` | 连接鉴权 | 空值会导致 reverse 模式启动失败 |
| `botQQ` | 虚拟机器人号 | 桥接侧 `BOT_QQ` 要一致 |
| `workspacePath` | 文件操作沙箱根目录 | 见 §9 |
| `requireMention` | 是否需要 @ 才响应 | 与鱼是私聊，设 `false` |

---

## 6. 启动 dsh

前台跑（看日志方便）：

```bash
dsh --profile web
```

期望看到 OneBot 在 6199 上监听。验证：

```bash
ss -ltn | grep 6199
# 期望：127.0.0.1:6199  LISTEN
```

长期运行建议用 pm2：

```bash
pm2 start "dsh --profile web" --name dsh
pm2 save
```

> ⚠️ 如果用 pm2，先把 §4 的登录做完。登录需要交互，pm2 捕获不到提示。

---

## 7. 部署桥接脚本

```bash
# 1. 复制到你想放的位置
cp -r bridge ~/yufish-bridge
cd ~/yufish-bridge

# 2. 装依赖（只有一个 ws）
npm install

# 3. 配置环境变量（推荐用文件，别写在命令行里，否则会进 shell 历史）
cat > .env <<'EOF'
YU_BASE=http://127.0.0.1:3000
YU_ROOM=0000
YU_BOT_PID=dsh-fish
YU_BOT_NAME=小鱼
OB_URL=ws://127.0.0.1:6199/ws
OB_TOKEN=把第 5 步生成的 accessToken 粘这里
BOT_QQ=10000
OWNER_QQ=你的QQ号
POLL_MS=1500
EOF
chmod 600 .env

# 4. 启动
set -a; . ./.env; set +a
node yufish-bridge.js
```

### 环境变量说明

| 变量 | 默认 | 作用 |
|---|---|---|
| `YU_BASE` | `http://127.0.0.1:3000` | 与鱼站点地址 |
| `YU_ROOM` | `0000` | 房间号 |
| `YU_BOT_PID` | `dsh-fish` | 桥在与鱼里的身份标识，**不能和真人重复** |
| `YU_BOT_NAME` | `小鱼` | 会话里显示的名字 |
| `OB_URL` | `ws://127.0.0.1:6199/ws` | dsh 的 OneBot 地址 |
| `OB_TOKEN` | **必填** | 与 dsh 的 `accessToken` 完全一致 |
| `BOT_QQ` | **必填** | 与 dsh 的 `botQQ` 一致 |
| `OWNER_QQ` | **必填** | dsh 只把这个 `user_id` 当管理员 |
| `POLL_MS` | `1500` | 轮询间隔，越小越实时、越费 CPU |

长期运行：

```bash
pm2 start yufish-bridge.js --name yufish-bridge
pm2 save
```

---

## 8. 验证：三步确认真的通了

**第 1 步：桥接连上 dsh 了吗**

桥接日志应出现：

```
[bridge] 连接 dsh OneBot… ws://127.0.0.1:6199/ws
[bridge] dsh OneBot 已连接
[bridge] 已进入与鱼房间 0000（昵称 小鱼），起始 id = N（不转发历史）
```

若卡在「连接 dsh OneBot…」不动 → 看 §10 第 1 条。

**第 2 步：消息能过去吗**

打开与鱼页面，发一句「你好」。桥接日志应出现：

```
[bridge] → dsh  [text] 你好
```

**第 3 步：回复能回来吗**

等 10~20 秒（dsh 在跑工具），与鱼里应出现回复。桥接日志：

```
[bridge] → 与鱼 文本: ...
```

三步都过，就接好了。

---

## 9. 权限：为什么它改不了我的文件

dsh 的文件操作被限制在一个「沙箱根目录」里。默认 `workspacePath: ''` 表示用 dsh 进程的工作目录。

如果你发现它报 `Permission denied`：

- **想让它改站点代码**：把 dsh 的启动目录设成站点父目录，或把 `workspacePath` 显式设成那个目录
- **只想让它读写某个子目录**：把 `workspacePath` 设成那个子目录，别给整个 `/`

⚠️ **不要把它设成 `/`**。dsh 能执行命令，等于把 shell 交给了一个 LLM，边界越小越安全。

---

## 10. 常见问题

**1. 桥接一直连不上（日志停在「连接 dsh OneBot…」）**

按顺序查：

```bash
ss -ltn | grep 6199            # dsh 在监听吗
curl -s http://127.0.0.1:3000/api/health   # 站点活着吗
```

- dsh 没起 → 先起 dsh
- 端口不通 → 检查 `port` 与 `OB_URL` 是否一致
- 连上就断（code=1006）→ **accessToken 不一致**，两边重新对一遍

**2. 消息过去了，但没有回复**

- dsh 日志里有没有报错？模型登录是否还有效（`~/.dsh/.credentials.yaml` 是否过期）
- `requireMention: true` 时会要求 @，与鱼里没法 @，必须设 `false`
- 复杂任务本来就要 10~20 秒，别急着判定失败

**3. 与鱼里出现重复消息**

dsh 断线重连后会把「以为没发出去」的消息补发一遍。桥接脚本已经做了两层防护（消息 id 去重 + 相同文本 8 秒内跳过）。如果仍重复，检查心跳是否正常——`HEARTBEAT_MS` 默认 20 秒，太大或太小都可能出问题。

**4. 图片发不过去**

桥接支持 `base64://` 和 `http(s)://` 两种图片来源。本地文件路径不支持（dsh 在另一台机器上时读不到）。

**5. 想换端口**

改 dsh 的 `port`，同时改桥接的 `OB_URL`。两处必须一致。

**6. Windows 能用吗**

桥接脚本本身是纯 Node，理论上可以；dsh 的路径与权限行为在 Windows 上**未验证**。

---

## 11. 安全提醒（必读）

接上 dsh 等于给了一个 LLM **在你机器上执行命令的权限**。这不是危言耸听，是它的设计目的。

最低限度做这几件事：

- [ ] `host` 保持 `127.0.0.1`，**永远不要**改成 `0.0.0.0`
- [ ] 不要给 6199 端口做任何公网映射
- [ ] `accessToken` 用随机串，别用生日/手机号
- [ ] `.env` 和 `.credentials.yaml` 权限设 600，且永远不进仓库
- [ ] 用非 root 用户跑 dsh（如果条件允许）
- [ ] `workspacePath` 尽量小，不要给 `/`
- [ ] 定期看 dsh 日志，确认它只做了你让它做的事

---

## 附：这套东西的许可证

| 组件 | 许可证 | 你要注意什么 |
|---|---|---|
| 本仓库（含桥接脚本） | PolyForm Noncommercial 1.0.0 | 个人自由使用；商用需授权 |
| `@deepseek-ai/dsh` | MIT | 随便用，保留声明 |
| `ws`（桥接依赖） | MIT | 随便用 |
| EasyTier（如需异地组网） | LGPL-3.0 | 见 [`可选组件.md`](可选组件.md) |
