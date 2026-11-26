#!/bin/sh
# ==============================================================================
# OpenWrt Tailscale Zero-Trust Setup for SmartHome Edge Broker
# Target Architecture: MediaTek MT7986A Filogic 830 (Jio AX6000 OpenWrt)
# Task RS-F2: Zero-Trust Remote Mobile Access via Mesh VPN
# ==============================================================================

set -e

AUTH_KEY="$1"

if [ -z "$AUTH_KEY" ]; then
    echo "Usage: $0 <tskey-auth-XXXXXXXXXXXX>"
    echo "Generate an ephemeral or reusable auth key from: https://login.tailscale.com/admin/settings/keys"
    exit 1
fi

echo "=== [1/4] Installing Tailscale Package ==="
opkg update
opkg install tailscale iptables-nft

echo "=== [2/4] Enabling and Starting Tailscale Daemon ==="
/etc/init.d/tailscale enable
/etc/init.d/tailscale start

sleep 3

echo "=== [3/4] Authenticating with Tailnet ==="
tailscale up --authkey="$AUTH_KEY" --hostname="smarthome-edge-router" --accept-routes

echo "=== [4/4] Tailscale Connected! ==="
TS_IP=$(tailscale ip -4)
echo "======================================================================="
echo "SmartHome Edge Router Tailscale IPv4: $TS_IP"
echo "Direct Secure Dashboard: http://$TS_IP:9200"
echo "Mobile REST API URL:     http://$TS_IP:9200/api/v1/mobile"
echo "======================================================================="
