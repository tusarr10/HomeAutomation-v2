# Central Server Feature Documentation & Actionable Roadmap (`central-server/`)

**Synced against:** Central Server v2.7.0 & Node Firmware v1.6.0 (`esp8266_4m` & `nodemcu_pcf8574`)  
**Target Systems:** Central Edge Server (`central-server/`), SQLite Database, Web Dashboard, and PWA  
**Status:** All core P0, P1, P2, and GUI/PWA milestone tasks completed & live-verified.

---

## 1. Feature Documentation: Recently Implemented Features

### 1.1 Progressive Web App (PWA) & Mobile/Tablet Optimization
- **PWA Manifest & Meta Tags:**
  - Added [`manifest.json`](public/manifest.json) with `standalone` display mode, `#0b0f19` theme colors, and multi-resolution maskable SVG/PNG icon support for native-like home screen installation on iOS and Android.
  - Added mobile viewport meta tags with `viewport-fit=cover`, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, and `theme-color` in [`index.html`](public/index.html).
- **Service Worker (`sw.js`):**
  - Implemented offline-resilient caching with a network-first fetch strategy in [`sw.js`](public/sw.js) for core assets (`/`, `/assets/style.css`, `/assets/app.js`, `/assets/logo.svg`, `/manifest.json`), while strictly bypassing dynamic API endpoints (`/api/*`) and WebSocket connections (`/ws`).
