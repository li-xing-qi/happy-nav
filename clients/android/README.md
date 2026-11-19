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
| 点外链 | 同域名在壳里开，其它交给系统浏览器 |
| 连不上 | 不白屏，给「重新连接」页 |
| 改地址 / 刷新 / 清缓存 | 首页 → 设置 →「手机壳」（`happynav://settings` / `reload` / `clear-cache`）；页面打不开时用错误页的「改地址」按钮 |

## 做不到什么

- **语音录制要 https。** 页面用的是 `navigator.mediaDevices.getUserMedia`，浏览器只在安全上下文（HTTPS / localhost）下给麦克风。填 `http://` 地址时点麦克风，页面自己会提示「这个环境不给录音」，改用「文件」发音频。
- **没有系统推送。** 要接厂商通道（小米/华为/OPPO/vivo 各一套），不在这个壳的范围内。
- **后台会被杀。** 安卓对后台进程的态度就是这样，切走久了连接会断；回来时页面自己有轮询兜底，能补上。
- **http 是明文。** 壳里开了 `usesCleartextTraffic` 才能访问 `http://` 地址，公共 WiFi 下别人能抓包。自己的东西，自己权衡；在意就上 HTTPS。

想把地址换成 `https://`（顺带解锁语音、并且可以关掉 `usesCleartextTraffic`），做法与代价见 **[docs/HTTPS与访问方式.md](../../docs/HTTPS与访问方式.md)**。

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

## 已知没验证的

**这一版没有在真机上跑过**——构建机上没有设备也没有模拟器。已验证的是：能编译、`apksigner verify` 通过、`aapt2 dump badging` 的包名/版本/权限/启动 Activity 都对。

所以第一次装完请重点看三件事：能不能打开、能不能发消息、能不能发图。有问题把 `adb logcat | grep happynav` 或手机上的报错发出来。

### 恢复入口（页面打不开时）

1.3 的补强：`onReceivedError`（网络层）、`onReceivedHttpError`（主框架 4xx/5xx）、`onReceivedSslError`（证书）都会切到错误页，错误页里的 `happynav://settings` 按钮始终保留。但「HTTP 200 却不是与鱼页」和「JS 挂掉白屏」不会触发任何错误回调，所以又加了一个纯原生的**长按返回键 → showSetup()**（`onKeyDown` 里 `startTracking()` 开启长按跟踪，`onKeyLongPress` 弹对话框，`onKeyUp` 消费掉这次按键，避免弹完又走一次默认返回）。

这套手势、三个错误回调和上面的 WebView 重建**同样没有在真机上跑过**（构建机没有设备/模拟器）。装完请专门验一次：把地址填成一个返回 nginx 默认页的 URL，确认长按返回键能弹出改地址框；顺带确认单次返回、两秒内两次退出都还和 1.2 一样正常。
