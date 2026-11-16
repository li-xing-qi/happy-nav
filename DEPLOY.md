# 部署手册（写给 AI 和人）

> **给 AI 的说明**：这是一份流程文档，不是介绍。按顺序做：
> ① 读第 0、1 节，把访问方式和五个问题问清楚 → ② 用第 2 节选档位 → ③ 只做对应档位的步骤 → ④ 每步都跑验收命令，不通过就不要往下走。
> 遇到第 7 节的症状，先照表排查，不要乱改代码。第 10 节写了「现在还没做好的」，不要向用户承诺那里面的东西。

---

## 0. AI 先拿到的三样东西

用户把仓库丢给你时，通常只给一句「帮我装好」。开工前确认这三样，缺一样就先要：

1. **登录方式**：SSH 的地址 / 端口 / 用户名 + 密码或密钥（本机部署则不需要）
2. **权限**：能不能 `sudo`（装 Node、加 swap、开端口都要）
3. **边界**：能不能改防火墙、要不要放公网、有没有域名

拿到后先跑这几行，把机器底细摸清楚（只读，不改任何东西）：

```bash
nproc; free -h; df -h /; cat /etc/os-release | head -2; node -v 2>/dev/null || echo "no node"
```

`free -h` 的 Swap 一行如果是 0，且内存 ≤ 2G，先做第 3.2 节加 swap 再继续——否则后面会出现「进程莫名重启」的假故障。

> 密码只用于登录，**不要写进任何文件、命令历史或仓库**。能用临时密钥就用密钥，装完让用户改密码。

---

## 1. 先问用户五件事

不要一上来就装。这五个答案决定后面所有步骤。

| # | 问什么 | 为什么问 | 影响 |
|---|---|---|---|
| 1 | 装在本机还是服务器？系统是什么？内存多大？有没有 swap？ | 内存决定能不能上 dsh；没 swap 的 2G 机器会随机被杀进程 | 第 2 节选档、第 3.2 节 |
| 2 | 有没有大模型接口？（DeepSeek API Key / 本地 Ollama / 都没有） | 没有就只装网站，AI 玩法自动降级，不会报错 | A 档还是 B 档 |
| 3 | 要不要「与鱼」那种能自己动手干活的 AI？（需要登录 DeepSeek 账号） | 这一档要多跑一个 dsh 进程，约 300MB | C 档 |
| 4 | 要不要放公网？有域名吗？ | 放公网必须加反向代理和鉴权；房间号本身不是密码 | 第 6.4 节 |
| 5 | 谁是「老板」？（QQ 号 / 昵称） | 人设、记忆、权限都围绕这一个用户 | `.env` 与工作区 |

问完再动手。用户含糊时按「先最小可用」处理：先 A 档跑起来，再逐档加。

---

## 2. 三档方案：先选档，再动手

实测数据来自一台 **2 核 2G / Debian 13 / Node 24** 的机器（2026-11 全量运行状态，RSS）：

| 进程 | 作用 | 内存 |
|---|---|---|
| `server.js` | 网站本体（导航 / 万象牌 / 五子棋 / 心有灵犀 / 聊天室页面） | ~87 MB |
| `agent-bot/index.js` | AI 陪玩（聊天室陪聊、卡牌队友、五子棋对手、心有灵犀） | ~111 MB |
| `agent-bot/yufish.js` | 与鱼桥：把网页房间接到 dsh | ~77 MB |
| `ds-proxy` | 把 dsh 的账号 token 转成 OpenAI 兼容接口（只有 C 档需要） | ~64 MB |
| `dsh web` | 与鱼的大脑（能自己跑命令、改文件的 agent） | ~297 MB |

**五个进程合计约 636 MB**；再加系统自身（journald、云监控等）约 160 MB，常驻约 800 MB。这台机器 1.9G 内存 + 4G swap + 1G zram，`free -h` 报 available 约 850 MB、zram 上常驻约 380 MB。这不是富余，是「刚好够」——所以下面对内存的说法都按实测写，不按「理论上能跑」写。

| 档位 | 装什么 | 内存需求 | 说明 |
|---|---|---|---|
| **A 网站** | `server.js` | 512 MB 可跑，1G 舒服 | 零第三方依赖，无 AI 也能玩全部棋牌 |
| **B 网站 + AI 陪玩** | A + `agent-bot` | 1G 起，2G 稳 | 需要一个 OpenAI 兼容接口 |
| **C 全量（含与鱼）** | B + `dsh` + `ds-proxy` + 桥 | 2G + **swap 必须** | dsh 一个人 300MB，没 swap 会随机 OOM |

