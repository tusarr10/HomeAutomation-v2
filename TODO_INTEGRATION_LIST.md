# SmartHome System: Master Integration TODO & Implementation Roadmap

**Document Version:** `2.5.0`  
**Target Systems:** Central Server (`central-server/`) & ESP Microcontroller Firmware (`node-firmware/`)  
**Status:** Actionable Implementation Plan  

---

## Progress Overview

| Phase | Category | Total Tasks | Completed | In Progress | Pending | Status |
|:---:|:---|:---:|:---:|:---:|:---:|:---:|
| **P0** | Critical Wire Protocol & Compilation Parity | 4 | 2 | 0 | 2 | 🟡 Partially Ready (Firmware) |
| **P1** | Security, Dual-Auth & Server Pairing | 3 | 3 | 0 | 0 | 🟢 Complete & Verified |
| **P2** | Analog RMS Voltage & Sensor Modes | 3 | 2 | 0 | 1 | 🟡 Partially Ready (Firmware) |
| **P3** | Central Server Frontend & Fleet Tools | 3 | 3 | 0 | 0 | 🟢 Complete & Verified |

---

## Priority 0 (P0) — Critical Wire Protocol & Compilation Parity

These tasks resolve immediate compilation inconsistencies and fill communication gaps between Central Server and Node Firmware.

- [x] **Task 0.1: Default 4MB Build (`TARGET_ESP8266_4M`) Support** *(Completed & Verified Live)*
  * Active `#else` fallback branch in `main.cpp`, `web_server.cpp`, `gpio_manager.cpp`, `wifi_manager.cpp`, and `receiver_client.cpp` compiles cleanly for `esp8266_4m` and runs on physical NodeMCU hardware (`192.168.1.28`).

- [x] **Task 0.2: Enable `IrManager` in NodeMCU 4MB `setup()` and `loop()`** *(Completed & Verified)*
  * Added `#include "ir_manager.h"`, `IrManager::getInstance().begin()`, and `IrManager::getInstance().loop()` in the `esp8266_4m` / `nodemcu_pcf8574` sections of `node-firmware/src/main.cpp`.

- [ ] **Task 0.3: Implement `action: "send_ir"` in Node Remote Command Parsers**
  * **Files Affected:**  
    * `node-firmware/src/web_server.cpp` (inside `/api/commands/execute`)  
    * `node-firmware/src/receiver_client.cpp` (inside `processServerCommands`)  
  * **Problem:** Central Server dispatches `{ action: 'send_ir', protocol, code, bits, frequency }` when transmitting IR signals. The node's command handlers only recognize `setState`, `toggle`, `pulse`, `reboot`, and `syncConfig`.
  * **Action:** Add the following handler in both command dispatchers:
    ```cpp
    else if (action.equalsIgnoreCase("send_ir")) {
        String protocol = doc["protocol"] | "NEC";
        String hexCode = doc["code"] | doc["hexCode"] | "";
        uint16_t bits = doc["bits"] | 32;
        uint8_t repeat = doc["repeat"] | 0;
        ok = IrManager::getInstance().transmit(255, protocol, hexCode, bits, repeat);
        resp["success"] = ok;
        resp["message"] = ok ? F("IR code blasted") : F("IR blast failed");
    }
    ```

- [ ] **Task 0.4: Connect `IrManager` Reception to Real-Time Event Push**
  * **Files Affected:**  
    * `node-firmware/src/ir_manager.cpp` (inside `loop()`)  
    * `node-firmware/src/receiver_client.h` and `receiver_client.cpp`  
  * **Problem:** When an IR remote signal is decoded, `IrManager` only logs it and updates internal variables. It does not notify `ReceiverClient` to send an immediate TCP / HTTP telemetry push.
  * **Action:**
    1. Add `pushSensorEvent(const char* type, const char* strValue, const char* protocol, uint8_t pin)` to `ReceiverClient`.
    2. In `IrManager::loop()`, when `recv->decode(results)` succeeds:
       ```cpp
       ReceiverClient::getInstance().pushSensorEvent(
           "IR_RECEIVER",
           _lastHexCode.c_str(),
           _lastProtocol.c_str(),
           _rxPin
       );
       ```

---

## Priority 1 (P1) — Security, Dual-Auth & Server Pairing Integration

- [x] **Task 1.1: Node Dual-Auth Engine Implementation** *(Completed)*
  * Node supports `POST /api/auth/pair`, `POST /api/auth/unpair`, and validates `X-Server-Key` or `Authorization: Bearer <serverKey>`.

