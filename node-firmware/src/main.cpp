#if defined(TARGET_ESP01_1M) || defined(TARGET_ESP01_PCF8574)
#include <Arduino.h>
#include "config.h"
#include "storage_manager.h"
#include "auth_manager.h"
#include "gpio_manager.h"
#include "wifi_manager.h"
#include "automation.h"
#include "ota_manager.h"
#include "web_server.h"
#include "receiver_client.h"
#if FEATURE_PCF8574
#include "drivers/pcf8574_driver.h"
#endif

// Hardware Reset Button State
unsigned long resetBtnPressStart = 0;
bool resetBtnPressed = false;

void checkResetButton() {
#if defined(FACTORY_RESET_PIN) && (FACTORY_RESET_PIN < 17)
    // Physical button is pulled HIGH; pressing pulls to GND (LOW)
    if (digitalRead(FACTORY_RESET_PIN) == LOW) {
        if (!resetBtnPressed) {
            resetBtnPressed = true;
            resetBtnPressStart = millis();
        } else {
            unsigned long heldDuration = millis() - resetBtnPressStart;
            if (heldDuration >= FACTORY_RESET_HOLD_MS) {
                Serial.println(F("\n[RESET] Physical factory reset triggered via 5s button hold!"));
                
                // Rapidly blink onboard LED as visual feedback
                pinMode(ONBOARD_LED_PIN, OUTPUT);
                for (int i = 0; i < 10; i++) {
                    digitalWrite(ONBOARD_LED_PIN, (i % 2 == 0) ? LOW : HIGH);
                    delay(80);
                }

                WifiManager::getInstance().resetWifiCredentials();
                Serial.println(F("[RESET] Wi-Fi credentials erased. Rebooting..."));
                delay(500);
                ESP.restart();
            }
        }
    } else {
        resetBtnPressed = false;
        resetBtnPressStart = 0;
    }
#endif
}

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println();
    Serial.println(F("=================================================="));
    Serial.printf ("    %s v%s\n", FIRMWARE_NAME, FIRMWARE_VERSION);
    Serial.printf ("    Target: %s\n", HARDWARE_TARGET);
    Serial.println(F("=================================================="));

    // Configure Reset Button Pin with Internal Pull-Up (if configured)
#if defined(FACTORY_RESET_PIN) && (FACTORY_RESET_PIN < 17)
    pinMode(FACTORY_RESET_PIN, INPUT_PULLUP);
#endif
    pinMode(ONBOARD_LED_PIN, OUTPUT);
    digitalWrite(ONBOARD_LED_PIN, HIGH); // Off initially (Active-Low)

    // 1. Initialize Persistent Storage (LittleFS)
    if (!StorageManager::getInstance().begin()) {
        Serial.println(F("[FATAL] Flash storage initialization failed!"));
    }

    // 2. Initialize Authentication Subsystem
    AuthManager::getInstance().begin();

    // 3. Connect GPIO State Change Callback to Automation Engine & Central Receiver
    GpioManager::getInstance().registerStateChangeCallback([](uint8_t id, bool newState) {
        AutomationEngine::getInstance().notifyGpioStateChanged(id, newState);
        ReceiverClient::getInstance().onGpioStateChanged(id, newState);
    });

    // 4. Initialize Hardware GPIO Channels
    GpioManager::getInstance().begin();

    // 5. Initialize Wi-Fi Subsystem & Captive Portal
    WifiManager::getInstance().begin();

    // 6. Initialize Automation Rule Engine
    AutomationEngine::getInstance().begin();

    // 7. Initialize Central Receiver & Multi-Node Telemetry Client
    ReceiverClient::getInstance().begin();

    // 8. Initialize OTA Updates
    OtaManager::getInstance().begin(WifiManager::getInstance().getApSsid());

    // 9. Initialize Embedded Web Server & REST API
    WebServerManager::getInstance().begin();

    Serial.println(F("[INIT] SmartHome Controller is fully ready!"));
    Serial.printf ("[INIT] Setup Access Point IP: %s (SSID: %s)\n",
                   WiFi.softAPIP().toString().c_str(),
                   WifiManager::getInstance().getApSsid().c_str());
    if (WifiManager::getInstance().isSTAConnected()) {
        Serial.printf("[INIT] Home Router IP: %s\n", WiFi.localIP().toString().c_str());
    }
    Serial.printf("[INIT] Free Heap: %u bytes\n", ESP.getFreeHeap());
}

