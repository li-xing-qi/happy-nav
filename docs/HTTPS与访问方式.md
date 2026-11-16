# HTTPS 与访问方式

> 本文只回答一个问题：**这个站点现在跑在 `http://` 上，怎么变成 `https://`，以及不同做法各自要付什么代价。**
>
> 面向的是**部署者**（把站跑起来的那个人），不是使用者。全文不改一行代码，只涉及域名、证书、反向代理、端口和几条运维命令。
>
> 结论先给：**日常自用，EasyTier 够；要让别人也能用，上「域名 + Caddy」；只想先跑通给别人看一眼，Cloudflare Tunnel 最快。** 自签证书基本不用考虑。

---

## 一、先说清楚要解决什么

不是「浏览器地址栏有个锁好看」，是三个层次的问题，危险程度递增。

### 1.1 被看

`http://` 是明文。同一个 WiFi 下（咖啡馆、酒店、学校宿舍、公司网络），同网段的人用抓包工具就能读到：

- 聊天内容、上传的文件名和内容
- 请求里的 Cookie / 令牌
- 你填在页面上的房间号

运营商和上游网络也能看到，只是他们通常不关心。**在公共 WiFi 上，这条是现实风险，不是理论风险。**

### 1.2 被改（比被看更危险）

中间人不仅能读，还能**往返回给你的页面里插东西**。这一步不需要破解任何密码，只要能转发流量：

- 插一段 JS，读你页面里的数据，再发到别处
- 替换下载的脚本，把页面变成钓鱼页
- 篡改 AI 回复、篡改牌局结果

**"被看"最多泄露信息，"被改"等于对方在你的浏览器里执行代码，用的是你的身份。** 这是必须上 HTTPS 的真正理由。

### 1.3 顺带：没有 HTTPS，麦克风就用不了

页面的语音录制走 `navigator.mediaDevices.getUserMedia`，浏览器只在**安全上下文**（HTTPS，或 `localhost` / `127.0.0.1` 这类本机地址）下才给麦克风。

所以：

| 访问方式 | 麦克风 |
|---|---|
| 电脑上 `http://127.0.0.1:3000` | ✅ 给（本机地址视为安全上下文） |
| 手机访问 `http://192.168.1.10:3000` | ❌ 不给 |
| 手机壳里填 `http://任意地址` | ❌ 不给，页面会自己提示改用「文件」发音频 |
| 任意 `https://` 地址 | ✅ 给 |

也就是说，**HTTPS 不只是加密，它是语音功能的前置条件**。想用语音，除了换 HTTPS 没别的办法。

### 1.4 先看清现状

上任何方案之前，先确认端口都在哪：

```bash
ss -ltnp | grep -E ':(3000|3080|6199|11435|11010)'
curl -I http://127.0.0.1:3000     # 站点活着吗
```

这些端口的含义见第五节的端口表，别急着改。

---

## 二、A：Cloudflare Tunnel（最快，约五分钟）

不用域名、不用备案、不用开端口。本机跑一个 `cloudflared`，它主动连出去，Cloudflare 给你一个 `https://` 地址。

### 2.1 装

```bash
# Debian / Ubuntu
curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

### 2.2 试跑（quick tunnel）

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

终端会打印一行：

```
https://xxx-yyy-zzz.trycloudflare.com
```

这个地址就是你的站点，证书由 Cloudflare 出，浏览器认。手机上填这个地址，语音能用了。

按 `Ctrl+C` 就断。

### 2.3 代价（这几条要认下来）

| 代价 | 具体表现 |
|---|---|
| 域名是临时的 | quick tunnel 每次重启换一个域名，`xxx-yyy-zzz` 那串是新生成的。发出去的链接过一天就失效 |
| 大陆访问速度一般 | Cloudflare 免费线路在国内会抽，时快时慢，晚高峰尤其明显 |
| 内容对 Cloudflare 可见 | TLS 在 Cloudflare 边缘终止，它到你家这一段是重新加密的。技术上它能看到明文（它的隐私条款怎么说不改变这个事实） |
| 依赖第三方 | 它挂了你的站就挂；你的流量要经过别人的网络 |
| 要固定域名得自己做 Named Tunnel | 见下 |

### 2.4 要固定域名：Named Tunnel

用自己的域名（域名要先托管到 Cloudflare）：

```bash
cloudflared tunnel login                 # 浏览器里授权一次
cloudflared tunnel create happy-nav      # 记下输出的 UUID
cloudflared tunnel route dns happy-nav nav.example.com
cloudflared tunnel run happy-nav
```

配置建议放 `/etc/cloudflared/config.yml`（`tunnel create` 会把凭据写在 `~/.cloudflared/`，它自己会打印路径，照抄进 `credentials-file`；要长期跑就把那个文件也挪到 `/etc/cloudflared/`）：

```yaml
tunnel: happy-nav
credentials-file: /etc/cloudflared/<UUID>.json
ingress:
  - hostname: nav.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

