
import base64
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import tinytuya

BASE = Path(__file__).resolve().parent
DEVICES_FILE = BASE / "devices.json"
OUTPUT_FILE = BASE / "dp102_samples.jsonl"

devices = json.loads(DEVICES_FILE.read_text(encoding="utf-8"))
matches = [x for x in devices if x.get("ip") == "192.168.1.100"]

if len(matches) != 1:
    raise RuntimeError("Check the breaker entry in devices.json")

cfg = matches[0]
d = tinytuya.OutletDevice(
    cfg["id"],
    cfg["ip"],
    cfg["key"],
    version=float(cfg.get("version", 3.5)),
)
d.set_socketTimeout(5)

print("Read-only DP 102 observation. Press Ctrl+C to stop.")

try:
    while True:
        timestamp = datetime.now(timezone.utc).isoformat()

        try:
            before = d.status()
            refreshed = d.updatedps(
                [17, 26, 38, 40, 101, 102, 112, 114, 115]
            )
            after = d.status()

            refresh_dps = refreshed.get("dps", {})
            raw = refresh_dps.get("102")

            record = {
                "timestamp_utc": timestamp,
                "before": before,
                "refresh_response": refreshed,
                "after": after,
            }

            if isinstance(raw, str):
                decoded = base64.b64decode(raw, validate=True)
                record["dp102_base64"] = raw
                record["dp102_hex"] = decoded.hex()
                record["dp102_bytes"] = list(decoded)
            else:
                record["dp102_note"] = "DP 102 not returned by this refresh"

            with OUTPUT_FILE.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, default=str) + "\n")

            print("\n", timestamp)
            print("DP 102:", raw)
            if "dp102_hex" in record:
                print("Hex:", record["dp102_hex"])
                print("Bytes:", record["dp102_bytes"])
            print("Other DPs:", after.get("dps", {}))

        except Exception as exc:
            print(timestamp, "Error:", type(exc).__name__, str(exc))

        time.sleep(5)

except KeyboardInterrupt:
    print("\nStopped. Samples saved to", OUTPUT_FILE)
