#if defined(TARGET_ESP01_1M)
#include "gpio_manager.h"
#include "storage_manager.h"

GpioManager::GpioManager() : _stateCallback(nullptr), _channelCount(2) {
    // Default channels for ESP-01 / ESP-01S hardware
    _channels[0] = { 1, ESP01_GPIO0, "Relay 1", "General", "Relay", true, 0, true, false, 0 };
    _channels[1] = { 2, ESP01_GPIO2, "Relay 2", "General", "Relay", true, 0, true, false, 0 };
}

GpioManager& GpioManager::getInstance() {
    static GpioManager instance;
    return instance;
}

void GpioManager::applyPhysicalPin(size_t index) {
    if (index >= _channelCount) return;
    uint8_t pin = _channels[index].pin;
    if (pin > 16) return;
    bool activeLow = _channels[index].activeLow;
    bool logicalState = _channels[index].currentState;
    
    // Active low: currentState true -> LOW, false -> HIGH
    digitalWrite(pin, logicalState ? (activeLow ? LOW : HIGH) : (activeLow ? HIGH : LOW));
    pinMode(pin, OUTPUT);
}

bool GpioManager::begin() {
    DynamicJsonDocument doc(1024);
    if (StorageManager::getInstance().loadJsonFile(FILE_GPIO_CONFIG, doc)) {
        JsonArrayConst arr;
        if (doc.is<JsonArrayConst>()) {
            arr = doc.as<JsonArrayConst>();
        } else if (doc.containsKey("channels") && doc["channels"].is<JsonArrayConst>()) {
            arr = doc["channels"].as<JsonArrayConst>();
        }

        if (!arr.isNull() && arr.size() > 0) {
            size_t count = 0;
            for (JsonObjectConst ch : arr) {
                if (count >= MAX_GPIO_CHANNELS) break;
                uint8_t id = ch["id"] | (count + 1);
                uint8_t pin = ch["pin"] | 255;
                if (pin == 255) continue;

                String name = ch["name"] | ("Relay " + String(id));
                String room = ch["room"] | "General";
                String func = ch["function"] | "Relay";
                bool activeLow = ch.containsKey("activeLow") ? ch["activeLow"].as<bool>() : (ch.containsKey("active_low") ? ch["active_low"].as<bool>() : true);
                uint8_t initMode = ch["initialMode"] | ch["initial_mode"] | 0;
                bool enabled = ch.containsKey("enabled") ? ch["enabled"].as<bool>() : true;

                bool st = false;
                if (initMode == 2) st = true;       // Boot ON
                else if (initMode == 1) st = false; // Boot OFF
                else if (ch.containsKey("state")) st = ch["state"].as<bool>(); // Restore last state

                _channels[count] = { id, pin, name, room, func, activeLow, initMode, enabled, st, 0 };
                count++;
            }
            if (count > 0) {
                _channelCount = count;
            }
        }
    }

    for (size_t i = 0; i < _channelCount; i++) {
        applyPhysicalPin(i);
        Serial.printf("[GPIO] Hardware ready: Channel %u (%s) on Pin %u = %s\n",
                      _channels[i].id, _channels[i].name.c_str(), _channels[i].pin,
                      _channels[i].currentState ? "ON" : "OFF");
    }
    return true;
}

void GpioManager::saveConfiguration() {
    DynamicJsonDocument doc(1024);
    JsonArray arr = doc.to<JsonArray>();
    for (size_t i = 0; i < _channelCount; i++) {
        JsonObject obj = arr.createNestedObject();
        obj["id"] = _channels[i].id;
        obj["pin"] = _channels[i].pin;
        obj["name"] = _channels[i].name;
        obj["room"] = _channels[i].room;
        obj["function"] = _channels[i].function;
        obj["activeLow"] = _channels[i].activeLow;
        obj["initialMode"] = _channels[i].initialMode;
        obj["enabled"] = _channels[i].enabled;
        obj["state"] = _channels[i].currentState;
    }
    StorageManager::getInstance().saveJsonFile(FILE_GPIO_CONFIG, doc);
}

void GpioManager::saveStates() {
    saveConfiguration();
}

bool GpioManager::saveChannels(const JsonArrayConst& channels) {
    size_t count = 0;
    for (JsonObjectConst ch : channels) {
        if (count >= MAX_GPIO_CHANNELS) break;
        uint8_t id = ch["id"] | (count + 1);
        uint8_t pin = ch["pin"] | 255;
        if (pin == 255) continue;

        String name = ch["name"] | ("Relay " + String(id));
        String room = ch["room"] | "General";
        String func = ch["function"] | "Relay";
        bool activeLow = ch.containsKey("activeLow") ? ch["activeLow"].as<bool>() : (ch.containsKey("active_low") ? ch["active_low"].as<bool>() : true);
        uint8_t initMode = ch["initialMode"] | ch["initial_mode"] | 0;
        bool enabled = ch.containsKey("enabled") ? ch["enabled"].as<bool>() : true;

        bool st = false;
        if (initMode == 2) st = true;
        else if (initMode == 1) st = false;
        else if (ch.containsKey("state")) st = ch["state"].as<bool>();
        else {
            for (size_t j = 0; j < _channelCount; j++) {
                if (_channels[j].id == id || _channels[j].pin == pin) {
                    st = _channels[j].currentState;
                    break;
                }
            }
        }

        _channels[count] = { id, pin, name, room, func, activeLow, initMode, enabled, st, 0 };
        applyPhysicalPin(count);
        count++;
    }

    if (count > 0) {
        _channelCount = count;
        saveConfiguration();
        return true;
    }
    return false;
}

bool GpioManager::addOrUpdateChannel(uint8_t id, uint8_t pin, const String& name, const String& room,
                                     const String& function, bool activeLow, uint8_t initialMode, bool enabled) {
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].id == id) {
            _channels[i].pin = pin;
            _channels[i].name = name;
            _channels[i].room = room;
            _channels[i].function = function;
            _channels[i].activeLow = activeLow;
            _channels[i].initialMode = initialMode;
            _channels[i].enabled = enabled;
            applyPhysicalPin(i);
            saveConfiguration();
            return true;
        }
    }

    if (_channelCount < MAX_GPIO_CHANNELS) {
        size_t idx = _channelCount++;
        _channels[idx] = { id, pin, name, room, function, activeLow, initialMode, enabled, false, 0 };
        applyPhysicalPin(idx);
        saveConfiguration();
        return true;
    }
    return false;
}

bool GpioManager::removeChannel(uint8_t id) {
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].id == id) {
            for (size_t j = i; j < _channelCount - 1; j++) {
                _channels[j] = _channels[j + 1];
            }
            _channelCount--;
            saveConfiguration();
            return true;
        }
    }
    return false;
}

void GpioManager::loop() {
    unsigned long now = millis();
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].pulseEndTime > 0 && now >= _channels[i].pulseEndTime) {
            _channels[i].pulseEndTime = 0;
            _channels[i].currentState = false;
            applyPhysicalPin(i);
            saveStates();
            if (_stateCallback) {
                _stateCallback(_channels[i].id, false);
            }
        }
    }
}

bool GpioManager::setState(uint8_t id, bool logicalState) {
    size_t idx = 255;
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].id == id) {
            idx = i;
            break;
        }
    }
    if (idx == 255 && id > 0 && id <= _channelCount) {
        idx = id - 1;
    }
    if (idx >= _channelCount) return false;

    if (_channels[idx].currentState != logicalState) {
        _channels[idx].currentState = logicalState;
        _channels[idx].pulseEndTime = 0;
        applyPhysicalPin(idx);
        saveStates();
        if (_stateCallback) {
            _stateCallback(_channels[idx].id, logicalState);
        }
    }
    return true;
}

bool GpioManager::toggle(uint8_t id) {
    size_t idx = 255;
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].id == id) {
            idx = i;
            break;
        }
    }
    if (idx == 255 && id > 0 && id <= _channelCount) {
        idx = id - 1;
    }
    if (idx >= _channelCount) return false;

    return setState(_channels[idx].id, !_channels[idx].currentState);
}

bool GpioManager::pulse(uint8_t id, unsigned long durationMs) {
    size_t idx = 255;
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].id == id) {
            idx = i;
            break;
        }
    }
    if (idx == 255 && id > 0 && id <= _channelCount) {
        idx = id - 1;
    }
    if (idx >= _channelCount) return false;

    if (durationMs == 0) durationMs = 500;
    _channels[idx].currentState = true;
    _channels[idx].pulseEndTime = millis() + durationMs;
    applyPhysicalPin(idx);
    saveStates();
    if (_stateCallback) {
        _stateCallback(_channels[idx].id, true);
    }
    return true;
}

