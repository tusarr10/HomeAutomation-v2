const { DatabaseSync } = require('node:sqlite');

const cDb = new DatabaseSync('d:/ai/HomeAutomation v2/central-server/data/fleet.db');
const rDb = new DatabaseSync('d:/ai/HomeAutomation v2/relay-server/data/fleet_edge.db');

// 1. Sync energy_settings
const settings = cDb.prepare('SELECT * FROM energy_settings').all();
console.log('Central Settings to sync:', settings);

const insertSetting = rDb.prepare(`
  INSERT INTO energy_settings (key, value, updated_at)
  VALUES (?, ?, datetime('now', 'localtime'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

for (const s of settings) {
  insertSetting.run(s.key, String(s.value));
}

// 2. Sync energy_history
const centralHistory = cDb.prepare('SELECT * FROM energy_history ORDER BY id ASC').all();
console.log(`Central History count: ${centralHistory.length}`);

const insertHistory = rDb.prepare(`
  INSERT INTO energy_history (
    timestamp, node_id, source, voltage_v, current_a, power_w,
    power_factor, frequency_hz, total_energy_kwh, delta_energy_kwh,
    leakage_current_ma, temperature_c, interval_type
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Delete any previous fake/seed snapshots
rDb.exec('DELETE FROM energy_history');

for (const h of centralHistory) {
  insertHistory.run(
    h.timestamp,
    h.node_id,
    h.source || 'tuya_breaker',
    h.voltage_v,
    h.current_a,
    h.power_w,
    h.power_factor || 0.92,
    h.frequency_hz || 50.0,
    h.total_energy_kwh,
    h.delta_energy_kwh,
    h.leakage_current_ma || 0,
    h.temperature_c || 28,
    h.interval_type || 'raw'
  );
}

const rCount = rDb.prepare('SELECT count(*) as c FROM energy_history').get().c;
console.log(`Relay DB updated! Total energy_history rows in fleet_edge.db: ${rCount}`);

const rSettings = rDb.prepare('SELECT * FROM energy_settings').all();
console.log('Relay DB updated energy_settings:', rSettings);
