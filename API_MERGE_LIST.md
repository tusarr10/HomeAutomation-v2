# SmartHome System: Master Merged API Specification & Protocol Matrix

**System Architecture:** Central Server (`Node.js/Express` @ Port `9100`) ⇄ Microcontroller Nodes (`ESP8266 / ESP32` @ Port `80` & TCP Port `2000`)  
**Firmware Version:** `1.6.0`  
**Specification Version:** `3.0.0`  
**Generated Date:** November 2026  

---

## 1. System Communication Architecture

The SmartHome ecosystem relies on a hybrid communication model designed for sub-millisecond local LAN execution, zero-breakage resilience, and asynchronous cloud/remote dispatch:

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           CENTRAL SERVER (Port 9100)                              │
│                                                                                   │
│  - REST API Engine (/api/v1 & /api)           - TCP Telemetry Receiver (Port 2000)│
│  - SQLite Fleet DB (fleet.db)                 - Real-time WebSocket Hub (/ws)     │
│  - Tuya LAN Breaker Bridge (:8085)            - LittleFS File Backup & OTA Engine │
└───────────────────────┬───────────────────────────────────▲───────────────────────┘
                        │                                   │
      1. Synchronous    │                                   │ 2. Asynchronous
         Direct LAN     │                                   │    NDJSON Stream
         HTTP Commands  │                                   │    (Every 5s-30s +
         (Port 80)      ▼                                   │     Instant Interrupts)
┌───────────────────────────────────────────────────────────┴───────────────────────┐
│                          ESP8266 / ESP32 NODE (Port 80)                           │
│                                                                                   │
│  - Dual-Auth Engine (Human Admin & Server Key)  - LittleFS Flash Storage (Config) │
│  - Virtual PCF8574 I2C Expander (P0-P7 / 100-107)- 38kHz IR Transceiver Engine    │
│  - Edge Automation Engine (Sub-1ms latency)     - Analog A0 RMS Voltage Monitor   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Master Unified Endpoint Merge Matrix

