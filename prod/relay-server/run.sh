#!/bin/sh
set -e
cd "$(dirname "$0")"

mkdir -p data

echo "=============================================================================="
echo " SmartHome Edge Relay Server v2.0.0 (Go Native Edition)"
echo "=============================================================================="

# Detect Architecture
ARCH=$(uname -m)
BINARY="./bin/smarthome-edge"

if [ "$ARCH" = "x86_64" ]; then
    if [ -f "./bin/smarthome-edge-linux-amd64" ]; then
        BINARY="./bin/smarthome-edge-linux-amd64"
    fi
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ] || [ "$ARCH" = "armv8" ]; then
    if [ -f "./bin/smarthome-edge-linux-arm64" ]; then
        BINARY="./bin/smarthome-edge-linux-arm64"
    fi
fi

chmod +x "$BINARY"
exec "$BINARY" -config ./config/config.json
