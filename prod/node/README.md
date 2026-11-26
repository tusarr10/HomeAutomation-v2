# Node Firmware — Production Binaries (`prod/node/`, `v1.7.0`)

Pre-built production binaries (`48.9%` static RAM / `50.7%` Flash on ESP8266 4MB) ready for OTA rollout through Relay Server or direct Node Web UI, plus USB serial flashing.

---

## Hardware Target Subfolders

| Folder | Hardware Target | Included Files | README |
| :--- | :--- | :--- | :--- |
| [esp8266_4m/](esp8266_4m/README.md) | **NodeMCU 1.0 (ESP-12E/F) 4MB + PCF8574** *(Primary Production Env)* | `firmware-esp8266_4m-v1.7.0.bin`, `littlefs-esp8266_4m-v1.7.0.bin`, `web-assets/`, `CHECKSUMS.txt` | [esp8266_4m/README.md](esp8266_4m/README.md) |
| [nodemcu_pcf8574/](nodemcu_pcf8574/README.md) | **NodeMCU + PCF8574 Unified Parity Build** *(extends `esp8266_4m`)* | `firmware-nodemcu_pcf8574-v1.7.0.bin`, `littlefs-nodemcu_pcf8574-v1.7.0.bin`, `web-assets/`, `CHECKSUMS.txt` | [nodemcu_pcf8574/README.md](nodemcu_pcf8574/README.md) |

*(Legacy `1MB` targets `esp01_1m` / `esp01_pcf8574` and `esp32dev` are available to build from source under `../../node-firmware/` via PlatformIO.)*

---

## OTA Safety Guidelines (Important)

1. **Firmware OTA (`firmware-*.bin`):** Safe to upload via Relay Server / Central Server / Node `/api/ota/upload`. Updates executable code (`v1.7.0`) while **preserving** `/config/wifi.json`, `/config/gpio.json`, `/config/i2c.json`, and `/config/receiver.json`.
2. **Web UI Assets (`web-assets/`):** If updating web UI `?v=1.7.0` cache-busters without wiping device configs, upload `web-assets/index.html` (`app.js`, `style.css` if needed) via `POST /api/fs/upload`.
3. **Full LittleFS Image (`littlefs-*.bin`):** Overwrites the entire 2MB LittleFS partition — only use for blank/fresh boards or full reset (device will regenerate default configs cleanly if Wi-Fi/GPIO are not pre-seeded).