void GpioManager::toJson(JsonArray& arr) {
    for (size_t i = 0; i < _channelCount; i++) {
        JsonObject obj = arr.createNestedObject();
        obj["id"] = _channels[i].id;
        obj["pin"] = _channels[i].pin;
        obj["name"] = _channels[i].name;
        obj["room"] = _channels[i].room;
        obj["function"] = _channels[i].function;
        obj["activeLow"] = _channels[i].activeLow;
        obj["initialMode"] = _channels[i].initialMode;
        obj["enabled"] = _channels[i].enabled;
        obj["state"] = _channels[i].currentState;
    }
}

#elif defined(TARGET_ESP01_PCF8574)
#include "gpio_manager.h"
#include "storage_manager.h"
#include "drivers/pcf8574_driver.h"

GpioManager::GpioManager() : _stateCallback(nullptr), _channelCount(8) {
    // Default 8 channels for PCF8574T I2C Expander (P0 to P7 -> Pins 100 to 107)
    for (uint8_t i = 0; i < 8; i++) {
        _channels[i] = {
            (uint8_t)(i + 1),                 // id: 1..8
            (uint8_t)(PCF_PIN_BASE + i),      // pin: 100..107 (P0..P7)
            "Relay " + String(i + 1),         // name
            "General",                        // room
            "Relay",                          // function
            true,                             // activeLow (standard for relay modules)
            0,                                // initialMode (0 = restore last state)
            true,                             // enabled
            false,                            // currentState (OFF initially)
            0                                 // pulseEndTime
        };
    }
}

GpioManager& GpioManager::getInstance() {
    static GpioManager instance;
    return instance;
}

void GpioManager::applyPhysicalPin(size_t index) {
    if (index >= _channelCount) return;
    uint8_t pin = _channels[index].pin;
    bool activeLow = _channels[index].activeLow;
    bool logicalState = _channels[index].currentState;
    
    // Active low: logicalState true (ON) -> LOW, false (OFF) -> HIGH
    bool physicalLevel = logicalState ? (activeLow ? LOW : HIGH) : (activeLow ? HIGH : LOW);

    if (IS_PCF_PIN(pin)) {
        Pcf8574Driver::getInstance().setPin(PCF_PIN_INDEX(pin), physicalLevel);
    } else if (pin <= 16) {
        digitalWrite(pin, physicalLevel);
        pinMode(pin, OUTPUT);
    }
}

bool GpioManager::begin() {
    // 1. Initialize PCF8574T I2C Bus & Expander
    Pcf8574Driver::getInstance().begin(ESP01_I2C_SDA, ESP01_I2C_SCL, PCF8574_DEFAULT_ADDR);

    // 2. Load Channel Configurations from LittleFS Flash
    DynamicJsonDocument doc(3072);
    bool configLoaded = false;
    if (StorageManager::getInstance().loadJsonFile(FILE_GPIO_CONFIG, doc)) {
        JsonArrayConst arr;
        if (doc.is<JsonArrayConst>()) {
            arr = doc.as<JsonArrayConst>();
        } else if (doc.containsKey("channels") && doc["channels"].is<JsonArrayConst>()) {
            arr = doc["channels"].as<JsonArrayConst>();
        }

        if (!arr.isNull() && arr.size() > 0) {
            size_t count = 0;
            for (JsonObjectConst ch : arr) {
                if (count >= MAX_GPIO_CHANNELS) break;
                uint8_t id = ch["id"] | (count + 1);
                uint8_t pin = ch["pin"] | 255;
                if (pin == 255) continue;

                String name = ch["name"] | ("Relay " + String(id));
                String room = ch["room"] | "General";
                String func = ch["function"] | "Relay";
                bool activeLow = ch.containsKey("activeLow") ? ch["activeLow"].as<bool>() : (ch.containsKey("active_low") ? ch["active_low"].as<bool>() : true);
                uint8_t initMode = ch["initialMode"] | ch["initial_mode"] | 0;
                bool enabled = ch.containsKey("enabled") ? ch["enabled"].as<bool>() : true;

                bool st = false;
                if (initMode == 2) st = true;       // Boot ON
                else if (initMode == 1) st = false; // Boot OFF
                else if (ch.containsKey("state")) st = ch["state"].as<bool>(); // Restore last state

                _channels[count] = { id, pin, name, room, func, activeLow, initMode, enabled, st, 0 };
                count++;
            }
            if (count > 0) {
                _channelCount = count;
                configLoaded = true;
            }
        }
    }

    if (!configLoaded) {
        // If config file did not exist, persist the default 8 channels
        saveConfiguration();
    }

    for (size_t i = 0; i < _channelCount; i++) {
        applyPhysicalPin(i);
        const char* pType = IS_PCF_PIN(_channels[i].pin) ? "PCF8574" : "GPIO";
        Serial.printf("[GPIO] Hardware ready: Channel %u (%s) on %s Pin %u = %s\n",
                      _channels[i].id, _channels[i].name.c_str(), pType, _channels[i].pin,
                      _channels[i].currentState ? "ON" : "OFF");
    }
    return true;
}

void GpioManager::saveConfiguration() {
    DynamicJsonDocument doc(3072);
    JsonArray arr = doc.to<JsonArray>();
    for (size_t i = 0; i < _channelCount; i++) {
        JsonObject obj = arr.createNestedObject();
        obj["id"] = _channels[i].id;
        obj["pin"] = _channels[i].pin;
        obj["name"] = _channels[i].name;
        obj["room"] = _channels[i].room;
        obj["function"] = _channels[i].function;
        obj["activeLow"] = _channels[i].activeLow;
        obj["initialMode"] = _channels[i].initialMode;
        obj["enabled"] = _channels[i].enabled;
        obj["state"] = _channels[i].currentState;
        if (IS_PCF_PIN(_channels[i].pin)) {
            obj["label"] = "P" + String(PCF_PIN_INDEX(_channels[i].pin)) + " (PCF8574 Relay " + String(_channels[i].id) + ")";
            obj["note"] = "Extended I2C relay pin";
            obj["bootSensitive"] = false;
        }
    }
    StorageManager::getInstance().saveJsonFile(FILE_GPIO_CONFIG, doc);
}

void GpioManager::saveStates() {
    saveConfiguration();
}

bool GpioManager::saveChannels(const JsonArrayConst& channels) {
    size_t count = 0;
    for (JsonObjectConst ch : channels) {
        if (count >= MAX_GPIO_CHANNELS) break;
        uint8_t id = ch["id"] | (count + 1);
        uint8_t pin = ch["pin"] | 255;
        if (pin == 255) continue;

        String name = ch["name"] | ("Relay " + String(id));
        String room = ch["room"] | "General";
        String func = ch["function"] | "Relay";
        bool activeLow = ch.containsKey("activeLow") ? ch["activeLow"].as<bool>() : (ch.containsKey("active_low") ? ch["active_low"].as<bool>() : true);
        uint8_t initMode = ch["initialMode"] | ch["initial_mode"] | 0;
        bool enabled = ch.containsKey("enabled") ? ch["enabled"].as<bool>() : true;

        bool st = false;
        if (initMode == 2) st = true;
        else if (initMode == 1) st = false;
        else if (ch.containsKey("state")) st = ch["state"].as<bool>();
        else {
            for (size_t j = 0; j < _channelCount; j++) {
                if (_channels[j].id == id || _channels[j].pin == pin) {
                    st = _channels[j].currentState;
                    break;
                }
            }
        }

        _channels[count] = { id, pin, name, room, func, activeLow, initMode, enabled, st, 0 };
        applyPhysicalPin(count);
        count++;
    }

    if (count > 0) {
        _channelCount = count;
        saveConfiguration();
        return true;
    }
    return false;
}

bool GpioManager::addOrUpdateChannel(uint8_t id, uint8_t pin, const String& name, const String& room,
                                     const String& function, bool activeLow, uint8_t initialMode, bool enabled) {
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].id == id) {
            _channels[i].pin = pin;
            _channels[i].name = name;
            _channels[i].room = room;
            _channels[i].function = function;
            _channels[i].activeLow = activeLow;
            _channels[i].initialMode = initialMode;
            _channels[i].enabled = enabled;
            applyPhysicalPin(i);
            saveConfiguration();
            return true;
        }
    }

    if (_channelCount < MAX_GPIO_CHANNELS) {
        size_t idx = _channelCount++;
        _channels[idx] = { id, pin, name, room, function, activeLow, initialMode, enabled, false, 0 };
        applyPhysicalPin(idx);
        saveConfiguration();
        return true;
    }
    return false;
}

bool GpioManager::removeChannel(uint8_t id) {
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].id == id) {
            for (size_t j = i; j < _channelCount - 1; j++) {
                _channels[j] = _channels[j + 1];
            }
            _channelCount--;
            saveConfiguration();
            return true;
        }
    }
    return false;
}

