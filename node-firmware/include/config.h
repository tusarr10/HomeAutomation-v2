#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include "board_pins.h"

// Default Access Point Settings
#define DEFAULT_AP_PASS         "smarthome1234"  // Default WPA2 security for captive AP
#define DEFAULT_AP_CHANNEL      1
#define DEFAULT_AP_IP           IPAddress(192, 168, 4, 1)
#define DEFAULT_AP_SUBNET       IPAddress(255, 255, 255, 0)
#define DNS_PORT                53

// Default Administrative Credentials
#define DEFAULT_ADMIN_USER      "admin"
#define DEFAULT_ADMIN_PASS      "admin"

// Wi-Fi Connection Modes
enum WifiSystemMode {
    WIFI_MODE_AP_ONLY     = 0,
    WIFI_MODE_ROUTER_ONLY = 1,
    WIFI_MODE_AP_ROUTER   = 2   // Default
};

// Storage Paths in LittleFS
#define FILE_SYSTEM_CONFIG      "/config/system.json"
#define FILE_WIFI_CONFIG        "/config/wifi.json"
#define FILE_GPIO_CONFIG        "/config/gpio.json"
#define FILE_RULES_CONFIG       "/config/rules.json"
#define FILE_RECEIVER_CONFIG    "/config/receiver.json"
#define FILE_I2C_CONFIG         "/config/i2c.json"

// Physical Button Timing
#define FACTORY_RESET_HOLD_MS   5000

// System Constraints
#define MAX_AUTOMATION_RULES    10
#define LOG_BUFFER_CAPACITY     50
#define SESSION_TIMEOUT_SEC     3600
#define STA_CONNECT_TIMEOUT_MS  20000

#endif // CONFIG_H
