# 📡 SmartHome Go Edge Relay Server (`smarthome-edge`) — Technical Implementation Specification

> **Version:** `1.0.0-edge`  
> **Target Platforms:** OpenWrt 25.x+ Linux ARM64 (MediaTek MT7986A Filogic 830 / Jio AX6000 JIDU6J01), Linux x86_64, Windows amd64  
> **Runtime Footprint:** ~15–25 MB RAM, 0%–1% CPU idle, pure static Go binary with zero dynamic dependencies.

---

## 1. Executive Summary & System Architecture

The **SmartHome Edge Relay Server** (`smarthome-edge`) is an ultra-lightweight, high-concurrency edge communication broker and state authority built in Go. It resides directly on the local gateway router (e.g. Jio AX6000 OpenWrt) to provide **zero-cloud, sub-30ms deterministic latency and 100% offline autonomy** for the entire smart home installation.

```
                          +------------------------------------------------+
                          |   Central Management Server (PC / Server)      |
                          |   (Node.js, SQLite fleet.db, Long-term History)|
                          +-----------------------^------------------------+
                                                  |
                         Outbound Telemetry Sync  |  Central Health Check
                         (when Central is ON)     |  & State Sync (:9100)
                                                  |
                          +-----------------------v------------------------+
                          |      JIO AX6000 OPENWRT GATEWAY ROUTER         |
                          |     Go Edge Broker Process (smarthome-edge)    |
                          +----------^------------------^------------------+
                                     |                  |
           TCP Port 2000 (NDJSON)    |                  |  REST & WebSocket (:9200)
           Heartbeat & Commands      |                  |  Local Control & Streams
                                     |                  |
              +----------------------+--+            +--+---------------------+
              |                         |            |                        |
+-------------v-----------+  +----------v---------+  | Android Mobile Client  |
| ESP8266 Fleet Node      |  | ESP-01S + PCF8574T |  | (Scoped Direct LAN)    |
| (Living Room / 4MB)     |  | (Kitchen / 1MB)    |  +------------------------+
+-------------------------+  +--------------------+  | Local Web Dashboard    |
              |                                      | (Embedded Port 9200)   |
              | Native Tuya Protocol v3.5            +------------------------+
              v (Direct Socket :6668)
+-------------------------------------------------+
| Wi-Fi Smart Circuit Breaker (V, A, W, kWh, Trip)|
+-------------------------------------------------+
```

### Architectural Principles:
1. **Always-On Local Authority:** The gateway router never sleeps. Whether the central PC is turned on, powered off, or undergoing updates, nodes report immediately and user switches toggle instantaneously.
2. **Zero-Dependency Static Executable:** Compiled with `CGO_ENABLED=0`, producing a single self-contained binary (`~6.4 MB` stripped) with no libc or external package dependencies on OpenWrt.
3. **Dual-Transport Ingestion:** ESP nodes connect over ultra-low overhead raw TCP sockets (port `2000`) using newline-delimited JSON (NDJSON), with HTTP REST (`POST /api/telemetry`) supported as fallback.
4. **Direct Sub-30ms LAN Dispatch:** Upon receiving an HTTP command from a phone or web client, the relay broker not only queues the command for the next TCP heartbeat, but also immediately dispatches an asynchronous HTTP push to the node's LAN IP (`POST http://<node-ip>/api/gpio/state`) to actuate relays within 30 milliseconds.
5. **Bounded Flash Spooling:** When the Central Server is unreachable, state transitions and breaker switch events are spooled to a bounded circular JSONL log on disk (`/overlay/smarthome-edge/events`), protecting flash memory from exhaustion.

---

## 2. Directory Structure & Subsystem Breakdown