void loop() {
    // Run modular non-blocking subsystems
    WifiManager::getInstance().loop();
    WebServerManager::getInstance().loop();
    GpioManager::getInstance().loop();
    AutomationEngine::getInstance().loop();
    ReceiverClient::getInstance().loop();
    OtaManager::getInstance().loop();

    // Physical recovery reset button monitor
    checkResetButton();

    if (Serial.available()) {
        char c = Serial.read();
        if (c == 'h' || c == 'H') {
            Serial.printf("[HEAP] Free: %u bytes, Max Block: %u bytes, Frag: %u%%\n",
                          ESP.getFreeHeap(), ESP.getMaxFreeBlockSize(), ESP.getHeapFragmentation());
        } else if (c == 'i' || c == 'I' || c == 's' || c == 'S') {
            Serial.println(F("\n=================================================="));
            Serial.println(F("              I2C HARDWARE BUS SCAN               "));
            Serial.println(F("=================================================="));
#if FEATURE_PCF8574
            struct PinPair { uint8_t sda; uint8_t scl; const char* name; };
            PinPair pairs[] = {
                { 4, 5, "SDA=D2 (GPIO 4), SCL=D1 (GPIO 5) [Standard NodeMCU I2C]" },
                { 5, 4, "SDA=D1 (GPIO 5), SCL=D2 (GPIO 4) [Reversed SDA/SCL]" },
                { 12, 14, "SDA=D6 (GPIO 12), SCL=D5 (GPIO 14)" },
                { 14, 12, "SDA=D5 (GPIO 14), SCL=D6 (GPIO 12)" },
                { 0, 2, "SDA=D3 (GPIO 0), SCL=D4 (GPIO 2)" },
                { 2, 0, "SDA=D4 (GPIO 2), SCL=D3 (GPIO 0)" }
            };

            bool anyFound = false;
            for (const auto& p : pairs) {
                std::vector<uint8_t> devs = Pcf8574Driver::getInstance().scanBus(p.sda, p.scl);
                if (!devs.empty()) {
                    anyFound = true;
                    Serial.printf("[I2C] >>> DEVICE FOUND on %s! Count: %u\n", p.name, (unsigned int)devs.size());
                    for (uint8_t a : devs) {
                        const char* type = (a >= 0x20 && a <= 0x27) ? "PCF8574 (Standard 8-Ch Expander)" :
                                           ((a >= 0x38 && a <= 0x3F) ? "PCF8574A (High-Address 8-Ch Expander)" :
                                           ((a == 0x3C || a == 0x3D) ? "OLED Display (SSD1306)" :
                                           ((a == 0x68) ? "RTC (DS3231/DS1307) or MPU6050" :
                                           ((a == 0x48) ? "ADS1115 ADC" : "Generic I2C Device"))));
                        Serial.printf("      * Address: 0x%02X (%u decimal) -> %s\n", a, a, type);
                    }
                    GpioManager::getInstance().setI2cConfig(true, p.sda, p.scl, devs[0]);
                    Serial.printf("[I2C] -> Configured & Saved to LittleFS (SDA=%u, SCL=%u, Addr=0x%02X)\n", p.sda, p.scl, devs[0]);
                }
            }
            if (!anyFound) {
                Serial.println(F("[I2C] No devices responded on any pin pairs."));
                Serial.println(F("Checklist:"));
                Serial.println(F("  1. VCC connected to 3.3V (or 5V for 5V I2C modules)?"));
                Serial.println(F("  2. GND connected securely to ESP GND?"));
                Serial.println(F("  3. SDA connected to D2 (GPIO 4)?"));
                Serial.println(F("  4. SCL connected to D1 (GPIO 5)?"));
            }
            Serial.println(F("==================================================\n"));
#else
            Serial.println(F("[I2C SCAN] FEATURE_PCF8574 is disabled."));
#endif
        }
    }

    yield();
}

