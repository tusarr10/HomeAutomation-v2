// Automation Engine: Target-specific implementation
// ESP-01 (1MB): Thin-satellite automation (offloads complex cron to Central Server)
// ESP8266 (4MB) / ESP32: Full local cron scheduling, NTP sync, and LittleFS persistence

#if defined(TARGET_ESP01_1M) || defined(TARGET_ESP01_PCF8574)

#include "automation.h"
#include "gpio_manager.h"
#include "receiver_client.h"

// Streamlined Thin-Satellite Automation Engine:
// Complex cron schedules and daily timer rules are offloaded to Central Server (central_server_js).
// The ESP-01 acts as a lean hardware actuator and forwards state transitions to the Central Server.

AutomationEngine::AutomationEngine()
    : _nextId(1),
      _tzOffsetSec(19800),
      _lastNtpSyncAttempt(0) {}

AutomationEngine& AutomationEngine::getInstance() {
    static AutomationEngine instance;
    return instance;
}

bool AutomationEngine::begin() {
    return true;
}

void AutomationEngine::syncNtp() {
    // Clock management offloaded to Central Server
}

bool AutomationEngine::isTimeSynced() const {
    return false;
}

String AutomationEngine::getFormattedTime() const {
    char buf[24];
    unsigned long up = millis() / 1000UL;
    snprintf_P(buf, sizeof(buf), PSTR("Up %lu s"), up);
    return String(buf);
}

void AutomationEngine::setTimezoneOffset(int32_t offsetSeconds) {
    _tzOffsetSec = offsetSeconds;
}

void AutomationEngine::notifyGpioStateChanged(uint8_t gpioId, bool newState) {
    // Notify central telemetry receiver client immediately
    ReceiverClient::getInstance().onGpioStateChanged(gpioId, newState);
}

void AutomationEngine::loop() {
    // Automation loops offloaded to central server
}

bool AutomationEngine::addRule(const String&, uint8_t, uint8_t, uint8_t, bool, bool, uint32_t, String& outError) {
    outError = F("Automations managed by Central Server");
    return false;
}

bool AutomationEngine::updateRule(uint8_t, const String&, bool, uint8_t, uint8_t, bool, bool, uint32_t, String& outError) {
    outError = F("Automations managed by Central Server");
    return false;
}

bool AutomationEngine::removeRule(uint8_t) {
    return true;
}

bool AutomationEngine::toggleRule(uint8_t) {
    return true;
}

void AutomationEngine::toJson(JsonArray&) {
    // Return empty array [] - automations are tracked in Central Server database
}

void AutomationEngine::loadFromStorage() {}
void AutomationEngine::saveToStorage() {}


#else

#include "automation.h"
#include "gpio_manager.h"
#include "storage_manager.h"
#include "wifi_manager.h"

AutomationEngine::AutomationEngine()
    : _nextId(1),
      _tzOffsetSec(19800), // Default to Indian Standard Time (IST UTC+5:30)
      _lastNtpSyncAttempt(0) {
    _rules.reserve(MAX_AUTOMATION_RULES);
}

AutomationEngine& AutomationEngine::getInstance() {
    static AutomationEngine instance;
    return instance;
}

bool AutomationEngine::begin() {
    loadFromStorage();
    syncNtp();
    return true;
}

void AutomationEngine::syncNtp() {
    if (WifiManager::getInstance().isSTAConnected()) {
        Serial.printf_P(PSTR("[AUTO] Configuring NTP time synchronization (Offset: %+ld sec = %+0.1fh)...\n"),
                      (long)_tzOffsetSec, (float)_tzOffsetSec / 3600.0f);
        // Use Google and reliable Asian/Indian NTP pools
        configTime(_tzOffsetSec, 0, "time.google.com", "in.pool.ntp.org", "asia.pool.ntp.org");
    }
}

bool AutomationEngine::isTimeSynced() const {
    time_t now = time(nullptr);
    return (now > 1600000000); // Valid timestamp after year 2020
}

String AutomationEngine::getFormattedTime() const {
    time_t now = time(nullptr);
    if (!isTimeSynced()) return F("Time not synced");

    struct tm* timeinfo = localtime(&now);
    char buf[48];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", timeinfo);
    if (_tzOffsetSec == 19800) {
        return String(buf) + F(" (IST)");
    }
    return String(buf);
}