```
relay-server/
├── bin/
│   ├── smarthome-edge             # Stripped Linux ARM64 binary (for Jio AX6000 OpenWrt)
│   └── smarthome-edge.exe         # Windows AMD64 binary (for local development & testing)
├── cmd/
│   └── edge/
│       └── main.go                # Application bootstrap, DI container & graceful shutdown
├── config/
│   └── config.json                # Master runtime configuration
├── data/
│   └── events.jsonl               # Persistent event spool (auto-rotating)
├── internal/
│   ├── auth/                      # HMAC-SHA256 token validation & node scope checking
│   │   └── auth.go
│   ├── config/                    # JSON configuration parser & defaults
│   │   └── config.go
│   ├── httpapi/                   # REST API routes & embedded static file server
│   │   └── router.go
│   ├── queue/                     # Disk-backed bounded JSONL event spooler
│   │   └── queue.go
│   ├── state/                     # Thread-safe in-memory state, command queues, ACK tracking
│   │   └── state.go
│   ├── syncer/                    # Upstream central sync, health checks & breaker poller
│   │   └── syncer.go
│   ├── tcp/                       # High-throughput TCP NDJSON server (port 2000)
│   │   └── server.go
│   ├── tuya/                      # Pure Go Tuya protocol v3.5 socket client (AES-128-ECB)
│   │   └── client.go
│   └── websocket/                 # RFC 6455 pure Go WebSocket hub & broadcaster
│       └── hub.go
├── openwrt/
│   └── smarthome-edge.init        # OpenWrt procd service definition script
├── web/                           # Embedded web dashboard
│   ├── app.js                     # Vanilla ES6 client application
│   ├── index.html                 # UI structure
│   └── style.css                  # Modern responsive CSS styling
├── build_arm64.bat                # Cross-compile script for Jio AX6000
├── build_windows.bat              # Local build script for Windows
├── go.mod                         # Go module definition (pure standard library)
├── IMPLEMENTATION.md              # This document
├── README.md                      # High-level overview
└── run.bat                        # One-click Windows launch script
```

---

## 3. Communication Protocols & Wire Specifications

### 3.1 ESP Node -> Relay Server (TCP Port 2000 NDJSON)

All ESP microcontrollers (`ESP-01`, `ESP8266`, `ESP32`) transmit single-line JSON frames terminated by a newline (`\n`):

```json
{
  "nodeId": "ESP8266-A1B2C3",
  "nodeName": "Living-Room-Relay",
  "hardwareTarget": "ESP8266 (ESP-12E/F) NodeMCU",
  "firmwareVersion": "1.6.0",
  "token": "smarthome-edge-secret-key",
  "eventType": "heartbeat",
  "uptimeSec": 1420,
  "rssi": -62,
  "freeHeap": 42150,
  "ip": "192.168.1.105",
  "mac": "30:48:7D:E8:5D:5C",
  "gateway": "192.168.1.1",
  "channels": [
    {
      "id": 1,
      "pin": 14,
      "name": "Ceiling Light",
      "state": false,
      "room": "Living Room",
      "function": "Light"
    },
    {
      "id": 2,
      "pin": 12,
      "name": "Ceiling Fan",
      "state": true,
      "room": "Living Room",
      "function": "Fan"
    }
  ],
  "acks": [
    {
      "command_uuid": "cmd-1732371234000",
      "success": true,
      "status": "ACKNOWLEDGED"
    }
  ]
}
```

#### Event Triggers (`eventType`):
- `boot`: Transmitted immediately on Wi-Fi connection establishment.
- `heartbeat`: Transmitted periodically every 10–15 seconds.
- `gpio_change`: Sent within 50ms of any physical switch toggle or relay change.
- `test_ping`: Triggered manually from the node web interface.

---

### 3.2 Relay Server -> ESP Node (TCP Command Response)

Upon receiving a valid telemetry line, the TCP server immediately replies with an NDJSON response containing any pending commands:

```json
{
  "status": "ok",
  "epoch": 1732371234,
  "commands": [
    {
      "command_uuid": "cmd-1732371234567890",
      "uuid": "cmd-1732371234567890",
      "action": "setState",
      "type": "SET_PIN",
      "id": 1,
      "channel": 1,
      "channelId": 1,
      "pin": 14,
      "state": true,
      "value": 1,
      "expiresAt": 1732371264
    }
  ]
}
```

#### Compatibility Mapping:
The `Command` structure provides multi-key backwards compatibility across all firmware iterations:
- **UUID**: Both `command_uuid` and `uuid` are emitted.
- **Action/Type**: Both `action: "setState"` and `type: "SET_PIN"` are emitted.
- **Channel ID**: Both `id`, `channelId`, `channel_id`, and `channel` are emitted.

---

