# SmartHome System: Master Integration & Implementation Roadmap

**Document Version:** `3.6.0`  
**Target Systems:** Central Fleet Server (`central-server/`), Edge Relay Server (`relay-server/`), and ESP Microcontroller Firmware (`node-firmware/`)  
**Status:** All Core, PWA, and Edge Gateway Features Live-Verified; Continuous Task Tracking Enabled  

---

## 1. System Implementation Summary

| Component | Scope | Total Milestones | Completed | Pending | Health / Status |
|:---|:---|:---:|:---:|:---:|:---:|
| **Central Fleet Server** (`central-server/`) | Backend, REST APIs, SQLite DB, Dual-Auth, LittleFS, Pin Sync, Breaker | 13 | **13** | **0** | 🟢 **100% Live-Verified** |
| **Edge Relay Server** (`relay-server/`) | Go Native Edge Binary, Port 9200 UI, Mobile API Suite, Port 2000 TCP | 8 | **8** | **0** | 🟢 **100% Live-Verified** |
| **Node Firmware** (`node-firmware/`) | ESP8266 / NodeMCU C++ Firmware Codebase (`esp8266_4m`) | 8 | **8** | **0** | 🟢 **100% Live-Verified** |
| **GUI & PWA Platform** | 2D Blueprint, 3D Isometric, Appliance Customization, PWA & Mobile Drawer | 6 | **6** | **0** | 🟢 **100% Live-Verified** |

---

## 2. PART A: Central Server (`central-server/`) Features & Status

All wire APIs, database schemas, bidirectional pin synchronizations, room GUI visualizers, and PWA mobile capabilities are fully implemented in `central-server/` and verified against the live fleet.

| # | Feature / Milestone | Central Server Implementation | Status | Live Verification Result |
|:---:|:---|:---|:---:|:---|
| **CS-1** | **Bidirectional GPIO Pin Sync** | `syncNodePins(nodeId)` in `nodeManager.js`, `upsertRelayFromChannel` in `database.js` | ✅ **DONE** | Live verified: All 12 channels (PCF 100-107, GPIO 16, IR RX 14, IR TX 13, ADC 17) synced into SQLite; renamed CH9 pushed back to node in 1ms. |
| **CS-2** | **Dual-Auth Permanent Pairing** | `pairNode(nodeId)` & `unpairNode(nodeId)` in `nodeManager.js`, `updateNodeServerKey` in `database.js` | ✅ **DONE** | Live verified: Paired `NODE-8C4F00565D72` with 32-char crypto key; node returned `{"paired": true}`. |
| **CS-3** | **Automatic Header Injection** | `getNodeAuthHeaders(node)` in `nodeManager.js` injecting `X-Server-Key` & `Authorization: Bearer` | ✅ **DONE** | Live verified: All outbound HTTP calls automatically pass permanent server key with zero session timeouts. |
| **CS-4** | **I2C Bus Scanner & Auto-Provision** | `GET /api/v1/nodes/:nodeId/i2c/scan`, `POST /api/v1/nodes/:nodeId/i2c/auto-channels` | ✅ **DONE** | Live verified: Detected 1 device on I2C bus (`0x20` - PCF8574 expander); generated 8 expansion channels (GPIO 100–107). |
| **CS-5** | **Hardware Serial Logs Viewer** | `GET /api/v1/nodes/:nodeId/hardware-logs` & `showNodeLogsModal()` in `app.js` | ✅ **DONE** | Live verified: Renders live circular RAM logs from `/api/logs` with timestamps & status colors. |
| **CS-6** | **IR Code Learner & Blaster** | `POST /ir/train/start`, `GET /ir/train/result`, `POST /ir/transmit`, `showNodeIrModal()` | ✅ **DONE** | Live verified: Interactive countdown polling, virtual remote storage in LittleFS, and direct IR signal blasting. |
| **CS-7** | **LittleFS File Explorer** | `GET /fs/list`, `GET /fs/download`, `POST /fs/upload`, `POST /fs/save-content` | ✅ **DONE** | Live verified: Fast-path direct edit (`<= 5KB`) and file browsing across all flash files. |
| **CS-8** | **Tuya Smart Breaker Isolation** | LAN bridge on port 8085 (`NODE-30487DE85D5C` at `192.168.1.25`); strict software lock | ✅ **DONE** | Live verified: Real-time electrical telemetry (V, A, W, Hz, mA, °C); breaker stays permanently ON & protected. |
| **CS-9** | **Dedicated Sensors & Telemetry UI** | Decoupled controllable relay switches from sensor inputs; added `Sensors & Telemetry` tab | ✅ **DONE** | Live verified: Live AC RMS / DC voltages, IR receiver codes, calibration editor, and pin matrix view. |
| **CS-10**| **Interactive 2D / 3D Room GUI** | Full architectural 2D blueprint (walls, bay window, glows, fan spins) + 3D isometric view | ✅ **DONE** | Live verified: Smooth switching between 2D Blueprint, 3D Isometric, and direct appliance control. |
| **CS-11**| **Appliance Customization & Presets** | In-canvas appliance modal (`openEditRoomApplianceModal`) with 15+ presets and 25+ emojis | ✅ **DONE** | Live verified: Custom icon, label, and live hardware node/relay reassignment. |
| **CS-12**| **PWA & Mobile/Tablet Optimization** | `manifest.json`, `sw.js` cache, off-canvas drawer (`☰`), responsive auto-scaling stages | ✅ **DONE** | Live verified: Standalone PWA install ready; smooth drawer navigation and responsive layout on mobile (390px). |
| **CS-13**| **Long-Term Energy Analytics & Cost**| SQLite `energy_history` & `energy_settings`, REST endpoints, SVG hourly/daily chart, tariff modal | ✅ **DONE** | Live verified: Trapezoidal active power integration, anomaly rejection, continuous 24h hourly report (zero-filled), KPI cards, table summary footer row, live dashboard strip. |

