# SmartHome v2: Multi-Tier Autonomous Home Automation Platform 🏠⚡

[![Platform](https://img.shields.io/badge/Platform-ESP8266%20%7C%20OpenWrt%20ARM64%20%7C%20Node.js%20%7C%20Go-blue.svg)](https://github.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Production-Ready%20v2.0-emerald.svg)](prod/)

A robust, enterprise-grade, multi-tier residential home automation ecosystem designed for high availability, sub-millisecond local latency, and zero cloud dependency.

---

## 🌟 System Architecture Overview

The system operates across **three synchronized tiers**:

```
                                  ┌─────────────────────────────────────┐
                                  │      TIER 1: CENTRAL SERVER         │
                                  │   (Node.js 22/24 + node:sqlite)     │
                                  │  - Fleet Brain & RBAC Authorization │
                                  │  - Long-Term Power Analytics (24h)  │
                                  │  - Interactive 2D/3D Blueprint GUI  │
                                  │  - PWA Mobile & Responsive Web UI   │
                                  │    HTTP/WS :9100 | TCP :2000        │
                                  └──────────────▲───────▲──────────────┘
                                                 │       │
                     Two-Way Event Spool Sync    │       │ LAN Push Telemetry
                     & Live State Reconciliation │       │ (when PC is online)
                                                 │       │
                                  ┌──────────────▼───────┴──────────────┐
                                  │       TIER 2: EDGE RELAY SERVER     │
                                  │ (Go Native Static Binary, Zero-CGO) │
                                  │   Jio AX6000 OpenWrt MT7986A Router │
                                  │  - Autonomous Local Control Plane   │
                                  │  - Embedded SQLite (fleet_edge.db)  │
                                  │  - 17-Module Embedded Local UI      │
                                  │  - High-Speed Mobile API Suite      │
                                  │  - Native Tuya v3.5 Socket (Port 6668)
                                  │    HTTP/WS :9200 | TCP :2000        │
                                  └──────────────▲──────────────────────┘
                                                 │
                                                 │ Bidirectional Raw TCP NDJSON
                                                 │ (< 1ms Latency)
                                                 │
            ┌────────────────────────────────────┴────────────────────────────────────┐
            │                                                                         │
            ▼                                                                         ▼
┌──────────────────────────────┐                                          ┌──────────────────────────────┐
│     TIER 3: FLEET NODES      │                                          │  WI-FI SMART CIRCUIT BREAKER │
│   (ESP8266 C++ / Arduino)    │                                          │    (Tuya Protocol v3.5)      │
│ - NodeMCU 4MB Flash          │                                          │ - Feeder Voltage, Current,   │
│ - PCF8574 8-Relay Expanders  │                                          │   Active Power, Frequency,   │
│ - IR Learner & Transmitter   │                                          │   Leakage mA, Temp, Contactor│
│ - LittleFS In-Memory Config  │                                          │ - Software Interlock Lockout │
└──────────────────────────────┘                                          └──────────────────────────────┘
```

---

## 🚀 Key Highlights & Capabilities

### 1. High Availability & Edge Autonomy
- **Always-On Local Authority**: The Go-native Edge Relay Server runs directly on the home router (Jio AX6000 MediaTek Filogic 830 MT7986A ARM64).
- **Zero Cloud & Zero Central PC Dependency**: All relays can be toggled, sensors read, and automations executed locally on Port `9200` even if the Central PC is off or internet WAN is completely down.
- **Two-Way Upstream Sync (`CS-F7` / `CS-F8`)**: When the Central PC powers on, the Relay Server replays all offline spooled events and pushes an instantaneous `edge_snapshot` of the entire fleet.

### 2. Long-Term Energy & Power Analytics (`CS-F1`)
- **Continuous 24-Hour Hourly Profile**: Full 24-hour timeline with zero-filling, peak wattage demand tracking, and SVG bar visualization.
- **Glitch-Free Trapezoidal Integration**: Calculates energy consumption using continuous active power integration ($E = \frac{P_{\text{avg}} \times \Delta t}{3,600,000}\text{ kWh}$) with hardware register anomaly filters.
- **Period Mean & Summary Metrics**: Displays 24h total kWh, period mean load wattage, peak demand wattage, mean line voltage, and estimated electricity costs.

### 3. Interactive 2D Blueprint & 3D Isometric Room GUI
- **Realistic 2D Blueprint**: Renders walls, bay window, spinning ceiling fans, glowing bulbs, and smart TV with zero horizontal overflow on mobile screens down to 320px.
- **3D Isometric Visualizer**: Interactive 3D perspective stage with rotation controls (`↺`, `↻`, `Reset`).
- **In-Canvas Appliance Customizer**: 15+ appliance presets, 25+ emoji icons, and live hardware relay reassignment.

### 4. Progressive Web App (PWA) & Mobile Optimization
- Standalone PWA installation on iOS and Android with `manifest.json` and offline-resilient `sw.js` caching.
- Off-canvas slide-out drawer navigation (`☰`) with backdrop tap-to-dismiss and automatic closure on link selection.

---

## 📡 Ports & Protocols Matrix

| Port | Protocol | Tier / Service | Description |
|:---:|:---:|:---|:---|
| **`9100`** | `HTTP` / `WebSocket` | Central Server (`central-server`) | Main Web Dashboard, REST API (`/api/v1/*`), Live WebSocket (`/api/v1/ws`) |
| **`2000`** | `TCP` (NDJSON) | Central Server / Relay Server | Raw framed TCP telemetry listener for ESP8266 fleet nodes |
| **`9200`** | `HTTP` / `WebSocket` | Edge Relay Server (`relay-server`) | Local autonomous router dashboard, Mobile REST API (`/api/v1/mobile/*`), SSE stream |
| **`8085`** | `HTTP` | Local Tuya Portal (`smart_breaker_portal`) | Python LAN HTTP microservice interface to Wi-Fi circuit breaker |
| **`6668`** | `TCP` (AES-128-ECB) | Direct Socket (`relay-server`) | Native Tuya Protocol v3.5 encrypted socket to Smart Circuit Breaker |

---

## 📁 Repository Structure

```
HomeAutomation v2/
├── central-server/            # Tier 1: Central Fleet Brain (Node.js 22/24, native node:sqlite)
│   ├── public/                # Web Dashboard, PWA Manifest, Service Worker & GUI Assets
│   ├── src/                   # NodeManager, TCP Server, Tuya Bridge, REST Routers, Database
│   ├── config.json            # Central Server Network & Storage Configuration
│   ├── server.js              # Central Server Application Entrypoint
│   └── TODO.md                # Central Server Roadmap & Task Checklist
├── relay-server/              # Tier 2: Autonomous Edge Broker (Pure Go, Zero-CGO, OpenWrt ARM64)
│   ├── bin/                   # Compiled static binaries (ARM64 OpenWrt, AMD64 Windows/Linux)
│   ├── cmd/edge/              # Go application entrypoint
│   ├── internal/              # State manager, Tuya v3.5 client, syncer, DB, TCP gateway
│   ├── openwrt/               # OpenWrt procd service scripts & network utilities
│   ├── build_production.ps1   # Multi-platform static compilation script
│   └── TODO.md                # Relay Server Roadmap & Task Checklist
├── node-firmware/             # Tier 3: ESP8266 Microcontroller Firmware (C++ / Arduino)
│   ├── src/                   # App2 C++ firmware engine, LittleFS, IR learner, PCF8574
│   └── platformio.ini         # Target board build definitions (esp8266_4m, nodemcu_pcf8574)
├── smart_breaker_portal/      # Local Python helper bridge for Tuya Smart Circuit Breaker
├── prod/                      # Ready-to-deploy production distribution bundles
└── TODO_INTEGRATION_LIST.md   # Unified cross-tier milestone & integration matrix
```

---

## 🛠️ Quick Start

### 1. Central Server (Tier 1)
```powershell
# Navigate to Central Server
cd central-server

# Install dependencies (Node.js 22+ recommended)
npm install --omit=dev

# Start Central Server with native SQLite support
node --experimental-sqlite server.js
```
Open **`http://localhost:9100`** in any modern web browser or mobile phone.

### 2. Edge Relay Server (Tier 2)

#### Running on Windows:
```powershell
cd relay-server
.\bin\smarthome-edge.exe
```

#### Deploying on OpenWrt Router (MediaTek MT7986A Filogic 830):
```bash
# Copy binary and configuration to OpenWrt router
scp relay-server/bin/smarthome-edge-linux-arm64 root@192.168.1.1:/usr/bin/smarthome-edge
scp relay-server/config/config.json root@192.168.1.1:/etc/smarthome-edge.json
scp relay-server/openwrt/smarthome-edge.init root@192.168.1.1:/etc/init.d/smarthome-edge

# Enable and start service via OpenWrt procd
ssh root@192.168.1.1
chmod +x /usr/bin/smarthome-edge /etc/init.d/smarthome-edge
/etc/init.d/smarthome-edge enable
/etc/init.d/smarthome-edge start
```
Access the autonomous edge UI at **`http://192.168.1.1:9200`**.

---

## 📦 Production Distribution Bundle (`prod/`)

Pre-compiled, validated, and ready-to-flash production artifacts are organized in [prod/](prod/README.md):
- **`prod/central-server/`**: Complete standalone Node.js server with all PWA assets and SQLite schema migrations.
- **`prod/relay-server/`**: Stripped static binaries for Linux ARM64 (OpenWrt), Linux AMD64, and Windows AMD64.
- **`prod/node/`**: Flashed firmware binaries (`v1.7.0`) and LittleFS images for `esp8266_4m` and `nodemcu_pcf8574`.

Refer to [prod/README.md](prod/README.md) for step-by-step production rollout instructions and verification checklists.

---

## 📄 License
This project is licensed under the MIT License.
