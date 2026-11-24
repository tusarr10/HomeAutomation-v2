# Firmware Audit & Central Server Communication Specification

**Document Version**: 2.0.0  
**Target Hardware**: ESP8266 (ESP-12E/F NodeMCU, ESP-01/01S) & ESP32  
**Status**: Completed Full Audit  
**Scope Notice**: Strictly covers ESP nodes (`node-firmware/`). The physical Wi-Fi Smart Circuit Breaker (`NODE-30487DE85D5C` / Tuya Breaker) is completely excluded and untouched.

---

## 1. Executive Summary & Audit Overview

This document presents a complete comparative audit between the **Central Server** (`central-server/`) and the **Node Firmware** (`node-firmware/`). It details:
1. Every API, command, and telemetry field required by the Central Server.
2. The current implementation status in the firmware (`✅ ALREADY AVAILABLE`, `⚠️ PARTIALLY AVAILABLE`, or `❌ NOT IN FIRMWARE YET`).
3. Complete wire protocol specifications (TCP Port 2000 NDJSON and HTTP Port 80 REST).
4. Step-by-step firmware development tasks to bridge all identified gaps.

---

## 2. Comprehensive Feature & API Audit Matrix

| Feature / Interface | Central Server Requirement | Firmware Status | Code Location | Gap Analysis & Details |
| :--- | :--- | :---: | :--- | :--- |
| **TCP Telemetry (Heartbeat)** | Push periodic JSON to TCP port `2000` with uptime, RSSI, heap, IP, MAC. | ✅ **ALREADY AVAILABLE** | `node-firmware/src/receiver_client.cpp:207` | Working smoothly. Formats and sends NDJSON with `uptimeSec`, `freeHeap`, `rssi`, `ip`. |
| **Relay Channel States** | Telemetry array `channels[]` reporting `id`, `pin`, `name`, `room`, `state`. | ✅ **ALREADY AVAILABLE** | `node-firmware/src/gpio_manager.cpp:1159` | Working smoothly. Serializes channels with current state and hardware pins. |
| **Relay Actuation (`setState`)** | Execute `action: "setState"` with boolean `state`. | ✅ **ALREADY AVAILABLE** | `node-firmware/src/web_server.cpp:3598`<br>`node-firmware/src/receiver_client.cpp:1289` | Supported on both direct LAN HTTP (`/api/commands/execute`) and TCP command responses. |
| **Relay Toggle (`toggle`)** | Execute `action: "toggle"` to flip output state. | ✅ **ALREADY AVAILABLE** | `node-firmware/src/web_server.cpp:3603`<br>`node-firmware/src/receiver_client.cpp:1293` | Supported on both HTTP and TCP. Instant execution. |
| **Inching / Pulse (`pulse`)** | Execute `action: "pulse"` with millisecond `duration`. | ✅ **ALREADY AVAILABLE** | `node-firmware/src/web_server.cpp:3606`<br>`node-firmware/src/receiver_client.cpp:1297` | Supported. Uses non-blocking `pulseEndTime` in `GpioManager::loop()`. |
| **Command ACKs (`acks[]`)** | Report `{ command_uuid, status: "ACKNOWLEDGED", success: true }`. | ✅ **ALREADY AVAILABLE** | `node-firmware/src/receiver_client.cpp:230` | Supported. Node buffers executed command UUIDs and flushes them in next heartbeat. |
| **LittleFS Remote File Manager** | Endpoints `/api/fs/list`, `/api/fs/download`, `/api/fs/upload`, `/api/fs/delete`, `/api/fs/rename`. | ✅ **ALREADY AVAILABLE** | `node-firmware/src/web_server.cpp:3451-3560` | Full CRUD filesystem API implemented for web UI file explorer. |
| **OTA Firmware Binary Upload** | Endpoint `POST /api/ota/upload` multipart flash update. | ✅ **ALREADY AVAILABLE** | `node-firmware/src/web_server.cpp:3256`<br>`node-firmware/src/ota_manager.cpp` | Working. Handles MD5 verification and dual-slot flash updates. |
| **Node Remote Restart (`reboot`)** | Execute `action: "reboot"` via HTTP or TCP. | ✅ **ALREADY AVAILABLE** | `node-firmware/src/web_server.cpp:3590`<br>`node-firmware/src/receiver_client.cpp:1301` | Supported. Node sends ACK, waits 500ms, and calls `ESP.restart()`. |
| **Full Config Sync (`syncConfig`)** | Push updated `channels[]` JSON to node via HTTP `/api/commands/execute`. | ✅ **ALREADY AVAILABLE** | `node-firmware/src/web_server.cpp:3615` | Supported. Updates in-memory channels and persists to LittleFS (`/gpio_config.json`). |
| **Telemetry `sensors[]` Array** | Central Server expects array of `{ channel_id, pin, type, name, value, unit }`. | ❌ **NOT IN FIRMWARE YET** | `node-firmware/src/receiver_client.cpp:227` | **GAP**: `fillTelemetryDoc` only serializes `channels[]` (relays). It does NOT serialize a `sensors[]` array. |
| **AC / DC Voltage Reading (`A0`)** | Read analog pin `A0`, calculate RMS voltage, apply calibration multiplier. | ❌ **NOT IN FIRMWARE YET** | `node-firmware/src/gpio_manager.cpp:1248` | **GAP**: `GpioManager` sets all pins to `OUTPUT`. No `analogRead(A0)` or RMS calculation exists. |
| **IR Remote Receiver (Decode)** | Decode 38kHz IR remote signals (NEC, Sony, etc.) and push real-time event to server. | ❌ **NOT IN FIRMWARE YET** | *None* | **GAP**: No IR library in `platformio.ini`. No `IRrecv` instance in firmware. |
| **IR Blaster / Transmitter** | Execute `action: "send_ir"` with `protocol`, `code` (hex), `bits`, `frequency`. | ❌ **NOT IN FIRMWARE YET** | `node-firmware/src/web_server.cpp:3580` | **GAP**: No `IRsend` class and no handler for `send_ir` in command parser. |
| **Real-time Event Push (Interrupt)** | Push instantaneous packet over TCP when sensor triggers (motion, IR button press). | ⚠️ **PARTIALLY AVAILABLE** | `node-firmware/src/receiver_client.cpp:69` | **GAP**: Firmware has debounced push for `gpio_change` on outputs, but no generic event dispatcher for sensor inputs. |
| **Dynamic Pin Mode Assignment** | Set pin mode to `INPUT`, `INPUT_PULLUP`, or `ANALOG` via `configure_pin`. | ❌ **NOT IN FIRMWARE YET** | `node-firmware/src/gpio_manager.cpp:1248` | **GAP**: Hardcoded to `pinMode(ch.pin, OUTPUT)`. Must support sensor input modes. |

