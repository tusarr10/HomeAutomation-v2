# SmartHome Production Bundle (`prod/`)

Ready-to-deploy production artifacts for all three tiers of the SmartHome automation system (**Firmware `v1.7.0`**).

---

## Folder Layout

| Directory | Role | Platform / Runtime | Guide |
| :--- | :--- | :--- | :--- |
| [central-server/](central-server/README.md) | Fleet Brain, SQLite DB, Web/PWA UI & TCP Broker | Node.js `>= 22.5` (`--experimental-sqlite`) on PC / Linux Server (`:9100` HTTP/WS, `:2000` TCP) | [central-server/README.md](central-server/README.md) |
| [relay-server/](relay-server/README.md) | Always-On Router Edge Broker (`smarthome-edge`) | Native static Go binary (Linux ARM64 / AMD64 & Windows, `:9200` HTTP, `:2001` TCP) | [relay-server/README.md](relay-server/README.md) |
| [node/](node/README.md) | ESP8266 Microcontroller Binaries & Web Assets (`v1.7.0`) | NodeMCU 1.0 (ESP-12E/F, 4MB Flash + PCF8574 + IR + A0 ADC) | [node/README.md](node/README.md) |

---

## Deployment Order

1. **Central Server** ([central-server/README.md](central-server/README.md)) — install dependencies (`npm install --omit=dev`) and start on `192.168.1.10` (`:9100` HTTP/WS, `:2000` TCP).
2. **Relay Server** ([relay-server/README.md](relay-server/README.md)) — deploy the matching platform binary from `relay-server/bin/` with `config/config.json` on your router (`192.168.1.1`) or Windows/Linux host.
3. **Node Firmware** ([node/README.md](node/README.md)) — deploy `firmware-*-v1.7.0.bin` via Relay Server / Node Web OTA (`/api/ota/upload`) without overwriting `/config/*.json`.
