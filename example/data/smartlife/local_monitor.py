
import csv
import json
import time
from datetime import datetime
from pathlib import Path

import tinytuya

DEVICE_ID = "d7298b9bb3bcdd3d26wfpj"
DEVICE_IP = "192.168.1.100"
CONFIG_FILE = Path("devices.json")
CSV_FILE = Path("breaker_readings.csv")
INTERVAL = 10


def load_device():
    data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

    # TinyTuya normally saves a list of device dictionaries.
    if isinstance(data, dict):
        data = data.get("devices", [data])

    for item in data:
        if item.get("id") == DEVICE_ID:
            key = item.get("key", "")
            if not key:
                raise RuntimeError("No local key found in devices.json")

            version = float(item.get("version", 3.5))
            return tinytuya.Device(
                dev_id=DEVICE_ID,
                address=DEVICE_IP,
                local_key=key,
                version=version,
            )

    raise RuntimeError("Device ID not found in devices.json")


def log_reading(timestamp, dps):
    new_file = not CSV_FILE.exists()

    with CSV_FILE.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if new_file:
            writer.writerow(["timestamp", "dps_json"])
        writer.writerow([timestamp, json.dumps(dps)])


def main():
    device = load_device()
    print("Local breaker monitor started. Press Ctrl+C to stop.")
    print(f"Device: {DEVICE_IP}")
    print("Read-only status polling; no switching commands.\n")

    while True:
        timestamp = datetime.now().astimezone().isoformat(
            timespec="seconds"
        )

        try:
            result = device.status()

            if result.get("Error"):
                print(timestamp, "Read error:", result)
            else:
                dps = result.get("dps", {})
                print(f"\n[{timestamp}]")

                # Known mappings from your TinyTuya wizard output.
                if "17" in dps:
                    print("Energy raw (DP 17):", dps["17"])
                if "26" in dps:
                    print("Fault raw (DP 26):", dps["26"])
                if "38" in dps:
                    print("Relay status raw (DP 38):", dps["38"])
                if "40" in dps:
                    print("Child lock:", dps["40"])
                if "114" in dps:
                    print("Temperature raw (DP 114):", dps["114"])

                print("All data points:", json.dumps(dps))
                log_reading(timestamp, dps)

        except Exception as exc:
            print(f"[{timestamp}] Read failed: {exc}")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nMonitor stopped.")
