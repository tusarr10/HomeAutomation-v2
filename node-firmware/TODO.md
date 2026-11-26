# SmartHome Node Firmware (`node-firmware/`) — Audit, Features & Actionable Roadmap

**Target Hardware:** NodeMCU 1.0 ESP8266 4MB + PCF8574 I2C Expander (`esp8266_4m` & `nodemcu_pcf8574`)  
**Firmware Version:** v1.7.0  
**Current Fleet Device:** `NODE-8C4F00565D72` at `192.168.1.28`  
**Status:** All core P0, P1, and P2 firmware milestone tasks are 100% complete, compiled, and live-verified.

---

## 1. Status Audit: Fully Implemented Firmware Capabilities

- [x] **Default 4MB Build (`esp8266_4m`) + PCF8574 Support:**
  - Compiles cleanly with `TARGET_ESP8266_4M=1`, `FEATURE_PCF8574=1`, and LittleFS enabled.
- [x] **58-Endpoint REST API Catalog:**
  - Full endpoint suite documented in `/api/all`: Auth/Dual-Auth pairing (`/api/auth/pair`, `/unpair`), `/api/status`, `/api/gpio`, `/api/sensors`, `/api/i2c/*`, `/api/ir/*`, `/api/automation/*`, `/api/fs/*`, `/api/ota/upload`, `/api/backup/*`, `/api/firmware/download`, `/api/commands/execute`, and `/api/fs/save-content`.
- [x] **Dual-Auth Permanent Pairing & Security:**
  - Secure session management supporting `X-Server-Key`, `X-Pairing-Key`, `Authorization: Bearer`, session cookies, and basic auth.
- [x] **Digital Input Guard & Sensor Classification:**
  - Hardware classification prevents accidental short circuits: pin `A0` (17) is guarded as `INPUT`, while digital sensors (`IR Receiver`, `PIR Motion`, `Door Sensor`) are strictly configured as `INPUT_PULLUP` (never `OUTPUT`).
- [x] **`IrManager` Transceiver Engine:**
  - Active in `main.cpp` (`esp8266_4m`): decodes incoming infrared signals, stores remotes in `/config/ir_codes.json`, and transmits signals via `/api/ir/transmit`.
- [x] **Edge Automation Engine & LittleFS:**
  - Autonomous edge timer, interlock, and scheduling rules; NTP time sync; JSON backup/restore; and full `/api/fs/*` flash file explorer.
- [x] **Compact `sensors[]` Telemetry Array:**
  - `ReceiverClient::fillTelemetryDoc()` packages sensor data alongside `channels[]` without buffer overflows.

---

## 2. Priority 0 — Central Server Interoperability (Completed)

- [x] **P0.1: Unified Command Action `send_ir`** *(Verified on `NODE-8C4F00565D72`)*
  - Handled in both `/api/commands/execute` (`web_server.cpp`) and `processServerCommands()` (`receiver_client.cpp`), accepting both `code` and `hexCode`.
- [x] **P0.2: Compact `"server": "host:port"` Support in `POST /api/receiver`** *(Verified)*
  - Parses host and port from a single string while allowing manual overrides.
- [x] **P0.3: Telemetry Buffer Overflow Fix & Extended Metadata** *(Verified)*
  - Uses compact serialization `GpioManager::toTelemetryJson(channels, sensors)` and exposes `pcf8574Detected`, `pcf8574Address`, and `pcf8574Output`.

---

## 3. Priority 1 — Real-Time Telemetry & ADC Enhancements (Completed)

- [x] **P1.1: Asynchronous Real-Time IR Decode Push** *(Verified)*
  - Non-blocking 350ms debounced TCP push in `ReceiverClient::pushSensorEvent(...)` emitting `eventType: "sensor_event"`.
- [x] **P1.2: Digital Sensor Loop Sampling (`PIR_MOTION` & `DOOR_SENSOR`)** *(Verified)*
  - 80ms digital input loop sampling in `GpioManager::loop()`, respecting `activeLow` logic and notifying central server on state transitions.
- [x] **P1.3: True RMS AC Voltage Sampling + Mean DC Reference (`A0` / Pin 17)** *(Verified)*
  - 64-sample sampling window across a 20ms 50Hz mains cycle providing stable AC RMS and DC voltage readings without zero-crossing dips.

---

## 4. Priority 2 — RAM Optimization & Protocol Parity (Completed)

- [x] **P2.1: Heap Optimization & DRAM Reduction** *(Verified)*
  - Shrunk static DRAM from `46,384 B` to `43,036 B` (-3,348 bytes saved) via `PROGMEM` pin maps, trimmed ring buffers, and streamlined JSON streaming. Free heap maintained at ~19.5 KB with only 10% fragmentation.
- [x] **P2.2: Native Direct Flash Save (`POST /api/fs/save-content`)** *(Verified)*
  - Fast-path for direct text/json file modification up to 5KB without multipart form-data overhead.
- [x] **P2.3: Environment Alignment** *(Verified)*
  - Unified `[env:esp8266_4m]` and `[env:nodemcu_pcf8574]` in `platformio.ini`.

---

## 5. Priority 3 — Future Node Firmware Roadmap & Planned Tasks (TODO)

The following tasks are reserved for future firmware revisions.

> [!IMPORTANT]
> **Safety Constraint:** Do NOT modify `node-firmware/` during active server testing or without explicit hardware access.

- [ ] **Task NF-F1: mDNS Service Auto-Discovery (`_smarthome-receiver._tcp`)**
  - Broadcast and query mDNS service records so newly flashed ESP8266 nodes automatically detect the Central Server's IP address and Port 2000 on the LAN without requiring manual `/api/receiver` POST configuration.
- [ ] **Task NF-F2: Wi-Fi Reconnection & Captive Portal Fallback**
  - If the primary Wi-Fi network is unreachable for > 60 seconds, temporarily spin up an Access Point (`SmartHome-Node-XXXX`) with an onboarding captive portal (`192.168.4.1`) for easy credential updates.
- [ ] **Task NF-F3: Oscilloscope Raw Waveform Streaming (`A0`)**
  - Implement an on-demand endpoint (`GET /api/sensors/adc/waveform`) returning 64 raw ADC samples to graph the live 50Hz/60Hz AC waveform in the dashboard.
- [ ] **Task NF-F4: Deep Sleep Power Optimization for Battery Nodes**
  - Introduce configurable deep sleep profiles (`ESP.deepSleep(...)`) for battery-operated wireless sensor nodes (e.g. door contact sensors, outdoor temperature sensors).
- [ ] **Task NF-F5: Secondary MQTT Client Fallback**
  - Optional secondary lightweight MQTT client publishing state to standard MQTT topics (`stat/<node-id>/...`) for third-party Home Assistant or Node-RED bridges.
