
import csv
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import tinytuya

BASE = Path(__file__).resolve().parent
DEVICES_FILE = BASE / "devices.json"
SNAPSHOT_FILE = BASE / "dp_snapshots.jsonl"
CHANGES_FILE = BASE / "dp_changes.csv"

POLL_SECONDS = 5

def load_device():
    devices = json.loads(DEVICES_FILE.read_text(encoding="utf-8"))

    # Find the real breaker by its local IP.
    matches = [
        d for d in devices
        if d.get("ip") == "192.168.1.100"
    ]

    if len(matches) != 1:
        raise RuntimeError(
            "Expected exactly one device at 192.168.1.100. "
            "Check devices.json; do not print or share local keys."
        )

    d = matches[0]
    device = tinytuya.OutletDevice(
        dev_id=d["id"],
        address=d["ip"],
        local_key=d["key"],
        version=float(d.get("version", 3.5)),
    )
    device.set_socketTimeout(5)
    return device

def main():
    device = load_device()
    previous = None

    new_file = not CHANGES_FILE.exists()
    with CHANGES_FILE.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if new_file:
            writer.writerow([
                "timestamp_utc", "dp_id", "old_value", "new_value"
            ])

        print("Read-only DP observation started. Press Ctrl+C to stop.")

        try:
            while True:
                timestamp = datetime.now(timezone.utc).isoformat()

                try:
                    response = device.status()
                except Exception as exc:
                    print(f"{timestamp} Read error: {type(exc).__name__}")
                    time.sleep(POLL_SECONDS)
                    continue

                if not isinstance(response, dict):
                    print(f"{timestamp} Unexpected response type")
                    time.sleep(POLL_SECONDS)
                    continue

                # Save every response, including errors, for later inspection.
                with SNAPSHOT_FILE.open("a", encoding="utf-8") as out:
                    out.write(json.dumps({
                        "timestamp_utc": timestamp,
                        "response": response,
                    }, default=str) + "\n")

                if response.get("Error") or response.get("Err"):
                    print(f"{timestamp} Device response reported an error.")
                    time.sleep(POLL_SECONDS)
                    continue

                data = response.get("dps")
                if not isinstance(data, dict):
                    print(f"{timestamp} No 'dps' dictionary in response.")
                    time.sleep(POLL_SECONDS)
                    continue

                current = {str(k): v for k, v in data.items()}

                if previous is None:
                    print(f"\n{timestamp} INITIAL DPs ({len(current)})")
                    for dp, value in sorted(current.items()):
                        print(f"  DP {dp}: {value!r}")
                else:
                    added = current.keys() - previous.keys()
                    removed = previous.keys() - current.keys()

                    for dp in sorted(added):
                        print(f"{timestamp} ADDED DP {dp}: {current[dp]!r}")
                        writer.writerow([timestamp, dp, "<MISSING>", current[dp]])

                    for dp in sorted(removed):
                        print(f"{timestamp} MISSING DP {dp}")
                        writer.writerow([timestamp, dp, previous[dp], "<MISSING>"])

                    for dp in sorted(current.keys() & previous.keys()):
                        if current[dp] != previous[dp]:
                            print(
                                f"{timestamp} DP {dp}: "
                                f"{previous[dp]!r} -> {current[dp]!r}"
                            )
                            writer.writerow([
                                timestamp, dp, previous[dp], current[dp]
                            ])

                    f.flush()

                previous = current
                time.sleep(POLL_SECONDS)

        except KeyboardInterrupt:
            print("\nObservation stopped.")

if __name__ == "__main__":
    main()
