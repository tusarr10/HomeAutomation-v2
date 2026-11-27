package db

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type NodeRecord struct {
	ID              string  `json:"id"`
	NodeID          string  `json:"node_id"`
	NodeId          string  `json:"nodeId"`
	Name            string  `json:"name"`
	NodeName        string  `json:"node_name"`
	HardwareType    string  `json:"hardware_type"`
	FirmwareVersion string  `json:"firmware_version"`
	FirmwareVer     string  `json:"firmwareVersion"`
	IPAddress       string  `json:"ip_address"`
	IP              string  `json:"ip"`
	MacAddress      string  `json:"mac_address"`
	MAC             string  `json:"mac"`
	Gateway         string  `json:"gateway"`
	RSSI            int     `json:"rssi"`
	UptimeSec       int64   `json:"uptime_sec"`
	Uptime          int64   `json:"uptimeSec"`
	FreeHeap        int64   `json:"free_heap"`
	Heap            int64   `json:"freeHeap"`
	IsOnline        bool    `json:"is_online"`
	IsOnlineCamel   bool    `json:"isOnline"`
	Status          string  `json:"status"`
	Room            string  `json:"room"`
	Location        string  `json:"location"`
	Category        string  `json:"category"`
	LastSeenEpoch   float64 `json:"last_seen_epoch"`
	LastSeenStr     string  `json:"last_seen_str"`
	ChannelsJSON    string  `json:"channels_json,omitempty"`
	Channels        []any   `json:"channels"`
	CreatedAt       float64 `json:"created_at"`
	DeviceGroup     string  `json:"device_group"`
	McuType         string  `json:"mcu_type"`
	FlashCapacity   int64   `json:"flash_capacity"`
	LittlefsTotal   int64   `json:"littlefs_total"`
	LittlefsUsed    int64   `json:"littlefs_used"`
	LittlefsAvail   int64   `json:"littlefs_available"`
	WifiSSID        string  `json:"wifi_ssid"`
	HomeID          *int    `json:"home_id"`
	HomeName        string  `json:"home_name"`
	RoomID          *int    `json:"room_id"`
	RoomName        string  `json:"room_name"`
	IsPaired        int     `json:"is_paired"`
	RelaysCount     int     `json:"relays_count"`
	AuthUsername    string  `json:"auth_username"`
	AuthPassword    string  `json:"auth_password"`
}

type RelayRecord struct {
	ID             int     `json:"id"`
	NodeID         string  `json:"node_id"`
	NodeId         string  `json:"nodeId"`
	NodeName       string  `json:"node_name"`
	NodeOnline     bool    `json:"node_online"`
	NodeIP         string  `json:"node_ip"`
	HomeID         *int    `json:"home_id"`
	HomeName       string  `json:"home_name"`
	ChannelID      int     `json:"channel_id"`
	IdChannel      int     `json:"id_channel"`
	Pin            int     `json:"pin"`
	Name           string  `json:"name"`
	Room           string  `json:"room"`
	Function       string  `json:"function"`
	ActiveLow      int     `json:"active_low"`
	InitialMode    int     `json:"initial_mode"`
	Enabled        int     `json:"enabled"`
	CurrentState   int     `json:"current_state"`
	State          int     `json:"state"`
	RequestedState int     `json:"requested_state"`
	IsSyncing      int     `json:"is_syncing"`
	LastChangedAt  string  `json:"last_changed_at"`
	Icon           string  `json:"icon"`
	PinMode        string  `json:"pin_mode"`
	PosX           *int    `json:"pos_x"`
	PosY           *int    `json:"pos_y"`
}

type SensorRecord struct {
	ID           int      `json:"id"`
	NodeID       string   `json:"node_id"`
	NodeName     string   `json:"node_name"`
	NodeOnline   bool     `json:"node_online"`
	SensorType   string   `json:"sensor_type"`
	Name         string   `json:"name"`
	Room         string   `json:"room"`
	CurrentValue *float64 `json:"current_value"`
	Value        *float64 `json:"value"`
	Unit         string   `json:"unit"`
	LastReadAt   string   `json:"last_read_at"`
	Pin          *int     `json:"pin"`
	ConfigJSON   string   `json:"config_json"`
}

type UserRecord struct {
	ID          int      `json:"id"`
	Username    string   `json:"username"`
	FullName    string   `json:"full_name"`
	Email       string   `json:"email"`
	IsActive    bool     `json:"is_active"`
	IsSuperuser bool     `json:"is_superuser"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
	Roles       []string `json:"roles"`
}

type AutomationRecord struct {
	ID             int    `json:"id"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	TriggerType    string `json:"trigger_type"`
	ConditionLogic string `json:"condition_logic"`
	ConditionsJSON string `json:"conditions_json,omitempty"`
	ActionsJSON    string `json:"actions_json,omitempty"`
	Conditions     []any  `json:"conditions"`
	Actions        []any  `json:"actions"`
	ExecutionCount int    `json:"execution_count"`
	Enabled        int    `json:"enabled"`
	CreatedAt      string `json:"created_at"`
}

type RoomRecord struct {
	ID          int     `json:"id"`
	HomeID      int     `json:"home_id"`
	HomeName    string  `json:"home_name"`
	Name        string  `json:"name"`
	Floor       string  `json:"floor"`
	Icon        string  `json:"icon"`
	LayoutJSON  string  `json:"layout_json"`
	RemotesJSON string  `json:"remotes_json"`
	NodesCount  int     `json:"nodes_count"`
	RelaysCount int     `json:"relays_count"`
	CreatedAt   float64 `json:"created_at"`
	UpdatedAt   float64 `json:"updated_at"`
}

type HomeRecord struct {
	ID            int     `json:"id"`
	Name          string  `json:"name"`
	Description   string  `json:"description"`
	Timezone      string  `json:"timezone"`
	Address       string  `json:"address"`
	OwnerUserID   *int    `json:"owner_user_id"`
	OwnerUsername *string `json:"owner_username"`
	OwnerEmail    *string `json:"owner_email"`
	IsArchived    int     `json:"is_archived"`
	RoomsCount    int     `json:"rooms_count"`
	NodesCount    int     `json:"nodes_count"`
	CreatedAt     float64 `json:"created_at"`
	UpdatedAt     float64 `json:"updated_at"`
}

type TelemetryRecord struct {
	ID         int            `json:"id"`
	NodeID     string         `json:"node_id"`
	NodeId     string         `json:"nodeId"`
	EventType  string         `json:"event_type"`
	Event_Type string         `json:"eventType"`
	Timestamp  string         `json:"timestamp"`
	Epoch      float64        `json:"epoch"`
	IP         string         `json:"ip"`
	RSSI       int            `json:"rssi"`
	FreeHeap   int64          `json:"free_heap"`
	UptimeSec  int64          `json:"uptime_sec"`
	Payload    map[string]any `json:"payload,omitempty"`
}

type SystemEventRecord struct {
	ID              int    `json:"id"`
	NodeID          string `json:"node_id"`
	Category        string `json:"category"`
	Severity        string `json:"severity"`
	Description     string `json:"description"`
	ExecutionResult string `json:"execution_result"`
	Timestamp       string `json:"timestamp"`
}

type AuditLogRecord struct {
	ID           int     `json:"id"`
	TimestampStr string  `json:"timestamp_str"`
	Timestamp    string  `json:"timestamp"`
	Epoch        float64 `json:"epoch"`
	Category     string  `json:"category"`
	NodeID       string  `json:"node_id"`
	Message      string  `json:"message"`
	Level        string  `json:"level"`
	Source       string  `json:"source"`
}

type RelayEventRecord struct {
	ID            int     `json:"id"`
	NodeID        string  `json:"node_id"`
	ChannelID     int     `json:"channel_id"`
	OldState      int     `json:"old_state"`
	NewState      int     `json:"new_state"`
	TriggerSource string  `json:"trigger_source"`
	Timestamp     string  `json:"timestamp"`
	Epoch         float64 `json:"epoch"`
}

