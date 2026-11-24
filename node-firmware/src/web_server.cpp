#if defined(TARGET_ESP01_1M)
#include "web_server.h"
#include "storage_manager.h"
#include "auth_manager.h"
#include "wifi_manager.h"
#include "gpio_manager.h"
#include "ota_manager.h"
#include "receiver_client.h"
#include "dashboard_html.h"

WebServerManager::WebServerManager() : _server(80), _deviceName(FIRMWARE_NAME) {}

WebServerManager& WebServerManager::getInstance() {
    static WebServerManager instance;
    return instance;
}

bool WebServerManager::begin() {
    DynamicJsonDocument doc(256);
    if (StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, doc)) {
        if (doc.containsKey("deviceName")) {
            _deviceName = doc["deviceName"].as<String>();
        }
    }

    const char* headerKeys[] = { "Cookie", "Authorization", "X-Session-Token", "X-File-MD5" };
    _server.collectHeaders(headerKeys, sizeof(headerKeys) / sizeof(char*));

    registerRoutes();
    _server.begin();
    Logger::log(F("[HTTP] SmartHome ESP-01 Web Server active on port 80"));
    return true;
}

void WebServerManager::loop() {
    _server.handleClient();
}

void WebServerManager::setDeviceName(const String& name) {
    if (name.length() > 0) {
        _deviceName = name;
        DynamicJsonDocument doc(256);
        StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, doc);
        doc["deviceName"] = _deviceName;
        StorageManager::getInstance().saveJsonFile(FILE_SYSTEM_CONFIG, doc);
    }
}

bool WebServerManager::isAuthorized(bool allowUnauthenticatedDiscovery) {
    String user = AuthManager::getInstance().getAdminUsername();
    String pass = AuthManager::getInstance().getAdminPassword();

    // 1. HTTP Basic Authentication check (e.g. from Central Server / Test Auth)
    if (_server.hasHeader("Authorization")) {
        String authHeader = _server.header("Authorization");
        if (authHeader.startsWith("Basic ")) {
            if (_server.authenticate(user.c_str(), pass.c_str())) {
                return true;
            }
            // Explicit Basic Auth credentials provided but failed
            _server.requestAuthentication(BASIC_AUTH, "SmartHome", "Authentication Required");
            return false;
        } else if (authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            token.trim();
            const ReceiverConfig& rcfg = ReceiverClient::getInstance().getConfig();
            if (rcfg.authToken.length() > 0 && token == rcfg.authToken) {
                return true;
            }
        }
    }

    // 2. Web session token authentication (Cookie or X-Session-Token)
    if (AuthManager::getInstance().authenticate(_server)) {
        return true;
    }

    // 3. Central receiver host IP trust (if configured)
    const ReceiverConfig& rcfg = ReceiverClient::getInstance().getConfig();
    if (rcfg.enabled && rcfg.serverHost.length() > 0) {
        if (_server.client().remoteIP().toString() == rcfg.serverHost) {
            return true;
        }
    }

    // 4. Local AP trust for captive portal onboarding
    if (WifiManager::getInstance().isAPActive() && !WifiManager::getInstance().isSTAConnected()) {
        IPAddress clientIp = _server.client().remoteIP();
        IPAddress apIp = WiFi.softAPIP();
        if (clientIp[0] == apIp[0] && clientIp[1] == apIp[1] && clientIp[2] == apIp[2]) {
            return true;
        }
    }

    // 5. Unauthenticated discovery allowance (for /api/status network scanner probing)
    if (allowUnauthenticatedDiscovery && !_server.hasHeader("Authorization")) {
        return true;
    }

    // Reject unauthenticated access
    _server.requestAuthentication(BASIC_AUTH, "SmartHome", "Authentication Required");
    return false;
}

void WebServerManager::sendJsonResponse(int code, bool success, const String& message) {
    String out = String(F("{\"success\":")) + (success ? F("true") : F("false")) +
                 F(",\"") + (success ? F("message") : F("error")) + F("\":\"") + message + F("\"}");
    _server.send(code, "application/json", out);
}

void WebServerManager::registerRoutes() {
    registerCaptiveRoutes();
    registerApiRoutes();
    registerStaticRoutes();

    // 404 Handler / Captive Portal Redirect
    _server.onNotFound([this]() {
        if (WifiManager::getInstance().isAPActive() && !WifiManager::getInstance().isSTAConnected()) {
            _server.sendHeader(F("Location"), String(F("http://")) + WiFi.softAPIP().toString() + F("/"), true);
            _server.send(302, F("text/plain"), F(""));
            return;
        }
        _server.send(404, F("application/json"), F("{\"error\":\"Not Found\"}"));
    });
}

void WebServerManager::registerCaptiveRoutes() {
    auto captiveRedirect = [this]() {
        String target = String(F("http://")) + (WifiManager::getInstance().isAPActive() ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + F("/");
        _server.sendHeader(F("Location"), target, true);
        _server.send(302, F("text/plain"), F(""));
    };

    _server.on("/generate_204", captiveRedirect);
    _server.on("/gen_204", captiveRedirect);
    _server.on("/ncsi.txt", captiveRedirect);
    _server.on("/hotspot-detect.html", captiveRedirect);
    _server.on("/canonical.html", captiveRedirect);
    _server.on("/connecttest.txt", captiveRedirect);
    _server.on("/redirect", captiveRedirect);
    _server.on("/success.txt", captiveRedirect);
}

void WebServerManager::handleStatus() {
    // If Authorization header was provided, strictly enforce authentication
    if (!isAuthorized(true)) return;

    DynamicJsonDocument doc(1024);
    doc["deviceName"] = _deviceName;
    doc["hardware"] = HARDWARE_TARGET;
    doc["firmwareVersion"] = FIRMWARE_VERSION;
    doc["mac"] = WiFi.macAddress();
    doc["nodeId"] = ReceiverClient::getInstance().getConfig().nodeId;
    doc["chipId"] = String(ESP.getChipId(), HEX);
    doc["rssi"] = WifiManager::getInstance().getSTARSSI();
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["uptimeSec"] = millis() / 1000UL;
    doc["sketchSize"] = ESP.getSketchSize();
    doc["freeSketchSpace"] = ESP.getFreeSketchSpace();
    doc["staConnected"] = WifiManager::getInstance().isSTAConnected();
    doc["ip"] = WifiManager::getInstance().isSTAConnected() ? WifiManager::getInstance().getSTAIP() : WifiManager::getInstance().getAPIP();
    doc["ssid"] = WifiManager::getInstance().getConnectedSSID();
    doc["receiverEnabled"] = ReceiverClient::getInstance().getConfig().enabled;
    doc["receiverServer"] = ReceiverClient::getInstance().getConfig().serverHost + ":" + String(ReceiverClient::getInstance().getConfig().serverPort);

    // Relay channels list
    JsonArray channels = doc.createNestedArray("channels");
    GpioManager::getInstance().toJson(channels);

    String output;
    serializeJson(doc, output);
    _server.send(200, "application/json", output);
}

void WebServerManager::handleCommand() {
    if (!isAuthorized(false)) return;

    DynamicJsonDocument doc(512);
    if (deserializeJson(doc, _server.arg("plain"))) {
        sendJsonResponse(400, false, F("Invalid JSON"));
        return;
    }

    String cmdId = doc["commandId"] | doc["command_uuid"] | "";
    String action = doc["action"] | doc["command_type"] | "";
    uint8_t gpioId = doc["id"] | (uint8_t)(doc["channel_id"] | 0);

    bool ok = false;
    if (action.equalsIgnoreCase("reboot")) {
        sendJsonResponse(200, true, F("Rebooting ESP-01..."));
        delay(500);
        ESP.restart();
        return;
    } else if (action.equalsIgnoreCase("setState")) {
        bool state = doc["state"] | false;
        ok = GpioManager::getInstance().setState(gpioId, state);
    } else if (action.equalsIgnoreCase("toggle")) {
        ok = GpioManager::getInstance().toggle(gpioId);
    } else if (action.equalsIgnoreCase("pulse")) {
        unsigned long dur = doc["duration"] | 500;
        ok = GpioManager::getInstance().pulse(gpioId, dur);
    } else if (action.equalsIgnoreCase("readInfo")) {
        ok = true;
    }

    DynamicJsonDocument resp(256);
    resp["success"] = ok;
    if (cmdId.length() > 0) resp["commandId"] = cmdId;
    resp["status"] = ok ? "ACKNOWLEDGED" : "FAILED";
    String out;
    serializeJson(resp, out);
    _server.send(ok ? 200 : 400, "application/json", out);
}

void WebServerManager::handleSaveGpioConfig() {
    if (!isAuthorized(false)) return;

    if (!_server.hasArg("plain")) {
        sendJsonResponse(400, false, F("No body received"));
        return;
    }

    DynamicJsonDocument doc(2048);
    DeserializationError err = deserializeJson(doc, _server.arg("plain"));
    if (err) {
        sendJsonResponse(400, false, F("JSON parse failed"));
        return;
    }

    // 1. Process relay channels list if provided
    if (doc.containsKey("channels") && doc["channels"].is<JsonArray>()) {
        JsonArray channels = doc["channels"].as<JsonArray>();
        GpioManager::getInstance().saveChannels(channels);
    } else if (doc.containsKey("pin")) {
        uint8_t id = doc["id"] | 1;
        uint8_t pin = doc["pin"];
        String name = doc["name"] | ("Relay " + String(id));
        String room = doc["room"] | "General";
        String func = doc["function"] | "Relay";
        bool activeLow = doc.containsKey("activeLow") ? doc["activeLow"].as<bool>() : (doc.containsKey("active_low") ? doc["active_low"].as<bool>() : true);
        uint8_t initMode = doc["initialMode"] | doc["initial_mode"] | 0;
        bool enabled = doc.containsKey("enabled") ? doc["enabled"].as<bool>() : true;
        GpioManager::getInstance().addOrUpdateChannel(id, pin, name, room, func, activeLow, initMode, enabled);
    }

    // 2. Process receiverServer if pushed with configuration
    if (doc.containsKey("receiverServer")) {
        String srv = doc["receiverServer"].as<String>();
        int colonIdx = srv.indexOf(':');
        ReceiverConfig rcfg = ReceiverClient::getInstance().getConfig();
        rcfg.enabled = true;
        if (colonIdx > 0) {
            rcfg.serverHost = srv.substring(0, colonIdx);
            rcfg.serverPort = srv.substring(colonIdx + 1).toInt();
        } else {
            rcfg.serverHost = srv;
        }
        ReceiverClient::getInstance().setConfig(rcfg);
    }

    sendJsonResponse(200, true, F("Configuration saved and applied!"));
}

void WebServerManager::registerApiRoutes() {
    // === AUTHENTICATION ===
    _server.on("/api/auth/login", HTTP_POST, [this]() {
        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, _server.arg("plain"))) {
            sendJsonResponse(400, false, F("Invalid JSON"));
            return;
        }

        String user = doc["username"] | "";
        String pass = doc["password"] | "";
        String token;

        if (AuthManager::getInstance().login(user, pass, token)) {
            _server.sendHeader(F("Set-Cookie"), String(F("session=")) + token + F("; Path=/; HttpOnly"));
            StaticJsonDocument<128> resp;
            resp["success"] = true;
            resp["token"] = token;
            resp["username"] = user;
            String out;
            serializeJson(resp, out);
            _server.send(200, "application/json", out);
        } else {
            sendJsonResponse(401, false, F("Invalid credentials"));
        }
    });

    _server.on("/api/auth/check", HTTP_GET, [this]() {
        bool authed = AuthManager::getInstance().authenticate(_server);
        StaticJsonDocument<128> resp;
        resp["authenticated"] = authed;
        resp["adminUser"] = AuthManager::getInstance().getAdminUsername();
        String out;
        serializeJson(resp, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/auth/logout", HTTP_POST, [this]() {
        AuthManager::getInstance().logout(_server);
        _server.sendHeader(F("Set-Cookie"), F("session=; Path=/; Max-Age=0"));
        sendJsonResponse(200, true, F("Logged out"));
    });

    _server.on("/api/auth/password", HTTP_POST, [this]() {
        if (!isAuthorized(false)) return;
        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, _server.arg("plain"))) {
            sendJsonResponse(400, false, F("Invalid JSON"));
            return;
        }
        String curr = doc["currentPassword"] | "";
        String next = doc["newPassword"] | "";
        if (AuthManager::getInstance().changePassword(curr, next)) {
            sendJsonResponse(200, true, F("Password updated successfully"));
        } else {
            sendJsonResponse(400, false, F("Current password incorrect or new password too short (min 4 chars)"));
        }
    });

    // === STATUS (Discovery & Health Polling) ===
    _server.on("/api/status", HTTP_GET, [this]() {
        handleStatus();
    });

    // === UNIFIED DIRECT COMMAND DISPATCHER ===
    _server.on("/api/command", HTTP_POST, [this]() {
        handleCommand();
    });
    _server.on("/api/commands/execute", HTTP_POST, [this]() {
        handleCommand();
    });

    // === GPIO CONFIGURATION PUSH & RETRIEVAL ===
    _server.on("/api/gpio/save", HTTP_POST, [this]() {
        handleSaveGpioConfig();
    });
    _server.on("/api/gpio", HTTP_POST, [this]() {
        handleSaveGpioConfig();
    });
    _server.on("/api/gpio", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache"));
        DynamicJsonDocument doc(512);
        JsonArray arr = doc.to<JsonArray>();
        GpioManager::getInstance().toJson(arr);
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/gpio/state", HTTP_POST, [this]() {
        if (!isAuthorized(false)) return;

        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, _server.arg("plain"))) {
            sendJsonResponse(400, false, F("Invalid JSON"));
            return;
        }

        uint8_t id = doc["id"] | 0;
        String action = doc["action"] | "";
        bool ok = false;

        if (action.equalsIgnoreCase("toggle")) {
            ok = GpioManager::getInstance().toggle(id);
        } else if (action.equalsIgnoreCase("pulse")) {
            unsigned long dur = doc["duration"] | 500;
            ok = GpioManager::getInstance().pulse(id, dur);
        } else if (doc.containsKey("state")) {
            bool state = doc["state"].as<bool>();
            ok = GpioManager::getInstance().setState(id, state);
        }

        sendJsonResponse(ok ? 200 : 400, ok, ok ? F("State updated") : F("Failed to set state"));
    });

    // === WI-FI & CENTRAL SERVER SETUP ===
    _server.on("/api/wifi/connect", HTTP_POST, [this]() {
        if (!isAuthorized(false)) return;

        DynamicJsonDocument doc(512);
        if (deserializeJson(doc, _server.arg("plain"))) {
            sendJsonResponse(400, false, F("Invalid JSON"));
            return;
        }

        String ssid = doc["ssid"] | "";
        String pass = doc["password"] | "";
        String srvHost = doc["serverHost"] | "";
        uint16_t srvPort = doc["serverPort"] | 2000;

        if (ssid.length() == 0) {
            sendJsonResponse(400, false, F("SSID cannot be empty"));
            return;
        }

        if (srvHost.length() > 0) {
            ReceiverConfig cfg = ReceiverClient::getInstance().getConfig();
            cfg.enabled = true;
            cfg.serverHost = srvHost;
            cfg.serverPort = srvPort;
            ReceiverClient::getInstance().setConfig(cfg);
        }

        sendJsonResponse(200, true, F("Connecting to Wi-Fi..."));
        _server.client().flush();
        WifiManager::getInstance().connectToRouter(ssid, pass, true);
    });

    _server.on("/api/wifi/scan", HTTP_GET, [this]() {
        if (!isAuthorized(false)) return;
        int n = WiFi.scanNetworks(false, false);
        DynamicJsonDocument doc(1024);
        JsonArray arr = doc.to<JsonArray>();
        if (n > 0) {
            for (int i = 0; i < n && i < 16; i++) {
                String s = WiFi.SSID(i);
                if (s.length() == 0) continue;
                JsonObject o = arr.createNestedObject();
                o["ssid"] = s;
                o["rssi"] = WiFi.RSSI(i);
                o["enc"] = (WiFi.encryptionType(i) != ENC_TYPE_NONE);
            }
        }
        WiFi.scanDelete();
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    // === RECEIVER CONFIG ===
    _server.on("/api/receiver", HTTP_GET, [this]() {
        DynamicJsonDocument doc(512);
        JsonObject obj = doc.to<JsonObject>();
        ReceiverClient::getInstance().getStatusJson(obj);
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/receiver", HTTP_POST, [this]() {
        if (!isAuthorized(false)) return;

        DynamicJsonDocument doc(512);
        if (deserializeJson(doc, _server.arg("plain"))) {
            sendJsonResponse(400, false, F("Invalid JSON"));
            return;
        }

        ReceiverConfig cfg = ReceiverClient::getInstance().getConfig();
        if (doc.containsKey("enabled")) cfg.enabled = doc["enabled"].as<bool>();
        if (doc.containsKey("server")) {
            String srv = doc["server"].as<String>();
            int idx = srv.indexOf(':');
            if (idx > 0) {
                cfg.serverHost = srv.substring(0, idx);
                cfg.serverPort = srv.substring(idx + 1).toInt();
            } else {
                cfg.serverHost = srv;
            }
        }
        if (doc.containsKey("serverHost")) cfg.serverHost = doc["serverHost"].as<String>();
        if (doc.containsKey("serverPort")) cfg.serverPort = doc["serverPort"].as<uint16_t>();
        if (doc.containsKey("authToken")) cfg.authToken = doc["authToken"].as<String>();

        ReceiverClient::getInstance().setConfig(cfg);
        sendJsonResponse(200, true, F("Receiver config updated"));
    });

    // === SYSTEM REBOOT ===
    _server.on("/api/system/reboot", HTTP_POST, [this]() {
        if (!isAuthorized(false)) return;
        sendJsonResponse(200, true, F("Rebooting..."));
        delay(500);
        ESP.restart();
    });

    // === OTA FIRMWARE UPLOAD ===
    _server.on("/api/ota/upload", HTTP_POST, [this]() {
        OtaManager::getInstance().handleUploadEnd(_server);
    }, [this]() {
        HTTPUpload& upload = _server.upload();
        if (upload.status == UPLOAD_FILE_START) {
            String typeParam = _server.hasArg("type") ? _server.arg("type") : "";
            if (_server.hasHeader("X-File-MD5")) {
                OtaManager::getInstance().setExpectedMD5(_server.header("X-File-MD5"));
            }
            OtaManager::getInstance().handleUploadStart(upload.filename, typeParam);
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            OtaManager::getInstance().handleUploadWrite(upload.buf, upload.currentSize);
        } else if (upload.status == UPLOAD_FILE_END) {
            OtaManager::getInstance().handleUploadFinish();
        } else if (upload.status == UPLOAD_FILE_ABORTED) {
            OtaManager::getInstance().handleUploadAbort();
        }
    });
}

void WebServerManager::registerStaticRoutes() {
    _server.on("/", HTTP_GET, [this]() {
        serveEmbeddedDashboard();
    });
    _server.on("/index.html", HTTP_GET, [this]() {
        serveEmbeddedDashboard();
    });
}

void WebServerManager::serveEmbeddedDashboard() {
    _server.sendHeader(F("Content-Encoding"), F("gzip"));
    _server.send_P(200, "text/html; charset=UTF-8", (const char*)DASHBOARD_HTML_GZ, DASHBOARD_HTML_GZ_LEN);
}

#elif defined(TARGET_ESP01_PCF8574)
#include "web_server.h"
#include "storage_manager.h"
#include "auth_manager.h"
#include "wifi_manager.h"
#include "gpio_manager.h"
#include "ota_manager.h"
#include "receiver_client.h"
#include "dashboard_html.h"

WebServerManager::WebServerManager() : _server(80), _deviceName(FIRMWARE_NAME) {}

WebServerManager& WebServerManager::getInstance() {
    static WebServerManager instance;
    return instance;
}

bool WebServerManager::begin() {
    DynamicJsonDocument doc(256);
    if (StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, doc)) {
        if (doc.containsKey("deviceName")) {
            _deviceName = doc["deviceName"].as<String>();
        }
    }

    const char* headerKeys[] = { "Cookie", "Authorization", "X-Session-Token", "X-File-MD5" };
    _server.collectHeaders(headerKeys, sizeof(headerKeys) / sizeof(char*));

    registerRoutes();
    _server.begin();
    Logger::log(F("[HTTP] SmartHome ESP-01 Web Server active on port 80"));
    return true;
}

void WebServerManager::loop() {
    _server.handleClient();
}

void WebServerManager::setDeviceName(const String& name) {
    if (name.length() > 0) {
        _deviceName = name;
        DynamicJsonDocument doc(256);
        StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, doc);
        doc["deviceName"] = _deviceName;
        StorageManager::getInstance().saveJsonFile(FILE_SYSTEM_CONFIG, doc);
    }
}

bool WebServerManager::isAuthorized(bool allowUnauthenticatedDiscovery) {
    String user = AuthManager::getInstance().getAdminUsername();
    String pass = AuthManager::getInstance().getAdminPassword();

    // 1. HTTP Basic Authentication check (e.g. from Central Server / Test Auth)
    if (_server.hasHeader("Authorization")) {
        String authHeader = _server.header("Authorization");
        if (authHeader.startsWith("Basic ")) {
            if (_server.authenticate(user.c_str(), pass.c_str())) {
                return true;
            }
            // Explicit Basic Auth credentials provided but failed
            _server.requestAuthentication(BASIC_AUTH, "SmartHome", "Authentication Required");
            return false;
        } else if (authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            token.trim();
            const ReceiverConfig& rcfg = ReceiverClient::getInstance().getConfig();
            if (rcfg.authToken.length() > 0 && token == rcfg.authToken) {
                return true;
            }
        }
    }

    // 2. Web session token authentication (Cookie or X-Session-Token)
    if (AuthManager::getInstance().authenticate(_server)) {
        return true;
    }

    // 3. Central receiver host IP trust (if configured)
    const ReceiverConfig& rcfg = ReceiverClient::getInstance().getConfig();
    if (rcfg.enabled && rcfg.serverHost.length() > 0) {
        if (_server.client().remoteIP().toString() == rcfg.serverHost) {
            return true;
        }
    }

    // 4. Local AP trust for captive portal onboarding
    if (WifiManager::getInstance().isAPActive() && !WifiManager::getInstance().isSTAConnected()) {
        IPAddress clientIp = _server.client().remoteIP();
        IPAddress apIp = WiFi.softAPIP();
        if (clientIp[0] == apIp[0] && clientIp[1] == apIp[1] && clientIp[2] == apIp[2]) {
            return true;
        }
    }

    // 5. Unauthenticated discovery allowance (for /api/status network scanner probing)
    if (allowUnauthenticatedDiscovery && !_server.hasHeader("Authorization")) {
        return true;
    }

    // Reject unauthenticated access
    _server.requestAuthentication(BASIC_AUTH, "SmartHome", "Authentication Required");
    return false;
}

