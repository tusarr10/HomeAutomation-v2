#include "ir_manager.h"
#include "storage_manager.h"
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>

IrManager::IrManager()
    : _rxPin(255), _txPin(255),
      _irrecvPtr(nullptr), _irsendPtr(nullptr), _resultsPtr(nullptr),
      _isTraining(false), _trainingSuccess(false), _trainingDeadline(0),
      _lastBits(0), _lastCaptureTime(0), _hasCaptured(false) {
    _resultsPtr = new decode_results();
}

IrManager::~IrManager() {
    if (_irrecvPtr) {
        IRrecv* recv = static_cast<IRrecv*>(_irrecvPtr);
        recv->disableIRIn();
        delete recv;
    }
    if (_irsendPtr) {
        delete static_cast<IRsend*>(_irsendPtr);
    }
    if (_resultsPtr) {
        delete static_cast<decode_results*>(_resultsPtr);
    }
}

IrManager& IrManager::getInstance() {
    static IrManager instance;
    return instance;
}

bool IrManager::begin() {
    loadCodesFromStorage();
    Serial.printf("[IR] Engine initialized. Loaded %u saved remote button(s).\n", (unsigned int)_buttons.size());
    return true;
}

void IrManager::setReceiverPin(uint8_t pin) {
    if (pin > 16) return;
    if (_rxPin == pin && _irrecvPtr != nullptr) return;

    if (_irrecvPtr) {
        IRrecv* oldRecv = static_cast<IRrecv*>(_irrecvPtr);
        oldRecv->disableIRIn();
        delete oldRecv;
        _irrecvPtr = nullptr;
    }

    _rxPin = pin;
    pinMode(_rxPin, INPUT_PULLUP);
    IRrecv* newRecv = new IRrecv(_rxPin, 50, 15, true);
    newRecv->enableIRIn(true);
    _irrecvPtr = newRecv;

    Serial.printf("[IR] Receiver active on GPIO%u (D%s)\n", _rxPin, (_rxPin == 14) ? "5" : String(_rxPin).c_str());
}

void IrManager::setTransmitterPin(uint8_t pin) {
    if (pin > 16) return;
    if (_txPin == pin && _irsendPtr != nullptr) return;

    if (_irsendPtr) {
        delete static_cast<IRsend*>(_irsendPtr);
        _irsendPtr = nullptr;
    }

    _txPin = pin;
    IRsend* newSend = new IRsend(_txPin);
    newSend->begin();
    _irsendPtr = newSend;

    Serial.printf("[IR] Transmitter active on GPIO%u (D%s)\n", _txPin, (_txPin == 13) ? "7" : String(_txPin).c_str());
}

void IrManager::loop() {
    unsigned long now = millis();

    // Check training timeout
    if (_isTraining && now > _trainingDeadline) {
        _isTraining = false;
        Serial.println(F("[IR] Training window timed out."));
    }

    if (!_irrecvPtr) return;
    IRrecv* recv = static_cast<IRrecv*>(_irrecvPtr);
    decode_results* results = static_cast<decode_results*>(_resultsPtr);

    if (recv->decode(results)) {
        // Filter out false noise / 0 bits unless unknown
        if (results->bits > 0 || results->decode_type != UNKNOWN) {
            _lastProtocol = typeToString(results->decode_type);
            _lastHexCode = resultToHexidecimal(results);
            _lastBits = results->bits;
            _lastCaptureTime = now;
            _hasCaptured = true;

            Serial.printf("[IR] Intercepted %s Code: %s (%u bits)\n",
                          _lastProtocol.c_str(), _lastHexCode.c_str(), _lastBits);

            if (_isTraining) {
                _trainingSuccess = true;
                _isTraining = false;
                Serial.printf("[IR] Training captured: %s %s (%u bits)\n",
                              _lastProtocol.c_str(), _lastHexCode.c_str(), _lastBits);
            }
        }
        recv->resume();
    }
}

void IrManager::startTraining(unsigned long timeoutSec) {
    if (timeoutSec == 0 || timeoutSec > 60) timeoutSec = 25;
    _isTraining = true;
    _trainingSuccess = false;
    _trainingDeadline = millis() + (timeoutSec * 1000);
    Serial.printf("[IR] Started training mode for %lu seconds...\n", timeoutSec);
}