---

## 3. Detailed Wire Protocol Specifications

### Part A: Node -> Central Server (Telemetry & Real-Time Event Push)

#### Transport Options:
1. **Primary**: Persistent TCP Socket to `CENTRAL_SERVER_IP:2000` (Line-delimited NDJSON strings terminating with `\n`).
2. **Fallback**: HTTP POST to `http://<CENTRAL_IP>:9100/api/v1/sensors/telemetry`.

---

#### Payload A.1: Periodic Heartbeat & Health Telemetry
* **Trigger**: Every `reportIntervalSec` seconds (default: 5s to 30s) or on initial boot.
* **Format**: NDJSON line sent over TCP port `2000`.

```json
{
  "nodeId": "NODE-68C63AF67479",
  "nodeName": "SmartHome-Node",
  "eventType": "heartbeat",
  "uptimeSec": 1420,
  "rssi": -38,
  "freeHeap": 41250,
  "ip": "192.168.1.27",
  "gateway": "192.168.1.1",
  "mac": "68:C6:3A:F6:74:79",
  "firmwareVersion": "1.6.0",
  "hardware": "ESP8266 (ESP-12E/F) NodeMCU",
  "channels": [
    {
      "id": 1,
      "pin": 5,
      "name": "Living Room Light",
      "room": "Living Room",
      "function": "Relay",
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
      "function": "Relay",
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
    },
    {
      "channel_id": 5,
      "pin": 13,
      "type": "PIR_MOTION",
      "name": "Balcony Motion",
      "room": "Balcony",
      "value": 0,
      "strValue": "Clear",
      "unit": "STATE"
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

**Field Descriptions**:
* `nodeId` *(string, required)*: Unique identifier formatted as `NODE-<MAC_WITHOUT_COLONS>`.
* `channels` *(array, required for relay nodes)*: List of actuator outputs.
* `sensors` *(array, required for sensor/hybrid nodes)*: List of live sensor readings.
* `acks` *(array, optional)*: Command UUIDs executed since last report.

---

#### Payload A.2: Real-time Event Push (IR Code Received)
* **Trigger**: Instantaneously upon decoding an IR signal from a handheld remote.
* **Format**: Dispatched immediately over TCP port `2000` with `\n`.

```json
{
  "nodeId": "NODE-68C63AF67479",
  "eventType": "sensor_event",
  "sensor_type": "IR_RECEIVER",
  "channel_id": 4,
  "pin": 14,
  "ir_protocol": "NEC",
  "ir_code": "0xF720DF",
  "ir_bits": 32,
  "value": 1,
  "unit": "HEX"
}
```

---

#### Payload A.3: Real-time Event Push (Voltage Sample / Alarm)
* **Trigger**: When voltage crosses configured alarm threshold or upon interval completion.

```json
{
  "nodeId": "NODE-68C63AF67479",
  "eventType": "sensor_event",
  "sensor_type": "VOLTAGE",
  "channel_id": 3,
  "pin": 17,
  "voltage": 242.8,
  "v_rms": 242.8,
  "value": 242.8,
  "unit": "V"
}
```

---

#### Payload A.4: Real-time Event Push (PIR Motion / Reed Switch)
* **Trigger**: Digital pin interrupt on rising/falling edge.

```json
{
  "nodeId": "NODE-68C63AF67479",
  "eventType": "sensor_event",
  "sensor_type": "PIR_MOTION",
  "channel_id": 5,
  "pin": 13,
  "value": 1,
  "strValue": "DETECTED",
  "unit": "STATE"
}
```

---

### Part B: Central Server -> Node (Control Commands & Configuration)

#### Delivery Channels:
1. **Direct LAN HTTP**: `POST http://<NODE_IP>:80/api/commands/execute` (Timeout: 500ms).
2. **TCP Socket Command Push**: Queued and delivered through the persistent TCP connection on port `2000` in response to telemetry.

