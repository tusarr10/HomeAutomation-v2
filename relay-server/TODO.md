# Relay Server Feature Documentation & Actionable Roadmap (`relay-server/`)

> **Binary:** `smarthome-edge` (Go native static binary, ARM64 OpenWrt & AMD64 Windows)  
> **Role:** Complete Autonomous SmartHome Server on Edge Router (MediaTek Filogic 830 MT7986A Jio AX6000), embedded pure-Go SQLite database (`fleet_edge.db`), full 17-view Web UI (Port 9200), dedicated Mobile APIs (`/api/v1/mobile/*`), direct Tuya socket bridge (Port 6668), and two-way upstream Central Server sync.  
> **Current Version:** v1.2.0  
> **Status:** All core edge broker, database, web dashboard, mobile API, and sync modules are 100% complete & verified.

---

## 1. Feature Documentation: Implemented Edge Server Capabilities

### 1.1 Embedded Pure-Go SQLite Database (`internal/db/fleet_edge.db`)
- **Zero CGO Dependency (`CGO_ENABLED=0`):**
  - 100% portable across Linux ARM64 (OpenWrt) and Windows AMD64.
  - Schema tables mirroring Central Server: `nodes`, `relays`, `relay_events`, `sensors`, `telemetry_logs`, `audit_logs`, `system_events`, `notifications`, `automations`, `firmware`, `users`, `roles`, `permissions`, `homes`, `rooms`, `tuya_devices`, `system_settings`, `offline_sync_spool`, `energy_history`, and `energy_settings`.
- **Lean RAM Footprint:**
  - Enforced `PRAGMA cache_size = -2000` (2 MB cache) and WAL journal mode.
  - Total binary resident memory: ~28 MB on ARM64 OpenWrt router.
- **Autonomous Seed Initialization:**
  - Pre-seeds superuser (`admin`/`admin123`), default home (`Primary Residence`), rooms (`Living Room`, `Master Bedroom`), and smart circuit breaker device.

---

### 1.2 Full 17-Module Web Dashboard (Port 9200) & PWA Parity
- **Independent Local Web Dashboard:**
  - Complete SPA frontend embedded directly in Relay Server: Overview, Relays (Grid & Matrix), Nodes, Automations, Schedules, Energy Monitor, Tuya Smart Breaker, Security, LittleFS file manager, Device Config Sync, Audit Logs, and User Management.
  - Functions 100% autonomously: if the Central Server is unreachable or powered down, Relay Server continues serving the UI and handling local home automation without degradation.
- **PWA & Mobile Optimization:**
  - Mobile responsive drawer navigation (`☰`) for smartphone and tablet viewports.
  - Standalone PWA installability with offline service worker asset caching.
- **Verified Zero-Degradation UI Parity:**
  - Overview: Registered Nodes, Relay Channels, Connected Sensors, Port 2000 TCP listener, Quick Relay Cards.
  - Rooms & Homes: Hierarchical grouping of nodes, relays, and appliances by room.
  - Sensors & Telemetry: Live AC RMS, DC voltage, and IR receiver codes.

---

### 1.3 High-Performance Mobile API Suite (`/api/v1/mobile/...`)
- `POST /api/v1/mobile/login`: Authenticates mobile app clients against SQLite database, returns session tokens.
- `GET /api/v1/mobile/bootstrap`: Ultra-fast single-roundtrip payload returning homes, rooms, nodes, relays, breaker metrics, and automations.
- `POST /api/v1/mobile/relays/:nodeId/:channelId/toggle`: Instant relay toggle (inverts state or applies target state).
- `POST /api/v1/mobile/relays/:nodeId/:channelId/state`: Explicit state write (`{ "state": 1 }`).
- `POST /api/v1/mobile/breaker/switch`: Instant contact trip/close (DP 108) with safety lockout verification.
- `GET /api/v1/mobile/status`: Lightweight health ping for mobile connection monitoring.
- `GET /api/v1/mobile/stream`: Server-Sent Events (SSE) live push stream emitting `pin_update`, `node_status`, `breaker_telemetry`.
- `GET /api/v1/mobile/rooms`: Room-centric aggregates with assigned channels for rapid mobile tab rendering.
- `POST /api/v1/mobile/automations/:id/trigger`: Instant scene/automation trigger from mobile shortcuts.

---

