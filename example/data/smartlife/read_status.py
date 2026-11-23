
import json
import tinytuya

# Fill these in with your actual device details.
DEVICE_ID = "YOUR_DEVICE_ID"
DEVICE_IP = "192.168.1.120"
LOCAL_KEY = "YOUR_LOCAL_KEY"
PROTOCOL_VERSION = 3.3  # Replace with your detected version

device = tinytuya.Device(
    dev_id=DEVICE_ID,
    address=DEVICE_IP,
    local_key=LOCAL_KEY,
    version=PROTOCOL_VERSION,
)

try:
    # Read status only; no switching commands.
    result = device.status()
    print(json.dumps(result, indent=2))

    if "dps" in result:
        print("\nReported data points:")
        for key, value in result["dps"].items():
            print(f"DP {key}: {value}")

except Exception as exc:
    print(f"Read failed: {type(exc).__name__}: {exc}")