void IrManager::stopTraining() {
    _isTraining = false;
}

bool IrManager::getLastCaptured(String& protocol, String& hexCode, uint16_t& bits, unsigned long& ageMs) const {
    if (!_hasCaptured) return false;
    protocol = _lastProtocol;
    hexCode = _lastHexCode;
    bits = _lastBits;
    ageMs = millis() - _lastCaptureTime;
    return true;
}

void IrManager::clearLastCaptured() {
    _hasCaptured = false;
    _trainingSuccess = false;
    _lastProtocol = "";
    _lastHexCode = "";
    _lastBits = 0;
}

bool IrManager::transmit(uint8_t pin, const String& protocol, const String& hexCode, uint16_t bits, uint8_t repeat) {
    if (pin > 16) {
        if (_txPin <= 16) pin = _txPin;
        else return false;
    }

    if (_txPin != pin || !_irsendPtr) {
        setTransmitterPin(pin);
    }

    IRsend* sender = static_cast<IRsend*>(_irsendPtr);
    if (!sender) return false;

    // Convert hex string e.g. "0xE0E040BF" or "E0E040BF" to uint64_t
    String cleanHex = hexCode;
    if (cleanHex.startsWith("0x") || cleanHex.startsWith("0X")) {
        cleanHex = cleanHex.substring(2);
    }
    uint64_t code = strtoull(cleanHex.c_str(), nullptr, 16);

    Serial.printf("[IR] Blasting on Pin GPIO%u: Protocol=%s, Code=0x%s, Bits=%u, Repeat=%u\n",
                  _txPin, protocol.c_str(), cleanHex.c_str(), bits, repeat);

    if (protocol.equalsIgnoreCase("NEC")) {
        sender->sendNEC(code, (bits > 0) ? bits : kNECBits, repeat);
    } else if (protocol.equalsIgnoreCase("SAMSUNG")) {
        sender->sendSAMSUNG(code, (bits > 0) ? bits : kSamsungBits, repeat);
    } else if (protocol.equalsIgnoreCase("SONY")) {
        sender->sendSony(code, (bits > 0) ? bits : kSony20Bits, repeat);
    } else if (protocol.equalsIgnoreCase("RC5")) {
        sender->sendRC5(code, (bits > 0) ? bits : kRC5XBits, repeat);
    } else if (protocol.equalsIgnoreCase("PANASONIC")) {
        sender->sendPanasonic64(code, (bits > 0) ? bits : kPanasonicBits, repeat);
    } else if (protocol.equalsIgnoreCase("LG")) {
        sender->sendLG(code, (bits > 0) ? bits : kLgBits, repeat);
    } else {
        // Fallback default to NEC 32-bit
        sender->sendNEC(code, (bits > 0) ? bits : 32, repeat);
    }

    // Re-enable receiver if receiver was sharing the same interrupt or timer
    if (_irrecvPtr) {
        static_cast<IRrecv*>(_irrecvPtr)->enableIRIn(true);
    }

    return true;
}

bool IrManager::transmitButton(const String& remoteName, const String& buttonName) {
    for (const auto& btn : _buttons) {
        if (btn.remoteName.equalsIgnoreCase(remoteName) && btn.buttonName.equalsIgnoreCase(buttonName)) {
            return transmit(_txPin, btn.protocol, btn.hexCode, btn.bits, btn.repeat);
        }
    }
    return false;
}

bool IrManager::loadCodesFromStorage() {
    DynamicJsonDocument doc(2048);
    if (!StorageManager::getInstance().loadJsonFile(FILE_IR_CODES, doc)) {
        return false;
    }

    _buttons.clear();
    JsonArray remotes = doc["remotes"].as<JsonArray>();
    for (JsonObject rem : remotes) {
        String rName = rem["name"] | "";
        JsonArray btns = rem["buttons"].as<JsonArray>();
        for (JsonObject b : btns) {
            IrButton btn;
            btn.remoteName = rName;
            btn.buttonName = b["name"] | "";
            btn.protocol = b["protocol"] | "NEC";
            btn.hexCode = b["hexCode"] | "";
            btn.bits = b["bits"] | 32;
            btn.repeat = b["repeat"] | 0;
            _buttons.push_back(btn);
        }
    }
    return true;
}