### 1.4 Sub-Millisecond Raw TCP NDJSON Gateway (Port 2000)
- Bidirectional TCP socket listener communicating directly with ESP8266, ESP32, and PCF8574 expansion boards with ACK tracking.
- Dual-path command dispatch: direct HTTP LAN push (<30ms) + queued TCP command fallback.

---

### 1.5 Two-Way Central Server Synchronization (`internal/syncer`)
- Live state push & configuration pull when Central Server is online.
- Reconnection reconciliation: automatically flushes spooled offline events, pushes live state snapshot, and updates local SQLite database.

---

### 1.6 Native Tuya Protocol v3.5 Direct Socket & Electrical Metrology
- Direct AES-128-ECB socket to Wi-Fi smart circuit breaker on port 6668.
- Real-time electrical telemetry polling (V, A, W, Hz, mA, °C), forward cumulative energy DP 101 (0.01 kWh resolution), and contactor control (DP 108).
- Strict software interlock safeguarding the breaker from accidental toggling during automation or batch operations.

---

## 2. Completed Milestones Checklist

- [x] **RS-1: Embedded Pure-Go SQLite Database (`fleet_edge.db`)** *(Verified on ARM64 & Windows)*
- [x] **RS-2: Full 17-View Web UI on Port 9200 with Zero CGO** *(Verified)*
- [x] **RS-3: Mobile REST API & SSE Real-Time Streaming Suite (`/api/v1/mobile/*`)** *(Verified)*
- [x] **RS-4: Sub-Millisecond Raw TCP Telemetry Engine on Port 2000** *(Verified)*
- [x] **RS-5: Two-Way Synchronization with Central Server (`internal/syncer`)** *(Verified)*
- [x] **RS-6: Native AES-128 Local Tuya Socket Bridge on Port 6668** *(Verified)*
- [x] **RS-7: Static Binary Cross-Compilation for ARM64 OpenWrt & Windows** *(Verified)*
- [x] **RS-8: PWA & Mobile Viewport Optimization for Embedded UI** *(Verified)*

---

## 3. Future Relay Server Tasks & Actionable Roadmap (TODO)

### P3 — System Resilience & Router Integration
- [ ] **Task RS-F1: OpenWrt `procd` Watchdog Integration**
  - Implement a periodic watchdog ping endpoint (`/api/health/watchdog`) that communicates with OpenWrt's `procd` process supervisor to automatically restart the binary in the event of an unhandled socket deadlock or memory exhaustion.
- [ ] **Task RS-F2: Zero-Trust Remote Access Package (WireGuard / Tailscale)**
  - Provide drop-in configuration scripts for OpenWrt to route mobile app traffic through a secure WireGuard or Tailscale tunnel, enabling remote access from anywhere without port forwarding.

### P4 — Network Security & TLS Termination
- [ ] **Task RS-F3: Native HTTPS / TLS Termination on Port 9443**
  - Add optional TLS certificate path configuration in `config.json` (`cert_file`, `key_file`) allowing the Go server to serve HTTPS directly on OpenWrt without requiring Nginx or uHTTPd reverse proxies.
- [ ] **Task RS-F4: Rate Limiting & IP Brute-Force Guard**
  - Implement in-memory token bucket rate limiting on `/api/v1/mobile/login` to prevent credential brute-forcing over local Wi-Fi or VPN connections.

### P5 — Offline Spooling, Flash Safety & Edge Energy Analytics
- [ ] **Task RS-F5: Compressed Telemetry Spooling for Long WAN Outages**
  - When the Central Server is unreachable for extended periods (> 24 hours), gzip-compress spooled electrical and sensor events in `offline_sync_spool` to minimize flash storage writes on the router's NAND flash.
- [ ] **Task RS-F6: Autonomous Edge Energy Analytics & Flash-Safe RAM Logging**
  - Implement in-memory circular ring buffer for 30-second power integration ($E = \frac{P \times \Delta t}{3,600,000}$) to compute local Today kWh and 24h hourly stats without frequent flash writes.
  - Flush hourly aggregated buckets to SQLite `energy_history` only once per hour to preserve router NAND flash endurance.
  - Expose `/api/v1/analytics/energy/summary` and `/api/v1/analytics/energy/history` directly on Relay Server for standalone offline analytics.
- [ ] **Task RS-F7: Two-Way Edge-to-Central Energy History Sync**
  - When Relay Server operates during WAN outages, sync the edge-calculated hourly energy summaries back to Central Server upon link restoration.
