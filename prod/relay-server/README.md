# Relay Server — Production Deployment (`prod/relay-server/`)

Standalone Go edge broker (`smarthome-edge`) with embedded SQLite cache, autonomous LAN relay/breaker control, offline event spooling, and Central Server sync.

---

## Included Binaries (`bin/`)

| Binary | Target Platform |
| :--- | :--- |
| `bin/smarthome-edge` | OpenWrt / Linux ARM64 (default router build, e.g. Jio AX6000 MT7986A) |
| `bin/smarthome-edge-linux-arm64` | Linux ARM64 (Raspberry Pi 64-bit / ARM64 SBC / OpenWrt) |
| `bin/smarthome-edge-linux-amd64` | Linux x86_64 Server / VM |
| `bin/smarthome-edge.exe` | Windows 64-bit |

---

## Deployment

### Linux / OpenWrt Router
1. Copy the target binary (e.g. `bin/smarthome-edge`) and `config/config.json` to `/opt/smarthome-edge/` (keep `config/config.json` relative to your working directory, alongside writable `data/`).
2. Review `config/config.json` (`server.tcp_listen`, `server.http_listen`, `central.url`, `breaker` settings).
3. Run:
   ```bash
   chmod +x /opt/smarthome-edge/smarthome-edge
   cd /opt/smarthome-edge
   ./smarthome-edge
   ```

### Windows
```powershell
cd prod\relay-server
.\bin\smarthome-edge.exe
```

* **Default Web UI & API:** `http://<host>:9200`
* **Default TCP Node Listener:** `0.0.0.0:2001` (adjustable to `2000` in `config/config.json`)
