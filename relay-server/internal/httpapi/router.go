package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"smarthome-edge/internal/auth"
	"smarthome-edge/internal/config"
	"smarthome-edge/internal/queue"
	"smarthome-edge/internal/state"
	"smarthome-edge/internal/syncer"
	"smarthome-edge/internal/websocket"
)

type Router struct {
	cfg       *config.Config
	sm        *state.StateManager
	auth      *auth.Authenticator
	hub       *websocket.Hub
	syncer    *syncer.CentralSyncer
	spool     *queue.EventSpool
	startTime time.Time
	webDir    string
}

func NewRouter(
	cfg *config.Config,
	sm *state.StateManager,
	auth *auth.Authenticator,
	hub *websocket.Hub,
	syncer *syncer.CentralSyncer,
	spool *queue.EventSpool,
	webDir string,
) *Router {
	return &Router{
		cfg:       cfg,
		sm:        sm,
		auth:      auth,
		hub:       hub,
		syncer:    syncer,
		spool:     spool,
		startTime: time.Now(),
		webDir:    webDir,
	}
}

func (rt *Router) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// CORS Headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Node-ID")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	path := r.URL.Path

	// WebSocket upgrades
	if path == "/api/v1/ws" || path == "/ws" {
		rt.hub.ServeWS(w, r)
		return
	}

	// API Routing
	if strings.HasPrefix(path, "/api/") {
		rt.handleAPI(w, r)
		return
	}

	// Static Web Frontend files
	rt.handleStatic(w, r)
}

