# 与鱼 · 手机壳（Android）

一个 21KB 的 APK：把你的站点装进一个干净的 WebView 壳里。**没有开屏广告、没有推荐流、没有第三方统计**，打开就是你自己的地址。

它不是什么：

- 不是第二个站点，页面、AI、记忆、聊天记录全在**你自己的服务器**上
- 不带模型 key，不连任何第三方服务
- 不能离线用——没网就是连不上

## 装

1. 从 [Releases](../../../releases) 下载 `happy-nav-1.3.apk`
2. 手机上点开安装（第一次要允许「未知来源」）
3. 首次启动填地址，例如 `http://192.168.1.10:3000` 或 `https://yu.example.com`
4. 地址只存在本机，重装才需要再填一次

## 填错了地址怎么改

四条路，按顺序试：

1. **首页 → 设置 →「手机壳」→「改地址」**（页面能打开时）。这一块只在 App 壳里出现：WebView 的 UA 带 `HappyNavShell/1.3`，普通浏览器会自动隐藏它。
2. **连不上时的那个页面**（不是浏览器默认的白屏）里有个「地址填错了？改地址」按钮，走 `happynav://settings`。网络层错误、主框架 4xx/5xx、SSL 证书错误都会跳到这个页面；这个按钮千万别删。
3. **长按返回键** → 直接弹出原生「修改地址」。它完全不依赖网页：地址返回 200 但不是与鱼页、或页面 JS 挂掉白屏时，错误页不显示、网页设置面板也不存在，这个手势是终极兜底。单次短按、两秒内两次退出和 1.2 完全一致，不受影响。
4. 实在找不到：系统设置 → 应用 → 与鱼 → 存储 → **清除数据**，下次启动就回到首次设置。地址只存在本机，清掉不心疼（聊天记录在服务器上，不在手机里）。

## 能做什么

| 能做 | 怎么做的 |
|---|---|
| 全屏、没有地址栏 | 一个 Activity + WebView |
| 返回键 = 网页后退 | 单次照旧后退 / 两秒内两次退出；长按 = 改地址（见下） |
| 发图 / 传文件 | 接了系统的文件选择器 |
| 下载 | 转给系统下载管理器，通知栏可见 |
| 退到后台还能收她的消息 | 1.4 起：前台服务自己守一条只读的 SSE，有新消息弹系统通知（见下） |
| 发语音（http 地址也行） | 1.4 起：原生 `MediaRecorder` 录、原生上传，绕开 WebView 的安全上下文限制（见下） |
| 点外链 | 同域名在壳里开，其它交给系统浏览器 |
| 连不上 | 不白屏，给「重新连接」页 |
| 改地址 / 刷新 / 清缓存 | 首页 → 设置 →「手机壳」（`happynav://settings` / `reload` / `clear-cache`）；页面打不开时用错误页的「改地址」按钮 |

## 做不到什么

- **浏览器里的语音录制仍然要 https**（页面用的是 `getUserMedia`，只在安全上下文下给麦克风）。
  但**壳里不受这个限制**：1.4 起录音改由原生 `MediaRecorder` 做，`http://` 地址照样能发语音，见下一节。
- **没有厂商推送。** 不接小米/华为/OPPO/vivo 的推送通道，所以**杀进程以后收不到**。
  1.4 的常驻服务能扛住「切走 / 从最近任务划掉 / 锁屏」，扛不住「强行停止」和
  国产 ROM 的深度清理；真要抗杀，得把 App 加进电池优化白名单。
- **通知不带快捷回复。** 现在只能点开进去回，通知栏直接回（`RemoteInput`）还没做。
- **http 是明文。** 壳里开了 `usesCleartextTraffic` 才能访问 `http://` 地址，公共 WiFi 下别人能抓包。自己的东西，自己权衡；在意就上 HTTPS。

想把地址换成 `https://`（顺带解锁语音、并且可以关掉 `usesCleartextTraffic`），做法与代价见 **[docs/HTTPS与访问方式.md](../../docs/HTTPS与访问方式.md)**。

## 后台消息通知（1.4）

用户要的效果：**在房间里发一句话 → 直接退出应用 → 她回复时通知栏弹出，像微信那样。**

### 为什么得有一个前台服务