#elif defined(TARGET_NODEMCU_PCF8574)
#include <Arduino.h>
#include "config.h"
#include "storage_manager.h"
#include "auth_manager.h"
#include "gpio_manager.h"
#include "wifi_manager.h"
#include "automation.h"
#include "ota_manager.h"
#include "web_server.h"
#include "receiver_client.h"
#if FEATURE_PCF8574
#include "drivers/pcf8574_driver.h"
#endif

// Hardware Reset Button State
unsigned long resetBtnPressStart = 0;
bool resetBtnPressed = false;

void checkResetButton() {
    if (FACTORY_RESET_PIN == 255) return;

    // Only monitor physical factory reset if pin is NOT assigned as a relay channel
    if (GpioManager::getInstance().isPinAssigned(FACTORY_RESET_PIN)) {
        return;
    }

    // NodeMCU FLASH button (D3 / GPIO 0) is pulled HIGH; pressing pulls to GND (LOW)
    if (digitalRead(FACTORY_RESET_PIN) == LOW) {
        if (!resetBtnPressed) {
            resetBtnPressed = true;
            resetBtnPressStart = millis();
        } else {
            unsigned long heldDuration = millis() - resetBtnPressStart;
            if (heldDuration >= FACTORY_RESET_HOLD_MS) {
                Serial.println(F("\n[RESET] Physical factory reset triggered via 5s button hold!"));
                
                // Rapidly blink onboard LED (D4 / GPIO 2) as visual feedback
                pinMode(ONBOARD_LED_PIN, OUTPUT);
                for (int i = 0; i < 10; i++) {
                    digitalWrite(ONBOARD_LED_PIN, (i % 2 == 0) ? LOW : HIGH);
                    delay(80);
                }

                WifiManager::getInstance().resetWifiCredentials();
                Serial.println(F("[RESET] Wi-Fi credentials erased. Rebooting..."));
                delay(500);
                ESP.restart();
            }
        }
    } else {
        resetBtnPressed = false;
        resetBtnPressStart = 0;
    }
}

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println();
    Serial.println(F("=================================================="));
    Serial.printf ("    %s v%s\n", FIRMWARE_NAME, FIRMWARE_VERSION);
    Serial.printf ("    Target: %s\n", HARDWARE_TARGET);
    Serial.println(F("=================================================="));

    // Configure Reset Button Pin with Internal Pull-Up if enabled
    if (FACTORY_RESET_PIN != 255) {
        pinMode(FACTORY_RESET_PIN, INPUT_PULLUP);
    }
    // Configure Onboard LED if not utilized by I2C bus (D4 / GPIO 2)
    if (ONBOARD_LED_PIN != NODEMCU_I2C_SDA && ONBOARD_LED_PIN != NODEMCU_I2C_SCL) {
        pinMode(ONBOARD_LED_PIN, OUTPUT);
        digitalWrite(ONBOARD_LED_PIN, HIGH); // Off initially (Active-Low)
    }

    // 1. Initialize Persistent Storage (LittleFS)
    if (!StorageManager::getInstance().begin()) {
        Serial.println(F("[FATAL] Flash storage initialization failed!"));
    }

    // 2. Initialize Authentication Subsystem
    AuthManager::getInstance().begin();

    // 3. Connect GPIO State Change Callback to Automation Engine & Central Receiver
    GpioManager::getInstance().registerStateChangeCallback([](uint8_t id, bool newState) {
        AutomationEngine::getInstance().notifyGpioStateChanged(id, newState);
        ReceiverClient::getInstance().onGpioStateChanged(id, newState);
    });

    // 4. Initialize Hardware GPIO Channels
    GpioManager::getInstance().begin();

    // 5. Initialize Wi-Fi Subsystem & Captive Portal
    WifiManager::getInstance().begin();

    // 6. Initialize Automation Rule Engine
    AutomationEngine::getInstance().begin();

    // 7. Initialize Central Receiver & Multi-Node Telemetry Client
    ReceiverClient::getInstance().begin();

    // 8. Initialize OTA Updates
    OtaManager::getInstance().begin(WifiManager::getInstance().getApSsid());

    // 9. Initialize Embedded Web Server & REST API
    WebServerManager::getInstance().begin();

    Serial.println(F("[INIT] SmartHome Controller is fully ready!"));
    Serial.printf ("[INIT] Setup Access Point IP: %s (SSID: %s)\n",
                   WiFi.softAPIP().toString().c_str(),
                   WifiManager::getInstance().getApSsid().c_str());
    if (WifiManager::getInstance().isSTAConnected()) {
        Serial.printf("[INIT] Home Router IP: %s\n", WiFi.localIP().toString().c_str());
    }
    Serial.printf("[INIT] Free Heap: %u bytes\n", ESP.getFreeHeap());
}

