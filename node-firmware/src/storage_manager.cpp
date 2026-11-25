#if defined(TARGET_ESP01_1M)
#include "storage_manager.h"
#include "wifi_manager.h"
#include <EEPROM.h>

#define CONFIG_MAGIC 0xA55A
#define CONFIG_VERSION 1

StorageManager::StorageManager() : _initialized(false) {
    setDefaultConfig();
}

StorageManager& StorageManager::getInstance() {
    static StorageManager instance;
    return instance;
}

void StorageManager::setDefaultConfig() {
    memset(&_cfg, 0, sizeof(PersistentConfig));
    _cfg.magic = CONFIG_MAGIC;
    _cfg.version = CONFIG_VERSION;
    strncpy(_cfg.deviceName, FIRMWARE_NAME, sizeof(_cfg.deviceName) - 1);
    strncpy(_cfg.adminUser, DEFAULT_ADMIN_USER, sizeof(_cfg.adminUser) - 1);
    strncpy(_cfg.adminPass, DEFAULT_ADMIN_PASS, sizeof(_cfg.adminPass) - 1);
    _cfg.bootCount = 0;

    _cfg.wifiMode = 2; // AP + ROUTER
    _cfg.wifiConfigured = false;
    String defAp = WifiManager::getDefaultApSsid();
    strncpy(_cfg.apSsid, defAp.c_str(), sizeof(_cfg.apSsid) - 1);
    strncpy(_cfg.apPass, DEFAULT_AP_PASS, sizeof(_cfg.apPass) - 1);

    _cfg.rcvrEnabled = false;
    strncpy(_cfg.rcvrHost, "192.168.1.10", sizeof(_cfg.rcvrHost) - 1);
    _cfg.rcvrPort = 2000;

    _cfg.gpio0State = false;
    _cfg.gpio2State = false;
}

bool StorageManager::begin() {
    if (_initialized) return true;

    EEPROM.begin(sizeof(PersistentConfig));
    loadFromEeprom();
    _cfg.bootCount++;
    saveToEeprom();

    _initialized = true;
    Serial.printf("[STORAGE] EEPROM storage initialized. Boot count: %u\n", _cfg.bootCount);
    return true;
}

void StorageManager::loadFromEeprom() {
    EEPROM.get(0, _cfg);
    if (_cfg.magic != CONFIG_MAGIC || _cfg.version != CONFIG_VERSION) {
        Serial.println(F("[STORAGE] EEPROM uninitialized or corrupt. Writing factory defaults..."));
        setDefaultConfig();
        saveToEeprom();
    } else if (strlen(_cfg.apSsid) == 0 ||
               strcmp(_cfg.apSsid, DEFAULT_AP_SSID) == 0 ||
               strcmp(_cfg.apSsid, "SmartHome-ESP01") == 0 ||
               strcmp(_cfg.apSsid, "SmartHome-Setup") == 0) {
        String defAp = WifiManager::getDefaultApSsid();
        strncpy(_cfg.apSsid, defAp.c_str(), sizeof(_cfg.apSsid) - 1);
        saveToEeprom();
    }
}

void StorageManager::saveToEeprom() {
    EEPROM.put(0, _cfg);
    EEPROM.commit();
}

void StorageManager::factoryReset() {
    setDefaultConfig();
    saveToEeprom();
    Serial.println(F("[STORAGE] Factory reset applied to EEPROM"));
}

bool StorageManager::fileExists(const char* path) {
    return true; // Virtual persistent files always exist
}

bool StorageManager::removeFile(const char* path) {
    return true;
}