网页里的实时消息是一条 SSE（`/api/yu/stream`），跑在 WebView 里。App 一退到后台，
WebView 被系统挂起，连接就断了——**所以退出去以后永远收不到消息**。
要在界面不存在时还握着这条连接，只能靠一个独立于 Activity 的组件：前台服务。

### 它是怎么接上的

```
yu.html 进房间成功
   └─ window.HappyNav.watchRoom(code, pid, lastId)      ← WebView 里注入的 JS 桥
        └─ MainActivity 存 roomCode/roomPid，申请通知权限（Android 13+）
             └─ NotifyService.startForegroundService()
                  └─ GET /api/yu/stream?code=…&bg=1&since=…
                       └─ 收到 msgs → 界面不在前台就 notify()
```

三个关键设计：

1. **`bg=1` 是只读订阅。** 它不校验 pid、不参与在线状态、不推 peer
   （服务端 `yu.js` 里 `const bg = u.searchParams.get('bg') === '1'`）。
   不这么做的话，后台守着一个「幽灵用户」，她会一直显示你在线，成员列表里还多一个人。
2. **`since` 从页面接过来。** 服务首次连接时用页面已经收到的最后一条 id 当起点，
   取它和服务自己存盘的进度里**较大的那个**——既不漏她刚发的回复，也不把看过的再弹一遍。
3. **前台不弹。** `NotifyService.foreground` 由 `MainActivity` 的 `onResume`/`onPause` 维护；
   你正看着屏幕的时候她说话，只更新进度，不打扰。

### 用户会看到什么

- **一条常驻的静默通知**「与鱼 · 守着消息，先别关我」（渠道 `yu_idle`，`IMPORTANCE_MIN`，不响不亮）。
  这是前台服务必须挂的，关掉它系统就会把服务收走。
- **她说话时**一条高优先级通知（渠道 `yu_msg`，`IMPORTANCE_HIGH`）：横幅 + 响铃 + 震动，
  标题是她的名字，正文是那句话（图片/语音/文件显示成 `[图片]` `[语音]` `[文件] xxx`）。
  多条合并成一条，右下角带未读数。
- **点通知**直接回到与鱼页；如果 App 是从冷启动起来的，会拼 `/yu?room=<code>` 直接进房间。
- **自己发的不弹**（按 pid 过滤），不然你发完退出，先收到自己的通知。

### 权限与限制

| 项 | 说明 |
|---|---|
| `POST_NOTIFICATIONS` | Android 13+ 运行时权限。**第一次进与鱼页时才申请**，不在启动时打断首屏。被拒过就不再弹系统框，改为 Toast 提示去设置里开 |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_DATA_SYNC` | Android 14 要求前台服务声明类型，否则启动即崩 |
| `stopWithTask="false"` | 从最近任务划掉也不让服务跟着死 |
| `START_STICKY` | 被系统杀掉后会尝试重启，重启时 intent 为 null，从 SharedPreferences 读房间号 |

已知边界：

- **断线重连**：读超时 70 秒（服务端每 20 秒一个 `: ping`，正常不会触发），
  失败后退避 3s → 6s → 12s … 最多 60s。easytier 掉线再回来，最多一分钟内自己接上。
- **杀进程就没了**。强行停止 App、或 ROM 深度清理，服务会死，通知也不会来。
- **首次装完要重新进一次与鱼页**，桥才会把房间号交给原生层。
- 换房间（换个 room code 进）会重新订阅，旧房间的通知停止。

### 自己验一下

```bash
# 1) 服务端：只读订阅应该秒回 hello，且带上当前进度
curl -N 'http://<你的地址>/api/yu/stream?code=<房间号>&bg=1'

# 2) 手机上：装 1.4 → 进与鱼 → 允许通知 → 发一句话 → 按两次返回退出
#    她的回复应该在几秒内弹出来
# 3) 看日志（连着电脑时）
adb logcat -s YuNotify
```

## 发语音（1.4）

### 为什么网页里的录音在你的环境里用不了

页面上的「🎤」走的是 `navigator.mediaDevices.getUserMedia` + `MediaRecorder`。
这两个 API **只在安全上下文**（https、localhost、file://）里存在。用 easytier 的内网地址
是 `http://10.x.x.x:3000`，WebView 判定不是安全上下文，`navigator.mediaDevices` **直接是
`undefined`** —— 点「开始录音」只会得到一句「这个环境不给录音」。