### 3.3 Tuya Protocol v3.5 Direct Socket Engine (`internal/tuya/client.go`)

The edge broker communicates directly with the Wi-Fi Smart Circuit Breaker via TCP port `6668`:
- **Cipher**: AES-128-ECB encryption using the device's 16-character local key.
- **Framing**: Tuya packet header (`0x000055AA`), sequence number, command byte, 32-bit payload length, encrypted payload, CRC32 checksum, and tail (`0x0000AA55`).
- **Command Codes**:
  - `0x07` (`CMD_CONTROL`): Issue DP controls (toggle main contact DP 108).
  - `0x08` (`CMD_STATUS`): Telemetry notification frame.
  - `0x0d` (`CMD_QUERY`): Query active DP status.
  - `0x10` (`CMD_QUERY_STATUS`): Extended status query for Tuya protocol v3.5.

#### Key Data Points (DPs) Decoded:
| DP ID | Type | Description | Scaling |
|---|---|---|---|
| **108** | Boolean | Main Breaker Contact Switch | `true` (Closed) / `false` (Tripped) |
| **102** | Hex/Base64 | Electrical Telemetry Block | Byte 0–1: Voltage (0.1V), Byte 2–4: Current (0.001A), Byte 5–7: Power (1W) |
| **105** | Integer | High Temperature Threshold | °C |
| **106** | Integer | Leakage Current | mA |
| **107** | Integer | Overcurrent Limit | A |
| **109** | Integer | Overvoltage Threshold | V |

---

## 4. REST & WebSocket API Specification (Port 9200)

### 4.1 Authentication & Session Management
- `POST /api/v1/auth/login`: Signs in user, generates HMAC-SHA256 JWT session token.
- `GET /api/v1/auth/me`: Validates session and returns user profile, role, and permission scopes.
- `POST /api/v1/auth/logout`: Terminates active session.
- `POST /api/v1/auth/change-password`: Updates user password.

### 4.2 System, Metrics & Alerts
- `GET /api/v1/system/overview`: Fleet counts (online/offline), relay counters (on/off), sensor counts, protocol statuses, and central online flag.
- `GET /api/v1/system/notifications`: In-memory system alerts.
- `GET /api/v1/system/notifications/unread-count`: Unread notifications counter badge.
- `POST /api/v1/system/notifications/mark-read`: Marks all alerts read.
- `GET /api/v1/system/logs`: Live edge broker runtime logs.
- `GET /api/v1/system/events`: Recent circular event spool (`events.jsonl`).
- `GET /api/v1/system/poll-settings` & `POST /api/v1/system/poll-now`: Immediate hardware poll trigger.
- `GET /api/v1/edge/status`: Edge runtime memory, goroutine count, and central server sync status.

### 4.3 Fleet Nodes Management
- `GET /api/v1/nodes`: Lists all fleet microcontrollers with full channel, pin, and sensor tables.
- `GET /api/v1/nodes/{id}`: Single node telemetry detail.
- `POST /api/v1/nodes/add`: Manual node registration.
- `DELETE /api/v1/nodes/{id}`: Unregisters a node from the edge broker.
- `POST /api/v1/nodes/{id}/restart`: Issues soft reboot command via LAN HTTP + TCP fallback.
- `POST /api/v1/nodes/{id}/sync-pins`: Synchronizes hardware GPIO pins from node.
- `GET /api/v1/nodes/discovery/subnets` & `POST /api/v1/nodes/discovery/scan`: Local subnet scan.

### 4.4 GPIO & Relays Control
- `GET /api/v1/relays`: Returns all relays across all fleet nodes (filterable by `room`, `node_id`, `state`).
- `POST /api/v1/relays/sync`: Synchronizes hardware relays across nodes.
- `POST /api/v1/relays/{nodeId}/{channelId}/command`: Actuates relay (`setState`, `toggle`, `pulse`), triggers sub-30ms LAN push, logs to spool, and streams to Central Server.
- `POST /api/v1/relays/broadcast`: Whole-home or per-room broadcast (`{"state": false, "room": "Living Room"}`).
- `GET /api/v1/relays/{nodeId}/{channelId}/history`: Micro-history log for individual relay channels.

### 4.5 Sensors & Environment
- `GET /api/v1/sensors`: Ingested temperature, humidity, power, and environmental telemetry.

