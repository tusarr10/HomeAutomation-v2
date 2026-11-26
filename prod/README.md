# SmartHome Production Release Bundle (`prod/`) 📦⚡

Ready-to-deploy, verified production artifacts across all three tiers of the SmartHome automation system (**Central Server v1.6.0**, **Relay Server v1.2.0**, **Firmware v1.7.0**).

---

## 📁 Release Folder Layout

| Directory | Target Tier / Platform | Runtime Requirements | Key Artifacts |
|:---|:---|:---|:---|
| **[`central-server/`](central-server/README.md)** | Tier 1: Central Server (Windows PC / Linux Host) | Node.js `>= 22.5.0` (`--experimental-sqlite`) | `server.js`, `public/` (PWA, 2D/3D GUI), `src/` (Database, TCP, Tuya, Routers) |
| **[`relay-server/`](relay-server/README.md)** | Tier 2: Edge Relay Server (Jio AX6000 OpenWrt MT7986A / Linux / Windows) | Pure static binary (Zero runtime dependencies, `CGO_ENABLED=0`) | `bin/smarthome-edge` (ARM64), `bin/smarthome-edge.exe` (Win64), `config/config.json` |
| **[`node/`](node/README.md)** | Tier 3: Fleet Microcontrollers (NodeMCU ESP-12E/F 4MB) | LittleFS 2MB + App2 Firmware (4MB SPI Flash) | `esp8266_4m/`, `nodemcu_pcf8574/` (Firmware + LittleFS binaries) |

---

## 🔒 Binary Verification & SHA-256 Checksums

### Edge Relay Server Binaries (`prod/relay-server/bin/`)

```
2ACAA541D0668CC0B091DBC4657E0EE4C71CD8D5A38248499CDE18B7ABD5C99A  smarthome-edge (OpenWrt ARM64 drop-in)
8A1542E9148CBF73B4399A07419D2007999225279E6904AF13960468066D7683  smarthome-edge-linux-arm64
CD95E0333B3F11C402D7E64CE074B4D8D63DF28180BB3360B7C6CCFDB1DEE54A  smarthome-edge-linux-amd64
A3835EA224307C0BDB0132841DE86B363C607C04C5DC34C2860BF24BA0E2D388  smarthome-edge.exe
```

### Node Firmware & LittleFS Binaries (`prod/node/`)

- **NodeMCU 4MB Standard (`prod/node/esp8266_4m/`)**:
  - `firmware-esp8266_4m-v1.7.0.bin`
  - `littlefs-esp8266_4m-v1.7.0.bin`
- **NodeMCU 4MB with PCF8574 I2C Expander (`prod/node/nodemcu_pcf8574/`)**:
  - `firmware-nodemcu_pcf8574-v1.7.0.bin`
  - `littlefs-nodemcu_pcf8574-v1.7.0.bin`

---

## 🚀 Recommended Production Deployment Sequence

```
1. Deploy Relay Server (Router) ──> 2. Start Central Server (PC) ──> 3. Verify Auto-Sync ──> 4. OTA Flash Nodes
   (Always-On Local Edge)            (Fleet Analytics & PWA)          (25 Events / Snapshot)      (If upgrading)
```

### Step 1: Deploy Edge Relay Server on Router
Deploy to your OpenWrt router (e.g. `192.168.1.1` MediaTek MT7986A Filogic 830):
```bash
# Upload binary and config
scp prod/relay-server/bin/smarthome-edge-linux-arm64 root@192.168.1.1:/usr/bin/smarthome-edge
scp prod/relay-server/config/config.json root@192.168.1.1:/etc/smarthome-edge.json

# Start service via procd
ssh root@192.168.1.1
chmod +x /usr/bin/smarthome-edge
/usr/bin/smarthome-edge -config /etc/smarthome-edge.json &
```
Test that the local dashboard is live at **`http://192.168.1.1:9200`**.

### Step 2: Start Central Server on Windows / Linux PC
```powershell
# Navigate to production directory
cd prod/central-server

# Install production dependencies
npm install --omit=dev

# Start production server
node --experimental-sqlite server.js
```
Or double-click **`run.bat`** (Windows) or execute **`./run.sh`** (Linux).

### Step 3: Verify Bidirectional Synchronization
Check that the Central Server received the edge snapshot and offline event spool:
```powershell
Invoke-RestMethod -Uri "http://localhost:9100/api/v1/system/sync-status"
```
Expected output:
```json
{
  "success": true,
  "sync": {
    "connected": true,
    "last_snapshot_epoch": 1795719137,
    "total_snapshots": 1,
    "stored_events_count": 25
  }
}
```

### Step 4: Open Central Dashboard & PWA
Open your browser at **`http://localhost:9100`**:
- Check **Home Electrical Load Strip**: Verify Today's kWh, active wattage, and voltage.
- Check **Smart Breaker -> ⚡ Energy Analytics & kWh**: Verify 24-hour continuous timeline and period mean metrics.
- Check **Rooms & Homes**: Test 2D Architectural Blueprint and 3D Isometric stages.
- Install as a **Progressive Web App (PWA)** on your mobile phone via the browser address bar icon.

---

## 🔒 Safety Interlocks
- **Tuya Smart Circuit Breaker**: The smart circuit breaker (`NODE-30487DE85D5C` at `192.168.1.25`) is locked in energized closed contact mode (`DP 108`). It must stay protected and never be actuated by automated scripts or batch testing.