void loop() {
    // Run modular non-blocking subsystems
    WifiManager::getInstance().loop();
    WebServerManager::getInstance().loop();
    GpioManager::getInstance().loop();
    AutomationEngine::getInstance().loop();
    ReceiverClient::getInstance().loop();
    OtaManager::getInstance().loop();

    // Physical recovery reset button monitor
    checkResetButton();

    if (Serial.available()) {
        char c = Serial.read();
        if (c == 'h' || c == 'H') {
            Serial.printf("[HEAP] Free: %u bytes, Max Block: %u bytes, Frag: %u%%\n",
                          ESP.getFreeHeap(), ESP.getMaxFreeBlockSize(), ESP.getHeapFragmentation());
        } else if (c == 'i' || c == 'I' || c == 's' || c == 'S') {
            Serial.println(F("\n=================================================="));
            Serial.println(F("              I2C HARDWARE BUS SCAN               "));
            Serial.println(F("=================================================="));
#if FEATURE_PCF8574
            struct PinPair { uint8_t sda; uint8_t scl; const char* name; };
            PinPair pairs[] = {
                { 4, 5, "SDA=D2 (GPIO 4), SCL=D1 (GPIO 5) [Standard NodeMCU I2C]" },
                { 5, 4, "SDA=D1 (GPIO 5), SCL=D2 (GPIO 4) [Reversed SDA/SCL]" },
                { 12, 14, "SDA=D6 (GPIO 12), SCL=D5 (GPIO 14)" },
                { 14, 12, "SDA=D5 (GPIO 14), SCL=D6 (GPIO 12)" },
                { 0, 2, "SDA=D3 (GPIO 0), SCL=D4 (GPIO 2)" },
                { 2, 0, "SDA=D4 (GPIO 2), SCL=D3 (GPIO 0)" }
            };

            bool anyFound = false;
            for (const auto& p : pairs) {
                std::vector<uint8_t> devs = Pcf8574Driver::getInstance().scanBus(p.sda, p.scl);
                if (!devs.empty()) {
                    anyFound = true;
                    Serial.printf("[I2C] >>> DEVICE FOUND on %s! Count: %u\n", p.name, (unsigned int)devs.size());
                    for (uint8_t a : devs) {
                        const char* type = (a >= 0x20 && a <= 0x27) ? "PCF8574 (Standard 8-Ch Expander)" :
                                           ((a >= 0x38 && a <= 0x3F) ? "PCF8574A (High-Address 8-Ch Expander)" :
                                           ((a == 0x3C || a == 0x3D) ? "OLED Display (SSD1306)" :
                                           ((a == 0x68) ? "RTC (DS3231/DS1307) or MPU6050" :
                                           ((a == 0x48) ? "ADS1115 ADC" : "Generic I2C Device"))));
                        Serial.printf("      * Address: 0x%02X (%u decimal) -> %s\n", a, a, type);
                    }
                    GpioManager::getInstance().setI2cConfig(true, p.sda, p.scl, devs[0]);
                    Serial.printf("[I2C] -> Configured & Saved to LittleFS (SDA=%u, SCL=%u, Addr=0x%02X)\n", p.sda, p.scl, devs[0]);
                }
            }
            if (!anyFound) {
                Serial.println(F("[I2C] No devices responded on any pin pairs."));
                Serial.println(F("Checklist:"));
                Serial.println(F("  1. VCC connected to 3.3V (or 5V for 5V I2C modules)?"));
                Serial.println(F("  2. GND connected securely to ESP GND?"));
                Serial.println(F("  3. SDA connected to D2 (GPIO 4)?"));
                Serial.println(F("  4. SCL connected to D1 (GPIO 5)?"));
            }
            Serial.println(F("==================================================\n"));
#else
            Serial.println(F("[I2C SCAN] FEATURE_PCF8574 is disabled."));
#endif
        }
    }

    yield();
}

