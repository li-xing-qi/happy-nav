#!/usr/bin/env bash
# ============================================================
# 构建「与鱼」手机壳 APK（不依赖 Android Studio / Gradle）
#
# 需要三样东西，用环境变量指定，或按默认位置放好：
#   JDK       JDK 17+（javac / keytool）
#   BT        Android build-tools（aapt2 / d8 / zipalign / apksigner）
#   PLATFORM  android.jar（platform 34）
#
# 例：
#   JDK=$HOME/android-build/jdk/jdk-17.0.21+9 \
#   BT=$HOME/android-build/bt/android-14 \
#   PLATFORM=$HOME/android-build/plat/android-34/android.jar \
#   bash build-apk.sh
#
# 产物：build/happy-nav-1.2.apk（已签名，可直接安装）
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

JDK="${JDK:-$HOME/android-build/jdk/jdk-17.0.21+9}"
BT="${BT:-$HOME/android-build/bt/android-14}"
PLATFORM="${PLATFORM:-$HOME/android-build/plat/android-34/android.jar}"

OUT="build"
APK_NAME="happy-nav-1.2.apk"

export JAVA_HOME="$JDK"
export PATH="$JDK/bin:$PATH"

# Windows 的 build-tools 是 .bat，Linux/macOS 是同名无后缀脚本，两边都认
pick() { for c in "$1" "$1.bat" "$1.exe"; do if [ -e "$c" ]; then echo "$c"; return; fi; done; echo "$1"; }
need() { [ -e "$1" ] || { echo "缺少：$1"; exit 1; }; }

AAPT2="$(pick "$BT/aapt2")"
D8="$(pick "$BT/d8")"
ZIPALIGN="$(pick "$BT/zipalign")"
APKSIGNER="$(pick "$BT/apksigner")"

need "$JDK/bin/javac"
need "$AAPT2"
need "$PLATFORM"

rm -rf "$OUT"
mkdir -p "$OUT/flat" "$OUT/classes" "$OUT/dex"

echo "[1/6] 编译资源（aapt2 compile）"
"$AAPT2" compile --dir res -o "$OUT/flat/res.zip"

echo "[2/6] 链接资源与清单（aapt2 link）"
"$AAPT2" link \
  -o "$OUT/base.apk" \
  -I "$PLATFORM" \
  --manifest AndroidManifest.xml \
  --min-sdk-version 26 \
  --target-sdk-version 34 \
  "$OUT/flat/res.zip"

echo "[3/6] 编译 Java（javac，Java 8 字节码）"
find src -name '*.java' > "$OUT/sources.txt"
if ! javac -source 8 -target 8 -encoding UTF-8 \
  -bootclasspath "$PLATFORM" -classpath "$PLATFORM" \
  -d "$OUT/classes" @"$OUT/sources.txt" > "$OUT/javac.log" 2>&1; then
  cat "$OUT/javac.log"
  exit 1
fi

echo "[4/6] 转 dex（d8）"
find "$OUT/classes" -name '*.class' > "$OUT/classes.txt"
# shellcheck disable=SC2046
"$D8" --lib "$PLATFORM" --min-api 26 --output "$OUT/dex" $(cat "$OUT/classes.txt")

echo "[5/6] 把 classes.dex 塞进 APK 并四字节对齐"
python - "$OUT/base.apk" "$OUT/dex/classes.dex" <<'PY'
import sys, zipfile
apk, dex = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(apk, 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(dex, 'classes.dex')
print('  + classes.dex')
PY
"$ZIPALIGN" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"

echo "[6/6] 签名"
if [ ! -f keystore.jks ]; then
  echo "  生成自签名证书（只在第一次构建时做；换证书 = 用户必须卸载重装）"
  keytool -genkeypair -keystore keystore.jks -alias happy-nav \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass happynav -keypass happynav \
    -dname "CN=HappyNav Shell, OU=Self, O=HappyNav, L=CN, ST=CN, C=CN" >/dev/null 2>&1
fi
"$APKSIGNER" sign \
  --ks keystore.jks --ks-pass pass:happynav --key-pass pass:happynav \
  --out "$OUT/$APK_NAME" "$OUT/aligned.apk"
"$APKSIGNER" verify --print-certs "$OUT/$APK_NAME" | head -4

echo
echo "完成：$(pwd)/$OUT/$APK_NAME"
ls -lh "$OUT/$APK_NAME"