**直说**：2 核 2G 是这一整套的**下限**，不是推荐配置。dsh 是最大头，只想要「网站 + 会聊天的 AI」的话 B 档在 1G 小机器上很轻松，不必上 C 档。

---

## 3. 通用前置

### 3.1 Node.js ≥ 18

Debian / Ubuntu：

```bash
# NodeSource 官方源（Debian 12/13、Ubuntu 22/24 都适用）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
node -v      # 期望 v20.x 或更高
```

不想加源就用 nvm，或系统自带的 `nodejs`（只要 ≥18 都能跑）。**不要用 Node 16 及以下**——内置 `fetch` 和 `WebSocket` 都没有。

Windows：装 Node 20 LTS 即可跑 A/B 档；C 档（dsh）在 Windows 上**未验证**，别承诺。

### 3.2 swap：2G 机器必须做

没有 swap 时，内存一紧内核会直接杀进程，表现是「进程莫名其妙重启、`pm2 list` 的 restarts 数一直涨」。这是整套部署里最常见的「玄学故障」。

```bash
# 2G 机器给 4G swap（磁盘够的话）
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h          # 期望 Swap 一行不是 0
```

想更抗抖可以再加 zram（Debian：`sudo apt install zram-tools`）。

### 3.3 时区（影响「明天」「几点」这类回答）

```bash
sudo timedatectl set-timezone Asia/Shanghai
```

---

## 4. A 档：只有网站（约 3 分钟）

```bash
git clone https://github.com/li-xing-qi/happy-nav.git
cd happy-nav
cp .env.example .env          # 只改 PORT / HOST 就够
bash deploy.sh --check        # 环境 + 语法自检，只读，不启动
bash deploy.sh --daemon       # 后台跑起来（有 pm2 用 pm2，没有用 nohup）
```

验收：

```bash
curl -s http://127.0.0.1:3000/api/health   # 返回 JSON，含 ok:true
```

浏览器打开 `http://<机器IP>:3000` 应该能看到导航页。棋牌玩法不需要 AI 也能玩。

> 数据都在仓库目录下的 `data/` 与 `workspace/`。**升级前先备份这两个目录**，其它都是代码。

---

## 5. B 档：加 AI 陪玩

### 5.1 填 `.env`

```bash
# 任选一种：官方 API / 本地 Ollama / 任何 OpenAI 兼容网关
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-xxxxxxxx
LLM_MODEL=deepseek-chat
```

> 变量名是 `LLM_*`。早期版本用过 `DEEPSEEK_*`，现在两个都认，但**新部署统一用 `LLM_*`**。填完必须重启进程，光改文件不重启等于没改。

### 5.2 装并起 agent-bot

```bash
cd agent-bot && npm install --omit=dev && cd ..

# 站点必须在跑。A 档若已用 deploy.sh --daemon 起过（pm2 名字是 happy-nav），直接用，别再起第二个
pm2 list | grep -E 'happy-nav|site' || pm2 start server.js --name site

pm2 start agent-bot/index.js --name agent-bot
pm2 save
```

**两个坑**：① 顺序不能反——agent-bot 启动时会连站点，站点没起就 `ECONNREFUSED`；反了就先起站点，再 `pm2 restart agent-bot`。② 别把站点起两份，否则第二个会 `EADDRINUSE` 反复重启。

### 5.3 验收

```bash
node memory/selftest.js           # 期望 6/6 通过
node memory/verify-semantic.js    # 期望 38/38 通过
node agent-bot/verify-tools.js    # 期望 30/30 通过（工具通道）
node agent-bot/verify-mood.js    # 期望 25/25 通过（好感度/心情）
pm2 list                          # site / agent-bot 都是 online
```

然后进「聊天室」房间说一句话，几秒内应该有回复。没回复看第 7 节。

---

## 6. C 档：加与鱼（dsh）

dsh 是「能自己动手」的那一层，也是唯一需要登录账号的组件。完整细节在 [`docs/接入dsh.md`](docs/接入dsh.md)，这里只给顺序和验收点，别重复读。

### 6.1 装 dsh 并登录

```bash
npm i -g @deepseek-ai/dsh
dsh --version            # 开发时验证的是 0.2.1-rc.5

# 首次必须在**交互式终端**里跑（挂 pm2 看不到授权提示）
dsh --profile web        # 按提示打开授权地址；完成后 Ctrl+C 退出
ls -l ~/.dsh/.credentials.yaml   # 权限 600，密钥级文件，不要提交、不要分享
```

### 6.2 配 OneBot 反向 WebSocket

