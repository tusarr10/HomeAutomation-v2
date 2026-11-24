#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <vector>

#define FILE_IR_CODES "/config/ir_codes.json"

struct IrButton {
    String remoteName;
    String buttonName;
    String protocol;
    String hexCode;
    uint16_t bits;
    uint8_t repeat;
};

class IrManager {
public:
    static IrManager& getInstance();

    bool begin();
    void loop();

    void setReceiverPin(uint8_t pin);
    void setTransmitterPin(uint8_t pin);

    uint8_t getReceiverPin() const { return _rxPin; }
    uint8_t getTransmitterPin() const { return _txPin; }
    bool isReceiverActive() const { return _rxPin != 255; }
    bool isTransmitterActive() const { return _txPin != 255; }

    // Training / Learning Mode
    void startTraining(unsigned long timeoutSec = 25);
    void stopTraining();
    bool isTraining() const { return _isTraining; }
    bool hasTrainingResult() const { return _trainingSuccess; }

    // Last captured code info
    bool getLastCaptured(String& protocol, String& hexCode, uint16_t& bits, unsigned long& ageMs) const;
    void clearLastCaptured();

    // Transmission
    bool transmit(uint8_t pin, const String& protocol, const String& hexCode, uint16_t bits, uint8_t repeat = 0);
    bool transmitButton(const String& remoteName, const String& buttonName);

    // Stored Remotes & Buttons in LittleFS
    bool loadCodesFromStorage();
    bool saveCodesToStorage();
    bool saveButton(const String& remoteName, const String& buttonName, const String& protocol, const String& hexCode, uint16_t bits, uint8_t repeat = 0);
    bool deleteButton(const String& remoteName, const String& buttonName);
    bool deleteRemote(const String& remoteName);
    void getRemotesJson(JsonArray& arr);

private:
    IrManager();
    ~IrManager();

    uint8_t _rxPin;
    uint8_t _txPin;

    void* _irrecvPtr;
    void* _irsendPtr;
    void* _resultsPtr;

    bool _isTraining;
    bool _trainingSuccess;
    unsigned long _trainingDeadline;

    String _lastProtocol;
    String _lastHexCode;
    uint16_t _lastBits;
    unsigned long _lastCaptureTime;
    bool _hasCaptured;

    std::vector<IrButton> _buttons;
};
