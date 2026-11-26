# Relay Server Roadmap & Status (`relay-server/`)

> **Binary:** `smarthome-edge` (Go native static binary, ARM64 OpenWrt & AMD64 Windows)  
> **Role:** Complete Autonomous SmartHome Server on Edge Router (MediaTek Filogic 830 MT7986A Jio AX6000), embedded pure-Go SQLite database (`fleet_edge.db`), full 17-view Web UI, dedicated Mobile APIs, and two-way upstream Central Server sync.

---

## 📌 Implementation Status

### Complete Central Server Parity in Relay Server
- [x] **Embedded Pure-Go SQLite Database (`internal/db/fleet_edge.db`):**
  - Zero CGO dependency (`CGO_ENABLED=0`), 100% portable across Linux ARM64 and Windows AMD64.
  - Complete schema tables mirroring Central Server: `nodes`, `relays`, `relay_events`, `sensors`, `telemetry_logs`, `audit_logs`, `system_events`, `notifications`, `automations`, `firmware`, `users`, `roles`, `permissions`, `homes`, `rooms`, `tuya_devices`, `system_settings`, `offline_sync_spool`.
  - Lean RAM footprint limit: `PRAGMA cache_size = -2000` (2 MB cache), WAL journal mode. Total binary RAM footprint: ~28 MB.
  - Automatic seed initialization: default super administrator (`admin`/`admin123`), default home (`Primary Residence`), rooms (`Living Room`, `Master Bedroom`), and smart breaker device.
- [x] **Full 17-Module Web Dashboard (Port 9200) & Complete Central Server UI Parity:**
  - Complete SPA frontend embedded directly in Relay Server: Overview, Relays (Grid & Matrix), Nodes, Automations, Schedules, Energy Monitor, Tuya Smart Breaker, Security, LittleFS file manager, Device Config Sync, Audit Logs, and User Management.
  - Zero degradation if Central Server is dead: Relay Server serves the complete UI and handles all interactions autonomously.
  - **Full UI & Data Parity Verified (0 empty views, 0 `NaN`/`undefined` fields):**
    - Overview: 4 Registered Nodes (2 Online), 21 Relay Channels (6 Active), 11 Connected Sensors, Port 2000 TCP Running, 8 Quick Relay Cards.
    - Nodes: Primary Residence with 8 rooms and 4 nodes assigned to Living Room, Bedroom, Dining, and Unassigned (Circuit Breaker).
    - GPIO / Relays: 21 Relay Channels with full names, pin badges, toggle switches, pulse buttons, and room badges.
    - Sensors: 11 Connected Sensors with live readings (258 V, 1.933 A, 429 W, 29.99 kWh, 50 Hz, 28 °C, IR RX, ADC).
    - Telemetry: Real-time table with real timestamps, IPs, RSSI (dBm), and Free Heap (KB).
    - System Events: 100 historical log entries with category, severity badges, and clean descriptions.
    - Developer API Hub: 5 tabs cleanly switching across Mobile (9), Microcontroller (6), Fleet/Server (10), Live Tester, and Flow Guide.
- [x] **Comprehensive Mobile API Suite (`/api/v1/mobile/...`):**
  - `POST /api/v1/mobile/login`: Authenticates mobile client against SQLite database, generates session token.
  - `GET /api/v1/mobile/bootstrap`: Ultra-fast single-call bootstrapper returning homes, rooms, nodes, relays, breaker metrics, and automations.
  - `POST /api/v1/mobile/relays/:nodeId/:channelId/toggle`: Instant relay toggle (inverts state if unspecified, or sets target state).
  - `POST /api/v1/mobile/relays/:nodeId/:channelId/state`: Explicit state write (`{ "state": 1 }`).
  - `POST /api/v1/mobile/breaker/switch`: Instant contact trip/close (DP 108) with safety verification.
  - `GET /api/v1/mobile/status`: Fast health ping for mobile connection monitoring.
  - `GET /api/v1/mobile/stream`: Server-Sent Events (SSE) live push stream emitting `pin_update`, `node_status`, `breaker_telemetry`.
  - `GET /api/v1/mobile/rooms`: Room-centric aggregates with assigned channels for rapid mobile tab rendering.
  - `POST /api/v1/mobile/automations/:id/trigger`: Instant scene/automation trigger from mobile shortcuts.
- [x] **Sub-Millisecond Raw TCP NDJSON Gateway (Port 2000):**
  - Bidirectional communication with ESP8266, ESP32, and PCF8574 expansion boards with ACK tracking.
  - Dual-path switching: direct HTTP LAN push (<30ms) + queued TCP command fallback.
- [x] **Two-Way Central Server Synchronization (`internal/syncer`):**
  - Live state push & configuration pull when Central Server is online.
  - Reconnection reconciliation: automatically flushes spooled offline events, pushes live state snapshot, and updates local SQLite database.
- [x] **Native Tuya Protocol v3.5 Direct Socket:** Direct AES-128-ECB socket to Wi-Fi smart breaker on port 6668.
- [x] **Dual Production Binaries:** Stripped static ARM64 (`bin/smarthome-edge`) and Windows (`bin/smarthome-edge.exe`).

---

## 🚀 Next Steps & Future Edge Enhancements

- [ ] **Hardware Watchdog Ping:** Add OpenWrt procd watchdog integration to auto-restart the binary if socket deadlocks occur.
- [ ] **Zero-Trust Remote Access Setup:** Document ready-to-run WireGuard and Tailscale configurations on OpenWrt for remote mobile control without public port exposure.
- [ ] **HTTPS / TLS Termination:** Optional native TLS cert loading in `config.json` for direct encrypted WAN access without reverse proxy.
- [ ] **Rate Limiting & IP Banning:** Guard against brute-force attacks on public-facing `/api/v1/mobile/login`.
