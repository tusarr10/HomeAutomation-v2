# Central Server to Node - Complete API Requirements & Wire Protocol Specification

**Document Version**: 2.1.0  
**Target Hardware**: ESP8266 (ESP-12E/F NodeMCU, ESP-01/01S) & ESP32  
**Purpose**: Complete reference of all APIs, endpoints, payloads, and wire protocol formats required by Central Server for comparing against and updating node firmware.  
**Constraint**: Excludes the Tuya Smart Circuit Breaker (`NODE-30487DE85D5C`), which uses its dedicated bridge (`http://127.0.0.1:8085`) and must remain untouched.

---

## 1. Quick Reference API Comparison Checklist

Use this table to check off each API against your node firmware implementation:

| # | Protocol | Direction | Endpoint / Command | Auth Required | Purpose | Firmware Status in `node-firmware/` |
|---|:---:|:---:|:---|:---:|:---|:---:|
| 1 | HTTP | Server ➔ Node | `POST /api/auth/login` | None | Session token generation | ✅ Available |
| 2 | HTTP | Server ➔ Node | `GET /api/status` | Optional / Bearer | Health, heap, uptime, RSSI, PCF8574 | ✅ Available |
| 3 | HTTP | Server ➔ Node | `GET /api/gpio` | Optional | Fetch all configured channels & states | ✅ Available |
| 4 | HTTP | Server ➔ Node | `POST /api/gpio` | Basic / Bearer | Add a brand new GPIO channel | ✅ Available |
| 5 | HTTP | Server ➔ Node | `POST /api/gpio/update` | Basic / Bearer | Update channel name, room, function, logic | ✅ Available |
| 6 | HTTP | Server ➔ Node | `POST /api/gpio/delete` | Basic / Bearer | Delete / unassign a GPIO channel | ✅ Available |
| 7 | HTTP | Server ➔ Node | `POST /api/gpio/state` | Basic / Bearer | Set channel state, toggle, or pulse | ✅ Available |
| 8 | HTTP | Server ➔ Node | `POST /api/commands/execute` | Basic / Bearer | Unified command dispatcher (`setState`, `reboot`, etc.) | ✅ Available |
| 9 | HTTP | Server ➔ Node | `POST /api/receiver` | Basic / Bearer | Configure Central Server IP:Port for TCP telemetry | ✅ Available |
| 10 | HTTP | Server ➔ Node | `POST /api/system/reboot` | Basic / Bearer | Soft reboot microcontroller | ✅ Available |
| 11 | HTTP | Server ➔ Node | `GET /api/fs/list` | Basic / Bearer | List files in LittleFS flash | ✅ Available |
| 12 | HTTP | Server ➔ Node | `GET /api/fs/download` | Basic / Bearer | Download file from LittleFS flash | ✅ Available |
| 13 | HTTP | Server ➔ Node | `POST /api/fs/save-content` | Basic / Bearer | Write text content to LittleFS file | ✅ Available |
| 14 | HTTP | Server ➔ Node | `POST /api/fs/upload` | Basic / Bearer | Multipart file upload to LittleFS flash | ✅ Available |
| 15 | HTTP | Server ➔ Node | `POST /api/fs/delete` | Basic / Bearer | Delete file from LittleFS flash | ✅ Available |
| 16 | HTTP | Server ➔ Node | `POST /api/fs/rename` | Basic / Bearer | Rename file in LittleFS flash | ✅ Available |
| 17 | HTTP | Server ➔ Node | `POST /api/ota/upload` | Basic / Bearer | Multipart firmware `.bin` upload for OTA flash | ✅ Available |
| 18 | TCP | Node ➔ Server | Port `2000` Telemetry Heartbeat | Optional Token | Periodic telemetry with `channels[]`, `sensors[]`, `acks[]` | ⚠️ Partially (missing `sensors[]`) |
| 19 | TCP | Node ➔ Server | Port `2000` Real-time Event Push | None | Instant push on sensor event (IR decode, motion, ADC) | ⚠️ Partially (only outputs) |
| 20 | TCP | Server ➔ Node | Port `2000` `syncConfig` Response | None | Full channel matrix sync written to LittleFS | ✅ Available |
| 21 | TCP | Server ➔ Node | Port `2000` `setState` / `toggle` / `pulse` | None | Relay output actuation commands | ✅ Available |
| 22 | TCP | Server ➔ Node | Port `2000` `send_ir` Response | None | Transmit 38kHz infrared blaster signal | ❌ Not in Firmware Yet |
| 23 | TCP | Server ➔ Node | Port `2000` `reboot` Response | None | Remote soft reset command | ✅ Available |
| 24 | HTTP | Node ➔ Server | `POST /api/v1/sensors/telemetry` | Bearer / Public | Fallback HTTP sensor data ingestion | ✅ Server Ready |

