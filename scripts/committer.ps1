param()

# Prevent recursive calls: if OPENCLAW_COMMITTER_SH_RUNNING is set, we're already inside the bash wrapper
if ($env:OPENCLAW_COMMITTER_SH_RUNNING -eq "1") {
    Write-Error "committer.ps1 called recursively. This should not happen."
    exit 1
}

# Find git bash: check common installation paths
$bashPath = $null
if (Test-Path "C:\Program Files\Git\bin\bash.exe") {
    $bashPath = "C:\Program Files\Git\bin\bash.exe"
}
if (-not $bashPath -and (Test-Path "C:\Program Files (x86)\Git\bin\bash.exe")) {
    $bashPath = "C:\Program Files (x86)\Git\bin\bash.exe"
}
if (-not $bashPath) {
    $bashPath = (Get-Command bash -ErrorAction SilentlyContinue).Source
}

if (-not $bashPath) {
    Write-Error "Git Bash not found. Install Git for Windows from https://git-scm.com/download/win"
    exit 1
}

# Get the directory of this script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Set environment variable to prevent recursive calls
$env:OPENCLAW_COMMITTER_SH_RUNNING = "1"

# Execute the bash script, passing all arguments
& $bashPath -c "& \"$scriptDir/committer.sh`" `"$args`""