void GpioManager::loop() {
    unsigned long now = millis();
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].pulseEndTime > 0 && now >= _channels[i].pulseEndTime) {
            _channels[i].pulseEndTime = 0;
            _channels[i].currentState = false;
            applyPhysicalPin(i);
            saveStates();
            if (_stateCallback) {
                _stateCallback(_channels[i].id, false);
            }
        }
    }
}

bool GpioManager::setState(uint8_t id, bool logicalState) {
    size_t idx = 255;
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].id == id) {
            idx = i;
            break;
        }
    }
    if (idx == 255 && id > 0 && id <= _channelCount) {
        idx = id - 1;
    }
    if (idx >= _channelCount) return false;

    if (_channels[idx].currentState != logicalState) {
        _channels[idx].currentState = logicalState;
        _channels[idx].pulseEndTime = 0;
        applyPhysicalPin(idx);
        saveStates();
        if (_stateCallback) {
            _stateCallback(_channels[idx].id, logicalState);
        }
    }
    return true;
}

bool GpioManager::toggle(uint8_t id) {
    size_t idx = 255;
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].id == id) {
            idx = i;
            break;
        }
    }
    if (idx == 255 && id > 0 && id <= _channelCount) {
        idx = id - 1;
    }
    if (idx >= _channelCount) return false;

    return setState(_channels[idx].id, !_channels[idx].currentState);
}

bool GpioManager::pulse(uint8_t id, unsigned long durationMs) {
    size_t idx = 255;
    for (size_t i = 0; i < _channelCount; i++) {
        if (_channels[i].id == id) {
            idx = i;
            break;
        }
    }
    if (idx == 255 && id > 0 && id <= _channelCount) {
        idx = id - 1;
    }
    if (idx >= _channelCount) return false;

    if (durationMs == 0) durationMs = 500;
    _channels[idx].currentState = true;
    _channels[idx].pulseEndTime = millis() + durationMs;
    applyPhysicalPin(idx);
    saveStates();
    if (_stateCallback) {
        _stateCallback(_channels[idx].id, true);
    }
    return true;
}

void GpioManager::toJson(JsonArray& arr) {
    for (size_t i = 0; i < _channelCount; i++) {
        JsonObject obj = arr.createNestedObject();
        obj["id"] = _channels[i].id;
        obj["pin"] = _channels[i].pin;
        obj["name"] = _channels[i].name;
        obj["room"] = _channels[i].room;
        obj["function"] = _channels[i].function;
        obj["activeLow"] = _channels[i].activeLow;
        obj["initialMode"] = _channels[i].initialMode;
        obj["enabled"] = _channels[i].enabled;
        obj["state"] = _channels[i].currentState;
        if (IS_PCF_PIN(_channels[i].pin)) {
            obj["label"] = "P" + String(PCF_PIN_INDEX(_channels[i].pin)) + " (PCF8574 Relay " + String(_channels[i].id) + ")";
            obj["note"] = "Extended I2C relay pin";
            obj["bootSensitive"] = false;
        }
    }
}

bool GpioManager::isPcfDetected() const {
    return Pcf8574Driver::getInstance().isDetected();
}

uint8_t GpioManager::getPcfAddress() const {
    return Pcf8574Driver::getInstance().getAddress();
}

uint8_t GpioManager::getPcfOutputByte() const {
    return Pcf8574Driver::getInstance().getOutputByte();
}

#elif defined(TARGET_NODEMCU_PCF8574)
#include "gpio_manager.h"
#include "storage_manager.h"
#include "drivers/pcf8574_driver.h"

GpioManager::GpioManager() : _stateCallback(nullptr), _nextId(1) {}

GpioManager& GpioManager::getInstance() {
    static GpioManager instance;
    return instance;
}

bool GpioManager::isPinSafe(uint8_t pin, String& note, bool& bootSensitive) {
    if (IS_PCF_PIN(pin)) {
        if (_i2cEnabled) {
            note = "I2C PCF8574 Pin P" + String(PCF_PIN_INDEX(pin)) + " (Safe isolated expander output)";
            bootSensitive = false;
            return true;
        } else {
            note = F("I2C Expander is disabled. Enable I2C in GPIO settings first.");
            bootSensitive = false;
            return false;
        }
    }

    if (_i2cEnabled && (pin == _i2cSdaPin || pin == _i2cSclPin)) {
        note = (pin == _i2cSdaPin) ? F("Pin reserved for I2C SDA") : F("Pin reserved for I2C SCL");
        bootSensitive = false;
        return false;
    }

    for (size_t i = 0; i < PIN_SAFETY_MAP_COUNT; i++) {
        if (PIN_SAFETY_MAP[i].gpio == pin) {
            note = PIN_SAFETY_MAP[i].bootNote;
            bootSensitive = PIN_SAFETY_MAP[i].isBootSensitive;
            if (pin == 17) return true; // Analog A0 voltage input is always allowed
            return PIN_SAFETY_MAP[i].isSafeRelay;
        }
    }
    note = F("Pin is reserved by ESP8266 system/SPI-flash/UART");
    bootSensitive = true;
    return false;
}

bool GpioManager::isPinAssigned(uint8_t pin, uint8_t excludeId) {
    if (_i2cEnabled && (pin == _i2cSdaPin || pin == _i2cSclPin)) {
        return true;
    }
    for (const auto& ch : _channels) {
        if (ch.pin == pin && ch.id != excludeId) {
            return true;
        }
    }
    return false;
}

void GpioManager::applyPhysicalPin(const GpioChannel& channel) {
    if (!channel.enabled) {
        // Disabled channel defaults to safe off (high-impedance input for native pins)
        if (!IS_PCF_PIN(channel.pin) && channel.pin <= 16) {
            pinMode(channel.pin, INPUT);
        }
        return;
    }

    // Active-low: logical ON -> physical LOW; logical OFF -> physical HIGH
    int physicalLevel = channel.activeLow ? (channel.currentState ? LOW : HIGH) : (channel.currentState ? HIGH : LOW);

    if (IS_PCF_PIN(channel.pin)) {
        Pcf8574Driver::getInstance().setPin(PCF_PIN_INDEX(channel.pin), physicalLevel == HIGH);
        return;
    }

    if (channel.pin <= 16) {
        digitalWrite(channel.pin, physicalLevel);
        pinMode(channel.pin, OUTPUT);
    }
}

bool GpioManager::begin() {
    // 1. Initialize PCF8574T I2C Bus & Expander
    Pcf8574Driver::getInstance().begin(NODEMCU_I2C_SDA, NODEMCU_I2C_SCL, PCF8574_DEFAULT_ADDR);

    // 2. Load Channel Configurations from LittleFS Flash
    loadFromStorage();
    if (_channels.empty()) {
        // Only create initial default safe outputs if /config/gpio.json does NOT exist on flash
        if (!LittleFS.exists(FILE_GPIO_CONFIG)) {
            Serial.println(F("[GPIO] No saved config found, creating default 8 PCF8574 channels (P0-P7)"));
            String err;
            for (uint8_t i = 0; i < 8; i++) {
                addChannel(PCF_PIN_BASE + i, "Relay " + String(i + 1), "General", "Relay", true, INITIAL_MODE_RESTORE_LAST, err);
            }
        } else {
            Serial.println(F("[GPIO] Existing gpio.json file found but 0 channels loaded. Preserving file."));
        }
    } else {
        // Initialize all loaded channels according to power-on behavior
        for (auto& ch : _channels) {
            if (ch.initialMode == INITIAL_MODE_OFF) {
                ch.currentState = false;
            } else if (ch.initialMode == INITIAL_MODE_ON) {
                ch.currentState = true;
            } else if (ch.initialMode == INITIAL_MODE_RESTORE_LAST) {
                Serial.printf("[GPIO] Channel %u (%s): Restored last state -> %s\n",
                              ch.id, ch.name.c_str(), ch.currentState ? "ON" : "OFF");
            }
            applyPhysicalPin(ch);
        }
    }
    return true;
}

void GpioManager::loop() {
    unsigned long now = millis();
    for (auto& ch : _channels) {
        if (ch.pulseEndTime > 0 && now >= ch.pulseEndTime) {
            ch.pulseEndTime = 0;
            ch.currentState = false;
            applyPhysicalPin(ch);
            Serial.printf("[GPIO] Channel %u (%s) pulse expired -> OFF\n", ch.id, ch.name.c_str());
            if (_stateCallback) {
                _stateCallback(ch.id, false);
            }
            saveToStorage();
        }
    }
}