---

## 2. Detailed HTTP REST APIs (Server ➔ Node)

All HTTP calls made by the Central Server target the node's local web server on port `80`.  
Authentication uses **HTTP Basic Auth** (`Authorization: Basic base64(admin:pass)`) or **Bearer Token** (`Authorization: Bearer <session_token>`).

---

### API 1: Login & Token Generation
* **Path**: `POST /api/auth/login`
* **Purpose**: Allows Central Server to generate a session token for subsequent authenticated calls.
* **Request Headers**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "username": "admin",
  "password": "admin_password"
}
```
* **Required Node Response (`200 OK`)**:
```json
{
  "success": true,
  "token": "a1b2c3d4e5f6...",
  "expiresIn": 86400
}
```

---

### API 2: Node Health & Hardware Status
* **Path**: `GET /api/status`
* **Purpose**: Central Server queries health metrics, memory, uptime, and I2C PCF8574 expander presence.
* **Request Headers**: `Accept: application/json`
* **Required Node Response (`200 OK`)**:
```json
{
  "nodeId": "NODE-8C4F00565D72",
  "name": "SmartHome-Node",
  "firmware": "1.6.0",
  "hardware": "ESP8266 (ESP-12E/F) NodeMCU",
  "uptimeSec": 3600,
  "freeHeap": 24384,
  "rssi": -42,
  "ip": "192.168.1.28",
  "mac": "8C:4F:00:56:5D:72",
  "pcf8574": {
    "detected": false,
    "address": "0x00"
  }
}
```

---

### API 3: Fetch Configured Channels
* **Path**: `GET /api/gpio`
* **Purpose**: Reads all configured GPIO channels directly from the node's flash memory (`/gpio_config.json`).
* **Request Headers**: `Accept: application/json`
* **Required Node Response (`200 OK`)**:
```json
[
  {
    "id": 1,
    "pin": 5,
    "name": "Living Room Light",
    "room": "Living Room",
    "function": "Light",
    "activeLow": true,
    "initialMode": 0,
    "enabled": true,
    "state": false,
    "label": "D1 (GPIO5)",
    "bootSensitive": false
  },
  {
    "id": 2,
    "pin": 4,
    "name": "Ceiling Fan",
    "room": "Living Room",
    "function": "Fan",
    "activeLow": true,
    "initialMode": 0,
    "enabled": true,
    "state": true,
    "label": "D2 (GPIO4)",
    "bootSensitive": false
  }
]
```

---

### API 4: Add New GPIO Channel
* **Path**: `POST /api/gpio`
* **Purpose**: Assigns a new physical GPIO pin as an active channel on the microcontroller.
* **Request Headers**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "pin": 16,
  "name": "Balcony Light Strip",
  "room": "Balcony",
  "function": "Light",
  "activeLow": true,
  "initialMode": 0
}
```
* **Required Node Behavior**:
  1. Validates that `pin` is safe (not reserved by flash SPI or UART).
  2. Sets `pinMode(pin, OUTPUT)`.
  3. Writes to `/gpio_config.json` in LittleFS.
