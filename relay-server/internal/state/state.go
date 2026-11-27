package state

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"smarthome-edge/internal/db"
)

type Channel struct {
	ID        int    `json:"id"`
	ChannelID int    `json:"channelId,omitempty"`
	Pin       int    `json:"pin"`
	Name      string `json:"name"`
	Room      string `json:"room,omitempty"`
	Function  string `json:"function,omitempty"`
	State     bool   `json:"state"`
}

type Sensor struct {
	Type  string  `json:"type"`
	Name  string  `json:"name"`
	Value float64 `json:"value"`
	Unit  string  `json:"unit"`
}

type Node struct {
	NodeID          string    `json:"nodeId"`
	NodeName        string    `json:"nodeName"`
	IP              string    `json:"ip"`
	MAC             string    `json:"mac,omitempty"`
	RSSI            int       `json:"rssi,omitempty"`
	UptimeSec       int64     `json:"uptimeSec"`
	FreeHeap        int64     `json:"freeHeap,omitempty"`
	FirmwareVersion string    `json:"firmwareVersion,omitempty"`
	IsOnline        bool      `json:"isOnline"`
	Protocol        string    `json:"protocol,omitempty"`
	LastSeenEpoch   int64     `json:"lastSeenEpoch"`
	Channels        []Channel `json:"channels"`
	Sensors         []Sensor  `json:"sensors"`
	AuthUsername    string    `json:"auth_username,omitempty"`
	AuthPassword    string    `json:"auth_password,omitempty"`
}

func (n *Node) GetCredentials() (string, string) {
	u := n.AuthUsername
	if u == "" {
		u = "admin"
	}
	p := n.AuthPassword
	if p == "" {
		p = "admin"
	}
	return u, p
}

type Command struct {
	CommandUUID string `json:"command_uuid"`
	UUID        string `json:"uuid,omitempty"`
	Action      string `json:"action"` // "setState", "SET_STATE"
	Type        string `json:"type,omitempty"` // "SET_PIN", "TOGGLE_PIN", "REBOOT"
	ID          int    `json:"id"`
	ChannelID   int    `json:"channelId,omitempty"`
	Channel_ID  int    `json:"channel_id,omitempty"`
	Channel     int    `json:"channel"`
	Pin         int    `json:"pin,omitempty"`
	State       bool   `json:"state"`
	Value       int    `json:"value"`
	ExpiresAt   int64  `json:"expiresAt,omitempty"`
}

type BreakerConfigInfo struct {
	DeviceName      string  `json:"device_name"`
	DeviceID        string  `json:"device_id"`
	LocalKey        string  `json:"local_key,omitempty"`
	IPAddress       string  `json:"ip_address"`
	ProtocolVersion float64 `json:"protocol_version"`
	ProductName     string  `json:"product_name,omitempty"`
	MacAddress      string  `json:"mac_address"`
	ModelSN         string  `json:"model_sn"`
	PollIntervalSec int     `json:"poll_interval_sec,omitempty"`
	SimulationMode  bool    `json:"simulation_mode,omitempty"`
}

type BreakerDecoded struct {
	SwitchState          bool            `json:"switch_state"`
	VoltageV             float64         `json:"voltage_v"`
	CurrentA             float64         `json:"current_a"`
	PowerW               float64         `json:"power_w"`
	PowerKW              float64         `json:"power_kw"`
	PowerFactor          float64         `json:"power_factor"`
	FrequencyHz          float64         `json:"frequency_hz"`
	TemperatureC         float64         `json:"temperature_c"`
	TotalEnergyKWh       float64         `json:"total_energy_kwh"`
	LeakageCurrentMA     float64         `json:"leakage_current_ma"`
	LeakageThresholdMA   float64         `json:"leakage_threshold_ma"`
	LeakageMasterEnabled bool            `json:"leakage_master_enabled"`
	LeakageDelayS        float64         `json:"leakage_delay_s"`
	HighTempThresholdC   float64         `json:"high_temp_threshold_c"`
	OvercurrentLimitA    float64         `json:"overcurrent_limit_a"`
	OvercurrentDelayS    float64         `json:"overcurrent_delay_s"`
	ProtectionDelayS     float64         `json:"protection_delay_s"`
	AutoRecloseDelayS    float64         `json:"auto_reclose_delay_s"`
	AutoRecloseEnabled   bool            `json:"auto_reclose_enabled"`
	AutoRecloseAttempts  float64         `json:"auto_reclose_attempts"`
	OvervoltageThreshold float64         `json:"overvoltage_threshold"`
	OvervoltageDelayS    float64         `json:"overvoltage_delay_s"`
	BalanceThreshold     float64         `json:"balance_threshold"`
	ChildLock            bool            `json:"child_lock"`
	PowerOnBehavior      string          `json:"power_on_behavior"`
	ModelStr             string          `json:"model_str"`
	FaultRaw             int64           `json:"fault_raw"`
	Faults               map[string]bool `json:"faults"`
	HasAlarm             bool            `json:"has_alarm"`
	ApparentPowerVA      float64         `json:"apparent_power_va"`
	RawDP102Base64       string          `json:"raw_dp102_base64,omitempty"`
	RawDP102Hex          string          `json:"raw_dp102_hex,omitempty"`
}

type BreakerReading struct {
	Online    bool                   `json:"online"`
	Source    string                 `json:"source"`
	Timestamp string                 `json:"timestamp"`
	DPS       map[string]interface{} `json:"dps"`
	Decoded   BreakerDecoded         `json:"decoded"`
	Errors    []string               `json:"errors,omitempty"`
}

type BreakerData struct {
	Config  BreakerConfigInfo `json:"config"`
	Reading BreakerReading    `json:"reading"`
}

type RelayHistoryEntry struct {
	Timestamp string `json:"timestamp"`
	State     bool   `json:"state"`
	Source    string `json:"source"`
}

type Notification struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Message   string `json:"message"`
	Type      string `json:"type"` // "info", "warning", "error", "success"
	Read      bool   `json:"read"`
	CreatedAt string `json:"created_at"`
}

type SystemLogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"` // "INFO", "WARN", "ERROR"
	Message   string `json:"message"`
	Source    string `json:"source"`
}

type AutomationRule struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Trigger   string `json:"trigger"`
	Condition string `json:"condition"`
	Action    string `json:"action"`
	Enabled   bool   `json:"enabled"`
	CreatedAt string `json:"created_at"`
}

