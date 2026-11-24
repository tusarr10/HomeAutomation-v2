# SmartHome Node Firmware (`node-firmware/`) — Audit & Actionable TODO List

**Audited Against:**
- `central-server/` (`src/nodeManager.js`, `src/routes/v1Router.js`, `src/littlefsService.js`, `src/database.js`)
- `TODO_INTEGRATION_LIST.md`, `API_MERGE_LIST.md`, `API_DOCUMENTATION.md`, `CENTRAL_SERVER_NODE_API_REQUIREMENTS.md`, `HARDWARE_SENSOR_FIRMWARE_SPEC.md`, `node-firmware/RELAY_INTEGRATION.md`, `relay-server/IMPLEMENTATION.md`
- **Target Board / Env:** NodeMCU 1.0 ESP8266 4MB + PCF8574 (`esp8266_4m`)

---

## 1. Status Audit: Already Implemented in `node-firmware/` (`esp8266_4m`)

*(Several `.md` docs still show parts of these as pending, but code inspection + live device verification at `192.168.1.28` confirm they are already working in `esp8266_4m`.)*

- [x] **Default 4MB Build (`esp8266_4m`) + PCF8574 Support:** Active `#else` branch compiles cleanly with `TARGET_ESP8266_4M=1`, `FEATURE_PCF8574=1`, and LittleFS.
- [x] **57-Endpoint REST API & `/api/all` Catalog:** Auth/Dual-Auth pairing (`/api/auth/pair`, `/unpair`), `/api/status`, `/api/gpio`, `/api/sensors`, `/api/i2c/*`, `/api/ir/*`, `/api/automation/*`, `/api/fs/*`, `/api/ota/upload`, `/api/backup/*`, `/api/firmware/download`, `/api/commands/execute`.
- [x] **Dual-Auth Pairing & Session Engine:** Supports `X-Server-Key`, `X-Pairing-Key`, `Authorization: Bearer`, `Cookie: session=...`, and Basic Auth.
- [x] **Digital Input Guard & Sensor Classification:** `classifyChannel()` + `applyPhysicalPin()` configure `A0` (`17`) as `INPUT` and digital sensors (`IR Receiver`, `PIR Motion`, `Door Sensor`, generic `Sensor`) as `INPUT_PULLUP` (never `OUTPUT`).
- [x] **`IrManager` Engine:** Enabled in `main.cpp` (`esp8266_4m`), learns/decodes codes, persists virtual remotes to `/config/ir_codes.json`, and blasts via `POST /api/ir/transmit`.
- [x] **Edge Automation & Backup/LittleFS:** Timer/Interlock/Schedule rules, NTP sync, binary firmware download, JSON backup/restore, and full `/api/fs/*` file explorer.
- [x] **Basic `sensors[]` Telemetry Array:** `ReceiverClient::fillTelemetryDoc()` builds a `sensors[]` array alongside `channels[]`.

---

## 2. Priority 0 — Central Server Features Missing or Mismatched in `node-firmware/`

These are features/payloads **actively dispatched or expected by `central-server/` right now** that are missing or broken in `node-firmware/`:

- [x] **P0.1: Implement `action: "send_ir"` in Unified Command Dispatchers** *(Implemented & Verified on `COM6` / `192.168.1.28`)*
  - **Fix Applied:** Added `send_ir`, `configure_pin`, and `read_sensor` in `web_server.cpp` (`/api/commands/execute`, Target 5) and `send_ir` in `receiver_client.cpp` (`processServerCommands`, Target 5). Accepts both `code` and `hexCode`.

- [x] **P0.2: Support `"server": "host:port"` Format in `POST /api/receiver`** *(Implemented & Verified)*
  - **Fix Applied:** `web_server.cpp` parses `"server": "host:port"` into `cfg.serverHost` and `cfg.serverPort` while preserving explicit `serverHost`/`serverPort` overrides.