bool StorageManager::loadJsonFile(const char* path, DynamicJsonDocument& doc) {
    String p = path;

    if (p.indexOf(F("system")) >= 0) {
        doc["deviceName"] = _cfg.deviceName;
        doc["adminUser"] = _cfg.adminUser;
        doc["adminPass"] = _cfg.adminPass;
        doc["bootCount"] = _cfg.bootCount;
        return true;
    }

    if (p.indexOf(F("wifi")) >= 0) {
        doc["mode"] = _cfg.wifiMode;
        doc["apSsid"] = _cfg.apSsid;
        doc["apPassword"] = _cfg.apPass;
        doc["staSsid"] = _cfg.staSsid;
        doc["staPassword"] = _cfg.staPass;
        doc["isConfigured"] = _cfg.wifiConfigured;
        doc["useStaticIp"] = false;
        doc["staticIp"] = "";
        doc["staticGateway"] = "";
        doc["staticSubnet"] = "255.255.255.0";
        doc["staticDns1"] = "8.8.8.8";
        doc["staticDns2"] = "1.1.1.1";
        return true;
    }

    if (p.indexOf(F("receiver")) >= 0) {
        doc["enabled"] = _cfg.rcvrEnabled;
        doc["serverHost"] = _cfg.rcvrHost;
        doc["serverPort"] = _cfg.rcvrPort;
        doc["protocol"] = 1; // TCP
        doc["httpPath"] = "/api/node/telemetry";
        doc["reportIntervalSec"] = 10;
        doc["sendOnStateChange"] = true;
        doc["nodeId"] = "";
        doc["nodeName"] = "ESP-01 Satellite";
        doc["authToken"] = _cfg.rcvrToken;
        return true;
    }

    if (p.indexOf(F("gpio")) >= 0) {
        JsonArray arr = doc.to<JsonArray>();
        JsonObject ch1 = arr.createNestedObject();
        ch1["id"] = 1;
        ch1["pin"] = 0;
        ch1["name"] = "Relay 1";
        ch1["room"] = "Room";
        ch1["function"] = "Relay";
        ch1["activeLow"] = true;
        ch1["initialMode"] = 0;
        ch1["enabled"] = true;
        ch1["state"] = _cfg.gpio0State;

        JsonObject ch2 = arr.createNestedObject();
        ch2["id"] = 2;
        ch2["pin"] = 2;
        ch2["name"] = "Relay 2";
        ch2["room"] = "Room";
        ch2["function"] = "Relay";
        ch2["activeLow"] = true;
        ch2["initialMode"] = 0;
        ch2["enabled"] = true;
        ch2["state"] = _cfg.gpio2State;
        return true;
    }

    return false;
}

bool StorageManager::saveJsonFile(const char* path, const JsonDocument& doc) {
    String p = path;

    if (p.indexOf(F("system")) >= 0) {
        if (doc.containsKey("deviceName")) strncpy(_cfg.deviceName, doc["deviceName"] | "", sizeof(_cfg.deviceName) - 1);
        if (doc.containsKey("adminUser")) strncpy(_cfg.adminUser, doc["adminUser"] | "", sizeof(_cfg.adminUser) - 1);
        if (doc.containsKey("adminPass")) strncpy(_cfg.adminPass, doc["adminPass"] | "", sizeof(_cfg.adminPass) - 1);
        saveToEeprom();
        return true;
    }

    if (p.indexOf(F("wifi")) >= 0) {
        if (doc.containsKey("mode")) _cfg.wifiMode = doc["mode"];
        if (doc.containsKey("apSsid")) strncpy(_cfg.apSsid, doc["apSsid"] | "", sizeof(_cfg.apSsid) - 1);
        if (doc.containsKey("apPassword")) strncpy(_cfg.apPass, doc["apPassword"] | "", sizeof(_cfg.apPass) - 1);
        if (doc.containsKey("staSsid")) strncpy(_cfg.staSsid, doc["staSsid"] | "", sizeof(_cfg.staSsid) - 1);
        if (doc.containsKey("staPassword")) strncpy(_cfg.staPass, doc["staPassword"] | "", sizeof(_cfg.staPass) - 1);
        if (doc.containsKey("isConfigured")) _cfg.wifiConfigured = doc["isConfigured"];
        saveToEeprom();
        return true;
    }

    if (p.indexOf(F("receiver")) >= 0) {
        if (doc.containsKey("enabled")) _cfg.rcvrEnabled = doc["enabled"];
        if (doc.containsKey("serverHost")) strncpy(_cfg.rcvrHost, doc["serverHost"] | "", sizeof(_cfg.rcvrHost) - 1);
        if (doc.containsKey("serverPort")) _cfg.rcvrPort = doc["serverPort"];
        if (doc.containsKey("authToken")) strncpy(_cfg.rcvrToken, doc["authToken"] | "", sizeof(_cfg.rcvrToken) - 1);
        saveToEeprom();
        return true;
    }

    if (p.indexOf(F("gpio")) >= 0) {
        JsonArrayConst arr = doc.as<JsonArrayConst>();
        for (JsonObjectConst ch : arr) {
            uint8_t pin = ch["pin"] | 255;
            bool st = ch["state"] | false;
            if (pin == 0) _cfg.gpio0State = st;
            else if (pin == 2) _cfg.gpio2State = st;
        }
        saveToEeprom();
        return true;
    }

    return false;
}

