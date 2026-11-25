# Central Server Integration TODO & Examples (`central-server/`)

Synced against **`node-firmware/` v1.6.0 (`esp8266_4m` & `nodemcu_pcf8574`)**.  
All node-side `P0` / `P1` / `P2` items are now implemented and verified live on `NODE-8C4F00565D72`. This document tracks the remaining **Central Server (`central-server/`)** enhancements needed to unlock end-to-end real-time telemetry, AC RMS / DC voltage monitoring, IR event triggers, and unified command orchestration, along with ready-to-use code examples.

---

## Priority Checklist

### P0 — Telemetry Ingestion & Real-Time Sensor Events
- [x] **Handle `eventType === "sensor_event"` & forward `sensors[]` in `src/nodeManager.js`** *(Implemented & Verified)*
  - **Status:** `nodeManager.js` ingests `data.sensors[]`, persists `dcVoltage`, `acRms`, `rawAdc`, and forwards `sensors` and `sensorEvent` via WebSocket `telemetry_update` and `sensor_event`.
- [x] **Normalize `VOLTAGE_ADC` vs `VOLTAGE` & Persist `acRms` / `dcVoltage`** *(Implemented & Verified)*
  - **Status:** Normalized in `database.js` (`upsertRelayFromChannel`), `nodeManager.js`, and `public/assets/app.js` (tooltips and badges for AC RMS & DC Voltage).

### P1 — Command Dispatch & Onboarding Upgrades
- [x] **Expose Unified Node Actions (`send_ir`, `configure_pin`, `read_sensor`) in Central Dispatch & UI** *(Implemented & Verified)*
  - **Status:** Added `POST /api/v1/nodes/:nodeId/read-sensor` and updated `dispatchCommand` in `nodeManager.js` to dispatch `read_sensor`, `send_ir`, and `configure_pin` directly with `X-Server-Key` authentication.
- [x] **Verify Direct Node LittleFS Save Fallback (`POST /api/fs/save-content`)** *(Implemented & Verified)*
  - **Status:** Implemented in `src/littlefsService.js` with direct fast-path (`<= 5KB`) to `POST /api/fs/save-content`, verified live with `directFastPath: true`.

### P2 — Dashboard UX & Fleet Polish
- [x] **Add Dedicated Sensors & Telemetry Tab & Decouple from Relay Actuators** *(Implemented & Verified)*
  - **Status:** Added dedicated `📡 Sensors & Telemetry` sidebar navigation tab and view module (`loadSensors()`, `renderSensorsView()`). Separated relay actuators (controllable switches) from sensor inputs (`VOLTAGE`, `IR_RECEIVER`, `IR_TRANSMITTER`, etc.). In Relays view, relays are presented as toggles, and sensors are grouped in a dedicated telemetry section. In Sensors view, channels show live voltage/IR badges, instant `🚀 Read` buttons, `⚙ Configure` calibration controls, and sub-views (By Device, By Room, By Sensor Type, and Sensor Pins Matrix).
- [x] **Add AC RMS vs DC Mode Toggle in Channel Editor (`configure_pin`)** *(Implemented & Verified)*
  - **Status:** Added `Analog Sampling Mode (A0 / ADC)` dropdown to Pin Configuration modal in `public/assets/app.js` with `⚡ AC RMS Voltage` and `🔋 DC Voltage` modes.
- [x] **Real-Time IR Learned Code Toast & Auto-Bind Flow** *(Implemented & Verified)*
  - **Status:** Added `handleRealtimeIrEvent` in `public/assets/app.js` listening for WebSocket sensor events to instantly populate learned IR codes and display toasts.

---

## Bugs & Follow-Up Fixes Found During Verification (Commit `83f2954`)

