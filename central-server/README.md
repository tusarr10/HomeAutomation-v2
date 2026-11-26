# SmartHome Central Server (`central-server/`) 🏠⚡

**Fleet Management Brain, High-Resolution Power Analytics & Real-Time Web Dashboard (v1.6.0)**

Built with **Node.js (v22+)**, native high-performance `node:sqlite`, raw TCP socket streaming on Port `2000`, Tuya Smart Breaker local LAN bridge, and a complete Progressive Web App (PWA) dashboard on Port `9100`.

---

## 🌟 Architecture & Core Systems

```
                              ┌─────────────────────────────────────┐
                              │       Express 4.x REST Server       │
                              │      (Port 9100 / Dual Routing)     │
                              │  - /api/v1/... (Modern SPA & PWA)   │
                              │  - /api/... (Lightweight Legacy API)│
                              └──────────────┬───────────────┬──────┘
                                             │               │
                              ┌──────────────┴──────┐ ┌──────┴──────┐
                              │    Node Manager     │ │  WebSocket  │
                              │  (Fleet Operations) │ │(/api/v1/ws) │
                              └──────────────┬──────┘ └─────────────┘
                                             │
                      ┌──────────────────────┼──────────────────────┐
                      ▼                      ▼                      ▼
           ┌─────────────────────┐┌─────────────────────┐┌─────────────────────┐
           │     TCP Server      ││   Fleet Database    ││  Tuya Breaker Bridge│
           │     (Port 2000)     ││    (fleet.db)       ││    (Port 8085)      │
           │ - Framed NDJSON     ││ - 37 Relational     ││ - Electrical        │
           │   Socket Listener   ││   SQLite Tables     ││   Telemetry Streaming
           │ - Command ACK Queue ││ - WAL Mode / Indexes││ - Energy Snapshots  │
           └─────────────────────┘└─────────────────────┘└─────────────────────┘
```

---

## 🚀 Key Features

### 1. Advanced Power & Energy Analytics (`CS-F1`)
- **Continuous 24-Hour Timeline**: Real-time hourly profiles (`strftime('%Y-%m-%d %H:00')`) with unbroken 24-hour zero-filling, peak demand lines, and hover tooltips.
- **Glitch-Free Trapezoidal Integration**: Calculates continuous energy consumption using active power integration:
  $$E = \frac{P_{\text{avg}} \times \Delta t}{3,600,000}\text{ kWh}$$
  eliminating phantom register jumps and providing 5-decimal precision.
- **Period Mean & Summary Table Footer**: Displays 24h total energy, period mean active load (W), peak power demand (W), mean line voltage (V), and estimated tariff costs.
- **Dynamic Tariff & Budget Management**: Configurable tariff rates, currency symbols, and monthly budget progress bars via modal.

### 2. Bidirectional Relay Server Synchronization (`CS-F7` / `CS-F8`)
- **Offline Replayed Events Ingestion (`POST /api/v1/system/sync-events`)**:
  - Automatically receives offline events spooled on the edge router while the Central PC was powered off.
  - Updates physical relay channel states in SQLite (`updateRelayState`), logs `relay_events`, and triggers UI broadcasts.
- **Edge Live State Snapshot Ingestion (`eventType === "edge_snapshot"`)**:
  - Automatically receives live status of all fleet nodes and circuit breaker contactor upon reconnect via `NodeManager.processTelemetry()`.
- **Sync Auditing & Status (`GET /api/v1/system/sync-status`)**: Real-time health monitoring of edge router connectivity.

### 3. Interactive 2D Blueprint & 3D Isometric Visualizer
- **2D Architectural Blueprint**: Walls, bay window, spinning ceiling fans, glowing bulbs, smart TV, AC unit, and live switches with auto-scaling down to 320px mobile viewports.
- **3D Isometric Room Visualizer**: Interactive 3D perspective stage with smooth rotation controls (`↺`, `↻`, `Reset`).
- **In-Canvas Appliance Modal**: 15+ presets, 25+ emoji icons, and live hardware node/relay reassignment.
- **Strict Clean Normal Mode**: Setting icons (`⚙️`) and edit tags (`✏️`) are strictly hidden in viewing mode.

### 4. Progressive Web App (PWA) & Mobile Optimization
- Standalone PWA installation on iOS and Android with `manifest.json` and offline-resilient `sw.js` asset caching.
- Off-canvas drawer navigation (`☰`) with animated backdrop tap-to-dismiss and automatic closure upon navigation.

---

## 🗄️ Database Architecture (`fleet.db`)

Uses Node.js's native `node:sqlite` engine with WAL journal mode. Contains **37 normalized tables**:

| Category | Tables |
|:---|:---|
| **Fleet & Relays** | `nodes`, `relays`, `relay_events`, `sensors`, `telemetry_logs`, `device_capabilities`, `device_commands`, `command_results`, `device_configurations`, `configuration_versions`, `sync_jobs`, `node_backups` |
| **Homes & Rooms** | `homes`, `home_members`, `rooms`, `room_members` |
| **RBAC Security** | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `scopes`, `user_scopes`, `user_sessions`, `device_permissions` |
| **System & Automations**| `automations`, `audit_logs`, `system_events`, `notifications`, `firmware`, `ota_history`, `tuya_devices` |
| **Energy & Relay Sync** | `energy_history`, `energy_settings`, `events` (Table 37: edge replayed event spool) |

---

## 📡 REST API & WebSocket Endpoints

### 1. Energy Analytics
- `GET /api/v1/analytics/energy/summary`: Returns current live telemetry, today's metrics, yesterday's metrics, rolling 24h mean hourly metrics, month-to-date projection, and tariff settings.
- `GET /api/v1/analytics/energy/history?range={24h|7d|30d}`: Returns continuous, zero-filled time-series intervals with kWh, mean power (W), peak power (W), and mean voltage (V).
- `POST /api/v1/analytics/energy/settings`: Updates electricity tariff rate, currency symbol, and monthly budget.

### 2. Relay Server Synchronization
- `POST /api/v1/system/sync-events`: Ingests offline replayed event spool from the Edge Relay Server.
- `GET /api/v1/system/sync-events`: Returns historical log of replayed edge events.
- `GET /api/v1/system/sync-status`: Returns live edge synchronization status, connection health, and event counts.

### 3. Real-Time WebSocket
- `ws://localhost:9100/api/v1/ws`: Bidirectional real-time stream emitting `initial_state`, `relay_state_confirmed`, `breaker_telemetry`, `fleet_update`, and notifications.

---

## 🛠️ Quick Start

### Prerequisites
- **Node.js `>= 22.5.0`** (required for native `node:sqlite`).

### Installation & Execution
```powershell
# Navigate to Central Server
cd central-server

# Install dependencies (production)
npm install --omit=dev

# Start Central Server with native SQLite support
node --experimental-sqlite server.js
```
Or double-click **`run.bat`** on Windows, or run **`./run.sh`** on Linux.

Access the dashboard at **`http://localhost:9100`**.