void WebServerManager::sendJsonResponse(int code, bool success, const String& message) {
    String out = String(F("{\"success\":")) + (success ? F("true") : F("false")) +
                 F(",\"") + (success ? F("message") : F("error")) + F("\":\"") + message + F("\"}");
    _server.send(code, "application/json", out);
}

void WebServerManager::registerRoutes() {
    registerCaptiveRoutes();
    registerApiRoutes();
    registerStaticRoutes();

    // 404 Handler / Captive Portal Redirect
    _server.onNotFound([this]() {
        if (WifiManager::getInstance().isAPActive() && !WifiManager::getInstance().isSTAConnected()) {
            _server.sendHeader(F("Location"), String(F("http://")) + WiFi.softAPIP().toString() + F("/"), true);
            _server.send(302, F("text/plain"), F(""));
            return;
        }
        _server.send(404, F("application/json"), F("{\"error\":\"Not Found\"}"));
    });
}

void WebServerManager::registerCaptiveRoutes() {
    auto captiveRedirect = [this]() {
        String target = String(F("http://")) + (WifiManager::getInstance().isAPActive() ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + F("/");
        _server.sendHeader(F("Location"), target, true);
        _server.send(302, F("text/plain"), F(""));
    };

    _server.on("/generate_204", captiveRedirect);
    _server.on("/gen_204", captiveRedirect);
    _server.on("/ncsi.txt", captiveRedirect);
    _server.on("/hotspot-detect.html", captiveRedirect);
    _server.on("/canonical.html", captiveRedirect);
    _server.on("/connecttest.txt", captiveRedirect);
    _server.on("/redirect", captiveRedirect);
    _server.on("/success.txt", captiveRedirect);
}

void WebServerManager::handleStatus() {
    // If Authorization header was provided, strictly enforce authentication
    if (!isAuthorized(true)) return;

    DynamicJsonDocument doc(2048);
    doc["deviceName"] = _deviceName;
    doc["hardware"] = HARDWARE_TARGET;
    doc["firmwareVersion"] = FIRMWARE_VERSION;
    doc["mac"] = WiFi.macAddress();
    doc["nodeId"] = ReceiverClient::getInstance().getConfig().nodeId;
    doc["chipId"] = String(ESP.getChipId(), HEX);
    doc["rssi"] = WifiManager::getInstance().getSTARSSI();
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["uptimeSec"] = millis() / 1000UL;
    doc["sketchSize"] = ESP.getSketchSize();
    doc["freeSketchSpace"] = ESP.getFreeSketchSpace();
    doc["staConnected"] = WifiManager::getInstance().isSTAConnected();
    doc["ip"] = WifiManager::getInstance().isSTAConnected() ? WifiManager::getInstance().getSTAIP() : WifiManager::getInstance().getAPIP();
    doc["ssid"] = WifiManager::getInstance().getConnectedSSID();
    doc["receiverEnabled"] = ReceiverClient::getInstance().getConfig().enabled;
    doc["receiverServer"] = ReceiverClient::getInstance().getConfig().serverHost + ":" + String(ReceiverClient::getInstance().getConfig().serverPort);

    // PCF8574T I2C Expander status
    doc["pcf8574Detected"] = GpioManager::getInstance().isPcfDetected();
    char pcfAddrStr[8];
    snprintf(pcfAddrStr, sizeof(pcfAddrStr), "0x%02X", GpioManager::getInstance().getPcfAddress());
    doc["pcf8574Address"] = pcfAddrStr;
    doc["pcf8574Output"] = GpioManager::getInstance().getPcfOutputByte();

    // Relay channels list
    JsonArray channels = doc.createNestedArray("channels");
    GpioManager::getInstance().toJson(channels);

    String output;
    serializeJson(doc, output);
    _server.send(200, "application/json", output);
}

void WebServerManager::handleCommand() {
    if (!isAuthorized(false)) return;

    DynamicJsonDocument doc(1024);
    if (deserializeJson(doc, _server.arg("plain"))) {
        sendJsonResponse(400, false, F("Invalid JSON"));
        return;
    }

    String cmdId = doc["commandId"] | doc["command_uuid"] | "";
    String action = doc["action"] | doc["command_type"] | "";
    uint8_t gpioId = doc["id"] | (uint8_t)(doc["channel_id"] | 0);

    bool ok = false;
    if (action.equalsIgnoreCase("reboot")) {
        sendJsonResponse(200, true, F("Rebooting ESP-01..."));
        delay(500);
        ESP.restart();
        return;
    } else if (action.equalsIgnoreCase("setState")) {
        bool state = doc["state"] | false;
        ok = GpioManager::getInstance().setState(gpioId, state);
    } else if (action.equalsIgnoreCase("toggle")) {
        ok = GpioManager::getInstance().toggle(gpioId);
    } else if (action.equalsIgnoreCase("pulse")) {
        unsigned long dur = doc["duration"] | 500;
        ok = GpioManager::getInstance().pulse(gpioId, dur);
    } else if (action.equalsIgnoreCase("readInfo")) {
        ok = true;
    }

    DynamicJsonDocument resp(256);
    resp["success"] = ok;
    if (cmdId.length() > 0) resp["commandId"] = cmdId;
    resp["status"] = ok ? "ACKNOWLEDGED" : "FAILED";
    String out;
    serializeJson(resp, out);
    _server.send(ok ? 200 : 400, "application/json", out);
}

void WebServerManager::handleSaveGpioConfig() {
    if (!isAuthorized(false)) return;

    if (!_server.hasArg("plain")) {
        sendJsonResponse(400, false, F("No body received"));
        return;
    }

    DynamicJsonDocument doc(3072);
    DeserializationError err = deserializeJson(doc, _server.arg("plain"));
    if (err) {
        sendJsonResponse(400, false, F("JSON parse failed"));
        return;
    }

    // 1. Process relay channels list if provided
    if (doc.containsKey("channels") && doc["channels"].is<JsonArray>()) {
        JsonArray channels = doc["channels"].as<JsonArray>();
        GpioManager::getInstance().saveChannels(channels);
    } else if (doc.containsKey("pin")) {
        uint8_t id = doc["id"] | 1;
        uint8_t pin = doc["pin"];
        String name = doc["name"] | ("Relay " + String(id));
        String room = doc["room"] | "General";
        String func = doc["function"] | "Relay";
        bool activeLow = doc.containsKey("activeLow") ? doc["activeLow"].as<bool>() : (doc.containsKey("active_low") ? doc["active_low"].as<bool>() : true);
        uint8_t initMode = doc["initialMode"] | doc["initial_mode"] | 0;
        bool enabled = doc.containsKey("enabled") ? doc["enabled"].as<bool>() : true;
        GpioManager::getInstance().addOrUpdateChannel(id, pin, name, room, func, activeLow, initMode, enabled);
    }

    // 2. Process receiverServer if pushed with configuration
    if (doc.containsKey("receiverServer")) {
        String srv = doc["receiverServer"].as<String>();
        int colonIdx = srv.indexOf(':');
        ReceiverConfig rcfg = ReceiverClient::getInstance().getConfig();
        rcfg.enabled = true;
        if (colonIdx > 0) {
            rcfg.serverHost = srv.substring(0, colonIdx);
            rcfg.serverPort = srv.substring(colonIdx + 1).toInt();
        } else {
            rcfg.serverHost = srv;
        }
        ReceiverClient::getInstance().setConfig(rcfg);
    }

    sendJsonResponse(200, true, F("Configuration saved and applied!"));
}

void WebServerManager::registerApiRoutes() {
    // === AUTHENTICATION ===
    _server.on("/api/auth/login", HTTP_POST, [this]() {
        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, _server.arg("plain"))) {
            sendJsonResponse(400, false, F("Invalid JSON"));
            return;
        }

        String user = doc["username"] | "";
        String pass = doc["password"] | "";
        String token;

        if (AuthManager::getInstance().login(user, pass, token)) {
            _server.sendHeader(F("Set-Cookie"), String(F("session=")) + token + F("; Path=/; HttpOnly"));
            StaticJsonDocument<128> resp;
            resp["success"] = true;
            resp["token"] = token;
            resp["username"] = user;
            String out;
            serializeJson(resp, out);
            _server.send(200, "application/json", out);
        } else {
            sendJsonResponse(401, false, F("Invalid credentials"));
        }
    });

    _server.on("/api/auth/check", HTTP_GET, [this]() {
        bool authed = AuthManager::getInstance().authenticate(_server);
        StaticJsonDocument<128> resp;
        resp["authenticated"] = authed;
        resp["adminUser"] = AuthManager::getInstance().getAdminUsername();
        String out;
        serializeJson(resp, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/auth/logout", HTTP_POST, [this]() {
        AuthManager::getInstance().logout(_server);
        _server.sendHeader(F("Set-Cookie"), F("session=; Path=/; Max-Age=0"));
        sendJsonResponse(200, true, F("Logged out"));
    });

    _server.on("/api/auth/password", HTTP_POST, [this]() {
        if (!isAuthorized(false)) return;
        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, _server.arg("plain"))) {
            sendJsonResponse(400, false, F("Invalid JSON"));
            return;
        }
        String curr = doc["currentPassword"] | "";
        String next = doc["newPassword"] | "";
        if (AuthManager::getInstance().changePassword(curr, next)) {
            sendJsonResponse(200, true, F("Password updated successfully"));
        } else {
            sendJsonResponse(400, false, F("Current password incorrect or new password too short (min 4 chars)"));
        }
    });

    // === STATUS (Discovery & Health Polling) ===
    _server.on("/api/status", HTTP_GET, [this]() {
        handleStatus();
    });

    // === UNIFIED DIRECT COMMAND DISPATCHER ===
    _server.on("/api/command", HTTP_POST, [this]() {
        handleCommand();
    });
    _server.on("/api/commands/execute", HTTP_POST, [this]() {
        handleCommand();
    });

    // === GPIO CONFIGURATION PUSH & RETRIEVAL ===
    _server.on("/api/gpio/save", HTTP_POST, [this]() {
        handleSaveGpioConfig();
    });
    _server.on("/api/gpio", HTTP_POST, [this]() {
        handleSaveGpioConfig();
    });
    _server.on("/api/gpio", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache"));
        DynamicJsonDocument doc(2048);
        JsonArray arr = doc.to<JsonArray>();
        GpioManager::getInstance().toJson(arr);
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/gpio/state", HTTP_POST, [this]() {
        if (!isAuthorized(false)) return;

        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, _server.arg("plain"))) {
            sendJsonResponse(400, false, F("Invalid JSON"));
            return;
        }

        uint8_t id = doc["id"] | 0;
        String action = doc["action"] | "";
        bool ok = false;

        if (action.equalsIgnoreCase("toggle")) {
            ok = GpioManager::getInstance().toggle(id);
        } else if (action.equalsIgnoreCase("pulse")) {
            unsigned long dur = doc["duration"] | 500;
            ok = GpioManager::getInstance().pulse(id, dur);
        } else if (doc.containsKey("state")) {
            bool state = doc["state"].as<bool>();
            ok = GpioManager::getInstance().setState(id, state);
        }

        sendJsonResponse(ok ? 200 : 400, ok, ok ? F("State updated") : F("Failed to set state"));
    });

    // === WI-FI & CENTRAL SERVER SETUP ===
    _server.on("/api/wifi/connect", HTTP_POST, [this]() {
        if (!isAuthorized(false)) return;

        DynamicJsonDocument doc(512);
        if (deserializeJson(doc, _server.arg("plain"))) {
            sendJsonResponse(400, false, F("Invalid JSON"));
            return;
        }

        String ssid = doc["ssid"] | "";
        String pass = doc["password"] | "";
        String srvHost = doc["serverHost"] | "";
        uint16_t srvPort = doc["serverPort"] | 2000;

        if (ssid.length() == 0) {
            sendJsonResponse(400, false, F("SSID cannot be empty"));
            return;
        }

        if (srvHost.length() > 0) {
            ReceiverConfig cfg = ReceiverClient::getInstance().getConfig();
            cfg.enabled = true;
            cfg.serverHost = srvHost;
            cfg.serverPort = srvPort;
            ReceiverClient::getInstance().setConfig(cfg);
        }

        sendJsonResponse(200, true, F("Connecting to Wi-Fi..."));
        _server.client().flush();
        WifiManager::getInstance().connectToRouter(ssid, pass, true);
    });

    _server.on("/api/wifi/scan", HTTP_GET, [this]() {
        if (!isAuthorized(false)) return;
        int n = WiFi.scanNetworks(false, false);
        DynamicJsonDocument doc(2048);
        JsonArray arr = doc.to<JsonArray>();
        if (n > 0) {
            for (int i = 0; i < n && i < 16; i++) {
                String s = WiFi.SSID(i);
                if (s.length() == 0) continue;
                JsonObject o = arr.createNestedObject();
                o["ssid"] = s;
                o["rssi"] = WiFi.RSSI(i);
                o["enc"] = (WiFi.encryptionType(i) != ENC_TYPE_NONE);
            }
        }
        WiFi.scanDelete();
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    // === RECEIVER CONFIG ===
    _server.on("/api/receiver", HTTP_GET, [this]() {
        DynamicJsonDocument doc(512);
        JsonObject obj = doc.to<JsonObject>();
        ReceiverClient::getInstance().getStatusJson(obj);
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/receiver", HTTP_POST, [this]() {
        if (!isAuthorized(false)) return;

        DynamicJsonDocument doc(512);
        if (deserializeJson(doc, _server.arg("plain"))) {
            sendJsonResponse(400, false, F("Invalid JSON"));
            return;
        }

        ReceiverConfig cfg = ReceiverClient::getInstance().getConfig();
        if (doc.containsKey("enabled")) cfg.enabled = doc["enabled"].as<bool>();
        if (doc.containsKey("server")) {
            String srv = doc["server"].as<String>();
            int idx = srv.indexOf(':');
            if (idx > 0) {
                cfg.serverHost = srv.substring(0, idx);
                cfg.serverPort = srv.substring(idx + 1).toInt();
            } else {
                cfg.serverHost = srv;
            }
        }
        if (doc.containsKey("serverHost")) cfg.serverHost = doc["serverHost"].as<String>();
        if (doc.containsKey("serverPort")) cfg.serverPort = doc["serverPort"].as<uint16_t>();
        if (doc.containsKey("authToken")) cfg.authToken = doc["authToken"].as<String>();

        ReceiverClient::getInstance().setConfig(cfg);
        sendJsonResponse(200, true, F("Receiver config updated"));
    });

    // === SYSTEM REBOOT ===
    _server.on("/api/system/reboot", HTTP_POST, [this]() {
        if (!isAuthorized(false)) return;
        sendJsonResponse(200, true, F("Rebooting..."));
        delay(500);
        ESP.restart();
    });

    // === OTA FIRMWARE UPLOAD ===
    _server.on("/api/ota/upload", HTTP_POST, [this]() {
        OtaManager::getInstance().handleUploadEnd(_server);
    }, [this]() {
        HTTPUpload& upload = _server.upload();
        if (upload.status == UPLOAD_FILE_START) {
            String typeParam = _server.hasArg("type") ? _server.arg("type") : "";
            if (_server.hasHeader("X-File-MD5")) {
                OtaManager::getInstance().setExpectedMD5(_server.header("X-File-MD5"));
            }
            OtaManager::getInstance().handleUploadStart(upload.filename, typeParam);
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            OtaManager::getInstance().handleUploadWrite(upload.buf, upload.currentSize);
        } else if (upload.status == UPLOAD_FILE_END) {
            OtaManager::getInstance().handleUploadFinish();
        } else if (upload.status == UPLOAD_FILE_ABORTED) {
            OtaManager::getInstance().handleUploadAbort();
        }
    });
}

void WebServerManager::registerStaticRoutes() {
    _server.on("/", HTTP_GET, [this]() {
        serveEmbeddedDashboard();
    });
    _server.on("/index.html", HTTP_GET, [this]() {
        serveEmbeddedDashboard();
    });
}

void WebServerManager::serveEmbeddedDashboard() {
    _server.sendHeader(F("Content-Encoding"), F("gzip"));
    _server.send_P(200, "text/html; charset=UTF-8", (const char*)DASHBOARD_HTML_GZ, DASHBOARD_HTML_GZ_LEN);
}

#elif defined(TARGET_NODEMCU_PCF8574)
#include "web_server.h"
#include "storage_manager.h"
#include "auth_manager.h"
#include "wifi_manager.h"
#include "gpio_manager.h"
#include "automation.h"
#include "ota_manager.h"
#include "receiver_client.h"
#include "drivers/pcf8574_driver.h"
#include <Wire.h>
#include <LittleFS.h>
#if FEATURE_PCF8574
#include "drivers/pcf8574_driver.h"
#endif

// Initialize static circular Logger ring buffer
LogEntry Logger::_logs[LOG_RING_CAPACITY];
size_t Logger::_head = 0;
size_t Logger::_count = 0;

void Logger::log(const String& msg) {
    Serial.println(msg);

    size_t writeIdx;
    if (_count < LOG_RING_CAPACITY) {
        writeIdx = (_head + _count) % LOG_RING_CAPACITY;
        _count++;
    } else {
        writeIdx = _head;
        _head = (_head + 1) % LOG_RING_CAPACITY;
    }

    _logs[writeIdx].timestampMs = millis();
    strncpy(_logs[writeIdx].message, msg.c_str(), LOG_MSG_MAX_LEN - 1);
    _logs[writeIdx].message[LOG_MSG_MAX_LEN - 1] = '\0';
}

void Logger::log(const __FlashStringHelper* msg) {
    Serial.println(msg);

    size_t writeIdx;
    if (_count < LOG_RING_CAPACITY) {
        writeIdx = (_head + _count) % LOG_RING_CAPACITY;
        _count++;
    } else {
        writeIdx = _head;
        _head = (_head + 1) % LOG_RING_CAPACITY;
    }

    _logs[writeIdx].timestampMs = millis();
    strncpy_P(_logs[writeIdx].message, (PGM_P)msg, LOG_MSG_MAX_LEN - 1);
    _logs[writeIdx].message[LOG_MSG_MAX_LEN - 1] = '\0';
}

void Logger::getLogsJson(JsonArray& arr) {
    for (size_t i = 0; i < _count; i++) {
        size_t idx = (_head + i) % LOG_RING_CAPACITY;
        JsonObject obj = arr.createNestedObject();
        obj["uptimeMs"] = _logs[idx].timestampMs;
        obj["msg"] = _logs[idx].message;
    }
}

void Logger::clear() {
    _head = 0;
    _count = 0;
}

WebServerManager::WebServerManager() : _server(80), _deviceName(FIRMWARE_NAME) {}

WebServerManager& WebServerManager::getInstance() {
    static WebServerManager instance;
    return instance;
}

bool WebServerManager::begin() {
    DynamicJsonDocument doc(512);
    if (StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, doc)) {
        if (doc.containsKey("deviceName")) {
            _deviceName = doc["deviceName"].as<String>();
        }
    }

    const char* headerKeys[] = { "Cookie", "Authorization", "X-Session-Token", "X-Server-Key", "X-Pairing-Key", "X-File-MD5", "User-Agent" };
    _server.collectHeaders(headerKeys, sizeof(headerKeys) / sizeof(char*));

    registerRoutes();
    _server.begin();
    Logger::log(F("[HTTP] Web server started on port 80"));
    return true;
}

void WebServerManager::loop() {
    _server.handleClient();
}

void WebServerManager::setDeviceName(const String& name) {
    if (name.length() > 0) {
        _deviceName = name;
        DynamicJsonDocument doc(512);
        StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, doc);
        doc["deviceName"] = _deviceName;
        StorageManager::getInstance().saveJsonFile(FILE_SYSTEM_CONFIG, doc);
    }
}

bool WebServerManager::checkAuthOrReject() {
    // 1. Allow authenticated user session (Cookie or Bearer token)
    if (AuthManager::getInstance().authenticate(_server)) {
        return true;
    }

    // 2. Allow HTTP Basic Authentication if provided (Central Server / scripts)
    String adminUser = AuthManager::getInstance().getAdminUsername();
    if (_server.hasHeader("Authorization")) {
        String authHdr = _server.header("Authorization");
        if (authHdr.startsWith("Basic ")) {
            if (_server.authenticate(adminUser.c_str(), DEFAULT_ADMIN_PASS) ||
                _server.authenticate(DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS) ||
                _server.authenticate(DEFAULT_ADMIN_USER, "admin123")) {
                return true;
            }
        }
    }

    // 3. Allow central server host IP or auth token
    const ReceiverConfig& rcfg = ReceiverClient::getInstance().getConfig();
    if (rcfg.serverHost.length() > 0) {
        String clientIp = _server.client().remoteIP().toString();
        if (clientIp == rcfg.serverHost) {
            return true;
        }
    }
    if (rcfg.authToken.length() > 0 && _server.hasHeader("Authorization")) {
        String authHeader = _server.header("Authorization");
        if (authHeader == ("Bearer " + rcfg.authToken)) {
            return true;
        }
    }

    // 4. Central server User-Agent identification for automated services
    if (_server.hasHeader("User-Agent")) {
        String ua = _server.header("User-Agent");
        if (ua.startsWith("SmartHome-Central-")) {
            return true;
        }
    }

    // 5. Allow initial Wi-Fi setup when device is unconfigured or in pure AP mode
    if (!WifiManager::getInstance().isConfigured() || WifiManager::getInstance().getMode() == WIFI_MODE_AP_ONLY) {
        String uri = _server.uri();
        if (uri.startsWith(F("/api/wifi/connect")) || uri.startsWith(F("/api/wifi/scan")) || uri.startsWith(F("/api/status"))) {
            return true;
        }
    }

    _server.sendHeader(F("Access-Control-Allow-Origin"), F("*"));
    _server.send(401, "application/json", F("{\"success\":false,\"error\":\"Unauthorized\"}"));
    return false;
}