要开机自启：

```bash
sudo cloudflared --config /etc/cloudflared/config.yml service install
sudo systemctl status cloudflared
journalctl -u cloudflared -f
```

（`service install` 装的是 systemd 单元，它会记住你给的 `--config`。如果手动放到别处，用这条命令显式指定，否则服务启动后读不到配置、报 "no ingress rules"。）

**Named Tunnel 仍然不需要备案，也不需要在安全组开 80/443**（流量是主动外连的）。代价同上，只是域名固定了。

### 2.5 会踩的坑

- **站点要绑 `127.0.0.1` 或 `0.0.0.0`**：`cloudflared` 从本机访问，`HOST=0.0.0.0`（默认）或 `127.0.0.1` 都行。如果之前为了安全把 `HOST` 改成了虚拟网卡 IP，这里会连不上。
- **流式回复别被缓冲**：站点聊天用 SSE（`text/event-stream`）。多数情况下代理不缓冲，但如果出现「回复一个字一个字憋到最后一起出来」，就是中间某层在攒包。站点的流式接口已经发了 `X-Accel-Buffering: no`，用 nginx 的话还要确认 `proxy_buffering off`。
- **别把 quick tunnel 地址当长期入口**：它变了以后，安卓壳里存的地址就废了，得手动改。

**适合**：先跑通、给朋友临时用、自己在外面试一下。**不适合**：长期给一群人用。

---

## 三、B：域名 + Caddy（要长期用就走这条）

Caddy 是个反向代理，特色是**自动申请并自动续期 Let's Encrypt 证书**，配置两三行。它把 `https://你的域名` 的请求转给本机的 `127.0.0.1:3000`。

这条路有三种落地形态，**代价完全不同，先选形态再动手**。

### 3.1 先装 Caddy（三种形态都一样）

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
caddy version
```

装完自带 systemd 服务（服务名 `caddy`），配置在 `/etc/caddy/Caddyfile`。

### 3.2 形态一：正规备案（大陆服务器，最稳但最慢）

**流程**：

1. 域名实名认证（注册商处，通常几小时到一天）
2. 解析 A 记录到服务器公网 IP
3. **ICP 备案**：大陆服务器的 80/443 未备案会被拦（访问会看到拦截页，不是你的站）
4. 备案通过后，Caddy 自动签证书

备案通过前，域名解析到大陆服务器也打不开——80/443 会被拦，**这一步绕不过去**。流程与耗时以**腾讯云备案指引**为准，通常一到三周，以实际为准。

**Caddyfile**：

```
nav.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
```

就这四行。Caddy 起来后自己去申请证书、自动配 HTTP→HTTPS 跳转、自动续期。

**放行端口**（腾讯云控制台 → 安全组 → 入站规则）：

- TCP 80（Caddy 默认走 HTTP-01，需要它；也可以用 443 上的 TLS-ALPN-01 兜底）
- TCP 443

服务器本机防火墙也检查一下：

```bash
sudo ufw status
sudo ufw allow 80,443/tcp     # 只在开了 ufw 时需要
```

**启动与验证**：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile   # 先验语法，别直接重启
sudo systemctl reload caddy                          # 改完配置用 reload，不用 restart
journalctl -u caddy -f                               # 看证书申请过程，第一次通常要等十几秒
curl -I https://nav.example.com                      # 期望 200
```

**验证证书确实是有效证书**（不是自签、没过期）：

```bash
openssl s_client -connect nav.example.com:443 -servername nav.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

期望 `issuer` 是 `Let's Encrypt` 一类的 CA，`notAfter` 在三个月内。

**代价 / 坑**：

