#include "pcf8574_driver.h"

#if FEATURE_PCF8574

Pcf8574Driver::Pcf8574Driver()
    : _detected(false),
      _i2cAddress(PCF8574_DEFAULT_ADDR),
      _outputByte(0xFF), // 0xFF: all pins HIGH (active-low relays de-energized / OFF)
      _sdaPin(DEFAULT_I2C_SDA),
      _sclPin(DEFAULT_I2C_SCL) {}

Pcf8574Driver& Pcf8574Driver::getInstance() {
    static Pcf8574Driver instance;
    return instance;
}

void Pcf8574Driver::resetBus(uint8_t sdaPin, uint8_t sclPin) {
    pinMode(sdaPin, INPUT_PULLUP);
    pinMode(sclPin, INPUT_PULLUP);
    delayMicroseconds(50);

    // If both lines are already HIGH, bus is free and healthy: no recovery needed
    if (digitalRead(sdaPin) == HIGH && digitalRead(sclPin) == HIGH) {
        return;
    }

    // Bus lines are held low (slave stuck during reboot). Clock SCL up to 9 times.
    pinMode(sclPin, OUTPUT);
    for (uint8_t i = 0; i < 9; i++) {
        digitalWrite(sclPin, LOW);
        delayMicroseconds(10);
        digitalWrite(sclPin, HIGH);
        delayMicroseconds(10);
        if (digitalRead(sdaPin) == HIGH) {
            break;
        }
    }

    // Generate clean STOP condition
    pinMode(sdaPin, OUTPUT);
    digitalWrite(sclPin, LOW);
    digitalWrite(sdaPin, LOW);
    delayMicroseconds(10);
    digitalWrite(sclPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(sdaPin, HIGH);
    delayMicroseconds(10);

    pinMode(sdaPin, INPUT_PULLUP);
    pinMode(sclPin, INPUT_PULLUP);
    delayMicroseconds(50);
}

uint8_t Pcf8574Driver::scanAddress(uint8_t preferredAddr) {
    // 1. Probe preferred address first (if valid)
    if (preferredAddr >= 0x08 && preferredAddr <= 0x77) {
        Wire.beginTransmission(preferredAddr);
        if (Wire.endTransmission() == 0) {
            return preferredAddr;
        }
        delayMicroseconds(25);
    }

    // 2. Scan standard PCF8574 range (0x20 to 0x27)
    for (uint8_t addr = 0x20; addr <= 0x27; addr++) {
        if (addr == preferredAddr) continue;
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            return addr;
        }
        delayMicroseconds(25);
    }

    // 3. Scan PCF8574A range (0x38 to 0x3F)
    for (uint8_t addr = 0x38; addr <= 0x3F; addr++) {
        if (addr == preferredAddr) continue;
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            return addr;
        }
        delayMicroseconds(25);
    }

    return 0; // Not detected
}

bool Pcf8574Driver::probe(uint8_t addr) {
    if (addr == 0) addr = _i2cAddress;
    uint8_t found = scanAddress(addr);
    if (found != 0) {
        _i2cAddress = found;
        _detected = true;
        return true;
    }
    _detected = false;
    return false;
}

bool Pcf8574Driver::begin(uint8_t sdaPin, uint8_t sclPin, uint8_t defaultAddr) {
    _sdaPin = sdaPin;
    _sclPin = sclPin;

    // Bus recovery to ensure any stuck state from soft reboot is cleared
    resetBus(_sdaPin, _sclPin);

    Wire.begin(_sdaPin, _sclPin);
    Wire.setClock(100000); // 100 kHz standard I2C clock
    delayMicroseconds(50);

    uint8_t foundAddr = scanAddress(defaultAddr);
    if (foundAddr != 0) {
        _i2cAddress = foundAddr;
        _detected = true;
        Serial.printf_P(PSTR("[PCF8574] Expander detected at I2C address 0x%02X (SDA=GPIO%u, SCL=GPIO%u)\n"),
                      _i2cAddress, _sdaPin, _sclPin);
        // Apply initial output state (0xFF = all HIGH / relays de-energized)
        writeByte(_outputByte);
    } else {
        _i2cAddress = defaultAddr;
        _detected = false;
        Serial.printf_P(PSTR("[PCF8574] Warning: No PCF8574 found at 0x%02X (SDA=GPIO%u, SCL=GPIO%u). Will retry on access.\n"),
                      defaultAddr, _sdaPin, _sclPin);
    }

    return _detected;
}

bool Pcf8574Driver::writeByte(uint8_t byteVal) {
    _outputByte = byteVal;
    Wire.beginTransmission(_i2cAddress);
    Wire.write(_outputByte);
    uint8_t err = Wire.endTransmission();
    if (err == 0) {
        _detected = true;
        return true;
    } else {
        // Attempt quick rediscovery if previously lost or hung
        uint8_t recheck = scanAddress(_i2cAddress);
        if (recheck != 0) {
            _i2cAddress = recheck;
            _detected = true;
            Wire.beginTransmission(_i2cAddress);
            Wire.write(_outputByte);
            return (Wire.endTransmission() == 0);
        }
        _detected = false;
        return false;
    }
}

bool Pcf8574Driver::setPin(uint8_t pinIndex, bool physicalLevel) {
    if (pinIndex > 7) return false;

    if (physicalLevel) {
        _outputByte |= (1 << pinIndex);   // HIGH
    } else {
        _outputByte &= ~(1 << pinIndex);  // LOW
    }

    return writeByte(_outputByte);
}

bool Pcf8574Driver::getPin(uint8_t pinIndex) const {
    if (pinIndex > 7) return false;
    return (_outputByte & (1 << pinIndex)) != 0;
}

uint8_t Pcf8574Driver::readInputs() {
    Wire.requestFrom(_i2cAddress, (uint8_t)1);
    if (Wire.available()) {
        return Wire.read();
    }
    return _outputByte;
}

std::vector<uint8_t> Pcf8574Driver::scanBus(uint8_t sdaPin, uint8_t sclPin) {
    std::vector<uint8_t> found;
    resetBus(sdaPin, sclPin);
    Wire.begin(sdaPin, sclPin);
    Wire.setClock(100000);
    delayMicroseconds(50);

    for (uint8_t addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            found.push_back(addr);
            if ((addr >= 0x20 && addr <= 0x27) || (addr >= 0x38 && addr <= 0x3F)) {
                _i2cAddress = addr;
                _detected = true;
            }
        }
        delayMicroseconds(20);
    }
    return found;
}

bool Pcf8574Driver::reinit(uint8_t sdaPin, uint8_t sclPin, uint8_t defaultAddr) {
    return begin(sdaPin, sclPin, defaultAddr);
}

#endif // FEATURE_PCF8574