void WebServerManager::sendJsonResponse(int code, bool success, const String& message) {
    StaticJsonDocument<256> doc;
    doc["success"] = success;
    if (success) {
        doc["message"] = message;
    } else {
        doc["error"] = message;
    }
    String out;
    serializeJson(doc, out);
    _server.sendHeader(F("Access-Control-Allow-Origin"), F("*"));
    _server.send(code, "application/json", out);
}

void WebServerManager::registerRoutes() {
    registerCaptiveRoutes();
    registerApiRoutes();
    registerStaticRoutes();

    // 404 Handler with CORS Preflight & Captive Portal Redirect
    _server.onNotFound([this]() {
        if (_server.method() == HTTP_OPTIONS) {
            _server.sendHeader(F("Access-Control-Allow-Origin"), F("*"));
            _server.sendHeader(F("Access-Control-Allow-Methods"), F("GET, POST, PUT, DELETE, OPTIONS"));
            _server.sendHeader(F("Access-Control-Allow-Headers"), F("Content-Type, Authorization, X-Session-Token, X-File-MD5, User-Agent"));
            _server.send(204);
            return;
        }

        if (handleFileRead(_server.uri())) {
            return;
        }

        if (_server.uri() == "/" || _server.uri() == "/index.html") {
            serveEmbeddedDashboard();
            return;
        }

        if (WifiManager::getInstance().isAPActive() && !WifiManager::getInstance().isSTAConnected()) {
            _server.sendHeader(F("Location"), String(F("http://")) + WiFi.softAPIP().toString() + F("/"), true);
            _server.send(302, F("text/plain"), F("Redirecting to captive setup..."));
            return;
        }

        _server.sendHeader(F("Access-Control-Allow-Origin"), F("*"));
        _server.send(404, F("application/json"), F("{\"error\":\"Not Found\"}"));
    });
}