bool GpioManager::addChannel(uint8_t pin, const String& name, const String& room, const String& function,
                            bool activeLow, uint8_t initialMode, String& outError) {
    if (_channels.size() >= MAX_GPIO_CHANNELS) {
        outError = String(F("Maximum GPIO channels reached (limit: ")) + String(MAX_GPIO_CHANNELS) + F(")");
        return false;
    }

    String note;
    bool bootSens;
    if (!isPinSafe(pin, note, bootSens)) {
        outError = note;
        return false;
    }

    if (isPinAssigned(pin)) {
        outError = F("Pin is already assigned to another channel");
        return false;
    }

    GpioChannel ch;
    ch.id = _nextId++;
    ch.pin = pin;
    ch.name = (name.length() > 0) ? name : String(F("Output ")) + String(ch.id);
    ch.room = (room.length() > 0) ? room : F("General");
    ch.function = (function.length() > 0) ? function : F("Relay");
    ch.activeLow = activeLow;
    ch.initialMode = initialMode;
    ch.enabled = true;

    if (initialMode == INITIAL_MODE_ON) {
        ch.currentState = true;
    } else {
        ch.currentState = false;
    }
    ch.pulseEndTime = 0;

    applyPhysicalPin(ch);
    _channels.push_back(ch);
    saveToStorage();
    return true;
}

bool GpioManager::updateChannel(uint8_t id, const String& name, const String& room, const String& function,
                               bool activeLow, uint8_t initialMode, bool enabled, String& outError) {
    GpioChannel* ch = getChannel(id);
    if (!ch) {
        outError = F("Channel ID not found");
        return false;
    }

    ch->name = (name.length() > 0) ? name : ch->name;
    ch->room = (room.length() > 0) ? room : ch->room;
    ch->function = (function.length() > 0) ? function : ch->function;
    ch->activeLow = activeLow;
    ch->initialMode = initialMode;
    ch->enabled = enabled;

    applyPhysicalPin(*ch);
    saveToStorage();
    return true;
}

bool GpioManager::removeChannel(uint8_t id) {
    for (auto it = _channels.begin(); it != _channels.end(); ++it) {
        if (it->id == id) {
            // Restore pin to safe default (relay turned off)
            it->currentState = false;
            applyPhysicalPin(*it);
            if (!IS_PCF_PIN(it->pin) && it->pin <= 16) {
                pinMode(it->pin, INPUT);
            }
            _channels.erase(it);
            saveToStorage();
            return true;
        }
    }
    return false;
}

bool GpioManager::setState(uint8_t id, bool logicalState) {
    GpioChannel* ch = getChannel(id);
    if (!ch || !ch->enabled) return false;

    ch->pulseEndTime = 0; // Cancel any active pulse
    ch->currentState = logicalState;
    applyPhysicalPin(*ch);
    saveToStorage();

    if (_stateCallback) {
        _stateCallback(id, logicalState);
    }
    return true;
}

bool GpioManager::toggle(uint8_t id) {
    GpioChannel* ch = getChannel(id);
    if (!ch || !ch->enabled) return false;
    return setState(id, !ch->currentState);
}

bool GpioManager::pulse(uint8_t id, unsigned long durationMs) {
    GpioChannel* ch = getChannel(id);
    if (!ch || !ch->enabled) return false;

    ch->currentState = true;
    ch->pulseEndTime = millis() + durationMs;
    applyPhysicalPin(*ch);
    saveToStorage();

    if (_stateCallback) {
        _stateCallback(id, true);
    }
    return true;
}

GpioChannel* GpioManager::getChannel(uint8_t id) {
    for (auto& ch : _channels) {
        if (ch.id == id) return &ch;
    }
    return nullptr;
}

void GpioManager::toJson(JsonArray& arr) {
    for (const auto& ch : _channels) {
        JsonObject obj = arr.createNestedObject();
        obj["id"] = ch.id;
        obj["pin"] = ch.pin;
        obj["name"] = ch.name;
        obj["room"] = ch.room;
        obj["function"] = ch.function;
        obj["activeLow"] = ch.activeLow;
        obj["initialMode"] = ch.initialMode;
        obj["enabled"] = ch.enabled;
        obj["state"] = ch.currentState;

        String label = "GPIO " + String(ch.pin);
        String note = "";
        bool bootSens = false;
        for (size_t i = 0; i < PIN_SAFETY_MAP_COUNT; i++) {
            if (PIN_SAFETY_MAP[i].gpio == ch.pin) {
                label = PIN_SAFETY_MAP[i].label;
                note = PIN_SAFETY_MAP[i].bootNote;
                bootSens = PIN_SAFETY_MAP[i].isBootSensitive;
                break;
            }
        }
        obj["label"] = label;
        obj["note"] = note;
        obj["bootSensitive"] = bootSens;
    }
}

void GpioManager::loadFromStorage() {
    DynamicJsonDocument doc(4096);
    if (!StorageManager::getInstance().loadJsonFile(FILE_GPIO_CONFIG, doc)) {
        return;
    }

    _channels.clear();
    uint8_t maxId = 0;
    JsonArray arr = doc.as<JsonArray>();
    for (JsonObject obj : arr) {
        GpioChannel ch;
        ch.id = obj["id"] | (uint8_t)(obj["channel_id"] | (maxId + 1));
        ch.pin = obj["pin"] | 100;
        String loadedName = obj["name"] | "";
        ch.name = (loadedName.length() > 0) ? loadedName : String(F("Output ")) + String(ch.id);
        String loadedRoom = obj["room"] | "";
        ch.room = (loadedRoom.length() > 0) ? loadedRoom : F("General");
        String loadedFunc = obj["function"] | "";
        ch.function = (loadedFunc.length() > 0) ? loadedFunc : F("Relay");
        ch.activeLow = obj.containsKey("activeLow") ? obj["activeLow"].as<bool>() : (obj.containsKey("active_low") ? obj["active_low"].as<bool>() : true);
        ch.initialMode = obj.containsKey("initialMode") ? obj["initialMode"].as<uint8_t>() : (obj.containsKey("initial_mode") ? obj["initial_mode"].as<uint8_t>() : 0);
        ch.enabled = obj.containsKey("enabled") ? obj["enabled"].as<bool>() : true;
        ch.currentState = obj.containsKey("state") ? obj["state"].as<bool>() : false;
        ch.pulseEndTime = 0;

        if (ch.id > maxId) maxId = ch.id;
        _channels.push_back(ch);
    }
    _nextId = maxId + 1;
    Serial.printf("[GPIO] Loaded %u channel(s) from LittleFS storage.\n", (unsigned int)_channels.size());
}

void GpioManager::saveToStorage() {
    DynamicJsonDocument doc(2048);
    JsonArray arr = doc.to<JsonArray>();
    for (const auto& ch : _channels) {
        JsonObject obj = arr.createNestedObject();
        obj["id"] = ch.id;
        obj["pin"] = ch.pin;
        obj["name"] = ch.name;
        obj["room"] = ch.room;
        obj["function"] = ch.function;
        obj["activeLow"] = ch.activeLow;
        obj["initialMode"] = ch.initialMode;
        obj["enabled"] = ch.enabled;
        obj["state"] = ch.currentState;
    }
    StorageManager::getInstance().saveJsonFile(FILE_GPIO_CONFIG, doc);
}

bool GpioManager::fromJson(JsonArray& arr) {
    _channels.clear();
    uint8_t maxId = 0;
    for (JsonObject obj : arr) {
        GpioChannel ch;
        ch.id = obj["id"] | (uint8_t)(obj["channel_id"] | (maxId + 1));
        ch.pin = obj["pin"] | 100;
        String loadedName = obj["name"] | "";
        ch.name = (loadedName.length() > 0) ? loadedName : String(F("Output ")) + String(ch.id);
        String loadedRoom = obj["room"] | "";
        ch.room = (loadedRoom.length() > 0) ? loadedRoom : F("General");
        String loadedFunc = obj["function"] | "";
        ch.function = (loadedFunc.length() > 0) ? loadedFunc : F("Relay");
        ch.activeLow = obj.containsKey("activeLow") ? obj["activeLow"].as<bool>() : (obj.containsKey("active_low") ? obj["active_low"].as<bool>() : true);
        ch.initialMode = obj.containsKey("initialMode") ? obj["initialMode"].as<uint8_t>() : (obj.containsKey("initial_mode") ? obj["initial_mode"].as<uint8_t>() : 0);
        ch.enabled = obj.containsKey("enabled") ? obj["enabled"].as<bool>() : true;
        ch.currentState = obj.containsKey("state") ? obj["state"].as<bool>() : false;
        ch.pulseEndTime = 0;

        applyPhysicalPin(ch);

        if (ch.id > maxId) maxId = ch.id;
        _channels.push_back(ch);
    }
    _nextId = maxId + 1;
    saveToStorage();
    return true;
}

bool GpioManager::isPcfDetected() const {
    return Pcf8574Driver::getInstance().isDetected();
}

uint8_t GpioManager::getPcfAddress() const {
    return Pcf8574Driver::getInstance().getAddress();
}

uint8_t GpioManager::getPcfOutputByte() const {
    return Pcf8574Driver::getInstance().getOutputByte();
}