type TuyaDeviceRecord struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	IP              string  `json:"ip"`
	LocalKey        string  `json:"local_key"`
	ProtocolVersion float64 `json:"protocol_version"`
	Category        string  `json:"category"`
	Model           string  `json:"model"`
	IsActive        int     `json:"is_active"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

// ------------------- Nodes -------------------

func (db *DB) GetAllNodes() ([]NodeRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	rows, err := db.Query(`
		SELECT n.node_id, n.name, n.hardware_type, n.firmware_version, n.ip_address, n.mac_address, n.gateway,
		       n.rssi, n.uptime_sec, n.free_heap, n.is_online, n.status, n.room, n.location, n.category,
		       n.last_seen_epoch, n.last_seen_str, n.channels_json, n.created_at, n.device_group, n.mcu_type,
		       n.flash_capacity, n.littlefs_total, n.littlefs_used, n.littlefs_available, n.wifi_ssid,
		       n.home_id, n.room_id, n.is_paired,
		       (SELECT COUNT(*) FROM relays r WHERE r.node_id = n.node_id) as relays_count,
		       COALESCE(h.name, '') as home_name,
		       COALESCE(rm.name, '') as room_name,
		       COALESCE(n.auth_username, 'admin') as auth_username,
		       COALESCE(n.auth_password, 'admin') as auth_password
		FROM nodes n
		LEFT JOIN homes h ON h.id = n.home_id
		LEFT JOIN rooms rm ON rm.id = n.room_id
		ORDER BY n.name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []NodeRecord
	for rows.Next() {
		var n NodeRecord
		var name, hwType, fwVer, ip, mac, gw, status, room, loc, cat, lastSeenStr, chJSON, devGroup, mcu, wifi sql.NullString
		var rssi, uptime, heap, isOnline, flashCap, lTotal, lUsed, lAvail, homeId, roomId, isPaired, rCount sql.NullInt64
		var lastSeenEpoch, createdAt sql.NullFloat64
		var homeName, roomName, authUser, authPass sql.NullString

		err := rows.Scan(
			&n.NodeID, &name, &hwType, &fwVer, &ip, &mac, &gw,
			&rssi, &uptime, &heap, &isOnline, &status, &room, &loc, &cat,
			&lastSeenEpoch, &lastSeenStr, &chJSON, &createdAt, &devGroup, &mcu,
			&flashCap, &lTotal, &lUsed, &lAvail, &wifi,
			&homeId, &roomId, &isPaired, &rCount,
			&homeName, &roomName,
			&authUser, &authPass,
		)
		if err != nil {
			continue
		}

		n.ID = n.NodeID
		n.NodeId = n.NodeID
		if name.Valid { n.Name = name.String; n.NodeName = name.String } else { n.Name = n.NodeID; n.NodeName = n.NodeID }
		if hwType.Valid { n.HardwareType = hwType.String }
		if fwVer.Valid { n.FirmwareVersion = fwVer.String; n.FirmwareVer = fwVer.String }
		if ip.Valid { n.IPAddress = ip.String; n.IP = ip.String }
		if mac.Valid { n.MacAddress = mac.String; n.MAC = mac.String }
		if gw.Valid { n.Gateway = gw.String }
		if rssi.Valid { n.RSSI = int(rssi.Int64) }
		if uptime.Valid { n.UptimeSec = uptime.Int64; n.Uptime = uptime.Int64 }
		if heap.Valid { n.FreeHeap = heap.Int64; n.Heap = heap.Int64 }
		if isOnline.Valid { n.IsOnline = isOnline.Int64 == 1; n.IsOnlineCamel = isOnline.Int64 == 1 }
		if status.Valid { n.Status = status.String } else { if n.IsOnline { n.Status = "Online" } else { n.Status = "Offline" } }
		if room.Valid { n.Room = room.String }
		if loc.Valid { n.Location = loc.String }
		if cat.Valid { n.Category = cat.String }
		if lastSeenEpoch.Valid { n.LastSeenEpoch = lastSeenEpoch.Float64 }
		if lastSeenStr.Valid { n.LastSeenStr = lastSeenStr.String }
		if createdAt.Valid { n.CreatedAt = createdAt.Float64 }
		if devGroup.Valid { n.DeviceGroup = devGroup.String }
		if mcu.Valid { n.McuType = mcu.String }
		if flashCap.Valid { n.FlashCapacity = flashCap.Int64 }
		if lTotal.Valid { n.LittlefsTotal = lTotal.Int64 }
		if lUsed.Valid { n.LittlefsUsed = lUsed.Int64 }
		if lAvail.Valid { n.LittlefsAvail = lAvail.Int64 }
		if wifi.Valid { n.WifiSSID = wifi.String }
		if homeId.Valid { val := int(homeId.Int64); n.HomeID = &val }
		if roomId.Valid { val := int(roomId.Int64); n.RoomID = &val }
		if authUser.Valid && authUser.String != "" { n.AuthUsername = authUser.String } else { n.AuthUsername = "admin" }
		if authPass.Valid && authPass.String != "" { n.AuthPassword = authPass.String } else { n.AuthPassword = "admin" }
		if homeName.Valid { n.HomeName = homeName.String }
		if roomName.Valid { n.RoomName = roomName.String }
		if isPaired.Valid { n.IsPaired = int(isPaired.Int64) }
		if rCount.Valid { n.RelaysCount = int(rCount.Int64) }

		n.Channels = make([]any, 0)
		if chJSON.Valid && chJSON.String != "" {
			n.ChannelsJSON = chJSON.String
			var parsed []any
			if json.Unmarshal([]byte(chJSON.String), &parsed) == nil {
				n.Channels = parsed
			}
		}

		nodes = append(nodes, n)
	}
	return nodes, nil
}

func (db *DB) UpsertNode(n *NodeRecord) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	now := time.Now().UTC()
	epoch := float64(now.Unix())
	nowStr := now.Format(time.RFC3339)

	isOnlineInt := 0
	if n.IsOnline {
		isOnlineInt = 1
	}

	_, err := db.Exec(`
		INSERT INTO nodes (
			node_id, name, hardware_type, firmware_version, ip_address, mac_address, gateway,
			rssi, uptime_sec, free_heap, is_online, status, room, location, category,
			last_seen_epoch, last_seen_str, channels_json, created_at, wifi_ssid, is_paired
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(node_id) DO UPDATE SET
			ip_address = excluded.ip_address,
			mac_address = CASE WHEN excluded.mac_address != '' THEN excluded.mac_address ELSE nodes.mac_address END,
			gateway = CASE WHEN excluded.gateway != '' THEN excluded.gateway ELSE nodes.gateway END,
			rssi = excluded.rssi,
			uptime_sec = excluded.uptime_sec,
			free_heap = excluded.free_heap,
			is_online = excluded.is_online,
			status = excluded.status,
			last_seen_epoch = excluded.last_seen_epoch,
			last_seen_str = excluded.last_seen_str,
			channels_json = CASE WHEN excluded.channels_json != '' THEN excluded.channels_json ELSE nodes.channels_json END,
			firmware_version = CASE WHEN excluded.firmware_version != '' THEN excluded.firmware_version ELSE nodes.firmware_version END,
			wifi_ssid = CASE WHEN excluded.wifi_ssid != '' THEN excluded.wifi_ssid ELSE nodes.wifi_ssid END
	`,
		n.NodeID, n.Name, n.HardwareType, n.FirmwareVersion, n.IPAddress, n.MacAddress, n.Gateway,
		n.RSSI, n.UptimeSec, n.FreeHeap, isOnlineInt, n.Status, n.Room, n.Location, n.Category,
		epoch, nowStr, n.ChannelsJSON, epoch, n.WifiSSID, n.IsPaired,
	)
	return err
}

func (db *DB) SetNodeOnline(nodeID string, isOnline bool) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	status := "Offline"
	onlineVal := 0
	if isOnline {
		status = "Online"
		onlineVal = 1
		nowEpoch := float64(time.Now().Unix())
		nowStr := time.Now().UTC().Format(time.RFC3339)
		_, err := db.Exec("UPDATE nodes SET is_online = 1, status = ?, last_seen_epoch = ?, last_seen_str = ? WHERE node_id = ? OR node_id LIKE '%' || ?", status, nowEpoch, nowStr, nodeID, nodeID)
		return err
	}

	_, err := db.Exec("UPDATE nodes SET is_online = ?, status = ? WHERE node_id = ? OR node_id LIKE '%' || ?", onlineVal, status, nodeID, nodeID)
	return err
}

func (db *DB) CheckAndExpireOfflineNodes(timeoutSec int) ([]string, error) {
	db.mu.Lock()
	defer db.mu.Unlock()

	nowEpoch := float64(time.Now().Unix())
	rows, err := db.Query(`
		SELECT node_id FROM nodes 
		WHERE is_online = 1 
		  AND (? - last_seen_epoch) > ?
		  AND node_id NOT LIKE '%30487D%'
		  AND hardware_type NOT LIKE '%Breaker%'
	`, nowEpoch, float64(timeoutSec))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var expired []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil && id != "" {
			expired = append(expired, id)
		}
	}

	if len(expired) > 0 {
		for _, id := range expired {
			_, _ = db.Exec("UPDATE nodes SET is_online = 0, status = 'Offline' WHERE node_id = ?", id)
		}
	}

	return expired, nil
}

// ------------------- Relays -------------------

