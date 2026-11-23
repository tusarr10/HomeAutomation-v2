import base64
import json
import os
import time
from datetime import datetime
from pathlib import Path

import streamlit as st
import tinytuya

st.set_page_config(page_title="Smart Life Breaker Monitor", page_icon="⚡", layout="wide")

CONFIG_PATH = Path(os.getenv("TUYA_DEVICES_FILE", "devices.json"))
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "5"))
REFRESH_DPS = [17, 26, 38, 40, 99, 101, 102, 112, 114, 115]


def find_device_entry(obj):
    """Accept common TinyTuya devices.json shapes without printing secrets."""
    if isinstance(obj, list):
        candidates = obj
    elif isinstance(obj, dict):
        if all(k in obj for k in ("id", "key")):
            candidates = [obj]
        elif isinstance(obj.get("devices"), list):
            candidates = obj["devices"]
        else:
            candidates = []
            for value in obj.values():
                if isinstance(value, dict) and "id" in value and ("key" in value or "local_key" in value):
                    candidates.append(value)
    else:
        candidates = []

    if not candidates:
        raise ValueError("No device entry found. Expected a device object or a list of device objects.")

    wanted_id = os.getenv("TUYA_DEVICE_ID", "").strip()
    if wanted_id:
        for item in candidates:
            if str(item.get("id", "")) == wanted_id:
                return item
        raise ValueError("TUYA_DEVICE_ID was set but no matching entry was found.")

    if len(candidates) > 1:
        # Prefer a named configured device, otherwise require explicit selection.
        named = [x for x in candidates if x.get("name") or x.get("product_name")]
        if len(named) > 1:
            raise ValueError("Multiple devices found. Set TUYA_DEVICE_ID to the intended device ID.")
        if named:
            return named[0]
        raise ValueError("Multiple devices found. Set TUYA_DEVICE_ID to the intended device ID.")
    return candidates[0]


def make_device(entry):
    device_id = entry.get("id") or entry.get("device_id")
    address = entry.get("ip") or entry.get("address") or entry.get("local_ip")
    local_key = entry.get("key") or entry.get("local_key")
    version = entry.get("version", 3.5)
    if not device_id or not address or not local_key:
        raise ValueError("Device entry must contain id, ip/address, key/local_key, and optionally version.")
    dev = tinytuya.OutletDevice(device_id, address, local_key)
    dev.set_version(float(version))
    dev.set_socketPersistent(False)
    return dev


def decode_dp102(payload):
    """Provisional decoder based on observed 8-byte payload; verify against app."""
    if not isinstance(payload, str):
        return None
    try:
        raw = base64.b64decode(payload, validate=True)
    except Exception:
        return None
    if len(raw) != 8:
        return {"raw": raw, "hex": raw.hex(), "bytes": list(raw), "decoded": None}
    v_raw = int.from_bytes(raw[0:2], "big")
    i_raw = int.from_bytes(raw[2:5], "big")
    p_raw = int.from_bytes(raw[5:8], "big")
    return {
        "raw": raw,
        "hex": raw.hex(),
        "bytes": list(raw),
        "decoded": {
            "voltage_v_candidate": v_raw / 10,
            "current_a_candidate": i_raw / 1000,
            "active_power_w_candidate": p_raw,
            "active_power_kw_candidate": p_raw / 1000,
        },
    }


def unwrap_dps(response):
    """Extract DPS from normal TinyTuya or updatedps response shapes."""
    if not isinstance(response, dict):
        return {}
    if isinstance(response.get("dps"), dict):
        return response["dps"]
    data = response.get("data")
    if isinstance(data, dict) and isinstance(data.get("dps"), dict):
        return data["dps"]
    return {}


def fetch_readings():
    raw_config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    entry = find_device_entry(raw_config)
    dev = make_device(entry)
    errors = []
    normal = {}
    refresh = {}
    try:
        response = dev.status()
        normal = unwrap_dps(response)
        if response.get("Error") or response.get("Err"):
            errors.append(str(response.get("Error") or response.get("Err")))
    except Exception as exc:
        errors.append(f"Status read failed: {type(exc).__name__}: {exc}")

    try:
        response = dev.updatedps(REFRESH_DPS)
        refresh = unwrap_dps(response)
        if response.get("Error") or response.get("Err"):
            errors.append(str(response.get("Error") or response.get("Err")))
    except Exception as exc:
        errors.append(f"DP refresh failed: {type(exc).__name__}: {exc}")

    merged = dict(normal)
    merged.update(refresh)
    # Some firmware may return DP102 under data.dps or dps only in refresh response.
    dp102 = refresh.get("102", normal.get("102"))
    decoded = decode_dp102(dp102) if dp102 is not None else None
    return {
        "dps": merged,
        "normal_dps": normal,
        "refresh_dps": refresh,
        "dp102_payload": dp102,
        "dp102_decoded": decoded,
        "errors": errors,
        "device_name": entry.get("name") or entry.get("product_name") or "Configured Tuya device",
        "device_id": str(entry.get("id") or entry.get("device_id") or ""),
        "sample_time": datetime.now().astimezone().isoformat(timespec="seconds"),
    }