#else
#include "gpio_manager.h"
#include "storage_manager.h"
#include "ir_manager.h"
#if FEATURE_PCF8574
#include "drivers/pcf8574_driver.h"
#endif

struct ProgPinSafety {
    uint8_t gpio;
    bool bootSensitive;
    const char* label;
    const char* bootNote;
};

static const char PIN_LBL_D1[]  PROGMEM = "D1 (GPIO5)";
static const char PIN_NTE_D1[]  PROGMEM = "Safe I2C SCL, boot-neutral";
static const char PIN_LBL_D2[]  PROGMEM = "D2 (GPIO4)";
static const char PIN_NTE_D2[]  PROGMEM = "Safe I2C SDA, boot-neutral";
static const char PIN_LBL_D5[]  PROGMEM = "D5 (GPIO14)";
static const char PIN_NTE_D5[]  PROGMEM = "Safe SPI CLK, boot-neutral";
static const char PIN_LBL_D6[]  PROGMEM = "D6 (GPIO12)";
static const char PIN_NTE_D6[]  PROGMEM = "Safe SPI MISO, boot-neutral";
static const char PIN_LBL_D7[]  PROGMEM = "D7 (GPIO13)";
static const char PIN_NTE_D7[]  PROGMEM = "Safe SPI MOSI, boot-neutral";
static const char PIN_LBL_D0[]  PROGMEM = "D0 (GPIO16)";
static const char PIN_NTE_D0[]  PROGMEM = "WAKE pin, HIGH at boot";
static const char PIN_LBL_D8[]  PROGMEM = "D8 (GPIO15)";
static const char PIN_NTE_D8[]  PROGMEM = "Boot config (pulled LOW), must be LOW at boot";
static const char PIN_LBL_D3[]  PROGMEM = "D3 (GPIO0)";
static const char PIN_NTE_D3[]  PROGMEM = "Boot config (Flash button), must be HIGH at boot";
static const char PIN_LBL_D4[]  PROGMEM = "D4 (GPIO2)";
static const char PIN_NTE_D4[]  PROGMEM = "Boot config (TXD1/LED), must be HIGH at boot";
static const char PIN_LBL_RX[]  PROGMEM = "RX (GPIO3)";
static const char PIN_NTE_RX[]  PROGMEM = "UART0 RX, serial debug input";
static const char PIN_LBL_TX[]  PROGMEM = "TX (GPIO1)";
static const char PIN_NTE_TX[]  PROGMEM = "UART0 TX, serial debug output (HIGH at boot)";
static const char PIN_LBL_SD2[] PROGMEM = "SD2 (GPIO9)";
static const char PIN_NTE_SD2[] PROGMEM = "Flash IO SD2 (usable in DIO/DOUT mode)";
static const char PIN_LBL_SD3[] PROGMEM = "SD3 (GPIO10)";
static const char PIN_NTE_SD3[] PROGMEM = "Flash IO SD3 (usable in DIO/DOUT mode)";
static const char PIN_LBL_A0[]  PROGMEM = "A0 (ADC0)";
static const char PIN_NTE_A0[]  PROGMEM = "Dedicated Analog Voltage Input (0-3.3V / 0-1023)";

static const ProgPinSafety PROG_PIN_MAP[] PROGMEM = {
    { D1,  false, PIN_LBL_D1,  PIN_NTE_D1 },
    { D2,  false, PIN_LBL_D2,  PIN_NTE_D2 },
    { D5,  false, PIN_LBL_D5,  PIN_NTE_D5 },
    { D6,  false, PIN_LBL_D6,  PIN_NTE_D6 },
    { D7,  false, PIN_LBL_D7,  PIN_NTE_D7 },
    { D0,  true,  PIN_LBL_D0,  PIN_NTE_D0 },
    { D8,  true,  PIN_LBL_D8,  PIN_NTE_D8 },
    { D3,  true,  PIN_LBL_D3,  PIN_NTE_D3 },
    { D4,  true,  PIN_LBL_D4,  PIN_NTE_D4 },
    { RX,  true,  PIN_LBL_RX,  PIN_NTE_RX },
    { TX,  true,  PIN_LBL_TX,  PIN_NTE_TX },
    { SD2, true,  PIN_LBL_SD2, PIN_NTE_SD2 },
    { SD3, true,  PIN_LBL_SD3, PIN_NTE_SD3 },
    { 17,  false, PIN_LBL_A0,  PIN_NTE_A0 },
};

static bool lookupPinSafetyProg(uint8_t pin, String& label, String& note, bool& bootSens) {
    if (IS_PCF_PIN(pin)) {
        uint8_t idx = PCF_PIN_INDEX(pin);
        label = String(F("P")) + String(idx) + F(" (PCF8574 Relay ") + String(idx + 1) + F(")");
        note = String(F("I2C Expander Pin P")) + String(idx) + F(" (Safe isolated relay output)");
        bootSens = false;
        return true;
    }
    for (size_t i = 0; i < sizeof(PROG_PIN_MAP) / sizeof(PROG_PIN_MAP[0]); i++) {
        uint8_t g = pgm_read_byte(&PROG_PIN_MAP[i].gpio);
        if (g == pin) {
            bootSens = pgm_read_byte(&PROG_PIN_MAP[i].bootSensitive) != 0;
            label = FPSTR((PGM_P)pgm_read_ptr(&PROG_PIN_MAP[i].label));
            note = FPSTR((PGM_P)pgm_read_ptr(&PROG_PIN_MAP[i].bootNote));
            return true;
        }
    }
    label = String(F("GPIO")) + String(pin);
    note = F("Pin is reserved by ESP8266 system/SPI-flash/UART");
    bootSens = true;
    return false;
}

static void sampleAnalogA0(float& outDcVolt, float& outAcRmsVolt, int& outRawAvg) {
    const int kSamples = 64; // ~20ms window across one 50Hz mains cycle
    int samples[kSamples];
    long sum = 0;
    for (int i = 0; i < kSamples; i++) {
        int s = analogRead(A0);
        samples[i] = s;
        sum += s;
        delayMicroseconds(300);
    }
    float mean = (float)sum / (float)kSamples;
    float sumSq = 0.0f;
    for (int i = 0; i < kSamples; i++) {
        float diff = (float)samples[i] - mean;
        sumSq += diff * diff;
    }
    outRawAvg = (int)(mean + 0.5f);
    outDcVolt = (mean * 3.3f) / 1024.0f;
    outAcRmsVolt = (sqrtf(sumSq / (float)kSamples) * 3.3f) / 1024.0f;
}

static inline void copyField(char* dst, size_t dstSize, const char* src) {
    if (!src) { dst[0] = '\0'; return; }
    strncpy(dst, src, dstSize - 1);
    dst[dstSize - 1] = '\0';
}

static bool containsIgnoreCase(const char* hay, const char* needle) {
    if (!hay || !needle || !*needle) return false;
    size_t nlen = strlen(needle);
    for (; *hay; hay++) {
        if (strncasecmp(hay, needle, nlen) == 0) return true;
    }
    return false;
}

GpioManager::GpioManager()
    : _stateCallback(nullptr),
      _nextId(1),
      _i2cEnabled(false),
      _i2cSdaPin(4),
      _i2cSclPin(5),
      _i2cAddress(0x27) {
    _channels.reserve(MAX_GPIO_CHANNELS);
}

GpioManager& GpioManager::getInstance() {
    static GpioManager instance;
    return instance;
}

bool GpioManager::isPinSafe(uint8_t pin, String& note, bool& bootSensitive) {
    if (IS_PCF_PIN(pin)) {
        if (_i2cEnabled) {
            note = String(F("I2C PCF8574 Pin P")) + String(PCF_PIN_INDEX(pin)) + F(" (Safe isolated expander output)");
            bootSensitive = false;
            return true;
        } else {
            note = F("I2C Expander is disabled. Enable I2C in GPIO settings first.");
            bootSensitive = false;
            return false;
        }
    }

    if (_i2cEnabled && (pin == _i2cSdaPin || pin == _i2cSclPin)) {
        note = (pin == _i2cSdaPin) ? F("Pin reserved for I2C SDA") : F("Pin reserved for I2C SCL");
        bootSensitive = false;
        return false;
    }

    String lbl;
    return lookupPinSafetyProg(pin, lbl, note, bootSensitive);
}

bool GpioManager::isPinAssigned(uint8_t pin, uint8_t excludeId) {
    if (_i2cEnabled && (pin == _i2cSdaPin || pin == _i2cSclPin)) {
        return true;
    }
    for (const auto& ch : _channels) {
        if (ch.pin == pin && ch.id != excludeId) {
            return true;
        }
    }
    return false;
}