func (db *DB) GetAllRelays() ([]RelayRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	rows, err := db.Query(`
		SELECT r.id, r.node_id, COALESCE(n.name, r.node_id) as node_name,
		       COALESCE(n.is_online, 0) as node_online, COALESCE(n.ip_address, '') as node_ip,
		       n.home_id, COALESCE(h.name, '') as home_name,
		       r.channel_id, r.pin, r.name, r.room, r.function, r.active_low,
		       r.initial_mode, r.enabled, r.current_state, r.requested_state, r.is_syncing,
		       r.last_changed_at, r.icon, r.pin_mode, r.pos_x, r.pos_y
		FROM relays r
		LEFT JOIN nodes n ON n.node_id = r.node_id
		LEFT JOIN homes h ON h.id = n.home_id
		ORDER BY r.node_id ASC, r.channel_id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var relays []RelayRecord
	for rows.Next() {
		var r RelayRecord
		var nodeName, nodeIP, homeName, rName, room, function, icon, pinMode, lastChanged sql.NullString
		var nodeOnline, homeId, posX, posY sql.NullInt64

		err := rows.Scan(
			&r.ID, &r.NodeID, &nodeName,
			&nodeOnline, &nodeIP,
			&homeId, &homeName,
			&r.ChannelID, &r.Pin, &rName, &room, &function, &r.ActiveLow,
			&r.InitialMode, &r.Enabled, &r.CurrentState, &r.RequestedState, &r.IsSyncing,
			&lastChanged, &icon, &pinMode, &posX, &posY,
		)
		if err != nil {
			continue
		}

		r.NodeId = r.NodeID
		r.IdChannel = r.ChannelID
		r.State = r.CurrentState

		if nodeName.Valid { r.NodeName = nodeName.String } else { r.NodeName = r.NodeID }
		if nodeOnline.Valid { r.NodeOnline = nodeOnline.Int64 == 1 }
		if nodeIP.Valid { r.NodeIP = nodeIP.String }
		if homeId.Valid { val := int(homeId.Int64); r.HomeID = &val }
		if homeName.Valid { r.HomeName = homeName.String }
		if rName.Valid { r.Name = rName.String } else { r.Name = fmt.Sprintf("Channel %d", r.ChannelID) }
		if room.Valid { r.Room = room.String } else { r.Room = "General" }
		if function.Valid { r.Function = function.String } else { r.Function = "Relay" }
		if icon.Valid { r.Icon = icon.String } else { r.Icon = "light" }
		if pinMode.Valid { r.PinMode = pinMode.String } else { r.PinMode = "RELAY_OUTPUT" }
		if lastChanged.Valid { r.LastChangedAt = lastChanged.String }
		if posX.Valid { val := int(posX.Int64); r.PosX = &val }
		if posY.Valid { val := int(posY.Int64); r.PosY = &val }

		relays = append(relays, r)
	}
	return relays, nil
}

func (db *DB) UpsertRelay(r *RelayRecord) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	nowStr := time.Now().UTC().Format(time.RFC3339)

	_, err := db.Exec(`
		INSERT INTO relays (
			node_id, channel_id, pin, name, room, function, active_low,
			initial_mode, enabled, current_state, requested_state, is_syncing,
			last_changed_at, icon, pin_mode
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(node_id, channel_id) DO UPDATE SET
			pin = excluded.pin,
			name = CASE WHEN relays.name IS NULL OR relays.name = '' THEN excluded.name ELSE relays.name END,
			current_state = excluded.current_state,
			requested_state = excluded.requested_state,
			is_syncing = excluded.is_syncing,
			last_changed_at = excluded.last_changed_at
	`,
		r.NodeID, r.ChannelID, r.Pin, r.Name, r.Room, r.Function, r.ActiveLow,
		r.InitialMode, r.Enabled, r.CurrentState, r.RequestedState, r.IsSyncing,
		nowStr, r.Icon, r.PinMode,
	)
	return err
}

func (db *DB) SyncNodeRelays(nodeID string, channels []RelayRecord) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if len(channels) == 0 {
		return nil
	}

	activeIDs := make([]interface{}, 0, len(channels))
	placeholders := make([]string, 0, len(channels))
	for _, ch := range channels {
		activeIDs = append(activeIDs, ch.ChannelID)
		placeholders = append(placeholders, "?")
	}

	// Purge stale relays that no longer exist on the node (Except Tuya breaker)
	if !strings.Contains(nodeID, "30487D") && !strings.Contains(strings.ToUpper(nodeID), "BREAKER") {
		args := append([]interface{}{nodeID}, activeIDs...)
		query := fmt.Sprintf("DELETE FROM relays WHERE node_id = ? AND channel_id NOT IN (%s)", strings.Join(placeholders, ","))
		_, _ = db.Exec(query, args...)
	}

	// Upsert active relays
	nowStr := time.Now().UTC().Format(time.RFC3339)
	for _, r := range channels {
		_, _ = db.Exec(`
			INSERT INTO relays (
				node_id, channel_id, pin, name, room, function, active_low,
				initial_mode, enabled, current_state, requested_state, is_syncing,
				last_changed_at, icon, pin_mode
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(node_id, channel_id) DO UPDATE SET
				pin = excluded.pin,
				name = CASE WHEN relays.name IS NULL OR relays.name = '' THEN excluded.name ELSE relays.name END,
				current_state = excluded.current_state,
				requested_state = excluded.requested_state,
				is_syncing = excluded.is_syncing,
				last_changed_at = excluded.last_changed_at
		`,
			r.NodeID, r.ChannelID, r.Pin, r.Name, r.Room, r.Function, r.ActiveLow,
			r.InitialMode, r.Enabled, r.CurrentState, r.RequestedState, r.IsSyncing,
			nowStr, r.Icon, r.PinMode,
		)
	}
	return nil
}

func (db *DB) DeleteRelay(nodeID string, channelID int) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	_, err := db.Exec("DELETE FROM relays WHERE node_id = ? AND channel_id = ?", nodeID, channelID)
	return err
}

func (db *DB) DeleteNode(nodeID string) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	_, _ = db.Exec("DELETE FROM relays WHERE node_id = ?", nodeID)
	_, _ = db.Exec("DELETE FROM sensors WHERE node_id = ?", nodeID)
	_, _ = db.Exec("DELETE FROM commands WHERE node_id = ?", nodeID)
	_, _ = db.Exec("DELETE FROM telemetry_logs WHERE node_id = ?", nodeID)
	_, _ = db.Exec("DELETE FROM system_events WHERE node_id = ?", nodeID)
	_, err := db.Exec("DELETE FROM nodes WHERE node_id = ?", nodeID)
	return err
}

func (db *DB) UpdateRelayState(nodeID string, channelID int, state, requestedState, isSyncing int) (int, error) {
	db.mu.Lock()
	defer db.mu.Unlock()

	var oldState int
	err := db.QueryRow("SELECT current_state FROM relays WHERE node_id = ? AND channel_id = ?", nodeID, channelID).Scan(&oldState)
	if err != nil {
		oldState = 0
	}

	nowStr := time.Now().UTC().Format(time.RFC3339)
	_, err = db.Exec(`
		UPDATE relays
		SET current_state = ?, requested_state = ?, is_syncing = ?, last_changed_at = ?
		WHERE node_id = ? AND channel_id = ?
	`, state, requestedState, isSyncing, nowStr, nodeID, channelID)

	return oldState, err
}

// ------------------- Sensors -------------------

func (db *DB) GetAllSensors() ([]SensorRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	rows, err := db.Query(`
		SELECT s.id, s.node_id, COALESCE(n.name, s.node_id) as node_name,
		       COALESCE(n.is_online, 0) as node_online,
		       s.sensor_type, s.name, s.room, s.value, s.unit, s.last_read_at, s.pin, s.config_json
		FROM sensors s
		LEFT JOIN nodes n ON n.node_id = s.node_id
		ORDER BY s.id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sensors []SensorRecord
	for rows.Next() {
		var s SensorRecord
		var nodeName, sType, name, room, unit, lastRead, cfg sql.NullString
		var nodeOnline, pin sql.NullInt64
		var val sql.NullFloat64

		err := rows.Scan(
			&s.ID, &s.NodeID, &nodeName, &nodeOnline,
			&sType, &name, &room, &val, &unit, &lastRead, &pin, &cfg,
		)
		if err != nil {
			continue
		}

		if nodeName.Valid { s.NodeName = nodeName.String } else { s.NodeName = s.NodeID }
		if nodeOnline.Valid { s.NodeOnline = nodeOnline.Int64 == 1 }
		if sType.Valid { s.SensorType = sType.String }
		if name.Valid { s.Name = name.String }
		if room.Valid { s.Room = room.String }
		if unit.Valid { s.Unit = unit.String }
		if lastRead.Valid { s.LastReadAt = lastRead.String }
		if cfg.Valid { s.ConfigJSON = cfg.String }
		if pin.Valid { v := int(pin.Int64); s.Pin = &v }
		if val.Valid {
			v := val.Float64
			s.Value = &v
			s.CurrentValue = &v
		}

		sensors = append(sensors, s)
	}
	return sensors, nil
}

// ------------------- Homes & Rooms -------------------

func (db *DB) GetAllHomes() ([]HomeRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	rows, err := db.Query(`
		SELECT h.id, h.name, h.description, h.timezone, h.address, h.owner_user_id,
		       u.username as owner_username, u.email as owner_email,
		       h.is_archived, h.created_at, h.updated_at,
		       (SELECT COUNT(*) FROM rooms r WHERE r.home_id = h.id) as rooms_count,
		       (SELECT COUNT(*) FROM nodes n WHERE n.home_id = h.id) as nodes_count
		FROM homes h
		LEFT JOIN users u ON u.id = h.owner_user_id
		WHERE h.is_archived = 0
		ORDER BY h.id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var homes []HomeRecord
	for rows.Next() {
		var h HomeRecord
		var name, desc, tz, addr, ownerUser, ownerMail sql.NullString
		var ownerId, isArchived, rCount, nCount sql.NullInt64
		var cAt, uAt sql.NullFloat64

		err := rows.Scan(
			&h.ID, &name, &desc, &tz, &addr, &ownerId,
			&ownerUser, &ownerMail,
			&isArchived, &cAt, &uAt,
			&rCount, &nCount,
		)
		if err != nil {
			continue
		}

		if name.Valid { h.Name = name.String }
		if desc.Valid { h.Description = desc.String }
		if tz.Valid { h.Timezone = tz.String }
		if addr.Valid { h.Address = addr.String }
		if ownerId.Valid { v := int(ownerId.Int64); h.OwnerUserID = &v }
		if ownerUser.Valid { h.OwnerUsername = &ownerUser.String }
		if ownerMail.Valid { h.OwnerEmail = &ownerMail.String }
		if isArchived.Valid { h.IsArchived = int(isArchived.Int64) }
		if cAt.Valid { h.CreatedAt = cAt.Float64 }
		if uAt.Valid { h.UpdatedAt = uAt.Float64 }
		if rCount.Valid { h.RoomsCount = int(rCount.Int64) }
		if nCount.Valid { h.NodesCount = int(nCount.Int64) }

		homes = append(homes, h)
	}
	return homes, nil
}

func (db *DB) GetRoomsByHome(homeID int) ([]RoomRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	var rows *sql.Rows
	var err error
	if homeID > 0 {
		rows, err = db.Query(`
			SELECT r.id, r.home_id, COALESCE(h.name, '') as home_name, r.name, r.floor, r.icon,
			       r.layout_json, r.remotes_json, r.created_at, r.updated_at,
			       (SELECT COUNT(*) FROM nodes n WHERE n.room_id = r.id) as nodes_count,
			       (SELECT COUNT(*) FROM relays rel WHERE rel.room = r.name) as relays_count
			FROM rooms r
			LEFT JOIN homes h ON h.id = r.home_id
			WHERE r.home_id = ?
			ORDER BY r.id ASC
		`, homeID)
	} else {
		rows, err = db.Query(`
			SELECT r.id, r.home_id, COALESCE(h.name, '') as home_name, r.name, r.floor, r.icon,
			       r.layout_json, r.remotes_json, r.created_at, r.updated_at,
			       (SELECT COUNT(*) FROM nodes n WHERE n.room_id = r.id) as nodes_count,
			       (SELECT COUNT(*) FROM relays rel WHERE rel.room = r.name) as relays_count
			FROM rooms r
			LEFT JOIN homes h ON h.id = r.home_id
			ORDER BY r.id ASC
		`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rooms []RoomRecord
	for rows.Next() {
		var r RoomRecord
		var homeName, name, floor, icon, layout, remotes sql.NullString
		var cAt, uAt sql.NullFloat64
		var nCount, rCount sql.NullInt64

		err := rows.Scan(
			&r.ID, &r.HomeID, &homeName, &name, &floor, &icon,
			&layout, &remotes, &cAt, &uAt,
			&nCount, &rCount,
		)
		if err != nil {
			continue
		}

		if homeName.Valid { r.HomeName = homeName.String }
		if name.Valid { r.Name = name.String }
		if floor.Valid { r.Floor = floor.String }
		if icon.Valid { r.Icon = icon.String }
		if layout.Valid { r.LayoutJSON = layout.String }
		if remotes.Valid { r.RemotesJSON = remotes.String }
		if cAt.Valid { r.CreatedAt = cAt.Float64 }
		if uAt.Valid { r.UpdatedAt = uAt.Float64 }
		if nCount.Valid { r.NodesCount = int(nCount.Int64) }
		if rCount.Valid { r.RelaysCount = int(rCount.Int64) }

		rooms = append(rooms, r)
	}
	return rooms, nil
}

func (db *DB) GetAllRooms() ([]RoomRecord, error) {
	return db.GetRoomsByHome(0)
}

// ------------------- Automations -------------------

func (db *DB) GetAllAutomations() ([]AutomationRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	rows, err := db.Query(`
		SELECT id, name, description, trigger_type, condition_logic, conditions_json, actions_json,
		       execution_count, enabled, created_at
		FROM automations ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []AutomationRecord
	for rows.Next() {
		var a AutomationRecord
		var name, desc, trType, condLogic, condJSON, actJSON, cAt sql.NullString
		var exCount, enabled sql.NullInt64

		err := rows.Scan(
			&a.ID, &name, &desc, &trType, &condLogic,
			&condJSON, &actJSON, &exCount, &enabled, &cAt,
		)
		if err != nil {
			continue
		}

		if name.Valid { a.Name = name.String }
		if desc.Valid { a.Description = desc.String }
		if trType.Valid { a.TriggerType = trType.String }
		if condLogic.Valid { a.ConditionLogic = condLogic.String }
		if condJSON.Valid { a.ConditionsJSON = condJSON.String }
		if actJSON.Valid { a.ActionsJSON = actJSON.String }
		if exCount.Valid { a.ExecutionCount = int(exCount.Int64) }
		if enabled.Valid { a.Enabled = int(enabled.Int64) }
		if cAt.Valid { a.CreatedAt = cAt.String }

		a.Conditions = make([]any, 0)
		if condJSON.Valid && condJSON.String != "" {
			_ = json.Unmarshal([]byte(condJSON.String), &a.Conditions)
		}

		a.Actions = make([]any, 0)
		if actJSON.Valid && actJSON.String != "" {
			_ = json.Unmarshal([]byte(actJSON.String), &a.Actions)
		}

		list = append(list, a)
	}
	return list, nil
}

func (db *DB) SaveAutomation(a *AutomationRecord) (int64, error) {
	db.mu.Lock()
	defer db.mu.Unlock()

	nowStr := time.Now().UTC().Format(time.RFC3339)
	condBytes, _ := json.Marshal(a.Conditions)
	if len(a.Conditions) == 0 && a.ConditionsJSON != "" {
		condBytes = []byte(a.ConditionsJSON)
	}
	actBytes, _ := json.Marshal(a.Actions)
	if len(a.Actions) == 0 && a.ActionsJSON != "" {
		actBytes = []byte(a.ActionsJSON)
	}

	if a.ID > 0 {
		_, err := db.Exec(`
			UPDATE automations
			SET name = ?, description = ?, trigger_type = ?, condition_logic = ?,
			    conditions_json = ?, actions_json = ?, enabled = ?
			WHERE id = ?
		`, a.Name, a.Description, a.TriggerType, a.ConditionLogic, string(condBytes), string(actBytes), a.Enabled, a.ID)
		return int64(a.ID), err
	}

	res, err := db.Exec(`
		INSERT INTO automations (name, description, trigger_type, condition_logic, conditions_json, actions_json, execution_count, enabled, created_at)
		VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
	`, a.Name, a.Description, a.TriggerType, a.ConditionLogic, string(condBytes), string(actBytes), a.Enabled, nowStr)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) DeleteAutomation(id int) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	_, err := db.Exec("DELETE FROM automations WHERE id = ?", id)
	return err
}

func (db *DB) ToggleAutomation(id int, enabled int) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	_, err := db.Exec("UPDATE automations SET enabled = ? WHERE id = ?", enabled, id)
	return err
}

// ------------------- Telemetry & Events -------------------

func (db *DB) GetTelemetryLogs(limit int) ([]TelemetryRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if limit <= 0 {
		limit = 50
	}

	rows, err := db.Query(`
		SELECT id, node_id, event_type, timestamp_str, epoch, ip, rssi, free_heap, uptime_sec, payload_json
		FROM telemetry_logs ORDER BY id DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []TelemetryRecord
	for rows.Next() {
		var t TelemetryRecord
		var evType, tsStr, ip, payloadStr sql.NullString
		var rssi, heap, uptime sql.NullInt64
		var epoch sql.NullFloat64

		err := rows.Scan(
			&t.ID, &t.NodeID, &evType, &tsStr, &epoch, &ip, &rssi, &heap, &uptime, &payloadStr,
		)
		if err != nil {
			continue
		}

		t.NodeId = t.NodeID
		if evType.Valid { t.EventType = evType.String; t.Event_Type = evType.String } else { t.EventType = "heartbeat"; t.Event_Type = "heartbeat" }
		if tsStr.Valid { t.Timestamp = tsStr.String }
		if epoch.Valid { t.Epoch = epoch.Float64 }
		if ip.Valid { t.IP = ip.String } else { t.IP = "LAN" }
		if rssi.Valid { t.RSSI = int(rssi.Int64) }
		if heap.Valid { t.FreeHeap = heap.Int64 }
		if uptime.Valid { t.UptimeSec = uptime.Int64 }
		if payloadStr.Valid && payloadStr.String != "" {
			var p map[string]any
			if json.Unmarshal([]byte(payloadStr.String), &p) == nil {
				t.Payload = p
			}
		}

		logs = append(logs, t)
	}
	return logs, nil
}

func (db *DB) GetSystemEvents(limit int) ([]SystemEventRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if limit <= 0 {
		limit = 50
	}

	rows, err := db.Query(`
		SELECT id, node_id, category, severity, description, execution_result, timestamp
		FROM system_events ORDER BY id DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []SystemEventRecord
	for rows.Next() {
		var s SystemEventRecord
		var nodeId, cat, sev, desc, res, ts sql.NullString
		err := rows.Scan(&s.ID, &nodeId, &cat, &sev, &desc, &res, &ts)
		if err != nil {
			continue
		}
		if nodeId.Valid { s.NodeID = nodeId.String } else { s.NodeID = "System" }
		if cat.Valid { s.Category = cat.String } else { s.Category = "SYSTEM" }
		if sev.Valid { s.Severity = sev.String } else { s.Severity = "INFO" }
		if desc.Valid { s.Description = desc.String }
		if res.Valid { s.ExecutionResult = res.String }
		if ts.Valid { s.Timestamp = ts.String }

		list = append(list, s)
	}
	return list, nil
}

func (db *DB) GetRelayEvents(limit int) ([]RelayEventRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if limit <= 0 {
		limit = 50
	}
	rows, err := db.Query("SELECT id, node_id, channel_id, old_state, new_state, trigger_source, timestamp, epoch FROM relay_events ORDER BY id DESC LIMIT ?", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []RelayEventRecord
	for rows.Next() {
		var e RelayEventRecord
		if err := rows.Scan(&e.ID, &e.NodeID, &e.ChannelID, &e.OldState, &e.NewState, &e.TriggerSource, &e.Timestamp, &e.Epoch); err == nil {
			list = append(list, e)
		}
	}
	return list, nil
}

func (db *DB) GetAuditLogs(limit int) ([]AuditLogRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if limit <= 0 {
		limit = 50
	}
	rows, err := db.Query("SELECT id, timestamp_str, epoch, category, node_id, message FROM audit_logs ORDER BY id DESC LIMIT ?", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []AuditLogRecord
	for rows.Next() {
		var l AuditLogRecord
		if err := rows.Scan(&l.ID, &l.TimestampStr, &l.Epoch, &l.Category, &l.NodeID, &l.Message); err == nil {
			l.Timestamp = l.TimestampStr
			l.Level = "INFO"
			l.Source = "edge_broker"
			list = append(list, l)
		}
	}
	return list, nil
}

// ------------------- Users & Auth -------------------

func (db *DB) GetAllUsers() ([]UserRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	rows, err := db.Query(`
		SELECT id, username, full_name, email, is_active, is_superuser, created_at, updated_at
		FROM users ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}

	var users []UserRecord
	for rows.Next() {
		var u UserRecord
		var fn, em, cAt, uAt sql.NullString
		var active, super int
		err := rows.Scan(&u.ID, &u.Username, &fn, &em, &active, &super, &cAt, &uAt)
		if err != nil {
			continue
		}
		if fn.Valid { u.FullName = fn.String }
		if em.Valid { u.Email = em.String }
		if cAt.Valid { u.CreatedAt = cAt.String }
		if uAt.Valid { u.UpdatedAt = uAt.String }
		u.IsActive = active == 1
		u.IsSuperuser = super == 1
		u.Roles = make([]string, 0)
		users = append(users, u)
	}
	rows.Close()

	// Load user roles in batch
	userRolesMap := make(map[int][]string)
	if rRows, err := db.Query("SELECT ur.user_id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id"); err == nil {
		for rRows.Next() {
			var uid int
			var rName string
			if rRows.Scan(&uid, &rName) == nil {
				userRolesMap[uid] = append(userRolesMap[uid], rName)
			}
		}
		rRows.Close()
	}

	for i := range users {
		if roles, ok := userRolesMap[users[i].ID]; ok && len(roles) > 0 {
			users[i].Roles = roles
		} else {
			if users[i].IsSuperuser {
				users[i].Roles = []string{"SUPER_ADMIN"}
			} else {
				users[i].Roles = []string{"VIEWER"}
			}
		}
	}

	return users, nil
}

func (db *DB) AuthenticateUser(username, password string) (*UserRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	var u UserRecord
	var passHash string
	var active, super int
	var fn, em, cAt, uAt sql.NullString

	err := db.QueryRow(`
		SELECT id, username, password_hash, full_name, email, is_active, is_superuser, created_at, updated_at
		FROM users WHERE username = ?
	`, username).Scan(
		&u.ID, &u.Username, &passHash, &fn, &em, &active, &super, &cAt, &uAt,
	)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	u.IsActive = active == 1
	u.IsSuperuser = super == 1
	if fn.Valid { u.FullName = fn.String }
	if em.Valid { u.Email = em.String }
	if cAt.Valid { u.CreatedAt = cAt.String }
	if uAt.Valid { u.UpdatedAt = uAt.String }

	if !u.IsActive {
		return nil, fmt.Errorf("account is deactivated")
	}

	if !VerifyPassword(password, passHash) {
		return nil, fmt.Errorf("invalid credentials")
	}

	// Fetch roles
	rRows, err := db.Query("SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?", u.ID)
	if err == nil {
		for rRows.Next() {
			var rName string
			if rRows.Scan(&rName) == nil {
				u.Roles = append(u.Roles, rName)
			}
		}
		rRows.Close()
	}
	if len(u.Roles) == 0 {
		if u.IsSuperuser {
			u.Roles = []string{"SUPER_ADMIN"}
		} else {
			u.Roles = []string{"VIEWER"}
		}
	}

	return &u, nil
}

func (db *DB) CreateSession(userID int, ip, ua string) (string, error) {
	db.mu.Lock()
	defer db.mu.Unlock()

	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)

	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339)
	expiresStr := now.Add(30 * 24 * time.Hour).Format(time.RFC3339)

	_, err := db.Exec(`
		INSERT INTO user_sessions (token, user_id, ip_address, user_agent, created_at, last_active_at, expires_at, is_revoked)
		VALUES (?, ?, ?, ?, ?, ?, ?, 0)
	`, token, userID, ip, ua, nowStr, nowStr, expiresStr)
	return token, err
}

// ------------------- Overview Statistics -------------------

func (db *DB) GetOverviewStats(isCentralOnline bool) map[string]any {
	db.mu.RLock()
	defer db.mu.RUnlock()

	var totalNodes, onlineNodes, totalRelays, onRelays, totalSensors, unreadAlerts int
	var totalHomes, totalRooms, totalAutos, enabledAutos int

	_ = db.QueryRow("SELECT COUNT(*), COALESCE(SUM(CASE WHEN is_online = 1 THEN 1 ELSE 0 END), 0) FROM nodes").Scan(&totalNodes, &onlineNodes)
	_ = db.QueryRow("SELECT COUNT(*), COALESCE(SUM(CASE WHEN current_state = 1 THEN 1 ELSE 0 END), 0) FROM relays").Scan(&totalRelays, &onRelays)
	_ = db.QueryRow("SELECT COUNT(*) FROM sensors").Scan(&totalSensors)
	_ = db.QueryRow("SELECT COUNT(*) FROM notifications WHERE read = 0").Scan(&unreadAlerts)
	_ = db.QueryRow("SELECT COUNT(*) FROM homes WHERE is_archived = 0").Scan(&totalHomes)
	_ = db.QueryRow("SELECT COUNT(*) FROM rooms").Scan(&totalRooms)
	_ = db.QueryRow("SELECT COUNT(*), COALESCE(SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END), 0) FROM automations").Scan(&totalAutos, &enabledAutos)

	return map[string]any{
		"nodes": map[string]any{
			"total":   totalNodes,
			"online":  onlineNodes,
			"offline": totalNodes - onlineNodes,
		},
		"relays": map[string]any{
			"total": totalRelays,
			"on":    onRelays,
			"off":   totalRelays - onRelays,
		},
		"homes": map[string]any{
			"total": totalHomes,
			"rooms": totalRooms,
		},
		"automations": map[string]any{
			"total":   totalAutos,
			"enabled": enabledAutos,
		},
		"sensors": map[string]any{
			"total": totalSensors,
		},
		"alerts": map[string]any{
			"unread": unreadAlerts,
		},
		"ota": map[string]any{
			"running":     0,
			"lastVersion": "v1.6.0",
			"lastTime":    "1d ago",
		},
		"health": map[string]any{
			"status":         "Healthy",
			"allOperational": true,
		},
		"protocols": map[string]any{
			"tcp_server": map[string]any{
				"running": true,
				"port":    2000,
			},
			"http_server": map[string]any{
				"running": true,
				"port":    9200,
			},
		},
		"system": map[string]any{
			"host_ip":          "192.168.1.2",
			"cpu_percent":      3,
			"ram_percent":      43,
			"storage_percent":  1,
			"storage_used_gb":  0.1,
			"storage_total_gb": 11.4,
			"ram_used_gb":      0.21,
			"ram_total_gb":     0.48,
			"cpu_cores":        4,
			"cpu_used_cores":   "0.1",
			"uptime_sec":       175896,
			"uptime_str":       "2d 0h",
			"rx_mb_s":          "0.12 MB/s",
			"tx_mb_s":          "0.08 MB/s",
			"total_messages":   "1,420",
			"commands_tx":      "182",
			"updates_rx":       "1,640",
			"errors_count":     0,
		},
		"server": map[string]any{
			"version":        "1.0.0",
			"title":          "SmartHome Relay Server",
			"subtitle":       "Edge Broker v1.0.0",
			"uptime_sec":     7292,
			"platform":       "SmartHome Edge Broker (MediaTek MT7986A Filogic 830)",
			"central_online": isCentralOnline,
		},
	}
}

// ------------------- Offline Sync Spool -------------------

func (db *DB) SpoolSyncEvent(eventType string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	db.mu.Lock()
	defer db.mu.Unlock()

	_, err = db.Exec(`
		INSERT INTO offline_sync_spool (event_type, payload_json, created_at, status)
		VALUES (?, ?, ?, 'PENDING')
	`, eventType, string(data), float64(time.Now().Unix()))
	return err
}

func (db *DB) GetAllTuyaDevices() ([]TuyaDeviceRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	rows, err := db.Query(`
		SELECT id, name, ip, local_key, protocol_version, category, model, is_active, created_at, updated_at
		FROM tuya_devices ORDER BY name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []TuyaDeviceRecord
	for rows.Next() {
		var t TuyaDeviceRecord
		if err := rows.Scan(&t.ID, &t.Name, &t.IP, &t.LocalKey, &t.ProtocolVersion, &t.Category, &t.Model, &t.IsActive, &t.CreatedAt, &t.UpdatedAt); err == nil {
			list = append(list, t)
		}
	}
	return list, nil
}


// =========================================================================
// ⚡ ENERGY & POWER CONSUMPTION ANALYTICS (P3 / CS-F1 PARITY)
// =========================================================================

type EnergySettings struct {
	TariffRate    float64 `json:"tariff_rate"`
	Currency      string  `json:"currency"`
	MonthlyBudget float64 `json:"monthly_budget"`
}

type EnergySnapshot struct {
	ID               int64   `json:"id"`
	Timestamp        string  `json:"timestamp"`
	NodeID           string  `json:"node_id"`
	Source           string  `json:"source"`
	VoltageV         float64 `json:"voltage_v"`
	CurrentA         float64 `json:"current_a"`
	PowerW           float64 `json:"power_w"`
	PowerFactor      float64 `json:"power_factor"`
	FrequencyHz      float64 `json:"frequency_hz"`
	TotalEnergyKWh   float64 `json:"total_energy_kwh"`
	DeltaEnergyKWh   float64 `json:"delta_energy_kwh"`
	LeakageCurrentMA float64 `json:"leakage_current_ma"`
	TemperatureC     float64 `json:"temperature_c"`
}

type EnergySummary struct {
	Current   map[string]any `json:"current"`
	Today     map[string]any `json:"today"`
	Last24h   map[string]any `json:"last_24h"`
	Yesterday map[string]any `json:"yesterday"`
	ThisMonth map[string]any `json:"this_month"`
	Settings  EnergySettings `json:"settings"`
}

type EnergyHistorySlot struct {
	TimeSlot    string  `json:"time_slot"`
	Label       string  `json:"label"`
	KWh         float64 `json:"kwh"`
	AvgPowerW   float64 `json:"avg_power_w"`
	PeakPowerW  float64 `json:"peak_power_w"`
	AvgVoltageV float64 `json:"avg_voltage_v"`
}

func (db *DB) GetEnergySettings() EnergySettings {
	db.mu.RLock()
	defer db.mu.RUnlock()

	settings := EnergySettings{
		TariffRate:    0.15,
		Currency:      "$",
		MonthlyBudget: 50.0,
	}

	rows, err := db.Query(`SELECT key, value FROM energy_settings`)
	if err != nil {
		return settings
	}
	defer rows.Close()

	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			switch k {
			case "tariff_rate":
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					settings.TariffRate = f
				}
			case "currency":
				if v != "" {
					settings.Currency = v
				}
			case "monthly_budget":
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					settings.MonthlyBudget = f
				}
			}
		}
	}
	return settings
}

func (db *DB) UpdateEnergySettings(newSettings map[string]any) (EnergySettings, error) {
	db.mu.Lock()
	defer db.mu.Unlock()

	for k, v := range newSettings {
		valStr := fmt.Sprintf("%v", v)
		_, _ = db.Exec(`
			INSERT INTO energy_settings (key, value, updated_at)
			VALUES (?, ?, datetime('now', 'localtime'))
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
		`, k, valStr)
	}

	// Re-read settings
	settings := EnergySettings{
		TariffRate:    0.15,
		Currency:      "$",
		MonthlyBudget: 50.0,
	}
	rows, err := db.Query(`SELECT key, value FROM energy_settings`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			if err := rows.Scan(&k, &v); err == nil {
				switch k {
				case "tariff_rate":
					if f, err := strconv.ParseFloat(v, 64); err == nil {
						settings.TariffRate = f
					}
				case "currency":
					if v != "" {
						settings.Currency = v
					}
				case "monthly_budget":
					if f, err := strconv.ParseFloat(v, 64); err == nil {
						settings.MonthlyBudget = f
					}
				}
			}
		}
	}
	return settings, nil
}

func (db *DB) RecordEnergySnapshot(data map[string]any) (int64, float64, error) {
	nodeID := fmt.Sprintf("%v", data["nodeId"])
	if nodeID == "" || nodeID == "<nil>" {
		nodeID = "NODE-30487DE85D5C"
	}
	source := "tuya_breaker"
	if s, ok := data["source"].(string); ok && s != "" {
		source = s
	}

	toF := func(v any) float64 {
		if v == nil {
			return 0
		}
		switch val := v.(type) {
		case float64:
			return val
		case float32:
			return float64(val)
		case int:
			return float64(val)
		case int64:
			return float64(val)
		case string:
			f, _ := strconv.ParseFloat(val, 64)
			return f
		default:
			return 0
		}
	}

	voltageV := toF(data["voltage_v"])
	currentA := toF(data["current_a"])
	powerW := toF(data["power_w"])
	powerFactor := toF(data["power_factor"])
	if powerFactor == 0 {
		powerFactor = 0.92
	}
	frequencyHz := toF(data["frequency_hz"])
	if frequencyHz == 0 {
		frequencyHz = 50.0
	}
	totalEnergyKWh := toF(data["total_energy_kwh"])
	leakageCurrentMA := toF(data["leakage_current_ma"])
	temperatureC := toF(data["temperature_c"])

	db.mu.Lock()
	defer db.mu.Unlock()

	// Check previous snapshot for delta calculation
	var prevID int64
	var prevTotal, prevPower float64
	var elapsedSec int64

	row := db.QueryRow(`
		SELECT id, total_energy_kwh, power_w,
		       (strftime('%s', 'now', 'localtime') - strftime('%s', timestamp)) as elapsed_sec
		FROM energy_history
		WHERE node_id = ?
		ORDER BY id DESC LIMIT 1
	`, nodeID)

	deltaEnergyKWh := 0.0
	if err := row.Scan(&prevID, &prevTotal, &prevPower, &elapsedSec); err == nil && prevID > 0 {
		// Throttle: Skip if less than 20 seconds elapsed and power changed by < 25W
		if elapsedSec < 20 && mathAbs(powerW-prevPower) < 25 {
			return prevID, 0, nil
		}

		// Calculate high-resolution active power delta: E = (P_avg * elapsed_sec) / (3600 * 1000)
		avgPower := (powerW + prevPower) / 2.0
		if elapsedSec > 0 && avgPower > 0 {
			effElapsed := elapsedSec
			if effElapsed > 300 {
				effElapsed = 300
			}
			deltaEnergyKWh = mathRound((avgPower*float64(effElapsed))/3600000.0, 5)
		}

		if totalEnergyKWh > prevTotal && prevTotal > 0 {
			meterDelta := totalEnergyKWh - prevTotal
			if meterDelta > 0 && meterDelta < 50 && elapsedSec > 300 {
				deltaEnergyKWh = mathRound(meterDelta, 4)
			}
		}
	} else {
		// First record: baseline delta
		deltaEnergyKWh = 0.001
	}

	res, err := db.Exec(`
		INSERT INTO energy_history (
			node_id, source, voltage_v, current_a, power_w, power_factor,
			frequency_hz, total_energy_kwh, delta_energy_kwh, leakage_current_ma,
			temperature_c, interval_type
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'raw')
	`, nodeID, source, voltageV, currentA, powerW, powerFactor, frequencyHz, totalEnergyKWh, deltaEnergyKWh, leakageCurrentMA, temperatureC)
	if err != nil {
		return 0, 0, err
	}

	id, _ := res.LastInsertId()
	return id, deltaEnergyKWh, nil
}

func (db *DB) GetEnergySummary(nodeID string) EnergySummary {
	settings := db.GetEnergySettings()

	db.mu.RLock()
	defer db.mu.RUnlock()

	summary := EnergySummary{
		Current: map[string]any{
			"power_w":            0.0,
			"voltage_v":          0.0,
			"current_a":          0.0,
			"total_energy_kwh":   0.0,
			"leakage_current_ma": 0.0,
			"power_factor":       1.0,
			"frequency_hz":       50.0,
			"temperature_c":      0.0,
			"timestamp":          time.Now().Format("2006-01-02 15:04:05"),
		},
		Today: map[string]any{
			"kwh":    0.0,
			"cost":   0.0,
			"peak_w": 0.0,
			"avg_w":  0.0,
			"avg_v":  0.0,
		},
		Last24h: map[string]any{
			"total_kwh":       0.0,
			"cost":            0.0,
			"mean_hourly_kwh": 0.0,
			"peak_w":          0.0,
			"mean_power_w":    0.0,
			"mean_voltage_v":  0.0,
		},
		Yesterday: map[string]any{
			"kwh":    0.0,
			"cost":   0.0,
			"peak_w": 0.0,
		},
		ThisMonth: map[string]any{
			"kwh":            0.0,
			"cost":           0.0,
			"projected_kwh":  0.0,
			"projected_cost": 0.0,
		},
		Settings: settings,
	}

	// 1. Latest real-time snapshot
	queryLatest := `SELECT power_w, voltage_v, current_a, total_energy_kwh, leakage_current_ma, power_factor, frequency_hz, temperature_c, timestamp
		FROM energy_history ORDER BY id DESC LIMIT 1`
	var (
		pw, vv, ca, tek, lma, pf, fhz, tc float64
		ts                                string
	)
	var errLatest error
	if nodeID != "" {
		queryLatest = `SELECT power_w, voltage_v, current_a, total_energy_kwh, leakage_current_ma, power_factor, frequency_hz, temperature_c, timestamp
			FROM energy_history WHERE node_id = ? ORDER BY id DESC LIMIT 1`
		errLatest = db.QueryRow(queryLatest, nodeID).Scan(&pw, &vv, &ca, &tek, &lma, &pf, &fhz, &tc, &ts)
	} else {
		errLatest = db.QueryRow(queryLatest).Scan(&pw, &vv, &ca, &tek, &lma, &pf, &fhz, &tc, &ts)
	}
	if errLatest == nil {
		summary.Current = map[string]any{
			"power_w":            pw,
			"voltage_v":          vv,
			"current_a":          ca,
			"total_energy_kwh":   tek,
			"leakage_current_ma": lma,
			"power_factor":       pf,
			"frequency_hz":       fhz,
			"temperature_c":      tc,
			"timestamp":          ts,
		}
	}

	// 2. Today's total delta kWh
	queryToday := `SELECT COALESCE(SUM(delta_energy_kwh), 0) as kwh, MAX(power_w) as peak_w, AVG(voltage_v) as avg_v, AVG(power_w) as avg_w
		FROM energy_history WHERE date(timestamp) = date('now', 'localtime')`
	var (
		todayKwh, todayPeak, todayAvgV, todayAvgW float64
	)
	var errToday error
	if nodeID != "" {
		queryToday = `SELECT COALESCE(SUM(delta_energy_kwh), 0) as kwh, MAX(power_w) as peak_w, AVG(voltage_v) as avg_v, AVG(power_w) as avg_w
			FROM energy_history WHERE date(timestamp) = date('now', 'localtime') AND node_id = ?`
		errToday = db.QueryRow(queryToday, nodeID).Scan(&todayKwh, &todayPeak, &todayAvgV, &todayAvgW)
	} else {
		errToday = db.QueryRow(queryToday).Scan(&todayKwh, &todayPeak, &todayAvgV, &todayAvgW)
	}
	if errToday == nil {
		todayKwh = mathRound(todayKwh, 3)
		summary.Today = map[string]any{
			"kwh":    todayKwh,
			"cost":   mathRound(todayKwh*settings.TariffRate, 2),
			"peak_w": todayPeak,
			"avg_w":  mathRound(todayAvgW, 1),
			"avg_v":  mathRound(todayAvgV, 1),
		}
	}

	// 3. Yesterday's total delta kWh
	queryYesterday := `SELECT COALESCE(SUM(delta_energy_kwh), 0) as kwh, MAX(power_w) as peak_w
		FROM energy_history WHERE date(timestamp) = date('now', 'localtime', '-1 day')`
	var (
		yestKwh, yestPeak float64
	)
	var errYest error
	if nodeID != "" {
		queryYesterday = `SELECT COALESCE(SUM(delta_energy_kwh), 0) as kwh, MAX(power_w) as peak_w
			FROM energy_history WHERE date(timestamp) = date('now', 'localtime', '-1 day') AND node_id = ?`
		errYest = db.QueryRow(queryYesterday, nodeID).Scan(&yestKwh, &yestPeak)
	} else {
		errYest = db.QueryRow(queryYesterday).Scan(&yestKwh, &yestPeak)
	}
	if errYest == nil {
		yestKwh = mathRound(yestKwh, 3)
		summary.Yesterday = map[string]any{
			"kwh":    yestKwh,
			"cost":   mathRound(yestKwh*settings.TariffRate, 2),
			"peak_w": yestPeak,
		}
	}

	// 4. Rolling 24 Hours summary metrics
	query24h := `SELECT COALESCE(SUM(delta_energy_kwh), 0) as kwh, MAX(power_w) as peak_w, AVG(voltage_v) as avg_v, AVG(power_w) as avg_w
		FROM energy_history WHERE timestamp >= datetime('now', 'localtime', '-24 hours')`
	var (
		k24, p24, v24, w24 float64
	)
	var err24h error
	if nodeID != "" {
		query24h = `SELECT COALESCE(SUM(delta_energy_kwh), 0) as kwh, MAX(power_w) as peak_w, AVG(voltage_v) as avg_v, AVG(power_w) as avg_w
			FROM energy_history WHERE timestamp >= datetime('now', 'localtime', '-24 hours') AND node_id = ?`
		err24h = db.QueryRow(query24h, nodeID).Scan(&k24, &p24, &v24, &w24)
	} else {
		err24h = db.QueryRow(query24h).Scan(&k24, &p24, &v24, &w24)
	}
	if err24h == nil {
		k24 = mathRound(k24, 3)
		summary.Last24h = map[string]any{
			"total_kwh":       k24,
			"cost":            mathRound(k24*settings.TariffRate, 2),
			"mean_hourly_kwh": mathRound(k24/24.0, 4),
			"peak_w":          p24,
			"mean_power_w":    mathRound(w24, 1),
			"mean_voltage_v":  mathRound(v24, 1),
		}
	}

	// 5. This Month's total delta kWh & projections
	queryMonth := `SELECT COALESCE(SUM(delta_energy_kwh), 0) as kwh, MAX(power_w) as peak_w
		FROM energy_history WHERE strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now', 'localtime')`
	var (
		monthKwh, monthPeak float64
	)
	var errMonth error
	if nodeID != "" {
		queryMonth = `SELECT COALESCE(SUM(delta_energy_kwh), 0) as kwh, MAX(power_w) as peak_w
			FROM energy_history WHERE strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now', 'localtime') AND node_id = ?`
		errMonth = db.QueryRow(queryMonth, nodeID).Scan(&monthKwh, &monthPeak)
	} else {
		errMonth = db.QueryRow(queryMonth).Scan(&monthKwh, &monthPeak)
	}
	if errMonth == nil {
		monthKwh = mathRound(monthKwh, 3)
		dayOfMonth := time.Now().Day()
		if dayOfMonth < 1 {
			dayOfMonth = 1
		}
		projKwh := mathRound((monthKwh/float64(dayOfMonth))*30.0, 2)
		summary.ThisMonth = map[string]any{
			"kwh":            monthKwh,
			"cost":           mathRound(monthKwh*settings.TariffRate, 2),
			"projected_kwh":  projKwh,
			"projected_cost": mathRound(projKwh*settings.TariffRate, 2),
		}
	}

	return summary
}

func (db *DB) GetEnergyHistory(rangeStr string, nodeID string) []EnergyHistorySlot {
	db.mu.RLock()
	defer db.mu.RUnlock()

	now := time.Now()
	var slots []EnergyHistorySlot

	if rangeStr == "7d" || rangeStr == "30d" {
		days := 7
		if rangeStr == "30d" {
			days = 30
		}

		rowMap := make(map[string]EnergyHistorySlot)
		q := `SELECT date(timestamp) as slot,
		             strftime('%m/%d', timestamp) as lbl,
		             ROUND(SUM(delta_energy_kwh), 3) as kwh,
		             ROUND(AVG(power_w), 1) as avg_w,
		             ROUND(MAX(power_w), 1) as peak_w,
		             ROUND(AVG(voltage_v), 1) as avg_v
		      FROM energy_history
		      WHERE timestamp >= datetime('now', 'localtime', ? || ' days')
		      GROUP BY slot ORDER BY slot ASC`
		var rows *sql.Rows
		var err error
		if nodeID != "" {
			q = `SELECT date(timestamp) as slot,
			             strftime('%m/%d', timestamp) as lbl,
			             ROUND(SUM(delta_energy_kwh), 3) as kwh,
			             ROUND(AVG(power_w), 1) as avg_w,
			             ROUND(MAX(power_w), 1) as peak_w,
			             ROUND(AVG(voltage_v), 1) as avg_v
			      FROM energy_history
			      WHERE timestamp >= datetime('now', 'localtime', ? || ' days') AND node_id = ?
			      GROUP BY slot ORDER BY slot ASC`
			rows, err = db.Query(q, fmt.Sprintf("-%d", days), nodeID)
		} else {
			rows, err = db.Query(q, fmt.Sprintf("-%d", days))
		}
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var s EnergyHistorySlot
				if err := rows.Scan(&s.TimeSlot, &s.Label, &s.KWh, &s.AvgPowerW, &s.PeakPowerW, &s.AvgVoltageV); err == nil {
					rowMap[s.TimeSlot] = s
				}
			}
		}

		for i := days - 1; i >= 0; i-- {
			d := now.AddDate(0, 0, -i)
			slotKey := d.Format("2006-01-02")
			lbl := d.Format("01/02")

			if existing, ok := rowMap[slotKey]; ok {
				slots = append(slots, existing)
			} else {
				slots = append(slots, EnergyHistorySlot{
					TimeSlot:    slotKey,
					Label:       lbl,
					KWh:         0,
					AvgPowerW:   0,
					PeakPowerW:  0,
					AvgVoltageV: 0,
				})
			}
		}
		return slots
	}

	// Default: 24h continuous hourly timeline
	rowMap := make(map[string]EnergyHistorySlot)
	q := `SELECT strftime('%Y-%m-%d %H:00', timestamp) as slot,
	             strftime('%H:00', timestamp) as lbl,
	             ROUND(SUM(delta_energy_kwh), 3) as kwh,
	             ROUND(AVG(power_w), 1) as avg_w,
	             ROUND(MAX(power_w), 1) as peak_w,
	             ROUND(AVG(voltage_v), 1) as avg_v
	      FROM energy_history
	      WHERE timestamp >= datetime('now', 'localtime', '-24 hours')
	      GROUP BY slot ORDER BY slot ASC`
	var rows *sql.Rows
	var err error
	if nodeID != "" {
		q = `SELECT strftime('%Y-%m-%d %H:00', timestamp) as slot,
		             strftime('%H:00', timestamp) as lbl,
		             ROUND(SUM(delta_energy_kwh), 3) as kwh,
		             ROUND(AVG(power_w), 1) as avg_w,
		             ROUND(MAX(power_w), 1) as peak_w,
		             ROUND(AVG(voltage_v), 1) as avg_v
		      FROM energy_history
		      WHERE timestamp >= datetime('now', 'localtime', '-24 hours') AND node_id = ?
		      GROUP BY slot ORDER BY slot ASC`
		rows, err = db.Query(q, nodeID)
	} else {
		rows, err = db.Query(q)
	}
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var s EnergyHistorySlot
			if err := rows.Scan(&s.TimeSlot, &s.Label, &s.KWh, &s.AvgPowerW, &s.PeakPowerW, &s.AvgVoltageV); err == nil {
				rowMap[s.TimeSlot] = s
			}
		}
	}

	for i := 23; i >= 0; i-- {
		t := now.Add(-time.Duration(i) * time.Hour)
		slotKey := t.Format("2006-01-02 15:00")
		lbl := t.Format("15:00")

		if existing, ok := rowMap[slotKey]; ok {
			slots = append(slots, existing)
		} else {
			slots = append(slots, EnergyHistorySlot{
				TimeSlot:    slotKey,
				Label:       lbl,
				KWh:         0,
				AvgPowerW:   0,
				PeakPowerW:  0,
				AvgVoltageV: 0,
			})
		}
	}

	return slots
}

