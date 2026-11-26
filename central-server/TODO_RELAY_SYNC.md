# Central Server Relay Synchronization Integration Guide (`central-server/`)

> **Target File for Enhancements:** `central-server/src/routes/v1Router.js` & `central-server/src/nodeManager.js`  
> **Purpose:** Guides you through adding the backend endpoints and hooks on your Central Server to achieve seamless bidirectional synchronization with the **Go Relay Server (`smarthome-edge`)**.

---

## 📋 Integration Checklist for Central Server

### 1. Ingest Offline Replayed Events (`POST /api/v1/system/sync-events`)
When the Central Server PC boots up after being powered off, the Relay Server automatically replays any state transitions, relay flips, or breaker trips that occurred while the PC was down.

**Add this route to `central-server/src/routes/v1Router.js`:**
```javascript
// POST /api/v1/system/sync-events - Ingests replayed offline events from Relay Server
router.post('/system/sync-events', (req, res) => {
  const { source, events } = req.body;
  if (!Array.isArray(events) || events.length === 0) {
    return res.json({ success: true, count: 0 });
  }

  console.log(`[Relay Syncer] Received ${events.length} offline events from ${source || 'Edge Broker'}`);

  const insertStmt = db.db.prepare(`
    INSERT INTO events (event_id, event_type, node_id, data_json, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  const tx = db.db.transaction((batch) => {
    let inserted = 0;
    for (const evt of batch) {
      try {
        const evtId = evt.eventId || `evt-relay-${Date.now()}-${inserted}`;
        const evtType = evt.type || 'STATE_TRANSITION';
        const nodeId = evt.nodeId || 'SYSTEM';
        const dataJson = JSON.stringify(evt.data || {});
        const ts = evt.timestamp || Math.floor(Date.now() / 1000);

        insertStmt.run(evtId, evtType, nodeId, dataJson, ts);
        inserted++;
      } catch (err) {
        // Skip duplicates if already ingested
      }
    }
    return inserted;
  });

  const count = tx(events);
  res.json({ success: true, count });
});
```

---

### 2. Ingest Edge Snapshot on PC Reconnect (`eventType === "edge_snapshot"`)
When your Central PC powers on, the Relay Server sends an immediate `edge_snapshot` telemetry frame containing the live states of all online nodes and the circuit breaker so your Central Server dashboard reflects real-time status instantly.

**Add this handler to `central-server/src/nodeManager.js` inside `ingestTelemetry(data)`:**
```javascript
// Inside NodeManager.ingestTelemetry(data):
if (data.eventType === 'edge_snapshot') {
  console.log('[Relay Syncer] Ingesting Edge live state snapshot...');
  
  // 1. Bulk update nodes and relay states
  if (Array.isArray(data.nodes)) {
    for (const node of data.nodes) {
      if (node.nodeId) {
        this.db.setNodeOnline(node.nodeId, Boolean(node.isOnline));
        if (Array.isArray(node.channels)) {
          for (const ch of node.channels) {
            this.db.updateRelayState(node.nodeId, ch.id, ch.state ? 1 : 0);
          }
        }
      }
    }
  }

  // 2. Update circuit breaker reading if included
  if (data.breaker && data.breaker.reading) {
    this.tuyaBridge?.updateReadingFromEdge?.(data.breaker.reading);
  }

  this.broadcast('fleet_update', { source: 'edge_snapshot' });
  return { status: 'ok', message: 'Edge snapshot applied' };
}
```

---

### 3. Ensure Master Configuration Endpoints Return Clean Payloads
The Relay Server pulls configuration from these existing endpoints on your Central Server to maintain its local flash cache:

1. **`GET /api/v1/nodes`**:
   - Returns array of registered fleet nodes.
   - Ensure `channels` array contains `id`, `pin`, `name`, `room`, and `function`.
2. **`GET /api/v1/homes`**:
   - Returns registered homes.
3. **`GET /api/v1/homes/:homeId/rooms`**:
   - Returns rooms assigned to the home.
4. **`GET /api/v1/automations`**:
   - Returns list of automation rules (`trigger`, `condition`, `action`, `enabled`).

---

### 4. Direct Relay Command Forwarding Hook
When a relay toggle is issued on the Relay Server UI or Mobile App, the Relay Server notifies Central Server at:
`POST /api/v1/relays/:nodeId/:channelId/command` with body `{"action": "setState", "state": true, "source": "edge_broker"}`.

Ensure that when `req.body.source === "edge_broker"`, the Central Server updates its local SQLite database (`fleet.db`) without re-dispatching duplicate hardware commands to avoid infinite command loops.