这个限制在 WebView 里没有开关可关：`onPermissionRequest` 只负责「给不给」，不负责
「有没有这个 API」。所以只能在原生做。

### 壳里怎么走

```
点「开始录音」
  └─ window.HappyNav.voiceStart(code, pid)
       └─ 没有 RECORD_AUDIO → 系统弹权限框；允许后自动开录，并回叫 __voiceStarted()
       └─ 有权限 → MediaRecorder(MPEG_4 / AAC / 64kbps / 44.1kHz) → 写进 cacheDir/voice/
点「发送语音」
  └─ window.HappyNav.voiceSend()
       ├─ 停录、算时长（不足 800 字节当没录到）
       ├─ POST /api/yu/upload?kind=voice&name=语音-xxx.m4a   （原始字节，X-File-Name 带头）
       └─ POST /api/yu/send {type:'voice', url, dur}
            └─ 成功后 __voiceDone(true) → 页面关弹层
关弹层 / 点遮罩
  └─ window.HappyNav.voiceCancel() → 停录并删文件，不发
```

**音频数据不经过 JS 桥**：原生录完自己上传，页面不会拿到几 MB 的 base64。
发出去以后，页面靠**它自己的 SSE** 收到这条消息（和收到别人发的一样），所以气泡会自动出现。

### 页面怎么判断走哪条路

不看 UA，看原生有没有注入方法：

```js
if (window.HappyNav && window.HappyNav.voiceStart) {  /* 壳里：原生录 */ }
else { /* 浏览器：getUserMedia，原有逻辑 */ }
```

所以同一个 `yu.html` 在两个环境里都能用：浏览器（https）走网页录音，壳里走原生录音。
`voiceStart()` 返回 `false` 只有一种情况——正在向系统要麦克风权限，这时页面提示
「允许后会自动开始」，原生拿到权限后会调 `__voiceStarted()` 让页面开始计时。

### 权限与边界

| 项 | 说明 |
|---|---|
| `RECORD_AUDIO` | 清单里早就有（网页录音也要它），但**运行时权限是点「开始录音」时才要**，不在启动时弹 |
| 文件格式 | `MPEG_4` 容器 + AAC，扩展名 `.m4a`，服务端 `mimeFor('voice','m4a')` → `audio/mp4`，WebView 与手机浏览器都能直接播 |
| 体积 | 64kbps，60 秒约 480KB；受服务端 `MAX_UPLOAD` 限制 |
| 停在后台 | 录音中切走会继续录（MediaRecorder 不跟 Activity 生命周期），回来还能发；不想要就点遮罩取消 |
| 失败提示 | 上传/发送失败会显示具体原因（「先加入房间」「文件太大」等），并把「发送语音」重新点亮 |

## 自己构建

不需要 Android Studio，也不需要 Gradle。三样东西 + 一条命令：

```bash
# 1) 准备（只需一次）
#    JDK 17+        —— javac / keytool
#    build-tools    —— aapt2 / d8 / zipalign / apksigner
#    platform 34    —— android.jar
#
#    国内可用清华镜像下 JDK：
#    https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jdk/x64/windows/
#    build-tools 与 platform：
#    https://dl.google.com/android/repository/build-tools_r34-windows.zip
#    https://dl.google.com/android/repository/platform-34-ext7_r03.zip

# 2) 构建
cd clients/android
JDK=$HOME/android-build/jdk/jdk-17.0.21+9 \
BT=$HOME/android-build/bt/android-14 \
PLATFORM=$HOME/android-build/plat/android-34/android.jar \
bash build-apk.sh
```

产物：`build/happy-nav-1.3.apk`（已签名，21KB）。

脚本做的事就六步：`aapt2 compile` → `aapt2 link` → `javac` → `d8` → 塞 `classes.dex` + `zipalign` → `apksigner sign`。没有隐藏步骤，也没有下载依赖。

## 发版（不用手点网页）

装 APK 的人不该被要求先装 JDK 和 build-tools，所以成品包跟着仓库走：

```
clients/android/artifacts/
├── happy-nav-1.4.1.apk     ← 签好名的成品（33KB）
└── release-notes.md        ← 这一版的说明，Release 正文就是它
```