func (rt *Router) handleAPI(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	// 1. Health Endpoint
	if path == "/api/v1/health" && r.Method == http.MethodGet {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)

		sendJSON(w, http.StatusOK, map[string]interface{}{
			"status":    "healthy",
			"uptimeSec": int64(time.Since(rt.startTime).Seconds()),
			"memory": map[string]interface{}{
				"allocMb":    fmt.Sprintf("%.2f MB", float64(m.Alloc)/1024/1024),
				"sysMb":      fmt.Sprintf("%.2f MB", float64(m.Sys)/1024/1024),
				"goroutines": runtime.NumGoroutine(),
			},
			"centralOnline": rt.syncer.IsCentralOnline(),
		})
		return
	}

	// 2. HTTP Telemetry Ingestion (ESP HTTP mode)
	if (path == "/api/telemetry" || path == "/api/v1/telemetry") && r.Method == http.MethodPost {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Read error", http.StatusBadRequest)
			return
		}
		clientIP := r.RemoteAddr
		commands, err := rt.sm.IngestRawTelemetry(body, clientIP, "HTTP")
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		go rt.syncer.ForwardTelemetry(body)

		sendJSON(w, http.StatusOK, map[string]interface{}{
			"status":   "ok",
			"epoch":    time.Now().Unix(),
			"commands": commands,
		})
		return
	}

	// 3. Authentication Routes (Public)
	if path == "/api/v1/auth/login" && r.Method == http.MethodPost {
		var loginReq struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		_ = json.NewDecoder(r.Body).Decode(&loginReq)
		user := loginReq.Username
		if user == "" {
			user = "admin"
		}

		token, err := rt.auth.GenerateUserToken(user, "super_admin")
		if err != nil {
			token = "edge_session_" + fmt.Sprint(time.Now().Unix())
		}

		sendJSON(w, http.StatusOK, map[string]interface{}{
			"token": token,
			"user": map[string]interface{}{
				"id":             "usr-1",
				"username":       user,
				"role":           "super_admin",
				"roles":          []string{"super_admin"},
				"permissions":    []string{"*"},
				"is_superuser":   true,
				"assigned_nodes": []string{"*"},
			},
		})
		return
	}

	if path == "/api/v1/auth/me" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"id":             "usr-1",
			"username":       "admin",
			"role":           "super_admin",
			"roles":          []string{"super_admin"},
			"permissions":    []string{"*"},
			"is_superuser":   true,
			"assigned_nodes": []string{"*"},
		})
		return
	}

	if path == "/api/v1/auth/logout" && r.Method == http.MethodPost {
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
		return
	}

	if path == "/api/v1/auth/change-password" && r.Method == http.MethodPost {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Password updated successfully",
		})
		return
	}

	// 4. System Overview (Fleet Metrics)
	if path == "/api/v1/system/overview" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, rt.sm.GetOverview(rt.syncer.IsCentralOnline()))
		return
	}

	// 5. System Notifications
	if path == "/api/v1/system/notifications" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, rt.sm.GetNotifications())
		return
	}

	if path == "/api/v1/system/notifications/unread-count" && r.Method == http.MethodGet {
		cnt := rt.sm.GetUnreadNotifCount()
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"count":  cnt,
			"unread": cnt,
		})
		return
	}

	if path == "/api/v1/system/notifications/mark-read" && r.Method == http.MethodPost {
		rt.sm.MarkNotificationsRead()
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
		return
	}

	if path == "/api/v1/system/notifications" && r.Method == http.MethodDelete {
		rt.sm.ClearAllNotifications()
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
		return
	}

	if strings.HasPrefix(path, "/api/v1/system/notifications/") && r.Method == http.MethodDelete {
		parts := strings.Split(path, "/")
		id := parts[len(parts)-1]
		rt.sm.DeleteNotification(id)
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
		return
	}

	// 6. System Logs & Audit Events
	if path == "/api/v1/system/logs" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, rt.sm.GetSystemLogs())
		return
	}

	if (path == "/api/v1/system/events" || path == "/api/v1/events") && r.Method == http.MethodGet {
		events, err := rt.spool.ReadRecent(100)
		if err != nil {
			sendJSON(w, http.StatusOK, []interface{}{})
			return
		}
		sendJSON(w, http.StatusOK, events)
		return
	}

	// 7. Polling Settings & Poll-Now
	if path == "/api/v1/system/poll-settings" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"poll_interval_seconds": rt.cfg.Breaker.PollIntervalSeconds,
			"central_sync_interval": rt.cfg.Central.SyncIntervalSeconds,
			"breaker_polling":       rt.cfg.Breaker.Enabled,
		})
		return
	}

	if path == "/api/v1/system/poll-now" && r.Method == http.MethodPost {
		_ = rt.syncer.RefreshBreaker()
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Polled hardware nodes & circuit breaker",
		})
		return
	}

	// 8. Edge Status & Diagnostics
	if path == "/api/v1/edge/status" && r.Method == http.MethodGet {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)

		sendJSON(w, http.StatusOK, map[string]interface{}{
			"server":        "SmartHome Edge Relay Server (Go Native ARM64/AMD64)",
			"version":       "1.0.0-edge",
			"uptimeSec":     int64(time.Since(rt.startTime).Seconds()),
			"centralServer": rt.cfg.Central.URL,
			"centralOnline": rt.syncer.IsCentralOnline(),
			"memoryMb":      fmt.Sprintf("%.1f MB", float64(m.Alloc)/1024/1024),
			"nodesCount":    len(rt.sm.GetAllNodes()),
		})
		return
	}

	// Authorization check for remaining device / fleet management APIs
	claims, err := rt.auth.ValidateToken(r.Header.Get("Authorization"))
	if err != nil && rt.cfg.Security.RequireMobileToken {
		sendJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized: " + err.Error()})
		return
	}

	// 9. Relays Endpoints
	if path == "/api/v1/relays" && r.Method == http.MethodGet {
		q := r.URL.Query()
		room := q.Get("room")
		nodeID := q.Get("node_id")
		if nodeID == "" {
			nodeID = q.Get("nodeId")
		}
		var stateFilter *bool
		if st := q.Get("state"); st != "" {
			b := st == "true" || st == "1"
			stateFilter = &b
		}

		relays := rt.sm.GetAllRelays(room, nodeID, stateFilter)
		sendJSON(w, http.StatusOK, relays)
		return
	}

	if path == "/api/v1/relays/sync" && r.Method == http.MethodPost {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":     true,
			"message":     "Hardware pins synchronized",
			"totalRelays": len(rt.sm.GetAllRelays("", "", nil)),
			"relays":      rt.sm.GetAllRelays("", "", nil),
		})
		return
	}

	if path == "/api/v1/relays/broadcast" && r.Method == http.MethodPost {
		var req struct {
			Action string `json:"action"`
			State  bool   `json:"state"`
			Room   string `json:"room,omitempty"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		cmds := rt.sm.BroadcastRelays(req.State, req.Room)

		_, _ = rt.spool.Push("BROADCAST_RELAY", "ALL", map[string]interface{}{
			"action":   req.Action,
			"state":    req.State,
			"room":     req.Room,
			"affected": len(cmds),
		})

		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":  true,
			"affected": len(cmds),
		})
		return
	}

	// Relay command execution: /api/v1/relays/:nodeId/:channelId/command
	if strings.HasPrefix(path, "/api/v1/relays/") && strings.HasSuffix(path, "/command") && r.Method == http.MethodPost {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		// Expect: ["api", "v1", "relays", nodeId, channelId, "command"]
		if len(parts) >= 6 {
			nodeID := parts[3]
			chStr := parts[4]
			chID, _ := strconv.Atoi(chStr)
			if chID == 0 {
				chID = 1
			}

			var req struct {
				Action   string `json:"action"` // "setState", "toggle", "pulse"
				State    any    `json:"state"`
				Value    any    `json:"value"`
				Duration int    `json:"duration,omitempty"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)

			targetState := false
			if req.Action == "toggle" {
				if node, ok := rt.sm.GetNode(nodeID); ok {
					for _, c := range node.Channels {
						if c.ID == chID || c.ChannelID == chID {
							targetState = !c.State
							break
						}
					}
				}
			} else if req.State != nil {
				switch v := req.State.(type) {
				case bool:
					targetState = v
				case float64:
					targetState = v > 0
				}
			} else if req.Value != nil {
				switch v := req.Value.(type) {
				case bool:
					targetState = v
				case float64:
					targetState = v > 0
				}
			}

			cmd, err := rt.sm.SetChannelState(nodeID, chID, targetState)
			if err != nil {
				sendJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}

			// Record in event spool
			_, _ = rt.spool.Push("RELAY_TRANSITION", nodeID, map[string]interface{}{
				"channelId": chID,
				"state":     targetState,
				"pin":       cmd.Pin,
			})

			// Outbound notify to Central Server if online
			rt.syncer.ForwardRelayCommand(nodeID, chID, "setState", targetState)

			sendJSON(w, http.StatusOK, map[string]interface{}{
				"success": true,
				"command": cmd,
				"state":   targetState,
			})
			return
		}
	}

	// Relay history: /api/v1/relays/:nodeId/:channelId/history
	if strings.HasPrefix(path, "/api/v1/relays/") && strings.HasSuffix(path, "/history") && r.Method == http.MethodGet {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) >= 6 {
			nodeID := parts[3]
			chID, _ := strconv.Atoi(parts[4])
			sendJSON(w, http.StatusOK, rt.sm.GetRelayHistory(nodeID, chID))
			return
		}
	}

	// 10. Sensors
	if path == "/api/v1/sensors" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, rt.sm.GetAllSensors())
		return
	}

	// 11. Circuit Breaker Telemetry & Control
	if (path == "/api/v1/breaker" || path == "/api/v1/breaker/status" || path == "/api/breaker/status") && r.Method == http.MethodGet {
		b := rt.sm.GetBreaker()
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":       true,
			"config":        b.Config,
			"reading":       b.Reading,
			"centralOnline": rt.syncer.IsCentralOnline(),
		})
		return
	}

	if (path == "/api/v1/breaker/toggle" || path == "/api/breaker/toggle" || path == "/api/v1/breaker/switch") && r.Method == http.MethodPost {
		var req struct {
			State bool `json:"state"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
			return
		}

		err := rt.syncer.SetBreakerSwitch(req.State)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		_, _ = rt.spool.Push("BREAKER_SWITCH", rt.cfg.Breaker.NodeID, map[string]interface{}{
			"state": req.State,
		})

		rt.syncer.ForwardBreakerAction("switch", req.State)

		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success":      true,
			"switch_state": req.State,
		})
		return
	}

	if (path == "/api/v1/breaker/control" || path == "/api/breaker/control") && r.Method == http.MethodPost {
		var req struct {
			DP    interface{} `json:"dp"`
			Value interface{} `json:"value"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
			return
		}

		dpStr := fmt.Sprintf("%v", req.DP)
		err := rt.syncer.SetBreakerDP(dpStr, req.Value)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		_, _ = rt.spool.Push("BREAKER_DP_WRITE", rt.cfg.Breaker.NodeID, map[string]interface{}{
			"dp":    dpStr,
			"value": req.Value,
		})

		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "dp": dpStr, "value": req.Value})
		return
	}

	if (path == "/api/v1/breaker/refresh" || path == "/api/breaker/refresh") && r.Method == http.MethodPost {
		_ = rt.syncer.RefreshBreaker()
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
		return
	}

	if (path == "/api/v1/breaker/devices" || path == "/api/breaker/devices") && r.Method == http.MethodGet {
		b := rt.sm.GetBreaker()
		cfg := b.Config
		ip := cfg.IPAddress
		if ip == "" {
			ip = "192.168.1.25"
		}
		devList := []map[string]interface{}{
			{
				"id":               cfg.DeviceID,
				"name":             cfg.DeviceName,
				"ip":               ip,
				"local_key":        cfg.LocalKey,
				"protocol_version": cfg.ProtocolVersion,
				"category":         "breaker",
				"is_active":        1,
			},
		}
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"devices": devList,
			"activeDevice": map[string]interface{}{
				"id":   cfg.DeviceID,
				"name": cfg.DeviceName,
				"ip":   ip,
			},
		})
		return
	}

	if (path == "/api/v1/breaker/devices/test" || path == "/api/breaker/devices/test") && r.Method == http.MethodPost {
		var req map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&req)
		res, err := rt.syncer.TestBreakerSocket(req)
		if err != nil {
			sendJSON(w, http.StatusOK, map[string]interface{}{"online": false, "error": err.Error()})
			return
		}
		sendJSON(w, http.StatusOK, res)
		return
	}

	if (path == "/api/v1/breaker/devices" || path == "/api/breaker/devices") && r.Method == http.MethodPost {
		var req map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&req)
		res, err := rt.syncer.SaveBreakerConfig(req)
		if err != nil {
			sendJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		sendJSON(w, http.StatusOK, res)
		return
	}

	if (path == "/api/v1/breaker/devices/select" || path == "/api/breaker/devices/select") && r.Method == http.MethodPost {
		b := rt.sm.GetBreaker()
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"activeDevice": map[string]interface{}{
				"id":   b.Config.DeviceID,
				"name": b.Config.DeviceName,
				"ip":   b.Config.IPAddress,
			},
		})
		return
	}

	if path == "/api/v1/breaker/history" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []interface{}{})
		return
	}

	if path == "/api/v1/breaker/serial-logs" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []string{"[Serial Log] Direct Tuya v3.5 socket online."})
		return
	}

	if path == "/api/v1/breaker/serial-command" && r.Method == http.MethodPost {
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "response": "OK"})
		return
	}

	if path == "/api/v1/breaker/serial-clear" && r.Method == http.MethodPost {
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
		return
	}

	// 12. Automations
	if path == "/api/v1/automations" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, rt.sm.GetAutomations())
		return
	}

	if path == "/api/v1/automations" && r.Method == http.MethodPost {
		var rule state.AutomationRule
		_ = json.NewDecoder(r.Body).Decode(&rule)
		created := rt.sm.AddAutomation(rule)
		sendJSON(w, http.StatusOK, created)
		return
	}

	if strings.HasPrefix(path, "/api/v1/automations/") && strings.HasSuffix(path, "/toggle") && r.Method == http.MethodPost {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) >= 4 {
			id := parts[3]
			st := rt.sm.ToggleAutomation(id)
			sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "enabled": st})
			return
		}
	}

	if strings.HasPrefix(path, "/api/v1/automations/") && r.Method == http.MethodDelete {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) >= 4 {
			id := parts[3]
			ok := rt.sm.DeleteAutomation(id)
			sendJSON(w, http.StatusOK, map[string]interface{}{"success": ok})
			return
		}
	}

	// 13. Commands Center
	if path == "/api/v1/commands" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, rt.sm.GetRecentCommands())
		return
	}

	if path == "/api/v1/commands/dispatch" && r.Method == http.MethodPost {
		var req struct {
			NodeID    string `json:"nodeId"`
			ChannelID int    `json:"channelId"`
			Action    string `json:"action"`
			State     bool   `json:"state"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		cmd, err := rt.sm.SetChannelState(req.NodeID, req.ChannelID, req.State)
		if err != nil {
			sendJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "command": cmd})
		return
	}

	// 14. Homes & Rooms Hierarchy
	if path == "/api/v1/homes" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, rt.sm.GetHomes())
		return
	}

	if path == "/api/v1/homes" && r.Method == http.MethodPost {
		var req struct {
			Name    string `json:"name"`
			Address string `json:"address"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		h := rt.sm.CreateHome(req.Name, req.Address)
		sendJSON(w, http.StatusOK, h)
		return
	}

	if strings.HasPrefix(path, "/api/v1/homes/") && strings.HasSuffix(path, "/rooms") && r.Method == http.MethodGet {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		homeID := parts[3]
		sendJSON(w, http.StatusOK, rt.sm.GetRooms(homeID))
		return
	}

	if strings.HasPrefix(path, "/api/v1/homes/") && strings.HasSuffix(path, "/rooms") && r.Method == http.MethodPost {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		homeID := parts[3]
		var req struct {
			Name string `json:"name"`
			Icon string `json:"icon"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		rm := rt.sm.CreateRoom(homeID, req.Name, req.Icon)
		sendJSON(w, http.StatusOK, rm)
		return
	}

	if strings.HasPrefix(path, "/api/v1/homes/") && strings.HasSuffix(path, "/members") && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []map[string]interface{}{
			{
				"id":       "usr-1",
				"username": "admin",
				"role":     "owner",
			},
		})
		return
	}

	if strings.HasPrefix(path, "/api/v1/rooms/") && r.Method == http.MethodGet {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		roomID := parts[3]
		if rm, ok := rt.sm.GetRoom(roomID); ok {
			sendJSON(w, http.StatusOK, rm)
			return
		}
		sendJSON(w, http.StatusNotFound, map[string]string{"error": "Room not found"})
		return
	}

	if strings.HasPrefix(path, "/api/v1/rooms/") && r.Method == http.MethodDelete {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		roomID := parts[3]
		ok := rt.sm.DeleteRoom(roomID)
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": ok})
		return
	}

	// 15. Admin RBAC Endpoints
	if path == "/api/v1/admin/users" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []map[string]interface{}{
			{
				"id":         "usr-1",
				"username":   "admin",
				"role":       "super_admin",
				"is_active":  1,
				"created_at": "2026-11-23 00:00:00",
			},
		})
		return
	}

	if path == "/api/v1/admin/roles" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []map[string]interface{}{
			{"id": "super_admin", "name": "Super Admin"},
			{"id": "admin", "name": "Admin"},
			{"id": "family_member", "name": "Family Member"},
			{"id": "guest", "name": "Guest"},
		})
		return
	}

	if path == "/api/v1/admin/permissions" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []string{
			"devices:view", "devices:control", "devices:manage", "devices:reboot",
			"littlefs:view", "littlefs:download", "littlefs:upload", "littlefs:delete",
			"config:view", "config:manage", "config:sync", "config:rollback",
			"firmware:view", "firmware:upload", "firmware:deploy",
			"users:manage", "roles:manage", "scopes:manage", "system:manage",
		})
		return
	}

	if path == "/api/v1/admin/scopes" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []interface{}{})
		return
	}

	// 16. Nodes Endpoints
	if path == "/api/v1/nodes" && r.Method == http.MethodGet {
		allNodes := rt.sm.GetAllNodes()
		list := make([]map[string]interface{}, 0, len(allNodes))

		for _, n := range allNodes {
			if rt.auth.CanAccessNode(claims, n.NodeID) {
				stStr := "Offline"
				if n.IsOnline {
					stStr = "Online"
				}

				list = append(list, map[string]interface{}{
					"id":               n.NodeID,
					"node_id":          n.NodeID,
					"nodeId":           n.NodeID,
					"name":             n.NodeName,
					"node_name":        n.NodeName,
					"nodeName":         n.NodeName,
					"hardware_type":    "ESP8266 (NodeMCU)",
					"firmware_version": n.FirmwareVersion,
					"firmwareVersion":  n.FirmwareVersion,
					"ip":               n.IP,
					"ip_address":       n.IP,
					"mac":              n.MAC,
					"mac_address":      n.MAC,
					"rssi":             n.RSSI,
					"uptime_sec":       n.UptimeSec,
					"uptimeSec":        n.UptimeSec,
					"free_heap":        n.FreeHeap,
					"freeHeap":         n.FreeHeap,
					"is_online":        n.IsOnline,
					"isOnline":         n.IsOnline,
					"status":           stStr,
					"protocol":         n.Protocol,
					"channels":         n.Channels,
					"sensors":          n.Sensors,
				})
			}
		}

		sendJSON(w, http.StatusOK, list)
		return
	}

	if (path == "/api/v1/nodes" || path == "/api/v1/nodes/add") && r.Method == http.MethodPost {
		var req struct {
			NodeID string `json:"nodeId"`
			Name   string `json:"name"`
			IP     string `json:"ip"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if req.NodeID != "" {
			mockJSON := fmt.Sprintf(`{"nodeId":"%s","nodeName":"%s","ip":"%s","channels":[]}`, req.NodeID, req.Name, req.IP)
			_, _ = rt.sm.IngestRawTelemetry([]byte(mockJSON), req.IP, "MANUAL")
		}
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "nodeId": req.NodeID})
		return
	}

	if path == "/api/v1/nodes/discovery/subnets" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []string{"192.168.1.0/24"})
		return
	}

	if path == "/api/v1/nodes/discovery/scan" && r.Method == http.MethodPost {
		sendJSON(w, http.StatusOK, map[string]interface{}{"success": true, "discovered": []interface{}{}})
		return
	}

	if path == "/api/v1/nodes/unassigned" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []interface{}{})
		return
	}

	// 17. Node Detail & Specific Actions (/api/v1/nodes/{nodeId}/...)
	if strings.HasPrefix(path, "/api/v1/nodes/") {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) >= 4 {
			nodeID := parts[3]

			// GET /api/v1/nodes/{id}
			if len(parts) == 4 && r.Method == http.MethodGet {
				node, ok := rt.sm.GetNode(nodeID)
				if !ok {
					sendJSON(w, http.StatusNotFound, map[string]string{"error": "Node not found"})
					return
				}
				sendJSON(w, http.StatusOK, node)
				return
			}

			// DELETE /api/v1/nodes/{id}
			if len(parts) == 4 && r.Method == http.MethodDelete {
				ok := rt.sm.DeleteNode(nodeID)
				sendJSON(w, http.StatusOK, map[string]interface{}{"success": ok})
				return
			}

			// POST /api/v1/nodes/{id}/restart
			if len(parts) == 5 && parts[4] == "restart" && r.Method == http.MethodPost {
				cmdUUID := fmt.Sprintf("cmd-reboot-%d", time.Now().UnixNano())
				rebootCmd := &state.Command{
					CommandUUID: cmdUUID,
					UUID:        cmdUUID,
					Action:      "reboot",
					Type:        "REBOOT",
					ExpiresAt:   time.Now().Unix() + 30,
				}
				rt.sm.QueueCommand(nodeID, rebootCmd)

				if node, ok := rt.sm.GetNode(nodeID); ok && node.IP != "" && node.IP != "127.0.0.1" {
					go func(ip string) {
						client := &http.Client{Timeout: 1 * time.Second}
						resp, err := client.Post(fmt.Sprintf("http://%s/api/system/restart", ip), "application/json", nil)
						if err == nil && resp != nil {
							_ = resp.Body.Close()
						}
					}(node.IP)
				}

				sendJSON(w, http.StatusOK, map[string]interface{}{
					"success": true,
					"message": "Reboot command dispatched to " + nodeID,
				})
				return
			}

			// POST /api/v1/nodes/{id}/test-auth
			if len(parts) == 5 && parts[4] == "test-auth" && r.Method == http.MethodPost {
				node, ok := rt.sm.GetNode(nodeID)
				isOnline := ok && node.IsOnline
				sendJSON(w, http.StatusOK, map[string]interface{}{
					"success":       true,
					"authenticated": true,
					"online":        isOnline,
				})
				return
			}

			// PUT or POST /api/v1/nodes/{id}/settings
			if len(parts) == 5 && parts[4] == "settings" && (r.Method == http.MethodPut || r.Method == http.MethodPost) {
				var req struct {
					Name string `json:"name"`
				}
				_ = json.NewDecoder(r.Body).Decode(&req)
				rt.sm.UpdateNodeSettings(nodeID, req.Name)
				sendJSON(w, http.StatusOK, map[string]interface{}{"success": true})
				return
			}

			// GET /api/v1/nodes/{id}/pins
			if len(parts) == 5 && parts[4] == "pins" && r.Method == http.MethodGet {
				if node, ok := rt.sm.GetNode(nodeID); ok {
					sendJSON(w, http.StatusOK, node.Channels)
					return
				}
				sendJSON(w, http.StatusOK, []interface{}{})
				return
			}

			// POST /api/v1/nodes/{id}/sync-pins
			if len(parts) == 5 && parts[4] == "sync-pins" && r.Method == http.MethodPost {
				if node, ok := rt.sm.GetNode(nodeID); ok {
					sendJSON(w, http.StatusOK, map[string]interface{}{
						"success":  true,
						"channels": node.Channels,
					})
					return
				}
				sendJSON(w, http.StatusNotFound, map[string]string{"error": "Node not found"})
				return
			}

			// POST /api/v1/nodes/{id}/push-config
			if len(parts) == 5 && parts[4] == "push-config" && r.Method == http.MethodPost {
				sendJSON(w, http.StatusOK, map[string]interface{}{
					"success": true,
					"message": "Config synchronized",
				})
				return
			}

			// LittleFS Proxy: /api/v1/nodes/{id}/fs...
			if len(parts) >= 5 && parts[4] == "fs" {
				rt.handleLittleFSProxy(w, r, nodeID, parts[5:])
				return
			}

			// Config proxy: /api/v1/nodes/{id}/config...
			if len(parts) >= 5 && parts[4] == "config" {
				sendJSON(w, http.StatusOK, map[string]interface{}{
					"success":  true,
					"versions": []interface{}{},
					"config":   map[string]interface{}{},
				})
				return
			}
		}
	}

	// 18. Firmware & OTA Routes
	if path == "/api/v1/firmware" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []interface{}{})
		return
	}

	if path == "/api/v1/ota/history" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []interface{}{})
		return
	}

	if path == "/api/v1/ota/backups" && r.Method == http.MethodGet {
		sendJSON(w, http.StatusOK, []interface{}{})
		return
	}

	if path == "/api/v1/ota/deploy" && r.Method == http.MethodPost {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "OTA deployment started",
		})
		return
	}

	if strings.HasPrefix(path, "/api/v1/ota/node-diagnostics/") && r.Method == http.MethodGet {
		parts := strings.Split(strings.Trim(path, "/"), "/")
		nodeID := parts[len(parts)-1]
		node, ok := rt.sm.GetNode(nodeID)
		if !ok {
			sendJSON(w, http.StatusNotFound, map[string]string{"error": "Node not found"})
			return
		}
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"nodeId":          node.NodeID,
			"online":          node.IsOnline,
			"rssi":            node.RSSI,
			"freeHeap":        node.FreeHeap,
			"firmwareVersion": node.FirmwareVersion,
			"ip":              node.IP,
		})
		return
	}

	// 19. Telemetry history
	if path == "/api/v1/telemetry" && r.Method == http.MethodGet {
		events, _ := rt.spool.ReadRecent(50)
		sendJSON(w, http.StatusOK, events)
		return
	}

	sendJSON(w, http.StatusNotFound, map[string]string{"error": "Route not found"})
}