type Home struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Address   string `json:"address,omitempty"`
	CreatedAt string `json:"created_at"`
}

type Room struct {
	ID        string `json:"id"`
	HomeID    string `json:"home_id"`
	Name      string `json:"name"`
	Icon      string `json:"icon,omitempty"`
	CreatedAt string `json:"created_at"`
}

type ConfigCacheSnapshot struct {
	Timestamp   string           `json:"timestamp"`
	Nodes       []*Node          `json:"nodes"`
	Homes       []Home           `json:"homes"`
	Rooms       []Room           `json:"rooms"`
	Automations []AutomationRule `json:"automations"`
}

type EventListener func(eventType string, data interface{})

type StateManager struct {
	mu             sync.RWMutex
	startTime      time.Time
	nodes          map[string]*Node
	commandQueue   map[string][]*Command
	recentCommands []*Command
	relayHistory   map[string][]RelayHistoryEntry
	breaker        BreakerData
	notifications  []Notification
	logs           []SystemLogEntry
	automations    []AutomationRule
	homes          []Home
	rooms          []Room
	listeners      []EventListener
	database       *db.DB
}

func (sm *StateManager) GetDatabase() *db.DB {
	return sm.database
}

func NewStateManager(database *db.DB) *StateManager {
	nowStr := time.Now().Format("2006-01-02 15:04:05")
	sm := &StateManager{
		startTime:      time.Now(),
		nodes:          make(map[string]*Node),
		commandQueue:   make(map[string][]*Command),
		recentCommands: make([]*Command, 0),
		relayHistory:   make(map[string][]RelayHistoryEntry),
		database:       database,
		notifications: []Notification{
			{
				ID:        "notif-1",
				Title:     "Edge Broker Online",
				Message:   "SmartHome Go Edge Relay Server initialized on local gateway.",
				Type:      "success",
				Read:      false,
				CreatedAt: nowStr,
			},
		},
		logs: []SystemLogEntry{
			{
				Timestamp: nowStr,
				Level:     "INFO",
				Message:   "Go Edge Broker runtime started (ARM64/AMD64). Listening on TCP :2000, HTTP :9200.",
				Source:    "edge-core",
			},
		},
		automations: []AutomationRule{
			{
				ID:        "auto-breaker-overload",
				Name:      "Circuit Breaker High Load Safety Trip",
				Trigger:   "breaker.power_w > 8000",
				Condition: "breaker.switch_state == true",
				Action:    "notify('High load warning on main circuit breaker')",
				Enabled:   true,
				CreatedAt: nowStr,
			},
		},
		homes: []Home{
			{
				ID:        "home-primary",
				Name:      "Primary Residence",
				Address:   "Main Local Network",
				CreatedAt: nowStr,
			},
		},
		rooms: []Room{
			{
				ID:        "room-living",
				HomeID:    "home-primary",
				Name:      "Living Room",
				Icon:      "couch",
				CreatedAt: nowStr,
			},
			{
				ID:        "room-kitchen",
				HomeID:    "home-primary",
				Name:      "Kitchen",
				Icon:      "utensils",
				CreatedAt: nowStr,
			},
			{
				ID:        "room-bedroom",
				HomeID:    "home-primary",
				Name:      "Bedroom",
				Icon:      "bed",
				CreatedAt: nowStr,
			},
			{
				ID:        "room-hallway",
				HomeID:    "home-primary",
				Name:      "Hallway",
				Icon:      "door-open",
				CreatedAt: nowStr,
			},
		},
	}
	// Initial default breaker reading
	sm.breaker.Config = BreakerConfigInfo{
		DeviceName:      "Wi-Fi Smart Circuit Breaker (Main)",
		DeviceID:        "d705ffaccaf4d0f1b1addg",
		LocalKey:        "gp->j2_X[Bx=.ovC",
		IPAddress:       "192.168.1.25",
		ProtocolVersion: 3.5,
		MacAddress:      "30:48:7d:e8:5d:5c",
		ModelSN:         "B-B1-M",
	}
	sm.breaker.Reading.Online = true
	sm.breaker.Reading.Source = "live_device"
	sm.breaker.Reading.Timestamp = nowStr
	sm.breaker.Reading.DPS = make(map[string]interface{})
	sm.breaker.Reading.Decoded.VoltageV = 257.0
	sm.breaker.Reading.Decoded.CurrentA = 1.945
	sm.breaker.Reading.Decoded.PowerW = 430.0
	sm.breaker.Reading.Decoded.PowerKW = 0.43
	sm.breaker.Reading.Decoded.PowerFactor = 0.86
	sm.breaker.Reading.Decoded.TotalEnergyKWh = 30.2
	sm.breaker.Reading.Decoded.FrequencyHz = 49.9
	sm.breaker.Reading.Decoded.TemperatureC = 28.0
	sm.breaker.Reading.Decoded.SwitchState = true
	sm.breaker.Reading.Decoded.Faults = make(map[string]bool)

	if database != nil {
		sm.restoreFromDatabase()
	}

	return sm
}

