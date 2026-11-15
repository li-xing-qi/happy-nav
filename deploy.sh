#!/usr/bin/env bash
# ============================================================
# 和鱼的快乐导航 · 一键部署（Linux / macOS）
#
#   bash deploy.sh              # 前台运行，Ctrl+C 停止
#   bash deploy.sh --daemon     # 后台守护（优先后台用 pm2，没有就用 nohup）
#   bash deploy.sh --stop       # 停止后台实例
#   bash deploy.sh --check      # 只做环境检查与语法自检，不启动
#
# 特性：零第三方依赖（Node 内置模块即可跑）、数据落在本目录、
#      未配置 AI 密钥也能启动（只少 AI 相关玩法）。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[信息]${NC} $*"; }
ok()   { echo -e "${GREEN}[成功]${NC} $*"; }
warn() { echo -e "${YELLOW}[注意]${NC} $*"; }
die()  { echo -e "${RED}[失败]${NC} $*" >&2; exit 1; }

PORT="${PORT:-3000}"
MODE="foreground"
[ "${1:-}" = "--daemon" ] && MODE="daemon"
[ "${1:-}" = "--stop" ] && MODE="stop"
[ "${1:-}" = "--check" ] && MODE="check"

# ---------- 0. 停止 ----------
if [ "$MODE" = "stop" ]; then
  if command -v pm2 >/dev/null 2>&1 && pm2 describe happy-nav >/dev/null 2>&1; then
    pm2 stop happy-nav && pm2 delete happy-nav && ok "已停止 pm2 实例"
  else
    PIDS=$(pgrep -f "node .*server\.js" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then kill $PIDS 2>/dev/null || true; ok "已停止进程：$PIDS"; else warn "没有运行中的实例"; fi
  fi
  exit 0
fi

# ---------- 1. 环境检查 ----------
info "检查运行环境…"
command -v node >/dev/null 2>&1 || die "未找到 Node.js。请先安装 Node 18+：https://nodejs.org/"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 18 ] || die "Node 版本过低（当前 $(node -v)），需要 18 或更高"
ok "Node $(node -v)"

# 端口占用检查
if command -v ss >/dev/null 2>&1; then
  ss -ltn 2>/dev/null | grep -q ":${PORT} " && die "端口 ${PORT} 已被占用。换端口：PORT=3001 bash deploy.sh"
elif command -v lsof >/dev/null 2>&1; then
  lsof -i ":${PORT}" >/dev/null 2>&1 && die "端口 ${PORT} 已被占用。换端口：PORT=3001 bash deploy.sh"
fi

# ---------- 2. 目录准备 ----------
mkdir -p data/{uploads,chat,gomoku,yu,lx,yu-files} workspace/{memes,pics}
[ -f workspace/AGENTS.md ] || cp -n workspace.example/AGENTS.md workspace/AGENTS.md 2>/dev/null || true
[ -f workspace/MEMORY.md ] || : > workspace/MEMORY.md
ok "数据目录就绪（data/ 与 workspace/）"

# ---------- 3. 配置 ----------
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  warn "已生成 .env（默认未配置 AI 密钥，AI 玩法需要你填入服务地址与密钥）"
fi

# ---------- 4. 语法自检 ----------
info "语法自检…"
for f in server.js yu.js lx.js engine.js content.js; do
  node --check "$f" || die "$f 语法有误，请检查是否被修改"
done
ok "全部服务端文件语法通过"

# 关键补丁块守恒（防止误删外部依赖补丁）
PATCHES=$(grep -o 'PATCH [0-9]/8' server.js | sort -u | wc -l | tr -d ' ')
[ "$PATCHES" = "8" ] || warn "检测到 PATCH 标记只剩 ${PATCHES}/8 —— 有人改过 server.js 的依赖补丁块，可能导致部分功能缺失"
[ "$PATCHES" = "8" ] && ok "依赖补丁块完整（8/8）"

[ "$MODE" = "check" ] && { ok "检查完成，未启动服务"; exit 0; }

# ---------- 5. 启动 ----------
if [ "$MODE" = "daemon" ]; then
  if command -v pm2 >/dev/null 2>&1; then
    pm2 start server.js --name happy-nav --update-env >/dev/null
    pm2 save >/dev/null 2>&1 || true
    ok "已用 pm2 后台启动（pm2 logs happy-nav 看日志）"
  else
    PORT="$PORT" nohup node server.js > happy-nav.log 2>&1 &
    echo $! > happy-nav.pid
    ok "已用 nohup 后台启动（日志：happy-nav.log）"
  fi
  sleep 2
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    ok "健康检查通过 → http://127.0.0.1:${PORT}"
  else
    warn "健康检查未通过，请看日志：pm2 logs happy-nav  或  tail -50 happy-nav.log"
  fi
else
  ok "启动服务（Ctrl+C 停止）→ http://127.0.0.1:${PORT}"
  warn "手机或其他设备访问：把 127.0.0.1 换成本机内网 IP（ip addr / ifconfig 查看）"
  PORT="$PORT" exec node server.js
fi
