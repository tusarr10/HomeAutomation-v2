#ifndef WEB_SERVER_H
#define WEB_SERVER_H

#if defined(TARGET_ESP01_1M) || defined(TARGET_ESP01_PCF8574)

#include <Arduino.h>
#include <ESP8266WebServer.h>
#include <ArduinoJson.h>
#include "config.h"

class Logger {
public:
    static void log(const String& msg) { Serial.println(msg); }
    static void log(const __FlashStringHelper* msg) { Serial.println(msg); }
};

class WebServerManager {
public:
    static WebServerManager& getInstance();

    bool begin();
    void loop();

    String getDeviceName() const { return _deviceName; }
    void setDeviceName(const String& name);

    // Authentication verification helper
    bool isAuthorized(bool allowUnauthenticatedDiscovery = false);

private:
    WebServerManager();
    ESP8266WebServer _server;
    String _deviceName;

    void registerRoutes();
    void registerCaptiveRoutes();
    void registerApiRoutes();
    void registerStaticRoutes();

    void sendJsonResponse(int code, bool success, const String& message);

    // HTTP Handlers
    void handleStatus();
    void handleCommand();
    void handleSaveGpioConfig();

    // Built-in minimalist ESP-01 setup portal (Login, Wi-Fi Setup, Firmware Upload)
    void serveEmbeddedDashboard();
};

#else

#include <Arduino.h>
#include <ESP8266WebServer.h>
#include <ArduinoJson.h>
#include <vector>
#include "config.h"

#define LOG_RING_CAPACITY     20
#define LOG_MSG_MAX_LEN       88

struct LogEntry {
    uint32_t timestampMs;
    char message[LOG_MSG_MAX_LEN];
};

class Logger {
public:
    static void log(const String& msg);
    static void log(const __FlashStringHelper* msg);
    static void getLogsJson(JsonArray& arr);
    static size_t getCount() { return _count; }
    static void clear();
private:
    static LogEntry _logs[LOG_RING_CAPACITY];
    static size_t _head;
    static size_t _count;
};

class WebServerManager {
public:
    static WebServerManager& getInstance();

    bool begin();
    void loop();

    String getDeviceName() const { return _deviceName; }
    void setDeviceName(const String& name);

private:
    WebServerManager();
    ESP8266WebServer _server;
    String _deviceName;
    File _fsUploadFile;

    void registerRoutes();
    void registerCaptiveRoutes();
    void registerApiRoutes();
    void registerStaticRoutes();

    bool handleFileRead(String path);
    void sendJsonResponse(int code, bool success, const String& message);
    void sendJsonDoc(int code, const JsonDocument& doc);
    bool checkAuthOrReject();

    // Embedded Fallback Web Assets in PROGMEM
    void serveEmbeddedDashboard();
};

#endif

#endif // WEB_SERVER_H