- **时间成本是它的主要代价**：备案通常一到三周，期间你什么都做不了
- 域名每年几十元，服务器另算
- 备案信息（主体、负责人、联系电话）要真实，后续可能核验
- 证书续期失败最常见的三个原因：安全组把 80 关了、DNS 改了指向、域名过期

**续期失败怎么查**：

```bash
journalctl -u caddy | grep -i -E 'obtain|renew|challenge|error' | tail -50
sudo caddy validate --config /etc/caddy/Caddyfile
```

Caddy 会在证书到期前约 30 天开始尝试续期，失败会一直重试并写日志。**只要 80/443 通、DNS 没动，基本不用管。** deb 包安装时证书文件默认落在 `/var/lib/caddy/.local/share/caddy/certificates/`，可以 `ls` 看看有没有。

### 3.3 形态二：非标端口 + DNS-01（不备案，约半小时能上线）

**不备案，就不用 80/443。** 让 Caddy 监听 `:8443` 这类高位端口，证书走 **DNS 挑战**（往你的 DNS 里写一条 TXT 记录来证明域名是你的），完全不碰 80。

**关键前提**：Caddy 官方二进制**不含 DNS 插件**，要自己加：

```bash
# 方式一：加装插件（Caddy 2.7+，会改写二进制文件，需要 root）
sudo caddy add-package github.com/caddy-dns/cloudflare

# 方式二：自己编
xcaddy build --with github.com/caddy-dns/cloudflare
```

插件名形如 `github.com/caddy-dns/<厂商>`，用哪家域名商就装哪个，以 Caddy 官网列出的清单为准。**装之前先去域名商后台申请一个 API Token，只给「改 DNS 记录」权限**，别用主账号密钥。

**Caddyfile**：

```
nav.example.com:8443 {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
```

把 token 放进 systemd 环境（别写进 Caddyfile）：

```bash
sudo systemctl edit caddy
# 在打开的编辑器里写：
#   [Service]
#   Environment="CF_API_TOKEN=你的token"
sudo systemctl restart caddy
```

**放行端口**：安全组放行 **TCP 8443**（80 不用开）。本机：`sudo ufw allow 8443/tcp`。

**访问**：`https://nav.example.com:8443`

**验证**：

```bash
curl -I https://nav.example.com:8443
openssl s_client -connect nav.example.com:8443 -servername nav.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -dates
journalctl -u caddy -f      # 看 DNS 挑战是否成功
```

**代价 / 坑**：

- **地址必须带端口**，`https://nav.example.com:8443`。少写 `:8443` 浏览器会去 443 然后连不上。发链接给别人要说清楚
- **HTTPS 和麦克风都不受端口影响**：`https://...:8443` 一样是安全上下文，一样能用语音。端口号不参与安全上下文判定
- DNS 挑战给的 token 权限要最小化，它能改你整个域的解析
- 部分校园网、企业网、以及一些手机网络的代理会封非标端口，别人可能连不上
- 有些场景（比如想让别人扫个二维码就打开）带端口会难看，这是它的隐性成本

### 3.4 形态三：把机器放香港 / 海外

不用备案，正常用 80/443，Caddy 配置和形态一完全一样，只是机器不在大陆。

**代价**：

- 大陆访问延迟高（通常 30–80ms 起，看线路），丢包和晚高峰抖动比国内机器明显
- 带宽贵，小机器常给 1M 或按量计费，传图片、语音会慢
- 机房线路差异极大（CN2、BGP、普通国际），买之前问清楚回程

**适合**：使用者本来就在海外，或者只是少量人在用。**不适合**：把国内一群人当主力用户。

### 3.5 三种形态怎么选

| 你的情况 | 选 |
|---|---|
| 有大陆服务器 + 愿意等备案 | 形态一 |
| 有大陆服务器 + 不想备案 + 能接受地址带端口 | 形态二 |
| 没有大陆服务器 / 用户本来就在海外 | 形态三 |

---

## 四、C：EasyTier 组网（手机端要自己装客户端）

EasyTier 把家里的机器、云服务器、手机组成一个虚拟内网。手机加入同一网络后，直接访问：

```
http://10.144.144.1:3000
```

### 4.1 它确实解决了一部分问题

虽然是 `http://`，但流量在**加密隧道**里跑，公共 WiFi 下的其他人抓不到。所以「被看」这一层，它是有效的。