在 `~/.dsh/profiles/web/cordis.patch.yml` 的 `dsh-onebot` 条目里配 `mode: reverse`、`port: 6199`、`accessToken`、`botQQ`、`adminUsers`、`requireMention: false`、`workspacePath`。字段含义见 `docs/接入dsh.md` 第 5 节。

### 6.3 起 dsh 与桥

```bash
# dsh 在 pm2 下可能立刻退出（缺 TTY），用 script 包一层最稳：
pm2 start /usr/bin/script --name dsh -- -qfc "dsh web --host 127.0.0.1 --port 3080 --no-open" /root/dsh-web.log

# 桥：BOT_QQ / OWNER_QQ 填数字 ID，否则桥不启动
pm2 start agent-bot/yufish.js --name yufish
```

可选但强烈建议：装记忆工具插件，让与鱼和网页里是同一套记忆（写约定、记事实、查、撤）。

```bash
dsh plugin --profile web add file:$PWD/integrations/dsh-tool-memory
# 再把 dsh-tool-memory 加进 ~/.dsh/profiles/web/package.json 的 dsh.profile.bundles
dsh --profile web --dump-config | grep -A1 'id: tool-memory'   # 能看到才算挂上
pm2 restart dsh
```

### 6.4 要放公网的话

默认**没有用户系统**：知道房间号就能进。放公网至少做两件事：

1. 反向代理 + HTTPS（Caddy 最省事：`caddy reverse-proxy --from 你的域名 --to 127.0.0.1:3000`）
2. 破坏性接口带令牌（`.env` 的 `AUTH_TOKEN`），并把 `HOST` 设成 `127.0.0.1` 只让代理进

不要把 3000 / 3080 / 6199 直接暴露在公网。SSH 也别用密码登录（把 `PasswordAuthentication` 关掉，只留密钥）。

### 6.5 验收

```bash
ss -ltn | grep -E ':(3000|3080|6199)'   # 三个都在监听
pm2 list                                 # site / agent-bot / yufish / dsh 全 online
node memory/audit.js list                # 能看到生效中的约定（含 id）
```

然后在与鱼房间说一句「约定：以后打牌都先清对面的护盾」，再看 `node memory/audit.js list` 里有没有多一条。**模型说「记下了」但列表里没有 = 假确认**，插件没挂上，去看 dsh 日志。

---

## 7. 坑清单（按症状查）

| 症状 | 根因 | 怎么处理 |
|---|---|---|
| 改了 `.env` 完全没反应 | 没重启进程；或变量名写成了别的 | `pm2 restart all`；确认用的是 `LLM_*` |
| `ECONNREFUSED 127.0.0.1:3000` | 启动顺序反了，agent-bot 比站点先起 | 先起站点，再 `pm2 restart agent-bot` |
| AI 像失忆，人设只有几百字 | 工作区没初始化，读不到 `AGENTS.md` | 现在启动会自动补；确认 `WORKSPACE_DIR` 指向的目录里有 `AGENTS.md` |
| 说了约定，也回了「记下了」，但下局不遵守 | **幽灵规则**：写进去了但注入端看不见（`sessionId` 或 `game` 对不上） | `node memory/audit.js list` 看有没有；把各进程的工作区/房间号统一，别一个用 `/root/qq-workspace` 一个用仓库内 `workspace/` |
| 与鱼里同一条被记两遍 / 只留一条 | 桥和 dsh 插件都在写 | 只留一个写入点：插件负责写，桥只负责注入 |
| dsh 重启后所有插件都不见了 | `- id/name` 在 patch 里是「覆盖已有条目」，不是新增 | 新增必须写 `- insert: [ {id, name} ]` |
| dsh 启动即崩、日志报双实例 | 同一个插件文件挂载了两次 | 只留一条 `insert` |
| 进程隔几小时莫名重启，restarts 一直涨 | 内存不够、没有 swap，被内核杀 | 按 3.2 加 swap；`pm2 start ... --max-memory-restart 400M` |
| `EADDRINUSE` | 端口被占（3000/3080/6199/11435） | `ss -ltnp \| grep <端口>` 找到占用者，改 `.env` 的 `PORT` 或 dsh 的 `port` |
| 语音不朗读 | `TTS_ENABLE` 默认是 0（开启会把文本发到微软在线服务） | 需要就装 `edge-tts` 并设 `TTS_ENABLE=1`，同时告诉用户这不再是纯本地 |
| 升级 dsh 后记忆工具报错 | 插件里 `defineTool` 的导入路径变了 | 设 `DSH_TOOLS_MODULE=<dsh 安装目录>/node_modules/@deepseek-ai/dsh-tools/lib/index.js` |

