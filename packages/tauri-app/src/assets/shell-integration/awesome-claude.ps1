# Awesome Claude Terminal Integration for PowerShell
# Add this to your PowerShell profile: . "path\to\awesome-claude.ps1"

# OSC 133 escape sequences for block detection
$script:OSC = [char]0x1b + "]"
$script:ST = [char]0x1b + "\"  # String Terminator

function Send-OSC133 {
    param([string]$Code, [string]$Param = "")
    if ($Param) {
        Write-Host -NoNewline "$script:OSC`133;$Code;$Param$script:ST"
    } else {
        Write-Host -NoNewline "$script:OSC`133;$Code$script:ST"
    }
}

# Custom prompt function
function global:prompt {
    $lastExitCode = $LASTEXITCODE
    $cwd = (Get-Location).Path

    # OSC 133;A - Prompt start
    Send-OSC133 -Code "A"

    # Your actual prompt (customize as needed)
    $promptText = "PS $cwd> "
    Write-Host -NoNewline $promptText

    # OSC 133;B - Command input start
    Send-OSC133 -Code "B"

    # Return empty string (we already wrote the prompt)
    return " "
}

# Hook for command execution
$script:PreCommandTime = $null

# PreCommandHandler - called before command execution
function PreCommandHandler {
    $script:PreCommandTime = Get-Date
    # OSC 133;C - Command execution start
    Send-OSC133 -Code "C"
}

# PostCommandHandler - called after command execution
function PostCommandHandler {
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) { $exitCode = 0 }

    # OSC 133;D - Command finished with exit code
    Send-OSC133 -Code "D" -Param $exitCode.ToString()
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

Write-Host "Awesome Claude shell integration loaded" -ForegroundColor Green