func (sm *StateManager) restoreFromDatabase() {
	if sm.database == nil {
		return
	}

	// 1. Restore Nodes and Relays
	dbNodes, err := sm.database.GetAllNodes()
	if err == nil && len(dbNodes) > 0 {
		relays, _ := sm.database.GetAllRelays()
		relaysByNode := make(map[string][]Channel)
		for _, r := range relays {
			relaysByNode[r.NodeID] = append(relaysByNode[r.NodeID], Channel{
				ID:        r.ChannelID,
				ChannelID: r.ChannelID,
				Pin:       r.Pin,
				Name:      r.Name,
				Room:      r.Room,
				Function:  r.Function,
				State:     r.CurrentState == 1,
			})
		}

		for _, dn := range dbNodes {
			chs := relaysByNode[dn.NodeID]
			if chs == nil {
				chs = make([]Channel, 0)
			}
			sm.nodes[dn.NodeID] = &Node{
				NodeID:          dn.NodeID,
				NodeName:        dn.Name,
				IP:              dn.IPAddress,
				MAC:             dn.MacAddress,
				RSSI:            dn.RSSI,
				UptimeSec:       dn.UptimeSec,
				FreeHeap:        dn.FreeHeap,
				FirmwareVersion: dn.FirmwareVersion,
				IsOnline:        dn.IsOnline,
				Channels:        chs,
				AuthUsername:    dn.AuthUsername,
				AuthPassword:    dn.AuthPassword,
			}
		}
	}

	// 2. Restore Automations
	dbAutos, err := sm.database.GetAllAutomations()
	if err == nil && len(dbAutos) > 0 {
		var autos []AutomationRule
		for _, da := range dbAutos {
			autos = append(autos, AutomationRule{
				ID:        fmt.Sprintf("%d", da.ID),
				Name:      da.Name,
				Trigger:   da.TriggerType,
				Condition: da.ConditionsJSON,
				Action:    da.ActionsJSON,
				Enabled:   da.Enabled == 1,
				CreatedAt: da.CreatedAt,
			})
		}
		sm.automations = autos
	}

	// 3. Restore Homes & Rooms
	dbHomes, err := sm.database.GetAllHomes()
	if err == nil && len(dbHomes) > 0 {
		var homes []Home
		for _, dh := range dbHomes {
			homes = append(homes, Home{
				ID:        fmt.Sprintf("%d", dh.ID),
				Name:      dh.Name,
				Address:   dh.Address,
				CreatedAt: time.Unix(int64(dh.CreatedAt), 0).Format("2006-01-02 15:04:05"),
			})
		}
		sm.homes = homes
	}

	dbRooms, err := sm.database.GetAllRooms()
	if err == nil && len(dbRooms) > 0 {
		var rooms []Room
		for _, dr := range dbRooms {
			rooms = append(rooms, Room{
				ID:        fmt.Sprintf("%d", dr.ID),
				HomeID:    fmt.Sprintf("%d", dr.HomeID),
				Name:      dr.Name,
				Icon:      dr.Icon,
				CreatedAt: time.Unix(int64(dr.CreatedAt), 0).Format("2006-01-02 15:04:05"),
			})
		}
		sm.rooms = rooms
	}

	// 4. Restore Tuya Devices
	dbTuya, err := sm.database.GetAllTuyaDevices()
	if err == nil && len(dbTuya) > 0 {
		for _, t := range dbTuya {
			if t.IsActive == 1 {
				sm.breaker.Config.DeviceID = t.ID
				sm.breaker.Config.DeviceName = t.Name
				sm.breaker.Config.IPAddress = t.IP
				sm.breaker.Config.LocalKey = t.LocalKey
				sm.breaker.Config.ProtocolVersion = t.ProtocolVersion
				break
			}
		}
	}
}

func (sm *StateManager) AddListener(listener EventListener) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.listeners = append(sm.listeners, listener)
}

func (sm *StateManager) emit(eventType string, data interface{}) {
	for _, l := range sm.listeners {
		go l(eventType, data)
	}
}

