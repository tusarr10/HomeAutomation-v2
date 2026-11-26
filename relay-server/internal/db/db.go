package db

import (
	"crypto/rand"
	"crypto/sha512"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/pbkdf2"
	_ "modernc.org/sqlite"
)

type DB struct {
	*sql.DB
	path string
	mu   sync.RWMutex
}

func Open(dbPath string) (*DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create db directory: %w", err)
	}

	dsn := fmt.Sprintf("%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=cache_size(-2000)&_pragma=foreign_keys(ON)", dbPath)
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	conn.SetMaxOpenConns(10)
	conn.SetMaxIdleConns(5)

	db := &DB{
		DB:   conn,
		path: dbPath,
	}

	if err := db.initSchema(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	if err := db.seedDefaults(); err != nil {
		log.Printf("[DB] Warning: seeding defaults: %v", err)
	}

	return db, nil
}

func (db *DB) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS nodes (
		node_id TEXT PRIMARY KEY,
		name TEXT,
		hardware_type TEXT DEFAULT 'ESP8266',
		firmware_version TEXT DEFAULT '1.6.0',
		ip_address TEXT,
		mac_address TEXT,
		gateway TEXT,
		rssi INTEGER DEFAULT 0,
		uptime_sec INTEGER DEFAULT 0,
		free_heap INTEGER DEFAULT 0,
		is_online INTEGER DEFAULT 1,
		status TEXT DEFAULT 'Online',
		room TEXT DEFAULT 'General',
		location TEXT DEFAULT 'Home',
		category TEXT DEFAULT 'Controller',
		last_seen_epoch REAL,
		last_seen_str TEXT,
		channels_json TEXT,
		created_at REAL,
		device_group TEXT DEFAULT 'DEFAULT',
		mcu_type TEXT DEFAULT 'ESP8266',
		flash_capacity INTEGER DEFAULT 4194304,
		littlefs_total INTEGER DEFAULT 0,
		littlefs_used INTEGER DEFAULT 0,
		littlefs_available INTEGER DEFAULT 0,
		wifi_ssid TEXT DEFAULT '',
		auth_username TEXT DEFAULT 'admin',
		auth_password TEXT DEFAULT 'admin',
		home_id INTEGER DEFAULT 1,
		room_id INTEGER DEFAULT 1,
		assigned_at REAL,
		server_key TEXT,
		is_paired INTEGER DEFAULT 1,
		i2c_enabled INTEGER DEFAULT 0,
		i2c_address TEXT,
		pcf8574_detected INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS relays (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT NOT NULL,
		channel_id INTEGER NOT NULL,
		pin INTEGER NOT NULL,
		name TEXT,
		room TEXT DEFAULT 'General',
		function TEXT DEFAULT 'Relay',
		active_low INTEGER DEFAULT 1,
		initial_mode INTEGER DEFAULT 0,
		enabled INTEGER DEFAULT 1,
		current_state INTEGER DEFAULT 0,
		requested_state INTEGER DEFAULT 0,
		is_syncing INTEGER DEFAULT 0,
		last_changed_at TEXT,
		icon TEXT DEFAULT 'light',
		pin_mode TEXT DEFAULT 'RELAY_OUTPUT',
		sensor_type TEXT,
		sensor_unit TEXT,
		sensor_config_json TEXT DEFAULT '{}',
		last_sensor_value REAL,
		last_sensor_str TEXT,
		pos_x INTEGER,
		pos_y INTEGER,
		UNIQUE(node_id, channel_id)
	);

	CREATE TABLE IF NOT EXISTS relay_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT NOT NULL,
		channel_id INTEGER NOT NULL,
		old_state INTEGER,
		new_state INTEGER,
		trigger_source TEXT,
		timestamp TEXT,
		epoch REAL
	);

	CREATE TABLE IF NOT EXISTS sensors (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT NOT NULL,
		sensor_type TEXT,
		name TEXT,
		room TEXT DEFAULT 'General',
		current_value REAL DEFAULT 0,
		unit TEXT,
		min_threshold REAL,
		max_threshold REAL,
		last_read_at TEXT,
		pin INTEGER,
		config_json TEXT DEFAULT '{}',
		UNIQUE(node_id, sensor_type)
	);

	CREATE TABLE IF NOT EXISTS telemetry_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT NOT NULL,
		event_type TEXT,
		timestamp_str TEXT,
		epoch REAL,
		ip TEXT,
		rssi INTEGER,
		free_heap INTEGER,
		uptime_sec INTEGER,
		payload_json TEXT
	);

	CREATE TABLE IF NOT EXISTS audit_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp_str TEXT,
		epoch REAL,
		category TEXT,
		node_id TEXT,
		message TEXT
	);

	CREATE TABLE IF NOT EXISTS system_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT,
		category TEXT,
		severity TEXT DEFAULT 'INFO',
		description TEXT,
		execution_result TEXT DEFAULT 'SUCCESS',
		timestamp TEXT
	);

	CREATE TABLE IF NOT EXISTS notifications (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT,
		message TEXT,
		severity TEXT DEFAULT 'INFO',
		category TEXT DEFAULT 'SYSTEM',
		read INTEGER DEFAULT 0,
		timestamp TEXT
	);

	CREATE TABLE IF NOT EXISTS automations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT,
		description TEXT,
		trigger_type TEXT DEFAULT 'GPIO State Change',
		condition_logic TEXT DEFAULT 'ALL',
		conditions_json TEXT DEFAULT '[]',
		actions_json TEXT DEFAULT '[]',
		execution_count INTEGER DEFAULT 0,
		enabled INTEGER DEFAULT 1,
		created_at TEXT
	);

	CREATE TABLE IF NOT EXISTS firmware (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		filename TEXT NOT NULL,
		version TEXT NOT NULL,
		hardware_type TEXT DEFAULT 'ESP8266',
		release_channel TEXT DEFAULT 'LTS',
		notes TEXT DEFAULT '',
		file_size_bytes INTEGER DEFAULT 0,
		checksum_md5 TEXT,
		checksum_sha256 TEXT,
		file_path TEXT,
		uploaded_at TEXT,
		is_latest INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS node_backups (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT NOT NULL,
		node_name TEXT,
		firmware_version TEXT,
		backup_type TEXT DEFAULT 'PRE_OTA',
		backup_path TEXT NOT NULL,
		file_size_bytes INTEGER DEFAULT 0,
		snapshot_json TEXT,
		created_at TEXT
	);

	CREATE TABLE IF NOT EXISTS ota_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		node_id TEXT NOT NULL,
		node_name TEXT,
		firmware_id INTEGER,
		firmware_filename TEXT,
		version_from TEXT,
		version_to TEXT,
		status TEXT DEFAULT 'PENDING',
		backup_id INTEGER,
		duration_ms INTEGER DEFAULT 0,
		details TEXT,
		error_message TEXT,
		created_at TEXT
	);

	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		full_name TEXT,
		email TEXT,
		is_active INTEGER DEFAULT 1,
		is_superuser INTEGER DEFAULT 0,
		created_at TEXT,
		updated_at TEXT
	);

	CREATE TABLE IF NOT EXISTS roles (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL,
		description TEXT,
		is_system INTEGER DEFAULT 0,
		created_at TEXT
	);

	CREATE TABLE IF NOT EXISTS permissions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		code TEXT UNIQUE NOT NULL,
		name TEXT NOT NULL,
		category TEXT NOT NULL,
		description TEXT
	);

	CREATE TABLE IF NOT EXISTS role_permissions (
		role_id INTEGER NOT NULL,
		permission_id INTEGER NOT NULL,
		PRIMARY KEY (role_id, permission_id)
	);

	CREATE TABLE IF NOT EXISTS user_roles (
		user_id INTEGER NOT NULL,
		role_id INTEGER NOT NULL,
		PRIMARY KEY (user_id, role_id)
	);

	CREATE TABLE IF NOT EXISTS user_sessions (
		token TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		ip_address TEXT,
		user_agent TEXT,
		created_at TEXT,
		last_active_at TEXT,
		expires_at TEXT,
		is_revoked INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS homes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		description TEXT DEFAULT '',
		timezone TEXT DEFAULT 'UTC',
		address TEXT DEFAULT '',
		owner_user_id INTEGER,
		created_by INTEGER,
		is_archived INTEGER DEFAULT 0,
		created_at REAL,
		updated_at REAL
	);

	CREATE TABLE IF NOT EXISTS rooms (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		home_id INTEGER NOT NULL,
		name TEXT NOT NULL,
		floor TEXT DEFAULT 'Ground',
		icon TEXT DEFAULT 'room',
		layout_json TEXT DEFAULT '{}',
		remotes_json TEXT DEFAULT '[]',
		created_at REAL,
		updated_at REAL,
		UNIQUE(home_id, name)
	);

	CREATE TABLE IF NOT EXISTS tuya_devices (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		ip TEXT NOT NULL,
		local_key TEXT NOT NULL,
		protocol_version REAL DEFAULT 3.5,
		category TEXT DEFAULT 'breaker',
		model TEXT DEFAULT 'KB-A1H-A',
		mac TEXT,
		is_active INTEGER DEFAULT 0,
		created_at TEXT,
		updated_at TEXT
	);

	CREATE TABLE IF NOT EXISTS system_settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at TEXT
	);

	CREATE TABLE IF NOT EXISTS offline_sync_spool (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_type TEXT NOT NULL,
		payload_json TEXT NOT NULL,
		created_at REAL NOT NULL,
		status TEXT DEFAULT 'PENDING'
	);

	CREATE TABLE IF NOT EXISTS energy_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp TEXT DEFAULT (datetime('now', 'localtime')),
		node_id TEXT NOT NULL,
		source TEXT DEFAULT 'tuya_breaker',
		voltage_v REAL DEFAULT 0,
		current_a REAL DEFAULT 0,
		power_w REAL DEFAULT 0,
		power_factor REAL DEFAULT 1.0,
		frequency_hz REAL DEFAULT 50.0,
		total_energy_kwh REAL DEFAULT 0,
		delta_energy_kwh REAL DEFAULT 0,
		leakage_current_ma REAL DEFAULT 0,
		temperature_c REAL DEFAULT 0,
		interval_type TEXT DEFAULT 'raw'
	);
	CREATE INDEX IF NOT EXISTS idx_energy_history_time ON energy_history(timestamp);
	CREATE INDEX IF NOT EXISTS idx_energy_history_node ON energy_history(node_id);

	CREATE TABLE IF NOT EXISTS energy_settings (
		key TEXT PRIMARY KEY,
		value TEXT,
		updated_at TEXT DEFAULT (datetime('now', 'localtime'))
	);
	`

	_, err := db.Exec(schema)
	return err
}

func HashPassword(password string) string {
	salt := make([]byte, 16)
	rand.Read(salt)
	saltHex := hex.EncodeToString(salt)
	hash := pbkdf2.Key([]byte(password), []byte(saltHex), 100000, 64, sha512.New)
	return fmt.Sprintf("%s:%s", saltHex, hex.EncodeToString(hash))
}

func VerifyPassword(password, storedHash string) bool {
	if !strings.Contains(storedHash, ":") {
		return password == storedHash // fallback plaintext
	}
	parts := strings.SplitN(storedHash, ":", 2)
	saltHex := parts[0]
	expectedHash := parts[1]
	hash := pbkdf2.Key([]byte(password), []byte(saltHex), 100000, 64, sha512.New)
	return hex.EncodeToString(hash) == expectedHash
}

func (db *DB) seedDefaults() error {
	now := time.Now().UTC().Format(time.RFC3339)
	nowEpoch := float64(time.Now().Unix())

	// 1. Audit log
	var auditCount int
	db.QueryRow("SELECT COUNT(*) FROM audit_logs").Scan(&auditCount)
	if auditCount == 0 {
		db.Exec("INSERT INTO audit_logs (timestamp_str, epoch, category, node_id, message) VALUES (?, ?, 'SERVER_START', 'RelayEdge', 'Relay Edge Server DB initialized')", now, nowEpoch)
	}

	// 2. Default user (admin / admin123)
	var userCount int
	db.QueryRow("SELECT COUNT(*) FROM users").Scan(&userCount)
	if userCount == 0 {
		hash := HashPassword("admin123")
		res, err := db.Exec(`
			INSERT INTO users (username, password_hash, full_name, email, is_active, is_superuser, created_at, updated_at)
			VALUES ('admin', ?, 'System Administrator', 'admin@smarthome.local', 1, 1, ?, ?)
		`, hash, now, now)
		if err == nil {
			uid, _ := res.LastInsertId()
			db.Exec("INSERT INTO roles (name, description, is_system, created_at) VALUES ('SUPER_ADMIN', 'Super Administrator', 1, ?)", now)
			db.Exec("INSERT INTO user_roles (user_id, role_id) VALUES (?, 1)", uid)
		}
	}

	// 3. Default Home & Room
	var homeCount int
	db.QueryRow("SELECT COUNT(*) FROM homes").Scan(&homeCount)
	if homeCount == 0 {
		db.Exec(`
			INSERT INTO homes (id, name, description, timezone, created_at, updated_at)
			VALUES (1, 'Primary Residence', 'Edge Router Managed Home', 'UTC', ?, ?)
		`, nowEpoch, nowEpoch)
	}

	var roomCount int
	db.QueryRow("SELECT COUNT(*) FROM rooms").Scan(&roomCount)
	if roomCount == 0 {
		db.Exec(`
			INSERT INTO rooms (id, home_id, name, floor, icon, created_at, updated_at)
			VALUES (1, 1, 'Living Room', 'Ground', 'living_room', ?, ?)
		`, nowEpoch, nowEpoch)
		db.Exec(`
			INSERT INTO rooms (id, home_id, name, floor, icon, created_at, updated_at)
			VALUES (2, 1, 'Master Bedroom', '1st Floor', 'bedroom', ?, ?)
		`, nowEpoch, nowEpoch)
	}

	// 4. Default Tuya breaker entry if none exists
	var tuyaCount int
	db.QueryRow("SELECT COUNT(*) FROM tuya_devices").Scan(&tuyaCount)
	if tuyaCount == 0 {
		db.Exec(`
			INSERT INTO tuya_devices (id, name, ip, local_key, protocol_version, category, model, is_active, created_at, updated_at)
			VALUES ('ebf807205eb6db772fx1o7', 'Main Smart Breaker', '192.168.1.106', 'D\e~8;Uf3q/496zR', 3.5, 'breaker', 'KB-A1H-A', 1, ?, ?)
		`, now, now)
	}

		// Seed Energy Settings
	_, _ = db.Exec(`
		INSERT OR IGNORE INTO energy_settings (key, value) VALUES
		('tariff_rate', '0.15'),
		('currency', '$'),
		('monthly_budget', '50.0');
	`)

	return nil
}

// LogAudit logs an audit record
func (db *DB) LogAudit(category, nodeID, message string) {
	now := time.Now().UTC()
	db.Exec("INSERT INTO audit_logs (timestamp_str, epoch, category, node_id, message) VALUES (?, ?, ?, ?, ?)",
		now.Format(time.RFC3339), float64(now.Unix()), category, nodeID, message)
}

// LogSystemEvent logs a system event record
func (db *DB) LogSystemEvent(nodeID, category, severity, description string) {
	now := time.Now().UTC()
	db.Exec(`
		INSERT INTO system_events (node_id, category, severity, description, execution_result, timestamp)
		VALUES (?, ?, ?, ?, 'SUCCESS', ?)
	`, nodeID, category, severity, description, now.Format(time.RFC3339))
}

// LogRelayEvent logs a relay state change event
func (db *DB) LogRelayEvent(nodeID string, channelID, oldState, newState int, source string) {
	now := time.Now().UTC()
	db.Exec(`
		INSERT INTO relay_events (node_id, channel_id, old_state, new_state, trigger_source, timestamp, epoch)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, nodeID, channelID, oldState, newState, source, now.Format(time.RFC3339), float64(now.Unix()))
}