func mathAbs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func mathRound(val float64, precision int) float64 {
	p := mathPow10(precision)
	return float64(int64(val*p+0.5)) / p
}

func mathPow10(n int) float64 {
	r := 1.0
	for i := 0; i < n; i++ {
		r *= 10.0
	}
	return r
}

func mathSin(x float64) float64 {
	// Simple Taylor approximation for baseline curve
	for x > 3.14159265 {
		x -= 2 * 3.14159265
	}
	for x < -3.14159265 {
		x += 2 * 3.14159265
	}
	return x - (x*x*x)/6.0 + (x*x*x*x*x)/120.0
}

// --- Firmware & OTA Data Operations ---

type FirmwareRecord struct {
	ID             int64  `json:"id"`
	Version        string `json:"version"`
	HardwareType   string `json:"hardware_type"`
	Filename       string `json:"filename"`
	Notes          string `json:"notes"`
	FileSizeBytes  int64  `json:"file_size_bytes"`
	ChecksumMD5    string `json:"checksum_md5"`
	ChecksumSHA256 string `json:"checksum_sha256"`
	FilePath       string `json:"file_path"`
	UploadedAt     string `json:"uploaded_at"`
	ReleaseChannel string `json:"release_channel"`
	IsLatest       int    `json:"is_latest"`
}

