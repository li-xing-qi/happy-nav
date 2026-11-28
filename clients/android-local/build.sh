#!/usr/bin/env bash
# 最小手写 APK 构建脚本：aapt2 → javac → clang++ → d8 → 打包 → zipalign → apksigner
# 用法：bash build.sh        （产物：build/happy-nav-local-1.1.apk）
#
# 注意：javac/d8/aapt2 等是原生 Windows 程序，不认 Git Bash 的 /c/... /d/... 路径，
#       所以脚本先 cd 到工程根、统一用相对路径，SDK 绝对路径用 cygpath -w 转换。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

APP="app"
BUILD="build"
GEN="$BUILD/gen"
CLASSES="$BUILD/classes"
DEX="$BUILD/dex"
LIBS="$APP/jniLibs/arm64-v8a"

SDKROOT="/c/Users/Lenovo/android-build"
JDK="$SDKROOT/jdk/jdk-17.0.21+9"
BT="$SDKROOT/bt/android-14"
PLATFORM="$SDKROOT/plat/android-34"
NDK="$SDKROOT/ndk/android-ndk-r26d"
TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/windows-x86_64/bin"

export JAVA_HOME="$JDK"
export PATH="$JDK/bin:$PATH"

WIN_JAR="$(cygpath -w "$PLATFORM/android.jar")"

APK_UNSIGNED="$BUILD/app-unsigned.apk"
APK_ALIGNED="$BUILD/app-aligned.apk"
APK_OUT="$BUILD/happy-nav-local-1.1.apk"
KS="$BUILD/spike.keystore"
KS_PASS="spike123"
KS_ALIAS="spike"

step() { printf '\n== %s ==\n' "$*"; }

# ---------- 0. 前置检查 ----------
step "0/8 前置检查"
[ -f "$LIBS/libnode.so" ] || { echo "缺少 $LIBS/libnode.so（从 nodejs-mobile 包拷贝 arm64-v8a/libnode.so）"; exit 1; }
[ -f "$APP/include/node/node.h" ] || { echo "缺少 $APP/include/node/node.h（从 nodejs-mobile 包拷贝 include/node/）"; exit 1; }
[ -f "$JDK/bin/javac.exe" ] || { echo "找不到 javac: $JDK"; exit 1; }

CXX="$TOOLCHAIN/aarch64-linux-android24-clang++.cmd"
[ -f "$CXX" ] || CXX="$TOOLCHAIN/aarch64-linux-android24-clang++"
[ -f "$CXX" ] || { echo "找不到 NDK clang++: $TOOLCHAIN"; exit 1; }
echo "CXX = $CXX"

# libnode.so 依赖 libc++_shared.so，必须一起打包（缺失会 dlopen 失败）
if [ ! -f "$LIBS/libc++_shared.so" ]; then
  cp "$NDK/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so" "$LIBS/"
  echo "已从 NDK 拷贝 libc++_shared.so"
fi
ls -lh "$LIBS"/*.so

rm -rf "$GEN" "$CLASSES" "$DEX"
mkdir -p "$GEN" "$CLASSES" "$DEX"

# ---------- 1. 资源 & 清单 ----------
step "1/8 aapt2 compile + link"
"$BT/aapt2.exe" compile --dir "$APP/res" -o "$BUILD/res.zip"
"$BT/aapt2.exe" link \
  -o "$BUILD/base.apk" \
  -I "$WIN_JAR" \
  --manifest "$APP/AndroidManifest.xml" \
  --java "$GEN" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --version-code 2 --version-name "1.1" \
  "$BUILD/res.zip"
echo "base.apk: $(du -h "$BUILD/base.apk" | cut -f1)"

# ---------- 2. javac ----------
step "2/8 javac"
find "$APP/src" "$GEN" -name '*.java' > "$BUILD/sources.txt"
echo "java 源文件数: $(wc -l < "$BUILD/sources.txt")"
"$JDK/bin/javac.exe" -encoding UTF-8 -source 17 -target 17 \
  -classpath "$WIN_JAR" \
  -d "$(cygpath -w "$CLASSES")" \
  "@$BUILD/sources.txt"
echo "class 文件数: $(find "$CLASSES" -name '*.class' | wc -l)"

# ---------- 3. d8 ----------
step "3/8 d8 (dex)"
find "$CLASSES" -name '*.class' > "$BUILD/classes.txt"
"$BT/d8.bat" --release --min-api 24 --lib "$WIN_JAR" \
  --output "$(cygpath -w "$DEX")" "@$BUILD/classes.txt"
ls -lh "$DEX/classes.dex"

# ---------- 4. NDK 编译 JNI ----------
step "4/8 clang++ (libnodejni.so)"
"$CXX" -shared -fPIC -O2 -s \
  -I "$APP/include" -I "$APP/include/node" \
  -o "$LIBS/libnodejni.so" \
  "$APP/jni/native-lib.cpp" \
  -L "$LIBS" -lnode -llog \
  -Wl,-z,max-page-size=16384
ls -lh "$LIBS"/*.so

# ---------- 5. 打包 ----------
step "5/8 打包 APK (python zipfile, .so 不压缩)"
python tools/pack_apk.py \
  --base "$BUILD/base.apk" \
  --dex "$DEX/classes.dex" \
  --libs "$LIBS" \
  --assets "$APP/assets" \
  --out "$APK_UNSIGNED"
ls -lh "$APK_UNSIGNED"

# ---------- 6. zipalign ----------
step "6/8 zipalign"
"$BT/zipalign.exe" -p -f 4 "$APK_UNSIGNED" "$APK_ALIGNED"
"$BT/zipalign.exe" -c -p 4 "$APK_ALIGNED" && echo "zipalign 校验通过"

# ---------- 7. keystore ----------
step "7/8 keystore"
if [ ! -f "$KS" ]; then
  "$JDK/bin/keytool.exe" -genkeypair -keystore "$KS" -alias "$KS_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=HappyNav Local Spike, OU=dev, O=happynav, L=SZ, ST=GD, C=CN" >/dev/null 2>&1
  echo "已生成 $KS (storepass=$KS_PASS alias=$KS_ALIAS)"
else
  echo "复用已有 $KS"
fi

# ---------- 8. 签名 & 验收 ----------
step "8/8 apksigner sign + verify"
"$BT/apksigner.bat" sign \
  --ks "$KS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --min-sdk-version 24 \
  --out "$APK_OUT" "$APK_ALIGNED"
"$BT/apksigner.bat" verify --print-certs "$APK_OUT" | head -5

echo
echo "------ 产物 ------"
ls -lh "$APK_OUT"
"$BT/aapt2.exe" dump badging "$APK_OUT" | grep -E "^package|native-code|application-label|sdkVersion|targetSdkVersion|launchable-activity"
