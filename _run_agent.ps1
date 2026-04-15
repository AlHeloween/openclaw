# Run OpenClaw Agent
# Usage: .\_run_agent.ps1 "your message here"

$ErrorActionPreference = "Stop"

$message = $args[0]
if (-not $message) {
    Write-Host "Usage: .\_run_agent.ps1 `"your message here`"" -ForegroundColor Yellow
    exit 1
}

Write-Host "Running agent..." -ForegroundColor Cyan
pnpm openclaw agent --message $message
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