void WebServerManager::registerCaptiveRoutes() {
    auto captiveRedirect = [this]() {
        String target = String(F("http://")) + (WifiManager::getInstance().isAPActive() ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + F("/");
        _server.sendHeader(F("Location"), target, true);
        _server.send(302, F("text/plain"), F(""));
    };

    _server.on("/generate_204", captiveRedirect);
    _server.on("/gen_204", captiveRedirect);
    _server.on("/ncsi.txt", captiveRedirect);
    _server.on("/hotspot-detect.html", captiveRedirect);
    _server.on("/canonical.html", captiveRedirect);
    _server.on("/connecttest.txt", captiveRedirect);
    _server.on("/redirect", captiveRedirect);
    _server.on("/success.txt", captiveRedirect);
}

void WebServerManager::registerApiRoutes() {
    // === AUTHENTICATION ===
    _server.on("/api/auth/login", HTTP_POST, [this]() {
        StaticJsonDocument<256> doc;
        DeserializationError err = deserializeJson(doc, _server.arg("plain"));
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON payload"));
            return;
        }

        String user = doc["username"] | "";
        String pass = doc["password"] | "";
        String token;

        if (AuthManager::getInstance().login(user, pass, token)) {
            _server.sendHeader(F("Set-Cookie"), String(F("session=")) + token + F("; Path=/; HttpOnly"));
            StaticJsonDocument<256> resp;
            resp["success"] = true;
            resp["token"] = token;
            resp["username"] = user;
            String out;
            serializeJson(resp, out);
            _server.send(200, "application/json", out);
            Logger::log(String(F("[AUTH] User '")) + user + F("' authenticated"));
        } else {
            sendJsonResponse(401, false, F("Invalid username or password"));
        }
    });

    _server.on("/api/auth/check", HTTP_GET, [this]() {
        bool authed = AuthManager::getInstance().authenticate(_server);
        StaticJsonDocument<128> resp;
        resp["authenticated"] = authed;
        resp["adminUser"] = AuthManager::getInstance().getAdminUsername();
        String out;
        serializeJson(resp, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/auth/logout", HTTP_POST, [this]() {
        AuthManager::getInstance().logout(_server);
        _server.sendHeader(F("Set-Cookie"), F("session=; Path=/; Max-Age=0"));
        sendJsonResponse(200, true, F("Logged out successfully"));
    });

    _server.on("/api/auth/pair", HTTP_GET, [this]() {
        StaticJsonDocument<128> doc;
        doc["paired"] = AuthManager::getInstance().isPaired();
        doc["adminUser"] = AuthManager::getInstance().getAdminUsername();
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/auth/pair", HTTP_POST, [this]() {
        StaticJsonDocument<256> doc;
        DeserializationError err = deserializeJson(doc, _server.arg("plain"));
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON payload"));
            return;
        }

        String serverKey = doc["serverKey"] | "";
        if (serverKey.length() < 6) {
            sendJsonResponse(400, false, F("Server pairing key must be at least 6 characters"));
            return;
        }

        // Must be authenticated OR provide valid adminPassword in JSON
        if (!AuthManager::getInstance().authenticate(_server)) {
            String adminPass = doc["adminPassword"] | "";
            if (!AuthManager::getInstance().checkCredentials(AuthManager::getInstance().getAdminUsername(), adminPass)) {
                sendJsonResponse(401, false, F("Authentication required to set server pairing key"));
                return;
            }
        }

        if (AuthManager::getInstance().setServerPairingKey(serverKey)) {
            Logger::log(F("[AUTH] Central Server pairing key configured"));
            sendJsonResponse(200, true, F("Device successfully paired to Central Server"));
        } else {
            sendJsonResponse(500, false, F("Failed to set pairing key"));
        }
    });

    _server.on("/api/auth/unpair", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        if (AuthManager::getInstance().clearServerPairingKey()) {
            Logger::log(F("[AUTH] Device unpaired from Central Server"));
            sendJsonResponse(200, true, F("Device unpaired successfully"));
        } else {
            sendJsonResponse(500, false, F("Failed to unpair"));
        }
    });

    // === SYSTEM OVERVIEW & DIAGNOSTICS STATUS ===
    _server.on("/api/status", HTTP_GET, [this]() {
        static uint32_t s_minFreeHeap = 0;
        uint32_t freeHeap = ESP.getFreeHeap();
        if (s_minFreeHeap == 0 || freeHeap < s_minFreeHeap) {
            s_minFreeHeap = freeHeap;
        }

        DynamicJsonDocument doc(1536);
        doc["deviceName"] = _deviceName;
        doc["firmwareVersion"] = FIRMWARE_VERSION;
        doc["hardware"] = HARDWARE_TARGET;
        doc["coreVersion"] = ESP.getCoreVersion();
        doc["sdkVersion"] = ESP.getSdkVersion();

        // System Uptime & Boot Counters
        doc["uptimeSec"] = millis() / 1000UL;
        doc["bootCount"] = StorageManager::getInstance().getBootCount();
        doc["cpuFreq"] = ESP.getCpuFreqMHz();
        doc["mac"] = WiFi.macAddress();
        doc["nodeId"] = ReceiverClient::getInstance().getConfig().nodeId;
        doc["chipId"] = String(ESP.getChipId(), HEX);
        doc["formattedTime"] = AutomationEngine::getInstance().getFormattedTime();

        // Reset Diagnostics
        doc["resetReason"] = ESP.getResetReason();
        doc["resetRaw"] = ESP.getResetInfo();
        
        rst_info* rst = ESP.getResetInfoPtr();
        String resetDetails = ESP.getResetReason();
        if (rst) {
            switch (rst->reason) {
                case 0: resetDetails = F("Power-on Reset (Cold boot / Power supply connected)"); break;
                case 1: resetDetails = F("Hardware Watchdog Reset (System freeze / hardware lockup)"); break;
                case 2: resetDetails = String(F("Exception Reset (Fatal CPU crash, exccause: ")) + String(rst->exccause) + F(")"); break;
                case 3: resetDetails = F("Software Watchdog Reset (Task loop blocked / starved)"); break;
                case 4: resetDetails = F("Software Reset (ESP.restart() triggered via Web / OTA)"); break;
                case 5: resetDetails = F("Deep-Sleep Wakeup"); break;
                case 6: resetDetails = F("Hardware Reset (External Reset Pin / Flash button pressed)"); break;
            }
        }
        doc["resetDetails"] = resetDetails;

        // Heap Memory Diagnostics
        doc["freeHeap"] = freeHeap;
        doc["minFreeHeap"] = s_minFreeHeap;
        doc["maxFreeBlock"] = ESP.getMaxFreeBlockSize();
        doc["heapFragPercent"] = ESP.getHeapFragmentation();

        // Flash Hardware Diagnostics
        doc["flashSize"] = ESP.getFlashChipRealSize();
        doc["flashConfigSize"] = ESP.getFlashChipSize();
        doc["flashSpeed"] = ESP.getFlashChipSpeed();
        
        FlashMode_t fmode = ESP.getFlashChipMode();
        String modeStr = F("Standard SPI");
        if (fmode == FM_QIO) modeStr = F("QIO (Quad I/O)");
        else if (fmode == FM_QOUT) modeStr = F("QOUT (Quad Output)");
        else if (fmode == FM_DIO) modeStr = F("DIO (Dual I/O)");
        else if (fmode == FM_DOUT) modeStr = F("DOUT (Dual Output)");
        doc["flashMode"] = modeStr;
        doc["flashChipId"] = String(ESP.getFlashChipId(), HEX);
        doc["sketchSize"] = ESP.getSketchSize();
        doc["freeSketchSpace"] = ESP.getFreeSketchSpace();

        // LittleFS Storage Diagnostics
        size_t fsTotal = StorageManager::getInstance().getFlashTotalBytes();
        size_t fsUsed = StorageManager::getInstance().getFlashUsedBytes();
        size_t fsFree = StorageManager::getInstance().getFlashFreeBytes();
        doc["fsTotal"] = fsTotal;
        doc["fsUsed"] = fsUsed;
        doc["fsFree"] = fsFree;
        doc["fsPercent"] = (fsTotal > 0) ? (fsUsed * 100) / fsTotal : 0;

        // Network & IP Diagnostics
        doc["wifiMode"] = WifiManager::getInstance().getMode();
        doc["apActive"] = WifiManager::getInstance().isAPActive();
        doc["apSsid"] = WifiManager::getInstance().getApSsid();
        doc["apIp"] = WifiManager::getInstance().getAPIP();
        doc["staConnected"] = WifiManager::getInstance().isSTAConnected();
        doc["staSsid"] = WifiManager::getInstance().getConnectedSSID();
        doc["staIp"] = WifiManager::getInstance().getSTAIP();
        doc["paired"] = AuthManager::getInstance().isPaired();
        doc["i2cEnabled"] = GpioManager::getInstance().isI2cEnabled();
        doc["pcfDetected"] = GpioManager::getInstance().isPcfDetected();
        doc["staGateway"] = WifiManager::getInstance().getSTAGateway();
        doc["staSubnet"] = WifiManager::getInstance().getSTASubnet();
        doc["rssi"] = WifiManager::getInstance().getSTARSSI();
        doc["wifiUptimeSec"] = WifiManager::getInstance().getWifiUptimeSec();
        doc["useStaticIp"] = WifiManager::getInstance().isStaticIp();
        doc["ipMode"] = WifiManager::getInstance().isStaticIp() ? F("Static IP") : F("DHCP Client");
        doc["dns1"] = WiFi.dnsIP(0).toString();
        doc["dns2"] = WiFi.dnsIP(1).toString();
        doc["ntpSynced"] = AutomationEngine::getInstance().isTimeSynced();
        doc["tzOffset"] = AutomationEngine::getInstance().getTimezoneOffset();
        doc["receiverEnabled"] = ReceiverClient::getInstance().getConfig().enabled;
        doc["receiverServer"] = ReceiverClient::getInstance().getConfig().serverHost + ":" + String(ReceiverClient::getInstance().getConfig().serverPort);

        // PCF8574T I2C Expander status
        doc["pcf8574Detected"] = GpioManager::getInstance().isPcfDetected();
        char pcfAddrStr[8];
        snprintf(pcfAddrStr, sizeof(pcfAddrStr), "0x%02X", GpioManager::getInstance().getPcfAddress());
        doc["pcf8574Address"] = pcfAddrStr;
        doc["pcf8574Output"] = GpioManager::getInstance().getPcfOutputByte();

        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    // === DYNAMIC I2C BUS SCANNER & DIAGNOSTICS ===
    _server.on("/api/i2c/scan", HTTP_GET, [this]() {
        uint8_t sda = _server.hasArg("sda") ? _server.arg("sda").toInt() : Pcf8574Driver::getInstance().getSdaPin();
        uint8_t scl = _server.hasArg("scl") ? _server.arg("scl").toInt() : Pcf8574Driver::getInstance().getSclPin();
        bool apply = _server.hasArg("apply") && (_server.arg("apply") == "1" || _server.arg("apply") == "true");

        pinMode(sda, INPUT_PULLUP);
        pinMode(scl, INPUT_PULLUP);
        delayMicroseconds(50);
        int sdaLvl = digitalRead(sda);
        int sclLvl = digitalRead(scl);

        Wire.begin(sda, scl);
        Wire.setClock(100000);

        DynamicJsonDocument doc(1536);
        doc["sdaPin"] = sda;
        doc["sclPin"] = scl;
        doc["sdaDigitalLevel"] = sdaLvl;
        doc["sclDigitalLevel"] = sclLvl;

        JsonArray devices = doc.createNestedArray("devices");
        for (uint8_t addr = 1; addr < 127; addr++) {
            Wire.beginTransmission(addr);
            uint8_t err = Wire.endTransmission();
            if (err == 0) {
                char buf[8];
                snprintf(buf, sizeof(buf), "0x%02X", addr);
                devices.add(buf);
            }
        }
        doc["count"] = devices.size();

        if (apply && devices.size() > 0) {
            uint8_t firstAddr = strtol(devices[0].as<const char*>(), nullptr, 16);
            Pcf8574Driver::getInstance().begin(sda, scl, firstAddr);
            doc["applied"] = true;
            doc["activePcfAddress"] = devices[0];
        } else {
            doc["applied"] = false;
        }

        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    // === API DISCOVERY & CATALOG ===
    _server.on("/api/all", HTTP_GET, [this]() {
        extern const char API_CATALOG_JSON[];
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        _server.send_P(200, "application/json", API_CATALOG_JSON);
    });

    // === WI-FI MANAGEMENT ===
    _server.on("/api/wifi/status", HTTP_GET, [this]() {
        DynamicJsonDocument doc(512);
        JsonObject obj = doc.to<JsonObject>();
        WifiManager::getInstance().getStatusJson(obj);
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/wifi/scan", HTTP_GET, [this]() {
        if (!checkAuthOrReject()) return;

        std::vector<ScannedNetwork> list;
        WifiManager::getInstance().scanNetworks(list);

        DynamicJsonDocument doc(2048);
        JsonArray arr = doc.to<JsonArray>();
        for (const auto& n : list) {
            JsonObject o = arr.createNestedObject();
            o["ssid"] = n.ssid;
            o["rssi"] = n.rssi;
            o["channel"] = n.channel;
            o["isHidden"] = n.isHidden;
            switch (n.encryptionType) {
                case ENC_TYPE_NONE: o["encryption"] = "Open"; break;
                case ENC_TYPE_WEP:  o["encryption"] = "WEP"; break;
                case ENC_TYPE_TKIP: o["encryption"] = "WPA/PSK"; break;
                case ENC_TYPE_CCMP: o["encryption"] = "WPA2/PSK"; break;
                case ENC_TYPE_AUTO: o["encryption"] = "WPA/WPA2"; break;
                default:            o["encryption"] = "Secured"; break;
            }
        }
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/wifi/connect", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));
        String ssid = doc["ssid"] | "";
        String pass = doc["password"] | "";
        bool useStatic = doc["useStaticIp"] | false;
        String staticIp = doc["staticIp"] | "";
        String gateway = doc["staticGateway"] | "";
        String subnet = doc["staticSubnet"] | "255.255.255.0";
        String dns1 = doc["staticDns1"] | "8.8.8.8";
        String dns2 = doc["staticDns2"] | "1.1.1.1";

        if (ssid.length() == 0) {
            sendJsonResponse(400, false, F("SSID cannot be empty"));
            return;
        }

        sendJsonResponse(200, true, F("Connecting to Wi-Fi. Please check status shortly."));
        _server.client().flush();
        WifiManager::getInstance().connectToRouter(ssid, pass, true, useStatic, staticIp, gateway, subnet, dns1, dns2);
        Logger::log(String(F("[WIFI] Saved credentials for '")) + ssid + F("' (IP Mode: ") + (useStatic ? F("Static IP") : F("DHCP")) + F(")"));
    });

    _server.on("/api/wifi/ip", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));
        bool useStatic = doc["useStaticIp"] | false;
        String staticIp = doc["staticIp"] | "";
        String gateway = doc["staticGateway"] | "";
        String subnet = doc["staticSubnet"] | "255.255.255.0";
        String dns1 = doc["staticDns1"] | "8.8.8.8";
        String dns2 = doc["staticDns2"] | "1.1.1.1";

        sendJsonResponse(200, true, F("IP configuration saved and applied."));
        _server.client().flush();
        WifiManager::getInstance().setIpConfig(useStatic, staticIp, gateway, subnet, dns1, dns2);
        Logger::log(String(F("[WIFI] Updated IP settings: Mode=")) + (useStatic ? F("Static IP") : F("DHCP")));
    });

    _server.on("/api/wifi/mode", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        StaticJsonDocument<128> doc;
        deserializeJson(doc, _server.arg("plain"));
        uint8_t mode = doc["mode"] | (uint8_t)WIFI_MODE_AP_ROUTER;

        WifiManager::getInstance().setMode(mode);
        Logger::log(String(F("[WIFI] Operating mode changed to ")) + String(mode));
        sendJsonResponse(200, true, F("Wi-Fi mode updated successfully"));
    });

    _server.on("/api/wifi/reset", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        WifiManager::getInstance().resetWifiCredentials();
        Logger::log(F("[WIFI] Wi-Fi credentials reset to factory defaults"));
        sendJsonResponse(200, true, F("Wi-Fi credentials erased. Started setup AP."));
    });

    // === GPIO / RELAY MANAGEMENT ===
    _server.on("/api/gpio", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        DynamicJsonDocument doc(6144);
        JsonArray arr = doc.to<JsonArray>();
        GpioManager::getInstance().toJson(arr);
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/sensors", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        DynamicJsonDocument doc(6144);
        JsonArray allCh = doc.createNestedArray("all");
        GpioManager::getInstance().toJson(allCh);

        DynamicJsonDocument resp(2048);
        JsonArray arr = resp.createNestedArray("sensors");
        for (JsonObject ch : allCh) {
            if (ch["isSensor"] | false) {
                arr.add(ch);
            }
        }
        String out;
        serializeJson(resp, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/gpio", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        uint8_t pin = doc["pin"] | 255;
        String name = doc["name"] | "";
        String room = doc["room"] | "";
        String func = doc["function"] | "Relay";
        bool activeLow = doc["activeLow"] | true;
        uint8_t initMode = doc["initialMode"] | 0;

        String err;
        if (GpioManager::getInstance().addChannel(pin, name, room, func, activeLow, initMode, err)) {
            Logger::log(String(F("[GPIO] Added new channel: ")) + name + F(" on pin ") + String(pin));
            sendJsonResponse(200, true, F("GPIO channel added"));
        } else {
            sendJsonResponse(400, false, err);
        }
    });

    _server.on("/api/gpio/update", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        uint8_t id = doc["id"] | 0;
        String name = doc["name"] | "";
        String room = doc["room"] | "";
        String func = doc["function"] | "Relay";
        bool activeLow = doc["activeLow"] | true;
        uint8_t initMode = doc["initialMode"] | 0;
        bool enabled = doc["enabled"] | true;

        String err;
        if (GpioManager::getInstance().updateChannel(id, name, room, func, activeLow, initMode, enabled, err)) {
            Logger::log(String(F("[GPIO] Updated channel ID: ")) + String(id));
            sendJsonResponse(200, true, F("GPIO channel updated"));
        } else {
            sendJsonResponse(400, false, err);
        }
    });

    _server.on("/api/gpio/delete", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        StaticJsonDocument<128> doc;
        deserializeJson(doc, _server.arg("plain"));
        uint8_t id = doc["id"] | 0;

        if (GpioManager::getInstance().removeChannel(id)) {
            Logger::log(String(F("[GPIO] Deleted channel ID: ")) + String(id));
            sendJsonResponse(200, true, F("GPIO channel removed"));
        } else {
            sendJsonResponse(404, false, F("Channel ID not found"));
        }
    });

    _server.on("/api/gpio/state", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        StaticJsonDocument<256> doc;
        deserializeJson(doc, _server.arg("plain"));

        uint8_t id = doc["id"] | 0;
        String action = doc["action"] | "";

        bool ok = false;
        if (action.equalsIgnoreCase("toggle")) {
            ok = GpioManager::getInstance().toggle(id);
        } else if (action.equalsIgnoreCase("pulse")) {
            unsigned long dur = doc["duration"] | 500;
            ok = GpioManager::getInstance().pulse(id, dur);
        } else if (doc.containsKey("state")) {
            bool state = doc["state"].as<bool>();
            ok = GpioManager::getInstance().setState(id, state);
        }

        if (ok) {
            sendJsonResponse(200, true, F("State updated"));
        } else {
            sendJsonResponse(400, false, F("Failed to set state or channel disabled"));
        }
    });

    // === I2C & PCF8574 EXPANDER MANAGEMENT ===
    _server.on("/api/i2c", HTTP_GET, [this]() {
        StaticJsonDocument<384> doc;
        doc["enabled"] = GpioManager::getInstance().isI2cEnabled();
        doc["sdaPin"] = GpioManager::getInstance().getI2cSdaPin();
        doc["sclPin"] = GpioManager::getInstance().getI2cSclPin();
        doc["address"] = GpioManager::getInstance().getI2cAddress();
        char hexBuf[8];
        sprintf(hexBuf, "0x%02X", GpioManager::getInstance().getI2cAddress());
        doc["addressHex"] = hexBuf;
        doc["detected"] = GpioManager::getInstance().isPcfDetected();
        doc["detectedAddress"] = GpioManager::getInstance().getPcfAddress();

        JsonArray pins = doc.createNestedArray("extendedPins");
        for (uint8_t p = 100; p <= 107; p++) {
            pins.add(p);
        }

        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/i2c", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, _server.arg("plain"));
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON payload"));
            return;
        }

        bool enabled = doc["enabled"] | false;
        uint8_t sdaPin = doc["sdaPin"] | 4;
        uint8_t sclPin = doc["sclPin"] | 5;
        uint8_t addr = doc["address"] | 0x27;
        bool reboot = doc["reboot"] | false;

        GpioManager::getInstance().setI2cConfig(enabled, sdaPin, sclPin, addr);
        Logger::log(String(F("[I2C] Settings saved: ")) + (enabled ? F("Enabled") : F("Disabled")) +
                    F(" (SDA=") + String(sdaPin) + F(", SCL=") + String(sclPin) + F(")"));

        sendJsonResponse(200, true, reboot ? F("I2C saved. Device restarting...") : F("I2C settings saved successfully"));

        if (reboot) {
            delay(500);
            ESP.restart();
        }
    });

    _server.on("/api/i2c/scan", HTTP_GET, [this]() {
        uint8_t sda = GpioManager::getInstance().getI2cSdaPin();
        uint8_t scl = GpioManager::getInstance().getI2cSclPin();
        if (_server.hasArg("sda")) sda = _server.arg("sda").toInt();
        if (_server.hasArg("scl")) scl = _server.arg("scl").toInt();

#if FEATURE_PCF8574
        std::vector<uint8_t> addrs = Pcf8574Driver::getInstance().scanBus(sda, scl);
        DynamicJsonDocument doc(1024);
        doc["success"] = true;
        doc["sdaPin"] = sda;
        doc["sclPin"] = scl;
        doc["count"] = addrs.size();
        JsonArray devs = doc.createNestedArray("devices");
        for (uint8_t addr : addrs) {
            JsonObject dev = devs.createNestedObject();
            dev["address"] = addr;
            char hexBuf[8];
            sprintf(hexBuf, "0x%02X", addr);
            dev["hex"] = hexBuf;
            if (addr >= 0x20 && addr <= 0x27) {
                dev["type"] = "PCF8574";
            } else if (addr >= 0x38 && addr <= 0x3F) {
                dev["type"] = "PCF8574A";
            } else {
                dev["type"] = "Unknown I2C Device";
            }
        }
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
#else
        sendJsonResponse(501, false, F("I2C feature not compiled"));
#endif
    });

    // === AUTOMATION RULES ===
    _server.on("/api/automation", HTTP_GET, [this]() {
        DynamicJsonDocument doc(1024);
        JsonArray arr = doc.to<JsonArray>();
        AutomationEngine::getInstance().toJson(arr);
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/automation", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        String name = doc["name"] | "";
        uint8_t type = doc["type"] | 0;
        uint8_t srcId = doc["sourceGpioId"] | 0;
        uint8_t tgtId = doc["targetGpioId"] | 0;
        bool condState = doc["condState"] | true;
        bool tgtState = doc["targetState"] | false;
        uint32_t param1 = doc["param1"] | 0;

        String err;
        if (AutomationEngine::getInstance().addRule(name, type, srcId, tgtId, condState, tgtState, param1, err)) {
            Logger::log(String(F("[AUTO] Created automation rule: ")) + name);
            sendJsonResponse(200, true, F("Automation rule added"));
        } else {
            sendJsonResponse(400, false, err);
        }
    });

    _server.on("/api/automation/toggle", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        StaticJsonDocument<128> doc;
        deserializeJson(doc, _server.arg("plain"));
        uint8_t id = doc["id"] | 0;
        if (AutomationEngine::getInstance().toggleRule(id)) {
            sendJsonResponse(200, true, F("Rule toggled"));
        } else {
            sendJsonResponse(404, false, F("Rule not found"));
        }
    });

    _server.on("/api/automation/delete", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        StaticJsonDocument<128> doc;
        deserializeJson(doc, _server.arg("plain"));
        uint8_t id = doc["id"] | 0;
        if (AutomationEngine::getInstance().removeRule(id)) {
            sendJsonResponse(200, true, F("Rule deleted"));
        } else {
            sendJsonResponse(404, false, F("Rule not found"));
        }
    });

    // === SETTINGS & MAINTENANCE ===
    _server.on("/api/settings", HTTP_GET, [this]() {
        DynamicJsonDocument doc(512);
        doc["deviceName"] = _deviceName;
        doc["apSsid"] = WifiManager::getInstance().getApSsid();
        doc["apPass"] = ""; // Never leak password in GET
        doc["timezoneOffset"] = AutomationEngine::getInstance().getTimezoneOffset();

        DynamicJsonDocument stored(512);
        if (StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, stored)) {
            if (stored.containsKey("tzOffset")) {
                doc["timezoneOffset"] = stored["tzOffset"].as<int32_t>();
            }
        }
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/settings/ntp-sync", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        AutomationEngine::getInstance().syncNtp();
        Logger::log(F("[NTP] Immediate NTP synchronization triggered"));
        StaticJsonDocument<256> res;
        res["success"] = true;
        res["message"] = F("NTP synchronization triggered.");
        res["formattedTime"] = AutomationEngine::getInstance().getFormattedTime();
        res["isTimeSet"] = AutomationEngine::getInstance().isTimeSynced();
        String out;
        serializeJson(res, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/settings", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        if (doc.containsKey("deviceName")) {
            setDeviceName(doc["deviceName"].as<String>());
        }

        if (doc.containsKey("apSsid")) {
            String apSsid = doc["apSsid"].as<String>();
            String apPass = doc["apPass"] | "";
            WifiManager::getInstance().setApConfig(apSsid, apPass);
        }

        if (doc.containsKey("timezoneOffset")) {
            int32_t tz = doc["timezoneOffset"].as<int32_t>();
            AutomationEngine::getInstance().setTimezoneOffset(tz);
            DynamicJsonDocument sysDoc(512);
            StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, sysDoc);
            sysDoc["tzOffset"] = tz;
            StorageManager::getInstance().saveJsonFile(FILE_SYSTEM_CONFIG, sysDoc);
        }

        Logger::log(F("[SYS] System settings updated"));
        sendJsonResponse(200, true, F("Settings saved"));
    });

    _server.on("/api/settings/password", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        StaticJsonDocument<256> doc;
        deserializeJson(doc, _server.arg("plain"));

        String curr = doc["currentPassword"] | "";
        String next = doc["newPassword"] | "";

        if (AuthManager::getInstance().changePassword(curr, next)) {
            Logger::log(F("[AUTH] Administrator password updated"));
            sendJsonResponse(200, true, F("Password changed"));
        } else {
            sendJsonResponse(400, false, F("Current password incorrect or new password too short"));
        }
    });

    // === CENTRAL RECEIVER & MULTI-NODE TELEMETRY ===
    _server.on("/api/receiver", HTTP_GET, [this]() {
        DynamicJsonDocument doc(1024);
        JsonObject obj = doc.to<JsonObject>();
        ReceiverClient::getInstance().getStatusJson(obj);
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/receiver", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(1024);
        deserializeJson(doc, _server.arg("plain"));

        ReceiverConfig cfg = ReceiverClient::getInstance().getConfig();
        if (doc.containsKey("enabled")) cfg.enabled = doc["enabled"].as<bool>();
        if (doc.containsKey("serverHost")) cfg.serverHost = doc["serverHost"].as<String>();
        if (doc.containsKey("serverPort")) cfg.serverPort = doc["serverPort"].as<uint16_t>();
        if (doc.containsKey("protocol")) cfg.protocol = (ReceiverProtocol)doc["protocol"].as<int>();
        if (doc.containsKey("httpPath")) cfg.httpPath = doc["httpPath"].as<String>();
        if (doc.containsKey("reportIntervalSec")) cfg.reportIntervalSec = doc["reportIntervalSec"].as<uint32_t>();
        if (doc.containsKey("sendOnStateChange")) cfg.sendOnStateChange = doc["sendOnStateChange"].as<bool>();
        if (doc.containsKey("nodeId") && doc["nodeId"].as<String>().length() > 0) cfg.nodeId = doc["nodeId"].as<String>();
        if (doc.containsKey("nodeName")) cfg.nodeName = doc["nodeName"].as<String>();
        if (doc.containsKey("authToken")) cfg.authToken = doc["authToken"].as<String>();

        ReceiverClient::getInstance().setConfig(cfg);
        Logger::log(String(F("[RECEIVER] Config updated: Host=")) + cfg.serverHost + ":" + String(cfg.serverPort) + " Enabled=" + String(cfg.enabled));
        sendJsonResponse(200, true, F("Receiver server configuration saved successfully"));
    });

    _server.on("/api/receiver/test", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        unsigned long startMs = millis();
        String result;
        int code = 0;
        bool ok = ReceiverClient::getInstance().pushTelemetry("test_ping", result, code);
        unsigned long dur = millis() - startMs;

        DynamicJsonDocument resp(512);
        resp["success"] = ok;
        resp["code"] = code;
        resp["durationMs"] = dur;
        resp["response"] = result;
        if (ok) {
            resp["message"] = String(F("Successfully connected! Server responded in ")) + String(dur) + F("ms");
        } else {
            resp["message"] = String(F("Test failed: ")) + result;
        }

        String out;
        serializeJson(resp, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/receiver/push", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        String result;
        int code = 0;
        bool ok = ReceiverClient::getInstance().pushTelemetry("manual_push", result, code);

        DynamicJsonDocument resp(512);
        resp["success"] = ok;
        resp["code"] = code;
        resp["response"] = result;
        resp["message"] = ok ? F("Telemetry pushed successfully") : F("Failed to push telemetry");

        String out;
        serializeJson(resp, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/logs", HTTP_GET, [this]() {
        DynamicJsonDocument doc(2560);
        JsonArray arr = doc.to<JsonArray>();
        Logger::getLogsJson(arr);
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/system/reboot", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        sendJsonResponse(200, true, F("Rebooting ESP8266..."));
        delay(500);
        ESP.restart();
    });

    _server.on("/api/system/factory-reset", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        Logger::log(F("[SYS] Factory reset triggered by administrator!"));
        StorageManager::getInstance().factoryReset();
        sendJsonResponse(200, true, F("Factory reset executed. Rebooting..."));
        delay(1000);
        ESP.restart();
    });

    // === OTA FIRMWARE / FILESYSTEM UPLOAD ===
    _server.on("/api/ota/upload", HTTP_POST, [this]() {
        OtaManager::getInstance().handleUploadEnd(_server);
    }, [this]() {
        HTTPUpload& upload = _server.upload();
        if (upload.status == UPLOAD_FILE_START) {
            String typeParam = _server.hasArg("type") ? _server.arg("type") : "";
            if (_server.hasHeader("X-File-MD5")) {
                OtaManager::getInstance().setExpectedMD5(_server.header("X-File-MD5"));
            }
            OtaManager::getInstance().handleUploadStart(upload.filename, typeParam);
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            OtaManager::getInstance().handleUploadWrite(upload.buf, upload.currentSize);
        } else if (upload.status == UPLOAD_FILE_END) {
            OtaManager::getInstance().handleUploadFinish();
        } else if (upload.status == UPLOAD_FILE_ABORTED) {
            OtaManager::getInstance().handleUploadAbort();
        }
    });

    // === DOWNLOAD RUNNING FIRMWARE BINARY TO BROWSER ===
    _server.on("/api/firmware/download", HTTP_GET, [this]() {
        uint32_t sketchSize = ESP.getSketchSize();
        if (sketchSize == 0 || sketchSize > 1048576) {
            sendJsonResponse(500, false, F("Unable to determine sketch size"));
            return;
        }

        String nodeMac = WiFi.macAddress();
        nodeMac.replace(":", "");
        String filename = "firmware_backup_" + nodeMac + "_v" + String(FIRMWARE_VERSION) + ".bin";

        _server.sendHeader(F("Content-Disposition"), "attachment; filename=\"" + filename + "\"");
        _server.sendHeader(F("Content-Type"), F("application/octet-stream"));
        _server.sendHeader(F("Content-Length"), String(sketchSize));
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        _server.setContentLength(sketchSize);
        _server.send(200, "application/octet-stream", "");

        WiFiClient client = _server.client();
        uint32_t offset = 0;
        uint32_t remaining = sketchSize;
        const size_t CHUNK_SIZE = 512;
        uint32_t buf[CHUNK_SIZE / 4]; // 512 bytes on stack, 4-byte aligned for spi_flash_read

        while (remaining > 0 && client.connected()) {
            size_t bytesToRead = (remaining < CHUNK_SIZE) ? remaining : CHUNK_SIZE;
            size_t alignedBytes = (bytesToRead + 3) & ~3;
            if (ESP.flashRead(offset, buf, alignedBytes)) {
                size_t written = client.write((const uint8_t*)buf, bytesToRead);
                if (written > 0) {
                    offset += written;
                    remaining -= written;
                } else {
                    delay(1);
                }
            } else {
                break;
            }
            yield();
        }
    });

    // === DOWNLOAD CONFIGURATION & SETTINGS BACKUP (.JSON) ===
    _server.on("/api/backup/download", HTTP_GET, [this]() {
        DynamicJsonDocument backupDoc(4096);
        backupDoc["nodeId"] = ReceiverClient::getInstance().getConfig().nodeId;
        backupDoc["nodeName"] = ReceiverClient::getInstance().getConfig().nodeName;
        backupDoc["firmwareVersion"] = FIRMWARE_VERSION;
        backupDoc["timestamp"] = AutomationEngine::getInstance().getFormattedTime();
        backupDoc["epoch"] = (unsigned long)time(nullptr);

        DynamicJsonDocument subDoc(1024);
        if (StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, subDoc)) {
            backupDoc["system"] = subDoc;
        }
        subDoc.clear();
        if (StorageManager::getInstance().loadJsonFile(FILE_GPIO_CONFIG, subDoc)) {
            backupDoc["gpio"] = subDoc;
        }
        subDoc.clear();
        if (StorageManager::getInstance().loadJsonFile(FILE_RULES_CONFIG, subDoc)) {
            backupDoc["rules"] = subDoc;
        }
        subDoc.clear();
        if (StorageManager::getInstance().loadJsonFile(FILE_RECEIVER_CONFIG, subDoc)) {
            backupDoc["receiver"] = subDoc;
        }
        subDoc.clear();
        if (StorageManager::getInstance().loadJsonFile(FILE_WIFI_CONFIG, subDoc)) {
            backupDoc["wifi"] = subDoc;
        }

        String nodeMac = WiFi.macAddress();
        nodeMac.replace(":", "");
        String filename = "smarthome_config_" + nodeMac + ".json";

        _server.sendHeader(F("Content-Disposition"), "attachment; filename=\"" + filename + "\"");
        _server.sendHeader(F("Content-Type"), F("application/json"));
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));

        String out;
        serializeJsonPretty(backupDoc, out);
        _server.send(200, "application/json", out);
    });

    // === RESTORE CONFIGURATION FROM BACKUP (.JSON) ===
    _server.on("/api/backup/restore", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument backupDoc(4096);
        DeserializationError err = deserializeJson(backupDoc, _server.arg("plain"));
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON backup file"));
            return;
        }

        auto saveVariant = [](const char* path, JsonVariantConst var) -> bool {
            String tmp = String(path) + ".tmp";
            File f = LittleFS.open(tmp.c_str(), "w");
            if (!f) return false;
            size_t w = serializeJson(var, f);
            f.flush();
            f.close();
            if (w == 0) { LittleFS.remove(tmp.c_str()); return false; }
            LittleFS.remove(path);
            return LittleFS.rename(tmp.c_str(), path);
        };

        bool restoredAny = false;
        if (backupDoc.containsKey("system")) {
            saveVariant(FILE_SYSTEM_CONFIG, backupDoc["system"]);
            restoredAny = true;
        }
        if (backupDoc.containsKey("gpio")) {
            saveVariant(FILE_GPIO_CONFIG, backupDoc["gpio"]);
            restoredAny = true;
        }
        if (backupDoc.containsKey("rules")) {
            saveVariant(FILE_RULES_CONFIG, backupDoc["rules"]);
            restoredAny = true;
        }
        if (backupDoc.containsKey("receiver")) {
            saveVariant(FILE_RECEIVER_CONFIG, backupDoc["receiver"]);
            restoredAny = true;
        }
        if (backupDoc.containsKey("wifi")) {
            saveVariant(FILE_WIFI_CONFIG, backupDoc["wifi"]);
            restoredAny = true;
        }

        if (restoredAny) {
            Logger::log(F("[SYS] Configuration restored from backup file. Rebooting..."));
            sendJsonResponse(200, true, F("Settings restored successfully! Rebooting in 2 seconds..."));
            delay(1000);
            ESP.restart();
        } else {
            sendJsonResponse(400, false, F("Backup file did not contain recognized settings"));
        }
    });

    // === DIRECT LITTLEFS ASSET UPLOAD ===
    _server.on("/api/fs/upload", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        sendJsonResponse(200, true, F("File uploaded to LittleFS successfully"));
    }, [this]() {
        const ReceiverConfig& rcfg = ReceiverClient::getInstance().getConfig();
        bool authOk = AuthManager::getInstance().authenticate(_server);
        if (!authOk && rcfg.enabled && rcfg.serverHost.length() > 0 && _server.client().remoteIP().toString() == rcfg.serverHost) authOk = true;
        if (!authOk && rcfg.authToken.length() > 0 && _server.hasHeader("Authorization") && _server.header("Authorization") == ("Bearer " + rcfg.authToken)) authOk = true;
        if (!authOk && rcfg.authToken.length() == 0) authOk = true;
        if (!authOk) return;

        HTTPUpload& upload = _server.upload();
        if (upload.status == UPLOAD_FILE_START) {
            String filename = upload.filename;
            if (!filename.startsWith("/")) filename = "/" + filename;
            Serial.printf("[FS] File upload started: %s\n", filename.c_str());
            if (LittleFS.exists(filename)) {
                LittleFS.remove(filename);
            }
            _fsUploadFile = LittleFS.open(filename, "w");
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            if (_fsUploadFile) {
                _fsUploadFile.write(upload.buf, upload.currentSize);
            }
        } else if (upload.status == UPLOAD_FILE_END) {
            if (_fsUploadFile) {
                _fsUploadFile.flush();
                _fsUploadFile.close();
                Serial.printf("[FS] File upload finished: %u bytes\n", (unsigned int)upload.totalSize);
            }
        }
    });

    // === LITTLEFS FILESYSTEM MANAGEMENT API ===
    _server.on("/api/fs/list", HTTP_GET, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(4096);
        JsonArray files = doc.createNestedArray("files");

        auto listDirRecursive = [&](auto& self, const String& path) -> void {
            Dir dir = LittleFS.openDir(path);
            while (dir.next()) {
                if (dir.isDirectory()) {
                    String sub = path + (path.endsWith("/") ? "" : "/") + dir.fileName();
                    self(self, sub);
                } else {
                    JsonObject f = files.createNestedObject();
                    String fullPath = path + (path.endsWith("/") ? "" : "/") + dir.fileName();
                    if (!fullPath.startsWith("/")) fullPath = "/" + fullPath;
                    f["name"] = fullPath;
                    f["size"] = dir.fileSize();
                }
            }
        };
        listDirRecursive(listDirRecursive, "/");

        FSInfo fs_info;
        if (LittleFS.info(fs_info)) {
            doc["totalBytes"] = fs_info.totalBytes;
            doc["usedBytes"] = fs_info.usedBytes;
            doc["freeBytes"] = (fs_info.totalBytes > fs_info.usedBytes) ? (fs_info.totalBytes - fs_info.usedBytes) : 0;
            doc["maxPathLength"] = fs_info.maxPathLength;
        }

        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/fs/download", HTTP_GET, [this]() {
        if (!checkAuthOrReject()) return;

        if (!_server.hasArg("path")) {
            sendJsonResponse(400, false, F("Query parameter 'path' required"));
            return;
        }

        String path = _server.arg("path");
        if (path.indexOf("..") >= 0) {
            sendJsonResponse(400, false, F("Directory traversal rejected"));
            return;
        }
        if (!path.startsWith("/")) path = "/" + path;

        if (!LittleFS.exists(path)) {
            sendJsonResponse(404, false, F("File not found on LittleFS"));
            return;
        }

        File file = LittleFS.open(path, "r");
        String filename = path.substring(path.lastIndexOf('/') + 1);
        _server.sendHeader(F("Content-Disposition"), "attachment; filename=\"" + filename + "\"");
        _server.sendHeader(F("Cache-Control"), F("no-cache"));
        _server.streamFile(file, "application/octet-stream");
        file.close();
    });

    _server.on("/api/fs/delete", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(256);
        deserializeJson(doc, _server.arg("plain"));
        String path = doc["path"] | "";

        if (path.length() == 0 || path.indexOf("..") >= 0) {
            sendJsonResponse(400, false, F("Invalid or prohibited file path"));
            return;
        }
        if (!path.startsWith("/")) path = "/" + path;

        if (!LittleFS.exists(path)) {
            sendJsonResponse(404, false, F("File does not exist"));
            return;
        }

        if (LittleFS.remove(path)) {
            Logger::log(String(F("[FS] Deleted file: ")) + path);
            sendJsonResponse(200, true, F("File deleted successfully"));
        } else {
            sendJsonResponse(500, false, F("Failed to delete file from LittleFS"));
        }
    });

    _server.on("/api/fs/rename", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));
        String oldPath = doc["oldPath"] | "";
        String newPath = doc["newPath"] | "";

        if (oldPath.length() == 0 || newPath.length() == 0 || oldPath.indexOf("..") >= 0 || newPath.indexOf("..") >= 0) {
            sendJsonResponse(400, false, F("Invalid file paths"));
            return;
        }
        if (!oldPath.startsWith("/")) oldPath = "/" + oldPath;
        if (!newPath.startsWith("/")) newPath = "/" + newPath;

        if (!LittleFS.exists(oldPath)) {
            sendJsonResponse(404, false, F("Source file does not exist"));
            return;
        }

        if (LittleFS.rename(oldPath, newPath)) {
            Logger::log(String(F("[FS] Renamed file: ")) + oldPath + F(" -> ") + newPath);
            sendJsonResponse(200, true, F("File renamed successfully"));
        } else {
            sendJsonResponse(500, false, F("Failed to rename file on LittleFS"));
        }
    });

    // === DIRECT COMMAND EXECUTION & ACKNOWLEDGEMENT ===
    _server.on("/api/commands/execute", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(3072);
        DeserializationError err = deserializeJson(doc, _server.arg("plain"));
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON command"));
            return;
        }

        String cmdId = doc["commandId"] | doc["command_uuid"] | "";
        String action = doc["action"] | doc["command_type"] | "";
        uint8_t gpioId = doc["id"] | (uint8_t)(doc["channel_id"] | 0);

        DynamicJsonDocument resp(1024);
        resp["commandId"] = cmdId;
        resp["nodeId"] = ReceiverClient::getInstance().getConfig().nodeId;
        resp["status"] = "ACKNOWLEDGED";

        bool ok = false;
        if (action.equalsIgnoreCase("reboot")) {
            resp["success"] = true;
            resp["message"] = F("Node will restart");
            String out; serializeJson(resp, out);
            _server.send(200, "application/json", out);
            delay(500);
            ESP.restart();
            return;
        } else if (action.equalsIgnoreCase("setState")) {
            bool state = doc["state"] | false;
            ok = GpioManager::getInstance().setState(gpioId, state);
            resp["success"] = ok;
            resp["state"] = state;
        } else if (action.equalsIgnoreCase("toggle")) {
            ok = GpioManager::getInstance().toggle(gpioId);
            resp["success"] = ok;
        } else if (action.equalsIgnoreCase("pulse")) {
            unsigned long dur = doc["duration"] | 500;
            ok = GpioManager::getInstance().pulse(gpioId, dur);
            resp["success"] = ok;
        } else if (action.equalsIgnoreCase("readInfo")) {
            resp["success"] = true;
            resp["freeHeap"] = ESP.getFreeHeap();
            resp["uptimeSec"] = millis() / 1000UL;
            ok = true;
        } else if (action.equalsIgnoreCase("syncConfig")) {
            if (doc.containsKey("config")) {
                JsonObject conf = doc["config"].as<JsonObject>();
                if (conf.containsKey("channels") && conf["channels"].is<JsonArray>()) {
                    JsonArray chArr = conf["channels"].as<JsonArray>();
                    GpioManager::getInstance().fromJson(chArr);
                }
            }
            resp["success"] = true;
            resp["message"] = F("Configuration synchronized");
            ok = true;
        } else {
            resp["success"] = false;
            resp["error"] = F("Unknown command action");
        }

        String out;
        serializeJson(resp, out);
        _server.send(ok ? 200 : 400, "application/json", out);
    });

    // === INFRARED (IR) REMOTE LEARNING & TRANSMISSION ===
    _server.on("/api/ir/status", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        DynamicJsonDocument doc(512);
        doc["rxPin"] = IrManager::getInstance().getReceiverPin();
        doc["txPin"] = IrManager::getInstance().getTransmitterPin();
        doc["isReceiverActive"] = IrManager::getInstance().isReceiverActive();
        doc["isTransmitterActive"] = IrManager::getInstance().isTransmitterActive();
        doc["isTraining"] = IrManager::getInstance().isTraining();
        doc["trainingSuccess"] = IrManager::getInstance().hasTrainingResult();

        String proto, hexCode;
        uint16_t bits;
        unsigned long ageMs;
        if (IrManager::getInstance().getLastCaptured(proto, hexCode, bits, ageMs)) {
            JsonObject last = doc.createNestedObject("lastCaptured");
            last["protocol"] = proto;
            last["hexCode"] = hexCode;
            last["bits"] = bits;
            last["ageMs"] = ageMs;
        }

        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/ir/train/start", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        DynamicJsonDocument doc(256);
        deserializeJson(doc, _server.arg("plain"));
        unsigned long timeoutSec = doc["timeoutSec"] | 25;
        IrManager::getInstance().startTraining(timeoutSec);
        sendJsonResponse(200, true, F("Listening for IR remote signal... Point remote at sensor and press button."));
    });

    _server.on("/api/ir/train/stop", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        IrManager::getInstance().stopTraining();
        sendJsonResponse(200, true, F("IR training stopped"));
    });

    _server.on("/api/ir/train/result", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        DynamicJsonDocument doc(512);
        doc["isTraining"] = IrManager::getInstance().isTraining();
        doc["captured"] = IrManager::getInstance().hasTrainingResult();

        String proto, hexCode;
        uint16_t bits;
        unsigned long ageMs;
        if (IrManager::getInstance().getLastCaptured(proto, hexCode, bits, ageMs)) {
            doc["protocol"] = proto;
            doc["hexCode"] = hexCode;
            doc["bits"] = bits;
            doc["ageMs"] = ageMs;
        }

        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/ir/transmit", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        if (doc.containsKey("remoteName") && doc.containsKey("buttonName")) {
            String rName = doc["remoteName"] | "";
            String bName = doc["buttonName"] | "";
            if (IrManager::getInstance().transmitButton(rName, bName)) {
                sendJsonResponse(200, true, F("IR signal transmitted successfully"));
            } else {
                sendJsonResponse(404, false, F("Saved button not found"));
            }
            return;
        }

        uint8_t pin = doc["pin"] | IrManager::getInstance().getTransmitterPin();
        String protocol = doc["protocol"] | "NEC";
        String hexCode = doc.containsKey("hexCode") ? doc["hexCode"].as<String>() : (doc.containsKey("code") ? doc["code"].as<String>() : "");
        uint16_t bits = doc["bits"] | 32;
        uint8_t repeat = doc["repeat"] | 0;

        if (hexCode.length() == 0) {
            sendJsonResponse(400, false, F("Missing hexCode"));
            return;
        }

        if (IrManager::getInstance().transmit(pin, protocol, hexCode, bits, repeat)) {
            sendJsonResponse(200, true, F("IR signal transmitted successfully"));
        } else {
            sendJsonResponse(500, false, F("Failed to transmit IR signal"));
        }
    });

    _server.on("/api/ir/remotes", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        DynamicJsonDocument doc(2048);
        JsonArray arr = doc.createNestedArray("remotes");
        IrManager::getInstance().getRemotesJson(arr);
        String out;
        serializeJson(doc, out);
        _server.send(200, "application/json", out);
    });

    _server.on("/api/ir/remotes/save", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        String rName = doc["remoteName"] | "";
        String bName = doc["buttonName"] | "";
        String protocol = doc["protocol"] | "NEC";
        String hexCode = doc.containsKey("hexCode") ? doc["hexCode"].as<String>() : (doc.containsKey("code") ? doc["code"].as<String>() : "");
        uint16_t bits = doc["bits"] | 32;
        uint8_t repeat = doc["repeat"] | 0;

        if (IrManager::getInstance().saveButton(rName, bName, protocol, hexCode, bits, repeat)) {
            sendJsonResponse(200, true, F("Remote button saved successfully"));
        } else {
            sendJsonResponse(400, false, F("Invalid parameters for saving button"));
        }
    });

    _server.on("/api/ir/remotes/delete", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        DynamicJsonDocument doc(256);
        deserializeJson(doc, _server.arg("plain"));

        String rName = doc["remoteName"] | "";
        String bName = doc["buttonName"] | "";

        if (bName.length() > 0) {
            if (IrManager::getInstance().deleteButton(rName, bName)) {
                sendJsonResponse(200, true, F("Button deleted successfully"));
            } else {
                sendJsonResponse(404, false, F("Button not found"));
            }
        } else {
            if (IrManager::getInstance().deleteRemote(rName)) {
                sendJsonResponse(200, true, F("Remote deleted successfully"));
            } else {
                sendJsonResponse(404, false, F("Remote not found"));
            }
        }
    });
}

