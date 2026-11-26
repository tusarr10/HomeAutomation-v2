package db

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
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
		       COALESCE(rm.name, '') as room_name
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
		var homeName, roomName sql.NullString

		err := rows.Scan(
			&n.NodeID, &name, &hwType, &fwVer, &ip, &mac, &gw,
			&rssi, &uptime, &heap, &isOnline, &status, &room, &loc, &cat,
			&lastSeenEpoch, &lastSeenStr, &chJSON, &createdAt, &devGroup, &mcu,
			&flashCap, &lTotal, &lUsed, &lAvail, &wifi,
			&homeId, &roomId, &isPaired, &rCount,
			&homeName, &roomName,
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
			"host_ip":          "192.168.1.10",
			"cpu_percent":      14,
			"ram_percent":      48,
			"storage_percent":  28,
			"storage_used_gb":  36,
			"storage_total_gb": 128,
			"ram_used_gb":      15.3,
			"ram_total_gb":     31.8,
			"cpu_cores":        20,
			"cpu_used_cores":   "2.8",
			"uptime_sec":       7293,
			"uptime_str":       "2h 1m",
			"rx_mb_s":          "1.24 MB/s",
			"tx_mb_s":          "0.68 MB/s",
			"total_messages":   "2,916",
			"commands_tx":      "347",
			"updates_rx":       "3,263",
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
