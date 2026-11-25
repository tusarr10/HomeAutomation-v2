#ifndef GPIO_MANAGER_H
#define GPIO_MANAGER_H

#if defined(TARGET_ESP01_1M)

#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"

struct GpioChannel {
    uint8_t id;
    uint8_t pin;
    String name;
    String room;
    String function;
    bool activeLow;
    uint8_t initialMode;
    bool enabled;
    bool currentState;
    unsigned long pulseEndTime;
};

typedef void (*GpioStateChangeCallback)(uint8_t id, bool newState);

class GpioManager {
public:
    static GpioManager& getInstance();

    bool begin();
    void loop();

    bool setState(uint8_t id, bool logicalState);
    bool toggle(uint8_t id);
    bool pulse(uint8_t id, unsigned long durationMs);

    bool saveChannels(const JsonArrayConst& channels);
    bool addOrUpdateChannel(uint8_t id, uint8_t pin, const String& name, const String& room,
                            const String& function, bool activeLow, uint8_t initialMode, bool enabled);
    bool removeChannel(uint8_t id);
    size_t getChannelCount() const { return _channelCount; }

    void registerStateChangeCallback(GpioStateChangeCallback cb) { _stateCallback = cb; }
    void toJson(JsonArray& arr);

private:
    GpioManager();
    GpioStateChangeCallback _stateCallback;
    GpioChannel _channels[MAX_GPIO_CHANNELS];
    size_t _channelCount;

    void applyPhysicalPin(size_t index);
    void saveStates();
    void saveConfiguration();
};

#elif defined(TARGET_ESP01_PCF8574)

#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"

struct GpioChannel {
    uint8_t id;
    uint8_t pin;
    String name;
    String room;
    String function;
    bool activeLow;
    uint8_t initialMode;
    bool enabled;
    bool currentState;
    unsigned long pulseEndTime;
};

typedef void (*GpioStateChangeCallback)(uint8_t id, bool newState);

class GpioManager {
public:
    static GpioManager& getInstance();

    bool begin();
    void loop();

    bool isPcfDetected() const;
    uint8_t getPcfAddress() const;
    uint8_t getPcfOutputByte() const;

    bool setState(uint8_t id, bool logicalState);
    bool toggle(uint8_t id);
    bool pulse(uint8_t id, unsigned long durationMs);

    bool saveChannels(const JsonArrayConst& channels);
    bool addOrUpdateChannel(uint8_t id, uint8_t pin, const String& name, const String& room,
                            const String& function, bool activeLow, uint8_t initialMode, bool enabled);
    bool removeChannel(uint8_t id);
    size_t getChannelCount() const { return _channelCount; }

    void registerStateChangeCallback(GpioStateChangeCallback cb) { _stateCallback = cb; }
    void toJson(JsonArray& arr);

private:
    GpioManager();
    GpioStateChangeCallback _stateCallback;
    GpioChannel _channels[MAX_GPIO_CHANNELS];
    size_t _channelCount;

    void applyPhysicalPin(size_t index);
    void saveStates();
    void saveConfiguration();
};

#elif defined(TARGET_NODEMCU_PCF8574)

#include <Arduino.h>
#include <ArduinoJson.h>
#include <vector>
#include "config.h"

// Forward declaration
class AutomationEngine;

enum GpioInitialMode {
    INITIAL_MODE_RESTORE_LAST = 0, // Default: Persist and restore last state across reboots
    INITIAL_MODE_OFF          = 1, // Explicitly force OFF on boot
    INITIAL_MODE_ON           = 2  // Explicitly force ON on boot
};

struct GpioChannel {
    uint8_t id;
    uint8_t pin;
    String name;
    String room;
    String function;
    bool activeLow;
    uint8_t initialMode;
    bool enabled;
    bool currentState;          // Logical state: true = ON/Active, false = OFF/Inactive
    unsigned long pulseEndTime; // 0 = no pulse active
};

typedef void (*GpioStateChangeCallback)(uint8_t id, bool newState);

class GpioManager {
public:
    static GpioManager& getInstance();

    bool begin();
    void loop();

    bool isPinSafe(uint8_t pin, String& note, bool& bootSensitive);
    bool isPinAssigned(uint8_t pin, uint8_t excludeId = 0);