* **Required Node Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "GPIO channel added"
}
```

---

### API 5: Update Existing Channel Parameters (Pin Renaming)
* **Path**: `POST /api/gpio/update`
* **Purpose**: Instantly renames a channel, changes its room, active-low logic, or enabled state in RAM and LittleFS.
* **Request Headers**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "id": 3,
  "name": "Balcony Light Strip",
  "room": "Balcony",
  "function": "Light",
  "activeLow": true,
  "initialMode": 0,
  "enabled": true
}
```
* **Required Node Behavior**:
  1. Finds channel by `id`.
  2. Updates channel parameters in memory.
  3. Immediately calls `saveToStorage()` to persist `/gpio_config.json` in LittleFS.
* **Required Node Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "GPIO channel updated"
}
```

---

### API 6: Delete / Unassign Channel
* **Path**: `POST /api/gpio/delete`
* **Purpose**: Removes a channel assignment and turns off the physical pin.
* **Request Headers**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "id": 3
}
```
* **Required Node Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "GPIO channel deleted"
}
```

---

### API 7: Actuate Channel Output State
* **Path**: `POST /api/gpio/state`
* **Purpose**: Controls relay output directly via HTTP.
* **Request Headers**: `Content-Type: application/json`
* **Request Body Variants**:
  - **Set State Directly**: `{"id": 1, "state": true}`
  - **Toggle**: `{"id": 1, "action": "toggle"}`
  - **Inching Pulse**: `{"id": 1, "action": "pulse", "duration": 500}`
* **Required Node Response (`200 OK`)**:
```json
{
  "success": true,
  "id": 1,
  "state": true
}
```

---

### API 8: Unified Command Execution
* **Path**: `POST /api/commands/execute`
* **Purpose**: Single unified endpoint for dispatching any command over HTTP.
* **Request Body Examples**:
  - `{"action": "setState", "id": 1, "state": true}`
  - `{"action": "toggle", "id": 1}`
  - `{"action": "pulse", "id": 1, "duration": 500}`
  - `{"action": "reboot"}`
  - `{"action": "send_ir", "protocol": "NEC", "code": "0x20DF10EF", "bits": 32}`
* **Required Node Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Command executed"
}
```

---

### API 9: Configure Receiver Telemetry Server
* **Path**: `POST /api/receiver`
* **Purpose**: Sets the Central Server IP address and port for the node's background TCP client.
* **Request Headers**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "enabled": true,
  "server": "192.168.1.10:2000"
}
```
* **Required Node Behavior**:
  Saves the server destination to flash and restarts the TCP telemetry socket to connect to the new host.
* **Required Node Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Receiver client configured"
}
```

---

### API 10: Soft Reboot Microcontroller
* **Path**: `POST /api/system/reboot`
* **Purpose**: Triggers a clean soft reboot of the ESP board.
* **Request Body**: `{}`
* **Required Node Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Rebooting..."
}
```

---

### API 11 to 16: LittleFS Remote File Manager APIs

The Central Server includes a built-in remote File Explorer for managing LittleFS files:

| Method | Endpoint | Query / Body Payload | Response Format |
|---|---|---|---|
| `GET` | `/api/fs/list` | None | `{"files": [{"name": "/gpio_config.json", "size": 342, "isDir": false}], "totalBytes": 1048576, "usedBytes": 45120}` |
| `GET` | `/api/fs/download` | Query: `?path=/gpio_config.json` | Raw file stream with `Content-Type: application/octet-stream` |
| `POST` | `/api/fs/save-content` | `{"path": "/config.json", "content": "..."}` | `{"success": true, "message": "File saved"}` |
| `POST` | `/api/fs/upload` | Multipart form-data (`file` field) | `{"success": true, "message": "File uploaded"}` |
| `POST` | `/api/fs/delete` | `{"path": "/old_file.txt"}` | `{"success": true, "message": "File deleted"}` |
| `POST` | `/api/fs/rename` | `{"oldPath": "/a.txt", "newPath": "/b.txt"}` | `{"success": true, "message": "File renamed"}` |

---

### API 17: OTA Firmware Binary Upload
* **Path**: `POST /api/ota/upload`
* **Purpose**: Flashes a compiled `.bin` firmware file directly over LAN Wi-Fi.
* **Format**: Multipart form-data upload with boundary.
* **Headers**: `Content-Type: multipart/form-data; boundary=...`
* **Node Implementation**: Uses `Update.write()` into the inactive OTA partition, verifies MD5, and reboots on completion.
* **Required Node Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "OTA update successful. Rebooting..."
}
```

