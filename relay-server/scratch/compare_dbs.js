const { DatabaseSync } = require('node:sqlite');
const cDb = new DatabaseSync('d:/ai/HomeAutomation v2/central-server/data/fleet.db');
const rDb = new DatabaseSync('d:/ai/HomeAutomation v2/relay-server/data/fleet_edge.db');

const cTables = cDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
const rTables = rDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);

console.log("Central tables:", cTables);
console.log("Relay tables:", rTables);

for (const t of cTables) {
  if (t === 'sqlite_sequence') continue;
  try {
    const cCount = cDb.prepare(`SELECT count(*) as c FROM ${t}`).get().c;
    const rCount = rDb.prepare(`SELECT count(*) as c FROM ${t}`).get().c;
    console.log(`Table ${t}: Central=${cCount}, Relay=${rCount}`);
  } catch (e) {
    console.log(`Table ${t}: Central only (${e.message})`);
  }
}