static void classifyChannel(uint8_t pin, const char* fn, bool& isSensor, const char*& type, const char*& unit) {
    isSensor = (pin == 17) ||
               containsIgnoreCase(fn, "voltage") ||
               containsIgnoreCase(fn, "ir receiver") ||
               containsIgnoreCase(fn, "pir") ||
               containsIgnoreCase(fn, "motion") ||
               containsIgnoreCase(fn, "door") ||
               containsIgnoreCase(fn, "window") ||
               containsIgnoreCase(fn, "sensor");

    type = "RELAY";
    unit = "BOOL";

    if (pin == 17 || containsIgnoreCase(fn, "voltage")) {
        type = "VOLTAGE_ADC";
        unit = "V";
    } else if (containsIgnoreCase(fn, "ir receiver")) {
        type = "IR_RECEIVER";
        unit = "HEX";
    } else if (containsIgnoreCase(fn, "ir transmitter")) {
        type = "IR_TRANSMITTER";
        unit = "HEX";
    } else if (containsIgnoreCase(fn, "pir") || containsIgnoreCase(fn, "motion")) {
        type = "PIR_MOTION";
        unit = "STATE";
    } else if (containsIgnoreCase(fn, "door") || containsIgnoreCase(fn, "window")) {
        type = "DOOR_SENSOR";
        unit = "STATE";
    } else if (fn && strcasecmp(fn, "light") == 0) {
        type = "LIGHT";
        unit = "BOOL";
    } else if (fn && strcasecmp(fn, "fan") == 0) {
        type = "FAN";
        unit = "BOOL";
    }
}

void GpioManager::applyPhysicalPin(const GpioChannel& channel) {
    // If I2C is enabled and this channel pin is assigned to I2C SDA or SCL, NEVER set it to OUTPUT!
    if (_i2cEnabled && (channel.pin == _i2cSdaPin || channel.pin == _i2cSclPin)) {
        return;
    }

    bool isSensor = false;
    const char* type = nullptr;
    const char* unit = nullptr;
    classifyChannel(channel.pin, channel.function, isSensor, type, unit);
    bool isIrTx = (strcmp(type, "IR_TRANSMITTER") == 0);

    if (!channel.enabled) {
        // Disabled channel defaults to safe off (high-impedance input for native pins)
        if (!IS_PCF_PIN(channel.pin) && channel.pin <= 16) {
            pinMode(channel.pin, INPUT);
        }
        return;
    }

    if (isSensor) {
        if (!IS_PCF_PIN(channel.pin) && channel.pin <= 16) {
            pinMode(channel.pin, (channel.pin == 17) ? INPUT : INPUT_PULLUP);
            if (strcasecmp(channel.function, "IR Receiver") == 0) {
                IrManager::getInstance().setReceiverPin(channel.pin);
            }
        }
        return; // Guard: NEVER drive sensors as digital outputs!
    }

    if (isIrTx) {
        if (!IS_PCF_PIN(channel.pin) && channel.pin <= 16) {
            IrManager::getInstance().setTransmitterPin(channel.pin);
        }
        return; // Managed by IrManager IRsend
    }

    int physicalLevel = channel.activeLow ? (channel.currentState ? LOW : HIGH) : (channel.currentState ? HIGH : LOW);

    if (IS_PCF_PIN(channel.pin)) {
#if FEATURE_PCF8574
        if (_i2cEnabled) {
            Pcf8574Driver::getInstance().setPin(PCF_PIN_INDEX(channel.pin), physicalLevel == HIGH);
        }
#endif
        return;
    }

    if (channel.pin <= 16) {
        digitalWrite(channel.pin, physicalLevel);
        pinMode(channel.pin, OUTPUT);
    }
}

bool GpioManager::addPcfChannels() {
    String err;
    bool anyAdded = false;
    for (uint8_t i = 0; i < 8; i++) {
        uint8_t pin = PCF_PIN_BASE + i;
        if (!isPinAssigned(pin)) {
            addChannel(pin, "PCF Relay " + String(i + 1), "General", "Relay", true, INITIAL_MODE_RESTORE_LAST, err);
            anyAdded = true;
        }
    }
    return anyAdded;
}

bool GpioManager::begin() {
    // 1. Load I2C Configuration
    DynamicJsonDocument i2cDoc(256);
    if (StorageManager::getInstance().loadJsonFile(FILE_I2C_CONFIG, i2cDoc)) {
        if (i2cDoc.containsKey("enabled")) _i2cEnabled = i2cDoc["enabled"].as<bool>();
        if (i2cDoc.containsKey("sdaPin")) _i2cSdaPin = i2cDoc["sdaPin"].as<uint8_t>();
        if (i2cDoc.containsKey("sclPin")) _i2cSclPin = i2cDoc["sclPin"].as<uint8_t>();
        if (i2cDoc.containsKey("address")) _i2cAddress = i2cDoc["address"].as<uint8_t>();
    }

#if FEATURE_PCF8574
    if (_i2cEnabled) {
        Serial.printf_P(PSTR("[GPIO] Initializing I2C Bus: SDA=GPIO%u, SCL=GPIO%u, defaultAddr=0x%02X\n"),
                      _i2cSdaPin, _i2cSclPin, _i2cAddress);
        Pcf8574Driver::getInstance().begin(_i2cSdaPin, _i2cSclPin, _i2cAddress);
        if (Pcf8574Driver::getInstance().isDetected()) {
            _i2cAddress = Pcf8574Driver::getInstance().getAddress();
            Serial.printf_P(PSTR("[GPIO] PCF8574 Expander active at 0x%02X\n"), _i2cAddress);
            if (!i2cDoc.containsKey("address") || i2cDoc["address"].as<uint8_t>() != _i2cAddress) {
                i2cDoc["address"] = _i2cAddress;
                StorageManager::getInstance().saveJsonFile(FILE_I2C_CONFIG, i2cDoc);
            }
        }
    } else {
        Serial.println(F("[GPIO] I2C Expander is disabled. Pins D1 (GPIO 5) and D2 (GPIO 4) are free for regular outputs."));
    }
#endif

    // 2. Load GPIO Channels
    loadFromStorage();
    if (_channels.empty()) {
        // Only create initial default safe outputs if /config/gpio.json does NOT exist on flash
        if (!LittleFS.exists(FILE_GPIO_CONFIG)) {
            if (_i2cEnabled) {
                Serial.println(F("[GPIO] Creating initial PCF8574 8-Channel outputs (P0-P7)"));
                addPcfChannels();
            } else {
                Serial.println(F("[GPIO] No saved config found, creating initial default outputs (D1 & D2)"));
                String err;
                addChannel(D1, F("Living Room Light"), F("Living Room"), F("Light"), true, INITIAL_MODE_RESTORE_LAST, err);
                addChannel(D2, F("Bedroom Fan"), F("Bedroom"), F("Fan"), true, INITIAL_MODE_RESTORE_LAST, err);
            }
        } else {
            Serial.println(F("[GPIO] Existing gpio.json file found but 0 channels loaded. Preserving file."));
        }
    } else {
        // Initialize all loaded channels according to power-on behavior
        for (auto& ch : _channels) {
            if (_i2cEnabled && (ch.pin == _i2cSdaPin || ch.pin == _i2cSclPin)) {
                ch.enabled = false;
                Serial.printf_P(PSTR("[GPIO] Channel %u pin GPIO%u conflicts with I2C bus; deactivated.\n"), ch.id, ch.pin);
            }

            if (ch.initialMode == INITIAL_MODE_OFF) {
                ch.currentState = false;
            } else if (ch.initialMode == INITIAL_MODE_ON) {
                ch.currentState = true;
            } else if (ch.initialMode == INITIAL_MODE_RESTORE_LAST) {
                // ch.currentState loaded from LittleFS (/config/gpio.json) persists across reboots
                Serial.printf_P(PSTR("[GPIO] Channel %u (%s): Restored last state -> %s\n"),
                              ch.id, ch.name, ch.currentState ? "ON" : "OFF");
            }
            applyPhysicalPin(ch);
        }
    }
    return true;
}