### 4.2 但它不是 HTTPS

| 项 | 结果 |
|---|---|
| 别人能用吗 | ❌ 只有装了 EasyTier 并加入同一网络的设备能用。你朋友点链接打不开 |
| 语音能用吗 | ❌ 还是 `http://`，浏览器照样不给麦克风 |
| 需要域名 / 证书 | 不需要，也不涉及 |
| 需要在安全组开端口 | 视拓扑，中继端口 11010 要通（见第五节） |

**明确一点**：EasyTier 是「让我的设备互相看见」，不是「让所有人都能访问」。想给别人的手机用，还是得走 A 或 B。

### 4.3 前置条件

**作者本人机器上已经装了 EasyTier，别人要用得自己装。** 这不是随仓库分发的组件（原因见 [可选组件.md](可选组件.md) 第二节的许可证说明），装法：

```bash
# 到 https://github.com/EasyTier/EasyTier/releases 下载对应架构的包
# 或用官方安装脚本（以 root 运行，先看清内容再执行）
```

手机端装 EasyTier 客户端，用同一套 `--network-name` / `--network-secret` 加入。

### 4.4 坑

- **`HOST` 必须是 `0.0.0.0`**（默认就是）。如果你为了上反代把 `.env` 的 `HOST` 改成了 `127.0.0.1`，EasyTier 的 `10.144.144.1:3000` 就连不上了——回环地址只认本机。**两种方式不能同时用一种 `HOST`**，见第五节第 2 条
- 手机端开了「全局路由」会把访问域名的流量也带进隧道，能通但更慢，建议改成只路由内网段
- 虚拟 IP 是 EasyTier 分配的，重装客户端或换网络名可能变，别把它硬编码进脚本或客户端配置

---

## 五、跟 EasyTier 冲不冲突？——端口表

这是最容易担心的地方，直接给事实。

### 5.1 谁在监听什么

| 服务 | 监听地址 | 干什么 | 要不要对外 |
|---|---|---|---|
| 站点 `server.js` | `0.0.0.0:3000` | 网页 + API + SSE | 经反代对外，**不要直连暴露** |
| dsh（与鱼大脑） | `10.144.144.1:3080` | 让 AI 能动手干活 / Web 控制台 | **不对外** |
| dsh 的 OneBot 反向 WS | `127.0.0.1:6199` | 桥接连 dsh | **不对外** |
| ds-proxy | `127.0.0.1:11435` | 内部 LLM 代理（把 dsh 的账号 token 转成 OpenAI 兼容接口） | **绝不对外** |
| Caddy / nginx | `0.0.0.0:80`、`0.0.0.0:443`（或 `:8443`） | 终止 TLS、反代到 3000 | 对外 |
| EasyTier 中继 | `tcp://0.0.0.0:11010`、`udp://0.0.0.0:11010` | 组网中继与直连 | 视拓扑需要 |

EasyTier 在这台机器上的虚拟 IP 是 `10.144.144.1`，中继监听 `tcp://0.0.0.0:11010` 与 `udp://0.0.0.0:11010`。

补一句：**dsh 绑在哪个地址取决于你 `dsh web --host` 填什么**。上面表里是作者机器上的实际状态（绑虚拟 IP），仓库 `DEPLOY.md` 6.3 的示例写的是 `--host 127.0.0.1`。填哪个都不改变结论——**它不该对外**。

### 5.2 五条结论

**1. 端口不冲突。** Caddy/nginx 用 80/443（或 8443），EasyTier 用 11010，站点 3000，dsh 3080，OneBot 6199，ds-proxy 11435。**各走各的，没有一个重叠。** 装 Caddy 不需要停 EasyTier，反之亦然。

**2. 反代目标写 `127.0.0.1:3000`，不要写 `10.144.144.1:3000`。**

理由：Caddy 和站点在同一台机器上，走回环最短、最稳；写虚拟 IP 等于绕出去再绕回来，而且**虚拟网卡没起来时反代会直接 502**。EasyTier 掉线不该导致你的网站挂掉。

**3. 路由可能绕远。** 如果手机端 EasyTier 开了「全局路由」，你访问 `https://nav.example.com` 的流量可能被带进隧道再出去，**能通但更慢**。建议客户端改成只路由内网段，别抢默认路由。