---

## 3. Detailed Wire Protocol Specifications: TCP Port 2000

The Central Server runs a high-performance **TCP Server on port 2000**.  
The node acts as a **persistent TCP Client**, connecting on boot and maintaining the socket.

---

### Packet 1: Periodic Node Telemetry Heartbeat (Node ➔ Server)
* **Trigger**: Every 5 to 30 seconds (configurable in node settings).
* **Wire Format**: Single JSON line terminated by newline (`\n`).

```json
{
  "nodeId": "NODE-8C4F00565D72",
  "nodeName": "SmartHome-Node",
  "hardware": "ESP8266 (ESP-12E/F) NodeMCU",
  "firmwareVersion": "1.6.0",
  "ip": "192.168.1.28",
  "mac": "8C:4F:00:56:5D:72",
  "gateway": "192.168.1.1",
  "rssi": -38,
  "uptimeSec": 1756,
  "freeHeap": 24384,
  "channels": [
    {
      "id": 1,
      "pin": 5,
      "name": "Living Room Light",
      "room": "Living Room",
      "function": "Light",
      "activeLow": true,
      "initialMode": 0,
      "enabled": true,
      "state": false
    },
    {
      "id": 2,
      "pin": 4,
      "name": "Bedroom Fan",
      "room": "Bedroom",
      "function": "Fan",
      "activeLow": true,
      "initialMode": 0,
      "enabled": true,
      "state": true
    }
  ],
  "sensors": [
    {
      "channel_id": 3,
      "pin": 17,
      "type": "VOLTAGE",
      "name": "AC Mains Voltage",
      "room": "Main DB",
      "value": 234.6,
      "unit": "V"
    },
    {
      "channel_id": 4,
      "pin": 14,
      "type": "IR_RECEIVER",
      "name": "Living Room IR Sensor",
      "room": "Living Room",
      "value": 1,
      "strValue": "0xF720DF",
      "unit": "HEX"
    }
  ],
  "acks": [
    {
      "command_uuid": "cmd-8f3a9e21",
      "status": "ACKNOWLEDGED",
      "success": true
    }
  ]
}
```

#### Field Specifications:
* `nodeId` *(string, required)*: Formatted as `NODE-<MAC_WITHOUT_COLONS>`.
* `channels` *(array)*: All actuator/relay outputs on the board.
* `sensors` *(array)*: Real-time sensor readings (`VOLTAGE`, `IR_RECEIVER`, `PIR_MOTION`, `TEMP_HUMIDITY`).
* `acks` *(array, optional)*: Command UUIDs executed by the node since the last heartbeat.

---

### Packet 2: Central Server Response & Queued Commands (Server ➔ Node)
* **Trigger**: Central Server replies immediately upon receiving any telemetry frame from the node.
* **Wire Format**: Single JSON line terminated by `\n`.

```json
{
  "status": "ok",
  "epoch": 1795538900,
  "commands": [
    {
      "command_uuid": "sync-1795538900123",
      "action": "syncConfig",
      "config": {
        "channels": [
          {
            "id": 1,
            "pin": 5,
            "name": "Living Room Light",
            "room": "Living Room",
            "function": "Light",
            "activeLow": true,
            "initialMode": 0,
            "enabled": true
          }
        ]
      }
    },
    {
      "command_uuid": "cmd-550e8400",
      "action": "setState",
      "id": 1,
      "state": true
    },
    {
      "command_uuid": "cmd-550e8401",
      "action": "pulse",
      "id": 2,
      "duration": 500
    },
    {
      "command_uuid": "cmd-550e8402",
      "action": "send_ir",
      "protocol": "NEC",
      "code": "0x20DF10EF",
      "bits": 32
    }
  ]
}
```