- [x] **Task 1.2: Central Server Auto-Pairing Workflow** *(Completed & Verified Live)*
  * **Files Modified:** `central-server/src/database.js`, `central-server/src/nodeManager.js`, `central-server/src/routes/v1Router.js`, `central-server/public/assets/app.js`
  * **Implementation:**
    1. Added `server_key`, `is_paired`, `i2c_enabled`, `i2c_address`, `pcf8574_detected` migration columns to SQLite `nodes` table.
    2. Implemented `pairNode(nodeId)` generating 32-character crypto key, dispatched to `POST /api/auth/pair` and persisted.
    3. Implemented `getNodeAuthHeaders(node)` injecting `X-Server-Key: <server_key>` and `Authorization: Bearer <server_key>` into all outbound HTTP requests.
    4. Verified live against physical ESP8266 node `NODE-8C4F00565D72` (`192.168.1.28`), confirming paired status `{"paired": true, "adminUser": "admin"}`.

- [x] **Task 1.3: Central Server Node Unpair / Decommission** *(Completed & Verified Live)*
  * **Files Modified:** `central-server/src/routes/v1Router.js`, `central-server/src/nodeManager.js`, `central-server/public/assets/app.js`
  * **Implementation:**
    1. Dispatches `POST /api/auth/unpair` before node deletion in `DELETE /api/v1/nodes/:nodeId`.
    2. Added dedicated `POST /api/v1/nodes/:nodeId/unpair` and `POST /api/v1/nodes/:nodeId/pair` endpoints.
    3. Added dynamic "Pair Node" / "Unpair" buttons and pairing status indicator in Device Diagnostics modal.

---

## Priority 2 (P2) — Analog RMS Voltage & Sensor Modes

- [x] **Task 2.1: Basic A0 ADC Voltage & `sensors[]` Array** *(Completed)*
  * Node captures `analogRead(A0)` and populates `sensors[]` array in TCP and HTTP telemetry.

- [ ] **Task 2.2: True RMS AC Voltage Sampling**
  * **File Affected:** `node-firmware/src/gpio_manager.cpp`
  * **Action:** Replace instantaneous DC reading with cycle sampling:
    1. Take 200 samples over 20 milliseconds (one full 50Hz AC wave cycle).
    2. Compute root-mean-square: $V_{RMS} = \sqrt{\frac{1}{N}\sum (V_i - V_{mid})^2} \times \text{calibrationFactor}$.
    3. Prevents zero-crossing noise and reports stable AC mains voltage (e.g., ~230V AC).

- [x] **Task 2.3: Support Digital Input Sensor Modes (`INPUT` & `INPUT_PULLUP`)** *(Completed & Verified)*
  * **File Affected:** `node-firmware/src/gpio_manager.cpp`
  * **Implementation:** Added `classifyChannel()` and guarded `applyPhysicalPin()` so sensors (`Voltage`, `IR Receiver`, `PIR Motion`, `Door Sensor`, generic `Sensor`) initialize as `INPUT` (`A0`) or `INPUT_PULLUP` (digital inputs) and are never driven as digital `OUTPUT`.

---

## Priority 3 (P3) — Central Server Frontend & Fleet Tools

- [x] **Task 3.1: LittleFS File Explorer & Backup Engine** *(Completed & Verified Live)*
  * Server supports full file browsing, download, multipart upload, renaming, deletion, and complete backup zip archives. Sidebar navigation and node card actions verified.

- [x] **Task 3.2: Virtual IR Remote Frontend Cards & Remote Learner** *(Completed & Verified Live)*
  * **Files Modified:** `central-server/src/routes/v1Router.js`, `central-server/src/nodeManager.js`, `central-server/public/assets/app.js`
  * **Implementation:**
    1. Wired wire API endpoints: `POST /ir/transmit`, `POST /ir/train/start`, `POST /ir/train/stop`, `GET /ir/train/result`, `GET /ir/remotes`, `POST /ir/remotes/save`, `POST /ir/remotes/delete`.
    2. Implemented modal with direct IR Signal Blaster (Protocol, Hex Code, Bits), Remote Code Learner with live countdown and polling, and Saved Virtual Remote Buttons with one-click transmit.

- [x] **Task 3.3: I2C Expander Bus Management & Hardware Logs** *(Completed & Verified Live)*
  * **Files Modified:** `central-server/src/routes/v1Router.js`, `central-server/src/nodeManager.js`, `central-server/public/assets/app.js`
  * **Implementation:**
    1. Implemented I2C bus scan (`GET /nodes/:nodeId/i2c/scan`) and auto-provisioning (`POST /nodes/:nodeId/i2c/auto-channels`) for PCF8574 expansion relays.
    2. Implemented Hardware Serial Logs viewer (`GET /nodes/:nodeId/hardware-logs`) fetching live RAM circular buffer logs with log-level syntax coloring and refresh.