#elif defined(TARGET_ESP01_PCF8574)
#include "storage_manager.h"
#include "wifi_manager.h"
#include <EEPROM.h>

#define CONFIG_MAGIC 0xA55C
#define CONFIG_VERSION 2

StorageManager::StorageManager() : _initialized(false) {
    setDefaultConfig();
}

StorageManager& StorageManager::getInstance() {
    static StorageManager instance;
    return instance;
}

void StorageManager::setDefaultConfig() {
    memset(&_cfg, 0, sizeof(PersistentConfig));
    _cfg.magic = CONFIG_MAGIC;
    _cfg.version = CONFIG_VERSION;
    strncpy(_cfg.deviceName, FIRMWARE_NAME, sizeof(_cfg.deviceName) - 1);
    strncpy(_cfg.adminUser, DEFAULT_ADMIN_USER, sizeof(_cfg.adminUser) - 1);
    strncpy(_cfg.adminPass, DEFAULT_ADMIN_PASS, sizeof(_cfg.adminPass) - 1);
    _cfg.bootCount = 0;

    _cfg.wifiMode = 2; // AP + ROUTER
    _cfg.wifiConfigured = false;
    String defAp = WifiManager::getDefaultApSsid();
    strncpy(_cfg.apSsid, defAp.c_str(), sizeof(_cfg.apSsid) - 1);
    strncpy(_cfg.apPass, DEFAULT_AP_PASS, sizeof(_cfg.apPass) - 1);

    _cfg.rcvrEnabled = false;
    strncpy(_cfg.rcvrHost, "192.168.1.10", sizeof(_cfg.rcvrHost) - 1);
    _cfg.rcvrPort = 2000;

    _cfg.gpio0State = false;
    _cfg.gpio2State = false;
}

bool StorageManager::begin() {
    if (_initialized) return true;

    EEPROM.begin(sizeof(PersistentConfig));
    loadFromEeprom();
    _cfg.bootCount++;
    saveToEeprom();

    _initialized = true;
    Serial.printf("[STORAGE] EEPROM storage initialized. Boot count: %u\n", _cfg.bootCount);
    return true;
}

