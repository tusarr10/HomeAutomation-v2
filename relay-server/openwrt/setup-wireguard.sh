#!/bin/sh
# ==============================================================================
# OpenWrt WireGuard Remote Access Setup for SmartHome Edge Broker
# Target Architecture: MediaTek MT7986A Filogic 830 (Jio AX6000 OpenWrt)
# Task RS-F2: Zero-Trust Remote Mobile Access without Port Forwarding
# ==============================================================================

set -e

WG_IF="wg0"
WG_PORT=51820
WG_NET="10.200.0.1/24"
CLIENT_IP="10.200.0.2/32"
CONF_DIR="/etc/smarthome-edge"

echo "=== [1/5] Installing OpenWrt WireGuard Packages ==="
opkg update
opkg install kmod-wireguard wireguard-tools luci-app-wireguard qrencode

mkdir -p "$CONF_DIR"

echo "=== [2/5] Generating Cryptographic Keypairs ==="
SERVER_KEY=$(wg genkey)
SERVER_PUB=$(echo "$SERVER_KEY" | wg pubkey)
CLIENT_KEY=$(wg genkey)
CLIENT_PUB=$(echo "$CLIENT_KEY" | wg pubkey)

echo "=== [3/5] Configuring UCI Network & WireGuard Interface ($WG_IF) ==="
uci -q delete network.${WG_IF} || true
uci set network.${WG_IF}=interface
uci set network.${WG_IF}.proto='wireguard'
uci set network.${WG_IF}.private_key="$SERVER_KEY"
uci set network.${WG_IF}.listen_port="$WG_PORT"
uci add_list network.${WG_IF}.addresses="$WG_NET"

# Add mobile client peer
uci -q delete network.wg_client || true
uci set network.wg_client=wireguard_${WG_IF}
uci set network.wg_client.public_key="$CLIENT_PUB"
uci set network.wg_client.description="Mobile_Admin_App"
uci add_list network.wg_client.allowed_ips="$CLIENT_IP"
uci set network.wg_client.route_allowed_ips='1'
uci commit network

echo "=== [4/5] Configuring OpenWrt Firewall Rules (Access to 9200 & 2001) ==="
uci -q delete firewall.wg_zone || true
uci set firewall.wg_zone=zone
uci set firewall.wg_zone.name='vpn'
uci set firewall.wg_zone.input='ACCEPT'
uci set firewall.wg_zone.output='ACCEPT'
uci set firewall.wg_zone.forward='ACCEPT'
uci add_list firewall.wg_zone.network="$WG_IF"

uci -q delete firewall.wg_inbound || true
uci set firewall.wg_inbound=rule
uci set firewall.wg_inbound.name='Allow-WireGuard-Inbound'
uci set firewall.wg_inbound.src='wan'
uci set firewall.wg_inbound.dest_port="$WG_PORT"
uci set firewall.wg_inbound.proto='udp'
uci set firewall.wg_inbound.target='ACCEPT'
uci commit firewall

/etc/init.d/network restart
/etc/init.d/firewall restart

echo "=== [5/5] Generating Mobile Client Configuration File ==="
WAN_IP=$(ip -4 addr show dev wan | grep inet | awk '{print $2}' | cut -d/ -f1 || echo "YOUR_PUBLIC_ROUTER_IP")

cat <<EOF > "$CONF_DIR/mobile-wireguard.conf"
[Interface]
PrivateKey = $CLIENT_KEY
Address = 10.200.0.2/24
DNS = 10.200.0.1

[Peer]
PublicKey = $SERVER_PUB
Endpoint = $WAN_IP:$WG_PORT
AllowedIPs = 10.200.0.0/24
PersistentKeepalive = 25
EOF

echo ""
echo "======================================================================="
echo "WireGuard Server Configured Successfully!"
echo "Mobile Client Config saved to: $CONF_DIR/mobile-wireguard.conf"
echo "SmartHome App LAN Gateway on VPN: http://10.200.0.1:9200"
echo "======================================================================="
if command -v qrencode >/dev/null 2>&1; then
    echo "Scan this QR code in the WireGuard Mobile App (iOS / Android):"
    qrencode -t ansiutf8 < "$CONF_DIR/mobile-wireguard.conf"
fi