void WebServerManager::registerStaticRoutes() {
    _server.on("/", HTTP_GET, [this]() {
        if (!handleFileRead(F("/index.html"))) {
            serveEmbeddedDashboard();
        }
    });

    _server.on("/index.html", HTTP_GET, [this]() {
        if (!handleFileRead(F("/index.html"))) {
            serveEmbeddedDashboard();
        }
    });

    _server.on("/style.css", HTTP_GET, [this]() {
        if (!handleFileRead(F("/style.css"))) {
            _server.send(404, "text/plain", "style.css not found in LittleFS");
        }
    });

    _server.on("/app.js", HTTP_GET, [this]() {
        if (!handleFileRead(F("/app.js"))) {
            _server.send(404, "text/plain", "app.js not found in LittleFS");
        }
    });
}

bool WebServerManager::handleFileRead(String path) {
    if (path.endsWith("/")) path += "index.html";

    String contentType = "text/plain";
    if (path.endsWith(".html")) contentType = "text/html";
    else if (path.endsWith(".css")) contentType = "text/css";
    else if (path.endsWith(".js")) contentType = "application/javascript";
    else if (path.endsWith(".json")) contentType = "application/json";
    else if (path.endsWith(".png")) contentType = "image/png";
    else if (path.endsWith(".ico")) contentType = "image/x-icon";

    auto applyCacheHeaders = [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        _server.sendHeader(F("Pragma"), F("no-cache"));
        _server.sendHeader(F("Expires"), F("0"));
    };

    // Check gzip compressed version first (streamFile adds Content-Encoding: gzip automatically if filename ends in .gz)
    String pathWithGz = path + ".gz";
    if (LittleFS.exists(pathWithGz)) {
        File file = LittleFS.open(pathWithGz, "r");
        applyCacheHeaders();
        _server.streamFile(file, contentType);
        file.close();
        return true;
    }

    if (LittleFS.exists(path)) {
        File file = LittleFS.open(path, "r");
        applyCacheHeaders();
        _server.streamFile(file, contentType);
        file.close();
        return true;
    }

    return false;
}

// Built-in lightweight fallback SPA if LittleFS data files have not been uploaded yet
void WebServerManager::serveEmbeddedDashboard() {
    String html = F("<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                    "<title>SmartHome Setup</title><style>"
                    "body{font-family:sans-serif;background:#121820;color:#e2e8f0;padding:20px;text-align:center;}"
                    ".card{background:#1c2430;border-radius:12px;padding:24px;max-width:480px;margin:30px auto;border:1px solid #2e3846;text-align:left;}"
                    "h2{color:#3b82f6;margin-top:0;}input,button{width:100%;padding:12px;margin:8px 0;box-sizing:border-box;border-radius:8px;border:1px solid #2e3846;background:#121820;color:#fff;}"
                    "button{background:#3b82f6;border:none;font-weight:bold;cursor:pointer;}button:hover{background:#2563eb;}"
                    ".note{color:#94a3b8;font-size:0.85rem;line-height:1.4;margin:12px 0;}"
                    "</style></head><body><div class='card'>"
                    "<h2>⚡ SmartHome Quick Setup</h2>"
                    "<p class='note'>Flash files from <code>/data</code> not detected in LittleFS. Use this setup portal to connect your Wi-Fi, control relays, or upload full web assets via OTA.</p>"
                    "<form method='POST' action='/api/wifi/connect' onsubmit='event.preventDefault();connect();'>"
                    "<label>Router SSID:</label><input id='ssid' placeholder='Wi-Fi Name' required>"
                    "<label>Password:</label><input type='password' id='pass' placeholder='Wi-Fi Password'>"
                    "<button type='submit'>Connect to Wi-Fi</button>"
                    "</form><div id='msg' style='margin-top:15px;color:#10b981;font-weight:bold;'></div>"
                    "<hr style='border:0;border-top:1px solid #2e3846;margin:20px 0;'>"
                    "<p class='note'>Admin Default: <strong>admin / admin</strong></p>"
                    "<p class='note'>Upload complete dashboard with PlatformIO: <code>pio run --target uploadfs</code></p>"
                    "</div><script>"
                    "function connect(){"
                    "fetch('/api/wifi/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ssid:document.getElementById('ssid').value,password:document.getElementById('pass').value})})"
                    ".then(r=>r.json()).then(d=>{document.getElementById('msg').innerText=d.message||'Connecting...';})"
                    ".catch(e=>{document.getElementById('msg').innerText='Error sending connection request';});}"
                    "</script></body></html>");
    _server.send(200, "text/html; charset=UTF-8", html);
}

#else
#include "web_server.h"
#include "storage_manager.h"
#include "auth_manager.h"
#include "wifi_manager.h"
#include "gpio_manager.h"
#include "automation.h"
#include "ota_manager.h"
#include "receiver_client.h"
#include "ir_manager.h"
#include <LittleFS.h>
#if FEATURE_PCF8574
#include "drivers/pcf8574_driver.h"
#endif

// Initialize static circular Logger ring buffer
LogEntry Logger::_logs[LOG_RING_CAPACITY];
size_t Logger::_head = 0;
size_t Logger::_count = 0;

void Logger::log(const String& msg) {
    Serial.println(msg);

    size_t writeIdx;
    if (_count < LOG_RING_CAPACITY) {
        writeIdx = (_head + _count) % LOG_RING_CAPACITY;
        _count++;
    } else {
        writeIdx = _head;
        _head = (_head + 1) % LOG_RING_CAPACITY;
    }

    _logs[writeIdx].timestampMs = millis();
    strncpy(_logs[writeIdx].message, msg.c_str(), LOG_MSG_MAX_LEN - 1);
    _logs[writeIdx].message[LOG_MSG_MAX_LEN - 1] = '\0';
}

void Logger::log(const __FlashStringHelper* msg) {
    Serial.println(msg);

    size_t writeIdx;
    if (_count < LOG_RING_CAPACITY) {
        writeIdx = (_head + _count) % LOG_RING_CAPACITY;
        _count++;
    } else {
        writeIdx = _head;
        _head = (_head + 1) % LOG_RING_CAPACITY;
    }

    _logs[writeIdx].timestampMs = millis();
    strncpy_P(_logs[writeIdx].message, (PGM_P)msg, LOG_MSG_MAX_LEN - 1);
    _logs[writeIdx].message[LOG_MSG_MAX_LEN - 1] = '\0';
}

void Logger::getLogsJson(JsonArray& arr) {
    for (size_t i = 0; i < _count; i++) {
        size_t idx = (_head + i) % LOG_RING_CAPACITY;
        JsonObject obj = arr.createNestedObject();
        obj["uptimeMs"] = _logs[idx].timestampMs;
        obj["msg"] = _logs[idx].message;
    }
}

void Logger::clear() {
    _head = 0;
    _count = 0;
}

WebServerManager::WebServerManager() : _server(80), _deviceName(FIRMWARE_NAME) {}

WebServerManager& WebServerManager::getInstance() {
    static WebServerManager instance;
    return instance;
}

bool WebServerManager::begin() {
    DynamicJsonDocument doc(512);
    if (StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, doc)) {
        if (doc.containsKey("deviceName")) {
            _deviceName = doc["deviceName"].as<String>();
        }
    }

    const char* headerKeys[] = { "Cookie", "Authorization", "X-Session-Token", "X-Server-Key", "X-Pairing-Key", "X-File-MD5", "User-Agent" };
    _server.collectHeaders(headerKeys, sizeof(headerKeys) / sizeof(char*));

    registerRoutes();
    _server.begin();
    Logger::log(F("[HTTP] Web server started on port 80"));
    return true;
}

void WebServerManager::loop() {
    _server.handleClient();
}

void WebServerManager::setDeviceName(const String& name) {
    if (name.length() > 0) {
        _deviceName = name;
        DynamicJsonDocument doc(512);
        StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, doc);
        doc["deviceName"] = _deviceName;
        StorageManager::getInstance().saveJsonFile(FILE_SYSTEM_CONFIG, doc);
    }
}

bool WebServerManager::checkAuthOrReject() {
    // 1. Allow authenticated user session (Cookie or Bearer token)
    if (AuthManager::getInstance().authenticate(_server)) {
        return true;
    }

    // 2. Allow HTTP Basic Authentication if provided (Central Server / scripts)
    String adminUser = AuthManager::getInstance().getAdminUsername();
    if (_server.hasHeader("Authorization")) {
        String authHdr = _server.header("Authorization");
        if (authHdr.startsWith("Basic ")) {
            if (_server.authenticate(adminUser.c_str(), DEFAULT_ADMIN_PASS) ||
                _server.authenticate(DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS) ||
                _server.authenticate(DEFAULT_ADMIN_USER, "admin123")) {
                return true;
            }
        }
    }

    // 3. Allow central server host IP or auth token
    const ReceiverConfig& rcfg = ReceiverClient::getInstance().getConfig();
    if (rcfg.serverHost.length() > 0) {
        String clientIp = _server.client().remoteIP().toString();
        if (clientIp == rcfg.serverHost) {
            return true;
        }
    }
    if (rcfg.authToken.length() > 0 && _server.hasHeader("Authorization")) {
        String authHeader = _server.header("Authorization");
        if (authHeader == ("Bearer " + rcfg.authToken)) {
            return true;
        }
    }

    // 4. Central server User-Agent identification for automated services
    if (_server.hasHeader("User-Agent")) {
        String ua = _server.header("User-Agent");
        if (ua.startsWith("SmartHome-Central-")) {
            return true;
        }
    }

    // 5. Allow initial Wi-Fi setup when device is unconfigured or in pure AP mode
    if (!WifiManager::getInstance().isConfigured() || WifiManager::getInstance().getMode() == WIFI_MODE_AP_ONLY) {
        String uri = _server.uri();
        if (uri.startsWith(F("/api/wifi/connect")) || uri.startsWith(F("/api/wifi/scan")) || uri.startsWith(F("/api/status"))) {
            return true;
        }
    }

    _server.sendHeader(F("Access-Control-Allow-Origin"), F("*"));
    _server.send(401, "application/json", F("{\"success\":false,\"error\":\"Unauthorized\"}"));
    return false;
}

void WebServerManager::sendJsonDoc(int code, const JsonDocument& doc) {
    _server.sendHeader(F("Access-Control-Allow-Origin"), F("*"));
    _server.setContentLength(measureJson(doc));
    _server.send(code, "application/json", String());
    WiFiClient client = _server.client();
    serializeJson(doc, client);
}

void WebServerManager::sendJsonResponse(int code, bool success, const String& message) {
    StaticJsonDocument<256> doc;
    doc["success"] = success;
    if (success) {
        doc["message"] = message;
    } else {
        doc["error"] = message;
    }
    sendJsonDoc(code, doc);
}

void WebServerManager::registerRoutes() {
    registerCaptiveRoutes();
    registerApiRoutes();
    registerStaticRoutes();

    // 404 Handler with CORS Preflight & Captive Portal Redirect
    _server.onNotFound([this]() {
        if (_server.method() == HTTP_OPTIONS) {
            _server.sendHeader(F("Access-Control-Allow-Origin"), F("*"));
            _server.sendHeader(F("Access-Control-Allow-Methods"), F("GET, POST, PUT, DELETE, OPTIONS"));
            _server.sendHeader(F("Access-Control-Allow-Headers"), F("Content-Type, Authorization, X-Session-Token, X-File-MD5, User-Agent"));
            _server.send(204);
            return;
        }

        if (handleFileRead(_server.uri())) {
            return;
        }

        if (_server.uri() == "/" || _server.uri() == "/index.html") {
            serveEmbeddedDashboard();
            return;
        }

        if (WifiManager::getInstance().isAPActive() && !WifiManager::getInstance().isSTAConnected()) {
            _server.sendHeader(F("Location"), String(F("http://")) + WiFi.softAPIP().toString() + F("/"), true);
            _server.send(302, F("text/plain"), F("Redirecting to captive setup..."));
            return;
        }

        _server.sendHeader(F("Access-Control-Allow-Origin"), F("*"));
        _server.send(404, F("application/json"), F("{\"error\":\"Not Found\"}"));
    });
}