bool IrManager::saveCodesToStorage() {
    DynamicJsonDocument doc(2048);
    JsonArray remotes = doc.createNestedArray("remotes");

    // Group buttons by remoteName
    std::vector<String> uniqueRemotes;
    for (const auto& b : _buttons) {
        bool exists = false;
        for (const auto& u : uniqueRemotes) {
            if (u.equalsIgnoreCase(b.remoteName)) { exists = true; break; }
        }
        if (!exists) uniqueRemotes.push_back(b.remoteName);
    }

    for (const auto& rName : uniqueRemotes) {
        JsonObject rem = remotes.createNestedObject();
        rem["name"] = rName;
        JsonArray bArr = rem.createNestedArray("buttons");
        for (const auto& b : _buttons) {
            if (b.remoteName.equalsIgnoreCase(rName)) {
                JsonObject btnObj = bArr.createNestedObject();
                btnObj["name"] = b.buttonName;
                btnObj["protocol"] = b.protocol;
                btnObj["hexCode"] = b.hexCode;
                btnObj["bits"] = b.bits;
                btnObj["repeat"] = b.repeat;
            }
        }
    }

    return StorageManager::getInstance().saveJsonFile(FILE_IR_CODES, doc);
}

bool IrManager::saveButton(const String& remoteName, const String& buttonName,
                           const String& protocol, const String& hexCode,
                           uint16_t bits, uint8_t repeat) {
    if (remoteName.length() == 0 || buttonName.length() == 0 || hexCode.length() == 0) {
        return false;
    }

    // Update existing or add new
    for (auto& b : _buttons) {
        if (b.remoteName.equalsIgnoreCase(remoteName) && b.buttonName.equalsIgnoreCase(buttonName)) {
            b.protocol = protocol;
            b.hexCode = hexCode;
            b.bits = bits;
            b.repeat = repeat;
            saveCodesToStorage();
            return true;
        }
    }

    IrButton newBtn;
    newBtn.remoteName = remoteName;
    newBtn.buttonName = buttonName;
    newBtn.protocol = protocol;
    newBtn.hexCode = hexCode;
    newBtn.bits = (bits > 0) ? bits : 32;
    newBtn.repeat = repeat;
    _buttons.push_back(newBtn);

    saveCodesToStorage();
    return true;
}

bool IrManager::deleteButton(const String& remoteName, const String& buttonName) {
    for (auto it = _buttons.begin(); it != _buttons.end(); ++it) {
        if (it->remoteName.equalsIgnoreCase(remoteName) && it->buttonName.equalsIgnoreCase(buttonName)) {
            _buttons.erase(it);
            saveCodesToStorage();
            return true;
        }
    }
    return false;
}

bool IrManager::deleteRemote(const String& remoteName) {
    bool removed = false;
    for (auto it = _buttons.begin(); it != _buttons.end();) {
        if (it->remoteName.equalsIgnoreCase(remoteName)) {
            it = _buttons.erase(it);
            removed = true;
        } else {
            ++it;
        }
    }
    if (removed) saveCodesToStorage();
    return removed;
}

void IrManager::getRemotesJson(JsonArray& arr) {
    std::vector<String> uniqueRemotes;
    for (const auto& b : _buttons) {
        bool exists = false;
        for (const auto& u : uniqueRemotes) {
            if (u.equalsIgnoreCase(b.remoteName)) { exists = true; break; }
        }
        if (!exists) uniqueRemotes.push_back(b.remoteName);
    }

    for (const auto& rName : uniqueRemotes) {
        JsonObject rem = arr.createNestedObject();
        rem["name"] = rName;
        JsonArray bArr = rem.createNestedArray("buttons");
        for (const auto& b : _buttons) {
            if (b.remoteName.equalsIgnoreCase(rName)) {
                JsonObject btnObj = bArr.createNestedObject();
                btnObj["name"] = b.buttonName;
                btnObj["protocol"] = b.protocol;
                btnObj["hexCode"] = b.hexCode;
                btnObj["bits"] = b.bits;
                btnObj["repeat"] = b.repeat;
            }
        }
    }
}