**4. 证书跟域名绑定，跟网络拓扑无关。** 证书按域名签发，跟你用不用 EasyTier 不冲突。但反过来：**用 `https://10.144.144.1` 这种 IP 访问拿不到有效证书**——公共 CA 不给裸 IP 签，浏览器必然报错。

**5. 顺序建议：先把 B 跑通，再开 EasyTier。** 两者共存没有冲突，但先上 HTTPS 能让你分清问题出在「证书/端口」还是「隧道/路由」——否则两个变量一起动，出事很难定位。

### 5.3 一个必须注意的取舍：`HOST`

| 你想要的访问方式 | `.env` 里 `HOST` 该填 |
|---|---|
| 走 Caddy 反代（推荐） | `127.0.0.1` —— 只有本机能连站点，外面只能经反代进 |
| 走 EasyTier 直连 `10.144.144.1:3000` | `0.0.0.0`（或直接填 `10.144.144.1`） |

**两个都要？** 那就保持 `HOST=0.0.0.0`，靠**安全组 + 反代**控制谁能进来，别指望 `HOST` 同时干两件事。真要收紧，就在反代层加鉴权（Basic Auth 就行），这比改 `HOST` 更可控。

---

## 六、D：自签证书（不推荐，但说清为什么）

自己用 `openssl` 签一张证书，装到服务器上：

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout key.pem -out cert.pem -days 365 \
  -subj "/CN=nav.local"
```

浏览器会看到「不安全」，点「继续前往」也能用。**问题在手机上。**

### 6.1 安卓从 7.0 起不信用户装的 CA

Android 7.0（API 24）之后，App **默认只信任系统预置的 CA**，不信任用户自己装进「用户证书」里的。WebView 跟随 App 的信任配置，所以：

- 每台设备都要手动装一遍 CA
- 装完还得**改 App 的网络安全配置**（`network_security_config` 里声明信任 user 证书），否则装了也没用
- 这套配置要改安卓壳的源码重新打包，不是「填个地址」能解决的

### 6.2 还有其他麻烦

- 证书里必须有 **SAN**（不只是 CN），用 IP 访问还得 `subjectAltName=IP:10.144.144.1`，写错了照样报错。OpenSSL 1.1.1 以后可以这样一次写对：

  ```bash
  openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 \
    -subj "/CN=nav.local" \
    -addext "subjectAltName=DNS:nav.local,IP:10.144.144.1"
  ```

- 证书有过期时间，一年后全套再来一遍
- 一个设备配错，表现是「有时能开有时报错」，排查成本高

### 6.3 什么时候才考虑

- 完全离线、没有域名、也不打算给别人的内网环境
- 你只需要在**电脑浏览器**上点一下「继续前往」，不在意手机

**只要你想让手机（尤其安卓壳）正常用语音，就别走这条。** B 或 A 都比它省事。

---

## 七、四种方式对比

| 方式 | 成本 | 到手时间 | 要备案吗 | 别人能用吗 | 语音能用吗 | 大陆速度 | 主要代价 |
|---|---|---|---|---|---|---|---|
| **A. Cloudflare quick tunnel** | 免费 | 约 5 分钟 | 不用 | ✅ 能（发链接即可） | ✅ 能 | 一般，会抽 | 域名每次重启都变；TLS 在 CF 终止 |
| **A. Cloudflare Named Tunnel** | 免费 + 域名 | 约 20 分钟 | 不用 | ✅ 能 | ✅ 能 | 一般 | 依赖 CF；域名要托管过去 |
| **B1. 域名 + Caddy（正规备案）** | 域名 + 服务器 | 备案通常一到三周，以实际为准 | **要** | ✅ 能 | ✅ 能 | 好（大陆机器） | 时间成本；备案信息要真实 |
| **B2. 域名 + Caddy（非标端口 + DNS-01）** | 域名 + 服务器 | 约 30 分钟 | 不用 | ✅ 能（地址带 `:8443`） | ✅ 能 | 好（大陆机器） | 地址必须带端口；部分网络封非标端口 |
| **B3. 域名 + Caddy（香港/海外）** | 域名 + 海外服务器 | 约 30 分钟 | 不用 | ✅ 能 | ✅ 能 | 一般到差，看线路 | 延迟与带宽；国际线路质量差异大 |
| **C. EasyTier 组网** | 免费 | 约 10 分钟 | 不用 | ❌ 不能（别人得装客户端） | ❌ 不能（还是 http） | 取决于隧道 | 只适合自己设备；不解锁麦克风 |
| **D. 自签证书** | 免费 | 半小时起，且每台设备都要弄 | 不用 | ❌ 基本不能（对方要先装 CA） | ❌ 安卓壳拿不到（不信用户 CA） | 好 | 每台设备装 CA + 改 App 配置，易错 |

**怎么读这张表**：A 和 B 三种形态都能解决问题，区别只在你要不要花备案的时间、以及地址带不带端口；**C 和 D 都过不了「语音能用」这一栏**，只要你在意手机上的语音，这两条就不用看了。

---

## 八、安全清单（有 HTTPS 之后要顺手做的）

上 HTTPS 只解决了传输，**不等于站点变安全了**。这几条一起做：

### 8.1 安卓壳可以关掉明文流量

现在 `clients/android/AndroidManifest.xml` 里 `android:usesCleartextTraffic="true"` 是开着的——**因为要访问 `http://` 地址**。有了 HTTPS 入口，可以把它改成 `false`（或删掉这个属性），系统层面就禁止明文 HTTP 了。

