# SmartHome Node Firmware: Master API Reference & Server Integration Guide

**Firmware Version:** 1.6.0  
**Hardware Platforms:** ESP8266 (ESP-12E/F NodeMCU / D1 Mini 4MB, ESP-01/01S 1MB) & ESP32  
**Communication Channels:**
- **HTTP REST API:** Port `80` (Direct synchronous request/response)
- **Async TCP Telemetry Socket:** Port `2000` (Outbound bi-directional telemetry & remote command execution)
- **Wireless OTA Engine:** Port `8266` (ArduinoOTA wireless firmware flashing)

---

## Table of Contents
1. [Security Architecture & Dual-Authentication](#1-security-architecture--dual-authentication)
   - [Overview & Loophole Fix](#overview--loophole-fix)
   - [Allowed Authentication Headers & Methods](#allowed-authentication-headers--methods)
   - [Initial Server Pairing Lifecycle Handshake](#initial-server-pairing-lifecycle-handshake)
2. [Hardware Pin Architecture & PCF8574 Expander](#2-hardware-pin-architecture--pcf8574-expander)
   - [Native ESP Pins vs I2C Extended Pins (P0–P7)](#native-esp-pins-vs-i2c-extended-pins-p0p7)
   - [Pin Safety Map & Boot Strapping Warnings](#pin-safety-map--boot-strapping-warnings)
3. [REST API Endpoints: Complete Send & Receive Schemas](#3-rest-api-endpoints-complete-send--receive-schemas)
   - [1. Authentication & Security](#1-authentication--security)
   - [2. System Overview & Live Telemetry](#2-system-overview--live-telemetry)
   - [3. GPIO, Relay & Sensor Management](#3-gpio-relay--sensor-management)
     - [A. List All Channels & Sensors (/api/gpio)](#a-list-all-channels--sensors-apigpio)
     - [B. Query Dedicated Sensor Feeds (/api/sensors)](#b-query-dedicated-sensor-feeds-apisensors)
     - [C. Set Relay State / Toggle / Pulse (/api/gpio/state)](#c-set-relay-state--toggle--pulse-apigpiostate)
     - [D. Add New Channel (Relay or Sensor) (/api/gpio)](#d-add-new-channel-relay-or-sensor-apigpio)
     - [E. Update Channel Configuration (/api/gpio/update)](#e-update-channel-configuration-apigpioupdate)
     - [F. Delete Channel (/api/gpio/delete)](#f-delete-channel-apigpiodelete)
   - [4. I2C Bus & PCF8574 Expander](#4-i2c-bus--pcf8574-expander)
   - [5. Remote Command Execution](#5-remote-command-execution)
   - [6. Wi-Fi Network Management](#6-wi-fi-network-management)
   - [7. Central Receiver Telemetry Client](#7-central-receiver-telemetry-client)
   - [8. Automation Engine (Edge Rules)](#8-automation-engine-edge-rules)
   - [9. Configuration Backup, Restore & Firmware Streaming](#9-configuration-backup-restore--firmware-streaming)
   - [10. LittleFS Filesystem Explorer](#10-littlefs-filesystem-explorer)
   - [11. Device Settings & Maintenance](#11-device-settings--maintenance)
4. [Async TCP Telemetry Socket Protocol (Port 2000)](#4-async-tcp-telemetry-socket-protocol-port-2000)
   - [Dual Outbound Arrays: Channels & Sensors](#dual-outbound-arrays-channels--sensors)
   - [Outbound Telemetry Payload (Node -> Server)](#outbound-telemetry-payload-node---server)
   - [Server Inbound Response & Remote Command Dispatch (Server -> Node)](#server-inbound-response--remote-command-dispatch-server---node)
5. [Server Integration Implementation Examples](#5-server-integration-implementation-examples)
   - [Python Server Client (Actuators vs Sensors Auto-Handling)](#python-server-client)
   - [Node.js / Express Client](#nodejs--express-client)
   - [cURL Command Reference](#curl-command-reference)
6. [Infrared (IR) Remote Learning & Transmission Architecture Plan](#6-infrared-ir-remote-learning--transmission-architecture-plan)
   - [RAM & ROM Resource Impact Analysis](#ram--rom-resource-impact-analysis)
   - [LittleFS Code Storage Schema (/config/ir_codes.json)](#littlefs-code-storage-schema-configir_codesjson)
   - [Interactive Training / Learning Mode Handshake](#interactive-training--learning-mode-handshake)
   - [Server Event Notification & Real-Time Key Updates](#server-event-notification--real-time-key-updates)

---

## 1. Security Architecture & Dual-Authentication

### Overview & Loophole Fix
To prevent unauthorized users from hijacking nodes while maintaining zero-breakage server automation, the node implements a **Dual-Authentication** model:

```
                   ┌──────────────────────────────────────────────┐
                   │               HTTP REST Request              │
                   └──────────────────────┬───────────────────────┘
                                          │
                    Username MUST match: "admin"
                                          │
                   ┌──────────────────────┴───────────────────────┐
                   │                                              │
          Option A: Human Admin                         Option B: Server Pairing Key
     Password: "tusarranjan"                       Password: "abcdefgh12345678"
     Matches SHA256(_adminPasswordHash)            Matches SHA256(_serverKeyHash)
                   │                                              │
                   └──────────────────────┬───────────────────────┘
                                          ▼
                              [ ACCESS GRANTED (200 OK) ]
                              Issues Session Token / Executes Request
```

* **Human Admin Password:** Used by the owner for web browser access (default: `admin`).
* **Server Pairing Key:** Generated by your central server and provisioned during pairing.
* **Resilience:** Changing the admin password never breaks server automation; unpairing a node revokes server access instantly without wiping the owner's password.

### Allowed Authentication Headers & Methods
For any protected endpoint, your server can authenticate using **any** of the following:

1. **Direct Server Header (Recommended for automated backends):**
   ```http
   X-Server-Key: abcdefgh12345678
   ```
   *(Alternative aliases: `X-Pairing-Key: abcdefgh12345678` or `Authorization: Bearer abcdefgh12345678`)*
2. **Session Cookie:**
   ```http
   Cookie: session=6e8baa75d0de753643d6b850d0e4623e
   ```
3. **HTTP Basic Auth:**
   ```http
   Authorization: Basic YWRtaW46dHVzYXJyYW5qYW4=
   ```

### Initial Server Pairing Lifecycle Handshake

```
Central Server                                                  ESP8266 Node
      │                                                              │
      │  1. POST /api/auth/pair                                      │
      │     Body: {"serverKey":"abcdefgh12345678"}                   │
      ├─────────────────────────────────────────────────────────────►│
      │                                                              │ (Computes SHA256 & persists
      │                                                              │  hash to LittleFS)
      │  2. 200 OK: {"success":true,"paired":true}                   │
      │◄─────────────────────────────────────────────────────────────┤
      │                                                              │
      │  3. All Subsequent REST Calls                                │
      │     Header: X-Server-Key: abcdefgh12345678                   │
      ├─────────────────────────────────────────────────────────────►│ (Instantly authorized)
      │  4. 200 OK: Response Data                                    │
      │◄─────────────────────────────────────────────────────────────┤
```

---

## 2. Hardware Pin Architecture & PCF8574 Expander

### Native ESP Pins vs I2C Extended Pins (P0–P7)
* **Native NodeMCU Pins:** Physical GPIOs (0 to 16).
* **Extended I2C PCF8574 Pins (Virtual Pins 100 to 107):**
  * When I2C is active, the firmware maps virtual IDs **100 through 107** to PCF8574 expander outputs **P0 through P7**.
  * All APIs (`/api/gpio/state`, pulse timers, automation rules) treat pins 100–107 identically to native ESP pins.

### Pin Safety Map & Boot Strapping Warnings

| Pin Header | GPIO ID | Safe for Relays? | Hardware Characteristics & Boot Rules |
| :--- | :---: | :---: | :--- |
| **P0 to P7** | `100` to `107` | **YES (Recommended)** | **Safe Isolated I2C Relays:** No boot pins, no pull-ups, zero boot interference. |
| **D5** | `14` | **YES** | **Safe Native Pin:** Neutral SPI CLK pin, no pull-up, boot-neutral. |
| **D6** | `12` | **YES** | **Safe Native Pin:** Neutral SPI MISO pin, no pull-up, boot-neutral. |
| **D7** | `13` | **YES** | **Safe Native Pin:** Neutral SPI MOSI pin, no pull-up, boot-neutral. |
| **D0** | `16` | **YES** | **Safe Native Pin:** RTC GPIO; no pull-up resistor. |
| **D1** | `5` | **RESERVED** | **I2C SCL Clock Bus.** Reserved when I2C is enabled. |
| **D2** | `4` | **RESERVED** | **I2C SDA Data Bus.** Reserved when I2C is enabled. |
| **D3** | `0` | ⚠️ **Avoid for Relays** | **FLASH Button & Boot Strapping Pin:** Hardwired to 10k pull-up and button. Must be HIGH at boot. Optocoupler circuits cause relay lockup. |
| **D4** | `2` | ⚠️ **Avoid for Relays** | **Onboard Blue LED:** Hardwired to 10k pull-up. Must be HIGH at boot. |
| **D8** | `15` | ❌ **Do NOT use for Relays** | **Boot Strapping Pin:** Must be held LOW at boot. Relay loads pull it HIGH and cause boot failure. |
| **A0** | `17` | **NO (Sensor Only)** | **Dedicated Analog Input (ADC0):** 0–3.3V range (onboard NodeMCU resistor divider; internal core range 0–1.0V). Not a digital relay output. Ideal for Voltage sensors, battery monitors, LDR, and thermistors. Firmware automatically classifies pin 17 as `direction: "INPUT"`, `type: "VOLTAGE_ADC"`, `unit: "V"` and guards against `pinMode(OUTPUT)`. |

---

## 3. REST API Endpoints: Complete Send & Receive Schemas

### 1. Authentication & Security

#### A. Login (Create Session)
* **Endpoint:** `POST /api/auth/login`
* **Auth Required:** No
* **Request ("Send"):**
  ```json
  {
    "username": "admin",
    "password": "tusarranjan"
  }
  ```
  *(Note: `password` accepts either the human admin password OR the paired `serverKey`)*
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "token": "6e8baa75d0de753643d6b850d0e4623e",
    "message": "Login successful"
  }
  ```
  *Headers Returned:* `Set-Cookie: session=6e8baa75d0de753643d6b850d0e4623e; Path=/; HttpOnly`
* **Response ("Receive") - 401 Unauthorized:**
  ```json
  {
    "success": false,
    "error": "Invalid username or password"
  }
  ```

---

#### B. Check Authentication Status
* **Endpoint:** `GET /api/auth/check`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "authenticated": true,
    "username": "admin",
    "paired": true
  }
  ```

---

#### C. Check / Pair Node with Central Server
* **Query Pairing Status (`GET /api/auth/pair`):**
  ```json
  {
    "paired": true,
    "adminUser": "admin"
  }
  ```
* **Set Pairing Key (`POST /api/auth/pair`):**
* **Auth Required:** No (if node is currently unpaired and `adminPassword` is supplied) / Yes (if already paired)
* **Request ("Send"):**
  ```json
  {
    "serverKey": "abcdefgh12345678",
    "adminPassword": "admin"
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Device successfully paired to Central Server"
  }
  ```

---

#### D. Unpair Node from Central Server
* **Endpoint:** `POST /api/auth/unpair`
* **Auth Required:** Yes (`X-Server-Key` or session cookie)
* **Request ("Send"):** `{}`
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Device unpaired successfully"
  }
  ```

---

#### E. Change Administrator Password
* **Endpoint:** `POST /api/settings/password` (or `POST /api/auth/password`)
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "currentPassword": "admin",
    "newPassword": "tusarranjan"
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Password changed successfully"
  }
  ```

---

### 2. System Overview & Live Telemetry

#### A. Comprehensive System Diagnostics
* **Endpoint:** `GET /api/status`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "deviceName": "SmartHome-NodeMCU",
    "firmwareVersion": "1.6.0",
    "hardware": "ESP8266 (ESP-12E/F) NodeMCU",
    "coreVersion": "3.1.2",
    "sdkVersion": "2.2.2-dev(38a443e)",
    "uptimeSec": 1240,
    "bootCount": 7,
    "cpuFreq": 80,
    "mac": "8C:4F:00:56:5D:72",
    "nodeId": "NODE-8C4F00565D72",
    "chipId": "565d72",
    "formattedTime": "2026-11-25 00:30:15 (IST)",
    "resetReason": "External System",
    "resetDetails": "Hardware Reset (External Reset Pin / Flash button pressed)",
    "freeHeap": 18456,
    "minFreeHeap": 16184,
    "maxFreeBlock": 12456,
    "heapFragPercent": 25,
    "flashSize": 4194304,
    "flashConfigSize": 4194304,
    "flashSpeed": 40000000,
    "flashMode": "DIO (Dual I/O)",
    "flashChipId": "16405e",
    "sketchSize": 501264,
    "freeSketchSpace": 1593344,
    "fsTotal": 2072576,
    "fsUsed": 204800,
    "fsFree": 1867776,
    "fsPercent": 9,
    "wifiMode": 2,
    "apActive": true,
    "apSsid": "SmartHome-Setup-5D72",
    "apIp": "192.168.4.1",
    "staConnected": true,
    "staSsid": "Highspeed Net 0",
    "staIp": "192.168.1.28",
    "staGateway": "192.168.1.1",
    "staSubnet": "255.255.255.0",
    "rssi": -34,
    "paired": true,
    "i2cEnabled": true,
    "pcfDetected": true,
    "ntpSynced": true,
    "tzOffset": 19800
  }
  ```

---

#### B. REST API Endpoint Catalog (`/api/all`)
Self-discovery endpoint returning the full catalog of supported REST API routes, HTTP methods, authentication requirements, and sample request bodies stored in `PROGMEM`.
* **Endpoint:** `GET /api/all`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "title": "SmartHome ESP8266 REST API Catalog",
    "version": "1.6.0",
    "endpoints": [
      {
        "method": "GET",
        "path": "/api/gpio",
        "auth": false,
        "description": "List all relays, sensors, IR pins, and states"
      },
      {
        "method": "POST",
        "path": "/api/ir/transmit",
        "auth": true,
        "description": "Blast saved remote button or direct protocol/hexCode",
        "body": { "remoteName": "...", "buttonName": "..." }
      }
    ]
  }
  ```

---

#### C. System Event Logs Ring Buffer
* **Endpoint:** `GET /api/logs`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "count": 3,
    "logs": [
      { "uptimeMs": 105, "msg": "[STORAGE] LittleFS mounted successfully." },
      { "uptimeMs": 240, "msg": "[PCF8574] Expander detected at I2C address 0x20" },
      { "uptimeMs": 3120, "msg": "[WIFI] Connected to Highspeed Net 0 (IP: 192.168.1.28)" }
    ]
  }
  ```

---

### 3. GPIO, Relay & Sensor Management

The firmware provides complete self-describing hardware abstraction. Each channel payload explicitly declares whether it is an **Actuator/Output** or a **Sensor/Input**, its hardware type, physical unit, supported capabilities, and live sampled value.

#### How the Central Server Distinguishes Relays from Sensors:
Each item in `/api/gpio` and `/api/sensors` contains:
1. `direction`: `"OUTPUT"` (Relays, Transmitters) vs `"INPUT"` (Sensors, Demodulators).
2. `isSensor`: Boolean flag (`false` for relays, `true` for sensors) enabling instant UI filtering.
3. `type`: Explicit machine taxonomy:
   - `"RELAY"`: Generic relay actuator.
   - `"LIGHT"`: Lighting circuit actuator.
   - `"FAN"`: Fan/motor actuator.
   - `"IR_TRANSMITTER"`: IR blaster emitter.
   - `"VOLTAGE_ADC"`: Real-time analog voltage sensor (ADC0 / Pin 17).
   - `"PIR_MOTION"`: Digital passive infrared motion sensor.
   - `"DOOR_SENSOR"`: Magnetic reed switch contact sensor.
   - `"IR_RECEIVER"`: 38 kHz infrared demodulator receiver.
4. `unit`: Physical unit of measurement (`"BOOL"`, `"V"`, `"STATE"`, `"HEX"`).
5. `capabilities`: Array of sanctioned commands:
   - Actuators: `["write", "toggle", "pulse"]`
   - Telemetry Sensors: `["read", "telemetry"]`
   - Event Stream Sensors: `["read", "event_stream"]`

---

#### A. List All Channels & Sensors
* **Endpoint:** `GET /api/gpio`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  [
    {
      "id": 1,
      "pin": 100,
      "enabled": true,
      "state": true,
      "label": "P0 (PCF8574 Relay 1)",
      "note": "I2C Expander Pin P0 (Safe isolated relay output)",
      "bootSensitive": false,
      "name": "Living Room Light",
      "room": "Living Room",
      "function": "Light",
      "activeLow": true,
      "initialMode": 0,
      "direction": "OUTPUT",
      "type": "LIGHT",
      "isSensor": false,
      "unit": "BOOL",
      "capabilities": [
        "write",
        "toggle",
        "pulse"
      ],
      "value": 1
    },
    {
      "id": 9,
      "pin": 14,
      "enabled": true,
      "state": false,
      "label": "D5 (GPIO14)",
      "note": "Safe SPI CLK, boot-neutral",
      "bootSensitive": false,
      "name": "PIR Motion Hallway",
      "room": "Hallway",
      "function": "Motion",
      "activeLow": false,
      "initialMode": 0,
      "direction": "INPUT",
      "type": "PIR_MOTION",
      "isSensor": true,
      "unit": "STATE",
      "capabilities": [
        "read",
        "event_stream"
      ],
      "value": 0
    },
    {
      "id": 10,
      "pin": 17,
      "enabled": true,
      "state": false,
      "label": "A0 (ADC0)",
      "note": "Dedicated Analog Voltage Input (0-3.3V / 0-1023)",
      "bootSensitive": false,
      "name": "AC Voltage Sensor",
      "room": "Main DB",
      "function": "Voltage",
      "activeLow": false,
      "initialMode": 0,
      "direction": "INPUT",
      "type": "VOLTAGE_ADC",
      "isSensor": true,
      "unit": "V",
      "capabilities": [
        "read",
        "telemetry"
      ],
      "value": 2.45,
      "rawAdc": 760
    }
  ]
  ```

---

#### B. Query Dedicated Sensor Feeds
For telemetry monitoring loops and sensor graphs, this endpoint returns exclusively sensor channels, automatically filtering out relay actuators. For analog pins (A0 / Pin 17), `value` and `rawAdc` are sampled live upon request.
* **Endpoint:** `GET /api/sensors`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "sensors": [
      {
        "id": 10,
        "pin": 17,
        "enabled": true,
        "state": false,
        "label": "A0 (ADC0)",
        "note": "Dedicated Analog Voltage Input (0-3.3V / 0-1023)",
        "bootSensitive": false,
        "name": "AC Voltage Sensor",
        "room": "Main DB",
        "function": "Voltage",
        "activeLow": false,
        "initialMode": 0,
        "direction": "INPUT",
        "type": "VOLTAGE_ADC",
        "isSensor": true,
        "unit": "V",
        "capabilities": [
          "read",
          "telemetry"
        ],
        "value": 2.45,
        "dcVoltage": 2.45,
        "acRms": 0.012,
        "rawAdc": 760
      }
    ]
  }
  ```

---

#### C. Set Relay State / Toggle / Pulse
* **Endpoint:** `POST /api/gpio/state`
* **Auth Required:** Yes
* **Request ("Send") - Mode 1: Explicit ON / OFF:**
  ```json
  {
    "id": 1,
    "state": true,
    "action": "setState"
  }
  ```
* **Request ("Send") - Mode 2: Toggle State:**
  ```json
  {
    "id": 1,
    "action": "toggle"
  }
  ```
* **Request ("Send") - Mode 3: Timed Pulse (Inch Mode):**
  ```json
  {
    "id": 1,
    "action": "pulse",
    "duration": 750
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "State updated"
  }
  ```

---

#### D. Add New Channel (Relay or Sensor)
* **Endpoint:** `POST /api/gpio`
* **Auth Required:** Yes
* **Request ("Send") - Example 1: Add Relay Channel:**
  ```json
  {
    "pin": 101,
    "name": "Dining Light",
    "room": "Dining Room",
    "function": "Light",
    "activeLow": true,
    "initialMode": 0
  }
  ```
* **Request ("Send") - Example 2: Add Voltage Sensor (Pin 17 / A0):**
  ```json
  {
    "pin": 17,
    "name": "Mains Voltage",
    "room": "Power Station",
    "function": "Voltage",
    "activeLow": false,
    "initialMode": 0
  }
  ```
* **Request ("Send") - Example 3: Add PIR Motion Sensor (Pin 14 / D5):**
  ```json
  {
    "pin": 14,
    "name": "Hallway PIR",
    "room": "Hallway",
    "function": "Motion",
    "activeLow": false,
    "initialMode": 0
  }
  ```
  *Field Notes:*
  - `pin`: `0..16` for native ESP pins, `17` for `A0` analog ADC, `100..107` for PCF8574 expander.
  - `function`: Assign `"Light"`, `"Fan"`, `"Relay"`, `"Pump"`, or `"Switch"` for relay actuators. Assign `"Voltage"`, `"PIR Motion"`, `"Door Sensor"`, `"IR Receiver"`, or `"IR Transmitter"` for sensors and IR hardware (case-insensitive substring matching also supports `"Sensor"`, `"Motion"`, `"PIR"`, `"Door"`, `"Window"`).
  - `initialMode`: `0` = Restore Last State, `1` = Always Boot OFF, `2` = Always Boot ON.
  - `activeLow`: `true` for standard active-low relay modules; `false` for active-high sensors / IR transmitters.
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "GPIO channel added"
  }
  ```

---

#### E. Update Channel Configuration
* **Endpoint:** `POST /api/gpio/update`
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "id": 2,
    "name": "Main Chandelier",
    "room": "Living Room",
    "function": "Light",
    "activeLow": true,
    "initialMode": 0,
    "enabled": true
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "GPIO channel updated"
  }
  ```

---

#### F. Delete Channel
* **Endpoint:** `POST /api/gpio/delete`
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "id": 9
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "GPIO channel removed"
  }
  ```

---

### 4. I2C Bus & PCF8574 Expander

#### A. Query I2C Bus Configuration & Status
* **Endpoint:** `GET /api/i2c`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "enabled": true,
    "sdaPin": 4,
    "sclPin": 5,
    "address": 32,
    "addressHex": "0x20",
    "detected": true,
    "detectedAddress": 32,
    "outputByte": 255
  }
  ```

---

#### B. Save I2C Configuration
* **Endpoint:** `POST /api/i2c`
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "enabled": true,
    "sdaPin": 4,
    "sclPin": 5,
    "address": 32,
    "reboot": false
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "I2C settings saved successfully"
  }
  ```

---

#### C. Auto-Populate 8 PCF8574 Channels (P0–P7)
* **Endpoint:** `POST /api/i2c/auto-channels`
* **Auth Required:** Yes
* **Request ("Send"):** `{}`
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Added 8 PCF8574 relay channels (P0-P7)"
  }
  ```

---

#### D. Live I2C Hardware Bus Scan
* **Endpoint:** `GET /api/i2c/scan?sda=4&scl=5`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "sdaPin": 4,
    "sclPin": 5,
    "count": 1,
    "devices": [
      {
        "address": 32,
        "hex": "0x20",
        "type": "PCF8574 (Standard 8-Ch Expander)"
      }
    ]
  }
  ```

---

### 5. Remote Command Execution

#### Direct Command Dispatch (`/api/commands/execute` or `/api/command`)
Used by automation servers to issue high-level commands (`setState`, `toggle`, `pulse`, `reboot`, `readInfo`, `syncConfig`, `send_ir`, `configure_pin`, `read_sensor`) and receive an instant execution confirmation.
* **Endpoint:** `POST /api/commands/execute`
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "commandId": "cmd-8821039",
    "action": "setState",
    "id": 1,
    "state": true
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "commandId": "cmd-8821039",
    "nodeId": "NODE-8C4F00565D72",
    "success": true,
    "action": "setState",
    "status": "EXECUTED",
    "channelId": 1,
    "state": true
  }
  ```

---

### 6. Wi-Fi Network Management

#### A. Wi-Fi Status
* **Endpoint:** `GET /api/wifi/status`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "mode": 2,
    "apActive": true,
    "apSsid": "SmartHome-Setup-5D72",
    "apIp": "192.168.4.1",
    "staConnected": true,
    "staSsid": "Highspeed Net 0",
    "staIp": "192.168.1.28",
    "staGateway": "192.168.1.1",
    "rssi": -33
  }
  ```

---

#### B. Scan Nearby Wi-Fi Networks
* **Endpoint:** `GET /api/wifi/scan`
* **Auth Required:** Yes
* **Response ("Receive") - 200 OK:**
  ```json
  [
    { "ssid": "Highspeed Net 0", "rssi": -33, "encryption": "WPA2", "channel": 6 },
    { "ssid": "Neighbor_WiFi", "rssi": -78, "encryption": "WPA2", "channel": 1 }
  ]
  ```

---

#### C. Connect to Wi-Fi Network
* **Endpoint:** `POST /api/wifi/connect`
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "ssid": "Highspeed Net 0",
    "password": "tusarranjan"
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Connecting to Highspeed Net 0..."
  }
  ```

---

#### D. Configure Static IP vs DHCP
* **Endpoint:** `POST /api/wifi/ip`
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "useStaticIp": true,
    "staticIp": "192.168.1.150",
    "staticGateway": "192.168.1.1",
    "staticSubnet": "255.255.255.0",
    "staticDns1": "8.8.8.8",
    "staticDns2": "1.1.1.1"
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "IP configuration updated"
  }
  ```

---

#### E. Set Wi-Fi Operational Mode
* **Endpoint:** `POST /api/wifi/mode`
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "mode": 1
  }
  ```
  *(Mode: `0` = AP Only, `1` = Station / Router Only, `2` = Dual AP + Station)*
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Wi-Fi mode updated"
  }
  ```

---

#### F. Reset Wi-Fi Credentials
* **Endpoint:** `POST /api/wifi/reset`
* **Auth Required:** Yes
* **Request ("Send"):** `{}`
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Wi-Fi credentials erased. Node restarting in AP mode..."
  }
  ```

---

### 7. Central Receiver Telemetry Client

#### A. Query Central Telemetry Configuration
* **Endpoint:** `GET /api/receiver`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "enabled": true,
    "serverHost": "192.168.1.100",
    "serverPort": 2000,
    "intervalSec": 30,
    "sendOnStateChange": true,
    "authToken": "abcdefgh12345678",
    "nodeId": "NODE-8C4F00565D72",
    "nodeName": "SmartHome-NodeMCU"
  }
  ```

---

#### B. Save Central Telemetry Configuration
* **Endpoint:** `POST /api/receiver`
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "enabled": true,
    "serverHost": "192.168.1.100",
    "serverPort": 2000,
    "intervalSec": 30,
    "sendOnStateChange": true,
    "authToken": "abcdefgh12345678",
    "nodeName": "Living Room Hub"
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Receiver settings saved"
  }
  ```

---

#### C. Trigger Immediate Telemetry Push
* **Endpoint:** `POST /api/receiver/push`
* **Auth Required:** Yes
* **Request ("Send"):** `{}`
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Telemetry packet dispatched to Central Server"
  }
  ```

---

#### D. Test Receiver Connection
* **Endpoint:** `POST /api/receiver/test`
* **Auth Required:** Yes
* **Request ("Send"):** `{}`
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "code": 200,
    "message": "Connection verified successfully"
  }
  ```

---

### 8. Automation Engine (Edge Rules)

The node executes independent edge rules locally without requiring constant server connectivity.

#### A. List Automation Rules
* **Endpoint:** `GET /api/automation`
* **Auth Required:** No
* **Response ("Receive") - 200 OK:**
  ```json
  [
    {
      "id": 1,
      "name": "Auto-Off Bathroom Fan",
      "enabled": true,
      "type": 0,
      "sourceGpioId": 1,
      "targetGpioId": 2,
      "condState": true,
      "targetState": false,
      "param1": 300
    }
  ]
  ```

---

#### B. Add Automation Rule
* **Endpoint:** `POST /api/automation`
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "name": "Auto Off Hallway Light",
    "type": 0,
    "sourceGpioId": 1,
    "targetGpioId": 1,
    "condState": true,
    "targetState": false,
    "param1": 180
  }
  ```
  *Rule Types:* `0` = Timer/Delay (seconds), `1` = Interlock/Mirror, `2` = Schedule (Epoch/RTC).
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Automation rule created"
  }
  ```

---

#### C. Toggle / Delete Automation Rule
* **Toggle:** `POST /api/automation/toggle` | Body: `{"id": 1}`
* **Delete:** `POST /api/automation/delete` | Body: `{"id": 1}`

---

### 9. Configuration Backup, Restore & Firmware Streaming

#### A. Download Complete JSON Settings Backup
* **Endpoint:** `GET /api/backup/download`
* **Auth Required:** Yes
* **Response ("Receive") - 200 OK:** Returns a downloadable file attachment containing all system, Wi-Fi, GPIO, I2C, and automation settings.

---

#### B. Restore JSON Settings Backup
* **Endpoint:** `POST /api/backup/restore`
* **Auth Required:** Yes
* **Request ("Send"):** Upload the full JSON document downloaded from `/api/backup/download`.
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Configuration restored successfully. Device restarting..."
  }
  ```

---

#### C. Stream Running Firmware Binary to Browser
* **Endpoint:** `GET /api/firmware/download`
* **Auth Required:** Yes
* **Response ("Receive") - 200 OK:** Reads the microcontroller's SPI flash chip byte-by-byte and streams a bit-for-bit `.bin` backup file (`firmware_backup_8C4F00565D72_v1.6.0.bin`).

---

### 10. LittleFS Filesystem Explorer

* **List Directory:** `GET /api/fs/list?dir=/config`
* **Download File:** `GET /api/fs/download?path=/config/wifi.json`
* **Upload File:** `POST /api/fs/upload` (Multipart form-data)
* **Delete File:** `POST /api/fs/delete` | Body: `{"path": "/config/sample.json"}`
* **Rename File:** `POST /api/fs/rename` | Body: `{"oldPath": "/old.json", "newPath": "/new.json"}`

---

### 11. Device Settings & Maintenance

#### A. Soft Reboot
* **Endpoint:** `POST /api/system/reboot`
* **Auth Required:** Yes
* **Request ("Send"):** `{}`
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Device restarting..."
  }
  ```

---

#### B. Factory Reset (Wipe Flash Configurations)
* **Endpoint:** `POST /api/system/factory-reset`
* **Auth Required:** Yes
* **Request ("Send"):** `{}`
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Factory reset complete. Device rebooting..."
  }
  ```

---

#### C. Force NTP Clock Sync
* **Endpoint:** `POST /api/settings/ntp-sync`
* **Auth Required:** Yes
* **Request ("Send"):** `{}`
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "NTP time synchronized successfully"
  }
  ```

---

## 4. Async TCP Telemetry Socket Protocol (Port 2000)

When `ReceiverClient` is enabled, the node connects directly to your central server's TCP socket on port `2000` (configurable).

### Outbound Telemetry Payload (Node -> Server)
The node dispatches a single-line newline-delimited (`\n`) JSON string:
* On boot (`eventType: "boot"`)
* Periodically (`eventType: "periodic"`, e.g. every 30s)
* Immediately upon any relay state change (`eventType: "state_change"`)

```json
{
  "nodeId": "NODE-8C4F00565D72",
  "nodeName": "SmartHome-NodeMCU",
  "eventType": "state_change",
  "timestamp": "2026-11-25 00:35:10 (IST)",
  "epoch": 1795547110,
  "ip": "192.168.1.28",
  "gateway": "192.168.1.1",
  "mac": "8C:4F:00:56:5D:72",
  "rssi": -34,
  "uptimeSec": 1540,
  "freeHeap": 18456,
  "firmwareVersion": "1.6.0",
  "token": "abcdefgh12345678",
  "channels": [
    {
      "id": 1,
      "pin": 100,
      "enabled": true,
      "state": true,
      "name": "Living Room Light",
      "room": "Living Room",
      "function": "Light",
      "activeLow": true
    },
    {
      "id": 2,
      "pin": 101,
      "enabled": true,
      "state": false,
      "name": "Dining Light",
      "room": "Dining Room",
      "function": "Light",
      "activeLow": true
    }
  ],
  "acks": [
    {
      "command_uuid": "cmd-8821",
      "success": true,
      "status": "ACKNOWLEDGED"
    }
  ]
}
```

---

### Server Inbound Response & Remote Command Dispatch (Server -> Node)
When your central server receives the telemetry line, it can reply with a standard status acknowledgment **and optionally attach commands to execute on the node**:

```json
{
  "status": "OK",
  "commands": [
    {
      "command_uuid": "cmd-99342",
      "action": "setState",
      "id": 1,
      "state": false
    },
    {
      "command_uuid": "cmd-99343",
      "action": "pulse",
      "id": 2,
      "duration": 500
    }
  ]
}
```

*Supported Actions in TCP Response:*
* `setState`: Sets relay state (`"state": true` or `"state": false`).
* `toggle`: Flips channel state.
* `pulse`: Turns channel ON for `"duration"` milliseconds, then auto-shuts OFF.
* `reboot`: Soft reboots the microcontroller.

---

## 5. Server Integration Implementation Examples

### Python Server Client (Actuators vs Sensors Auto-Handling)

```python
import requests

NODE_IP = "192.168.1.28"
SERVER_KEY = "abcdefgh12345678"

headers = {
    "X-Server-Key": SERVER_KEY,
    "Content-Type": "application/json"
}

# 1. Fetch live system status
status = requests.get(f"http://{NODE_IP}/api/status").json()
print(f"Node: {status['deviceName']} (Heap Free: {status['freeHeap']} bytes)")

# 2. Query all channels & categorize actuators vs sensors automatically
channels = requests.get(f"http://{NODE_IP}/api/gpio").json()
actuators = [ch for ch in channels if not ch.get("isSensor", False)]
sensors = [ch for ch in channels if ch.get("isSensor", False)]

print(f"\nDiscovered {len(actuators)} Actuator(s) and {len(sensors)} Sensor(s):")

for act in actuators:
    print(f"  [ACTUATOR] ID {act['id']}: {act['name']} ({act['type']}) -> State: {'ON' if act['state'] else 'OFF'} | Caps: {act['capabilities']}")

for sen in sensors:
    print(f"  [SENSOR]   ID {sen['id']}: {sen['name']} ({sen['type']}) -> Reading: {sen.get('value')} {sen.get('unit')}")

# 3. Control an Actuator (Relay 1, Pin 100)
if actuators:
    target_id = actuators[0]["id"]
    resp = requests.post(
        f"http://{NODE_IP}/api/gpio/state",
        json={"id": target_id, "state": True, "action": "setState"},
        headers=headers
    )
    print(f"\nSet Actuator {target_id} ON:", resp.json())

# 4. Dedicated Telemetry Read: Query pure sensor telemetry
sensor_data = requests.get(f"http://{NODE_IP}/api/sensors").json()
print("\nLive Sensor Telemetry:")
for s in sensor_data.get("sensors", []):
    if s["type"] == "VOLTAGE_ADC":
        print(f"  Mains Voltage: {s['value']:.2f} V (Raw ADC: {s['rawAdc']})")
    elif s["type"] == "PIR_MOTION":
        print(f"  Motion Detected: {bool(s['value'])}")
```

---

### Node.js / Express Client

```javascript
const axios = require('axios');

const NODE_IP = '192.168.1.28';
const SERVER_KEY = 'abcdefgh12345678';

const client = axios.create({
  baseURL: `http://${NODE_IP}`,
  headers: {
    'X-Server-Key': SERVER_KEY,
    'Content-Type': 'application/json'
  },
  timeout: 4000
});

async function main() {
  // Query all channels
  const gpios = await client.get('/api/gpio');
  console.log('Channels configured:', gpios.data.length);

  // Turn Channel 1 ON
  await client.post('/api/gpio/state', {
    id: 1,
    state: true,
    action: 'setState'
  });
  console.log('Channel 1 is now ON');

  // Trigger immediate telemetry push to central socket
  await client.post('/api/receiver/push', {});
}

main().catch(console.error);
```

---

### cURL Command Reference

```bash
# Pair node with server key
curl -X POST http://192.168.1.28/api/auth/pair \
  -H "Content-Type: application/json" \
  -d '{"serverKey": "abcdefgh12345678", "adminPassword": "admin"}'

# Read system status
curl http://192.168.1.28/api/status

# Read all configured channels
curl http://192.168.1.28/api/gpio

# Turn ON Channel 1 (Pin 100 / P0)
curl -X POST http://192.168.1.28/api/gpio/state \
  -H "X-Server-Key: abcdefgh12345678" \
  -H "Content-Type: application/json" \
  -d '{"id": 1, "state": true, "action": "setState"}'

# Toggle Channel 1
curl -X POST http://192.168.1.28/api/gpio/state \
  -H "X-Server-Key: abcdefgh12345678" \
  -H "Content-Type: application/json" \
  -d '{"id": 1, "action": "toggle"}'

# Auto-populate 8 PCF8574 expander relays (P0-P7)
curl -X POST http://192.168.1.28/api/i2c/auto-channels \
  -H "X-Server-Key: abcdefgh12345678"

# Soft reboot node
curl -X POST http://192.168.1.28/api/system/reboot \
  -H "X-Server-Key: abcdefgh12345678"
```


---

## 6. Infrared (IR) Remote Learning & Transmission Architecture Plan

This section provides the implementation blueprint and resource analysis for adding Infrared Remote Control capabilities (Receive, Learn, Store in LittleFS, and Transmit) to the node.

### RAM & ROM Resource Impact Analysis

| Component | RAM Footprint (SRAM) | ROM Footprint (Flash) | Notes |
| :--- | :---: | :---: | :--- |
| **IRremoteESP8266 Core** | ~1,200 bytes | ~28 KB (protocols selectively compiled) | Only compile target protocols (`NEC`, `RC5`, `SONY`, `SAMSUNG`) to save Flash. |
| **IR Receiver Buffer (`kCaptureBufferSize`)** | 400 bytes | 0 bytes | Stores raw mark/space timings in circular ring buffer. |
| **LittleFS IR Database (`/config/ir_codes.json`)** | 0 bytes static (parsed into temporary heap on demand) | ~4 KB LittleFS file space | Easily stores 50+ remote controls with 20 buttons each. |
| **Available Node Resources** | **~18.5 KB Free Heap** | **~1,867 KB Free LittleFS** | **100% Feasible:** Less than 7% of free heap and 0.2% of free flash used. |

---

### LittleFS Code Storage Schema (`/config/ir_codes.json`)

All learned remote controls and individual button codes are persisted directly to LittleFS in JSON format (`/config/ir_codes.json`):

```json
{
  "remotes": [
    {
      "name": "Living Room Samsung TV",
      "buttons": [
        {
          "name": "Power",
          "protocol": "SAMSUNG",
          "hexCode": "0xE0E040BF",
          "bits": 32,
          "repeat": 1
        },
        {
          "name": "Vol+",
          "protocol": "SAMSUNG",
          "hexCode": "0xE0E0E01F",
          "bits": 32,
          "repeat": 0
        }
      ]
    },
    {
      "name": "Ceiling Fan",
      "buttons": [
        {
          "name": "Speed 1",
          "protocol": "NEC",
          "hexCode": "0x00FF807F",
          "bits": 32,
          "repeat": 0
        }
      ]
    }
  ]
}
```

### Interactive Training / Learning Mode Handshake

```text
Central Server / UI                                      ESP8266 Node (e.g., Pin 14 / D5 IR RX)
      │                                                              │
      │  1. POST /api/ir/train/start                                 │
      │     Body: {"timeoutSec": 25}                                 │
      ├─────────────────────────────────────────────────────────────►│ (Opens learning window)
      │  2. 200 OK: {"success": true, "message": "Listening..."}     │
      │◄─────────────────────────────────────────────────────────────┤
      │                                                              │
      │                     [ USER PRESSES REMOTE BUTTON ]           │
      │                     e.g. LG TV 'Power' -> NEC 0x20DF10EF     │
      │                                                              │
      │  3. GET /api/ir/train/result (poll every ~700ms)             │
      ├─────────────────────────────────────────────────────────────►│
      │  4. 200 OK: {"isTraining":false,"captured":true,             │
      │              "protocol":"NEC","hexCode":"0x20DF10EF",        │
      │              "bits":32,"ageMs":420}                          │
      │◄─────────────────────────────────────────────────────────────┤
      │                                                              │
      │  5. POST /api/ir/remotes/save                                │
      │     Body: {"remoteName":"LG TV","buttonName":"Power",        │
      │            "protocol":"NEC","hexCode":"0x20DF10EF",          │
      │            "bits":32,"repeat":0}                             │
      ├─────────────────────────────────────────────────────────────►│ (Persists to
      │  6. 200 OK: {"success": true, "message": "Remote button saved"} /config/ir_codes.json)
      │◄─────────────────────────────────────────────────────────────┤
```

---

### 6.3 IR Remote Control API Reference (Implemented & Live Verified)

The NodeMCU firmware incorporates a complete Infrared Subsystem using `IRremoteESP8266`. All endpoints below are active and live-tested.

#### 1. Get IR Subsystem Status
* **Endpoint:** `GET /api/ir/status`
* **Auth Required:** Optional (public read)
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "rxPin": 14,
    "txPin": 13,
    "isReceiverActive": true,
    "isTransmitterActive": true,
    "isTraining": false,
    "trainingSuccess": false
  }
  ```

#### 2. Start IR Training / Learning Mode
* **Endpoint:** `POST /api/ir/train/start`
* **Auth Required:** Yes (`Authorization: Basic ...` / Session Cookie / `X-Server-Key`)
* **Request ("Send"):**
  ```json
  {
    "timeoutSec": 25
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Listening for IR remote signal... Point remote at sensor and press button."
  }
  ```

#### 3. Stop IR Training
* **Endpoint:** `POST /api/ir/train/stop`
* **Auth Required:** Yes
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "IR training stopped"
  }
  ```

#### 4. Poll Training Result / Captured Signal
* **Endpoint:** `GET /api/ir/train/result`
* **Auth Required:** Optional
* **Response ("Receive") - Captured (200 OK):**
  ```json
  {
    "captured": true,
    "protocol": "NEC",
    "hexCode": "0x20DF10EF",
    "bits": 32,
    "ageMs": 1420
  }
  ```
* **Response ("Receive") - Nothing captured yet (200 OK):**
  ```json
  {
    "captured": false,
    "isTraining": true
  }
  ```

#### 5. Save Learned Remote Key to Database
* **Endpoint:** `POST /api/ir/remotes/save`
* **Auth Required:** Yes
* **Request ("Send"):**
  ```json
  {
    "remoteName": "LG TV",
    "buttonName": "Power",
    "protocol": "NEC",
    "hexCode": "0x20DF10EF",
    "bits": 32,
    "repeat": 0
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Remote button saved successfully"
  }
  ```

#### 6. Get All Saved Remotes & Buttons Catalog
* **Endpoint:** `GET /api/ir/remotes`
* **Auth Required:** Optional
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "remotes": [
      {
        "name": "LG TV",
        "buttons": [
          {
            "name": "Power",
            "protocol": "NEC",
            "hexCode": "0x20DF10EF",
            "bits": 32,
            "repeat": 0
          }
        ]
      }
    ]
  }
  ```

#### 7. Transmit / Blast IR Signal
* **Endpoint:** `POST /api/ir/transmit`
* **Auth Required:** Yes
* **Option A: Transmit by Saved Name:**
  ```json
  {
    "remoteName": "LG TV",
    "buttonName": "Power"
  }
  ```
* **Option B: Transmit by Direct Protocol & Hex Code:**
  ```json
  {
    "pin": 13,
    "protocol": "NEC",
    "hexCode": "0x20DF10EF",
    "bits": 32,
    "repeat": 0
  }
  ```
  *(Note: Either `"hexCode"` or `"code"` is accepted).*
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "IR signal transmitted successfully"
  }
  ```

#### 8. Delete a Remote or Button
* **Endpoint:** `POST /api/ir/remotes/delete`
* **Auth Required:** Yes
* **Request ("Send") - Delete single button:**
  ```json
  {
    "remoteName": "LG TV",
    "buttonName": "Power"
  }
  ```
* **Request ("Send") - Delete entire remote:**
  ```json
  {
    "remoteName": "LG TV"
  }
  ```
* **Response ("Receive") - 200 OK:**
  ```json
  {
    "success": true,
    "message": "Button deleted"
  }
  ```

---

### 6.4 Web UI Dynamic Function-Specific Cards

The Web Dashboard (`/` and `app.js`) inspects the `type` and `direction` metadata for each GPIO channel and automatically renders specialized UI cards:

| Pin Function / Type | Direction | UI Experience Rendered |
| :--- | :---: | :--- |
| **`IR Receiver`** (`IR_RECEIVER`) | `INPUT` | Displays **Receiver Active / Idle** status indicator, live demodulator preview with last intercepted code (`Protocol`, `0xHEX`, `Bits`), a **[ 🎯 Train / Learn Key ]** button with modal countdown timer, and a **[ 📋 View Saved Keys ]** catalog button. |
| **`IR Transmitter`** (`IR_TRANSMITTER`) | `OUTPUT` | Renders a grid of **Quick-Blast Remote Action Buttons** for all stored keys (e.g. `[ 🚀 TV: Power ]`, `[ 🚀 Fan: Speed 1 ]`) + manual protocol/hex code blaster modal with bit selection. |
| **`PIR Motion`** (`PIR_MOTION`) | `INPUT` | Renders a real-time motion sensor badge (**🚶 MOTION DETECTED** vs **🟢 IDLE / SECURE**) with live state changes. |
| **`Door / Window`** (`DOOR_SENSOR`) | `INPUT` | Renders a contact sensor badge (**🚪 CONTACT OPEN** vs **🔒 SECURE / CLOSED**). |
| **`Voltage ADC`** (`VOLTAGE_ADC`) | `INPUT` | Live calibrated voltage display (`2.45 V`, raw ADC `760/1023`, live sample button). |
| **`Relay / Actuator`** (`RELAY`) | `OUTPUT` | Toggle power switch, ON/OFF buttons, and timed pulse trigger button. |
