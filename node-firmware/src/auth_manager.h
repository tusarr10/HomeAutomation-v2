#ifndef AUTH_MANAGER_H
#define AUTH_MANAGER_H

#if defined(TARGET_ESP01_1M) || defined(TARGET_ESP01_PCF8574)

#include <Arduino.h>
#include <ESP8266WebServer.h>
#include <ArduinoJson.h>
#include "config.h"

struct AuthSession {
    String token;
    unsigned long lastActivity;
    bool active;
};

class AuthManager {
public:
    static AuthManager& getInstance();

    bool begin();
    bool authenticate(ESP8266WebServer& server);
    bool login(const String& username, const String& password, String& outToken);
    void logout(ESP8266WebServer& server);
    bool changePassword(const String& currentPassword, const String& newPassword);
    
    String getAdminUsername() const { return _adminUser; }
    String getAdminPassword() const { return _adminPasswordHash; }
    bool checkCredentials(const String& username, const String& password) const;
    void setAdminCredentials(const String& username, const String& passwordHash);
    bool setServerPairingKey(const String& newKey);
    bool clearServerPairingKey();
    bool isPaired() const { return _serverKeyHash.length() > 0; }
    String getServerKeyHash() const { return _serverKeyHash; }

    static String sha256(const String& input);

private:
    AuthManager();
    String _adminUser;
    String _adminPasswordHash;
    String _serverKeyHash;
    AuthSession _currentSession;
    uint8_t _failedAttempts;
    unsigned long _lockoutUntil;

    String extractToken(ESP8266WebServer& server);
    String generateRandomToken();
    void loadFromStorage();
    void saveToStorage();
};

#else

#include <Arduino.h>
#include <ESP8266WebServer.h>
#include <ArduinoJson.h>
#include "config.h"

struct AuthSession {
    String token;
    unsigned long lastActivity;
    bool active;
};

class AuthManager {
public:
    static AuthManager& getInstance();

    bool begin();
    bool authenticate(ESP8266WebServer& server);
    bool login(const String& username, const String& password, String& outToken);
    void logout(ESP8266WebServer& server);
    bool changePassword(const String& currentPassword, const String& newPassword);
    
    String getAdminUsername() const { return _adminUser; }
    void setAdminCredentials(const String& username, const String& passwordHash);
    bool setServerPairingKey(const String& newKey);
    bool clearServerPairingKey();
    bool isPaired() const { return _serverKeyHash.length() > 0; }
    String getServerKeyHash() const { return _serverKeyHash; }
    bool checkCredentials(const String& username, const String& password) const;

    static String sha256(const String& input);

private:
    AuthManager();
    String _adminUser;
    String _adminPasswordHash;
    String _serverKeyHash;
    AuthSession _currentSession;
    uint8_t _failedAttempts;
    unsigned long _lockoutUntil;

    String extractToken(ESP8266WebServer& server);
    String generateRandomToken();
    void loadFromStorage();
    void saveToStorage();
};

#endif // TARGET_ESP01_1M || TARGET_ESP01_PCF8574

#endif // AUTH_MANAGER_H
