# ============================================================
# 和鱼的快乐导航 · 一键启动（Windows PowerShell）
#
#   右键「使用 PowerShell 运行」，或在目录里执行：
#       powershell -ExecutionPolicy Bypass -File .\start.ps1
#
#   只做环境检查 + 目录准备 + 语法自检 + 启动，不改系统设置。
# ============================================================
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Say-Info($m) { Write-Host "[信息] $m" -ForegroundColor Cyan }
function Say-Ok($m)   { Write-Host "[成功] $m" -ForegroundColor Green }
function Say-Warn($m) { Write-Host "[注意] $m" -ForegroundColor Yellow }
function Say-Die($m)  { Write-Host "[失败] $m" -ForegroundColor Red; exit 1 }

$port = if ($env:PORT) { $env:PORT } else { '3000' }

# ---------- 1. 环境检查 ----------
Say-Info '检查运行环境…'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Say-Die '未找到 Node.js。请先安装 Node 18+：https://nodejs.org/' }

$ver = (& node -p "process.versions.node.split('.')[0]").Trim()
if ([int]$ver -lt 18) { Say-Die "Node 版本过低（当前 $(& node -v)），需要 18 或更高" }
Say-Ok "Node $(& node -v)"

$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($busy) { Say-Die "端口 $port 已被占用。换端口：`$env:PORT=3001; .\start.ps1" }

# ---------- 2. 目录准备 ----------
foreach ($d in @('data','data\uploads','data\chat','data\gomoku','data\yu','data\lx','data\yu-files','workspace','workspace\memes','workspace\pics')) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}
if (-not (Test-Path 'workspace\AGENTS.md') -and (Test-Path 'workspace.example\AGENTS.md')) {
  Copy-Item 'workspace.example\AGENTS.md' 'workspace\AGENTS.md'
}
if (-not (Test-Path 'workspace\MEMORY.md')) { New-Item -ItemType File -Path 'workspace\MEMORY.md' | Out-Null }
Say-Ok '数据目录就绪（data\ 与 workspace\）'

# ---------- 3. 配置 ----------
if (-not (Test-Path '.env') -and (Test-Path '.env.example')) {
  Copy-Item '.env.example' '.env'
  Say-Warn '已生成 .env（默认未配置 AI 密钥，AI 玩法需要填入服务地址与密钥）'
}

# ---------- 4. 语法自检 ----------
Say-Info '语法自检…'
foreach ($f in @('server.js','yu.js','lx.js','engine.js','content.js')) {
  & node --check $f
  if ($LASTEXITCODE -ne 0) { Say-Die "$f 语法有误" }
}
Say-Ok '全部服务端文件语法通过'

$patches = (& node -e "const s=require('fs').readFileSync('server.js','utf8');const m=s.match(/PATCH [0-9]\/8/g)||[];console.log(new Set(m).size)").Trim()
if ($patches -eq '8') { Say-Ok '依赖补丁块完整（8/8）' } else { Say-Warn "依赖补丁块只剩 $patches/8，可能有功能缺失" }

# ---------- 5. 启动 ----------
Say-Ok "启动服务（关闭窗口即停止）→ http://127.0.0.1:$port"
Say-Warn '手机或其他设备访问：把 127.0.0.1 换成本机内网 IP（ipconfig 查看 IPv4 地址）'
$env:PORT = $port
& node server.js
