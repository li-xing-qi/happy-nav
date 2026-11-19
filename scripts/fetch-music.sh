#!/usr/bin/env bash
# 下载并转码背景音乐（Mixkit 免费授权，可商用、无需署名）
#
# 为什么要脚本而不是把 mp3 提交进仓库：
#   12 首曲目 25MB，进了 git 就永久留在历史里，clone 一次多下 25MB。
#   这里只保留清单（public/music/manifest.json），音频按需重下。
#
# 用法：
#   bash scripts/fetch-music.sh              # 缺什么补什么
#   bash scripts/fetch-music.sh --force      # 全部重下
#
# 依赖：curl、ffmpeg（转 112kbps，体积从 ~6MB 降到 ~2MB，手机流量友好）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/music"
SRC="${TMPDIR:-/tmp}/happy-nav-music-src"
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
FORCE="${1:-}"

# id=Mixkit 曲目页 id, slug=保存的文件名（也是 manifest 里的 file）
TRACKS=(
  "22 piano-reflections"
  "168 staring-at-the-night-sky"
  "655 chillax"
  "529 walking-in-the-park"
  "584 rest-now"
  "184 vastness"
  "854 old-letter"
  "37 love-is-eternal"
  "24 smooth-like-jazz"
  "513 feeling-good"
  "531 lullaby-night"
  "1081 well-be-okay"
)

command -v ffmpeg >/dev/null || { echo "缺 ffmpeg：apt install ffmpeg"; exit 1; }
mkdir -p "$OUT" "$SRC"

for item in "${TRACKS[@]}"; do
  set -- $item
  id="$1"; slug="$2"
  src="$SRC/$slug.mp3"
  dst="$OUT/$slug.mp3"

  if [ -s "$dst" ] && [ "$FORCE" != "--force" ]; then
    echo "跳过 $slug（已存在）"
    continue
  fi

  if [ ! -s "$src" ] || [ "$FORCE" = "--force" ]; then
    echo "下载 $slug ..."
    curl -fsSL -A "$UA" -m 180 -o "$src" "https://assets.mixkit.co/music/$id/$id.mp3"
  fi

  ffmpeg -v error -y -i "$src" -codec:a libmp3lame -b:a 112k -ar 44100 "$dst"
  printf '  ok  %-28s %5s KB  %ss\n' "$slug.mp3" "$(( $(stat -c%s "$dst" 2>/dev/null || stat -f%z "$dst") / 1024 ))" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dst" | cut -d. -f1)"
done

echo
echo "完成：$OUT"
echo "曲目清单：public/music/manifest.json（新增曲目要同时加进 scenes，否则不会被播到）"
echo "授权：Mixkit Stock Music Free License —— 可商用、免署名；不可把音乐本身单独再分发。"