void GpioManager::loop() {
    unsigned long now = millis();
    for (auto& ch : _channels) {
        if (ch.pulseEndTime > 0 && now >= ch.pulseEndTime) {
            ch.pulseEndTime = 0;
            ch.currentState = false;
            applyPhysicalPin(ch);
            Serial.printf_P(PSTR("[GPIO] Channel %u (%s) pulse expired -> OFF\n"), ch.id, ch.name);
            if (_stateCallback) {
                _stateCallback(ch.id, false);
            }
            saveToStorage();
        }
    }
    // 3. Poll digital input sensors (PIR / Door / generic INPUT) every 80ms
    static unsigned long lastInputPollMs = 0;
    if (now - lastInputPollMs >= 80) {
        lastInputPollMs = now;
        for (auto& ch : _channels) {
            if (!ch.enabled || IS_PCF_PIN(ch.pin) || ch.pin > 16) continue;
            if (_i2cEnabled && (ch.pin == _i2cSdaPin || ch.pin == _i2cSclPin)) continue;

            bool isSensor = false;
            const char* type = nullptr;
            const char* unit = nullptr;
            classifyChannel(ch.pin, ch.function, isSensor, type, unit);
            if (!isSensor || strcmp(type, "IR_RECEIVER") == 0) continue;

            bool raw = (digitalRead(ch.pin) == HIGH);
            bool logical = ch.activeLow ? !raw : raw;
            if (logical != ch.currentState) {
                ch.currentState = logical;
                Serial.printf_P(PSTR("[SENSOR] Channel %u (%s) -> %s\n"), ch.id, ch.name, logical ? "ACTIVE" : "IDLE");
                if (_stateCallback) {
                    _stateCallback(ch.id, logical);
                }
            }
        }
    }
}

bool GpioManager::addChannel(uint8_t pin, const String& name, const String& room, const String& function,
                            bool activeLow, uint8_t initialMode, String& outError) {
    if (_channels.size() >= MAX_GPIO_CHANNELS) {
        outError = String(F("Maximum GPIO channels reached (limit: ")) + String(MAX_GPIO_CHANNELS) + F(")");
        return false;
    }

    String note;
    bool bootSens;
    if (!isPinSafe(pin, note, bootSens)) {
        outError = note;
        return false;
    }

    if (isPinAssigned(pin)) {
        outError = F("Pin is already assigned to another channel");
        return false;
    }

    GpioChannel ch;
    ch.id = _nextId++;
    ch.pin = pin;
    if (name.length() > 0) copyField(ch.name, sizeof(ch.name), name.c_str());
    else snprintf_P(ch.name, sizeof(ch.name), PSTR("Output %u"), ch.id);
    copyField(ch.room, sizeof(ch.room), (room.length() > 0) ? room.c_str() : "General");
    copyField(ch.function, sizeof(ch.function), (function.length() > 0) ? function.c_str() : "Relay");
    ch.activeLow = activeLow;
    ch.initialMode = initialMode;
    ch.enabled = true;
    ch.currentState = (initialMode == INITIAL_MODE_ON);
    ch.pulseEndTime = 0;

    applyPhysicalPin(ch);
    _channels.push_back(ch);
    saveToStorage();

    Serial.printf_P(PSTR("[GPIO] Added Channel ID %u: Pin GPIO%u, Name: %s\n"), ch.id, ch.pin, ch.name);
    return true;
}

bool GpioManager::updateChannel(uint8_t id, const String& name, const String& room, const String& function,
                               bool activeLow, uint8_t initialMode, bool enabled, String& outError) {
    for (auto& ch : _channels) {
        if (ch.id == id) {
            if (name.length() > 0) copyField(ch.name, sizeof(ch.name), name.c_str());
            if (room.length() > 0) copyField(ch.room, sizeof(ch.room), room.c_str());
            if (function.length() > 0) copyField(ch.function, sizeof(ch.function), function.c_str());
            ch.activeLow = activeLow;
            ch.initialMode = initialMode;
            ch.enabled = enabled;
            applyPhysicalPin(ch);
            saveToStorage();
            return true;
        }
    }
    outError = F("Channel ID not found");
    return false;
}

bool GpioManager::removeChannel(uint8_t id) {
    for (auto it = _channels.begin(); it != _channels.end(); ++it) {
        if (it->id == id) {
            // Set hardware pin to safe input before deleting
            pinMode(it->pin, INPUT);
            _channels.erase(it);
            saveToStorage();
            Serial.printf_P(PSTR("[GPIO] Removed Channel ID %u\n"), id);
            return true;
        }
    }
    return false;
}

bool GpioManager::setState(uint8_t id, bool logicalState) {
    for (auto& ch : _channels) {
        if (ch.id == id && ch.enabled) {
            // Flash wear reduction: avoid rewriting flash if logical state is already set
            if (ch.currentState == logicalState && ch.pulseEndTime == 0) {
                return true;
            }

            ch.pulseEndTime = 0; // Cancel any active pulse
            ch.currentState = logicalState;
            applyPhysicalPin(ch);
            Serial.printf_P(PSTR("[GPIO] Channel %u (%s) -> %s\n"), ch.id, ch.name, logicalState ? "ON" : "OFF");
            if (_stateCallback) {
                _stateCallback(ch.id, logicalState);
            }
            saveToStorage(); // Atomic LittleFS write
            return true;
        }
    }
    return false;
}

bool GpioManager::toggle(uint8_t id) {
    for (auto& ch : _channels) {
        if (ch.id == id && ch.enabled) {
            return setState(id, !ch.currentState);
        }
    }
    return false;
}

bool GpioManager::pulse(uint8_t id, unsigned long durationMs) {
    for (auto& ch : _channels) {
        if (ch.id == id && ch.enabled) {
            ch.currentState = true;
            applyPhysicalPin(ch);
            ch.pulseEndTime = millis() + ((durationMs > 0) ? durationMs : 500);
            Serial.printf_P(PSTR("[GPIO] Channel %u (%s) pulsed for %lu ms\n"), ch.id, ch.name, durationMs);
            if (_stateCallback) {
                _stateCallback(ch.id, true);
            }
            return true;
        }
    }
    return false;
}

GpioChannel* GpioManager::getChannel(uint8_t id) {
    for (auto& ch : _channels) {
        if (ch.id == id) return &ch;
    }
    return nullptr;
}

void GpioManager::toJson(JsonArray& arr, bool sensorsOnly) {
    for (const auto& ch : _channels) {
        bool isSensor = false;
        const char* type = "RELAY";
        const char* unit = "BOOL";
        classifyChannel(ch.pin, ch.function, isSensor, type, unit);
        if (sensorsOnly && !isSensor) continue;

        JsonObject obj = arr.createNestedObject();
        obj["id"] = ch.id;
        obj["pin"] = ch.pin;
        obj["enabled"] = ch.enabled;
        obj["state"] = ch.currentState;

        obj["name"] = (ch.name[0] != '\0') ? String(ch.name) : String(F("Output ")) + String(ch.id);
        obj["room"] = (ch.room[0] != '\0') ? ch.room : "General";
        obj["function"] = (ch.function[0] != '\0') ? ch.function : "Relay";
        obj["activeLow"] = ch.activeLow;
        obj["initialMode"] = ch.initialMode;

        String pLabel, pNote;
        bool bootSens = false;
        lookupPinSafetyProg(ch.pin, pLabel, pNote, bootSens);
        obj["label"] = pLabel;
        obj["note"] = pNote;
        obj["bootSensitive"] = bootSens;

        const char* direction = isSensor ? "INPUT" : "OUTPUT";
        obj["direction"] = direction;
        obj["type"] = type;
        obj["isSensor"] = isSensor;
        obj["unit"] = unit;

        JsonArray caps = obj.createNestedArray("capabilities");
        if (isSensor) {
            caps.add("read");
            if (strcmp(type, "VOLTAGE_ADC") == 0) {
                caps.add("telemetry");
                float dcVolt = 0.0f, acRms = 0.0f;
                int rawAdc = 0;
                sampleAnalogA0(dcVolt, acRms, rawAdc);
                bool useRms = (containsIgnoreCase(ch.function, "rms") || containsIgnoreCase(ch.function, "ac"));
                obj["value"] = useRms ? acRms : dcVolt;
                obj["dcVoltage"] = dcVolt;
                obj["acRms"] = acRms;
                obj["rawAdc"] = rawAdc;
            } else if (strcmp(type, "IR_RECEIVER") == 0) {
                caps.add("ir_learn");
                caps.add("event_stream");
                String proto, hexCode;
                uint16_t bits;
                unsigned long age;
                if (IrManager::getInstance().getLastCaptured(proto, hexCode, bits, age)) {
                    obj["lastCode"] = hexCode;
                    obj["protocol"] = proto;
                    obj["bits"] = bits;
                    obj["ageMs"] = age;
                }
                obj["isTraining"] = IrManager::getInstance().isTraining();
                obj["value"] = 0;
            } else {
                caps.add("event_stream");
                obj["value"] = ch.currentState ? 1 : 0;
            }
        } else if (strcmp(type, "IR_TRANSMITTER") == 0) {
            caps.add("ir_transmit");
            obj["value"] = 0;
        } else {
            caps.add("write");
            caps.add("toggle");
            caps.add("pulse");
            obj["value"] = ch.currentState ? 1 : 0;
        }
    }
}

