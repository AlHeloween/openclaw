# Install OpenClaw globally on Windows
# Usage: .\_install.ps1

$ErrorActionPreference = "Stop"

Write-Host "Installing dependencies (Windows platform only)..." -ForegroundColor Cyan
$env:npm_config_arch = "x64"
$env:npm_config_platform = "win32"
pnpm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building..." -ForegroundColor Cyan
pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Linking globally via npm (creates Windows shim)..." -ForegroundColor Cyan
npm link
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Installation complete. Run 'openclaw --version' to verify." -ForegroundColor Green