| # | Protocol | Source | Destination | Endpoint / Wire Action | Purpose / Capability | Central Server Route | Node Firmware Handler | Integration Status |
|---|:---:|:---:|:---:|:---|:---|:---|:---|:---:|
| **1** | HTTP | Central Server / UI | Node | `POST /api/auth/login` | Session token generation | `nodeManager.authenticateNode()` | `WebServerManager::registerApiRoutes()` | 🟢 **Matched** |
| **2** | HTTP | Central Server / UI | Node | `GET /api/auth/check` | Validate active authentication | *Internal verification* | `WebServerManager::registerApiRoutes()` | 🟢 **Matched** |
| **3** | HTTP | Central Server / UI | Node | `POST /api/auth/logout` | Revoke session token | *Session lifecycle* | `WebServerManager::registerApiRoutes()` | 🟢 **Matched** |
| **4** | HTTP | Central Server | Node | `GET / POST /api/auth/pair` | Query pairing status / provision server pairing key | Node onboarding flow | `AuthManager::setServerPairingKey()` | 🟢 **Matched** |
| **5** | HTTP | Central Server | Node | `POST /api/auth/unpair` | Clear server pairing key | Node decommissioning | `AuthManager::clearServerPairingKey()` | 🟢 **Matched** |
| **6** | HTTP | Central Server / UI | Node | `GET /api/status` | Microcontroller health, heap, uptime, RSSI, PCF8574 | `GET /api/v1/nodes/:id` / Poller | `WebServerManager::registerApiRoutes()` | 🟢 **Matched** |
| **7** | HTTP | Node | Client | `GET /api/all` | Self-discovery API catalog (all 57 REST endpoints) | *Developer Discovery* | `API_CATALOG_JSON` (`PROGMEM`) | 🟢 **Matched** |
| **8** | HTTP | Central Server / UI | Node | `GET /api/logs` | Fetch circular in-memory diagnostic logs | `GET /api/v1/nodes/:id/logs` | `Logger::toJson()` | 🟢 **Matched** |
| **9** | HTTP | Central Server / UI | Node | `GET /api/gpio` | Query full channel matrix & states | `GET /api/v1/nodes/:id/pins` | `GpioManager::toJson()` | 🟢 **Matched** |
| **10** | HTTP | Central Server / UI | Node | `GET /api/sensors` | Filtered list of pure input sensors | Poller / UI Sensor Cards | `WebServerManager::registerApiRoutes()` | 🟢 **Matched** |
| **11** | HTTP | Central Server / UI | Node | `POST /api/gpio` | Add brand new physical or I2C pin channel | `POST /api/v1/nodes/:id/pins` | `GpioManager::addChannel()` | 🟢 **Matched** |
| **12** | HTTP | Central Server / UI | Node | `POST /api/gpio/update` | Update channel name, room, function, activeLow | `syncPinToNode()` / Advanced Config | `GpioManager::updateChannel()` | 🟢 **Matched** |
| **13** | HTTP | Central Server / UI | Node | `POST /api/gpio/delete` | Delete / unassign channel from microcontroller | `DELETE /api/v1/nodes/:id/pins/:ch` | `GpioManager::deleteChannel()` | 🟢 **Matched** |
| **14** | HTTP | Central Server / UI | Node | `POST /api/gpio/state` | Set relay state, toggle, or pulse | Legacy fallback execution | `GpioManager::setState() / toggle()` | 🟢 **Matched** |
| **15** | HTTP | Central Server / UI | Node | `POST /api/commands/execute` | Unified command dispatcher (`setState`, `toggle`, `pulse`, `reboot`, `syncConfig`) | Fast-path in `sendDirectLanHttp()` | `WebServerManager::handleCommandsExecute()` | 🟢 **Matched** |
| **16** | HTTP | Central Server | Node | `POST /api/commands/execute` (`action: send_ir`) | Transmit 38kHz infrared blaster signal | `POST /api/v1/nodes/:id/ir/transmit` | `IrManager::transmit()` | 🔴 **Missing in Node Cmd** |
| **17** | HTTP | Central Server / UI | Node | `GET /api/i2c` | Inspect I2C bus config & PCF8574 status | Expander status sync | `WebServerManager::registerApiRoutes()` | 🟢 **Matched** |
| **18** | HTTP | Central Server / UI | Node | `POST /api/i2c` | Configure I2C SDA/SCL pins and expander address | Hardware config | `GpioManager::setI2cConfig()` | 🟢 **Matched** |
| **19** | HTTP | Central Server / UI | Node | `POST /api/i2c/auto-channels`| Auto-map P0-P7 to virtual channels 100-107 | Batch expander init | `GpioManager::autoConfigurePcfChannels()` | 🟢 **Matched** |
| **20** | HTTP | Central Server / UI | Node | `GET /api/i2c/scan` | I2C address bus scanner (0x01–0x7F) | Diagnostics | `Wire` scanner loop | 🟢 **Matched** |
| **21** | HTTP | Central Server / UI | Node | `GET /api/ir/status` | Query IR receiver/transmitter pin & training state | Hardware diagnostic | `IrManager::getStatusJson()` | 🟢 **Matched** |
| **22** | HTTP | Central Server / UI | Node | `POST /api/ir/train/start` | Enter interactive IR code learning mode | UI Remote Builder | `IrManager::startTraining()` | 🟢 **Matched** |
| **23** | HTTP | Central Server / UI | Node | `POST /api/ir/train/stop` | Abort IR code learning mode | UI Remote Builder | `IrManager::stopTraining()` | 🟢 **Matched** |
| **24** | HTTP | Central Server / UI | Node | `GET /api/ir/train/result`| Poll latest intercepted IR signal | UI Remote Builder | `IrManager::getLastCaptured()` | 🟢 **Matched** |
| **25** | HTTP | Central Server / UI | Node | `POST /api/ir/transmit` | Direct REST IR code blaster transmission | UI Remote Control | `IrManager::transmit()` | 🟢 **Matched** |
| **26** | HTTP | Central Server / UI | Node | `GET /api/ir/remotes` | Fetch virtual remote controls & buttons | `config/ir_codes.json` Explorer | `IrManager::getRemotesJson()` | 🟢 **Matched** |
| **27** | HTTP | Central Server / UI | Node | `POST /api/ir/remotes/save`| Save button code into virtual remote | UI Remote Manager | `IrManager::saveButton()` | 🟢 **Matched** |
| **28** | HTTP | Central Server / UI | Node | `POST /api/ir/remotes/delete`| Delete button or entire virtual remote | UI Remote Manager | `IrManager::deleteRemoteOrButton()` | 🟢 **Matched** |
| **29** | HTTP | Central Server | Node | `GET /api/receiver` | Get Central Server IP:Port telemetry settings | Status sync | `ReceiverClient::getStatusJson()` | 🟢 **Matched** |
| **30** | HTTP | Central Server | Node | `POST /api/receiver` | Configure Central Server IP:Port for telemetry | `POST /api/v1/nodes/:id/push-config`| `ReceiverClient::setConfig()` | 🟢 **Matched** |
| **31** | HTTP | Central Server / UI | Node | `POST /api/receiver/test` | Ping Central Server TCP telemetry socket | Diagnostics | `ReceiverClient::testConnection()` | 🟢 **Matched** |
| **32** | HTTP | Central Server / UI | Node | `POST /api/receiver/push` | Force immediate telemetry transmission | Fleet sync | `ReceiverClient::pushTelemetry()` | 🟢 **Matched** |
| **33** | HTTP | Central Server / UI | Node | `GET /api/wifi/status` | Check Wi-Fi link, RSSI, IP, gateway | Status poll | `WifiManager::getStatusJson()` | 🟢 **Matched** |
| **34** | HTTP | Central Server / UI | Node | `GET /api/wifi/scan` | Scan surrounding 2.4GHz Wi-Fi networks | Provisioning | `WifiManager::scanNetworks()` | 🟢 **Matched** |
| **35** | HTTP | Central Server / UI | Node | `POST /api/wifi/connect` | Save Wi-Fi router credentials and connect | Provisioning | `WifiManager::connectSTA()` | 🟢 **Matched** |
| **36** | HTTP | Central Server / UI | Node | `POST /api/wifi/mode` | Switch Wi-Fi mode (AP, STA, AP+STA) | Network Management | `WifiManager::setMode()` | 🟢 **Matched** |
| **37** | HTTP | Central Server / UI | Node | `POST /api/wifi/reset` | Erase Wi-Fi credentials and start captive portal| Factory recovery | `WifiManager::resetCredentials()` | 🟢 **Matched** |
| **38** | HTTP | Central Server / UI | Node | `GET /api/automation` | List localized edge automation rules | Automation manager | `AutomationEngine::toJson()` | 🟢 **Matched** |
| **39** | HTTP | Central Server / UI | Node | `POST /api/automation` | Add localized edge automation rule | Automation manager | `AutomationEngine::addRule()` | 🟢 **Matched** |
| **40** | HTTP | Central Server / UI | Node | `POST /api/automation/toggle`| Enable or disable edge automation rule | Automation manager | `AutomationEngine::toggleRule()` | 🟢 **Matched** |
| **41** | HTTP | Central Server / UI | Node | `POST /api/automation/delete`| Delete edge automation rule | Automation manager | `AutomationEngine::deleteRule()` | 🟢 **Matched** |
| **42** | HTTP | Central Server / UI | Node | `GET /api/settings` | Device hostname, AP config, NTP timezone offset| Diagnostics | `StorageManager::loadSystemConfig()`| 🟢 **Matched** |
| **43** | HTTP | Central Server / UI | Node | `POST /api/settings` | Update device name, AP credentials, timezone | Device settings | `StorageManager::saveSystemConfig()`| 🟢 **Matched** |
| **44** | HTTP | Central Server / UI | Node | `POST /api/settings/password`| Change human admin password | Security management | `AuthManager::changePassword()` | 🟢 **Matched** |
| **45** | HTTP | Central Server / UI | Node | `POST /api/settings/ntp-sync`| Force NTP time synchronization | Clock synchronization | `AutomationEngine::syncNTP()` | 🟢 **Matched** |
| **46** | HTTP | Central Server / UI | Node | `POST /api/system/reboot` | Soft restart microcontroller | `POST /api/v1/nodes/:id/restart` | `ESP.restart()` | 🟢 **Matched** |
| **47** | HTTP | Central Server / UI | Node | `POST /api/system/factory-reset`| Wipe LittleFS flash configurations and reboot | Device recovery | `StorageManager::factoryReset()` | 🟢 **Matched** |
| **48** | HTTP | Central Server | Node | `POST /api/ota/upload` | Multipart firmware `.bin` stream for OTA flash | `POST /api/v1/ota/flash` | `OtaManager::handleUpload()` | 🟢 **Matched** |
| **49** | HTTP | Central Server / UI | Node | `GET /api/firmware/download` | Stream running firmware binary from flash | Backup / Golden Master | `WebServerManager::handleFirmwareDownload()` | 🟢 **Matched** |
| **50** | HTTP | Central Server / UI | Node | `GET /api/backup/download` | Export all JSON configurations as archive | Configuration backup | `WebServerManager::handleBackupDownload()` | 🟢 **Matched** |
| **51** | HTTP | Central Server / UI | Node | `POST /api/backup/restore` | Restore JSON configurations to LittleFS | Configuration rollback | `WebServerManager::handleBackupRestore()` | 🟢 **Matched** |
| **52** | HTTP | Central Server | Node | `GET /api/fs/list` | List directory contents & file sizes | `GET /api/v1/nodes/:id/fs` | `LittleFS::openDir()` | 🟢 **Matched** |
| **53** | HTTP | Central Server | Node | `GET /api/fs/download` | Download raw file from LittleFS flash | `GET /api/v1/nodes/:id/fs/download` | Direct File Stream | 🟢 **Matched** |
| **54** | HTTP | Central Server | Node | `POST /api/fs/upload` | Multipart file upload to LittleFS flash | `POST /api/v1/nodes/:id/fs/upload` | Direct File Upload Stream | 🟢 **Matched** |
| **55** | HTTP | Central Server | Node | `POST /api/fs/delete` | Remove file from LittleFS flash | `POST /api/v1/nodes/:id/fs/delete` | `LittleFS.remove()` | 🟢 **Matched** |
| **56** | HTTP | Central Server | Node | `POST /api/fs/rename` | Rename file on LittleFS flash | `POST /api/v1/nodes/:id/fs/rename` | `LittleFS.rename()` | 🟢 **Matched** |
| **57** | TCP | Node | Central Server | `TCP:2000` Telemetry Heartbeat | Periodic health, RSSI, heap, channels, sensors | `nodeManager.processTelemetry()` | `ReceiverClient::fillTelemetryDoc()` | 🟢 **Matched** |
| **58** | TCP | Node | Central Server | `TCP:2000` State Change Event | Immediate push on physical toggle / relay switch | `nodeManager.processTelemetry()` | `ReceiverClient::onGpioStateChanged()`| 🟢 **Matched** |
| **59** | TCP | Node | Central Server | `TCP:2000` Sensor / IR Interrupt Push | Immediate push on sensor trigger (IR decode, ADC alert) | `nodeManager.processTelemetry()` | `IrManager -> ReceiverClient` | 🔴 **Missing Wire Hook** |
| **60** | TCP | Central Server | Node | `TCP:2000` Command Dispatch | Inbound remote command execution stream | `nodeManager.dispatchCommand()` | `ReceiverClient::processServerCommands()`| 🟢 **Matched** |
| **61** | TCP | Central Server | Node | `TCP:2000` `send_ir` Command | Trigger 38kHz IR transmission over TCP | `nodeManager.dispatchCommand()` | `ReceiverClient::processServerCommands()`| 🔴 **Missing Action** |
| **62** | HTTP | Node | Central Server | `POST /api/v1/sensors/telemetry` | Fallback HTTP sensor ingestion if TCP blocked | `POST /api/v1/sensors/telemetry` | `ReceiverClient::sendHttp()` | 🟢 **Matched** |
| **63** | WS | Central Server | UI Clients | `GET /api/v1/ws` | Real-time WebSocket event stream | WebSocket Server (`wss`) | Frontend Browser App | 🟢 **Matched** |
| **64** | TCP/HTTP| Central Server | Breaker Bridge | Port `8085` Tuya Bridge API | Dedicated Smart Breaker LAN Control (`NODE-30487DE85D5C`) | `tuyaBridge.js` | Dedicated Go/Node Tuya Bridge | 🟢 **Matched (Isolated)**|

