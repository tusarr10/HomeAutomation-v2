#ifndef BOARD_PINS_H
#define BOARD_PINS_H

#include <Arduino.h>

// Structure for Pin Metadata and Safety Validation
struct PinSafetyInfo {
    uint8_t gpio;
    const char* label;
    bool isSafeRelay;
    bool isBootSensitive;
    const char* bootNote;
};

// =============================================================================
// TARGET 1: ESP-01 / ESP-01S (1MB Flash)
// =============================================================================
#if defined(TARGET_ESP01_1M)
#define FIRMWARE_NAME           "SmartHome-ESP01"
#define FIRMWARE_VERSION        "1.6.0"
#define HARDWARE_TARGET         "ESP8266 ESP-01 / ESP-01S (1MB)"
#define DEFAULT_AP_SSID         "SmartHome-ESP01"

#define ESP01_GPIO0             0   // Pin 5: Boot pin / Relay 1 Output
#define ESP01_GPIO2             2   // Pin 3: Boot pin / Relay 2 Output / ESP-01S Blue LED
#define ESP01_GPIO3_RX          3   // Pin 8: UART0 RX / Optional GPIO
#define ESP01_GPIO1_TX          1   // Pin 1: UART0 TX / Optional GPIO

#ifndef D3
#define D3 0
#define D4 2
#define RX 3
#define TX 1
#endif

#define FACTORY_RESET_PIN       255 // Disabled on ESP-01 to protect GPIO 0
#define ONBOARD_LED_PIN         ESP01_GPIO2
#define MAX_GPIO_CHANNELS       4

static const PinSafetyInfo PIN_SAFETY_MAP[] = {
    { ESP01_GPIO0,    "GPIO 0 (Relay 1)",       true, true,  "Boot pin (must be HIGH at boot). Standard ESP-01 relay control pin." },
    { ESP01_GPIO2,    "GPIO 2 (Relay 2 / LED)", true, true,  "Boot pin (must be HIGH at boot). ESP-01S onboard LED / Relay 2." },
    { ESP01_GPIO3_RX, "GPIO 3 (RX / Input)",    true, false, "UART0 RX. Can be used as input or relay if Serial is disabled." },
    { ESP01_GPIO1_TX, "GPIO 1 (TX / Output)",   true, false, "UART0 TX. Can be used as relay output if Serial is disabled." }
};

// =============================================================================
// TARGET 2: ESP-01 + PCF8574T I2C Expander (1MB Flash)
// =============================================================================
#elif defined(TARGET_ESP01_PCF8574)
#define FIRMWARE_NAME           "SmartHome-ESP01-PCF8574"
#define FIRMWARE_VERSION        "1.6.0"
#define HARDWARE_TARGET         "ESP8266 ESP-01 + PCF8574T (1MB)"
#define DEFAULT_AP_SSID         "SmartHome-ESP01-PCF8574"

#define ESP01_GPIO0             0   // Pin 5: Boot pin / Default I2C SDA
#define ESP01_GPIO2             2   // Pin 3: Boot pin / Default I2C SCL / ESP-01S Blue LED
#define ESP01_GPIO3_RX          3   // Pin 8: UART0 RX
#define ESP01_GPIO1_TX          1   // Pin 1: UART0 TX

#define ESP01_I2C_SDA           ESP01_GPIO0
#define ESP01_I2C_SCL           ESP01_GPIO2
#define PCF8574_DEFAULT_ADDR    0x27
#define PCF_PIN_BASE            100
#define IS_PCF_PIN(p)           ((p) >= PCF_PIN_BASE && (p) <= (PCF_PIN_BASE + 7))
#define PCF_PIN_INDEX(p)        ((p) - PCF_PIN_BASE)

#ifndef D3
#define D3 0
#define D4 2
#define RX 3
#define TX 1
#endif

#define FACTORY_RESET_PIN       255
#define ONBOARD_LED_PIN         ESP01_GPIO2
#define MAX_GPIO_CHANNELS       12

static const PinSafetyInfo PIN_SAFETY_MAP[] = {
    { 100,            "P0 (PCF8574 Relay 1)",   true,  false, "I2C Expander Pin P0 (Safe isolated relay output)" },
    { 101,            "P1 (PCF8574 Relay 2)",   true,  false, "I2C Expander Pin P1 (Safe isolated relay output)" },
    { 102,            "P2 (PCF8574 Relay 3)",   true,  false, "I2C Expander Pin P2 (Safe isolated relay output)" },
    { 103,            "P3 (PCF8574 Relay 4)",   true,  false, "I2C Expander Pin P3 (Safe isolated relay output)" },
    { 104,            "P4 (PCF8574 Relay 5)",   true,  false, "I2C Expander Pin P4 (Safe isolated relay output)" },
    { 105,            "P5 (PCF8574 Relay 6)",   true,  false, "I2C Expander Pin P5 (Safe isolated relay output)" },
    { 106,            "P6 (PCF8574 Relay 7)",   true,  false, "I2C Expander Pin P6 (Safe isolated relay output)" },
    { 107,            "P7 (PCF8574 Relay 8)",   true,  false, "I2C Expander Pin P7 (Safe isolated relay output)" },
    { ESP01_GPIO0,    "GPIO 0 (I2C SDA)",       false, true,  "Dedicated I2C SDA bus for PCF8574T (must be HIGH at boot)" },
    { ESP01_GPIO2,    "GPIO 2 (I2C SCL / LED)", false, true,  "Dedicated I2C SCL bus for PCF8574T (must be HIGH at boot)" },
    { ESP01_GPIO3_RX, "GPIO 3 (RX / Input)",    true,  false, "UART0 RX / Input (Safe when serial detached)" },
    { ESP01_GPIO1_TX, "GPIO 1 (TX / Output)",   true,  false, "UART0 TX / Output (Safe when serial detached)" }
};

