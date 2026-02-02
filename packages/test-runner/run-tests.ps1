# Awesome Claude Test Runner Script
# This script starts the Tauri app, runs tests, and cleans up

$ErrorActionPreference = "Stop"

Write-Host "`n  Awesome Claude Test Runner" -ForegroundColor Cyan
Write-Host "  =========================`n" -ForegroundColor Cyan

# Check if Tauri app is already running
$wsTest = $null
try {
    $wsTest = New-Object System.Net.Sockets.TcpClient
    $wsTest.Connect("127.0.0.1", 61987)
    $wsTest.Close()
    Write-Host "  [OK] WebSocket server already running on port 61987" -ForegroundColor Green
    $appAlreadyRunning = $true
} catch {
    Write-Host "  [..] WebSocket server not running, starting Tauri app..." -ForegroundColor Yellow
    $appAlreadyRunning = $false
}

$tauriProcess = $null

if (-not $appAlreadyRunning) {
    # Start Tauri app in background
    Write-Host "  [..] Building and starting Tauri app (this may take a while)..." -ForegroundColor Yellow

    Push-Location "$PSScriptRoot\..\tauri-app"
    $tauriProcess = Start-Process -FilePath "pnpm" -ArgumentList "tauri", "dev" -PassThru -WindowStyle Hidden
    Pop-Location

    # Wait for WebSocket server to be ready
    Write-Host "  [..] Waiting for WebSocket server..." -ForegroundColor Yellow
    $maxWait = 120  # 2 minutes max
    $waited = 0

    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 2
        $waited += 2

        try {
            $wsTest = New-Object System.Net.Sockets.TcpClient
            $wsTest.Connect("127.0.0.1", 61987)
            $wsTest.Close()
            Write-Host "  [OK] WebSocket server ready after ${waited}s" -ForegroundColor Green
            break
        } catch {
            Write-Host "  [..] Still waiting... (${waited}s)" -ForegroundColor Gray
        }
    }

    if ($waited -ge $maxWait) {
        Write-Host "  [ERROR] Timeout waiting for Tauri app to start" -ForegroundColor Red
        if ($tauriProcess) {
            Stop-Process -Id $tauriProcess.Id -Force -ErrorAction SilentlyContinue
        }
        exit 1
    }
}

# Run tests
Write-Host "`n  Running tests..." -ForegroundColor Cyan
Push-Location $PSScriptRoot
$testResult = 0

try {
    pnpm test:session
    $testResult = $LASTEXITCODE
} catch {
    Write-Host "  [ERROR] Test execution failed: $_" -ForegroundColor Red
    $testResult = 1
}

Pop-Location

# Cleanup (only if we started the app)
if ($tauriProcess -and -not $appAlreadyRunning) {
    Write-Host "`n  [..] Stopping Tauri app..." -ForegroundColor Yellow
    Stop-Process -Id $tauriProcess.Id -Force -ErrorAction SilentlyContinue
    # Also kill any child processes
    Get-Process | Where-Object { $_.ProcessName -like "*awesome-claude*" } | Stop-Process -Force -ErrorAction SilentlyContinue
}

if ($testResult -eq 0) {
    Write-Host "`n  All tests passed!" -ForegroundColor Green
} else {
    Write-Host "`n  Some tests failed." -ForegroundColor Red
}

exit $testResult
