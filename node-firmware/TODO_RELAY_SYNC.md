# ESP Node Firmware Relay Server Integration Guide (`node-firmware/`)

> **Target Source Files:** `node-firmware/src/receiver_client.cpp`, `receiver_client.h`, `config.h`  
> **Purpose:** Configures ESP8266, ESP-01S + PCF8574, and ESP32 targets to communicate through the **Always-On Router Relay Server (`smarthome-edge`)** with optional Central Server fallback.

---

## 📋 Integration Checklist for Firmware Targets

### 1. Configure Primary Receiver Target
In the node web UI (`Settings` -> `Central Receiver / Fleet Telemetry`) or in default firmware configuration:

| Setting | Recommended Production Value | Description |
|---|---|---|
| **Enabled** | `true` | Activates background TCP telemetry client |
| **Server Host** | `192.168.1.1` (Router Gateway IP) | Directly targets the Go Relay Server |
| **Server Port** | `2000` | High-speed NDJSON raw TCP port |
| **Protocol** | `0` (Raw TCP Socket) | Fastest sub-millisecond line transport |
| **Report Interval** | `10` – `15` seconds | Periodic heartbeat rate |
| **Send on State Change** | `true` | Triggers immediate (<50ms) push when switches toggle |

---

### 2. Dual-Target Failover Logic (Optional Firmware Upgrade)
If you want microcontrollers to automatically attempt connecting to the Central Server PC (`192.168.1.10:2000`) if the Router Relay Server (`192.168.1.1:2000`) is undergoing maintenance:

**Add to `node-firmware/src/receiver_client.h`:**
```cpp
struct ReceiverConfig {
    bool enabled;
    String primaryHost;     // "192.168.1.1" (OpenWrt Gateway)
    uint16_t primaryPort;   // 2000
    String fallbackHost;    // "192.168.1.10" (Central PC)
    uint16_t fallbackPort;  // 2000
    uint8_t failedAttempts;
    // ...
};
```

**Add to `ReceiverClient::startAsyncPush(...)` in `receiver_client.cpp`:**
```cpp
// Choose active target with automatic failover
const char* targetHost = _config.serverHost.c_str();
uint16_t targetPort = _config.serverPort;

if (_config.failedAttempts >= 3 && _config.fallbackHost.length() > 0) {
    targetHost = _config.fallbackHost.c_str();
    targetPort = _config.fallbackPort;
}

if (!_tcpClient.connect(targetHost, targetPort)) {
    _packetsFailed++;
    _config.failedAttempts++;
    _state = RC_STATE_IDLE;
    return;
}

// Reset failure counter on successful connection
_config.failedAttempts = 0;
```

---

### 3. Application Command Acknowledgment (ACK) Loop
The Relay Server tracks command execution statuses. Ensure the firmware maintains and transmits pending command execution ACKs in the telemetry payload:

```json
{
  "nodeId": "NODE-8C4F00565D72",
  "eventType": "gpio_change",
  "acks": [
    {
      "command_uuid": "cmd-1732371234567890",
      "success": true,
      "status": "ACKNOWLEDGED"
    }
  ]
}
```

* When `ReceiverClient::processServerCommands` executes `setState` or `toggle`:
  ```cpp
  bool ok = GpioManager::getInstance().setState(id, state);
  recordCommandAck(cmdUuid.c_str(), ok);
  ```
* The next telemetry frame clears and transmits these pending ACKs to the Relay Server.

---

### 4. Direct LAN Fast-Path Security
The Relay Server initiates sub-30ms direct HTTP requests to nodes at `http://<node-ip>/api/gpio/state` when mobile apps or users switch relays.
* Ensure `node-firmware/src/web_server.cpp` accepts `POST /api/gpio/state` with either:
  1. Default local admin session.
  2. `X-Server-Key` or `authToken` header matching `config.json`.
