# 📡 SmartHome Go Edge Relay Server (`smarthome-edge`) — Technical Implementation Specification

> **Version:** `1.0.0-edge`  
> **Target Platforms:** OpenWrt 25.x+ Linux ARM64 (MediaTek MT7986A Filogic 830 / Jio AX6000), Linux x86_64, Windows amd64  
> **Runtime Footprint:** ~25–35 MB RAM, < 1% CPU idle, pure static Go binary (`CGO_ENABLED=0`) with zero external dependencies.

---

## 1. Executive Summary & Full Server Parity Architecture

The **SmartHome Edge Relay Server** (`smarthome-edge`) is an autonomous, complete SmartHome Server running directly on the local gateway router. It incorporates:
1. **Embedded Pure-Go SQLite Database (`internal/db/fleet_edge.db`)**: Runs without CGO or GCC, storing complete relational schemas (`nodes`, `relays`, `automations`, `users`, `homes`, `rooms`, `tuya_devices`, `relay_events`, `audit_logs`).
2. **Complete Web UI (17 Full Views)**: Serves the exact Central Server Single-Page Application (SPA) on port `9200` with zero functional degradation when Central Server is offline.
3. **Comprehensive Mobile API Suite (`/api/v1/mobile/...`)**: Dedicated high-speed endpoints for mobile apps over LAN or WAN.
4. **Two-Way Synchronization**: Automatically syncs state changes, logs, and device configurations with Central Server when online.

```
                          +------------------------------------------------+
                          |   Central Management Server (PC / Server)      |
                          |   (Node.js, SQLite fleet.db, Long-term History)|
                          +-----------------------^------------------------+
                                                  |
                         Two-Way Sync & Events    |  Reconnection Reconciliation
                         (when Central is ON)     |  & Master Config Push (:9100)
                                                  |
                          +-----------------------v------------------------+
                          |      JIO AX6000 OPENWRT GATEWAY ROUTER         |
                          |     Go Edge Relay Server (smarthome-edge)      |
                          |  ┌──────────────────────────────────────────┐  |
                          |  │ Embedded SQLite Database (fleet_edge.db) │  |
                          |  │ Complete 17-View Web UI (HTTP :9200)     │  |
                          |  │ Dedicated Mobile REST APIs & SSE Stream  │  |
                          |  └──────────────────────────────────────────┘  |
                          +----------^------------------^------------------+
                                     |                  |
           TCP Port 2000 (NDJSON)    |                  |  REST & WebSocket (:9200)
           Heartbeat & Commands      |                  |  Mobile & Web Dashboard
                                     |                  |
              +----------------------+--+            +--+---------------------+
              |                         |            |                        |
+-------------v-----------+  +----------v---------+  | Android / iOS Mobile   |
| ESP8266 Fleet Node      |  | ESP-01S + PCF8574T |  | (Direct LAN / WAN)     |
| (Living Room / 4MB)     |  | (Kitchen / 1MB)    |  +------------------------+
+-------------------------+  +--------------------+  | Full 17-View Web UI    |
              |                                      | (Embedded Port 9200)   |
              | Native Tuya Protocol v3.5            +------------------------+
              v (Direct Socket :6668)
+-------------------------------------------------+
| Wi-Fi Smart Circuit Breaker (V, A, W, kWh, Trip)|
+-------------------------------------------------+
```

---

## 2. Directory Structure & Subsystem Breakdown

```
relay-server/
├── bin/
│   ├── smarthome-edge             # Stripped Linux ARM64 binary (for Jio AX6000 OpenWrt)
│   └── smarthome-edge.exe         # Windows AMD64 binary (for local development & testing)
├── cmd/
│   └── edge/
│       └── main.go                # Server entrypoint: loads config, opens SQLite DB, starts listeners
├── config/
│   └── config.json                # Runtime configuration (TCP listen, HTTP listen, Central URL, Breaker)
├── data/
│   ├── fleet_edge.db              # Embedded pure-Go SQLite database (nodes, relays, users, logs)
│   ├── fleet_edge.db-wal          # SQLite Write-Ahead Log
│   ├── config_cache.json          # Cached JSON fallback
│   └── events.jsonl               # Circular spool for offline events
├── internal/
│   ├── auth/                      # JWT token generation, permission verification, and PBKDF2 hashing
│   ├── config/                    # Configuration parser and default values
│   ├── db/                        # Pure-Go SQLite engine (modernc.org/sqlite)
│   │   ├── db.go                  # Open, schema initialization, default seeding
│   │   └── operations.go          # Nodes, Relays, Users, Automations, Logs, Spool operations
│   ├── httpapi/                   # REST API router, SSE stream, and static SPA web file server
│   │   └── router.go              # Complete Central Server endpoints + /api/v1/mobile/... endpoints
│   ├── queue/                     # Circular disk event spooling
│   ├── state/                     # High-speed in-memory state manager with SQLite persistence
│   │   └── state.go               # IngestRawTelemetry, SetChannelState, Automations, Homes, Rooms
│   ├── syncer/                    # Two-way sync engine to Central Server & Tuya polling loop
│   ├── tcp/                       # Raw TCP NDJSON gateway on port 2000
│   ├── tuya/                      # Direct AES-128-ECB Tuya v3.5 socket client (port 6668)
│   └── websocket/                 # Real-time WebSocket hub for Web UI
└── web/                           # Embedded Full 17-View Web Application
    ├── index.html                 # Main Single-Page Application (SPA) entrypoint
    └── assets/
        ├── app.js                 # Complete JavaScript UI logic (17 view modules)
        ├── style.css              # Dark theme stylesheet
        └── logo.svg               # Application branding
```

---

## 3. Embedded Database Schema (`fleet_edge.db`)