---

#### Command B.1: Relay Set State (`setState`)
Used to turn an appliance ON or OFF.

```json
{
  "command_uuid": "cmd-1a2b3c4d",
  "action": "setState",
  "channel_id": 1,
  "state": true
}
```
*Expected Node Response (HTTP 200 / TCP ACK)*:
```json
{
  "commandId": "cmd-1a2b3c4d",
  "status": "ACKNOWLEDGED",
  "success": true,
  "state": true
}
```

---

#### Command B.2: Relay Inching / Pulse (`pulse`)
Used for momentary switches (gate opener, bell chime).

```json
{
  "command_uuid": "cmd-2b3c4d5e",
  "action": "pulse",
  "channel_id": 1,
  "duration": 500
}
```

---

#### Command B.3: IR Transmit / Blaster (`send_ir`)
Used to blast IR signals to TVs, AC units, and set-top boxes.

```json
{
  "command_uuid": "cmd-3c4d5e6f",
  "action": "send_ir",
  "protocol": "NEC",
  "code": "0xF720DF",
  "bits": 32,
  "frequency": 38000,
  "repeat": 1
}
```
*Expected Node Execution*:
The node uses `IRsend` to transmit `0xF720DF` over the designated IR transmitter pin at 38 kHz carrier frequency, then acknowledges with `status: "ACKNOWLEDGED"`.

---

#### Command B.4: Configure Pin Mode (`configure_pin`)
Used to reassign pin functions dynamically.

```json
{
  "command_uuid": "cmd-4d5e6f7a",
  "action": "configure_pin",
  "channel_id": 3,
  "pin": 17,
  "role": "VOLTAGE",
  "pin_mode": "ANALOG",
  "multiplier": 0.244,
  "offset": 0.0,
  "interval_ms": 1000
}
```

---