发一个新版只有两步：

```bash
cp build/happy-nav-1.4.2.apk artifacts/ && $EDITOR artifacts/release-notes.md
git commit -am "release: 1.4.2" && git push
git tag android-v1.4.2 && git push origin android-v1.4.2
```

`.github/workflows/release-apk.yml` 收到 tag 就建 Release、把 `artifacts/` 里最新的 apk 挂上去。

**为什么不在 CI 里现构建**：`build-apk.sh` 要 JDK 17 + build-tools + `android.jar` 三件套，
在 runner 上装齐是几百 MB 的下载，为 33KB 的包不值。要的是「下载即装」，不是「CI 会编译」。

apk 不进 `.gitignore` 是故意的：它只有 33KB，而「能直接下」比「仓库干净」重要。

### 关于签名

第一次构建会生成 `keystore.jks`（密码写在脚本里，不是秘密）。两点必须知道：

- **这个文件不要提交、不要外发。** 谁拿到它，谁就能签一个「和你同签名」的包来覆盖安装你的 App。
- **换了签名 = 用户必须卸载重装**（安卓不允许跨签名升级）。所以自己留着，别每次重建。

## 改什么在哪

| 想改 | 改哪 |
|---|---|
| 包名 / 版本号 | `AndroidManifest.xml` 的 `package` / `versionCode` / `versionName` |
| 图标 | `res/drawable/ic_launcher_foreground.xml`（矢量，改颜色改 `colors.xml` 的 `brand`） |
| 主题色 / 启动背景 | `res/values/colors.xml`、`styles.xml` |
| 首次打开的行为 | `MainActivity.java` 的 `onCreate` |
| 改地址 / 刷新 / 清缓存 / 关于 | `MainActivity.java` 的 `handleUrl` / `clearCacheAndReload` + `public/index.html` 的 `#connBox`（1.3 从原生浮层菜单搬进网页设置；后来为减少与鱼页头图标，统一收到首页设置面板） |
| 判断内链/外链 | `MainActivity.java` 的 `handleUrl` |

## 目录

```
clients/android/
├─ AndroidManifest.xml
├─ build-apk.sh            一条命令构建
├─ src/com/happynav/shell/
│  └─ MainActivity.java    全部逻辑（约 400 行）
└─ res/                    图标、主题、字符串
```

## 真机验证情况

**1.4 已在真机上完成全部功能验证（2026-11-24）**，逐项走通：

- 安装、启动、全屏无地址栏
- 发消息 / 发图 / 传文件
- 下载：转系统下载管理器，通知栏可见
- 发语音：http 内网地址下由原生 `MediaRecorder` 录制并上传
- 退到后台 / 从最近任务划掉 / 锁屏后，她的回复能弹系统通知
- 返回键：单次后退、两秒内两次退出；长按 → 改地址
- 首页 → 设置 →「手机壳」：改地址 / 刷新 / 清缓存
- 连不上时的「重新连接」页

构建机没有设备与模拟器，编译期只能验证 `apksigner verify`、`aapt2 dump badging` 的包名/版本/权限/启动 Activity；**运行期结论以上面的真机验证为准**。

仍未逐条构造的是三种「异常注入」路径（主框架返回 4xx/5xx、证书错误、HTTP 200 但内容不对）——它们需要故意把服务端弄坏才能触发，不属于功能验收范围。



### 恢复入口（页面打不开时）

1.3 的补强：`onReceivedError`（网络层）、`onReceivedHttpError`（主框架 4xx/5xx）、`onReceivedSslError`（证书）都会切到错误页，错误页里的 `happynav://settings` 按钮始终保留。但「HTTP 200 却不是与鱼页」和「JS 挂掉白屏」不会触发任何错误回调，所以又加了一个纯原生的**长按返回键 → showSetup()**（`onKeyDown` 里 `startTracking()` 开启长按跟踪，`onKeyLongPress` 弹对话框，`onKeyUp` 消费掉这次按键，避免弹完又走一次默认返回）。

这套手势、三个错误回调和上面的 WebView 重建，触发条件都需要把服务端故意弄坏（返回 4xx/5xx、坏证书、或者 200 但内容不对），所以没有当作功能项逐条构造；正常网络下的返回键行为、断网重连页、改地址入口都已在真机走通。
