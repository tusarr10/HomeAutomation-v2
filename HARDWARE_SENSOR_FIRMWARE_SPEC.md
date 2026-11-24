# Hardware Firmware Specification & Sensor Integration Guide

This document outlines the complete firmware architecture, JSON communication protocols, wire APIs, and step-by-step TODO list for upgrading the ESP8266 / ESP32 node firmware to support **Sensor Nodes**, **Relay Actuator Nodes**, and **Hybrid (Relay + Sensor) Nodes**.

---

## 1. System Architecture & Node Roles

Our central server architecture treats pins modularly based on their configured role:

```
+-----------------------------------------------------------------------------------+
|                           SmartHome Central Server                                |
|  - Web UI: Pin & Hardware Matrix (Filters by Home, Node, Role, Room)             |
|  - TCP Telemetry Listener: 0.0.0.0:2000 (NDJSON Line-Delimited)                  |
|  - HTTP REST Endpoints: http://localhost:9100/api/v1/                            |
+-----------------------------------------+-----------------------------------------+
                                          |
                      +-------------------+-------------------+
                      |                                       |
           [TCP Socket Port 2000]                  [Direct LAN HTTP :80]
                      |                                       |
    +-----------------+-----------------+   +-----------------+-----------------+
    |          Node: ESP8266            |   |          Node: ESP32              |
    |  - CH1 (GPIO 5): Relay Output     |   |  - CH1 (GPIO 18): Relay Output    |
    |  - CH2 (GPIO 4): Relay Output     |   |  - CH2 (A0/ADC): Voltage Sensor   |
    |  - CH3 (A0): Voltage Sensor (ADC) |   |  - CH3 (GPIO 23): IR Receiver     |
    |  - CH4 (GPIO 14): IR Receiver     |   |  - CH4 (GPIO 19): IR Transmitter  |
    |  - CH5 (GPIO 12): IR Transmitter  |   |  - CH5 (GPIO 22): PIR Motion      |
    +-----------------------------------+   +-----------------------------------+
```

### Node Typologies:
1. **Pure Relay Actuator Node**: ESP8266/ESP01 with 1 to 8 relays (controls lights, fans, appliances).
2. **Pure Sensor Node**: ESP8266/ESP32 measuring voltage/current, reading PIR motion, or capturing IR signals.
3. **Hybrid Node**: ESP8266 NodeMCU using digital outputs for relays, analog `A0` for voltage monitoring, and digital pins for IR receiving/transmitting.

---

## 2. Firmware Implementation TODO List

Follow this step-by-step checklist when modifying the C++ firmware in `node-firmware/`:

- [ ] **TODO 1: Add Library Dependencies (`platformio.ini`)**
  - Add `crankyoldgit/IRremoteESP8266 @ ^2.8.6` for decoding and sending NEC, Sony, Samsung, RC5 IR codes.
  - Ensure `bblanchon/ArduinoJson @ ^6.21.3` is available (already present).

- [ ] **TODO 2: Define Pin Role Enumerations (`include/board_pins.h`)**
  ```cpp
  enum PinRole {
      ROLE_RELAY_OUTPUT   = 0,  // Standard Relay actuator (OUTPUT, active-low/high)
      ROLE_VOLTAGE_ADC    = 1,  // Mains / DC Voltage Divider on A0 (analogRead)
      ROLE_IR_RECEIVER    = 2,  // IR Receiver photodiode (e.g. VS1838B on GPIO 14)
      ROLE_IR_TRANSMITTER = 3,  // IR LED Blaster with 38kHz carrier (e.g. GPIO 12)
      ROLE_PIR_MOTION     = 4,  // PIR Motion Detector (digital interrupt input)
      ROLE_DOOR_WINDOW    = 5,  // Magnetic Reed Switch (INPUT_PULLUP)
      ROLE_TEMP_HUMIDITY  = 6,  // DHT11 / DHT22 / DS18B20 One-Wire sensor
      ROLE_GENERIC_ANALOG = 7   // Generic Analog ADC input
  };
  ```

- [ ] **TODO 3: Implement Non-Blocking AC / DC Voltage Sampling on `A0`**
  - On ESP8266, `A0` reads `0 - 1023` (0 to 1.0V internal reference, or 0 to 3.3V with onboard NodeMCU divider).
  - For AC Mains (ZMPT101B or transformer divider): Sample the waveform over 20ms (one full 50Hz mains cycle), calculate Root Mean Square (RMS), multiply by calibration factor (configured from server).

- [ ] **TODO 4: Implement Non-Blocking IR Receiving & Transmitting**
  - Initialize `IRrecv irrecv(IR_RX_PIN, 1024, 50, true); irrecv.enableIRIn();`
  - In `loop()`, call `if (irrecv.decode(&results))` -> capture 32-bit hex code and protocol name -> dispatch instant TCP telemetry packet -> call `irrecv.resume()`.
  - Initialize `IRsend irsend(IR_TX_PIN); irsend.begin();` for blasting commands when received from the server.

