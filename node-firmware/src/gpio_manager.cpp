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
    for (size_t i = 0; i < PIN_SAFETY_MAP_COUNT; i++) {
        if (PIN_SAFETY_MAP[i].gpio == pin) {
            note = PIN_SAFETY_MAP[i].bootNote;
            bootSensitive = PIN_SAFETY_MAP[i].isBootSensitive;
            return PIN_SAFETY_MAP[i].isSafeRelay;
        }
    }
    note = F("Pin is reserved by ESP8266 system/SPI-flash/UART");
    bootSensitive = true;
    return false;
}

bool GpioManager::isPinAssigned(uint8_t pin, uint8_t excludeId) {
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
    DynamicJsonDocument doc(4096);
    JsonArray arr = doc.to<JsonArray>();
    toJson(arr);
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

GpioManager::GpioManager() : _stateCallback(nullptr), _nextId(1) {}

GpioManager& GpioManager::getInstance() {
    static GpioManager instance;
    return instance;
}

bool GpioManager::isPinSafe(uint8_t pin, String& note, bool& bootSensitive) {
    for (size_t i = 0; i < PIN_SAFETY_MAP_COUNT; i++) {
        if (PIN_SAFETY_MAP[i].gpio == pin) {
            note = PIN_SAFETY_MAP[i].bootNote;
            bootSensitive = PIN_SAFETY_MAP[i].isBootSensitive;
            return true;
        }
    }
    note = F("Pin is reserved by ESP8266 system/SPI-flash/UART");
    bootSensitive = true;
    return false;
}

bool GpioManager::isPinAssigned(uint8_t pin, uint8_t excludeId) {
    for (const auto& ch : _channels) {
        if (ch.pin == pin && ch.id != excludeId) {
            return true;
        }
    }
    return false;
}

void GpioManager::applyPhysicalPin(const GpioChannel& channel) {
    if (!channel.enabled) {
        // Disabled channel defaults to safe off (high-impedance input)
        pinMode(channel.pin, INPUT);
        return;
    }

    // Set output level register BEFORE configuring pinMode to OUTPUT
    // This prevents any microsecond glitch/click on active-low optical relays during boot
    int physicalLevel = channel.activeLow ? (channel.currentState ? LOW : HIGH) : (channel.currentState ? HIGH : LOW);
    digitalWrite(channel.pin, physicalLevel);
    pinMode(channel.pin, OUTPUT);
}

bool GpioManager::begin() {
    loadFromStorage();
    if (_channels.empty()) {
        // Only create initial default safe outputs if /config/gpio.json does NOT exist on flash
        if (!LittleFS.exists(FILE_GPIO_CONFIG)) {
            Serial.println(F("[GPIO] No saved config found, creating initial default outputs (D1 & D2)"));
            String err;
            addChannel(D1, F("Living Room Light"), F("Living Room"), F("Light"), true, INITIAL_MODE_RESTORE_LAST, err);
            addChannel(D2, F("Bedroom Fan"), F("Bedroom"), F("Fan"), true, INITIAL_MODE_RESTORE_LAST, err);
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
                // ch.currentState loaded from LittleFS (/config/gpio.json) persists across reboots
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
    ch.currentState = (initialMode == INITIAL_MODE_ON);
    ch.pulseEndTime = 0;

    applyPhysicalPin(ch);
    _channels.push_back(ch);
    saveToStorage();

    Serial.printf("[GPIO] Added Channel ID %u: Pin GPIO%u, Name: %s\n", ch.id, ch.pin, ch.name.c_str());
    return true;
}

bool GpioManager::updateChannel(uint8_t id, const String& name, const String& room, const String& function,
                               bool activeLow, uint8_t initialMode, bool enabled, String& outError) {
    for (auto& ch : _channels) {
        if (ch.id == id) {
            if (name.length() > 0) ch.name = name;
            if (room.length() > 0) ch.room = room;
            if (function.length() > 0) ch.function = function;
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
            Serial.printf("[GPIO] Removed Channel ID %u\n", id);
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
            Serial.printf("[GPIO] Channel %u (%s) -> %s\n", ch.id, ch.name.c_str(), logicalState ? "ON" : "OFF");
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
            Serial.printf("[GPIO] Channel %u (%s) pulsed for %lu ms\n", ch.id, ch.name.c_str(), durationMs);
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

void GpioManager::toJson(JsonArray& arr) {
    for (const auto& ch : _channels) {
        JsonObject obj = arr.createNestedObject();
        obj["id"] = ch.id;
        obj["pin"] = ch.pin;
        obj["enabled"] = ch.enabled;
        obj["state"] = ch.currentState;

        // Find pin label
        String label = String("GPIO") + String(ch.pin);
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
        obj["name"] = (ch.name.length() > 0) ? ch.name : String(F("Output ")) + String(ch.id);
        obj["room"] = (ch.room.length() > 0) ? ch.room : F("General");
        obj["function"] = (ch.function.length() > 0) ? ch.function : F("Relay");
        obj["activeLow"] = ch.activeLow;
        obj["initialMode"] = ch.initialMode;
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
    DynamicJsonDocument doc(4096);
    JsonArray arr = doc.to<JsonArray>();
    toJson(arr);
    StorageManager::getInstance().saveJsonFile(FILE_GPIO_CONFIG, doc);
}

bool GpioManager::fromJson(JsonArray& arr) {
    _channels.clear();
    uint8_t maxId = 0;
    for (JsonObject obj : arr) {
        GpioChannel ch;
        ch.id = obj["id"] | (uint8_t)(obj["channel_id"] | (maxId + 1));
        ch.pin = obj["pin"] | D1;
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

        pinMode(ch.pin, OUTPUT);
        applyPhysicalPin(ch);

        if (ch.id > maxId) maxId = ch.id;
        _channels.push_back(ch);
    }
    _nextId = maxId + 1;
    saveToStorage();
    return true;
}

#endif