// =============================================================================
// TARGET 3: NodeMCU / D1 Mini + PCF8574T I2C Expander (4MB Flash)
// =============================================================================
#elif defined(TARGET_NODEMCU_PCF8574)
#define FIRMWARE_NAME           "SmartHome-NodeMCU-PCF8574"
#define FIRMWARE_VERSION        "1.6.0"
#define HARDWARE_TARGET         "ESP8266 NodeMCU + PCF8574T"
#define DEFAULT_AP_SSID         "SmartHome-NodeMCU-PCF8574"

#ifndef D0
#define D0 16
#define D1 5
#define D2 4
#define D3 0
#define D4 2
#define D5 14
#define D6 12
#define D7 13
#define D8 15
#define RX 3
#define TX 1
#endif

#define NODEMCU_I2C_SDA         D2
#define NODEMCU_I2C_SCL         D1
#define PCF8574_DEFAULT_ADDR    0x27
#define PCF_PIN_BASE            100
#define IS_PCF_PIN(p)           ((p) >= PCF_PIN_BASE && (p) <= (PCF_PIN_BASE + 7))
#define PCF_PIN_INDEX(p)        ((p) - PCF_PIN_BASE)

#define FACTORY_RESET_PIN       D3
#define ONBOARD_LED_PIN         D4
#define MAX_GPIO_CHANNELS       16

static const PinSafetyInfo PIN_SAFETY_MAP[] = {
    { 100, "P0 (PCF8574 Relay 1)", true,  false, "I2C Expander Pin P0 (Safe isolated relay output)" },
    { 101, "P1 (PCF8574 Relay 2)", true,  false, "I2C Expander Pin P1 (Safe isolated relay output)" },
    { 102, "P2 (PCF8574 Relay 3)", true,  false, "I2C Expander Pin P2 (Safe isolated relay output)" },
    { 103, "P3 (PCF8574 Relay 4)", true,  false, "I2C Expander Pin P3 (Safe isolated relay output)" },
    { 104, "P4 (PCF8574 Relay 5)", true,  false, "I2C Expander Pin P4 (Safe isolated relay output)" },
    { 105, "P5 (PCF8574 Relay 6)", true,  false, "I2C Expander Pin P5 (Safe isolated relay output)" },
    { 106, "P6 (PCF8574 Relay 7)", true,  false, "I2C Expander Pin P6 (Safe isolated relay output)" },
    { 107, "P7 (PCF8574 Relay 8)", true,  false, "I2C Expander Pin P7 (Safe isolated relay output)" },
    { D1,  "D1 (GPIO5 / SCL)",     false, false, "Dedicated I2C SCL bus for PCF8574T" },
    { D2,  "D2 (GPIO4 / SDA)",     false, false, "Dedicated I2C SDA bus for PCF8574T" },
    { D5,  "D5 (GPIO14)",          true,  false, "Safe SPI CLK, boot-neutral" },
    { D6,  "D6 (GPIO12)",          true,  false, "Safe SPI MISO, boot-neutral" },
    { D7,  "D7 (GPIO13)",          true,  false, "Safe SPI MOSI, boot-neutral" },
    { D0,  "D0 (GPIO16)",          true,  true,  "WAKE pin, HIGH at boot" },
    { D8,  "D8 (GPIO15)",          true,  true,  "Boot config (pulled LOW), must be LOW at boot" },
    { D3,  "D3 (GPIO0)",           true,  true,  "Boot config (Flash button), must be HIGH at boot" },
    { D4,  "D4 (GPIO2)",           true,  true,  "Boot config (TXD1/LED), must be HIGH at boot" }
};

// =============================================================================
// TARGET 4: ESP32 Target
// =============================================================================
#elif defined(TARGET_ESP32)
#define FIRMWARE_NAME           "SmartHome-ESP32"
#define FIRMWARE_VERSION        "1.6.0"
#define HARDWARE_TARGET         "ESP32 Dev Module"
#define DEFAULT_AP_SSID         "SmartHome-ESP32"

#define FACTORY_RESET_PIN       0
#define ONBOARD_LED_PIN         2
#define MAX_GPIO_CHANNELS       16