// IngestRawTelemetry parses incoming JSON from ESP8266 or HTTP and updates in-memory state
func (sm *StateManager) IngestRawTelemetry(raw []byte, clientIP string, protocol string) ([]*Command, error) {
	var payload struct {
		NodeID          string `json:"nodeId"`
		LegacyNodeID    string `json:"node_id"`
		NodeName        string `json:"nodeName"`
		Name            string `json:"name"`
		IP              string `json:"ip"`
		MAC             string `json:"mac"`
		RSSI            int    `json:"rssi"`
		UptimeSec       int64  `json:"uptimeSec"`
		LegacyUptimeSec int64  `json:"uptime_sec"`
		FreeHeap        int64  `json:"freeHeap"`
		FirmwareVersion string `json:"firmwareVersion"`
		// Both channel formats supported
		Channels []struct {
			ID        int    `json:"id"`
			ChannelID int    `json:"channelId"`
			Pin       int    `json:"pin"`
			Name      string `json:"name"`
			Room      string `json:"room"`
			Function  string `json:"function"`
			State     any    `json:"state"` // can be bool, 0/1
		} `json:"channels"`
		States []struct {
			Channel  *int   `json:"channel,omitempty"`
			ID       int    `json:"id,omitempty"`
			Pin      int    `json:"pin"`
			Name     string `json:"name,omitempty"`
			Room     string `json:"room,omitempty"`
			Function string `json:"function,omitempty"`
			State    any    `json:"state"`
		} `json:"states"`
		Sensors []Sensor `json:"sensors"`
		Acks    []struct {
			CommandUUID string `json:"command_uuid"`
			CommandUuid string `json:"commandUuid"`
			UUID        string `json:"uuid"`
			Success     bool   `json:"success"`
			Status      string `json:"status"`
		} `json:"acks"`
	}

	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("unmarshal telemetry: %w", err)
	}

	nodeID := payload.NodeID
	if nodeID == "" {
		nodeID = payload.LegacyNodeID
	}
	if nodeID == "" {
		return nil, fmt.Errorf("missing nodeId in telemetry")
	}

	sm.mu.Lock()
	defer sm.mu.Unlock()

	node, exists := sm.nodes[nodeID]
	wasOnline := false
	if exists {
		wasOnline = node.IsOnline
	} else {
		node = &Node{
			NodeID:   nodeID,
			Channels: make([]Channel, 0),
			Sensors:  make([]Sensor, 0),
		}
		sm.nodes[nodeID] = node
	}

	// Update metadata
	if payload.NodeName != "" {
		node.NodeName = payload.NodeName
	} else if payload.Name != "" {
		node.NodeName = payload.Name
	} else if node.NodeName == "" {
		node.NodeName = nodeID
	}

	if clientIP != "" {
		node.IP = clientIP
	} else if payload.IP != "" && payload.IP != "0.0.0.0" {
		node.IP = payload.IP
	}

	if payload.MAC != "" {
		node.MAC = payload.MAC
	}
	node.RSSI = payload.RSSI

	uptime := payload.UptimeSec
	if uptime == 0 {
		uptime = payload.LegacyUptimeSec
	}
	node.UptimeSec = uptime
	node.FreeHeap = payload.FreeHeap
	if payload.FirmwareVersion != "" {
		node.FirmwareVersion = payload.FirmwareVersion
	}
	node.Protocol = protocol
	node.IsOnline = true
	node.LastSeenEpoch = time.Now().Unix()

	// Update channels (if channels array provided)
	if len(payload.Channels) > 0 {
		channels := make([]Channel, len(payload.Channels))
		for i, c := range payload.Channels {
			chID := c.ChannelID
			if chID == 0 {
				chID = c.ID
			}
			if chID == 0 {
				chID = i + 1
			}

			chState := false
			switch v := c.State.(type) {
			case bool:
				chState = v
			case float64:
				chState = v > 0
			case int:
				chState = v > 0
			}

			name := c.Name
			if name == "" {
				name = fmt.Sprintf("Channel %d", chID)
			}

			channels[i] = Channel{
				ID:        chID,
				ChannelID: chID,
				Pin:       c.Pin,
				Name:      name,
				Room:      c.Room,
				Function:  c.Function,
				State:     chState,
			}
		}
		node.Channels = channels
	} else if len(payload.States) > 0 {
		channels := make([]Channel, len(payload.States))
		for i, s := range payload.States {
			chID := i + 1
			if s.Channel != nil {
				chID = *s.Channel
			} else if s.ID > 0 {
				chID = s.ID
			}

			chState := false
			switch v := s.State.(type) {
			case bool:
				chState = v
			case float64:
				chState = v > 0
			case int:
				chState = v > 0
			}

			name := s.Name
			if name == "" {
				name = fmt.Sprintf("Channel %d", chID)
			}

			channels[i] = Channel{
				ID:        chID,
				ChannelID: chID,
				Pin:       s.Pin,
				Name:      name,
				Room:      s.Room,
				Function:  s.Function,
				State:     chState,
			}
		}
		node.Channels = channels
	}

	if len(payload.Sensors) > 0 {
		node.Sensors = payload.Sensors
	}

	if len(payload.Acks) > 0 {
		for _, ack := range payload.Acks {
			cmdUUID := ack.CommandUUID
			if cmdUUID == "" {
				cmdUUID = ack.CommandUuid
			}
			if cmdUUID == "" {
				cmdUUID = ack.UUID
			}
			sm.emit("command_ack", map[string]interface{}{
				"nodeId":      nodeID,
				"commandUuid": cmdUUID,
				"success":     ack.Success,
				"status":      ack.Status,
			})
		}
	}

	if !wasOnline {
		sm.emit("node_status", map[string]interface{}{
			"nodeId":    nodeID,
			"node_id":   nodeID,
			"isOnline":  true,
			"is_online": true,
			"status":    "Online",
			"name":      node.NodeName,
		})
	}

	// Pop queued commands for this node
	var pending []*Command
	if q, ok := sm.commandQueue[nodeID]; ok && len(q) > 0 {
		pending = q
		delete(sm.commandQueue, nodeID)
	}

	if sm.database != nil {
		nodeRecord := &db.NodeRecord{
			NodeID:          nodeID,
			Name:            node.NodeName,
			HardwareType:    "ESP8266",
			FirmwareVersion: node.FirmwareVersion,
			IPAddress:       node.IP,
			MacAddress:      node.MAC,
			RSSI:            node.RSSI,
			UptimeSec:       node.UptimeSec,
			FreeHeap:        node.FreeHeap,
			IsOnline:        true,
			Status:          "Online",
			Location:        "Home",
			Category:        "Controller",
			IsPaired:        1,
		}
		go func(nr *db.NodeRecord, chs []Channel) {
			_ = sm.database.UpsertNode(nr)
			if len(chs) > 0 {
				relayRecords := make([]db.RelayRecord, len(chs))
				for i, ch := range chs {
					st := 0
					if ch.State {
						st = 1
					}
					relayRecords[i] = db.RelayRecord{
						NodeID:         nr.NodeID,
						ChannelID:      ch.ID,
						Pin:            ch.Pin,
						Name:           ch.Name,
						Room:           ch.Room,
						Function:       ch.Function,
						CurrentState:   st,
						RequestedState: st,
						Enabled:        1,
					}
				}
				_ = sm.database.SyncNodeRelays(nr.NodeID, relayRecords)
			}
		}(nodeRecord, node.Channels)
	}

	return pending, nil
}

func (sm *StateManager) GetNode(nodeID string) (*Node, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	n, ok := sm.nodes[nodeID]
	if !ok {
		return nil, false
	}
	// Return copy
	copyNode := *n
	return &copyNode, true
}

func (sm *StateManager) GetAllNodes() []*Node {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	list := make([]*Node, 0, len(sm.nodes))
	for _, n := range sm.nodes {
		cp := *n
		list = append(list, &cp)
	}
	return list
}

func (sm *StateManager) QueueCommand(nodeID string, cmd *Command) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.commandQueue[nodeID] = append(sm.commandQueue[nodeID], cmd)
}

func (sm *StateManager) SetChannelState(nodeID string, channelID int, state bool) (*Command, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	node, ok := sm.nodes[nodeID]
	if !ok {
		return nil, fmt.Errorf("node %s not found", nodeID)
	}

	var pin int
	found := false
	for i := range node.Channels {
		if node.Channels[i].ID == channelID || node.Channels[i].ChannelID == channelID {
			node.Channels[i].State = state
			pin = node.Channels[i].Pin
			found = true
			break
		}
	}
	if !found {
		return nil, fmt.Errorf("channel %d not found on node %s", channelID, nodeID)
	}

	val := 0
	if state {
		val = 1
	}

	cmdUUID := fmt.Sprintf("cmd-%d", time.Now().UnixNano())
	cmd := &Command{
		CommandUUID: cmdUUID,
		UUID:        cmdUUID,
		Action:      "setState",
		Type:        "SET_PIN",
		ID:          channelID,
		ChannelID:   channelID,
		Channel_ID:  channelID,
		Channel:     channelID,
		Pin:         pin,
		State:       state,
		Value:       val,
		ExpiresAt:   time.Now().Unix() + 30,
	}

	sm.commandQueue[nodeID] = append(sm.commandQueue[nodeID], cmd)

	// Direct HTTP push for instant sub-30ms switching if node IP is reachable on LAN
	if node.IP != "" && node.IP != "127.0.0.1" && node.IP != "0.0.0.0" {
		go func(ip string, chID int, targetState bool) {
			payload, err := json.Marshal(map[string]interface{}{
				"id":     chID,
				"state":  targetState,
				"action": "setState",
			})
			if err == nil {
				client := &http.Client{Timeout: 1200 * time.Millisecond}
				url := fmt.Sprintf("http://%s/api/gpio/state", ip)
				resp, postErr := client.Post(url, "application/json", bytes.NewReader(payload))
				if postErr == nil && resp != nil {
					_ = resp.Body.Close()
				}
			}
		}(node.IP, channelID, state)
	}

	sm.emit("pin_update", map[string]interface{}{
		"nodeId":    nodeID,
		"channelId": channelID,
		"pin":       pin,
		"state":     state,
	})

	// Record history & command tracking
	relKey := fmt.Sprintf("%s:%d", nodeID, channelID)
	sm.relayHistory[relKey] = append(sm.relayHistory[relKey], RelayHistoryEntry{
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
		State:     state,
		Source:    "api_command",
	})
	if len(sm.relayHistory[relKey]) > 50 {
		sm.relayHistory[relKey] = sm.relayHistory[relKey][1:]
	}

	sm.recentCommands = append(sm.recentCommands, cmd)
	if len(sm.recentCommands) > 100 {
		sm.recentCommands = sm.recentCommands[1:]
	}

	if sm.database != nil {
		st := 0
		if state {
			st = 1
		}
		go func(nid string, cid, stVal int) {
			oldSt, _ := sm.database.UpdateRelayState(nid, cid, stVal, stVal, 0)
			sm.database.LogRelayEvent(nid, cid, oldSt, stVal, "EDGE_COMMAND")
		}(nodeID, channelID, st)
	}

	return cmd, nil
}

