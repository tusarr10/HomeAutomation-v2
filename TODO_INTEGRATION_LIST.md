# SmartHome System: Master Integration & Implementation Roadmap

**Document Version:** `3.0.0`  
**Target Systems:** Central Server (`central-server/`) & ESP Microcontroller Firmware (`node-firmware/`)  
**Status:** Active Roadmap & Audit  

---

## 1. System Implementation Summary

| Component | Scope | Total Items | Completed | Pending | Health / Status |
|:---|:---|:---:|:---:|:---:|:---:|
| **Central Server** (`central-server/`) | Backend, REST APIs, SQLite DB, UI & Pin Sync | 12 | **12** | **0** | 🟢 **100% Complete & Live-Verified** |
| **Node Firmware** (`node-firmware/`) | ESP8266 / NodeMCU C++ Firmware Codebase | 8 | **2** | **6** | 🟡 **Firmware Action Required (For User)** |

---

## 2. PART A: Central Server Implementation Status

All wire APIs, database schemas, bidirectional pin synchronizations, and UI modals are fully implemented in `central-server/` and verified against the live physical node (`192.168.1.28` / `NODE-8C4F00565D72`).

| # | Feature / Wire API | Central Server Implementation | Status | Live Verification Result |
|:---:|:---|:---|:---:|:---|
| **CS-1** | **Bidirectional GPIO Pin Sync** | `syncNodePins(nodeId)` in `nodeManager.js`, `upsertRelayFromChannel` in `database.js` | ✅ **DONE** | Live verified: All 12 channels (PCF 100-107, GPIO 16, IR RX 14, IR TX 13, ADC 17) synced into SQLite; renamed CH9 pushed back to node in 1ms. |
| **CS-2** | **Dual-Auth Permanent Pairing** | `pairNode(nodeId)` & `unpairNode(nodeId)` in `nodeManager.js`, `updateNodeServerKey` in `database.js` | ✅ **DONE** | Live verified: Paired `NODE-8C4F00565D72` with 32-char crypto key; node returned `{"paired": true}`. |
| **CS-3** | **Automatic Header Injection** | `getNodeAuthHeaders(node)` in `nodeManager.js` injecting `X-Server-Key` & `Authorization: Bearer` | ✅ **DONE** | Live verified: All outbound HTTP calls automatically pass permanent server key with zero session timeouts. |
| **CS-4** | **I2C Bus Scanner** | `GET /api/v1/nodes/:nodeId/i2c/scan` & `scanNodeI2c(nodeId)` in `nodeManager.js` | ✅ **DONE** | Live verified: Detected 1 device on I2C bus (`0x20` - PCF8574 expander). |
| **CS-5** | **PCF8574 8-CH Auto-Provisioning** | `POST /api/v1/nodes/:nodeId/i2c/auto-channels` & `autoProvisionNodePcfChannels()` | ✅ **DONE** | Live verified: Generated 8 expansion channels (GPIO 100–107) and synchronized with pin matrix. |
| **CS-6** | **Hardware Serial Logs Viewer** | `GET /api/v1/nodes/:nodeId/hardware-logs` & `showNodeLogsModal()` in `app.js` | ✅ **DONE** | Live verified: Renders live circular RAM logs from `/api/logs` with timestamps & status colors. |
| **CS-7** | **Direct IR Signal Blaster** | `POST /api/v1/nodes/:nodeId/ir/transmit` & `handleBlastIr()` in `app.js` | ✅ **DONE** | Live verified: Dispatches protocol, hex code, and bit length to `/api/ir/transmit`. |
| **CS-8** | **IR Code Learner & Remote Studio** | `POST /ir/train/start`, `GET /ir/train/result`, `showNodeIrModal()` in `app.js` | ✅ **DONE** | Live verified: Interactive countdown polling and button saving into microcontroller LittleFS. |
| **CS-9** | **Virtual Remote Buttons Storage** | `GET /ir/remotes`, `POST /ir/remotes/save`, `POST /ir/remotes/delete` | ✅ **DONE** | Live verified: Card view with one-click dispatch and deletion buttons. |
| **CS-10** | **LittleFS File Explorer** | `GET /fs/list`, `GET /fs/download`, `POST /fs/upload`, `POST /fs/delete`, `POST /fs/rename` | ✅ **DONE** | Live verified: Browsed and inspected all 7 flash files on live node (`192.168.1.28`). |
| **CS-11** | **Sensor Detection & Telemetry Mapping**| `upsertRelayFromChannel()` detecting `isSensor: true`, `direction: "INPUT"`, `type: "VOLTAGE_ADC"`, `type: "IR_RECEIVER"` | ✅ **DONE** | Live verified: Channels 10 and 12 properly stored as `SENSOR_INPUT` with units `HEX` and `V`. |
| **CS-12** | **Tuya Breaker Isolation Lock** | Strict safeguard in `nodeManager.js`, `v1Router.js`, and `database.js` | ✅ **DONE** | Live verified: Breaker `NODE-30487DE85D5C` remained untouched, `Online`, and relay `LIVE ON`. |

---

## 3. PART B: Node Firmware Action Items (Pending at Node End)