The embedded database uses pure-Go SQLite (`modernc.org/sqlite`). It executes with `CGO_ENABLED=0` and requires zero system libraries.

### Key Database Tables:
1. **`nodes`**: IoT microcontroller nodes (id, name, ip, mac, rssi, heap, uptime, online status, hardware type, firmware version).
2. **`relays`**: Physical and virtual relays (node_id, channel_id, pin, name, room, state, requested_state, icon, active_low).
3. **`relay_events`**: Chronological log of every relay state change with timestamp, old state, new state, and trigger source.
4. **`sensors`**: Temperature, humidity, power, and analog sensor streams.
5. **`telemetry_logs` & `audit_logs`**: System audit records and security event traces.
6. **`automations`**: Automation rules with conditional triggers and multi-action executions.
7. **`users` & `user_sessions`**: Superusers and viewers with PBKDF2-SHA512 password hashing and 7-day session tokens.
8. **`homes` & `rooms`**: Residential hierarchy mapping nodes and channels to physical locations.
9. **`tuya_devices`**: Configuration and credentials for Tuya Smart Circuit Breakers and smart plugs.
10. **`offline_sync_spool`**: Event queue spooled during Central Server disconnects.

---

## 4. Mobile Application API Reference (`/api/v1/mobile/...`)

The mobile endpoints provide ultra-fast, mobile-optimized payloads and Server-Sent Events (SSE) streaming.

### 4.1 Authentication: `POST /api/v1/mobile/login`
- **Request:**
  ```json
  {
    "username": "admin",
    "password": "admin123"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "token": "edge_session_a1b2c3d4...",
    "user": {
      "id": "usr-1",
      "username": "admin",
      "role": "SUPER_ADMIN"
    },
    "server": {
      "name": "SmartHome Go Edge Gateway",
      "version": "1.0.0-edge",
      "centralOnline": true
    }
  }
  ```

### 4.2 Single-Roundtrip Bootstrap: `GET /api/v1/mobile/bootstrap`
Returns the entire smart home state in a single request, eliminating multi-roundtrip startup latency for mobile apps.
- **Response:**
  ```json
  {
    "success": true,
    "serverTime": 1732560000,
    "centralOnline": true,
    "homes": [
      { "id": "home-1", "name": "Primary Residence", "address": "Main Local Network" }
    ],
    "rooms": [
      { "id": "room-1", "home_id": "home-1", "name": "Living Room", "icon": "couch" },
      { "id": "room-2", "home_id": "home-1", "name": "Master Bedroom", "icon": "bed" }
    ],
    "nodes": [
      { "nodeId": "ESP8266_NODE_01", "name": "Living Room Node", "ip": "192.168.1.150", "isOnline": true, "rssi": -55 }
    ],
    "relays": [
      { "id": "ESP8266_NODE_01_ch1", "nodeId": "ESP8266_NODE_01", "channelId": 1, "name": "Ceiling Light", "room": "Living Room", "state": true, "icon": "light" }
    ],
    "breaker": {
      "online": true,
      "switchState": true,
      "voltageV": 232.4,
      "currentA": 4.15,
      "powerW": 964.5,
      "leakageMA": 12.0,
      "frequencyHz": 50.0,
      "totalKWh": 148.6
    }
  }
  ```

### 4.3 Instant Relay Toggle: `POST /api/v1/mobile/relays/:nodeId/:channelId/toggle`
- **Request (optional payload):**
  ```json
  { "state": true }
  ```
  *(If omitted, the server automatically inverts the current channel state).*
- **Execution:**
  1. Instant in-memory state toggle.
  2. Asynchronous direct HTTP LAN push (`POST http://<node-ip>/api/gpio/state`) for sub-30ms execution.
  3. Queued command on TCP socket (if node is connected over TCP).
  4. Logged to `fleet_edge.db` (`relays` and `relay_events`).
  5. Pushed upstream to Central Server if online.
- **Response:**
  ```json
  {
    "success": true,
    "nodeId": "ESP8266_NODE_01",
    "channelId": 1,
    "state": true,
    "command": { "action": "setState", "channel": 1, "state": true }
  }
  ```

### 4.4 Smart Circuit Breaker Trip/Close: `POST /api/v1/mobile/breaker/switch`
- **Request:**
  ```json
  { "state": true }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "switchState": true
  }
  ```

### 4.5 Real-Time State Stream: `GET /api/v1/mobile/stream`
Server-Sent Events (SSE) connection pushing live updates without polling.
- **Event Types:**
  - `event: pin_update` -> `{ "nodeId": "...", "channelId": 1, "state": true }`
  - `event: node_status` -> `{ "nodeId": "...", "isOnline": true }`
  - `event: breaker_telemetry` -> `{ "voltageV": 231.8, "powerW": 850.2 }`

### 4.6 Room Aggregates: `GET /api/v1/mobile/rooms`
Returns rooms with their assigned relays grouped together for mobile tabbed screens.

### 4.7 Automation Trigger: `POST /api/v1/mobile/automations/:id/trigger`
Triggers an automation/scene from a mobile shortcut button.

---

## 5. Two-Way Central Server Synchronization

| Scenario | Central Server State | Relay Server Behavior |
| :--- | :--- | :--- |
| **Normal Operation** | **ONLINE** | Streams live telemetry; forwards relay toggles & breaker events upstream; replicates Central definitions into local SQLite. |
| **Central Outage / PC Sleep** | **OFFLINE** | Operates as **100% Autonomous Master**. Serves complete 17-view Web UI, runs automations, switches relays, spools events into `offline_sync_spool`. |
| **Central Reconnection** | **RECONNECTED** | Triggers automatic two-way reconciliation: flushes spooled offline events, pushes live state snapshot, and pulls updated device configurations. |