### 4.6 Edge Automation Engine
- `GET /api/v1/automations`: Active automation rules.
- `POST /api/v1/automations`: Registers a local edge automation rule (runs 24/7 on router).
- `POST /api/v1/automations/{id}/toggle`: Toggles rule enabled/disabled.
- `DELETE /api/v1/automations/{id}`: Removes an automation rule.

### 4.7 Smart Circuit Breaker
- `GET /api/v1/breaker` & `GET /api/v1/breaker/status`: Live electrical measurements (V, A, W, kWh, Hz, °C, mA).
- `POST /api/v1/breaker/switch` & `POST /api/v1/breaker/toggle`: Trips or closes main contact switch (DP 108).
- `POST /api/v1/breaker/control`: Writes custom Tuya DP.
- `POST /api/v1/breaker/refresh`: Queries Tuya socket directly.
- `GET /api/v1/breaker/devices`: Breaker hardware profiles and configuration.

### 4.8 Homes & Rooms Structure
- `GET /api/v1/homes` & `POST /api/v1/homes`: Home tenancy configuration.
- `GET /api/v1/homes/{id}/rooms` & `POST /api/v1/homes/{id}/rooms`: Room hierarchies.
- `GET /api/v1/rooms/{id}` & `DELETE /api/v1/rooms/{id}`: Room management.

### 4.9 LittleFS File Explorer & OTA
- `GET /api/v1/nodes/{id}/fs`: Proxies LittleFS filesystem directory directly from node.
- `GET /api/v1/nodes/{id}/fs/file-content`: Views file content from microcontroller flash.
- `POST /api/v1/ota/deploy`: Triggers OTA firmware deployment to node.
- `GET /api/v1/ota/node-diagnostics/{id}`: Pre-OTA memory & flash health diagnostics.

### 4.10 Commands Center
- `GET /api/v1/commands`: Recent command dispatch history, queue state, and execution ACKs.
- `POST /api/v1/commands/dispatch`: Queues arbitrary command frame to node.
    "state": true
  }
}
```

---

### 4.3 Smart Circuit Breaker Endpoints

#### `GET /api/v1/breaker`
Returns complete live electrical measurements.
```json
{
  "success": true,
  "reading": {
    "online": true,
    "source": "native_tuya_socket",
    "timestamp": "2026-11-23 21:15:30",
    "decoded": {
      "switch_state": true,
      "voltage_v": 232.4,
      "current_a": 4.82,
      "power_w": 1120.2,
      "frequency_hz": 50.0,
      "temperature_c": 34.0,
      "total_energy_kwh": 142.85,
      "leakage_current_ma": 6.2
    }
  },
  "centralOnline": true
}
```

#### `POST /api/v1/breaker/switch`
Trips or closes the main contactor.
```json
{
  "state": true
}
```

---

### 4.4 Real-Time WebSocket Streaming (`WS /api/v1/ws`)

Clients connect via standard WebSocket. The broker pushes events instantly as they occur:

1. **`node_status`**: Node connectivity transitions (`isOnline: true/false`).
2. **`pin_update`**: Real-time channel state change (`nodeId`, `channelId`, `pin`, `state`).
3. **`breaker_update`**: Live 3-second electrical metric feed.
4. **`command_ack`**: ESP node execution confirmation.

---

## 5. Master Configuration Reference (`config/config.json`)

```json
{
  "server": {
    "tcp_listen": "0.0.0.0:2000",
    "http_listen": "0.0.0.0:9200",
    "metrics_listen": "127.0.0.1:9201"
  },
  "protocol": {
    "version": 1,
    "max_packet_size": 16384,
    "heartbeat_seconds": 15,
    "offline_timeout_seconds": 45
  },
  "security": {
    "require_node_auth": false,
    "require_mobile_token": false,
    "shared_secret": "smarthome-edge-secret-key",
    "public_key_path": ""
  },
  "central": {
    "enabled": true,
    "url": "http://192.168.1.10:9100",
    "sync_interval_seconds": 5,
    "timeout_ms": 2500
  },
  "storage": {
    "data_dir": "./data",
    "event_queue_max_mb": 16
  },
  "breaker": {
    "enabled": true,
    "portal_url": "http://192.168.1.10:8085",
    "direct_ip": "192.168.1.25",
    "device_id": "d705ffaccaf4d0f1b1addg",
    "local_key": "gp->j2_X[Bx=.ovC",
    "poll_interval_seconds": 3,
    "node_id": "NODE-30487DE85D5C"
  }
}
```

---

## 6. Build & Deployment Instructions

### 6.1 Compiling for Jio AX6000 OpenWrt (ARM64)

The Jio AX6000 router features a MediaTek MT7986A Filogic 830 (Quad-core Cortex-A53, ARM64 little-endian).

Run the automated script `build_arm64.bat` or run:
```powershell
$env:GOOS = "linux"
$env:GOARCH = "arm64"
$env:CGO_ENABLED = "0"
go build -trimpath -ldflags="-s -w" -o bin/smarthome-edge ./cmd/edge
```

### 6.2 Deploying to the Router via SCP

From your workstation:
```bash
# 1. Transfer binary to /usr/bin
scp bin/smarthome-edge root@192.168.1.1:/usr/bin/smarthome-edge