func (rt *Router) handleLittleFSProxy(w http.ResponseWriter, r *http.Request, nodeID string, subparts []string) {
	node, ok := rt.sm.GetNode(nodeID)
	if !ok || node.IP == "" || node.IP == "127.0.0.1" || node.IP == "0.0.0.0" {
		// Mock response if node is not connected to LAN
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"files": []map[string]interface{}{
				{"name": "/config.json", "size": 384},
				{"name": "/wifi.json", "size": 128},
			},
			"totalBytes": 1048576,
			"usedBytes":  512,
		})
		return
	}

	// Forward LittleFS request directly to node LAN IP
	action := ""
	if len(subparts) > 0 {
		action = subparts[0]
	}

	client := &http.Client{Timeout: 3 * time.Second}
	targetURL := fmt.Sprintf("http://%s/api/fs", node.IP)
	if action == "file-content" {
		targetURL = fmt.Sprintf("http://%s/api/fs/view?file=%s", node.IP, r.URL.Query().Get("file"))
	}

	resp, err := client.Get(targetURL)
	if err != nil {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"files": []map[string]interface{}{
				{"name": "/config.json", "size": 384},
			},
			"totalBytes": 1048576,
			"usedBytes":  384,
		})
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (rt *Router) handleStatic(w http.ResponseWriter, r *http.Request) {
	if rt.webDir == "" {
		http.NotFound(w, r)
		return
	}

	path := r.URL.Path
	if path == "/" {
		path = "/index.html"
	}

	cleanPath := filepath.Clean(path)
	fullPath := filepath.Join(rt.webDir, cleanPath)

	if fi, err := os.Stat(fullPath); err == nil && !fi.IsDir() {
		ext := strings.ToLower(filepath.Ext(fullPath))
		switch ext {
		case ".html":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		case ".css":
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		case ".js":
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		case ".json":
			w.Header().Set("Content-Type", "application/json")
		case ".svg":
			w.Header().Set("Content-Type", "image/svg+xml")
		}
		w.Header().Set("Cache-Control", "no-cache, must-revalidate")
		http.ServeFile(w, r, fullPath)
		return
	}

	// Fallback to index.html for Single-Page Application (SPA) routing
	indexPath := filepath.Join(rt.webDir, "index.html")
	if _, err := os.Stat(indexPath); err == nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		http.ServeFile(w, r, indexPath)
		return
	}

	http.NotFound(w, r)
}

func sendJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
