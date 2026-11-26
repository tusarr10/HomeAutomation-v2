# SmartHome Quick Relay Control & Pin Sync Audit

**Date**: November 27, 2026  
**Audience**: System Administrator & Maintenance Engineering  
**Applies To**: 
- **Relay Server (Edge Router Gateway)**: `http://192.168.1.2:9200` (`smarthome-edge` on OpenWrt MT7986A ARM64)
- **Central Server (Command Center)**: `http://192.168.1.10:9100` (Node.js Express + SQLite)
- **Source Paths**:
  - `central-server/public/assets/app.js`
  - `prod/central-server/public/assets/app.js`
  - `relay-server/web/assets/app.js`
  - `prod/relay-server/web/assets/app.js`

---

## 1. Overview of Issues Identified

### Issue A: Offline Node Relays Displayed in Quick Control
- **Symptom**: When visiting the dashboard's **Relay Control (Quick)** card, switches for offline nodes (such as `NODE-BCDDC223386C` or `NODE-68C63AF67479`) were rendered alongside live devices. Actuating these switches would cause command timeouts or errors because the physical hardware was unreachable.
- **Root Cause**: `getFilteredQuickRelays()` previously only excluded sensor channels (`isSensorChannel(r)`). It did not cross-reference the relay's parent node against `dashFleetNodes` to inspect its connection state (`parentNode.is_online`).

### Issue B: Home Dropdown Count Mismatch & Text Corruption
- **Symptom**: When selecting a different home from the **Home** dropdown (e.g. switching from "All Homes" to a specific home), the "All Homes" `<option>` label would be overwritten with the count of the newly selected home (e.g., displaying `All Homes (0)` instead of preserving total available relays). Additionally, specific home dropdown options did not show per-home counts initially.
- **Root Cause**: `onQuickRelayHomeChange()` executed `opt.textContent = 'All Homes (' + getFilteredQuickRelays().length + ')'`, which evaluated `getFilteredQuickRelays()` *after* `quickRelaySelectedHome` had already been changed to the selected home.

### Issue C: Room Appliances Pin Sync Overcount ("Room Appliances (9)")
- **Symptom**: In the **Rooms & Homes** view, Living Room / Dining showed `Room Appliances (9)` despite only 4-5 active switchable appliances actually existing.
- **Root Cause**: 
  1. Stale / deleted GPIO pins (pins 1, 5, 7, 8 on `NODE-8C4F00565D72`) remained in the SQLite database `relays` table.
  2. The room appliance filter had a fallback clause `if (parentNode.room_id === room.id) return true;` that bypassed channel-level room assignments, causing channels belonging to Dining (`Balcony Exhaust Fan`) and Shared Utilities (`Mains Voltage ADC`) to be aggregated into Living Room.

### Issue D: Quick Relay Consecutive Toggle Failure (Second Click Without Refresh)
- **Symptom**: After clicking a relay button in **Relay Control (Quick)** (e.g. `PCF Relay 4` from `OFF` to `ON`), clicking it a second time would NOT toggle it back to `OFF` unless the page was refreshed.
- **Root Cause**: 
  1. In `updateRelayUiState()`, `qbtn.className` and `qbtn.textContent` were updated, but `qbtn.setAttribute('onclick', ...)` was omitted. Consequently, the inline `onclick` handler remained stuck with the stale parameter (e.g. `onclick="toggleRealQuickRelay('NODE...', 4, false)"`).
  2. In `toggleRealQuickRelay()`, `nextState = !currentState` was blindly calculated from the caller's argument without inspecting the live DOM or in-memory state. Consecutive clicks repeatedly re-sent `state: true`.

---

## 2. Technical Fixes Implemented

### 2.1 Online-Only Node Filter for Quick Relay Control
In `getFilteredQuickRelays()` and `getOnlineQuickRelaysCount()`, we added an explicit node-presence and online-status check:

```javascript
// 1. Exclude sensors so relay control strictly displays switchable actuators & breakers
list = list.filter(r => {
  if (typeof isSensorChannel === 'function' && isSensorChannel(r)) return false;
  return true;
});

// 2. Strictly filter to ONLY relays belonging to ONLINE nodes or active breaker
list = list.filter(r => {
  const parentNode = (dashFleetNodes || []).find(n => n.node_id === r.node_id);
  if (!parentNode) {
    const isBreaker = (r.function && r.function.toLowerCase().includes('breaker')) ||
                      (r.name && r.name.toLowerCase().includes('circuit breaker')) ||
                      (r.node_id && r.node_id.includes('30487D'));
    return isBreaker;
  }
  return Boolean(parentNode.is_online ?? parentNode.isOnline ?? (parentNode.status && parentNode.status.toLowerCase() === 'online'));
});
```

> [!NOTE]
> **Breaker Safety**: The Mains Circuit Breaker (Tuya direct feeder) does not have a traditional ESP8266 `node_id` in `dashFleetNodes`. The filter explicitly recognizes breaker channels and keeps them visible so critical mains telemetry and status remain accessible.

### 2.2 Independent Per-Home Online Count Calculation
Added `getOnlineQuickRelaysCount(homeId)` to evaluate the exact number of online relays in any home scope without mutating or relying on global pagination state:

```javascript
function getOnlineQuickRelaysCount(homeId) {
  let list = (dashFleetRelays || []).slice();
  list = list.filter(r => !(typeof isSensorChannel === 'function' && isSensorChannel(r)));
  list = list.filter(r => {
    const parentNode = (dashFleetNodes || []).find(n => n.node_id === r.node_id);
    if (!parentNode) {
      return (r.function && r.function.toLowerCase().includes('breaker')) ||
             (r.name && r.name.toLowerCase().includes('circuit breaker')) ||
             (r.node_id && r.node_id.includes('30487D'));
    }
    return Boolean(parentNode.is_online ?? parentNode.isOnline ?? (parentNode.status && parentNode.status.toLowerCase() === 'online'));
  });

  if (homeId && homeId !== 'all') {
    const targetHomeId = Number(homeId);
    const targetHome = (dashFleetHomes || []).find(h => h.id === targetHomeId);
    const homeName = targetHome ? (targetHome.name || '').toLowerCase() : '';

    list = list.filter(r => {
      const parentNode = (dashFleetNodes || []).find(n => n.node_id === r.node_id);
      if (parentNode && parentNode.home_id === targetHomeId) return true;
      if (homeName && r.room && r.room.toLowerCase().includes(homeName)) return true;
      if (targetHomeId === 1 && (!parentNode || !parentNode.home_id)) return true;
      return false;
    });
  }

  return list.length;
}
```

### 2.3 Dropdown Selector Template & Dynamic Updates
Updated `updateQuickRelayHomeDropdownCounts()` and the initial HTML template:
- Initial render:
  ```html
  <select id="quick-relay-home-select" class="filter-select" onchange="onQuickRelayHomeChange(this.value)">
    <option value="all" ${quickRelaySelectedHome === 'all' ? 'selected' : ''}>All Homes (${getOnlineQuickRelaysCount('all')})</option>
    ${dashFleetHomes.map(h => `<option value="${h.id}" ${quickRelaySelectedHome == h.id ? 'selected' : ''}>${escapeHtml(h.name)} (${getOnlineQuickRelaysCount(h.id)})</option>`).join('')}
  </select>
  ```
- Dynamic updates when switching homes:
  `updateQuickRelayHomeDropdownCounts()` refreshes each option's label dynamically without overwriting "All Homes".

### 2.4 Friendly Empty State Message
If a home has no online devices or relays, the grid renders a clear status message:
```html
<div style="grid-column: span 2; padding: 32px; text-align: center; color: #64748b; font-size: 12px;">
  <span style="font-size: 20px; display: block; margin-bottom: 6px;">🔌</span>
  No active relay channels available for currently online devices in this home.
</div>
```

### 2.5 Database Pin Synchronization
Stale pins 1, 5, 6, 7, 8 were purged from the Central Server SQLite database (`fleet.db`):
```sql
DELETE FROM relays 
WHERE node_id = 'NODE-8C4F00565D72' 
  AND channel_id NOT IN (2, 3, 4, 9, 10, 11, 12);
```
Verified against physical LittleFS `/api/gpio` on ESP8266 node `NODE-8C4F00565D72`:
- Active channels: 2 (`L-Fan`), 3 (`Tube Light`), 4 (`Ceiling Fan`), 9 (`Balcony Exhaust Fan`), 10 (`Chandelier Ambient Light`), 11 (`Night Light`), 12 (`Mains Voltage ADC`).

### 2.6 Dynamic State Resolution & Dynamic Inline Onclick Updates
To guarantee continuous and instant toggling without page refresh:
1. In `updateRelayUiState()`:
   ```javascript
   const qbtn = document.getElementById(`quick-relay-btn-${nodeId}-${channelId}`);
   if (qbtn) {
     qbtn.className = `dash-relay-toggle-btn ${boolState ? 'btn-on' : 'btn-off'}`;
     qbtn.textContent = boolState ? 'ON' : 'OFF';
     qbtn.setAttribute('onclick', `toggleRealQuickRelay('${nodeId}', ${channelId}, ${boolState})`);
   }
   ```
2. In `toggleRealQuickRelay()`:
   Dynamically inspect the live DOM button (`classList.contains('btn-on')`) and in-memory cache to resolve `effectiveCurrentState`. This ensures that even if rapid clicks occur before an animation completes, the calculation `nextState = !effectiveCurrentState` is always correct and never gets desynchronized.

---

## 3. Deployment & Verification Matrix

| Target | IP / Port | File Deployed | Live Verification Status |
| :--- | :--- | :--- | :--- |
| **Relay Server (OpenWrt Router)** | `192.168.1.2:9200` | `/mnt/web_apps/smarthome-edge/web/assets/app.js` | **Deployed & Verified** (HTTP 200, online relays filter active) |
| **Central Server (Host Windows)** | `192.168.1.10:9100` | `central-server/public/assets/app.js`<br>`prod/central-server/public/assets/app.js` | **Live & Verified** (HTTP 200, online relays filter active) |

---

## 4. Maintenance Guide for Future Tracking

1. **Adding New Nodes**: When a new ESP8266 or ESP32 node boots, it registers with the Relay Server. Its relays will automatically appear in **Relay Control (Quick)** as soon as `parentNode.is_online === true`.
2. **If a Device goes Offline**: Its channels are automatically hidden from **Relay Control (Quick)**, preventing user confusion from phantom actuation attempts. The device remains visible in **Device Status (ESP Nodes)** marked as `Offline`.
3. **If Pins are Changed on Hardware**: Run the sync endpoint or verify LittleFS `/api/gpio` matches `relays` table entries in `fleet.db`. Never keep orphan pin records for deleted hardware relays.