def number(dps, key):
    value = dps.get(str(key))
    try:
        if isinstance(value, bool) or value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def fmt(value, digits=2, suffix=""):
    return "—" if value is None else f"{value:,.{digits}f}{suffix}"


st.title("⚡ Smart Life Circuit Breaker")
st.caption("Local TinyTuya telemetry · Read-only monitor")

with st.sidebar:
    st.subheader("Monitor settings")
    poll = st.slider("Refresh interval (seconds)", 3, 30, max(3, min(30, POLL_SECONDS)))
    auto = st.toggle("Auto-refresh", value=True)
    st.caption(f"Config file: `{CONFIG_PATH}`")
    st.caption("The dashboard does not switch the relay or change protection settings.")

if "last_reading" not in st.session_state:
    st.session_state.last_reading = None
if "last_error" not in st.session_state:
    st.session_state.last_error = None

col_a, col_b = st.columns([1, 5])
with col_a:
    if st.button("Read now", type="primary", use_container_width=True):
        st.session_state.force_read = True
with col_b:
    st.caption("Readings are requested from the device on your LAN. Keep this page on a computer connected to the same network.")

do_read = st.session_state.last_reading is None or st.session_state.pop("force_read", False)
if auto and st.session_state.get("_last_poll", 0) + poll <= time.time():
    do_read = True

if do_read:
    try:
        st.session_state.last_reading = fetch_readings()
        st.session_state.last_error = None
    except Exception as exc:
        st.session_state.last_error = f"{type(exc).__name__}: {exc}"
    st.session_state._last_poll = time.time()

reading = st.session_state.last_reading

if st.session_state.last_error:
    st.error(st.session_state.last_error)
    st.info("Check that devices.json exists beside app.py, the device IP is reachable, and the config contains id, ip, key, and version.")
elif reading:
    dps = reading["dps"]
    decoded = reading["dp102_decoded"]
    candidate = decoded["decoded"] if decoded and decoded.get("decoded") else {}

    # DP102 mapping is explicitly provisional.
    voltage = candidate.get("voltage_v_candidate")
    current = candidate.get("current_a_candidate")
    power_kw = candidate.get("active_power_kw_candidate")
    energy = number(dps, 101)
    frequency = number(dps, 112)
    temperature = number(dps, 114)
    fault = number(dps, 26)
    child_lock = dps.get("40")
    relay = dps.get("38")
    dp115 = dps.get("115")

    st.caption(f"Last successful poll: {reading['sample_time']} · Device: {reading['device_name']}")

    if decoded and decoded.get("decoded"):
        st.warning("Voltage/current/power use a provisional DP102 decoder. Confirm against simultaneous Smart Life readings before relying on these values.")
    else:
        st.warning("DP102 telemetry was not returned in this poll. Voltage, current and power are unavailable until a valid 8-byte payload is received.")

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Voltage", fmt(voltage, 1, " V"))
    m2.metric("Current", fmt(current, 3, " A"))
    m3.metric("Active power", fmt(power_kw, 3, " kW"))
    m4.metric("Total energy (DP101)", fmt(energy / 100 if energy is not None else None, 2, " kWh"))

    n1, n2, n3, n4 = st.columns(4)
    n1.metric("Frequency (DP112)", fmt(frequency / 10 if frequency is not None else None, 1, " Hz"))
    n2.metric("Temperature (DP114)", fmt(temperature, 0, " °C"))
    apparent_va = voltage * current if voltage is not None and current is not None else None
    pf = (power_kw * 1000 / apparent_va) if apparent_va and power_kw is not None else None
    n3.metric("Calculated power factor", fmt(pf, 3))
    n4.metric("Fault bitmap (DP26)", str(int(fault)) if fault is not None else "—")

    st.subheader("Device status")
    s1, s2, s3 = st.columns(3)
    s1.metric("Relay status (DP38)", str(relay) if relay is not None else "Not returned")
    s2.metric("Child lock (DP40)", "On" if child_lock is True else ("Off" if child_lock is False else "Not returned"))
    s3.metric("DP115 (unknown)", str(dp115) if dp115 is not None else "Not returned")

    with st.expander("DP102 raw payload and decoding"):
        st.write("Base64:", reading["dp102_payload"] or "Not returned")
        if decoded:
            st.write("Hex:", decoded["hex"])
            st.write("Bytes:", decoded["bytes"])
            st.json(decoded["decoded"] or {"note": "Payload length is not 8 bytes; decoder skipped."})

    with st.expander("All returned DPs (raw)"):
        st.write("Normal status DPs")
        st.json(reading["normal_dps"])
        st.write("Refresh response DPs")
        st.json(reading["refresh_dps"])
        st.write("Merged view")
        st.json(dps)

    if reading["errors"]:
        st.warning("Some requests returned errors: " + " | ".join(reading["errors"]))

    st.caption("Energy DP101 is displayed using the observed ÷100 hypothesis. Frequency DP112 uses the observed ÷10 hypothesis. These mappings should be verified against the app.")

if auto:
    time.sleep(0.2)
    st.markdown(f"<meta http-equiv='refresh' content='{poll}'>", unsafe_allow_html=True)
