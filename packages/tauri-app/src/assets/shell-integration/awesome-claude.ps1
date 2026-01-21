# Awesome Claude Terminal Integration for PowerShell
# Add this to your PowerShell profile: . "path\to\awesome-claude.ps1"

# OSC 133 escape sequences for block detection
$script:OSC = [char]0x1b + "]"
$script:ST = [char]0x1b + "\"  # String Terminator

function Get-OSC133 {
    param([string]$Code, [string]$Param = "")
    if ($Param) {
        return "$script:OSC`133;$Code;$Param$script:ST"
    }
    return "$script:OSC`133;$Code$script:ST"
}

# Custom prompt function
function global:prompt {
    $lastExitCode = $LASTEXITCODE
    $cwd = (Get-Location).Path

    # Build prompt string so PSReadLine can track visible length correctly.
    $promptText = "PS $cwd> "
    return "$(Get-OSC133 -Code "A")$promptText$(Get-OSC133 -Code "B")"
}

# Hook for command execution
$script:PreCommandTime = $null

# PreCommandHandler - called before command execution
function PreCommandHandler {
    $script:PreCommandTime = Get-Date
    # OSC 133;C - Command execution start
    Write-Host -NoNewline "$(Get-OSC133 -Code "C")"
}

# PostCommandHandler - called after command execution
function PostCommandHandler {
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) { $exitCode = 0 }

    # OSC 133;D - Command finished with exit code
    Write-Host -NoNewline "$(Get-OSC133 -Code "D" -Param $exitCode.ToString())"
}

# Register the handlers using PSReadLine if available
if (Get-Module -ListAvailable -Name PSReadLine) {
    # Set handler for when Enter is pressed
    Set-PSReadLineKeyHandler -Key Enter -ScriptBlock {
        PreCommandHandler
        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
    }

    # Use AddToHistoryHandler to detect command completion
    Set-PSReadLineOption -AddToHistoryHandler {
        param([string]$line)
        PostCommandHandler
        return $true
    }
}

# Provide TERM for tools that rely on terminal capabilities.
if (-not $env:TERM) {
    $env:TERM = "xterm-256color"
}

Write-Host "Awesome Claude shell integration loaded" -ForegroundColor Green