---

## 3. PART B: Autonomous Edge Relay Server (`relay-server/`) Features & Status

The standalone Go-native Edge Relay Server runs autonomously on router hardware (ARM64 OpenWrt / AMD64 Windows) with its own embedded SQLite database and local UI on Port 9200.

| # | Feature / Capability | Relay Server Implementation Details | Status | Live Result |
|:---:|:---|:---|:---:|:---|
| **RS-1** | **Embedded Pure-Go SQLite (`fleet_edge.db`)** | Zero CGO dependency (`CGO_ENABLED=0`), WAL mode, 2MB cache, ~28MB resident RAM footprint | ✅ **DONE** | Verified on ARM64 OpenWrt & Windows |
| **RS-2** | **Full 17-Module Web Dashboard (Port 9200)** | Independent embedded SPA frontend serving complete SmartHome dashboard without Central Server | ✅ **DONE** | Verified: 17/17 views render without degradation |
| **RS-3** | **Mobile REST API & SSE Streaming** | Dedicated `/api/v1/mobile/*` endpoints (bootstrap, toggle, state, breaker, rooms, stream) | ✅ **DONE** | Sub-15ms mobile response time |
| **RS-4** | **Sub-Millisecond Raw TCP Gateway (Port 2000)** | Low-latency socket listener for ESP8266/ESP32 fleet telemetry & command queuing | ✅ **DONE** | Verified with live ESP8266 node |
| **RS-5** | **Two-Way Upstream Sync (`internal/syncer`)** | Automatic live push and offline event spooling/reconciliation with Central Server | ✅ **DONE** | Verified two-way synchronization |
| **RS-6** | **Native Tuya Protocol v3.5 Direct Socket** | Port 6668 AES-128 direct communication with smart circuit breaker without cloud dependence | ✅ **DONE** | Telemetry and contact control active |
| **RS-7** | **Dual Production Binary Compilation** | Automated build scripts generating stripped static binaries for ARM64 Linux & AMD64 Windows | ✅ **DONE** | `bin/smarthome-edge` ready for OpenWrt |
| **RS-8** | **PWA & Mobile Optimization** | Embedded web UI supports off-canvas drawer navigation and mobile responsive layout | ✅ **DONE** | Verified mobile touch compatibility |

---

## 4. PART C: Node Firmware (`node-firmware/`) Features & Status

All firmware tasks (P0, P1, P2) are **fully implemented, compiled, and live-verified** on `NODE-8C4F00565D72` (`192.168.1.28`).