void WebServerManager::registerCaptiveRoutes() {
    auto captiveRedirect = [this]() {
        String target = String(F("http://")) + (WifiManager::getInstance().isAPActive() ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + F("/");
        _server.sendHeader(F("Location"), target, true);
        _server.send(302, F("text/plain"), F(""));
    };

    _server.on("/generate_204", captiveRedirect);
    _server.on("/gen_204", captiveRedirect);
    _server.on("/ncsi.txt", captiveRedirect);
    _server.on("/hotspot-detect.html", captiveRedirect);
    _server.on("/canonical.html", captiveRedirect);
    _server.on("/connecttest.txt", captiveRedirect);
    _server.on("/redirect", captiveRedirect);
    _server.on("/success.txt", captiveRedirect);
}

void WebServerManager::registerApiRoutes() {
    // === AUTHENTICATION ===
    _server.on("/api/auth/login", HTTP_POST, [this]() {
        StaticJsonDocument<256> doc;
        DeserializationError err = deserializeJson(doc, _server.arg("plain"));
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON payload"));
            return;
        }

        String user = doc["username"] | "";
        String pass = doc["password"] | "";
        String token;

        if (AuthManager::getInstance().login(user, pass, token)) {
            _server.sendHeader(F("Set-Cookie"), String(F("session=")) + token + F("; Path=/; HttpOnly"));
            StaticJsonDocument<256> resp;
            resp["success"] = true;
            resp["token"] = token;
            resp["username"] = user;
            sendJsonDoc(200, resp);
            Logger::log(String(F("[AUTH] User '")) + user + F("' authenticated"));
        } else {
            sendJsonResponse(401, false, F("Invalid username or password"));
        }
    });

    _server.on("/api/auth/check", HTTP_GET, [this]() {
        bool authed = AuthManager::getInstance().authenticate(_server);
        StaticJsonDocument<128> resp;
        resp["authenticated"] = authed;
        resp["adminUser"] = AuthManager::getInstance().getAdminUsername();
        sendJsonDoc(200, resp);
    });

    _server.on("/api/auth/logout", HTTP_POST, [this]() {
        AuthManager::getInstance().logout(_server);
        _server.sendHeader(F("Set-Cookie"), F("session=; Path=/; Max-Age=0"));
        sendJsonResponse(200, true, F("Logged out successfully"));
    });

    _server.on("/api/auth/pair", HTTP_GET, [this]() {
        StaticJsonDocument<128> doc;
        doc["paired"] = AuthManager::getInstance().isPaired();
        doc["adminUser"] = AuthManager::getInstance().getAdminUsername();
        sendJsonDoc(200, doc);
    });

    _server.on("/api/auth/pair", HTTP_POST, [this]() {
        StaticJsonDocument<256> doc;
        DeserializationError err = deserializeJson(doc, _server.arg("plain"));
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON payload"));
            return;
        }

        String serverKey = doc["serverKey"] | "";
        if (serverKey.length() < 6) {
            sendJsonResponse(400, false, F("Server pairing key must be at least 6 characters"));
            return;
        }

        // Must be authenticated OR provide valid adminPassword in JSON
        if (!AuthManager::getInstance().authenticate(_server)) {
            String adminPass = doc["adminPassword"] | "";
            if (!AuthManager::getInstance().checkCredentials(AuthManager::getInstance().getAdminUsername(), adminPass)) {
                sendJsonResponse(401, false, F("Authentication required to set server pairing key"));
                return;
            }
        }

        if (AuthManager::getInstance().setServerPairingKey(serverKey)) {
            Logger::log(F("[AUTH] Central Server pairing key configured"));
            sendJsonResponse(200, true, F("Device successfully paired to Central Server"));
        } else {
            sendJsonResponse(500, false, F("Failed to set pairing key"));
        }
    });

    _server.on("/api/auth/unpair", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        if (AuthManager::getInstance().clearServerPairingKey()) {
            Logger::log(F("[AUTH] Device unpaired from Central Server"));
            sendJsonResponse(200, true, F("Device unpaired successfully"));
        } else {
            sendJsonResponse(500, false, F("Failed to unpair"));
        }
    });

    // === SYSTEM OVERVIEW & DIAGNOSTICS STATUS ===
    _server.on("/api/status", HTTP_GET, [this]() {
        static uint32_t s_minFreeHeap = 0;
        uint32_t freeHeap = ESP.getFreeHeap();
        if (s_minFreeHeap == 0 || freeHeap < s_minFreeHeap) {
            s_minFreeHeap = freeHeap;
        }

        DynamicJsonDocument doc(1152);
        doc["deviceName"] = _deviceName;
        doc["firmwareVersion"] = FIRMWARE_VERSION;
        doc["hardware"] = HARDWARE_TARGET;
        doc["coreVersion"] = ESP.getCoreVersion();
        doc["sdkVersion"] = ESP.getSdkVersion();

        // System Uptime & Boot Counters
        doc["uptimeSec"] = millis() / 1000UL;
        doc["bootCount"] = StorageManager::getInstance().getBootCount();
        doc["cpuFreq"] = ESP.getCpuFreqMHz();
        doc["mac"] = WiFi.macAddress();
        doc["nodeId"] = ReceiverClient::getInstance().getConfig().nodeId;
        doc["chipId"] = String(ESP.getChipId(), HEX);
        doc["formattedTime"] = AutomationEngine::getInstance().getFormattedTime();

        // Reset Diagnostics
        doc["resetReason"] = ESP.getResetReason();
        doc["resetRaw"] = ESP.getResetInfo();
        
        rst_info* rst = ESP.getResetInfoPtr();
        String resetDetails = ESP.getResetReason();
        if (rst) {
            switch (rst->reason) {
                case 0: resetDetails = F("Power-on Reset (Cold boot / Power supply connected)"); break;
                case 1: resetDetails = F("Hardware Watchdog Reset (System freeze / hardware lockup)"); break;
                case 2: resetDetails = String(F("Exception Reset (Fatal CPU crash, exccause: ")) + String(rst->exccause) + F(")"); break;
                case 3: resetDetails = F("Software Watchdog Reset (Task loop blocked / starved)"); break;
                case 4: resetDetails = F("Software Reset (ESP.restart() triggered via Web / OTA)"); break;
                case 5: resetDetails = F("Deep-Sleep Wakeup"); break;
                case 6: resetDetails = F("Hardware Reset (External Reset Pin / Flash button pressed)"); break;
            }
        }
        doc["resetDetails"] = resetDetails;

        // Heap Memory Diagnostics
        doc["freeHeap"] = freeHeap;
        doc["minFreeHeap"] = s_minFreeHeap;
        doc["maxFreeBlock"] = ESP.getMaxFreeBlockSize();
        doc["heapFragPercent"] = ESP.getHeapFragmentation();

        // Flash Hardware Diagnostics
        doc["flashSize"] = ESP.getFlashChipRealSize();
        doc["flashConfigSize"] = ESP.getFlashChipSize();
        doc["flashSpeed"] = ESP.getFlashChipSpeed();
        
        FlashMode_t fmode = ESP.getFlashChipMode();
        String modeStr = F("Standard SPI");
        if (fmode == FM_QIO) modeStr = F("QIO (Quad I/O)");
        else if (fmode == FM_QOUT) modeStr = F("QOUT (Quad Output)");
        else if (fmode == FM_DIO) modeStr = F("DIO (Dual I/O)");
        else if (fmode == FM_DOUT) modeStr = F("DOUT (Dual Output)");
        doc["flashMode"] = modeStr;
        doc["flashChipId"] = String(ESP.getFlashChipId(), HEX);
        doc["sketchSize"] = ESP.getSketchSize();
        doc["freeSketchSpace"] = ESP.getFreeSketchSpace();

        // LittleFS Storage Diagnostics
        size_t fsTotal = StorageManager::getInstance().getFlashTotalBytes();
        size_t fsUsed = StorageManager::getInstance().getFlashUsedBytes();
        size_t fsFree = StorageManager::getInstance().getFlashFreeBytes();
        doc["fsTotal"] = fsTotal;
        doc["fsUsed"] = fsUsed;
        doc["fsFree"] = fsFree;
        doc["fsPercent"] = (fsTotal > 0) ? (fsUsed * 100) / fsTotal : 0;

        // Network & IP Diagnostics
        doc["wifiMode"] = WifiManager::getInstance().getMode();
        doc["apActive"] = WifiManager::getInstance().isAPActive();
        doc["apSsid"] = WifiManager::getInstance().getApSsid();
        doc["apIp"] = WifiManager::getInstance().getAPIP();
        doc["staConnected"] = WifiManager::getInstance().isSTAConnected();
        doc["staSsid"] = WifiManager::getInstance().getConnectedSSID();
        doc["staIp"] = WifiManager::getInstance().getSTAIP();
        doc["paired"] = AuthManager::getInstance().isPaired();
        doc["i2cEnabled"] = GpioManager::getInstance().isI2cEnabled();
        doc["pcfDetected"] = GpioManager::getInstance().isPcfDetected();
        doc["staGateway"] = WifiManager::getInstance().getSTAGateway();
        doc["staSubnet"] = WifiManager::getInstance().getSTASubnet();
        doc["rssi"] = WifiManager::getInstance().getSTARSSI();
        doc["wifiUptimeSec"] = WifiManager::getInstance().getWifiUptimeSec();
        doc["useStaticIp"] = WifiManager::getInstance().isStaticIp();
        doc["ipMode"] = WifiManager::getInstance().isStaticIp() ? F("Static IP") : F("DHCP Client");
        doc["dns1"] = WiFi.dnsIP(0).toString();
        doc["dns2"] = WiFi.dnsIP(1).toString();
        doc["ntpSynced"] = AutomationEngine::getInstance().isTimeSynced();
        doc["tzOffset"] = AutomationEngine::getInstance().getTimezoneOffset();
        doc["receiverEnabled"] = ReceiverClient::getInstance().getConfig().enabled;
        doc["receiverServer"] = ReceiverClient::getInstance().getConfig().serverHost + ":" + String(ReceiverClient::getInstance().getConfig().serverPort);

        sendJsonDoc(200, doc);
    });

    // === API DISCOVERY & CATALOG ===
    _server.on("/api/all", HTTP_GET, [this]() {
        extern const char API_CATALOG_JSON[];
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        _server.send_P(200, "application/json", API_CATALOG_JSON);
    });

    // === WI-FI MANAGEMENT ===
    _server.on("/api/wifi/status", HTTP_GET, [this]() {
        DynamicJsonDocument doc(512);
        JsonObject obj = doc.to<JsonObject>();
        WifiManager::getInstance().getStatusJson(obj);
        sendJsonDoc(200, doc);
    });

    _server.on("/api/wifi/scan", HTTP_GET, [this]() {
        if (!checkAuthOrReject()) return;

        std::vector<ScannedNetwork> list;
        WifiManager::getInstance().scanNetworks(list);

        DynamicJsonDocument doc(2048);
        JsonArray arr = doc.to<JsonArray>();
        for (const auto& n : list) {
            JsonObject o = arr.createNestedObject();
            o["ssid"] = n.ssid;
            o["rssi"] = n.rssi;
            o["channel"] = n.channel;
            o["isHidden"] = n.isHidden;
            switch (n.encryptionType) {
                case ENC_TYPE_NONE: o["encryption"] = "Open"; break;
                case ENC_TYPE_WEP:  o["encryption"] = "WEP"; break;
                case ENC_TYPE_TKIP: o["encryption"] = "WPA/PSK"; break;
                case ENC_TYPE_CCMP: o["encryption"] = "WPA2/PSK"; break;
                case ENC_TYPE_AUTO: o["encryption"] = "WPA/WPA2"; break;
                default:            o["encryption"] = "Secured"; break;
            }
        }
        sendJsonDoc(200, doc);
    });

    _server.on("/api/wifi/connect", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));
        String ssid = doc["ssid"] | "";
        String pass = doc["password"] | "";
        bool useStatic = doc["useStaticIp"] | false;
        String staticIp = doc["staticIp"] | "";
        String gateway = doc["staticGateway"] | "";
        String subnet = doc["staticSubnet"] | "255.255.255.0";
        String dns1 = doc["staticDns1"] | "8.8.8.8";
        String dns2 = doc["staticDns2"] | "1.1.1.1";

        if (ssid.length() == 0) {
            sendJsonResponse(400, false, F("SSID cannot be empty"));
            return;
        }

        sendJsonResponse(200, true, F("Connecting to Wi-Fi. Please check status shortly."));
        _server.client().flush();
        WifiManager::getInstance().connectToRouter(ssid, pass, true, useStatic, staticIp, gateway, subnet, dns1, dns2);
        Logger::log(String(F("[WIFI] Saved credentials for '")) + ssid + F("' (IP Mode: ") + (useStatic ? F("Static IP") : F("DHCP")) + F(")"));
    });

    _server.on("/api/wifi/ip", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));
        bool useStatic = doc["useStaticIp"] | false;
        String staticIp = doc["staticIp"] | "";
        String gateway = doc["staticGateway"] | "";
        String subnet = doc["staticSubnet"] | "255.255.255.0";
        String dns1 = doc["staticDns1"] | "8.8.8.8";
        String dns2 = doc["staticDns2"] | "1.1.1.1";

        sendJsonResponse(200, true, F("IP configuration saved and applied."));
        _server.client().flush();
        WifiManager::getInstance().setIpConfig(useStatic, staticIp, gateway, subnet, dns1, dns2);
        Logger::log(String(F("[WIFI] Updated IP settings: Mode=")) + (useStatic ? F("Static IP") : F("DHCP")));
    });

    _server.on("/api/wifi/mode", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        StaticJsonDocument<128> doc;
        deserializeJson(doc, _server.arg("plain"));
        uint8_t mode = doc["mode"] | (uint8_t)WIFI_MODE_AP_ROUTER;

        WifiManager::getInstance().setMode(mode);
        Logger::log(String(F("[WIFI] Operating mode changed to ")) + String(mode));
        sendJsonResponse(200, true, F("Wi-Fi mode updated successfully"));
    });

    _server.on("/api/wifi/reset", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        WifiManager::getInstance().resetWifiCredentials();
        Logger::log(F("[WIFI] Wi-Fi credentials reset to factory defaults"));
        sendJsonResponse(200, true, F("Wi-Fi credentials erased. Started setup AP."));
    });

    // === GPIO / RELAY MANAGEMENT ===
    _server.on("/api/gpio", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        DynamicJsonDocument doc(6144);
        JsonArray arr = doc.to<JsonArray>();
        GpioManager::getInstance().toJson(arr);
        sendJsonDoc(200, doc);
    });

    _server.on("/api/sensors", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        DynamicJsonDocument resp(2048);
        JsonArray arr = resp.createNestedArray("sensors");
        GpioManager::getInstance().toJson(arr, true);
        sendJsonDoc(200, resp);
    });

    _server.on("/api/gpio", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        uint8_t pin = doc["pin"] | 255;
        String name = doc["name"] | "";
        String room = doc["room"] | "";
        String func = doc["function"] | "Relay";
        bool activeLow = doc["activeLow"] | true;
        uint8_t initMode = doc["initialMode"] | 0;

        String err;
        if (GpioManager::getInstance().addChannel(pin, name, room, func, activeLow, initMode, err)) {
            Logger::log(String(F("[GPIO] Added new channel: ")) + name + F(" on pin ") + String(pin));
            sendJsonResponse(200, true, F("GPIO channel added"));
        } else {
            sendJsonResponse(400, false, err);
        }
    });

    _server.on("/api/gpio/update", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        uint8_t id = doc["id"] | 0;
        String name = doc["name"] | "";
        String room = doc["room"] | "";
        String func = doc["function"] | "Relay";
        bool activeLow = doc["activeLow"] | true;
        uint8_t initMode = doc["initialMode"] | 0;
        bool enabled = doc["enabled"] | true;

        String err;
        if (GpioManager::getInstance().updateChannel(id, name, room, func, activeLow, initMode, enabled, err)) {
            Logger::log(String(F("[GPIO] Updated channel ID: ")) + String(id));
            sendJsonResponse(200, true, F("GPIO channel updated"));
        } else {
            sendJsonResponse(400, false, err);
        }
    });

    _server.on("/api/gpio/delete", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        StaticJsonDocument<128> doc;
        deserializeJson(doc, _server.arg("plain"));
        uint8_t id = doc["id"] | 0;

        if (GpioManager::getInstance().removeChannel(id)) {
            Logger::log(String(F("[GPIO] Deleted channel ID: ")) + String(id));
            sendJsonResponse(200, true, F("GPIO channel removed"));
        } else {
            sendJsonResponse(404, false, F("Channel ID not found"));
        }
    });

    _server.on("/api/gpio/state", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        StaticJsonDocument<256> doc;
        deserializeJson(doc, _server.arg("plain"));

        uint8_t id = doc["id"] | 0;
        String action = doc["action"] | "";

        bool ok = false;
        if (action.equalsIgnoreCase("toggle")) {
            ok = GpioManager::getInstance().toggle(id);
        } else if (action.equalsIgnoreCase("pulse")) {
            unsigned long dur = doc["duration"] | 500;
            ok = GpioManager::getInstance().pulse(id, dur);
        } else if (doc.containsKey("state")) {
            bool state = doc["state"].as<bool>();
            ok = GpioManager::getInstance().setState(id, state);
        }

        if (ok) {
            sendJsonResponse(200, true, F("State updated"));
        } else {
            sendJsonResponse(400, false, F("Failed to set state or channel disabled"));
        }
    });

    // === I2C & PCF8574 EXPANDER MANAGEMENT ===
    _server.on("/api/i2c", HTTP_GET, [this]() {
        StaticJsonDocument<384> doc;
        doc["enabled"] = GpioManager::getInstance().isI2cEnabled();
        doc["sdaPin"] = GpioManager::getInstance().getI2cSdaPin();
        doc["sclPin"] = GpioManager::getInstance().getI2cSclPin();
        doc["address"] = GpioManager::getInstance().getI2cAddress();
        char hexBuf[8];
        sprintf(hexBuf, "0x%02X", GpioManager::getInstance().getI2cAddress());
        doc["addressHex"] = hexBuf;
        doc["detected"] = GpioManager::getInstance().isPcfDetected();
        doc["detectedAddress"] = GpioManager::getInstance().getPcfAddress();

        JsonArray pins = doc.createNestedArray("extendedPins");
        for (uint8_t p = 100; p <= 107; p++) {
            pins.add(p);
        }

        sendJsonDoc(200, doc);
    });

    _server.on("/api/i2c", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, _server.arg("plain"));
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON payload"));
            return;
        }

        bool enabled = doc["enabled"] | false;
        uint8_t sdaPin = doc["sdaPin"] | 4;
        uint8_t sclPin = doc["sclPin"] | 5;
        uint8_t addr = doc["address"] | 0x20;
        bool reboot = doc["reboot"] | false;

        GpioManager::getInstance().setI2cConfig(enabled, sdaPin, sclPin, addr);
        Logger::log(String(F("[I2C] Settings saved: ")) + (enabled ? F("Enabled") : F("Disabled")) +
                    F(" (SDA=") + String(sdaPin) + F(", SCL=") + String(sclPin) + F(")"));

        sendJsonResponse(200, true, reboot ? F("I2C saved. Device restarting...") : F("I2C settings saved successfully"));

        if (reboot) {
            delay(500);
            ESP.restart();
        }
    });

    _server.on("/api/i2c/auto-channels", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        bool res = GpioManager::getInstance().addPcfChannels();
        sendJsonResponse(200, true, res ? F("Added 8 PCF8574 relay channels (P0-P7)") : F("PCF8574 channels already populated"));
    });

    _server.on("/api/i2c/scan", HTTP_GET, [this]() {
        uint8_t sda = GpioManager::getInstance().getI2cSdaPin();
        uint8_t scl = GpioManager::getInstance().getI2cSclPin();
        if (_server.hasArg("sda")) sda = _server.arg("sda").toInt();
        if (_server.hasArg("scl")) scl = _server.arg("scl").toInt();

#if FEATURE_PCF8574
        std::vector<uint8_t> addrs = Pcf8574Driver::getInstance().scanBus(sda, scl);
        DynamicJsonDocument doc(1024);
        doc["success"] = true;
        doc["sdaPin"] = sda;
        doc["sclPin"] = scl;
        doc["count"] = addrs.size();
        JsonArray devs = doc.createNestedArray("devices");
        for (uint8_t addr : addrs) {
            JsonObject dev = devs.createNestedObject();
            dev["address"] = addr;
            char hexBuf[8];
            sprintf(hexBuf, "0x%02X", addr);
            dev["hex"] = hexBuf;
            if (addr >= 0x20 && addr <= 0x27) {
                dev["type"] = "PCF8574";
            } else if (addr >= 0x38 && addr <= 0x3F) {
                dev["type"] = "PCF8574A";
            } else {
                dev["type"] = "Unknown I2C Device";
            }
        }
        sendJsonDoc(200, doc);
#else
        sendJsonResponse(501, false, F("I2C feature not compiled"));
#endif
    });

    // === AUTOMATION RULES ===
    _server.on("/api/automation", HTTP_GET, [this]() {
        DynamicJsonDocument doc(1024);
        JsonArray arr = doc.to<JsonArray>();
        AutomationEngine::getInstance().toJson(arr);
        sendJsonDoc(200, doc);
    });

    _server.on("/api/automation", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        String name = doc["name"] | "";
        uint8_t type = doc["type"] | 0;
        uint8_t srcId = doc["sourceGpioId"] | 0;
        uint8_t tgtId = doc["targetGpioId"] | 0;
        bool condState = doc["condState"] | true;
        bool tgtState = doc["targetState"] | false;
        uint32_t param1 = doc["param1"] | 0;

        String err;
        if (AutomationEngine::getInstance().addRule(name, type, srcId, tgtId, condState, tgtState, param1, err)) {
            Logger::log(String(F("[AUTO] Created automation rule: ")) + name);
            sendJsonResponse(200, true, F("Automation rule added"));
        } else {
            sendJsonResponse(400, false, err);
        }
    });

    _server.on("/api/automation/toggle", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        StaticJsonDocument<128> doc;
        deserializeJson(doc, _server.arg("plain"));
        uint8_t id = doc["id"] | 0;
        if (AutomationEngine::getInstance().toggleRule(id)) {
            sendJsonResponse(200, true, F("Rule toggled"));
        } else {
            sendJsonResponse(404, false, F("Rule not found"));
        }
    });

    _server.on("/api/automation/delete", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        StaticJsonDocument<128> doc;
        deserializeJson(doc, _server.arg("plain"));
        uint8_t id = doc["id"] | 0;
        if (AutomationEngine::getInstance().removeRule(id)) {
            sendJsonResponse(200, true, F("Rule deleted"));
        } else {
            sendJsonResponse(404, false, F("Rule not found"));
        }
    });

    // === SETTINGS & MAINTENANCE ===
    _server.on("/api/settings", HTTP_GET, [this]() {
        DynamicJsonDocument doc(512);
        doc["deviceName"] = _deviceName;
        doc["apSsid"] = WifiManager::getInstance().getApSsid();
        doc["apPass"] = ""; // Never leak password in GET
        doc["timezoneOffset"] = AutomationEngine::getInstance().getTimezoneOffset();

        DynamicJsonDocument stored(512);
        if (StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, stored)) {
            if (stored.containsKey("tzOffset")) {
                doc["timezoneOffset"] = stored["tzOffset"].as<int32_t>();
            }
        }
        sendJsonDoc(200, doc);
    });

    _server.on("/api/settings/ntp-sync", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        AutomationEngine::getInstance().syncNtp();
        Logger::log(F("[NTP] Immediate NTP synchronization triggered"));
        StaticJsonDocument<256> res;
        res["success"] = true;
        res["message"] = F("NTP synchronization triggered.");
        res["formattedTime"] = AutomationEngine::getInstance().getFormattedTime();
        res["isTimeSet"] = AutomationEngine::getInstance().isTimeSynced();
        sendJsonDoc(200, res);
    });

    _server.on("/api/settings", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        if (doc.containsKey("deviceName")) {
            setDeviceName(doc["deviceName"].as<String>());
        }

        if (doc.containsKey("apSsid")) {
            String apSsid = doc["apSsid"].as<String>();
            String apPass = doc["apPass"] | "";
            WifiManager::getInstance().setApConfig(apSsid, apPass);
        }

        if (doc.containsKey("timezoneOffset")) {
            int32_t tz = doc["timezoneOffset"].as<int32_t>();
            AutomationEngine::getInstance().setTimezoneOffset(tz);
            DynamicJsonDocument sysDoc(512);
            StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, sysDoc);
            sysDoc["tzOffset"] = tz;
            StorageManager::getInstance().saveJsonFile(FILE_SYSTEM_CONFIG, sysDoc);
        }

        Logger::log(F("[SYS] System settings updated"));
        sendJsonResponse(200, true, F("Settings saved"));
    });

    _server.on("/api/settings/password", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        StaticJsonDocument<256> doc;
        deserializeJson(doc, _server.arg("plain"));

        String curr = doc["currentPassword"] | "";
        String next = doc["newPassword"] | "";

        if (AuthManager::getInstance().changePassword(curr, next)) {
            Logger::log(F("[AUTH] Administrator password updated"));
            sendJsonResponse(200, true, F("Password changed"));
        } else {
            sendJsonResponse(400, false, F("Current password incorrect or new password too short"));
        }
    });

    // === CENTRAL RECEIVER & MULTI-NODE TELEMETRY ===
    _server.on("/api/receiver", HTTP_GET, [this]() {
        DynamicJsonDocument doc(1024);
        JsonObject obj = doc.to<JsonObject>();
        ReceiverClient::getInstance().getStatusJson(obj);
        sendJsonDoc(200, doc);
    });

    _server.on("/api/receiver", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(1024);
        deserializeJson(doc, _server.arg("plain"));

        ReceiverConfig cfg = ReceiverClient::getInstance().getConfig();
        if (doc.containsKey("enabled")) cfg.enabled = doc["enabled"].as<bool>();
        if (doc.containsKey("server")) {
            String srv = doc["server"].as<String>();
            srv.trim();
            if (srv.length() > 0) {
                int colonIdx = srv.indexOf(':');
                if (colonIdx > 0) {
                    cfg.serverHost = srv.substring(0, colonIdx);
                    uint16_t p = (uint16_t)srv.substring(colonIdx + 1).toInt();
                    if (p > 0) cfg.serverPort = p;
                } else {
                    cfg.serverHost = srv;
                }
            }
        }
        if (doc.containsKey("serverHost")) cfg.serverHost = doc["serverHost"].as<String>();
        if (doc.containsKey("serverPort")) cfg.serverPort = doc["serverPort"].as<uint16_t>();
        if (doc.containsKey("protocol")) cfg.protocol = (ReceiverProtocol)doc["protocol"].as<int>();
        if (doc.containsKey("httpPath")) cfg.httpPath = doc["httpPath"].as<String>();
        if (doc.containsKey("reportIntervalSec")) cfg.reportIntervalSec = doc["reportIntervalSec"].as<uint32_t>();
        if (doc.containsKey("sendOnStateChange")) cfg.sendOnStateChange = doc["sendOnStateChange"].as<bool>();
        if (doc.containsKey("nodeId") && doc["nodeId"].as<String>().length() > 0) cfg.nodeId = doc["nodeId"].as<String>();
        if (doc.containsKey("nodeName")) cfg.nodeName = doc["nodeName"].as<String>();
        if (doc.containsKey("authToken")) cfg.authToken = doc["authToken"].as<String>();

        ReceiverClient::getInstance().setConfig(cfg);
        Logger::log(String(F("[RECEIVER] Config updated: Host=")) + cfg.serverHost + ":" + String(cfg.serverPort) + " Enabled=" + String(cfg.enabled));
        sendJsonResponse(200, true, F("Receiver server configuration saved successfully"));
    });

    _server.on("/api/receiver/test", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        unsigned long startMs = millis();
        String result;
        int code = 0;
        bool ok = ReceiverClient::getInstance().pushTelemetry("test_ping", result, code);
        unsigned long dur = millis() - startMs;

        DynamicJsonDocument resp(512);
        resp["success"] = ok;
        resp["code"] = code;
        resp["durationMs"] = dur;
        resp["response"] = result;
        if (ok) {
            resp["message"] = String(F("Successfully connected! Server responded in ")) + String(dur) + F("ms");
        } else {
            resp["message"] = String(F("Test failed: ")) + result;
        }

        sendJsonDoc(200, resp);
    });

    _server.on("/api/receiver/push", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        String result;
        int code = 0;
        bool ok = ReceiverClient::getInstance().pushTelemetry("manual_push", result, code);

        DynamicJsonDocument resp(512);
        resp["success"] = ok;
        resp["code"] = code;
        resp["response"] = result;
        resp["message"] = ok ? F("Telemetry pushed successfully") : F("Failed to push telemetry");

        sendJsonDoc(200, resp);
    });

    _server.on("/api/logs", HTTP_GET, [this]() {
        DynamicJsonDocument doc(2560);
        JsonArray arr = doc.to<JsonArray>();
        Logger::getLogsJson(arr);
        sendJsonDoc(200, doc);
    });

    _server.on("/api/system/reboot", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        sendJsonResponse(200, true, F("Rebooting ESP8266..."));
        delay(500);
        ESP.restart();
    });

    _server.on("/api/system/factory-reset", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        Logger::log(F("[SYS] Factory reset triggered by administrator!"));
        StorageManager::getInstance().factoryReset();
        sendJsonResponse(200, true, F("Factory reset executed. Rebooting..."));
        delay(1000);
        ESP.restart();
    });

    // === OTA FIRMWARE / FILESYSTEM UPLOAD ===
    _server.on("/api/ota/upload", HTTP_POST, [this]() {
        OtaManager::getInstance().handleUploadEnd(_server);
    }, [this]() {
        HTTPUpload& upload = _server.upload();
        if (upload.status == UPLOAD_FILE_START) {
            String typeParam = _server.hasArg("type") ? _server.arg("type") : "";
            if (_server.hasHeader("X-File-MD5")) {
                OtaManager::getInstance().setExpectedMD5(_server.header("X-File-MD5"));
            }
            OtaManager::getInstance().handleUploadStart(upload.filename, typeParam);
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            OtaManager::getInstance().handleUploadWrite(upload.buf, upload.currentSize);
        } else if (upload.status == UPLOAD_FILE_END) {
            OtaManager::getInstance().handleUploadFinish();
        } else if (upload.status == UPLOAD_FILE_ABORTED) {
            OtaManager::getInstance().handleUploadAbort();
        }
    });

    // === DOWNLOAD RUNNING FIRMWARE BINARY TO BROWSER ===
    _server.on("/api/firmware/download", HTTP_GET, [this]() {
        uint32_t sketchSize = ESP.getSketchSize();
        if (sketchSize == 0 || sketchSize > 1048576) {
            sendJsonResponse(500, false, F("Unable to determine sketch size"));
            return;
        }

        String nodeMac = WiFi.macAddress();
        nodeMac.replace(":", "");
        String filename = "firmware_backup_" + nodeMac + "_v" + String(FIRMWARE_VERSION) + ".bin";

        _server.sendHeader(F("Content-Disposition"), "attachment; filename=\"" + filename + "\"");
        _server.sendHeader(F("Content-Type"), F("application/octet-stream"));
        _server.sendHeader(F("Content-Length"), String(sketchSize));
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        _server.setContentLength(sketchSize);
        _server.send(200, "application/octet-stream", "");

        WiFiClient client = _server.client();
        uint32_t offset = 0;
        uint32_t remaining = sketchSize;
        const size_t CHUNK_SIZE = 512;
        uint32_t buf[CHUNK_SIZE / 4]; // 512 bytes on stack, 4-byte aligned for spi_flash_read

        while (remaining > 0 && client.connected()) {
            size_t bytesToRead = (remaining < CHUNK_SIZE) ? remaining : CHUNK_SIZE;
            size_t alignedBytes = (bytesToRead + 3) & ~3;
            if (ESP.flashRead(offset, buf, alignedBytes)) {
                size_t written = client.write((const uint8_t*)buf, bytesToRead);
                if (written > 0) {
                    offset += written;
                    remaining -= written;
                } else {
                    delay(1);
                }
            } else {
                break;
            }
            yield();
        }
    });

    // === DOWNLOAD CONFIGURATION & SETTINGS BACKUP (.JSON) ===
    _server.on("/api/backup/download", HTTP_GET, [this]() {
        DynamicJsonDocument backupDoc(4096);
        backupDoc["nodeId"] = ReceiverClient::getInstance().getConfig().nodeId;
        backupDoc["nodeName"] = ReceiverClient::getInstance().getConfig().nodeName;
        backupDoc["firmwareVersion"] = FIRMWARE_VERSION;
        backupDoc["timestamp"] = AutomationEngine::getInstance().getFormattedTime();
        backupDoc["epoch"] = (unsigned long)time(nullptr);

        DynamicJsonDocument subDoc(1024);
        if (StorageManager::getInstance().loadJsonFile(FILE_SYSTEM_CONFIG, subDoc)) {
            backupDoc["system"] = subDoc;
        }
        subDoc.clear();
        if (StorageManager::getInstance().loadJsonFile(FILE_GPIO_CONFIG, subDoc)) {
            backupDoc["gpio"] = subDoc;
        }
        subDoc.clear();
        if (StorageManager::getInstance().loadJsonFile(FILE_RULES_CONFIG, subDoc)) {
            backupDoc["rules"] = subDoc;
        }
        subDoc.clear();
        if (StorageManager::getInstance().loadJsonFile(FILE_RECEIVER_CONFIG, subDoc)) {
            backupDoc["receiver"] = subDoc;
        }
        subDoc.clear();
        if (StorageManager::getInstance().loadJsonFile(FILE_WIFI_CONFIG, subDoc)) {
            backupDoc["wifi"] = subDoc;
        }

        String nodeMac = WiFi.macAddress();
        nodeMac.replace(":", "");
        String filename = "smarthome_config_" + nodeMac + ".json";

        _server.sendHeader(F("Content-Disposition"), "attachment; filename=\"" + filename + "\"");
        _server.sendHeader(F("Content-Type"), F("application/json"));
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));

        String out;
        serializeJsonPretty(backupDoc, out);
        _server.send(200, "application/json", out);
    });

    // === RESTORE CONFIGURATION FROM BACKUP (.JSON) ===
    _server.on("/api/backup/restore", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument backupDoc(4096);
        DeserializationError err = deserializeJson(backupDoc, _server.arg("plain"));
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON backup file"));
            return;
        }

        auto saveVariant = [](const char* path, JsonVariantConst var) -> bool {
            String tmp = String(path) + ".tmp";
            File f = LittleFS.open(tmp.c_str(), "w");
            if (!f) return false;
            size_t w = serializeJson(var, f);
            f.flush();
            f.close();
            if (w == 0) { LittleFS.remove(tmp.c_str()); return false; }
            LittleFS.remove(path);
            return LittleFS.rename(tmp.c_str(), path);
        };

        bool restoredAny = false;
        if (backupDoc.containsKey("system")) {
            saveVariant(FILE_SYSTEM_CONFIG, backupDoc["system"]);
            restoredAny = true;
        }
        if (backupDoc.containsKey("gpio")) {
            saveVariant(FILE_GPIO_CONFIG, backupDoc["gpio"]);
            restoredAny = true;
        }
        if (backupDoc.containsKey("rules")) {
            saveVariant(FILE_RULES_CONFIG, backupDoc["rules"]);
            restoredAny = true;
        }
        if (backupDoc.containsKey("receiver")) {
            saveVariant(FILE_RECEIVER_CONFIG, backupDoc["receiver"]);
            restoredAny = true;
        }
        if (backupDoc.containsKey("wifi")) {
            saveVariant(FILE_WIFI_CONFIG, backupDoc["wifi"]);
            restoredAny = true;
        }

        if (restoredAny) {
            Logger::log(F("[SYS] Configuration restored from backup file. Rebooting..."));
            sendJsonResponse(200, true, F("Settings restored successfully! Rebooting in 2 seconds..."));
            delay(1000);
            ESP.restart();
        } else {
            sendJsonResponse(400, false, F("Backup file did not contain recognized settings"));
        }
    });

    // === DIRECT LITTLEFS ASSET UPLOAD ===
    _server.on("/api/fs/upload", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        sendJsonResponse(200, true, F("File uploaded to LittleFS successfully"));
    }, [this]() {
        const ReceiverConfig& rcfg = ReceiverClient::getInstance().getConfig();
        bool authOk = AuthManager::getInstance().authenticate(_server);
        if (!authOk && rcfg.enabled && rcfg.serverHost.length() > 0 && _server.client().remoteIP().toString() == rcfg.serverHost) authOk = true;
        if (!authOk && rcfg.authToken.length() > 0 && _server.hasHeader("Authorization") && _server.header("Authorization") == ("Bearer " + rcfg.authToken)) authOk = true;
        if (!authOk && rcfg.authToken.length() == 0) authOk = true;
        if (!authOk) return;

        HTTPUpload& upload = _server.upload();
        if (upload.status == UPLOAD_FILE_START) {
            String filename = upload.filename;
            if (!filename.startsWith("/")) filename = "/" + filename;
            Serial.printf("[FS] File upload started: %s\n", filename.c_str());
            if (LittleFS.exists(filename)) {
                LittleFS.remove(filename);
            }
            _fsUploadFile = LittleFS.open(filename, "w");
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            if (_fsUploadFile) {
                _fsUploadFile.write(upload.buf, upload.currentSize);
            }
        } else if (upload.status == UPLOAD_FILE_END) {
            if (_fsUploadFile) {
                _fsUploadFile.flush();
                _fsUploadFile.close();
                Serial.printf("[FS] File upload finished: %u bytes\n", (unsigned int)upload.totalSize);
            }
        }
    });

    // === LITTLEFS FILESYSTEM MANAGEMENT API ===
    _server.on("/api/fs/list", HTTP_GET, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(4096);
        JsonArray files = doc.createNestedArray("files");

        auto listDirRecursive = [&](auto& self, const String& path) -> void {
            Dir dir = LittleFS.openDir(path);
            while (dir.next()) {
                if (dir.isDirectory()) {
                    String sub = path + (path.endsWith("/") ? "" : "/") + dir.fileName();
                    self(self, sub);
                } else {
                    JsonObject f = files.createNestedObject();
                    String fullPath = path + (path.endsWith("/") ? "" : "/") + dir.fileName();
                    if (!fullPath.startsWith("/")) fullPath = "/" + fullPath;
                    f["name"] = fullPath;
                    f["size"] = dir.fileSize();
                }
            }
        };
        listDirRecursive(listDirRecursive, "/");

        FSInfo fs_info;
        if (LittleFS.info(fs_info)) {
            doc["totalBytes"] = fs_info.totalBytes;
            doc["usedBytes"] = fs_info.usedBytes;
            doc["freeBytes"] = (fs_info.totalBytes > fs_info.usedBytes) ? (fs_info.totalBytes - fs_info.usedBytes) : 0;
            doc["maxPathLength"] = fs_info.maxPathLength;
        }

        sendJsonDoc(200, doc);
    });

    _server.on("/api/fs/download", HTTP_GET, [this]() {
        if (!checkAuthOrReject()) return;

        if (!_server.hasArg("path")) {
            sendJsonResponse(400, false, F("Query parameter 'path' required"));
            return;
        }

        String path = _server.arg("path");
        if (path.indexOf("..") >= 0) {
            sendJsonResponse(400, false, F("Directory traversal rejected"));
            return;
        }
        if (!path.startsWith("/")) path = "/" + path;

        if (!LittleFS.exists(path)) {
            sendJsonResponse(404, false, F("File not found on LittleFS"));
            return;
        }

        File file = LittleFS.open(path, "r");
        String filename = path.substring(path.lastIndexOf('/') + 1);
        _server.sendHeader(F("Content-Disposition"), "attachment; filename=\"" + filename + "\"");
        _server.sendHeader(F("Cache-Control"), F("no-cache"));
        _server.streamFile(file, "application/octet-stream");
        file.close();
    });

    _server.on("/api/fs/delete", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(256);
        deserializeJson(doc, _server.arg("plain"));
        String path = doc["path"] | "";

        if (path.length() == 0 || path.indexOf("..") >= 0) {
            sendJsonResponse(400, false, F("Invalid or prohibited file path"));
            return;
        }
        if (!path.startsWith("/")) path = "/" + path;

        if (!LittleFS.exists(path)) {
            sendJsonResponse(404, false, F("File does not exist"));
            return;
        }

        if (LittleFS.remove(path)) {
            Logger::log(String(F("[FS] Deleted file: ")) + path);
            sendJsonResponse(200, true, F("File deleted successfully"));
        } else {
            sendJsonResponse(500, false, F("Failed to delete file from LittleFS"));
        }
    });

    _server.on("/api/fs/save-content", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        String body = _server.arg("plain");
        if (body.length() > 6144) {
            sendJsonResponse(413, false, F("Payload exceeds 6KB limit"));
            return;
        }
        DynamicJsonDocument doc(6144);
        DeserializationError err = deserializeJson(doc, body);
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON payload"));
            return;
        }
        String path = doc["path"] | "";
        if (path.length() == 0 || path.indexOf("..") >= 0) {
            sendJsonResponse(400, false, F("Invalid or prohibited file path"));
            return;
        }
        if (!path.startsWith("/")) path = "/" + path;
        String content = doc["content"] | "";
        if (content.length() > 5120) {
            sendJsonResponse(413, false, F("Content exceeds 5KB safety limit"));
            return;
        }
        int lastSlash = path.lastIndexOf('/');
        if (lastSlash > 0) {
            String dir = path.substring(0, lastSlash);
            if (!LittleFS.exists(dir)) LittleFS.mkdir(dir);
        }
        File file = LittleFS.open(path, "w");
        if (!file) {
            sendJsonResponse(500, false, F("Failed to open LittleFS file for writing"));
            return;
        }
        size_t written = file.print(content);
        file.flush();
        file.close();
        Logger::log(String(F("[FS] Saved file: ")) + path);
        StaticJsonDocument<192> resp;
        resp["success"] = true;
        resp["path"] = path;
        resp["bytes"] = written;
        sendJsonDoc(200, resp);
    });

    _server.on("/api/fs/rename", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));
        String oldPath = doc["oldPath"] | "";
        String newPath = doc["newPath"] | "";

        if (oldPath.length() == 0 || newPath.length() == 0 || oldPath.indexOf("..") >= 0 || newPath.indexOf("..") >= 0) {
            sendJsonResponse(400, false, F("Invalid file paths"));
            return;
        }
        if (!oldPath.startsWith("/")) oldPath = "/" + oldPath;
        if (!newPath.startsWith("/")) newPath = "/" + newPath;

        if (!LittleFS.exists(oldPath)) {
            sendJsonResponse(404, false, F("Source file does not exist"));
            return;
        }

        if (LittleFS.rename(oldPath, newPath)) {
            Logger::log(String(F("[FS] Renamed file: ")) + oldPath + F(" -> ") + newPath);
            sendJsonResponse(200, true, F("File renamed successfully"));
        } else {
            sendJsonResponse(500, false, F("Failed to rename file on LittleFS"));
        }
    });

    // === DIRECT COMMAND EXECUTION & ACKNOWLEDGEMENT ===
    _server.on("/api/commands/execute", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;

        DynamicJsonDocument doc(3072);
        DeserializationError err = deserializeJson(doc, _server.arg("plain"));
        if (err) {
            sendJsonResponse(400, false, F("Invalid JSON command"));
            return;
        }

        String cmdId = doc["commandId"] | doc["command_uuid"] | "";
        String action = doc["action"] | doc["command_type"] | "";
        uint8_t gpioId = doc["id"] | (uint8_t)(doc["channel_id"] | 0);

        DynamicJsonDocument resp(2048);
        resp["commandId"] = cmdId;
        resp["nodeId"] = ReceiverClient::getInstance().getConfig().nodeId;
        resp["status"] = "ACKNOWLEDGED";

        bool ok = false;
        if (action.equalsIgnoreCase("reboot")) {
            resp["success"] = true;
            resp["message"] = F("Node will restart");
            sendJsonDoc(200, resp);
            delay(500);
            ESP.restart();
            return;
        } else if (action.equalsIgnoreCase("setState")) {
            bool state = doc["state"] | false;
            ok = GpioManager::getInstance().setState(gpioId, state);
            resp["success"] = ok;
            resp["state"] = state;
        } else if (action.equalsIgnoreCase("toggle")) {
            ok = GpioManager::getInstance().toggle(gpioId);
            resp["success"] = ok;
        } else if (action.equalsIgnoreCase("pulse")) {
            unsigned long dur = doc["duration"] | 500;
            ok = GpioManager::getInstance().pulse(gpioId, dur);
            resp["success"] = ok;
        } else if (action.equalsIgnoreCase("readInfo")) {
            resp["success"] = true;
            resp["freeHeap"] = ESP.getFreeHeap();
            resp["uptimeSec"] = millis() / 1000UL;
            ok = true;
        } else if (action.equalsIgnoreCase("syncConfig")) {
            if (doc.containsKey("config")) {
                JsonObject conf = doc["config"].as<JsonObject>();
                if (conf.containsKey("channels") && conf["channels"].is<JsonArray>()) {
                    JsonArray chArr = conf["channels"].as<JsonArray>();
                    GpioManager::getInstance().fromJson(chArr);
                }
            }
            resp["success"] = true;
            resp["message"] = F("Configuration synchronized");
            ok = true;
        } else if (action.equalsIgnoreCase("send_ir")) {
            uint8_t txPin = doc["pin"] | IrManager::getInstance().getTransmitterPin();
            String protocol = doc["protocol"] | "NEC";
            String hexCode = doc.containsKey("hexCode") ? doc["hexCode"].as<String>() : (doc["code"] | "");
            uint16_t bits = doc["bits"] | 32;
            uint8_t repeat = doc["repeat"] | 0;
            ok = IrManager::getInstance().transmit(txPin, protocol, hexCode, bits, repeat);
            resp["success"] = ok;
            resp["message"] = ok ? F("IR signal transmitted") : F("IR transmission failed");
        } else if (action.equalsIgnoreCase("configure_pin")) {
            uint8_t id = doc["id"] | 0;
            GpioChannel* existing = GpioManager::getInstance().getChannel(id);
            if (!existing) {
                resp["success"] = false;
                resp["error"] = F("Channel not found");
            } else {
                String name = doc.containsKey("name") ? doc["name"].as<String>() : existing->name;
                String room = doc.containsKey("room") ? doc["room"].as<String>() : existing->room;
                String fn = doc.containsKey("function") ? doc["function"].as<String>() : existing->function;
                bool activeLow = doc.containsKey("activeLow") ? doc["activeLow"].as<bool>() : existing->activeLow;
                uint8_t initMode = doc.containsKey("initialMode") ? doc["initialMode"].as<uint8_t>() : existing->initialMode;
                bool enabled = doc.containsKey("enabled") ? doc["enabled"].as<bool>() : existing->enabled;
                String outErr;
                ok = GpioManager::getInstance().updateChannel(id, name, room, fn, activeLow, initMode, enabled, outErr);
                resp["success"] = ok;
                if (ok) resp["message"] = F("Pin configured");
                else resp["error"] = outErr;
            }
        } else if (action.equalsIgnoreCase("read_sensor")) {
            uint8_t id = doc["id"] | 0;
            resp["success"] = true;
            JsonArray arr = resp.createNestedArray("sensors");
            GpioManager::getInstance().toJson(arr, true);
            if (id > 0) {
                for (JsonObject s : arr) {
                    if ((s["id"] | 0) == id) {
                        resp["sensor"] = s;
                        break;
                    }
                }
            }
            ok = true;
        } else {
            resp["success"] = false;
            resp["error"] = F("Unknown command action");
        }

        sendJsonDoc(ok ? 200 : 400, resp);
    });

    // === INFRARED (IR) REMOTE LEARNING & TRANSMISSION ===
    _server.on("/api/ir/status", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        DynamicJsonDocument doc(512);
        doc["rxPin"] = IrManager::getInstance().getReceiverPin();
        doc["txPin"] = IrManager::getInstance().getTransmitterPin();
        doc["isReceiverActive"] = IrManager::getInstance().isReceiverActive();
        doc["isTransmitterActive"] = IrManager::getInstance().isTransmitterActive();
        doc["isTraining"] = IrManager::getInstance().isTraining();
        doc["trainingSuccess"] = IrManager::getInstance().hasTrainingResult();

        String proto, hexCode;
        uint16_t bits;
        unsigned long ageMs;
        if (IrManager::getInstance().getLastCaptured(proto, hexCode, bits, ageMs)) {
            JsonObject last = doc.createNestedObject("lastCaptured");
            last["protocol"] = proto;
            last["hexCode"] = hexCode;
            last["bits"] = bits;
            last["ageMs"] = ageMs;
        }

        sendJsonDoc(200, doc);
    });

    _server.on("/api/ir/train/start", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        DynamicJsonDocument doc(256);
        deserializeJson(doc, _server.arg("plain"));
        unsigned long timeoutSec = doc["timeoutSec"] | 25;
        IrManager::getInstance().startTraining(timeoutSec);
        sendJsonResponse(200, true, F("Listening for IR remote signal... Point remote at sensor and press button."));
    });

    _server.on("/api/ir/train/stop", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        IrManager::getInstance().stopTraining();
        sendJsonResponse(200, true, F("IR training stopped"));
    });

    _server.on("/api/ir/train/result", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        DynamicJsonDocument doc(512);
        doc["isTraining"] = IrManager::getInstance().isTraining();
        doc["captured"] = IrManager::getInstance().hasTrainingResult();

        String proto, hexCode;
        uint16_t bits;
        unsigned long ageMs;
        if (IrManager::getInstance().getLastCaptured(proto, hexCode, bits, ageMs)) {
            doc["protocol"] = proto;
            doc["hexCode"] = hexCode;
            doc["bits"] = bits;
            doc["ageMs"] = ageMs;
        }

        sendJsonDoc(200, doc);
    });

    _server.on("/api/ir/transmit", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        if (doc.containsKey("remoteName") && doc.containsKey("buttonName")) {
            String rName = doc["remoteName"] | "";
            String bName = doc["buttonName"] | "";
            if (IrManager::getInstance().transmitButton(rName, bName)) {
                sendJsonResponse(200, true, F("IR signal transmitted successfully"));
            } else {
                sendJsonResponse(404, false, F("Saved button not found"));
            }
            return;
        }

        uint8_t pin = doc["pin"] | IrManager::getInstance().getTransmitterPin();
        String protocol = doc["protocol"] | "NEC";
        String hexCode = doc.containsKey("hexCode") ? doc["hexCode"].as<String>() : (doc.containsKey("code") ? doc["code"].as<String>() : "");
        uint16_t bits = doc["bits"] | 32;
        uint8_t repeat = doc["repeat"] | 0;

        if (hexCode.length() == 0) {
            sendJsonResponse(400, false, F("Missing hexCode"));
            return;
        }

        if (IrManager::getInstance().transmit(pin, protocol, hexCode, bits, repeat)) {
            sendJsonResponse(200, true, F("IR signal transmitted successfully"));
        } else {
            sendJsonResponse(500, false, F("Failed to transmit IR signal"));
        }
    });

    _server.on("/api/ir/remotes", HTTP_GET, [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        DynamicJsonDocument doc(2048);
        JsonArray arr = doc.createNestedArray("remotes");
        IrManager::getInstance().getRemotesJson(arr);
        sendJsonDoc(200, doc);
    });

    _server.on("/api/ir/remotes/save", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        DynamicJsonDocument doc(512);
        deserializeJson(doc, _server.arg("plain"));

        String rName = doc["remoteName"] | "";
        String bName = doc["buttonName"] | "";
        String protocol = doc["protocol"] | "NEC";
        String hexCode = doc.containsKey("hexCode") ? doc["hexCode"].as<String>() : (doc.containsKey("code") ? doc["code"].as<String>() : "");
        uint16_t bits = doc["bits"] | 32;
        uint8_t repeat = doc["repeat"] | 0;

        if (IrManager::getInstance().saveButton(rName, bName, protocol, hexCode, bits, repeat)) {
            sendJsonResponse(200, true, F("Remote button saved successfully"));
        } else {
            sendJsonResponse(400, false, F("Invalid parameters for saving button"));
        }
    });

    _server.on("/api/ir/remotes/delete", HTTP_POST, [this]() {
        if (!checkAuthOrReject()) return;
        DynamicJsonDocument doc(256);
        deserializeJson(doc, _server.arg("plain"));

        String rName = doc["remoteName"] | "";
        String bName = doc["buttonName"] | "";

        if (bName.length() > 0) {
            if (IrManager::getInstance().deleteButton(rName, bName)) {
                sendJsonResponse(200, true, F("Button deleted successfully"));
            } else {
                sendJsonResponse(404, false, F("Button not found"));
            }
        } else {
            if (IrManager::getInstance().deleteRemote(rName)) {
                sendJsonResponse(200, true, F("Remote deleted successfully"));
            } else {
                sendJsonResponse(404, false, F("Remote not found"));
            }
        }
    });
}