func (sm *StateManager) GetOverview(centralOnline bool) map[string]interface{} {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	totalNodes := len(sm.nodes)
	onlineNodes := 0
	totalRelays := 0
	activeRelays := 0

	for _, n := range sm.nodes {
		if n.IsOnline {
			onlineNodes++
		}
		for _, ch := range n.Channels {
			totalRelays++
			if ch.State {
				activeRelays++
			}
		}
	}

	unreadNotifs := 0
	for _, n := range sm.notifications {
		if !n.Read {
			unreadNotifs++
		}
	}

	uptimeSec := int64(time.Since(sm.startTime).Seconds())

	return map[string]interface{}{
		"nodes": map[string]interface{}{
			"total":   totalNodes,
			"online":  onlineNodes,
			"offline": totalNodes - onlineNodes,
		},
		"relays": map[string]interface{}{
			"total": totalRelays,
			"on":    activeRelays,
			"off":   totalRelays - activeRelays,
		},
		"sensors": map[string]interface{}{
			"total": sm.countSensorsLocked(),
		},
		"alerts": map[string]interface{}{
			"unread": unreadNotifs,
		},
		"protocols": map[string]interface{}{
			"tcp_server": map[string]interface{}{
				"running": true,
				"port":    2000,
			},
			"http_server": map[string]interface{}{
				"running": true,
				"port":    9200,
			},
		},
		"server": map[string]interface{}{
			"version":        "1.0.0-edge",
			"uptime_sec":     uptimeSec,
			"platform":       "SmartHome Edge Relay Server (Go Native ARM64/AMD64)",
			"central_online": centralOnline,
		},
	}
}

func (sm *StateManager) countSensorsLocked() int {
	cnt := 0
	for _, n := range sm.nodes {
		cnt += len(n.Sensors)
	}
	return cnt
}

func (sm *StateManager) GetAllRelays(roomFilter string, nodeFilter string, stateFilter *bool) []map[string]interface{} {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	relays := make([]map[string]interface{}, 0)
	for nodeID, node := range sm.nodes {
		if nodeFilter != "" && nodeID != nodeFilter {
			continue
		}
		for _, ch := range node.Channels {
			if roomFilter != "" && ch.Room != roomFilter {
				continue
			}
			if stateFilter != nil && ch.State != *stateFilter {
				continue
			}

			chID := ch.ChannelID
			if chID == 0 {
				chID = ch.ID
			}

			stVal := 0
			if ch.State {
				stVal = 1
			}

			relayID := fmt.Sprintf("%s_ch%d", nodeID, chID)
			item := map[string]interface{}{
				"id":            relayID,
				"node_id":       nodeID,
				"nodeId":        nodeID,
				"node_name":     node.NodeName,
				"channel_id":    chID,
				"channelId":     chID,
				"pin":           ch.Pin,
				"name":          ch.Name,
				"room":          ch.Room,
				"function":      ch.Function,
				"state":         ch.State,
				"current_state": stVal,
				"node_online":   node.IsOnline,
				"node_ip":       node.IP,
			}
			relays = append(relays, item)
		}
	}
	return relays
}

func (sm *StateManager) GetAllSensors() []map[string]interface{} {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	sensors := make([]map[string]interface{}, 0)
	for nodeID, node := range sm.nodes {
		for i, s := range node.Sensors {
			sensors = append(sensors, map[string]interface{}{
				"id":         fmt.Sprintf("%s_sensor_%d", nodeID, i+1),
				"node_id":    nodeID,
				"nodeId":     nodeID,
				"node_name":  node.NodeName,
				"type":       s.Type,
				"name":       s.Name,
				"value":      s.Value,
				"unit":       s.Unit,
				"updated_at": time.Now().Format("2006-01-02 15:04:05"),
			})
		}
	}
	return sensors
}

func (sm *StateManager) BroadcastRelays(targetState bool, room string) []*Command {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	var commands []*Command
	for nodeID, node := range sm.nodes {
		for i := range node.Channels {
			if room != "" && node.Channels[i].Room != room {
				continue
			}
			node.Channels[i].State = targetState
			chID := node.Channels[i].ID
			pin := node.Channels[i].Pin

			cmdUUID := fmt.Sprintf("cmd-%d", time.Now().UnixNano())
			val := 0
			if targetState {
				val = 1
			}
			cmd := &Command{
				CommandUUID: cmdUUID,
				UUID:        cmdUUID,
				Action:      "setState",
				Type:        "SET_PIN",
				ID:          chID,
				ChannelID:   chID,
				Channel_ID:  chID,
				Channel:     chID,
				Pin:         pin,
				State:       targetState,
				Value:       val,
				ExpiresAt:   time.Now().Unix() + 30,
			}
			sm.commandQueue[nodeID] = append(sm.commandQueue[nodeID], cmd)
			commands = append(commands, cmd)

			// Record history
			relKey := fmt.Sprintf("%s:%d", nodeID, chID)
			sm.relayHistory[relKey] = append(sm.relayHistory[relKey], RelayHistoryEntry{
				Timestamp: time.Now().Format("2006-01-02 15:04:05"),
				State:     targetState,
				Source:    "broadcast",
			})

			// Fast LAN HTTP push
			if node.IP != "" && node.IP != "127.0.0.1" && node.IP != "0.0.0.0" {
				go func(ip string, ch int, st bool) {
					payload, _ := json.Marshal(map[string]interface{}{
						"id":     ch,
						"state":  st,
						"action": "setState",
					})
					client := &http.Client{Timeout: 1 * time.Second}
					resp, err := client.Post(fmt.Sprintf("http://%s/api/gpio/state", ip), "application/json", bytes.NewReader(payload))
					if err == nil && resp != nil {
						_ = resp.Body.Close()
					}
				}(node.IP, chID, targetState)
			}
		}
	}
	return commands
}