void StorageManager::loadFromEeprom() {
    EEPROM.get(0, _cfg);
    if (_cfg.magic != CONFIG_MAGIC || _cfg.version != CONFIG_VERSION) {
        Serial.println(F("[STORAGE] EEPROM uninitialized or corrupt. Writing factory defaults..."));
        setDefaultConfig();
        saveToEeprom();
        return;
    } else if (strlen(_cfg.apSsid) == 0 ||
               strcmp(_cfg.apSsid, DEFAULT_AP_SSID) == 0 ||
               strcmp(_cfg.apSsid, "SmartHome-ESP01-PCF8574") == 0 ||
               strcmp(_cfg.apSsid, "SmartHome-Setup") == 0) {
        String defAp = WifiManager::getDefaultApSsid();
        strncpy(_cfg.apSsid, defAp.c_str(), sizeof(_cfg.apSsid) - 1);
        saveToEeprom();
    }

    // Sanitize credentials to ensure defaults always hold if corrupted
    if (strlen(_cfg.adminUser) == 0 || (unsigned char)_cfg.adminUser[0] > 126) {
        strncpy(_cfg.adminUser, DEFAULT_ADMIN_USER, sizeof(_cfg.adminUser) - 1);
    }
    if (strlen(_cfg.adminPass) == 0 || (unsigned char)_cfg.adminPass[0] > 126) {
        strncpy(_cfg.adminPass, DEFAULT_ADMIN_PASS, sizeof(_cfg.adminPass) - 1);
    }
}

void StorageManager::saveToEeprom() {
    EEPROM.put(0, _cfg);
    EEPROM.commit();
}

void StorageManager::factoryReset() {
    setDefaultConfig();
    saveToEeprom();
    Serial.println(F("[STORAGE] Factory reset applied to EEPROM"));
}

bool StorageManager::fileExists(const char* path) {
    return true; // Virtual persistent files always exist
}

bool StorageManager::removeFile(const char* path) {
    return true;
}

bool StorageManager::loadJsonFile(const char* path, DynamicJsonDocument& doc) {
    String p = path;

    if (p.indexOf(F("system")) >= 0) {
        doc["deviceName"] = _cfg.deviceName;
        doc["adminUser"] = _cfg.adminUser;
        doc["adminPass"] = _cfg.adminPass;
        doc["bootCount"] = _cfg.bootCount;
        return true;
    }

    if (p.indexOf(F("wifi")) >= 0) {
        doc["mode"] = _cfg.wifiMode;
        doc["apSsid"] = _cfg.apSsid;
        doc["apPassword"] = _cfg.apPass;
        doc["staSsid"] = _cfg.staSsid;
        doc["staPassword"] = _cfg.staPass;
        doc["isConfigured"] = _cfg.wifiConfigured;
        doc["useStaticIp"] = false;
        doc["staticIp"] = "";
        doc["staticGateway"] = "";
        doc["staticSubnet"] = "255.255.255.0";
        doc["staticDns1"] = "8.8.8.8";
        doc["staticDns2"] = "1.1.1.1";
        return true;
    }

    if (p.indexOf(F("receiver")) >= 0) {
        doc["enabled"] = _cfg.rcvrEnabled;
        doc["serverHost"] = _cfg.rcvrHost;
        doc["serverPort"] = _cfg.rcvrPort;
        doc["protocol"] = 1; // TCP
        doc["httpPath"] = "/api/node/telemetry";
        doc["reportIntervalSec"] = 10;
        doc["sendOnStateChange"] = true;
        doc["nodeId"] = "";
        doc["nodeName"] = "ESP-01 Satellite";
        doc["authToken"] = _cfg.rcvrToken;
        return true;
    }

    if (p.indexOf(F("gpio")) >= 0) {
        JsonArray arr = doc.to<JsonArray>();
        JsonObject ch1 = arr.createNestedObject();
        ch1["id"] = 1;
        ch1["pin"] = 0;
        ch1["name"] = "Relay 1";
        ch1["room"] = "Room";
        ch1["function"] = "Relay";
        ch1["activeLow"] = true;
        ch1["initialMode"] = 0;
        ch1["enabled"] = true;
        ch1["state"] = _cfg.gpio0State;

        JsonObject ch2 = arr.createNestedObject();
        ch2["id"] = 2;
        ch2["pin"] = 2;
        ch2["name"] = "Relay 2";
        ch2["room"] = "Room";
        ch2["function"] = "Relay";
        ch2["activeLow"] = true;
        ch2["initialMode"] = 0;
        ch2["enabled"] = true;
        ch2["state"] = _cfg.gpio2State;
        return true;
    }

    return false;
}