#### Supported Actions in `commands[]`:
1. `syncConfig`: Full channel list. Microcontroller passes array to `GpioManager::fromJson()` and writes LittleFS.
2. `setState`: Sets output `state` to `true` or `false` on channel `id`.
3. `toggle`: Inverts output state on channel `id`.
4. `pulse`: Actuates channel for `duration` milliseconds and resets back automatically.
5. `send_ir`: Fires IR blaster LED using specified `protocol`, `code`, and `bits`.
6. `reboot`: Soft resets microcontroller.

---

### Packet 3: High-Priority Real-Time Sensor Event Push (Node ➔ Server)
* **Trigger**: Immediately when an interrupt triggers (e.g. IR remote button pressed, PIR motion detected, voltage threshold breached).
* **Wire Format**: Line-delimited JSON over TCP port `2000`.

```json
{
  "nodeId": "NODE-8C4F00565D72",
  "eventType": "sensor_event",
  "channel_id": 4,
  "pin": 14,
  "type": "IR_RECEIVER",
  "value": 1,
  "strValue": "0x20DF10EF",
  "protocol": "NEC",
  "unit": "HEX",
  "timestamp": 1795538910
}
```

---

## 4. HTTP Telemetry Ingestion Fallback (Node ➔ Server)

If TCP port `2000` is blocked by firewall or network policy, the node can push sensor readings via HTTP POST:

* **Endpoint**: `POST http://<CENTRAL_IP>:9100/api/v1/sensors/telemetry`
* **Request Headers**: `Content-Type: application/json`
* **Request Body**:
```json
{
  "nodeId": "NODE-8C4F00565D72",
  "channel_id": 3,
  "pin": 17,
  "type": "VOLTAGE",
  "value": 234.5,
  "strValue": "234.5 V",
  "unit": "V"
}
```
* **Server Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Sensor telemetry ingested"
}
```

---

## 5. Firmware Implementation Roadmap (TODO List for Microcontroller)

To bring the firmware into 100% full parity with every feature supported by Central Server, implement the following items:

### Priority 1: Add `sensors[]` to Periodic Telemetry
* **File**: `node-firmware/src/receiver_client.cpp` inside `fillTelemetryDoc()`
* **Action**: Create `JsonArray sensors = doc.createNestedArray("sensors")` alongside `channels`. Populate any configured ADC or digital sensor readings.

### Priority 2: Implement Analog Voltage Sampler
* **Pin**: `A0` (ADC0)
* **Action**: Read 100-200 raw analog samples over a 50Hz/60Hz AC cycle, calculate Root-Mean-Square (RMS), multiply by calibration factor, and report as `type: "VOLTAGE"`, `unit: "V"`.

### Priority 3: Integrate IR Remote Receiver & Transmitter
* **Library**: Add `crankyoldgit/IRremoteESP8266 @ ^2.8.6` to `platformio.ini`.
* **Receiver Pin**: Default GPIO 14 (`D5`). Instantiate `IRrecv`, decode signals non-blockingly in loop, and dispatch real-time `sensor_event` over TCP.
* **Transmitter Pin**: Default GPIO 12 (`D6`). Instantiate `IRsend`, add handler for `action: "send_ir"` in `ReceiverClient::executeCmd` and `WebServerManager::handleCommandsExecute`.

### Priority 4: Dynamic Pin Mode Support
* **File**: `node-firmware/src/gpio_manager.cpp`
* **Action**: Instead of hardcoding `pinMode(pin, OUTPUT)`, allow pins configured with `pin_mode == "SENSOR_INPUT"` to be initialized as `INPUT` or `INPUT_PULLUP`.
