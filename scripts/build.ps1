# Awesome Claude - Build Script (PowerShell)
# This script builds the entire application into a single distributable exe

param(
    [switch]$Debug,
    [switch]$SkipMcp
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  Awesome Claude Build Script" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "[1/5] Checking prerequisites..." -ForegroundColor Yellow

$requiredCommands = @("node", "pnpm", "bun", "cargo")
foreach ($cmd in $requiredCommands) {
    if (!(Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: $cmd is not installed or not in PATH" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  All prerequisites found!" -ForegroundColor Green

# Install dependencies
Write-Host ""
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Yellow
Set-Location $RootDir
pnpm install
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "  Dependencies installed!" -ForegroundColor Green

# Build shared package
Write-Host ""
Write-Host "[3/5] Building shared package..." -ForegroundColor Yellow
Set-Location "$RootDir\packages\shared"
pnpm build
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "  Shared package built!" -ForegroundColor Green

# Build MCP server executable
if (!$SkipMcp) {
    Write-Host ""
    Write-Host "[4/5] Building MCP server executable..." -ForegroundColor Yellow
    Set-Location "$RootDir\packages\mcp-server"

    # Create binaries directory in tauri-app
    $binariesDir = "$RootDir\packages\tauri-app\src-tauri\binaries"
    if (!(Test-Path $binariesDir)) {
        New-Item -ItemType Directory -Path $binariesDir -Force | Out-Null
    }

    # Build with Bun
    bun build src/server.ts --compile --outfile="$binariesDir\awesome-claude-mcp-x86_64-pc-windows-msvc.exe" --target=bun-windows-x64
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Warning: Bun compile failed, trying alternative method..." -ForegroundColor Yellow
        # Fallback: use esbuild + pkg or just node
        pnpm build
    }
    Write-Host "  MCP server built!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[4/5] Skipping MCP server build..." -ForegroundColor Yellow
}

# Build Tauri application
Write-Host ""
Write-Host "[5/5] Building Tauri application..." -ForegroundColor Yellow
Set-Location "$RootDir\packages\tauri-app"

if ($Debug) {
    pnpm tauri build --debug
} else {
    pnpm tauri build
}
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "  Tauri application built!" -ForegroundColor Green

# Done
Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Output location:" -ForegroundColor White
Write-Host "  $RootDir\packages\tauri-app\src-tauri\target\release\bundle\" -ForegroundColor Gray
Write-Host ""

Set-Location $RootDir
