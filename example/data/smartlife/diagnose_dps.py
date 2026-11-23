
import json
from pathlib import Path
import tinytuya

BASE = Path(__file__).resolve().parent
devices = json.loads(
    (BASE / "devices.json").read_text(encoding="utf-8")
)

matches = [
    x for x in devices
    if x.get("ip") == "192.168.1.100"
]
if len(matches) != 1:
    raise RuntimeError("Check the breaker entry in devices.json")

cfg = matches[0]
d = tinytuya.OutletDevice(
    cfg["id"], cfg["ip"], cfg["key"],
    version=float(cfg.get("version", 3.5))
)
d.set_socketTimeout(5)

def show(label, result):
    print(f"\n--- {label} ---")
    print(json.dumps(result, indent=2, default=str))

try:
    # Probe which DP IDs the device supports.
    discovered = d.detect_available_dps()
    show("DISCOVERED DPS", discovered)

    # Read the normal status response.
    status = d.status()
    show("NORMAL STATUS", status)

    # Save diagnostic output for comparison.
    (BASE / "dps_diagnostic.json").write_text(
        json.dumps({
            "discovered_dps": discovered,
            "normal_status": status
        }, indent=2, default=str),
        encoding="utf-8"
    )
    print("\nSaved dps_diagnostic.json")

except Exception as exc:
    print("Diagnostic failed:", type(exc).__name__, str(exc))