#else
#include <Arduino.h>
#include "config.h"
#include "storage_manager.h"
#include "auth_manager.h"
#include "gpio_manager.h"
#include "wifi_manager.h"
#include "automation.h"
#include "ota_manager.h"
#include "web_server.h"
#include "receiver_client.h"
#if FEATURE_PCF8574
#include "drivers/pcf8574_driver.h"
#endif

// Hardware Reset Button State
unsigned long resetBtnPressStart = 0;
bool resetBtnPressed = false;

void checkResetButton() {
    // Only monitor physical factory reset if D3 is NOT assigned as a relay channel
    if (GpioManager::getInstance().isPinAssigned(FACTORY_RESET_PIN)) {
        return;
    }

    // NodeMCU FLASH button (D3 / GPIO 0) is pulled HIGH; pressing pulls to GND (LOW)
    if (digitalRead(FACTORY_RESET_PIN) == LOW) {
        if (!resetBtnPressed) {
            resetBtnPressed = true;
            resetBtnPressStart = millis();
        } else {
            unsigned long heldDuration = millis() - resetBtnPressStart;
            if (heldDuration >= FACTORY_RESET_HOLD_MS) {
                Serial.println(F("\n[RESET] Physical factory reset triggered via 5s button hold!"));
                
                // Rapidly blink onboard LED (D4 / GPIO 2) as visual feedback
                pinMode(ONBOARD_LED_PIN, OUTPUT);
                for (int i = 0; i < 10; i++) {
                    digitalWrite(ONBOARD_LED_PIN, (i % 2 == 0) ? LOW : HIGH);
                    delay(80);
                }

                WifiManager::getInstance().resetWifiCredentials();
                Serial.println(F("[RESET] Wi-Fi credentials erased. Rebooting..."));
                delay(500);
                ESP.restart();
            }
        }
    } else {
        resetBtnPressed = false;
        resetBtnPressStart = 0;
    }
}

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println();
    Serial.println(F("=================================================="));
    Serial.printf ("    %s v%s\n", FIRMWARE_NAME, FIRMWARE_VERSION);
    Serial.printf ("    Target: %s\n", HARDWARE_TARGET);
    Serial.println(F("=================================================="));

    // Configure Reset Button Pin with Internal Pull-Up
    pinMode(FACTORY_RESET_PIN, INPUT_PULLUP);
    pinMode(ONBOARD_LED_PIN, OUTPUT);
    digitalWrite(ONBOARD_LED_PIN, HIGH); // Off initially (Active-Low)

    // 1. Initialize Persistent Storage (LittleFS)
    if (!StorageManager::getInstance().begin()) {
        Serial.println(F("[FATAL] Flash storage initialization failed!"));
    }

    // 2. Initialize Authentication Subsystem
    AuthManager::getInstance().begin();

    // 3. Connect GPIO State Change Callback to Automation Engine & Central Receiver
    GpioManager::getInstance().registerStateChangeCallback([](uint8_t id, bool newState) {
        AutomationEngine::getInstance().notifyGpioStateChanged(id, newState);
        ReceiverClient::getInstance().onGpioStateChanged(id, newState);
    });

    // 4. Initialize Hardware GPIO Channels
    GpioManager::getInstance().begin();

    // 5. Initialize Wi-Fi Subsystem & Captive Portal
    WifiManager::getInstance().begin();

    // 6. Initialize Automation Rule Engine
    AutomationEngine::getInstance().begin();

    // 7. Initialize Central Receiver & Multi-Node Telemetry Client
    ReceiverClient::getInstance().begin();

    // 8. Initialize OTA Updates
    OtaManager::getInstance().begin(WifiManager::getInstance().getApSsid());

    // 9. Initialize Embedded Web Server & REST API
    WebServerManager::getInstance().begin();

    Serial.println(F("[INIT] SmartHome Controller is fully ready!"));
    Serial.printf ("[INIT] Setup Access Point IP: %s (SSID: %s)\n",
                   WiFi.softAPIP().toString().c_str(),
                   WifiManager::getInstance().getApSsid().c_str());
    if (WifiManager::getInstance().isSTAConnected()) {
        Serial.printf("[INIT] Home Router IP: %s\n", WiFi.localIP().toString().c_str());
    }
    Serial.printf("[INIT] Free Heap: %u bytes\n", ESP.getFreeHeap());
}