void AutomationEngine::setTimezoneOffset(int32_t offsetSeconds) {
    _tzOffsetSec = offsetSeconds;
    syncNtp();
}

void AutomationEngine::notifyGpioStateChanged(uint8_t gpioId, bool newState) {
    for (auto& rule : _rules) {
        if (!rule.enabled) continue;

        if (rule.type == RULE_TIMER_AUTO_OFF) {
            if (rule.targetGpioId == gpioId) {
                if (newState) {
                    rule.timerExpiry = millis() + ((unsigned long)rule.param1 * 1000UL);
                    Serial.printf_P(PSTR("[AUTO] Timer rule '%s' started: %u sec\n"), rule.name, rule.param1);
                } else {
                    rule.timerExpiry = 0; // Cancel if turned off manually
                }
            }
        } else if (rule.type == RULE_INTERLOCK) {
            if (rule.sourceGpioId == gpioId && newState == rule.conditionState) {
                Serial.printf_P(PSTR("[AUTO] Interlock rule '%s' triggered\n"), rule.name);
                GpioManager::getInstance().setState(rule.targetGpioId, rule.targetState);
                rule.executionCount++;
                saveToStorage();
            }
        }
    }
}

void AutomationEngine::loop() {
    unsigned long nowMs = millis();

    // Periodic NTP check (every 10s until synced, then every 30 minutes)
    unsigned long ntpInterval = isTimeSynced() ? 1800000UL : 10000UL;
    if (nowMs - _lastNtpSyncAttempt >= ntpInterval) {
        _lastNtpSyncAttempt = nowMs;
        if (WifiManager::getInstance().isSTAConnected()) {
            syncNtp();
        }
    }

    // Process Timer Rules
    for (auto& rule : _rules) {
        if (!rule.enabled) continue;

        if (rule.type == RULE_TIMER_AUTO_OFF && rule.timerExpiry > 0) {
            if (nowMs >= rule.timerExpiry) {
                rule.timerExpiry = 0;
                Serial.printf_P(PSTR("[AUTO] Auto-off timer expired for '%s'\n"), rule.name);
                GpioManager::getInstance().setState(rule.targetGpioId, false);
                rule.executionCount++;
                saveToStorage();
            }
        }
    }

    // Process Daily Schedule Rules (checked every second)
    static unsigned long lastScheduleCheck = 0;
    if (nowMs - lastScheduleCheck >= 1000) {
        lastScheduleCheck = nowMs;

        if (isTimeSynced()) {
            time_t nowTime = time(nullptr);
            struct tm* tinfo = localtime(&nowTime);
            uint32_t currentMinOfDay = tinfo->tm_hour * 60 + tinfo->tm_min;

            for (auto& rule : _rules) {
                if (!rule.enabled || rule.type != RULE_DAILY_SCHEDULE) continue;

                if (rule.param1 == currentMinOfDay) {
                    if (rule.lastTriggeredDay != tinfo->tm_yday) {
                        rule.lastTriggeredDay = tinfo->tm_yday;
                        Serial.printf_P(PSTR("[AUTO] Schedule rule '%s' triggered at %02d:%02d\n"),
                                      rule.name, tinfo->tm_hour, tinfo->tm_min);
                        GpioManager::getInstance().setState(rule.targetGpioId, rule.targetState);
                        rule.executionCount++;
                        saveToStorage();
                    }
                }
            }
        }
    }
}

bool AutomationEngine::addRule(const String& name, uint8_t type, uint8_t sourceId, uint8_t targetId,
                              bool condState, bool targetState, uint32_t param1, String& outError) {
    if (_rules.size() >= MAX_AUTOMATION_RULES) {
        outError = F("Maximum automation rules reached (limit: 10)");
        return false;
    }

    if (type == RULE_INTERLOCK && sourceId == targetId) {
        outError = F("Source and Target GPIO cannot be identical in Interlock rule");
        return false;
    }

    AutomationRule r;
    r.id = _nextId++;
    if (name.length() > 0) {
        strncpy(r.name, name.c_str(), sizeof(r.name) - 1);
        r.name[sizeof(r.name) - 1] = '\0';
    } else {
        snprintf_P(r.name, sizeof(r.name), PSTR("Rule %u"), r.id);
    }
    r.type = type;
    r.enabled = true;
    r.sourceGpioId = sourceId;
    r.targetGpioId = targetId;
    r.conditionState = condState;
    r.targetState = targetState;
    r.param1 = param1;
    r.timerExpiry = 0;
    r.lastTriggeredDay = -1;
    r.executionCount = 0;

    _rules.push_back(r);
    saveToStorage();
    Serial.printf_P(PSTR("[AUTO] Added Rule ID %u: %s\n"), r.id, r.name);
    return true;
}