void GpioManager::toTelemetryJson(JsonArray& channels, JsonArray& sensors) {
    for (const auto& ch : _channels) {
        bool isSensor = false;
        const char* type = "RELAY";
        const char* unit = "BOOL";
        classifyChannel(ch.pin, ch.function, isSensor, type, unit);
        const char* direction = isSensor ? "INPUT" : "OUTPUT";

        JsonObject c = channels.createNestedObject();
        c["id"] = ch.id;
        c["pin"] = ch.pin;
        c["enabled"] = ch.enabled;
        c["state"] = ch.currentState;
        c["name"] = ch.name;
        c["room"] = ch.room;
        c["function"] = ch.function;
        c["direction"] = direction;
        c["type"] = type;
        c["isSensor"] = isSensor;

        if (isSensor) {
            JsonObject s = sensors.createNestedObject();
            s["id"] = ch.id;
            s["channel_id"] = ch.id;
            s["pin"] = ch.pin;
            s["name"] = ch.name;
            s["room"] = ch.room;
            s["direction"] = "INPUT";
            s["type"] = type;
            s["unit"] = unit;

            if (strcmp(type, "VOLTAGE_ADC") == 0) {
                float dcVolt = 0.0f, acRms = 0.0f;
                int rawAdc = 0;
                sampleAnalogA0(dcVolt, acRms, rawAdc);
                s["value"] = dcVolt;
                s["acRms"] = acRms;
                s["rawAdc"] = rawAdc;
            } else if (strcmp(type, "IR_RECEIVER") == 0) {
                String proto, hexCode;
                uint16_t bits;
                unsigned long age;
                if (IrManager::getInstance().getLastCaptured(proto, hexCode, bits, age)) {
                    s["code"] = hexCode;
                    s["strValue"] = hexCode;
                    s["protocol"] = proto;
                }
                s["value"] = 0;
            } else {
                s["value"] = ch.currentState ? 1 : 0;
            }
        }
    }
}

void GpioManager::loadFromStorage() {
    DynamicJsonDocument doc(4096);
    if (!StorageManager::getInstance().loadJsonFile(FILE_GPIO_CONFIG, doc)) {
        return;
    }

    _channels.clear();
    uint8_t maxId = 0;
    JsonArray arr = doc.as<JsonArray>();
    for (JsonObject obj : arr) {
        GpioChannel ch;
        ch.id = obj["id"] | (uint8_t)(obj["channel_id"] | (maxId + 1));
        ch.pin = obj["pin"] | D1;
        const char* loadedName = obj["name"] | "";
        if (loadedName[0] != '\0') copyField(ch.name, sizeof(ch.name), loadedName);
        else snprintf_P(ch.name, sizeof(ch.name), PSTR("Output %u"), ch.id);
        const char* loadedRoom = obj["room"] | "";
        copyField(ch.room, sizeof(ch.room), (loadedRoom[0] != '\0') ? loadedRoom : "General");
        const char* loadedFunc = obj["function"] | "";
        copyField(ch.function, sizeof(ch.function), (loadedFunc[0] != '\0') ? loadedFunc : "Relay");
        ch.activeLow = obj.containsKey("activeLow") ? obj["activeLow"].as<bool>() : (obj.containsKey("active_low") ? obj["active_low"].as<bool>() : true);
        ch.initialMode = obj.containsKey("initialMode") ? obj["initialMode"].as<uint8_t>() : (obj.containsKey("initial_mode") ? obj["initial_mode"].as<uint8_t>() : 0);
        ch.enabled = obj.containsKey("enabled") ? obj["enabled"].as<bool>() : true;
        ch.currentState = obj.containsKey("state") ? obj["state"].as<bool>() : false;
        ch.pulseEndTime = 0;

        if (ch.id > maxId) maxId = ch.id;
        _channels.push_back(ch);
    }
    _nextId = maxId + 1;
    Serial.printf_P(PSTR("[GPIO] Loaded %u channel(s) from LittleFS storage.\n"), (unsigned int)_channels.size());
}

void GpioManager::saveToStorage() {
    DynamicJsonDocument doc(4096);
    JsonArray arr = doc.to<JsonArray>();
    for (const auto& ch : _channels) {
        JsonObject obj = arr.createNestedObject();
        obj["id"] = ch.id;
        obj["pin"] = ch.pin;
        obj["name"] = ch.name;
        obj["room"] = ch.room;
        obj["function"] = ch.function;
        obj["activeLow"] = ch.activeLow;
        obj["initialMode"] = ch.initialMode;
        obj["enabled"] = ch.enabled;
        obj["state"] = ch.currentState;
    }
    StorageManager::getInstance().saveJsonFile(FILE_GPIO_CONFIG, doc);
}

bool GpioManager::fromJson(JsonArray& arr) {
    _channels.clear();
    uint8_t maxId = 0;
    for (JsonObject obj : arr) {
        GpioChannel ch;
        ch.id = obj["id"] | (uint8_t)(obj["channel_id"] | (maxId + 1));
        ch.pin = obj["pin"] | D1;
        const char* loadedName = obj["name"] | "";
        if (loadedName[0] != '\0') copyField(ch.name, sizeof(ch.name), loadedName);
        else snprintf_P(ch.name, sizeof(ch.name), PSTR("Output %u"), ch.id);
        const char* loadedRoom = obj["room"] | "";
        copyField(ch.room, sizeof(ch.room), (loadedRoom[0] != '\0') ? loadedRoom : "General");
        const char* loadedFunc = obj["function"] | "";
        copyField(ch.function, sizeof(ch.function), (loadedFunc[0] != '\0') ? loadedFunc : "Relay");
        ch.activeLow = obj.containsKey("activeLow") ? obj["activeLow"].as<bool>() : (obj.containsKey("active_low") ? obj["active_low"].as<bool>() : true);
        ch.initialMode = obj.containsKey("initialMode") ? obj["initialMode"].as<uint8_t>() : (obj.containsKey("initial_mode") ? obj["initial_mode"].as<uint8_t>() : 0);
        ch.enabled = obj.containsKey("enabled") ? obj["enabled"].as<bool>() : true;
        ch.currentState = obj.containsKey("state") ? obj["state"].as<bool>() : false;
        ch.pulseEndTime = 0;

        applyPhysicalPin(ch);

        if (ch.id > maxId) maxId = ch.id;
        _channels.push_back(ch);
    }
    _nextId = maxId + 1;
    saveToStorage();
    return true;
}

#endif

bool GpioManager::isPcfDetected() const {
#if FEATURE_PCF8574
    if (!_i2cEnabled) return false;
    if (Pcf8574Driver::getInstance().isDetected()) return true;
    return const_cast<Pcf8574Driver&>(Pcf8574Driver::getInstance()).probe(_i2cAddress);
#else
    return false;
#endif
}

uint8_t GpioManager::getPcfAddress() const {
#if FEATURE_PCF8574
    return Pcf8574Driver::getInstance().getAddress();
#else
    return 0;
#endif
}

uint8_t GpioManager::getPcfOutputByte() const {
#if FEATURE_PCF8574
    return Pcf8574Driver::getInstance().getOutputByte();
#else
    return 0xFF;
#endif
}

bool GpioManager::setI2cConfig(bool enabled, uint8_t sdaPin, uint8_t sclPin, uint8_t addr) {
    _i2cEnabled = enabled;
    _i2cSdaPin = sdaPin;
    _i2cSclPin = sclPin;
    _i2cAddress = addr;

#if FEATURE_PCF8574
    if (_i2cEnabled) {
        Pcf8574Driver::getInstance().begin(_i2cSdaPin, _i2cSclPin, _i2cAddress);
        if (Pcf8574Driver::getInstance().isDetected()) {
            _i2cAddress = Pcf8574Driver::getInstance().getAddress();
        }
        Serial.printf_P(PSTR("[GPIO] I2C Enabled at 0x%02X (SDA=%u, SCL=%u, Detected=%s)\n"),
                      _i2cAddress, _i2cSdaPin, _i2cSclPin,
                      Pcf8574Driver::getInstance().isDetected() ? "YES" : "NO");

        // Deactivate conflicting channels on SDA/SCL pins
        for (auto& ch : _channels) {
            if (ch.pin == _i2cSdaPin || ch.pin == _i2cSclPin) {
                ch.enabled = false;
            }
        }
        saveToStorage();
    } else {
        // I2C Disabled: release pins so they can be driven as normal GPIO outputs
        pinMode(_i2cSdaPin, INPUT);
        pinMode(_i2cSclPin, INPUT);
        Serial.printf_P(PSTR("[GPIO] I2C Disabled. Pins %u and %u released for regular GPIO use.\n"), _i2cSdaPin, _i2cSclPin);
    }
#endif

    DynamicJsonDocument doc(256);
    doc["enabled"] = _i2cEnabled;
    doc["sdaPin"] = _i2cSdaPin;
    doc["sclPin"] = _i2cSclPin;
    doc["address"] = _i2cAddress;
    StorageManager::getInstance().saveJsonFile(FILE_I2C_CONFIG, doc);

    return true;
}