---

## 3. Protocol Deep Dive & Payload Schemas

### 3.1 Security & Authentication Schemas

The node supports Dual-Authentication:

1. **Option 1: Human Admin Login**  
   `POST /api/auth/login`
   ```json
   {
     "username": "admin",
     "password": "human_admin_password"
   }
   ```
   *Response (`200 OK`):*
   ```json
   {
     "success": true,
     "token": "6e8baa75d0de753643d6b850d0e4623e",
     "message": "Login successful"
   }
   ```
   *Header returned:* `Set-Cookie: session=6e8baa75d0de753643d6b850d0e4623e; Path=/; HttpOnly`

2. **Option 2: Server Pairing Key (Permanent API Key)**  
   *Central Server provisions key once:* `POST /api/auth/pair`
   ```json
   {
     "serverKey": "abcdefgh12345678"
   }
   ```
   *Subsequent requests from Central Server require zero login calls:*
   ```http
   X-Server-Key: abcdefgh12345678
   ```
   *(or `Authorization: Bearer abcdefgh12345678`)*

---

### 3.2 Relay & Sensor Management Schemas

#### Channel List & Status (`GET /api/gpio`)
```json
[
  {
    "id": 1,
    "pin": 5,
    "name": "Living Room Light",
    "room": "Living Room",
    "function": "Relay",
    "activeLow": true,
    "initialMode": 0,
    "enabled": true,
    "state": false,
    "direction": "OUTPUT",
    "type": "RELAY",
    "label": "D1 (GPIO5)",
    "bootSensitive": false,
    "isSensor": false
  },
  {
    "id": 100,
    "pin": 100,
    "name": "Chandelier Relay",
    "room": "Living Room",
    "function": "Relay",
    "activeLow": true,
    "initialMode": 0,
    "enabled": true,
    "state": true,
    "direction": "OUTPUT",
    "type": "PCF8574_RELAY",
    "label": "P0 (PCF8574 Relay 1)",
    "bootSensitive": false,
    "isSensor": false
  },
  {
    "id": 3,
    "pin": 17,
    "name": "Mains AC Voltage",
    "room": "Main Panel",
    "function": "Voltage",
    "activeLow": false,
    "initialMode": 0,
    "enabled": true,
    "state": false,
    "direction": "INPUT",
    "type": "VOLTAGE_ADC",
    "unit": "V",
    "value": 234.5,
    "rawAdc": 728,
    "label": "A0 (ADC0)",
    "bootSensitive": false,
    "isSensor": true
  }
]
```

