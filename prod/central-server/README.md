# Central Server — Production Deployment (`prod/central-server/`)

Node.js Fleet Management Server with embedded SQLite (`node:sqlite`), WebSocket/SSE real-time dashboard & PWA, Raw TCP telemetry listener (`:2000`), and REST API (`:9100`).

---

## Prerequisites

* **Node.js `v22.5+`** (required for built-in `--experimental-sqlite`; verified on Node.js `v26.13.0` as well).

## Setup & Start

### Windows
```powershell
cd prod\central-server
npm install --omit=dev
.\run.bat
```

### Linux / macOS
```bash
cd prod/central-server
npm install --omit=dev
chmod +x run.sh
./run.sh
```

*(Direct start command: `node --experimental-sqlite server.js`)*

---

## Configuration ([config.json](config.json))

| Key | Default | Description |
| :--- | :--- | :--- |
| `bind_host` | `0.0.0.0` | Network interface bind address |
| `http_port` | `9100` | Web UI, PWA, REST API (`/api/v1/*`, `/api/*`), and WebSocket (`/api/v1/ws`) port |
| `tcp_port` | `2000` | Raw NDJSON TCP socket listener for ESP8266 nodes |
| `offline_timeout_sec` | `30` | Seconds without telemetry before marking a node offline |
| `direct_http_timeout_ms` | `2500` | LAN direct HTTP switching timeout |
| `poll_interval_sec` | `5` | Background HTTP pin/status poll interval |

Runtime SQLite databases (`data/fleet.db`) and uploaded backups/firmware are stored under `data/` (not pre-populated in this bundle; default superadmin credentials are seeded automatically on first boot per Central Server RBAC setup).