- [x] **Fix `showToast(...)` String Signature Mismatch in `public/assets/app.js` (`L695`, `L3855`)** *(Implemented & Verified)*
  - **Status:** Made `showToast(notif, optSeverity, optCategory, optTitle)` polymorphic so both structured objects `{ title, message, severity, category }` and plain strings `showToast(msg, 'success')` render with proper icons, titles, and styles. Updated `handleRealtimeIrEvent` and `saveRelayChannelConfig` call sites.
- [x] **Fix `updatePinSensorReading()` Calibration Wipe & `OR pin = ?` Collision in `src/database.js` (`L1518–L1546`)** *(Implemented & Verified)*
  - **Status:** Fixed in both `database.js:updatePinSensorReading` and `database.js:upsertRelayFromChannel`. Merges incoming telemetry metrics into the existing `sensor_config_json` without overwriting user-configured calibration (`interval_ms`, `multiplier`, `offset`, `voltage_mode`). Added `byPin` boolean parameter to eliminate cross-channel namespace collisions. Verified live: user calibration on CH12 remained intact after live telemetry push.
- [x] **Fix `sendDirectLanHttp()` `401` Retry Path in `src/nodeManager.js` (`L845–L865`)** *(Implemented & Verified)*
  - **Status:** On HTTP 401 from `/api/commands/execute`, `nodeManager.sendDirectLanHttp` re-authenticates and retries `/api/commands/execute`, only falling back to `/api/gpio/state` if the action is a relay state change (`setState`, `toggle`). Verified live with `read_sensor` executing directly via LAN HTTP.
- [x] **Auto-Refresh Relays / Sensor Badges on WebSocket `telemetry_update` in `public/assets/app.js` (`L619–L627`)** *(Implemented & Verified)*
  - **Status:** Added `updateRelaysViewTelemetrySilently(data)` to update in-memory `fleetData.relays` and perform targeted DOM updates on `<td id="sensor-reading-${nodeId}-${channelId}">` for live AC RMS / DC voltages and IR strings with zero screen flicker and zero input focus loss.
- [x] **Operational Check: Enable Telemetry Push on `NODE-8C4F00565D72` (`192.168.1.28`)** *(Configured & Live-Verified)*
  - **Status:** Configured receiver on physical node (`192.168.1.28`) pointing to `192.168.1.10:2000` via TCP. Fixed `strVal` typo in `nodeManager.js:488`. Tested `POST /api/receiver/push`: telemetry successfully delivered to port 2000 and ingested into SQLite database with 200 OK.

---

## Integration Examples

### 1. Ingesting `sensor_event`, `sensors[]`, and `acRms` / `dcVoltage` in `src/nodeManager.js`

```javascript
// Inside NodeManager.ingestTelemetry(data) after channel sync:
const eventType = data.eventType || 'heartbeat';

if (Array.isArray(data.sensors)) {
  for (const s of data.sensors) {
    const channelId = Number(s.channel_id ?? s.id);
    if (!Number.isFinite(channelId)) continue;

    // Persist numeric reading (prefers primary value, keeps raw/AC metadata in strValue or sensor cache)
    const numVal = typeof s.value === 'number' ? s.value : Number(s.value || 0);
    let strVal = s.strValue || s.code || null;

    if (s.type === 'VOLTAGE_ADC') {
      const dc = Number(s.dcVoltage ?? s.value ?? 0).toFixed(3);
      const rms = Number(s.acRms ?? 0).toFixed(3);
      strVal = `DC ${dc}V | AC ${rms}V (ADC ${s.rawAdc ?? 0})`;
    } else if (s.type === 'PIR_MOTION' || s.type === 'DOOR_SENSOR') {
      strVal = numVal ? 'ACTIVE' : 'IDLE';
    }

    this.db.updateSensorReading(nodeId, channelId, {
      value: numVal,
      strValue,
      unit: s.unit || '',
      meta: {
        dcVoltage: s.dcVoltage,
        acRms: s.acRms,
        rawAdc: s.rawAdc,
        protocol: s.protocol,
        code: s.code,
      },
    });
  }
}

// Instant event payload when eventType === 'sensor_event' (e.g., IR capture or PIR/Door edge)
const sensorEvent =
  eventType === 'sensor_event'
    ? {
        sensor_type: data.sensor_type || null,
        pin: data.pin ?? null,
        channel_id: data.channel_id ?? null,
        ir_code: data.ir_code || null,
        ir_protocol: data.ir_protocol || null,
      }
    : null;

this.broadcast('telemetry_update', {
  node_id: nodeId,
  nodeId,
  name: nodeName,
  ip: data.ip,
  rssi: data.rssi,
  uptime_sec: data.uptimeSec || data.uptime_sec,
  free_heap: data.freeHeap || data.free_heap,
  hardware: data.hardware || 'ESP8266',
  channels: data.channels || [],
  sensors: data.sensors || [],
  sensorEvent,
  pcf8574: expanderInfo,
  eventType,
  timestamp: data.timestamp,
});
```