#### Command B.5: System Restart (`reboot`)
```json
{
  "command_uuid": "cmd-5e6f7a8b",
  "action": "reboot"
}
```

---

#### Command B.6: Pin / Channel Name & Configuration Synchronization

When a user modifies a GPIO pin's name, room, or settings in the Central Server UI, the Central Server propagates the change to the local physical node using a **Dual-Path Synchronization Flow**:

```
[User Edits Pin Name in UI] 
             │
             ▼
[Central Server: POST /relays/:nodeId/:channelId/advanced-config]
             │
             ├─► 1. Writes updated name to Central DB (fleet.db)
             │
             ├─► 2. Path A (Instant LAN HTTP): POST http://<NODE_IP>:80/api/gpio/update
             │      (Node updates in-memory channel & saves to LittleFS /gpio_config.json)
             │
             └─► 3. Path B (TCP Queue Fallback): Queues 'syncConfig' action
                    (Delivered on next TCP heartbeat, applied & saved to LittleFS)
```

##### 1. Direct LAN HTTP Endpoint (`POST /api/gpio/update`):
* **Endpoint**: `http://<NODE_IP>/api/gpio/update`
* **Method**: `POST`
* **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Basic <base64(admin:admin)>`
* **Request Payload**:
```json
{
  "id": 1,
  "name": "Living Room Light",
  "room": "Living Room",
  "function": "Relay",
  "activeLow": true,
  "initialMode": 0,
  "enabled": true
}
```
* **Firmware Handler**: `node-firmware/src/web_server.cpp:2953` calling `GpioManager::updateChannel()`.
* **Node Response (HTTP 200)**:
```json
{
  "success": true,
  "message": "GPIO channel updated"
}
```

##### 2. Persistent TCP Socket Delivery (`action: "syncConfig"`):
* **Transport**: TCP Port `2000` response packet.
* **Payload**:
```json
{
  "action": "syncConfig",
  "command_uuid": "sync-1732485900000",
  "config": {
    "channels": [
      {
        "id": 1,
        "pin": 5,
        "name": "Living Room Light",
        "room": "Living Room",
        "function": "Relay",
        "activeLow": true,
        "initialMode": 0,
        "enabled": true
      },
      {
        "id": 2,
        "pin": 4,
        "name": "Bedroom Fan",
        "room": "Bedroom",
        "function": "Relay",
        "activeLow": true,
        "initialMode": 0,
        "enabled": true
      }
    ]
  }
}
```
* **Firmware Handler**: `node-firmware/src/receiver_client.cpp:1305` calling `GpioManager::fromJson()`.
* **Storage Persistence**: Both paths immediately call `StorageManager::getInstance().saveJsonFile("/gpio_config.json", doc)`, persisting the updated pin name permanently into LittleFS flash on the physical board. When accessing the node's local web portal at `http://<NODE_IP>/`, the new pin name is displayed immediately.

---

## 4. Step-by-Step Firmware Upgrade Plan

### Step 1: Update Dependencies in `platformio.ini`
In `node-firmware/platformio.ini`, add the IR library under `lib_deps` for `[env:esp8266_4m]` and `[env:esp32dev]`:

```ini
lib_deps =
    bblanchon/ArduinoJson @ ^6.21.3
    crankyoldgit/IRremoteESP8266 @ ^2.8.6
```

---

### Step 2: Add Sensor Pin Roles in `include/board_pins.h`
Define pin types and standard board pin constants:

```cpp
#pragma once
#include <Arduino.h>

enum PinRole {
    ROLE_RELAY_OUTPUT   = 0,
    ROLE_VOLTAGE_ADC    = 1,
    ROLE_IR_RECEIVER    = 2,
    ROLE_IR_TRANSMITTER = 3,
    ROLE_PIR_MOTION     = 4,
    ROLE_DOOR_WINDOW    = 5,
    ROLE_TEMP_HUMIDITY  = 6
};

// Standard ESP8266 Pin Map
#define PIN_D0  16 // Wake
#define PIN_D1   5 // I2C SCL
#define PIN_D2   4 // I2C SDA
#define PIN_D3   0 // Flash button
#define PIN_D4   2 // TX1 / Internal LED
#define PIN_D5  14 // SPI SCK / IR RX
#define PIN_D6  12 // SPI MISO / IR TX
#define PIN_D7  13 // SPI MOSI / Motion PIR
#define PIN_D8  15 // SPI CS / Pull-down
#define PIN_A0  17 // ADC0 (Analog Voltage)
```