- [x] **P0.3: Fix `ReceiverClient::fillTelemetryDoc()` JSON Buffer Overflow & Missing Fields** *(Implemented & Verified)*
  - **Fix Applied:** Added compact `GpioManager::toTelemetryJson(channels, sensors)` and added `hardware`, `pcf8574Detected`, `pcf8574Address`, and `pcf8574Output` to `ReceiverClient::fillTelemetryDoc()`.

---

## 3. Priority 1 — Real-Time Sensor Telemetry & ADC Enhancements

- [x] **P1.1: Push Real-Time IR Decode Events to Central Server** *(Implemented & Compiled)*
  - **Fix Applied:** Added `ReceiverClient::pushSensorEvent(...)` (350ms debounced non-blocking async push emitting `eventType: "sensor_event"`, `sensor_type`, `pin`, `channel_id`, `ir_code`, `ir_protocol`) triggered from `IrManager::loop()`.

- [x] **P1.2: Poll Digital Input Sensors (`PIR_MOTION` & `DOOR_SENSOR`) in `GpioManager::loop()`** *(Implemented & Compiled)*
  - **Fix Applied:** Added 80ms digital `INPUT` sampling in `GpioManager::loop()` (Target 5), respecting `activeLow` and invoking `_stateCallback(ch.id, logical)`.

- [x] **P1.3: True RMS AC Voltage Sampling + Mean DC Reference (`A0` / Pin 17)** *(Implemented & Verified)*
  - **Fix Applied:** Added `sampleAnalogA0()` (64 samples across ~20ms 50Hz mains cycle) returning both `dcVoltage` and `acRms` alongside `rawAdc` (automatically selecting `acRms` as `value` when `function` contains `"ac"` or `"rms"`).

---

## 4. Priority 2 — Optional Spec Parity, RAM Optimization & Multi-Target Cleanup

- [x] **P2.1: Execute RAM & Heap Optimization Plan** *(Implemented & Measured)*
  - **Verified Gains (`esp8266_4m`):**
    - Static DRAM reduced from **`46,384 B` (`56.6%`)** to **`43,036 B` (`52.5%`)** -> **`-3,348 bytes`** saved (`.rodata` `12,512 -> 11,092 B`, `.bss` `32,232 -> 30,304 B`) via `PROGMEM` pin map (`PROG_PIN_MAP`), `PROGMEM` fallback dashboard HTML, shrunk `LOG_RING_CAPACITY` (`20 x 88 B`), and trimmed `ReceiverClient` buffers.
    - Streamed 20+ HTTP JSON handlers via `WebServerManager::sendJsonDoc()` (`setContentLength(measureJson(doc))` + `serializeJson(doc, client)`), eliminating `String out` heap allocations, and collapsed `/api/sensors` from dual `6144 + 4096 B` buffers down to a single `2048 B` doc (`toJson(arr, true)`).
    - Live `192.168.1.28` `/api/status` after stress tests: `freeHeap` improved `16,504 -> 19,440 B`, `maxFreeBlock` improved `11,752 -> 16,528 B`, and `heapFragPercent` dropped **`22% -> 10%`**.

- [x] **P2.2: Direct Protocol Parity (`save-content`, `configure_pin`, `read_sensor`)** *(Implemented & Verified)*
  - Added native `POST /api/fs/save-content` (up to `5120 B`, cataloged in `API_CATALOG_JSON` as endpoint #58) plus `configure_pin` and `read_sensor` in `/api/commands/execute`.

- [x] **P2.3: Clean Up Legacy `[env:nodemcu_pcf8574]`** *(Implemented & Compiled)*
  - Aligned `[env:nodemcu_pcf8574]` in `platformio.ini` via `extends = env:esp8266_4m`; both environments build cleanly with identical `43,036 B` RAM / `532,452 B` Flash footprints.

> **Next:** See [`../central-server/TODO.md`](../central-server/TODO.md) for Central Server ingestion & UI items (`sensor_event`, `VOLTAGE_ADC` / `acRms` display, and `send_ir` UX).