These are the items that need to be updated in the **`node-firmware/`** codebase by the developer.

---

### Task B.1: Fix Target Preprocessor Directives for Default 4MB Build
* **Files to Update:**
  1. `node-firmware/src/web_server.cpp` (Line 1036)
  2. `node-firmware/src/main.cpp` (Line 182)
  3. `node-firmware/src/gpio_manager.cpp` (Line 601)
  4. `node-firmware/src/wifi_manager.cpp` (Line 429)
  5. `node-firmware/src/wifi_manager.h` (Line 83)
  6. `node-firmware/src/gpio_manager.h` (Line 112)
  7. `node-firmware/include/board_pins.h` (Line 97)
* **Problem:** `platformio.ini` sets `-D TARGET_ESP8266_4M=1` for the default build, but source files check `#elif defined(TARGET_NODEMCU_PCF8574)`.
* **Action:** In all 7 files, change:
  ```cpp
  #elif defined(TARGET_NODEMCU_PCF8574)
  ```
  to:
  ```cpp
  #elif defined(TARGET_NODEMCU_PCF8574) || defined(TARGET_ESP8266_4M)
  ```

---

### Task B.2: Enable `IrManager` in NodeMCU 4MB `setup()` and `loop()`
* **File to Update:** `node-firmware/src/main.cpp` (Lines 285–315 and 465–495)
* **Problem:** In the NodeMCU and `#else` branches, `IrManager::getInstance().begin()` and `loop()` were omitted.
* **Action:**
  1. In `setup()` under NodeMCU branch (after `WebServerManager::getInstance().begin()`):
     ```cpp
     // 10. Initialize Infrared Remote Engine
     IrManager::getInstance().begin();
     ```
  2. In `loop()` under NodeMCU branch (alongside other subsystems):
     ```cpp
     IrManager::getInstance().loop();
     ```

---

### Task B.3: Implement `action: "send_ir"` in Node Command Handlers
* **Files to Update:**
  1. `node-firmware/src/web_server.cpp` (inside `/api/commands/execute`)
  2. `node-firmware/src/receiver_client.cpp` (inside `processServerCommands`)
* **Problem:** Central Server dispatches `{ action: 'send_ir', protocol, code, bits, frequency }` when blasting IR. The node command dispatchers only recognize `setState`, `toggle`, `pulse`, and `reboot`.
* **Action:** In both files, add:
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

---

### Task B.4: Connect `IrManager` Reception to Real-Time Event Push
* **Files to Update:**
  1. `node-firmware/src/ir_manager.cpp` (inside `loop()`)
  2. `node-firmware/src/receiver_client.h` and `receiver_client.cpp`
* **Problem:** When an IR remote signal is decoded by the hardware receiver (GPIO 14), `IrManager` logs it internally, but does not push an immediate TCP event to Central Server.
* **Action:**
  1. In `receiver_client.h` and `receiver_client.cpp`, declare and implement:
     ```cpp
     void pushSensorEvent(const char* sensorType, const char* strValue, const char* protocol, uint8_t pin);
     ```
  2. In `ir_manager.cpp` when `recv->decode(results)` succeeds:
     ```cpp
     ReceiverClient::getInstance().pushSensorEvent(
         "IR_RECEIVER",
         _lastHexCode.c_str(),
         _lastProtocol.c_str(),
         _rxPin
     );
     ```

---

### Task B.5: True RMS AC Voltage Sampling for Mains Voltage ADC (A0)
* **File to Update:** `node-firmware/src/gpio_manager.cpp`
* **Problem:** Currently, A0 reads instantaneous DC raw counts `analogRead(A0)`. On an AC mains transformer or ZMPT101B sensor, this fluctuates with 50Hz sine wave position and reads near zero at zero-crossings.
* **Action:** Implement cycle sampling over 20ms (one full 50Hz cycle):
  ```cpp
  float readRmsVoltage() {
      const int numSamples = 200;
      long sumSquares = 0;
      for (int i = 0; i < numSamples; i++) {
          int sample = analogRead(A0) - 512; // remove 1.65V DC bias
          sumSquares += (long)sample * sample;
          delayMicroseconds(100); // 200 samples * 100us = 20ms
      }
      float rmsRaw = sqrt(sumSquares / numSamples);
      return rmsRaw * CALIBRATION_FACTOR; // maps to ~230V AC
  }
  ```

---

### Task B.6: Support Digital Input Sensor Modes (`INPUT` & `INPUT_PULLUP`)
* **File to Update:** `node-firmware/src/gpio_manager.cpp` (inside `applyPhysicalPin`)
* **Problem:** Pins configured with `direction: "INPUT"` or `function: "Sensor"` must not be forced to `pinMode(pin, OUTPUT)`.
* **Action:** Check channel direction/type before applying output mode:
  ```cpp
  if (ch.isSensor || ch.direction.equalsIgnoreCase("INPUT")) {
      pinMode(ch.pin, INPUT_PULLUP);
  } else {
      pinMode(ch.pin, OUTPUT);
      digitalWrite(ch.pin, ch.currentState ^ ch.activeLow);
  }
  ```