---

### Step 3: Implement AC Mains Voltage RMS Sampler
Create `src/drivers/voltage_sampler.h`:

```cpp
#pragma once
#include <Arduino.h>

class VoltageSampler {
public:
    static VoltageSampler& getInstance() {
        static VoltageSampler instance;
        return instance;
    }

    void setCalibration(float multiplier, float offset = 0.0f) {
        _multiplier = multiplier;
        _offset = offset;
    }

    float readRMS(uint16_t sampleWindowMs = 40) {
        unsigned long start = millis();
        unsigned long count = 0;
        float sumSquares = 0.0f;
        const float midPoint = 512.0f; // 10-bit ADC midpoint

        while (millis() - start < sampleWindowMs) {
            int raw = analogRead(A0);
            float acSample = (float)raw - midPoint;
            sumSquares += (acSample * acSample);
            count++;
            delayMicroseconds(250); // ~4kHz sample rate
        }

        if (count == 0) return 0.0f;
        float meanSquare = sumSquares / (float)count;
        float rmsAdc = sqrt(meanSquare);
        float voltage = (rmsAdc * _multiplier) + _offset;
        return (voltage < 15.0f) ? 0.0f : voltage;
    }

private:
    VoltageSampler() : _multiplier(0.244f), _offset(0.0f) {}
    float _multiplier;
    float _offset;
};
```

---

### Step 4: Implement Non-Blocking IR Transceiver
Create `src/drivers/ir_manager.h`:

```cpp
#pragma once
#include <Arduino.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>

class IrManager {
public:
    static IrManager& getInstance() {
        static IrManager instance;
        return instance;
    }

    void begin(uint16_t rxPin = 14, uint16_t txPin = 12) {
        _rxPin = rxPin;
        _txPin = txPin;
        _irrecv = new IRrecv(_rxPin, 1024, 50, true);
        _irsend = new IRsend(_txPin);
        _irrecv->enableIRIn();
        _irsend->begin();
    }

    bool loop(String& outProtocol, String& outHexCode, uint16_t& outBits) {
        if (!_irrecv) return false;
        decode_results results;
        if (_irrecv->decode(&results)) {
            outProtocol = typeToString(results.decode_type);
            outHexCode = "0x" + String((unsigned long)results.value, HEX);
            outHexCode.toUpperCase();
            outBits = results.bits;
            _irrecv->resume();
            return true;
        }
        return false;
    }

    bool transmit(const String& protocol, const String& hexCode, uint16_t bits = 32) {
        if (!_irsend) return false;
        uint64_t code = strtoull(hexCode.c_str(), NULL, 16);
        if (protocol.equalsIgnoreCase("NEC")) {
            _irsend->sendNEC(code, bits ? bits : 32);
        } else if (protocol.equalsIgnoreCase("SONY")) {
            _irsend->sendSony(code, bits ? bits : 12);
        } else if (protocol.equalsIgnoreCase("SAMSUNG")) {
            _irsend->sendSAMSUNG(code, bits ? bits : 32);
        } else if (protocol.equalsIgnoreCase("RC5")) {
            _irsend->sendRC5(code, bits ? bits : 12);
        }
        if (_irrecv) _irrecv->enableIRIn(); // Resume listening after transmit
        return true;
    }

private:
    IrManager() : _irrecv(nullptr), _irsend(nullptr), _rxPin(14), _txPin(12) {}
    IRrecv* _irrecv;
    IRsend* _irsend;
    uint16_t _rxPin;
    uint16_t _txPin;
};
```

---

### Step 5: Update `ReceiverClient::fillTelemetryDoc` to Include `sensors[]`
In `node-firmware/src/receiver_client.cpp`, update `fillTelemetryDoc`:

