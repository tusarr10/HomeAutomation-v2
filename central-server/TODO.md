# Central Server Integration TODO & Examples (`central-server/`)

Synced against **`node-firmware/` v1.6.0 (`esp8266_4m` & `nodemcu_pcf8574`)**.  
All node-side `P0` / `P1` / `P2` items are now implemented and verified live on `NODE-8C4F00565D72`. This document tracks the remaining **Central Server (`central-server/`)** enhancements needed to unlock end-to-end real-time telemetry, AC RMS / DC voltage monitoring, IR event triggers, and unified command orchestration, along with ready-to-use code examples.

---

## Priority Checklist

### P0 — Telemetry Ingestion & Real-Time Sensor Events
- [ ] **Handle `eventType === "sensor_event"` & forward `sensors[]` in `src/nodeManager.js`**
  - **Gap observed:** `nodeManager.js` (`L505–L517`) broadcasts `telemetry_update` with `channels` and `pcf8574`, but does **not** forward `data.sensors`, `data.sensor_type`, `data.pin`, `data.channel_id`, `data.ir_code`, or `data.ir_protocol`.
  - **Action:** When ingesting node telemetry (`ingestTelemetry` / TCP receiver), upsert `data.sensors[]` values (`value`, `dcVoltage`, `acRms`, `rawAdc`, `code`, `protocol`), include `sensors: data.sensors || []` and `sensorEvent` metadata inside the `telemetry_update` WebSocket broadcast, and emit notifications/rule triggers when `eventType === "sensor_event"`.

- [ ] **Normalize `VOLTAGE_ADC` vs `VOLTAGE` & Persist `acRms` / `dcVoltage`**
  - **Gap observed:** `public/assets/app.js` (`L3345`, `L3376`) checks `r.sensor_type === 'VOLTAGE'`, whereas the node reports `type: "VOLTAGE_ADC"` with both `dcVoltage`, `acRms`, and `rawAdc` (plus `value` selected by channel function name containing `"ac"` or `"rms"`).
  - **Action:** Treat `VOLTAGE_ADC` identically to `VOLTAGE` in UI badges/controls and persist/display `dcVoltage`, `acRms`, and `rawAdc`.

### P1 — Command Dispatch & Onboarding Upgrades
- [ ] **Expose Unified Node Actions (`send_ir`, `configure_pin`, `read_sensor`) in Central Dispatch & UI**
  - **Context:** Nodes now natively support `send_ir`, `configure_pin`, and `read_sensor` via both `POST /api/commands/execute` (HTTP) and `send_ir` in the async TCP telemetry ACK command queue (`ReceiverClient::processServerCommands`).
  - **Action:** Add helper routes/buttons in `src/routes/v1Router.js` and `public/assets/app.js` to invoke `send_ir` (especially for sleeping/NAT nodes via telemetry queue) and `read_sensor` on-demand refresh.

- [ ] **Verify Direct Node LittleFS Save Fallback (`POST /api/fs/save-content`)**
  - **Context:** `public/assets/app.js` (`L7144`) calls `POST /api/nodes/:nodeId/fs/save-content`. The node now exposes native `POST /api/fs/save-content` (`<= 5KB` JSON `{ path, content }`).
  - **Action:** Route `central-server` save-content calls directly to `/api/fs/save-content` when the file is `<= 5120` bytes instead of building multipart form uploads on the ESP8266.

### P2 — Dashboard UX & Fleet Polish
- [ ] **Add AC RMS vs DC Mode Toggle in Channel Editor (`configure_pin`)**
  - Let users name or tag analog A0 channels with `"AC RMS"` vs `"DC Voltage"` (`function`), immediately switching `value` calculation on the node while keeping both `dcVoltage` and `acRms` visible in tooltips.
- [ ] **Real-Time IR Learned Code Toast & Auto-Bind Flow**
  - Subscribe to WebSocket `telemetry_update` frames where `eventType === "sensor_event"` and `sensorEvent.sensor_type === "IR_RECEIVER"` so Central Server's IR modal auto-populates `ir_code` + `ir_protocol` without polling `/api/ir/train/result`.

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