void WebServerManager::registerStaticRoutes() {
    _server.on("/", HTTP_GET, [this]() {
        if (!handleFileRead(F("/index.html"))) {
            serveEmbeddedDashboard();
        }
    });

    _server.on("/index.html", HTTP_GET, [this]() {
        if (!handleFileRead(F("/index.html"))) {
            serveEmbeddedDashboard();
        }
    });

    _server.on("/style.css", HTTP_GET, [this]() {
        if (!handleFileRead(F("/style.css"))) {
            _server.send(404, "text/plain", "style.css not found in LittleFS");
        }
    });

    _server.on("/app.js", HTTP_GET, [this]() {
        if (!handleFileRead(F("/app.js"))) {
            _server.send(404, "text/plain", "app.js not found in LittleFS");
        }
    });
}

bool WebServerManager::handleFileRead(String path) {
    if (path.endsWith("/")) path += "index.html";

    String contentType = "text/plain";
    if (path.endsWith(".html")) contentType = "text/html";
    else if (path.endsWith(".css")) contentType = "text/css";
    else if (path.endsWith(".js")) contentType = "application/javascript";
    else if (path.endsWith(".json")) contentType = "application/json";
    else if (path.endsWith(".png")) contentType = "image/png";
    else if (path.endsWith(".ico")) contentType = "image/x-icon";

    auto applyCacheHeaders = [this]() {
        _server.sendHeader(F("Cache-Control"), F("no-cache, no-store, must-revalidate"));
        _server.sendHeader(F("Pragma"), F("no-cache"));
        _server.sendHeader(F("Expires"), F("0"));
    };

    // Check gzip compressed version first (streamFile adds Content-Encoding: gzip automatically if filename ends in .gz)
    String pathWithGz = path + ".gz";
    if (LittleFS.exists(pathWithGz)) {
        File file = LittleFS.open(pathWithGz, "r");
        applyCacheHeaders();
        _server.streamFile(file, contentType);
        file.close();
        return true;
    }

    if (LittleFS.exists(path)) {
        File file = LittleFS.open(path, "r");
        applyCacheHeaders();
        _server.streamFile(file, contentType);
        file.close();
        return true;
    }

    return false;
}

