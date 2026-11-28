# happy-nav-local —— 完全手机端版 App

和鱼的开心导航的**纯本机版**：Node 服务整包塞进 APK，App 启动时在本机
`127.0.0.1:3000` 起一个 Node 进程，WebView 直接连它。断网也能用（AI 对话除外，
那部分要连 DeepSeek 的接口）。

- 包名：`com.happynav.local`
- 运行时：nodejs-mobile **v18.20.4**（arm64-v8a）
- 版本：1.1（四层记忆 + 账号无关的本机单人版）
- 与 `clients/android/`（1.4.1 那个壳）**完全独立**：那个只是套壳指向线上服务器，
  这个是把服务端整套搬进手机跑。

## 目录

```
app/
├─ AndroidManifest.xml            minSdk 24 / targetSdk 34 / usesCleartextTraffic
├─ res/values/strings.xml         app_name 等基础资源（aapt2 需要）
├─ src/com/happynav/local/
│   └─ MainActivity.java          assets 解压 → 加载 so → 起 Node 线程 → 轮询端口 → WebView
├─ jni/native-lib.cpp             导出 startNode()，调用 node::Start
├─ include/node/                  nodejs-mobile 的头文件（★不入库，自行准备）
├─ jniLibs/arm64-v8a/
│   ├─ libnode.so                 nodejs-mobile 运行时，约 47MB（★不入库）
│   ├─ libc++_shared.so           libnode.so 的 C++ 运行时（来自 NDK r26d，★不入库）
│   └─ libnodejni.so              本工程 JNI 编译产物（★不入库）
└─ assets/nodejs-project/         App 运行时解压到 filesDir 的 Node 工程
    ├─ main.js                    入口：起 server.js
    ├─ server.js                  零依赖 HTTP 服务（页面 + API）
    ├─ engine.js / content.js     万象牌规则与卡牌数据
    ├─ yu.js                      与鱼（本机版按单账号隔离数据）
    ├─ lx.js                      心有灵犀
    ├─ ai-hook.js                 小鱼自动回复 hook（接 LLM）
    ├─ edge-tts.js                语音合成（微软 edge-tts）
    ├─ config.json                AI 配置（llmBase / llmKey / llmModel），首次清空
    ├─ public/                    前端页面（index / yu / game / lingxi / gomoku / chat）
    │   └─ music/manifest.json    曲目清单（mp3 不入库）
    └─ workspace/
        ├─ AGENTS.md              手机裁剪版人设（73 行，比服务器版轻）
        └─ memory/                记忆层：bridge/blocks/adapters/store/constants/llm
build.sh                          手写构建流水线（aapt2 → javac → d8 → clang++ → 打包 → 签名）
tools/pack_apk.py                 python zipfile 打包（.so/.arsc/.dex/.mp3 不压缩）
```

`app/assets/nodejs-project` **不是**在 PC 上跑的，它是 App 的资产：第一次启动时
`MainActivity` 把它整目录拷到 `/data/data/com.happynav.local/files/nodejs-project`，
然后 `node::Start` 从这个目录跑 `main.js`。改完 JS 必须重新打包 APK 才会生效。

## 依赖准备（不入库，需自己下）

构建机上的 SDK 根目录默认是 `/c/Users/Lenovo/android-build`（见 `build.sh` 顶部，
换机器改 `SDKROOT` 即可）：

| 依赖 | 版本 | 期望路径 |
|---|---|---|
| JDK | 17 | `$SDKROOT/jdk/jdk-17.0.21+9` |
| build-tools | 34.0.0 (android-14) | `$SDKROOT/bt/android-14`（要 aapt2 / d8 / zipalign / apksigner） |
| platform | android-34 | `$SDKROOT/plat/android-34`（要 android.jar） |
| NDK | r26d | `$SDKROOT/ndk/android-ndk-r26d` |

nodejs-mobile（https://github.com/nodejs-mobile/nodejs-mobile/releases ，v18.20.4 的
`nodejs-mobile-v18.20.4-android.zip`）解压后手动拷两个东西进来：

```bash
# 1) 运行时 so（约 47MB）
cp nodejs-mobile/bin/arm64-v8a/libnode.so  app/jniLibs/arm64-v8a/
# 2) 头文件（build.sh 要 app/include/node/node.h）
cp -r nodejs-mobile/include/node            app/include/
```

`libc++_shared.so` 不用手动拷，`build.sh` 发现缺了会自己从 NDK 取。
`app/include/` 与 `app/jniLibs/**/*.so` 都已在 `.gitignore` 里，不会误提交。

## 构建

```bash
cd clients/android-local        # 或本机原始工程目录
bash build.sh
```

产物：`build/happy-nav-local-1.1.apk`（约 74MB，其中 `libnode.so` 占 47MB）。
自签名（keystore 在 `build/spike.keystore`，pass `spike123`，alias `spike`），
只适合自己装机，不要拿去上架。

装机：

```bash
adb install -r build/happy-nav-local-1.1.apk
adb shell am start -n com.happynav.local/.MainActivity
adb logcat -s NodeSpike NodeJS      # 看 Node 启动日志
```

## 第一次使用

1. 打开 App，等顶部状态从「Node 启动中…」变成「已连接 127.0.0.1:3000」。
2. 点右上角「设置」→ 切到「AI 设置」页签。
3. 填自己的 DeepSeek `sk-…`（接口默认 `https://api.deepseek.com/v1`，模型 `deepseek-chat`），
   点「保存 AI 设置」，可以顺手点「测试连接」。
4. **不填 key 也能用**：页面、游戏、音乐都正常，只是小鱼不会自动回复。
   留空保存**不会**覆盖已经存好的 key；要抹掉用「清除 key」。

## 已知限制

- **不能画图**：AI 只出文字，没有图像生成。
- **没有工具循环**：一条消息就是一次模型调用，不会自己反复调工具/联网检索。
- **记忆是本地文件**：四层记忆落在 `workspace/memory/data/*.json`，`chatlog.jsonl`
  是聊天流水；重装/清数据就没了，也不会同步到其它设备。
- **只有 arm64-v8a**：老 32 位机装不上。
- APK 约 74MB，主要是内嵌的 Node 运行时。
- 没有账号系统：本机版「与鱼」打开即进，不走服务器版的注册/登录/房间号那一套。

## 隐私

`workspace/MEMORY.md`、`workspace/memory/data/`、`workspace/data/`、
`workspace/chatlog.jsonl`、`app/assets/nodejs-project/data/`（聊天记录、上传、图片）
都是本机真实数据，**全部在 `.gitignore` 里**，不会进仓库。