#### Dedicated Sensor Feed (`GET /api/sensors`)
Filters out actuators, returning pure telemetry inputs:
```json
[
  {
    "id": 3,
    "pin": 17,
    "name": "Mains AC Voltage",
    "room": "Main Panel",
    "function": "Voltage",
    "direction": "INPUT",
    "type": "VOLTAGE_ADC",
    "unit": "V",
    "value": 234.5,
    "rawAdc": 728,
    "label": "A0 (ADC0)"
  }
]
```

#### Unified Command Execution (`POST /api/commands/execute`)
Dispatched by Central Server:
```json
{
  "commandId": "cmd-550e8400-e29b-41d4-a716-446655440000",
  "action": "setState",
  "id": 1,
  "state": true
}
```
*Actions Supported:*
* `setState`: `{ "id": 1, "state": true|false }`
* `toggle`: `{ "id": 1 }`
* `pulse`: `{ "id": 1, "duration": 500 }`
* `reboot`: `{}`
* `syncConfig`: `{ "config": { "channels": [ ... ] } }`
* `send_ir`: `{ "protocol": "NEC", "code": "0x20DF10EF", "bits": 32, "repeat": 0 }` *(Needs implementation in command switch)*

---

### 3.3 Asynchronous TCP Telemetry Socket Protocol (Port 2000)

