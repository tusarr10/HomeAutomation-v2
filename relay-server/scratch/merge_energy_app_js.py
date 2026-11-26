import os

central_path = r"d:\ai\HomeAutomation v2\central-server\public\assets\app.js"
relay_path = r"d:\ai\HomeAutomation v2\relay-server\web\assets\app.js"

with open(central_path, "r", encoding="utf-8") as f:
    central_code = f.read()

with open(relay_path, "r", encoding="utf-8") as f:
    relay_code = f.read()

# 1. Extract the energy analytics block from central-server
start_marker = "// ⚡ ENERGY CONSUMPTION & POWER ANALYTICS MODULE (P3 / CS-F1)"
end_marker = "function updateBreakerDom(data) {"

start_idx = central_code.find(start_marker)
end_idx = central_code.find(end_marker, start_idx)

if start_idx == -1 or end_idx == -1:
    print(f"Error finding markers: start={start_idx}, end={end_idx}")
    exit(1)

energy_block = central_code[start_idx:end_idx]
print(f"Found energy block of length {len(energy_block)} chars")

# 2. Add the button in nav tabs
nav_target = """      <button class="breaker-tab-btn ${breakerSubTab === 'telemetry' ? 'active' : ''}" onclick="switchBreakerTab('telemetry')">
        <span>📊</span> Live Telemetry
      </button>"""

nav_replacement = """      <button class="breaker-tab-btn ${breakerSubTab === 'telemetry' ? 'active' : ''}" onclick="switchBreakerTab('telemetry')">
        <span>📊</span> Live Telemetry
      </button>
      <button class="breaker-tab-btn ${breakerSubTab === 'energy' ? 'active' : ''}" onclick="switchBreakerTab('energy')">
        <span>⚡</span> Energy Analytics & kWh
      </button>"""

if nav_target not in relay_code:
    print("Error: nav_target not found in relay_code")
    exit(1)

relay_code = relay_code.replace(nav_target, nav_replacement, 1)

# 3. Add to switchBreakerTab
switch_target = """    if (tabName === 'serial') {
      initSerialTerminal();
      loadSerialLogsFromServer();
    }"""

switch_replacement = """    if (tabName === 'serial') {
      initSerialTerminal();
      loadSerialLogsFromServer();
    }
    if (tabName === 'energy') {
      setTimeout(loadEnergyAnalyticsData, 50);
    }"""

if switch_target not in relay_code:
    print("Error: switch_target not found in relay_code")
    exit(1)

relay_code = relay_code.replace(switch_target, switch_replacement, 1)

# 4. Add to renderBreakerSubTab
render_target = """  // 1. LIVE TELEMETRY VIEW
  if (breakerSubTab === 'telemetry') {"""

render_replacement = """  // 1.5 ENERGY & POWER CONSUMPTION ANALYTICS (P3 / CS-F1)
  if (breakerSubTab === 'energy') {
    setTimeout(loadEnergyAnalyticsData, 10);
    return renderBreakerEnergySubTab();
  }

  // 1. LIVE TELEMETRY VIEW
  if (breakerSubTab === 'telemetry') {"""

if render_target not in relay_code:
    print("Error: render_target not found in relay_code")
    exit(1)

relay_code = relay_code.replace(render_target, render_replacement, 1)

# 5. Insert energy_block right before updateBreakerDom(data)
dom_target = "function updateBreakerDom(data) {"
if dom_target not in relay_code:
    print("Error: dom_target not found in relay_code")
    exit(1)

relay_code = relay_code.replace(dom_target, energy_block + "\n" + dom_target, 1)

with open(relay_path, "w", encoding="utf-8") as f:
    f.write(relay_code)

print("Successfully merged Energy Analytics into relay-server app.js!")