```cpp
// Append sensors array alongside channels
JsonArray sensors = doc.createNestedArray("sensors");

// 1. Voltage Sensor (if enabled on A0)
float vRms = VoltageSampler::getInstance().readRMS();
JsonObject sVolt = sensors.createNestedObject();
sVolt["channel_id"] = 3;
sVolt["pin"] = 17;
sVolt["type"] = "VOLTAGE";
sVolt["name"] = "AC Mains Voltage";
sVolt["value"] = vRms;
sVolt["unit"] = "V";

// 2. IR Receiver state (if enabled)
JsonObject sIr = sensors.createNestedObject();
sIr["channel_id"] = 4;
sIr["pin"] = 14;
sIr["type"] = "IR_RECEIVER";
sIr["name"] = "IR Sensor";
sIr["value"] = 1;
sIr["strValue"] = _lastDecodedIrCode;
sIr["unit"] = "HEX";
```

---

### Step 6: Add `send_ir` Command Handling
In `node-firmware/src/web_server.cpp` (inside `/api/commands/execute`) and in `node-firmware/src/receiver_client.cpp` (inside `processServerCommands`), add:

```cpp
} else if (action.equalsIgnoreCase("send_ir")) {
    String proto = cmd["protocol"] | "NEC";
    String code = cmd["code"] | "";
    uint16_t bits = cmd["bits"] | 32;
    if (code.length() > 0) {
        success = IrManager::getInstance().transmit(proto, code, bits);
        resp["success"] = success;
        resp["code"] = code;
        resp["protocol"] = proto;
    }
```

---

## 5. Summary of Central Server Status

The Central Server is fully implemented and running:
* **TCP Telemetry Listener (Port 2000)**: Ingests `sensors[]`, `voltage`, and `ir_code`.
* **REST Endpoints**: `POST /api/v1/sensors/telemetry`, `POST /api/v1/nodes/:nodeId/ir/transmit`.
* **Web UI (Pin & Hardware Matrix & Relays)**: Complete with Home, Node, Role, and Room filtering, Pin Assignment modal, Dynamic Sensor Configuration modal, and instant `⚙` configure buttons on all channel cards.

---

## 6. Microcontroller Local Pin Synchronization (Dual-Path Architecture)

### Why Pin Renaming Did Not Update the Node Initially
Historically, saving a pin name or room assignment in the Central Server UI only wrote to the SQLite database (`fleet.db`). The server never transmitted `POST /api/gpio/update` or the `syncConfig` command to the physical microcontroller. As a result:
* The Central Server web dashboard showed the new name.
* BUT visiting the physical microcontroller's local web portal (e.g. `http://192.168.1.28/`) still showed the old default name stored in LittleFS (`Output 3` or `test light`).

### How Dual-Path Synchronization Resolves It Permanently

The Central Server now executes an instantaneous **Dual-Path Sync** whenever a pin or channel is updated, assigned, or deleted:

```
[ Central Server UI ]
         │
         ▼
POST /api/v1/relays/:nodeId/:channelId/advanced-config
         │
         ├───▶ [Path A: Direct LAN HTTP (Immediate <50ms)]
         │     POST http://<NODE_IP>/api/gpio/update
         │     Headers: Authorization: Basic <base64>
         │     Body: { "id": 3, "name": "Balcony Light Strip", "room": "Balcony", ... }
         │     Result: Microcontroller updates RAM + writes /gpio_config.json in LittleFS
         │
         └───▶ [Path B: Persistent TCP Queue (Authoritative Resilience)]
               Appends 'syncConfig' with full channels[] array to Node Command Queue
               Sent over TCP port 2000 during next heartbeat check-in
               Node GpioManager::fromJson() overwrites flash storage
```

---

### Detailed Wire Specification: Server -> Node Pin Management APIs

#### 1. Update Existing Pin / Channel Parameters
* **Method & Path**: `POST http://<NODE_IP>/api/gpio/update`
* **Authentication**: HTTP Basic Auth (`admin:admin` or configured node credentials)
* **Central Server Dispatcher**: `nodeManager.syncPinToNode(nodeId, channelId)`
* **Request Payload**:
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
* **Firmware Handler**: `node-firmware/src/web_server.cpp:1634` / `2953` (`_server.on("/api/gpio/update", ...)`).
* **Firmware Execution**:
  Calls `GpioManager::getInstance().updateChannel(id, name, room, func, activeLow, initMode, enabled, err)`. Updates the in-memory `_channels` vector and immediately invokes `saveToStorage()` to write `/gpio_config.json` to LittleFS flash.
