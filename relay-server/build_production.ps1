$ErrorActionPreference = "Stop"

$buildTime = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$commit = "6737ad5"
$ver = "2.0.0"
$ldflags = "-s -w -X smarthome-edge/internal/version.Version=$ver -X smarthome-edge/internal/version.BuildType=production -X smarthome-edge/internal/version.BuildTime=$buildTime -X smarthome-edge/internal/version.GitCommit=$commit"

Set-Location -Path $PSScriptRoot
New-Item -ItemType Directory -Force -Path "bin" | Out-Null

Write-Host ">>> [1/3] Compiling Windows AMD64 Production Binary..." -ForegroundColor Cyan
$env:CGO_ENABLED = "0"
$env:GOOS = "windows"
$env:GOARCH = "amd64"
go build -ldflags "$ldflags" -o "bin/smarthome-edge.exe" "./cmd/edge"

Write-Host ">>> [2/3] Compiling Linux ARM64 (OpenWrt MT7986A Filogic 830) Binary..." -ForegroundColor Cyan
$env:CGO_ENABLED = "0"
$env:GOOS = "linux"
$env:GOARCH = "arm64"
go build -ldflags "$ldflags" -o "bin/smarthome-edge-linux-arm64" "./cmd/edge"

Write-Host ">>> [3/3] Compiling Linux AMD64 (Server / Cloud / Docker) Binary..." -ForegroundColor Cyan
$env:CGO_ENABLED = "0"
$env:GOOS = "linux"
$env:GOARCH = "amd64"
go build -ldflags "$ldflags" -o "bin/smarthome-edge-linux-amd64" "./cmd/edge"

Write-Host ">>> Production compilation finished successfully!" -ForegroundColor Green
Get-ChildItem -Path "bin" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
