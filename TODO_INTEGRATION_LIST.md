# SmartHome System: Master Integration & Implementation Roadmap

**Document Version:** `3.0.0`  
**Target Systems:** Central Server (`central-server/`) & ESP Microcontroller Firmware (`node-firmware/`)  
**Status:** Active Roadmap & Audit  

---

## 1. System Implementation Summary

| Component | Scope | Total Items | Completed | Pending | Health / Status |
|:---|:---|:---:|:---:|:---:|:---:|
| **Central Server Core** (`central-server/`) | Backend, REST APIs, SQLite DB, Dual-Auth, LittleFS & Pin Sync | 12 | **12** | **0** | 🟢 **100% Complete & Live-Verified** |
| **Node Firmware** (`node-firmware/`) | ESP8266 / NodeMCU C++ Firmware Codebase (`esp8266_4m`) | 8 | **8** | **0** | 🟢 **100% Complete & Live-Verified** |
| **Central Server Ingestion & UI** | Real-time `sensor_event`, `acRms`/`dcVoltage` metrics, & IR auto-bind | 6 | **6** | **0** | 🟢 **100% Complete & Live-Verified** |

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
| **CS-13** | **Dedicated Sensors & Telemetry UI** | Added `Sensors & Telemetry` sidebar navigation tab and view module in `app.js`; decoupled relay switches from sensors | ✅ **DONE** | Live verified: Relays view only displays controllable switches; Sensors view displays live voltages, IR remotes, calibration, and matrix. |

---

## 3. PART B: Node Firmware Implementation Status (`node-firmware/`)

All firmware tasks (P0, P1, P2) are **fully implemented, compiled, and live-verified** on `NODE-8C4F00565D72` (`192.168.1.28`) in commit `cc60aa1`.

| # | Task / Capability | Firmware Implementation Details | Status | Live Result |
|:---:|:---|:---|:---:|:---|
| **B-1** | **Default 4MB Build (`esp8266_4m`) + PCF8574** | `#else` active branch compiles cleanly with `TARGET_ESP8266_4M=1`, LittleFS, and PCF8574 expander | ✅ **DONE** | Compiled & verified on hardware |
| **B-2** | **IrManager Transceiver Engine** | Initialized & looped in `main.cpp` (`esp8266_4m`), learns & stores remotes in `/config/ir_codes.json` | ✅ **DONE** | Tested & blasting verified |
| **B-3** | **`send_ir` Unified Command Handlers** | Handled in `/api/commands/execute` (`web_server.cpp`) & `processServerCommands()` (`receiver_client.cpp`) | ✅ **DONE** | Accepts `code` and `hexCode` |
| **B-4** | **Real-Time Sensor Event Push** | `ReceiverClient::pushSensorEvent()` (350ms debounced non-blocking async TCP push) | ✅ **DONE** | Emits `eventType: "sensor_event"` |
| **B-5** | **True RMS AC Voltage & Mean DC (`A0`)** | `sampleAnalogA0()` (64 samples across 20ms 50Hz mains wave) computes `acRms`, `dcVoltage`, `rawAdc` | ✅ **DONE** | Stable mains reading without zero-crossing dips |
| **B-6** | **Digital Input Sensors & Pin Guard** | `INPUT_PULLUP` applied to `PIR_MOTION`, `DOOR_SENSOR`, and digital inputs; 80ms loop sampling | ✅ **DONE** | Prevents relay output lockup on sensor pins |
| **B-7** | **Direct Flash File Edit & Save** | Native `POST /api/fs/save-content` for config files `<= 5KB` (catalog endpoint #58) | ✅ **DONE** | Direct in-browser edit without multipart overhead |
| **B-8** | **RAM & Heap Optimization** | Static DRAM reduced by 3,348 B; heap fragmentation dropped from 22% to 10% | ✅ **DONE** | `freeHeap` boosted to ~19.5 KB; streamed JSON |

---

## 4. PART C: Central Server Ingestion & UI Roadmap (All Completed)

All Central Server ingestion and UI tasks from [`central-server/TODO.md`](central-server/TODO.md) are **fully implemented and verified live**:

- [x] **Task C.1: Ingest `eventType: "sensor_event"` & Forward `sensors[]` in `nodeManager.js`** *(Completed & Verified)*
  * NodeManager ingests `data.sensors[]` (`dcVoltage`, `acRms`, `rawAdc`, `code`, `protocol`), forwards `sensors` and `sensorEvent` in `telemetry_update` WebSocket broadcasts, and logs audit entries.
- [x] **Task C.2: Normalize `VOLTAGE_ADC` vs `VOLTAGE` & Display `acRms` / `dcVoltage` in UI** *(Completed & Verified)*
  * Updated `app.js` with badges (`📊 AC RMS Voltage` / `📊 DC Voltage`) and tooltips showing DC, AC RMS, and raw ADC.
- [x] **Task C.3: Expose Unified Actions (`send_ir`, `configure_pin`, `read_sensor`) in Central Dispatch** *(Completed & Verified)*
  * Added `POST /api/v1/nodes/:nodeId/read-sensor` and updated `dispatchCommand` in `nodeManager.js` to dispatch `read_sensor`, `send_ir`, and `configure_pin` with `X-Server-Key` authentication.
- [x] **Task C.4: Route Save-Content Calls to Native `POST /api/fs/save-content`** *(Completed & Verified)*
  * Implemented in `src/littlefsService.js` with direct fast-path (`<= 5KB`) to `POST /api/fs/save-content`, verified live with `directFastPath: true`.
- [x] **Task C.5: Real-Time IR Learned Code Toast & Auto-Bind** *(Completed & Verified)*
  * Added `handleRealtimeIrEvent` in `app.js` listening for WebSocket `sensor_event` to instantly populate learned IR codes and display toasts.

---

## 5. PART D: Pin Synchronization Audit & Future Node Items

### Root Cause of Pin Sync Error (Resolved)
1. **Frontend Alert Check**: `syncPinsWithHardware` in `public/assets/app.js` evaluated `if (data.status === "ok")`. Because modern API endpoints return `{"success": true}`, `data.status` was `undefined`, triggering a false `Sync failed: Unknown error` alert even when synchronization succeeded.
2. **Chunked Encoding / Content-Length**: Outbound HTTP requests from `nodeManager.syncPinToNode` to `/api/gpio/update` omitted explicit `Content-Length`. ESP8266's `_server.arg("plain")` received empty bodies, returning `Channel ID not found`.
3. **Offline Node Timeout**: `syncAllOnlineNodesPins()` previously looped over all registered nodes including offline devices and the Tuya breaker, causing 4-second timeout delays. Now filtered strictly to online ESP nodes.
4. **Database Method Fix**: Added `updateNodeChannels(nodeId, channels)` alias to `FleetDatabase` in `src/database.js` resolving LittleFS live sync errors.

### Future / Optional Node Firmware Tasks (For User to Implement Later)
- [ ] **Node-1 (Optional): mDNS Service Discovery (`_smarthome-receiver._tcp`)**
  * Allow unconfigured nodes to discover Central Server IP & Port 2000 automatically on local LAN without requiring manual `/api/receiver` configuration.
- [ ] **Node-2 (Optional): Oscilloscope Waveform Buffer for AC RMS (`A0`)**
  * Provide an optional circular buffer of 64 raw ADC samples to stream a live 50Hz/60Hz waveform graph to the Central Server UI for visual power quality inspection.
