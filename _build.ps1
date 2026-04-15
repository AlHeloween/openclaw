# Build OpenClaw
# Usage: .\_build.ps1

$ErrorActionPreference = "Stop"

Write-Host "Installing dependencies..." -ForegroundColor Cyan
$env:npm_config_arch = "x64"
$env:npm_config_platform = "win32"
pnpm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building..." -ForegroundColor Cyan
pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Build complete." -ForegroundColor Green