bool StorageManager::saveJsonFile(const char* path, const JsonDocument& doc) {
    String p = path;

    if (p.indexOf(F("system")) >= 0) {
        if (doc.containsKey("deviceName")) strncpy(_cfg.deviceName, doc["deviceName"] | "", sizeof(_cfg.deviceName) - 1);
        if (doc.containsKey("adminUser")) strncpy(_cfg.adminUser, doc["adminUser"] | "", sizeof(_cfg.adminUser) - 1);
        if (doc.containsKey("adminPass")) strncpy(_cfg.adminPass, doc["adminPass"] | "", sizeof(_cfg.adminPass) - 1);
        saveToEeprom();
        return true;
    }

    if (p.indexOf(F("wifi")) >= 0) {
        if (doc.containsKey("mode")) _cfg.wifiMode = doc["mode"];
        if (doc.containsKey("apSsid")) strncpy(_cfg.apSsid, doc["apSsid"] | "", sizeof(_cfg.apSsid) - 1);
        if (doc.containsKey("apPassword")) strncpy(_cfg.apPass, doc["apPassword"] | "", sizeof(_cfg.apPass) - 1);
        if (doc.containsKey("staSsid")) strncpy(_cfg.staSsid, doc["staSsid"] | "", sizeof(_cfg.staSsid) - 1);
        if (doc.containsKey("staPassword")) strncpy(_cfg.staPass, doc["staPassword"] | "", sizeof(_cfg.staPass) - 1);
        if (doc.containsKey("isConfigured")) _cfg.wifiConfigured = doc["isConfigured"];
        saveToEeprom();
        return true;
    }

    if (p.indexOf(F("receiver")) >= 0) {
        if (doc.containsKey("enabled")) _cfg.rcvrEnabled = doc["enabled"];
        if (doc.containsKey("serverHost")) strncpy(_cfg.rcvrHost, doc["serverHost"] | "", sizeof(_cfg.rcvrHost) - 1);
        if (doc.containsKey("serverPort")) _cfg.rcvrPort = doc["serverPort"];
        if (doc.containsKey("authToken")) strncpy(_cfg.rcvrToken, doc["authToken"] | "", sizeof(_cfg.rcvrToken) - 1);
        saveToEeprom();
        return true;
    }

    if (p.indexOf(F("gpio")) >= 0) {
        JsonArrayConst arr = doc.as<JsonArrayConst>();
        for (JsonObjectConst ch : arr) {
            uint8_t pin = ch["pin"] | 255;
            bool st = ch["state"] | false;
            if (pin == 0) _cfg.gpio0State = st;
            else if (pin == 2) _cfg.gpio2State = st;
        }
        saveToEeprom();
        return true;
    }

    return false;
}

#else
#include "storage_manager.h"

StorageManager::StorageManager() : _initialized(false), _bootCount(1) {}

StorageManager& StorageManager::getInstance() {
    static StorageManager instance;
    return instance;
}

bool StorageManager::begin() {
    if (_initialized) return true;

    Serial.println(F("[STORAGE] Initializing LittleFS..."));
    if (!LittleFS.begin()) {
        Serial.println(F("[STORAGE] LittleFS mount failed, formatting flash..."));
        if (!LittleFS.format()) {
            Serial.println(F("[STORAGE] LittleFS format failed!"));
            return false;
        }
        if (!LittleFS.begin()) {
            Serial.println(F("[STORAGE] LittleFS mount failed after format!"));
            return false;
        }
    }

    _initialized = true;
    ensureConfigDir();
    incrementBootCount();

    FSInfo fs_info;
    LittleFS.info(fs_info);
    Serial.printf_P(PSTR("[STORAGE] LittleFS mounted. Total: %u KB, Used: %u KB\n"),
                  (unsigned int)(fs_info.totalBytes / 1024),
                  (unsigned int)(fs_info.usedBytes / 1024));

    return true;
}

