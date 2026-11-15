#!/usr/bin/env bash
# 部署后冒烟：确认站点与各玩法接口都活着。只读，不改任何数据。
set -uo pipefail
BASE="${BASE:-http://127.0.0.1:${PORT:-3000}}"
PASS=0; FAIL=0

check() {
  local path="$1" name="$2" code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "${BASE}${path}" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    printf "  \033[0;32m✓\033[0m %-34s %s\n" "$name" "$code"; PASS=$((PASS+1))
  else
    printf "  \033[0;31m✗\033[0m %-34s %s\n" "$name" "$code"; FAIL=$((FAIL+1))
  fi
}

echo "冒烟目标：$BASE"
echo
echo "页面："
check "/"                   "首页"
check "/chat"               "聊天室"
check "/yu"                 "与鱼"
check "/gomoku"             "五子棋"
check "/game"               "万象牌"
check "/lingxi"             "心有灵犀"
echo
echo "接口："
check "/api/health"         "健康检查"
check "/api/codex"          "图鉴数据"
echo
echo "结果：通过 $PASS，失败 $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
