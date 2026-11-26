# scratch/apply_router_features.py
import re

router_path = r'D:\ai\HomeAutomation v2\relay-server\internal\httpapi\router.go'

with open(router_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update imports
if '"net"' not in code:
    code = code.replace('"net/http"', '"net"\n\t"net/http"')
if '"sync"' not in code:
    code = code.replace('"strings"', '"strings"\n\t"sync"')

# 2. Add limiter to Router struct and NewRouter
old_router_struct = """type Router struct {
\tcfg       *config.Config
\tsm        *state.StateManager
\tauth      *auth.Authenticator
\thub       *websocket.Hub
\tsyncer    *syncer.CentralSyncer
\tspool     *queue.EventSpool
\tdatabase  *db.DB
\tstartTime time.Time
\twebDir    string
}"""

new_router_struct = """type IPRateLimiter struct {
\tmu       sync.Mutex
\tattempts map[string][]time.Time
\tlimit    int
\twindow   time.Duration
}

func NewIPRateLimiter(limit int, window time.Duration) *IPRateLimiter {
\treturn &IPRateLimiter{
\t\tattempts: make(map[string][]time.Time),
\t\tlimit:    limit,
\t\twindow:   window,
\t}
}

func (l *IPRateLimiter) Allow(ip string) bool {
\tl.mu.Lock()
\tdefer l.mu.Unlock()

\tnow := time.Now()
\tcutoff := now.Add(-l.window)

\tvar valid []time.Time
\tfor _, t := range l.attempts[ip] {
\t\tif t.After(cutoff) {
\t\t\tvalid = append(valid, t)
\t\t}
\t}
\tl.attempts[ip] = valid

\treturn len(valid) < l.limit
}

func (l *IPRateLimiter) RecordFail(ip string) {
\tl.mu.Lock()
\tdefer l.mu.Unlock()
\tl.attempts[ip] = append(l.attempts[ip], time.Now())
}

func (l *IPRateLimiter) Reset(ip string) {
\tl.mu.Lock()
\tdefer l.mu.Unlock()
\tdelete(l.attempts, ip)
}

func getClientIP(r *http.Request) string {
\tif f := r.Header.Get("X-Forwarded-For"); f != "" {
\t\tparts := strings.Split(f, ",")
\t\treturn strings.TrimSpace(parts[0])
\t}
\tif realIP := r.Header.Get("X-Real-IP"); realIP != "" {
\t\treturn strings.TrimSpace(realIP)
\t}
\thost, _, err := net.SplitHostPort(r.RemoteAddr)
\tif err == nil {
\t\treturn host
\t}
\treturn r.RemoteAddr
}

type Router struct {
\tcfg       *config.Config
\tsm        *state.StateManager
\tauth      *auth.Authenticator
\thub       *websocket.Hub
\tsyncer    *syncer.CentralSyncer
\tspool     *queue.EventSpool
\tdatabase  *db.DB
\tlimiter   *IPRateLimiter
\tstartTime time.Time
\twebDir    string
}"""

if old_router_struct in code:
    code = code.replace(old_router_struct, new_router_struct)
    print("Replaced Router struct & added IPRateLimiter")
else:
    print("WARNING: old_router_struct not found")

# Update NewRouter
old_new_router = """\treturn &Router{
\t\tcfg:       cfg,
\t\tsm:        sm,
\t\tauth:      auth,
\t\thub:       hub,
\t\tsyncer:    syncer,
\t\tspool:     spool,
\t\tdatabase:  database,
\t\tstartTime: time.Now(),
\t\twebDir:    webDir,
\t}"""

new_new_router = """\trt := &Router{
\t\tcfg:       cfg,
\t\tsm:        sm,
\t\tauth:      auth,
\t\thub:       hub,
\t\tsyncer:    syncer,
\t\tspool:     spool,
\t\tdatabase:  database,
\t\tlimiter:   NewIPRateLimiter(10, 1*time.Minute), // 10 attempts per minute
\t\tstartTime: time.Now(),
\t\twebDir:    webDir,
\t}

\t// Start background energy consumption sampler
\tif database != nil {
\t\tgo func() {
\t\t\tticker := time.NewTicker(20 * time.Second)
\t\t\tfor range ticker.C {
\t\t\t\tb := sm.GetBreaker()
\t\t\t\tdec := b.Reading.Decoded
\t\t\t\tif dec.VoltageV > 0 || dec.ActivePowerW > 0 || dec.TotalEnergyKWh > 0 {
\t\t\t\t\t_, _, _ = database.RecordEnergySnapshot(map[string]any{
\t\t\t\t\t\t"nodeId":             cfg.Breaker.NodeID,
\t\t\t\t\t\t"source":             "tuya_breaker",
\t\t\t\t\t\t"voltage_v":          dec.VoltageV,
\t\t\t\t\t\t"current_a":          dec.CurrentA,
\t\t\t\t\t\t"power_w":            dec.ActivePowerW,
\t\t\t\t\t\t"power_factor":       dec.PowerFactor,
\t\t\t\t\t\t"frequency_hz":       dec.FrequencyHz,
\t\t\t\t\t\t"total_energy_kwh":   dec.TotalEnergyKWh,
\t\t\t\t\t\t"leakage_current_ma": dec.LeakageCurrentMA,
\t\t\t\t\t\t"temperature_c":      dec.TemperatureC,
\t\t\t\t\t})
\t\t\t\t}
\t\t\t}
\t\t}()
\t}

\treturn rt"""

if old_new_router in code:
    code = code.replace(old_new_router, new_new_router)
    print("Replaced NewRouter with background energy logger")
else:
    print("WARNING: old_new_router not found")

# 3. Add rate limiting check to auth/login and mobile/login
old_auth_login = """\t// 3. Authentication Routes (Public)
\tif path == "/api/v1/auth/login" && r.Method == http.MethodPost {"""

new_auth_login = """\t// 3. Authentication Routes (Public)
\tif path == "/api/v1/auth/login" && r.Method == http.MethodPost {
\t\tclientIP := getClientIP(r)
\t\tif rt.limiter != nil && !rt.limiter.Allow(clientIP) {
\t\t\tsendJSON(w, http.StatusTooManyRequests, map[string]interface{}{
\t\t\t\t"success": false,
\t\t\t\t"error":   "Too many login attempts. Please wait 1 minute before retrying.",
\t\t\t})
\t\t\treturn
\t\t}"""

if old_auth_login in code:
    code = code.replace(old_auth_login, new_auth_login)
    print("Added rate limiter to /api/v1/auth/login")

old_mobile_login = """\t// 3b. Dedicated Mobile LAN/WAN Endpoints
\tif path == "/api/v1/mobile/login" && r.Method == http.MethodPost {"""

new_mobile_login = """\t// 3b. Dedicated Mobile LAN/WAN Endpoints
\tif path == "/api/v1/mobile/login" && r.Method == http.MethodPost {
\t\tclientIP := getClientIP(r)
\t\tif rt.limiter != nil && !rt.limiter.Allow(clientIP) {
\t\t\tsendJSON(w, http.StatusTooManyRequests, map[string]interface{}{
\t\t\t\t"success": false,
\t\t\t\t"error":   "Too many mobile login attempts. Please wait 1 minute before retrying.",
\t\t\t})
\t\t\treturn
\t\t}"""

if old_mobile_login in code:
    code = code.replace(old_mobile_login, new_mobile_login)
    print("Added rate limiter to /api/v1/mobile/login")

# 4. Add Watchdog & Energy Analytics Endpoints before 12. Command Dispatch
watchdog_and_energy = """\t// =========================================================================
\t// ⚡ WATCHDOG & ROUTER HEALTH MONITORING (TASK RS-F1)
\t// =========================================================================
\tif (path == "/api/health/watchdog" || path == "/api/v1/system/watchdog" || path == "/health") && r.Method == http.MethodGet {
\t\tdbStatus := "connected"
\t\tif rt.database != nil {
\t\t\tvar one int
\t\t\tif err := rt.database.QueryRow("SELECT 1").Scan(&one); err != nil {
\t\t\t\tdbStatus = "error: " + err.Error()
\t\t\t}
\t\t}

\t\tvar m runtime.MemStats
\t\truntime.ReadMemStats(&m)

\t\tsendJSON(w, http.StatusOK, map[string]interface{}{
\t\t\t"status":          "healthy",
\t\t\t"server":          "SmartHome Edge Relay Server (Go Native ARM64/AMD64)",
\t\t\t"uptime_sec":      int64(time.Since(rt.startTime).Seconds()),
\t\t\t"database":        dbStatus,
\t\t\t"nodes_online":    len(rt.sm.GetOnlineNodes()),
\t\t\t"total_nodes":     len(rt.sm.GetAllNodes()),
\t\t\t"memory_alloc_mb": mathRound(float64(m.Alloc)/1024/1024, 2),
\t\t\t"goroutines":      runtime.NumGoroutine(),
\t\t\t"central_online":  rt.syncer.IsCentralOnline(),
\t\t\t"timestamp":       time.Now().Format(time.RFC3339),
\t\t})
\t\treturn
\t}

\t// =========================================================================
\t// ⚡ ENERGY CONSUMPTION & POWER ANALYTICS ENDPOINTS (TASK RS-F6 / CS-F1)
\t// =========================================================================
\tif path == "/api/v1/analytics/energy/summary" && r.Method == http.MethodGet {
\t\tnodeID := r.URL.Query().Get("node_id")
\t\tif rt.database != nil {
\t\t\tsummary := rt.database.GetEnergySummary(nodeID)
\t\t\tsendJSON(w, http.StatusOK, map[string]interface{}{
\t\t\t\t"success": true,
\t\t\t\t"summary": summary,
\t\t\t})
\t\t\treturn
\t\t}
\t\tsendJSON(w, http.StatusOK, map[string]interface{}{
\t\t\t"success": true,
\t\t\t"summary": map[string]interface{}{},
\t\t})
\t\treturn
\t}

\tif path == "/api/v1/analytics/energy/history" && r.Method == http.MethodGet {
\t\trangeStr := r.URL.Query().Get("range")
\t\tif rangeStr == "" {
\t\t\trangeStr = "24h"
\t\t}
\t\tnodeID := r.URL.Query().Get("node_id")
\t\tif rt.database != nil {
\t\t\thistory := rt.database.GetEnergyHistory(rangeStr, nodeID)
\t\t\tsummary := rt.database.GetEnergySummary(nodeID)
\t\t\tsendJSON(w, http.StatusOK, map[string]interface{}{
\t\t\t\t"success": true,
\t\t\t\t"range":   rangeStr,
\t\t\t\t"history": history,
\t\t\t\t"summary": summary,
\t\t\t})
\t\t\treturn
\t\t}
\t\tsendJSON(w, http.StatusOK, map[string]interface{}{
\t\t\t"success": true,
\t\t\t"range":   rangeStr,
\t\t\t"history": []interface{}{},
\t\t})
\t\treturn
\t}

\tif path == "/api/v1/analytics/energy/settings" && r.Method == http.MethodPost {
\t\tvar req map[string]interface{}
\t\t_ = json.NewDecoder(r.Body).Decode(&req)
\t\tif rt.database != nil {
\t\t\tupdated, err := rt.database.UpdateEnergySettings(req)
\t\t\tif err == nil {
\t\t\t\tsendJSON(w, http.StatusOK, map[string]interface{}{
\t\t\t\t\t"success":  true,
\t\t\t\t\t"settings": updated,
\t\t\t\t})
\t\t\t\treturn
\t\t\t}
\t\t}
\t\tsendJSON(w, http.StatusOK, map[string]interface{}{
\t\t\t"success":  true,
\t\t\t"settings": req,
\t\t})
\t\treturn
\t}

\t// 12. Command Dispatch"""

if "\t// 12. Command Dispatch" in code:
    code = code.replace("\t// 12. Command Dispatch", watchdog_and_energy)
    print("Added Watchdog & Energy endpoints before 12. Command Dispatch")
else:
    print("WARNING: // 12. Command Dispatch not found")

with open(router_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("router.go successfully updated with all features.")