void StorageManager::ensureConfigDir() {
    if (!LittleFS.exists("/config")) {
        File dirFile = LittleFS.open("/config/.keep", "w");
        if (dirFile) {
            dirFile.print("1");
            dirFile.close();
        }
    }
}

void StorageManager::incrementBootCount() {
    DynamicJsonDocument doc(512);
    loadJsonFile(FILE_SYSTEM_CONFIG, doc);
    _bootCount = doc["bootCount"] | 0;
    _bootCount++;
    doc["bootCount"] = _bootCount;
    saveJsonFile(FILE_SYSTEM_CONFIG, doc);
    Serial.printf_P(PSTR("[STORAGE] Device Boot Count: %u\n"), _bootCount);
}

bool StorageManager::saveJsonFile(const char* path, const JsonDocument& doc) {
    if (!_initialized && !begin()) return false;

    String tmpPath = String(path) + ".tmp";
    File file = LittleFS.open(tmpPath.c_str(), "w");
    if (!file) {
        Serial.printf_P(PSTR("[STORAGE] Failed to open %s for write\n"), tmpPath.c_str());
        return false;
    }

    size_t bytesWritten = serializeJson(doc, file);
    file.flush();
    file.close();

    if (bytesWritten == 0) {
        Serial.printf_P(PSTR("[STORAGE] Error serializing JSON to %s\n"), tmpPath.c_str());
        LittleFS.remove(tmpPath.c_str());
        return false;
    }

    // Atomic replace
    if (LittleFS.exists(path)) {
        LittleFS.remove(path);
    }
    if (!LittleFS.rename(tmpPath.c_str(), path)) {
        Serial.printf_P(PSTR("[STORAGE] Failed to rename %s to %s, falling back to direct write\n"), tmpPath.c_str(), path);
        File directFile = LittleFS.open(path, "w");
        if (directFile) {
            serializeJson(doc, directFile);
            directFile.flush();
            directFile.close();
        }
        LittleFS.remove(tmpPath.c_str());
    }

    return true;
}

bool StorageManager::loadJsonFile(const char* path, DynamicJsonDocument& doc) {
    if (!_initialized && !begin()) return false;

    if (!LittleFS.exists(path)) {
        return false;
    }

    File file = LittleFS.open(path, "r");
    if (!file) {
        Serial.printf_P(PSTR("[STORAGE] Failed to open %s for read\n"), path);
        return false;
    }

    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        Serial.printf_P(PSTR("[STORAGE] Failed to parse %s: %s\n"), path, error.c_str());
        return false;
    }

    return true;
}

bool StorageManager::fileExists(const char* path) {
    if (!_initialized && !begin()) return false;
    return LittleFS.exists(path);
}

bool StorageManager::removeFile(const char* path) {
    if (!_initialized && !begin()) return false;
    return LittleFS.remove(path);
}

void StorageManager::factoryReset() {
    Serial.println(F("[STORAGE] Performing Factory Reset..."));
    _bootCount = 1;
    removeFile(FILE_SYSTEM_CONFIG);
    removeFile(FILE_WIFI_CONFIG);
    removeFile(FILE_GPIO_CONFIG);
    removeFile(FILE_RULES_CONFIG);
    Serial.println(F("[STORAGE] Configuration files wiped."));
}

size_t StorageManager::getFlashTotalBytes() {
    FSInfo fs_info;
    if (LittleFS.info(fs_info)) {
        return fs_info.totalBytes;
    }
    return 0;
}

size_t StorageManager::getFlashUsedBytes() {
    FSInfo fs_info;
    if (LittleFS.info(fs_info)) {
        return fs_info.usedBytes;
    }
    return 0;
}

size_t StorageManager::getFlashFreeBytes() {
    FSInfo fs_info;
    if (LittleFS.info(fs_info)) {
        return (fs_info.totalBytes > fs_info.usedBytes) ? (fs_info.totalBytes - fs_info.usedBytes) : 0;
    }
    return 0;
}

#endif