    bool addChannel(uint8_t pin, const String& name, const String& room, const String& function,
                    bool activeLow, uint8_t initialMode, String& outError);
    bool updateChannel(uint8_t id, const String& name, const String& room, const String& function,
                       bool activeLow, uint8_t initialMode, bool enabled, String& outError);
    bool removeChannel(uint8_t id);

    bool setState(uint8_t id, bool logicalState);
    bool toggle(uint8_t id);
    bool pulse(uint8_t id, unsigned long durationMs);

    GpioChannel* getChannel(uint8_t id);
    std::vector<GpioChannel>& getChannels() { return _channels; }

    void registerStateChangeCallback(GpioStateChangeCallback cb) { _stateCallback = cb; }

    bool isPcfDetected() const;
    uint8_t getPcfAddress() const;
    uint8_t getPcfOutputByte() const;

    void toJson(JsonArray& arr);
    bool fromJson(JsonArray& arr);

private:
    GpioManager();
    std::vector<GpioChannel> _channels;
    GpioStateChangeCallback _stateCallback;
    uint8_t _nextId;

    void applyPhysicalPin(const GpioChannel& channel);
    void loadFromStorage();
    void saveToStorage();
};

#else

#include <Arduino.h>
#include <ArduinoJson.h>
#include <vector>
#include "config.h"

// Forward declaration
class AutomationEngine;

enum GpioInitialMode {
    INITIAL_MODE_RESTORE_LAST = 0, // Default: Persist and restore last state across reboots
    INITIAL_MODE_OFF          = 1, // Explicitly force OFF on boot
    INITIAL_MODE_ON           = 2  // Explicitly force ON on boot
};

struct GpioChannel {
    uint8_t id;
    uint8_t pin;
    char name[32];
    char room[24];
    char function[28];
    bool activeLow;
    uint8_t initialMode;
    bool enabled;
    bool currentState;          // Logical state: true = ON/Active, false = OFF/Inactive
    unsigned long pulseEndTime; // 0 = no pulse active
};

typedef void (*GpioStateChangeCallback)(uint8_t id, bool newState);

class GpioManager {
public:
    static GpioManager& getInstance();

    bool begin();
    void loop();

    bool isPinSafe(uint8_t pin, String& note, bool& bootSensitive);
    bool isPinAssigned(uint8_t pin, uint8_t excludeId = 0);

    bool addChannel(uint8_t pin, const String& name, const String& room, const String& function,
                    bool activeLow, uint8_t initialMode, String& outError);
    bool updateChannel(uint8_t id, const String& name, const String& room, const String& function,
                       bool activeLow, uint8_t initialMode, bool enabled, String& outError);
    bool removeChannel(uint8_t id);

    bool setState(uint8_t id, bool logicalState);
    bool toggle(uint8_t id);
    bool pulse(uint8_t id, unsigned long durationMs);

    GpioChannel* getChannel(uint8_t id);
    std::vector<GpioChannel>& getChannels() { return _channels; }

    void registerStateChangeCallback(GpioStateChangeCallback cb) { _stateCallback = cb; }

    bool isI2cEnabled() const { return _i2cEnabled; }
    uint8_t getI2cSdaPin() const { return _i2cSdaPin; }
    uint8_t getI2cSclPin() const { return _i2cSclPin; }
    uint8_t getI2cAddress() const { return _i2cAddress; }
    bool isPcfDetected() const;
    uint8_t getPcfAddress() const;
    uint8_t getPcfOutputByte() const;
    bool setI2cConfig(bool enabled, uint8_t sdaPin, uint8_t sclPin, uint8_t addr);
    bool addPcfChannels();

    void toJson(JsonArray& arr, bool sensorsOnly = false);
    void toTelemetryJson(JsonArray& channels, JsonArray& sensors);
    bool fromJson(JsonArray& arr);

private:
    GpioManager();
    std::vector<GpioChannel> _channels;
    GpioStateChangeCallback _stateCallback;
    uint8_t _nextId;
    bool _i2cEnabled;
    uint8_t _i2cSdaPin;
    uint8_t _i2cSclPin;
    uint8_t _i2cAddress;

    void applyPhysicalPin(const GpioChannel& channel);
    void loadFromStorage();
    void saveToStorage();
};

#endif

#endif // GPIO_MANAGER_H