- [ ] **TODO 5: Update `ReceiverClient::fillTelemetryDoc`**
  - In addition to the `channels` array, append the `sensors` array in the JSON telemetry packet.

- [ ] **TODO 6: Handle Incoming Server Commands**
  - Parse `action: "send_ir"` and execute `irsend.sendNEC(code, 32)`.
  - Parse `action: "configure_pin"` to dynamically set pin mode without flashing.

---

## 3. Communication Protocol & JSON Specifications

### Protocol Overview:
* **Transport**: TCP Socket on port `2000` (NDJSON: newline-delimited JSON strings `\n`), OR HTTP POST fallback to `/api/v1/sensors/telemetry`.
* **Flow**:
  1. **Node Heartbeat** (every 5-30s): sends full health status, relay states, and current sensor values.
  2. **Node Real-Time Event** (instantaneous): triggered immediately upon IR code reception or PIR motion detection.
  3. **Server Control Command**: Central server transmits command payload; node executes and replies with ACK.

---

### Payload 3.1: Periodic Heartbeat (Node -> Central Server)

Sent periodically over TCP socket (port 2000).

```json
{
  "nodeId": "NODE-68C63AF67479",
  "nodeName": "SmartHome-Node",
  "eventType": "heartbeat",
  "uptimeSec": 3600,
  "rssi": -38,
  "freeHeap": 42120,
  "ip": "192.168.1.27",
  "channels": [
    { "id": 1, "pin": 5, "name": "Living Room Light", "room": "Living Room", "state": 1, "function": "Relay" },
    { "id": 2, "pin": 4, "name": "Bedroom Fan", "room": "Bedroom", "state": 0, "function": "Relay" }
  ],
  "sensors": [
    {
      "channel_id": 3,
      "pin": 17,
      "type": "VOLTAGE",
      "name": "AC Mains Voltage",
      "room": "Main DB",
      "value": 234.6,
      "unit": "V"
    },
    {
      "channel_id": 4,
      "pin": 14,
      "type": "IR_RECEIVER",
      "name": "TV IR Sensor",
      "room": "Living Room",
      "value": 1,
      "strValue": "0xF720DF",
      "unit": "HEX"
    },
    {
      "channel_id": 5,
      "pin": 13,
      "type": "PIR_MOTION",
      "name": "Hallway Motion",
      "room": "Hall",
      "value": 0,
      "strValue": "Clear",
      "unit": "STATE"
    }
  ]
}
```

---

### Payload 3.2: Real-time Event Push (Node -> Central Server)

Pushed **immediately** when an IR remote button is pressed or motion is detected:

#### A. IR Code Received:
```json
{
  "nodeId": "NODE-68C63AF67479",
  "eventType": "sensor_event",
  "sensor_type": "IR_RECEIVER",
  "channel_id": 4,
  "pin": 14,
  "ir_protocol": "NEC",
  "ir_code": "0xF720DF",
  "ir_bits": 32,
  "value": 1,
  "unit": "HEX"
}
```

#### B. Motion Detected:
```json
{
  "nodeId": "NODE-68C63AF67479",
  "eventType": "sensor_event",
  "sensor_type": "PIR_MOTION",
  "channel_id": 5,
  "pin": 13,
  "value": 1,
  "strValue": "DETECTED",
  "unit": "STATE"
}
```

#### C. Mains Voltage Reading / Spike Alarm:
```json
{
  "nodeId": "NODE-68C63AF67479",
  "eventType": "sensor_event",
  "sensor_type": "VOLTAGE",
  "channel_id": 3,
  "pin": 17,
  "voltage": 248.5,
  "v_rms": 248.5,
  "value": 248.5,
  "unit": "V"
}
```

---

### Payload 3.3: Server Commands (Central Server -> Node)

Sent by central server over TCP socket to node.

#### A. Transmit IR Remote Signal (`send_ir`):
```json
{
  "command_uuid": "cmd-8f3a9e21",
  "action": "send_ir",
  "protocol": "NEC",
  "code": "0xF720DF",
  "bits": 32,
  "frequency": 38000,
  "repeat": 1
}
```

#### B. Configure Hardware Pin Mode (`configure_pin`):
```json
{
  "command_uuid": "cmd-1c4b7201",
  "action": "configure_pin",
  "channel_id": 4,
  "pin": 14,
  "role": "IR_RECEIVER",
  "pullup": true,
  "active_low": false
}
```

#### C. Immediate Sensor Query (`read_sensor`):
```json
{
  "command_uuid": "cmd-5d1e8932",
  "action": "read_sensor",
  "channel_id": 3,
  "pin": 17,
  "sensor_type": "VOLTAGE"
}
```

---

## 4. C++ Implementation Snippets

### 4.1 AC Mains Voltage RMS Sampler on `A0` (ESP8266)