### 2. Dispatching `send_ir`, `configure_pin`, and `read_sensor` Commands

```javascript
// Direct HTTP execution or queued TCP response command to a node:

// A) Transmit IR (via Central Server or Node HTTP /api/commands/execute)
await nodeManager.dispatchCommand(nodeId, {
  action: 'send_ir',
  protocol: 'NEC',
  hexCode: '0x20DF10EF',
  bits: 32,
  repeat: 0,
  pin: 13, // optional; defaults to node's configured IR TX pin (D7 / GPIO13)
});

// B) Configure channel / switch A0 between DC and AC RMS mode
await nodeManager.dispatchCommand(nodeId, {
  action: 'configure_pin',
  id: 12,
  name: 'Mains AC Sense',
  room: 'Mains',
  function: 'AC RMS Voltage', // "ac" or "rms" instructs node to report acRms as primary value
  enabled: true,
});

// C) On-demand live sensor read
const readRes = await fetch(`http://${nodeIp}/api/commands/execute`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Server-Key': pairedServerKey,
  },
  body: JSON.stringify({
    commandId: crypto.randomUUID(),
    action: 'read_sensor',
    id: 12, // omit or 0 to return all active sensors
  }),
}).then((r) => r.json());
// readRes.sensor -> { id: 12, type: "VOLTAGE_ADC", value: ..., dcVoltage: ..., acRms: ..., rawAdc: ... }
```

### 3. Configuring Node Telemetry Receiver Using Compact `"server": "host:port"`

```javascript
await fetch(`http://${nodeIp}/api/receiver`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Server-Key': pairedServerKey,
  },
  body: JSON.stringify({
    enabled: true,
    server: '192.168.1.10:2000', // automatically parsed into serverHost + serverPort
    protocol: 0,                 // 0 = Raw TCP JSON, 1 = HTTP POST
    reportIntervalSec: 30,
    sendOnStateChange: true,
    authToken: nodeToken,
  }),
});
```

### 4. Rendering `VOLTAGE_ADC` (`dcVoltage` + `acRms` + `rawAdc`) in `public/assets/app.js`

```javascript
if (r.sensor_type === 'VOLTAGE' || r.sensor_type === 'VOLTAGE_ADC' || r.function?.toLowerCase().includes('voltage')) {
  const dc = r.sensor_meta?.dcVoltage ?? r.last_sensor_value;
  const rms = r.sensor_meta?.acRms;
  const badgeText = rms != null && rms > 0.01
    ? `⚡ AC ${Number(rms).toFixed(2)}V | DC ${Number(dc ?? 0).toFixed(2)}V`
    : `⚡ ${dc != null ? Number(dc).toFixed(3) : '--'} V`;
  liveControlHtml = `<span style="font-weight:700;color:#f59e0b;font-family:monospace;font-size:11px;background:rgba(245,158,11,0.12);padding:3px 8px;border-radius:6px;border:1px solid rgba(245,158,11,0.3);">${badgeText}</span>`;
}
```