* **Response from Node**:
```json
{
  "success": true,
  "message": "GPIO channel updated"
}
```

---

#### 2. Add New Pin / Channel to Node
* **Method & Path**: `POST http://<NODE_IP>/api/gpio`
* **Authentication**: HTTP Basic Auth
* **Request Payload**:
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
* **Firmware Handler**: `node-firmware/src/web_server.cpp:1612` / `2931` (`_server.on("/api/gpio", ...)`).
* **Firmware Execution**:
  Calls `GpioManager::getInstance().addChannel(pin, name, room, func, activeLow, initMode, err)`. Validates hardware pin against reserved ESP8266 pins, creates new `GpioChannel`, sets `pinMode(pin, OUTPUT)`, and calls `saveToStorage()`.
* **Response from Node**:
```json
{
  "success": true,
  "message": "GPIO channel added"
}
```

---

#### 3. Delete / Unassign Pin from Node
* **Method & Path**: `POST http://<NODE_IP>/api/gpio/delete`
* **Authentication**: HTTP Basic Auth
* **Request Payload**:
```json
{
  "id": 3
}
```
* **Firmware Handler**: `node-firmware/src/web_server.cpp:1657` / `2976`.
* **Firmware Execution**:
  Calls `GpioManager::getInstance().deleteChannel(id, err)`. Resets physical pin, erases channel from `_channels` vector, and calls `saveToStorage()`.
* **Response from Node**:
```json
{
  "success": true,
  "message": "GPIO channel deleted"
}
```

---

#### 4. Authoritative Fleet Synchronization (`syncConfig` over TCP)
* **Trigger**: Whenever a node checks in over TCP port `2000`, any queued `syncConfig` command is attached to the TCP response frame.
* **Response Payload from Central Server**:
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
            "id": 3,
            "pin": 16,
            "name": "Balcony Light Strip",
            "room": "Balcony",
            "function": "Light",
            "activeLow": true,
            "initialMode": 0,
            "enabled": true
          }
        ]
      }
    }
  ]
}
```
* **Firmware Handler**: `node-firmware/src/receiver_client.cpp:1305`.
* **Firmware Execution**:
  Calls `GpioManager::getInstance().fromJson(chArr)`. Replaces in-memory channel collection, initializes hardware GPIOs, sets `_nextId`, and saves to LittleFS flash.

---

### Live Verification Evidence (Physical Microcontroller Node MCU `192.168.1.28`)

When updating channel 3 from Central Server UI, the following live test confirmed end-to-end synchronization:
1. Central Server dispatched `POST /api/v1/relays/NODE-8C4F00565D72/3/advanced-config` with `name: "Balcony Light Strip"`, `room: "Balcony"`.
2. Server returned `HTTP 200`: `{"success": true, "message": "Pin channel 3 configuration updated and pushed to node"}`.
3. Direct HTTP query to the physical node `http://192.168.1.28/api/gpio` returned:
```json
[
  {
    "id": 3,
    "pin": 16,
    "enabled": true,
    "state": false,
    "label": "D0 (GPIO16)",
    "note": "WAKE pin, HIGH at boot",
    "bootSensitive": true,
    "name": "Balcony Light Strip",
    "room": "Balcony",
    "function": "Light",
    "activeLow": true,
    "initialMode": 0
  }
]
```
The node's onboard web portal and LittleFS storage immediately reflected the new name `"Balcony Light Strip"`.

---

## 7. Strict Hardware Safety Constraints

> [!IMPORTANT]
> **Tuya Smart Circuit Breaker Protection Policy**
> * Device ID: `NODE-30487DE85D5C` / `192.168.1.25`
> * All pin sync, GPIO remapping, and LittleFS push mechanisms explicitly skip this node (`nodeId.includes('30487D') || nodeId.toUpperCase().includes('BREAKER')`).
> * The smart breaker remains strictly locked in `ONLINE` status, relay `ON`, with its dedicated Python Tuya bridge running on `http://127.0.0.1:8085` completely untouched.