Line-delimited JSON (`NDJSON` terminating with `\n`):

#### Outbound Periodic Heartbeat (Node ➔ Server):
```json
{
  "nodeId": "NODE-8C4F00565D72",
  "nodeName": "SmartHome-Node",
  "eventType": "heartbeat",
  "uptimeSec": 3600,
  "freeHeap": 24384,
  "rssi": -42,
  "ip": "192.168.1.28",
  "gateway": "192.168.1.1",
  "mac": "8C:4F:00:56:5D:72",
  "firmwareVersion": "1.6.0",
  "hardware": "ESP8266 (ESP-12E/F) NodeMCU",
  "pcf8574Detected": true,
  "pcf8574Address": "0x27",
  "pcf8574Output": 254,
  "channels": [
    {
      "id": 1,
      "pin": 5,
      "name": "Living Room Light",
      "room": "Living Room",
      "state": false
    }
  ],
  "sensors": [
    {
      "id": 3,
      "pin": 17,
      "name": "Mains AC Voltage",
      "room": "Main Panel",
      "type": "VOLTAGE_ADC",
      "unit": "V",
      "value": 234.5,
      "rawAdc": 728
    }
  ],
  "acks": [
    {
      "command_uuid": "cmd-550e8400-e29b-41d4-a716-446655440000",
      "status": "ACKNOWLEDGED",
      "success": true
    }
  ]
}
```