func (sm *StateManager) GetRelayHistory(nodeID string, channelID int) []RelayHistoryEntry {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	key := fmt.Sprintf("%s:%d", nodeID, channelID)
	if hist, ok := sm.relayHistory[key]; ok {
		cp := make([]RelayHistoryEntry, len(hist))
		copy(cp, hist)
		return cp
	}
	return []RelayHistoryEntry{}
}

func (sm *StateManager) GetRecentCommands() []*Command {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	cp := make([]*Command, len(sm.recentCommands))
	copy(cp, sm.recentCommands)
	return cp
}

func (sm *StateManager) GetNotifications() []Notification {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	cp := make([]Notification, len(sm.notifications))
	copy(cp, sm.notifications)
	return cp
}

func (sm *StateManager) GetUnreadNotifCount() int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	cnt := 0
	for _, n := range sm.notifications {
		if !n.Read {
			cnt++
		}
	}
	return cnt
}

func (sm *StateManager) MarkNotificationsRead() {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	for i := range sm.notifications {
		sm.notifications[i].Read = true
	}
}

func (sm *StateManager) DeleteNotification(id string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	filtered := make([]Notification, 0, len(sm.notifications))
	for _, n := range sm.notifications {
		if n.ID != id {
			filtered = append(filtered, n)
		}
	}
	sm.notifications = filtered
}

func (sm *StateManager) ClearAllNotifications() {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.notifications = make([]Notification, 0)
}

func (sm *StateManager) GetSystemLogs() []SystemLogEntry {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	cp := make([]SystemLogEntry, len(sm.logs))
	copy(cp, sm.logs)
	return cp
}

func (sm *StateManager) AddSystemLog(level, message, source string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.logs = append(sm.logs, SystemLogEntry{
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
		Level:     level,
		Message:   message,
		Source:    source,
	})
	if len(sm.logs) > 200 {
		sm.logs = sm.logs[1:]
	}
}

func (sm *StateManager) GetAutomations() []AutomationRule {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	cp := make([]AutomationRule, len(sm.automations))
	copy(cp, sm.automations)
	return cp
}

func (sm *StateManager) AddAutomation(rule AutomationRule) AutomationRule {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if rule.ID == "" {
		rule.ID = fmt.Sprintf("auto-%d", time.Now().Unix())
	}
	rule.CreatedAt = time.Now().Format("2006-01-02 15:04:05")
	sm.automations = append(sm.automations, rule)

	if sm.database != nil {
		en := 0
		if rule.Enabled {
			en = 1
		}
		_, _ = sm.database.SaveAutomation(&db.AutomationRecord{
			Name:           rule.Name,
			Description:    rule.Condition,
			TriggerType:    rule.Trigger,
			ConditionsJSON: rule.Condition,
			ActionsJSON:    rule.Action,
			Enabled:        en,
		})
	}

	return rule
}

func (sm *StateManager) ToggleAutomation(id string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	for i := range sm.automations {
		if sm.automations[i].ID == id {
			sm.automations[i].Enabled = !sm.automations[i].Enabled
			if sm.database != nil {
				var autoID int
				_, _ = fmt.Sscanf(id, "auto-%d", &autoID)
				en := 0
				if sm.automations[i].Enabled {
					en = 1
				}
				_ = sm.database.ToggleAutomation(autoID, en)
			}
			return sm.automations[i].Enabled
		}
	}
	return false
}

func (sm *StateManager) DeleteAutomation(id string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	filtered := make([]AutomationRule, 0, len(sm.automations))
	found := false
	for _, a := range sm.automations {
		if a.ID != id {
			filtered = append(filtered, a)
		} else {
			found = true
			if sm.database != nil {
				var autoID int
				_, _ = fmt.Sscanf(id, "auto-%d", &autoID)
				_ = sm.database.DeleteAutomation(autoID)
			}
		}
	}
	sm.automations = filtered
	return found
}

func (sm *StateManager) GetHomes() []Home {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	cp := make([]Home, len(sm.homes))
	copy(cp, sm.homes)
	return cp
}

func (sm *StateManager) GetRooms(homeID string) []Room {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	res := make([]Room, 0)
	for _, r := range sm.rooms {
		if homeID == "" || r.HomeID == homeID {
			res = append(res, r)
		}
	}
	return res
}

func (sm *StateManager) GetRoom(roomID string) (*Room, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	for _, r := range sm.rooms {
		if r.ID == roomID {
			cp := r
			return &cp, true
		}
	}
	return nil, false
}

func (sm *StateManager) CreateHome(name, address string) Home {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	h := Home{
		ID:        fmt.Sprintf("home-%d", time.Now().Unix()),
		Name:      name,
		Address:   address,
		CreatedAt: time.Now().Format("2006-01-02 15:04:05"),
	}
	sm.homes = append(sm.homes, h)
	return h
}

func (sm *StateManager) CreateRoom(homeID, name, icon string) Room {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if homeID == "" {
		homeID = "home-primary"
	}
	r := Room{
		ID:        fmt.Sprintf("room-%d", time.Now().Unix()),
		HomeID:    homeID,
		Name:      name,
		Icon:      icon,
		CreatedAt: time.Now().Format("2006-01-02 15:04:05"),
	}
	sm.rooms = append(sm.rooms, r)
	return r
}

