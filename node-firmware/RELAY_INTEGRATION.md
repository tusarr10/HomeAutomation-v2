# 📡 Node Firmware - Relay Server Integration Contract

This document specifies the exact communication protocol between all ESP node firmware targets and the **Relay Server** (`smarthome-edge` in `relay-server/`).

Every ESP hardware target (ESP-01 1MB, ESP8266 4MB, PCF8574 variants, and ESP32) implements this specification via `receiver_client.cpp` / `receiver_client.h`.

---

## 1. Connection Architecture

```
+--------------------+                       +----------------------+                       +--------------------+
|  ESP Node (Any HW) |  --- TCP (Port 2000) ---> | Relay Server (Edge)  |  --- WS / HTTP ----> |   Central Server   |
|  receiver_client   |  <-- NDJSON Command - |  (smarthome-edge)    |  <-- Forward Cmd --- |  (central-server)  |
+--------------------+                       +----------------------+                       +--------------------+
```

- **Primary Transport**: Raw TCP socket on port `2000` using Newline-Delimited JSON (NDJSON).
  - *Why*: Fast, lightweight, zero HTTP header overhead, perfectly suited for the 1MB ESP-01 memory budget.
- **Secondary Transport (Fallback)**: HTTP/REST `POST /api/node/telemetry` on port `8080`.
- **Default Port**: `2000` (TCP) / `8080` (HTTP).
- **Default Path**: `/api/node/telemetry`.
- **Interval**: Configurable (default `10` seconds, with immediate push on GPIO state changes).

---

## 2. Telemetry Payload Format (ESP Node -> Relay Server)

The node sends a single line of minified JSON ending with a newline character (`\n`):

```json
{
  "nodeId": "ESP8266-A1B2C3",
  "nodeName": "Living-Room-Relay",
  "hardwareTarget": "ESP8266 (ESP-12E/F) NodeMCU",
  "firmwareVersion": "1.6.0",
  "authToken": "optional_auth_secret",
  "event": "heartbeat",
  "uptime": 1420,
  "rssi": -62,
  "freeHeap": 42150,
  "ip": "192.168.1.105",
  "states": [
    {
      "channel": 0,
      "pin": 14,
      "name": "Light",
      "state": false,
      "inverted": true,
      "mode": "OUTPUT"
    },
    {
      "channel": 1,
      "pin": 12,
      "name": "Fan",
      "state": true,
      "inverted": true,
      "mode": "OUTPUT"
    }
  ],
  "acks": [
    {
      "commandUuid": "cmd-550e8400-e29b-41d4-a716-446655440000",
      "success": true
    }
  ]
}
```

### Event Types (`event` field):
- `boot`: Transmitted immediately upon completing Wi-Fi association.
- `heartbeat`: Transmitted periodically (every `reportIntervalSec` seconds).
- `gpio_change`: Transmitted within 100ms whenever a physical button or relay state changes.
- `test_ping`: Transmitted when the user clicks "Test Push" in the node web UI.
- `manual_push`: Transmitted when a manual trigger occurs.

---

## 3. Server Response Format (Relay Server -> ESP Node)

Upon receiving a valid NDJSON telemetry frame, the Relay Server replies with a single line of JSON ending with `\n`:

```json
{
  "status": "ok",
  "epoch": 1732371234,
  "commands": [
    {
      "uuid": "cmd-550e8400-e29b-41d4-a716-446655440000",
      "type": "SET_PIN",
      "channel": 0,
      "state": true
    }
  ]
}
```

### Supported Command Types:
1. **`SET_PIN`**: Sets a relay channel to a specific state.
   - `channel`: Channel index (0 to MAX-1)
   - `state`: `true` (ON) or `false` (OFF)
2. **`TOGGLE_PIN`**: Inverts the current state of a channel.
   - `channel`: Channel index
3. **`REBOOT`**: Performs a software reboot of the ESP module.

---

## 4. Command Acknowledgment (ACK) Loop

1. Relay Server attaches queued commands with a unique `uuid`.
2. ESP Node parses the `commands` array.
3. For each command:
   - Node executes the requested action (`GpioManager::setState()` or `reboot()`).
   - Node stores `{ "commandUuid": uuid, "success": true/false }` in its internal `_pendingAcks` buffer.
4. On the next telemetry packet, the node transmits all pending `acks`.
5. The Relay Server marks those command UUIDs as executed and clears them from its queue.
