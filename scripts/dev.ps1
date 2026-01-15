# Awesome Claude - Development Script (PowerShell)
# Starts both MCP server and Tauri app in development mode

param(
    [switch]$McpOnly,
    [switch]$AppOnly
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  Awesome Claude Dev Mode" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Install dependencies if needed
if (!(Test-Path "$RootDir\node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    Set-Location $RootDir
    pnpm install
}

# Build shared package
Write-Host "Building shared package..." -ForegroundColor Yellow
Set-Location "$RootDir\packages\shared"
pnpm build

if ($McpOnly) {
    Write-Host ""
    Write-Host "Starting MCP server only..." -ForegroundColor Green
    Set-Location "$RootDir\packages\mcp-server"
    pnpm dev
} elseif ($AppOnly) {
    Write-Host ""
    Write-Host "Starting Tauri app only..." -ForegroundColor Green
    Write-Host "(Make sure MCP server is running separately)" -ForegroundColor Yellow
    Set-Location "$RootDir\packages\tauri-app"
    pnpm tauri:dev
} else {
    Write-Host ""
    Write-Host "Starting both MCP server and Tauri app..." -ForegroundColor Green
    Write-Host ""
    Write-Host "TIP: Run in separate terminals for better logging:" -ForegroundColor Yellow
    Write-Host "  Terminal 1: .\scripts\dev.ps1 -McpOnly" -ForegroundColor Gray
    Write-Host "  Terminal 2: .\scripts\dev.ps1 -AppOnly" -ForegroundColor Gray
    Write-Host ""

    # Start MCP server in background
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir\packages\mcp-server'; pnpm dev"

    # Wait a bit for MCP server to start
    Start-Sleep -Seconds 3

    # Start Tauri app
    Set-Location "$RootDir\packages\tauri-app"
    pnpm tauri:dev
}

Set-Location $RootDir