- **Off-Canvas Mobile Drawer Navigation:**
  - Built a slide-out sidebar drawer for viewports `<= 992px` triggered by a mobile hamburger menu button (`☰`).
  - Added a smooth animated dark backdrop overlay (`#sidebar-backdrop`) with tap-to-dismiss behavior.
  - Implemented automatic drawer auto-close upon tapping any navigation link in [`public/assets/app.js`](public/assets/app.js#L506-L515).
- **Condensed Mobile Topbar & Touch Targets:**
  - Condensed topbar metric badges on screens `<= 768px` to preserve screen real estate while keeping view title, notifications, and user avatar prominent.
  - Ensured minimum 40px–44px touch targets across all buttons, inputs, and segmented controls for touch devices (`@media (pointer: coarse)`).

---

### 1.2 Interactive 2D & 3D Room Management & Blueprint Stage
- **Homes & Rooms Hierarchy:**
  - Full relational database grouping: `Homes -> Rooms -> Nodes -> Relays/Sensors`.
  - Added cascading dropdowns when creating/editing rooms and adding devices: selecting a Home dynamically filters available Rooms; selecting a Node dynamically filters available Channels.
- **2D Architectural Blueprint Canvas:**
  - Realistic architectural blueprint view rendering walls, bay window, door swing arc, smart TV, AC unit, couch, coffee table, live glowing light bulbs, and animated spinning ceiling fans.
  - Proportional dynamic scaling via `transform: scale(calc((100vw - 44px) / 520))` ensuring zero horizontal overflow on smartphones down to 320px width.
- **3D Isometric Room Visualizer:**
  - Interactive 3D perspective stage with customizable rotation (`↺`, `↻`, `Reset`).
  - Proportional mobile scaling (`scale(0.68)`) preserving full 3D rotation and touch controls.
- **Home Mains & Floor Common Utilities Bar:**
  - Automatically surfaces home-level and floor-level common devices (Mains smart breaker, voltage sensors, common hallway switches) directly within any room GUI belonging to that home/floor.
- **Virtual IR Remote Dock & Appliances List:**
  - Automatically stacks beneath the canvas on mobile/tablet screens (`<= 1024px`) via responsive `.room-gui-main-split`.
  - Features dedicated D-Pad, Volume/Channel rockers, Power, Source, and Mute buttons communicating directly with ESP8266 IR transmitters.

---

### 1.3 Appliance Customization Modal & Relay Mapping
- **Direct Canvas Appliance Configuration:**
  - Tapping any appliance in Edit Mode (`[✏️ Edit Mode]`) or clicking its gear badge (`⚙️`) opens the `Configure Appliance & Relay` modal (`openEditRoomApplianceModal`).
  - **15+ Appliance Presets:** Light 💡, Chandelier 🏮, Lamp 🛋️, Ceiling Fan 🌀, Exhaust Fan 💨, TV 📺, AC ❄️, Heater ♨️, Socket 🔌, Pump 🚰, Curtain/Gate 🚪, Doorbell 🔔, Breaker ⚡, Sensor 📊, IR 📡.
  - **25+ Quick Emoji Picker Pills** plus custom emoji/text icon input.
  - **Live Hardware Reassignment:** Dropdown to dynamically bind/unbind any appliance to any physical node and relay channel in the fleet.
- **Strict Clean Normal Mode:**
  - Setting gear icons (`⚙️`) and pencil edit tags (`✏️`) have `display: none !important;` in normal mode (even on hover), guaranteeing a pristine clean viewing and switching experience.

---

### 1.4 Tuya Smart Circuit Breaker Local LAN Integration
- **Isolated LAN Bridge:**
  - Direct integration on port 8085 with `NODE-30487DE85D5C` at `192.168.1.25`.
  - Real-time electrical telemetry polling: Voltage (V), Current (A), Active Power (kW), Frequency (Hz), Leakage Current (mA), and Internal Temperature (°C).
  - Strict software interlock safeguarding the breaker from accidental toggling during automation or batch operations.

---

## 2. Completed Priority Checklist

### P0 — Telemetry Ingestion & Real-Time Sensor Events
- [x] **Handle `eventType === "sensor_event"` & forward `sensors[]` in `src/nodeManager.js`** *(Verified)*
- [x] **Normalize `VOLTAGE_ADC` vs `VOLTAGE` & Persist `acRms` / `dcVoltage`** *(Verified)*
- [x] **Persist and emit live Tuya Circuit Breaker electrical metrics** *(Verified)*

### P1 — Command Dispatch, LittleFS & Hardware Control
- [x] **Expose Unified Node Actions (`send_ir`, `configure_pin`, `read_sensor`) in Central Dispatch & UI** *(Verified)*
- [x] **Direct Node LittleFS Fast-Path (`POST /api/fs/save-content`) for files `<= 5KB`** *(Verified)*
- [x] **Cascading Hardware Dropdown Filter in Device / Room Modals** *(Verified)*

### P2 — Dashboard UX, Room GUI & PWA
- [x] **Dedicated Sensors & Telemetry Tab & Decouple from Relay Actuators** *(Verified)*
- [x] **Interactive 2D Architectural Blueprint & 3D Isometric Room GUI** *(Verified)*
- [x] **In-Canvas Appliance Customization Modal (Icon, Type, Relay Assignment)** *(Verified)*
- [x] **Progressive Web App (PWA) Manifest, Service Worker & Mobile Off-Canvas Drawer** *(Verified)*
- [x] **Strict Clean Normal Mode vs Edit Mode in Room GUI** *(Verified)*

### P3 — Advanced Energy Analytics & Historical Reporting
- [x] **Task CS-F1: Long-Term Power & Energy Consumption Analytics (Hourly / Daily kWh)** *(Implemented & Verified)*
  - **Status:** Added `energy_history` and `energy_settings` SQLite tables with auto-downsampling. Implemented REST API (`GET /api/v1/analytics/energy/summary`, `GET /api/v1/analytics/energy/history`, `POST /api/v1/analytics/energy/settings`). Built interactive SVG bar charts (24h hourly, 7d/30d daily), KPI cards (Today kWh, Yesterday, Month-to-date, Projected budget), and dynamic tariff/budget editor modal in `app.js` and `style.css`. Verified with live browser testing.

---

## 3. Future Central Server Tasks & Roadmap (TODO)

### P3 — Advanced Energy Analytics & Safety Automation
- [ ] **Task CS-F2: Electrical Safety Alarm Triggers**
  - Add configurable threshold alerts in Automation engine for over-voltage (> 250V), under-voltage (< 190V), high leakage current (> 30mA), and power spikes.

### P4 — Floor Plan Importer & Custom Blueprints
- [ ] **Task CS-F3: Custom SVG / Floor Plan Image Upload**
  - Allow users to upload architectural SVG blueprints or JPG/PNG floor plans as room background.
  - Allow arbitrary freeform placement and scaling of appliance icons across multi-room apartments.
- [ ] **Task CS-F4: Multi-Room House Overview Canvas**
  - Top-level interactive floor map showing all rooms at once with aggregate room active-device counts and live status glows.

### P5 — Push Notifications & Access Control
- [ ] **Task CS-F5: Web Push Notifications (Push API)**
  - Implement Web Push in Service Worker (`sw.js`) for critical alarms (breaker trip, door sensor open, motion while away).
- [ ] **Task CS-F6: Granular Role-Based Room Permissions**
  - Restrict guest users to specific assigned rooms while preserving full administrative control for admin.