# 2. Transfer configuration
ssh root@192.168.1.1 "mkdir -p /etc/smarthome-edge"
scp config/config.json root@192.168.1.1:/etc/smarthome-edge/config.json

# 3. Transfer init service definition
scp openwrt/smarthome-edge.init root@192.168.1.1:/etc/init.d/smarthome-edge

# 4. Transfer web assets
ssh root@192.168.1.1 "mkdir -p /www/smarthome-edge"
scp -r web/* root@192.168.1.1:/www/smarthome-edge/
```

### 6.3 Registering & Starting the Service (OpenWrt Procd)

SSH into your router:
```bash
ssh root@192.168.1.1

# Make executable
chmod +x /usr/bin/smarthome-edge
chmod +x /etc/init.d/smarthome-edge

# Enable autostart on boot and launch
/etc/init.d/smarthome-edge enable
/etc/init.d/smarthome-edge start

# Verify running process
ps | grep smarthome-edge

# Verify listening ports
netstat -lntp | grep -E '2000|9200'
```

---

## 7. Fault-Tolerance & Edge Recovery

| Scenario | System Behavior | Recovery Action |
|---|---|---|
| **Central PC Shutdown** | Edge broker detects timeout on `GET :9100/api/nodes`, marks `isCentralAlive = false`. Local toggles & breaker operations proceed with zero latency. State transitions buffered to `events.jsonl`. | Central PC boots up. Syncer detects alive status and forwards buffered state snapshot. |
| **Router Reboot / Power Cut** | OpenWrt procd starts `smarthome-edge` automatically. ESP nodes auto-reconnect over Wi-Fi within 3 seconds and send `boot` event. | State table repopulates within 100ms of node reconnection. |
| **Node Wi-Fi Drop** | Offline watcher flags node `isOnline = false` after 45 seconds. Web clients receive `node_status` WebSocket broadcast. | Node reconnects; transmits state; immediately marked `isOnline = true`. |
| **Flash Wearout Protection** | Disk writes are restricted to `events.jsonl` with an automated 16MB bounded rotation. State tables are held exclusively in RAM. | Zero risk of NAND flash exhaustion on OpenWrt overlay storage. |

---

## 8. Verification & Test Checklist

- [x] Go module compiles cleanly with Go 1.22+ (`go build ./cmd/edge`).
- [x] Static ARM64 binary generated for MediaTek MT7986A Cortex-A53 (`bin/smarthome-edge`).
- [x] Static AMD64 binary generated for Windows local testing (`bin/smarthome-edge.exe`).
- [x] TCP Server port `2000` accepts ESP8266 NDJSON frames and dispatches queued commands.
- [x] Dual-format compatibility: supports both `channels` array and `states` array.
- [x] Application-level command ACK loop: captures and emits `command_ack` events.
- [x] Sub-30ms LAN dispatch: direct HTTP POST to node IP on REST command receipt.
- [x] Tuya Protocol v3.5 client decodes breaker electrical data points and contact status.
- [x] Persistent event spool writes to circular JSONL log on disk.
- [x] Real-time RFC 6455 WebSocket hub streams live node, pin, and breaker telemetry.