```cpp
#include <Arduino.h>

// Calibration constant: adjust so reading matches digital multimeter
static float VOLTAGE_CALIBRATION = 0.244f; 

float readMainsVoltageRMS(uint16_t samplePeriodMs = 40) {
    unsigned long startTime = millis();
    unsigned long count = 0;
    float sumSquares = 0.0f;
    
    // Midpoint ADC value (512 for standard 10-bit AC bias divider)
    const float midPoint = 512.0f; 

    while (millis() - startTime < samplePeriodMs) {
        int raw = analogRead(A0);
        float acSample = raw - midPoint;
        sumSquares += (acSample * acSample);
        count++;
        delayMicroseconds(250); // ~4000 Hz sample rate
    }

    if (count == 0) return 0.0f;

    float meanSquare = sumSquares / (float)count;
    float rmsAdc = sqrt(meanSquare);
    float voltageRMS = rmsAdc * VOLTAGE_CALIBRATION;

    // Reject low noise floor below 15V
    if (voltageRMS < 15.0f) voltageRMS = 0.0f;

    return voltageRMS;
}
```

---

### 4.2 IR Receiver and Transmitter (`IRremoteESP8266`)

```cpp
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>

const uint16_t IR_RX_PIN = 14; // D5 (GPIO 14)
const uint16_t IR_TX_PIN = 12; // D6 (GPIO 12)

IRrecv irrecv(IR_RX_PIN, 1024, 50, true);
IRsend irsend(IR_TX_PIN);
decode_results results;

void setupIR() {
    irrecv.enableIRIn();
    irsend.begin();
    Serial.println(F("[IR] Receiver and Transmitter initialized."));
}

// In loop(): Non-blocking capture
void handleIR() {
    if (irrecv.decode(&results)) {
        String protocol = typeToString(results.decode_type);
        String hexCode = "0x" + String((unsigned long)results.value, HEX);
        hexCode.toUpperCase();
        
        Serial.printf("[IR RX] Decoded %s: %s (%d bits)\n", 
            protocol.c_str(), hexCode.c_str(), results.bits);

        // Push immediate event to Central Server over TCP
        pushIrEventToServer(protocol, hexCode, results.bits);

        irrecv.resume(); // Receive the next value
    }
}

// Blast an IR command received from Central Server
void transmitIR(const String& protocol, const String& hexCode, uint16_t bits) {
    uint64_t code = strtoull(hexCode.c_str(), NULL, 16);
    if (protocol.equalsIgnoreCase("NEC")) {
        irsend.sendNEC(code, bits ? bits : 32);
    } else if (protocol.equalsIgnoreCase("SONY")) {
        irsend.sendSony(code, bits ? bits : 12);
    } else if (protocol.equalsIgnoreCase("SAMSUNG")) {
        irsend.sendSAMSUNG(code, bits ? bits : 32);
    } else if (protocol.equalsIgnoreCase("RC5")) {
        irsend.sendRC5(code, bits ? bits : 12);
    }
    // Re-enable receiver after transmission
    irrecv.enableIRIn();
}
```

---

### 4.3 Dispatching Real-Time JSON to Central Server TCP Port 2000

```cpp
#include <WiFiClient.h>
#include <ArduinoJson.h>

extern WiFiClient tcpClient;
extern const char* CENTRAL_SERVER_IP;
const uint16_t CENTRAL_TCP_PORT = 2000;

void pushIrEventToServer(const String& protocol, const String& hexCode, uint16_t bits) {
    if (!tcpClient.connected()) {
        tcpClient.connect(CENTRAL_SERVER_IP, CENTRAL_TCP_PORT);
    }
    if (tcpClient.connected()) {
        StaticJsonDocument<256> doc;
        doc["nodeId"] = "NODE-68C63AF67479";
        doc["eventType"] = "sensor_event";
        doc["sensor_type"] = "IR_RECEIVER";
        doc["ir_protocol"] = protocol;
        doc["ir_code"] = hexCode;
        doc["ir_bits"] = bits;
        doc["value"] = 1;
        doc["unit"] = "HEX";

        // NDJSON: must append newline \n at the end
        serializeJson(doc, tcpClient);
        tcpClient.print('\n');
        tcpClient.flush();
    }
}
```

---

## 5. Central Server Readiness

The central server now has:
1. **Pin & Hardware Matrix with Filters**: Home, Node, Role (Relay vs Voltage vs IR vs Motion), Room, and Search.
2. **Assign Pin to Node Modal**: Assign any GPIO or ADC pin as a Relay or Sensor to any node in the fleet.
3. **Sensor Configuration Modal**: Configure sensor reporting interval, voltage calibration multiplier/offset, IR protocol, and alarm limits.
4. **Unassign Pin**: Safely delete/unassign hardware pins without affecting physical hardware.
5. **Live Ingestion**: `POST /api/v1/sensors/telemetry` and TCP port `2000` handle voltage readings and IR codes in real-time.
