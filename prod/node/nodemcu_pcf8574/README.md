# `nodemcu_pcf8574` Production Release (`v1.7.0`)

Unified parity build (`extends = env:esp8266_4m` in `platformio.ini`) with identical **PCF8574 + IRremoteESP8266 + A0 AC RMS/DC + PROGMEM RAM optimizations** for boards configured under `-e nodemcu_pcf8574`.

---

## Build Profile & Footprint
* **Version:** `1.7.0`
* **Static DRAM:** `40,028 B` (`39.09 KB` / `48.9%` of `80 KB`)
* **Sketch Flash:** `529,744 B` (`517.33 KB` / `50.7%`)
* **Checksums:** See [CHECKSUMS.txt](CHECKSUMS.txt) for exact MD5 and SHA-256 digests.

---

## OTA / USB Deployment

* **OTA Upgrade (Preserves `/config/*.json`):** Upload `firmware-nodemcu_pcf8574-v1.7.0.bin` via Relay Server OTA or `POST /api/ota/upload`.
* **Web UI Asset Refresh:** Upload files from `web-assets/` (`index.html`, `app.js`, `style.css`) via `POST /api/fs/upload`.
* **USB Serial (`esptool.py`):**
  ```powershell
  esptool.py --chip esp8266 --port COM6 --baud 921600 write_flash 0x00000 firmware-nodemcu_pcf8574-v1.7.0.bin
  ```