func (sm *StateManager) DeleteRoom(roomID string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	filtered := make([]Room, 0, len(sm.rooms))
	found := false
	for _, r := range sm.rooms {
		if r.ID != roomID {
			filtered = append(filtered, r)
		} else {
			found = true
		}
	}
	sm.rooms = filtered
	return found
}

func (sm *StateManager) DeleteNode(nodeID string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if _, ok := sm.nodes[nodeID]; ok {
		delete(sm.nodes, nodeID)
		delete(sm.commandQueue, nodeID)
		if sm.database != nil {
			_ = sm.database.DeleteNode(nodeID)
		}
		sm.emit("node_deleted", map[string]string{"nodeId": nodeID})
		return true
	}
	return false
}

func (sm *StateManager) SyncNodeChannelsFromHardware(nodeID string, channels []Channel) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	node, ok := sm.nodes[nodeID]
	if !ok {
		return
	}

	node.Channels = channels

	if sm.database != nil && len(channels) > 0 {
		relayRecords := make([]db.RelayRecord, len(channels))
		for i, ch := range channels {
			st := 0
			if ch.State {
				st = 1
			}
			relayRecords[i] = db.RelayRecord{
				NodeID:         nodeID,
				ChannelID:      ch.ID,
				Pin:            ch.Pin,
				Name:           ch.Name,
				Room:           ch.Room,
				Function:       ch.Function,
				CurrentState:   st,
				RequestedState: st,
				Enabled:        1,
			}
		}
		_ = sm.database.SyncNodeRelays(nodeID, relayRecords)
	}

	sm.emit("relay_sync", map[string]interface{}{
		"nodeId":   nodeID,
		"count":    len(channels),
		"channels": channels,
	})
}

func (sm *StateManager) DeleteRelay(nodeID string, channelID int) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if node, ok := sm.nodes[nodeID]; ok {
		newChannels := make([]Channel, 0, len(node.Channels))
		for _, ch := range node.Channels {
			if ch.ID != channelID && ch.ChannelID != channelID {
				newChannels = append(newChannels, ch)
			}
		}
		node.Channels = newChannels
	}

	if sm.database != nil {
		_ = sm.database.DeleteRelay(nodeID, channelID)
	}

	sm.emit("relay_deleted", map[string]interface{}{
		"nodeId":    nodeID,
		"channelId": channelID,
	})
	return true
}

func (sm *StateManager) UpdateNodeSettings(nodeID string, name string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if n, ok := sm.nodes[nodeID]; ok {
		if name != "" {
			n.NodeName = name
		}
		return true
	}
	return false
}

func (sm *StateManager) UpdateBreaker(b BreakerData) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.breaker = b

	breakerNodeID := b.Config.DeviceID
	if breakerNodeID == "" {
		breakerNodeID = "NODE-30487DE85D5C"
	}

	payload := map[string]interface{}{
		"nodeId":        breakerNodeID,
		"isOnline":      b.Reading.Online,
		"timestamp":     b.Reading.Timestamp,
		"config":        b.Config,
		"reading":       b.Reading,
		"decoded":       b.Reading.Decoded,
		"dps":           b.Reading.DPS,
		"source":        b.Reading.Source,
	}

	sm.emit("breaker_telemetry", payload)
	sm.emit("breaker_update", payload)

	if sm.database != nil {
		_ = sm.database.SetNodeOnline("30487D", b.Reading.Online)
	}

	stStr := "Offline"
	if b.Reading.Online {
		stStr = "Online"
	}
	sm.emit("node_status", map[string]interface{}{
		"nodeId":    breakerNodeID,
		"node_id":   breakerNodeID,
		"isOnline":  b.Reading.Online,
		"is_online": b.Reading.Online,
		"status":    stStr,
		"name":      b.Config.DeviceName,
	})
}

func (sm *StateManager) GetBreaker() BreakerData {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.breaker
}

func (sm *StateManager) StartOfflineWatcher(timeoutSec int) {
	ticker := time.NewTicker(5 * time.Second)
	go func() {
		for range ticker.C {
			now := time.Now().Unix()
			sm.mu.Lock()
			for nodeID, node := range sm.nodes {
				if node.IsOnline && now-node.LastSeenEpoch > int64(timeoutSec) {
					node.IsOnline = false
					sm.emit("node_status", map[string]interface{}{
						"nodeId":    nodeID,
						"node_id":   nodeID,
						"isOnline":  false,
						"is_online": false,
						"status":    "Offline",
						"name":      node.NodeName,
					})
				}
			}
			sm.mu.Unlock()

			if sm.database != nil {
				expired, _ := sm.database.CheckAndExpireOfflineNodes(timeoutSec)
				for _, id := range expired {
					sm.mu.Lock()
					name := id
					if n, ok := sm.nodes[id]; ok {
						n.IsOnline = false
						name = n.NodeName
					}
					sm.mu.Unlock()
					sm.emit("node_status", map[string]interface{}{
						"nodeId":    id,
						"node_id":   id,
						"isOnline":  false,
						"is_online": false,
						"status":    "Offline",
						"name":      name,
					})
				}
			}
		}
	}()
}

// SaveConfigCache serializes the entire fleet, homes, rooms, and automations to disk
func (sm *StateManager) SaveConfigCache(filePath string) error {
	sm.mu.RLock()
	nodesList := make([]*Node, 0, len(sm.nodes))
	for _, n := range sm.nodes {
		cp := *n
		nodesList = append(nodesList, &cp)
	}
	snap := ConfigCacheSnapshot{
		Timestamp:   time.Now().Format("2006-01-02 15:04:05"),
		Nodes:       nodesList,
		Homes:       sm.homes,
		Rooms:       sm.rooms,
		Automations: sm.automations,
	}
	sm.mu.RUnlock()

	data, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return err
	}

	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	tmpFile := filePath + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpFile, filePath)
}

// LoadConfigCache reads configuration from disk cache if Central Server is not reachable
func (sm *StateManager) LoadConfigCache(filePath string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}

	var snap ConfigCacheSnapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		return err
	}

	sm.mu.Lock()
	defer sm.mu.Unlock()

	for _, n := range snap.Nodes {
		if existing, ok := sm.nodes[n.NodeID]; ok {
			existing.NodeName = n.NodeName
			if len(existing.Channels) == 0 {
				existing.Channels = n.Channels
			}
		} else {
			cp := *n
			cp.IsOnline = false
			sm.nodes[n.NodeID] = &cp
		}
	}

	if len(snap.Homes) > 0 {
		sm.homes = snap.Homes
	}
	if len(snap.Rooms) > 0 {
		sm.rooms = snap.Rooms
	}
	if len(snap.Automations) > 0 {
		sm.automations = snap.Automations
	}

	return nil
}