---

## 8. 验收清单（交付前逐条跑）

```bash
node -v                                   # ≥ 18
curl -s localhost:3000/api/health          # ok:true
node memory/selftest.js                    # 6/6
node memory/verify-semantic.js             # 38/38
node agent-bot/verify-tools.js             # 30/30（B 档起）
node agent-bot/verify-mood.js              # 25/25（好感度/心情）
pm2 list                                   # 该起的都 online，restarts 不持续增长
free -h                                    # available 别长期低于 150MB
```

C 档额外三条：

```bash
ss -ltn | grep 6199                        # dsh 在监听
dsh --profile web --dump-config | grep -A1 'id: tool-memory'
tail -3 ~/.pm2/logs/yufish-out.log         # 期望「DSH OneBot 已连接」
```

---

## 9. 回滚与停机

```bash
bash deploy.sh --stop        # 停站点（pm2 或 nohup 都覆盖）
pm2 delete all && pm2 save   # 全部停掉
```

- 升级前备份两个目录：`data/`（房间消息、上传文件）与 `workspace/`（人设、长期记忆、表情库）。回滚就是把这两个目录换回去 + `git checkout <上一个 commit>`
- 记忆相关文件的位置（容易搞混，专门写清）：
  - `workspace/MEMORY.md` —— 长期事实，**改代码不动它**
  - `workspace/memory/data/adapters.json` —— 约定（规则），只归档不物理删除
  - `workspace/AGENTS.md` —— 人设
- 想彻底重来：删 `workspace/memory/data/`，保留 `MEMORY.md` 与 `AGENTS.md`。删 `MEMORY.md` 就是真的失忆

---

## 10. 现在还没做好的（别向用户承诺）

写在这里是为了不吹牛。以下都是**已知**的：

1. **没有用户系统**。房间号只是「知道就能进」，不是身份认证。多人用必须自己加反代 + 鉴权。
2. **L2→L3 浓缩不会自动跑**。`memory/compact.js` 可以直接执行（先 `node memory/compact.js --dry-run` 预览，它不会写文件），但仓库里没挂调度器。想要「昨天的事自动压成摘要」，自己加 cron：
   `0 4 * * * cd /path/happy-nav && node memory/compact.js`
   跑完它会打印 `MEMORY.md md5 before/after 一致=true`，可以据此确认没动长期记忆。
3. **没有并发保护**。数据是 JSON 文件，多进程同时写靠原子替换，不是数据库。单人自用没问题，别当多租户服务。
4. **判重口径不统一**（4 处各自实现）。同一句话可能在两处被判成不同结果，属于待整理项。
5. **AI 质量与速度完全取决于模型**。短回复常见 2~8 秒；带工具调用或长文会更久。本地小模型更慢，也更容易不遵守约定。
6. **表情库 / 图片库不含素材**。仓库不带图，`workspace/memes/` 空着就没有表情可发，需要自己放。
7. **测试只有三个自检脚本**（6 + 38 + 30 项），没有覆盖率，也没有 CI。
8. **dsh 版本耦合**。记忆工具插件在 `0.2.1-rc.5` 上验证过，升级后要重新确认一次。
9. **Windows 只验证过 A/B 档**。dsh 与权限行为在 Windows 上未验证。
10. **QQ 真号接入未在本文覆盖**。`yufish.js` 是 OneBot 客户端（连 dsh 的反向 WS 服务端），要接真 QQ 还需要 NapCat 之类的实现，内存另算。

---

## 11. AI 执行清单

每完成一项打个勾，别跳步：

- [ ] 五个问题问完，档位选定，用户确认
- [ ] `node -v` ≥ 18；2G 机器已加 swap 并 `free -h` 确认
- [ ] 时区已设 Asia/Shanghai
- [ ] 仓库已 clone，`.env` 已从 `.env.example` 复制并按档位填写
- [ ] `bash deploy.sh --check` 通过，站点 `curl /api/health` 返回 ok
- [ ] （B 档）`agent-bot` 已 `npm install --omit=dev` 并**在站点之后**启动
- [ ] （B 档）四个自检脚本全过：6/6、38/38、30/30、25/25
- [ ] （C 档）dsh 已登录，`6199` 在监听，插件出现在 `--dump-config` 里
- [ ] （C 档）在与鱼说一句约定，`node memory/audit.js list` 能看到
- [ ] 已告知用户：房间号不是密码；要不要放公网由他决定
- [ ] 已告知用户第 10 节的限制，特别是「浓缩不会自动跑」和「没有用户系统」
- [ ] `data/` 与 `workspace/` 的备份位置已交代清楚
