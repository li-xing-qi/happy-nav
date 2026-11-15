#!/usr/bin/env bash
# ============================================================
# 环境检测：看看跑这个站点还缺什么、有什么可选组件
#
#   bash scripts/check-deps.sh
#
# 只读检测，不安装、不修改任何东西。
# ============================================================
set -uo pipefail
cd "$(dirname "$0")/.."

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
ok()   { printf "  ${G}✓${N} %-26s %s\n" "$1" "${2:-}"; }
miss() { printf "  ${R}✗${N} %-26s %s\n" "$1" "${2:-}"; }
opt()  { printf "  ${Y}○${N} %-26s %s\n" "$1" "${2:-}"; }

echo ""
echo -e "${B}=== 必需环境 ===${N}"

if command -v node >/dev/null 2>&1; then
  NODE_V=$(node -v)
  NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
  if [ "$NODE_MAJOR" -ge 18 ]; then
    ok "Node.js" "$NODE_V"
  else
    miss "Node.js" "$NODE_V（需要 18+）"
  fi
else
  miss "Node.js" "未安装，去 https://nodejs.org/"
fi

if [ -f server.js ] && [ -f engine.js ]; then
  ok "站点文件" "完整"
else
  miss "站点文件" "不完整，是否在仓库根目录执行？"
fi

if [ -d workspace ]; then
  if [ -f workspace/AGENTS.md ]; then ok "人设文件" "workspace/AGENTS.md"; else opt "人设文件" "缺失，首次启动会自动生成"; fi
  if [ -f workspace/MEMORY.md ]; then ok "长期记忆" "workspace/MEMORY.md"; else opt "长期记忆" "缺失，首次启动会自动创建"; fi
else
  opt "workspace/" "尚未创建，首次启动会自动建"
fi

echo ""
echo -e "${B}=== AI 接入（可选）===${N}"

# .env 是否生效：直接读文件判断，不启动服务
if [ -f .env ]; then
  ok ".env" "已存在"
  getval() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\''' | xargs 2>/dev/null; }
  BASE=$(getval LLM_BASE_URL); [ -z "$BASE" ] && BASE=$(getval DEEPSEEK_BASE_URL)
  KEY=$(getval LLM_API_KEY);  [ -z "$KEY" ]  && KEY=$(getval DEEPSEEK_API_KEY)
  MODEL=$(getval LLM_MODEL);  [ -z "$MODEL" ] && MODEL=$(getval DEEPSEEK_MODEL)
  [ -n "$BASE" ]  && ok "模型地址" "$BASE"  || miss "模型地址" "未填 LLM_BASE_URL，AI 对话不可用"
  [ -n "$MODEL" ] && ok "模型名"   "$MODEL" || miss "模型名"   "未填 LLM_MODEL"
  [ -n "$KEY" ]   && ok "密钥"     "已配置（不回显）" || opt "密钥" "未填 LLM_API_KEY（本地 Ollama 可能不需要）"
else
  opt ".env" "不存在；复制 .env.example 为 .env 后填写"
  if [ -n "${LLM_BASE_URL:-}${LLM_API_KEY:-}" ]; then
    ok "环境变量" "检测到已在 shell 中设置 LLM_*（优先于 .env）"
  fi
fi

# 端口连通性（仅当填了地址）
if [ -n "${BASE:-}" ]; then
  HOSTPORT=$(echo "$BASE" | sed -E 's#^https?://##; s#/.*$##')
  case "$HOSTPORT" in
    *:*) H=${HOSTPORT%%:*}; P=${HOSTPORT##*:} ;;
    *)   H=$HOSTPORT; P=80 ;;
  esac
  if timeout 3 bash -c "echo > /dev/tcp/$H/$P" 2>/dev/null; then
    ok "模型服务可达" "$H:$P"
  else
    miss "模型服务不可达" "$H:$P（服务没启动？地址写错？）"
  fi
fi

echo ""
echo -e "${B}=== 可选组件（本项目不包含、不分发）===${N}"
echo -e "  ${B}说明见 docs/可选组件.md${N}"

if command -v dsh >/dev/null 2>&1; then
  ok "dsh（AI 能动手干活）" "$(dsh --version 2>/dev/null || echo '已安装')"
else
  opt "dsh（AI 能动手干活）" "未安装：npm i -g @deepseek-ai/dsh   许可证 MIT"
fi

if command -v easytier-core >/dev/null 2>&1 || [ -x /opt/easytier/easytier-core ]; then
  ok "EasyTier（异地组网）" "已安装   许可证 LGPL-3.0"
else
  opt "EasyTier（异地组网）" "未安装；有公网 IP 的话不需要它"
fi

echo ""
echo -e "${B}=== 冒烟（服务已在运行时才有意义）===${N}"
PORT=$(grep -E "^PORT=" .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' ' || echo 3000)
PORT=${PORT:-3000}
if curl -fsS --max-time 3 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  ok "站点" "http://127.0.0.1:${PORT}"
  echo "     $(curl -s --max-time 3 "http://127.0.0.1:${PORT}/api/health")"
else
  opt "站点" "未在 ${PORT} 端口响应（还没启动？）"
fi

echo ""
echo "提示：标 ✗ 的必须解决；标 ○ 的是可选，不影响非 AI 玩法。"
echo ""
