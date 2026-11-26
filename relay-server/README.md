# SmartHome Edge Relay Server (`smarthome-edge`) ⚡

**Ultra-Lightweight, High-Performance Autonomous Edge Control Plane in Pure Go (v1.2.0)**

Engineered specifically to run natively on the **Jio AX6000 JIDU6J01** (MediaTek MT7986A Filogic 830, Quad-core ARM Cortex-A53, 512 MB RAM, OpenWrt 25.12-SNAPSHOT / Linux ARM64).

---

## 🌟 Architecture & Edge Autonomy

```
                                  ┌─────────────────────────────┐
                                  │ Central Server (PC / Cloud) │
                                  │ (Long-Term Analytics & OTA) │
                                  └──────────────▲──────────────┘
                                                 │ Outbound Syncer
                                                 │ (when PC is online)
┌───────────────────────┐         ┌──────────────▼──────────────┐         ┌──────────────────────────┐
│  ESP8266 Fleet Nodes  │         │  Jio AX6000 OpenWrt Router  │         │  Mobile App / Client     │
│  (app2 C++ Firmware)  +-------->│   (Go Edge Broker Process)  │<------->│ (REST & WebSocket :9200) │
└───────────────────────┘  TCP    └──────────────▲──────────────┘         └──────────────────────────┘
                          :2000                  │
                                                 │ Direct Socket (:6668 / LAN)
                                  ┌──────────────▼──────────────┐
                                  │ Wi-Fi Smart Circuit Breaker │
                                  │ (Tuya Protocol v3.5 AES-128)│
                                  └─────────────────────────────┘
```

### Key Highlights
1. **Always-On Local Authority**: Runs directly on the router hardware. Toggling relays, reading sensors, and executing automations work 100% locally without cloud or Central PC dependencies.
2. **Zero-CGO Static Binary (`CGO_ENABLED=0`)**: Fully portable, zero shared-library dependencies, cross-compiled for Linux ARM64, Linux AMD64, and Windows AMD64.
3. **Lean RAM Footprint**: Consumes only ~25–35 MB resident RAM and `< 1%` idle CPU on the MediaTek Filogic 830 MT7986A.
4. **Embedded Pure-Go SQLite (`fleet_edge.db`)**: Enforces `PRAGMA cache_size = -2000` (2 MB cache) and WAL journal mode.
5. **Two-Way Upstream Sync (`internal/syncer`)**: Spools offline events in bounded JSONL (`events.jsonl`) during PC downtime and replays them to Central Server upon link restoration.
6. **Native Tuya Protocol v3.5 Socket**: Direct AES-128-ECB communication with the smart circuit breaker on port `6668` with software contactor interlock.
7. **Procd Watchdog Integration**: Built-in `/api/health/watchdog` health ping for OpenWrt process supervision and automatic self-healing.

---

## 📁 Repository Structure

```
relay-server/
├── bin/                       # Compiled static binaries
│   ├── smarthome-edge         # Linux ARM64 binary (OpenWrt MT7986A)
│   ├── smarthome-edge-linux-arm64
│   ├── smarthome-edge-linux-amd64
│   └── smarthome-edge.exe     # Windows AMD64 binary
├── cmd/edge/                  # Application entrypoint (main.go)
├── config/config.json         # Default configuration file
├── data/events.jsonl          # Persistent offline event spool
├── internal/
│   ├── auth/                  # Token validation & rate limiting
│   ├── config/                # JSON configuration parser
│   ├── db/                    # Pure-Go SQLite driver & schema migrations
│   ├── httpapi/               # REST API, Mobile API & SPA handler
│   ├── queue/                 # Bounded append-only JSONL event spool
│   ├── state/                 # Live state cache, ACK tracking & command queue
│   ├── syncer/                # Outbound Central Server sync & breaker poller
│   ├── tcp/                   # Raw TCP NDJSON gateway (Port 2000)
│   ├── tuya/                  # Native Tuya v3.5 AES-128-ECB socket client
│   └── websocket/             # RFC 6455 pure Go WebSocket hub
├── openwrt/                   # OpenWrt procd service scripts
├── build_production.ps1       # Multi-platform static compilation script
└── TODO.md                    # Relay Server engineering roadmap
```

---

## 📡 Ports & Protocols

| Port | Protocol | Path / Feature | Description |
|:---:|:---:|:---|:---|
| **`9200`** | `HTTP` | `/` | Embedded 17-module Web Dashboard |
| **`9200`** | `HTTP` | `/api/v1/mobile/*` | High-speed mobile API suite (Bootstrap, Toggle, State, Stream) |
| **`9200`** | `HTTP` | `/api/health/watchdog` | OpenWrt procd watchdog monitoring |
| **`9200`** | `WebSocket` | `/ws` | Real-time state push stream |
| **`2000`** | `TCP` | NDJSON | Sub-millisecond raw socket gateway for ESP8266 fleet nodes |
| **`6668`** | `TCP` | AES-128-ECB | Direct socket communication with Tuya Smart Circuit Breaker |

---

## 🚀 Compilation & Deployment

### 1. Cross-Compilation (from Windows/Linux)
Using PowerShell:
```powershell
cd relay-server
.\build_production.ps1
```
This generates:
- `bin/smarthome-edge-linux-arm64` (Linux ARM64 static binary)
- `bin/smarthome-edge-linux-amd64` (Linux AMD64 static binary)
- `bin/smarthome-edge.exe` (Windows AMD64 binary)

### 2. Deploying on OpenWrt Router (MediaTek MT7986A Filogic 830)
```bash
# Copy binary, config, and init script to router
scp bin/smarthome-edge-linux-arm64 root@192.168.1.1:/usr/bin/smarthome-edge
scp config/config.json root@192.168.1.1:/etc/smarthome-edge.json
scp openwrt/smarthome-edge.init root@192.168.1.1:/etc/init.d/smarthome-edge

# SSH into router and enable service
ssh root@192.168.1.1
chmod +x /usr/bin/smarthome-edge /etc/init.d/smarthome-edge
/etc/init.d/smarthome-edge enable
/etc/init.d/smarthome-edge start

# Verify running service
/etc/init.d/smarthome-edge status
```
Access the embedded edge dashboard at **`http://192.168.1.1:9200`**.

### 3. Running Locally on Windows
```powershell
cd relay-server
.\bin\smarthome-edge.exe
```
Access the local edge dashboard at **`http://localhost:9200`**.