static const PinSafetyInfo PIN_SAFETY_MAP[] = {
    { 23, "GPIO 23", true,  false, "Safe general GPIO" },
    { 22, "GPIO 22", true,  false, "Safe I2C SCL or general GPIO" },
    { 21, "GPIO 21", true,  false, "Safe I2C SDA or general GPIO" },
    { 19, "GPIO 19", true,  false, "Safe general GPIO" },
    { 18, "GPIO 18", true,  false, "Safe general GPIO" },
    { 5,  "GPIO 5",  true,  true,  "Outputs PWM at boot" },
    { 4,  "GPIO 4",  true,  false, "Safe general GPIO" },
    { 2,  "GPIO 2",  true,  true,  "Onboard LED / Strapping pin" }
};

// =============================================================================
// TARGET 5: Standard ESP8266 (ESP-12E/F) NodeMCU / D1 Mini (4MB Flash) - DEFAULT
// =============================================================================
#else
#ifndef TARGET_ESP8266_4M
#define TARGET_ESP8266_4M       1
#endif
#define FIRMWARE_NAME           "SmartHome-NodeMCU"
#define FIRMWARE_VERSION        "1.6.0"
#define HARDWARE_TARGET         "ESP8266 (ESP-12E/F) NodeMCU"
#define DEFAULT_AP_SSID         "SmartHome-Setup"

#ifndef D0
#define D0 16
#define D1 5
#define D2 4
#define D3 0
#define D4 2
#define D5 14
#define D6 12
#define D7 13
#define D8 15
#define RX 3
#define TX 1
#endif
#ifndef SD2
#define SD2 9
#endif
#ifndef SD3
#define SD3 10
#endif

#define PCF_PIN_BASE            100
#define IS_PCF_PIN(p)           ((p) >= PCF_PIN_BASE && (p) <= (PCF_PIN_BASE + 7))
#define PCF_PIN_INDEX(p)        ((p) - PCF_PIN_BASE)
#define NODEMCU_I2C_SDA         D2
#define NODEMCU_I2C_SCL         D1
#define PCF8574_DEFAULT_ADDR    0x27

#define FACTORY_RESET_PIN       D3
#define ONBOARD_LED_PIN         D4
#define MAX_GPIO_CHANNELS       16

static const PinSafetyInfo PIN_SAFETY_MAP[] = {
    { 100, "P0 (PCF8574 Relay 1)", true,  false, "I2C Expander Pin P0 (Safe isolated relay output)" },
    { 101, "P1 (PCF8574 Relay 2)", true,  false, "I2C Expander Pin P1 (Safe isolated relay output)" },
    { 102, "P2 (PCF8574 Relay 3)", true,  false, "I2C Expander Pin P2 (Safe isolated relay output)" },
    { 103, "P3 (PCF8574 Relay 4)", true,  false, "I2C Expander Pin P3 (Safe isolated relay output)" },
    { 104, "P4 (PCF8574 Relay 5)", true,  false, "I2C Expander Pin P4 (Safe isolated relay output)" },
    { 105, "P5 (PCF8574 Relay 6)", true,  false, "I2C Expander Pin P5 (Safe isolated relay output)" },
    { 106, "P6 (PCF8574 Relay 7)", true,  false, "I2C Expander Pin P6 (Safe isolated relay output)" },
    { 107, "P7 (PCF8574 Relay 8)", true,  false, "I2C Expander Pin P7 (Safe isolated relay output)" },
    { D1,  "D1 (GPIO5)",   true,  false, "Safe I2C SCL, boot-neutral" },
    { D2,  "D2 (GPIO4)",   true,  false, "Safe I2C SDA, boot-neutral" },
    { D5,  "D5 (GPIO14)",  true,  false, "Safe SPI CLK, boot-neutral" },
    { D6,  "D6 (GPIO12)",  true,  false, "Safe SPI MISO, boot-neutral" },
    { D7,  "D7 (GPIO13)",  true,  false, "Safe SPI MOSI, boot-neutral" },
    { D0,  "D0 (GPIO16)",  true,  true,  "WAKE pin, HIGH at boot" },
    { D8,  "D8 (GPIO15)",  true,  true,  "Boot config (pulled LOW), must be LOW at boot" },
    { D3,  "D3 (GPIO0)",   true,  true,  "Boot config (Flash button), must be HIGH at boot" },
    { D4,  "D4 (GPIO2)",   true,  true,  "Boot config (TXD1/LED), must be HIGH at boot" },
    { RX,  "RX (GPIO3)",   true,  true,  "UART0 RX, serial debug input" },
    { TX,  "TX (GPIO1)",   true,  true,  "UART0 TX, serial debug output (HIGH at boot)" },
    { SD2, "SD2 (GPIO9)",  true,  true,  "Flash IO SD2 (usable in DIO/DOUT mode)" },
    { SD3, "SD3 (GPIO10)", true,  true,  "Flash IO SD3 (usable in DIO/DOUT mode)" }
};

#endif

static const size_t PIN_SAFETY_MAP_COUNT = sizeof(PIN_SAFETY_MAP) / sizeof(PIN_SAFETY_MAP[0]);

#endif // BOARD_PINS_H