// MergeCentralNodes integrates node definitions retrieved from Central Server
func (sm *StateManager) MergeCentralNodes(nodesData []map[string]interface{}) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	for _, raw := range nodesData {
		nodeID, _ := raw["node_id"].(string)
		if nodeID == "" {
			nodeID, _ = raw["nodeId"].(string)
		}
		if nodeID == "" {
			nodeID, _ = raw["id"].(string)
		}
		if nodeID == "" {
			continue
		}

		nodeName, _ := raw["name"].(string)
		if nodeName == "" {
			nodeName, _ = raw["node_name"].(string)
		}

		existing, ok := sm.nodes[nodeID]
		if !ok {
			existing = &Node{
				NodeID:   nodeID,
				NodeName: nodeName,
				Channels: make([]Channel, 0),
				Sensors:  make([]Sensor, 0),
				IsOnline: false,
			}
			sm.nodes[nodeID] = existing
		}

		if nodeName != "" {
			existing.NodeName = nodeName
		}
		if ip, ok := raw["ip_address"].(string); ok && ip != "" && existing.IP == "" {
			existing.IP = ip
		}
		if mac, ok := raw["mac_address"].(string); ok && mac != "" {
			existing.MAC = mac
		}
		if fw, ok := raw["firmware_version"].(string); ok && fw != "" {
			existing.FirmwareVersion = fw
		}
		if u, ok := raw["auth_username"].(string); ok && u != "" {
			existing.AuthUsername = u
		}
		if p, ok := raw["auth_password"].(string); ok && p != "" {
			existing.AuthPassword = p
		}

		// Merge relays / channels if provided
		var chList []interface{}
		if rList, ok := raw["relays"].([]interface{}); ok && len(rList) > 0 {
			chList = rList
		} else if cList, ok := raw["channels"].([]interface{}); ok && len(cList) > 0 {
			chList = cList
		}

		if len(chList) > 0 {
			channels := make([]Channel, len(chList))
			for i, chRaw := range chList {
				if chMap, ok := chRaw.(map[string]interface{}); ok {
					id := i + 1
					if v, ok := chMap["channel_id"].(float64); ok {
						id = int(v)
					} else if v, ok := chMap["id"].(float64); ok {
						id = int(v)
					}
					pin := 0
					if v, ok := chMap["pin"].(float64); ok {
						pin = int(v)
					}
					name, _ := chMap["name"].(string)
					room, _ := chMap["room"].(string)
					function, _ := chMap["function"].(string)
					st := false
					if v, ok := chMap["current_state"].(float64); ok {
						st = v > 0
					} else if v, ok := chMap["state"].(bool); ok {
						st = v
					}

					channels[i] = Channel{
						ID:        id,
						ChannelID: id,
						Pin:       pin,
						Name:      name,
						Room:      room,
						Function:  function,
						State:     st,
					}
				}
			}

			if len(existing.Channels) == 0 {
				existing.Channels = channels
			} else {
				for i := range channels {
					for j := range existing.Channels {
						if existing.Channels[j].ID == channels[i].ID {
							channels[i].State = existing.Channels[j].State
							break
						}
					}
				}
				existing.Channels = channels
			}

			// Persist synchronized channels to SQLite & purge deleted stale pins
			if sm.database != nil && len(channels) > 0 {
				relayRecords := make([]db.RelayRecord, len(channels))
				for i, ch := range channels {
					st := 0
					if ch.State {
						st = 1
					}
					relayRecords[i] = db.RelayRecord{
						NodeID:         nodeID,
						ChannelID:      ch.ID,
						Pin:            ch.Pin,
						Name:           ch.Name,
						Room:           ch.Room,
						Function:       ch.Function,
						CurrentState:   st,
						RequestedState: st,
						Enabled:        1,
					}
				}
				_ = sm.database.SyncNodeRelays(nodeID, relayRecords)
			}
		}

		if sm.database != nil {
			if strings.Contains(strings.ToUpper(nodeID), "30487D") || strings.Contains(strings.ToLower(nodeID), "breaker") {
				hwType := "Tuya Smart Breaker (Single Phase + Earth Leakage)"
				isOnlineVal := sm.breaker.Reading.Online
				stStr := "Offline"
				if isOnlineVal {
					stStr = "Online"
				}
				nr := &db.NodeRecord{
					NodeID:          nodeID,
					Name:            existing.NodeName,
					HardwareType:    hwType,
					FirmwareVersion: "v3.5",
					IPAddress:       existing.IP,
					MacAddress:      existing.MAC,
					IsOnline:        isOnlineVal,
					Status:          stStr,
					Category:        "Controller",
					Location:        "Home",
				}
				_ = sm.database.UpsertNode(nr)
				continue
			}

			isOnlineVal := false
			if v, ok := raw["is_online"].(bool); ok {
				isOnlineVal = v
			} else if v, ok := raw["isOnline"].(bool); ok {
				isOnlineVal = v
			}
			stStr := "Offline"
			if isOnlineVal {
				stStr = "Online"
			}
			if existing.IsOnline {
				isOnlineVal = true
				stStr = "Online"
			}
			nr := &db.NodeRecord{
				NodeID:          nodeID,
				Name:            existing.NodeName,
				HardwareType:    "ESP8266",
				FirmwareVersion: existing.FirmwareVersion,
				IPAddress:       existing.IP,
				MacAddress:      existing.MAC,
				IsOnline:        isOnlineVal,
				Status:          stStr,
				Category:        "Controller",
				Location:        "Home",
			}
			_ = sm.database.UpsertNode(nr)
		}
	}
}

func (sm *StateManager) SetHomesAndRooms(homes []Home, rooms []Room) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if len(homes) > 0 {
		sm.homes = homes
	}
	if len(rooms) > 0 {
		sm.rooms = rooms
	}
}

func (sm *StateManager) SetAutomations(automations []AutomationRule) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	if len(automations) > 0 {
		sm.automations = automations
	}
}