前提：壳里填的地址必须是 `https://`。改了以后填 `http://` 会直接连不上，这是预期行为。

### 8.2 站点没有账号系统，房间号不是密码

知道房间号就能进，能聊天、能上传、能让 AI 说话花你的额度。**放公网必须：**

- `.env` 里设 `AUTH_TOKEN`（一个随机长串，别用生日）—— 注意它只管破坏性接口，不锁聊天和页面，真正的门禁靠下面两条（收紧 HOST + 反代加 Basic Auth）
- `.env` 里 `HOST=127.0.0.1`，只让反代进（取舍见 5.3）
- 反代层再加一道 Basic Auth，挡住 `/api/chat` 这类公开代理接口
- 限制 `/api/chat` 的调用频率 —— **本项目没做这一项，得在代理层加**

生成一个随机令牌：

```bash
openssl rand -hex 24
```

### 8.3 三个端口绝对不要对外

| 端口 | 为什么 |
|---|---|
| `3080`（dsh） | 它能让 AI 跑命令、改文件。暴露出去等于把 shell 交出去 |
| `6199`（OneBot 反向 WS） | 机器人消息通道，伪造消息不用费什么劲 |
| `11435`（ds-proxy） | 内部凭据转换层，它替你拿着上游 token |

安全组里**只放行 80/443（或 8443）+ 你的 SSH 端口**，其余全关。检查：

```bash
ss -ltnp | grep -E ':(3080|6199|11435)'
# 期望只看到 127.0.0.1 或 10.144.144.1，不该是 0.0.0.0
```

### 8.4 SSH 只留密钥登录

```bash
# /etc/ssh/sshd_config
PasswordAuthentication no
PermitRootLogin prohibit-password
```

```bash
sudo sshd -t && sudo systemctl reload ssh
```

改之前**先确认密钥能登**，别把自己锁在外面。

### 8.5 数据本身

聊天记录、上传文件、记忆都在本机 `data/` 和 `workspace/`。**HTTPS 不保护服务器上的静态文件**——机器被进了一样全丢。定期复制走（见 [部署与维护手册.md](部署与维护手册.md)）。

---

## 九、最短路径

如果你只想知道「我现在该干什么」：

1. **只自己用，手机在同一个组网里** → 什么都不用做，EasyTier 访问 `http://10.144.144.1:3000` 就行。**语音除外**，想用语音就得往下走。
2. **想用语音 / 想给朋友用，先试一下** → Cloudflare quick tunnel，约五分钟。域名会变，当作试用。
3. **想长期用** → 域名 + Caddy。有大陆机器就按 3.2 或 3.3 走，没有就 3.4。
4. **不管走哪条** → 第八节的安全清单逐条过一遍。

---

相关文档：[部署与维护手册.md](部署与维护手册.md)（结构与运维）、[接入dsh.md](接入dsh.md)（与鱼通道）、[可选组件.md](可选组件.md)（EasyTier 与 dsh 的许可证与分发问题）、仓库根目录 [DEPLOY.md](../DEPLOY.md)（从零部署）。