void loop() {
    // Run modular non-blocking subsystems
    WifiManager::getInstance().loop();
    WebServerManager::getInstance().loop();
    GpioManager::getInstance().loop();
    AutomationEngine::getInstance().loop();
    ReceiverClient::getInstance().loop();
    OtaManager::getInstance().loop();

    // Physical recovery reset button monitor
    checkResetButton();

    if (Serial.available()) {
        char c = Serial.read();
        if (c == 'h' || c == 'H') {
            Serial.printf("[HEAP] Free: %u bytes, Max Block: %u bytes, Frag: %u%%\n",
                          ESP.getFreeHeap(), ESP.getMaxFreeBlockSize(), ESP.getHeapFragmentation());
        } else if (c == 'i' || c == 'I' || c == 's' || c == 'S') {
            Serial.println(F("\n=================================================="));
            Serial.println(F("              I2C HARDWARE BUS SCAN               "));
            Serial.println(F("=================================================="));
#if FEATURE_PCF8574
            struct PinPair { uint8_t sda; uint8_t scl; const char* name; };
            PinPair pairs[] = {
                { 4, 5, "SDA=D2 (GPIO 4), SCL=D1 (GPIO 5) [Standard NodeMCU I2C]" },
                { 5, 4, "SDA=D1 (GPIO 5), SCL=D2 (GPIO 4) [Reversed SDA/SCL]" },
                { 12, 14, "SDA=D6 (GPIO 12), SCL=D5 (GPIO 14)" },
                { 14, 12, "SDA=D5 (GPIO 14), SCL=D6 (GPIO 12)" },
                { 0, 2, "SDA=D3 (GPIO 0), SCL=D4 (GPIO 2)" },
                { 2, 0, "SDA=D4 (GPIO 2), SCL=D3 (GPIO 0)" }
            };

            bool anyFound = false;
            for (const auto& p : pairs) {
                std::vector<uint8_t> devs = Pcf8574Driver::getInstance().scanBus(p.sda, p.scl);
                if (!devs.empty()) {
                    anyFound = true;
                    Serial.printf("[I2C] >>> DEVICE FOUND on %s! Count: %u\n", p.name, (unsigned int)devs.size());
                    for (uint8_t a : devs) {
                        const char* type = (a >= 0x20 && a <= 0x27) ? "PCF8574 (Standard 8-Ch Expander)" :
                                           ((a >= 0x38 && a <= 0x3F) ? "PCF8574A (High-Address 8-Ch Expander)" :
                                           ((a == 0x3C || a == 0x3D) ? "OLED Display (SSD1306)" :
                                           ((a == 0x68) ? "RTC (DS3231/DS1307) or MPU6050" :
                                           ((a == 0x48) ? "ADS1115 ADC" : "Generic I2C Device"))));
                        Serial.printf("      * Address: 0x%02X (%u decimal) -> %s\n", a, a, type);
                    }
                    GpioManager::getInstance().setI2cConfig(true, p.sda, p.scl, devs[0]);
                    Serial.printf("[I2C] -> Configured & Saved to LittleFS (SDA=%u, SCL=%u, Addr=0x%02X)\n", p.sda, p.scl, devs[0]);
                }
            }
            if (!anyFound) {
                Serial.println(F("[I2C] No devices responded on any pin pairs."));
                Serial.println(F("Checklist:"));
                Serial.println(F("  1. VCC connected to 3.3V (or 5V for 5V I2C modules)?"));
                Serial.println(F("  2. GND connected securely to ESP GND?"));
                Serial.println(F("  3. SDA connected to D2 (GPIO 4)?"));
                Serial.println(F("  4. SCL connected to D1 (GPIO 5)?"));
            }
            Serial.println(F("==================================================\n"));
#else
            Serial.println(F("[I2C SCAN] FEATURE_PCF8574 is disabled."));
#endif
        }
    }

    yield();
}

#endif
