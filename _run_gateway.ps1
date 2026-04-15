# Run OpenClaw Gateway
# Usage: .\_run_gateway.ps1

$ErrorActionPreference = "Stop"

Write-Host "Starting OpenClaw Gateway..." -ForegroundColor Cyan
pnpm openclaw gateway run
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