| # | Task / Capability | Firmware Implementation Details | Status | Live Result |
|:---:|:---|:---|:---:|:---|
| **B-1** | **Default 4MB Build (`esp8266_4m`) + PCF8574** | `#else` active branch compiles cleanly with `TARGET_ESP8266_4M=1`, LittleFS, and PCF8574 expander | ✅ **DONE** | Compiled & verified on hardware |
| **B-2** | **IrManager Transceiver Engine** | Initialized & looped in `main.cpp` (`esp8266_4m`), learns & stores remotes in `/config/ir_codes.json` | ✅ **DONE** | Tested & blasting verified |
| **B-3** | **`send_ir` Unified Command Handlers** | Handled in `/api/commands/execute` (`web_server.cpp`) & `processServerCommands()` (`receiver_client.cpp`) | ✅ **DONE** | Accepts `code` and `hexCode` |
| **B-4** | **Real-Time Sensor Event Push** | `ReceiverClient::pushSensorEvent()` (350ms debounced non-blocking async TCP push) | ✅ **DONE** | Emits `eventType: "sensor_event"` |
| **B-5** | **True RMS AC Voltage & Mean DC (`A0`)** | `sampleAnalogA0()` (64 samples across 20ms 50Hz mains wave) computes `acRms`, `dcVoltage`, `rawAdc` | ✅ **DONE** | Stable mains reading without zero-crossing dips |
| **B-6** | **Digital Input Sensors & Pin Guard** | `INPUT_PULLUP` applied to `PIR_MOTION`, `DOOR_SENSOR`, and digital inputs; 80ms loop sampling | ✅ **DONE** | Prevents relay output lockup on sensor pins |
| **B-7** | **Direct Flash File Edit & Save** | Native `POST /api/fs/save-content` for config files `<= 5KB` (catalog endpoint #58) | ✅ **DONE** | Direct in-browser edit without multipart overhead |
| **B-8** | **RAM & Heap Optimization** | Static DRAM reduced by 3,348 B; heap fragmentation dropped from 22% to 10% | ✅ **DONE** | `freeHeap` boosted to ~19.5 KB; streamed JSON |

---

## 5. PART D: Future Actionable TODO Roadmap (Separated by Subsystem)

### Central Fleet Server Roadmap (`central-server/TODO.md`)
- [x] **CS-F1: Long-Term Power & Energy Consumption Analytics** *(Completed & Verified)*
- [ ] **CS-F2: Configurable Electrical Safety Alarms**
  - Automation engine threshold alerts for over-voltage (> 250V), under-voltage (< 190V), and excessive leakage current (> 30mA).
- [ ] **CS-F3: Custom Blueprint / SVG Floor Plan Importer**
  - Allow users to upload architectural floor plans (SVG, PNG) and place appliance switches over exact architectural blueprints.
- [ ] **CS-F4: Web Push Notifications for Critical Events**
  - Push API integration in Service Worker (`sw.js`) for circuit breaker trips, motion detections, or offline alerts.

### Edge Relay Server Roadmap (`relay-server/TODO.md`)
- [ ] **RS-F1: OpenWrt `procd` Watchdog Integration**
  - Implement a periodic watchdog health ping (`/api/health/watchdog`) communicating with OpenWrt's `procd` process supervisor for automatic crash recovery.
- [ ] **RS-F2: Zero-Trust Remote Access Setup (WireGuard / Tailscale)**
  - Drop-in OpenWrt configuration package for secure mobile access from outside the local network without port forwarding.
- [ ] **RS-F3: Native HTTPS / TLS Termination on Port 9443**
  - Optional TLS certificate loading in `config.json` for direct encrypted WAN access without reverse proxy.
- [ ] **RS-F4: Rate Limiting & IP Brute-Force Guard**
  - Token bucket rate limiting on `/api/v1/mobile/login` to prevent credential brute-forcing over local Wi-Fi.

### Node Firmware Roadmap (`node-firmware/TODO.md`)
- [ ] **NF-F1: mDNS Automatic Service Discovery (`_smarthome-receiver._tcp`)**
  - Allow unconfigured nodes to automatically discover Central Server IP & Port 2000 on the local LAN without requiring manual `/api/receiver` POST setup.
- [ ] **NF-F2: Captive Portal Wi-Fi Fallback**
  - Automatically host an onboarding AP (`SmartHome-Node-XXXX`) on `192.168.4.1` if primary router Wi-Fi is lost for > 60 seconds.
- [ ] **NF-F3: Oscilloscope Raw Waveform Streaming (`A0`)**
  - Stream 64 raw ADC samples on demand for real-time 50Hz/60Hz AC mains sinusoidal graphing in the browser.
- [ ] **NF-F4: Deep Sleep Power Optimization for Wireless Sensor Nodes**
  - Battery-friendly low-power sleep profiles for standalone door/PIR sensor nodes.
