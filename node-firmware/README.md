# 🚀 SmartHome Unified Node Firmware

A unified, multi-target firmware for ESP8266 (ESP-01 1MB & NodeMCU 4MB), PCF8574 I2C expanders, and ESP32.

---

## 📁 Architecture Overview

```text
node-firmware/
├── platformio.ini               # Unified config: targets esp01_1m, esp8266_4m, esp01_pcf, nodemcu_pcf, esp32
├── include/
│   ├── config.h                 # Board-agnostic system constants & storage paths
│   ├── board_pins.h             # Safe pin reference matrices per target
│   └── dashboard_html.h         # Gzipped fallback dashboard for 1MB targets
├── src/
│   ├── main.cpp                 # Non-blocking modular loop & hardware reset check
│   ├── receiver_client.cpp      # TCP & HTTP client for Relay Server
│   ├── receiver_client.h
│   ├── wifi_manager.cpp         # AP/STA captive portal & auto-reconnect
│   ├── wifi_manager.h
│   ├── web_server.cpp           # REST API & Web Dashboard server
│   ├── web_server.h
│   ├── storage_manager.cpp      # EEPROM (1MB) / LittleFS (4MB) persistence
│   ├── storage_manager.h
│   ├── auth_manager.cpp         # Token & password authentication
│   ├── auth_manager.h
│   ├── automation.cpp           # Thin-satellite / local cron automation engine
│   ├── automation.h
│   ├── ota_manager.cpp          # Dual-slot web OTA & ArduinoOTA
│   ├── ota_manager.h
│   ├── gpio_manager.cpp         # Physical & PCF8574 virtual pin controller
│   ├── gpio_manager.h
│   └── drivers/
│       ├── pcf8574_driver.cpp   # PCF8574 8-channel I2C expander driver
│       └── pcf8574_driver.h
├── data/                        # Filesystem for 4MB+ boards (ESP8266 4MB & ESP32)
│   ├── index.html
│   ├── app.js
│   └── style.css
└── scripts/
    ├── compress_dashboard.py    # Auto-compresses web UI into dashboard_html.h for 1MB builds
    └── strip_floats.py          # Size optimizer for 1MB targets
```

---

## 🛠️ Build Targets

| Target Environment | Target Hardware | Flash Size | Web Dashboard | Storage Mode | Build Command |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`esp8266_4m`** | ESP8266 (ESP-12E/F) NodeMCU / D1 Mini | 4 MB | LittleFS (`/data`) | LittleFS JSON | `pio run -e esp8266_4m` |
| **`esp01_1m`** | ESP-01 / ESP-01S | 1 MB | PROGMEM Gzip | EEPROM | `pio run -e esp01_1m` |
| **`esp01_pcf8574`** | ESP-01 + PCF8574T I2C Expander | 1 MB | PROGMEM Gzip | EEPROM | `pio run -e esp01_pcf8574` |
| **`nodemcu_pcf8574`**| NodeMCU + PCF8574T I2C Expander | 4 MB | LittleFS (`/data`) | LittleFS JSON | `pio run -e nodemcu_pcf8574` |
| **`esp32dev`** | ESP32-WROOM / ESP32-DevKit | 4 MB+ | LittleFS (`/data`) | LittleFS JSON | `pio run -e esp32dev` |

---

## 📡 Relay Server Integration

Every target connects seamlessly to the **Relay Server** (`relay-server/`) using the standardized Newline-Delimited JSON (NDJSON) over TCP port `2000` or HTTP POST `/api/node/telemetry`.

Detailed protocol documentation: **[RELAY_INTEGRATION.md](file:///d:/ai/HomeAutomation%20v2/node-firmware/RELAY_INTEGRATION.md)**.

---

## 🔒 Preserved Memory & Hardware Safeguards
- **1MB Flash OTA Budget**: `esp01_1m` and `esp01_pcf8574` preserve strict `< 440 KB` binary sizes to guarantee dual-slot wireless OTA updates.
- **Factory Reset Safeguard**: On ESP-01 targets, the physical factory reset button is disabled (`255`) to prevent relay coil drops on GPIO 0 from triggering accidental factory wipes.
- **Floating Point Linker Stripping**: `scripts/strip_floats.py` eliminates 16.8 KB of unneeded libc float tables on 1MB flash targets.
- **Web UI & REST APIs**: Completely untouched and identical to the original codebase.