type NodeBackupRecord struct {
	ID              int64  `json:"id"`
	NodeID          string `json:"node_id"`
	NodeName        string `json:"node_name"`
	FirmwareVersion string `json:"firmware_version"`
	BackupType      string `json:"backup_type"`
	BackupPath      string `json:"backup_path"`
	FileSizeBytes   int64  `json:"file_size_bytes"`
	SnapshotJSON    string `json:"snapshot_json,omitempty"`
	CreatedAt       string `json:"created_at"`
}

type OtaHistoryRecord struct {
	ID               int64   `json:"id"`
	NodeID           string  `json:"node_id"`
	NodeName         string  `json:"node_name"`
	FirmwareID       *int64  `json:"firmware_id"`
	FirmwareFilename string  `json:"firmware_filename"`
	VersionFrom      string  `json:"version_from"`
	VersionTo        string  `json:"version_to"`
	Status           string  `json:"status"`
	BackupID         *int64  `json:"backup_id"`
	DurationMs       int64   `json:"duration_ms"`
	Details          string  `json:"details"`
	ErrorMessage     string  `json:"error_message"`
	CreatedAt        string  `json:"created_at"`
}

func (db *DB) GetAllFirmware() ([]FirmwareRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	rows, err := db.Query(`
		SELECT id, version, COALESCE(hardware_type, 'ESP8266'), filename, COALESCE(notes, ''),
		       COALESCE(file_size_bytes, 0), COALESCE(checksum_md5, ''), COALESCE(checksum_sha256, ''),
		       COALESCE(file_path, ''), COALESCE(uploaded_at, ''), COALESCE(release_channel, 'LTS'),
		       COALESCE(is_latest, 0)
		FROM firmware ORDER BY id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []FirmwareRecord
	for rows.Next() {
		var f FirmwareRecord
		if err := rows.Scan(
			&f.ID, &f.Version, &f.HardwareType, &f.Filename, &f.Notes,
			&f.FileSizeBytes, &f.ChecksumMD5, &f.ChecksumSHA256,
			&f.FilePath, &f.UploadedAt, &f.ReleaseChannel, &f.IsLatest,
		); err != nil {
			return nil, err
		}
		list = append(list, f)
	}
	if list == nil {
		list = []FirmwareRecord{}
	}
	return list, nil
}

func (db *DB) GetFirmware(id int64) (*FirmwareRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	row := db.QueryRow(`
		SELECT id, version, COALESCE(hardware_type, 'ESP8266'), filename, COALESCE(notes, ''),
		       COALESCE(file_size_bytes, 0), COALESCE(checksum_md5, ''), COALESCE(checksum_sha256, ''),
		       COALESCE(file_path, ''), COALESCE(uploaded_at, ''), COALESCE(release_channel, 'LTS'),
		       COALESCE(is_latest, 0)
		FROM firmware WHERE id = ?
	`, id)

	var f FirmwareRecord
	if err := row.Scan(
		&f.ID, &f.Version, &f.HardwareType, &f.Filename, &f.Notes,
		&f.FileSizeBytes, &f.ChecksumMD5, &f.ChecksumSHA256,
		&f.FilePath, &f.UploadedAt, &f.ReleaseChannel, &f.IsLatest,
	); err != nil {
		return nil, err
	}
	return &f, nil
}

func (db *DB) AddFirmware(f FirmwareRecord) (int64, error) {
	db.mu.Lock()
	defer db.mu.Unlock()

	nowStr := time.Now().UTC().Format(time.RFC3339)
	res, err := db.Exec(`
		INSERT INTO firmware (
			filename, version, hardware_type, release_channel, notes,
			file_size_bytes, checksum_md5, checksum_sha256, file_path, uploaded_at, is_latest
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
	`, f.Filename, f.Version, f.HardwareType, f.ReleaseChannel, f.Notes,
		f.FileSizeBytes, f.ChecksumMD5, f.ChecksumSHA256, f.FilePath, nowStr)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) DeleteFirmware(id int64) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	_, err := db.Exec("DELETE FROM firmware WHERE id = ?", id)
	return err
}

func (db *DB) GetNodeBackups(nodeID string) ([]NodeBackupRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	var rows *sql.Rows
	var err error
	if nodeID != "" {
		rows, err = db.Query(`
			SELECT id, node_id, COALESCE(node_name, ''), COALESCE(firmware_version, '1.6.0'),
			       COALESCE(backup_type, 'PRE_OTA'), COALESCE(backup_path, ''),
			       COALESCE(file_size_bytes, 0), COALESCE(created_at, '')
			FROM node_backups WHERE node_id = ? ORDER BY id DESC
		`, nodeID)
	} else {
		rows, err = db.Query(`
			SELECT id, node_id, COALESCE(node_name, ''), COALESCE(firmware_version, '1.6.0'),
			       COALESCE(backup_type, 'PRE_OTA'), COALESCE(backup_path, ''),
			       COALESCE(file_size_bytes, 0), COALESCE(created_at, '')
			FROM node_backups ORDER BY id DESC
		`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []NodeBackupRecord
	for rows.Next() {
		var b NodeBackupRecord
		if err := rows.Scan(
			&b.ID, &b.NodeID, &b.NodeName, &b.FirmwareVersion,
			&b.BackupType, &b.BackupPath, &b.FileSizeBytes, &b.CreatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, b)
	}
	if list == nil {
		list = []NodeBackupRecord{}
	}
	return list, nil
}

func (db *DB) GetNodeBackup(id int64) (*NodeBackupRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	row := db.QueryRow(`
		SELECT id, node_id, COALESCE(node_name, ''), COALESCE(firmware_version, '1.6.0'),
		       COALESCE(backup_type, 'PRE_OTA'), COALESCE(backup_path, ''),
		       COALESCE(file_size_bytes, 0), COALESCE(snapshot_json, '{}'), COALESCE(created_at, '')
		FROM node_backups WHERE id = ?
	`, id)

	var b NodeBackupRecord
	if err := row.Scan(
		&b.ID, &b.NodeID, &b.NodeName, &b.FirmwareVersion,
		&b.BackupType, &b.BackupPath, &b.FileSizeBytes, &b.SnapshotJSON, &b.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &b, nil
}

func (db *DB) AddNodeBackup(b NodeBackupRecord) (int64, error) {
	db.mu.Lock()
	defer db.mu.Unlock()

	nowStr := time.Now().UTC().Format(time.RFC3339)
	if b.CreatedAt == "" {
		b.CreatedAt = nowStr
	}
	res, err := db.Exec(`
		INSERT INTO node_backups (
			node_id, node_name, firmware_version, backup_type, backup_path, file_size_bytes, snapshot_json, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, b.NodeID, b.NodeName, b.FirmwareVersion, b.BackupType, b.BackupPath, b.FileSizeBytes, b.SnapshotJSON, b.CreatedAt)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) DeleteNodeBackup(id int64) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	_, err := db.Exec("DELETE FROM node_backups WHERE id = ?", id)
	return err
}

func (db *DB) GetOtaHistory(limit int) ([]OtaHistoryRecord, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if limit <= 0 {
		limit = 50
	}
	rows, err := db.Query(`
		SELECT id, node_id, COALESCE(node_name, ''), firmware_id, COALESCE(firmware_filename, ''),
		       COALESCE(version_from, '1.6.0'), COALESCE(version_to, '1.6.0'), COALESCE(status, 'PENDING'),
		       backup_id, COALESCE(duration_ms, 0), COALESCE(details, ''), COALESCE(error_message, ''),
		       COALESCE(created_at, '')
		FROM ota_history ORDER BY id DESC LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []OtaHistoryRecord
	for rows.Next() {
		var h OtaHistoryRecord
		if err := rows.Scan(
			&h.ID, &h.NodeID, &h.NodeName, &h.FirmwareID, &h.FirmwareFilename,
			&h.VersionFrom, &h.VersionTo, &h.Status, &h.BackupID, &h.DurationMs,
			&h.Details, &h.ErrorMessage, &h.CreatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, h)
	}
	if list == nil {
		list = []OtaHistoryRecord{}
	}
	return list, nil
}

func (db *DB) AddOtaHistory(h OtaHistoryRecord) (int64, error) {
	db.mu.Lock()
	defer db.mu.Unlock()

	nowStr := time.Now().UTC().Format(time.RFC3339)
	if h.CreatedAt == "" {
		h.CreatedAt = nowStr
	}
	res, err := db.Exec(`
		INSERT INTO ota_history (
			node_id, node_name, firmware_id, firmware_filename, version_from, version_to,
			status, backup_id, duration_ms, details, error_message, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, h.NodeID, h.NodeName, h.FirmwareID, h.FirmwareFilename, h.VersionFrom, h.VersionTo,
		h.Status, h.BackupID, h.DurationMs, h.Details, h.ErrorMessage, h.CreatedAt)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) UpdateNodeFirmwareVersion(nodeID, version string) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	_, err := db.Exec("UPDATE nodes SET firmware_version = ? WHERE node_id = ?", version, nodeID)
	return err
}

func (db *DB) UpdateOtaHistory(id int64, status string, durationMs int64, details string, errorMsg string, backupID *int64) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	query := "UPDATE ota_history SET status = ?, duration_ms = ?, details = ?, error_message = ?"
	args := []interface{}{status, durationMs, details, errorMsg}
	if backupID != nil {
		query += ", backup_id = ?"
		args = append(args, *backupID)
	}
	query += " WHERE id = ?"
	args = append(args, id)

	_, err := db.Exec(query, args...)
	return err
}
