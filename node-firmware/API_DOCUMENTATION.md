# SmartHome Node Firmware: Complete API Reference & Security Architecture

**Firmware Version:** 1.6.0  
**Hardware Platforms:** ESP8266 (ESP-12E/F NodeMCU / D1 Mini 4MB, ESP-01/01S 1MB) & ESP32  
**Target Communication:** HTTP REST API (Port 80), Async TCP Telemetry Socket (Port 2000), ArduinoOTA (Port 8266)

---

## Table of Contents
1. [Security Architecture & Dual-Authentication](#1-security-architecture--dual-authentication)
   - [Wi-Fi Hotspot WPA2 Protection](#wi-fi-hotspot-wpa2-protection)
   - [Dual-Password Login System (Admin + Server Pairing Key)](#dual-password-login-system)
   - [Direct Header Authentication for Central Servers](#direct-header-authentication)
   - [Pairing & Provisioning Lifecycle](#pairing--provisioning-lifecycle)
2. [I2C Bus & PCF8574 Pin Expander](#2-i2c-bus--pcf8574-pin-expander)
   - [Dynamic Pin Configuration & Bus Auto-Discovery](#dynamic-pin-configuration)
   - [Extended Relays P0–P7 (Pins 100–107)](#extended-relays-p0p7)
3. [REST API Specification](#3-rest-api-specification)
   - [Authentication & Pairing Endpoints](#authentication--pairing-endpoints)
   - [System Diagnostics & Status](#system-diagnostics--status)
   - [I2C Bus & Expander Management](#i2c-bus--expander-management)
   - [GPIO & Relay Channel Control](#gpio--relay-channel-control)
   - [Wi-Fi Network Management](#wi-fi-network-management)
   - [Automation Engine](#automation-engine)
   - [Central Receiver Telemetry Client](#central-receiver-telemetry-client)
   - [System Management & Logs](#system-management--logs)
4. [Client Implementation Examples (cURL & Python)](#4-client-implementation-examples)

---

## 1. Security Architecture & Dual-Authentication

### Wi-Fi Hotspot WPA2 Protection
To prevent unauthorized users from hijacking unconfigured nodes, the built-in Access Point hotspot runs with **WPA2 encryption** by default:
- **SSID Format:** `SmartHome-Setup-XXXX` (where `XXXX` represents the unique last 4 hex characters of the node's hardware MAC address).
- **Default AP Password:** `smarthome1234` (configurable in Web Settings or `/api/wifi/ap`).
- **IP Address:** `192.168.4.1` (Subnet `255.255.255.0`, DHCP range `.2` to `.20`).

---

### Dual-Password Login System
The node features a **Dual-Authentication** model designed to solve the access control loophole when pairing nodes to a central multi-node controller:

```
                  ┌──────────────────────────────────────────────┐
                  │              HTTP Authentication             │
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
                             Issues Session Token: Set-Cookie
```

1. **Human Administrator Password:** Configured by the owner (default: `admin`). Used for daily browser login on the Web Dashboard.
2. **Server Pairing Key:** Provisioned by the central home server during initial setup (e.g., `abcdefgh12345678`).
3. **Login Matching:** Logging in as `admin` succeeds if **EITHER** the human admin password **OR** the server pairing key matches!
4. **Resilience:** If the human administrator changes their password via the UI, the central server’s automated routines **never break** because the server key remains valid. Conversely, if a node is reassigned, the server key can be revoked via `/api/auth/unpair` without resetting the admin's personal credentials.

---

### Direct Header Authentication
For high-performance automated REST requests without session cookies, central servers and background workers can authenticate by passing the pairing key in an HTTP header:

```http
X-Server-Key: abcdefgh12345678
```
*(Also accepts `X-Pairing-Key: abcdefgh12345678` or `Authorization: Bearer abcdefgh12345678`)*

When this header is present and its SHA256 matches the stored pairing hash, the node grants administrative access instantly without cookie/session overhead.

---

### Pairing & Provisioning Lifecycle

```
Central Server / User                            ESP8266 SmartHome Node
       │                                                    │
       │  1. POST /api/auth/pair                            │
       │     Body: {"serverKey":"abcdefgh..."}              │
       ├───────────────────────────────────────────────────►│
       │                                                    │ (Computes SHA256 & persists
       │                                                    │  to /config/system.json)
       │  2. 200 OK: {"success":true,"paired":true}        │
       │◄───────────────────────────────────────────────────┤
       │                                                    │
       │  3. Subsequent REST Calls                          │
       │     Header: X-Server-Key: abcdefgh...             │
       ├───────────────────────────────────────────────────►│ (Instantly authorized)
       │  4. 200 OK                                         │
       │◄───────────────────────────────────────────────────┤
```

---

## 2. I2C Bus & PCF8574 Pin Expander

### Dynamic Pin Configuration
Any GPIO pins can be assigned to software I2C on the fly via the Web UI or `/api/i2c`:
- **Default SDA Pin:** GPIO 4 (`D2` on NodeMCU)
- **Default SCL Pin:** GPIO 5 (`D1` on NodeMCU)
- **Clock Speed:** 100 kHz standard mode with software pull-ups enabled.
- **Safety Lock:** When I2C is enabled, the configured SDA and SCL pins are automatically marked **RESERVED** by `GpioManager`, preventing relay conflicts.

### Extended Relays P0–P7 (Pins 100–107)
When a PCF8574 / PCF8574A 8-bit expander is attached to the I2C bus:
- The firmware maps virtual pin IDs **100 through 107** to expander outputs `P0` through `P7`.
- State changes, pulses, timers, and automation rules operate on pins 100–107 identically to native ESP pins.
- Relays default to active-low logic (initial byte `0xFF` ensures relays stay open/off during cold boot).

---

## 3. REST API Specification

### Authentication & Pairing Endpoints

#### 1. Login
- **Endpoint:** `POST /api/auth/login`
- **Auth Required:** No
- **Headers:** `Content-Type: application/json`
- **Request Body:**
```json
{
  "username": "admin",
  "password": "tusarranjan"
}
```
*(Password can be either the admin password OR the paired server key)*
- **Success Response (200 OK):**
```json
{
  "success": true,
  "token": "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
  "username": "admin"
}
```
*(Sets HTTP-Only cookie `session=7a8b9c0d...; Path=/`)*
- **Error Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid username or password"
}
```

---

#### 2. Check Authentication Session
- **Endpoint:** `GET /api/auth/check`
- **Auth Required:** Optional (reads session cookie or header)
- **Response (200 OK):**
```json
{
  "authenticated": true,
  "adminUser": "admin"
}
```

---

#### 3. Pair Central Server Key
- **Endpoint:** `POST /api/auth/pair`
- **Auth Required:** Yes (must be logged in as admin OR provide `adminPassword` in the JSON body)
- **Request Body:**
```json
{
  "serverKey": "abcdefgh12345678",
  "adminPassword": "admin"
}
```
- **Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Device successfully paired to Central Server"
}
```

---

#### 4. Query Pairing Status
- **Endpoint:** `GET /api/auth/pair`
- **Auth Required:** No
- **Response (200 OK):**
```json
{
  "paired": true,
  "adminUser": "admin"
}
```

---

#### 5. Unpair Central Server Key
- **Endpoint:** `POST /api/auth/unpair`
- **Auth Required:** Yes
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Device unpaired successfully"
}
```

---

#### 6. Logout
- **Endpoint:** `POST /api/auth/logout`
- **Auth Required:** No
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### System Diagnostics & Status

#### Query Node Diagnostics
- **Endpoint:** `GET /api/status`
- **Auth Required:** No
- **Response (200 OK):**
```json
{
  "deviceName": "SmartHome-NodeMCU",
  "firmwareVersion": "1.6.0",
  "hardware": "ESP8266 (ESP-12E/F) NodeMCU",
  "uptimeSec": 3482,
  "bootCount": 4,
  "cpuFreq": 80,
  "mac": "8C:4F:00:56:5D:72",
  "nodeId": "SmartHome-Setup-5D72",
  "chipId": "565d72",
  "formattedTime": "22:15:00",
  "freeHeap": 25264,
  "minFreeHeap": 24890,
  "flashSize": 4194304,
  "fsTotal": 2072576,
  "fsUsed": 188416,
  "fsFree": 1884160,
  "wifiMode": 2,
  "apActive": true,
  "apSsid": "SmartHome-Setup-5D72",
  "apIp": "192.168.4.1",
  "staConnected": true,
  "staSsid": "MyHomeRouter",
  "staIp": "192.168.1.35",
  "paired": true,
  "i2cEnabled": true,
  "pcfDetected": true
}
```

---

### I2C Bus & Expander Management

#### 1. Query I2C Bus Configuration
- **Endpoint:** `GET /api/i2c`
- **Auth Required:** No
- **Response (200 OK):**
```json
{
  "enabled": true,
  "sdaPin": 4,
  "sclPin": 5,
  "address": 39,
  "addressHex": "0x27",
  "detected": true,
  "detectedAddress": 39,
  "extendedPins": [100, 101, 102, 103, 104, 105, 106, 107]
}
```

---

#### 2. Configure I2C Settings
- **Endpoint:** `POST /api/i2c`
- **Auth Required:** Yes
- **Request Body:**
```json
{
  "enabled": true,
  "sdaPin": 4,
  "sclPin": 5,
  "address": 39,
  "reboot": false
}
```
*(Set `reboot: true` to immediately restart the node and initialize expander channels)*
- **Response (200 OK):**
```json
{
  "success": true,
  "message": "I2C settings saved successfully"
}
```

---

#### 3. Live I2C Bus Scan
- **Endpoint:** `GET /api/i2c/scan?sda=4&scl=5`
- **Auth Required:** No
- **Query Parameters:** `sda` (optional), `scl` (optional)
- **Response (200 OK):**
```json
{
  "success": true,
  "sdaPin": 4,
  "sclPin": 5,
  "count": 1,
  "devices": [
    {
      "address": 39,
      "hex": "0x27",
      "type": "PCF8574"
    }
  ]
}
```

---

### GPIO & Relay Channel Control

#### 1. List All Configured Channels
- **Endpoint:** `GET /api/gpio`
- **Auth Required:** No
- **Response (200 OK):**
```json
[
  {
    "id": 1,
    "pin": 100,
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
    "pin": 101,
    "name": "Ceiling Fan",
    "room": "Living Room",
    "function": "Fan",
    "activeLow": true,
    "initialMode": 0,
    "enabled": true,
    "state": true
  }
]
```

---

#### 2. Add New Relay Channel
- **Endpoint:** `POST /api/gpio`
- **Auth Required:** Yes
- **Request Body:**
```json
{
  "pin": 100,
  "name": "Garden Floodlight",
  "room": "Garden",
  "function": "Light",
  "activeLow": true,
  "initialMode": 0
}
```
- **Pin Mapping Guide:**
  - `100` to `107`: PCF8574 Extended Pins `P0` through `P7`.
  - `16` (`D0`), `14` (`D5`), `12` (`D6`), `13` (`D7`), `0` (`D3`), `2` (`D4`), `15` (`D8`): Native ESP pins.
- **Initial Mode Options:**
  - `0`: Restore last saved state on boot (default).
  - `1`: Always boot OFF.
  - `2`: Always boot ON.

---

#### 3. Update Existing Channel
- **Endpoint:** `POST /api/gpio/update`
- **Auth Required:** Yes
- **Request Body:**
```json
{
  "id": 1,
  "name": "Master Bed Lamp",
  "room": "Bedroom",
  "function": "Light",
  "activeLow": true,
  "initialMode": 0,
  "enabled": true
}
```

---

#### 4. Delete Channel
- **Endpoint:** `POST /api/gpio/delete`
- **Auth Required:** Yes
- **Request Body:**
```json
{
  "id": 1
}
```

---

#### 5. Change Relay State (On / Off / Toggle / Pulse)
- **Endpoint:** `POST /api/gpio/state`
- **Auth Required:** Yes
- **Turn Explicitly ON / OFF:**
```json
{
  "id": 1,
  "state": true
}
```
- **Toggle State (Flip current state):**
```json
{
  "id": 1,
  "action": "toggle"
}
```
- **Pulse Output (Turn ON for X milliseconds, then auto-turn OFF):**
```json
{
  "id": 1,
  "action": "pulse",
  "duration": 750
}
```
- **Success Response (200 OK):**
```json
{
  "success": true,
  "message": "State updated"
}
```

---

### Wi-Fi Network Management

#### 1. Scan Available Wi-Fi Networks
- **Endpoint:** `GET /api/wifi/scan`
- **Auth Required:** No
- **Response (200 OK):**
```json
{
  "count": 2,
  "networks": [
    { "ssid": "Home-Network-5G", "rssi": -58, "encryption": "WPA2" },
    { "ssid": "Office-IoT", "rssi": -72, "encryption": "WPA2" }
  ]
}
```

---

#### 2. Connect to Router
- **Endpoint:** `POST /api/wifi/connect`
- **Auth Required:** Yes
- **Request Body:**
```json
{
  "ssid": "MyHomeRouter",
  "password": "RouterPassword123"
}
```

---

#### 3. Update AP Hotspot Configuration
- **Endpoint:** `POST /api/wifi/ap`
- **Auth Required:** Yes
- **Request Body:**
```json
{
  "ssid": "SmartHome-Node-Custom",
  "password": "mySecurePassword123"
}
```
*(Password must be at least 8 characters for WPA2, or blank for Open AP)*

---

### Automation Engine

- **List Rules:** `GET /api/automation`
- **Add Rule:** `POST /api/automation`
  - Body: `{"name":"Auto-Off","type":0,"sourceGpioId":1,"targetGpioId":2,"condState":true,"targetState":false,"param1":30}`
- **Delete Rule:** `POST /api/automation/delete`
  - Body: `{"id":1}`

---

### Central Receiver Telemetry Client

- **Get Config:** `GET /api/receiver`
- **Save Config:** `POST /api/receiver`
  - Body: `{"enabled":true,"host":"192.168.1.100","port":2000,"heartbeatSec":15,"token":"server_secret"}`
- **Test Ping:** `POST /api/receiver/test`

---

### System Management & Logs

- **Reboot Node:** `POST /api/system/reboot` (Auth Required)
- **Factory Reset:** `POST /api/system/factory-reset` (Auth Required)
- **System Logs:** `GET /api/logs` (Returns circular ring buffer logs)

---

## 4. Client Implementation Examples

### Python: Authenticate & Toggle Relay via Server Pairing Key

```python
import requests

NODE_IP = "192.168.1.35"
PAIRING_KEY = "abcdefgh12345678"

# Option A: Direct Header Authentication (Recommended for background scripts)
headers = {
    "X-Server-Key": PAIRING_KEY,
    "Content-Type": "application/json"
}

# Toggle Relay ID 1
resp = requests.post(
    f"http://{NODE_IP}/api/gpio/state",
    headers=headers,
    json={"id": 1, "action": "toggle"}
)
print("Toggle Response:", resp.json())

# Option B: Login with Admin + Server Pairing Key to get Session Token
login_payload = {
    "username": "admin",
    "password": PAIRING_KEY  # Server key accepted directly as admin password!
}
session_resp = requests.post(f"http://{NODE_IP}/api/auth/login", json=login_payload)
data = session_resp.json()
print("Session Token:", data.get("token"))
```

---

### cURL: Pair Node, Configure I2C Expander & Toggle Pin 100

```bash
# 1. Pair central server key to node
curl -X POST http://192.168.4.1/api/auth/pair \
  -H "Content-Type: application/json" \
  -d '{"serverKey": "abcdefgh12345678", "adminPassword": "admin"}'

# 2. Enable I2C on SDA=D2 (GPIO 4) and SCL=D1 (GPIO 5)
curl -X POST http://192.168.4.1/api/i2c \
  -H "X-Server-Key: abcdefgh12345678" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "sdaPin": 4, "sclPin": 5, "address": 39, "reboot": false}'

# 3. Add an expander relay on Pin 100 (P0)
curl -X POST http://192.168.4.1/api/gpio \
  -H "X-Server-Key: abcdefgh12345678" \
  -H "Content-Type: application/json" \
  -d '{"pin": 100, "name": "Balcony Light", "room": "Balcony", "function": "Light", "activeLow": true, "initialMode": 0}'

# 4. Turn the relay ON
curl -X POST http://192.168.4.1/api/gpio/state \
  -H "X-Server-Key: abcdefgh12345678" \
  -H "Content-Type: application/json" \
  -d '{"id": 1, "state": true}'
```
