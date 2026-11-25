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
- [x] **Add AC RMS vs DC Mode Toggle in Channel Editor (`configure_pin`)** *(Implemented & Verified)*
  - **Status:** Added `Analog Sampling Mode (A0 / ADC)` dropdown to Pin Configuration modal in `public/assets/app.js` with `⚡ AC RMS Voltage` and `🔋 DC Voltage` modes.
- [x] **Real-Time IR Learned Code Toast & Auto-Bind Flow** *(Implemented & Verified)*
  - **Status:** Added `handleRealtimeIrEvent` in `public/assets/app.js` listening for WebSocket sensor events to instantly populate learned IR codes and display toasts.

---

## Bugs & Follow-Up Fixes Found During Verification (Commit `83f2954`)

- [ ] **Fix `showToast(...)` String Signature Mismatch in `public/assets/app.js` (`L695`, `L3855`)**
  - **Problem:** `showToast(notif)` (`L378–L403`) expects an object `{ title, message, severity, category }` and ignores any 2nd parameter. Both `handleRealtimeIrEvent()` (`L695`: `showToast(\`📡 IR Signal Received...\`, 'info')`) and `saveRelayChannelConfig()` (`L3855`: `showToast(data.message || 'Pin configured successfully', 'success')`) pass a string instead, causing toasts to display title **`Notification`** with an **empty body**.
  - **Fix:** Pass structured toast objects, e.g.:
    ```javascript
    showToast({ title: '📡 IR Signal Received', message: `${code} (${protocol}) from ${nodeId}`, severity: 'INFO', category: 'IR' });
    showToast({ title: 'Pin Configured', message: data.message || 'Pin configured successfully', severity: 'SUCCESS', category: 'PIN' });
    ```

- [ ] **Fix `updatePinSensorReading()` Calibration Wipe & `OR pin = ?` Collision in `src/database.js` (`L1518–L1546`)**
  - **Problem 1 (Config Wipe):** Updating `sensor_config_json = JSON.stringify(meta)` overwrites `sensor_config_json` with `{ dcVoltage, acRms, rawAdc, protocol, code }` on every heartbeat/telemetry packet, wiping user-saved `interval_ms`, `multiplier`, `offset`, `ir_protocol`, and `voltage_mode` configured in the Pin Modal (`app.js:3824–3830`).
  - **Problem 2 (`OR pin = ?` Cross-Channel Overwrite):** `WHERE node_id = ? AND (channel_id = ? OR pin = ?)` mixes `channel_id` and `pin` namespaces. For example, telemetry from `A0` on `CH 12` (GPIO `17`) also overwrites any channel wired to `GPIO 12` (`D6`).
  - **Fix:** Merge `meta` into the existing parsed `sensor_config_json` object before persisting, and add an explicit `byPin = false` parameter so channel-based calls match strictly on `channel_id = ?` while pin-only fallbacks (`nodeManager.js:511, 524`) match `pin = ?` only when `channel_id` is absent.

- [ ] **Fix `sendDirectLanHttp()` `401` Retry Path in `src/nodeManager.js` (`L845–L865`)**
  - **Problem:** When `POST /api/commands/execute` returns `401` (e.g., stale cached Bearer token on an unpaired node), `L859–L865` calls `authenticateNode(ip)` and retries **`/api/gpio/state`** instead of retrying **`/api/commands/execute`**. This causes `read_sensor`, `send_ir`, and `configure_pin` commands to fail after re-authentication.
  - **Fix:** Retry `makeRequest('/api/commands/execute', command, token)` after `authenticateNode(ip)` before falling back to `/api/gpio/state` for relay `setState`/`toggle` only.

- [ ] **Auto-Refresh Relays / Sensor Badges on WebSocket `telemetry_update` in `public/assets/app.js` (`L619–L627`)**
  - **Problem:** Incoming `telemetry_update` / `sensor_telemetry` frames only call `updateOverviewTelemetrySilently()` when `currentView === "overview"`. Live `AC | DC` voltage badges and IR/sensor strings on the Relays / Pin Matrix view stay stale until manual tab switch or page reload.
  - **Fix:** Refresh relay/sensor badge DOM nodes (or call `loadRelays()` throttled) when `currentView === "relays"` and `telemetry_update` / `sensor_telemetry` arrives.

- [ ] **Operational Check: Enable Telemetry Push on `NODE-8C4F00565D72` (`192.168.1.28`)**
  - **Observed:** Live `GET http://192.168.1.28/api/receiver` reports `"enabled": false` (`"serverHost": "192.168.1.10"`, `"serverPort": 2000`, `"packetsSent": 0`). Push config from Central Server (`Nodes -> Push Config`) or enable on node `/api/receiver` to activate real-time `sensor_event` pushes to `192.168.1.10:2000`.

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
