# ==============================================================================
# SmartHome Edge Relay Server — Automated Deployment Script for Router (192.168.1.2)
# Target: T-Media-Mesh-01 (MediaTek MT7986A Filogic 830, OpenWrt 25.12-SNAPSHOT)
# USB Destination: /mnt/web_apps/smarthome-edge
# ==============================================================================

param(
    [string]$RouterIP = "192.168.1.2",
    [string]$User = "root"
)

$ErrorActionPreference = "Stop"

Write-Host ">>> [1/6] Pre-Flight: Checking connection to $RouterIP..." -ForegroundColor Cyan
if (-not (Test-Connection -ComputerName $RouterIP -Count 1 -Quiet)) {
    Write-Error "Router $RouterIP is unreachable over ICMP ping."
}

Write-Host ">>> [2/6] Stopping running edge service on router..." -ForegroundColor Cyan
ssh "${User}@${RouterIP}" "/etc/init.d/smarthome-edge stop"

Write-Host ">>> [3/6] Backing up existing binary on USB storage..." -ForegroundColor Cyan
ssh "${User}@${RouterIP}" "if [ -f /mnt/web_apps/smarthome-edge/bin/smarthome-edge ]; then cp /mnt/web_apps/smarthome-edge/bin/smarthome-edge /mnt/web_apps/smarthome-edge/bin/smarthome-edge.v1.bak; fi"

Write-Host ">>> [4/6] Uploading updated Linux ARM64 binary to USB storage (/mnt/web_apps)..." -ForegroundColor Cyan
scp "$PSScriptRoot/bin/smarthome-edge-linux-arm64" "${User}@${RouterIP}:/mnt/web_apps/smarthome-edge/bin/smarthome-edge"
ssh "${User}@${RouterIP}" "chmod +x /mnt/web_apps/smarthome-edge/bin/smarthome-edge"

Write-Host ">>> [5/6] Syncing Web UI assets and OpenWrt router configuration..." -ForegroundColor Cyan
scp -r "$PSScriptRoot/web" "${User}@${RouterIP}:/mnt/web_apps/smarthome-edge/"
scp "$PSScriptRoot/config/config.openwrt.json" "${User}@${RouterIP}:/mnt/web_apps/smarthome-edge/config/config.json"
ssh "${User}@${RouterIP}" "if [ -d /etc/smarthome-edge ]; then cp /mnt/web_apps/smarthome-edge/config/config.json /etc/smarthome-edge/config.json; fi"

Write-Host ">>> [6/6] Starting updated v2.0.0 edge service..." -ForegroundColor Cyan
ssh "${User}@${RouterIP}" "/etc/init.d/smarthome-edge start"

Start-Sleep -Seconds 2

Write-Host "`n>>> Verifying edge service health..." -ForegroundColor Green
try {
    $res = Invoke-RestMethod -Uri "http://${RouterIP}:9200/api/v1/health" -TimeoutSec 4
    Write-Host "Health Check: OK ($($res.status)), Memory: $($res.memory.allocMb), Uptime: $($res.uptimeSec)s" -ForegroundColor Green
} catch {
    Write-Warning "Health check returned an error or service still initializing: $_"
}

Write-Host "`nDeployment completed successfully! Edge control plane running at http://${RouterIP}:9200" -ForegroundColor Green