#### Inbound Remote Command Dispatch (Server ➔ Node):
```json
{
  "status": "ok",
  "time": 1795538910,
  "commands": [
    {
      "command_uuid": "cmd-88219-abc",
      "action": "setState",
      "id": 1,
      "state": true
    },
    {
      "command_uuid": "cmd-88220-ir",
      "action": "send_ir",
      "protocol": "NEC",
      "code": "0x20DF10EF",
      "bits": 32
    }
  ]
}
```

#### Real-Time Sensor / IR Interrupt Push (Node ➔ Server):
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

### 3.4 LittleFS File Management API

* `GET /api/fs/list`: Returns JSON directory tree.
* `GET /api/fs/download?path=/config/gpio.json`: Downloads raw file content.
* `POST /api/fs/upload`: Multipart upload with `path` and `file`.
* `POST /api/fs/delete`: `{ "path": "/config/rules.json" }`.
* `POST /api/fs/rename`: `{ "oldPath": "/a.txt", "newPath": "/b.txt" }`.

---

### 3.5 Infrared (IR) Engine Endpoints

* `GET /api/ir/status`: Receiver GPIO, Transmitter GPIO, training status.
* `POST /api/ir/train/start`: `{ "timeoutSec": 25 }`.
* `POST /api/ir/train/stop`: Aborts active training.
* `GET /api/ir/train/result`: Returns `{ "captured": true, "protocol": "NEC", "hexCode": "0x20DF10EF", "bits": 32 }`.
* `POST /api/ir/transmit`: `{ "protocol": "NEC", "hexCode": "0x20DF10EF", "bits": 32, "repeat": 0 }`.
* `GET /api/ir/remotes`: Returns configured virtual remotes from LittleFS `/config/ir_codes.json`.
* `POST /api/ir/remotes/save`: `{ "remoteName": "Samsung TV", "buttonName": "Power", "protocol": "SAMSUNG", "hexCode": "0xE0E040BF", "bits": 32 }`.
* `POST /api/ir/remotes/delete`: `{ "remoteName": "Samsung TV", "buttonName": "Power" }`.