bool AutomationEngine::updateRule(uint8_t id, const String& name, bool enabled, uint8_t sourceId, uint8_t targetId,
                                 bool condState, bool targetState, uint32_t param1, String& outError) {
    for (auto& r : _rules) {
        if (r.id == id) {
            if (name.length() > 0) {
                strncpy(r.name, name.c_str(), sizeof(r.name) - 1);
                r.name[sizeof(r.name) - 1] = '\0';
            }
            r.enabled = enabled;
            r.sourceGpioId = sourceId;
            r.targetGpioId = targetId;
            r.conditionState = condState;
            r.targetState = targetState;
            r.param1 = param1;
            saveToStorage();
            return true;
        }
    }
    outError = F("Rule ID not found");
    return false;
}

bool AutomationEngine::removeRule(uint8_t id) {
    for (auto it = _rules.begin(); it != _rules.end(); ++it) {
        if (it->id == id) {
            _rules.erase(it);
            saveToStorage();
            Serial.printf_P(PSTR("[AUTO] Removed Rule ID %u\n"), id);
            return true;
        }
    }
    return false;
}

bool AutomationEngine::toggleRule(uint8_t id) {
    for (auto& r : _rules) {
        if (r.id == id) {
            r.enabled = !r.enabled;
            r.timerExpiry = 0;
            saveToStorage();
            return true;
        }
    }
    return false;
}

void AutomationEngine::toJson(JsonArray& arr) {
    for (const auto& r : _rules) {
        JsonObject obj = arr.createNestedObject();
        obj["id"] = r.id;
        obj["name"] = r.name;
        obj["type"] = r.type;
        obj["enabled"] = r.enabled;
        obj["sourceGpioId"] = r.sourceGpioId;
        obj["targetGpioId"] = r.targetGpioId;
        obj["condState"] = r.conditionState;
        obj["targetState"] = r.targetState;
        obj["param1"] = r.param1;
        obj["execCount"] = r.executionCount;
    }
}

void AutomationEngine::loadFromStorage() {
    // Load timezone from system config
    DynamicJsonDocument sysDoc(512);
    if (StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, sysDoc)) {
        if (sysDoc.containsKey("tzOffset")) {
            _tzOffsetSec = sysDoc["tzOffset"].as<int32_t>();
        } else {
            _tzOffsetSec = 19800; // Default to IST (UTC+5:30)
        }
    } else {
        _tzOffsetSec = 19800;
    }

    DynamicJsonDocument doc(2048);
    if (!StorageManager::getInstance().loadJsonFile(FILE_RULES_CONFIG, doc)) {
        return;
    }

    _rules.clear();
    uint8_t maxId = 0;
    JsonArray arr = doc.as<JsonArray>();
    for (JsonObject obj : arr) {
        AutomationRule r;
        r.id = obj["id"] | 1;
        const char* rName = obj["name"] | "Rule";
        strncpy(r.name, rName, sizeof(r.name) - 1);
        r.name[sizeof(r.name) - 1] = '\0';
        r.type = obj["type"] | 0;
        r.enabled = obj["enabled"] | true;
        r.sourceGpioId = obj["sourceGpioId"] | 0;
        r.targetGpioId = obj["targetGpioId"] | 0;
        r.conditionState = obj["condState"] | true;
        r.targetState = obj["targetState"] | false;
        r.param1 = obj["param1"] | 0;
        r.timerExpiry = 0;
        r.lastTriggeredDay = -1;
        r.executionCount = obj["execCount"] | 0;

        if (r.id > maxId) maxId = r.id;
        _rules.push_back(r);
    }
    _nextId = maxId + 1;
}

void AutomationEngine::saveToStorage() {
    DynamicJsonDocument doc(2048);
    JsonArray arr = doc.to<JsonArray>();
    toJson(arr);
    StorageManager::getInstance().saveJsonFile(FILE_RULES_CONFIG, doc);
}


#endif
