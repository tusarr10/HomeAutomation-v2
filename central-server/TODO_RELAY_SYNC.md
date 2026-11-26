# Central Server Relay Synchronization Integration Guide (`central-server/`)

> **Target Files:** `central-server/src/routes/v1Router.js` & `central-server/src/nodeManager.js`  
> **Purpose:** Actionable instructions & verified code snippets for synchronizing **Central Server** with the **Go Relay Server (`smarthome-edge`)**.

---

## 📋 Integration Checklist & Exact Snippets for Central Server

- [ ] **1. Ingest Offline Replayed Events (`POST /api/v1/system/sync-events`)**
  - **Target:** `central-server/src/routes/v1Router.js` (inside `createV1Router`)
  - **Important Schema Note:** Use `db.logSystemEvent(...)` (`system_events` table) + `db.logAudit(...)` (there is no `events` table in `database.js`). Also keep `requirePermission(db, 'system:manage')` and have `smarthome-edge` pass `Authorization: Bearer <token>`.

```javascript
// POST /api/v1/system/sync-events - Ingests replayed offline events from Relay Server
router.post('/system/sync-events', requirePermission(db, 'system:manage'), (req, res) => {
  try {
    const { source, events } = req.body || {};
    if (!Array.isArray(events) || events.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    const srcLabel = source || 'relay_edge_broker';
    const ingestBatch = (batch) => {
      let count = 0;
      for (const evt of batch) {
        const nid = evt.nodeId || evt.node_id || 'SYSTEM';
        const evtType = evt.type || 'STATE_TRANSITION';
        const details = JSON.stringify({
          eventId: evt.eventId || '',
          source: srcLabel,
          timestamp: evt.timestamp,
          data: evt.data || {}
        });
        db.logSystemEvent(nid, evtType, 'INFO', details, 'SYNCED_FROM_EDGE');
        count++;
      }
      return count;
    };

    const count = (db.db && typeof db.db.transaction === 'function')
      ? db.db.transaction(ingestBatch)(events)
      : ingestBatch(events);

    db.logAudit('EDGE_EVENTS_SYNCED', 'System', `Ingested ${count} offline replayed event(s) from ${srcLabel}`);
    nodeManager.broadcast('fleet_update', { source: srcLabel, syncedEvents: count });
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

---

- [ ] **2. Ingest Edge Snapshot on PC Reconnect (`eventType === "edge_snapshot"`)**
  - **Target:** `central-server/src/nodeManager.js` (inside `processTelemetry(data, clientIp, protocol)`)
  - **Important Guard Note:** Handle `eventType === 'edge_snapshot'` **after** `expectedToken` validation and **before** `const nodeId = ...; if (!nodeId) return [];` — otherwise top-level snapshots without `data.nodeId` are silently dropped!

```javascript
// Inside NodeManager.processTelemetry(data, clientIp = '', protocol = 'TCP'):
// Place AFTER token validation and BEFORE `const nodeId = ...; if (!nodeId) return [];`
if (data.eventType === 'edge_snapshot') {
  return this.applyEdgeSnapshot(data);
}

// Add helper method on NodeManager:
async applyEdgeSnapshot(data) {
  const nowEpoch = Date.now() / 1000;
  let updatedNodes = 0;

  if (Array.isArray(data.nodes)) {
    for (const n of data.nodes) {
      const nid = n.nodeId || n.node_id;
      if (!nid) continue;
      const isOnline = Boolean(n.isOnline);
      this.db.setNodeOnline(nid, isOnline);
      if (isOnline) this.onlineNodesCache.set(nid, nowEpoch);

      if (Array.isArray(n.channels)) {
        for (const ch of n.channels) {
          const chId = Number(ch.channelId ?? ch.id);
          if (Number.isFinite(chId) && chId > 0) {
            this.db.updateRelayState(nid, chId, Boolean(ch.state));
          }
        }
      }
      updatedNodes++;
    }
  }

  if (data.breaker && data.breaker.reading && this.tuyaBridge?.syncToFleet) {
    await this.tuyaBridge.syncToFleet({
      config: data.breaker.config || {},
      reading: data.breaker.reading
    });
  }

  this.db.logAudit('EDGE_SNAPSHOT', 'System', `Applied edge_snapshot (${updatedNodes} nodes synced)`);
  this.db.logSystemEvent('System', 'EDGE_SYNC', 'INFO', `Edge snapshot applied for ${updatedNodes} node(s)`);
  this.broadcast('fleet_update', { source: 'edge_snapshot', nodeCount: updatedNodes, timestamp: data.timestamp || Date.now() });
  this.broadcast('telemetry_update', { source: 'edge_snapshot', eventType: 'edge_snapshot', nodes: data.nodes || [] });
  return [];
}
```

---

- [ ] **3. Loop-Prevention Guard (`source === "edge_broker"`) on Relay & Breaker Commands**
  - **Target:** `central-server/src/routes/v1Router.js` (`POST /relays/:nodeId/:channelId/command` and `POST /breaker/toggle`)
  - When `req.body.source === 'edge_broker'`, update `fleet.db` + broadcast `relay_state_confirmed` without re-dispatching hardware commands back to ESP8266/Tuya:

```javascript
// Shared helper inside createV1Router:
const syncEdgeRelayState = (nid, channel, nextState, msg) => {
  const curr = db.getRelay(nid, channel);
  const prev = curr ? Boolean(curr.current_state) : !nextState;
  db.updateRelayState(nid, channel, nextState);
  db.logRelayEvent(nid, channel, prev ? 1 : 0, nextState ? 1 : 0, 'EDGE_BROKER');
  db.logAudit(nextState ? 'PIN_ON' : 'PIN_OFF', nid, msg);
  nodeManager.broadcast('relay_state_confirmed', { node_id: nid, channel_id: channel, new_state: nextState });
};

// In POST /relays/:nodeId/:channelId/command:
if (req.body.source === 'edge_broker') {
  syncEdgeRelayState(nodeId, Number(channelId), Boolean(req.body.state), `Edge broker synced CH${channelId}`);
  return res.json({ success: true, syncedOnly: true, source: 'edge_broker', channelId: Number(channelId), state: Boolean(req.body.state) });
}

// In POST /breaker/toggle:
if (req.body?.source === 'edge_broker') {
  const breakerNodeId = nodeManager.tuyaBridge.nodeId || 'NODE-30487DE85D5C';
  syncEdgeRelayState(breakerNodeId, 1, Boolean(req.body.state), 'Edge broker synced breaker state');
  return res.json({ success: true, syncedOnly: true, source: 'edge_broker', state: Boolean(req.body.state) });
}
```

---

### 4. Ensure Master Configuration Endpoints Return Clean Payloads
The Relay Server pulls configuration from these existing endpoints on Central Server to maintain its local flash cache:

1. **`GET /api/v1/nodes`** — ensure `channels` array contains `id`, `pin`, `name`, `room`, and `function`.
2. **`GET /api/v1/homes`** — registered homes.
3. **`GET /api/v1/homes/:homeId/rooms`** — rooms assigned to the home.
4. **`GET /api/v1/automations`** — automation rules (`trigger`, `condition`, `action`, `enabled`).
