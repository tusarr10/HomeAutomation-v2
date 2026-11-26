# `esp8266_4m` Production Release (`v1.7.0`)

Primary firmware target for **NodeMCU 1.0 (ESP-12E/F, 4MB Flash)** with **PCF8574 I2C Relay Expander**, **IR Transceiver**, **A0 AC RMS / DC ADC**, **Digital Sensors**, and **LittleFS**.

---

## Build Profile & Footprint
* **Version:** `1.7.0` (`HARDWARE_TARGET`: `ESP8266 (ESP-12E/F) NodeMCU`)
* **Static DRAM:** `40,028 B` (`39.09 KB` / `48.9%` of `80 KB`)
* **Sketch Flash:** `529,744 B` (`517.33 KB` / `50.7%` of `1020 KB`)
* **Binary Size:** `533,904 B` (`firmware-esp8266_4m-v1.7.0.bin`)
* **LittleFS Partition (`eagle.flash.4m2m.ld`):** `2,072,576 B` (`littlefs-esp8266_4m-v1.7.0.bin`, built from `node-firmware/data/`)

Check MD5/SHA-256 hashes in [CHECKSUMS.txt](CHECKSUMS.txt) before flashing or setting `X-File-MD5`.

---

## Flashing Methods

### 1. Recommended — OTA via Relay Server / Node Web UI (Preserves Configs)
* Upload `firmware-esp8266_4m-v1.7.0.bin` (`targetType: firmware`, optional `X-File-MD5` header from [CHECKSUMS.txt](CHECKSUMS.txt)).
* Optionally upload `web-assets/index.html` via LittleFS Upload to bump `?v=1.7.0` cache tags without resetting `/config/*.json`.

### 2. USB Serial (`esptool.py` on `COM6`)
```powershell
esptool.py --chip esp8266 --port COM6 --baud 921600 write_flash 0x00000 firmware-esp8266_4m-v1.7.0.bin
```
*(Optional initial LittleFS image write at `0x200000`: `write_flash 0x200000 littlefs-esp8266_4m-v1.7.0.bin`.)*
