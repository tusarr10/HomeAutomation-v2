@echo off
setlocal
cd /d "%~dp0"

echo ==============================================================================
echo  SmartHome Edge Relay Server v2.0.0 (Go Native Edition)
echo ==============================================================================
echo  Starting TCP Node Listener (Port 2001)
echo  Starting HTTP Dashboard and REST API (Port 9200)
echo  Starting Direct Tuya v3.5 Socket & Offline Sync Spooler
echo ==============================================================================

if not exist data mkdir data

.\bin\smarthome-edge.exe -config .\config\config.json

endlocal
