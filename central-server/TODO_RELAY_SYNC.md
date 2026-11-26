# Central Server Relay Synchronization Integration Guide (`central-server/`)

> **Target File for Enhancements:** `central-server/src/routes/v1Router.js` & `central-server/src/nodeManager.js`  
> **Purpose:** Guides you through adding the backend endpoints and hooks on your Central Server to achieve seamless bidirectional synchronization with the **Go Relay Server (`smarthome-edge`)**.

---

## 📋 Integration Checklist for Central Server

### 1. Ingest Offline Replayed Events (`POST /api/v1/system/sync-events`) ✅ **COMPLETED & VERIFIED**
When the Central Server PC boots up after being powered off, the Relay Server automatically replays any state transitions, relay flips, or breaker trips that occurred while the PC was down.
- **Implementation Status:** Fully implemented in `src/routes/v1Router.js` and backed by SQLite Table 37 (`events`).
- **Live Verification:** Verified with 25 replayed offline events from `relay_edge_broker` automatically ingested upon server boot.

---

### 2. Ingest Edge Snapshot on PC Reconnect (`eventType === "edge_snapshot"`) ✅ **COMPLETED & VERIFIED**
When your Central PC powers on, the Relay Server sends an immediate `edge_snapshot` telemetry frame containing the live states of all online nodes and the circuit breaker so your Central Server dashboard reflects real-time status instantly.
- **Implementation Status:** Fully implemented in `src/nodeManager.js` (`processTelemetry`) and `src/tuyaBridge.js` (`updateReadingFromEdge`).
- **Live Verification:** Live edge state snapshot ingested and applied to fleet in real time on PC reconnect.

---

### 3. Ensure Master Configuration Endpoints Return Clean Payloads ✅ **COMPLETED & VERIFIED**
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