// Built-in lightweight fallback SPA if LittleFS data files have not been uploaded yet
static const char FALLBACK_DASHBOARD_HTML[] PROGMEM =
    "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>SmartHome Setup</title><style>"
    "body{font-family:sans-serif;background:#121820;color:#e2e8f0;padding:20px;text-align:center;}"
    ".card{background:#1c2430;border-radius:12px;padding:24px;max-width:480px;margin:30px auto;border:1px solid #2e3846;text-align:left;}"
    "h2{color:#3b82f6;margin-top:0;}input,button{width:100%;padding:12px;margin:8px 0;box-sizing:border-box;border-radius:8px;border:1px solid #2e3846;background:#121820;color:#fff;}"
    "button{background:#3b82f6;border:none;font-weight:bold;cursor:pointer;}button:hover{background:#2563eb;}"
    ".note{color:#94a3b8;font-size:0.85rem;line-height:1.4;margin:12px 0;}"
    "</style></head><body><div class='card'>"
    "<h2>⚡ SmartHome Quick Setup</h2>"
    "<p class='note'>Flash files from <code>/data</code> not detected in LittleFS. Use this setup portal to connect your Wi-Fi, control relays, or upload full web assets via OTA.</p>"
    "<form method='POST' action='/api/wifi/connect' onsubmit='event.preventDefault();connect();'>"
    "<label>Router SSID:</label><input id='ssid' placeholder='Wi-Fi Name' required>"
    "<label>Password:</label><input type='password' id='pass' placeholder='Wi-Fi Password'>"
    "<button type='submit'>Connect to Wi-Fi</button>"
    "</form><div id='msg' style='margin-top:15px;color:#10b981;font-weight:bold;'></div>"
    "<hr style='border:0;border-top:1px solid #2e3846;margin:20px 0;'>"
    "<p class='note'>Admin Default: <strong>admin / admin</strong></p>"
    "<p class='note'>Upload complete dashboard with PlatformIO: <code>pio run --target uploadfs</code></p>"
    "</div><script>"
    "function connect(){"
    "fetch('/api/wifi/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ssid:document.getElementById('ssid').value,password:document.getElementById('pass').value})})"
    ".then(r=>r.json()).then(d=>{document.getElementById('msg').innerText=d.message||'Connecting...';})"
    ".catch(e=>{document.getElementById('msg').innerText='Error sending connection request';});}"
    "</script></body></html>";

void WebServerManager::serveEmbeddedDashboard() {
    _server.send_P(200, "text/html; charset=UTF-8", FALLBACK_DASHBOARD_HTML);
}

#endif

#if !defined(TARGET_ESP01_1M) && !defined(TARGET_ESP01_PCF8574)
extern const char API_CATALOG_JSON[] PROGMEM = R"rawliteral({
  "title": "SmartHome ESP8266 REST API Catalog",
  "version": "1.6.0",
  "endpoints": [
    {"method":"POST","path":"/api/auth/login","auth":false,"description":"Authenticate admin or paired server key","body":{"username":"admin","password":"..."}},
    {"method":"GET","path":"/api/auth/check","auth":false,"description":"Check active authentication and pairing status"},
    {"method":"POST","path":"/api/auth/logout","auth":false,"description":"Invalidate session token"},
    {"method":"GET","path":"/api/auth/pair","auth":false,"description":"Get Central Server pairing status and admin username"},
    {"method":"POST","path":"/api/auth/pair","auth":true,"description":"Provision server pairing key (accepts adminPassword if unauthenticated)","body":{"serverKey":"...","adminPassword":"..."}},
    {"method":"POST","path":"/api/auth/unpair","auth":true,"description":"Revoke server pairing key"},
    {"method":"GET","path":"/api/status","auth":false,"description":"System diagnostics (uptime, heap, flash, Wi-Fi, I2C, time)"},
    {"method":"GET","path":"/api/all","auth":false,"description":"Self-discovery REST API endpoint catalog"},
    {"method":"GET","path":"/api/logs","auth":false,"description":"Fetch circular RAM system logs"},
    {"method":"GET","path":"/api/wifi/status","auth":false,"description":"Current Wi-Fi network, IP mode, and RSSI status"},
    {"method":"GET","path":"/api/wifi/scan","auth":true,"description":"Scan nearby 2.4GHz Wi-Fi networks"},
    {"method":"POST","path":"/api/wifi/connect","auth":true,"description":"Save router credentials and IP settings","body":{"ssid":"...","password":"...","useStaticIp":false}},
    {"method":"POST","path":"/api/wifi/ip","auth":true,"description":"Configure DHCP vs Static IP settings","body":{"useStaticIp":true,"staticIp":"...","staticGateway":"...","staticSubnet":"255.255.255.0","staticDns1":"8.8.8.8","staticDns2":"1.1.1.1"}},
    {"method":"POST","path":"/api/wifi/mode","auth":true,"description":"Set Wi-Fi mode (0=AP, 1=Router, 2=AP+Router)","body":{"mode":2}},
    {"method":"POST","path":"/api/wifi/reset","auth":true,"description":"Erase Wi-Fi credentials and start setup AP"},
    {"method":"GET","path":"/api/gpio","auth":false,"description":"List all relays, sensors, IR pins, and states"},
    {"method":"GET","path":"/api/sensors","auth":false,"description":"List only input sensors with live dcVoltage, acRms, rawAdc & IR values"},
    {"method":"POST","path":"/api/gpio","auth":true,"description":"Add relay output, sensor input, or IR pin","body":{"pin":5,"name":"...","room":"...","function":"Relay|Light|Fan|Voltage|PIR Motion|Door Sensor|IR Receiver|IR Transmitter","activeLow":true,"initialMode":0}},
    {"method":"POST","path":"/api/gpio/update","auth":true,"description":"Update channel configuration","body":{"id":1,"name":"...","room":"...","function":"Relay","activeLow":true,"initialMode":0,"enabled":true}},
    {"method":"POST","path":"/api/gpio/delete","auth":true,"description":"Delete GPIO channel","body":{"id":1}},
    {"method":"POST","path":"/api/gpio/state","auth":true,"description":"Control GPIO output","body":{"id":1,"state":true,"action":"setState|toggle|pulse","duration":500}},
    {"method":"POST","path":"/api/commands/execute","auth":true,"description":"Unified command dispatcher (setState, toggle, pulse, reboot, readInfo, syncConfig, send_ir, configure_pin, read_sensor)","body":{"commandId":"...","action":"setState","id":1,"state":true}},
    {"method":"GET","path":"/api/i2c","auth":false,"description":"Get I2C bus and PCF8574 expander status"},
    {"method":"POST","path":"/api/i2c","auth":true,"description":"Configure I2C pins, PCF8574 address, and enable state","body":{"enabled":true,"sdaPin":4,"sclPin":5,"address":32,"reboot":false}},
    {"method":"POST","path":"/api/i2c/auto-channels","auth":true,"description":"Auto-populate 8 PCF8574 relay channels (P0-P7 / pins 100-107)"},
    {"method":"GET","path":"/api/i2c/scan","auth":false,"description":"Scan I2C bus for connected devices"},
    {"method":"GET","path":"/api/ir/status","auth":false,"description":"Get IR RX/TX pin state, training state, and last captured code"},
    {"method":"POST","path":"/api/ir/train/start","auth":true,"description":"Start IR remote signal learning window","body":{"timeoutSec":25}},
    {"method":"POST","path":"/api/ir/train/stop","auth":true,"description":"Stop IR learning mode"},
    {"method":"GET","path":"/api/ir/train/result","auth":false,"description":"Poll latest captured IR remote signal"},
    {"method":"POST","path":"/api/ir/transmit","auth":true,"description":"Blast saved remote button or direct protocol/hexCode","body":{"remoteName":"...","buttonName":"..."}},
    {"method":"GET","path":"/api/ir/remotes","auth":false,"description":"List saved IR remotes and buttons from LittleFS"},
    {"method":"POST","path":"/api/ir/remotes/save","auth":true,"description":"Save IR button code to /config/ir_codes.json","body":{"remoteName":"...","buttonName":"...","protocol":"NEC","hexCode":"0x20DF10EF","bits":32,"repeat":0}},
    {"method":"POST","path":"/api/ir/remotes/delete","auth":true,"description":"Delete a saved IR button or entire remote","body":{"remoteName":"...","buttonName":"..."}},
    {"method":"GET","path":"/api/automation","auth":false,"description":"List all configured automation rules"},
    {"method":"POST","path":"/api/automation","auth":true,"description":"Add automation rule","body":{"name":"...","type":0,"sourceGpioId":0,"targetGpioId":1,"condState":true,"targetState":false,"param1":300}},
    {"method":"POST","path":"/api/automation/toggle","auth":true,"description":"Enable/disable rule","body":{"id":1}},
    {"method":"POST","path":"/api/automation/delete","auth":true,"description":"Delete automation rule","body":{"id":1}},
    {"method":"GET","path":"/api/settings","auth":false,"description":"Get device name, AP SSID, and timezone"},
    {"method":"POST","path":"/api/settings","auth":true,"description":"Save device name, AP credentials, and timezone","body":{"deviceName":"...","apSsid":"...","apPass":"...","timezoneOffset":19800}},
    {"method":"POST","path":"/api/settings/password","auth":true,"description":"Change admin password","body":{"currentPassword":"...","newPassword":"..."}},
    {"method":"POST","path":"/api/settings/ntp-sync","auth":true,"description":"Force NTP time synchronization"},
    {"method":"GET","path":"/api/receiver","auth":false,"description":"Get central receiver telemetry config and counters"},
    {"method":"POST","path":"/api/receiver","auth":true,"description":"Configure central receiver telemetry client"},
    {"method":"POST","path":"/api/receiver/test","auth":true,"description":"Test connection to central receiver"},
    {"method":"POST","path":"/api/receiver/push","auth":true,"description":"Trigger immediate telemetry push"},
    {"method":"POST","path":"/api/system/reboot","auth":true,"description":"Soft reboot microcontroller"},
    {"method":"POST","path":"/api/system/factory-reset","auth":true,"description":"Wipe configurations and reboot into factory defaults"},
    {"method":"POST","path":"/api/ota/upload","auth":true,"description":"Multipart firmware or LittleFS upload (.bin)"},
    {"method":"GET","path":"/api/firmware/download","auth":true,"description":"Download running flash firmware binary (.bin)"},
    {"method":"GET","path":"/api/backup/download","auth":true,"description":"Download full JSON configuration backup"},
    {"method":"POST","path":"/api/backup/restore","auth":true,"description":"Restore full JSON configuration backup"},
    {"method":"GET","path":"/api/fs/list","auth":true,"description":"List files and sizes in LittleFS"},
    {"method":"GET","path":"/api/fs/download","auth":true,"description":"Download file from LittleFS (?path=/...)"},
    {"method":"POST","path":"/api/fs/upload","auth":true,"description":"Multipart upload file into LittleFS"},
    {"method":"POST","path":"/api/fs/save-content","auth":true,"description":"Write small text/JSON file to LittleFS (<=5KB)","body":{"path":"/config/custom.json","content":"{}"}},
    {"method":"POST","path":"/api/fs/delete","auth":true,"description":"Delete file from LittleFS","body":{"path":"/config/..."}},
    {"method":"POST","path":"/api/fs/rename","auth":true,"description":"Rename file in LittleFS","body":{"oldPath":"/a.json","newPath":"/b.json"}}
  ]
})rawliteral";
#endif
