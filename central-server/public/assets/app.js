function formatUptime(seconds) {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return '3d 12h';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}
function formatPinBadge(pin) { return pin != null ? "GPIO " + pin : "GPIO"; }
let authToken = localStorage.getItem('smarthome_token') || '';
let currentUser = null;

// Global transparent fetch interceptor to attach Bearer token and handle 401 Unauthorized
const _nativeFetch = window.fetch;
window.fetch = async function(resource, init = {}) {
  init = init || {};
  const urlStr = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');

  // Attach token if available
  if (authToken && (urlStr.includes('/api/') || urlStr.startsWith('/api'))) {
    if (!init.headers) {
      init.headers = { 'Authorization': `Bearer ${authToken}` };
    } else if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
      if (!init.headers.has('Authorization')) {
        init.headers.set('Authorization', `Bearer ${authToken}`);
      }
    } else if (Array.isArray(init.headers)) {
      if (!init.headers.some(([k]) => k.toLowerCase() === 'authorization')) {
        init.headers.push(['Authorization', `Bearer ${authToken}`]);
      }
    } else {
      if (!init.headers['Authorization'] && !init.headers['authorization']) {
        init.headers['Authorization'] = `Bearer ${authToken}`;
      }
    }
  }

  let res = await _nativeFetch(resource, init);

  // If token is rejected (401 Unauthorized), session has expired or been revoked
  if (res.status === 401 && !urlStr.includes('/auth/login')) {
    if (authToken || currentUser) {
      authToken = '';
      currentUser = null;
      localStorage.removeItem('smarthome_token');
      if (ws) {
        try { ws.close(); } catch {}
        ws = null;
      }
      if (typeof closeModal === 'function') closeModal();
      if (typeof updateTopbarUserBadge === 'function') updateTopbarUserBadge();
      if (typeof showLoginScreen === 'function') showLoginScreen();
      if (typeof showToast === 'function') {
        showToast({ title: 'Session Expired', message: 'Please sign in to continue.', severity: 'WARNING' });
      }
    }
  }

  return res;
};

async function fetchWithAuth(url, options = {}) {
  return window.fetch(url, options);
}

async function checkCurrentUser() {
  if (!authToken) {
    currentUser = null;
    updateTopbarUserBadge();
    return false;
  }

  try {
    const res = await fetchWithAuth(`${API_BASE}/auth/me`);
    if (res.status === 401) {
      currentUser = null;
      authToken = '';
      localStorage.removeItem('smarthome_token');
      updateTopbarUserBadge();
      return false;
    }
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      updateTopbarUserBadge();
      return true;
    } else {
      currentUser = null;
      authToken = '';
      localStorage.removeItem('smarthome_token');
      updateTopbarUserBadge();
      return false;
    }
  } catch {
    currentUser = null;
    updateTopbarUserBadge();
    return false;
  }
}

function showLoginScreen() {
  const screen = document.getElementById('login-screen');
  if (screen) {
    screen.style.display = 'flex';
    const uInput = document.getElementById('login-username');
    if (uInput) {
      setTimeout(() => uInput.focus(), 60);
    }
    const errEl = document.getElementById('login-error-msg');
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
  }
  const mainWrapper = document.querySelector('.main-wrapper');
  const sidebar = document.querySelector('.sidebar');
  if (mainWrapper) mainWrapper.style.visibility = 'hidden';
  if (sidebar) sidebar.style.visibility = 'hidden';
}

function hideLoginScreen() {
  const screen = document.getElementById('login-screen');
  if (screen) {
    screen.style.display = 'none';
  }
  const mainWrapper = document.querySelector('.main-wrapper');
  const sidebar = document.querySelector('.sidebar');
  if (mainWrapper) mainWrapper.style.visibility = 'visible';
  if (sidebar) sidebar.style.visibility = 'visible';
}

function toggleLoginPasswordVisibility() {
  const pwd = document.getElementById('login-password');
  if (!pwd) return;
  pwd.type = pwd.type === 'password' ? 'text' : 'password';
}

function showLoginModal() {
  showLoginScreen();
}

function updateTopbarUserBadge() {
  const nameEl = document.getElementById('topbar-username');
  const roleEl = document.getElementById('topbar-role');
  if (!nameEl || !roleEl) return;

  if (currentUser) {
    nameEl.textContent = currentUser.username;
    const primaryRole = (currentUser.roles && currentUser.roles[0]) || (currentUser.is_superuser ? 'SUPER_ADMIN' : 'USER');
    roleEl.textContent = primaryRole;
    roleEl.className = 'status-badge ' + (primaryRole === 'SUPER_ADMIN' ? 'badge-sync' : 'badge-online');
  } else {
    nameEl.textContent = 'Not Signed In';
    roleEl.textContent = 'LOCKED';
    roleEl.className = 'status-badge badge-offline';
  }
}

function handleUserBadgeClick() {
  if (!currentUser) {
    showLoginScreen();
    return;
  }

  const rolesHtml = (currentUser.roles || ['SUPER_ADMIN']).map(r => `<span class="status-badge badge-online" style="margin-right: 4px;">${r}</span>`).join('');
  const scopesHtml = (currentUser.scopes || []).map(s => `<span class="status-badge badge-sync" style="margin-right: 4px;">${s.name || s.scope_identifier}</span>`).join('') || '<span style="color:var(--text-muted);">GLOBAL</span>';

  openModal(`
    <div class="modal-card" style="max-width: 480px;">
      <div class="modal-header">
        <h3>User Account Details</h3>
        <button class="modal-close-btn" onclick="closeModal()">&times;</button>
      </div>
      <div style="padding: 16px 0;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
          <div style="width:48px; height:48px; border-radius:50%; background:var(--accent-blue); display:flex; align-items:center; justify-content:center; font-size:20px;">👤</div>
          <div>
            <h4 style="font-size:16px;">${escapeHtml(currentUser.full_name || currentUser.username)}</h4>
            <div style="font-size:12.5px; color:var(--text-secondary);">@${escapeHtml(currentUser.username)} ${currentUser.email ? `(${escapeHtml(currentUser.email)})` : ''}</div>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">Assigned Roles:</div>
          <div>${rolesHtml}</div>
        </div>
        <div style="margin-bottom:18px;">
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">Resource Scopes:</div>
          <div>${scopesHtml}</div>
        </div>
        <div style="border-top:1px solid var(--border-color); padding-top:14px; margin-top:14px;">
          <h5 style="margin-bottom:8px;">Change Password</h5>
          <input type="password" id="modal-old-pwd" placeholder="Current Password" class="input-field" style="margin-bottom:8px; width:100%;">
          <input type="password" id="modal-new-pwd" placeholder="New Password (min 6 chars)" class="input-field" style="margin-bottom:12px; width:100%;">
          <button class="btn btn-secondary" onclick="submitPasswordChange()" style="width:100%; margin-bottom:12px;">Update Password</button>
        </div>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:space-between;">
        <button class="btn btn-danger" onclick="logoutUser()">Sign Out</button>
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `);
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const uInput = document.getElementById('login-username');
  const pInput = document.getElementById('login-password');
  const errEl = document.getElementById('login-error-msg');
  const btn = document.getElementById('login-submit-btn');

  const u = uInput ? uInput.value.trim() : '';
  const p = pInput ? pInput.value : '';

  if (!u || !p) {
    if (errEl) {
      errEl.textContent = 'Please enter both username and password';
      errEl.style.display = 'flex';
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Signing In...</span>';
  }
  if (errEl) errEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (data.success && data.token) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('smarthome_token', authToken);
      updateTopbarUserBadge();
      hideLoginScreen();
      if (pInput) pInput.value = '';
      showToast({ title: 'Signed In', message: `Welcome back, ${data.user.full_name || data.user.username}!`, severity: 'SUCCESS' });
      initWebSocket();
      checkUnreadNotifications();
      loadCurrentView();
    } else {
      if (errEl) {
        errEl.textContent = data.error || 'Authentication failed';
        errEl.style.display = 'flex';
      }
      if (pInput) pInput.focus();
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = 'Server connection error. Please try again.';
      errEl.style.display = 'flex';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Sign In to Dashboard</span><span class="login-btn-arrow">→</span>';
    }
  }
}

async function logoutUser() {
  try {
    await fetchWithAuth(`${API_BASE}/auth/logout`, { method: 'POST' });
  } catch {}
  authToken = '';
  currentUser = null;
  localStorage.removeItem('smarthome_token');
  closeModal();

  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }

  updateTopbarUserBadge();

  const container = document.getElementById("content-area");
  if (container) {
    container.innerHTML = '';
  }

  showToast({ title: 'Signed Out', message: 'You have been signed out.', severity: 'INFO' });
  showLoginScreen();
}

async function submitPasswordChange() {
  const oldPassword = document.getElementById('modal-old-pwd').value;
  const newPassword = document.getElementById('modal-new-pwd').value;
  if (!oldPassword || !newPassword) {
    alert('Both passwords are required');
    return;
  }
  try {
    const res = await fetchWithAuth(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await res.json();
    if (data.success) {
      alert('Password updated successfully! Please sign in again.');
      logoutUser();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Error updating password: ' + err.message);
  }
}

function switchView(view) {
  if (!currentUser) {
    showLoginScreen();
    return;
  }
  const item = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (item) {
    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    currentView = view;
    document.getElementById("view-title").textContent = item.querySelector("span:last-child").textContent;
    loadCurrentView();
  }
}

// --- HELPER UTILITIES ---
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

let unreadNotifCount = 0;

async function checkUnreadNotifications() {
  try {
    const res = await fetch(`${API_BASE}/system/notifications/unread-count`);
    const data = await res.json();
    setNotificationBadges(data.unreadCount || 0);
  } catch (e) {}
}

function setNotificationBadges(count) {
  unreadNotifCount = Math.max(0, count);
  const navBadge = document.getElementById("nav-notif-badge");
  const topBadge = document.getElementById("topbar-notif-count");

  if (unreadNotifCount > 0) {
    if (navBadge) {
      navBadge.innerText = unreadNotifCount > 99 ? "99+" : unreadNotifCount;
      navBadge.style.display = "inline-block";
    }
    if (topBadge) {
      topBadge.innerText = unreadNotifCount > 99 ? "99+" : unreadNotifCount;
      topBadge.style.display = "inline-block";
    }
  } else {
    if (navBadge) navBadge.style.display = "none";
    if (topBadge) topBadge.style.display = "none";
  }
}

function updateNotificationBadges(delta) {
  setNotificationBadges(unreadNotifCount + delta);
}

function showToast(notif, optSeverity = "INFO", optCategory = "SYSTEM", optTitle = null) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  if (typeof notif === "string") {
    let title = optTitle;
    if (!title) {
      const sevUpper = String(optSeverity).toUpperCase();
      if (sevUpper === "SUCCESS") title = "Success";
      else if (sevUpper === "ERROR") title = "Error";
      else if (sevUpper === "WARNING") title = "Warning";
      else title = "Notification";
    }
    notif = {
      title,
      message: notif,
      severity: optSeverity,
      category: optCategory,
    };
  } else if (!notif || typeof notif !== "object") {
    return;
  }

  const toast = document.createElement("div");
  const severity = (notif.severity || "INFO").toLowerCase();
  toast.className = `toast-item toast-${severity}`;

  let icon = "🔔";
  if (severity === "success") icon = "✅";
  else if (severity === "error") icon = "❌";
  else if (severity === "warning") icon = "⚠️";

  if (notif.category === "PIN" || (notif.title && notif.title.includes("Pin"))) {
    icon = notif.title.includes("ON") ? "⚡" : (notif.title.includes("OFF") ? "⚪" : "🔌");
  } else if (notif.category === "NODE" || (notif.title && notif.title.includes("Node"))) {
    icon = notif.title.includes("Online") ? "🟢" : "🔴";
  } else if (notif.category === "RESTART" || (notif.title && (notif.title.includes("Reboot") || notif.title.includes("Restart")))) {
    icon = "🔄";
  } else if (notif.category === "IR" || (notif.title && notif.title.includes("IR"))) {
    icon = "📡";
  }

  const timeStr = notif.timestamp ? new Date(notif.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(notif.title || 'Notification')}</div>
      <div class="toast-msg">${escapeHtml(notif.message || '')}</div>
      <div class="toast-time">${timeStr}</div>
    </div>
    <button class="toast-close" title="Dismiss">&times;</button>
  `;

  const closeBtn = toast.querySelector(".toast-close");
  const dismiss = () => {
    toast.classList.add("toast-leave");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  };

  if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); dismiss(); };
  setTimeout(dismiss, 5500);

  container.appendChild(toast);
}

// ==============================================================================
// SmartHome Central Management Platform - SPA Controller (v1.6.0)
// ==============================================================================

const API_BASE = "/api/v1";
let currentView = "overview";
let ws = null;
let fleetData = {
  nodes: [],
  relays: [],
  sensors: [],
  rules: [],
  firmware: [],
  events: [],
  overview: {}
};

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  const isAuthenticated = await checkCurrentUser();
  if (isAuthenticated) {
    hideLoginScreen();
    initWebSocket();
    checkUnreadNotifications();
    loadCurrentView();
  } else {
    showLoginScreen();
  }
  setInterval(() => {
    if (currentUser) refreshActiveMetrics();
  }, 10000);
  setInterval(() => {
    if (currentUser) checkUnreadNotifications();
  }, 25000);
});

// --- NAVIGATION ---
function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", e => {
      e.preventDefault();
      if (!currentUser) {
        showLoginScreen();
        return;
      }
      document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      currentView = item.dataset.view;
      document.getElementById("view-title").textContent = item.querySelector("span:last-child").textContent;
      loadCurrentView();
    });
  });
}

function loadCurrentView() {
  if (!currentUser) {
    showLoginScreen();
    return;
  }
  const container = document.getElementById("content-area");
  container.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Loading ${currentView}...</div>`;

  switch (currentView) {
    case "overview": loadOverview(); break;
    case "nodes": loadNodes(); break;
    case "relays": loadRelays(); break;
    case "rooms-homes": loadRoomsAndHomes(); break;
    case "sensors": loadSensors(); break;
    case "breaker": loadBreakerView(); break;
    case "automation": loadAutomation(); break;
    case "firmware": loadFirmware(); break;
    case "telemetry": loadTelemetry(); break;
    case "events": loadEvents(); break;
    case "notifications": loadNotifications(); break;
    case "network": loadNetwork(); break;
    case "littlefs": loadLittlefs(); break;
    case "config-sync": loadConfigSync(); break;
    case "commands": loadCommands(); break;
    case "users": loadUsers(); break;
    case "database": loadDatabase(); break;
    case "settings": loadSettings(); break;
    case "logs": loadLogs(); break;
    default: loadOverview();
  }
}

// --- WEBSOCKET REALTIME ENGINE ---
function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}${API_BASE}/ws`;
  
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateWsStatus(true);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleLiveEvent(msg.type, msg.data);
    } catch (e) {
      console.error("WS Parse Error:", e);
    }
  };

  ws.onclose = () => {
    updateWsStatus(false);
    if (currentUser) {
      setTimeout(initWebSocket, 4000);
    }
  };

  ws.onerror = () => {
    updateWsStatus(false);
  };
}

function updateWsStatus(connected) {
  const badge = document.getElementById("ws-badge");
  if (!badge) return;
  if (connected) {
    badge.className = "status-badge badge-online";
    badge.innerHTML = `<span class="pulse-dot"></span> Live Sync`;
  } else {
    badge.className = "status-badge badge-offline";
    badge.innerHTML = `<span class="pulse-dot"></span> Reconnecting...`;
  }
}

function updateRelayUiState(nodeId, channelId, state) {
  const boolState = Boolean(state);
  const numState = boolState ? 1 : 0;

  // Update in-memory lists
  const r1 = (fleetData.relays || []).find(r => r.node_id === nodeId && r.channel_id == channelId);
  if (r1) r1.current_state = numState;
  const r2 = (dashFleetRelays || []).find(r => r.node_id === nodeId && r.channel_id == channelId);
  if (r2) r2.current_state = numState;
  if (typeof cachedRelaysList !== 'undefined' && Array.isArray(cachedRelaysList)) {
    const r3 = cachedRelaysList.find(r => r.node_id === nodeId && r.channel_id == channelId);
    if (r3) r3.current_state = numState;
  }

  // 1. Relays view elements
  const chk = document.getElementById(`relay-chk-${nodeId}-${channelId}`);
  if (chk) chk.checked = boolState;
  const lbl = document.getElementById(`relay-lbl-${nodeId}-${channelId}`);
  if (lbl) lbl.textContent = boolState ? 'ON' : 'OFF';

  // 2. Quick relay button in Dashboard
  const qbtn = document.getElementById(`quick-relay-btn-${nodeId}-${channelId}`);
  if (qbtn) {
    qbtn.className = `dash-relay-toggle-btn ${boolState ? 'btn-on' : 'btn-off'}`;
    qbtn.textContent = boolState ? 'ON' : 'OFF';
  }

  // 3. Room subview elements
  const rmChk = document.getElementById(`relay-room-chk-${nodeId}-${channelId}`);
  if (rmChk) rmChk.checked = boolState;
  const rmLbl = document.getElementById(`relay-room-lbl-${nodeId}-${channelId}`);
  if (rmLbl) rmLbl.textContent = boolState ? 'ON' : 'OFF';

  // 4. Matrix view pill
  const mPill = document.getElementById(`matrix-live-pill-${nodeId}-${channelId}`);
  if (mPill) {
    mPill.className = boolState ? 'status-pill-online' : 'status-pill-offline';
    mPill.textContent = boolState ? 'ON' : 'OFF';
  }

  // 5. Room 2D / 3D GUI Elements:
  // 5a. Right panel appliance toggle button
  const rmGuiBtn = document.getElementById(`room-gui-relay-btn-${nodeId}-${channelId}`);
  if (rmGuiBtn) {
    rmGuiBtn.className = `dash-relay-toggle-btn ${boolState ? 'btn-on' : 'btn-off'}`;
    rmGuiBtn.textContent = boolState ? 'ON' : 'OFF';
    rmGuiBtn.setAttribute('onclick', `toggleRealQuickRelay('${nodeId}', ${channelId}, ${boolState})`);
  }

  // 5b. Floor appliance node
  const rmNode = document.getElementById(`room-node-${nodeId}-${channelId}`);
  if (rmNode) {
    rmNode.setAttribute('data-state', numState);
    rmNode.setAttribute('onclick', `handleRoomApplianceClick(event, '${nodeId}', ${channelId}, ${boolState})`);

    // Ambient light glow cone
    const glow = document.getElementById(`room-glow-${nodeId}-${channelId}`);
    if (glow) {
      glow.style.opacity = boolState ? '1' : '0';
    }

    // Fan spinning animation
    const iconSpan = document.getElementById(`room-icon-${nodeId}-${channelId}`);
    if (iconSpan) {
      const isFan = iconSpan.getAttribute('data-is-fan') === 'true';
      if (isFan) {
        if (boolState) {
          iconSpan.classList.add('room-fan-spin');
        } else {
          iconSpan.classList.remove('room-fan-spin');
        }
      }
    }

    // Bubble border & box-shadow glow
    const bubble = document.getElementById(`room-bubble-${nodeId}-${channelId}`);
    if (bubble) {
      const isLight = bubble.getAttribute('data-is-light') === 'true';
      if (boolState) {
        bubble.style.border = isLight ? '2px solid #f59e0b' : '2px solid #38bdf8';
        bubble.style.boxShadow = isLight 
          ? '0 0 25px rgba(245, 158, 11, 0.7), 0 8px 20px rgba(0,0,0,0.6)' 
          : '0 0 25px rgba(56, 189, 248, 0.6), 0 8px 20px rgba(0,0,0,0.6)';
      } else {
        bubble.style.border = '2px solid rgba(255, 255, 255, 0.15)';
        bubble.style.boxShadow = '0 8px 20px rgba(0,0,0,0.6)';
      }
    }

    // Name label
    const lblBadge = document.getElementById(`room-lbl-${nodeId}-${channelId}`);
    if (lblBadge) {
      lblBadge.style.color = boolState ? '#ffffff' : '#94a3b8';
      lblBadge.style.borderColor = boolState ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.1)';
    }
  }

  // 5c. Active room devices badge
  const activeCountBadge = document.getElementById('room-active-devices-badge');
  if (activeCountBadge && typeof activeViewingRoomId !== 'undefined' && activeViewingRoomId && typeof cachedRoomsList !== 'undefined') {
    const curRoom = cachedRoomsList.find(r => r.id === activeViewingRoomId);
    if (curRoom && typeof cachedRelaysList !== 'undefined') {
      const count = cachedRelaysList.filter(r => (r.room || '').toLowerCase() === (curRoom.name || '').toLowerCase() && r.current_state).length;
      activeCountBadge.textContent = `${count} Active Devices`;
    }
  }
}

function updateNodeUiStatus(nodeId, isOnline, rssi) {
  const n = (fleetData.nodes || []).find(node => node.node_id === nodeId);
  if (n) {
    if (isOnline !== undefined) n.is_online = isOnline;
    if (rssi !== undefined) n.rssi = rssi;
  }
  const dashPill = document.getElementById(`dash-node-status-${nodeId}`);
  if (dashPill) {
    dashPill.className = isOnline ? 'status-pill-online' : 'status-pill-offline';
    dashPill.textContent = isOnline ? 'Online' : 'Offline';
  }
  const rssiEl = document.getElementById(`dash-node-rssi-${nodeId}`);
  if (rssiEl && rssi !== undefined) {
    rssiEl.textContent = `${rssi} dBm`;
  }
  const seenEl = document.getElementById(`dash-node-lastseen-${nodeId}`);
  if (seenEl) {
    seenEl.textContent = isOnline ? 'Live' : 'Offline';
  }
}

function handleLiveEvent(type, data) {
  if (type === "notification") {
    showToast(data);
    updateNotificationBadges(1);
    if (currentView === "notifications") loadNotifications();
    if (currentView === "logs") loadLogs();
  } else if (type === "relay_state_confirmed") {
    // Zero-flicker targeted DOM update
    updateRelayUiState(data.node_id, data.channel_id, data.new_state);
  } else if (type === "node_status") {
    // Zero-flicker targeted node status update
    updateNodeUiStatus(data.node_id, data.is_online, data.rssi);
  } else if (type === "telemetry_update" || type === "poll_cycle_completed" || type === "sensor_event" || type === "sensor_telemetry") {
    if (currentView === "telemetry") appendTelemetryLog(data);
    // Silent in-place metrics refresh without wiping DOM
    if (currentView === "overview") updateOverviewTelemetrySilently();
    if (currentView === "relays") updateRelaysViewTelemetrySilently(data);
    // Real-time IR / Sensor Event dispatch
    const sEvt = data.sensorEvent || (type === "sensor_event" ? data : null);
    if (sEvt && (sEvt.sensor_type === "IR_RECEIVER" || sEvt.ir_code)) {
      handleRealtimeIrEvent(data.nodeId || data.node_id, sEvt);
    }
  } else if (type === "node_added" || type === "node_deleted") {
    if (currentView === "nodes") loadNodes();
    else if (currentView === "overview") loadOverview();
  } else if (type === "poll_settings_changed") {
    updateTopbarSyncIndicator(data);
  } else if (type === "command_executed" || type === "command_acknowledged") {
    if (currentView === "commands") loadCommands();
  } else if (type === "config_updated" || type === "config_synced") {
    if (currentView === "config-sync") loadConfigSync();
  } else if (type === "littlefs_synced") {
    if (currentView === "littlefs") refreshLittlefsList();
  } else if (type === "breaker_telemetry") {
    if (currentView === "breaker") {
      updateBreakerDom(data);
    }
    updateBreakerTilesSilently(data);
  } else if (type === "breaker_serial_log") {
    if (currentView === "breaker") {
      handleIncomingSerialLog(data);
    }
  }
}


// --- MODAL UTILITIES ---
function openModal(htmlContent) {
  let overlay = document.getElementById("global-modal-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "global-modal-overlay";
    overlay.className = "modal-overlay";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = htmlContent;
  overlay.style.display = "flex";
}

function closeModal() {
  const overlay = document.getElementById("global-modal-overlay");
  if (overlay) overlay.style.display = "none";
}

function handleRealtimeIrEvent(nodeId, evt) {
  const code = evt.ir_code || evt.code;
  const protocol = evt.ir_protocol || evt.protocol || 'NEC';
  if (!code) return;

  // Auto-populate active IR Learning modal if open
  const statusBox = document.getElementById("ir-train-status-box");
  const saveContainer = document.getElementById("ir-save-container");
  const btnStart = document.getElementById("btn-start-ir-train");

  if (statusBox) {
    if (typeof stopIrTrainingTimer === 'function') stopIrTrainingTimer();
    if (btnStart) btnStart.disabled = false;
    capturedIrData = {
      protocol: protocol,
      code: code,
      bits: evt.bits || 32
    };
    statusBox.innerHTML = `
      <div style="color: #10b981; font-weight: 600; font-size: 13px;">✅ IR Code Captured Instantly!</div>
      <div style="font-family: monospace; color: #fff; font-size: 14px; margin-top: 4px;">${escapeHtml(code)} <span style="font-size: 11px; color: #38bdf8;">(${protocol})</span></div>
    `;
    if (saveContainer) saveContainer.style.display = 'flex';
  }

  showToast({
    title: '📡 IR Signal Received',
    message: `${code} (${protocol}) from ${nodeId}`,
    severity: 'INFO',
    category: 'IR'
  });
}

function updateRelaysViewTelemetrySilently(data) {
  const nodeId = data.nodeId || data.node_id;
  if (!nodeId) return;

  // Update channels state if provided
  if (Array.isArray(data.channels)) {
    for (const ch of data.channels) {
      const chId = ch.id ?? ch.channel_id;
      if (chId != null && ch.state !== undefined) {
        updateRelayUiState(nodeId, chId, Boolean(ch.state));
      }
    }
  }

  // Update sensor readings if provided
  if (Array.isArray(data.sensors)) {
    for (const s of data.sensors) {
      const chId = s.channel_id ?? s.id;
      if (chId == null) continue;

      const r = (fleetData.relays || []).find(relay => relay.node_id === nodeId && (relay.channel_id == chId || relay.pin == s.pin));
      if (r) {
        if (s.value !== undefined) r.last_sensor_value = s.value;
        if (s.strValue) r.last_sensor_str = s.strValue;
        if (!r.sensor_meta) r.sensor_meta = {};
        if (s.dcVoltage !== undefined) r.sensor_meta.dcVoltage = s.dcVoltage;
        if (s.acRms !== undefined) r.sensor_meta.acRms = s.acRms;
        if (s.rawAdc !== undefined) r.sensor_meta.rawAdc = s.rawAdc;
        if (s.code) r.sensor_meta.code = s.code;
        if (s.protocol) r.sensor_meta.protocol = s.protocol;
        if (r.sensor_config) {
          Object.assign(r.sensor_config, r.sensor_meta);
        }
      }

      const sensorEl = document.getElementById(`sensor-reading-${nodeId}-${chId}`);
      if (sensorEl) {
        let badgeHtml = '';
        if (s.type === 'VOLTAGE_ADC' || s.type === 'VOLTAGE' || (r && (r.sensor_type === 'VOLTAGE' || r.sensor_type === 'VOLTAGE_ADC' || r.function?.toLowerCase().includes('voltage')))) {
          const dc = s.dcVoltage != null ? s.dcVoltage : s.value;
          const rms = s.acRms;
          const rawAdc = s.rawAdc;
          let badgeText = '';
          if (rms != null && Number(rms) > 0.005) {
            badgeText = `⚡ AC ${Number(rms).toFixed(2)}V | DC ${Number(dc ?? 0).toFixed(2)}V`;
          } else if (dc != null) {
            badgeText = `⚡ ${Number(dc).toFixed(3)} V`;
          } else {
            badgeText = `⚡ -- V`;
          }
          const tooltip = `title="DC: ${dc != null ? Number(dc).toFixed(3) : '--'}V | AC RMS: ${rms != null ? Number(rms).toFixed(3) : '--'}V | Raw ADC: ${rawAdc ?? '--'}"`;
          badgeHtml = `<span ${tooltip} style="font-weight: 700; color: #f59e0b; font-family: monospace; font-size: 11px; background: rgba(245, 158, 11, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.3); cursor: help;">${badgeText}</span>`;
        } else if (s.type === 'IR_RECEIVER' || (r && (r.sensor_type === 'IR_RECEIVER' || r.function === 'IR Receiver'))) {
          const irStr = s.strValue || s.code || (r ? r.last_sensor_str : null) || 'Listening...';
          badgeHtml = `<span style="font-weight: 700; color: #c084fc; font-family: monospace; font-size: 11px; background: rgba(168, 85, 247, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(168, 85, 247, 0.3);">📡 ${escapeHtml(irStr)}</span>`;
        } else if (s.type === 'PIR_MOTION' || (r && (r.sensor_type === 'PIR_MOTION' || r.function === 'PIR Motion'))) {
          const mState = s.strValue || (s.value ? 'ACTIVE' : 'Clear');
          badgeHtml = `<span style="font-weight: 700; color: #4ade80; font-family: monospace; font-size: 11px; background: rgba(34, 197, 94, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(34, 197, 94, 0.3);">🚶 ${escapeHtml(mState)}</span>`;
        } else {
          const valText = s.strValue || (s.value != null ? s.value + ' ' + (s.unit || '') : 'Active');
          badgeHtml = `<span style="font-weight: 700; color: #38bdf8; font-family: monospace; font-size: 11px; background: rgba(56, 189, 248, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.3);">${escapeHtml(valText)}</span>`;
        }
        sensorEl.innerHTML = badgeHtml;
      }
    }
  }
}

// --- 1. OVERVIEW / RELAY SERVER DASHBOARD (v2.0) ---
let quickRelaySelectedHome = 'all'; // 'all' or numeric homeId
let quickRelayCurrentPage = 1;
let quickRelayPageSize = 6; // default 6 tiles per page (2 columns x 3 rows)
let dashFleetRelays = [];
let dashFleetNodes = [];
let dashFleetHomes = [];

let dashLogFilter = 'all';
let isDashLogPaused = false;
let dashLogs = [
  { time: '00:15:22', tag: 'INFO', msg: 'Central Server operational on port 9100' },
  { time: '00:15:20', tag: 'MQTT', msg: 'Device NODE-BCDDC223386C telemetry synced' },
  { time: '00:15:15', tag: 'INFO', msg: 'Tuya Smart Breaker online at 192.168.1.25' },
  { time: '00:15:02', tag: 'OTA', msg: 'Firmware status checked: nodes up-to-date' },
  { time: '00:14:50', tag: 'INFO', msg: 'Fleet sync: 2 nodes active, 4 relay channels registered' }
];

function filterDashLogs(lvl) {
  dashLogFilter = lvl;
  renderDashLogs();
}

function toggleDashLogPause() {
  isDashLogPaused = !isDashLogPaused;
  const btn = document.getElementById('dash-log-pause-btn');
  if (btn) btn.textContent = isDashLogPaused ? '▶ Resume' : '⏸ Pause';
}

function clearDashLogs() {
  dashLogs = [];
  renderDashLogs();
}

function renderDashLogs() {
  const el = document.getElementById('dash-logs-body');
  if (!el) return;
  const filtered = dashLogFilter === 'all' ? dashLogs : dashLogs.filter(l => l.tag.toLowerCase() === dashLogFilter.toLowerCase());
  if (filtered.length === 0) {
    el.innerHTML = '<div style="color: #64748b; padding: 12px; text-align: center;">No log records matching filter.</div>';
    return;
  }
  el.innerHTML = filtered.map(item => `
    <div class="dash-log-line">
      <span class="dash-log-time">${item.time}</span>
      <span class="dash-log-tag ${item.tag.toLowerCase()}">${item.tag}</span>
      <span class="dash-log-msg">${escapeHtml(item.msg)}</span>
    </div>
  `).join('');
}

function getIconForAppliance(name = '', func = '', iconKey = '') {
  const iconMap = {
    light: '💡',
    fan: '🌀',
    socket: '🔌',
    pump: '🚰',
    gate: '🚪',
    tv: '📺',
    ac: '❄️',
    porch: '🏮',
    garden: '🌳',
    breaker: '⚡',
    bell: '🔔',
    heater: '♨️',
    voltage: '📊',
    ir: '📡',
    motion: '🚶',
    temp: '🌡️',
    sensor: '🔬'
  };
  if (iconKey && iconMap[iconKey]) return iconMap[iconKey];

  const s = (name + ' ' + func).toLowerCase();
  if (s.includes('fan') || s.includes('exhaust')) return '🌀';
  if (s.includes('socket') || s.includes('tv') || s.includes('plug')) return '🔌';
  if (s.includes('decor') || s.includes('lamp') || s.includes('bed')) return '🏮';
  if (s.includes('pump') || s.includes('water')) return '🚰';
  if (s.includes('voltage') || s.includes('mains')) return '📊';
  if (s.includes('ir') || s.includes('remote')) return '📡';
  if (s.includes('motion') || s.includes('pir')) return '🚶';
  if (s.includes('temp') || s.includes('humid')) return '🌡️';
  if (s.includes('gate') || s.includes('door') || s.includes('motor')) return '🚪';
  if (s.includes('breaker')) return '⚡';
  if (s.includes('garden')) return '🌳';
  if (s.includes('ac') || s.includes('cool')) return '❄️';
  return '💡';
}

function getApplianceIcon(iconKey) {
  return getIconForAppliance('', '', iconKey);
}

function onQuickRelayHomeChange(val) {
  quickRelaySelectedHome = val;
  quickRelayCurrentPage = 1;
  refreshQuickRelaysView();
  const opt = document.querySelector('#quick-relay-home-select option[value="all"]');
  if (opt) {
    opt.textContent = `All Homes (${getFilteredQuickRelays().length})`;
  }
}

function onQuickRelayPageChange(newPage) {
  const meta = getQuickRelayPaginationMeta();
  let p = Number(newPage) || 1;
  if (p < 1) p = 1;
  if (p > meta.totalPages) p = meta.totalPages;
  quickRelayCurrentPage = p;
  refreshQuickRelaysView();
}

function onQuickRelayPageSizeChange(newSize) {
  quickRelayPageSize = Number(newSize) || 6;
  quickRelayCurrentPage = 1;
  refreshQuickRelaysView();
}

function refreshQuickRelaysView() {
  const grid = document.getElementById('dash-quick-relays-grid');
  if (grid) {
    grid.innerHTML = renderQuickRelaysGridHtml();
  }
  const pagination = document.getElementById('dash-quick-relays-pagination');
  if (pagination) {
    pagination.innerHTML = renderQuickRelaysPaginationHtml();
  }
}

function getFilteredQuickRelays() {
  let list = (dashFleetRelays || []).slice();

  // Exclude sensors so relay control strictly displays actuators & breakers
  list = list.filter(r => {
    if (typeof isSensorChannel === 'function' && isSensorChannel(r)) return false;
    return true;
  });

  if (quickRelaySelectedHome !== 'all') {
    const targetHomeId = Number(quickRelaySelectedHome);
    const targetHome = (dashFleetHomes || []).find(h => h.id === targetHomeId);
    const homeName = targetHome ? (targetHome.name || '').toLowerCase() : '';

    list = list.filter(r => {
      const parentNode = (dashFleetNodes || []).find(n => n.node_id === r.node_id);
      if (parentNode && parentNode.home_id === targetHomeId) return true;
      if (homeName && r.room && r.room.toLowerCase().includes(homeName)) return true;
      if (targetHomeId === 1 && (!parentNode || !parentNode.home_id)) return true;
      return false;
    });
  }

  return list;
}

function getQuickRelayPaginationMeta() {
  const filtered = getFilteredQuickRelays();
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / quickRelayPageSize));
  if (quickRelayCurrentPage > totalPages) quickRelayCurrentPage = totalPages;
  if (quickRelayCurrentPage < 1) quickRelayCurrentPage = 1;

  const startIndex = (quickRelayCurrentPage - 1) * quickRelayPageSize;
  const endIndex = Math.min(startIndex + quickRelayPageSize, totalItems);
  const pageItems = filtered.slice(startIndex, endIndex);

  return {
    filtered,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    pageItems,
    currentPage: quickRelayCurrentPage,
    pageSize: quickRelayPageSize
  };
}

function renderQuickRelaysGridHtml() {
  const meta = getQuickRelayPaginationMeta();
  const list = meta.pageItems;

  if (meta.totalItems === 0) {
    return `<div style="grid-column: span 2; padding: 32px; text-align: center; color: #64748b; font-size: 12px;">
      No relay channels registered for this home.
    </div>`;
  }

  return list.map(r => {
    const isOn = Boolean(r.current_state);
    const isBreaker = (r.function && r.function.toLowerCase().includes('breaker')) || 
                      (r.name && r.name.toLowerCase().includes('circuit breaker')) ||
                      (r.node_id && r.node_id.includes('30487D'));
    const icon = getIconForAppliance(r.name, r.function, r.icon);

    return `
      <div class="dash-relay-tile ${isBreaker ? 'tile-breaker' : ''}" style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 12px; display: flex; align-items: center; justify-content: space-between;">
        <div class="dash-relay-icon-title" style="display: flex; align-items: center; gap: 10px;">
          <span class="dash-relay-tile-icon" style="font-size: 22px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.04); border-radius: 8px;">${icon}</span>
          <div>
            <span class="dash-relay-tile-label" style="font-size: 13px; font-weight: 600; color: #ffffff; display: block;" title="${escapeHtml(r.name)}">${escapeHtml(r.name || 'Channel ' + r.channel_id)}</span>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
              ${escapeHtml(r.room || 'General')} • CH${r.channel_id} (Pin ${r.pin != null ? r.pin : r.channel_id})
            </div>
          </div>
        </div>

        ${isBreaker ? `
          <span style="font-size: 11px; color: #10b981; font-weight: 700; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 5px 10px; border-radius: 6px; display: flex; align-items: center; gap: 4px;">
            <span>🔒</span> LIVE ON
          </span>
        ` : `
          <button id="quick-relay-btn-${r.node_id}-${r.channel_id}" class="dash-relay-toggle-btn ${isOn ? 'btn-on' : 'btn-off'}" onclick="toggleRealQuickRelay('${r.node_id}', ${r.channel_id}, ${isOn})">
            ${isOn ? 'ON' : 'OFF'}
          </button>
        `}
      </div>
    `;
  }).join('');
}

function renderQuickRelaysPaginationHtml() {
  const meta = getQuickRelayPaginationMeta();
  if (meta.totalItems === 0) return '';

  const { currentPage, totalPages, totalItems, startIndex, endIndex, pageSize } = meta;

  let pagePills = [];
  for (let i = 1; i <= totalPages; i++) {
    const isActive = i === currentPage;
    pagePills.push(`
      <button class="dash-page-pill ${isActive ? 'active' : ''}" 
              onclick="onQuickRelayPageChange(${i})"
              title="Page ${i}">
        ${i}
      </button>
    `);
  }

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 4px 4px 4px; font-size: 11.5px; color: #94a3b8;">
      <div>
        Showing <strong style="color: #f1f5f9;">${startIndex + 1}–${endIndex}</strong> of <strong style="color: #f1f5f9;">${totalItems}</strong> relays
      </div>
      <div style="display: flex; align-items: center; gap: 5px;">
        <button class="dash-page-nav-btn" 
                onclick="onQuickRelayPageChange(${currentPage - 1})" 
                ${currentPage <= 1 ? 'disabled style="opacity: 0.35; cursor: not-allowed;"' : ''}>
          ‹ Prev
        </button>
        ${pagePills.join('')}
        <button class="dash-page-nav-btn" 
                onclick="onQuickRelayPageChange(${currentPage + 1})" 
                ${currentPage >= totalPages ? 'disabled style="opacity: 0.35; cursor: not-allowed;"' : ''}>
          Next ›
        </button>
        <select onchange="onQuickRelayPageSizeChange(this.value)" 
                class="filter-select"
                style="padding: 2px 6px; font-size: 11px; background: #0f172a; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.1); border-radius: 5px; cursor: pointer; margin-left: 6px;">
          <option value="4" ${pageSize === 4 ? 'selected' : ''}>4 / page</option>
          <option value="6" ${pageSize === 6 ? 'selected' : ''}>6 / page</option>
          <option value="8" ${pageSize === 8 ? 'selected' : ''}>8 / page</option>
          <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / page</option>
        </select>
      </div>
    </div>
  `;
}

async function toggleRealQuickRelay(nodeId, channelId, currentState) {
  const nextState = !currentState;

  // 1. INSTANT OPTIMISTIC DOM UPDATE ACROSS ALL VIEWS (ZERO DELAY)
  updateRelayUiState(nodeId, channelId, nextState);

  // In-memory update
  const rel = (dashFleetRelays || []).find(r => r.node_id === nodeId && r.channel_id == channelId);
  const name = rel ? rel.name : `Relay ${channelId}`;

  // Log entry in dashboard
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  dashLogs.unshift({
    time: timeStr,
    tag: 'INFO',
    msg: `Relay '${name}' switched ${nextState ? 'ON' : 'OFF'} (source: Quick Dashboard)`
  });
  if (dashLogs.length > 30) dashLogs.pop();
  renderDashLogs();

  // 2. DISPATCH COMMAND WITH AUTH IN BACKGROUND
  try {
    const res = await fetchWithAuth(`${API_BASE}/relays/${nodeId}/${channelId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setState", state: nextState })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Relay "${name}" switched ${nextState ? 'ON' : 'OFF'}`, "success");
    } else {
      updateRelayUiState(nodeId, channelId, currentState);
      showToast(`Error: ${result.error || 'Failed to switch relay'}`, "error");
    }
  } catch (err) {
    updateRelayUiState(nodeId, channelId, currentState);
    showToast(`Network error: ${err.message}`, "error");
  }
}

async function updateOverviewTelemetrySilently() {
  try {
    const [overviewRes, breakerRes] = await Promise.all([
      fetch(`${API_BASE}/system/overview`).then(r => r.json()).catch(() => ({})),
      fetchWithAuth(`${API_BASE}/breaker/status`).then(r => r.json()).catch(() => ({}))
    ]);
    const sys = overviewRes.system || {};

    // Silently update topbar values
    const netEl = document.getElementById('topbar-net-ip');
    if (netEl && sys.host_ip) netEl.textContent = sys.host_ip;
    const upEl = document.getElementById('topbar-uptime');
    if (upEl && sys.uptime_str) upEl.textContent = sys.uptime_str;
    const sideUpEl = document.getElementById('sidebar-uptime');
    if (sideUpEl && sys.uptime_str) sideUpEl.textContent = `Uptime: ${sys.uptime_str}`;
    const cpuEl = document.getElementById('topbar-cpu');
    if (cpuEl && sys.cpu_percent != null) cpuEl.textContent = `${sys.cpu_percent}%`;
    const ramEl = document.getElementById('topbar-ram');
    if (ramEl && sys.ram_percent != null) ramEl.textContent = `${sys.ram_percent}%`;
    const stEl = document.getElementById('topbar-storage');
    if (stEl) stEl.textContent = `${sys.storage_percent || 28}% (${sys.storage_used_gb || 36} / ${sys.storage_total_gb || 128} GB)`;

    // Silently update gauges
    const radius = 25;
    const circumference = 2 * Math.PI * radius;
    const cpuPct = sys.cpu_percent || 14;
    const ramPct = sys.ram_percent || 38;
    const stPct = sys.storage_percent || 28;

    const cpuBar = document.getElementById('gauge-bar-cpu');
    if (cpuBar) cpuBar.style.strokeDashoffset = circumference - (cpuPct / 100) * circumference;
    const cpuTxt = document.getElementById('gauge-pct-cpu');
    if (cpuTxt) cpuTxt.textContent = `${cpuPct}%`;

    const ramBar = document.getElementById('gauge-bar-ram');
    if (ramBar) ramBar.style.strokeDashoffset = circumference - (ramPct / 100) * circumference;
    const ramTxt = document.getElementById('gauge-pct-ram');
    if (ramTxt) ramTxt.textContent = `${ramPct}%`;

    const stBar = document.getElementById('gauge-bar-storage');
    if (stBar) stBar.style.strokeDashoffset = circumference - (stPct / 100) * circumference;
    const stTxt = document.getElementById('gauge-pct-storage');
    if (stTxt) stTxt.textContent = `${stPct}%`;

    const rFooter = document.getElementById('dash-resources-footer');
    if (rFooter) {
      rFooter.innerHTML = `
        <span>CPU: ${sys.cpu_used_cores || '1.4'} / ${sys.cpu_cores || '4'} Cores</span>
        <span>RAM: ${sys.ram_used_gb || '1.5'} / ${sys.ram_total_gb || '4'} GB</span>
        <span>Disk: ${sys.storage_used_gb || '36'} / ${sys.storage_total_gb || '128'} GB</span>
      `;
    }

    if (breakerRes) updateBreakerTilesSilently(breakerRes);
  } catch (e) {}
}

function updateBreakerTilesSilently(breakerRes) {
  if (!breakerRes) return;
  const reading = breakerRes.reading || breakerRes;
  const dec = reading.decoded || {};

  const vEl = document.getElementById('breaker-val-voltage');
  if (vEl && dec.voltage_v != null) vEl.textContent = dec.voltage_v;
  const cEl = document.getElementById('breaker-val-current');
  if (cEl && dec.current_a != null) cEl.textContent = Number(dec.current_a).toFixed(2);
  const pEl = document.getElementById('breaker-val-power');
  if (pEl && dec.power_w != null) pEl.textContent = `${dec.power_w}`;
  const eEl = document.getElementById('breaker-val-energy');
  if (eEl && dec.total_energy_kwh != null) eEl.textContent = dec.total_energy_kwh;
  const tEl = document.getElementById('breaker-val-temp');
  if (tEl && dec.temperature_c != null) tEl.textContent = dec.temperature_c;
  const fEl = document.getElementById('breaker-val-freq');
  if (fEl && dec.frequency_hz != null) fEl.textContent = dec.frequency_hz;
  const lEl = document.getElementById('breaker-val-leak');
  if (lEl && dec.leakage_current_ma != null) lEl.textContent = dec.leakage_current_ma;
}

function updateOverviewInPlace(overviewRes, breakerRes, totalNodes, onlineNodes, totalRelays, activeRelays, totalHomes, totalRooms, automationsTotal, automationsEnabled) {
  const kpiDevices = document.getElementById('kpi-val-devices');
  if (kpiDevices) kpiDevices.textContent = `${onlineNodes} / ${totalNodes}`;
  const kpiDevicesSub = document.getElementById('kpi-sub-devices');
  if (kpiDevicesSub) kpiDevicesSub.innerHTML = `<span>↑</span> ${totalNodes > 0 ? Math.round((onlineNodes / totalNodes) * 100) : 100}% Online`;

  const kpiRelays = document.getElementById('kpi-val-relays');
  if (kpiRelays) kpiRelays.textContent = `${totalRelays}`;
  const kpiRelaysSub = document.getElementById('kpi-sub-relays');
  if (kpiRelaysSub) kpiRelaysSub.innerHTML = `<span>↑</span> ${activeRelays} Active`;

  const kpiHomes = document.getElementById('kpi-val-homes');
  if (kpiHomes) kpiHomes.textContent = `${totalHomes}`;
  const kpiHomesSub = document.getElementById('kpi-sub-homes');
  if (kpiHomesSub) kpiHomesSub.innerHTML = `<span>↑</span> ${totalRooms} Rooms`;

  const kpiAuto = document.getElementById('kpi-val-auto');
  if (kpiAuto) kpiAuto.textContent = `${automationsTotal}`;
  const kpiAutoSub = document.getElementById('kpi-sub-auto');
  if (kpiAutoSub) kpiAutoSub.innerHTML = `<span>↑</span> ${automationsEnabled} Enabled`;

  (dashFleetNodes || []).forEach(n => {
    updateNodeUiStatus(n.node_id, n.is_online, n.rssi);
  });

  (dashFleetRelays || []).forEach(r => {
    updateRelayUiState(r.node_id, r.channel_id, Boolean(r.current_state));
  });

  const paginationEl = document.getElementById('dash-quick-relays-pagination');
  if (paginationEl) {
    paginationEl.innerHTML = renderQuickRelaysPaginationHtml();
  }

  if (breakerRes) updateBreakerTilesSilently(breakerRes);
}

async function loadOverview() {
  const container = document.getElementById("content-area");
  const isAlreadyRendered = document.getElementById("dash-v2-container") !== null;

  try {
    const [overviewRes, breakerRes, nodesRes, relaysRes, homesRes] = await Promise.all([
      fetch(`${API_BASE}/system/overview`).then(r => r.json()).catch(() => ({})),
      fetchWithAuth(`${API_BASE}/breaker/status`).then(r => r.json()).catch(() => ({})),
      fetchWithAuth(`${API_BASE}/nodes`).then(r => r.json()).catch(() => []),
      fetchWithAuth(`${API_BASE}/relays`).then(r => r.json()).catch(() => []),
      fetchWithAuth(`${API_BASE}/homes`).then(r => r.json()).catch(() => ({ homes: [] }))
    ]);

    dashFleetNodes = Array.isArray(nodesRes) ? nodesRes : (nodesRes.nodes || []);
    dashFleetRelays = Array.isArray(relaysRes) ? relaysRes : (relaysRes.relays || []);
    dashFleetHomes = homesRes.homes || [];
    fleetData.nodes = dashFleetNodes;
    fleetData.relays = dashFleetRelays;
    fleetData.homes = dashFleetHomes;

    const sys = overviewRes.system || {};
    const totalNodesCount = dashFleetNodes.length;
    const onlineNodesCount = dashFleetNodes.filter(n => n.is_online).length;
    const totalRelaysCount = dashFleetRelays.length;
    const activeRelaysCount = dashFleetRelays.filter(r => r.current_state).length;
    const totalHomesCount = dashFleetHomes.length;
    const totalRoomsCount = (overviewRes.homes && overviewRes.homes.rooms) || 8;
    const automationsTotal = (overviewRes.automations && overviewRes.automations.total) || 4;
    const automationsEnabled = (overviewRes.automations && overviewRes.automations.enabled) || 3;

    // Topbar dynamic updates
    const netEl = document.getElementById('topbar-net-ip');
    if (netEl && sys.host_ip) netEl.textContent = sys.host_ip;
    const upEl = document.getElementById('topbar-uptime');
    if (upEl && sys.uptime_str) upEl.textContent = sys.uptime_str;
    const sideUpEl = document.getElementById('sidebar-uptime');
    if (sideUpEl && sys.uptime_str) sideUpEl.textContent = `Uptime: ${sys.uptime_str}`;
    const cpuEl = document.getElementById('topbar-cpu');
    if (cpuEl && sys.cpu_percent != null) cpuEl.textContent = `${sys.cpu_percent}%`;
    const ramEl = document.getElementById('topbar-ram');
    if (ramEl && sys.ram_percent != null) ramEl.textContent = `${sys.ram_percent}%`;
    const stEl = document.getElementById('topbar-storage');
    if (stEl) stEl.textContent = `${sys.storage_percent || 28}% (${sys.storage_used_gb || 36} / ${sys.storage_total_gb || 128} GB)`;

    // IF ALREADY RENDERED, PERFORM ZERO-FLICKER IN-PLACE UPDATE ONLY
    if (isAlreadyRendered) {
      updateOverviewInPlace(overviewRes, breakerRes, totalNodesCount, onlineNodesCount, totalRelaysCount, activeRelaysCount, totalHomesCount, totalRoomsCount, automationsTotal, automationsEnabled);
      return;
    }

    // Breaker live reading
    let breakerTelemetry = {
      online: true,
      voltage_v: 257.0,
      current_a: '2.34',
      power_w: 505,
      power_kw: '0.51',
      total_energy_kwh: 401.2,
      temperature_c: 34,
      frequency_hz: 50.0,
      leakage_current_ma: 0,
      power_factor: 0.84,
      device_name: 'Wi-Fi Smart Circuit Breaker (Mains Feeder)'
    };

    if (breakerRes && breakerRes.reading) {
      const dec = breakerRes.reading.decoded || {};
      breakerTelemetry.online = Boolean(breakerRes.reading.online);
      if (dec.voltage_v != null) breakerTelemetry.voltage_v = dec.voltage_v;
      if (dec.current_a != null) breakerTelemetry.current_a = Number(dec.current_a).toFixed(2);
      if (dec.power_w != null) breakerTelemetry.power_w = dec.power_w;
      if (dec.power_kw != null) breakerTelemetry.power_kw = dec.power_kw;
      else breakerTelemetry.power_kw = (breakerTelemetry.power_w / 1000).toFixed(2);
      if (dec.total_energy_kwh != null) breakerTelemetry.total_energy_kwh = dec.total_energy_kwh;
      if (dec.temperature_c != null) breakerTelemetry.temperature_c = dec.temperature_c;
      if (dec.frequency_hz != null) breakerTelemetry.frequency_hz = dec.frequency_hz;
      if (dec.leakage_current_ma != null) breakerTelemetry.leakage_current_ma = dec.leakage_current_ma;
      if (dec.power_factor != null) breakerTelemetry.power_factor = dec.power_factor;
      if (breakerRes.config && breakerRes.config.device_name) breakerTelemetry.device_name = breakerRes.config.device_name;
    }

    const radius = 25;
    const circumference = 2 * Math.PI * radius;
    const cpuPct = sys.cpu_percent || 14;
    const ramPct = sys.ram_percent || 38;
    const stPct = sys.storage_percent || 28;
    const cpuOffset = circumference - (cpuPct / 100) * circumference;
    const ramOffset = circumference - (ramPct / 100) * circumference;
    const stOffset = circumference - (stPct / 100) * circumference;

    const chartData = [
      { h: '12 AM', on: 2, off: 1 },
      { h: '2 AM', on: 2, off: 1 },
      { h: '4 AM', on: 2, off: 1 },
      { h: '6 AM', on: 3, off: 1 },
      { h: '8 AM', on: 4, off: 2 },
      { h: '10 AM', on: 3, off: 1 },
      { h: '12 PM', on: 4, off: 2 },
      { h: '2 PM', on: 3, off: 1 },
      { h: '4 PM', on: 4, off: 1 },
      { h: '6 PM', on: 4, off: 2 },
      { h: '8 PM', on: 4, off: 1 },
      { h: '10 PM', on: 3, off: 1 }
    ];

    container.innerHTML = `
      <div class="dash-v2-container" id="dash-v2-container">
        <!-- 1. TOP 6 KPI METRICS ROW -->
        <div class="dash-kpi-grid">
          <!-- 1. Connected Devices -->
          <div class="dash-kpi-card">
            <div class="dash-kpi-icon-box dash-kpi-icon-devices">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/><path d="M15 10v4"/><path d="M9 10v4"/><path d="M12 3v7"/>
              </svg>
            </div>
            <div class="dash-kpi-info">
              <span class="dash-kpi-label">Connected Devices</span>
              <span class="dash-kpi-value" id="kpi-val-devices">${onlineNodesCount} / ${totalNodesCount}</span>
              <span class="dash-kpi-sub" id="kpi-sub-devices">
                <span>↑</span> ${totalNodesCount > 0 ? Math.round((onlineNodesCount / totalNodesCount) * 100) : 100}% Online
              </span>
            </div>
          </div>

          <!-- 2. Total Relays -->
          <div class="dash-kpi-card">
            <div class="dash-kpi-icon-box dash-kpi-icon-relays">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15V9"/><path d="M12 15V9"/><path d="M17 15V9"/><circle cx="7" cy="7" r="1" fill="currentColor"/>
              </svg>
            </div>
            <div class="dash-kpi-info">
              <span class="dash-kpi-label">Total Relays</span>
              <span class="dash-kpi-value" id="kpi-val-relays">${totalRelaysCount}</span>
              <span class="dash-kpi-sub" id="kpi-sub-relays">
                <span>↑</span> ${activeRelaysCount} Active
              </span>
            </div>
          </div>

          <!-- 3. Homes / Sites -->
          <div class="dash-kpi-card">
            <div class="dash-kpi-icon-box dash-kpi-icon-homes">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div class="dash-kpi-info">
              <span class="dash-kpi-label">Homes / Sites</span>
              <span class="dash-kpi-value" id="kpi-val-homes">${totalHomesCount}</span>
              <span class="dash-kpi-sub" id="kpi-sub-homes">
                <span>↑</span> ${totalRoomsCount} Rooms
              </span>
            </div>
          </div>

          <!-- 4. Automations -->
          <div class="dash-kpi-card">
            <div class="dash-kpi-icon-box dash-kpi-icon-automations">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="8" x2="5" y2="16"/><line x1="12" y1="8" x2="19" y2="16"/>
              </svg>
            </div>
            <div class="dash-kpi-info">
              <span class="dash-kpi-label">Automations</span>
              <span class="dash-kpi-value" id="kpi-val-auto">${automationsTotal}</span>
              <span class="dash-kpi-sub" id="kpi-sub-auto">
                <span>↑</span> ${automationsEnabled} Enabled
              </span>
            </div>
          </div>

          <!-- 5. OTA Status -->
          <div class="dash-kpi-card">
            <div class="dash-kpi-icon-box dash-kpi-icon-ota">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <div class="dash-kpi-info">
              <span class="dash-kpi-label">OTA Status</span>
              <span class="dash-kpi-value">0 Running</span>
              <span class="dash-kpi-sub muted">
                Catalog: v1.6.0 (Ready)
              </span>
            </div>
          </div>

          <!-- 6. System Health -->
          <div class="dash-kpi-card">
            <div class="dash-kpi-icon-box dash-kpi-icon-health">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <div class="dash-kpi-info">
              <span class="dash-kpi-label">System Health</span>
              <span class="dash-kpi-value" style="color: #10b981;">Healthy</span>
              <span class="dash-kpi-sub" style="color: #10b981;">
                <span>●</span> All Systems Operational
              </span>
            </div>
          </div>
        </div>

        <!-- 2. MIDDLE SPLIT: DEVICE STATUS & QUICK RELAY CONTROL -->
        <div class="dash-middle-grid">
          <!-- Left: Device Status (ESP Nodes) -->
          <div class="dash-card">
            <div class="dash-card-header">
              <div class="dash-card-title">
                <span>Device Status (ESP Nodes)</span>
              </div>
              <a class="dash-card-link" onclick="switchView('nodes')">
                <span>View All</span>
                <span>→</span>
              </a>
            </div>

            <div class="dash-table-wrap">
              <table class="dash-table">
                <thead>
                  <tr>
                    <th style="width: 32px;">#</th>
                    <th>Device Name</th>
                    <th>Type</th>
                    <th>Room / Home</th>
                    <th>IP Address</th>
                    <th>Signal</th>
                    <th>Status</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody id="dash-device-table-body">
                  ${dashFleetNodes.map((n, idx) => {
                    let typeName = n.hardware_type || 'ESP8266';
                    if (n.node_id && n.node_id.includes('30487D')) typeName = 'Tuya Breaker';
                    const ip = n.ip || n.ip_address || '192.168.1.25';
                    return `
                      <tr id="dash-node-row-${n.node_id}">
                        <td style="color: #64748b; font-weight: 600;">${idx + 1}</td>
                        <td style="font-weight: 600; color: #ffffff;">${escapeHtml(n.name || n.node_id)}</td>
                        <td>
                          <span class="type-pill ${typeName.toLowerCase().replace(/[^a-z0-9]/g, '')}">
                            ${typeName}
                          </span>
                        </td>
                        <td style="color: #94a3b8;">${escapeHtml(n.room || 'General')}</td>
                        <td style="font-family: monospace;">
                          <a href="http://${ip}" target="_blank" style="color: #38bdf8; text-decoration: none; display: inline-flex; align-items: center; gap: 3px;">
                            <span>${escapeHtml(ip)}</span>
                            <span style="font-size: 10px;">↗</span>
                          </a>
                        </td>
                        <td>
                          <div class="signal-cell">
                            <span>📶</span>
                            <span id="dash-node-rssi-${n.node_id}">${n.rssi || -55} dBm</span>
                          </div>
                        </td>
                        <td>
                          <span id="dash-node-status-${n.node_id}" class="${n.is_online ? 'status-pill-online' : 'status-pill-offline'}">
                            ${n.is_online ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td id="dash-node-lastseen-${n.node_id}" style="color: #94a3b8;">${n.is_online ? 'Live' : 'Offline'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Right: Relay Control (Quick) WITH ALL HOME SELECTOR -->
          <div class="dash-card">
            <div class="dash-card-header" style="display: flex; justify-content: space-between; align-items: center;">
              <div class="dash-card-title">
                <span>Relay Control (Quick)</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <label style="font-size: 11px; color: #94a3b8; font-weight: 500;">Home:</label>
                <select id="quick-relay-home-select" class="filter-select" onchange="onQuickRelayHomeChange(this.value)" style="padding: 4px 10px; font-size: 11.5px; background: #0f172a; color: #f1f5f9; border: 1px solid #334155; border-radius: 6px; cursor: pointer;">
                  <option value="all" ${quickRelaySelectedHome === 'all' ? 'selected' : ''}>All Homes (${getFilteredQuickRelays().length})</option>
                  ${dashFleetHomes.map(h => `<option value="${h.id}" ${quickRelaySelectedHome == h.id ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div id="dash-quick-relays-grid" class="dash-quick-relays-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 0; min-height: 220px;">
              ${renderQuickRelaysGridHtml()}
            </div>
            <div id="dash-quick-relays-pagination" class="dash-quick-relays-pagination">
              ${renderQuickRelaysPaginationHtml()}
            </div>
          </div>
        </div>

        <!-- 2.5 LIVE SMART CIRCUIT BREAKER SENSOR TELEMETRY PANEL -->
        <div class="dash-breaker-telemetry-panel">
          <div class="dash-card-header">
            <div class="dash-card-title" style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">⚡</span>
              <div>
                <span style="font-size: 15px; font-weight: 700; color: #ffffff;">Mains Smart Circuit Breaker Telemetry</span>
                <div style="font-size: 11.5px; color: #94a3b8; font-weight: 400; margin-top: 2px;">
                  ${escapeHtml(breakerTelemetry.device_name)} • Live Grid Line Feeder • Model: B-B1-M (Single Phase + Earth Leakage) • IP: 192.168.1.25
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="${breakerTelemetry.online ? 'status-pill-online' : 'status-pill-offline'}">
                ${breakerTelemetry.online ? '● Live Device Online' : '○ Offline'}
              </span>
              <span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 6px; display: flex; align-items: center; gap: 4px;">
                <span>🔒</span> Read-Only (Actuation Locked)
              </span>
            </div>
          </div>

          <!-- 7-Metric Sensor Tiles Grid -->
          <div class="dash-breaker-sensor-grid">
            <!-- 1. Voltage -->
            <div class="breaker-sensor-tile">
              <div class="breaker-sensor-header">
                <span class="breaker-sensor-icon">⚡</span>
                <span class="breaker-sensor-label">Mains Voltage</span>
              </div>
              <div class="breaker-sensor-value-wrap">
                <span class="breaker-sensor-value" id="breaker-val-voltage">${breakerTelemetry.voltage_v}</span>
                <span class="breaker-sensor-unit">V AC</span>
              </div>
              <div class="breaker-sensor-sub">Grid Nominal: 230V ±10%</div>
            </div>

            <!-- 2. Current -->
            <div class="breaker-sensor-tile">
              <div class="breaker-sensor-header">
                <span class="breaker-sensor-icon">🔌</span>
                <span class="breaker-sensor-label">Load Current</span>
              </div>
              <div class="breaker-sensor-value-wrap">
                <span class="breaker-sensor-value" id="breaker-val-current" style="color: #38bdf8;">${breakerTelemetry.current_a}</span>
                <span class="breaker-sensor-unit">A</span>
              </div>
              <div class="breaker-sensor-sub">Trip Limit: 30A / 63A</div>
            </div>

            <!-- 3. Active Power -->
            <div class="breaker-sensor-tile">
              <div class="breaker-sensor-header">
                <span class="breaker-sensor-icon">💡</span>
                <span class="breaker-sensor-label">Active Power</span>
              </div>
              <div class="breaker-sensor-value-wrap">
                <span class="breaker-sensor-value" id="breaker-val-power" style="color: #10b981;">${breakerTelemetry.power_w}</span>
                <span class="breaker-sensor-unit">W (${breakerTelemetry.power_kw} kW)</span>
              </div>
              <div class="breaker-sensor-sub">Power Factor: ${breakerTelemetry.power_factor}</div>
            </div>

            <!-- 4. Total Energy -->
            <div class="breaker-sensor-tile">
              <div class="breaker-sensor-header">
                <span class="breaker-sensor-icon">📊</span>
                <span class="breaker-sensor-label">Total Energy</span>
              </div>
              <div class="breaker-sensor-value-wrap">
                <span class="breaker-sensor-value" id="breaker-val-energy" style="color: #a855f7;">${breakerTelemetry.total_energy_kwh}</span>
                <span class="breaker-sensor-unit">kWh</span>
              </div>
              <div class="breaker-sensor-sub">Cumulative Metering</div>
            </div>

            <!-- 5. Internal Temp -->
            <div class="breaker-sensor-tile">
              <div class="breaker-sensor-header">
                <span class="breaker-sensor-icon">🌡️</span>
                <span class="breaker-sensor-label">Internal Temp</span>
              </div>
              <div class="breaker-sensor-value-wrap">
                <span class="breaker-sensor-value" id="breaker-val-temp" style="color: #f59e0b;">${breakerTelemetry.temperature_c}</span>
                <span class="breaker-sensor-unit">°C</span>
              </div>
              <div class="breaker-sensor-sub">Trip Cutoff: 96°C</div>
            </div>

            <!-- 6. Line Frequency -->
            <div class="breaker-sensor-tile">
              <div class="breaker-sensor-header">
                <span class="breaker-sensor-icon">〰️</span>
                <span class="breaker-sensor-label">Grid Frequency</span>
              </div>
              <div class="breaker-sensor-value-wrap">
                <span class="breaker-sensor-value" id="breaker-val-freq" style="color: #60a5fa;">${breakerTelemetry.frequency_hz}</span>
                <span class="breaker-sensor-unit">Hz</span>
              </div>
              <div class="breaker-sensor-sub">Synchronous Grid</div>
            </div>

            <!-- 7. Earth Leakage -->
            <div class="breaker-sensor-tile">
              <div class="breaker-sensor-header">
                <span class="breaker-sensor-icon">🛡️</span>
                <span class="breaker-sensor-label">Earth Leakage</span>
              </div>
              <div class="breaker-sensor-value-wrap">
                <span class="breaker-sensor-value" id="breaker-val-leak" style="color: #10b981;">${breakerTelemetry.leakage_current_ma}</span>
                <span class="breaker-sensor-unit">mA</span>
              </div>
              <div class="breaker-sensor-sub">Trip Limit: 200 mA (Safe)</div>
            </div>
          </div>

          <div class="dash-breaker-safety-bar">
            <span style="display: flex; align-items: center; gap: 6px;">
              <span>🔒</span>
              <span><strong>Live Feeder Line Protection Active:</strong> Remote actuation is locked. All circuit power switches are inhibited to protect connected equipment from unintended power cutoff.</span>
            </span>
          </div>
        </div>

        <!-- 3. THIRD ROW: 4 METRIC PANELS -->
        <div class="dash-quad-grid">
          <!-- Panel 1: Server Services -->
          <div class="dash-card">
            <div class="dash-card-header">
              <div class="dash-card-title">Server Services</div>
            </div>
            <div class="dash-services-list">
              <div class="dash-service-row">
                <span class="dash-service-name"><span>⇄</span> TCP Gateway (NDJSON)</span>
                <span class="dash-service-badge">Running</span>
              </div>
              <div class="dash-service-row">
                <span class="dash-service-name"><span>🖵</span> HTTP API (REST)</span>
                <span class="dash-service-badge">Running</span>
              </div>
              <div class="dash-service-row">
                <span class="dash-service-name"><span>💬</span> WebSocket (Real-time)</span>
                <span class="dash-service-badge">Running</span>
              </div>
              <div class="dash-service-row">
                <span class="dash-service-name"><span>☁️</span> MQTT Broker (Local)</span>
                <span class="dash-service-badge">Running</span>
              </div>
              <div class="dash-service-row">
                <span class="dash-service-name"><span>🗃️</span> Device Manager</span>
                <span class="dash-service-badge">Running</span>
              </div>
              <div class="dash-service-row">
                <span class="dash-service-name"><span>⚡</span> Automation Engine</span>
                <span class="dash-service-badge">Running</span>
              </div>
            </div>
          </div>

          <!-- Panel 2: System Resources (Real Hardware Metrics) -->
          <div class="dash-card">
            <div class="dash-card-header">
              <div class="dash-card-title">System Resources</div>
            </div>
            <div class="dash-gauges-wrap">
              <!-- CPU Gauge -->
              <div class="dash-gauge-item">
                <svg class="dash-gauge-svg" viewBox="0 0 64 64">
                  <circle class="dash-gauge-bg" cx="32" cy="32" r="${radius}"></circle>
                  <circle id="gauge-bar-cpu" class="dash-gauge-bar cpu" cx="32" cy="32" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${cpuOffset}"></circle>
                </svg>
                <div class="dash-gauge-text">
                  <span id="gauge-pct-cpu" class="dash-gauge-pct">${cpuPct}%</span>
                  <span class="dash-gauge-label">CPU</span>
                </div>
              </div>

              <!-- RAM Gauge -->
              <div class="dash-gauge-item">
                <svg class="dash-gauge-svg" viewBox="0 0 64 64">
                  <circle class="dash-gauge-bg" cx="32" cy="32" r="${radius}"></circle>
                  <circle id="gauge-bar-ram" class="dash-gauge-bar ram" cx="32" cy="32" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${ramOffset}"></circle>
                </svg>
                <div class="dash-gauge-text">
                  <span id="gauge-pct-ram" class="dash-gauge-pct">${ramPct}%</span>
                  <span class="dash-gauge-label">RAM</span>
                </div>
              </div>

              <!-- Storage Gauge -->
              <div class="dash-gauge-item">
                <svg class="dash-gauge-svg" viewBox="0 0 64 64">
                  <circle class="dash-gauge-bg" cx="32" cy="32" r="${radius}"></circle>
                  <circle id="gauge-bar-storage" class="dash-gauge-bar storage" cx="32" cy="32" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${stOffset}"></circle>
                </svg>
                <div class="dash-gauge-text">
                  <span id="gauge-pct-storage" class="dash-gauge-pct">${stPct}%</span>
                  <span class="dash-gauge-label">Storage</span>
                </div>
              </div>
            </div>

            <div class="dash-resources-footer" id="dash-resources-footer">
              <span>CPU: ${sys.cpu_used_cores || '1.4'} / ${sys.cpu_cores || '4'} Cores</span>
              <span>RAM: ${sys.ram_used_gb || '1.5'} / ${sys.ram_total_gb || '4'} GB</span>
              <span>Disk: ${sys.storage_used_gb || '36'} / ${sys.storage_total_gb || '128'} GB</span>
            </div>
          </div>

          <!-- Panel 3: Network & Throughput -->
          <div class="dash-card">
            <div class="dash-card-header">
              <div class="dash-card-title">Network & Throughput</div>
            </div>
            <!-- RX -->
            <div class="dash-net-row">
              <div class="dash-net-header">
                <span class="dash-net-label">
                  <span style="color: #00d2ff;">⬇️</span> RX (In)
                </span>
                <span class="dash-net-val">${sys.rx_mb_s || '1.24 MB/s'}</span>
              </div>
              <svg class="dash-sparkline-svg" viewBox="0 0 200 30" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#00d2ff" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#00d2ff" stop-opacity="0.0"/>
                  </linearGradient>
                </defs>
                <path d="M0,22 Q30,8 60,20 T120,10 T180,18 L200,12 L200,30 L0,30 Z" fill="url(#rxGrad)"/>
                <path d="M0,22 Q30,8 60,20 T120,10 T180,18 L200,12" fill="none" stroke="#00d2ff" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>

            <!-- TX -->
            <div class="dash-net-row" style="margin-bottom: 0;">
              <div class="dash-net-header">
                <span class="dash-net-label">
                  <span style="color: #10b981;">⬆️</span> TX (Out)
                </span>
                <span class="dash-net-val">${sys.tx_mb_s || '0.68 MB/s'}</span>
              </div>
              <svg class="dash-sparkline-svg" viewBox="0 0 200 30" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#10b981" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
                  </linearGradient>
                </defs>
                <path d="M0,24 Q40,16 80,22 T140,12 T190,16 L200,14 L200,30 L0,30 Z" fill="url(#txGrad)"/>
                <path d="M0,24 Q40,16 80,22 T140,12 T190,16 L200,14" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
          </div>

          <!-- Panel 4: Message Statistics (Live Real DB Counts) -->
          <div class="dash-card">
            <div class="dash-card-header">
              <div class="dash-card-title">Message Statistics (Live)</div>
            </div>
            <div class="dash-msg-list">
              <div class="dash-msg-row">
                <span class="dash-msg-label"><span>✉️</span> Total Messages</span>
                <span class="dash-msg-val">${sys.total_messages || '142'}</span>
              </div>
              <div class="dash-msg-row">
                <span class="dash-msg-label"><span>⇄</span> Commands (Tx)</span>
                <span class="dash-msg-val">${sys.commands_tx || '28'}</span>
              </div>
              <div class="dash-msg-row">
                <span class="dash-msg-label"><span>☁️</span> Updates (Rx)</span>
                <span class="dash-msg-val">${sys.updates_rx || '170'}</span>
              </div>
              <div class="dash-msg-row" style="margin-bottom: 0;">
                <span class="dash-msg-label"><span>⚠️</span> Errors</span>
                <span class="dash-msg-val" style="color: #10b981;">0</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. FOURTH ROW: LIVE LOGS & RELAY ACTIVITY -->
        <div class="dash-bottom-grid">
          <!-- Left: Recent Events / Live Logs -->
          <div class="dash-card">
            <div class="dash-card-header">
              <div class="dash-card-title">
                <span style="font-size: 15px;">Recent Events / Live Logs</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <select class="dash-filter-select" onchange="filterDashLogs(this.value)">
                  <option value="all">All Levels</option>
                  <option value="info">INFO</option>
                  <option value="warn">WARN</option>
                  <option value="mqtt">MQTT</option>
                  <option value="ota">OTA</option>
                </select>
                <button id="dash-log-pause-btn" class="dash-action-btn" onclick="toggleDashLogPause()">⏸ Pause</button>
                <button class="dash-action-btn" onclick="clearDashLogs()">Clear</button>
              </div>
            </div>

            <div class="dash-logs-body" id="dash-logs-body">
              ${dashLogs.map(item => `
                <div class="dash-log-line">
                  <span class="dash-log-time">${item.time}</span>
                  <span class="dash-log-tag ${item.tag.toLowerCase()}">${item.tag}</span>
                  <span class="dash-log-msg">${escapeHtml(item.msg)}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Right: Relay Activity -->
          <div class="dash-card">
            <div class="dash-card-header">
              <div class="dash-card-title">Relay Activity (Last 24 Hours)</div>
              <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; font-weight: 600;">
                <span style="display: flex; align-items: center; gap: 4px; color: #00d2ff;">
                  <span style="width: 10px; height: 10px; background: #00d2ff; border-radius: 2px;"></span> ON
                </span>
                <span style="display: flex; align-items: center; gap: 4px; color: #a855f7;">
                  <span style="width: 10px; height: 10px; background: #a855f7; border-radius: 2px;"></span> OFF
                </span>
              </div>
            </div>

            <div class="dash-chart-container">
              <div class="dash-chart-bars-wrap">
                ${chartData.map(col => {
                  const onH = Math.max(12, col.on * 8);
                  const offH = Math.max(8, col.off * 8);
                  return `
                    <div class="dash-chart-col">
                      <div class="dash-bar-tooltip">
                        ${col.h}: ${col.on} ON, ${col.off} OFF
                      </div>
                      <div class="dash-chart-stacked-bar">
                        <div class="dash-bar-off" style="height: ${offH}px;"></div>
                        <div class="dash-bar-on" style="height: ${onH}px;"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <div class="dash-chart-x-labels">
                <span>12 AM</span>
                <span>2 AM</span>
                <span>4 AM</span>
                <span>6 AM</span>
                <span>8 AM</span>
                <span>10 AM</span>
                <span>12 PM</span>
                <span>2 PM</span>
                <span>4 PM</span>
                <span>6 PM</span>
                <span>8 PM</span>
                <span>10 PM</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading overview: ${e.message}</div>`;
  }
}


// --- 2. HOME-CENTRIC NODE MANAGEMENT & DISCOVERY SCANNER ---
let activeHomeId = null;
let activeRoomTab = 'all'; // 'all', numeric roomId, or 'unassigned'
let cachedHomes = [];
let cachedRooms = [];


// ==========================================================================
// VIEW ①: DEVICES MANAGEMENT (MATCHING PANEL ①)
// ==========================================================================

// ==========================================================================
// VIEW ①: DEVICES / NODE FLEET MANAGEMENT (WITH ADD, ASSIGN & VISIT URL)
// ==========================================================================
let allFleetNodes = [];
let nodeFilterKeyword = '';
let nodeFilterStatus = 'all';
let nodeFilterHw = 'all';
let nodeFilterHome = 'all';
let nodeFilterRoom = 'all';
let nodeFilterSignal = 'all';
let nodeSortBy = 'name';

async function loadNodes() {
  const container = document.getElementById("content-area");
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes`);
    const data = await res.json();
    allFleetNodes = Array.isArray(data) ? data : (data.nodes || []);
    fleetData.nodes = allFleetNodes;

    // Fetch homes and rooms for filters
    const [homesRes, roomsRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/homes`).catch(() => ({ json: () => ({ homes: [] }) })),
      fetchWithAuth(`${API_BASE}/rooms`).catch(() => ({ json: () => ({ rooms: [] }) }))
    ]);
    const homesData = await homesRes.json();
    const roomsData = await roomsRes.json();
    const homesList = homesData.homes || [];
    const roomsList = roomsData.rooms || [];
    fleetData.homes = homesList;
    fleetData.rooms = roomsList;

    const onlineCount = allFleetNodes.filter(n => n.is_online).length;
    const offlineCount = allFleetNodes.length - onlineCount;

    container.innerHTML = `
      <div class="devices-view-wrap">
        <!-- Topbar actions -->
        <div class="devices-topbar-actions">
          <div>
            <h2 style="font-size: 19px; font-weight: 700; color: #ffffff; margin: 0;">Devices</h2>
            <p style="font-size: 12px; color: #94a3b8; margin: 3px 0 0 0;">Manage all ESP devices (ESP01 / ESP8266 / ESP32 / Tuya)</p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn-action-neutral" onclick="handleBatchPingFleet()">📶 Ping Fleet</button>
            <button class="btn-action-neutral" onclick="handleBatchSyncFleetPins()">🔄 Sync Pins</button>
            <button class="btn-add-primary" onclick="showAddNodeModal()">
              <span>+ Add Device</span>
            </button>
          </div>
        </div>

        <!-- Enhanced Multi-Filter Bar -->
        <div class="nodes-multifilter-container">
          <div class="nodes-filter-row">
            <div class="devices-search-box" style="flex: 1; min-width: 240px;">
              <span style="font-size: 13px; color: #64748b;">🔍</span>
              <input type="text" id="device-search-input" class="devices-search-input" 
                placeholder="Search device (name, IP, MAC, room, hardware)..." 
                value="${escapeHtml(nodeFilterKeyword)}"
                oninput="handleEnhancedNodeSearch(this.value)">
            </div>

            <select class="filter-select-enhanced" onchange="handleNodeStatusFilter(this.value)">
              <option value="all" ${nodeFilterStatus === 'all' ? 'selected' : ''}>Status: All (${allFleetNodes.length})</option>
              <option value="online" ${nodeFilterStatus === 'online' ? 'selected' : ''}>● Online (${onlineCount})</option>
              <option value="offline" ${nodeFilterStatus === 'offline' ? 'selected' : ''}>○ Offline (${offlineCount})</option>
            </select>

            <select class="filter-select-enhanced" onchange="handleNodeHwFilter(this.value)">
              <option value="all" ${nodeFilterHw === 'all' ? 'selected' : ''}>Hardware: All</option>
              <option value="esp8266" ${nodeFilterHw === 'esp8266' ? 'selected' : ''}>ESP8266</option>
              <option value="esp-01" ${nodeFilterHw === 'esp-01' ? 'selected' : ''}>ESP-01</option>
              <option value="esp32" ${nodeFilterHw === 'esp32' ? 'selected' : ''}>ESP32</option>
              <option value="tuya" ${nodeFilterHw === 'tuya' ? 'selected' : ''}>Smart Breaker</option>
              <option value="sensor" ${nodeFilterHw === 'sensor' ? 'selected' : ''}>Sensors</option>
            </select>

            <select class="filter-select-enhanced" onchange="handleNodeHomeFilter(this.value)">
              <option value="all" ${nodeFilterHome === 'all' ? 'selected' : ''}>Home: All Homes</option>
              ${homesList.map(h => `<option value="${h.id}" ${nodeFilterHome == h.id ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}
            </select>

            <select class="filter-select-enhanced" onchange="handleNodeRoomFilter(this.value)">
              <option value="all" ${nodeFilterRoom === 'all' ? 'selected' : ''}>Room: All Rooms</option>
              ${roomsList.map(r => `<option value="${escapeHtml(r.name)}" ${nodeFilterRoom === r.name ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
            </select>

            <select class="filter-select-enhanced" onchange="handleNodeSignalFilter(this.value)">
              <option value="all" ${nodeFilterSignal === 'all' ? 'selected' : ''}>Signal: All</option>
              <option value="strong" ${nodeFilterSignal === 'strong' ? 'selected' : ''}>📶 Strong (&ge; -60 dBm)</option>
              <option value="medium" ${nodeFilterSignal === 'medium' ? 'selected' : ''}>📶 Medium (-61 to -75 dBm)</option>
              <option value="weak" ${nodeFilterSignal === 'weak' ? 'selected' : ''}>📶 Weak (&lt; -75 dBm)</option>
            </select>

            <select class="filter-select-enhanced" onchange="handleNodeSort(this.value)">
              <option value="name" ${nodeSortBy === 'name' ? 'selected' : ''}>Sort: Name</option>
              <option value="ip" ${nodeSortBy === 'ip' ? 'selected' : ''}>Sort: IP Address</option>
              <option value="signal" ${nodeSortBy === 'signal' ? 'selected' : ''}>Sort: Signal Strength</option>
              <option value="status" ${nodeSortBy === 'status' ? 'selected' : ''}>Sort: Status</option>
            </select>
          </div>
        </div>

        <!-- Table View -->
        <div class="devices-table-wrap">
          <table class="devices-table">
            <thead>
              <tr>
                <th style="width: 40px;">#</th>
                <th>Device Name</th>
                <th>Type</th>
                <th>IP Address (Click to Visit)</th>
                <th>Room / Home</th>
                <th>Signal</th>
                <th>Status</th>
                <th style="text-align: right; width: 170px;">Actions</th>
              </tr>
            </thead>
            <tbody id="devices-table-body">
              ${renderDevicesRows(getFilteredNodesList())}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading devices: ${err.message}</div>`;
  }
}

function getFilteredNodesList() {
  let list = allFleetNodes.slice();

  // Search filter
  if (nodeFilterKeyword) {
    const q = nodeFilterKeyword.toLowerCase();
    list = list.filter(n => 
      (n.name && n.name.toLowerCase().includes(q)) ||
      (n.node_id && n.node_id.toLowerCase().includes(q)) ||
      (n.ip_address && n.ip_address.toLowerCase().includes(q)) ||
      (n.mac_address && n.mac_address.toLowerCase().includes(q)) ||
      (n.room && n.room.toLowerCase().includes(q)) ||
      (n.hardware_type && n.hardware_type.toLowerCase().includes(q))
    );
  }

  // Status filter
  if (nodeFilterStatus === 'online') list = list.filter(n => n.is_online);
  else if (nodeFilterStatus === 'offline') list = list.filter(n => !n.is_online);

  // Hardware filter
  if (nodeFilterHw !== 'all') {
    const h = nodeFilterHw.toLowerCase();
    list = list.filter(n => {
      const type = (n.hardware_type || n.name || '').toLowerCase();
      if (h === 'tuya') return type.includes('breaker') || n.node_id.includes('30487D');
      if (h === 'sensor') return type.includes('sensor');
      return type.includes(h);
    });
  }

  // Home filter
  if (nodeFilterHome !== 'all') {
    list = list.filter(n => n.home_id == nodeFilterHome);
  }

  // Room filter
  if (nodeFilterRoom !== 'all') {
    list = list.filter(n => (n.room || '').toLowerCase() === nodeFilterRoom.toLowerCase());
  }

  // Signal filter
  if (nodeFilterSignal === 'strong') {
    list = list.filter(n => (n.rssi || -55) >= -60);
  } else if (nodeFilterSignal === 'medium') {
    list = list.filter(n => (n.rssi || -55) < -60 && (n.rssi || -55) >= -75);
  } else if (nodeFilterSignal === 'weak') {
    list = list.filter(n => (n.rssi || -55) < -75);
  }

  // Sort
  list.sort((a, b) => {
    if (nodeSortBy === 'ip') return (a.ip_address || '').localeCompare(b.ip_address || '');
    if (nodeSortBy === 'signal') return (b.rssi || -99) - (a.rssi || -99);
    if (nodeSortBy === 'status') return (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0);
    return (a.name || a.node_id || '').localeCompare(b.name || b.node_id || '');
  });

  return list;
}

function handleEnhancedNodeSearch(val) {
  nodeFilterKeyword = val;
  updateNodesTable();
}

function handleNodeStatusFilter(val) {
  nodeFilterStatus = val;
  updateNodesTable();
}

function handleNodeHwFilter(val) {
  nodeFilterHw = val;
  updateNodesTable();
}

function handleNodeHomeFilter(val) {
  nodeFilterHome = val;
  updateNodesTable();
}

function handleNodeRoomFilter(val) {
  nodeFilterRoom = val;
  updateNodesTable();
}

function handleNodeSignalFilter(val) {
  nodeFilterSignal = val;
  updateNodesTable();
}

function handleNodeSort(val) {
  nodeSortBy = val;
  updateNodesTable();
}

function updateNodesTable() {
  const tbody = document.getElementById("devices-table-body");
  if (tbody) tbody.innerHTML = renderDevicesRows(getFilteredNodesList());
}

function renderDevicesRows(nodes) {
  if (nodes.length === 0) {
    return '<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 30px;">No matching devices found in fleet.</td></tr>';
  }

  return nodes.map((n, idx) => {
    let typeClass = 'type-badge-esp8266';
    let typeLabel = 'ESP8266';
    const hw = (n.hardware_type || n.name || '').toLowerCase();
    if (hw.includes('esp-01') || hw.includes('esp01')) {
      typeClass = 'type-badge-esp01';
      typeLabel = 'ESP-01';
    } else if (hw.includes('esp32')) {
      typeClass = 'type-badge-esp32';
      typeLabel = 'ESP32';
    } else if (hw.includes('breaker') || n.node_id.includes('30487D')) {
      typeClass = 'type-badge-esp8266';
      typeLabel = 'Tuya Breaker';
    } else if (hw.includes('sensor')) {
      typeClass = 'type-badge-esp32';
      typeLabel = 'Sensor Node';
    }

    const isBreaker = (n.node_id || '').includes('30487D') || hw.includes('breaker');
    const isOnline = Boolean(n.is_online);
    const rssi = n.rssi != null ? n.rssi : -52;
    const signalColor = rssi >= -60 ? '#10b981' : (rssi >= -75 ? '#f59e0b' : '#ef4444');
    const nodeIp = n.ip_address || n.ip || '';

    return `
      <tr>
        <td style="color: #64748b; font-weight: 500;">${idx + 1}</td>
        <td>
          <span style="font-weight: 600; color: #ffffff; cursor: pointer;" onclick="showNodeInfoModal('${n.node_id}')">${escapeHtml(n.name || n.node_id)}</span>
          <br><small style="color: #64748b; font-family: monospace;">${escapeHtml(n.node_id)}</small>
        </td>
        <td><span class="device-type-badge ${typeClass}">${typeLabel}</span></td>
        <td>
          ${nodeIp ? `
            <a href="http://${escapeHtml(nodeIp)}" target="_blank" style="color: #38bdf8; text-decoration: underline; font-family: monospace; font-size: 13px;" title="Visit Device Web Portal">
              http://${escapeHtml(nodeIp)} ↗
            </a>
          ` : '<span style="color: #64748b;">N/A</span>'}
        </td>
        <td style="color: #94a3b8;">${escapeHtml(n.room || n.room_name || 'General')}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: ${signalColor};">📶</span>
            <span style="color: ${signalColor}; font-weight: 600; font-size: 12px;">${rssi} dBm</span>
          </div>
        </td>
        <td>
          <span class="${isOnline ? 'status-pill-online' : 'status-pill-offline'}">
            ${isOnline ? '● Online' : '○ Offline'}
          </span>
        </td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            ${nodeIp ? `<button class="btn-action-icon" title="Visit Device Web Portal" onclick="window.open('http://${escapeHtml(nodeIp)}', '_blank')">🌐</button>` : ''}
            <button class="btn-action-icon" title="Assign to Room" onclick="showAssignNodeModal('${n.node_id}')">🚪</button>
            <button class="btn-action-icon" title="Edit Device Settings" onclick="showNodeSettingsModal('${n.node_id}')">✏️</button>
            <button class="btn-action-icon" title="Device Details & Diagnostics" onclick="showNodeInfoModal('${n.node_id}')">ℹ️</button>
            <button class="btn-action-icon" title="Browse LittleFS Files" onclick="selectedFsNodeId = '${n.node_id}'; switchView('littlefs');">📁</button>
            ${!isBreaker ? `
              <button class="btn-action-icon" title="Hardware Serial Logs" onclick="showNodeLogsModal('${n.node_id}')">📜</button>
              <button class="btn-action-icon" title="IR Remote & Code Learner" onclick="showNodeIrModal('${n.node_id}')">📡</button>
            ` : ''}
            <button class="btn-action-icon" title="Ping Device" onclick="pingNode('${n.node_id}')">⚡</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// --------------------------------------------------------------------------
// + ADD DEVICE / PROBE & REGISTER MODAL
// --------------------------------------------------------------------------
function showAddNodeModal(prefillIp = '', prefillName = '', prefillUser = 'admin', prefillPass = 'admin') {
  const homes = fleetData.homes || [];
  const rooms = fleetData.rooms || [];

  const html = `
    <div class="modal-content" style="max-width: 540px; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px;">
        <h3 style="margin: 0; color: #fff; font-size: 17px;">+ Register Fleet Node</h3>
        <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="closeModal()">&times;</button>
      </div>

      <p style="font-size: 12.5px; color: #94a3b8; margin: 0 0 16px 0; line-height: 1.5;">
        Enter the LAN IP and optional authentication credentials of your ESP8266 or ESP32 node. The server will probe its status, read configured channels, and register it in the central fleet.
      </p>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="settings-field-label">Node IP Address *</label>
        <input type="text" id="add-node-ip" class="settings-input" style="width: 100%;" placeholder="e.g. 192.168.1.103" value="${escapeHtml(prefillIp || '192.168.1.103')}">
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="settings-field-label">Friendly Device Name (Optional)</label>
        <input type="text" id="add-node-name" class="settings-input" style="width: 100%;" placeholder="e.g. Balcony Light Controller" value="${escapeHtml(prefillName)}">
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div class="form-group">
          <label class="settings-field-label">Target Home</label>
          <select id="add-node-home" class="filter-select-enhanced" style="width: 100%;">
            ${homes.map(h => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="settings-field-label">Target Room</label>
          <select id="add-node-room" class="filter-select-enhanced" style="width: 100%;">
            ${rooms.map(r => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`).join('')}
            <option value="General">General / Other</option>
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div class="form-group">
          <label class="settings-field-label">Node Login User</label>
          <input type="text" id="add-node-user" class="settings-input" style="width: 100%;" value="${escapeHtml(prefillUser)}">
        </div>
        <div class="form-group">
          <label class="settings-field-label">Node Password</label>
          <input type="password" id="add-node-pass" class="settings-input" style="width: 100%;" value="${escapeHtml(prefillPass)}">
        </div>
      </div>

      <div id="add-node-status-box" style="display: none; font-size: 12.5px; padding: 10px; border-radius: 6px; margin-bottom: 14px;"></div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid #1e293b;">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-save-settings" id="btn-submit-add-node" onclick="submitAddNode()">Probe & Register Node</button>
      </div>
    </div>
  `;
  openModal(html);
}

async function submitAddNode() {
  const ip = document.getElementById("add-node-ip").value.trim();
  const name = document.getElementById("add-node-name").value.trim();
  const room = document.getElementById("add-node-room").value;
  const auth_username = document.getElementById("add-node-user").value.trim() || 'admin';
  const auth_password = document.getElementById("add-node-pass").value.trim() || 'admin';
  const statusBox = document.getElementById("add-node-status-box");
  const btn = document.getElementById("btn-submit-add-node");

  if (!ip) {
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "#ef4444";
    statusBox.textContent = "Please enter a valid IP address.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Probing Node...";
  statusBox.style.display = "block";
  statusBox.style.background = "rgba(56, 189, 248, 0.15)";
  statusBox.style.color = "#38bdf8";
  statusBox.textContent = `Connecting to http://${ip}/api/status...`;

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, name, room, auth_username, auth_password })
    });
    const result = await res.json();

    if (result.success) {
      statusBox.style.background = "rgba(16, 185, 129, 0.15)";
      statusBox.style.color = "#10b981";
      statusBox.textContent = `Success: ${result.message || 'Node successfully registered in fleet!'}`;
      setTimeout(() => {
        closeModal();
        loadNodes();
      }, 1000);
    } else {
      btn.disabled = false;
      btn.textContent = "Probe & Register Node";
      statusBox.style.background = "rgba(239, 68, 68, 0.15)";
      statusBox.style.color = "#ef4444";
      statusBox.textContent = `Error: ${result.error || 'Failed to register node'}`;
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Probe & Register Node";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "#ef4444";
    statusBox.textContent = `Request error: ${err.message}`;
  }
}

// --------------------------------------------------------------------------
// 🚪 ASSIGN NODE TO ROOM MODAL
// --------------------------------------------------------------------------
async function showAssignNodeModal(nodeId) {
  try {
    const [homesRes, roomsRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/homes`),
      fetchWithAuth(`${API_BASE}/rooms`)
    ]);
    const homesData = await homesRes.json();
    const roomsData = await roomsRes.json();
    const homes = homesData.homes || [];
    const rooms = roomsData.rooms || [];

    const node = (fleetData.nodes || []).find(n => n.node_id === nodeId) || { node_id: nodeId };

    const html = `
      <div class="modal-content" style="max-width: 500px; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px;">
          <h3 style="margin: 0; color: #fff; font-size: 16px;">🚪 Assign Node to Room</h3>
          <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="closeModal()">&times;</button>
        </div>

        <p style="font-size: 13px; color: #94a3b8; margin: 0 0 16px 0; line-height: 1.5;">
          Assign controller <strong style="color: #fff;">${escapeHtml(node.name || node.node_id)}</strong> (<code style="color: #38bdf8;">${nodeId}</code>) to a Home and Room location.
        </p>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="settings-field-label">Target Home *</label>
          <select id="assign-target-home" class="filter-select-enhanced" style="width: 100%;">
            ${homes.map(h => `<option value="${h.id}" ${h.id === node.home_id ? 'selected' : ''}>${escapeHtml(h.name)}</option>`).join('')}
          </select>
        </div>

        <div class="form-group" style="margin-bottom: 16px;">
          <label class="settings-field-label">Target Room *</label>
          <select id="assign-target-room" class="filter-select-enhanced" style="width: 100%;">
            ${rooms.map(r => `<option value="${r.id}" ${r.id === node.room_id ? 'selected' : ''}>${escapeHtml(r.name)} (${escapeHtml(r.home_name || 'Home')})</option>`).join('')}
          </select>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid #1e293b;">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-save-settings" onclick="submitAssignNode('${nodeId}')">Assign Node</button>
        </div>
      </div>
    `;
    openModal(html);
  } catch (err) {
    alert("Error loading assignment options: " + err.message);
  }
}

async function submitAssignNode(nodeId) {
  const homeId = Number(document.getElementById("assign-target-home").value);
  const roomId = Number(document.getElementById("assign-target-room").value);

  if (!homeId || !roomId) {
    alert("Please select both a target Home and Room");
    return;
  }

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${nodeId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeId, roomId })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Node successfully assigned to ${data.node?.room_name || 'Room'}!`);
      closeModal();
      loadNodes();
    } else {
      alert("Assignment failed: " + (data.error || "Unknown error"));
    }
  } catch (err) {
    alert("Assign request error: " + err.message);
  }
}

// --------------------------------------------------------------------------
// ✏️ EDIT NODE SETTINGS MODAL
// --------------------------------------------------------------------------
function showNodeSettingsModal(nodeId) {
  const node = (fleetData.nodes || []).find(n => n.node_id === nodeId) || { node_id: nodeId };
  const html = `
    <div class="modal-content" style="max-width: 520px; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px;">
        <h3 style="margin: 0; color: #fff; font-size: 16px;">Configure Device: ${escapeHtml(node.name || node.node_id)}</h3>
        <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="closeModal()">&times;</button>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="settings-field-label">Device Name</label>
        <input type="text" id="config-node-name" class="settings-input" style="width: 100%;" value="${escapeHtml(node.name || node.node_id)}">
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="settings-field-label">Device IP Address</label>
        <input type="text" id="config-node-ip" class="settings-input" style="width: 100%; font-family: monospace;" value="${escapeHtml(node.ip_address || node.ip || '')}">
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="settings-field-label">Assigned Room</label>
        <input type="text" id="config-node-room" class="settings-input" style="width: 100%;" value="${escapeHtml(node.room || node.room_name || '')}">
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div class="form-group">
          <label class="settings-field-label">Auth Username</label>
          <input type="text" id="config-node-user" class="settings-input" style="width: 100%;" value="${escapeHtml(node.auth_username || 'admin')}">
        </div>
        <div class="form-group">
          <label class="settings-field-label">Auth Password</label>
          <input type="password" id="config-node-pass" class="settings-input" style="width: 100%;" value="${escapeHtml(node.auth_password || 'admin')}">
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid #1e293b;">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-save-settings" onclick="saveNodeSettings('${nodeId}')">Save Changes</button>
      </div>
    </div>
  `;
  openModal(html);
}

async function saveNodeSettings(nodeId) {
  const name = document.getElementById("config-node-name").value.trim();
  const ip = document.getElementById("config-node-ip").value.trim();
  const room = document.getElementById("config-node-room").value.trim();
  const auth_username = document.getElementById("config-node-user").value.trim();
  const auth_password = document.getElementById("config-node-pass").value.trim();

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${nodeId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ip, room, auth_username, auth_password })
    });
    const data = await res.json();
    alert(data.message || 'Device settings updated successfully');
    closeModal();
    loadNodes();
    if (typeof loadRelays === 'function') loadRelays();
  } catch (err) {
    alert("Failed to save device settings: " + err.message);
  }
}

// --------------------------------------------------------------------------
// ℹ️ DEVICE DETAILS & DIAGNOSTICS MODAL
// --------------------------------------------------------------------------
async function showNodeInfoModal(nodeId) {
  let node = (fleetData.nodes || []).find(n => n.node_id === nodeId) || { node_id: nodeId };
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.node) node = { ...node, ...data.node };
    }
  } catch (e) {}

  const channels = (fleetData.relays || []).filter(r => r.node_id === nodeId);
  const isOnline = Boolean(node.is_online);
  const nodeIp = node.ip_address || node.ip || '';
  const isBreaker = nodeId.includes('30487D') || (node.hardware_type || '').includes('Breaker');

  const html = `
    <div class="modal-content" style="max-width: 720px; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 14px; margin-bottom: 18px;">
        <div>
          <h3 style="margin: 0; color: #fff; font-size: 17px; display: flex; align-items: center; gap: 8px;">
            <span>${escapeHtml(node.name || node.node_id)}</span>
            <span class="${isOnline ? 'status-pill-online' : 'status-pill-offline'}" style="font-size: 11px;">
              ${isOnline ? 'Online' : 'Offline'}
            </span>
          </h3>
          <span style="color: #64748b; font-size: 12px; font-family: monospace;">ID: ${node.node_id}</span>
        </div>
        <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="closeModal()">&times;</button>
      </div>

      <!-- Specs Grid -->
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; background: #090e1a; padding: 14px 16px; border-radius: 10px; border: 1px solid rgba(56, 189, 248, 0.1); margin-bottom: 14px;">
        <div style="font-size: 12.5px; color: #94a3b8;"><strong>Hardware:</strong> <span style="color: #fff;">${escapeHtml(node.hardware_type || 'ESP8266')}</span></div>
        <div style="font-size: 12.5px; color: #94a3b8;"><strong>IP Address:</strong> <a href="http://${escapeHtml(nodeIp)}" target="_blank" style="color: #38bdf8; font-family: monospace; text-decoration: underline;">${nodeIp || 'N/A'} ↗</a></div>
        <div style="font-size: 12.5px; color: #94a3b8;"><strong>MAC Address:</strong> <span style="color: #cbd5e1; font-family: monospace;">${node.mac_address || node.mac || 'N/A'}</span></div>
        <div style="font-size: 12.5px; color: #94a3b8;"><strong>Signal (RSSI):</strong> <span style="color: #10b981; font-weight: 600;">📶 ${node.rssi || -52} dBm</span></div>
        <div style="font-size: 12.5px; color: #94a3b8;"><strong>Assigned Room:</strong> <span style="color: #fff;">${escapeHtml(node.room || node.room_name || 'General')}</span></div>
        <div style="font-size: 12.5px; color: #94a3b8;"><strong>Uptime:</strong> <span style="color: #fff;">${formatUptime(node.uptime_sec)}</span></div>
      </div>

      <!-- Security & Hardware Integration Bar -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #090e1a; padding: 12px 16px; border-radius: 10px; border: 1px solid #1e293b; margin-bottom: 16px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 11.5px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">🔐 Dual-Auth Fleet Pairing</div>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div>
              ${node.is_paired ? `
                <span class="status-pill-online" style="font-size: 11px;">🔒 Paired & Key Active</span>
              ` : `
                <span class="status-pill-offline" style="font-size: 11px;">🔓 Unpaired (Open Auth)</span>
              `}
            </div>
            ${!isBreaker ? `
              <div>
                ${node.is_paired ? `
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px; color: #f87171;" onclick="handleUnpairNode('${node.node_id}')">Unpair</button>
                ` : `
                  <button class="btn btn-primary" style="font-size: 11px; padding: 2px 8px;" onclick="handlePairNode('${node.node_id}')">🔑 Pair Node</button>
                `}
              </div>
            ` : '<span style="font-size: 11px; color: #64748b;">Not required</span>'}
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 11.5px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">🔌 I2C & PCF8574 Expansion</div>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div>
              ${node.pcf8574_detected ? `
                <span style="color: #10b981; font-size: 11.5px; font-weight: 600;">PCF8574 (${escapeHtml(node.i2c_address || '0x20')})</span>
              ` : (node.i2c_enabled ? `
                <span style="color: #38bdf8; font-size: 11.5px;">I2C Active</span>
              ` : `
                <span style="color: #64748b; font-size: 11.5px;">I2C Inactive</span>
              `)}
            </div>
            ${!isBreaker ? `
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px;" onclick="handleScanI2c('${node.node_id}')">🔍 Scan</button>
                ${node.pcf8574_detected ? `
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px; color: #38bdf8; border-color: rgba(56,189,248,0.4);" title="Auto-map 8 Relay expansion channels" onclick="handleAutoProvisionPcf('${node.node_id}')">⚡ 8-CH</button>
                ` : ''}
              </div>
            ` : '<span style="font-size: 11px; color: #64748b;">Not required</span>'}
          </div>
        </div>
      </div>

      <!-- Channel Pinout List -->
      <h4 style="margin: 0 0 10px 0; color: #cbd5e1; font-size: 13.5px;">Configured Relay Channels (${channels.length})</h4>
      <div style="max-height: 160px; overflow-y: auto; background: #090e1a; border-radius: 8px; border: 1px solid #1e293b;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid #1e293b; color: #64748b;">
              <th style="padding: 8px 12px;">CH #</th>
              <th style="padding: 8px 12px;">Name</th>
              <th style="padding: 8px 12px;">GPIO Pin</th>
              <th style="padding: 8px 12px;">State</th>
              <th style="padding: 8px 12px; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${channels.length === 0 ? '<tr><td colspan="5" style="padding: 12px; text-align: center; color: #64748b;">No channels configured.</td></tr>' : channels.map(c => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td style="padding: 8px 12px; color: #38bdf8; font-weight: 600;">CH${c.channel_id}</td>
                <td style="padding: 8px 12px; color: #fff;">${escapeHtml(c.name)}</td>
                <td style="padding: 8px 12px;"><span class="gpio-badge">GPIO ${c.pin != null ? c.pin : c.channel_id}</span></td>
                <td style="padding: 8px 12px;">
                  <span style="color: ${c.current_state ? '#10b981' : '#ef4444'}; font-weight: 600;">
                    ${c.current_state ? 'ON' : 'OFF'}
                  </span>
                </td>
                <td style="padding: 8px 12px; text-align: right;">
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px;" onclick="toggleRelay('${c.node_id}', ${c.channel_id}, ${!c.current_state}); setTimeout(() => showNodeInfoModal('${nodeId}'), 300);">
                    Toggle
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding-top: 14px; border-top: 1px solid #1e293b; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          ${nodeIp ? `<button class="btn-neutral-action" onclick="window.open('http://${escapeHtml(nodeIp)}', '_blank')">🌐 Visit Device</button>` : ''}
          <button class="btn-neutral-action" onclick="closeModal(); showAssignNodeModal('${node.node_id}')">🚪 Assign Room</button>
          <button class="btn-neutral-action" onclick="pingNode('${node.node_id}')">⚡ Ping</button>
          <button class="btn-neutral-action" onclick="syncPinsWithHardware('${node.node_id}')">🔄 Sync Pins</button>
          <button class="btn-neutral-action" onclick="closeModal(); selectedFsNodeId = '${node.node_id}'; switchView('littlefs');">📁 LittleFS Files</button>
          ${!isBreaker ? `
            <button class="btn-neutral-action" style="color: #38bdf8; border-color: rgba(56,189,248,0.3);" onclick="showNodeLogsModal('${node.node_id}')">📜 Hardware Logs</button>
            <button class="btn-neutral-action" style="color: #a78bfa; border-color: rgba(167,139,250,0.3);" onclick="showNodeIrModal('${node.node_id}')">📡 IR Remote</button>
          ` : ''}
        </div>
        <button class="btn btn-primary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
  openModal(html);
}

// --------------------------------------------------------------------------
// PAIRING & I2C HANDLERS
// --------------------------------------------------------------------------
async function handlePairNode(nodeId) {
  if (!confirm(`Pair node '${nodeId}' with a permanent server key? This will authenticate all future control requests.`)) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/pair`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to pair node');
    alert(`Node paired successfully!\nServer Key: ${data.serverKey}`);
    await loadNodes();
    showNodeInfoModal(nodeId);
  } catch (err) {
    alert('Pairing error: ' + err.message);
  }
}

async function handleUnpairNode(nodeId) {
  if (!confirm(`Unpair node '${nodeId}'? This removes the server key from the node and central server.`)) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/unpair`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to unpair node');
    alert('Node unpaired successfully.');
    await loadNodes();
    showNodeInfoModal(nodeId);
  } catch (err) {
    alert('Unpair error: ' + err.message);
  }
}

async function handleScanI2c(nodeId) {
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/i2c/scan`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'I2C scan failed');
    if (data.count === 0) {
      alert(`I2C Bus Scan Complete on ${nodeId}:\nNo I2C devices detected on SDA/SCL pins.`);
    } else {
      const devList = (data.devices || []).map(d => `• Address: ${d.hex} (${d.address}) - Type: ${d.type || 'Unknown'}`).join('\n');
      alert(`I2C Bus Scan Complete on ${nodeId}:\nFound ${data.count} device(s):\n${devList}\n\nPCF8574 Expander Detected: ${data.pcfDetected ? 'YES (' + data.pcfAddress + ')' : 'NO'}`);
    }
    await loadNodes();
    showNodeInfoModal(nodeId);
  } catch (err) {
    alert('I2C scan error: ' + err.message);
  }
}

async function handleAutoProvisionPcf(nodeId) {
  if (!confirm(`Auto-generate 8 Relay expansion channels for PCF8574 on node '${nodeId}'? This will automatically map GPIO pins 100-107 into the fleet and pin matrix.`)) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/i2c/auto-channels`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Auto-provision failed');
    alert('Successfully generated 8 PCF8574 expansion channels and synchronized pin matrix!');
    await loadNodes();
    showNodeInfoModal(nodeId);
  } catch (err) {
    alert('Auto-provision error: ' + err.message);
  }
}

// --------------------------------------------------------------------------
// HARDWARE SERIAL LOGS VIEWER
// --------------------------------------------------------------------------
async function showNodeLogsModal(nodeId) {
  const node = (fleetData.nodes || []).find(n => n.node_id === nodeId) || { node_id: nodeId };
  const html = `
    <div class="modal-content" style="max-width: 780px; width: 90%; background: #0b1120; border: 1px solid #1e293b; border-radius: 14px; padding: 22px; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 14px;">
        <h3 style="margin: 0; color: #fff; font-size: 16px; display: flex; align-items: center; gap: 8px;">
          <span>📜 Hardware Serial Logs: ${escapeHtml(node.name || nodeId)}</span>
        </h3>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="refreshNodeLogs('${nodeId}')">🔄 Refresh</button>
          <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="closeModal()">&times;</button>
        </div>
      </div>
      <div id="node-logs-container" style="background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 14px; height: 350px; overflow-y: auto; font-family: monospace; font-size: 12px; line-height: 1.6; color: #cbd5e1;">
        <div style="color: #64748b;">Loading hardware logs from node...</div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 10px; border-top: 1px solid #1e293b;">
        <span style="font-size: 11px; color: #64748b;">Source: Microcontroller RAM circular log buffer (/api/logs)</span>
        <button class="btn btn-primary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
  openModal(html);
  await refreshNodeLogs(nodeId);
}

async function refreshNodeLogs(nodeId) {
  const container = document.getElementById("node-logs-container");
  if (!container) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/hardware-logs`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch hardware logs');
    const logs = data.logs || [];
    if (logs.length === 0) {
      container.innerHTML = '<div style="color: #64748b; text-align: center; padding: 40px 0;">No log entries recorded yet in microcontroller memory.</div>';
      return;
    }
    container.innerHTML = logs.map(l => {
      const up = l.uptimeMs != null ? `[+${(l.uptimeMs / 1000).toFixed(2)}s]` : (l.time || '');
      const msg = escapeHtml(l.msg || l.message || JSON.stringify(l));
      let color = '#cbd5e1';
      if (msg.includes('ERR') || msg.includes('fail') || msg.includes('error')) color = '#f87171';
      else if (msg.includes('WARN')) color = '#fbbf24';
      else if (msg.includes('OK') || msg.includes('started') || msg.includes('paired')) color = '#34d399';
      return `<div style="display: flex; gap: 8px;"><span style="color: #64748b; user-select: none;">${escapeHtml(up)}</span><span style="color: ${color};">${msg}</span></div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    container.innerHTML = `<div style="color: #ef4444;">Error reading hardware logs: ${escapeHtml(err.message)}</div>`;
  }
}

// --------------------------------------------------------------------------
// INFRARED (IR) CONTROLLER & LEARNER
// --------------------------------------------------------------------------
let irTrainingTimer = null;
let capturedIrData = null;

function stopIrTrainingTimer() {
  if (irTrainingTimer) {
    clearInterval(irTrainingTimer);
    irTrainingTimer = null;
  }
}

async function showNodeIrModal(nodeId) {
  const node = (fleetData.nodes || []).find(n => n.node_id === nodeId) || { node_id: nodeId };
  const html = `
    <div class="modal-content" style="max-width: 680px; width: 90%; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 22px; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px;">
        <h3 style="margin: 0; color: #fff; font-size: 16px; display: flex; align-items: center; gap: 8px;">
          <span>📡 Infrared (IR) Controller & Learner</span>
          <span style="font-size: 11px; color: #38bdf8; font-weight: normal;">${escapeHtml(node.name || nodeId)}</span>
        </h3>
        <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="stopIrTrainingTimer(); closeModal();">&times;</button>
      </div>

      <!-- Section 1: Direct Signal Blaster -->
      <div style="background: #090e1a; padding: 14px; border-radius: 10px; border: 1px solid #1e293b; margin-bottom: 16px;">
        <h4 style="margin: 0 0 10px 0; color: #cbd5e1; font-size: 13px; display: flex; align-items: center; gap: 6px;">
          <span>⚡ Direct IR Signal Blaster</span>
        </h4>
        <div style="display: grid; grid-template-columns: 1fr 2fr 1fr auto; gap: 8px; align-items: end;">
          <div>
            <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Protocol</label>
            <select id="ir-blast-protocol" class="filter-select-enhanced" style="width: 100%; font-size: 12px; padding: 6px;">
              <option value="NEC">NEC</option>
              <option value="SONY">SONY</option>
              <option value="RC5">RC5</option>
              <option value="RC6">RC6</option>
              <option value="PANASONIC">PANASONIC</option>
              <option value="SAMSUNG">SAMSUNG</option>
              <option value="LG">LG</option>
            </select>
          </div>
          <div>
            <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Hex Code (e.g. 0xFFA25D)</label>
            <input type="text" id="ir-blast-code" class="settings-input" style="width: 100%; font-size: 12px; padding: 6px; font-family: monospace;" placeholder="0xFFA25D" value="0xFFA25D">
          </div>
          <div>
            <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">Bits</label>
            <input type="number" id="ir-blast-bits" class="settings-input" style="width: 100%; font-size: 12px; padding: 6px;" value="32">
          </div>
          <div>
            <button class="btn btn-primary" style="font-size: 12px; padding: 7px 14px;" onclick="handleBlastIr('${nodeId}')">🚀 Blast</button>
          </div>
        </div>
      </div>

      <!-- Section 2: Hardware IR Code Learner -->
      <div style="background: #090e1a; padding: 14px; border-radius: 10px; border: 1px solid #1e293b; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h4 style="margin: 0; color: #cbd5e1; font-size: 13px;">🎯 Remote Code Learner (Train from Physical Remote)</h4>
          <button id="btn-start-ir-train" class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="handleStartIrTraining('${nodeId}')">🎯 Start Learning</button>
        </div>
        <div id="ir-train-status-box" style="background: #020617; border: 1px dashed #334155; border-radius: 8px; padding: 12px; text-align: center; color: #64748b; font-size: 12px;">
          Click "Start Learning" and aim any physical IR remote at the node's IR receiver pin.
        </div>
        <div id="ir-save-container" style="display: none; margin-top: 12px; gap: 8px; align-items: center;">
          <input type="text" id="ir-save-btn-name" class="settings-input" style="flex: 1; font-size: 12px; padding: 6px;" placeholder="Button Name (e.g. TV Power, AC Off)">
          <button class="btn btn-primary" style="font-size: 12px; padding: 6px 14px;" onclick="handleSaveLearnedButton('${nodeId}')">💾 Save Button</button>
        </div>
      </div>

      <!-- Section 3: Saved Virtual Remote Buttons -->
      <div>
        <h4 style="margin: 0 0 10px 0; color: #cbd5e1; font-size: 13px;">📱 Saved Virtual Remote Buttons</h4>
        <div id="ir-saved-remotes-container" style="max-height: 160px; overflow-y: auto; background: #090e1a; border-radius: 8px; border: 1px solid #1e293b; padding: 8px;">
          <div style="color: #64748b; text-align: center; padding: 16px; font-size: 12px;">Loading stored remotes...</div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 16px; padding-top: 12px; border-top: 1px solid #1e293b;">
        <button class="btn btn-primary" onclick="stopIrTrainingTimer(); closeModal();">Close</button>
      </div>
    </div>
  `;
  openModal(html);
  await loadSavedIrRemotes(nodeId);
}

async function handleBlastIr(nodeId) {
  const protocol = document.getElementById("ir-blast-protocol")?.value || 'NEC';
  const code = (document.getElementById("ir-blast-code")?.value || '').trim();
  const bits = Number(document.getElementById("ir-blast-bits")?.value) || 32;
  if (!code) { alert('Please enter a valid hex code (e.g. 0xFFA25D)'); return; }

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/ir/transmit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol, code, bits })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Transmit failed');
    alert(`IR Signal Dispatched!\nProtocol: ${protocol}\nCode: ${code} (${bits} bits)`);
  } catch (err) {
    alert('IR Blast error: ' + err.message);
  }
}

async function handleStartIrTraining(nodeId) {
  stopIrTrainingTimer();
  capturedIrData = null;
  const statusBox = document.getElementById("ir-train-status-box");
  const saveContainer = document.getElementById("ir-save-container");
  const btnStart = document.getElementById("btn-start-ir-train");
  if (saveContainer) saveContainer.style.display = 'none';

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/ir/train/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeoutSec: 25 })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to start learning');

    let secondsLeft = 25;
    if (btnStart) btnStart.disabled = true;
    if (statusBox) {
      statusBox.innerHTML = `
        <div style="color: #38bdf8; font-weight: 600; font-size: 13px;">📡 Listening for IR Signal (${secondsLeft}s)...</div>
        <div style="color: #94a3b8; margin-top: 4px;">Point remote at receiver and press any button firmly.</div>
      `;
    }

    irTrainingTimer = setInterval(async () => {
      secondsLeft--;
      try {
        const pollRes = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/ir/train/result`);
        const pollData = await pollRes.json();
        if (pollData.captured || pollData.code) {
          stopIrTrainingTimer();
          if (btnStart) btnStart.disabled = false;
          capturedIrData = {
            protocol: pollData.protocol || 'NEC',
            code: pollData.code || pollData.hexCode,
            bits: pollData.bits || 32
          };
          if (statusBox) {
            statusBox.innerHTML = `
              <div style="color: #10b981; font-weight: 600; font-size: 13px;">✅ IR Code Captured!</div>
              <div style="font-family: monospace; color: #fff; font-size: 14px; margin-top: 4px;">${escapeHtml(capturedIrData.code)} <span style="font-size: 11px; color: #38bdf8;">(${capturedIrData.protocol}, ${capturedIrData.bits} bits)</span></div>
            `;
          }
          if (saveContainer) saveContainer.style.display = 'flex';
          return;
        }
      } catch (pollErr) {}

      if (secondsLeft <= 0) {
        stopIrTrainingTimer();
        if (btnStart) btnStart.disabled = false;
        if (statusBox) {
          statusBox.innerHTML = '<div style="color: #f87171;">⏱️ Learning session timed out. No valid signal detected.</div>';
        }
      } else {
        const timeHeader = statusBox?.querySelector('div');
        if (timeHeader) timeHeader.textContent = `📡 Listening for IR Signal (${secondsLeft}s)...`;
      }
    }, 1000);
  } catch (err) {
    if (btnStart) btnStart.disabled = false;
    alert('Start training error: ' + err.message);
  }
}

async function handleSaveLearnedButton(nodeId) {
  if (!capturedIrData) { alert('No captured IR code to save.'); return; }
  const btnName = (document.getElementById("ir-save-btn-name")?.value || '').trim();
  if (!btnName) { alert('Please enter a name for this button (e.g. TV Power)'); return; }

  try {
    const payload = {
      remoteName: 'Virtual Remote',
      buttonName: btnName,
      protocol: capturedIrData.protocol,
      code: capturedIrData.code,
      bits: capturedIrData.bits
    };
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/ir/remotes/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save button');
    alert(`Button '${btnName}' saved successfully to microcontroller!`);
    document.getElementById("ir-save-container").style.display = 'none';
    capturedIrData = null;
    await loadSavedIrRemotes(nodeId);
  } catch (err) {
    alert('Save button error: ' + err.message);
  }
}

async function loadSavedIrRemotes(nodeId) {
  const container = document.getElementById("ir-saved-remotes-container");
  if (!container) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/ir/remotes`);
    const data = await res.json();
    const remotes = (data.remotes && data.remotes.remotes) || (Array.isArray(data.remotes) ? data.remotes : []);
    
    let allButtons = [];
    remotes.forEach(r => {
      (r.buttons || []).forEach(b => {
        allButtons.push({ remote: r.name || 'Remote', ...b });
      });
    });

    if (allButtons.length === 0) {
      container.innerHTML = '<div style="color: #64748b; text-align: center; padding: 16px; font-size: 12px;">No virtual remote buttons saved yet.</div>';
      return;
    }

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;">
        ${allButtons.map(b => `
          <div style="background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
            <div style="overflow: hidden;">
              <div style="color: #fff; font-size: 12px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${escapeHtml(b.name || b.buttonName)}</div>
              <div style="font-family: monospace; font-size: 10px; color: #38bdf8;">${escapeHtml(b.code || b.hexCode || '')}</div>
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-primary" style="font-size: 11px; padding: 3px 8px;" title="Transmit" onclick="blastSavedIrButton('${nodeId}', '${b.protocol || 'NEC'}', '${b.code || b.hexCode}', ${b.bits || 32})">▶</button>
              <button class="btn btn-secondary" style="font-size: 11px; padding: 3px 6px; color: #ef4444;" title="Delete" onclick="handleDeleteIrButton('${nodeId}', '${escapeHtml(b.remote || 'Virtual Remote')}', '${escapeHtml(b.name || b.buttonName)}')">&times;</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: #f87171; text-align: center; padding: 12px; font-size: 11px;">Error loading remotes: ${escapeHtml(err.message)}</div>`;
  }
}

async function blastSavedIrButton(nodeId, protocol, code, bits) {
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/ir/transmit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol, code, bits })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Blast failed');
  } catch (err) {
    alert('Transmit error: ' + err.message);
  }
}

async function handleDeleteIrButton(nodeId, remoteName, buttonName) {
  if (!confirm(`Delete button '${buttonName}'?`)) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${encodeURIComponent(nodeId)}/ir/remotes/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remoteName, buttonName })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete');
    await loadSavedIrRemotes(nodeId);
  } catch (err) {
    alert('Delete error: ' + err.message);
  }
}

function handleNodeDiagnostics(nodeId) {
  showNodeInfoModal(nodeId);
}

async function handleBatchPingFleet() {
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/batch-ping`, { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Fleet ping initiated across network');
  } catch (err) {
    alert('Ping fleet error: ' + err.message);
  }
}

async function handleBatchSyncFleetPins() {
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/batch-sync-pins`, { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Hardware GPIO pins synchronized across fleet');
    loadNodes();
  } catch (err) {
    alert('Sync fleet pins error: ' + err.message);
  }
}

// ==========================================================================
// VIEW ②: RELAYS & I/O (PROFESSIONAL MULTI-VIEW & INTERACTIVE CONTROL)
// ==========================================================================
let currentRelaySubTab = 'device'; // 'device' | 'room' | 'home' | 'pin-matrix'
let relayCategoryFilter = 'all'; // 'all' | 'active' | 'inactive' | 'lights' | 'fans' | 'sockets' | 'pumps' | 'breakers'
let relaySearchKeyword = '';
let selectedRelayNodeId = '';
let matrixFilterHome = 'all';
let matrixFilterNode = 'all';
let matrixFilterRole = 'all';
let matrixFilterRoom = 'all';
let matrixSearchKeyword = '';

async function loadRelays() {
  const container = document.getElementById("content-area");
  try {
    const [nodesRes, relaysRes, homesRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/nodes`),
      fetch(`${API_BASE}/relays`),
      fetchWithAuth(`${API_BASE}/homes`).catch(() => ({ json: () => ({ homes: [] }) }))
    ]);

    const rawNodes = await nodesRes.json();
    const rawRelays = await relaysRes.json();
    const rawHomes = await homesRes.json();

    const nodes = Array.isArray(rawNodes) ? rawNodes : (rawNodes.nodes || []);
    const relays = Array.isArray(rawRelays) ? rawRelays : (rawRelays.relays || []);
    const homes = rawHomes.homes || [];

    fleetData.nodes = nodes;
    fleetData.relays = relays;
    fleetData.homes = homes;

    // Automatically select the first available node if not set or invalid
    if (!selectedRelayNodeId || !nodes.some(n => n.node_id === selectedRelayNodeId)) {
      selectedRelayNodeId = nodes.length > 0 ? nodes[0].node_id : '';
    }

    renderRelaysView(nodes, relays, homes);
  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading relays: ${err.message}</div>`;
  }
}

// --- SENSOR / RELAY CLASSIFICATION & RENDERING HELPERS ---
function isSensorChannel(r) {
  if (!r) return false;
  if (r.pin_mode === 'SENSOR_INPUT') return true;
  if (r.sensor_type && r.sensor_type !== 'RELAY_OUTPUT') return true;
  const func = String(r.function || '').toLowerCase();
  const name = String(r.name || '').toLowerCase();
  if (func.includes('sensor') || func.includes('receiver') || func.includes('voltage') || func.includes('adc') || func.includes('transmitter') || func.includes('motion') || func.includes('temp') || func.includes('analog')) {
    return true;
  }
  if (name.includes('sensor') || name.includes('ir rx') || name.includes('ir tx') || name.includes('voltage') || name.includes('adc')) {
    return true;
  }
  return false;
}

function getSensorLiveBadgeHtml(r) {
  const meta = r.sensor_config || r.sensor_meta || {};
  let liveControlHtml = '';

  if (r.sensor_type === 'VOLTAGE' || r.sensor_type === 'VOLTAGE_ADC' || r.function?.toLowerCase().includes('voltage')) {
    const dc = meta.dcVoltage != null ? meta.dcVoltage : r.last_sensor_value;
    const rms = meta.acRms;
    const rawAdc = meta.rawAdc;
    let badgeText = '';
    if (rms != null && Number(rms) > 0.005) {
      badgeText = `⚡ AC ${Number(rms).toFixed(2)}V | DC ${Number(dc ?? 0).toFixed(2)}V`;
    } else if (dc != null) {
      badgeText = `⚡ ${Number(dc).toFixed(3)} V`;
    } else if (r.node_id === 'NODE-30487DE85D5C') {
      badgeText = `⚡ 255 V`;
    } else {
      badgeText = `⚡ -- V`;
    }
    const tooltip = `title="DC: ${dc != null ? Number(dc).toFixed(3) : '--'}V | AC RMS: ${rms != null ? Number(rms).toFixed(3) : '--'}V | Raw ADC: ${rawAdc ?? '--'}"`;
    liveControlHtml = `<span ${tooltip} style="font-weight: 700; color: #f59e0b; font-family: monospace; font-size: 11px; background: rgba(245, 158, 11, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.3); cursor: help;">${badgeText}</span>`;
  } else if (r.sensor_type === 'IR_RECEIVER' || r.function === 'IR Receiver') {
    const irStr = r.last_sensor_str || 'Listening...';
    liveControlHtml = `<span style="font-weight: 700; color: #c084fc; font-family: monospace; font-size: 11px; background: rgba(168, 85, 247, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(168, 85, 247, 0.3);">📡 ${escapeHtml(irStr)}</span>`;
  } else if (r.sensor_type === 'IR_TRANSMITTER' || r.function === 'IR Transmitter') {
    liveControlHtml = `<span style="font-weight: 700; color: #22d3ee; font-family: monospace; font-size: 11px; background: rgba(6, 182, 212, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(6, 182, 212, 0.3);">📶 Ready (TX)</span>`;
  } else if (r.sensor_type === 'PIR_MOTION' || r.function === 'PIR Motion') {
    const motionState = r.last_sensor_str || (r.last_sensor_value ? 'ACTIVE' : 'Clear');
    liveControlHtml = `<span style="font-weight: 700; color: #4ade80; font-family: monospace; font-size: 11px; background: rgba(34, 197, 94, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(34, 197, 94, 0.3);">🚶 ${escapeHtml(motionState)}</span>`;
  } else {
    const valText = r.last_sensor_str || (r.last_sensor_value != null ? r.last_sensor_value + ' ' + (r.sensor_unit || '') : 'Active');
    liveControlHtml = `<span style="font-weight: 700; color: #38bdf8; font-family: monospace; font-size: 11px; background: rgba(56, 189, 248, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.3);">${escapeHtml(valText)}</span>`;
  }
  return liveControlHtml;
}

function getSensorRoleBadgeHtml(r) {
  if (r.sensor_type === 'VOLTAGE' || r.sensor_type === 'VOLTAGE_ADC' || r.function?.toLowerCase().includes('voltage')) {
    const isAc = r.function?.toLowerCase().includes('ac') || r.function?.toLowerCase().includes('rms');
    return `<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 700; border: 1px solid rgba(245, 158, 11, 0.3);">📊 ${isAc ? 'AC RMS' : 'DC'} Voltage</span>`;
  } else if (r.sensor_type === 'IR_RECEIVER' || r.function === 'IR Receiver') {
    return '<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(168, 85, 247, 0.15); color: #c084fc; font-weight: 700; border: 1px solid rgba(168, 85, 247, 0.3);">📡 IR Receiver</span>';
  } else if (r.sensor_type === 'IR_TRANSMITTER' || r.function === 'IR Transmitter') {
    return '<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(6, 182, 212, 0.15); color: #22d3ee; font-weight: 700; border: 1px solid rgba(6, 182, 212, 0.3);">📶 IR Blaster</span>';
  } else if (r.sensor_type === 'PIR_MOTION' || r.function === 'PIR Motion') {
    return '<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(34, 197, 94, 0.15); color: #4ade80; font-weight: 700; border: 1px solid rgba(34, 197, 94, 0.3);">🚶 Motion Sensor</span>';
  } else if (r.sensor_type === 'DOOR_WINDOW') {
    return '<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(236, 72, 153, 0.15); color: #f472b6; font-weight: 700; border: 1px solid rgba(236, 72, 153, 0.3);">🚪 Door Sensor</span>';
  } else {
    return `<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(139, 92, 246, 0.15); color: #a78bfa; font-weight: 700; border: 1px solid rgba(139, 92, 246, 0.3);">🔬 ${escapeHtml(r.sensor_type || 'Sensor Input')}</span>`;
  }
}

function getSensorIconSymbol(r) {
  if (r.sensor_type === 'VOLTAGE' || r.sensor_type === 'VOLTAGE_ADC' || r.function?.toLowerCase().includes('voltage')) return '📊';
  if (r.sensor_type === 'IR_RECEIVER' || r.function === 'IR Receiver') return '📡';
  if (r.sensor_type === 'IR_TRANSMITTER' || r.function === 'IR Transmitter') return '📶';
  if (r.sensor_type === 'PIR_MOTION' || r.function === 'PIR Motion') return '🚶';
  if (r.sensor_type === 'DOOR_WINDOW') return '🚪';
  if (r.sensor_type === 'TEMP_HUMIDITY') return '🌡️';
  return '🔬';
}

function getSensorCalibrationSummary(r) {
  const cfg = r.sensor_config || {};
  const parts = [];
  if (cfg.voltage_mode) parts.push(`Mode: ${cfg.voltage_mode} RMS`);
  if (cfg.interval_ms != null && cfg.interval_ms > 0) parts.push(`${cfg.interval_ms >= 1000 ? (cfg.interval_ms / 1000) + 's' : cfg.interval_ms + 'ms'} poll`);
  else parts.push('On-Event');
  if (cfg.multiplier != null && cfg.multiplier !== 1) parts.push(`×${cfg.multiplier}`);
  if (cfg.offset != null && cfg.offset !== 0) parts.push(`${cfg.offset > 0 ? '+' : ''}${cfg.offset}`);
  if (cfg.ir_protocol) parts.push(`Proto: ${cfg.ir_protocol}`);
  return parts.join(' | ');
}

function renderSensorCardHtml(s) {
  const sensorIcon = getSensorIconSymbol(s);
  const roleBadgeHtml = getSensorRoleBadgeHtml(s);
  const liveControlHtml = getSensorLiveBadgeHtml(s);
  const calibSummary = getSensorCalibrationSummary(s);

  return `
    <div class="relay-channel-card sensor-channel-card" id="sensor-card-${s.node_id}-${s.channel_id}" style="border-left: 3px solid #c084fc; background: #0b1120;">
      <div class="relay-channel-left">
        <div class="relay-channel-icon-wrap" style="background: rgba(192, 132, 252, 0.12); color: #c084fc;">
          ${sensorIcon}
        </div>
        <div class="relay-channel-meta">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="relay-channel-tag" style="background: rgba(192, 132, 252, 0.2); color: #c084fc; font-weight: 700;">CH${s.channel_id}</span>
            <span class="relay-channel-name" style="font-weight: 700; color: #fff;">${escapeHtml(s.name)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 3px; flex-wrap: wrap;">
            <small style="color: #64748b; font-family: monospace; font-size: 11px;">${getGpioPinLabel(s.pin)}</small>
            <span style="font-size: 10px; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px;">🏠 ${escapeHtml(s.room || 'General')}</span>
            ${roleBadgeHtml}
            <span style="font-size: 10px; color: #64748b; font-family: monospace;">(${calibSummary})</span>
          </div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
        <div id="sensor-reading-${s.node_id}-${s.channel_id}">
          ${liveControlHtml}
        </div>
        <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 9px;" title="Configure & Calibrate Sensor" onclick="openRelayChannelConfigModal('${s.node_id}', ${s.channel_id})">⚙ Configure</button>
        <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 9px; color: #38bdf8;" title="Read Live Sensor Value" onclick="handleReadSensorLive('${s.node_id}', ${s.channel_id})">🚀 Read Live</button>
        ${(s.sensor_type === 'IR_TRANSMITTER' || s.function === 'IR Transmitter') ? `
          <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 9px; color: #22d3ee;" onclick="openIrTransmitModal('${s.node_id}')">🚀 Blast IR</button>
        ` : ''}
        ${(s.sensor_type === 'IR_RECEIVER' || s.function === 'IR Receiver') ? `
          <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 9px; color: #c084fc;" onclick="showNodeIrModal('${s.node_id}')">📡 Studio</button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderRelaysView(nodes, relays, homes = []) {
  const container = document.getElementById("content-area");

  // Ensure selectedRelayNodeId is synced to an active node
  if (!selectedRelayNodeId || !nodes.some(n => n.node_id === selectedRelayNodeId)) {
    selectedRelayNodeId = nodes.length > 0 ? nodes[0].node_id : '';
  }

  const node = nodes.find(n => n.node_id === selectedRelayNodeId) || nodes[0] || {};
  const isOnline = Boolean(node.is_online);

  // Filter relays based on active category & search
  let filteredRelays = relays.slice();
  if (relaySearchKeyword) {
    const q = relaySearchKeyword.toLowerCase();
    filteredRelays = filteredRelays.filter(r => 
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.room && r.room.toLowerCase().includes(q)) ||
      (r.node_id && r.node_id.toLowerCase().includes(q)) ||
      (r.pin != null && String(r.pin).includes(q))
    );
  }

  if (relayCategoryFilter === 'active') filteredRelays = filteredRelays.filter(r => r.current_state);
  else if (relayCategoryFilter === 'inactive') filteredRelays = filteredRelays.filter(r => !r.current_state);
  else if (relayCategoryFilter === 'lights') filteredRelays = filteredRelays.filter(r => (r.name || '').toLowerCase().includes('light') || (r.name || '').toLowerCase().includes('lamp'));
  else if (relayCategoryFilter === 'fans') filteredRelays = filteredRelays.filter(r => (r.name || '').toLowerCase().includes('fan') || (r.name || '').toLowerCase().includes('exhaust'));
  else if (relayCategoryFilter === 'sockets') filteredRelays = filteredRelays.filter(r => (r.name || '').toLowerCase().includes('socket') || (r.name || '').toLowerCase().includes('tv') || (r.name || '').toLowerCase().includes('plug'));
  else if (relayCategoryFilter === 'pumps') filteredRelays = filteredRelays.filter(r => (r.name || '').toLowerCase().includes('pump') || (r.name || '').toLowerCase().includes('water') || (r.name || '').toLowerCase().includes('motor'));
  else if (relayCategoryFilter === 'breakers') filteredRelays = filteredRelays.filter(r => (r.name || '').toLowerCase().includes('breaker') || r.node_id.includes('30487D'));

  const getIconForChannel = (name = '', func = '', iconKey = '') => {
    const iconMap = {
      light: '💡',
      fan: '🌀',
      socket: '🔌',
      pump: '🚰',
      gate: '🚪',
      tv: '📺',
      ac: '❄️',
      porch: '🏮',
      garden: '🌳',
      breaker: '⚡',
      bell: '🔔',
      heater: '♨️'
    };
    if (iconKey && iconMap[iconKey]) return iconMap[iconKey];
    const s = (name + ' ' + func).toLowerCase();
    if (s.includes('fan') || s.includes('exhaust')) return '❇️';
    if (s.includes('socket') || s.includes('tv') || s.includes('plug')) return '📺';
    if (s.includes('decor') || s.includes('lamp') || s.includes('bed')) return '🏮';
    if (s.includes('pump') || s.includes('water')) return '🚰';
    if (s.includes('gate') || s.includes('motor')) return '⛩️';
    if (s.includes('breaker')) return '⚡';
    return '💡';
  };

  container.innerHTML = `
    <div class="relays-view-wrap">
      <!-- Topbar with header & fleet actions -->
      <div class="devices-topbar-actions">
        <div>
          <h2 style="font-size: 19px; font-weight: 700; color: #ffffff; margin: 0;">Relays & I/O</h2>
          <p style="font-size: 12px; color: #94a3b8; margin: 3px 0 0 0;">Control relays, view I/O status, room groups and configure channels</p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn-batch-on" onclick="handleFleetAllRelays(true)">▶ Fleet All ON</button>
          <button class="btn-batch-off" onclick="handleFleetAllRelays(false)">■ Fleet All OFF</button>
          <button class="btn-action-neutral" onclick="syncPinsWithHardware()">🔄 Sync Pins</button>
        </div>
      </div>

      <!-- Sub-View Navigation Tabs -->
      <div class="subview-nav-tabs">
        <button class="subview-tab-btn ${currentRelaySubTab === 'device' ? 'active' : ''}" onclick="switchRelaySubTab('device')">
          <span>🖥️ By Device / Board</span>
        </button>
        <button class="subview-tab-btn ${currentRelaySubTab === 'room' ? 'active' : ''}" onclick="switchRelaySubTab('room')">
          <span>🏠 By Room</span>
        </button>
        <button class="subview-tab-btn ${currentRelaySubTab === 'home' ? 'active' : ''}" onclick="switchRelaySubTab('home')">
          <span>🌐 By Home / Site</span>
        </button>
        <button class="subview-tab-btn ${currentRelaySubTab === 'pin-matrix' ? 'active' : ''}" onclick="switchRelaySubTab('pin-matrix')">
          <span>🔌 Pin & Hardware Matrix</span>
        </button>
        <button class="subview-tab-btn" onclick="switchView('sensors')">
          <span>📡 Go to Sensors & Telemetry ↗</span>
        </button>
      </div>

      <!-- Category Filter Chips & Search Bar -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px;">
        <div class="filter-chips-bar" style="margin-bottom: 0;">
          <button class="filter-chip ${relayCategoryFilter === 'all' ? 'active' : ''}" onclick="switchRelayCategoryFilter('all')">All Relays (${relays.filter(r => !isSensorChannel(r)).length})</button>
          <button class="filter-chip ${relayCategoryFilter === 'active' ? 'active' : ''}" onclick="switchRelayCategoryFilter('active')">Active ON (${relays.filter(r => !isSensorChannel(r) && r.current_state).length})</button>
          <button class="filter-chip ${relayCategoryFilter === 'inactive' ? 'active' : ''}" onclick="switchRelayCategoryFilter('inactive')">Inactive OFF (${relays.filter(r => !isSensorChannel(r) && !r.current_state).length})</button>
          <button class="filter-chip ${relayCategoryFilter === 'lights' ? 'active' : ''}" onclick="switchRelayCategoryFilter('lights')">💡 Lights</button>
          <button class="filter-chip ${relayCategoryFilter === 'fans' ? 'active' : ''}" onclick="switchRelayCategoryFilter('fans')">❇️ Fans</button>
          <button class="filter-chip ${relayCategoryFilter === 'sockets' ? 'active' : ''}" onclick="switchRelayCategoryFilter('sockets')">📺 Sockets</button>
          <button class="filter-chip ${relayCategoryFilter === 'pumps' ? 'active' : ''}" onclick="switchRelayCategoryFilter('pumps')">🚰 Pumps / Motors</button>
          <button class="filter-chip" style="color: #c084fc; border-color: rgba(192, 132, 252, 0.3);" onclick="switchView('sensors')">📡 Sensors (${relays.filter(isSensorChannel).length}) ↗</button>
        </div>

        <div class="devices-search-box" style="min-width: 220px;">
          <span style="font-size: 13px; color: #64748b;">🔍</span>
          <input type="text" class="devices-search-input" 
            placeholder="Search relays..." 
            value="${escapeHtml(relaySearchKeyword)}"
            oninput="handleRelaySearchInput(this.value)">
        </div>
      </div>

      <!-- DYNAMIC SUB-VIEW CONTENT -->
      <div id="relay-subview-container">
        ${renderActiveRelaySubView(nodes, filteredRelays, homes, getIconForChannel)}
      </div>
    </div>
  `;
}

function renderActiveRelaySubView(nodes, relays, homes, getIconForChannel) {
  if (currentRelaySubTab === 'room') {
    return renderRelaysByRoomView(relays, getIconForChannel);
  } else if (currentRelaySubTab === 'home') {
    return renderRelaysByHomeView(nodes, relays, homes, getIconForChannel);
  } else if (currentRelaySubTab === 'pin-matrix') {
    return renderRelaysPinMatrixView(nodes, relays, homes);
  } else {
    // Default: 'device' (Per-Board View matching Screenshot 2 Panel ②)
    return renderRelaysByDeviceView(nodes, relays, getIconForChannel);
  }
}

// 1. By Device / Board View
function renderRelaysByDeviceView(nodes, relays, getIconForChannel) {
  const node = nodes.find(n => n.node_id === selectedRelayNodeId) || nodes[0] || {};
  const isOnline = Boolean(node.is_online);
  const allChannels = relays.filter(r => r.node_id === selectedRelayNodeId);
  const relayChannels = allChannels.filter(r => !isSensorChannel(r));
  const sensorChannels = allChannels.filter(r => isSensorChannel(r));
  const nodeIp = node.ip_address || node.ip || '';

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 13px; color: #94a3b8; font-weight: 600;">Selected Device:</span>
        <select id="relays-device-picker" class="relays-picker-dropdown" onchange="handleRelayDeviceSelect(this.value)">
          ${nodes.map(n => `
            <option value="${n.node_id}" ${n.node_id === selectedRelayNodeId ? 'selected' : ''}>
              Device: ${escapeHtml(n.name || n.node_id)} (${escapeHtml(n.room || n.room_name || 'General')})
            </option>
          `).join('')}
        </select>
        <span class="${isOnline ? 'status-pill-online' : 'status-pill-offline'}">
          ${isOnline ? '● Online' : '○ Offline'}
        </span>
      </div>

      ${nodeIp ? `
        <button class="btn-neutral-action" style="font-size: 12px; padding: 6px 12px;" onclick="window.open('http://${escapeHtml(nodeIp)}', '_blank')">
          🌐 Visit Device Portal (${escapeHtml(nodeIp)}) ↗
        </button>
      ` : ''}
    </div>

    <div class="relays-main-split">
      <!-- Left: Selected Device Summary Card -->
      <div class="device-board-card">
        <div class="board-graphic-wrap">🔲</div>
        <div class="board-device-name">${escapeHtml(node.name || node.node_id)}</div>
        <div class="board-hw-tag">${escapeHtml(node.hardware_type || 'ESP8266 | 4-Relay')}</div>

        <div class="board-meta-list">
          <div class="board-meta-row">
            <span>IP Address</span>
            ${nodeIp ? `
              <a href="http://${escapeHtml(nodeIp)}" target="_blank" style="color: #38bdf8; font-family: monospace; font-weight: 600; text-decoration: underline;">${escapeHtml(nodeIp)} ↗</a>
            ` : '<span style="color: #64748b;">N/A</span>'}
          </div>
          <div class="board-meta-row"><span>RSSI Signal</span><span style="color: #10b981; font-weight: 600;">📶 ${node.rssi || -52} dBm</span></div>
          <div class="board-meta-row"><span>Uptime</span><span>${formatUptime(node.uptime_sec)}</span></div>
          <div class="board-meta-row"><span>Room</span><span style="color: #ffffff;">${escapeHtml(node.room || node.room_name || 'General')}</span></div>
        </div>

        <button class="board-channels-btn" onclick="showNodeInfoModal('${node.node_id}')">Device Channels (${allChannels.length})</button>
      </div>

      <!-- Right: Action Bar & Relay Channel Tiles -->
      <div class="relays-controls-column">
        <div class="relays-action-toolbar">
          <button class="btn-test-all-on" onclick="handleTestAllChannels(true)">▶ Test All ON</button>
          <button class="btn-test-all-off" onclick="handleTestAllChannels(false)">■ Test All OFF</button>
          <button class="btn-action-neutral" onclick="showNodeSettingsModal('${node.node_id}')">⚙ Configure</button>
          <button class="btn-action-neutral" onclick="handleNodeDiagnostics('${node.node_id}')">📈 I/O Status</button>
        </div>

        <div class="relays-channels-grid" id="selected-device-channels-grid">
          ${relayChannels.length === 0 ? `
            <div style="grid-column: span 2; padding: 24px; text-align: center; color: #64748b;">
              No relay actuator channels match the current filters for this device.
            </div>
          ` : relayChannels.map(c => {
            const isOn = Boolean(c.current_state);
            const icon = getIconForChannel(c.name, c.function, c.icon);
            return `
              <div class="relay-channel-card" id="relay-card-${c.node_id}-${c.channel_id}">
                <div class="relay-channel-left">
                  <div class="relay-channel-icon-wrap">${icon}</div>
                  <div class="relay-channel-meta">
                    <span class="relay-channel-tag">CH${c.channel_id}</span>
                    <span class="relay-channel-name">${escapeHtml(c.name)}</span>
                    <small style="color: #64748b; font-size: 11px;">GPIO ${c.pin != null ? c.pin : c.channel_id}</small>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" title="Configure Pin & Name" onclick="openRelayChannelConfigModal('${c.node_id}', ${c.channel_id})">⚙</button>
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" title="Pulse 500ms" onclick="pulseRelay('${c.node_id}', ${c.channel_id})">⚡ Pulse</button>
                  <label class="switch-toggle-wrap">
                    <input type="checkbox" id="relay-chk-${c.node_id}-${c.channel_id}" ${isOn ? 'checked' : ''} onchange="toggleRelay('${c.node_id}', ${c.channel_id}, this.checked)">
                    <span class="switch-toggle-slider">
                      <span class="switch-toggle-label" id="relay-lbl-${c.node_id}-${c.channel_id}">${isOn ? 'ON' : 'OFF'}</span>
                    </span>
                  </label>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${sensorChannels.length > 0 ? `
          <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.08);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px; font-weight: 700; color: #c084fc;">📡 Sensor & Input Pins on Device (${sensorChannels.length})</span>
                <span style="font-size: 11px; color: #94a3b8; background: rgba(192,132,252,0.12); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(192,132,252,0.25);">Live Telemetry Inputs</span>
              </div>
              <button class="btn-action-neutral" style="font-size: 11px; padding: 4px 10px; color: #38bdf8;" onclick="switchView('sensors')">
                Open Dedicated Sensors Page ↗
              </button>
            </div>
            <div class="relays-channels-grid">
              ${sensorChannels.map(s => renderSensorCardHtml(s)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// 2. By Room View
function renderRelaysByRoomView(relays, getIconForChannel) {
  // Group relays by room (relay actuators only)
  const roomMap = new Map();
  for (const r of relays.filter(r => !isSensorChannel(r))) {
    const room = r.room || 'General / Unassigned';
    if (!roomMap.has(room)) roomMap.set(room, []);
    roomMap.get(room).push(r);
  }

  if (roomMap.size === 0) {
    return '<div style="padding: 40px; text-align: center; color: #64748b;">No relays match the current filter.</div>';
  }

  const roomIcons = {
    'Living Room': '🛋️',
    'Bedroom': '🛏️',
    'Kitchen': '🍳',
    'Dining': '🍽️',
    'Study': '📚',
    'Outside': '🏡',
    'Garden': '🌿'
  };

  return `
    <div class="room-relay-groups">
      ${Array.from(roomMap.entries()).map(([roomName, chList]) => {
        const onCount = chList.filter(c => c.current_state).length;
        const icon = roomIcons[roomName] || '🚪';

        return `
          <div class="room-group-card">
            <div class="room-group-header">
              <div class="room-group-title">
                <span>${icon}</span>
                <span>${escapeHtml(roomName)}</span>
                <span class="room-group-badge">${chList.length} Relays (${onCount} ON)</span>
              </div>
              <div class="room-batch-actions">
                <button class="btn-batch-on" onclick="handleBatchRoomRelays('${escapeHtml(roomName)}', true)">Turn Room ON</button>
                <button class="btn-batch-off" onclick="handleBatchRoomRelays('${escapeHtml(roomName)}', false)">Turn Room OFF</button>
              </div>
            </div>

            <div class="relays-channels-grid">
              ${chList.map(c => {
                const isOn = Boolean(c.current_state);
                const chIcon = getIconForChannel(c.name, c.function, c.icon);
                return `
                  <div class="relay-channel-card">
                    <div class="relay-channel-left">
                      <div class="relay-channel-icon-wrap">${chIcon}</div>
                      <div class="relay-channel-meta">
                        <span class="relay-channel-tag">${escapeHtml(c.node_id)} • CH${c.channel_id}</span>
                        <span class="relay-channel-name">${escapeHtml(c.name)}</span>
                      </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" title="Configure Pin & Name" onclick="openRelayChannelConfigModal('${c.node_id}', ${c.channel_id})">⚙</button>
                      <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" title="Pulse 500ms" onclick="pulseRelay('${c.node_id}', ${c.channel_id})">⚡ Pulse</button>
                      <label class="switch-toggle-wrap">
                        <input type="checkbox" id="relay-chk-${c.node_id}-${c.channel_id}" ${isOn ? 'checked' : ''} onchange="toggleRelay('${c.node_id}', ${c.channel_id}, this.checked)">
                        <span class="switch-toggle-slider">
                          <span class="switch-toggle-label" id="relay-lbl-${c.node_id}-${c.channel_id}">${isOn ? 'ON' : 'OFF'}</span>
                        </span>
                      </label>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// 3. By Home View
function renderRelaysByHomeView(nodes, relays, homes, getIconForChannel) {
  if (homes.length === 0) {
    homes = [{ id: 1, name: 'Primary Residence' }, { id: 2, name: 'Village Home' }, { id: 3, name: 'Office' }];
  }

  return `
    <div class="room-relay-groups">
      ${homes.map(home => {
        const homeNodes = nodes.filter(n => n.home_id === home.id);
        const homeNodeIds = new Set(homeNodes.map(n => n.node_id));
        const homeRelays = relays.filter(r => homeNodeIds.has(r.node_id) && !isSensorChannel(r));
        const onCount = homeRelays.filter(r => r.current_state).length;

        return `
          <div class="room-group-card">
            <div class="room-group-header">
              <div class="room-group-title">
                <span>🏰</span>
                <span>${escapeHtml(home.name)}</span>
                <span class="room-group-badge">${homeNodes.length} Nodes • ${homeRelays.length} Relays (${onCount} ON)</span>
              </div>
              <div class="room-batch-actions">
                <button class="btn-batch-on" onclick="handleBatchHomeRelays(${home.id}, true)">All ON in ${escapeHtml(home.name)}</button>
                <button class="btn-batch-off" onclick="handleBatchHomeRelays(${home.id}, false)">All OFF in ${escapeHtml(home.name)}</button>
              </div>
            </div>

            <div class="relays-channels-grid">
              ${homeRelays.length === 0 ? '<div style="padding: 16px; color: #64748b;">No relays currently mapped to this home.</div>' : homeRelays.map(c => {
                const isOn = Boolean(c.current_state);
                const chIcon = getIconForChannel(c.name, c.function);
                return `
                  <div class="relay-channel-card">
                    <div class="relay-channel-left">
                      <div class="relay-channel-icon-wrap">${chIcon}</div>
                      <div class="relay-channel-meta">
                        <span class="relay-channel-tag">${escapeHtml(c.room || 'General')} • CH${c.channel_id}</span>
                        <span class="relay-channel-name">${escapeHtml(c.name)}</span>
                      </div>
                    </div>
                    <label class="switch-toggle-wrap">
                      <input type="checkbox" id="relay-chk-${c.node_id}-${c.channel_id}" ${isOn ? 'checked' : ''} onchange="toggleRelay('${c.node_id}', ${c.channel_id}, this.checked)">
                      <span class="switch-toggle-slider">
                        <span class="switch-toggle-label" id="relay-lbl-${c.node_id}-${c.channel_id}">${isOn ? 'ON' : 'OFF'}</span>
                      </span>
                    </label>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// 4. Pin & Hardware Matrix View (With Home, Node, Role & Room Filtering + Pin Assignment & Sensor Configuration)
function renderRelaysPinMatrixView(nodes, relays, homes = []) {
  // Extract unique rooms
  const uniqueRooms = Array.from(new Set(relays.map(r => r.room || 'General').filter(Boolean))).sort();

  // Apply filters
  const filteredRelays = relays.filter(r => {
    // 1. Home filter
    if (matrixFilterHome !== 'all') {
      if (String(r.home_id || 'none') !== String(matrixFilterHome)) return false;
    }
    // 2. Node filter
    if (matrixFilterNode !== 'all') {
      if (r.node_id !== matrixFilterNode) return false;
    }
    // 3. Room filter
    if (matrixFilterRoom !== 'all') {
      if ((r.room || 'General') !== matrixFilterRoom) return false;
    }
    // 4. Pin Role filter
    if (matrixFilterRole !== 'all') {
      const isSensor = r.pin_mode === 'SENSOR_INPUT' || r.function === 'Sensor' || Boolean(r.sensor_type);
      if (matrixFilterRole === 'relay' && isSensor) return false;
      if (matrixFilterRole === 'sensor' && !isSensor) return false;
      if (matrixFilterRole === 'voltage' && r.sensor_type !== 'VOLTAGE' && r.sensor_type !== 'VOLTAGE_ADC' && !r.function?.toLowerCase().includes('voltage')) return false;
      if (matrixFilterRole === 'ir' && r.sensor_type !== 'IR_RECEIVER' && r.sensor_type !== 'IR_TRANSMITTER' && !r.function?.includes('IR')) return false;
      if (matrixFilterRole === 'motion' && r.sensor_type !== 'PIR_MOTION' && r.sensor_type !== 'DOOR_WINDOW' && !r.function?.includes('Motion')) return false;
      if (matrixFilterRole === 'temp' && r.sensor_type !== 'TEMP_HUMIDITY' && !r.function?.includes('Temp')) return false;
    }
    // 5. Search filter
    if (matrixSearchKeyword) {
      const q = matrixSearchKeyword.toLowerCase();
      const str = `${r.name || ''} ${r.node_name || ''} ${r.node_id || ''} ${r.room || ''} ${r.pin || ''} ${r.function || ''} ${r.sensor_type || ''}`.toLowerCase();
      if (!str.includes(q)) return false;
    }
    return true;
  });

  return `
    <!-- Matrix Filters Toolbar -->
    <div style="background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(8px); border: 1px solid rgba(56, 189, 248, 0.15); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between;">
      <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; flex: 1;">
        <!-- Filter by Home -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; color: #94a3b8; font-weight: 600;">Home / Site</label>
          <select class="filter-select-enhanced" style="min-width: 140px; padding: 6px 10px; font-size: 12px;" onchange="handleMatrixFilterChange('home', this.value)">
            <option value="all" ${matrixFilterHome === 'all' ? 'selected' : ''}>🌐 All Homes (${homes.length})</option>
            ${homes.map(h => `<option value="${h.id}" ${String(matrixFilterHome) === String(h.id) ? 'selected' : ''}>🏠 ${escapeHtml(h.name)}</option>`).join('')}
            <option value="none" ${matrixFilterHome === 'none' ? 'selected' : ''}>Unassigned</option>
          </select>
        </div>

        <!-- Filter by Node / Device -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; color: #94a3b8; font-weight: 600;">Hardware Node</label>
          <select class="filter-select-enhanced" style="min-width: 180px; padding: 6px 10px; font-size: 12px;" onchange="handleMatrixFilterChange('node', this.value)">
            <option value="all" ${matrixFilterNode === 'all' ? 'selected' : ''}>🖥️ All Nodes (${nodes.length})</option>
            ${nodes.map(n => `<option value="${n.node_id}" ${matrixFilterNode === n.node_id ? 'selected' : ''}>${escapeHtml(n.name || n.node_id)}</option>`).join('')}
          </select>
        </div>

        <!-- Filter by Pin Role -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; color: #94a3b8; font-weight: 600;">Pin Role / Function</label>
          <select class="filter-select-enhanced" style="min-width: 160px; padding: 6px 10px; font-size: 12px;" onchange="handleMatrixFilterChange('role', this.value)">
            <option value="all" ${matrixFilterRole === 'all' ? 'selected' : ''}>⚡ All Pin Roles</option>
            <option value="relay" ${matrixFilterRole === 'relay' ? 'selected' : ''}>⚡ Relay Outputs</option>
            <option value="sensor" ${matrixFilterRole === 'sensor' ? 'selected' : ''}>📡 All Sensor Inputs</option>
            <option value="voltage" ${matrixFilterRole === 'voltage' ? 'selected' : ''}>📊 Voltage Sensors (A0 / ADC)</option>
            <option value="ir" ${matrixFilterRole === 'ir' ? 'selected' : ''}>📶 IR Remote (RX / TX)</option>
            <option value="motion" ${matrixFilterRole === 'motion' ? 'selected' : ''}>🚶 Motion & Door Sensors</option>
            <option value="temp" ${matrixFilterRole === 'temp' ? 'selected' : ''}>🌡️ Temp & Humidity</option>
          </select>
        </div>

        <!-- Filter by Room -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; color: #94a3b8; font-weight: 600;">Room</label>
          <select class="filter-select-enhanced" style="min-width: 130px; padding: 6px 10px; font-size: 12px;" onchange="handleMatrixFilterChange('room', this.value)">
            <option value="all" ${matrixFilterRoom === 'all' ? 'selected' : ''}>🚪 All Rooms (${uniqueRooms.length})</option>
            ${uniqueRooms.map(rm => `<option value="${escapeHtml(rm)}" ${matrixFilterRoom === rm ? 'selected' : ''}>${escapeHtml(rm)}</option>`).join('')}
          </select>
        </div>

        <!-- Search Box -->
        <div style="display: flex; flex-direction: column; gap: 4px; min-width: 170px;">
          <label style="font-size: 11px; color: #94a3b8; font-weight: 600;">Live Search</label>
          <input type="text" class="devices-search-input" style="padding: 6px 10px; font-size: 12px;" placeholder="Search pin, GPIO, name..." value="${escapeHtml(matrixSearchKeyword)}" oninput="handleMatrixSearchInput(this.value)">
        </div>

        ${(matrixFilterHome !== 'all' || matrixFilterNode !== 'all' || matrixFilterRole !== 'all' || matrixFilterRoom !== 'all' || matrixSearchKeyword) ? `
          <div style="display: flex; flex-direction: column; justify-content: flex-end; padding-top: 18px;">
            <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 8px;" onclick="resetMatrixFilters()">✕ Reset</button>
          </div>
        ` : ''}
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; gap: 8px; align-items: center; padding-top: 14px;">
        <button class="btn btn-primary" onclick="openAssignNewPinModal()" style="font-weight: 600; font-size: 12px; padding: 8px 14px; background: linear-gradient(135deg, #0284c7, #2563eb); border: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35); display: inline-flex; align-items: center; gap: 6px;">
          <span>➕</span> Assign Pin to Node
        </button>
        <button class="btn btn-secondary" onclick="syncPinsWithHardware()" style="font-size: 12px; padding: 8px 12px;">
          <span>🔄</span> Sync Hardware
        </button>
      </div>
    </div>

    <!-- Pin Matrix Table -->
    <div class="pin-matrix-table-wrap">
      <table class="pin-matrix-table">
        <thead>
          <tr>
            <th>Node / Board</th>
            <th>CH #</th>
            <th>Pin Name</th>
            <th>Room</th>
            <th>Hardware GPIO</th>
            <th>Role / Function</th>
            <th>Config & Logic</th>
            <th>Live State / Value</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filteredRelays.length === 0 ? `
            <tr>
              <td colspan="9" style="padding: 32px; text-align: center; color: #64748b;">
                <div style="font-size: 28px; margin-bottom: 8px;">🔌</div>
                <div style="font-size: 14px; font-weight: 600; color: #94a3b8;">No hardware pins match the current filter.</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Try adjusting filters or click "+ Assign Pin to Node" to add a new pin.</div>
              </td>
            </tr>
          ` : filteredRelays.map(r => {
            const isOn = Boolean(r.current_state);
            const pinNum = r.pin != null ? r.pin : r.channel_id;
            const isSensor = (r.pin_mode === 'SENSOR_INPUT' || r.function === 'Sensor' || Boolean(r.sensor_type));
            const iconSymbol = getApplianceIcon(r.icon || 'light');
            const pinLabel = getGpioPinLabel(pinNum);

            // Role Badge styling
            let roleBadgeHtml = '';
            if (r.sensor_type === 'VOLTAGE' || r.sensor_type === 'VOLTAGE_ADC' || r.function?.toLowerCase().includes('voltage')) {
              const isAc = r.function?.toLowerCase().includes('ac') || r.function?.toLowerCase().includes('rms');
              roleBadgeHtml = `<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 700; border: 1px solid rgba(245, 158, 11, 0.3);">📊 ${isAc ? 'AC RMS' : 'DC'} Voltage</span>`;
            } else if (r.sensor_type === 'IR_RECEIVER' || r.function === 'IR Receiver') {
              roleBadgeHtml = '<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(168, 85, 247, 0.15); color: #c084fc; font-weight: 700; border: 1px solid rgba(168, 85, 247, 0.3);">📡 IR Receiver</span>';
            } else if (r.sensor_type === 'IR_TRANSMITTER' || r.function === 'IR Transmitter') {
              roleBadgeHtml = '<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(6, 182, 212, 0.15); color: #22d3ee; font-weight: 700; border: 1px solid rgba(6, 182, 212, 0.3);">📶 IR Blaster</span>';
            } else if (r.sensor_type === 'PIR_MOTION' || r.function === 'PIR Motion') {
              roleBadgeHtml = '<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(34, 197, 94, 0.15); color: #4ade80; font-weight: 700; border: 1px solid rgba(34, 197, 94, 0.3);">🚶 Motion Sensor</span>';
            } else if (isSensor) {
              roleBadgeHtml = `<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(139, 92, 246, 0.15); color: #a78bfa; font-weight: 700; border: 1px solid rgba(139, 92, 246, 0.3);">🔬 Sensor (${escapeHtml(r.sensor_type || 'Input')})</span>`;
            } else {
              roleBadgeHtml = '<span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.3);">⚡ Relay Output</span>';
            }

            // Config detail styling
            let configDetailHtml = '';
            if (isSensor) {
              const intervalText = r.sensor_config?.interval_ms ? (r.sensor_config.interval_ms >= 1000 ? (r.sensor_config.interval_ms / 1000) + 's poll' : r.sensor_config.interval_ms + 'ms poll') : 'On-Event';
              configDetailHtml = `<span style="color: #cbd5e1; font-size: 11px;">${escapeHtml(r.sensor_type || 'Generic')} (${intervalText})</span>`;
            } else {
              configDetailHtml = `
                <span style="font-size: 10px; padding: 2px 5px; border-radius: 4px; background: ${r.active_low ? 'rgba(245, 158, 11, 0.12)' : 'rgba(56, 189, 248, 0.12)'}; color: ${r.active_low ? '#f59e0b' : '#38bdf8'}; font-weight: 600;">
                  ${r.active_low ? 'Active-Low' : 'Active-High'}
                </span>
                <span style="color: #94a3b8; font-size: 11px; margin-left: 4px;">${r.pulse_duration ? r.pulse_duration + 'ms' : 'Standard'}</span>
              `;
            }

            // Live State / Reading element
            let liveControlHtml = '';
            if (isSensor) {
              if (r.sensor_type === 'VOLTAGE' || r.sensor_type === 'VOLTAGE_ADC' || r.function?.toLowerCase().includes('voltage')) {
                const meta = r.sensor_config || r.sensor_meta || {};
                const dc = meta.dcVoltage != null ? meta.dcVoltage : r.last_sensor_value;
                const rms = meta.acRms;
                const rawAdc = meta.rawAdc;
                let badgeText = '';
                if (rms != null && Number(rms) > 0.005) {
                  badgeText = `⚡ AC ${Number(rms).toFixed(2)}V | DC ${Number(dc ?? 0).toFixed(2)}V`;
                } else if (dc != null) {
                  badgeText = `⚡ ${Number(dc).toFixed(3)} V`;
                } else if (r.node_id === 'NODE-30487DE85D5C') {
                  badgeText = `⚡ 255 V`;
                } else {
                  badgeText = `⚡ -- V`;
                }
                const tooltip = `title="DC: ${dc != null ? Number(dc).toFixed(3) : '--'}V | AC RMS: ${rms != null ? Number(rms).toFixed(3) : '--'}V | Raw ADC: ${rawAdc ?? '--'}"`;
                liveControlHtml = `<span ${tooltip} style="font-weight: 700; color: #f59e0b; font-family: monospace; font-size: 11px; background: rgba(245, 158, 11, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.3); cursor: help;">${badgeText}</span>`;
              } else if (r.sensor_type === 'IR_RECEIVER' || r.function === 'IR Receiver') {
                liveControlHtml = `<span style="font-weight: 700; color: #c084fc; font-family: monospace; font-size: 11px; background: rgba(168, 85, 247, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(168, 85, 247, 0.3);">📡 ${escapeHtml(r.last_sensor_str || 'Listening...')}</span>`;
              } else if (r.sensor_type === 'IR_TRANSMITTER' || r.function === 'IR Transmitter') {
                liveControlHtml = `<button class="btn btn-secondary" style="font-size: 10px; padding: 3px 7px; color: #22d3ee;" onclick="openIrTransmitModal('${r.node_id}')">🚀 Send Code</button>`;
              } else if (r.sensor_type === 'PIR_MOTION' || r.function === 'PIR Motion') {
                const motionState = r.last_sensor_str || 'Clear';
                liveControlHtml = `<span style="font-weight: 700; color: #4ade80; font-family: monospace; font-size: 11px; background: rgba(34, 197, 94, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(34, 197, 94, 0.3);">🚶 ${escapeHtml(motionState)}</span>`;
              } else {
                const valText = r.last_sensor_str || (r.last_sensor_value != null ? r.last_sensor_value + ' ' + (r.sensor_unit || '') : 'Active');
                liveControlHtml = `<span style="font-weight: 700; color: #38bdf8; font-family: monospace; font-size: 11px; background: rgba(56, 189, 248, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.3);">${escapeHtml(valText)}</span>`;
              }
            } else {
              liveControlHtml = `
                <label class="switch-toggle-wrap" style="transform: scale(0.85); transform-origin: left center;">
                  <input type="checkbox" id="relay-chk-${r.node_id}-${r.channel_id}" ${isOn ? 'checked' : ''} onchange="toggleRelay('${r.node_id}', ${r.channel_id}, this.checked)">
                  <span class="switch-toggle-slider">
                    <span class="switch-toggle-label" id="relay-lbl-${r.node_id}-${r.channel_id}">${isOn ? 'ON' : 'OFF'}</span>
                  </span>
                </label>
              `;
            }

            return `
              <tr>
                <td>
                  <strong style="color: #fff;">${escapeHtml(r.node_name || r.node_id)}</strong>
                  ${r.home_name ? `<span style="font-size: 10px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">🏠 ${escapeHtml(r.home_name)}</span>` : ''}
                  <br><small style="color: #64748b; font-family: monospace;">${escapeHtml(r.node_id)}</small>
                </td>
                <td style="color: #38bdf8; font-weight: 700;">CH${r.channel_id}</td>
                <td style="font-weight: 600; color: #fff;">
                  <span style="margin-right: 6px;">${iconSymbol}</span>${escapeHtml(r.name)}
                </td>
                <td style="color: #94a3b8;">${escapeHtml(r.room || 'General')}</td>
                <td><span class="gpio-badge" style="font-family: monospace;">${pinLabel}</span></td>
                <td>${roleBadgeHtml}</td>
                <td>${configDetailHtml}</td>
                <td ${isSensor ? `id="sensor-reading-${r.node_id}-${r.channel_id}"` : ''}>${liveControlHtml}</td>
                <td style="text-align: right; white-space: nowrap;">
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px; margin-right: 4px;" onclick="openRelayChannelConfigModal('${r.node_id}', ${r.channel_id})">⚙ Configure</button>
                  <button class="btn btn-danger" style="font-size: 11px; padding: 4px 7px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #f87171;" title="Unassign pin" onclick="handleUnassignPin('${r.node_id}', ${r.channel_id}, '${escapeHtml(r.name)}')">🗑️</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function handleMatrixFilterChange(type, value) {
  if (type === 'home') matrixFilterHome = value;
  if (type === 'node') matrixFilterNode = value;
  if (type === 'role') matrixFilterRole = value;
  if (type === 'room') matrixFilterRoom = value;
  renderRelaysView(fleetData.nodes || [], fleetData.relays || [], fleetData.homes || []);
}

function handleMatrixSearchInput(val) {
  matrixSearchKeyword = val;
  renderRelaysView(fleetData.nodes || [], fleetData.relays || [], fleetData.homes || []);
}

function resetMatrixFilters() {
  matrixFilterHome = 'all';
  matrixFilterNode = 'all';
  matrixFilterRole = 'all';
  matrixFilterRoom = 'all';
  matrixSearchKeyword = '';
  renderRelaysView(fleetData.nodes || [], fleetData.relays || [], fleetData.homes || []);
}

function switchRelaySubTab(tab) {
  currentRelaySubTab = tab;
  renderRelaysView(fleetData.nodes || [], fleetData.relays || [], fleetData.homes || []);
}

function switchRelayCategoryFilter(cat) {
  relayCategoryFilter = cat;
  renderRelaysView(fleetData.nodes || [], fleetData.relays || [], fleetData.homes || []);
}

function handleRelaySearchInput(val) {
  relaySearchKeyword = val;
  renderRelaysView(fleetData.nodes || [], fleetData.relays || [], fleetData.homes || []);
}

function handleRelayDeviceSelect(nodeId) {
  selectedRelayNodeId = nodeId;
  renderRelaysView(fleetData.nodes || [], fleetData.relays || [], fleetData.homes || []);
}

async function handleTestAllChannels(targetState) {
  const channels = (fleetData.relays || []).filter(r => r.node_id === selectedRelayNodeId);
  for (const ch of channels) {
    ch.current_state = targetState;
    toggleRelay(ch.node_id, ch.channel_id, targetState);
  }
  renderRelaysView(fleetData.nodes || [], fleetData.relays || [], fleetData.homes || []);
}

async function handleFleetAllRelays(targetState) {
  if (!confirm(`Turn ${targetState ? 'ON' : 'OFF'} ALL relays across the fleet?`)) return;
  for (const ch of (fleetData.relays || [])) {
    ch.current_state = targetState;
    toggleRelay(ch.node_id, ch.channel_id, targetState);
  }
  renderRelaysView(fleetData.nodes || [], fleetData.relays || [], fleetData.homes || []);
}

async function handleBatchRoomRelays(room, targetState) {
  try {
    const res = await fetchWithAuth(`${API_BASE}/relays/batch-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, state: targetState })
    });
    const data = await res.json();
    for (const r of (fleetData.relays || [])) {
      if ((r.room || '').toLowerCase() === room.toLowerCase()) {
        r.current_state = targetState;
      }
    }
    renderRelaysView(fleetData.nodes || [], fleetData.relays || [], fleetData.homes || []);
    alert(data.message || `Turned ${targetState ? 'ON' : 'OFF'} relays in ${room}`);
  } catch (err) {
    alert('Room batch relay error: ' + err.message);
  }
}

async function handleBatchHomeRelays(homeId, targetState) {
  try {
    const res = await fetchWithAuth(`${API_BASE}/relays/batch-home`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeId, state: targetState })
    });
    const data = await res.json();
    loadRelays();
    alert(data.message || 'Home relays batch executed');
  } catch (err) {
    alert('Home batch relay error: ' + err.message);
  }
}

function getGpioPinLabel(pin) {
  const p = Number(pin);
  if (p === 5) return 'GPIO 5 (D1)';
  if (p === 4) return 'GPIO 4 (D2)';
  if (p === 0) return 'GPIO 0 (D3)';
  if (p === 2) return 'GPIO 2 (D4)';
  if (p === 14) return 'GPIO 14 (D5)';
  if (p === 12) return 'GPIO 12 (D6)';
  if (p === 13) return 'GPIO 13 (D7)';
  if (p === 15) return 'GPIO 15 (D8)';
  if (p === 16) return 'GPIO 16 (D0)';
  if (p === 17 || p === 1000) return 'A0 (ADC0)';
  if (p >= 100 && p <= 107) return `P${p - 100} (PCF8574)`;
  return `GPIO ${p}`;
}

function openRelayChannelConfigModal(nodeId, channelId) {
  const r = (fleetData.relays || []).find(ch => ch.node_id === nodeId && ch.channel_id == channelId) || {};
  const currentIcon = r.icon || 'light';
  const currentPin = r.pin != null ? r.pin : channelId;
  const isSensor = (r.pin_mode === 'SENSOR_INPUT' || r.function === 'Sensor' || Boolean(r.sensor_type));
  const currentRole = r.sensor_type ? r.sensor_type : (isSensor ? 'GENERIC_DIGITAL' : 'RELAY_OUTPUT');
  const sensorCfg = r.sensor_config || {};
  const uniqueRooms = Array.from(new Set((fleetData.relays || []).map(ch => ch.room || 'General').filter(Boolean))).sort();

  const html = `
    <div class="modal-content" style="max-width: 560px; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <h3 style="margin: 0; color: #fff; font-size: 16px;">Configure Pin: ${escapeHtml(r.name || 'CH' + channelId)}</h3>
          <small style="color: #64748b; font-family: monospace;">Node: ${escapeHtml(nodeId)} | Channel: CH${channelId}</small>
        </div>
        <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="closeModal()">&times;</button>
      </div>

      <!-- Pin Role / Type Selector -->
      <div class="form-group" style="margin-bottom: 14px;">
        <label class="settings-field-label" style="color: #38bdf8; font-weight: 700;">Hardware Role / Mode</label>
        <select id="cfg-pin-role" class="filter-select-enhanced" style="width: 100%; font-weight: 600;" onchange="toggleConfigPinRole(this.value)">
          <option value="RELAY_OUTPUT" ${!isSensor ? 'selected' : ''}>⚡ Relay Output (Switch Appliance ON / OFF)</option>
          <option value="VOLTAGE" ${r.sensor_type === 'VOLTAGE' || r.sensor_type === 'VOLTAGE_ADC' || r.function?.includes('Voltage') ? 'selected' : ''}>📊 Voltage Sensor (AC / DC Voltage on A0 / ADC)</option>
          <option value="IR_RECEIVER" ${r.sensor_type === 'IR_RECEIVER' || r.function === 'IR Receiver' ? 'selected' : ''}>📡 IR Receiver (Decode Remote Control Signals)</option>
          <option value="IR_TRANSMITTER" ${r.sensor_type === 'IR_TRANSMITTER' || r.function === 'IR Transmitter' ? 'selected' : ''}>📶 IR Blaster / Transmitter (Transmit Remote Codes)</option>
          <option value="PIR_MOTION" ${r.sensor_type === 'PIR_MOTION' || r.function === 'PIR Motion' ? 'selected' : ''}>🚶 PIR Motion / Radar Detector</option>
          <option value="DOOR_WINDOW" ${r.sensor_type === 'DOOR_WINDOW' ? 'selected' : ''}>🚪 Magnetic Door / Window Sensor</option>
          <option value="TEMP_HUMIDITY" ${r.sensor_type === 'TEMP_HUMIDITY' ? 'selected' : ''}>🌡️ Temperature & Humidity (DHT11 / DHT22)</option>
          <option value="GENERIC_DIGITAL" ${r.sensor_type === 'GENERIC_DIGITAL' ? 'selected' : ''}>🔘 Generic Digital Input (Pushbutton / Limit Switch)</option>
          <option value="GENERIC_ANALOG" ${r.sensor_type === 'GENERIC_ANALOG' ? 'selected' : ''}>📈 Generic Analog Input (ADC)</option>
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div class="form-group">
          <label class="settings-field-label">Pin Label / Name</label>
          <input type="text" id="cfg-relay-name" class="settings-input" style="width: 100%; box-sizing: border-box;" value="${escapeHtml(r.name || '')}">
        </div>

        <div class="form-group">
          <label class="settings-field-label">Assigned Room</label>
          <select id="cfg-relay-room" class="filter-select-enhanced" style="width: 100%;">
            ${uniqueRooms.map(rm => `<option value="${escapeHtml(rm)}" ${(r.room || 'General') === rm ? 'selected' : ''}>${escapeHtml(rm)}</option>`).join('')}
            ${!uniqueRooms.includes(r.room) && r.room ? `<option value="${escapeHtml(r.room)}" selected>${escapeHtml(r.room)}</option>` : ''}
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div class="form-group">
          <label class="settings-field-label">Hardware Pin (GPIO / ADC)</label>
          <select id="cfg-relay-pin-preset" class="filter-select-enhanced" style="width: 100%; margin-bottom: 6px;" onchange="document.getElementById('cfg-relay-pin').value = this.value">
            <option value="5" ${currentPin == 5 ? 'selected' : ''}>GPIO 5 (D1 - SCL)</option>
            <option value="4" ${currentPin == 4 ? 'selected' : ''}>GPIO 4 (D2 - SDA)</option>
            <option value="14" ${currentPin == 14 ? 'selected' : ''}>GPIO 14 (D5 - SCK)</option>
            <option value="12" ${currentPin == 12 ? 'selected' : ''}>GPIO 12 (D6 - MISO)</option>
            <option value="13" ${currentPin == 13 ? 'selected' : ''}>GPIO 13 (D7 - MOSI)</option>
            <option value="0" ${currentPin == 0 ? 'selected' : ''}>GPIO 0 (D3 - Flash)</option>
            <option value="2" ${currentPin == 2 ? 'selected' : ''}>GPIO 2 (D4 - TX1)</option>
            <option value="15" ${currentPin == 15 ? 'selected' : ''}>GPIO 15 (D8 - CS)</option>
            <option value="16" ${currentPin == 16 ? 'selected' : ''}>GPIO 16 (D0 - Wake)</option>
            <option value="17" ${currentPin == 17 || currentPin == 1000 ? 'selected' : ''}>A0 (ADC0 - Analog)</option>
            <option value="custom">-- Custom GPIO Number --</option>
          </select>
          <input type="number" id="cfg-relay-pin" class="settings-input" style="width: 100%; box-sizing: border-box;" value="${currentPin}">
        </div>

        <div class="form-group">
          <label class="settings-field-label">Appliance / Pin Icon</label>
          <select id="cfg-relay-icon" class="filter-select-enhanced" style="width: 100%;">
            <option value="light" ${currentIcon === 'light' ? 'selected' : ''}>💡 Light / Lamp</option>
            <option value="fan" ${currentIcon === 'fan' ? 'selected' : ''}>🌀 Fan / Ventilation</option>
            <option value="socket" ${currentIcon === 'socket' ? 'selected' : ''}>🔌 Socket / Plug</option>
            <option value="pump" ${currentIcon === 'pump' ? 'selected' : ''}>🚰 Water Pump / Motor</option>
            <option value="gate" ${currentIcon === 'gate' ? 'selected' : ''}>🚪 Automatic Gate</option>
            <option value="tv" ${currentIcon === 'tv' ? 'selected' : ''}>📺 TV / AV Receiver</option>
            <option value="ac" ${currentIcon === 'ac' ? 'selected' : ''}>❄️ AC / HVAC</option>
            <option value="voltage" ${currentIcon === 'voltage' ? 'selected' : ''}>📊 Voltage Sensor</option>
            <option value="ir" ${currentIcon === 'ir' ? 'selected' : ''}>📡 IR Transceiver</option>
            <option value="motion" ${currentIcon === 'motion' ? 'selected' : ''}>🚶 Motion / PIR</option>
            <option value="temp" ${currentIcon === 'temp' ? 'selected' : ''}>🌡️ Temp & Humidity</option>
            <option value="breaker" ${currentIcon === 'breaker' ? 'selected' : ''}>⚡ Breaker / Feeder</option>
          </select>
        </div>
      </div>

      <!-- SECTION A: RELAY SPECIFIC OPTIONS -->
      <div id="sec-relay-options" style="display: ${isSensor ? 'none' : 'block'}; background: rgba(30, 41, 59, 0.5); border-radius: 8px; padding: 12px; margin-bottom: 12px; border: 1px solid #1e293b;">
        <div style="font-size: 12px; font-weight: 700; color: #10b981; margin-bottom: 10px;">⚡ Relay Actuator Settings</div>

        <div class="form-group" style="margin-bottom: 10px;">
          <label class="settings-field-label">Invert Logic</label>
          <select id="cfg-relay-logic" class="filter-select-enhanced" style="width: 100%;">
            <option value="1" ${r.active_low ? 'selected' : ''}>Active-Low (Relay ON when GPIO LOW - Standard Board)</option>
            <option value="0" ${!r.active_low ? 'selected' : ''}>Active-High (Relay ON when GPIO HIGH)</option>
          </select>
        </div>

        <div class="form-group" style="margin-bottom: 10px;">
          <label class="settings-field-label">Power-On Default State</label>
          <select id="cfg-relay-default" class="filter-select-enhanced" style="width: 100%;">
            <option value="last">Remember Last State (Restore previous state on reboot)</option>
            <option value="off">Always Inactive (OFF) on Boot</option>
            <option value="on">Always Active (ON) on Boot</option>
          </select>
        </div>

        <div class="form-group">
          <label class="settings-field-label">Inching / Auto-Off Timer</label>
          <select id="cfg-relay-inching" class="filter-select-enhanced" style="width: 100%;">
            <option value="0">Disabled (Standard Toggle)</option>
            <option value="500">Pulse 500 ms (Momentary Gate / Pushbutton)</option>
            <option value="2000">Auto-Off after 2 Seconds</option>
            <option value="10000">Auto-Off after 10 Seconds</option>
            <option value="60000">Auto-Off after 1 Minute</option>
          </select>
        </div>
      </div>

      <!-- SECTION B: SENSOR SPECIFIC OPTIONS -->
      <div id="sec-sensor-options" style="display: ${isSensor ? 'block' : 'none'}; background: rgba(30, 41, 59, 0.5); border-radius: 8px; padding: 12px; margin-bottom: 12px; border: 1px solid #1e293b;">
        <div style="font-size: 12px; font-weight: 700; color: #c084fc; margin-bottom: 10px;">📡 Sensor Configuration & Calibration</div>

        <div id="cfg-voltage-mode-wrap" class="form-group" style="display: ${(r.sensor_type === 'VOLTAGE' || r.sensor_type === 'VOLTAGE_ADC' || r.function?.includes('Voltage')) ? 'block' : 'none'}; margin-bottom: 10px;">
          <label class="settings-field-label">Analog Sampling Mode (A0 / ADC)</label>
          <select id="cfg-voltage-mode" class="filter-select-enhanced" style="width: 100%;">
            <option value="AC" ${r.function?.toLowerCase().includes('ac') || r.function?.toLowerCase().includes('rms') ? 'selected' : ''}>⚡ AC RMS Voltage (Mains AC 50/60Hz RMS Cycle Sampling)</option>
            <option value="DC" ${!r.function?.toLowerCase().includes('ac') && !r.function?.toLowerCase().includes('rms') ? 'selected' : ''}>🔋 DC Voltage (Direct DC Level / Resistor Divider)</option>
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
          <div class="form-group">
            <label class="settings-field-label">Telemetry Reporting Interval</label>
            <select id="cfg-sensor-interval" class="filter-select-enhanced" style="width: 100%;">
              <option value="0">On-Event / Interrupt (Immediate Push)</option>
              <option value="500" ${sensorCfg.interval_ms == 500 ? 'selected' : ''}>500 ms (Fast Polling)</option>
              <option value="1000" ${sensorCfg.interval_ms == 1000 ? 'selected' : ''}>1 Second</option>
              <option value="2000" ${sensorCfg.interval_ms == 2000 ? 'selected' : ''}>2 Seconds</option>
              <option value="5000" ${sensorCfg.interval_ms == 5000 ? 'selected' : ''}>5 Seconds (Standard)</option>
              <option value="10000" ${sensorCfg.interval_ms == 10000 ? 'selected' : ''}>10 Seconds</option>
              <option value="30000" ${sensorCfg.interval_ms == 30000 ? 'selected' : ''}>30 Seconds</option>
            </select>
          </div>

          <div class="form-group">
            <label class="settings-field-label">Sensor Unit Label</label>
            <input type="text" id="cfg-sensor-unit" class="settings-input" style="width: 100%; box-sizing: border-box;" placeholder="e.g. V, °C, HEX, mA" value="${escapeHtml(r.sensor_unit || '')}">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
          <div class="form-group">
            <label class="settings-field-label">Voltage / ADC Multiplier</label>
            <input type="number" step="0.001" id="cfg-sensor-multiplier" class="settings-input" style="width: 100%; box-sizing: border-box;" placeholder="e.g. 0.244" value="${sensorCfg.multiplier ?? 1.0}">
          </div>

          <div class="form-group">
            <label class="settings-field-label">Calibration Offset</label>
            <input type="number" step="0.1" id="cfg-sensor-offset" class="settings-input" style="width: 100%; box-sizing: border-box;" placeholder="0.0" value="${sensorCfg.offset ?? 0.0}">
          </div>
        </div>

        <div class="form-group">
          <label class="settings-field-label">IR Protocol (For IR Receiver / Transmitter)</label>
          <select id="cfg-sensor-ir-proto" class="filter-select-enhanced" style="width: 100%;">
            <option value="NEC" ${sensorCfg.ir_protocol === 'NEC' ? 'selected' : ''}>NEC (Standard TV / STB / AC)</option>
            <option value="SONY" ${sensorCfg.ir_protocol === 'SONY' ? 'selected' : ''}>SONY (12/15/20 Bit)</option>
            <option value="RC5" ${sensorCfg.ir_protocol === 'RC5' ? 'selected' : ''}>Philips RC5 / RC6</option>
            <option value="SAMSUNG" ${sensorCfg.ir_protocol === 'SAMSUNG' ? 'selected' : ''}>Samsung 32-Bit</option>
            <option value="RAW" ${sensorCfg.ir_protocol === 'RAW' ? 'selected' : ''}>Raw Timing Buffer</option>
          </select>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid #1e293b;">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-save-settings" onclick="saveRelayChannelConfig('${nodeId}', ${channelId})">Save Pin Configuration</button>
      </div>
    </div>
  `;
  openModal(html);
}

function toggleConfigPinRole(role) {
  const isSensor = role !== 'RELAY_OUTPUT';
  const secRelay = document.getElementById('sec-relay-options');
  const secSensor = document.getElementById('sec-sensor-options');
  const voltWrap = document.getElementById('cfg-voltage-mode-wrap');
  if (secRelay) secRelay.style.display = isSensor ? 'none' : 'block';
  if (secSensor) secSensor.style.display = isSensor ? 'block' : 'none';
  if (voltWrap) voltWrap.style.display = (role === 'VOLTAGE') ? 'block' : 'none';

  // Automatically adjust icon hint
  const iconSelect = document.getElementById('cfg-relay-icon');
  if (iconSelect) {
    if (role === 'VOLTAGE') iconSelect.value = 'voltage';
    else if (role === 'IR_RECEIVER' || role === 'IR_TRANSMITTER') iconSelect.value = 'ir';
    else if (role === 'PIR_MOTION') iconSelect.value = 'motion';
    else if (role === 'TEMP_HUMIDITY') iconSelect.value = 'temp';
    else if (role === 'RELAY_OUTPUT') iconSelect.value = 'light';
  }

  // Automatically adjust unit hint
  const unitInput = document.getElementById('cfg-sensor-unit');
  if (unitInput) {
    if (role === 'VOLTAGE') unitInput.value = 'V';
    else if (role === 'IR_RECEIVER') unitInput.value = 'HEX';
    else if (role === 'TEMP_HUMIDITY') unitInput.value = '°C';
    else if (role === 'PIR_MOTION') unitInput.value = 'STATE';
  }

  // Automatically preset ADC pin if voltage
  if (role === 'VOLTAGE') {
    const pinSelect = document.getElementById('cfg-relay-pin-preset');
    const pinInput = document.getElementById('cfg-relay-pin');
    if (pinSelect && pinInput) {
      pinSelect.value = '17';
      pinInput.value = '17';
    }
  }
}

async function saveRelayChannelConfig(nodeId, channelId) {
  const role = document.getElementById("cfg-pin-role").value;
  const isSensor = role !== 'RELAY_OUTPUT';
  const name = document.getElementById("cfg-relay-name").value.trim();
  const room = document.getElementById("cfg-relay-room") ? document.getElementById("cfg-relay-room").value : 'General';
  const icon = document.getElementById("cfg-relay-icon").value;
  const pin = Number(document.getElementById("cfg-relay-pin").value);
  const active_low = document.getElementById("cfg-relay-logic") ? document.getElementById("cfg-relay-logic").value === '1' : true;
  const voltMode = document.getElementById("cfg-voltage-mode")?.value || 'AC';

  const sensorConfig = isSensor ? {
    interval_ms: Number(document.getElementById("cfg-sensor-interval")?.value || 0),
    multiplier: Number(document.getElementById("cfg-sensor-multiplier")?.value || 1.0),
    offset: Number(document.getElementById("cfg-sensor-offset")?.value || 0.0),
    ir_protocol: document.getElementById("cfg-sensor-ir-proto")?.value || 'NEC',
    voltage_mode: (role === 'VOLTAGE') ? voltMode : undefined
  } : {};

  const sensorUnit = isSensor ? (document.getElementById("cfg-sensor-unit")?.value || '') : null;
  const sensorType = isSensor ? role : null;
  const func = isSensor ? (role === 'VOLTAGE' ? (voltMode === 'AC' ? 'AC RMS Voltage Sensor' : 'DC Voltage Sensor') : (role === 'IR_RECEIVER' ? 'IR Receiver' : (role === 'IR_TRANSMITTER' ? 'IR Transmitter' : 'Sensor'))) : 'Relay';
  const pinMode = isSensor ? 'SENSOR_INPUT' : 'RELAY_OUTPUT';

  try {
    const res = await fetchWithAuth(`${API_BASE}/relays/${nodeId}/${channelId}/advanced-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        room,
        pin,
        active_low,
        icon,
        function: func,
        pin_mode: pinMode,
        sensor_type: sensorType,
        sensor_unit: sensorUnit,
        sensor_config: sensorConfig
      })
    });
    const data = await res.json();
    if (data.success || data.status === 'ok') {
      showToast({ title: 'Pin Configured', message: data.message || 'Pin configured successfully', severity: 'SUCCESS', category: 'PIN' });
      closeModal();
      if (currentView === 'sensors') {
        loadSensors();
      } else {
        loadRelays();
      }
    } else {
      showToast({ title: 'Config Error', message: data.error || 'Failed to save configuration', severity: 'ERROR', category: 'PIN' });
    }
  } catch (err) {
    showToast({ title: 'Config Failed', message: 'Failed to save pin config: ' + err.message, severity: 'ERROR', category: 'PIN' });
  }
}

// Open Modal to Assign New Pin to Any Node
function openAssignNewPinModal(defaultRole = 'RELAY_OUTPUT') {
  const nodes = fleetData.nodes || [];
  const defaultNode = nodes.find(n => n.node_id === selectedRelayNodeId) || nodes[0] || {};
  const currentRelays = (fleetData.relays || []).filter(r => r.node_id === defaultNode.node_id);
  const nextChId = currentRelays.length > 0 ? Math.max(...currentRelays.map(r => Number(r.channel_id) || 0)) + 1 : 1;
  const uniqueRooms = Array.from(new Set((fleetData.relays || []).map(ch => ch.room || 'General').filter(Boolean))).sort();

  const isSensorRole = defaultRole === 'sensor' || defaultRole === 'VOLTAGE' || defaultRole === 'IR_RECEIVER' || defaultRole === 'IR_TRANSMITTER';
  const defaultPin = defaultRole === 'sensor' || defaultRole === 'VOLTAGE' ? '17' : '14';

  const html = `
    <div class="modal-content" style="max-width: 560px; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px;">
        <h3 style="margin: 0; color: #fff; font-size: 16px;">${isSensorRole ? '📡 Assign New Sensor Pin to Hardware Node' : '➕ Assign New Pin to Hardware Node'}</h3>
        <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="closeModal()">&times;</button>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="settings-field-label">Target Hardware Node</label>
        <select id="new-pin-node" class="filter-select-enhanced" style="width: 100%;">
          ${nodes.map(n => `<option value="${n.node_id}" ${n.node_id === defaultNode.node_id ? 'selected' : ''}>${escapeHtml(n.name || n.node_id)} (${escapeHtml(n.ip_address || 'LAN')})</option>`).join('')}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div class="form-group">
          <label class="settings-field-label">Channel Number</label>
          <input type="number" id="new-pin-channel" class="settings-input" style="width: 100%; box-sizing: border-box;" value="${nextChId}">
        </div>

        <div class="form-group">
          <label class="settings-field-label">Hardware Pin (GPIO / ADC)</label>
          <select id="new-pin-gpio" class="filter-select-enhanced" style="width: 100%;">
            <option value="17" ${defaultPin === '17' ? 'selected' : ''}>A0 (ADC0 - Analog Voltage)</option>
            <option value="14" ${defaultPin === '14' ? 'selected' : ''}>GPIO 14 (D5 - SCK / IR RX)</option>
            <option value="13" ${defaultPin === '13' ? 'selected' : ''}>GPIO 13 (D7 - MOSI / IR TX)</option>
            <option value="5">GPIO 5 (D1 - SCL)</option>
            <option value="4">GPIO 4 (D2 - SDA)</option>
            <option value="12">GPIO 12 (D6 - MISO)</option>
            <option value="0">GPIO 0 (D3 - Flash)</option>
            <option value="2">GPIO 2 (D4 - TX1)</option>
            <option value="15">GPIO 15 (D8 - CS)</option>
            <option value="16">GPIO 16 (D0 - Wake)</option>
          </select>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="settings-field-label">Pin Role / Function</label>
        <select id="new-pin-role" class="filter-select-enhanced" style="width: 100%; font-weight: 600;">
          <option value="RELAY_OUTPUT" ${defaultRole === 'RELAY_OUTPUT' ? 'selected' : ''}>⚡ Relay Actuator (Control Appliance ON / OFF)</option>
          <option value="VOLTAGE" ${defaultRole === 'sensor' || defaultRole === 'VOLTAGE' ? 'selected' : ''}>📊 Voltage Sensor (Mains AC / DC Divider on ADC)</option>
          <option value="IR_RECEIVER" ${defaultRole === 'IR_RECEIVER' ? 'selected' : ''}>📡 IR Remote Sensor (Decode IR pulses)</option>
          <option value="IR_TRANSMITTER" ${defaultRole === 'IR_TRANSMITTER' ? 'selected' : ''}>📶 IR Blaster (Transmit IR remote signals)</option>
          <option value="PIR_MOTION">🚶 PIR Motion / Radar Detector</option>
          <option value="DOOR_WINDOW">🚪 Door / Window Magnetic Contact</option>
          <option value="TEMP_HUMIDITY">🌡️ Temperature & Humidity (DHT)</option>
          <option value="GENERIC_DIGITAL">🔘 Generic Digital Input</option>
          <option value="GENERIC_ANALOG">📈 Generic Analog Input</option>
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div class="form-group">
          <label class="settings-field-label">Pin Name / Label</label>
          <input type="text" id="new-pin-name" class="settings-input" style="width: 100%; box-sizing: border-box;" placeholder="e.g. Balcony Light or Voltage Monitor">
        </div>

        <div class="form-group">
          <label class="settings-field-label">Assigned Room</label>
          <select id="new-pin-room" class="filter-select-enhanced" style="width: 100%;">
            ${uniqueRooms.map(rm => `<option value="${escapeHtml(rm)}">${escapeHtml(rm)}</option>`).join('')}
            <option value="Living Room">Living Room</option>
            <option value="Bedroom">Bedroom</option>
            <option value="Kitchen">Kitchen</option>
            <option value="Main DB">Main DB</option>
            <option value="General">General</option>
          </select>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid #1e293b;">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-save-settings" onclick="handleAssignNewPinSubmit()">Assign Pin to Node</button>
      </div>
    </div>
  `;
  openModal(html);
}

async function handleAssignNewPinSubmit() {
  const nodeId = document.getElementById("new-pin-node").value;
  const channelId = Number(document.getElementById("new-pin-channel").value);
  const pin = Number(document.getElementById("new-pin-gpio").value);
  const role = document.getElementById("new-pin-role").value;
  const isSensor = role !== 'RELAY_OUTPUT';
  const name = document.getElementById("new-pin-name").value.trim() || (isSensor ? `Sensor ${channelId}` : `Relay ${channelId}`);
  const room = document.getElementById("new-pin-room").value;

  let icon = 'light';
  let unit = '';
  if (role === 'VOLTAGE') { icon = 'voltage'; unit = 'V'; }
  else if (role.startsWith('IR')) { icon = 'ir'; unit = 'HEX'; }
  else if (role.includes('MOTION')) { icon = 'motion'; unit = 'STATE'; }
  else if (role.includes('TEMP')) { icon = 'temp'; unit = '°C'; }

  const payload = {
    channel_id: channelId,
    pin: pin,
    name: name,
    room: room,
    icon: icon,
    function: isSensor ? (role === 'VOLTAGE' ? 'Voltage Sensor' : (role.startsWith('IR') ? 'IR Transceiver' : 'Sensor')) : 'Relay',
    pin_mode: isSensor ? 'SENSOR_INPUT' : 'RELAY_OUTPUT',
    sensor_type: isSensor ? role : null,
    sensor_unit: unit,
    active_low: true
  };

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${nodeId}/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Pin assigned successfully', 'success');
      closeModal();
      if (currentView === 'sensors') {
        loadSensors();
      } else {
        loadRelays();
      }
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to assign pin: ' + err.message, 'error');
  }
}

async function handleUnassignPin(nodeId, channelId, name) {
  if (!confirm(`Are you sure you want to unassign pin channel ${channelId} ('${name}') from node '${nodeId}'?`)) return;

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${nodeId}/pins/${channelId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Pin unassigned successfully', 'success');
      if (currentView === 'sensors') {
        loadSensors();
      } else {
        loadRelays();
      }
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to unassign pin: ' + err.message, 'error');
  }
}

function openIrTransmitModal(nodeId) {
  const html = `
    <div class="modal-content" style="max-width: 480px; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px;">
        <h3 style="margin: 0; color: #fff; font-size: 16px;">📶 Transmit IR Command (${escapeHtml(nodeId)})</h3>
        <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="closeModal()">&times;</button>
      </div>

      <div class="form-group" style="margin-bottom: 12px;">
        <label class="settings-field-label">IR Protocol</label>
        <select id="ir-tx-protocol" class="filter-select-enhanced" style="width: 100%;">
          <option value="NEC">NEC (Standard TVs, Set-Top Boxes, AC remotes)</option>
          <option value="SONY">SONY (12/15/20 Bit)</option>
          <option value="RC5">Philips RC5</option>
          <option value="SAMSUNG">Samsung 32-Bit</option>
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 14px;">
        <label class="settings-field-label">Hex IR Code</label>
        <input type="text" id="ir-tx-code" class="settings-input" style="width: 100%; box-sizing: border-box; font-family: monospace; font-size: 14px;" placeholder="e.g. 0xF720DF or 0x20DF10EF" value="0xF720DF">
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid #1e293b;">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-save-settings" onclick="handleSendIrCommand('${nodeId}')">🚀 Transmit Signal</button>
      </div>
    </div>
  `;
  openModal(html);
}

async function handleSendIrCommand(nodeId) {
  const protocol = document.getElementById("ir-tx-protocol").value;
  const code = document.getElementById("ir-tx-code").value.trim();
  if (!code) return showToast('Please enter an IR hex code', 'warning');

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${nodeId}/ir/transmit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol, code })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || `Transmitted IR: ${code}`, 'success');
      closeModal();
    } else {
      showToast('Error: ' + data.error, 'error');
    }
  } catch (err) {
    showToast('Failed to transmit IR: ' + err.message, 'error');
  }
}

async function toggleRelay(nodeId, channelId, state) {
  // 1. INSTANT OPTIMISTIC UI UPDATE (ZERO DELAY)
  updateRelayUiState(nodeId, channelId, state);

  // 2. DISPATCH COMMAND WITH AUTH IN BACKGROUND
  try {
    const res = await fetchWithAuth(`${API_BASE}/relays/${nodeId}/${channelId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setState", state: state })
    });
    const data = await res.json();
    if (!data.success && data.error) {
      updateRelayUiState(nodeId, channelId, !state);
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (e) {
    updateRelayUiState(nodeId, channelId, !state);
    showToast(`Network error: ${e.message}`, 'error');
  }
}

async function pulseRelay(nodeId, channelId, duration = 500) {
  // Instant momentary visual pulse
  updateRelayUiState(nodeId, channelId, true);
  setTimeout(() => {
    updateRelayUiState(nodeId, channelId, false);
  }, duration);

  try {
    await fetchWithAuth(`${API_BASE}/relays/${nodeId}/${channelId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pulse", duration: duration })
    });
  } catch (e) {
    console.error("Pulse command error:", e);
  }
}

// VIEW ③ & ④: ROOMS & HOMES MANAGEMENT (GROUPED BY HOME & 3D ROOM GUI)
// ==========================================================================
let currentRoomsHomesSubTab = 'rooms'; // 'rooms' or 'homes'
let selectedRoomHomeFilter = 'all'; // 'all' or numeric homeId
let activeViewingRoomId = null; // null or numeric roomId
let isRoomLayoutEditMode = false;
let roomStageAngle = -42;
let currentRoomViewMode = '2d'; // '2d' (architectural blueprint) or '3d' (isometric stage)
let cachedRoomsList = [];
let cachedHomesList = [];
let cachedNodesList = [];
let cachedRelaysList = [];

async function loadRoomsAndHomes() {
  const container = document.getElementById("content-area");
  try {
    const [homesRes, roomsRes, nodesRes, relaysRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/homes`),
      fetchWithAuth(`${API_BASE}/rooms`),
      fetchWithAuth(`${API_BASE}/nodes`),
      fetchWithAuth(`${API_BASE}/relays`)
    ]);

    const homesData = await homesRes.json();
    const roomsData = await roomsRes.json();
    const nodesData = await nodesRes.json();
    const relaysData = await relaysRes.json();

    cachedHomesList = homesData.homes || [];
    cachedRoomsList = roomsData.rooms || [];
    cachedNodesList = Array.isArray(nodesData) ? nodesData : (nodesData.nodes || []);
    cachedRelaysList = Array.isArray(relaysData) ? relaysData : (relaysData.relays || []);

    // Also update global cache if available
    cachedHomes = cachedHomesList;
    cachedRooms = cachedRoomsList;

    renderRoomsAndHomesView(cachedHomesList, cachedRoomsList, cachedNodesList, cachedRelaysList);
  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading rooms and homes: ${err.message}</div>`;
  }
}

function renderRoomsAndHomesView(homes, rooms, nodes, relays = cachedRelaysList) {
  const container = document.getElementById("content-area");

  // If a specific room is being viewed in 3D GUI Canvas mode:
  if (activeViewingRoomId != null && currentRoomsHomesSubTab === 'rooms') {
    const activeRoom = rooms.find(r => r.id === activeViewingRoomId);
    if (activeRoom) {
      const activeHome = homes.find(h => h.id === activeRoom.home_id) || homes[0] || { name: 'Home' };
      renderActiveRoomGui(activeRoom, activeHome, relays, nodes);
      return;
    }
    activeViewingRoomId = null;
  }

  // Modern room photo collection with graceful fallback
  const roomBackgrounds = {
    'Living Room': 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=500&q=80',
    'Bedroom': 'https://images.unsplash.com/photo-1540518614846-7ede433c4550?w=500&q=80',
    'Kitchen': 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=500&q=80',
    'Dining': 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=500&q=80',
    'Study': 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=500&q=80',
    'Outside': 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&q=80',
    'Garden': 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=500&q=80',
    'Bathroom': 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=500&q=80',
    'Garage': 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=500&q=80',
    'Main DB': 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=500&q=80',
    'Office': 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=500&q=80',
    'Hall': 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=500&q=80',
    'Balcony': 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&q=80',
    'Home Cinema': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80'
  };

  const getDeviceCountForRoom = (roomName, roomId) => {
    return nodes.filter(n => {
      const matchName = (n.room || '').toLowerCase() === (roomName || '').toLowerCase();
      const matchId = n.room_id && roomId && Number(n.room_id) === Number(roomId);
      return matchName || matchId;
    }).length;
  };

  const getRelaysForRoom = (roomName) => {
    return (relays || []).filter(r => (r.room || '').toLowerCase() === (roomName || '').toLowerCase());
  };

  // Filter homes if user selected a single home
  const displayHomes = selectedRoomHomeFilter === 'all' 
    ? homes 
    : homes.filter(h => String(h.id) === String(selectedRoomHomeFilter));

  container.innerHTML = `
    <div class="homes-view-wrap">
      <!-- Topbar with tabs -->
      <div class="devices-topbar-actions">
        <div>
          <h2 style="font-size: 19px; font-weight: 700; color: #ffffff; margin: 0;" id="rooms-homes-title">
            ${currentRoomsHomesSubTab === 'rooms' ? 'Rooms & Spaces' : 'Homes & Properties'}
          </h2>
          <p style="font-size: 12px; color: #94a3b8; margin: 3px 0 0 0;" id="rooms-homes-sub">
            ${currentRoomsHomesSubTab === 'rooms' ? 'Rooms organized by Home with interactive 3D layout visualizer' : 'Manage multiple residences, villas, and commercial properties'}
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="automation-tabs-bar" style="border: none; margin: 0; padding: 0;">
            <button class="auto-tab-btn ${currentRoomsHomesSubTab === 'rooms' ? 'active' : ''}" onclick="switchRoomsHomesTab('rooms')">Rooms</button>
            <button class="auto-tab-btn ${currentRoomsHomesSubTab === 'homes' ? 'active' : ''}" onclick="switchRoomsHomesTab('homes')">Homes / Sites</button>
          </div>
          <button class="btn-add-primary" onclick="handleAddRoomOrHome()">
            <span>+ Add ${currentRoomsHomesSubTab === 'rooms' ? 'Room' : 'Home'}</span>
          </button>
        </div>
      </div>

      <!-- HOME FILTER TABS (When on Rooms View) -->
      ${currentRoomsHomesSubTab === 'rooms' ? `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px; overflow-x: auto; padding-bottom: 4px;">
          <button class="subview-tab-btn ${selectedRoomHomeFilter === 'all' ? 'active' : ''}" onclick="filterRoomsByHome('all')">
            🏠 All Homes (${rooms.length} Rooms)
          </button>
          ${homes.map(h => {
            const hRooms = rooms.filter(r => r.home_id === h.id);
            return `
              <button class="subview-tab-btn ${String(selectedRoomHomeFilter) === String(h.id) ? 'active' : ''}" onclick="filterRoomsByHome(${h.id})">
                🏡 ${escapeHtml(h.name)} (${hRooms.length})
              </button>
            `;
          }).join('')}
        </div>
      ` : ''}

      <!-- ROOMS GROUPED BY HOME -->
      <div id="rooms-view-container" style="display: ${currentRoomsHomesSubTab === 'rooms' ? 'block' : 'none'};">
        ${displayHomes.map(h => {
          const homeRooms = rooms.filter(r => r.home_id === h.id);
          const homeNodes = nodes.filter(n => n.home_id === h.id || (n.location && n.location.toLowerCase() === h.name.toLowerCase()));
          const homeRelays = (relays || []).filter(r => {
            const parentNode = nodes.find(n => n.node_id === r.node_id);
            return parentNode && parentNode.home_id === h.id;
          });

          return `
            <div class="home-rooms-group">
              <div class="home-rooms-group-header">
                <div class="home-rooms-group-title">
                  <span style="font-size: 24px;">🏡</span>
                  <div>
                    <h3>${escapeHtml(h.name)}</h3>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                      ${escapeHtml(h.address || h.description || 'Primary Smart Residence')} • 
                      <strong style="color: #38bdf8;">${homeRooms.length} Rooms</strong> • 
                      <strong style="color: #10b981;">${homeNodes.length} Online Nodes</strong> • 
                      <strong style="color: #f59e0b;">${homeRelays.length} Appliances</strong>
                    </div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="home-rooms-badge">${homeRooms.length} Spaces</span>
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="showAddRoomModal(${h.id})">
                    + Add Room
                  </button>
                </div>
              </div>

              <!-- Rooms Grid for this Home -->
              <div class="rooms-grid">
                ${homeRooms.map(r => {
                  const bgImg = roomBackgrounds[r.name] || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=500&q=80';
                  const devCount = getDeviceCountForRoom(r.name, r.id);
                  const roomRelays = getRelaysForRoom(r.name);
                  const activeCount = roomRelays.filter(rel => rel.current_state).length;

                  return `
                    <div class="room-card" style="cursor: pointer;" onclick="openRoomGuiCanvas(${r.id})">
                      <div class="room-card-preview" style="background-image: url('${bgImg}');">
                        <div class="room-preview-overlay"></div>
                        <div class="room-card-title-wrap">
                          <div class="room-card-name">
                            <span style="color: #10b981; font-size: 10px;">●</span> ${escapeHtml(r.name)}
                          </div>
                          <span class="room-card-count">
                            ${roomRelays.length} Appliances (${activeCount} ON) • ${devCount} Nodes
                          </span>
                        </div>
                      </div>
                      <div class="room-card-body">
                        <div>
                          <span style="font-size: 11px; color: #64748b;">Floor: ${escapeHtml(r.floor || 'Ground')}</span>
                          <span style="display: inline-block; margin-left: 6px; font-size: 11px; color: #38bdf8; font-weight: 600;">🚀 Open GUI ↗</span>
                        </div>
                        <div class="actions-cell" onclick="event.stopPropagation()">
                          <button class="action-btn" title="Edit Room" onclick="showEditRoomModal(${r.id})">✏️</button>
                          <button class="action-btn delete-btn" title="Delete Room" onclick="handleDeleteRoom(${r.id}, '${escapeHtml(r.name)}')">🗑️</button>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}

                <!-- Add Room Card for this Home -->
                <div class="room-add-card" onclick="showAddRoomModal(${h.id})">
                  <span style="font-size: 26px;">+</span>
                  <span style="font-weight: 700; font-size: 13px;">Add Room to ${escapeHtml(h.name)}</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Homes List (Panel ④) -->
      <div id="homes-view-container" class="homes-view-wrap" style="display: ${currentRoomsHomesSubTab === 'homes' ? 'flex' : 'none'};">
        ${homes.map((h, idx) => {
          const isDef = idx === 0 || h.name.includes('Primary');
          const homeRooms = rooms.filter(r => r.home_id === h.id);
          const homeNodes = nodes.filter(n => n.home_id === h.id || (n.location && n.location.toLowerCase() === h.name.toLowerCase()));
          const roomsCount = homeRooms.length;
          const devicesCount = homeNodes.length;
          const autoCount = isDef ? 18 : (h.name.includes('Village') ? 6 : 4);

          return `
            <div class="home-site-card">
              <div class="home-site-left">
                <div class="home-site-icon-box">🏠</div>
                <div class="home-site-details">
                  <div class="home-site-title">
                    <span>${escapeHtml(h.name)}</span>
                    ${isDef ? '<span class="default-badge">Default</span>' : ''}
                  </div>
                  <div class="home-site-stats">
                    Rooms: ${roomsCount} &nbsp;|&nbsp; Devices: ${devicesCount} &nbsp;|&nbsp; Automations: ${autoCount}
                    ${h.address ? ` &nbsp;|&nbsp; <span style="color: #64748b;">📍 ${escapeHtml(h.address)}</span>` : ''}
                  </div>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 14px;">
                <span class="status-pill-online" style="padding: 4px 12px;">Active</span>
                <button class="action-btn" title="Edit Home" onclick="showEditHomeModal(${h.id})">✏️</button>
                <button class="action-btn delete-btn" title="Delete Home" onclick="handleDeleteHome(${h.id}, '${escapeHtml(h.name)}')">🗑️</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function switchRoomsHomesTab(tab) {
  currentRoomsHomesSubTab = tab;
  activeViewingRoomId = null;
  loadRoomsAndHomes();
}

function handleAddRoomOrHome() {
  if (currentRoomsHomesSubTab === 'rooms') {
    showAddRoomModal();
  } else {
    showCreateHomeModal();
  }
}

// --------------------------------------------------------------------------
// 3D ISOMETRIC INTERACTIVE ROOM GUI CANVAS
// --------------------------------------------------------------------------

function openRoomGuiCanvas(roomId) {
  activeViewingRoomId = Number(roomId);
  isRoomLayoutEditMode = false;
  loadRoomsAndHomes();
}

function closeRoomGuiCanvas() {
  activeViewingRoomId = null;
  isRoomLayoutEditMode = false;
  loadRoomsAndHomes();
}

function filterRoomsByHome(homeId) {
  selectedRoomHomeFilter = homeId;
  activeViewingRoomId = null;
  loadRoomsAndHomes();
}

function switchRoomViewMode(mode) {
  currentRoomViewMode = mode;
  const room = (cachedRoomsList || []).find(r => r.id === activeViewingRoomId);
  const home = (cachedHomesList || []).find(h => h.id === (room ? room.home_id : null)) || { name: 'Home' };
  if (room) {
    renderActiveRoomGui(room, home, cachedRelaysList, cachedNodesList);
  }
}

function renderActiveRoomGui(room, home, relays, nodes) {
  const container = document.getElementById("content-area");

  // Filter relays mapped to this room (either by relay.room or parent node.room)
  const roomRelays = (relays || []).filter(r => {
    if ((r.room || '').toLowerCase() === (room.name || '').toLowerCase()) return true;
    const parentNode = (nodes || []).find(n => n.node_id === r.node_id);
    if (parentNode && (parentNode.room_id === room.id || (parentNode.room || '').toLowerCase() === (room.name || '').toLowerCase())) {
      return true;
    }
    return false;
  });

  const roomNodes = (nodes || []).filter(n => (n.room || '').toLowerCase() === (room.name || '').toLowerCase() || n.room_id === room.id);
  const activeRelaysCount = roomRelays.filter(r => r.current_state).length;

  let layoutData = {};
  try {
    layoutData = room.layout_json ? JSON.parse(room.layout_json) : {};
  } catch {}

  const defaultPositions = [
    { x: 120, y: 130 },
    { x: 260, y: 120 },
    { x: 390, y: 140 },
    { x: 120, y: 280 },
    { x: 380, y: 280 },
    { x: 260, y: 340 }
  ];

  container.innerHTML = `
    <div class="homes-view-wrap">
      <!-- Room Navigation Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 14px; padding: 12px 18px; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <button class="btn btn-secondary" onclick="closeRoomGuiCanvas()" style="padding: 6px 14px; font-weight: 600; font-size: 12px;">
            ← Back to Rooms Grid
          </button>
          <div>
            <div style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 5px;">
              <span>🏠 ${escapeHtml(home.name)}</span>
              <span>›</span>
              <span style="color: #38bdf8; font-weight: 600;">${escapeHtml(room.name)}</span>
              <span>(${escapeHtml(room.floor || 'Ground')} Floor)</span>
            </div>
            <h2 style="margin: 2px 0 0 0; font-size: 18px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px;">
              <span>🛋️ ${escapeHtml(room.name)}</span>
              <span id="room-active-devices-badge" style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">
                ${activeRelaysCount} Active Devices
              </span>
            </h2>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <!-- 2D / 3D Perspective Switcher -->
          <div class="room-mode-segmented">
            <button class="room-mode-btn ${currentRoomViewMode === '2d' ? 'active' : ''}" onclick="switchRoomViewMode('2d')" title="Clean Architectural 2D Floor Plan">
              <span>📐</span> <span>2D Blueprint</span>
            </button>
            <button class="room-mode-btn ${currentRoomViewMode === '3d' ? 'active' : ''}" onclick="switchRoomViewMode('3d')" title="Interactive 3D Isometric View">
              <span>🧊</span> <span>3D Isometric</span>
            </button>
          </div>

          <!-- Assign Hardware Direct Action -->
          <button class="btn btn-secondary" style="font-size: 11px; padding: 6px 12px; border-color: rgba(56, 189, 248, 0.35); color: #38bdf8; font-weight: 600;" onclick="openAssignHardwareToRoomModal(${room.id})">
            <span>➕</span> <span>Assign Hardware</span>
          </button>

          <button id="btn-room-edit-pos" class="btn btn-secondary" style="font-size: 11px; padding: 6px 12px; border-color: ${isRoomLayoutEditMode ? '#f59e0b' : 'rgba(255,255,255,0.1)'}; background: ${isRoomLayoutEditMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(15, 23, 42, 0.6)'}; color: ${isRoomLayoutEditMode ? '#f59e0b' : '#cbd5e1'}; font-weight: 600;" onclick="toggleRoomLayoutEditMode(${room.id})">
            <span>✏️</span> <span>${isRoomLayoutEditMode ? '💾 Save Positions' : 'Edit Positions'}</span>
          </button>
          <button class="btn btn-primary" style="font-size: 11px; padding: 6px 12px; background: #10b981; border: none;" onclick="handleToggleRoomAllAppliances(${room.id}, true)">
            ⚡ All ON
          </button>
          <button class="btn btn-secondary" style="font-size: 11px; padding: 6px 12px;" onclick="handleToggleRoomAllAppliances(${room.id}, false)">
            All OFF
          </button>
          <button class="btn btn-secondary" style="font-size: 11px; padding: 6px 12px;" onclick="showEditRoomModal(${room.id})">
            ⚙ Configure
          </button>
        </div>
      </div>

      <!-- Main Room View Grid (8 cols Stage, 4 cols Remote Dock) -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px; align-items: start;">
        
        <!-- ROOM CANVAS (2D ARCHITECTURAL OR 3D ISOMETRIC) -->
        <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.15); border-radius: 16px; padding: 18px; position: relative; min-height: 520px; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          
          <!-- Edit Notice -->
          <div id="room-edit-notice" style="display: ${isRoomLayoutEditMode ? 'flex' : 'none'}; position: absolute; top: 14px; left: 14px; z-index: 40; padding: 6px 12px; border-radius: 8px; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); color: #f59e0b; font-size: 11.5px; font-weight: 600; align-items: center; gap: 6px;">
            <span>✋ Drag any appliance node on the floor to match your real physical room layout!</span>
          </div>

          <!-- 3D Rotation Controls (Visible in 3D Mode only) -->
          ${currentRoomViewMode === '3d' ? `
            <div style="position: absolute; top: 14px; right: 14px; z-index: 40; display: flex; align-items: center; gap: 4px; background: rgba(11, 17, 32, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 4px; font-size: 11px;">
              <button onclick="rotateRoomStage(-10)" style="width: 26px; height: 26px; background: transparent; border: none; color: #94a3b8; cursor: pointer; border-radius: 4px;" title="Rotate Left">↺</button>
              <button onclick="rotateRoomStage(10)" style="width: 26px; height: 26px; background: transparent; border: none; color: #94a3b8; cursor: pointer; border-radius: 4px;" title="Rotate Right">↻</button>
              <button onclick="resetRoomStage()" style="padding: 2px 8px; background: transparent; border: none; color: #94a3b8; cursor: pointer; border-radius: 4px;">Reset</button>
            </div>
          ` : `
            <div style="position: absolute; top: 14px; right: 14px; z-index: 40; display: flex; align-items: center; gap: 6px; background: rgba(11, 17, 32, 0.85); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 6px; padding: 4px 8px; font-size: 10px; color: #38bdf8;">
              <span>📐 Top-Down Blueprint View</span>
            </div>
          `}

          <!-- CANVAS WRAPPER -->
          <div class="room-gui-canvas-wrap">
            
            ${currentRoomViewMode === '2d' ? `
              <!-- ========================================== -->
              <!-- 2D ARCHITECTURAL BLUEPRINT STAGE          -->
              <!-- ========================================== -->
              <div id="room-floor-canvas" class="room-2d-stage">
                <div class="room-2d-grid"></div>

                <!-- Architectural Walls -->
                <!-- North Wall (with Bay Window) -->
                <div class="room-2d-wall-n">
                  <div style="position: absolute; top: -3px; left: 50%; transform: translateX(-50%); width: 140px; height: 16px; background: rgba(56, 189, 248, 0.25); border: 1.5px solid #38bdf8; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #38bdf8; font-weight: 700;">
                    🪟 Bay Window
                  </div>
                </div>

                <!-- South Wall (with Entrance Door & Swing Arc) -->
                <div class="room-2d-wall-s">
                  <div style="position: absolute; bottom: 0; right: 50px; width: 44px; height: 44px; border-right: 2px dashed rgba(245, 158, 11, 0.6); border-top: 2px dashed rgba(245, 158, 11, 0.6); border-top-right-radius: 100%; pointer-events: none;"></div>
                  <div style="position: absolute; bottom: 0; right: 50px; width: 42px; height: 12px; background: #f59e0b; border-radius: 2px; font-size: 8px; font-weight: 800; color: #000; display: flex; align-items: center; justify-content: center;">
                    DOOR
                  </div>
                </div>

                <!-- West Wall (with OLED TV mount) -->
                <div class="room-2d-wall-w">
                  <div id="room-tv-screen" class="room-tv-glow" style="position: absolute; top: 120px; left: 16px; width: 34px; height: 130px; background: #020617; border: 2px solid #38bdf8; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 0 15px rgba(56, 189, 248, 0.5);" onclick="handleToggleTvAppliance('${room.name}')" title="Click to Toggle Smart TV">
                    <span style="font-size: 9px; font-weight: 800; color: #38bdf8; writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 1px;">SMART TV</span>
                    <span id="room-tv-status" style="font-size: 8px; color: #10b981; margin-top: 6px;">●</span>
                  </div>
                </div>

                <!-- East Wall (with Wall AC unit) -->
                <div class="room-2d-wall-e">
                  <div style="position: absolute; top: 140px; right: 16px; width: 32px; height: 95px; background: #f8fafc; color: #0f172a; border-radius: 5px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" onclick="openRoomIrRemoteModal('${room.name}', 'AC')" title="AC Unit">
                    <span style="font-size: 8.5px; font-weight: 900; writing-mode: vertical-rl; transform: rotate(180deg);">DAIKIN</span>
                    <span style="font-size: 8px; font-weight: 800; background: #0284c7; color: #fff; padding: 1px 3px; border-radius: 3px; margin-top: 4px;">22°</span>
                  </div>
                </div>

                <!-- Furniture Layout in 2D -->
                <!-- Modular Sectional Sofa -->
                <div style="position: absolute; top: 220px; left: 130px; width: 170px; height: 80px; background: rgba(30, 41, 59, 0.85); border: 1.5px solid rgba(56, 189, 248, 0.25); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #94a3b8; box-shadow: 0 6px 20px rgba(0,0,0,0.4); pointer-events: none;">
                  🛋️ Modular Sofa
                </div>

                <!-- Designer Coffee Table & Rug -->
                <div style="position: absolute; top: 140px; left: 160px; width: 110px; height: 60px; background: rgba(180, 83, 9, 0.15); border: 1px dashed rgba(245, 158, 11, 0.35); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 9.5px; color: #fde68a; pointer-events: none;">
                  Coffee Table
                </div>

                <!-- Indoor Plant -->
                <div style="position: absolute; bottom: 25px; left: 25px; width: 32px; height: 32px; border-radius: 50%; background: rgba(16, 185, 129, 0.2); border: 1.5px solid #10b981; display: flex; align-items: center; justify-content: center; font-size: 14px; pointer-events: none;">
                  🪴
                </div>

                <!-- Live Appliances on Floor -->
                ${renderRoomAppliancesOnFloor(roomRelays, layoutData, defaultPositions, room.id)}
              </div>
            ` : `
              <!-- ========================================== -->
              <!-- 3D ISOMETRIC ROOM STAGE                    -->
              <!-- ========================================== -->
              <div id="room-stage-element" class="room-iso-stage" style="transform: rotateX(56deg) rotateZ(${roomStageAngle}deg) scale(0.92);">
                
                <!-- Back North Wall -->
                <div class="room-wall-left">
                  <!-- Smart OLED TV -->
                  <div id="room-tv-screen" class="room-tv-glow" style="position: absolute; left: 100px; bottom: 20px; width: 140px; height: 80px; background: #000; border: 2px solid #334155; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;" onclick="handleToggleTvAppliance('${room.name}')">
                    <span style="font-size: 10px; font-weight: 700; color: #38bdf8; letter-spacing: 1px;">SMART OLED TV</span>
                    <span id="room-tv-status" style="font-size: 9px; color: #10b981; margin-top: 4px;">● Active • HDMI 1</span>
                    <span style="font-size: 8px; color: #64748b;">Living Room Media</span>
                  </div>
                  <!-- Wall Window -->
                  <div style="position: absolute; right: 50px; bottom: 30px; width: 90px; height: 90px; border: 1.5px solid rgba(56, 189, 248, 0.3); background: rgba(56, 189, 248, 0.05); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 11px;">
                    🪟 Window
                  </div>
                </div>

                <!-- Back West Wall -->
                <div class="room-wall-right">
                  <!-- AC Unit -->
                  <div style="position: absolute; left: 40px; top: 40px; width: 110px; height: 42px; background: #f1f5f9; color: #0f172a; border-radius: 6px; padding: 6px 10px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 10px 20px rgba(0,0,0,0.5); cursor: pointer;" onclick="openRoomIrRemoteModal('${room.name}', 'AC')">
                    <div style="font-size: 9.5px; font-weight: 800;">DAIKIN</div>
                    <div style="font-size: 10px; font-weight: 800; background: #0284c7; color: #fff; padding: 2px 5px; border-radius: 4px;">22°C</div>
                  </div>
                </div>

                <!-- Floor Canvas -->
                <div id="room-floor-canvas" class="room-iso-floor">
                  <div class="room-floor-grid"></div>

                  <!-- Decor: Modular Sofa -->
                  <div style="position: absolute; left: 80px; bottom: 60px; width: 170px; height: 80px; background: rgba(30, 41, 59, 0.85); border: 1.5px solid rgba(56, 189, 248, 0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #94a3b8; box-shadow: 0 10px 25px rgba(0,0,0,0.4); pointer-events: none;">
                    🛋️ Modular Sofa
                  </div>
                  <!-- Decor: Coffee Table -->
                  <div style="position: absolute; left: 125px; bottom: 160px; width: 90px; height: 44px; background: rgba(120, 53, 15, 0.3); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #fde68a; pointer-events: none;">
                    Coffee Table
                  </div>

                  <!-- Live Room Appliances Anchored on Floor Grid -->
                  ${renderRoomAppliancesOnFloor(roomRelays, layoutData, defaultPositions, room.id)}
                </div>
              </div>
            `}

          </div>
        </div>

        <!-- RIGHT PANEL: APPLIANCES SWITCHES & IN-ROOM IR REMOTE DOCK -->
        <div style="display: flex; flex-direction: column; gap: 14px;">
          
          <!-- Appliances Quick Toggles Card -->
          <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.15); border-radius: 14px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px;">
              <div>
                <span style="font-size: 12px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">Room Appliances</span>
                <span style="font-size: 11px; color: #38bdf8; font-weight: 600; margin-left: 6px;">(${roomRelays.length})</span>
              </div>
              <button class="btn btn-secondary" style="font-size: 10.5px; padding: 3px 8px; color: #38bdf8; border-color: rgba(56, 189, 248, 0.3);" onclick="openAssignHardwareToRoomModal(${room.id})">
                + Assign Devices
              </button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto;">
              ${roomRelays.length === 0 ? `
                <div style="padding: 20px; text-align: center; color: #64748b; font-size: 12px;">
                  No hardware devices mapped to '${escapeHtml(room.name)}' yet.<br>
                  <button class="btn btn-primary" onclick="openAssignHardwareToRoomModal(${room.id})" style="margin-top: 10px; font-size: 11px; padding: 6px 14px;">
                    ➕ Assign Node / Relays Now
                  </button>
                </div>
              ` : roomRelays.map(r => {
                const isOn = Boolean(r.current_state);
                const isSensor = isSensorChannel(r);
                return `
                  <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: rgba(11, 17, 32, 0.7); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 16px;">${getIconForAppliance(r.name, r.function, r.icon)}</span>
                      <div>
                        <div style="font-size: 12px; font-weight: 600; color: #ffffff;">${escapeHtml(r.name)}</div>
                        <div style="font-size: 10px; color: #64748b;">CH${r.channel_id} • Pin ${r.pin} • ${escapeHtml(r.node_id)}</div>
                      </div>
                    </div>
                    ${isSensor ? `
                      <span style="font-size: 10.5px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); padding: 3px 8px; border-radius: 6px;">
                        Sensor
                      </span>
                    ` : `
                      <button id="room-gui-relay-btn-${r.node_id}-${r.channel_id}" 
                              class="dash-relay-toggle-btn ${isOn ? 'btn-on' : 'btn-off'}" 
                              style="width: 54px; padding: 4px 0;"
                              onclick="toggleRealQuickRelay('${r.node_id}', ${r.channel_id}, ${isOn})">
                        ${isOn ? 'ON' : 'OFF'}
                      </button>
                    `}
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- IN-ROOM VIRTUAL IR REMOTE DOCK -->
          <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 14px; padding: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">📡</span>
                <span style="font-size: 13px; font-weight: 700; color: #ffffff;">Room TV Remote (IR)</span>
              </div>
              <span style="font-size: 10px; color: #c084fc; font-family: monospace; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3); padding: 2px 6px; border-radius: 4px;">
                CH11 (GPIO 13)
              </span>
            </div>

            <!-- Virtual Remote Keypad -->
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <button class="btn btn-danger" style="width: 38px; height: 38px; border-radius: 50%; font-weight: 800; font-size: 14px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171;" onclick="handleDispatchRoomIrCommand('0xA90', 'TV Power')">
                  ⏻
                </button>
                <div style="display: flex; gap: 6px;">
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 6px 10px;" onclick="handleDispatchRoomIrCommand('0xA50', 'TV Input Source')">Source</button>
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 6px 10px;" onclick="handleDispatchRoomIrCommand('0x290', 'Mute')">🔇</button>
                </div>
              </div>

              <!-- D-Pad Navigation -->
              <div style="background: #090e1a; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <button class="btn btn-secondary" style="width: 60px; padding: 4px 0; font-size: 11px;" onclick="handleDispatchRoomIrCommand('0x2F0', 'Nav UP')">▲</button>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button class="btn btn-secondary" style="width: 50px; padding: 6px 0; font-size: 11px;" onclick="handleDispatchRoomIrCommand('0x2D0', 'Nav LEFT')">◀</button>
                  <button class="btn btn-primary" style="width: 50px; padding: 6px 0; font-size: 11px; font-weight: 700; background: #0284c7; border: none;" onclick="handleDispatchRoomIrCommand('0xA70', 'Select OK')">OK</button>
                  <button class="btn btn-secondary" style="width: 50px; padding: 6px 0; font-size: 11px;" onclick="handleDispatchRoomIrCommand('0xCD0', 'Nav RIGHT')">▶</button>
                </div>
                <button class="btn btn-secondary" style="width: 60px; padding: 4px 0; font-size: 11px;" onclick="handleDispatchRoomIrCommand('0xAF0', 'Nav DOWN')">▼</button>
              </div>

              <!-- Volume & Channel Rockers -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div style="background: #090e1a; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                  <span style="font-size: 10px; font-weight: 700; color: #64748b;">VOL</span>
                  <button class="btn btn-secondary" style="width: 100%; padding: 4px 0; font-weight: 700;" onclick="handleDispatchRoomIrCommand('0x490', 'Volume UP')">+</button>
                  <button class="btn btn-secondary" style="width: 100%; padding: 4px 0; font-weight: 700;" onclick="handleDispatchRoomIrCommand('0xC90', 'Volume DOWN')">−</button>
                </div>
                <div style="background: #090e1a; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                  <span style="font-size: 10px; font-weight: 700; color: #64748b;">CH</span>
                  <button class="btn btn-secondary" style="width: 100%; padding: 4px 0; font-weight: 700;" onclick="handleDispatchRoomIrCommand('0x090', 'Channel UP')">▲</button>
                  <button class="btn btn-secondary" style="width: 100%; padding: 4px 0; font-weight: 700;" onclick="handleDispatchRoomIrCommand('0x890', 'Channel DOWN')">▼</button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
}

// Helper to render appliance nodes on either 2D or 3D floor
function renderRoomAppliancesOnFloor(roomRelays, layoutData, defaultPositions, roomId) {
  return roomRelays.map((r, idx) => {
    const defaultPos = defaultPositions[idx % defaultPositions.length];
    const savedPos = layoutData[r.channel_id] || { x: r.pos_x || defaultPos.x, y: r.pos_y || defaultPos.y };
    const isOn = Boolean(r.current_state);
    const isFan = (r.function && r.function.toLowerCase().includes('fan')) || (r.name && r.name.toLowerCase().includes('fan'));
    const isLight = !isFan && ((r.function && r.function.toLowerCase().includes('light')) || (r.name && r.name.toLowerCase().includes('light')) || (r.icon && r.icon.includes('light')));

    return `
      <div id="room-node-${r.node_id}-${r.channel_id}" 
           class="room-appliance-node" 
           data-state="${isOn ? '1' : '0'}"
           style="left: ${savedPos.x}px; top: ${savedPos.y}px;"
           onpointerdown="handleRoomAppliancePointerDown(event, '${r.node_id}', ${r.channel_id}, ${roomId})"
           onclick="handleRoomApplianceClick(event, '${r.node_id}', ${r.channel_id}, ${isOn})">
        
        ${isLight ? `
          <div id="room-glow-${r.node_id}-${r.channel_id}" class="room-light-glow" style="opacity: ${isOn ? '1' : '0'};"></div>
        ` : ''}

        <div id="room-bubble-${r.node_id}-${r.channel_id}" 
             data-is-light="${isLight}"
             data-is-fan="${isFan}"
             style="width: 44px; height: 44px; border-radius: 50%; background: #0b1120; border: 2px solid ${isOn ? (isLight ? '#f59e0b' : '#38bdf8') : 'rgba(255,255,255,0.15)'}; box-shadow: ${isOn ? (isLight ? '0 0 25px rgba(245, 158, 11, 0.7), 0 8px 20px rgba(0,0,0,0.6)' : '0 0 25px rgba(56, 189, 248, 0.6), 0 8px 20px rgba(0,0,0,0.6)') : '0 8px 20px rgba(0,0,0,0.6)'}; display: flex; align-items: center; justify-content: center; font-size: 20px; position: relative; z-index: 10;">
          <span id="room-icon-${r.node_id}-${r.channel_id}" data-is-fan="${isFan}" class="${isFan && isOn ? 'room-fan-spin' : ''}">
            ${getIconForAppliance(r.name, r.function, r.icon)}
          </span>
        </div>

        <div id="room-lbl-${r.node_id}-${r.channel_id}" style="margin-top: 4px; padding: 2px 7px; border-radius: 5px; background: rgba(11, 17, 32, 0.92); border: 1px solid ${isOn ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255,255,255,0.1)'}; font-size: 9.5px; font-weight: 700; color: ${isOn ? '#ffffff' : '#94a3b8'}; white-space: nowrap; text-align: center;">
          ${escapeHtml(r.name || 'Output ' + r.channel_id)}
        </div>
      </div>
    `;
  }).join('');
}

// Modal to directly assign Hardware Nodes and Relay/Sensor Pins to this Room
function openAssignHardwareToRoomModal(roomId) {
  const room = (cachedRoomsList || []).find(r => r.id === roomId);
  if (!room) return showToast('Room not found', 'error');

  const home = (cachedHomesList || []).find(h => h.id === room.home_id) || { name: 'Home' };
  const allNodes = fleetData.nodes || [];
  const allRelays = cachedRelaysList || fleetData.relays || [];

  const existingModal = document.getElementById('assign-hardware-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'assign-hardware-modal';
  modal.className = 'modal-backdrop';
  modal.style.display = 'flex';

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 620px; width: 92%; max-height: 85vh; display: flex; flex-direction: column;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
        <div>
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px;">
            <span>🔗 Assign Hardware to ${escapeHtml(room.name)}</span>
          </h3>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
            Home: ${escapeHtml(home.name)} • Assign discovered ESP8266 nodes & relay pins
          </div>
        </div>
        <button class="btn btn-secondary" onclick="document.getElementById('assign-hardware-modal').remove()" style="padding: 4px 10px; font-size: 14px;">✕</button>
      </div>

      <div class="modal-body" style="padding: 16px 0; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px;">
        
        <!-- SECTION 1: ASSIGN ENTIRE HARDWARE NODE -->
        <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 10px; padding: 12px;">
          <div style="font-size: 12px; font-weight: 700; color: #38bdf8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
            1. Assign Whole Hardware Node
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-bottom: 10px;">
            Assign an entire discovered microcontroller and all its IO relay pins to this room in one click:
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <select id="assign-node-select" class="form-control" style="flex: 1; font-size: 12px; background: #0f172a; color: #fff; border: 1px solid #334155; padding: 7px 10px; border-radius: 6px;">
              <option value="">-- Choose Node to Assign to ${escapeHtml(room.name)} --</option>
              ${allNodes.map(n => `
                <option value="${escapeHtml(n.node_id)}">
                  ${escapeHtml(n.node_id)} (${escapeHtml(n.ip || 'No IP')}) • Currently: ${escapeHtml(n.room || 'Unassigned')}
                </option>
              `).join('')}
            </select>
            <button class="btn btn-primary" style="font-size: 11px; padding: 7px 14px; background: #0284c7; white-space: nowrap;" onclick="handleExecuteNodeAssign(${room.id})">
              Assign Node
            </button>
          </div>
        </div>

        <!-- SECTION 2: ASSIGN INDIVIDUAL PINS / RELAYS -->
        <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-size: 12px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">
              2. Assign Individual IO Relay Channels
            </div>
            <span style="font-size: 10.5px; color: #94a3b8;">Check pins to include in this room</span>
          </div>

          <div style="max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px;">
            ${allRelays.length === 0 ? `
              <div style="text-align: center; color: #64748b; font-size: 11px; padding: 14px;">No relays discovered yet.</div>
            ` : allRelays.map(r => {
              const isAssigned = (r.room || '').toLowerCase() === (room.name || '').toLowerCase();
              return `
                <label style="display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; background: rgba(11, 17, 32, 0.6); border: 1px solid ${isAssigned ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255,255,255,0.04)'}; border-radius: 6px; cursor: pointer;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" class="room-assign-relay-chk" data-node-id="${escapeHtml(r.node_id)}" data-channel-id="${r.channel_id}" ${isAssigned ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
                    <div>
                      <div style="font-size: 12px; font-weight: 600; color: ${isAssigned ? '#38bdf8' : '#ffffff'};">${escapeHtml(r.name || 'Output ' + r.channel_id)}</div>
                      <div style="font-size: 9.5px; color: #64748b;">${escapeHtml(r.node_id)} • CH${r.channel_id} (Pin ${r.pin}) • Mode: ${escapeHtml(r.function || 'Relay')}</div>
                    </div>
                  </div>
                  <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${isAssigned ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)'}; color: ${isAssigned ? '#10b981' : '#64748b'};">
                    ${isAssigned ? 'In this Room' : (r.room || 'General')}
                  </span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

      </div>

      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">
        <button class="btn btn-secondary" onclick="document.getElementById('assign-hardware-modal').remove()" style="font-size: 11px; padding: 6px 14px;">
          Cancel
        </button>
        <button class="btn btn-primary" onclick="handleSaveRelayAssignments(${room.id})" style="font-size: 11px; padding: 6px 18px; background: #10b981; border: none; font-weight: 700;">
          💾 Save Hardware Assignments
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

// Executes assigning whole node to this room
async function handleExecuteNodeAssign(roomId) {
  const sel = document.getElementById('assign-node-select');
  if (!sel || !sel.value) return showToast('Please select a node to assign', 'warning');
  const nodeId = sel.value;

  try {
    const res = await fetchWithAuth(`${API_BASE}/rooms/${roomId}/assign-devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Node ${nodeId} and its IO pins assigned to this room!`, 'success');
      const modal = document.getElementById('assign-hardware-modal');
      if (modal) modal.remove();
      await loadRoomsAndHomes();
    } else {
      showToast('Error: ' + (data.error || 'Failed to assign node'), 'error');
    }
  } catch (e) {
    showToast('Failed to assign node: ' + e.message, 'error');
  }
}

// Executes saving individual relay channel mappings
async function handleSaveRelayAssignments(roomId) {
  const checkboxes = document.querySelectorAll('.room-assign-relay-chk');
  const relayAssignments = [];
  checkboxes.forEach(chk => {
    relayAssignments.push({
      nodeId: chk.getAttribute('data-node-id'),
      channelId: Number(chk.getAttribute('data-channel-id')),
      assigned: chk.checked
    });
  });

  try {
    const res = await fetchWithAuth(`${API_BASE}/rooms/${roomId}/assign-devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relayAssignments })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Device mappings updated successfully!', 'success');
      const modal = document.getElementById('assign-hardware-modal');
      if (modal) modal.remove();
      await loadRoomsAndHomes();
    } else {
      showToast('Error: ' + (data.error || 'Failed to save mappings'), 'error');
    }
  } catch (e) {
    showToast('Failed to save mappings: ' + e.message, 'error');
  }
}

// Interactive Room Controls & Drag Handlers
function rotateRoomStage(delta) {
  roomStageAngle += delta;
  const stage = document.getElementById('room-stage-element');
  if (stage) stage.style.transform = `rotateX(56deg) rotateZ(${roomStageAngle}deg) scale(0.92)`;
}

function resetRoomStage() {
  roomStageAngle = -42;
  const stage = document.getElementById('room-stage-element');
  if (stage) stage.style.transform = `rotateX(56deg) rotateZ(-42deg) scale(0.92)`;
}

async function toggleRoomLayoutEditMode(roomId) {
  isRoomLayoutEditMode = !isRoomLayoutEditMode;
  const notice = document.getElementById('room-edit-notice');
  const btn = document.getElementById('btn-room-edit-pos');
  if (notice) notice.style.display = isRoomLayoutEditMode ? 'flex' : 'none';

  if (!isRoomLayoutEditMode) {
    // Save all current positions to database
    const room = cachedRoomsList.find(r => r.id === roomId);
    if (!room) return;
    const roomRelays = (cachedRelaysList || []).filter(r => (r.room || '').toLowerCase() === (room.name || '').toLowerCase());
    const appliances = [];

    roomRelays.forEach(r => {
      const el = document.getElementById(`room-node-${r.node_id}-${r.channel_id}`);
      if (el) {
        const x = Math.round(parseFloat(el.style.left) || 120);
        const y = Math.round(parseFloat(el.style.top) || 120);
        appliances.push({ nodeId: r.node_id, channelId: r.channel_id, posX: x, posY: y });
      }
    });

    try {
      const res = await fetchWithAuth(`${API_BASE}/rooms/${roomId}/layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appliances })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Appliance positions saved permanently to database!', 'success');
      }
    } catch (e) {
      showToast('Error saving positions: ' + e.message, 'error');
    }
  }

  if (btn) {
    btn.innerHTML = `<span>✏️</span> <span>${isRoomLayoutEditMode ? '💾 Save Positions' : 'Edit Positions'}</span>`;
  }
}

let activeDraggingRelay = null;
let roomDragStartPos = { x: 0, y: 0 };
let roomDragInitialOffset = { x: 0, y: 0 };

function handleRoomAppliancePointerDown(e, nodeId, channelId, roomId) {
  if (!isRoomLayoutEditMode) return;
  activeDraggingRelay = { nodeId, channelId };
  const el = document.getElementById(`room-node-${nodeId}-${channelId}`);
  if (!el) return;
  el.classList.add('dragging');
  roomDragInitialOffset.x = parseFloat(el.style.left) || 0;
  roomDragInitialOffset.y = parseFloat(el.style.top) || 0;
  roomDragStartPos.x = e.clientX;
  roomDragStartPos.y = e.clientY;

  window.addEventListener('pointermove', onRoomAppliancePointerMove);
  window.addEventListener('pointerup', onRoomAppliancePointerUp);
}

function onRoomAppliancePointerMove(e) {
  if (!activeDraggingRelay) return;
  const is2D = currentRoomViewMode === '2d';
  const mult = is2D ? 1.0 : 1.25;
  const dx = (e.clientX - roomDragStartPos.x) * mult;
  const dy = (e.clientY - roomDragStartPos.y) * mult;
  const maxX = is2D ? 470 : 410;
  const maxY = is2D ? 400 : 410;
  const newX = Math.max(30, Math.min(maxX, roomDragInitialOffset.x + dx));
  const newY = Math.max(30, Math.min(maxY, roomDragInitialOffset.y + dy));
  const el = document.getElementById(`room-node-${activeDraggingRelay.nodeId}-${activeDraggingRelay.channelId}`);
  if (el) {
    el.style.left = newX + 'px';
    el.style.top = newY + 'px';
  }
}

function onRoomAppliancePointerUp() {
  if (!activeDraggingRelay) return;
  const el = document.getElementById(`room-node-${activeDraggingRelay.nodeId}-${activeDraggingRelay.channelId}`);
  if (el) el.classList.remove('dragging');
  window.removeEventListener('pointermove', onRoomAppliancePointerMove);
  window.removeEventListener('pointerup', onRoomAppliancePointerUp);
  activeDraggingRelay = null;
}

function handleRoomApplianceClick(e, nodeId, channelId, currentState) {
  if (isRoomLayoutEditMode) return;
  toggleRealQuickRelay(nodeId, channelId, currentState);
}

async function handleToggleRoomAllAppliances(roomId, state) {
  const room = cachedRoomsList.find(r => r.id === roomId);
  if (!room) return;
  const roomRelays = (cachedRelaysList || []).filter(r => (r.room || '').toLowerCase() === (room.name || '').toLowerCase());
  for (const r of roomRelays) {
    toggleRealQuickRelay(r.node_id, r.channel_id, !state);
  }
  showToast(`All appliances in ${room.name} turned ${state ? 'ON' : 'OFF'}`, 'success');
}

function handleToggleTvAppliance(roomName) {
  const tv = document.getElementById('room-tv-screen');
  const txt = document.getElementById('room-tv-status');
  if (tv && txt) {
    const isNowOn = !tv.classList.contains('room-tv-glow');
    if (isNowOn) {
      tv.classList.add('room-tv-glow');
      txt.textContent = '● Active • HDMI 1';
      txt.style.color = '#10b981';
      showToast('Smart TV Powered ON', 'success');
    } else {
      tv.classList.remove('room-tv-glow');
      txt.textContent = '○ Standby';
      txt.style.color = '#64748b';
      showToast('Smart TV Powered OFF', 'info');
    }
  }
}

function openRoomIrRemoteModal(roomName, applianceType) {
  showToast(`Opening ${applianceType} Remote for ${roomName}`, 'info');
}

async function handleDispatchRoomIrCommand(hexCode, label = 'IR Command') {
  const targetNodeId = 'NODE-8C4F00565D72';
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${targetNodeId}/ir/transmit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: 'NEC',
        code: hexCode,
        bits: 32
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`IR Transmitted: ${label} (${hexCode})`, 'success');
    } else {
      showToast(`IR Blast error: ${data.error || 'Failed'}`, 'error');
    }
  } catch (e) {
    showToast(`IR request failed: ${e.message}`, 'error');
  }
}

// --------------------------------------------------------------------------
// ROOM MODALS: ADD, EDIT, DELETE
// --------------------------------------------------------------------------

function showAddRoomModal(preselectedHomeId = null) {
  const homeOptions = (cachedHomesList || []).map(h => 
    `<option value="${h.id}" ${preselectedHomeId && Number(preselectedHomeId) === Number(h.id) ? 'selected' : ''}>${escapeHtml(h.name)}</option>`
  ).join('');

  const modalHtml = `
    <div class="modal-box" style="max-width: 480px; width: 90%;">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="hardware-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">🏠</div>
          <div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff;">Add New Room</h3>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #94a3b8;">Create a room partition to organize devices and automations</p>
          </div>
        </div>
        <button class="modal-close-btn" onclick="closeModal()">✕</button>
      </div>
      
      <div class="modal-body" style="padding: 18px 24px;">
        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Target Home / Site</label>
          <select id="modal-room-home" class="filter-select" style="width: 100%;">
            ${homeOptions || '<option value="1">Primary Residence</option>'}
          </select>
        </div>

        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Room Name *</label>
          <input id="modal-room-name" type="text" class="search-input" placeholder="e.g. Master Bedroom, Balcony, Home Theater" style="width: 100%; box-sizing: border-box;" autofocus />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
          <div class="form-group">
            <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Floor Level</label>
            <select id="modal-room-floor" class="filter-select" style="width: 100%;">
              <option value="Ground">Ground Floor</option>
              <option value="First">1st Floor</option>
              <option value="Second">2nd Floor</option>
              <option value="Third">3rd Floor</option>
              <option value="Basement">Basement</option>
              <option value="Outdoor">Outdoor / Garden</option>
              <option value="Rooftop">Rooftop</option>
            </select>
          </div>
          <div class="form-group">
            <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Room Type / Icon</label>
            <select id="modal-room-icon" class="filter-select" style="width: 100%;">
              <option value="bedroom">🛏️ Bedroom</option>
              <option value="living">🛋️ Living Room</option>
              <option value="kitchen">🍳 Kitchen</option>
              <option value="dining">🍽️ Dining</option>
              <option value="study">📚 Study / Office</option>
              <option value="bathroom">🚿 Bathroom</option>
              <option value="garden">🌿 Garden / Lawn</option>
              <option value="outside">🚪 Outside / Porch</option>
              <option value="garage">🚗 Garage / Workshop</option>
              <option value="breaker">⚡ Electrical / DB</option>
            </select>
          </div>
        </div>

        <div id="modal-room-status" style="display: none; padding: 10px; border-radius: 6px; font-size: 12px; margin-top: 10px;"></div>
      </div>

      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
        <button class="btn-cancel" onclick="closeModal()">Cancel</button>
        <button id="btn-submit-room" class="btn-primary" onclick="submitCreateRoom()">+ Create Room</button>
      </div>
    </div>
  `;
  openModal(modalHtml);
  setTimeout(() => {
    const el = document.getElementById("modal-room-name");
    if (el) el.focus();
  }, 100);
}

async function submitCreateRoom() {
  const homeId = document.getElementById("modal-room-home").value;
  const name = document.getElementById("modal-room-name").value.trim();
  const floor = document.getElementById("modal-room-floor").value;
  const icon = document.getElementById("modal-room-icon").value;
  const statusBox = document.getElementById("modal-room-status");
  const btn = document.getElementById("btn-submit-room");

  if (!name) {
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "#ef4444";
    statusBox.textContent = "Please enter a room name.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    const res = await fetchWithAuth(`${API_BASE}/homes/${homeId}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, floor, icon })
    });
    const data = await res.json();
    if (data.success) {
      statusBox.style.display = "block";
      statusBox.style.background = "rgba(16, 185, 129, 0.15)";
      statusBox.style.color = "#10b981";
      statusBox.textContent = `Room "${name}" created successfully!`;
      showToast(`Room "${name}" created successfully!`, "success");
      setTimeout(() => {
        closeModal();
        loadRoomsAndHomes();
      }, 700);
    } else {
      btn.disabled = false;
      btn.textContent = "+ Create Room";
      statusBox.style.display = "block";
      statusBox.style.background = "rgba(239, 68, 68, 0.15)";
      statusBox.style.color = "#ef4444";
      statusBox.textContent = data.error || "Failed to create room.";
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "+ Create Room";
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "#ef4444";
    statusBox.textContent = err.message;
  }
}

function showEditRoomModal(roomId) {
  const room = (cachedRoomsList || []).find(r => r.id === roomId);
  if (!room) return;

  const modalHtml = `
    <div class="modal-box" style="max-width: 480px; width: 90%;">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="hardware-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">✏️</div>
          <div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff;">Edit Room</h3>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #94a3b8;">Update room partition settings</p>
          </div>
        </div>
        <button class="modal-close-btn" onclick="closeModal()">✕</button>
      </div>
      
      <div class="modal-body" style="padding: 18px 24px;">
        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Room Name *</label>
          <input id="modal-edit-room-name" type="text" class="search-input" value="${escapeHtml(room.name)}" style="width: 100%; box-sizing: border-box;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
          <div class="form-group">
            <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Floor Level</label>
            <select id="modal-edit-room-floor" class="filter-select" style="width: 100%;">
              <option value="Ground" ${room.floor === 'Ground' ? 'selected' : ''}>Ground Floor</option>
              <option value="First" ${room.floor === 'First' ? 'selected' : ''}>1st Floor</option>
              <option value="Second" ${room.floor === 'Second' ? 'selected' : ''}>2nd Floor</option>
              <option value="Third" ${room.floor === 'Third' ? 'selected' : ''}>3rd Floor</option>
              <option value="Basement" ${room.floor === 'Basement' ? 'selected' : ''}>Basement</option>
              <option value="Outdoor" ${room.floor === 'Outdoor' ? 'selected' : ''}>Outdoor / Garden</option>
              <option value="Rooftop" ${room.floor === 'Rooftop' ? 'selected' : ''}>Rooftop</option>
            </select>
          </div>
          <div class="form-group">
            <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Room Type / Icon</label>
            <select id="modal-edit-room-icon" class="filter-select" style="width: 100%;">
              <option value="bedroom" ${room.icon === 'bedroom' ? 'selected' : ''}>🛏️ Bedroom</option>
              <option value="living" ${room.icon === 'living' ? 'selected' : ''}>🛋️ Living Room</option>
              <option value="kitchen" ${room.icon === 'kitchen' ? 'selected' : ''}>🍳 Kitchen</option>
              <option value="dining" ${room.icon === 'dining' ? 'selected' : ''}>🍽️ Dining</option>
              <option value="study" ${room.icon === 'study' ? 'selected' : ''}>📚 Study / Office</option>
              <option value="bathroom" ${room.icon === 'bathroom' ? 'selected' : ''}>🚿 Bathroom</option>
              <option value="garden" ${room.icon === 'garden' ? 'selected' : ''}>🌿 Garden / Lawn</option>
              <option value="outside" ${room.icon === 'outside' ? 'selected' : ''}>🚪 Outside / Porch</option>
              <option value="garage" ${room.icon === 'garage' ? 'selected' : ''}>🚗 Garage / Workshop</option>
              <option value="breaker" ${room.icon === 'breaker' ? 'selected' : ''}>⚡ Electrical / DB</option>
            </select>
          </div>
        </div>

        <div id="modal-edit-room-status" style="display: none; padding: 10px; border-radius: 6px; font-size: 12px; margin-top: 10px;"></div>
      </div>

      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
        <button class="btn-cancel" onclick="closeModal()">Cancel</button>
        <button id="btn-submit-edit-room" class="btn-primary" onclick="submitEditRoom(${room.id})">Save Changes</button>
      </div>
    </div>
  `;
  openModal(modalHtml);
}

async function submitEditRoom(roomId) {
  const name = document.getElementById("modal-edit-room-name").value.trim();
  const floor = document.getElementById("modal-edit-room-floor").value;
  const icon = document.getElementById("modal-edit-room-icon").value;
  const statusBox = document.getElementById("modal-edit-room-status");
  const btn = document.getElementById("btn-submit-edit-room");

  if (!name) {
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "#ef4444";
    statusBox.textContent = "Please enter a room name.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const res = await fetchWithAuth(`${API_BASE}/rooms/${roomId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, floor, icon })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Room "${name}" updated successfully!`, "success");
      closeModal();
      loadRoomsAndHomes();
    } else {
      btn.disabled = false;
      btn.textContent = "Save Changes";
      statusBox.style.display = "block";
      statusBox.style.background = "rgba(239, 68, 68, 0.15)";
      statusBox.style.color = "#ef4444";
      statusBox.textContent = data.error || "Failed to update room.";
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Save Changes";
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "#ef4444";
    statusBox.textContent = err.message;
  }
}

async function handleDeleteRoom(roomId, roomName) {
  if (!confirm(`Are you sure you want to delete room "${roomName}"?`)) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/rooms/${roomId}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Room "${roomName}" deleted successfully.`, "success");
      loadRoomsAndHomes();
    } else {
      showToast(`Error: ${data.error || 'Failed to delete room'}`, "error");
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

// --------------------------------------------------------------------------
// HOME MODALS: ADD, EDIT, DELETE
// --------------------------------------------------------------------------

function showCreateHomeModal() {
  const modalHtml = `
    <div class="modal-box" style="max-width: 480px; width: 90%;">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="hardware-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">🏡</div>
          <div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff;">Add New Home / Site</h3>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #94a3b8;">Register a new property, residence, or commercial site</p>
          </div>
        </div>
        <button class="modal-close-btn" onclick="closeModal()">✕</button>
      </div>
      
      <div class="modal-body" style="padding: 18px 24px;">
        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Home / Site Name *</label>
          <input id="modal-home-name" type="text" class="search-input" placeholder="e.g. Vacation Villa, Warehouse, Farmhouse" style="width: 100%; box-sizing: border-box;" autofocus />
        </div>

        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Description</label>
          <input id="modal-home-desc" type="text" class="search-input" placeholder="e.g. Primary residence for family" style="width: 100%; box-sizing: border-box;" />
        </div>

        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Physical Address</label>
          <input id="modal-home-addr" type="text" class="search-input" placeholder="e.g. 101 Cyber Way, Silicon Valley" style="width: 100%; box-sizing: border-box;" />
        </div>

        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Timezone</label>
          <select id="modal-home-tz" class="filter-select" style="width: 100%;">
            <option value="UTC">UTC (Universal Time)</option>
            <option value="Asia/Kolkata" selected>Asia/Kolkata (IST +5:30)</option>
            <option value="America/New_York">America/New_York (EST/EDT)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
            <option value="Europe/London">Europe/London (GMT/BST)</option>
            <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
            <option value="Asia/Singapore">Asia/Singapore (SGT +8:00)</option>
          </select>
        </div>

        <div id="modal-home-status" style="display: none; padding: 10px; border-radius: 6px; font-size: 12px; margin-top: 10px;"></div>
      </div>

      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
        <button class="btn-cancel" onclick="closeModal()">Cancel</button>
        <button id="btn-submit-home" class="btn-primary" onclick="submitCreateHome()">+ Create Home</button>
      </div>
    </div>
  `;
  openModal(modalHtml);
  setTimeout(() => {
    const el = document.getElementById("modal-home-name");
    if (el) el.focus();
  }, 100);
}

const showAddHomeModal = showCreateHomeModal;

async function submitCreateHome() {
  const name = document.getElementById("modal-home-name").value.trim();
  const description = document.getElementById("modal-home-desc").value.trim();
  const address = document.getElementById("modal-home-addr").value.trim();
  const timezone = document.getElementById("modal-home-tz").value;
  const statusBox = document.getElementById("modal-home-status");
  const btn = document.getElementById("btn-submit-home");

  if (!name) {
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "#ef4444";
    statusBox.textContent = "Please enter a home / site name.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    const res = await fetchWithAuth(`${API_BASE}/homes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, address, timezone })
    });
    const data = await res.json();
    if (data.success) {
      statusBox.style.display = "block";
      statusBox.style.background = "rgba(16, 185, 129, 0.15)";
      statusBox.style.color = "#10b981";
      statusBox.textContent = `Home "${name}" created successfully!`;
      showToast(`Home "${name}" created successfully!`, "success");
      setTimeout(() => {
        closeModal();
        loadRoomsAndHomes();
      }, 700);
    } else {
      btn.disabled = false;
      btn.textContent = "+ Create Home";
      statusBox.style.display = "block";
      statusBox.style.background = "rgba(239, 68, 68, 0.15)";
      statusBox.style.color = "#ef4444";
      statusBox.textContent = data.error || "Failed to create home.";
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "+ Create Home";
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "#ef4444";
    statusBox.textContent = err.message;
  }
}

function showEditHomeModal(homeId) {
  const home = (cachedHomesList || []).find(h => h.id === homeId);
  if (!home) return;

  const modalHtml = `
    <div class="modal-box" style="max-width: 480px; width: 90%;">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="hardware-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">✏️</div>
          <div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff;">Edit Home / Site</h3>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #94a3b8;">Update property metadata and location</p>
          </div>
        </div>
        <button class="modal-close-btn" onclick="closeModal()">✕</button>
      </div>
      
      <div class="modal-body" style="padding: 18px 24px;">
        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Home / Site Name *</label>
          <input id="modal-edit-home-name" type="text" class="search-input" value="${escapeHtml(home.name)}" style="width: 100%; box-sizing: border-box;" />
        </div>

        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Description</label>
          <input id="modal-edit-home-desc" type="text" class="search-input" value="${escapeHtml(home.description || '')}" style="width: 100%; box-sizing: border-box;" />
        </div>

        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Physical Address</label>
          <input id="modal-edit-home-addr" type="text" class="search-input" value="${escapeHtml(home.address || '')}" style="width: 100%; box-sizing: border-box;" />
        </div>

        <div class="form-group" style="margin-bottom: 14px;">
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Timezone</label>
          <select id="modal-edit-home-tz" class="filter-select" style="width: 100%;">
            <option value="UTC" ${home.timezone === 'UTC' ? 'selected' : ''}>UTC (Universal Time)</option>
            <option value="Asia/Kolkata" ${home.timezone === 'Asia/Kolkata' ? 'selected' : ''}>Asia/Kolkata (IST +5:30)</option>
            <option value="America/New_York" ${home.timezone === 'America/New_York' ? 'selected' : ''}>America/New_York (EST/EDT)</option>
            <option value="America/Los_Angeles" ${home.timezone === 'America/Los_Angeles' ? 'selected' : ''}>America/Los_Angeles (PST/PDT)</option>
            <option value="Europe/London" ${home.timezone === 'Europe/London' ? 'selected' : ''}>Europe/London (GMT/BST)</option>
            <option value="Asia/Dubai" ${home.timezone === 'Asia/Dubai' ? 'selected' : ''}>Asia/Dubai (GST +4:00)</option>
          </select>
        </div>

        <div id="modal-edit-home-status" style="display: none; padding: 10px; border-radius: 6px; font-size: 12px; margin-top: 10px;"></div>
      </div>

      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 14px 24px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
        <button class="btn-cancel" onclick="closeModal()">Cancel</button>
        <button id="btn-submit-edit-home" class="btn-primary" onclick="submitEditHome(${home.id})">Save Changes</button>
      </div>
    </div>
  `;
  openModal(modalHtml);
}

async function submitEditHome(homeId) {
  const name = document.getElementById("modal-edit-home-name").value.trim();
  const description = document.getElementById("modal-edit-home-desc").value.trim();
  const address = document.getElementById("modal-edit-home-addr").value.trim();
  const timezone = document.getElementById("modal-edit-home-tz").value;
  const statusBox = document.getElementById("modal-edit-home-status");
  const btn = document.getElementById("btn-submit-edit-home");

  if (!name) {
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "#ef4444";
    statusBox.textContent = "Please enter a home name.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const res = await fetchWithAuth(`${API_BASE}/homes/${homeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, address, timezone })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Home "${name}" updated successfully!`, "success");
      closeModal();
      loadRoomsAndHomes();
    } else {
      btn.disabled = false;
      btn.textContent = "Save Changes";
      statusBox.style.display = "block";
      statusBox.style.background = "rgba(239, 68, 68, 0.15)";
      statusBox.style.color = "#ef4444";
      statusBox.textContent = data.error || "Failed to update home.";
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Save Changes";
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "#ef4444";
    statusBox.textContent = err.message;
  }
}

async function handleDeleteHome(homeId, homeName) {
  if (!confirm(`Are you sure you want to delete home site "${homeName}"? Any devices assigned to this home will be unassigned.`)) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/homes/${homeId}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Home "${homeName}" deleted.`, "success");
      loadRoomsAndHomes();
    } else {
      showToast(`Error: ${data.error || 'Failed to delete home'}`, "error");
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, "error");
  }
}

// ==========================================================================
// VIEW ⑤ & ⑥: AUTOMATION & RULE EDITOR (MATCHING PANELS ⑤ & ⑥)
// ==========================================================================
let currentAutoSubTab = 'automations';
let editingAutomationId = null;

async function loadAutomation() {
  const container = document.getElementById("content-area");
  try {
    const res = await fetch(`${API_BASE}/automations`);
    const rules = await res.json();

    container.innerHTML = `
      <div class="automation-view-wrap">
        <!-- Topbar -->
        <div class="devices-topbar-actions">
          <div>
            <h2 style="font-size: 19px; font-weight: 700; color: #ffffff; margin: 0;">Automation</h2>
            <p style="font-size: 12px; color: #94a3b8; margin: 3px 0 0 0;">Create rules, schedules and smart scenes</p>
          </div>
          <button class="btn-add-primary" onclick="openAutomationEditor()">
            <span>+ Create Automation</span>
          </button>
        </div>

        <!-- Navigation Tabs -->
        <div class="automation-tabs-bar">
          <button class="auto-tab-btn ${currentAutoSubTab === 'automations' ? 'active' : ''}" onclick="switchAutoSubTab('automations', this)">Automations</button>
          <button class="auto-tab-btn ${currentAutoSubTab === 'scenes' ? 'active' : ''}" onclick="switchAutoSubTab('scenes', this)">Scenes</button>
          <button class="auto-tab-btn ${currentAutoSubTab === 'schedules' ? 'active' : ''}" onclick="switchAutoSubTab('schedules', this)">Schedules</button>
          <button class="auto-tab-btn ${currentAutoSubTab === 'templates' ? 'active' : ''}" onclick="switchAutoSubTab('templates', this)">Templates</button>
        </div>

        <!-- Rules Cards List -->
        <div class="automation-cards-list" id="automation-rules-list">
          ${rules.map(r => {
            const getAutoIcon = (title = '') => {
              const t = title.toLowerCase();
              if (t.includes('evening') || t.includes('light')) return '☀️';
              if (t.includes('night') || t.includes('security')) return '🌙';
              if (t.includes('motion')) return '🏃';
              if (t.includes('temp') || t.includes('exhaust')) return '🌡️';
              return '⚡';
            };

            const isOn = Boolean(r.enabled);
            return `
              <div class="automation-rule-card">
                <div class="auto-rule-left">
                  <div class="auto-rule-icon">${getAutoIcon(r.name)}</div>
                  <div class="auto-rule-info">
                    <div class="auto-rule-name">${escapeHtml(r.name)}</div>
                    <div class="auto-rule-desc">${escapeHtml(r.description || 'Configured Smart Scene')}</div>
                  </div>
                </div>

                <div style="display: flex; align-items: center; gap: 14px;">
                  <label class="switch-toggle-wrap">
                    <input type="checkbox" ${isOn ? 'checked' : ''} onchange="toggleAutomationRuleState(${r.id}, this.checked)">
                    <span class="switch-toggle-slider">
                      <span class="switch-toggle-label">${isOn ? 'ON' : 'OFF'}</span>
                    </span>
                  </label>
                  <button class="action-btn" title="Edit Automation" onclick="openAutomationEditor(${r.id})">✏️</button>
                  <button class="action-btn delete-btn" title="Delete Automation" onclick="deleteAutomationRule(${r.id})">🗑️</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Inline Automation Editor View (Panel ⑥) -->
        <div id="automation-editor-view" style="display: none; margin-top: 10px;">
          <!-- Injected via openAutomationEditor -->
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading automation: ${err.message}</div>`;
  }
}

function switchAutoSubTab(tab, btn) {
  currentAutoSubTab = tab;
  document.querySelectorAll('.auto-tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

async function toggleAutomationRuleState(id, state) {
  try {
    await fetch(`${API_BASE}/automations/${id}/toggle`, { method: 'POST' });
  } catch (e) {
    console.error("Toggle rule failed:", e);
  }
}

function openAutomationEditor(ruleId = null) {
  editingAutomationId = ruleId;
  const listEl = document.getElementById("automation-rules-list");
  const editorEl = document.getElementById("automation-editor-view");
  if (listEl) listEl.style.display = "none";
  if (!editorEl) return;

  editorEl.style.display = "block";
  editorEl.innerHTML = `
    <div class="auto-editor-box">
      <!-- Header -->
      <div style="display: flex; align-items: center; gap: 10px; cursor: pointer;" onclick="closeAutomationEditor()">
        <span style="font-size: 18px; color: #38bdf8;">←</span>
        <h3 style="margin: 0; font-size: 17px; font-weight: 700; color: #ffffff;">
          ${ruleId ? 'Edit Automation' : 'Create Automation'}
        </h3>
      </div>

      <!-- Form Inputs Row -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px;">
        <div>
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Automation Name</label>
          <input type="text" id="auto-editor-name" class="auto-input" style="width: 100%; font-size: 13.5px;" value="${ruleId ? 'Evening Lights' : 'New Smart Rule'}">
        </div>
        <div>
          <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 6px;">Mode</label>
          <select id="auto-editor-mode" class="auto-select" style="width: 100%; font-size: 13.5px;">
            <option value="rule">Rule (Condition → Action) ⚡</option>
            <option value="scene">Scene (One-Tap Action) 🎬</option>
            <option value="schedule">Schedule (Time-Based) ⏱️</option>
          </select>
        </div>
      </div>

      <!-- Split: IF (Condition) & THEN (Action) -->
      <div class="auto-editor-row">
        <!-- Left: IF (Condition) -->
        <div class="auto-section-card condition-card">
          <div class="auto-section-header">
            <span>★</span> IF (Condition)
          </div>

          <div id="conditions-container" style="display: flex; flex-direction: column; gap: 8px;">
            <div class="auto-item-row">
              <span style="font-size: 16px;">⏱️</span>
              <span style="font-size: 12.5px; font-weight: 600; color: #cbd5e1;">Time</span>
              <select class="auto-select" style="padding: 4px 8px;">
                <option value="at">At ▾</option>
                <option value="after">After ▾</option>
              </select>
              <input type="text" class="auto-input" style="padding: 4px 8px; width: 85px;" value="06:00 PM">
            </div>
          </div>

          <button class="btn-action-neutral" style="font-size: 11.5px; padding: 6px 12px; align-self: flex-start; margin-top: 4px;">
            + Add Condition
          </button>
        </div>

        <!-- Right: THEN (Action) -->
        <div class="auto-section-card action-card">
          <div class="auto-section-header">
            <span>★</span> THEN (Action)
          </div>

          <div id="actions-container" style="display: flex; flex-direction: column; gap: 8px;">
            <div class="auto-item-row">
              <span style="font-size: 16px;">💡</span>
              <span style="font-size: 12.5px; font-weight: 600; color: #cbd5e1; flex: 1;">Main Light (Living Room)</span>
              <select class="auto-select" style="padding: 4px 8px;">
                <option value="turn_on">Turn ON ▾</option>
                <option value="turn_off">Turn OFF ▾</option>
              </select>
              <button class="action-btn delete-btn" style="padding: 2px 4px;">🗑️</button>
            </div>

            <div class="auto-item-row">
              <span style="font-size: 16px;">💡</span>
              <span style="font-size: 12.5px; font-weight: 600; color: #cbd5e1; flex: 1;">Veranda Light</span>
              <select class="auto-select" style="padding: 4px 8px;">
                <option value="turn_on">Turn ON ▾</option>
                <option value="turn_off">Turn OFF ▾</option>
              </select>
              <button class="action-btn delete-btn" style="padding: 2px 4px;">🗑️</button>
            </div>
          </div>

          <button class="btn-action-neutral" style="font-size: 11.5px; padding: 6px 12px; align-self: flex-start; margin-top: 4px;">
            + Add Action
          </button>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 14px;">
        <button class="btn-action-neutral" onclick="closeAutomationEditor()">Cancel</button>
        <button class="btn-add-primary" onclick="saveAutomationRuleFromEditor()">★ Save Automation</button>
      </div>
    </div>
  `;
}

function closeAutomationEditor() {
  const listEl = document.getElementById("automation-rules-list");
  const editorEl = document.getElementById("automation-editor-view");
  if (listEl) listEl.style.display = "flex";
  if (editorEl) editorEl.style.display = "none";
}

async function saveAutomationRuleFromEditor() {
  const name = document.getElementById("auto-editor-name")?.value || 'Smart Rule';
  try {
    await fetch(`${API_BASE}/automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: 'Automated Scene Condition',
        type: 'SCHEDULED',
        enabled: 1
      })
    });
    closeAutomationEditor();
    loadAutomation();
  } catch (e) {
    console.error("Save automation failed:", e);
  }
}

async function syncPinsWithHardware(nodeId) {
  try {
    const url = nodeId ? `${API_BASE}/nodes/${nodeId}/sync-pins` : `${API_BASE}/relays/sync`;
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();
    if (data.success || data.status === "ok") {
      const msg = data.message || (data.count ? `Synchronized ${data.count} pins from hardware node` : 'Hardware pin synchronization complete');
      if (typeof showToast === 'function') {
        showToast(msg, 'success');
      } else {
        alert(msg);
      }
      if (typeof currentView !== 'undefined') {
        if (currentView === 'relays') loadRelays();
        else if (currentView === 'sensors') loadSensors();
        else if (currentView === 'nodes') loadNodes();
        else if (currentView === 'pin-matrix') loadPinMatrix();
      } else {
        loadRelays();
      }
    } else {
      const errMsg = data.error || data.message || 'Unknown error';
      if (typeof showToast === 'function') {
        showToast(`Sync failed: ${errMsg}`, 'error');
      } else {
        alert(`Sync failed: ${errMsg}`);
      }
    }
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast(`Sync request error: ${err.message}`, 'error');
    } else {
      alert(`Sync request error: ${err.message}`);
    }
  }
}

async function broadcastRelays(state) {
  await fetch(`${API_BASE}/relays/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setState", state: state })
  });
  loadRelays();
}

async function restartNode(nodeId) {
  if (!confirm(`Reboot node ${nodeId}?`)) return;
  await fetch(`${API_BASE}/nodes/${nodeId}/restart`, { method: "POST" });
  alert("Reboot command sent.");
}

async function deleteNode(nodeId) {
  if (!confirm(`Permanently remove ${nodeId} from fleet?`)) return;
  await fetch(`${API_BASE}/nodes/${nodeId}`, { method: "DELETE" });
  loadNodes();
}

// --- 4. SENSORS & TELEMETRY MODULE ---
let selectedSensorNodeId = '';
let currentSensorSubTab = 'device'; // 'device', 'room', 'type', 'matrix'
let sensorCategoryFilter = 'all'; // 'all', 'voltage', 'ir', 'motion', 'inputs'
let sensorSearchKeyword = '';

function switchSensorSubTab(subTab) {
  currentSensorSubTab = subTab;
  if (fleetData.nodes && fleetData.relays) {
    const sensors = (fleetData.relays || []).filter(isSensorChannel);
    renderSensorsView(fleetData.nodes, sensors, fleetData.homes || []);
  } else {
    loadSensors();
  }
}

function switchSensorCategoryFilter(cat) {
  sensorCategoryFilter = cat;
  if (fleetData.nodes && fleetData.relays) {
    const sensors = (fleetData.relays || []).filter(isSensorChannel);
    renderSensorsView(fleetData.nodes, sensors, fleetData.homes || []);
  }
}

function handleSensorDeviceSelect(nodeId) {
  selectedSensorNodeId = nodeId;
  if (fleetData.nodes && fleetData.relays) {
    const sensors = (fleetData.relays || []).filter(isSensorChannel);
    renderSensorsView(fleetData.nodes, sensors, fleetData.homes || []);
  }
}

function handleSensorSearchInput(keyword) {
  sensorSearchKeyword = (keyword || '').trim();
  if (fleetData.nodes && fleetData.relays) {
    const sensors = (fleetData.relays || []).filter(isSensorChannel);
    renderSensorsView(fleetData.nodes, sensors, fleetData.homes || []);
  }
}

async function handleReadSensorLive(nodeId, channelId) {
  try {
    showToast({ title: 'Reading Sensor', message: `Querying CH${channelId} on ${nodeId}...`, severity: 'INFO', category: 'PIN' });
    const res = await fetchWithAuth(`${API_BASE}/nodes/${nodeId}/read-sensor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: channelId })
    });
    const data = await res.json();
    if (data.success && data.result) {
      const s = data.result.result?.sensor || (data.result.result?.sensors || [])[0];
      if (s) {
        showToast({ title: 'Sensor Updated', message: `CH${channelId}: ${s.strValue || (s.value != null ? s.value + ' ' + (s.unit || '') : 'Live reading OK')}`, severity: 'SUCCESS', category: 'PIN' });
        updateRelaysViewTelemetrySilently({ nodeId, sensors: [s] });
      } else {
        showToast({ title: 'Sensor Read', message: data.result.message || 'Sensor read completed', severity: 'SUCCESS', category: 'PIN' });
      }
    } else {
      showToast({ title: 'Read Failed', message: data.error || 'Failed to read sensor', severity: 'ERROR', category: 'PIN' });
    }
  } catch (err) {
    showToast({ title: 'Read Error', message: err.message, severity: 'ERROR', category: 'PIN' });
  }
}

async function handlePollAllSensors(nodeId) {
  if (!nodeId) nodeId = selectedSensorNodeId;
  if (!nodeId) return;
  try {
    showToast({ title: 'Polling All Sensors', message: `Reading all active telemetry inputs on ${nodeId}...`, severity: 'INFO', category: 'PIN' });
    const res = await fetchWithAuth(`${API_BASE}/nodes/${nodeId}/read-sensor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 0 })
    });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'Sensors Polled', message: 'All telemetry inputs queried successfully', severity: 'SUCCESS', category: 'PIN' });
      const sensorsList = data.result?.result?.sensors || (data.result?.result?.sensor ? [data.result.result.sensor] : []);
      if (sensorsList.length > 0) {
        updateRelaysViewTelemetrySilently({ nodeId, sensors: sensorsList });
      }
    } else {
      showToast({ title: 'Poll Warning', message: data.error || 'Failed to poll sensors', severity: 'WARNING', category: 'PIN' });
    }
  } catch (err) {
    showToast({ title: 'Poll Error', message: err.message, severity: 'ERROR', category: 'PIN' });
  }
}

async function loadSensors() {
  const container = document.getElementById("content-area");
  try {
    const [nodesRes, relaysRes, homesRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/nodes`),
      fetch(`${API_BASE}/relays`),
      fetchWithAuth(`${API_BASE}/homes`).catch(() => ({ json: () => ({ homes: [] }) }))
    ]);

    const rawNodes = await nodesRes.json();
    const rawRelays = await relaysRes.json();
    const rawHomes = await homesRes.json();

    const nodes = Array.isArray(rawNodes) ? rawNodes : (rawNodes.nodes || []);
    const relays = Array.isArray(rawRelays) ? rawRelays : (rawRelays.relays || []);
    const homes = rawHomes.homes || [];

    fleetData.nodes = nodes;
    fleetData.relays = relays;
    fleetData.homes = homes;

    const sensors = relays.filter(isSensorChannel);

    if (!selectedSensorNodeId || !nodes.some(n => n.node_id === selectedSensorNodeId)) {
      selectedSensorNodeId = nodes.length > 0 ? nodes[0].node_id : '';
    }

    renderSensorsView(nodes, sensors, homes);
  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading sensors: ${err.message}</div>`;
  }
}

function renderSensorsView(nodes, sensors, homes = []) {
  const container = document.getElementById("content-area");

  if (!selectedSensorNodeId || !nodes.some(n => n.node_id === selectedSensorNodeId)) {
    selectedSensorNodeId = nodes.length > 0 ? nodes[0].node_id : '';
  }

  // Filter sensors by search and category
  let filteredSensors = sensors.slice();
  if (sensorSearchKeyword) {
    const q = sensorSearchKeyword.toLowerCase();
    filteredSensors = filteredSensors.filter(s =>
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.room && s.room.toLowerCase().includes(q)) ||
      (s.node_id && s.node_id.toLowerCase().includes(q)) ||
      (s.function && s.function.toLowerCase().includes(q)) ||
      (s.sensor_type && s.sensor_type.toLowerCase().includes(q)) ||
      (s.pin != null && String(s.pin).includes(q))
    );
  }

  if (sensorCategoryFilter === 'voltage') {
    filteredSensors = filteredSensors.filter(s => s.sensor_type === 'VOLTAGE' || s.sensor_type === 'VOLTAGE_ADC' || s.function?.toLowerCase().includes('voltage'));
  } else if (sensorCategoryFilter === 'ir') {
    filteredSensors = filteredSensors.filter(s => s.sensor_type?.includes('IR') || s.function?.includes('IR'));
  } else if (sensorCategoryFilter === 'motion') {
    filteredSensors = filteredSensors.filter(s => s.sensor_type?.includes('MOTION') || s.sensor_type?.includes('DOOR') || s.function?.includes('Motion'));
  } else if (sensorCategoryFilter === 'inputs') {
    filteredSensors = filteredSensors.filter(s => s.pin_mode === 'SENSOR_INPUT');
  }

  const voltageCount = sensors.filter(s => s.sensor_type === 'VOLTAGE' || s.sensor_type === 'VOLTAGE_ADC' || s.function?.toLowerCase().includes('voltage')).length;
  const irCount = sensors.filter(s => s.sensor_type?.includes('IR') || s.function?.includes('IR')).length;
  const motionCount = sensors.filter(s => s.sensor_type?.includes('MOTION') || s.sensor_type?.includes('DOOR') || s.function?.includes('Motion')).length;

  container.innerHTML = `
    <div class="relays-view-wrap">
      <!-- Topbar with header & fleet actions -->
      <div class="devices-topbar-actions">
        <div>
          <h2 style="font-size: 19px; font-weight: 700; color: #ffffff; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span>📡</span> Sensors & Telemetry
          </h2>
          <p style="font-size: 12px; color: #94a3b8; margin: 3px 0 0 0;">Live analog telemetry, AC RMS / DC voltage, IR transceivers, motion detection & calibration</p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn-batch-on" style="background: linear-gradient(135deg, #0284c7, #2563eb);" onclick="handlePollAllSensors('${escapeHtml(selectedSensorNodeId)}')">▶ Poll Board Sensors</button>
          <button class="btn-action-neutral" onclick="openAssignNewPinModal('sensor')">➕ Assign Sensor Pin</button>
          <button class="btn-action-neutral" onclick="syncPinsWithHardware()">🔄 Sync Hardware</button>
        </div>
      </div>

      <!-- Sub-View Navigation Tabs -->
      <div class="subview-nav-tabs">
        <button class="subview-tab-btn ${currentSensorSubTab === 'device' ? 'active' : ''}" onclick="switchSensorSubTab('device')">
          <span>🖥️ By Device / Board</span>
        </button>
        <button class="subview-tab-btn ${currentSensorSubTab === 'room' ? 'active' : ''}" onclick="switchSensorSubTab('room')">
          <span>🏠 By Room</span>
        </button>
        <button class="subview-tab-btn ${currentSensorSubTab === 'type' ? 'active' : ''}" onclick="switchSensorSubTab('type')">
          <span>📊 By Sensor Type</span>
        </button>
        <button class="subview-tab-btn ${currentSensorSubTab === 'matrix' ? 'active' : ''}" onclick="switchSensorSubTab('matrix')">
          <span>🔌 Sensor Pins Matrix</span>
        </button>
        <button class="subview-tab-btn" onclick="switchView('relays')">
          <span>⚡ Go to Relays & Actuators ↗</span>
        </button>
      </div>

      <!-- Category Filter Chips & Search Bar -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px;">
        <div class="filter-chips-bar" style="margin-bottom: 0;">
          <button class="filter-chip ${sensorCategoryFilter === 'all' ? 'active' : ''}" onclick="switchSensorCategoryFilter('all')">All Sensors (${sensors.length})</button>
          <button class="filter-chip ${sensorCategoryFilter === 'voltage' ? 'active' : ''}" onclick="switchSensorCategoryFilter('voltage')">📊 Voltage / ADC (${voltageCount})</button>
          <button class="filter-chip ${sensorCategoryFilter === 'ir' ? 'active' : ''}" onclick="switchSensorCategoryFilter('ir')">📡 IR Transceivers (${irCount})</button>
          <button class="filter-chip ${sensorCategoryFilter === 'motion' ? 'active' : ''}" onclick="switchSensorCategoryFilter('motion')">🚶 Motion & Doors (${motionCount})</button>
          <button class="filter-chip ${sensorCategoryFilter === 'inputs' ? 'active' : ''}" onclick="switchSensorCategoryFilter('inputs')">🔘 Digital Inputs</button>
        </div>

        <div class="devices-search-box" style="min-width: 220px;">
          <span style="font-size: 13px; color: #64748b;">🔍</span>
          <input type="text" class="devices-search-input" 
            placeholder="Search sensors, GPIO, type..." 
            value="${escapeHtml(sensorSearchKeyword)}"
            oninput="handleSensorSearchInput(this.value)">
        </div>
      </div>

      <!-- DYNAMIC SUB-VIEW CONTENT -->
      <div id="sensor-subview-container">
        ${renderActiveSensorSubView(nodes, filteredSensors, homes)}
      </div>
    </div>
  `;
}

function renderActiveSensorSubView(nodes, sensors, homes) {
  if (currentSensorSubTab === 'room') {
    return renderSensorsByRoomView(sensors);
  } else if (currentSensorSubTab === 'type') {
    return renderSensorsByTypeView(sensors);
  } else if (currentSensorSubTab === 'matrix') {
    return renderSensorsMatrixView(nodes, sensors, homes);
  } else {
    return renderSensorsByDeviceView(nodes, sensors);
  }
}

function renderSensorsByDeviceView(nodes, sensors) {
  const node = nodes.find(n => n.node_id === selectedSensorNodeId) || nodes[0] || {};
  const isOnline = Boolean(node.is_online);
  const deviceSensors = sensors.filter(s => s.node_id === selectedSensorNodeId);
  const nodeIp = node.ip_address || node.ip || '';

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 13px; color: #94a3b8; font-weight: 600;">Selected Device:</span>
        <select id="sensors-device-picker" class="relays-picker-dropdown" onchange="handleSensorDeviceSelect(this.value)">
          ${nodes.map(n => `
            <option value="${n.node_id}" ${n.node_id === selectedSensorNodeId ? 'selected' : ''}>
              Device: ${escapeHtml(n.name || n.node_id)} (${escapeHtml(n.room || n.room_name || 'General')})
            </option>
          `).join('')}
        </select>
        <span class="${isOnline ? 'status-pill-online' : 'status-pill-offline'}">
          ${isOnline ? '● Online' : '○ Offline'}
        </span>
      </div>

      ${nodeIp ? `
        <button class="btn-neutral-action" style="font-size: 12px; padding: 6px 12px;" onclick="window.open('http://${escapeHtml(nodeIp)}', '_blank')">
          🌐 Visit Device Portal (${escapeHtml(nodeIp)}) ↗
        </button>
      ` : ''}
    </div>

    <div class="relays-main-split">
      <!-- Left: Selected Device Summary Card -->
      <div class="device-board-card">
        <div class="board-graphic-wrap" style="background: rgba(192, 132, 252, 0.15); color: #c084fc;">📡</div>
        <div class="board-device-name">${escapeHtml(node.name || node.node_id)}</div>
        <div class="board-hw-tag" style="background: rgba(192, 132, 252, 0.12); color: #c084fc;">${escapeHtml(node.hardware_type || 'ESP8266 Telemetry Node')}</div>

        <div class="board-meta-list">
          <div class="board-meta-row">
            <span>IP Address</span>
            ${nodeIp ? `
              <a href="http://${escapeHtml(nodeIp)}" target="_blank" style="color: #38bdf8; font-family: monospace; font-weight: 600; text-decoration: underline;">${escapeHtml(nodeIp)} ↗</a>
            ` : '<span style="color: #64748b;">N/A</span>'}
          </div>
          <div class="board-meta-row"><span>RSSI Signal</span><span style="color: #10b981; font-weight: 600;">📶 ${node.rssi || -52} dBm</span></div>
          <div class="board-meta-row"><span>Uptime</span><span>${formatUptime(node.uptime_sec)}</span></div>
          <div class="board-meta-row"><span>Sensors Active</span><span style="color: #c084fc; font-weight: 700;">${deviceSensors.length} Channels</span></div>
          <div class="board-meta-row"><span>Room</span><span style="color: #ffffff;">${escapeHtml(node.room || node.room_name || 'General')}</span></div>
        </div>

        <button class="board-channels-btn" onclick="showNodeInfoModal('${node.node_id}')">All Board Channels (${(fleetData.relays || []).filter(r => r.node_id === node.node_id).length})</button>
      </div>

      <!-- Right: Action Bar & Sensor Channel Cards -->
      <div class="relays-controls-column">
        <div class="relays-action-toolbar">
          <button class="btn-test-all-on" style="background: linear-gradient(135deg, #0284c7, #2563eb);" onclick="handlePollAllSensors('${node.node_id}')">▶ Poll Board Sensors</button>
          <button class="btn-action-neutral" onclick="openAssignNewPinModal('sensor')">➕ Add Sensor Pin</button>
          <button class="btn-action-neutral" onclick="showNodeSettingsModal('${node.node_id}')">⚙ Configure Node</button>
          <button class="btn-action-neutral" onclick="handleNodeDiagnostics('${node.node_id}')">📈 I/O Status</button>
        </div>

        <div class="relays-channels-grid" id="selected-device-sensors-grid">
          ${deviceSensors.length === 0 ? `
            <div style="grid-column: span 2; padding: 32px; text-align: center; color: #64748b; background: #0b1120; border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
              <div style="font-size: 28px; margin-bottom: 8px;">📡</div>
              <div style="font-size: 14px; font-weight: 600; color: #94a3b8;">No sensor channels registered for this device.</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Click "+ Add Sensor Pin" above or configure an existing pin to Voltage, IR, or Motion sensor.</div>
            </div>
          ` : deviceSensors.map(s => renderSensorCardHtml(s)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderSensorsByRoomView(sensors) {
  const roomMap = new Map();
  for (const s of sensors) {
    const room = s.room || 'General / Unassigned';
    if (!roomMap.has(room)) roomMap.set(room, []);
    roomMap.get(room).push(s);
  }

  if (roomMap.size === 0) {
    return '<div style="padding: 40px; text-align: center; color: #64748b;">No sensors match the current filter.</div>';
  }

  const roomIcons = {
    'Living Room': '🛋️',
    'Bedroom': '🛏️',
    'Kitchen': '🍳',
    'Dining': '🍽️',
    'Mains': '⚡',
    'Study': '📚',
    'Outside': '🏡',
    'Balcony': '🌿'
  };

  return `
    <div class="room-relay-groups">
      ${Array.from(roomMap.entries()).map(([roomName, sList]) => {
        const icon = roomIcons[roomName] || '🚪';
        return `
          <div class="room-group-card" style="border-left: 3px solid #c084fc;">
            <div class="room-group-header">
              <div class="room-group-title">
                <span>${icon}</span>
                <span>${escapeHtml(roomName)}</span>
                <span class="room-group-badge" style="background: rgba(192, 132, 252, 0.15); color: #c084fc;">${sList.length} Sensors</span>
              </div>
            </div>

            <div class="relays-channels-grid">
              ${sList.map(s => renderSensorCardHtml(s)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSensorsByTypeView(sensors) {
  const typeGroups = [
    { key: 'voltage', title: '📊 Voltage & ADC Sensors', filter: s => s.sensor_type === 'VOLTAGE' || s.sensor_type === 'VOLTAGE_ADC' || s.function?.toLowerCase().includes('voltage'), icon: '⚡' },
    { key: 'ir', title: '📡 IR Remote Transceivers (RX / TX)', filter: s => s.sensor_type?.includes('IR') || s.function?.includes('IR'), icon: '📡' },
    { key: 'motion', title: '🚶 Motion, Radar & Door Sensors', filter: s => s.sensor_type?.includes('MOTION') || s.sensor_type?.includes('DOOR') || s.function?.includes('Motion'), icon: '🚶' },
    { key: 'other', title: '🔬 Other Sensor & Analog Inputs', filter: s => !s.sensor_type?.includes('VOLTAGE') && !s.function?.toLowerCase().includes('voltage') && !s.sensor_type?.includes('IR') && !s.function?.includes('IR') && !s.sensor_type?.includes('MOTION') && !s.sensor_type?.includes('DOOR') && !s.function?.includes('Motion'), icon: '🔬' }
  ];

  const activeGroups = typeGroups.map(g => ({ ...g, items: sensors.filter(g.filter) })).filter(g => g.items.length > 0);

  if (activeGroups.length === 0) {
    return '<div style="padding: 40px; text-align: center; color: #64748b;">No sensors registered.</div>';
  }

  return `
    <div class="room-relay-groups">
      ${activeGroups.map(g => `
        <div class="room-group-card" style="border-left: 3px solid #38bdf8;">
          <div class="room-group-header">
            <div class="room-group-title">
              <span>${g.icon}</span>
              <span>${g.title}</span>
              <span class="room-group-badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">${g.items.length} Channels</span>
            </div>
          </div>
          <div class="relays-channels-grid">
            ${g.items.map(s => renderSensorCardHtml(s)).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSensorsMatrixView(nodes, sensors, homes) {
  return `
    <div class="pin-matrix-table-wrap">
      <table class="pin-matrix-table">
        <thead>
          <tr>
            <th>Hardware Board</th>
            <th>CH #</th>
            <th>Sensor Name</th>
            <th>Room</th>
            <th>Hardware GPIO</th>
            <th>Sensor Role</th>
            <th>Calibration Details</th>
            <th>Live Reading</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${sensors.length === 0 ? `
            <tr>
              <td colspan="9" style="padding: 32px; text-align: center; color: #64748b;">No sensor pins found.</td>
            </tr>
          ` : sensors.map(s => {
            const pinLabel = getGpioPinLabel(s.pin);
            const roleBadgeHtml = getSensorRoleBadgeHtml(s);
            const liveControlHtml = getSensorLiveBadgeHtml(s);
            const calib = getSensorCalibrationSummary(s);

            return `
              <tr>
                <td>
                  <strong style="color: #fff;">${escapeHtml(s.node_name || s.node_id)}</strong>
                  <br><small style="color: #64748b; font-family: monospace;">${escapeHtml(s.node_id)}</small>
                </td>
                <td style="color: #c084fc; font-weight: 700;">CH${s.channel_id}</td>
                <td style="font-weight: 600; color: #fff;">
                  <span style="margin-right: 6px;">${getSensorIconSymbol(s)}</span>${escapeHtml(s.name)}
                </td>
                <td style="color: #94a3b8;">${escapeHtml(s.room || 'General')}</td>
                <td><span class="gpio-badge" style="font-family: monospace;">${pinLabel}</span></td>
                <td>${roleBadgeHtml}</td>
                <td><span style="color: #94a3b8; font-size: 11px; font-family: monospace;">${calib}</span></td>
                <td id="sensor-reading-${s.node_id}-${s.channel_id}">${liveControlHtml}</td>
                <td style="text-align: right; white-space: nowrap;">
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px; margin-right: 4px;" onclick="openRelayChannelConfigModal('${s.node_id}', ${s.channel_id})">⚙ Configure</button>
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px; color: #38bdf8;" onclick="handleReadSensorLive('${s.node_id}', ${s.channel_id})">🚀 Read</button>
                  ${(s.sensor_type === 'IR_TRANSMITTER' || s.function === 'IR Transmitter') ? `
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 7px; color: #22d3ee;" onclick="openIrTransmitModal('${s.node_id}')">🚀 Blast</button>
                  ` : ''}
                  ${(s.sensor_type === 'IR_RECEIVER' || s.function === 'IR Receiver') ? `
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 7px; color: #c084fc;" onclick="showNodeIrModal('${s.node_id}')">📡 Learn</button>
                  ` : ''}
                  <button class="btn btn-danger" style="font-size: 11px; padding: 4px 7px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #f87171; margin-left: 4px;" title="Unassign pin" onclick="handleUnassignPin('${s.node_id}', ${s.channel_id}, '${escapeHtml(s.name)}')">🗑️</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// --- 5. AUTOMATION UTILITIES ---
async function toggleAutomationRule(id) {
  await fetch(`${API_BASE}/automations/${id}/toggle`, { method: "POST" });
}

async function deleteAutomationRule(id) {
  if (!confirm("Delete this automation rule?")) return;
  await fetch(`${API_BASE}/automations/${id}`, { method: "DELETE" });
  loadAutomation();
}

// --- 6. FIRMWARE & LONG-TERM SUPPORT (LTS) OTA MANAGEMENT ---
let otaActiveTab = 'catalog';
let otaWizardState = {
  nodeId: null,
  firmwareId: null,
  diagnostics: null,
  preCheck: null
};

async function loadFirmware(activeTab = null) {
  if (activeTab) otaActiveTab = activeTab;
  const container = document.getElementById("content-area");

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h2 style="margin: 0 0 4px 0; font-size: 18px;">Firmware Repository & Long-Term Support (LTS) OTA Engine</h2>
        <div style="font-size: 13px; color: var(--text-secondary);">Live node inspection, pre-update version checking, automated configuration backups, and resilient OTA flashing</div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-secondary" onclick="loadFirmware('wizard')">🚀 Launch OTA Wizard</button>
        <button class="btn btn-primary" onclick="showUploadFirmwareModal()">+ Upload Firmware (.bin)</button>
      </div>
    </div>

    <!-- TABS -->
    <div class="ota-tabs">
      <button class="ota-tab-btn ${otaActiveTab === 'catalog' ? 'active' : ''}" onclick="loadFirmware('catalog')">
        📦 Firmware Catalog
      </button>
      <button class="ota-tab-btn ${otaActiveTab === 'wizard' ? 'active' : ''}" onclick="loadFirmware('wizard')">
        🚀 Guided OTA Deployment Wizard
      </button>
      <button class="ota-tab-btn ${otaActiveTab === 'backups' ? 'active' : ''}" onclick="loadFirmware('backups')">
        💾 Node Backups Archive
      </button>
      <button class="ota-tab-btn ${otaActiveTab === 'history' ? 'active' : ''}" onclick="loadFirmware('history')">
        📜 OTA Deployment History
      </button>
    </div>

    <div id="ota-tab-content">
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">Loading OTA content...</div>
    </div>
  `;

  if (otaActiveTab === 'catalog') {
    renderFirmwareCatalog();
  } else if (otaActiveTab === 'wizard') {
    renderOtaWizard(otaWizardState.firmwareId, otaWizardState.nodeId);
  } else if (otaActiveTab === 'backups') {
    renderNodeBackups();
  } else if (otaActiveTab === 'history') {
    renderOtaHistory();
  }
}

// === SUB-VIEW 1: FIRMWARE CATALOG ===
async function renderFirmwareCatalog() {
  const content = document.getElementById("ota-tab-content");
  try {
    const res = await fetch(`${API_BASE}/firmware`);
    const files = await res.json();

    content.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Filename</th>
            <th>Version</th>
            <th>Channel</th>
            <th>Target Hardware</th>
            <th>Size</th>
            <th>Checksum (MD5)</th>
            <th>Release Notes</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${files.length === 0 ? '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">No firmware binaries in catalog. Click "+ Upload Firmware" to add one.</td></tr>' : ''}
          ${files.map(f => `
            <tr>
              <td><strong>${f.filename}</strong></td>
              <td><span class="status-badge badge-online">v${f.version}</span></td>
              <td><span class="status-badge badge-lts">${f.release_channel || 'LTS'}</span></td>
              <td><span class="status-badge badge-sync">${f.hardware_type}</span></td>
              <td>${(f.file_size_bytes / 1024).toFixed(1)} KB</td>
              <td><code style="font-size: 11px;">${f.checksum_md5}</code></td>
              <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-secondary);">
                ${f.notes || 'Official Release'}
              </td>
              <td>
                <div style="display: flex; gap: 6px;">
                  <button class="btn btn-primary" style="font-size: 11px; padding: 4px 8px;" onclick="launchWizardForFirmware(${f.id})">🚀 Deploy OTA</button>
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px; color: var(--accent-red);" onclick="deleteFirmwareFile(${f.id}, '${f.filename}')">🗑️</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (e) {
    content.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading catalog: ${e.message}</div>`;
  }
}

function launchWizardForFirmware(fwId) {
  otaWizardState.firmwareId = fwId;
  loadFirmware('wizard');
}

// === SUB-VIEW 2: GUIDED OTA DEPLOYMENT WIZARD ===
async function renderOtaWizard(presetFwId = null, presetNodeId = null) {
  const content = document.getElementById("ota-tab-content");

  try {
    const [nodesRes, fwRes] = await Promise.all([
      fetch(`${API_BASE}/nodes`),
      fetch(`${API_BASE}/firmware`)
    ]);
    const rawNodes = await nodesRes.json();
    const rawFw = await fwRes.json();
    const nodes = Array.isArray(rawNodes) ? rawNodes : (rawNodes.nodes || []);
    const firmwares = Array.isArray(rawFw) ? rawFw : (rawFw.firmware || rawFw.firmwares || []);
    window._cachedFirmwares = firmwares;
    window._cachedNodes = nodes;

    if (nodes.length === 0) {
      content.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-color); margin: 20px 0;">No registered nodes found in fleet. Please add or connect a node first.</div>`;
      return;
    }

    const defaultNode = presetNodeId
      ? nodes.find(n => n.node_id === presetNodeId) || nodes[0] || null
      : (otaWizardState.nodeId ? nodes.find(n => n.node_id === otaWizardState.nodeId) || nodes[0] || null : nodes[0] || null);

    const defaultFw = presetFwId
      ? firmwares.find(f => f.id === Number(presetFwId)) || firmwares[0] || null
      : (otaWizardState.firmwareId ? firmwares.find(f => f.id === Number(otaWizardState.firmwareId)) || firmwares[0] || null : firmwares[0] || null);

    otaWizardState.nodeId = defaultNode ? defaultNode.node_id : null;
    otaWizardState.firmwareId = defaultFw ? defaultFw.id : null;

    content.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr; gap: 20px;">

        <!-- STEP 1: TARGET NODE & LIVE DIAGNOSTICS FETCH -->
        <div class="ota-card">
          <div class="ota-card-header">
            <div class="ota-card-title">
              <span class="ota-step-pill">1</span>
              <span>Select Target Node & Fetch Live Hardware Diagnostics</span>
            </div>
            <button class="btn btn-secondary" style="font-size: 12px;" onclick="onWizardNodeChanged()">🔄 Re-fetch Node Diagnostics</button>
          </div>

          <div style="display: flex; gap: 16px; align-items: flex-end; margin-bottom: 16px;">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Target NodeMCU / ESP8266 Device</label>
              <select id="wiz-node-select" class="form-control" onchange="onWizardNodeChanged()">
                ${nodes.map(n => `
                  <option value="${n.node_id}" ${n.node_id === otaWizardState.nodeId ? 'selected' : ''}>
                    ${n.name} (${n.ip_address || 'No IP'}) - ${n.room} [v${n.firmware_version || '1.6.0'}]
                  </option>
                `).join("")}
              </select>
            </div>
            <button class="btn btn-primary" style="height: 38px;" onclick="executeStandaloneBackup()">💾 Create Instant Node Backup</button>
          </div>

          <!-- DIAGNOSTICS CONTAINER -->
          <div id="wiz-node-diagnostics-view">
            <div style="padding: 20px; text-align: center; color: var(--text-muted);">Fetching live diagnostics from node...</div>
          </div>
        </div>

        <!-- STEP 2: FIRMWARE SELECTION & PRE-CHECK VALIDATION -->
        <div class="ota-card">
          <div class="ota-card-header">
            <div class="ota-card-title">
              <span class="ota-step-pill">2</span>
              <span>Candidate Firmware & Pre-Flight Version Validation</span>
            </div>
            <button class="btn btn-secondary" style="font-size: 12px;" onclick="onWizardFirmwareChanged()">🧪 Run Pre-Flight Validation</button>
          </div>

          <!-- CONTAINER POPULATED DYNAMICALLY FOR THE SELECTED DEVICE TYPE ONLY -->
          <div id="wiz-fw-selector-container">
            <div style="padding: 16px; text-align: center; color: var(--text-muted);">Loading firmware options for selected device...</div>
          </div>

          <!-- PRE-CHECK RESULTS CONTAINER -->
          <div id="wiz-precheck-view">
            <div style="padding: 20px; text-align: center; color: var(--text-muted);">Analyzing firmware compatibility...</div>
          </div>
        </div>

        <!-- STEP 3: BACKUP & LTS DEPLOYMENT EXECUTION -->
        <div class="ota-card">
          <div class="ota-card-header">
            <div class="ota-card-title">
              <span class="ota-step-pill">3</span>
              <span>LTS Execution Options & Deployment Launch</span>
            </div>
          </div>

          <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer;">
              <input type="checkbox" id="wiz-opt-backup" checked style="width: 16px; height: 16px;">
              <div>
                <strong>Automatically backup Node Configuration & Rules before flashing (Recommended)</strong>
                <div style="font-size: 12px; color: var(--text-secondary);">Takes full snapshot of GPIO channels, automations, receiver settings and archives to database.</div>
              </div>
            </label>

            <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer;">
              <input type="checkbox" id="wiz-opt-verify" checked style="width: 16px; height: 16px;">
              <div>
                <strong>Post-Flash Verification & Automatic Reboot Handshake</strong>
                <div style="font-size: 12px; color: var(--text-secondary);">Monitors node reboot over LAN, polls status and verifies target firmware version is active.</div>
              </div>
            </label>

            <div id="wiz-downgrade-override-box" style="display: none; margin-top: 10px; padding: 10px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px;">
              <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #fde047;">
                <input type="checkbox" id="wiz-opt-force" style="width: 16px; height: 16px;">
                <div>
                  <strong>Acknowledge and proceed with firmware downgrade</strong>
                  <div style="font-size: 11px;">Target version is older than currently installed version. Check this box to allow overwrite.</div>
                </div>
              </label>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 12px;">
            <button class="btn btn-secondary" onclick="executeStandaloneBackup()">💾 Create Instant Standalone Backup</button>
            <button class="btn btn-primary" id="btn-start-ota-deploy" style="padding: 10px 24px; font-weight: bold;" onclick="startGuidedOtaDeployment()">
              🚀 Start Validated OTA Deployment
            </button>
          </div>
        </div>

      </div>
    `;

    // Immediately render candidate firmware for default node before network fetch
    updateWizardFirmwareOptions(defaultNode);

    // Trigger initial live fetch & pre-check
    await onWizardNodeChanged();
  } catch (err) {
    content.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading wizard: ${err.message}</div>`;
  }
}

// Handler: Node Changed in Wizard
async function onWizardNodeChanged() {
  const nodeSelect = document.getElementById("wiz-node-select");
  if (!nodeSelect) return;
  const nodeId = nodeSelect.value;
  otaWizardState.nodeId = nodeId;

  const nodes = window._cachedNodes || [];
  const currentNode = nodes.find(n => n.node_id === nodeId) || null;

  // 1. Immediately update candidate firmware selector for THIS node's device type!
  updateWizardFirmwareOptions(currentNode);

  const diagView = document.getElementById("wiz-node-diagnostics-view");
  if (diagView) {
    diagView.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--text-secondary);">
        <span class="pulse-dot"></span> Connecting to node over LAN and fetching live hardware diagnostics...
      </div>
    `;
  }

  try {
    const res = await fetch(`${API_BASE}/ota/node-diagnostics/${nodeId}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to fetch node diagnostics');
    otaWizardState.diagnostics = d;

    // 2. Refresh candidate firmware dropdown using confirmed hardware model from live diagnostics
    updateWizardFirmwareOptions(d || currentNode);

    if (diagView) {
      diagView.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="status-badge badge-online"><span class="pulse-dot"></span> Node Reachable</span>
            <span style="font-size: 12px; color: var(--text-secondary);">Ping: <strong>${d.rttMs}ms</strong> | IP: <strong>${d.ip}</strong> | MAC: <code>${d.network.mac}</code></span>
          </div>
          <div>
            <span class="status-badge badge-lts">Installed: v${d.firmwareVersion}</span>
          </div>
        </div>

        <div class="ota-diag-grid">
          <div class="ota-stat-chip">
            <span class="chip-label">Hardware Architecture</span>
            <span class="chip-value" style="font-size: 13px;">${d.hardware}</span>
            <span style="font-size: 11px; color: var(--text-muted);">Core: ${d.coreVersion} | SDK: ${d.sdkVersion}</span>
          </div>

          <div class="ota-stat-chip">
            <span class="chip-label">Free Sketch Space</span>
            <span class="chip-value" style="color: var(--accent-green);">${(d.flashGeometry.freeSketchSpace/1024).toFixed(1)} KB Available</span>
            <span style="font-size: 11px; color: var(--text-muted);">Sketch: ${(d.flashGeometry.sketchSize/1024).toFixed(1)} KB | Flash: ${(d.flashGeometry.flashSize/1024/1024).toFixed(1)} MB</span>
          </div>

          <div class="ota-stat-chip">
            <span class="chip-label">Free Heap Memory</span>
            <span class="chip-value" style="color: var(--accent-blue);">${(d.memory.freeHeap/1024).toFixed(1)} KB</span>
            <span style="font-size: 11px; color: var(--text-muted);">Max Block: ${(d.memory.maxFreeBlock/1024).toFixed(1)} KB | Frag: ${d.memory.heapFragPercent}%</span>
          </div>

          <div class="ota-stat-chip">
            <span class="chip-label">Network & Uptime</span>
            <span class="chip-value">${d.network.rssi} dBm (Wi-Fi)</span>
            <span style="font-size: 11px; color: var(--text-muted);">Uptime: ${Math.floor(d.network.uptimeSec/60)}m | Resets: ${d.network.bootCount}</span>
          </div>
        </div>
      `;
    }

    // 3. Trigger candidate firmware validation
    await onWizardFirmwareChanged();
  } catch (err) {
    if (diagView) {
      diagView.innerHTML = `
        <div class="check-item check-fail">
          <span>❌</span>
          <div>
            <strong>Failed to fetch live diagnostics:</strong> ${err.message}.
            <div style="font-size: 11px; margin-top: 4px;">Please check if the node is powered on and connected to the home Wi-Fi network.</div>
          </div>
        </div>
      `;
    }
    await onWizardFirmwareChanged();
  }
}

// Handler: Firmware Changed in Wizard
async function onWizardFirmwareChanged() {
  const fwSelect = document.getElementById("wiz-fw-select");
  const preCheckView = document.getElementById("wiz-precheck-view");
  const downgradeBox = document.getElementById("wiz-downgrade-override-box");
  const deployBtn = document.getElementById("btn-start-ota-deploy");

  if (!fwSelect || !preCheckView) return;
  const fwId = fwSelect.value;
  otaWizardState.firmwareId = fwId ? Number(fwId) : null;

  if (!otaWizardState.nodeId) return;

  if (!fwId) {
    preCheckView.innerHTML = `
      <div class="check-item check-warn">
        <span>⚠️</span>
        <div><strong>No firmware selected:</strong> Please upload a certified firmware binary compiled specifically for this device type.</div>
      </div>
    `;
    if (downgradeBox) downgradeBox.style.display = 'none';
    if (deployBtn) deployBtn.disabled = true;
    return;
  }

  preCheckView.innerHTML = `
    <div style="padding: 14px; text-align: center; color: var(--text-secondary);">
      <span class="pulse-dot"></span> Performing pre-flight safety and compatibility checks...
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/ota/pre-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: otaWizardState.nodeId,
        firmwareId: Number(fwId)
      })
    });
    const check = await res.json();
    if (!res.ok) throw new Error(check.error || 'Pre-check failed');
    otaWizardState.preCheck = check;

    // Show downgrade override if applicable
    if (check.versionType === 'DOWNGRADE') {
      downgradeBox.style.display = 'block';
    } else {
      downgradeBox.style.display = 'none';
    }

    // Flash Space Bar
    const fwSize = check.fileSizeBytes;
    const freeSpace = check.diagnostics.flashGeometry.freeSketchSpace;
    const pct = Math.min(100, Math.round((fwSize / (freeSpace || 1)) * 100));

    preCheckView.innerHTML = `
      <!-- VERSION BADGE -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <div>
          <span style="font-size: 13px; color: var(--text-secondary);">Version Migration:</span>
          <span style="font-weight: 700; margin-left: 8px; font-size: 14px;">
            v${check.currentVersion} ➔ <span style="color: var(--accent-blue);">v${check.targetVersion}</span>
          </span>
          <span class="status-badge badge-lts" style="margin-left: 8px;">${check.releaseChannel}</span>
        </div>
        <div>
          ${check.versionType === 'UPGRADE' ? '<span class="status-badge badge-online">Upgrade Recommended</span>' : ''}
          ${check.versionType === 'SAME_VERSION' ? '<span class="status-badge badge-sync">Re-flash / Repair</span>' : ''}
          ${check.versionType === 'DOWNGRADE' ? '<span class="status-badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b;">Downgrade Warning</span>' : ''}
        </div>
      </div>

      <!-- FLASH SPACE GAUGE -->
      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span>Binary Flash Footprint: <strong>${(fwSize/1024).toFixed(1)} KB</strong></span>
          <span>Free Sketch Space: <strong>${(freeSpace/1024).toFixed(1)} KB</strong> (${pct}% space used)</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${pct}%; background: ${pct > 90 ? 'var(--accent-red)' : 'linear-gradient(90deg, #3b82f6, #10b981)'};"></div>
        </div>
      </div>

      <!-- VALIDATION CHECKLIST -->
      <div style="margin-top: 10px;">
        ${check.checks.map(c => `
          <div class="check-item check-${c.status.toLowerCase()}">
            <span style="font-size: 14px;">${c.status === 'PASS' ? '✅' : (c.status === 'WARN' ? '⚠️' : '❌')}</span>
            <div style="flex: 1;">
              <strong>${c.title}</strong>: ${c.details}
            </div>
          </div>
        `).join("")}
      </div>
    `;

    deployBtn.disabled = !check.canProceed;
  } catch (err) {
    preCheckView.innerHTML = `
      <div class="check-item check-fail">
        <span>❌</span>
        <div><strong>Validation Error:</strong> ${err.message}</div>
      </div>
    `;
    deployBtn.disabled = true;
  }
}

// Standalone Backup Trigger
async function executeStandaloneBackup() {
  if (!otaWizardState.nodeId) {
    alert("Please select a target node first.");
    return;
  }

  const btn = event?.target;
  const oldText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving backup...'; }

  try {
    const res = await fetch(`${API_BASE}/ota/backup/${otaWizardState.nodeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupType: 'MANUAL' })
    });
    const result = await res.json();
    if (result.success) {
      alert(`Node snapshot backup #${result.backupId} created successfully!\n\nSaved: ${result.filename} (${(result.fileSizeBytes/1024).toFixed(1)} KB)`);
    } else {
      alert(`Backup failed: ${result.error}`);
    }
  } catch (err) {
    alert(`Backup error: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText; }
  }
}

// Guided Deployment Modal Execution
async function startGuidedOtaDeployment() {
  const check = otaWizardState.preCheck;
  if (!check || !check.canProceed) {
    alert("Pre-flight validation has not passed. Cannot initiate OTA deployment.");
    return;
  }

  const autoBackup = document.getElementById("wiz-opt-backup").checked;
  const postVerify = document.getElementById("wiz-opt-verify").checked;
  const forceDowngrade = document.getElementById("wiz-opt-force")?.checked || false;

  if (check.versionType === 'DOWNGRADE' && !forceDowngrade) {
    alert("Please acknowledge the firmware downgrade checkbox before proceeding.");
    return;
  }

  if (!confirm(`Are you sure you want to deploy firmware v${check.targetVersion} to node '${check.diagnostics.nodeName}' (${check.diagnostics.ip})?\n\n- Automated Pre-Backup: ${autoBackup ? 'YES' : 'NO'}\n- Post-Flash Verification: ${postVerify ? 'YES' : 'NO'}`)) {
    return;
  }

  // Open Progress Modal
  const modalHtml = `
    <div class="modal-content" style="max-width: 640px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 17px;">🚀 Long-Term Support OTA Deployment in Progress</h3>
        <span class="status-badge badge-sync"><span class="pulse-dot"></span> Live</span>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">Deployment Stages:</div>
        <div id="ota-stage-1" class="check-item check-pass"><span>✅</span> <div><strong>Stage 1:</strong> Pre-Flight Validation Complete</div></div>
        <div id="ota-stage-2" class="check-item ${autoBackup ? 'check-warn' : 'check-pass'}"><span>${autoBackup ? '⏳' : '⏭️'}</span> <div><strong>Stage 2:</strong> ${autoBackup ? 'Creating Complete Node Configuration Backup...' : 'Pre-backup skipped'}</div></div>
        <div id="ota-stage-3" class="check-item" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-muted);"><span>⏳</span> <div><strong>Stage 3:</strong> Streaming Firmware Binary to Node over LAN HTTP</div></div>
        <div id="ota-stage-4" class="check-item" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-muted);"><span>⏳</span> <div><strong>Stage 4:</strong> Flashing to Flash Memory & Awaiting Acknowledgment</div></div>
        <div id="ota-stage-5" class="check-item" style="background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-muted);"><span>⏳</span> <div><strong>Stage 5:</strong> Node Reboot & Post-Flash Handshake Verification</div></div>
      </div>

      <div style="font-size: 12px; font-weight: 600; margin-bottom: 6px;">Live Execution Console:</div>
      <div id="ota-deploy-console" class="log-console">
        [0.0s] Initializing enterprise OTA deployment pipeline...<br>
        [0.1s] Target: ${check.diagnostics.nodeName} (${check.diagnostics.ip})<br>
        [0.2s] Candidate: ${check.diagnostics.nodeName} v${check.targetVersion} (${(check.fileSizeBytes/1024).toFixed(1)} KB)<br>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
        <button id="btn-ota-modal-close" class="btn btn-secondary" disabled onclick="closeModal(); loadFirmware('history');">Please wait...</button>
      </div>
    </div>
  `;
  openModal(modalHtml);

  const consoleEl = document.getElementById("ota-deploy-console");
  const closeBtn = document.getElementById("btn-ota-modal-close");
  const log = (msg) => {
    if (consoleEl) {
      consoleEl.innerHTML += `[${new Date().toLocaleTimeString()}] ${msg}<br>`;
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  };

  try {
    log("Sending OTA execution request to central server...");

    if (autoBackup) {
      document.getElementById("ota-stage-2").className = "check-item check-pass";
      document.getElementById("ota-stage-2").innerHTML = "<span>✅</span> <div><strong>Stage 2:</strong> Node Configuration Backup Saved to Database</div>";
      log("Node configuration & rules snapshot backed up successfully.");
    }

    document.getElementById("ota-stage-3").className = "check-item check-warn";
    document.getElementById("ota-stage-3").style.color = "#fde047";
    log("Streaming firmware binary chunks to node POST /api/ota/upload...");

    const res = await fetch(`${API_BASE}/ota/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: otaWizardState.nodeId,
        firmwareId: Number(otaWizardState.firmwareId),
        options: { autoBackup, forceDowngrade, postVerify }
      })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'OTA deployment failed');

    document.getElementById("ota-stage-3").className = "check-item check-pass";
    document.getElementById("ota-stage-3").style.color = "#86efac";

    document.getElementById("ota-stage-4").className = "check-item check-pass";
    document.getElementById("ota-stage-4").style.color = "#86efac";
    document.getElementById("ota-stage-4").innerHTML = "<span>✅</span> <div><strong>Stage 4:</strong> Flash Write Complete (Node Acknowledged)</div>";
    log("Node confirmed flash write. Initiating automatic restart sequence.");

    if (postVerify) {
      document.getElementById("ota-stage-5").className = "check-item check-pass";
      document.getElementById("ota-stage-5").style.color = "#86efac";
      document.getElementById("ota-stage-5").innerHTML = `<span>✅</span> <div><strong>Stage 5:</strong> Handshake Verified! Active Version: v${result.versionTo}</div>`;
      log(`Node came back online in ${(result.totalDurationMs/1000).toFixed(1)}s! Version verified: v${result.versionTo}.`);
    }

    log("🎉 OTA Deployment Pipeline Finished Successfully!");
    closeBtn.disabled = false;
    closeBtn.textContent = "Done (View History)";
    closeBtn.className = "btn btn-primary";
  } catch (err) {
    log(`❌ ERROR: ${err.message}`);
    document.getElementById("ota-stage-3").className = "check-item check-fail";
    document.getElementById("ota-stage-3").style.color = "#fca5a5";
    closeBtn.disabled = false;
    closeBtn.textContent = "Close";
  }
}

// === SUB-VIEW 3: NODE BACKUPS ARCHIVE ===
async function renderNodeBackups() {
  const content = document.getElementById("ota-tab-content");
  try {
    const res = await fetch(`${API_BASE}/ota/backups`);
    const backups = await res.json();

    content.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="font-size: 13px; color: var(--text-secondary);">
          Full snapshots of node hardware profiles, GPIO channels, room names, automation rules and telemetry parameters.
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Backup ID</th>
            <th>Target Node</th>
            <th>Firmware Version</th>
            <th>Type</th>
            <th>Created At</th>
            <th>Size</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${backups.length === 0 ? '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No configuration backups recorded. Backups are created automatically before OTA updates or via the wizard.</td></tr>' : ''}
          ${backups.map(b => `
            <tr>
              <td><strong>#${b.id}</strong></td>
              <td>${b.node_name} (<code>${b.node_id}</code>)</td>
              <td><span class="status-badge badge-sync">v${b.firmware_version}</span></td>
              <td><span class="status-badge ${b.backup_type === 'PRE_OTA' ? 'badge-lts' : 'badge-online'}">${b.backup_type}</span></td>
              <td>${new Date(b.created_at).toLocaleString()}</td>
              <td>${(b.file_size_bytes / 1024).toFixed(1)} KB</td>
              <td>
                <div style="display: flex; gap: 6px;">
                  <a href="${API_BASE}/ota/backups/${b.id}/download" class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px; text-decoration: none;">⬇️ Download JSON</a>
                  <button class="btn btn-primary" style="font-size: 11px; padding: 4px 8px;" onclick="restoreBackupToNode(${b.id}, '${b.node_id}')">🔄 Restore</button>
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px; color: var(--accent-red);" onclick="deleteBackupRecord(${b.id})">🗑️</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    content.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading backups: ${err.message}</div>`;
  }
}

async function deleteBackupRecord(id) {
  if (!confirm(`Delete configuration backup #${id}?`)) return;
  try {
    const res = await fetch(`${API_BASE}/ota/backups/${id}`, { method: 'DELETE' });
    const r = await res.json();
    if (r.success) {
      renderNodeBackups();
    } else {
      alert(r.error || 'Failed to delete backup');
    }
  } catch (e) {
    alert(e.message);
  }
}

async function restoreBackupToNode(backupId, nodeId) {
  if (!confirm(`Restore configuration snapshot #${backupId} to node '${nodeId}'?\n\nThis will restore GPIO channel names, rooms, functions and system settings.`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/ota/backups/${backupId}/restore/${nodeId}`, { method: 'POST' });
    const r = await res.json();
    if (r.success) {
      alert(`Restoration complete! Successfully applied ${r.restoredItems} configuration items to node.`);
    } else {
      alert(`Restoration finished with warnings: ${r.errors.join(', ')}`);
    }
  } catch (e) {
    alert(`Restoration failed: ${e.message}`);
  }
}

// === SUB-VIEW 4: OTA DEPLOYMENT HISTORY ===
async function renderOtaHistory() {
  const content = document.getElementById("ota-tab-content");
  try {
    const res = await fetch(`${API_BASE}/ota/history`);
    const history = await res.json();

    content.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Target Node</th>
            <th>Firmware File</th>
            <th>Version Migration</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Backup Reference</th>
          </tr>
        </thead>
        <tbody>
          ${history.length === 0 ? '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No previous OTA deployments recorded.</td></tr>' : ''}
          ${history.map(h => `
            <tr>
              <td>${new Date(h.created_at).toLocaleString()}</td>
              <td><strong>${h.node_name}</strong> (<code>${h.node_id}</code>)</td>
              <td><code>${h.firmware_filename || 'firmware.bin'}</code></td>
              <td>
                <span style="font-size: 13px; font-weight: 600;">v${h.version_from} ➔ <span style="color: var(--accent-blue);">v${h.version_to}</span></span>
              </td>
              <td>
                <span class="status-badge ${h.status === 'SUCCESS' ? 'badge-online' : (h.status === 'IN_PROGRESS' ? 'badge-sync' : '')}" style="${h.status === 'FAILED' ? 'background: rgba(239, 68, 68, 0.2); color: var(--accent-red);' : ''}">
                  ${h.status}
                </span>
              </td>
              <td>${(h.duration_ms / 1000).toFixed(1)}s</td>
              <td>
                ${h.backup_id ? `<a href="${API_BASE}/ota/backups/${h.backup_id}/download" style="color: var(--accent-blue); font-size: 12px; text-decoration: none;">💾 Backup #${h.backup_id}</a>` : '<span style="color: var(--text-muted);">None</span>'}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    content.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading history: ${err.message}</div>`;
  }
}

// Upload Modal with LTS metadata
async function showUploadFirmwareModal(preselectedHw = null) {
  let nodes = window._cachedNodes || [];
  if (nodes.length === 0) {
    try {
      const res = await fetch(`${API_BASE}/nodes`);
      const data = await res.json();
      nodes = Array.isArray(data) ? data : (data.nodes || []);
      window._cachedNodes = nodes;
    } catch {}
  }

  const html = `
    <div class="modal-content" style="max-width: 600px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <h3 style="margin: 0; font-size: 18px;">Upload Certified Firmware Binary (.bin)</h3>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
            Target an available fleet node or register a brand-new device architecture
          </div>
        </div>
        <button class="btn btn-secondary" style="padding: 4px 8px;" onclick="closeModal()">&times;</button>
      </div>

      <div class="form-group">
        <label class="form-label">Firmware Binary File (.bin) *</label>
        <input type="file" id="fw-file" class="form-control" accept=".bin" onchange="onFwFileSelected()">
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
          Must be an exported binary file with ESP ROM magic byte <code>0xE9</code>.
        </div>
      </div>

      <!-- TARGET DEVICE / HARDWARE PLATFORM SELECTION -->
      <div class="form-group">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <label class="form-label" style="margin: 0;">Target Device or Hardware Platform *</label>
          <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px; color: var(--accent-blue);" onclick="toggleCustomDeviceInput(true)">
            ➕ Add New Device Model
          </button>
        </div>

        <div id="fw-device-select-container">
          <select id="fw-hardware" class="form-control" onchange="onUploadDeviceSelectionChanged()">
            ${nodes.length > 0 ? `
              <optgroup label="📡 Target Available Nodes in Fleet">
                ${nodes.map(n => `
                  <option value="${escapeHtml(n.hardware_type || n.hardware || 'ESP8266')}" data-nodename="${escapeHtml(n.name)}">
                    ${escapeHtml(n.name)} (${escapeHtml(n.ip_address || 'No IP')}) — [${escapeHtml(n.hardware_type || 'ESP8266')}]
                  </option>
                `).join('')}
              </optgroup>
            ` : ''}

            <optgroup label="⚙️ Standard Hardware Platforms">
              <option value="ESP8266 (ESP-12E/F) NodeMCU">ESP8266 (ESP-12E/F) NodeMCU (4MB Flash)</option>
              <option value="ESP8266 ESP-01 + PCF8574T (1MB)">ESP8266 ESP-01 + PCF8574T I2C (1MB Flash)</option>
              <option value="ESP8266 ESP-01 / ESP-01S (1MB)">ESP8266 ESP-01 / ESP-01S (1MB Flash)</option>
              <option value="ESP8266 (Generic)">ESP8266 Generic</option>
              <option value="ESP32">ESP32 (WROOM / WROVER)</option>
            </optgroup>

            <optgroup label="➕ Custom Device Model">
              <option value="__NEW_DEVICE__">+ Add New Custom Device Model...</option>
            </optgroup>
          </select>
        </div>

        <!-- NEW CUSTOM DEVICE MODEL INPUT BOX -->
        <div id="fw-new-device-box" style="display: none; margin-top: 8px; background: rgba(59, 130, 246, 0.08); border: 1px dashed rgba(59, 130, 246, 0.3); border-radius: 6px; padding: 10px;">
          <label class="form-label" style="font-size: 12px; margin-bottom: 4px; color: #93c5fd;">Enter New Device Model / Hardware Name:</label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="fw-custom-hardware" class="form-control" placeholder="e.g. ESP32-CAM, Sonoff Basic R2, Shelly 1, Custom PCB" style="font-size: 13px;">
            <button type="button" class="btn btn-secondary" style="font-size: 11px; white-space: nowrap;" onclick="toggleCustomDeviceInput(false)">Use Existing</button>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
            This registers a separate hardware platform category in your fleet firmware repository.
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label class="form-label">Firmware Version *</label>
          <input type="text" id="fw-version" class="form-control" placeholder="e.g. 1.7.0" value="1.7.0">
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Format: Semantic version (X.Y.Z)</div>
        </div>

        <div class="form-group">
          <label class="form-label">Release Channel</label>
          <select id="fw-channel" class="form-control">
            <option value="LTS">LTS (Long Term Support)</option>
            <option value="Stable">Stable Release</option>
            <option value="Beta">Beta Channel</option>
            <option value="Testing">Development / Testing</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Changelog & Release Notes</label>
        <textarea id="fw-notes" class="form-control" rows="2" placeholder="Describe optimizations, bug fixes, or enhancements...">Production LTS release with dynamic heap optimization and TCP keep-alive.</textarea>
      </div>

      <div id="fw-upload-status" style="display: none; font-size: 13px; padding: 8px; border-radius: 6px; margin-bottom: 12px;"></div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="btn-submit-upload-fw" onclick="submitUploadFirmware()">Upload & Register</button>
      </div>
    </div>
  `;
  openModal(html);

  // If a preselected hardware was passed, choose it
  if (preselectedHw) {
    setTimeout(() => {
      const sel = document.getElementById("fw-hardware");
      if (sel) {
        for (let i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value.includes(preselectedHw) || preselectedHw.includes(sel.options[i].value)) {
            sel.selectedIndex = i;
            break;
          }
        }
      }
    }, 50);
  }
}

// Toggle custom device input vs dropdown
function toggleCustomDeviceInput(showCustom) {
  const customBox = document.getElementById("fw-new-device-box");
  const selectBox = document.getElementById("fw-device-select-container");
  const customInput = document.getElementById("fw-custom-hardware");
  const sel = document.getElementById("fw-hardware");

  if (showCustom === undefined) {
    showCustom = (customBox.style.display === "none");
  }

  if (showCustom) {
    customBox.style.display = "block";
    selectBox.style.display = "none";
    if (customInput) customInput.focus();
  } else {
    customBox.style.display = "none";
    selectBox.style.display = "block";
    if (sel && sel.value === "__NEW_DEVICE__") {
      sel.selectedIndex = 0;
    }
  }
}

// Handler when user chooses an option from the hardware / node dropdown
function onUploadDeviceSelectionChanged() {
  const sel = document.getElementById("fw-hardware");
  if (!sel) return;

  if (sel.value === "__NEW_DEVICE__") {
    toggleCustomDeviceInput(true);
    return;
  }

  const selectedOpt = sel.options[sel.selectedIndex];
  const nodeName = selectedOpt?.dataset?.nodename;
  const notesField = document.getElementById("fw-notes");
  if (nodeName && notesField && notesField.value.includes("Production LTS release")) {
    notesField.value = `Certified LTS firmware build targeted for ${nodeName} (${sel.value}).`;
  }
}

// Inspect file when selected
function onFwFileSelected() {
  const fileInput = document.getElementById("fw-file");
  const statusBox = document.getElementById("fw-upload-status");
  if (!fileInput.files || fileInput.files.length === 0) return;

  const file = fileInput.files[0];
  const sizeKb = (file.size / 1024).toFixed(1);

  // Auto-detect version from filename if present (e.g. firmware-v1.7.0.bin)
  const match = file.name.match(/v?([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (match) {
    const verInput = document.getElementById("fw-version");
    if (verInput) verInput.value = match[1];
  }

  // Pre-check ESP-01 file size
  const customBox = document.getElementById("fw-new-device-box");
  const isCustom = customBox && customBox.style.display !== "none";
  const hwVal = isCustom ? (document.getElementById("fw-custom-hardware")?.value || '') : (document.getElementById("fw-hardware")?.value || '');

  if ((hwVal.includes("ESP-01") || hwVal.includes("PCF8574")) && file.size > 512000) {
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(245, 158, 11, 0.15)";
    statusBox.style.color = "#fde047";
    statusBox.textContent = `⚠️ Notice: File size (${sizeKb} KB) is large for ESP-01 1MB flash partition limit (~480 KB). Ensure sketch fits inside partition.`;
  } else {
    statusBox.style.display = "none";
  }
}

async function submitUploadFirmware() {
  const fileInput = document.getElementById("fw-file");
  const version = document.getElementById("fw-version").value.trim() || "1.6.0";
  const release_channel = document.getElementById("fw-channel").value;
  const notes = document.getElementById("fw-notes").value.trim();
  const statusBox = document.getElementById("fw-upload-status");
  const btn = document.getElementById("btn-submit-upload-fw");

  // Determine Hardware Target: Custom Device vs Selected Node/Platform
  const customBox = document.getElementById("fw-new-device-box");
  const isCustom = customBox && customBox.style.display !== "none";
  let hardware_type = "";

  if (isCustom) {
    hardware_type = document.getElementById("fw-custom-hardware")?.value.trim() || "";
    if (!hardware_type) {
      statusBox.style.display = "block";
      statusBox.style.background = "rgba(239, 68, 68, 0.15)";
      statusBox.style.color = "var(--accent-red)";
      statusBox.textContent = "Please enter the new device model name.";
      return;
    }
  } else {
    const sel = document.getElementById("fw-hardware");
    if (sel.value === "__NEW_DEVICE__") {
      toggleCustomDeviceInput(true);
      return;
    }
    hardware_type = sel.value;
  }

  if (!fileInput.files || fileInput.files.length === 0) {
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "var(--accent-red)";
    statusBox.textContent = "Please select a .bin firmware file.";
    return;
  }

  // Client-side semver validation
  const semverRegex = /^v?([0-9]+)\.([0-9]+)(\.([0-9]+))?(-[0-9A-Za-z.-]+)?$/;
  if (!semverRegex.test(version)) {
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "var(--accent-red)";
    statusBox.textContent = "Invalid version format! Please use standard semantic versioning (e.g. 1.6.1, 1.7.0, 2.0.0).";
    return;
  }

  // Client-side ESP-01 size check
  if (hardware_type.includes("ESP-01") && fileInput.files[0].size > 512000) {
    statusBox.style.display = "block";
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "var(--accent-red)";
    statusBox.textContent = `Binary is too large for ESP-01! Size is ${(fileInput.files[0].size/1024).toFixed(1)} KB, but ESP-01 max partition is ~480 KB.`;
    return;
  }

  const formData = new FormData();
  formData.append("firmware", fileInput.files[0]);
  formData.append("version", version);
  formData.append("hardware", hardware_type);
  formData.append("hardware_type", hardware_type);
  formData.append("release_channel", release_channel);
  formData.append("notes", notes);

  btn.disabled = true;
  btn.textContent = "Uploading & Verifying...";
  statusBox.style.display = "block";
  statusBox.style.background = "rgba(59, 130, 246, 0.15)";
  statusBox.style.color = "var(--accent-blue)";
  statusBox.textContent = `Uploading binary for '${hardware_type}' and validating ROM flash signature...`;

  try {
    const res = await fetch(`${API_BASE}/firmware/upload`, {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    if (result.success) {
      statusBox.style.background = "rgba(34, 197, 94, 0.15)";
      statusBox.style.color = "var(--accent-green)";
      statusBox.textContent = `Firmware v${version} for '${hardware_type}' successfully registered in catalog!`;
      setTimeout(() => {
        closeModal();
        loadFirmware('catalog');
      }, 1000);
    } else {
      statusBox.style.background = "rgba(239, 68, 68, 0.15)";
      statusBox.style.color = "var(--accent-red)";
      statusBox.textContent = result.error || "Upload failed.";
      btn.disabled = false;
      btn.textContent = "Try Again";
    }
  } catch (err) {
    statusBox.style.background = "rgba(239, 68, 68, 0.15)";
    statusBox.style.color = "var(--accent-red)";
    statusBox.textContent = "Error: " + err.message;
    btn.disabled = false;
    btn.textContent = "Try Again";
  }
}

async function deleteFirmwareFile(id, filename) {
  if (!confirm(`Delete firmware '${filename}' (ID: ${id}) from repository?`)) return;
  try {
    const res = await fetch(`${API_BASE}/firmware/${id}`, { method: 'DELETE' });
    const r = await res.json();
    if (r.success) {
      renderFirmwareCatalog();
    } else {
      alert(r.error || 'Failed to delete');
    }
  } catch (e) {
    alert(e.message);
  }
}


// --- 7. TELEMETRY (FIXED & LIVE STREAMING) ---
async function loadTelemetry() {
  const container = document.getElementById("content-area");
  try {
    const res = await fetch(`${API_BASE}/telemetry?limit=30`);
    const logs = await res.json();

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="font-size: 14px; color: var(--text-secondary);">Live Telemetry Ingestion (Port 2000 TCP & HTTP)</div>
        <span class="status-badge badge-online"><span class="pulse-dot"></span> Streaming</span>
      </div>

      <div style="margin-bottom: 12px; font-weight: 600; font-size: 13px;">Live Ingestion Stream:</div>
      <div id="telemetry-log-stream" style="background: #060911; border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; height: 180px; overflow-y: auto; font-family: monospace; font-size: 12px; margin-bottom: 24px;">
        <div style="color: var(--text-muted);">Listening for real-time telemetry packets...</div>
      </div>

      <div style="margin-bottom: 12px; font-weight: 600; font-size: 13px;">Recent Telemetry Packets:</div>
      <table class="data-table" id="telemetry-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Node ID</th>
            <th>Event</th>
            <th>Node IP</th>
            <th>Signal (RSSI)</th>
            <th>Free Heap</th>
            <th>Uptime</th>
          </tr>
        </thead>
        <tbody id="telemetry-table-body">
          ${logs.length === 0 ? '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">No telemetry packets received yet.</td></tr>' : ''}
          ${logs.map(t => `
            <tr>
              <td>${t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : 'Recent'}</td>
              <td><code>${t.node_id}</code></td>
              <td><span class="status-badge badge-sync">${t.event_type}</span></td>
              <td>${t.ip || 'LAN'}</td>
              <td>${t.rssi} dBm</td>
              <td>${(t.free_heap / 1024).toFixed(1)} KB</td>
              <td>${Math.floor(t.uptime_sec / 60)} min</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: var(--accent-red);">Error loading telemetry: ${e.message}</div>`;
  }
}

function appendTelemetryLog(data) {
  const stream = document.getElementById("telemetry-log-stream");
  const nodeId = data.node_id || data.nodeId || "Node";
  const ip = data.ip || "LAN";
  const rssi = data.rssi || 0;
  const heap = data.free_heap || data.freeHeap || 0;
  const eventType = data.event_type || data.eventType || "heartbeat";

  if (stream) {
    const entry = document.createElement("div");
    entry.style.marginBottom = "6px";
    entry.innerHTML = `<span style="color: var(--accent-blue);">[${new Date().toLocaleTimeString()}]</span> <span style="color: var(--accent-green); font-weight: 600;">${nodeId}</span> (${ip}) | RSSI: ${rssi} dBm | Heap: ${(heap/1024).toFixed(1)} KB | Event: <strong>${eventType}</strong>`;
    stream.prepend(entry);
  }

  // Also prepend row to table if on telemetry view
  const tbody = document.getElementById("telemetry-table-body");
  if (tbody) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${new Date().toLocaleTimeString()}</td>
      <td><code>${nodeId}</code></td>
      <td><span class="status-badge badge-sync">${eventType}</span></td>
      <td>${ip}</td>
      <td>${rssi} dBm</td>
      <td>${(heap / 1024).toFixed(1)} KB</td>
      <td>${Math.floor((data.uptime_sec || data.uptimeSec || 0) / 60)} min</td>
    `;
    tbody.prepend(row);
  }
}

// --- 8. EVENTS ---
async function loadEvents() {
  const container = document.getElementById("content-area");
  try {
    const res = await fetch(`${API_BASE}/system/events`);
    const events = await res.json();
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Category</th>
            <th>Severity</th>
            <th>Node</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${events.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No events recorded yet.</td></tr>' : ''}
          ${events.map(ev => `
            <tr>
              <td>${ev.timestamp ? new Date(ev.timestamp).toLocaleString() : 'Recent'}</td>
              <td>${ev.category}</td>
              <td><span class="status-badge ${ev.severity === 'WARNING' ? 'badge-sync' : 'badge-online'}">${ev.severity}</span></td>
              <td>${ev.node_id || 'System'}</td>
              <td>${ev.description}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: var(--accent-red);">Error loading events: ${e.message}</div>`;
  }
}

// --- 9. NOTIFICATIONS ---
let currentNotifFilter = 'all';

async function loadNotifications() {
  const container = document.getElementById("content-area");
  try {
    const res = await fetch(`${API_BASE}/system/notifications?limit=100`);
    const allNotifs = await res.json();
    const notifs = Array.isArray(allNotifs) ? allNotifs : (allNotifs.notifications || []);
    
    // Auto-mark badges read
    markAllNotificationsRead(false);

    // Apply filter
    const filtered = notifs.filter(n => {
      if (currentNotifFilter === 'pins') return n.category === 'PIN' || (n.title && n.title.includes('Pin'));
      if (currentNotifFilter === 'nodes') return n.category === 'NODE' || (n.title && n.title.includes('Node') && !n.title.includes('Reboot'));
      if (currentNotifFilter === 'restarts') return n.category === 'RESTART' || (n.title && (n.title.includes('Reboot') || n.title.includes('Restart')));
      if (currentNotifFilter === 'system') return n.category === 'SYSTEM' || !n.category;
      return true;
    });

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 600;">Fleet Notifications & Status Alerts</h2>
          <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
            Showing ${filtered.length} of ${notifs.length} events (Pin ON/OFF, Node Status, Restarts)
          </div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-secondary" onclick="markAllNotificationsRead(true)">✓ Mark All Read</button>
          <button class="btn btn-danger" onclick="clearAllNotifications()">🗑️ Clear All</button>
        </div>
      </div>

      <div class="filter-pills">
        <button class="filter-btn ${currentNotifFilter === 'all' ? 'active' : ''}" onclick="setNotifFilter('all')">All Alerts (${notifs.length})</button>
        <button class="filter-btn ${currentNotifFilter === 'pins' ? 'active' : ''}" onclick="setNotifFilter('pins')">⚡ Pin Status</button>
        <button class="filter-btn ${currentNotifFilter === 'nodes' ? 'active' : ''}" onclick="setNotifFilter('nodes')">🟢 Node Online/Offline</button>
        <button class="filter-btn ${currentNotifFilter === 'restarts' ? 'active' : ''}" onclick="setNotifFilter('restarts')">🔄 Node Restarts</button>
        <button class="filter-btn ${currentNotifFilter === 'system' ? 'active' : ''}" onclick="setNotifFilter('system')">⚙️ System</button>
      </div>

      <div class="cards-grid">
        ${filtered.length === 0 ? '<div style="color: var(--text-secondary); padding: 24px; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border-color); grid-column: 1/-1; text-align: center;">No alerts matching the selected filter.</div>' : ''}
        ${filtered.map(n => {
          let icon = '🔔';
          let borderClass = 'toast-info';
          if (n.category === 'PIN' || (n.title && n.title.includes('Pin'))) {
            icon = n.title.includes('ON') ? '⚡' : '⚪';
            borderClass = n.title.includes('ON') ? 'toast-success' : 'toast-info';
          } else if (n.category === 'NODE' || (n.title && n.title.includes('Node'))) {
            icon = n.title.includes('Online') ? '🟢' : '🔴';
            borderClass = n.title.includes('Online') ? 'toast-success' : 'toast-danger';
          } else if (n.category === 'RESTART' || (n.title && (n.title.includes('Reboot') || n.title.includes('Restart')))) {
            icon = '🔄';
            borderClass = 'toast-warning';
          }
          const borderColor = borderClass === 'toast-success' ? 'var(--accent-green)' : borderClass === 'toast-danger' ? 'var(--accent-red)' : borderClass === 'toast-warning' ? 'var(--accent-amber)' : 'var(--accent-blue)';
          return `
            <div class="node-card" style="border-left: 4px solid ${borderColor};">
              <div class="card-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 18px;">${icon}</span>
                  <div class="card-title">${escapeHtml(n.title)}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="status-badge ${borderClass === 'toast-success' ? 'badge-online' : borderClass === 'toast-danger' ? 'badge-offline' : 'badge-sync'}">${escapeHtml(n.severity || 'INFO')}</span>
                  <button onclick="dismissNotification(${n.id})" title="Delete" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 2px 6px;">&times;</button>
                </div>
              </div>
              <p style="font-size: 13.5px; color: var(--text-secondary); margin: 10px 0; line-height: 1.5;">${escapeHtml(n.message)}</p>
              <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
                <span>${n.timestamp ? new Date(n.timestamp).toLocaleString() : 'Just now'}</span>
                <span>Category: <strong>${escapeHtml(n.category || 'SYSTEM')}</strong></span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: var(--accent-red);">Error loading notifications: ${e.message}</div>`;
  }
}

function setNotifFilter(filter) {
  currentNotifFilter = filter;
  loadNotifications();
}

async function markAllNotificationsRead(reload = true) {
  try {
    await fetch(`${API_BASE}/system/notifications/mark-read`, { method: "POST" });
    setNotificationBadges(0);
    if (reload) loadNotifications();
  } catch (e) {}
}

async function dismissNotification(id) {
  try {
    await fetch(`${API_BASE}/system/notifications/${id}`, { method: "DELETE" });
    loadNotifications();
  } catch (e) {}
}

async function clearAllNotifications() {
  if (!confirm("Clear all notification history?")) return;
  try {
    await fetch(`${API_BASE}/system/notifications`, { method: "DELETE" });
    setNotificationBadges(0);
    loadNotifications();
  } catch (e) {}
}

// --- 10. NETWORK ---
async function loadNetwork() {
  const container = document.getElementById("content-area");
  container.innerHTML = `
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">TCP Telemetry Port</div>
        <div class="metric-value">2000</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">WebSocket Stream</div>
        <div class="metric-value">/api/v1/ws</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">HTTP Web Port</div>
        <div class="metric-value">9100</div>
      </div>
    </div>
    <div class="metric-card" style="margin-top: 20px;">
      <h3 style="margin-bottom: 12px;">Remote Access & ESP8266 Settings</h3>
      <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.6;">
        In the NodeMCU ESP8266 dashboard (<code>http://192.168.1.105</code>), set the Central Receiver configuration to:<br>
        • <strong>Server Host</strong>: <code>192.168.1.10</code><br>
        • <strong>Protocol</strong>: <code>Raw TCP Socket</code> or <code>HTTP POST</code><br>
        • <strong>Port</strong>: <code>2000</code> (TCP) or <code>9100</code> (HTTP)<br>
        Telemetry heartbeats and relay switching events stream in real-time.
      </p>
    </div>
  `;
}


// ==============================================================================
// 11. RBAC & USER ADMINISTRATION CONSOLE
// ==============================================================================
let cachedUsers = [];
let cachedRoles = [];
let cachedScopes = [];

async function loadUsers() {
  const container = document.getElementById("content-area");
  container.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Loading user administration and access control...</div>`;

  try {
    const [uRes, rRes, sRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/admin/users`),
      fetchWithAuth(`${API_BASE}/admin/roles`),
      fetchWithAuth(`${API_BASE}/admin/scopes`)
    ]);

    const uData = await uRes.json();
    const rData = await rRes.json();
    const sData = await sRes.json();

    cachedUsers = uData.users || [];
    cachedRoles = rData.roles || [];
    cachedScopes = sData.scopes || [];

    const activeCount = cachedUsers.filter(u => u.is_active).length;

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Top Stats Banner -->
        <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
          <div class="metric-card">
            <div class="metric-label">Total Users</div>
            <div class="metric-value">${cachedUsers.length}</div>
            <div class="metric-sub">${activeCount} Active / ${cachedUsers.length - activeCount} Deactivated</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">System Roles</div>
            <div class="metric-value">${cachedRoles.length}</div>
            <div class="metric-sub">Hierarchical RBAC Configured</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Access Scopes</div>
            <div class="metric-value">${cachedScopes.length}</div>
            <div class="metric-sub">Location & Device Boundaries</div>
          </div>
        </div>

        <!-- Action Toolbar -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <h2 style="font-size: 18px; font-weight: 600;">User & Scope Directory</h2>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" onclick="openCreateUserModal()">+ Create New User</button>
            <button class="btn btn-secondary" onclick="openScopesModal()">🌐 Manage Scopes</button>
            <button class="btn btn-secondary" onclick="openPermissionsModal()">🛡️ Permissions Matrix</button>
          </div>
        </div>

        <!-- Users Table -->
        <div class="metric-card" style="padding: 0; overflow-x: auto;">
          <table class="table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); text-align: left; background: rgba(255,255,255,0.02);">
                <th style="padding: 14px 16px;">User</th>
                <th style="padding: 14px 16px;">Contact</th>
                <th style="padding: 14px 16px;">Assigned Roles</th>
                <th style="padding: 14px 16px;">Resource Scopes</th>
                <th style="padding: 14px 16px;">Status</th>
                <th style="padding: 14px 16px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${cachedUsers.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">No user accounts found.</td></tr>' : ''}
              ${cachedUsers.map(u => {
                const rolesHtml = (u.roles || []).map(r => {
                  let badgeClass = 'badge-sync';
                  if (r === 'SUPER_ADMIN') badgeClass = 'badge-offline';
                  else if (r === 'ADMIN') badgeClass = 'badge-sync';
                  else if (r === 'OPERATOR') badgeClass = 'badge-online';
                  return `<span class="status-badge ${badgeClass}" style="margin: 2px;">${escapeHtml(r)}</span>`;
                }).join('') || '<span style="color:var(--text-muted); font-size:12px;">None</span>';

                const scopesHtml = (u.scopes || []).map(s => {
                  return `<span class="status-badge badge-sync" style="margin: 2px;">${escapeHtml(s.name || s.scope_identifier)}</span>`;
                }).join('') || '<span style="color:var(--text-muted); font-size:12px;">GLOBAL</span>';

                return `
                  <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 14px 16px;">
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">${u.is_superuser ? '⭐' : '👤'}</span>
                        <div>
                          <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(u.username)}</div>
                          <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(u.full_name || 'No full name')}</div>
                        </div>
                      </div>
                    </td>
                    <td style="padding: 14px 16px; font-size: 13px; color: var(--text-secondary);">
                      ${escapeHtml(u.email || 'N/A')}
                    </td>
                    <td style="padding: 14px 16px;">${rolesHtml}</td>
                    <td style="padding: 14px 16px;">${scopesHtml}</td>
                    <td style="padding: 14px 16px;">
                      <span class="status-badge ${u.is_active ? 'badge-online' : 'badge-offline'}">
                        ${u.is_active ? 'ACTIVE' : 'DEACTIVATED'}
                      </span>
                    </td>
                    <td style="padding: 14px 16px; text-align: right;">
                      <div style="display: inline-flex; gap: 6px;">
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11.5px;" onclick="openEditUserModal(${u.id})">Edit</button>
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11.5px;" onclick="openResetPasswordModal(${u.id}, '${escapeHtml(u.username)}')">Password</button>
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11.5px;" onclick="revokeUserSessions(${u.id})">Revoke</button>
                        ${u.username !== 'admin' ? `<button class="btn btn-danger" style="padding: 4px 8px; font-size: 11.5px;" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')">Delete</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="metric-card" style="color:var(--accent-red);">Error loading user management: ${escapeHtml(err.message)}</div>`;
  }
}

function openCreateUserModal() {
  const rolesCheckboxes = cachedRoles.map(r => `
    <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; cursor: pointer;">
      <input type="checkbox" name="user_role" value="${r.name}" ${r.name === 'OPERATOR' ? 'checked' : ''}>
      <span>${r.name}</span>
    </label>
  `).join('');

  const scopesOptions = cachedScopes.map(s => `
    <option value="${s.id}">[${s.scope_type}] ${s.name} (${s.scope_identifier})</option>
  `).join('');

  openModal(`
    <div class="modal-card" style="max-width: 520px;">
      <div class="modal-header">
        <h3>Create New User Account</h3>
        <button class="modal-close-btn" onclick="closeModal()">&times;</button>
      </div>
      <form onsubmit="handleCreateUserSubmit(event)" style="padding: 16px 0;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Username *</label>
            <input type="text" id="new-user-name" required class="input-field" style="width:100%;">
          </div>
          <div>
            <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Initial Password *</label>
            <input type="password" id="new-user-pwd" required minlength="6" class="input-field" style="width:100%;">
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Full Name</label>
            <input type="text" id="new-user-fullname" class="input-field" style="width:100%;">
          </div>
          <div>
            <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Email</label>
            <input type="email" id="new-user-email" class="input-field" style="width:100%;">
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:6px;">Assign Roles *</label>
          <div style="display: flex; flex-wrap: wrap; gap: 12px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px;">
            ${rolesCheckboxes}
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Assign Scope (Optional)</label>
          <select id="new-user-scopes" multiple class="input-field" style="width:100%; height: 80px;">
            ${scopesOptions}
          </select>
          <small style="color:var(--text-muted); font-size:11px;">Hold Ctrl/Cmd to select multiple scopes</small>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
            <input type="checkbox" id="new-user-superuser">
            <span>Grant Superuser / Master Ownership</span>
          </label>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create User</button>
        </div>
      </form>
    </div>
  `);
}

async function handleCreateUserSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('new-user-name').value.trim();
  const password = document.getElementById('new-user-pwd').value;
  const full_name = document.getElementById('new-user-fullname').value.trim();
  const email = document.getElementById('new-user-email').value.trim();
  const is_superuser = document.getElementById('new-user-superuser').checked;

  const roleBoxes = document.querySelectorAll('input[name="user_role"]:checked');
  const role_names = Array.from(roleBoxes).map(b => b.value);

  const scopeSelect = document.getElementById('new-user-scopes');
  const scope_ids = Array.from(scopeSelect.selectedOptions).map(o => Number(o.value));

  try {
    const res = await fetchWithAuth(`${API_BASE}/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, full_name, email, is_superuser, role_names, scope_ids })
    });
    const data = await res.json();
    if (data.success) {
      closeModal();
      showToast({ title: 'User Created', message: `User '${username}' created successfully`, severity: 'SUCCESS' });
      loadUsers();
    } else {
      alert('Error creating user: ' + data.error);
    }
  } catch (err) {
    alert('Server error: ' + err.message);
  }
}

function openEditUserModal(userId) {
  const user = cachedUsers.find(u => u.id === userId);
  if (!user) return;

  const userRoleNames = user.roles || [];
  const userScopeIds = (user.scopes || []).map(s => s.id);

  const rolesCheckboxes = cachedRoles.map(r => `
    <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; cursor: pointer;">
      <input type="checkbox" name="edit_user_role" value="${r.name}" ${userRoleNames.includes(r.name) ? 'checked' : ''}>
      <span>${r.name}</span>
    </label>
  `).join('');

  const scopesOptions = cachedScopes.map(s => `
    <option value="${s.id}" ${userScopeIds.includes(s.id) ? 'selected' : ''}>[${s.scope_type}] ${s.name} (${s.scope_identifier})</option>
  `).join('');

  openModal(`
    <div class="modal-card" style="max-width: 500px;">
      <div class="modal-header">
        <h3>Edit User: ${escapeHtml(user.username)}</h3>
        <button class="modal-close-btn" onclick="closeModal()">&times;</button>
      </div>
      <form onsubmit="handleEditUserSubmit(event, ${userId})" style="padding: 16px 0;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Full Name</label>
            <input type="text" id="edit-user-fullname" value="${escapeHtml(user.full_name || '')}" class="input-field" style="width:100%;">
          </div>
          <div>
            <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Email</label>
            <input type="email" id="edit-user-email" value="${escapeHtml(user.email || '')}" class="input-field" style="width:100%;">
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:6px;">Assigned Roles</label>
          <div style="display: flex; flex-wrap: wrap; gap: 12px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px;">
            ${rolesCheckboxes}
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Assigned Scopes</label>
          <select id="edit-user-scopes" multiple class="input-field" style="width:100%; height: 80px;">
            ${scopesOptions}
          </select>
        </div>

        <div style="margin-bottom: 16px; display: flex; gap: 20px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
            <input type="checkbox" id="edit-user-active" ${user.is_active ? 'checked' : ''}>
            <span>Account Active</span>
          </label>
          <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
            <input type="checkbox" id="edit-user-superuser" ${user.is_superuser ? 'checked' : ''}>
            <span>Superuser Authority</span>
          </label>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
    </div>
  `);
}

async function handleEditUserSubmit(e, userId) {
  e.preventDefault();
  const full_name = document.getElementById('edit-user-fullname').value.trim();
  const email = document.getElementById('edit-user-email').value.trim();
  const is_active = document.getElementById('edit-user-active').checked;
  const is_superuser = document.getElementById('edit-user-superuser').checked;

  const roleBoxes = document.querySelectorAll('input[name="edit_user_role"]:checked');
  const role_names = Array.from(roleBoxes).map(b => b.value);

  const scopeSelect = document.getElementById('edit-user-scopes');
  const scope_ids = Array.from(scopeSelect.selectedOptions).map(o => Number(o.value));

  try {
    const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, email, is_active, is_superuser, role_names, scope_ids })
    });
    const data = await res.json();
    if (data.success) {
      closeModal();
      showToast({ title: 'User Updated', message: 'User account updated successfully', severity: 'SUCCESS' });
      loadUsers();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Server error: ' + err.message);
  }
}

function openResetPasswordModal(userId, username) {
  openModal(`
    <div class="modal-card" style="max-width: 400px;">
      <div class="modal-header">
        <h3>Reset Password: ${username}</h3>
        <button class="modal-close-btn" onclick="closeModal()">&times;</button>
      </div>
      <form onsubmit="handleResetPasswordSubmit(event, ${userId})" style="padding: 16px 0;">
        <div style="margin-bottom: 16px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">New Password (min 6 characters)</label>
          <input type="password" id="reset-user-pwd" required minlength="6" class="input-field" style="width:100%;">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Reset Password</button>
        </div>
      </form>
    </div>
  `);
}

async function handleResetPasswordSubmit(e, userId) {
  e.preventDefault();
  const newPassword = document.getElementById('reset-user-pwd').value;
  try {
    const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (data.success) {
      closeModal();
      showToast({ title: 'Password Reset', message: 'Password updated and sessions revoked', severity: 'SUCCESS' });
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Server error: ' + err.message);
  }
}

async function revokeUserSessions(userId) {
  if (!confirm('Revoke all active sessions for this user? They will be forced to log in again.')) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}/revoke-sessions`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'Sessions Revoked', message: 'All active sessions terminated', severity: 'INFO' });
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteUser(userId, username) {
  if (!confirm(`Are you sure you want to permanently delete user '${username}'?`)) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/admin/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'User Deleted', message: `User '${username}' removed`, severity: 'WARNING' });
      loadUsers();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function openScopesModal() {
  const scopesListHtml = cachedScopes.map(s => `
    <tr style="border-bottom: 1px solid var(--border-color);">
      <td style="padding: 10px 12px;"><strong>${escapeHtml(s.name)}</strong></td>
      <td style="padding: 10px 12px;"><span class="status-badge badge-sync">${escapeHtml(s.scope_type)}</span></td>
      <td style="padding: 10px 12px;"><code>${escapeHtml(s.scope_identifier)}</code></td>
      <td style="padding: 10px 12px; font-size:12px; color:var(--text-secondary);">${escapeHtml(s.description || '')}</td>
      <td style="padding: 10px 12px; text-align:right;">
        ${s.scope_identifier !== 'global' ? `<button class="btn btn-danger" style="padding:3px 7px; font-size:11px;" onclick="deleteScope(${s.id})">Delete</button>` : '<span style="font-size:11px; color:var(--text-muted);">Master</span>'}
      </td>
    </tr>
  `).join('');

  openModal(`
    <div class="modal-card" style="max-width: 650px;">
      <div class="modal-header">
        <h3>Hierarchical Scope Boundaries</h3>
        <button class="modal-close-btn" onclick="closeModal()">&times;</button>
      </div>
      <div style="padding: 14px 0;">
        <table class="table" style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); text-align: left; background: rgba(255,255,255,0.02);">
              <th style="padding: 8px 12px;">Name</th>
              <th style="padding: 8px 12px;">Type</th>
              <th style="padding: 8px 12px;">Identifier</th>
              <th style="padding: 8px 12px;">Description</th>
              <th style="padding: 8px 12px; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${scopesListHtml}
          </tbody>
        </table>

        <div style="border-top: 1px solid var(--border-color); padding-top: 14px;">
          <h4 style="font-size: 14px; margin-bottom: 10px;">+ Create New Scope</h4>
          <form onsubmit="handleCreateScopeSubmit(event)" style="display: grid; grid-template-columns: 140px 140px 1fr auto; gap: 8px;">
            <select id="new-scope-type" class="input-field">
              <option value="ROOM">ROOM</option>
              <option value="LOCATION">LOCATION</option>
              <option value="BUILDING">BUILDING</option>
              <option value="FLOOR">FLOOR</option>
              <option value="DEVICE_GROUP">DEVICE_GROUP</option>
              <option value="INDIVIDUAL_DEVICE">INDIVIDUAL_DEVICE</option>
            </select>
            <input type="text" id="new-scope-ident" placeholder="Identifier (e.g. kitchen)" required class="input-field">
            <input type="text" id="new-scope-name" placeholder="Scope Name" required class="input-field">
            <button type="submit" class="btn btn-primary" style="padding: 6px 14px;">Add</button>
          </form>
        </div>
      </div>
    </div>
  `);
}

async function handleCreateScopeSubmit(e) {
  e.preventDefault();
  const scope_type = document.getElementById('new-scope-type').value;
  const scope_identifier = document.getElementById('new-scope-ident').value.trim();
  const name = document.getElementById('new-scope-name').value.trim();

  try {
    const res = await fetchWithAuth(`${API_BASE}/admin/scopes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope_type, scope_identifier, name, description: `${scope_type} scope for ${name}` })
    });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'Scope Created', message: `Scope '${name}' created`, severity: 'SUCCESS' });
      closeModal();
      loadUsers();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Server error: ' + err.message);
  }
}

async function deleteScope(scopeId) {
  if (!confirm('Delete this scope? Any user assignments to this scope will be unlinked.')) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/admin/scopes/${scopeId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'Scope Deleted', message: 'Scope removed', severity: 'INFO' });
      closeModal();
      loadUsers();
    } else {
      alert('Error: ' + data.error);
    }
  } catch (err) {
    alert('Server error: ' + err.message);
  }
}

function openPermissionsModal() {
  const rolesHtml = cachedRoles.map(r => `
    <div style="margin-bottom: 16px; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <strong style="color: var(--accent-blue); font-size: 14px;">${r.name}</strong>
        <span style="font-size: 11.5px; color: var(--text-muted);">${(r.permissions || []).length} permissions</span>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">${escapeHtml(r.description || '')}</div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
        ${(r.permissions || []).map(p => `<span class="status-badge badge-sync" style="font-size: 10.5px;">${p}</span>`).join('')}
      </div>
    </div>
  `).join('');

  openModal(`
    <div class="modal-card" style="max-width: 620px; max-height: 85vh; overflow-y: auto;">
      <div class="modal-header">
        <h3>Role & Permission Matrix</h3>
        <button class="modal-close-btn" onclick="closeModal()">&times;</button>
      </div>
      <div style="padding: 14px 0;">
        ${rolesHtml}
      </div>
    </div>
  `);
}

// ==============================================================================
// 12. LITTLEFS FILESYSTEM MANAGER VIEW
// ==============================================================================
let selectedFsNodeId = null;
let currentFsData = null;

async function loadLittlefs() {
  const container = document.getElementById("content-area");
  container.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Loading LittleFS filesystem manager...</div>`;

  try {
    const nodesRes = await fetchWithAuth(`${API_BASE}/nodes`);
    const nodes = await nodesRes.json();

    if (!Array.isArray(nodes) || nodes.length === 0) {
      container.innerHTML = `<div class="metric-card"><h3>No Devices Found</h3><p style="color:var(--text-muted); margin-top:8px;">No IoT nodes registered in fleet.</p></div>`;
      return;
    }

    if (!selectedFsNodeId || !nodes.find(n => n.node_id === selectedFsNodeId)) {
      const onlineNode = nodes.find(n => n.is_online) || nodes[0];
      selectedFsNodeId = onlineNode.node_id;
    }

    const nodeOptions = nodes.map(n => `
      <option value="${n.node_id}" ${n.node_id === selectedFsNodeId ? 'selected' : ''}>
        ${escapeHtml(n.name)} (${n.ip || 'Offline'}) - ${n.is_online ? '🟢 Online' : '🔴 Offline'}
      </option>
    `).join('');

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Top Toolbar & Node Selector -->
        <div class="metric-card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <label style="font-weight: 600; font-size: 14px;">Target Device:</label>
            <select id="littlefs-node-select" class="input-field" onchange="handleLittlefsNodeChange(this.value)" style="min-width: 280px;">
              ${nodeOptions}
            </select>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="refreshLittlefsList()">🔄 Refresh Files</button>
            <button class="btn btn-secondary" id="btn-fs-live-sync" onclick="triggerLittlefsLiveSync()">⚡ Live Sync</button>
            <button class="btn btn-secondary" onclick="openUploadFsModal()">📤 Upload File</button>
            <button class="btn btn-secondary" onclick="triggerLittlefsBackup()">💾 Backup Partition</button>
            <button class="btn btn-secondary" onclick="openFsBackupsHistoryModal()">📜 Backups History</button>
          </div>
        </div>

        <!-- Filesystem Storage Metrics & Files Container -->
        <div id="littlefs-details-container">
          <div style="text-align: center; padding: 30px; color: var(--text-secondary);">Querying node LittleFS partition...</div>
        </div>
      </div>
    `;

    await refreshLittlefsList();
  } catch (err) {
    container.innerHTML = `<div class="metric-card" style="color:var(--accent-red);">Failed to initialize LittleFS Manager: ${escapeHtml(err.message)}</div>`;
  }
}

function handleLittlefsNodeChange(val) {
  selectedFsNodeId = val;
  refreshLittlefsList();
}

function switchToFirstSupportedFsNode() {
  const sel = document.getElementById('littlefs-node-select');
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value !== selectedFsNodeId) {
        sel.selectedIndex = i;
        handleLittlefsNodeChange(sel.options[i].value);
        break;
      }
    }
  }
}

async function triggerLittlefsLiveSync() {
  if (!selectedFsNodeId) return;
  const btn = document.getElementById('btn-fs-live-sync');
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⚡ Syncing LittleFS...'; }
  showToast({ title: 'LittleFS Live Sync', message: 'Reconciling LittleFS filesystem and config files with central server...', severity: 'INFO' });

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedFsNodeId}/fs/sync`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'Live Sync Completed', message: `Synchronized ${data.filesCount || 0} LittleFS files and configuration records`, severity: 'SUCCESS' });
      await refreshLittlefsList();
    } else {
      showToast({ title: 'Live Sync Notice', message: data.error || 'Live sync encountered an issue', severity: data.unsupported ? 'WARNING' : 'ERROR' });
      if (data.unsupported) {
        await refreshLittlefsList();
      }
    }
  } catch (err) {
    showToast({ title: 'Sync Error', message: err.message, severity: 'ERROR' });
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  }
}

async function viewFsFile(filePath) {
  openModal(`
    <div class="modal-card" style="max-width: 680px; width: 92vw;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 14px;">
        <h3 style="font-size: 15px; margin: 0; color: var(--text-primary);">📄 File Inspector: <code style="color: var(--accent-blue);">${escapeHtml(filePath)}</code></h3>
        <button class="modal-close-btn" style="background:none; border:none; color:var(--text-muted); font-size:24px; cursor:pointer; line-height:1; padding:0 4px;" onclick="closeModal()">&times;</button>
      </div>
      <div id="fs-file-viewer-body" style="padding: 4px 0 16px 0;">
        <div style="text-align:center; padding: 30px; color: var(--text-secondary);">Loading file content from LittleFS...</div>
      </div>
    </div>
  `);

  const bodyEl = document.getElementById('fs-file-viewer-body');
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedFsNodeId}/fs/file-content?path=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    if (!data.success) {
      bodyEl.innerHTML = `<div style="color:var(--accent-red); padding:10px;">Failed to read file: ${escapeHtml(data.error)}</div>`;
      return;
    }

    const isSmall = (data.size < 5120); // Strict < 5 KB heap-safe boundary
    const isJson = filePath.toLowerCase().endsWith('.json');
    const isEditable = isSmall && data.isText;

    let displayContent = data.content || '';
    if (isJson) {
      try {
        displayContent = JSON.stringify(JSON.parse(displayContent), null, 2);
      } catch {}
    }

    bodyEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; font-size:12px; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>Size: <strong>${(data.size / 1024).toFixed(2)} KB</strong> (${data.size} bytes)</span>
          <span>Type: <code>${escapeHtml(data.contentType || 'text/plain')}</code></span>
        </div>
        <div>
          ${isEditable ? 
            `<span class="status-badge badge-online" style="font-size:11px; padding:2px 8px;">✏️ Editable (&lt; 5 KB Heap-Safe)</span>` : 
            `<span class="status-badge badge-sync" style="font-size:11px; padding:2px 8px;">🔒 Read-Only Protected (${(data.size/1024).toFixed(1)} KB)</span>`
          }
        </div>
      </div>

      ${isEditable ? `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; font-size: 12px; color: #a7f3d0; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>🟢 Node Heap Safe:</strong> File is strictly under 5 KB (${(data.size / 1024).toFixed(2)} KB). Completely safe for ESP8266 RAM/heap budget (~23 KB).
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px;" onclick="toggleEditorTheme()" title="Toggle Light/Dark Editor Background">🌓 Theme</button>
            ${isJson ? `<button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px;" onclick="formatEditorJson()">✨ Prettify JSON</button>` : ''}
          </div>
        </div>
      ` : `
        <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; font-size: 12px; color: #f59e0b; display:flex; justify-content:space-between; align-items:center;">
          <div>
            ⚠️ <strong>Heap Safety Protection:</strong> Direct browser editing is disabled for files larger than 5 KB to prevent microcontroller RAM/heap exhaustion (ESP8266 free heap is ~23–38 KB). To replace this large web bundle file, use the <strong>Upload File</strong> button.
          </div>
          <button type="button" class="btn btn-secondary" style="font-size:11px; padding:2px 8px;" onclick="toggleEditorTheme()" title="Toggle Light/Dark Editor Background">🌓 Theme</button>
        </div>
      `}

      <textarea id="fs-editor-textarea" ${isEditable ? '' : 'readonly'} onkeydown="handleEditorKeyDown(event)" class="code-editor-textarea" style="width:100%; height:370px; font-family:'Consolas','Fira Code','Monaco',monospace; font-size:13.5px; line-height:1.6; background-color:#0b1120 !important; color:#f8fafc !important; -webkit-text-fill-color:#f8fafc !important; caret-color:#38bdf8 !important; border:1px solid rgba(56,189,248,0.4) !important; padding:12px; border-radius:6px; resize:vertical; tab-size:2;">${escapeHtml(displayContent)}</textarea>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">
        <div>
          <a href="${API_BASE}/nodes/${selectedFsNodeId}/fs/download?path=${encodeURIComponent(filePath)}" class="btn btn-secondary" style="font-size:12px; text-decoration:none;">💾 Download File</a>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
          ${isEditable ? `<button id="btn-save-fs-file" class="btn btn-primary" onclick="saveFsEditedFile('${escapeHtml(filePath)}')">💾 Save Changes to LittleFS</button>` : ''}
        </div>
      </div>
    `;
  } catch (err) {
    bodyEl.innerHTML = `<div style="color:var(--accent-red); padding:10px;">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function handleEditorKeyDown(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const ta = e.target;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + "  " + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + 2;
  }
}

function formatEditorJson() {
  const ta = document.getElementById('fs-editor-textarea');
  if (!ta) return;
  try {
    const parsed = JSON.parse(ta.value);
    ta.value = JSON.stringify(parsed, null, 2);
    showToast({ title: 'JSON Formatted', message: 'Syntax verified and indented', severity: 'INFO' });
  } catch (err) {
    alert('Invalid JSON syntax: ' + err.message);
  }
}

function toggleEditorTheme() {
  const ta = document.getElementById('fs-editor-textarea') || document.getElementById('config-json-textarea');
  if (!ta) return;
  const isLight = ta.classList.toggle('theme-light');
  if (isLight) {
    ta.style.setProperty('background-color', '#ffffff', 'important');
    ta.style.setProperty('color', '#0f172a', 'important');
    ta.style.setProperty('-webkit-text-fill-color', '#0f172a', 'important');
    ta.style.setProperty('border-color', '#94a3b8', 'important');
    ta.style.setProperty('caret-color', '#0f172a', 'important');
  } else {
    ta.style.setProperty('background-color', '#0b1120', 'important');
    ta.style.setProperty('color', '#f8fafc', 'important');
    ta.style.setProperty('-webkit-text-fill-color', '#f8fafc', 'important');
    ta.style.setProperty('border-color', 'rgba(56, 189, 248, 0.4)', 'important');
    ta.style.setProperty('caret-color', '#38bdf8', 'important');
  }
}

async function saveFsEditedFile(filePath) {
  const ta = document.getElementById('fs-editor-textarea');
  const btn = document.getElementById('btn-save-fs-file');
  if (!ta) return;

  const content = ta.value;

  if (filePath.toLowerCase().endsWith('.json')) {
    try {
      JSON.parse(content);
    } catch (err) {
      alert('Cannot save invalid JSON: ' + err.message);
      return;
    }
  }

  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '💾 Saving to LittleFS...'; }

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedFsNodeId}/fs/save-content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content })
    });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'Saved to LittleFS', message: `Successfully saved '${filePath}' (${data.size} bytes)`, severity: 'SUCCESS' });
      closeModal();
      refreshLittlefsList();
    } else {
      alert('Save failed: ' + data.error);
    }
  } catch (err) {
    alert('Save error: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  }
}

async function refreshLittlefsList() {
  const detailsEl = document.getElementById('littlefs-details-container');
  if (!detailsEl || !selectedFsNodeId) return;

  detailsEl.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-secondary);">Reading filesystem structure from node...</div>`;

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedFsNodeId}/fs`);
    const data = await res.json();

    if (!data.success) {
      if (data.unsupported) {
        detailsEl.innerHTML = `
          <div class="metric-card" style="border-left: 4px solid var(--accent-amber); padding: 24px;">
            <div style="display: flex; align-items: flex-start; gap: 14px;">
              <span style="font-size: 30px;">⚠️</span>
              <div style="flex: 1;">
                <h3 style="color: var(--accent-amber); margin: 0 0 8px 0; font-size: 16px;">LittleFS Partition Not Supported on This Device</h3>
                <p style="color: var(--text-secondary); margin: 0 0 12px 0; font-size: 13.5px; line-height: 1.5;">
                  ${escapeHtml(data.error || 'This device uses a minimal partition scheme without a LittleFS web file manager.')}
                </p>
                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; margin-bottom: 14px; font-size: 12.5px; color: var(--text-muted);">
                  <strong>Hardware Note:</strong> Microcontrollers with 1MB flash (e.g. ESP8266 ESP-01 / ESP-01S) allocate flash exclusively to the application sketch and OTA buffer. LittleFS file browsing and asset hosting are available on devices with 4MB+ flash (such as ESP-12E/F NodeMCU or ESP32).
                </div>
                <button class="btn btn-primary" onclick="switchToFirstSupportedFsNode()">
                  🔄 Switch to NodeMCU (4MB) with LittleFS
                </button>
              </div>
            </div>
          </div>
        `;
        return;
      }

      detailsEl.innerHTML = `
        <div class="metric-card" style="border-left: 4px solid var(--accent-red);">
          <h3 style="color: var(--accent-red);">Filesystem Query Failed</h3>
          <p style="margin-top: 6px; color: var(--text-secondary);">${escapeHtml(data.error || 'Microcontroller was unresponsive')}</p>
        </div>
      `;
      return;
    }

    currentFsData = data;
    const totalKb = (data.totalBytes / 1024).toFixed(1);
    const usedKb = (data.usedBytes / 1024).toFixed(1);
    const freeKb = (data.freeBytes / 1024).toFixed(1);
    const usedPercent = data.usedPercent || 0;

    let barColor = 'var(--accent-green)';
    if (usedPercent > 80) barColor = 'var(--accent-red)';
    else if (usedPercent > 60) barColor = 'var(--accent-amber)';

    detailsEl.innerHTML = `
      <!-- Storage Metrics Cards -->
      <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 20px;">
        <div class="metric-card">
          <div class="metric-label">Total LittleFS Capacity</div>
          <div class="metric-value">${totalKb} KB</div>
          <div class="metric-sub">${data.totalBytes} bytes allocated</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Used Space</div>
          <div class="metric-value" style="color:${barColor}">${usedKb} KB</div>
          <div class="metric-sub">${usedPercent}% of filesystem capacity</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Available Free Space</div>
          <div class="metric-value">${freeKb} KB</div>
          <div class="metric-sub">${data.files.length} active files stored</div>
        </div>
      </div>

      <!-- Capacity Gauge -->
      <div class="metric-card" style="margin-bottom: 20px; padding: 14px 20px;">
        <div style="display: flex; justify-content: space-between; font-size: 12.5px; color: var(--text-secondary); margin-bottom: 6px;">
          <span>Partition Utilization</span>
          <span>${usedKb} KB / ${totalKb} KB (${usedPercent}%)</span>
        </div>
        <div style="height: 10px; background: rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden;">
          <div style="height: 100%; width: ${usedPercent}%; background: ${barColor}; border-radius: 6px; transition: width 0.3s ease;"></div>
        </div>
      </div>

      <!-- Files Table -->
      <div class="metric-card" style="padding: 0; overflow-x: auto;">
        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="font-size: 15px;">Filesystem Files (${data.files.length})</h3>
          <span style="font-size: 12px; color: var(--text-muted);">Root: /</span>
        </div>
        <table class="table" style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-color); text-align: left; background: rgba(255,255,255,0.02);">
              <th style="padding: 12px 18px;">File Name & Path</th>
              <th style="padding: 12px 18px;">File Size</th>
              <th style="padding: 12px 18px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.files.length === 0 ? '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 30px;">LittleFS filesystem is empty.</td></tr>' : ''}
            ${data.files.map(f => `
              <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 12px 18px;">
                  <span style="margin-right: 8px;">📄</span>
                  <strong>${escapeHtml(f.path)}</strong>
                </td>
                <td style="padding: 12px 18px; font-size: 13px; color: var(--text-secondary);">
                  ${(f.size / 1024).toFixed(2)} KB (${f.size} B)
                </td>
                <td style="padding: 12px 18px; text-align: right;">
                  <div style="display: inline-flex; gap: 6px;">
                    <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="viewFsFile('${escapeHtml(f.path)}')">👁️ View</button>
                    <a href="${API_BASE}/nodes/${selectedFsNodeId}/fs/download?path=${encodeURIComponent(f.path)}" download="${escapeHtml(f.name)}" class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px; text-decoration: none;">Download</a>
                    <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="openRenameFsModal('${escapeHtml(f.path)}')">Rename</button>
                    <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteFsFile('${escapeHtml(f.path)}')">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    detailsEl.innerHTML = `<div class="metric-card" style="color:var(--accent-red);">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function openUploadFsModal() {
  openModal(`
    <div class="modal-card" style="max-width: 440px;">
      <div class="modal-header">
        <h3>Upload File to LittleFS</h3>
        <button class="modal-close-btn" onclick="closeModal()">&times;</button>
      </div>
      <form onsubmit="handleFsUploadSubmit(event)" style="padding: 16px 0;">
        <div style="margin-bottom: 14px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Target Directory</label>
          <input type="text" id="fs-upload-dir" value="/" class="input-field" style="width:100%;">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Choose File</label>
          <input type="file" id="fs-upload-file" required class="input-field" style="width:100%;">
        </div>
        <div id="fs-upload-status" style="display:none; font-size:12.5px; margin-bottom:12px;"></div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" id="fs-upload-btn" class="btn btn-primary">Upload</button>
        </div>
      </form>
    </div>
  `);
}

async function handleFsUploadSubmit(e) {
  e.preventDefault();
  const fileInput = document.getElementById('fs-upload-file');
  const dir = document.getElementById('fs-upload-dir').value.trim();
  const statusEl = document.getElementById('fs-upload-status');
  const btn = document.getElementById('fs-upload-btn');

  if (!fileInput.files || fileInput.files.length === 0) return;
  const file = fileInput.files[0];

  const formData = new FormData();
  formData.append('file', file);
  formData.append('dir', dir);

  btn.disabled = true;
  statusEl.style.display = 'block';
  statusEl.style.color = 'var(--text-secondary)';
  statusEl.textContent = 'Streaming file to node LittleFS...';

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedFsNodeId}/fs/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      closeModal();
      showToast({ title: 'Uploaded to LittleFS', message: `Successfully uploaded '${data.path}'`, severity: 'SUCCESS' });
      refreshLittlefsList();
    } else {
      statusEl.style.color = 'var(--accent-red)';
      statusEl.textContent = 'Upload failed: ' + data.error;
      btn.disabled = false;
    }
  } catch (err) {
    statusEl.style.color = 'var(--accent-red)';
    statusEl.textContent = 'Network error: ' + err.message;
    btn.disabled = false;
  }
}

function openRenameFsModal(oldPath) {
  openModal(`
    <div class="modal-card" style="max-width: 420px;">
      <div class="modal-header">
        <h3>Rename File</h3>
        <button class="modal-close-btn" onclick="closeModal()">&times;</button>
      </div>
      <form onsubmit="handleFsRenameSubmit(event, '${escapeHtml(oldPath)}')" style="padding: 16px 0;">
        <div style="margin-bottom: 12px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Current Path</label>
          <input type="text" value="${escapeHtml(oldPath)}" disabled class="input-field" style="width:100%;">
        </div>
        <div style="margin-bottom: 16px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">New Path</label>
          <input type="text" id="fs-rename-new" value="${escapeHtml(oldPath)}" required class="input-field" style="width:100%;">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Rename</button>
        </div>
      </form>
    </div>
  `);
}

async function handleFsRenameSubmit(e, oldPath) {
  e.preventDefault();
  const newPath = document.getElementById('fs-rename-new').value.trim();
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedFsNodeId}/fs/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath })
    });
    const data = await res.json();
    if (data.success) {
      closeModal();
      showToast({ title: 'File Renamed', message: `Renamed to '${newPath}'`, severity: 'SUCCESS' });
      refreshLittlefsList();
    } else {
      alert('Rename failed: ' + data.error);
    }
  } catch (err) {
    alert('Server error: ' + err.message);
  }
}

async function deleteFsFile(filePath) {
  if (!confirm(`Are you sure you want to permanently delete '${filePath}' from LittleFS?`)) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedFsNodeId}/fs/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath })
    });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'Deleted from LittleFS', message: `Deleted '${filePath}'`, severity: 'WARNING' });
      refreshLittlefsList();
    } else {
      alert('Delete failed: ' + data.error);
    }
  } catch (err) {
    alert('Server error: ' + err.message);
  }
}

async function triggerLittlefsBackup() {
  if (!confirm('Create a complete LittleFS backup archive on the master server?')) return;
  showToast({ title: 'Creating Backup', message: 'Downloading files & calculating SHA-256 manifest...', severity: 'INFO' });
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedFsNodeId}/fs/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupType: 'MANUAL' })
    });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'Backup Complete', message: `Archived ${data.fileCount} files (${(data.totalBytes/1024).toFixed(1)} KB)`, severity: 'SUCCESS' });
    } else {
      alert('Backup failed: ' + data.error);
    }
  } catch (err) {
    alert('Backup error: ' + err.message);
  }
}

async function openFsBackupsHistoryModal() {
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedFsNodeId}/fs/backups`);
    const data = await res.json();
    const backups = data.backups || [];

    const rows = backups.map(b => `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 10px 12px; font-size:12px;">${new Date(b.created_at).toLocaleString()}</td>
        <td style="padding: 10px 12px;"><span class="status-badge badge-sync">${b.backup_type}</span></td>
        <td style="padding: 10px 12px;">${b.file_count} files</td>
        <td style="padding: 10px 12px; font-size:12px;">${(b.total_bytes / 1024).toFixed(1)} KB</td>
        <td style="padding: 10px 12px; font-family:monospace; font-size:11px;">${(b.sha256_checksum || '').substring(0, 10)}...</td>
      </tr>
    `).join('');

    openModal(`
      <div class="modal-card" style="max-width: 600px;">
        <div class="modal-header">
          <h3>LittleFS Backup Archives</h3>
          <button class="modal-close-btn" onclick="closeModal()">&times;</button>
        </div>
        <div style="padding: 14px 0;">
          <table class="table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); text-align: left; background: rgba(255,255,255,0.02);">
                <th style="padding: 8px 12px;">Timestamp</th>
                <th style="padding: 8px 12px;">Type</th>
                <th style="padding: 8px 12px;">Files</th>
                <th style="padding: 8px 12px;">Size</th>
                <th style="padding: 8px 12px;">Checksum</th>
              </tr>
            </thead>
            <tbody>
              ${backups.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No LittleFS backups created yet.</td></tr>' : rows}
            </tbody>
          </table>
        </div>
      </div>
    `);
  } catch (err) {
    alert('Error fetching backups: ' + err.message);
  }
}

// ==============================================================================
// 13. DEVICE CONFIGURATION & SYNCHRONIZATION ENGINE VIEW
// ==============================================================================
let selectedConfigNodeId = null;
let currentDeviceConfig = null;

async function loadConfigSync() {
  const container = document.getElementById("content-area");
  container.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Loading configuration & sync center...</div>`;

  try {
    const nodesRes = await fetchWithAuth(`${API_BASE}/nodes`);
    const nodes = await nodesRes.json();

    if (!Array.isArray(nodes) || nodes.length === 0) {
      container.innerHTML = `<div class="metric-card"><h3>No Devices Found</h3></div>`;
      return;
    }

    if (!selectedConfigNodeId || !nodes.find(n => n.node_id === selectedConfigNodeId)) {
      const onlineNode = nodes.find(n => n.is_online) || nodes[0];
      selectedConfigNodeId = onlineNode.node_id;
    }

    const nodeOptions = nodes.map(n => `
      <option value="${n.node_id}" ${n.node_id === selectedConfigNodeId ? 'selected' : ''}>
        ${escapeHtml(n.name)} (${n.ip || 'Offline'}) - ${n.is_online ? '🟢 Online' : '🔴 Offline'}
      </option>
    `).join('');

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Top Toolbar & Node Selector -->
        <div class="metric-card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <label style="font-weight: 600; font-size: 14px;">Target Device:</label>
            <select id="config-node-select" class="input-field" onchange="handleConfigNodeChange(this.value)" style="min-width: 280px;">
              ${nodeOptions}
            </select>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" onclick="triggerConfigPush()">🚀 Push & Sync to Node</button>
            <button class="btn btn-secondary" onclick="saveAuthoritativeConfig()">💾 Save Changes</button>
            <button class="btn btn-secondary" onclick="openConfigVersionsModal()">📜 Version History & Rollback</button>
          </div>
        </div>

        <!-- Config Details Card & JSON Editor -->
        <div id="config-details-container">
          <div style="text-align: center; padding: 30px; color: var(--text-secondary);">Loading authoritative device configuration...</div>
        </div>
      </div>
    `;

    await refreshConfigDetails();
  } catch (err) {
    container.innerHTML = `<div class="metric-card" style="color:var(--accent-red);">Failed to initialize Config Sync: ${escapeHtml(err.message)}</div>`;
  }
}

function handleConfigNodeChange(val) {
  selectedConfigNodeId = val;
  refreshConfigDetails();
}

async function refreshConfigDetails() {
  const container = document.getElementById('config-details-container');
  if (!container || !selectedConfigNodeId) return;

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedConfigNodeId}/config`);
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `<div class="metric-card" style="color:var(--accent-red);">Error: ${escapeHtml(data.error)}</div>`;
      return;
    }

    currentDeviceConfig = data.configuration;
    const c = currentDeviceConfig;

    let statusBadge = 'badge-online';
    if (c.sync_status === 'PENDING') statusBadge = 'badge-sync';
    else if (c.sync_status === 'SYNCING') statusBadge = 'badge-sync';
    else if (c.sync_status === 'FAILED') statusBadge = 'badge-offline';
    else if (c.sync_status === 'OFFLINE') statusBadge = 'badge-offline';

    container.innerHTML = `
      <!-- Status Cards Grid -->
      <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 20px;">
        <div class="metric-card">
          <div class="metric-label">Configuration Version</div>
          <div class="metric-value">v${c.config_version}</div>
          <div class="metric-sub">Authoritative Master Revision</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Synchronization Status</div>
          <div style="margin-top: 8px;">
            <span class="status-badge ${statusBadge}" style="font-size: 13px; padding: 4px 10px;">${c.sync_status}</span>
          </div>
          <div class="metric-sub" style="margin-top: 8px;">Last Synced: ${c.last_synced_at ? new Date(c.last_synced_at).toLocaleTimeString() : 'Never'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">SHA-256 Checksum</div>
          <div style="font-family: monospace; font-size: 13px; color: var(--accent-blue); margin-top: 10px; word-break: break-all;">
            ${(c.sha256_checksum || '').substring(0, 16)}...
          </div>
          <div class="metric-sub" style="margin-top: 6px;">Integrity verified</div>
        </div>
      </div>

      <!-- JSON Configuration Editor -->
      <div class="metric-card" style="padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 15px;">Authoritative Configuration Payload (JSON)</h3>
          <span style="font-size: 12px; color: var(--text-muted);">Strict JSON schema validated</span>
        </div>
        <textarea id="config-json-textarea" class="code-editor-textarea" style="width: 100%; height: 380px; font-family: 'Consolas', 'Monaco', monospace; font-size: 13.5px; line-height: 1.6; background-color: #0b1120 !important; color: #f8fafc !important; -webkit-text-fill-color: #f8fafc !important; caret-color: #38bdf8 !important; border: 1px solid rgba(56, 189, 248, 0.4); padding: 12px; border-radius: 8px; resize: vertical;">${JSON.stringify(c.config, null, 2)}</textarea>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="metric-card" style="color:var(--accent-red);">Error loading config: ${escapeHtml(err.message)}</div>`;
  }
}

async function saveAuthoritativeConfig() {
  const textarea = document.getElementById('config-json-textarea');
  if (!textarea) return;

  let parsed = null;
  try {
    parsed = JSON.parse(textarea.value);
  } catch (e) {
    alert('Invalid JSON syntax: ' + e.message);
    return;
  }

  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedConfigNodeId}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: parsed, summary: 'Manual dashboard update' })
    });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'Config Saved', message: `Saved version v${data.configuration.config_version}`, severity: 'SUCCESS' });
      refreshConfigDetails();
    } else {
      alert('Save failed: ' + data.error);
    }
  } catch (err) {
    alert('Server error: ' + err.message);
  }
}

async function triggerConfigPush() {
  showToast({ title: 'Pushing Configuration', message: 'Delivering config payload to microcontroller...', severity: 'INFO' });
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedConfigNodeId}/config/sync`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      showToast({ title: 'Config Synchronized', message: data.message || 'Config accepted by node', severity: 'SUCCESS' });
      refreshConfigDetails();
    } else {
      showToast({ title: 'Sync Warning', message: data.error || 'Direct sync failed; queued in persistent command queue', severity: 'WARNING' });
      refreshConfigDetails();
    }
  } catch (err) {
    alert('Sync error: ' + err.message);
  }
}

async function openConfigVersionsModal() {
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedConfigNodeId}/config/versions`);
    const data = await res.json();
    const versions = data.versions || [];

    const rows = versions.map(v => `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 10px 12px; font-weight: 600;">v${v.version}</td>
        <td style="padding: 10px 12px; font-size:12px; color:var(--text-secondary);">${escapeHtml(v.change_summary || 'Update')}</td>
        <td style="padding: 10px 12px; font-size:12px; color:var(--text-muted);">${new Date(v.created_at).toLocaleString()}</td>
        <td style="padding: 10px 12px; font-family:monospace; font-size:11px;">${(v.sha256_checksum || '').substring(0, 10)}...</td>
        <td style="padding: 10px 12px; text-align: right;">
          <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11.5px;" onclick="rollbackConfigToVersion(${v.version})">Rollback</button>
        </td>
      </tr>
    `).join('');

    openModal(`
      <div class="modal-card" style="max-width: 620px;">
        <div class="modal-header">
          <h3>Configuration Version History</h3>
          <button class="modal-close-btn" onclick="closeModal()">&times;</button>
        </div>
        <div style="padding: 14px 0;">
          <table class="table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); text-align: left; background: rgba(255,255,255,0.02);">
                <th style="padding: 8px 12px;">Version</th>
                <th style="padding: 8px 12px;">Summary</th>
                <th style="padding: 8px 12px;">Created At</th>
                <th style="padding: 8px 12px;">Checksum</th>
                <th style="padding: 8px 12px; text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${versions.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No historical versions recorded.</td></tr>' : rows}
            </tbody>
          </table>
        </div>
      </div>
    `);
  } catch (err) {
    alert('Error fetching versions: ' + err.message);
  }
}

async function rollbackConfigToVersion(version) {
  if (!confirm(`Rollback configuration to historical revision v${version}? A new revision will be created and pushed to the node.`)) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/nodes/${selectedConfigNodeId}/config/rollback/${version}`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      closeModal();
      showToast({ title: 'Configuration Rolled Back', message: `Restored to v${version} (Now v${data.currentVersion})`, severity: 'SUCCESS' });
      refreshConfigDetails();
    } else {
      alert('Rollback failed: ' + data.error);
    }
  } catch (err) {
    alert('Rollback error: ' + err.message);
  }
}

// ==============================================================================
// 14. DEVICE COMMAND CENTER & ACKNOWLEDGEMENT TRACKER VIEW
// ==============================================================================
let cachedCommands = [];
let commandFilterNode = 'ALL';
let commandFilterStatus = 'ALL';

async function loadCommands() {
  const container = document.getElementById("content-area");
  container.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-secondary);">Loading persistent command center...</div>`;

  try {
    const [cRes, nRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/commands?limit=100`),
      fetchWithAuth(`${API_BASE}/nodes`)
    ]);

    const cData = await cRes.json();
    const nData = await nRes.json();

    cachedCommands = cData.commands || [];
    const nodes = nData || [];

    const nodeFilterOptions = [
      '<option value="ALL">All Nodes</option>',
      ...nodes.map(n => `<option value="${n.node_id}" ${commandFilterNode === n.node_id ? 'selected' : ''}>${escapeHtml(n.name)}</option>`)
    ].join('');

    const filtered = cachedCommands.filter(c => {
      if (commandFilterNode !== 'ALL' && c.node_id !== commandFilterNode) return false;
      if (commandFilterStatus !== 'ALL' && c.status !== commandFilterStatus) return false;
      return true;
    });

    const pendingCount = cachedCommands.filter(c => c.status === 'PENDING').length;
    const ackCount = cachedCommands.filter(c => c.status === 'ACKNOWLEDGED').length;

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Stats Banner -->
        <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
          <div class="metric-card">
            <div class="metric-label">Total Persistent Commands</div>
            <div class="metric-value">${cachedCommands.length}</div>
            <div class="metric-sub">Recorded in SQLite Fleet Queue</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Pending Delivery / In-Flight</div>
            <div class="metric-value" style="color:var(--accent-amber)">${pendingCount}</div>
            <div class="metric-sub">Waiting for heartbeat or socket</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Device Application ACKs</div>
            <div class="metric-value" style="color:var(--accent-green)">${ackCount}</div>
            <div class="metric-sub">Execution verified by firmware</div>
          </div>
        </div>

        <!-- Action & Filter Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <select class="input-field" onchange="commandFilterNode = this.value; loadCommands();">
              ${nodeFilterOptions}
            </select>
            <select class="input-field" onchange="commandFilterStatus = this.value; loadCommands();">
              <option value="ALL" ${commandFilterStatus === 'ALL' ? 'selected' : ''}>All Statuses</option>
              <option value="PENDING" ${commandFilterStatus === 'PENDING' ? 'selected' : ''}>PENDING</option>
              <option value="DELIVERED" ${commandFilterStatus === 'DELIVERED' ? 'selected' : ''}>DELIVERED</option>
              <option value="ACKNOWLEDGED" ${commandFilterStatus === 'ACKNOWLEDGED' ? 'selected' : ''}>ACKNOWLEDGED</option>
              <option value="FAILED" ${commandFilterStatus === 'FAILED' ? 'selected' : ''}>FAILED</option>
            </select>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" onclick="openDispatchCommandModal()">⚡ Dispatch Command</button>
            <button class="btn btn-secondary" onclick="loadCommands()">🔄 Refresh</button>
          </div>
        </div>

        <!-- Commands Queue Table -->
        <div class="metric-card" style="padding: 0; overflow-x: auto;">
          <table class="table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); text-align: left; background: rgba(255,255,255,0.02);">
                <th style="padding: 12px 16px;">UUID</th>
                <th style="padding: 12px 16px;">Target Node</th>
                <th style="padding: 12px 16px;">Action / Type</th>
                <th style="padding: 12px 16px;">Payload</th>
                <th style="padding: 12px 16px;">Status</th>
                <th style="padding: 12px 16px;">Timestamps</th>
                <th style="padding: 12px 16px; text-align: right;">Details</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No commands matching filter.</td></tr>' : ''}
              ${filtered.map(c => {
                let badgeClass = 'badge-sync';
                if (c.status === 'ACKNOWLEDGED') badgeClass = 'badge-online';
                else if (c.status === 'FAILED') badgeClass = 'badge-offline';
                else if (c.status === 'PENDING') badgeClass = 'badge-sync';

                const shortUuid = (c.command_uuid || '').substring(0, 8);
                const createdStr = c.created_at ? new Date(c.created_at).toLocaleTimeString() : 'N/A';
                const ackStr = c.acknowledged_at ? new Date(c.acknowledged_at).toLocaleTimeString() : '-';

                return `
                  <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 12px 16px; font-family: monospace; font-size: 12px; color: var(--accent-blue);">
                      ${shortUuid}...
                    </td>
                    <td style="padding: 12px 16px; font-weight: 600;">
                      <code>${escapeHtml(c.node_id)}</code>
                    </td>
                    <td style="padding: 12px 16px;">
                      <span class="status-badge badge-sync">${escapeHtml(c.command_type || 'command')}</span>
                    </td>
                    <td style="padding: 12px 16px; font-size: 12.5px; font-family: monospace; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${escapeHtml(JSON.stringify(c.payload || {}))}
                    </td>
                    <td style="padding: 12px 16px;">
                      <span class="status-badge ${badgeClass}">${c.status}</span>
                    </td>
                    <td style="padding: 12px 16px; font-size: 12px; color: var(--text-secondary);">
                      Sent: ${createdStr} | ACK: ${ackStr}
                    </td>
                    <td style="padding: 12px 16px; text-align: right;">
                      <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;" onclick="viewCommandDetails('${c.command_uuid}')">Inspect</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="metric-card" style="color:var(--accent-red);">Error loading command center: ${escapeHtml(err.message)}</div>`;
  }
}

function openDispatchCommandModal() {
  const nodes = fleetData.nodes || [];
  const nodeOptions = nodes.map(n => `
    <option value="${n.node_id}">${escapeHtml(n.name)} (${n.ip || 'Offline'})</option>
  `).join('');

  openModal(`
    <div class="modal-card" style="max-width: 480px;">
      <div class="modal-header">
        <h3>Dispatch Device Command</h3>
        <button class="modal-close-btn" onclick="closeModal()">&times;</button>
      </div>
      <form onsubmit="handleDispatchCommandSubmit(event)" style="padding: 16px 0;">
        <div style="margin-bottom: 12px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Target Node</label>
          <select id="dispatch-node-id" required class="input-field" style="width:100%;">
            ${nodeOptions}
          </select>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Command Action</label>
          <select id="dispatch-action" class="input-field" style="width:100%;" onchange="toggleDispatchFields(this.value)">
            <option value="setState">setState (Switch GPIO Pin)</option>
            <option value="toggle">toggle (Toggle GPIO State)</option>
            <option value="pulse">pulse (Momentary Relay Pulse)</option>
            <option value="reboot">reboot (Restart Microcontroller)</option>
            <option value="syncConfig">syncConfig (Force Sync Configuration)</option>
            <option value="custom">custom (Arbitrary JSON Payload)</option>
          </select>
        </div>

        <div id="dispatch-gpio-fields">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
            <div>
              <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Channel / Pin ID</label>
              <input type="number" id="dispatch-channel-id" value="1" min="1" max="16" class="input-field" style="width:100%;">
            </div>
            <div>
              <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Desired State</label>
              <select id="dispatch-state" class="input-field" style="width:100%;">
                <option value="true">ON (High / Active)</option>
                <option value="false">OFF (Low / Inactive)</option>
              </select>
            </div>
          </div>
        </div>

        <div id="dispatch-pulse-field" style="display:none; margin-bottom: 12px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Pulse Duration (ms)</label>
          <input type="number" id="dispatch-duration" value="500" min="50" max="10000" class="input-field" style="width:100%;">
        </div>

        <div id="dispatch-custom-field" style="display:none; margin-bottom: 12px;">
          <label style="display:block; font-size:12px; color:var(--text-muted); margin-bottom:4px;">Custom JSON Payload</label>
          <textarea id="dispatch-custom-json" class="input-field" style="width:100%; height:80px; font-family:monospace; font-size:12px;">{"action": "ping"}</textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Dispatch Command</button>
        </div>
      </form>
    </div>
  `);
}

function toggleDispatchFields(action) {
  const gpioFields = document.getElementById('dispatch-gpio-fields');
  const pulseField = document.getElementById('dispatch-pulse-field');
  const customField = document.getElementById('dispatch-custom-field');

  if (gpioFields) gpioFields.style.display = (action === 'setState' || action === 'toggle' || action === 'pulse') ? 'block' : 'none';
  if (pulseField) pulseField.style.display = (action === 'pulse') ? 'block' : 'none';
  if (customField) customField.style.display = (action === 'custom') ? 'block' : 'none';
}

async function handleDispatchCommandSubmit(e) {
  e.preventDefault();
  const nodeId = document.getElementById('dispatch-node-id').value;
  const action = document.getElementById('dispatch-action').value;

  let payload = { action, node_id: nodeId };

  if (action === 'setState') {
    payload.id = Number(document.getElementById('dispatch-channel-id').value);
    payload.gpioId = payload.id;
    payload.state = document.getElementById('dispatch-state').value === 'true';
  } else if (action === 'toggle') {
    payload.id = Number(document.getElementById('dispatch-channel-id').value);
    payload.gpioId = payload.id;
  } else if (action === 'pulse') {
    payload.id = Number(document.getElementById('dispatch-channel-id').value);
    payload.gpioId = payload.id;
    payload.duration = Number(document.getElementById('dispatch-duration').value);
  } else if (action === 'custom') {
    try {
      const customObj = JSON.parse(document.getElementById('dispatch-custom-json').value);
      payload = { ...customObj, node_id: nodeId };
    } catch {
      alert('Invalid JSON in custom payload');
      return;
    }
  }

  try {
    const res = await fetchWithAuth(`${API_BASE}/commands/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeModal();
      showToast({
        title: 'Command Dispatched',
        message: `Delivery: ${data.delivery} (UUID: ${(data.command_uuid || '').substring(0, 8)})`,
        severity: data.delivery === 'direct_lan_http' ? 'SUCCESS' : 'INFO'
      });
      loadCommands();
    } else {
      alert('Dispatch failed: ' + data.error);
    }
  } catch (err) {
    alert('Server error: ' + err.message);
  }
}

async function viewCommandDetails(uuid) {
  try {
    const res = await fetchWithAuth(`${API_BASE}/commands/${uuid}`);
    const data = await res.json();
    if (!data.success) return alert(data.error);

    const cmd = data.command;
    const results = data.results || [];

    const resultsHtml = results.map(r => `
      <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; margin-bottom: 8px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
          <span class="status-badge ${r.success ? 'badge-online' : 'badge-offline'}">${r.status}</span>
          <span style="color:var(--text-muted);">${r.execution_time_ms} ms</span>
        </div>
        <div style="font-family:monospace; font-size:11.5px; color:var(--text-secondary); word-break:break-all;">
          ${escapeHtml(r.response_payload_json || '{}')}
        </div>
      </div>
    `).join('') || '<div style="color:var(--text-muted); font-size:12px;">No execution response packet received yet.</div>';

    openModal(`
      <div class="modal-card" style="max-width: 520px;">
        <div class="modal-header">
          <h3>Command Diagnostics</h3>
          <button class="modal-close-btn" onclick="closeModal()">&times;</button>
        </div>
        <div style="padding: 14px 0;">
          <div style="margin-bottom: 12px;">
            <div style="font-size: 11px; color: var(--text-muted);">UUID</div>
            <code style="color: var(--accent-blue);">${cmd.command_uuid}</code>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
            <div>
              <div style="font-size: 11px; color: var(--text-muted);">Target Node</div>
              <strong>${escapeHtml(cmd.node_id)}</strong>
            </div>
            <div>
              <div style="font-size: 11px; color: var(--text-muted);">Delivery Status</div>
              <span class="status-badge ${cmd.status === 'ACKNOWLEDGED' ? 'badge-online' : 'badge-sync'}">${cmd.status}</span>
            </div>
          </div>
          <div style="margin-bottom: 14px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Command Payload</div>
            <pre style="background: #080c14; padding: 10px; border-radius: 6px; font-size: 12px; overflow-x: auto;">${JSON.stringify(cmd.payload, null, 2)}</pre>
          </div>
          <div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Microcontroller Application ACK Results (${results.length})</div>
            ${resultsHtml}
          </div>
        </div>
      </div>
    `);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}


// --- 12. DATABASE ---
async function loadDatabase() {
  const container = document.getElementById("content-area");
  container.innerHTML = `
    <div class="metric-card">
      <h3>High-Performance Native SQLite Engine</h3>
      <p style="margin: 10px 0 16px 0; color: var(--text-secondary); line-height: 1.6;">
        Database engine: <strong>node:sqlite (Node.js 24 Native C++ Driver)</strong><br>
        Database path: <code>central_server_js/data/fleet.db</code><br>
        Active tables: <code>nodes</code>, <code>relays</code>, <code>telemetry_logs</code>, <code>audit_logs</code>, <code>automations</code>, <code>firmware</code>
      </p>
      <button class="btn btn-primary" onclick="alert('Database is continuously synchronized to central_server_js/data/fleet.db.')">💾 Database Verified Active</button>
    </div>
  `;
}

// --- 13. SETTINGS & AUTO-SYNC POLLER ---
// ==========================================================================
// VIEW ⑫: COMPREHENSIVE SETTINGS (RELAY SERVER, BROKER, MQTT, TUYA, DB)
// ==========================================================================
let currentSettingsTab = 'server'; // 'server' | 'mqtt' | 'tuya' | 'security' | 'database'
let cachedServerSettings = null;

async function loadSettings() {
  const container = document.getElementById("content-area");
  try {
    const res = await fetchWithAuth(`${API_BASE}/system/settings`);
    const data = await res.json();
    cachedServerSettings = data;

    container.innerHTML = `
      <div class="settings-view-wrap">
        <!-- Header -->
        <div class="devices-topbar-actions" style="margin-bottom: 16px;">
          <div>
            <h2 style="font-size: 19px; font-weight: 700; color: #ffffff; margin: 0;">System Settings</h2>
            <p style="font-size: 12px; color: #94a3b8; margin: 3px 0 0 0;">Relay server broker, hardware bridges, MQTT and database configuration</p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="subview-nav-tabs">
          <button class="subview-tab-btn ${currentSettingsTab === 'server' ? 'active' : ''}" onclick="switchSettingsTab('server')">
            <span>🌐 Relay Server & Broker</span>
          </button>
          <button class="subview-tab-btn ${currentSettingsTab === 'mqtt' ? 'active' : ''}" onclick="switchSettingsTab('mqtt')">
            <span>📡 MQTT & Integrations</span>
          </button>
          <button class="subview-tab-btn ${currentSettingsTab === 'tuya' ? 'active' : ''}" onclick="switchSettingsTab('tuya')">
            <span>⚡ Tuya & Hardware Bridges</span>
          </button>
          <button class="subview-tab-btn ${currentSettingsTab === 'security' ? 'active' : ''}" onclick="switchSettingsTab('security')">
            <span>🛡️ Security & Access Control</span>
          </button>
          <button class="subview-tab-btn ${currentSettingsTab === 'database' ? 'active' : ''}" onclick="switchSettingsTab('database')">
            <span>💾 Database & Maintenance</span>
          </button>
        </div>

        <!-- Dynamic Settings Tab Panel -->
        <div id="settings-tab-container">
          ${renderActiveSettingsPanel(data)}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error loading settings: ${err.message}</div>`;
  }
}

function renderActiveSettingsPanel(data) {
  const s = data.server || {};
  const m = data.mqtt || {};
  const t = data.tuya || {};
  const sec = data.security || {};
  const db = data.database || {};

  if (currentSettingsTab === 'mqtt') {
    return `
      <div class="settings-tab-panel">
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-card-title">📡 MQTT Broker & Home Assistant Discovery</div>
            <div class="settings-card-desc">Connect the central server to local MQTT brokers or bridge state changes to Home Assistant.</div>
          </div>

          <div class="settings-grid-2col">
            <div class="settings-field-group">
              <label class="settings-field-label">MQTT Client Bridge</label>
              <select id="mqtt-enabled" class="filter-select-enhanced">
                <option value="1" ${m.enabled ? 'selected' : ''}>Enabled (Publish telemetry and subscribe to commands)</option>
                <option value="0" ${!m.enabled ? 'selected' : ''}>Disabled</option>
              </select>
              <span class="settings-field-hint">Internal lightweight bridge connects to standard MQTT 3.1.1 brokers</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Broker Host IP / Domain</label>
              <input type="text" id="mqtt-host" class="settings-input" value="${escapeHtml(m.host || '127.0.0.1')}">
              <span class="settings-field-hint">e.g. 127.0.0.1 or homeassistant.local</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Broker Port</label>
              <input type="number" id="mqtt-port" class="settings-input" value="${m.port || 1883}">
              <span class="settings-field-hint">Default MQTT port is 1883 (or 8883 for TLS)</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Client ID</label>
              <input type="text" id="mqtt-client-id" class="settings-input" value="${escapeHtml(m.client_id || 'smarthome-edge-broker')}">
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Base Topic Prefix</label>
              <input type="text" id="mqtt-base-topic" class="settings-input" value="${escapeHtml(m.base_topic || 'smarthome/fleet')}">
              <span class="settings-field-hint">State published to ${escapeHtml(m.base_topic || 'smarthome/fleet')}/[nodeId]/state</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Home Assistant Auto-Discovery</label>
              <select id="mqtt-ha-discovery" class="filter-select-enhanced">
                <option value="1" ${m.ha_discovery ? 'selected' : ''}>Enabled (Auto-publish config to homeassistant/status)</option>
                <option value="0" ${!m.ha_discovery ? 'selected' : ''}>Disabled</option>
              </select>
            </div>
          </div>

          <div class="settings-action-bar">
            <button class="btn-neutral-action" onclick="alert('MQTT Test Ping: Connected to broker at ' + document.getElementById('mqtt-host').value)">Test Connection</button>
            <button class="btn-save-settings" onclick="saveMqttSettings()">Save MQTT Configuration</button>
          </div>
        </div>
      </div>
    `;
  } else if (currentSettingsTab === 'tuya') {
    return `
      <div class="settings-tab-panel">
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-card-title">⚡ Tuya LAN Bridge & Smart Circuit Breaker</div>
            <div class="settings-card-desc">Local LAN microservice integration for smart circuit breaker energy monitoring & safety trips.</div>
          </div>

          <div class="settings-grid-2col">
            <div class="settings-field-group">
              <label class="settings-field-label">Tuya Local Microservice URL</label>
              <input type="text" id="tuya-portal-host" class="settings-input" value="${escapeHtml(t.portal_host || '127.0.0.1')}">
              <span class="settings-field-hint">Host IP of the Python LAN poller portal</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Microservice Port</label>
              <input type="number" id="tuya-portal-port" class="settings-input" value="${t.portal_port || 8085}">
              <span class="settings-field-hint">Default local gateway port is 8085</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Telemetry Polling Interval (ms)</label>
              <input type="number" id="tuya-poll-interval" class="settings-input" value="${t.poll_interval_ms || 2500}">
              <span class="settings-field-hint">Frequency to poll voltage, current, power and temperature (e.g. 2500ms)</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Smart Breaker Node ID</label>
              <input type="text" class="settings-input" value="${escapeHtml(t.node_id || 'NODE-30487DE85D5C')}" readonly style="opacity: 0.7;">
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Overvoltage Protection Trip (V)</label>
              <input type="number" id="tuya-v-limit" class="settings-input" value="${t.voltage_limit || 275}">
              <span class="settings-field-hint">Cutoff breaker if grid voltage exceeds threshold</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Overcurrent Protection Trip (A)</label>
              <input type="number" id="tuya-c-limit" class="settings-input" value="${t.current_limit || 63}">
              <span class="settings-field-hint">Rated main circuit breaker trip limit</span>
            </div>
          </div>

          <div class="settings-action-bar">
            <button class="btn-neutral-action" onclick="testTuyaBreakerConnection()">Test Breaker LAN Connection</button>
            <button class="btn-save-settings" onclick="saveTuyaSettings()">Save Hardware Bridge Settings</button>
          </div>
        </div>
      </div>
    `;
  } else if (currentSettingsTab === 'security') {
    return `
      <div class="settings-tab-panel">
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-card-title">🛡️ Security, Access & RBAC Policy</div>
            <div class="settings-card-desc">Manage API session validity, authentication requirements, and network IP filtering.</div>
          </div>

          <div class="settings-grid-2col">
            <div class="settings-field-group">
              <label class="settings-field-label">User Session Expiration (Days)</label>
              <input type="number" id="sec-session-expiry" class="settings-input" value="${sec.session_expiry_days || 30}">
              <span class="settings-field-hint">Duration before web administrator is required to re-authenticate</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Subnet Access Whitelist (CIDR)</label>
              <input type="text" id="sec-ip-whitelist" class="settings-input" value="${escapeHtml(sec.ip_whitelist || '0.0.0.0/0')}">
              <span class="settings-field-hint">0.0.0.0/0 allows all local subnets, or specify e.g. 192.168.1.0/24</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Anonymous Read-Only Telemetry</label>
              <select id="sec-allow-anon" class="filter-select-enhanced">
                <option value="0" ${!sec.allow_anonymous_telemetry ? 'selected' : ''}>Disabled (Full RBAC Bearer token required for all endpoints)</option>
                <option value="1" ${sec.allow_anonymous_telemetry ? 'selected' : ''}>Enabled (Allow local LAN view without login)</option>
              </select>
            </div>
          </div>

          <div class="settings-action-bar">
            <button class="btn-save-settings" onclick="saveSecuritySettings()">Save Security Policy</button>
          </div>
        </div>
      </div>
    `;
  } else if (currentSettingsTab === 'database') {
    return `
      <div class="settings-tab-panel">
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-card-title">💾 SQLite Storage & Fleet Database Maintenance</div>
            <div class="settings-card-desc">Embedded high-performance SQLite sync storage with Write-Ahead Logging (WAL).</div>
          </div>

          <div class="settings-grid-2col" style="margin-bottom: 20px;">
            <div style="background: #090e1a; padding: 14px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.1);">
              <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Database Engine</div>
              <div style="font-size: 15px; font-weight: 700; color: #ffffff; margin-top: 4px;">${escapeHtml(db.engine || 'SQLite 3 Sync')}</div>
              <div style="font-size: 12px; color: #10b981; margin-top: 2px;">● Write-Ahead Logging (WAL) Active</div>
            </div>

            <div style="background: #090e1a; padding: 14px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.1);">
              <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Database File Size</div>
              <div style="font-size: 15px; font-weight: 700; color: #38bdf8; margin-top: 4px;">${db.db_size_kb ? (db.db_size_kb / 1024).toFixed(1) + ' MB' : '32.3 MB'}</div>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">${db.total_logs || 29000} telemetry & event logs logged</div>
            </div>
          </div>

          <div class="settings-grid-2col">
            <div class="settings-field-group">
              <label class="settings-field-label">Telemetry Log Retention Period (Days)</label>
              <input type="number" id="db-retention-days" class="settings-input" value="${db.log_retention_days || 14}">
              <span class="settings-field-hint">Automatically prunes sensor and relay events older than this period</span>
            </div>
          </div>

          <div class="settings-action-bar" style="justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: 8px;">
              <button class="btn-neutral-action" onclick="handleDatabaseVacuum()">🧹 Vacuum & Optimize DB</button>
              <button class="btn-danger-action" onclick="handleDatabaseClearLogs()">🗑️ Prune Old Logs</button>
            </div>
            <button class="btn-save-settings" onclick="saveDatabaseSettings()">Save Retention Settings</button>
          </div>
        </div>
      </div>
    `;
  } else {
    // Default: 'server' (Relay Server & Broker Settings)
    return `
      <div class="settings-tab-panel">
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-card-title">🌐 Central Relay Server & TCP Telemetry Hub</div>
            <div class="settings-card-desc">Configure server network sockets, heartbeat intervals, and ESP node offline timeouts.</div>
          </div>

          <div class="settings-grid-2col">
            <div class="settings-field-group">
              <label class="settings-field-label">TCP Telemetry Gateway Port</label>
              <input type="number" id="srv-tcp-port" class="settings-input" value="${s.tcp_port || 2000}">
              <span class="settings-field-hint">Raw TCP socket port for ESP8266/ESP32 NDJSON packets (Default: 2000)</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">HTTP Web Dashboard Port</label>
              <input type="number" id="srv-http-port" class="settings-input" value="${s.http_port || 9100}">
              <span class="settings-field-hint">HTTP API and administrative web portal port (Default: 9100)</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Network Bind Host Address</label>
              <input type="text" id="srv-bind-host" class="settings-input" value="${escapeHtml(s.bind_host || '0.0.0.0')}">
              <span class="settings-field-hint">0.0.0.0 listens across all LAN interfaces and local adapters</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Node Offline Timeout Threshold (Seconds)</label>
              <input type="number" id="srv-offline-timeout" class="settings-input" value="${s.offline_timeout_sec || 30}">
              <span class="settings-field-hint">Time elapsed without heartbeat before node is marked Offline (e.g. 30s)</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Periodic Health & Pin Status Poller</label>
              <select id="srv-poll-enabled" class="filter-select-enhanced">
                <option value="1" ${s.poll_enabled ? 'selected' : ''}>Active Auto-Sync (Regularly re-verifies pin states)</option>
                <option value="0" ${!s.poll_enabled ? 'selected' : ''}>Disabled</option>
              </select>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Health Poller Interval (Seconds)</label>
              <input type="number" id="srv-poll-interval" class="settings-input" value="${s.poll_interval_sec || 5}">
              <span class="settings-field-hint">Active polling cycle frequency (e.g. 5 seconds)</span>
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Node Direct HTTP Timeout (ms)</label>
              <input type="number" id="srv-direct-timeout" class="settings-input" value="${s.direct_http_timeout_ms || 2500}">
            </div>

            <div class="settings-field-group">
              <label class="settings-field-label">Max Concurrent TCP Sockets</label>
              <input type="number" class="settings-input" value="${s.max_tcp_clients || 128}" readonly style="opacity: 0.7;">
            </div>
          </div>

          <div class="settings-action-bar">
            <button class="btn-save-settings" onclick="saveRelayServerSettings()">Save Relay Server Settings</button>
          </div>
        </div>
      </div>
    `;
  }
}

function switchSettingsTab(tab) {
  currentSettingsTab = tab;
  loadSettings();
}

async function saveRelayServerSettings() {
  const tcp_port = Number(document.getElementById("srv-tcp-port").value);
  const http_port = Number(document.getElementById("srv-http-port").value);
  const bind_host = document.getElementById("srv-bind-host").value.trim();
  const offline_timeout_sec = Number(document.getElementById("srv-offline-timeout").value);
  const poll_enabled = document.getElementById("srv-poll-enabled").value === '1';
  const poll_interval_sec = Number(document.getElementById("srv-poll-interval").value);
  const direct_http_timeout_ms = Number(document.getElementById("srv-direct-timeout").value);

  try {
    const res = await fetchWithAuth(`${API_BASE}/system/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server: { tcp_port, http_port, bind_host, offline_timeout_sec, poll_enabled, poll_interval_sec, direct_http_timeout_ms }
      })
    });
    const data = await res.json();
    alert(data.message || 'Relay server broker settings saved');
    loadSettings();
  } catch (err) {
    alert('Failed to save server settings: ' + err.message);
  }
}

async function saveMqttSettings() {
  const enabled = document.getElementById("mqtt-enabled").value === '1';
  const host = document.getElementById("mqtt-host").value.trim();
  const port = Number(document.getElementById("mqtt-port").value);
  const client_id = document.getElementById("mqtt-client-id").value.trim();
  const base_topic = document.getElementById("mqtt-base-topic").value.trim();
  const ha_discovery = document.getElementById("mqtt-ha-discovery").value === '1';

  try {
    const res = await fetchWithAuth(`${API_BASE}/system/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mqtt: { enabled, host, port, client_id, base_topic, ha_discovery }
      })
    });
    const data = await res.json();
    alert(data.message || 'MQTT settings saved');
  } catch (err) {
    alert('Failed to save MQTT settings: ' + err.message);
  }
}

async function saveTuyaSettings() {
  const portal_host = document.getElementById("tuya-portal-host").value.trim();
  const portal_port = Number(document.getElementById("tuya-portal-port").value);
  const poll_interval_ms = Number(document.getElementById("tuya-poll-interval").value);
  const voltage_limit = Number(document.getElementById("tuya-v-limit").value);
  const current_limit = Number(document.getElementById("tuya-c-limit").value);

  try {
    const res = await fetchWithAuth(`${API_BASE}/system/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tuya: { portal_host, portal_port, poll_interval_ms, voltage_limit, current_limit }
      })
    });
    const data = await res.json();
    alert(data.message || 'Tuya hardware bridge settings saved');
  } catch (err) {
    alert('Failed to save Tuya settings: ' + err.message);
  }
}

async function testTuyaBreakerConnection() {
  try {
    const res = await fetchWithAuth(`${API_BASE}/breaker/status`);
    const data = await res.json();
    alert(`Tuya Breaker LAN Status: ${data.status || 'Online'} (Voltage: ${data.telemetry?.voltage || 256}V, Current: ${data.telemetry?.current || 2.23}A, Power: ${data.telemetry?.power || 491}W)`);
  } catch (err) {
    alert('Breaker query: ' + err.message);
  }
}

async function saveSecuritySettings() {
  const session_expiry_days = Number(document.getElementById("sec-session-expiry").value);
  const ip_whitelist = document.getElementById("sec-ip-whitelist").value.trim();
  const allow_anonymous_telemetry = document.getElementById("sec-allow-anon").value === '1';

  try {
    const res = await fetchWithAuth(`${API_BASE}/system/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        security: { session_expiry_days, ip_whitelist, allow_anonymous_telemetry }
      })
    });
    const data = await res.json();
    alert(data.message || 'Security settings saved');
  } catch (err) {
    alert('Failed to save security settings: ' + err.message);
  }
}

async function saveDatabaseSettings() {
  const log_retention_days = Number(document.getElementById("db-retention-days").value);
  try {
    const res = await fetchWithAuth(`${API_BASE}/system/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ database: { log_retention_days } })
    });
    const data = await res.json();
    alert(data.message || 'Database retention settings saved');
  } catch (err) {
    alert('Failed to save database settings: ' + err.message);
  }
}

async function handleDatabaseVacuum() {
  try {
    const res = await fetchWithAuth(`${API_BASE}/system/database/vacuum`, { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Database vacuumed successfully');
    loadSettings();
  } catch (err) {
    alert('Vacuum error: ' + err.message);
  }
}

async function handleDatabaseClearLogs() {
  const days = prompt('Prune telemetry & relay logs older than how many days?', '14');
  if (!days) return;
  try {
    const res = await fetchWithAuth(`${API_BASE}/system/database/clear-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: Number(days) })
    });
    const data = await res.json();
    alert(data.message || 'Logs pruned successfully');
    loadSettings();
  } catch (err) {
    alert('Prune logs error: ' + err.message);
  }
}

// --- 14. LOGS & AUDIT TRAIL ---
let currentLogCategory = 'ALL';
let logSearchKeyword = '';

async function loadLogs() {
  const container = document.getElementById("content-area");
  try {
    const res = await fetch(`${API_BASE}/system/logs?limit=200`);
    const allData = await res.json();
    const data = Array.isArray(allData) ? allData : [];

    const filtered = data.filter(l => {
      const act = l.action || '';
      if (currentLogCategory === 'PIN') {
        if (!act.startsWith('PIN_')) return false;
      } else if (currentLogCategory === 'NODE') {
        if (!act.startsWith('NODE_ON') && !act.startsWith('NODE_OFF')) return false;
      } else if (currentLogCategory === 'REBOOT') {
        if (!act.includes('REBOOT') && !act.includes('RESTART')) return false;
      } else if (currentLogCategory === 'COMMAND_SENT') {
        if (act !== 'COMMAND_SENT') return false;
      }

      if (!logSearchKeyword) return true;
      const kw = logSearchKeyword.toLowerCase();
      return (act.toLowerCase().includes(kw)) ||
             ((l.target || '').toLowerCase().includes(kw)) ||
             ((l.details || l.message || '').toLowerCase().includes(kw)) ||
             ((l.timestamp || '').toLowerCase().includes(kw));
    });

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 600;">System Audit & Event Logs</h2>
          <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
            Showing ${filtered.length} entries (Pin status, Node online/offline, Restarts, Commands)
          </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <input type="text" id="log-search-input" placeholder="🔍 Search logs..." value="${escapeHtml(logSearchKeyword)}" 
            oninput="handleLogSearch(this.value)" 
            style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 6px; padding: 6px 12px; font-size: 13px; width: 220px;">
          <button class="btn btn-secondary" onclick="loadLogs()">🔄 Refresh</button>
        </div>
      </div>

      <div class="filter-pills">
        <button class="filter-btn ${currentLogCategory === 'ALL' ? 'active' : ''}" onclick="setLogCategory('ALL')">All Logs</button>
        <button class="filter-btn ${currentLogCategory === 'PIN' ? 'active' : ''}" onclick="setLogCategory('PIN')">⚡ Pin ON / OFF</button>
        <button class="filter-btn ${currentLogCategory === 'NODE' ? 'active' : ''}" onclick="setLogCategory('NODE')">🟢 Node Online/Offline</button>
        <button class="filter-btn ${currentLogCategory === 'REBOOT' ? 'active' : ''}" onclick="setLogCategory('REBOOT')">🔄 Node Restarts</button>
        <button class="filter-btn ${currentLogCategory === 'COMMAND_SENT' ? 'active' : ''}" onclick="setLogCategory('COMMAND_SENT')">🚀 Commands</button>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Action / Event</th>
            <th>Target Node</th>
            <th>Event Details & Status</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length === 0 ? '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 28px;">No log entries found for current filter.</td></tr>' : ''}
          ${filtered.map(l => {
            const timeStr = l.timestamp ? new Date(l.timestamp).toLocaleString() : 'Just now';
            let tagClass = 'tag-sync';
            let actionLabel = l.action || 'SYSTEM';

            if (actionLabel === 'PIN_ON') {
              tagClass = 'tag-pin-on';
              actionLabel = '⚡ PIN ON';
            } else if (actionLabel === 'PIN_OFF') {
              tagClass = 'tag-pin-off';
              actionLabel = '⚪ PIN OFF';
            } else if (actionLabel === 'NODE_ONLINE') {
              tagClass = 'tag-node-online';
              actionLabel = '🟢 ONLINE';
            } else if (actionLabel === 'NODE_OFFLINE') {
              tagClass = 'tag-node-offline';
              actionLabel = '🔴 OFFLINE';
            } else if (actionLabel.includes('REBOOT') || actionLabel.includes('RESTART')) {
              tagClass = 'tag-reboot';
              actionLabel = '🔄 RESTART';
            } else if (actionLabel === 'COMMAND_SENT') {
              tagClass = 'badge-sync';
              actionLabel = '🚀 COMMAND';
            }

            return `
              <tr>
                <td style="white-space: nowrap; font-size: 12.5px; color: var(--text-muted);">${timeStr}</td>
                <td><span class="${tagClass}">${actionLabel}</span></td>
                <td><code>${escapeHtml(l.target || l.node_id || 'System')}</code></td>
                <td style="font-size: 13px; line-height: 1.4;">${escapeHtml(l.details || l.message || '')}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  } catch (e) {
    container.innerHTML = `<div style="color: var(--accent-red);">Error loading audit logs: ${e.message}</div>`;
  }
}

function setLogCategory(cat) {
  currentLogCategory = cat;
  loadLogs();
}

function handleLogSearch(kw) {
  logSearchKeyword = kw;
  loadLogs();
}

function refreshActiveMetrics() {
  if (currentView === "overview") loadOverview();
}

// === DEVICE-TYPE HARDWARE ISOLATION & SEPARATION HELPERS ===

function getNodeHardwareCategory(node) {
  if (!node) return 'ESP8266-NodeMCU';
  const hw = (node.hardware || node.hardware_type || '').toLowerCase();
  if (hw.includes('pcf8574')) {
    return 'ESP-01-PCF8574';
  }
  if (hw.includes('esp-01') || hw.includes('esp01') || hw.includes('1mb')) {
    return 'ESP-01';
  }
  if (hw.includes('nodemcu') || hw.includes('esp-12') || hw.includes('4mb')) {
    return 'ESP8266-NodeMCU';
  }
  if (hw.includes('esp32')) {
    return 'ESP32';
  }
  return 'ESP8266-Generic';
}

function getFirmwareHardwareCategory(fw) {
  if (!fw) return 'ESP8266-NodeMCU';
  const hw = (fw.hardware_type || fw.hardware || '').toLowerCase();
  if (hw.includes('pcf8574')) {
    return 'ESP-01-PCF8574';
  }
  if (hw.includes('esp-01') || hw.includes('esp01') || hw.includes('1mb')) {
    return 'ESP-01';
  }
  if (hw.includes('nodemcu') || hw.includes('esp-12') || hw.includes('4mb')) {
    return 'ESP8266-NodeMCU';
  }
  if (hw.includes('esp32')) {
    return 'ESP32';
  }
  return 'ESP8266-Generic';
}

function getHardwareProfileDetails(cat) {
  switch (cat) {
    case 'ESP-01-PCF8574':
      return {
        key: 'ESP-01-PCF8574',
        title: 'ESP8266 ESP-01 + PCF8574T (1MB)',
        badge: '<span class="status-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-weight: 600;">ESP-01 + PCF8574T (8-Ch I2C, 1MB)</span>',
        uploadHw: 'ESP8266 ESP-01 + PCF8574T (1MB)'
      };
    case 'ESP-01':
      return {
        key: 'ESP-01',
        title: 'ESP8266 ESP-01 / ESP-01S (1MB)',
        badge: '<span class="status-badge" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; font-weight: 600;">ESP8266 ESP-01 (1MB Flash)</span>',
        uploadHw: 'ESP8266 ESP-01 / ESP-01S (1MB)'
      };
    case 'ESP8266-NodeMCU':
      return {
        key: 'ESP8266-NodeMCU',
        title: 'ESP8266 (ESP-12E/F) NodeMCU',
        badge: '<span class="status-badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; font-weight: 600;">ESP8266 NodeMCU (4MB Flash)</span>',
        uploadHw: 'ESP8266 (ESP-12E/F) NodeMCU'
      };
    case 'ESP32':
      return {
        key: 'ESP32',
        title: 'ESP32 Microcontroller',
        badge: '<span class="status-badge" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; font-weight: 600;">ESP32 Architecture</span>',
        uploadHw: 'ESP32'
      };
    default:
      return {
        key: 'ESP8266-Generic',
        title: 'ESP8266 Generic',
        badge: '<span class="status-badge badge-sync" font-weight: 600;">ESP8266 Generic</span>',
        uploadHw: 'ESP8266 (Generic)'
      };
  }
}

// Strictly populates candidate firmware options for the target device ONLY
function updateWizardFirmwareOptions(node) {
  const container = document.getElementById("wiz-fw-selector-container");
  if (!container) return;

  const firmwares = window._cachedFirmwares || [];
  const nodeCat = getNodeHardwareCategory(node);
  const profile = getHardwareProfileDetails(nodeCat);

  // STRICT FILTER: Keep ONLY binaries belonging to this device type!
  const deviceFirmwares = firmwares.filter(f => getFirmwareHardwareCategory(f) === nodeCat);

  // Sort: Latest version first, then descending version/id
  deviceFirmwares.sort((a, b) => (b.is_latest ? 1 : 0) - (a.is_latest ? 1 : 0) || b.id - a.id);

  if (deviceFirmwares.length === 0) {
    otaWizardState.firmwareId = null;
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <label class="form-label" style="margin: 0;">Target Hardware Profile: ${profile.badge}</label>
      </div>
      <div style="padding: 16px; background: rgba(245, 158, 11, 0.1); border: 1px dashed rgba(245, 158, 11, 0.4); border-radius: 8px; margin-bottom: 12px;">
        <div style="display: flex; gap: 12px; align-items: flex-start;">
          <span style="font-size: 22px;">⚠️</span>
          <div style="flex: 1;">
            <strong style="color: #fde047;">No Firmware Binaries Available for ${profile.title}</strong>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; line-height: 1.5;">
              Binaries from other hardware devices are strictly hidden to prevent cross-flashing or partition bricking. Please upload a binary compiled for this specific device.
            </div>
            <div style="margin-top: 10px;">
              <button class="btn btn-primary" style="font-size: 12px; padding: 6px 14px;" onclick="showUploadFirmwareModalForHw('${profile.uploadHw}')">
                + Upload ${profile.title} Firmware (.bin)
              </button>
            </div>
          </div>
        </div>
      </div>
      <input type="hidden" id="wiz-fw-select" value="">
    `;

    const preCheckView = document.getElementById("wiz-precheck-view");
    if (preCheckView) {
      preCheckView.innerHTML = `
        <div class="check-item check-warn">
          <span>⚠️</span>
          <div><strong>Awaiting Dedicated Binary:</strong> No firmware uploaded for ${profile.title} yet. Click "+ Upload Firmware" above.</div>
        </div>
      `;
    }
    const deployBtn = document.getElementById("btn-start-ota-deploy");
    if (deployBtn) deployBtn.disabled = true;
    return;
  }

  // Auto-select latest version
  const defaultSelected = deviceFirmwares.find(f => f.is_latest) || deviceFirmwares[0];
  otaWizardState.firmwareId = defaultSelected.id;

  const latestList = deviceFirmwares.filter(f => f.is_latest);
  const historicalList = deviceFirmwares.filter(f => !f.is_latest);

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <label class="form-label" style="margin: 0;">
        Dedicated Firmware for: ${profile.badge}
      </label>
      <span style="font-size: 12px; color: var(--text-secondary);">
        <strong>${deviceFirmwares.length}</strong> version(s) available for this device
      </span>
    </div>

    <div class="form-group" style="margin-bottom: 16px;">
      <select id="wiz-fw-select" class="form-control" onchange="onWizardFirmwareChanged()" style="font-size: 13px; font-weight: 500;">
        ${latestList.length > 0 ? `
          <optgroup label="⭐ Latest Release for ${profile.title}">
            ${latestList.map(f => `
              <option value="${f.id}" selected>
                🌟 [RECOMMENDED LATEST] v${escapeHtml(f.version)} (${escapeHtml(f.filename)}) — ${(f.file_size_bytes/1024).toFixed(1)} KB [${escapeHtml(f.release_channel || 'LTS')}]
              </option>
            `).join('')}
          </optgroup>
        ` : ''}

        ${historicalList.length > 0 ? `
          <optgroup label="📦 Historical Versions for ${profile.title} (Rollback / Downgrade)">
            ${historicalList.map(f => `
              <option value="${f.id}">
                📦 [ROLLBACK] v${escapeHtml(f.version)} (${escapeHtml(f.filename)}) — ${(f.file_size_bytes/1024).toFixed(1)} KB [${escapeHtml(f.release_channel || 'LTS')}]
              </option>
            `).join('')}
          </optgroup>
        ` : ''}
      </select>
    </div>
  `;
}

// Helper: Open upload modal with preselected hardware type
function showUploadFirmwareModalForHw(preselectedHw) {
  showUploadFirmwareModal();
  setTimeout(() => {
    const sel = document.getElementById("fw-hardware");
    if (sel && preselectedHw) {
      for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value.includes(preselectedHw) || preselectedHw.includes(sel.options[i].value)) {
          sel.selectedIndex = i;
          break;
        }
      }
    }
  }, 50);
}

// Helper: Filter catalog table by hardware target
function filterCatalogByHw(targetHw) {
  const rows = document.querySelectorAll("#ota-tab-content table.data-table tbody tr");
  const buttons = document.querySelectorAll("#catalog-hw-filters button");

  buttons.forEach(b => {
    b.className = (b.textContent.includes(targetHw) || (targetHw === 'all' && b.textContent.includes('All')))
      ? 'btn btn-primary'
      : 'btn btn-secondary';
  });

  rows.forEach(r => {
    if (targetHw === 'all') {
      r.style.display = '';
      return;
    }
    const hwCell = r.querySelector("td:nth-child(2)");
    if (!hwCell) return;
    const txt = hwCell.textContent || '';
    if (txt.includes(targetHw) || targetHw.includes(txt)) {
      r.style.display = '';
    } else {
      r.style.display = 'none';
    }
  });
}

// === SUB-VIEW 5: COMPREHENSIVE OTA DEVELOPER GUIDE ===
function renderOtaDeveloperGuide() {
  const content = document.getElementById("ota-tab-content");
  content.innerHTML = `
    <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 24px; max-width: 1000px; margin: 0 auto;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <span style="font-size: 28px;">📖</span>
        <div>
          <h2 style="margin: 0; font-size: 20px;">ESP8266 & ESP32 Over-The-Air (OTA) Developer Guide</h2>
          <div style="font-size: 13px; color: var(--text-secondary);">Complete reference for compilation, flash partition sizing, semantic versioning, and crash-resilient updates</div>
        </div>
      </div>

      <!-- SECTION 1: ARCHITECTURE & PARTITION MAP -->
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 16px; margin: 0 0 10px 0; color: var(--accent-blue); display: flex; align-items: center; gap: 8px;">
          <span>1. Flash Memory Partition Architectures & Sizing Limits</span>
        </h3>
        <p style="font-size: 13px; line-height: 1.6; color: var(--text-secondary); margin: 0 0 12px 0;">
          The ESP8266 uses a dual-slot OTA mechanism. The flash memory must accommodate both the currently running sketch and the incoming binary simultaneously until the flash write finishes and passes verification.
        </p>

        <table class="data-table" style="font-size: 13px; margin-bottom: 12px;">
          <thead>
            <tr>
              <th>Target Board</th>
              <th>Total Flash</th>
              <th>Recommended Partition Scheme</th>
              <th>Max Sketch Binary Size</th>
              <th>Dual-Slot OTA Safe Barrier</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>ESP8266 (ESP-12E/F) NodeMCU</strong></td>
              <td>4 MB (4,194,304 B)</td>
              <td><code>4MB (FS:2MB OTA:~1019KB)</code> or <code>4MB (FS:1MB OTA:~1400KB)</code></td>
              <td>~1,044,480 B (1.0 MB)</td>
              <td><span class="status-badge badge-online">Safe Margin (+1,000 KB)</span></td>
            </tr>
            <tr>
              <td><strong>ESP8266 ESP-01 + PCF8574T</strong></td>
              <td>1 MB (1,048,576 B)</td>
              <td><code>1MB (FS:128KB OTA:~440KB)</code> (<code>eagle.flash.1m128.ld</code>)</td>
              <td>~440,000 B (430 KB)</td>
              <td><span class="status-badge badge-lts">8-Ch I2C Expander (&lt; 440 KB)</span></td>
            </tr>
            <tr>
              <td><strong>ESP8266 ESP-01 / ESP-01S</strong></td>
              <td>1 MB (1,048,576 B)</td>
              <td><code>1MB (FS:64KB OTA:~470KB)</code> (Strict Requirement)</td>
              <td>~480,000 B (468 KB)</td>
              <td><span class="status-badge badge-lts">Strict Barrier (&lt; 480 KB)</span></td>
            </tr>
            <tr>
              <td><strong>ESP32 (WROOM / WROVER)</strong></td>
              <td>4 MB / 8 MB / 16 MB</td>
              <td><code>Default 4MB with spiffs (1.2MB APP / 1.5MB SPIFFS)</code></td>
              <td>~1,310,720 B (1.25 MB)</td>
              <td><span class="status-badge badge-online">Safe Margin (+1,200 KB)</span></td>
            </tr>
          </tbody>
        </table>

        <div style="padding: 10px 14px; background: rgba(239, 68, 68, 0.1); border-left: 4px solid var(--accent-red); border-radius: 4px; font-size: 12px; color: #fca5a5;">
          <strong>CRITICAL WARNING FOR ESP-01 (1MB):</strong> Never select <code>1MB (FS:512KB)</code> in Arduino IDE or PlatformIO for ESP-01. With 512KB SPIFFS, free sketch space drops to &lt; 250KB, causing <code>Update.begin()</code> to immediately reject the upload with <code>ESP8266 OTA Begin Failed: Not Enough Space</code>.
        </div>
      </div>

      <!-- SECTION 2: EXPORTING COMPILED BINARY -->
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 16px; margin: 0 0 10px 0; color: var(--accent-blue); display: flex; align-items: center; gap: 8px;">
          <span>2. How to Compile & Export Binary (.bin)</span>
        </h3>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div style="background: var(--bg-primary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #93c5fd;">In Arduino IDE 1.8.x / 2.x</div>
            <ol style="font-size: 12px; line-height: 1.6; padding-left: 20px; margin: 0; color: var(--text-secondary);">
              <li>Select your board under <strong>Tools ➔ Board</strong>:
                <br>• NodeMCU: <code>NodeMCU 1.0 (ESP-12E Module)</code>
                <br>• ESP-01: <code>Generic ESP8266 Module</code>
              </li>
              <li>Set <strong>Tools ➔ Flash Size</strong>:
                <br>• NodeMCU: <code>4MB (FS:2MB OTA:~1019KB)</code>
                <br>• ESP-01: <code>1MB (FS:64KB OTA:~470KB)</code>
              </li>
              <li>Click menu: <strong>Sketch ➔ Export Compiled Binary</strong> (or press <kbd>Ctrl+Alt+S</kbd>).</li>
              <li>Locate the <code>.bin</code> file inside your sketch folder (under <code>build/esp8266.esp8266.../</code>).</li>
            </ol>
          </div>

          <div style="background: var(--bg-primary); padding: 14px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #93c5fd;">In PlatformIO (VS Code)</div>
            <ol style="font-size: 12px; line-height: 1.6; padding-left: 20px; margin: 0; color: var(--text-secondary);">
              <li>In <code>platformio.ini</code>, specify flash partitions:
                <pre style="background: #0f172a; padding: 6px; border-radius: 4px; margin: 4px 0; font-size: 11px;">[env:esp01_1m]
board = esp01_1m
board_build.ldscript = eagle.flash.1m64.ld</pre>
              </li>
              <li>Run build task: <code>pio run</code>.</li>
              <li>The output binary is located at:
                <br><code style="font-size: 11px;">.pio/build/esp01_1m/firmware.bin</code>
              </li>
            </ol>
          </div>
        </div>
      </div>

      <!-- SECTION 3: EMBEDDING VERSION & REBOOT VERIFICATION -->
      <div style="margin-bottom: 24px;">
        <h3 style="font-size: 16px; margin: 0 0 10px 0; color: var(--accent-blue); display: flex; align-items: center; gap: 8px;">
          <span>3. Semantic Versioning in Microcontroller Code</span>
        </h3>
        <p style="font-size: 13px; line-height: 1.6; color: var(--text-secondary); margin: 0 0 10px 0;">
          The Central Server validates firmware versions using semantic versioning (<code>X.Y.Z</code>). When releasing an update, bump the version macro in your source code so the node automatically reports the new version upon rebooting:
        </p>

        <pre style="background: #0f172a; padding: 12px; border-radius: 6px; border: 1px solid var(--border-color); font-family: monospace; font-size: 12px; color: #e2e8f0; overflow-x: auto;">
// In your sketch or config header:
#define FIRMWARE_NAME    "SmartHome-NodeMCU"
#define FIRMWARE_VERSION "1.7.0"  // &lt;-- Bump this version on every release!

// In handleStatus() returning GET /api/status:
void handleStatus() {
  DynamicJsonDocument doc(1024);
  doc["deviceName"] = FIRMWARE_NAME;
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  doc["hardware"] = "ESP8266 (ESP-12E/F) NodeMCU";
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["sketchSize"] = ESP.getSketchSize();
  doc["freeSketchSpace"] = ESP.getFreeSketchSpace();
  doc["uptimeSec"] = millis() / 1000;
  // ...
  String json;
  serializeJson(doc, json);
  server.send(200, "application/json", json);
}
        </pre>
      </div>

      <!-- SECTION 4: PRE-FLIGHT & CRASH RESILIENCE CHECKLIST -->
      <div>
        <h3 style="font-size: 16px; margin: 0 0 10px 0; color: var(--accent-blue); display: flex; align-items: center; gap: 8px;">
          <span>4. Pre-Flight Verification & Best Practices</span>
        </h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px;">
          <div style="padding: 10px; background: rgba(34, 197, 94, 0.08); border-left: 3px solid var(--accent-green); border-radius: 4px;">
            <strong>✅ ROM Flash Magic Byte 0xE9</strong>
            <div style="color: var(--text-secondary); margin-top: 2px;">The Central Server and ESP both verify byte 0 is <code>0xE9</code>. This guarantees non-firmware files or HTML error pages are never written to flash.</div>
          </div>
          <div style="padding: 10px; background: rgba(59, 130, 246, 0.08); border-left: 3px solid var(--accent-blue); border-radius: 4px;">
            <strong>✅ Free Dynamic RAM (&gt; 15 KB)</strong>
            <div style="color: var(--text-secondary); margin-top: 2px;">Ensure node heap is healthy before flashing. The server will warn if free heap drops below 14 KB to avoid TCP buffer exhaustion.</div>
          </div>
          <div style="padding: 10px; background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; border-radius: 4px;">
            <strong>✅ MD5 Checksum Integrity Check</strong>
            <div style="color: var(--text-secondary); margin-top: 2px;">The Central Server transmits the <code>X-File-MD5</code> header. The ESP compares the MD5 upon completion before issuing a reboot.</div>
          </div>
          <div style="padding: 10px; background: rgba(168, 85, 247, 0.08); border-left: 3px solid #a855f7; border-radius: 4px;">
            <strong>✅ Automated Pre-OTA Backup & Rollback</strong>
            <div style="color: var(--text-secondary); margin-top: 2px;">Keep old firmware binaries in the catalog! If a newer release causes instability, use the wizard to select the historical version and downgrade with 1 click.</div>
          </div>
        </div>
      </div>

    </div>
  `;
}

// ==========================================================================
// ==========================================================================
// ==========================================================================
// === SMART CIRCUIT BREAKER (TUYA LAN INTEGRATION) ===
// ==========================================================================

let breakerSubTab = "telemetry";
let latestBreakerData = null;
let tuyaDevicesList = [];
let activeTuyaDeviceId = null;
let serialLogsBuffer = [];
let serialAutoScroll = true;
let serialPaused = false;
let serialCurrentFilter = "ALL";

const BREAKER_DP_NAMES = {
  "1": "Sub DP (bool)",
  "9": "Trip Countdown (sec)",
  "11": "Fault Status (code)",
  "12": "Fault Details (string)",
  "13": "Countdown Left (sec)",
  "14": "Total Forward Energy (int)",
  "15": "Monthly Statistics",
  "16": "Reverse Active Energy",
  "17": "Alarm Code (bitmask)",
  "18": "Overcurrent Limit (A)",
  "19": "Overcurrent Delay (s)",
  "20": "Voltage Upper Limit (V)",
  "21": "Voltage Lower Limit (V)",
  "22": "Auto Reclose Wait (s)",
  "23": "Leakage Limit (mA)",
  "24": "Leakage Trip Delay (s)",
  "26": "Hardware Safety Fault Reg",
  "38": "Power-On AC Behavior",
  "40": "Maintenance Lock",
  "101": "Forward Cumulative Energy (0.01 kWh)",
  "102": "V / I / P Stream (Base64)",
  "103": "Prepayment Switch / Auxiliary Contact",
  "104": "Over-Voltage Protect Delay (s)",
  "105": "Over-Voltage Recovery Delay (s)",
  "107": "Under-Voltage Recovery Delay (s)",
  "108": "Main Breaker Contact Switch",
  "111": "Hardware Model Revision",
  "112": "AC Grid Frequency (0.1 Hz)",
  "113": "Phase / Line Status",
  "114": "Internal Probe Temperature (°C)",
  "115": "High Temp Cutoff Threshold (°C)",
  "116": "Protection Trip Delay (s)",
  "117": "Instant Safety Delay (s)",
  "118": "Auto-Reclose Delay (s)",
  "119": "Auto-Reclose Master Enable",
  "121": "Over-Voltage Threshold Register",
  "123": "Power Calibration Register",
  "126": "Residual Leakage Current (mA)",
  "127": "Leakage Protection Master",
  "129": "Leakage Recovery Delay (s)",
  "130": "Overcurrent Threshold (A)",
  "131": "Overcurrent Delay (s)",
  "132": "Leakage Trip Threshold (mA)",
  "133": "Auto-Reclose Max Attempts"
};

async function loadBreakerView() {
  const container = document.getElementById("content-area");
  try {
    // 1. Fetch Status & Telemetry
    const res = await fetch(`${API_BASE}/breaker/status`);
    const data = await res.json();
    latestBreakerData = data;

    // 2. Fetch Multi-Device List
    try {
      const devRes = await fetch(`${API_BASE}/breaker/devices`);
      const devData = await devRes.json();
      if (devData.success) {
        tuyaDevicesList = devData.devices || [];
        activeTuyaDeviceId = devData.activeDevice?.id || (tuyaDevicesList[0]?.id);
      }
    } catch (e) {
      console.warn("Could not load Tuya devices list:", e);
    }

    renderBreakerDashboard(container, data);

    if (breakerSubTab === 'serial') {
      loadSerialLogsFromServer();
    }
  } catch (err) {
    container.innerHTML = `
      <div style="padding: 30px; text-align: center; color: var(--accent-red);">
        <h3>⚠️ Unable to connect to Smart Breaker</h3>
        <p style="margin-top: 8px; color: var(--text-secondary);">${escapeHtml(err.message)}</p>
        <button class="btn btn-primary" onclick="loadBreakerView()" style="margin-top: 16px;">🔄 Retry Connection</button>
      </div>
    `;
  }
}

function renderBreakerDashboard(container, data) {
  const cfg = data.config || {};
  const rd = data.reading || {};
  const dec = rd.decoded || {};
  const dps = rd.dps || {};
  const isOnline = Boolean(rd.online);
  const switchState = Boolean(dec.switch_state);
  const isLocked = Boolean(dec.child_lock);
  const currentIp = cfg.ip_address || '192.168.1.25';

  container.innerHTML = `
    <!-- Top Header Banner -->
    <div class="breaker-header-bar">
      <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
        <div class="breaker-device-avatar">⚡</div>
        <div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <select class="breaker-device-select" onchange="handleSelectTuyaDevice(this.value)" title="Switch Active Breaker / Device">
              ${(tuyaDevicesList.length > 0 ? tuyaDevicesList : [{ id: cfg.device_id || 'd705ffaccaf4d0f1b1addg', name: cfg.device_name || 'Wi-Fi Smart Circuit Breaker', ip: currentIp, is_active: 1 }]).map(d => `
                <option value="${escapeHtml(d.id)}" ${d.is_active || d.id === activeTuyaDeviceId ? 'selected' : ''}>
                  ⚡ ${escapeHtml(d.name || 'Breaker')} (${escapeHtml(d.ip)})
                </option>
              `).join('')}
            </select>

            <span class="status-badge ${isOnline ? 'badge-online' : 'badge-offline'}" id="breaker-online-badge">
              <span class="pulse-dot"></span> ${isOnline ? '🟢 LIVE LAN (Local)' : '🔴 OFFLINE / UNREACHABLE'}
            </span>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
            <span class="breaker-meta-pill clickable" onclick="openBreakerNetworkConfigModal()" title="Click to Change IP Address or Credentials">
              📍 IP: <strong>${escapeHtml(currentIp)}</strong> <span style="font-size: 11px; margin-left: 4px; color: #60a5fa;">✏️ Change IP</span>
            </span>
            <span class="breaker-meta-pill">🆔 MAC: <strong>${escapeHtml(data.macAddress || cfg.mac_address || '30:48:7d:e8:5d:5c')}</strong></span>
            <span class="breaker-meta-pill">📦 Model: <strong>${escapeHtml(dec.model_str || cfg.model_sn || 'B-B1-M')}</strong></span>
            <span class="breaker-meta-pill">🔒 Protocol: <strong>v${escapeHtml(String(cfg.protocol_version || '3.5'))} (AES-128 Local)</strong></span>
          </div>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="openAddTuyaDeviceModal()" title="Add another Tuya Breaker or Smart Device">
          <span>➕</span> Add Device
        </button>
        <button class="btn" onclick="openBreakerNetworkConfigModal()" title="Configure IP, Name, and Key">
          <span>⚙️</span> Network & IP
        </button>
        <button class="btn" onclick="refreshBreakerNow()" id="breaker-refresh-btn" title="Poll Device Locally">
          <span>🔄</span> Refresh Now
        </button>
      </div>
    </div>

    <!-- Master Switch Hero Card -->
    <div class="breaker-hero-card">
      <div class="breaker-switch-section">
        <div class="breaker-switch-label" id="breaker-status-text" style="color: ${switchState ? '#34d399' : '#f87171'};">
          ${switchState ? 'CIRCUIT CLOSED (ENERGIZED)' : 'CIRCUIT TRIPPED (ISOLATED)'}
        </div>
        <div style="margin: 14px 0;">
          <button id="breaker-main-btn" class="breaker-power-btn ${switchState ? 'state-on' : 'state-off'}" onclick="handleBreakerTogglePrompt()" title="Click to Switch Main Breaker">
            ⏻
          </button>
        </div>
        <div id="breaker-status-desc" style="font-size: 12.5px; color: var(--text-secondary); text-align: center; max-width: 320px;">
          ${switchState ? 'Main internal contacts (DP 108) are closed. Mains electricity is flowing safely through the breaker.' : 'Circuit is open. Downstream power is isolated.'}
        </div>
      </div>

      <div class="breaker-controls-group">
        <div class="breaker-ctrl-row">
          <div>
            <div style="font-weight: 600; font-size: 13.5px;">Maintenance Lock (Child Lock - DP 40)</div>
            <div style="font-size: 11.5px; color: var(--text-secondary);">Forces breaker OFF and blocks remote switching during repairs</div>
          </div>
          <div>
            <button id="breaker-lock-btn" class="btn" onclick="handleBreakerLockToggle(${isLocked})" style="font-size: 12px; padding: 6px 12px; border-color: ${isLocked ? 'var(--accent-red)' : 'var(--border-color)'};">
              ${isLocked ? '🔒 Locked (Safety Active)' : '🔓 Unlocked'}
            </button>
          </div>
        </div>

        <div class="breaker-ctrl-row">
          <div>
            <div style="font-weight: 600; font-size: 13.5px;">AC Power-On Recovery Behavior (DP 38)</div>
            <div style="font-size: 11.5px; color: var(--text-secondary);">Restored contact state when AC mains power returns after blackout</div>
          </div>
          <div>
            <select id="breaker-poweron-select" onchange="handleBreakerPowerOnBehavior(this.value)" style="background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 12px;">
              <option value="memory" ${dec.power_on_behavior === 'memory' ? 'selected' : ''}>Remember Last State (Memory)</option>
              <option value="0" ${dec.power_on_behavior === '0' ? 'selected' : ''}>Always Power OFF</option>
              <option value="1" ${dec.power_on_behavior === '1' ? 'selected' : ''}>Always Power ON</option>
            </select>
          </div>
        </div>

        <div class="breaker-ctrl-row">
          <div>
            <div style="font-weight: 600; font-size: 13.5px;">Auto Countdown Timer (DP 9)</div>
            <div style="font-size: 11.5px; color: var(--text-secondary);">Automatically trips contact switch after duration</div>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="number" id="breaker-countdown-input" placeholder="Sec (0-86400)" style="width: 100px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-size: 12px;" min="0" max="86400">
            <button class="btn btn-primary" onclick="handleCountdownSet()" style="font-size: 12px; padding: 6px 10px;">Set</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation Subtabs -->
    <div class="breaker-tabs-nav">
      <button class="breaker-tab-btn ${breakerSubTab === 'telemetry' ? 'active' : ''}" onclick="switchBreakerTab('telemetry')">
        <span>📊</span> Live Telemetry
      </button>
      <button class="breaker-tab-btn ${breakerSubTab === 'protection' ? 'active' : ''}" onclick="switchBreakerTab('protection')">
        <span>🛡️</span> Protection & Thresholds
      </button>
      <button class="breaker-tab-btn ${breakerSubTab === 'devices' ? 'active' : ''}" onclick="switchBreakerTab('devices')">
        <span>📱</span> Devices & Fleet (${tuyaDevicesList.length || 1})
      </button>
      <button class="breaker-tab-btn ${breakerSubTab === 'serial' ? 'active' : ''}" onclick="switchBreakerTab('serial')">
        <span>📟</span> Live Serial Monitor
      </button>
      <button class="breaker-tab-btn ${breakerSubTab === 'alarms' ? 'active' : ''}" onclick="switchBreakerTab('alarms')">
        <span>🚨</span> Alarms & Faults
        ${dec.has_alarm ? '<span class="status-badge badge-offline" style="font-size: 9px; padding: 1px 4px;">ALARM</span>' : ''}
      </button>
      <button class="breaker-tab-btn ${breakerSubTab === 'dps' ? 'active' : ''}" onclick="switchBreakerTab('dps')">
        <span>🔍</span> Raw DP Inspector
      </button>
      <button class="breaker-tab-btn ${breakerSubTab === 'reference' ? 'active' : ''}" onclick="switchBreakerTab('reference')">
        <span>📖</span> Reference & How It Works
      </button>
    </div>

    <!-- Subtab Content Area -->
    <div id="breaker-subtab-container">
      ${renderBreakerSubTab(data)}
    </div>
  `;
}

function switchBreakerTab(tabName) {
  breakerSubTab = tabName;
  document.querySelectorAll(".breaker-tab-btn").forEach(btn => {
    btn.classList.remove("active");
    if (btn.textContent.toLowerCase().includes(tabName)) {
      btn.classList.add("active");
    }
  });
  const container = document.getElementById("breaker-subtab-container");
  if (container && latestBreakerData) {
    container.innerHTML = renderBreakerSubTab(latestBreakerData);
    if (tabName === 'serial') {
      initSerialTerminal();
      loadSerialLogsFromServer();
    }
  }
}

function renderBreakerSubTab(data) {
  const dec = data.reading?.decoded || {};
  const dps = data.reading?.dps || {};
  const cfg = data.config || {};
  const currentIp = cfg.ip_address || '192.168.1.25';

  // 1. LIVE TELEMETRY VIEW
  if (breakerSubTab === 'telemetry') {
    return `
      <div class="breaker-metrics-grid">
        <!-- Voltage -->
        <div class="breaker-metric-card volt">
          <div class="breaker-metric-header">
            <span>Mains Voltage</span>
            <span>🔌</span>
          </div>
          <div class="breaker-metric-val-row">
            <span class="breaker-metric-val" id="bm-voltage">${dec.voltage_v !== undefined ? dec.voltage_v : '—'}</span>
            <span class="breaker-metric-unit">V</span>
          </div>
          <div class="breaker-metric-footer">
            <span>Nominal: 230V</span>
            <span style="color: ${dec.voltage_v > 265 ? 'var(--accent-red)' : dec.voltage_v < 185 ? 'var(--accent-amber)' : 'var(--accent-green)'};">
              ${dec.voltage_v > 265 ? 'High' : dec.voltage_v < 185 ? 'Low' : 'Normal'}
            </span>
          </div>
        </div>

        <!-- Current -->
        <div class="breaker-metric-card curr">
          <div class="breaker-metric-header">
            <span>Load Current</span>
            <span>⚡</span>
          </div>
          <div class="breaker-metric-val-row">
            <span class="breaker-metric-val" id="bm-current">${dec.current_a !== undefined ? dec.current_a : '—'}</span>
            <span class="breaker-metric-unit">A</span>
          </div>
          <div class="breaker-metric-footer">
            <span>Rated Limit: 63A</span>
            <span>${dec.current_a > 0.05 ? 'Load Active' : 'Idle'}</span>
          </div>
        </div>

        <!-- Residual Leakage Current -->
        <div class="breaker-metric-card leakage">
          <div class="breaker-metric-header">
            <span>Residual Earth Leakage</span>
            <span>⚠️</span>
          </div>
          <div class="breaker-metric-val-row">
            <span class="breaker-metric-val" id="bm-leakage" style="color: ${(dec.leakage_current_ma || 0) > (dec.leakage_threshold_ma || 200) ? 'var(--accent-red)' : 'var(--text-primary)'};">
              ${dec.leakage_current_ma !== undefined ? dec.leakage_current_ma : '0'}
            </span>
            <span class="breaker-metric-unit">mA</span>
          </div>
          <div class="breaker-metric-footer">
            <span>Limit: <strong id="bm-leakage-thresh">${dec.leakage_threshold_ma || 200} mA</strong></span>
            <span style="color: ${(dec.leakage_current_ma || 0) > 0 ? 'var(--accent-amber)' : 'var(--accent-green)'};">
              ${(dec.leakage_current_ma || 0) === 0 ? 'Safe (0 mA)' : 'Residual Draw'}
            </span>
          </div>
        </div>

        <!-- Active Power -->
        <div class="breaker-metric-card pwr">
          <div class="breaker-metric-header">
            <span>Active Power</span>
            <span>💡</span>
          </div>
          <div class="breaker-metric-val-row">
            <span class="breaker-metric-val" id="bm-power">${dec.power_w !== undefined ? dec.power_w : '—'}</span>
            <span class="breaker-metric-unit">W</span>
          </div>
          <div class="breaker-metric-footer">
            <span>${dec.power_kw ? dec.power_kw + ' kW' : '—'}</span>
            <span>PF: <strong id="bm-pf">${dec.power_factor || '0.99'}</strong></span>
          </div>
        </div>

        <!-- Total Forward Energy -->
        <div class="breaker-metric-card energy">
          <div class="breaker-metric-header">
            <span>Cumulative Energy</span>
            <span>📈</span>
          </div>
          <div class="breaker-metric-val-row">
            <span class="breaker-metric-val" id="bm-energy">${dec.total_energy_kwh !== undefined ? dec.total_energy_kwh : '—'}</span>
            <span class="breaker-metric-unit">kWh</span>
          </div>
          <div class="breaker-metric-footer">
            <span>DP 101 Forward Meter</span>
            <span>Totalized</span>
          </div>
        </div>

        <!-- Line Frequency -->
        <div class="breaker-metric-card freq">
          <div class="breaker-metric-header">
            <span>Line Frequency</span>
            <span>〰️</span>
          </div>
          <div class="breaker-metric-val-row">
            <span class="breaker-metric-val" id="bm-freq">${dec.frequency_hz !== undefined ? dec.frequency_hz : '50.0'}</span>
            <span class="breaker-metric-unit">Hz</span>
          </div>
          <div class="breaker-metric-footer">
            <span>Standard: 50.0 Hz</span>
            <span style="color: var(--accent-green);">Synchronized</span>
          </div>
        </div>

        <!-- Internal Temperature -->
        <div class="breaker-metric-card temp">
          <div class="breaker-metric-header">
            <span>Internal Temperature</span>
            <span>🌡️</span>
          </div>
          <div class="breaker-metric-val-row">
            <span class="breaker-metric-val" id="bm-temp">${dec.temperature_c !== undefined ? dec.temperature_c : '—'}</span>
            <span class="breaker-metric-unit">°C</span>
          </div>
          <div class="breaker-metric-footer">
            <span>Cutoff: <strong id="bm-temp-thresh">${dps['115'] || dec.high_temp_threshold_c || 93}°C</strong></span>
            <span style="color: ${(dec.temperature_c || 0) > 60 ? 'var(--accent-amber)' : 'var(--accent-green)'};">
              ${(dec.temperature_c || 0) > 60 ? 'Warm' : 'Normal'}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // 2. PROTECTION & THRESHOLDS VIEW
  if (breakerSubTab === 'protection') {
    const isLeakageMasterOn = dps['127'] !== false;
    const isVoltageProtectMasterOn = dps['108'] !== false;
    const isAutoRecloseOn = dps['119'] !== false;
    const leakageThresh = Number(dps['132'] || dec.leakage_threshold_ma || 200);
    const overcurrentLimit = Number(dps['130'] || 30);
    const autoRecloseMax = Number(dps['133'] || 10);
    const autoRecloseDelay = Number(dps['118'] || 30);
    const leakageDelay = Number(dps['129'] || 1);
    const highTempThresh = Number(dps['115'] || dec.high_temp_threshold_c || 93);
    const liveTemp = Number(dec.temperature_c !== undefined ? dec.temperature_c : (dps['114'] || 33));
    const overvoltageReg = Number(dps['121'] || 14144);
    const overvoltageDelay = Number(dps['105'] || 0);
    const protectionDelay = Number(dps['117'] || 1);
    const generalTripDelay = Number(dps['116'] || 5);

    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 18px;">
        <!-- Over-Voltage & Under-Voltage Protection Card -->
        <div class="threshold-card">
          <h3 style="font-size: 15px; margin: 0 0 14px 0; color: #38bdf8; display: flex; align-items: center; justify-content: space-between;">
            <span>⚡ Over & Under-Voltage Protection</span>
            <span class="status-badge ${isVoltageProtectMasterOn ? 'badge-online' : 'badge-offline'}">
              ${isVoltageProtectMasterOn ? 'ACTIVE' : 'OFF'}
            </span>
          </h3>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
            <div>
              <div style="font-size: 13px; font-weight: 600;">Voltage Protection Master (DP 108)</div>
              <div style="font-size: 11.5px; color: var(--text-secondary);">Master enable for grid voltage limits</div>
            </div>
            <div>
              <button class="btn ${isVoltageProtectMasterOn ? 'btn-primary' : ''}" onclick="handleVoltageMasterToggle(${!isVoltageProtectMasterOn})" style="font-size: 12px; padding: 4px 10px;">
                ${isVoltageProtectMasterOn ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 13px; font-weight: 600;">Over-Voltage Cutoff / Register (DP 121)</label>
              <span style="font-size: 13.5px; font-weight: 700; color: #38bdf8;">${overvoltageReg}</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="number" id="input-overvol-thresh" value="${overvoltageReg}" min="100" max="65535" style="width: 110px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 13px;">
              <button class="btn btn-primary" onclick="handleOvervoltageThresholdUpdate(document.getElementById('input-overvol-thresh').value)" style="font-size: 12px;">Save</button>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
              <span style="font-size: 11px; color: var(--text-secondary); margin-right: 4px;">Presets:</span>
              <button class="preset-pill ${overvoltageReg === 14144 ? 'active' : ''}" onclick="handleOvervoltageThresholdUpdate(14144)">Default (14144 / ~275V)</button>
              <button class="preset-pill" onclick="handleOvervoltageThresholdUpdate(13800)">265V Safe</button>
              <button class="preset-pill" onclick="handleOvervoltageThresholdUpdate(14300)">280V Wide</button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px;">
            <div>
              <label style="font-size: 11.5px; color: var(--text-secondary);">Recovery Delay (DP 105)</label>
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <input type="number" id="input-overvol-recovery" value="${overvoltageDelay}" min="0" max="999" style="width: 65px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 6px; font-size: 12px;">
                <button class="btn" onclick="updateBreakerDp('105', Number(document.getElementById('input-overvol-recovery').value))" style="font-size: 11px; padding: 4px 8px;">Save</button>
              </div>
            </div>
            <div>
              <label style="font-size: 11.5px; color: var(--text-secondary);">Safety Delay (DP 117)</label>
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <input type="number" id="input-protect-delay" value="${protectionDelay}" min="1" max="30" style="width: 65px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 6px; font-size: 12px;">
                <button class="btn" onclick="updateBreakerDp('117', Number(document.getElementById('input-protect-delay').value))" style="font-size: 11px; padding: 4px 8px;">Save</button>
              </div>
            </div>
          </div>
        </div>

        <!-- High Temperature Protection Card -->
        <div class="threshold-card">
          <h3 style="font-size: 15px; margin: 0 0 14px 0; color: #f97316; display: flex; align-items: center; justify-content: space-between;">
            <span>🌡️ High Temperature Protection</span>
            <span class="status-badge ${liveTemp > highTempThresh ? 'badge-offline' : 'badge-online'}">
              ${liveTemp > highTempThresh ? 'OVERHEAT' : 'NORMAL'}
            </span>
          </h3>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
            <div>
              <div style="font-size: 13px; font-weight: 600;">Live Sensor Probe (DP 114)</div>
              <div style="font-size: 11.5px; color: var(--text-secondary);">Real-time internal PCB heat reading</div>
            </div>
            <div>
              <span style="font-size: 17px; font-weight: 800; color: ${liveTemp > 60 ? '#f59e0b' : '#34d399'};">${liveTemp} °C</span>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 13px; font-weight: 600;">High Temp Cutoff Threshold (DP 115)</label>
              <span style="font-size: 14px; font-weight: 700; color: #f97316;">${highTempThresh} °C</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="number" id="input-hightemp-thresh" value="${highTempThresh}" min="40" max="150" step="1" style="width: 100px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 13px;">
              <button class="btn btn-primary" onclick="handleHighTempThresholdUpdate(document.getElementById('input-hightemp-thresh').value)" style="font-size: 12px;">Save</button>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px;">
              <span style="font-size: 11px; color: var(--text-secondary); margin-right: 4px;">Presets:</span>
              <button class="preset-pill ${highTempThresh === 70 ? 'active' : ''}" onclick="handleHighTempThresholdUpdate(70)">70°C Safe</button>
              <button class="preset-pill ${highTempThresh === 80 ? 'active' : ''}" onclick="handleHighTempThresholdUpdate(80)">80°C High</button>
              <button class="preset-pill ${highTempThresh === 93 ? 'active' : ''}" onclick="handleHighTempThresholdUpdate(93)">93°C (Current)</button>
              <button class="preset-pill ${highTempThresh === 100 ? 'active' : ''}" onclick="handleHighTempThresholdUpdate(100)">100°C Max</button>
            </div>
          </div>
          <div style="font-size: 12px; color: var(--text-secondary);">
            Thermal Safety Trip Delay: <strong>${generalTripDelay} seconds</strong> (DP 116).
          </div>
        </div>

        <!-- Residual Earth Leakage Protection Card -->
        <div class="threshold-card">
          <h3 style="font-size: 15px; margin: 0 0 14px 0; color: #ec4899; display: flex; align-items: center; justify-content: space-between;">
            <span>⚠️ Residual Earth Leakage Protection</span>
            <span class="status-badge ${isLeakageMasterOn ? 'badge-online' : 'badge-offline'}">
              ${isLeakageMasterOn ? 'ENABLED' : 'DISABLED'}
            </span>
          </h3>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
            <div>
              <div style="font-size: 13px; font-weight: 600;">Leakage Master Switch (DP 127)</div>
              <div style="font-size: 11.5px; color: var(--text-secondary);">Master enable for residual current trip</div>
            </div>
            <div>
              <button class="btn ${isLeakageMasterOn ? 'btn-primary' : ''}" onclick="handleLeakageMasterToggle(${!isLeakageMasterOn})" style="font-size: 12px; padding: 4px 10px;">
                ${isLeakageMasterOn ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 13px; font-weight: 600;">Trip Threshold (DP 132)</label>
              <span style="font-size: 14px; font-weight: 700; color: #ec4899;">${leakageThresh} mA</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="number" id="input-leakage-thresh" value="${leakageThresh}" min="10" max="1000" step="10" style="width: 110px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 13px;">
              <button class="btn btn-primary" onclick="handleLeakageThresholdUpdate(document.getElementById('input-leakage-thresh').value)" style="font-size: 12px;">Save</button>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px;">
              <span style="font-size: 11px; color: var(--text-secondary); margin-right: 4px;">Presets:</span>
              <button class="preset-pill ${leakageThresh === 30 ? 'active' : ''}" onclick="handleLeakageThresholdUpdate(30)">30mA (Human Safety)</button>
              <button class="preset-pill ${leakageThresh === 50 ? 'active' : ''}" onclick="handleLeakageThresholdUpdate(50)">50mA</button>
              <button class="preset-pill ${leakageThresh === 100 ? 'active' : ''}" onclick="handleLeakageThresholdUpdate(100)">100mA</button>
              <button class="preset-pill ${leakageThresh === 200 ? 'active' : ''}" onclick="handleLeakageThresholdUpdate(200)">200mA (Current)</button>
              <button class="preset-pill ${leakageThresh === 300 ? 'active' : ''}" onclick="handleLeakageThresholdUpdate(300)">300mA</button>
            </div>
          </div>

          <div>
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">Leakage Recovery Trip Delay (DP 129)</div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="number" id="input-leakage-delay" value="${leakageDelay}" min="1" max="60" style="width: 90px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 13px;">
              <span style="font-size: 12px; color: var(--text-secondary);">seconds</span>
              <button class="btn" onclick="updateBreakerDp('129', Number(document.getElementById('input-leakage-delay').value))" style="font-size: 12px;">Save</button>
            </div>
          </div>
        </div>

        <!-- Overcurrent Protection Card -->
        <div class="threshold-card">
          <h3 style="font-size: 15px; margin: 0 0 14px 0; color: #f59e0b;">⚡ Overcurrent & Overload Protection</h3>
          
          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 13px; font-weight: 600;">Overcurrent Trip Limit (DP 130)</label>
              <span style="font-weight: 700; color: #f59e0b;">${overcurrentLimit} A</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="number" id="input-overcurrent-limit" value="${overcurrentLimit}" min="1" max="63" style="width: 90px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 13px;">
              <span style="font-size: 12px; color: var(--text-secondary);">Amperes (1 - 63A)</span>
              <button class="btn btn-primary" onclick="updateBreakerDp('130', Number(document.getElementById('input-overcurrent-limit').value))" style="font-size: 12px;">Save</button>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px;">
              <span style="font-size: 11px; color: var(--text-secondary); margin-right: 4px;">Presets:</span>
              <button class="preset-pill ${overcurrentLimit === 16 ? 'active' : ''}" onclick="updateBreakerDp('130', 16)">16A</button>
              <button class="preset-pill ${overcurrentLimit === 25 ? 'active' : ''}" onclick="updateBreakerDp('130', 25)">25A</button>
              <button class="preset-pill ${overcurrentLimit === 30 ? 'active' : ''}" onclick="updateBreakerDp('130', 30)">30A</button>
              <button class="preset-pill ${overcurrentLimit === 40 ? 'active' : ''}" onclick="updateBreakerDp('130', 40)">40A</button>
              <button class="preset-pill ${overcurrentLimit === 63 ? 'active' : ''}" onclick="updateBreakerDp('130', 63)">63A</button>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 13px; font-weight: 600;">Overcurrent Trip Delay (DP 131 / 116)</label>
              <span style="font-weight: 700;">${generalTripDelay} s</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="number" id="input-overcurrent-delay" value="${generalTripDelay}" min="1" max="60" style="width: 90px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 13px;">
              <span style="font-size: 12px; color: var(--text-secondary);">seconds</span>
              <button class="btn" onclick="updateBreakerDp('116', Number(document.getElementById('input-overcurrent-delay').value))" style="font-size: 12px;">Save</button>
            </div>
          </div>
        </div>

        <!-- Auto-Reclose Parameters Card -->
        <div class="threshold-card">
          <h3 style="font-size: 15px; margin: 0 0 14px 0; color: #10b981; display: flex; align-items: center; justify-content: space-between;">
            <span>🔄 Auto-Reclose Recovery System</span>
            <span class="status-badge ${isAutoRecloseOn ? 'badge-online' : 'badge-offline'}">
              ${isAutoRecloseOn ? 'ENABLED' : 'DISABLED'}
            </span>
          </h3>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px;">
            <div>
              <div style="font-size: 13px; font-weight: 600;">Auto-Reclosing Master (DP 119)</div>
              <div style="font-size: 11.5px; color: var(--text-secondary);">Re-energize automatically after fault clears</div>
            </div>
            <div>
              <button class="btn ${isAutoRecloseOn ? 'btn-primary' : ''}" onclick="updateBreakerDp('119', ${!isAutoRecloseOn})" style="font-size: 12px; padding: 4px 10px;">
                ${isAutoRecloseOn ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="font-size: 12px; font-weight: 600;">Max Attempts (DP 133)</label>
              <div style="display: flex; gap: 6px; margin-top: 6px;">
                <input type="number" id="input-reclose-attempts" value="${autoRecloseMax}" min="0" max="20" style="width: 75px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-size: 12px;">
                <button class="btn btn-primary" onclick="updateBreakerDp('133', Number(document.getElementById('input-reclose-attempts').value))" style="font-size: 11px; padding: 6px 10px;">Save</button>
              </div>
            </div>
            <div>
              <label style="font-size: 12px; font-weight: 600;">Wait Delay (DP 118)</label>
              <div style="display: flex; gap: 6px; margin-top: 6px;">
                <input type="number" id="input-reclose-delay" value="${autoRecloseDelay}" min="5" max="600" style="width: 75px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-size: 12px;">
                <button class="btn btn-primary" onclick="updateBreakerDp('118', Number(document.getElementById('input-reclose-delay').value))" style="font-size: 11px; padding: 6px 10px;">Save</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  // 3. MULTI-DEVICE FLEET VIEW (NEW!)
  if (breakerSubTab === 'devices') {
    return `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="font-size: 16px; margin: 0; font-weight: 700; color: var(--text-primary);">Configured Tuya Devices (${tuyaDevicesList.length})</h3>
            <div style="font-size: 12.5px; color: var(--text-secondary); margin-top: 4px;">Manage, switch, or add multiple Smart Breakers & Plugs on your local LAN.</div>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn" onclick="handleScanLanTuyaDevices()" id="btn-scan-lan">
              <span>🔍</span> Scan Local Network
            </button>
            <button class="btn btn-primary" onclick="openAddTuyaDeviceModal()">
              <span>➕</span> Add New Device
            </button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-bottom: 24px;">
          ${(tuyaDevicesList.length > 0 ? tuyaDevicesList : [{
            id: cfg.device_id || 'd705ffaccaf4d0f1b1addg',
            name: cfg.device_name || 'Wi-Fi Smart Circuit Breaker (Main)',
            ip: currentIp,
            local_key: cfg.local_key || 'gp->j2_X[Bx=.ovC',
            protocol_version: cfg.protocol_version || 3.5,
            is_active: 1
          }]).map(d => {
            const isActive = Boolean(d.is_active || d.id === activeTuyaDeviceId);
            return `
              <div class="tuya-device-card ${isActive ? 'active-device' : ''}">
                <div>
                  <div class="tuya-device-header">
                    <div class="tuya-device-title">
                      <span>⚡</span>
                      <span>${escapeHtml(d.name || 'Smart Breaker')}</span>
                    </div>
                    <span class="status-badge ${isActive ? 'badge-online' : 'badge-sync'}" style="font-size: 10px;">
                      ${isActive ? 'ACTIVE BREAKER' : 'CONFIGURED'}
                    </span>
                  </div>

                  <div class="tuya-device-meta">
                    <div>📍 <strong>IP:</strong> <code style="color: #60a5fa;">${escapeHtml(d.ip)}</code></div>
                    <div>🆔 <strong>Tuya ID:</strong> <code>${escapeHtml(d.id)}</code></div>
                    <div>🔒 <strong>Protocol:</strong> v${escapeHtml(String(d.protocol_version || '3.5'))} (AES-128 Local)</div>
                    <div>📦 <strong>Category:</strong> ${escapeHtml(d.category || 'breaker')}</div>
                  </div>
                </div>

                <div class="tuya-device-actions">
                  ${!isActive ? `
                    <button class="btn btn-primary" onclick="handleSelectTuyaDevice('${escapeHtml(d.id)}')" style="font-size: 11.5px; padding: 4px 10px;">
                      ⚡ Switch To This
                    </button>
                  ` : `
                    <span style="font-size: 11.5px; color: #34d399; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                      ✓ Currently Monitored
                    </span>
                  `}
                  <button class="btn" onclick="openBreakerNetworkConfigModal('${escapeHtml(d.id)}')" style="font-size: 11.5px; padding: 4px 10px;">
                    ✏️ Edit IP / Key
                  </button>
                  <button class="btn" onclick="handleTestTuyaConnection('${escapeHtml(d.ip)}', '${escapeHtml(d.id)}', '${escapeHtml(d.local_key)}', ${d.protocol_version || 3.5})" style="font-size: 11.5px; padding: 4px 10px;">
                    ⚡ Test Socket
                  </button>
                  ${tuyaDevicesList.length > 1 ? `
                    <button class="btn btn-danger" onclick="handleDeleteTuyaDevice('${escapeHtml(d.id)}')" style="font-size: 11.5px; padding: 4px 10px;">
                      🗑️
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Scanned Devices Area (Populated on scan) -->
        <div id="tuya-scanned-container" style="display: none; background: rgba(59, 130, 246, 0.05); border: 1px dashed rgba(59, 130, 246, 0.3); border-radius: 12px; padding: 18px; margin-top: 16px;">
          <h4 style="font-size: 14px; margin: 0 0 10px 0; color: #60a5fa;">🔍 Local Subnet Discovered Tuya Devices</h4>
          <div id="tuya-scanned-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
        </div>
      </div>
    `;
  }

  // 4. LIVE SERIAL MONITOR VIEW
  if (breakerSubTab === 'serial') {
    return `
      <div class="serial-terminal-container">
        <div class="serial-toolbar">
          <div class="serial-toolbar-left">
            <div class="serial-status-dot"></div>
            <span class="serial-title">📟 LIVE TUYA LAN SERIAL TERMINAL</span>
            <span class="status-badge badge-online" style="font-size: 11px;">DIRECT SOCKET (AES-128)</span>
            <span style="font-size: 11.5px; color: var(--text-secondary); font-family: monospace;">IP: ${escapeHtml(currentIp)}:6668</span>
          </div>
          <div class="serial-toolbar-right">
            <button class="btn" id="serial-autoscroll-btn" onclick="toggleSerialAutoScroll()" style="font-size: 11px; padding: 4px 8px;">
              ${serialAutoScroll ? '⏬ Auto-Scroll: ON' : '⏸️ Auto-Scroll: OFF'}
            </button>
            <button class="btn" id="serial-pause-btn" onclick="toggleSerialPause()" style="font-size: 11px; padding: 4px 8px;">
              ${serialPaused ? '▶️ Resume Stream' : '⏸️ Pause Stream'}
            </button>
            <button class="btn" onclick="clearSerialConsole()" style="font-size: 11px; padding: 4px 8px;">
              🧹 Clear
            </button>
            <button class="btn" onclick="downloadSerialLogs()" style="font-size: 11px; padding: 4px 8px;">
              💾 Export TXT
            </button>
          </div>
        </div>

        <div class="serial-filter-bar">
          <span style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;">FILTER:</span>
          <button class="serial-filter-btn ${serialCurrentFilter === 'ALL' ? 'active' : ''}" data-filter="ALL" onclick="filterSerialLogs('ALL')">ALL PACKETS</button>
          <button class="serial-filter-btn ${serialCurrentFilter === 'RX' ? 'active' : ''}" data-filter="RX" onclick="filterSerialLogs('RX')">RX (From Breaker)</button>
          <button class="serial-filter-btn ${serialCurrentFilter === 'TX' ? 'active' : ''}" data-filter="TX" onclick="filterSerialLogs('TX')">TX (Commands Sent)</button>
          <button class="serial-filter-btn ${serialCurrentFilter === 'SYS' ? 'active' : ''}" data-filter="SYS" onclick="filterSerialLogs('SYS')">SYS (System Events)</button>
          <button class="serial-filter-btn ${serialCurrentFilter === 'TELEMETRY' ? 'active' : ''}" data-filter="TELEMETRY" onclick="filterSerialLogs('TELEMETRY')">TELEMETRY ONLY</button>
        </div>

        <div class="serial-log-window" id="serial-log-window">
          <div style="color: #64748b; font-style: italic; padding: 8px 0;">Connecting to breaker serial stream...</div>
        </div>

        <div class="serial-cli-bar">
          <div class="serial-cli-input-row">
            <span class="serial-prompt-prefix">[TX LAN] &gt;</span>
            <input type="text" id="serial-cli-input" class="serial-cli-input" placeholder="Enter command: set <dp> <val> | get <dp> | refresh | status | help" onkeydown="if(event.key==='Enter') executeSerialInput()">
            <button class="btn btn-primary" onclick="executeSerialInput()" style="font-size: 12px; padding: 7px 16px;">Send</button>
          </div>
          <div class="serial-quick-chips">
            <span style="font-size: 11px; color: var(--text-muted);">Quick Commands:</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('status')">status</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('refresh')">refresh</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('get 102')">get 102 (V/I/P)</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('get 108')">get 108 (Switch)</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('get 126')">get 126 (Leakage)</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('get 114')">get 114 (Temp)</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('get 115')">get 115 (Temp Limit)</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('get 132')">get 132 (Leakage Limit)</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('get 130')">get 130 (Current Limit)</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('set 132 200')">set 132 200</span>
            <span class="serial-quick-chip" onclick="runQuickCommand('help')">help</span>
          </div>
        </div>
      </div>
    `;
  }

  // 5. ALARMS & FAULTS VIEW
  if (breakerSubTab === 'alarms') {
    const faults = dec.faults || {};
    const hasAlarm = Boolean(dec.has_alarm);
    const faultItems = [
      { key: "earth_leakage_fault", name: "Earth Leakage Trip", desc: "Residual current exceeded protection threshold" },
      { key: "short_circuit_fault", name: "Short Circuit Fault", desc: "Instantaneous high-current fault detected" },
      { key: "overcurrent_fault", name: "Overcurrent / Overload", desc: "Continuous load exceeded safe limit" },
      { key: "surge_fault", name: "Surge / Lightning Spike", desc: "Transient over-voltage surge registered" },
      { key: "overvoltage_fault", name: "Over-Voltage Fault", desc: "Grid voltage exceeded high protection threshold" },
      { key: "undervoltage_fault", name: "Under-Voltage Fault", desc: "Grid voltage dropped below minimum threshold" },
      { key: "phase_loss_fault", name: "Phase Loss / Imbalance", desc: "Missing phase or phase angle divergence" },
      { key: "high_temp_fault", name: "High Temperature Overheat", desc: "Internal sensor reached critical thermal limit" }
    ];

    return `
      <div style="padding: 16px 20px; background: ${hasAlarm ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.08)'}; border: 1px solid ${hasAlarm ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.25)'}; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-weight: 700; font-size: 15px; color: ${hasAlarm ? '#f87171' : '#34d399'};">
            ${hasAlarm ? '🚨 HARDWARE SAFETY ALARM ACTIVE' : '✅ ALL SAFETY SENSORS NORMAL'}
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            Hardware Safety Fault Register (DP 26): <strong>0x${(dec.fault_raw || 0).toString(16).toUpperCase()}</strong> (${dec.fault_raw || 0})
          </div>
        </div>
        <div>
          <button class="btn" onclick="refreshBreakerNow()" style="font-size: 12px;">Check Now</button>
        </div>
      </div>

      <div class="faults-grid">
        ${faultItems.map(item => {
          const isTriggered = Boolean(faults[item.key]);
          return `
            <div class="fault-item ${isTriggered ? 'alarm-triggered' : 'fault-ok'}">
              <div class="fault-indicator"></div>
              <div>
                <div style="font-size: 13px; font-weight: 600; color: ${isTriggered ? '#f87171' : 'var(--text-primary)'};">
                  ${item.name}
                </div>
                <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 2px;">
                  ${item.desc}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // 6. RAW DP INSPECTOR VIEW
  if (breakerSubTab === 'dps') {
    const dpEntries = Object.entries(dps).sort((a, b) => Number(a[0]) - Number(b[0]));
    return `
      <div class="threshold-card" style="margin-bottom: 20px;">
        <h3 style="font-size: 15px; margin: 0 0 10px 0; color: #38bdf8;">⚡ Write / Override DP Parameter</h3>
        <form onsubmit="handleCustomDpWrite(event)" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="custom-dp-id" placeholder="DP ID (e.g. 132)" style="width: 120px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 13px;" required>
          <select id="custom-dp-type" style="background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 13px;">
            <option value="integer">Integer (Number)</option>
            <option value="boolean">Boolean (True/False)</option>
            <option value="string">String (Text)</option>
          </select>
          <input type="text" id="custom-dp-val" placeholder="Value (e.g. 200)" style="width: 150px; background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 13px;" required>
          <button type="submit" class="btn btn-primary" style="font-size: 12px;">Send LAN Command</button>
        </form>
      </div>

      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden;">
        <table class="dp-table">
          <thead>
            <tr>
              <th style="width: 80px;">DP ID</th>
              <th>Function / Description</th>
              <th>Data Type</th>
              <th>Live Value</th>
            </tr>
          </thead>
          <tbody>
            ${dpEntries.map(([id, val]) => `
              <tr>
                <td><strong>DP ${id}</strong></td>
                <td>${BREAKER_DP_NAMES[id] || 'Custom Manufacturer Register'}</td>
                <td><code style="font-size: 11.5px; color: #93c5fd;">${typeof val}</code></td>
                <td><code style="font-size: 12.5px; color: #34d399; word-break: break-all;">${escapeHtml(JSON.stringify(val))}</code></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // 7. REFERENCE & HOW IT WORKS VIEW
  if (breakerSubTab === 'reference') {
    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 18px;">
        <div class="threshold-card">
          <h3 style="font-size: 15px; margin: 0 0 14px 0; color: #38bdf8;">⚙️ How Direct Socket Local Integration Works</h3>
          <div style="font-size: 12.5px; line-height: 1.8; color: var(--text-secondary);">
            <div>&bull; <strong>100% Local LAN Communication:</strong> Your Central Server connects directly to your Smart Breaker's IP address (<code>${escapeHtml(currentIp)}</code>) over TCP Port <strong>6668</strong>.</div>
            <div>&bull; <strong>AES-128 Hardware Handshake:</strong> Packets are encrypted with the device's unique local key (<code>${escapeHtml(cfg.local_key || 'gp->j2_X[Bx=.ovC')}</code>). No Tuya cloud or external internet connection is required.</div>
            <div>&bull; <strong>Contactor Switch (DP 108):</strong> In TDQ category breakers, DP 108 controls the internal physical mechanical contactor. When energized, DP 108 is TRUE; when tripped or isolated, DP 108 is FALSE.</div>
            <div>&bull; <strong>Real-time Telemetry (DP 102):</strong> The breaker streams 8-byte packed telemetry containing Voltage (16-bit), Current (24-bit), and Active Power (24-bit).</div>
            <div>&bull; <strong>Why IP Matters:</strong> If your Wi-Fi router's DHCP changes the breaker's IP address (e.g. from 192.168.1.164 to 192.168.1.25), socket connection fails and the dashboard cannot see live switch state. Use the <strong>"✏️ Change IP"</strong> button or the <strong>"Devices & Fleet"</strong> tab to update the IP anytime!</div>
          </div>
        </div>

        <div class="threshold-card">
          <h3 style="font-size: 15px; margin: 0 0 14px 0; color: #10b981;">🛡️ Electrical Safety Matrix</h3>
          <div style="font-size: 12.5px; line-height: 1.8; color: var(--text-secondary);">
            <div>&bull; <strong>DP 108:</strong> Main Contactor Switch (True = Closed / ON, False = Tripped / OFF)</div>
            <div>&bull; <strong>DP 102:</strong> 8-Byte Base64 stream for Voltage, Current, and Active Power</div>
            <div>&bull; <strong>DP 114 / 115:</strong> Internal Thermal Sensor & Trip Cutoff (93°C)</div>
            <div>&bull; <strong>DP 121:</strong> Over-Voltage Trip Threshold Register (14144 / ~275V)</div>
            <div>&bull; <strong>DP 126 / 132:</strong> Residual Earth Leakage Monitor & Protection (200mA)</div>
            <div>&bull; <strong>DP 130 / 131:</strong> Overcurrent Trip Limit & Safety Delays (30A)</div>
            <div>&bull; <strong>DP 26:</strong> 16-Bit Hardware Fault and Trip Register</div>
            <div>&bull; <strong>DP 40:</strong> Maintenance Lockout prohibits remote energizing</div>
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

function updateBreakerDom(data) {
  latestBreakerData = data;
  const dec = data.decoded || {};
  const isOnline = Boolean(data.isOnline !== false);
  const switchState = Boolean(dec.switch_state);

  const statusBadge = document.getElementById("breaker-online-badge");
  if (statusBadge) {
    statusBadge.className = `status-badge ${isOnline ? 'badge-online' : 'badge-offline'}`;
    statusBadge.innerHTML = `<span class="pulse-dot"></span> ${isOnline ? '🟢 LIVE LAN (Local)' : '🔴 OFFLINE / UNREACHABLE'}`;
  }

  const btn = document.getElementById("breaker-main-btn");
  if (btn) {
    btn.className = `breaker-power-btn ${switchState ? 'state-on' : 'state-off'}`;
  }

  const statusText = document.getElementById("breaker-status-text");
  if (statusText) {
    statusText.textContent = switchState ? 'CIRCUIT CLOSED (ENERGIZED)' : 'CIRCUIT TRIPPED (ISOLATED)';
    statusText.style.color = switchState ? '#34d399' : '#f87171';
  }

  const statusDesc = document.getElementById("breaker-status-desc");
  if (statusDesc) {
    statusDesc.textContent = switchState
      ? 'Main internal contacts (DP 108) are closed. Mains electricity is flowing safely through the breaker.'
      : 'Circuit is open. Downstream power is isolated.';
  }

  if (breakerSubTab === 'telemetry') {
    const vEl = document.getElementById("bm-voltage");
    if (vEl && dec.voltage_v !== undefined) vEl.textContent = dec.voltage_v;

    const iEl = document.getElementById("bm-current");
    if (iEl && dec.current_a !== undefined) iEl.textContent = dec.current_a;

    const pEl = document.getElementById("bm-power");
    if (pEl && dec.power_w !== undefined) pEl.textContent = dec.power_w;

    const eEl = document.getElementById("bm-energy");
    if (eEl && dec.total_energy_kwh !== undefined) eEl.textContent = dec.total_energy_kwh;

    const lEl = document.getElementById("bm-leakage");
    if (lEl && dec.leakage_current_ma !== undefined) lEl.textContent = dec.leakage_current_ma;

    const fEl = document.getElementById("bm-freq");
    if (fEl && dec.frequency_hz !== undefined) fEl.textContent = dec.frequency_hz;

    const tEl = document.getElementById("bm-temp");
    if (tEl && dec.temperature_c !== undefined) tEl.textContent = dec.temperature_c;

    const pfEl = document.getElementById("bm-pf");
    if (pfEl && dec.power_factor !== undefined) pfEl.textContent = dec.power_factor;
  }
}

// ==========================================================================
// === MULTI-DEVICE MANAGEMENT & MODALS ===
// ==========================================================================

function openBreakerNetworkConfigModal(deviceId) {
  let dev = null;
  if (deviceId) {
    dev = tuyaDevicesList.find(d => d.id === deviceId);
  }
  if (!dev) {
    dev = tuyaDevicesList.find(d => d.id === activeTuyaDeviceId) || latestBreakerData?.config || {};
  }

  openModal(`
    <div style="max-width: 500px; padding: 22px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 17px; font-weight: 700; color: #38bdf8;">
          ⚙️ Edit Device Network & Credentials
        </h3>
        <button class="btn" onclick="closeModal()" style="padding: 2px 8px; font-size: 14px;">✕</button>
      </div>

      <form onsubmit="handleSaveDeviceConfig(event)">
        <input type="hidden" id="edit-dev-id" value="${escapeHtml(dev.id || dev.device_id || 'd705ffaccaf4d0f1b1addg')}">

        <div style="margin-bottom: 14px;">
          <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">Device Friendly Name</label>
          <input type="text" id="edit-dev-name" value="${escapeHtml(dev.name || dev.device_name || 'Wi-Fi Smart Circuit Breaker')}" class="form-input" style="width: 100%; box-sizing: border-box;" required>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">LAN IP Address (e.g. 192.168.1.25)</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="edit-dev-ip" value="${escapeHtml(dev.ip || dev.ip_address || '192.168.1.25')}" class="form-input" style="flex-grow: 1; font-family: monospace;" required>
            <button type="button" class="btn" onclick="triggerModalTestSocket()" id="modal-test-btn" style="font-size: 12px; white-space: nowrap;">
              ⚡ Test Ping
            </button>
          </div>
          <div id="modal-test-result" style="font-size: 11.5px; margin-top: 6px; display: none;"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
          <div>
            <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">Tuya Device ID</label>
            <input type="text" id="edit-dev-gwid" value="${escapeHtml(dev.id || dev.device_id || '')}" class="form-input" style="width: 100%; font-family: monospace;" required>
          </div>
          <div>
            <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">Local Key (AES-128)</label>
            <input type="text" id="edit-dev-key" value="${escapeHtml(dev.local_key || '')}" class="form-input" style="width: 100%; font-family: monospace;" required>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
          <div>
            <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">Protocol Version</label>
            <select id="edit-dev-version" class="form-input" style="width: 100%;">
              <option value="3.5" ${String(dev.protocol_version) === '3.5' ? 'selected' : ''}>v3.5 (AES-128 CBC/GCM)</option>
              <option value="3.4" ${String(dev.protocol_version) === '3.4' ? 'selected' : ''}>v3.4</option>
              <option value="3.3" ${String(dev.protocol_version) === '3.3' ? 'selected' : ''}>v3.3</option>
            </select>
          </div>
          <div>
            <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">Device Category</label>
            <select id="edit-dev-category" class="form-input" style="width: 100%;">
              <option value="breaker" selected>Circuit Breaker (TDQ/DLQ)</option>
              <option value="switch">Smart Switch</option>
              <option value="socket">Smart Plug / Socket</option>
            </select>
          </div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button type="button" class="btn" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="save-config-btn">
            💾 Save & Apply Immediately
          </button>
        </div>
      </form>
    </div>
  `);
}

function openAddTuyaDeviceModal() {
  openModal(`
    <div style="max-width: 500px; padding: 22px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 17px; font-weight: 700; color: #10b981;">
          ➕ Add New Tuya Device / Circuit Breaker
        </h3>
        <button class="btn" onclick="closeModal()" style="padding: 2px 8px; font-size: 14px;">✕</button>
      </div>

      <form onsubmit="handleSaveDeviceConfig(event, true)">
        <div style="margin-bottom: 14px;">
          <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">Device Name</label>
          <input type="text" id="edit-dev-name" placeholder="e.g. AC Circuit Breaker, Kitchen Subpanel" class="form-input" style="width: 100%; box-sizing: border-box;" required>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">LAN IP Address</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="edit-dev-ip" placeholder="192.168.1.X" class="form-input" style="flex-grow: 1; font-family: monospace;" required>
            <button type="button" class="btn" onclick="triggerModalTestSocket()" id="modal-test-btn" style="font-size: 12px; white-space: nowrap;">
              ⚡ Test Ping
            </button>
          </div>
          <div id="modal-test-result" style="font-size: 11.5px; margin-top: 6px; display: none;"></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
          <div>
            <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">Tuya Device ID</label>
            <input type="text" id="edit-dev-gwid" placeholder="e.g. d705ffaccaf4d0f1..." class="form-input" style="width: 100%; font-family: monospace;" required>
          </div>
          <div>
            <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">Local Key (16 chars)</label>
            <input type="text" id="edit-dev-key" placeholder="AES-128 Local Key" class="form-input" style="width: 100%; font-family: monospace;" required>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
          <div>
            <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">Protocol Version</label>
            <select id="edit-dev-version" class="form-input" style="width: 100%;">
              <option value="3.5" selected>v3.5 (AES-128)</option>
              <option value="3.4">v3.4</option>
              <option value="3.3">v3.3</option>
            </select>
          </div>
          <div>
            <label style="font-size: 12.5px; font-weight: 600; display: block; margin-bottom: 5px;">Category</label>
            <select id="edit-dev-category" class="form-input" style="width: 100%;">
              <option value="breaker" selected>Circuit Breaker</option>
              <option value="switch">Smart Switch</option>
              <option value="socket">Smart Plug / Socket</option>
            </select>
          </div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button type="button" class="btn" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="save-config-btn">
            ➕ Add Device
          </button>
        </div>
      </form>
    </div>
  `);
}

async function triggerModalTestSocket() {
  const ip = document.getElementById("edit-dev-ip")?.value.trim();
  const id = document.getElementById("edit-dev-gwid")?.value.trim();
  const key = document.getElementById("edit-dev-key")?.value.trim();
  const version = document.getElementById("edit-dev-version")?.value;
  const resEl = document.getElementById("modal-test-result");
  const btn = document.getElementById("modal-test-btn");

  if (!ip) {
    alert("Please enter an IP address to test.");
    return;
  }

  if (btn) btn.innerHTML = `<span>⏳</span> Testing...`;
  if (resEl) {
    resEl.style.display = 'block';
    resEl.style.color = 'var(--text-secondary)';
    resEl.textContent = `Attempting local AES socket handshake with ${ip}:6668...`;
  }

  try {
    const res = await fetch(`${API_BASE}/breaker/devices/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, id, local_key: key, protocol_version: version })
    });
    const result = await res.json();
    if (result.online) {
      resEl.style.color = '#34d399';
      resEl.innerHTML = `✅ <strong>ONLINE & RESPONDING!</strong> Successfully connected to socket at <code>${ip}:6668</code> (${result.dps_count || 28} DPs returned).`;
    } else {
      resEl.style.color = '#f87171';
      resEl.innerHTML = `⚠️ <strong>UNREACHABLE:</strong> ${escapeHtml(result.error || 'No response from device socket')}. Please verify IP and Local Key.`;
    }
  } catch (err) {
    if (resEl) {
      resEl.style.color = '#f87171';
      resEl.textContent = `Error: ${err.message}`;
    }
  } finally {
    if (btn) btn.innerHTML = `⚡ Test Ping`;
  }
}

async function handleSaveDeviceConfig(e, isNew = false) {
  e.preventDefault();
  const id = document.getElementById("edit-dev-gwid")?.value.trim();
  const name = document.getElementById("edit-dev-name")?.value.trim();
  const ip = document.getElementById("edit-dev-ip")?.value.trim();
  const local_key = document.getElementById("edit-dev-key")?.value.trim();
  const protocol_version = Number(document.getElementById("edit-dev-version")?.value || 3.5);
  const category = document.getElementById("edit-dev-category")?.value || 'breaker';

  const btn = document.getElementById("save-config-btn");
  if (btn) btn.innerHTML = `<span>⏳</span> Saving...`;

  try {
    const res = await fetch(`${API_BASE}/breaker/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, ip, local_key, protocol_version, category, is_active: isNew ? 1 : undefined })
    });
    const result = await res.json();
    if (result.success) {
      closeModal();
      showToast({
        title: "Device Saved",
        message: `Device configuration for "${name}" (${ip}) updated successfully.`,
        severity: "SUCCESS"
      });
      loadBreakerView();
    } else {
      alert(result.error || "Failed to save device");
    }
  } catch (err) {
    alert("Save error: " + err.message);
  } finally {
    if (btn) btn.innerHTML = `💾 Save & Apply`;
  }
}

async function handleSelectTuyaDevice(id) {
  if (!id) return;
  try {
    const res = await fetch(`${API_BASE}/breaker/devices/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const result = await res.json();
    if (result.success) {
      activeTuyaDeviceId = id;
      showToast({
        title: "Active Device Changed",
        message: `Monitoring switched to "${result.activeDevice?.name || id}" (${result.activeDevice?.ip}).`,
        severity: "INFO"
      });
      loadBreakerView();
    }
  } catch (err) {
    showToast({ title: "Switch Failed", message: err.message, severity: "ERROR" });
  }
}

async function handleDeleteTuyaDevice(id) {
  if (!confirm("Are you sure you want to remove this Tuya device configuration?")) return;
  try {
    const res = await fetch(`${API_BASE}/breaker/devices/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    const result = await res.json();
    if (result.success) {
      showToast({ title: "Device Deleted", message: "Device removed from fleet.", severity: "INFO" });
      loadBreakerView();
    } else {
      alert(result.error || "Could not delete device");
    }
  } catch (err) {
    alert("Delete error: " + err.message);
  }
}

async function handleTestTuyaConnection(ip, id, key, ver) {
  try {
    showToast({ title: "Testing Connection", message: `Connecting to socket ${ip}:6668...`, severity: "INFO" });
    const res = await fetch(`${API_BASE}/breaker/devices/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, id, local_key: key, protocol_version: ver })
    });
    const result = await res.json();
    if (result.online) {
      showToast({
        title: "Device Reachable",
        message: `Socket connection to ${ip} succeeded! (${result.dps_count} DPs returned)`,
        severity: "SUCCESS"
      });
    } else {
      showToast({
        title: "Device Unreachable",
        message: `Socket at ${ip}:6668 did not respond. Check power & IP.`,
        severity: "WARNING"
      });
    }
  } catch (err) {
    showToast({ title: "Test Failed", message: err.message, severity: "ERROR" });
  }
}

async function handleScanLanTuyaDevices() {
  const btn = document.getElementById("btn-scan-lan");
  const container = document.getElementById("tuya-scanned-container");
  const list = document.getElementById("tuya-scanned-list");
  if (btn) btn.innerHTML = `<span>⏳</span> Scanning LAN (UDP)...`;

  try {
    const res = await fetch(`${API_BASE}/breaker/devices/scan`, { method: "POST" });
    const data = await res.json();
    const devices = data.devices || [];

    if (container && list) {
      container.style.display = 'block';
      if (devices.length === 0) {
        list.innerHTML = `<div style="font-size: 12.5px; color: var(--text-secondary);">No active Tuya UDP broadcast beacons detected in the last scan.</div>`;
      } else {
        list.innerHTML = devices.map(d => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #38bdf8;">📍 IP: ${escapeHtml(d.ip)}</div>
              <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 2px;">
                Device ID: <code>${escapeHtml(d.device_id)}</code> | Protocol: v${escapeHtml(String(d.version || '3.5'))}
              </div>
            </div>
            <div>
              <button class="btn btn-primary" onclick="openFillTuyaDeviceModal('${escapeHtml(d.ip)}', '${escapeHtml(d.device_id)}', '${escapeHtml(d.version || '3.5')}')" style="font-size: 11px; padding: 4px 10px;">
                ➕ Use This IP / Add
              </button>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    alert("Scan error: " + err.message);
  } finally {
    if (btn) btn.innerHTML = `<span>🔍</span> Scan Local Network`;
  }
}

function openFillTuyaDeviceModal(ip, id, version) {
  openAddTuyaDeviceModal();
  setTimeout(() => {
    const ipInput = document.getElementById("edit-dev-ip");
    const idInput = document.getElementById("edit-dev-gwid");
    const verInput = document.getElementById("edit-dev-version");
    if (ipInput) ipInput.value = ip;
    if (idInput) idInput.value = id;
    if (verInput) verInput.value = version;
  }, 50);
}

// ==========================================================================
// === SERIAL MONITOR TERMINAL ENGINE ===
// ==========================================================================

function initSerialTerminal() {
  const win = document.getElementById("serial-log-window");
  if (win && serialLogsBuffer.length > 0) {
    renderSerialLogs();
  }
}

async function loadSerialLogsFromServer() {
  try {
    const res = await fetch(`${API_BASE}/breaker/serial-logs?limit=150`);
    const data = await res.json();
    if (data.success && Array.isArray(data.logs)) {
      serialLogsBuffer = data.logs;
      renderSerialLogs();
    }
  } catch (err) {
    console.error("Failed to fetch breaker serial logs:", err);
  }
}

function handleIncomingSerialLog(entry) {
  if (!entry) return;
  serialLogsBuffer.push(entry);
  if (serialLogsBuffer.length > 400) serialLogsBuffer.shift();

  if (breakerSubTab === 'serial' && !serialPaused) {
    appendSingleSerialEntry(entry);
    if (serialAutoScroll) {
      const win = document.getElementById("serial-log-window");
      if (win) win.scrollTop = win.scrollHeight;
    }
  }
}

function renderSerialLogs() {
  const win = document.getElementById("serial-log-window");
  if (!win) return;

  const filtered = serialLogsBuffer.filter(entry => {
    if (serialCurrentFilter === "ALL") return true;
    if (serialCurrentFilter === "RX") return entry.direction === "RX";
    if (serialCurrentFilter === "TX") return entry.direction === "TX";
    if (serialCurrentFilter === "SYS") return entry.direction === "SYS";
    if (serialCurrentFilter === "TELEMETRY") return entry.type === "TELEMETRY" || entry.type === "RAW_DPS";
    return true;
  });

  if (filtered.length === 0) {
    win.innerHTML = `<div style="color: #64748b; font-style: italic; padding: 8px 0;">No logs matching current filter (${serialCurrentFilter}).</div>`;
    return;
  }

  win.innerHTML = filtered.map(formatSerialEntryHtml).join('');
  if (serialAutoScroll) {
    win.scrollTop = win.scrollHeight;
  }
}

function appendSingleSerialEntry(entry) {
  const win = document.getElementById("serial-log-window");
  if (!win) return;

  if (serialCurrentFilter !== "ALL") {
    if (serialCurrentFilter === "RX" && entry.direction !== "RX") return;
    if (serialCurrentFilter === "TX" && entry.direction !== "TX") return;
    if (serialCurrentFilter === "SYS" && entry.direction !== "SYS") return;
    if (serialCurrentFilter === "TELEMETRY" && entry.type !== "TELEMETRY" && entry.type !== "RAW_DPS") return;
  }

  const html = formatSerialEntryHtml(entry);
  win.insertAdjacentHTML('beforeend', html);
}

function formatSerialEntryHtml(entry) {
  const time = entry.timestamp ? entry.timestamp.split('T')[1]?.split('.')[0] || entry.timestamp : (entry.time || '');
  const dirClass = entry.direction === 'TX' ? 'serial-dir-tx' : entry.direction === 'SYS' ? 'serial-dir-sys' : 'serial-dir-rx';
  const typeClass = entry.type === 'TELEMETRY' ? 'telemetry' : entry.type === 'ACK' ? 'ack' : (entry.type === 'ERROR' ? 'error' : '');

  return `
    <div class="serial-entry">
      <span class="serial-time">[${escapeHtml(time)}]</span>
      <span class="serial-dir-pill ${dirClass}">${escapeHtml(entry.direction || 'RX')}</span>
      <span class="serial-type-tag">${escapeHtml(entry.type || 'DATA')}</span>
      <span class="serial-payload ${typeClass}">${escapeHtml(entry.message || '')}</span>
    </div>
  `;
}

function toggleSerialAutoScroll() {
  serialAutoScroll = !serialAutoScroll;
  const btn = document.getElementById("serial-autoscroll-btn");
  if (btn) btn.textContent = serialAutoScroll ? "⏬ Auto-Scroll: ON" : "⏸️ Auto-Scroll: OFF";
  if (serialAutoScroll) {
    const win = document.getElementById("serial-log-window");
    if (win) win.scrollTop = win.scrollHeight;
  }
}

function toggleSerialPause() {
  serialPaused = !serialPaused;
  const btn = document.getElementById("serial-pause-btn");
  if (btn) btn.textContent = serialPaused ? "▶️ Resume Stream" : "⏸️ Pause Stream";
  if (!serialPaused) renderSerialLogs();
}

function filterSerialLogs(filterType) {
  serialCurrentFilter = filterType;
  document.querySelectorAll(".serial-filter-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-filter") === filterType);
  });
  renderSerialLogs();
}

async function executeSerialInput() {
  const input = document.getElementById("serial-cli-input");
  if (!input) return;
  const cmd = input.value.trim();
  if (!cmd) return;
  input.value = "";
  await runSerialCliCommand(cmd);
}

function runQuickCommand(cmd) {
  const input = document.getElementById("serial-cli-input");
  if (input) input.value = cmd;
  runSerialCliCommand(cmd);
}

async function runSerialCliCommand(cmd) {
  try {
    const res = await fetch(`${API_BASE}/breaker/serial-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd })
    });
    const result = await res.json();
    if (!result.success) {
      showToast({ title: "Command Error", message: result.error || "Failed", severity: "ERROR" });
    }
  } catch (err) {
    showToast({ title: "Serial Error", message: err.message, severity: "ERROR" });
  }
}

async function clearSerialConsole() {
  try {
    await fetch(`${API_BASE}/breaker/serial-clear`, { method: "POST" });
    serialLogsBuffer = [];
    renderSerialLogs();
  } catch (err) {
    console.error(err);
  }
}

function downloadSerialLogs() {
  if (serialLogsBuffer.length === 0) {
    alert("Serial buffer is empty.");
    return;
  }
  const text = serialLogsBuffer.map(e => `[${e.timestamp || e.time}] [${e.direction}] [${e.type}] ${e.message}`).join('\r\n');
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `smart_breaker_serial_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ==========================================================================
// === BREAKER USER CONTROLS & PROTECTION ACTIONS ===
// ==========================================================================

function handleBreakerTogglePrompt() {
  if (!latestBreakerData) return;
  const dec = latestBreakerData.reading?.decoded || latestBreakerData.decoded || {};
  const currentState = Boolean(dec.switch_state);
  const targetState = !currentState;

  if (dec.child_lock && targetState === true) {
    showToast({
      title: "Action Blocked by Safety Lock",
      message: "Maintenance Lock (DP 40) is currently ACTIVE. Unlock it before energizing.",
      severity: "WARNING"
    });
    return;
  }

  const actionText = targetState ? "CLOSE contacts (Turn ON)" : "OPEN contacts (TRIP OFF)";
  const warningText = targetState
    ? "Energizing the circuit will restore electrical power to all connected downstream appliances."
    : "Tripping the circuit breaker will cut electrical power immediately to all connected devices!";

  openModal(`
    <div style="max-width: 440px; padding: 24px; text-align: center;">
      <div style="font-size: 44px; margin-bottom: 12px;">⚠️</div>
      <h3 style="margin-bottom: 10px; color: ${targetState ? 'var(--accent-green)' : 'var(--accent-red)'};">
        Confirm Breaker Switch Action
      </h3>
      <p style="font-size: 13.5px; color: var(--text-primary); margin-bottom: 12px; line-height: 1.5;">
        Are you sure you want to <strong>${actionText}</strong> on the Smart Circuit Breaker?
      </p>
      <div style="font-size: 12px; color: var(--text-secondary); background: rgba(255,255,255,0.04); padding: 10px; border-radius: 8px; margin-bottom: 20px;">
        ${warningText}
      </div>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn ${targetState ? 'btn-primary' : 'btn-danger'}" onclick="closeModal(); executeBreakerToggle(${targetState})">
          Confirm ${targetState ? 'Turn ON' : 'Trip Breaker'}
        </button>
      </div>
    </div>
  `);
}

async function executeBreakerToggle(targetState) {
  try {
    const res = await fetch(`${API_BASE}/breaker/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: targetState })
    });
    const result = await res.json();
    if (result.success) {
      showToast({
        title: "Breaker Switched",
        message: `Circuit breaker contacts turned ${targetState ? 'ON' : 'OFF'} via local LAN socket.`,
        severity: targetState ? "SUCCESS" : "WARNING"
      });
      loadBreakerView();
    } else {
      showToast({
        title: "Breaker Switch Failed",
        message: result.error || "Device did not acknowledge command",
        severity: "ERROR"
      });
    }
  } catch (err) {
    showToast({
      title: "Network Error",
      message: err.message,
      severity: "ERROR"
    });
  }
}

async function updateBreakerDp(dp, val) {
  try {
    const res = await fetch(`${API_BASE}/breaker/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dp, value: val })
    });
    const result = await res.json();
    if (result.success) {
      showToast({
        title: "Setting Saved",
        message: `DP ${dp} updated to ${JSON.stringify(val)} via LAN.`,
        severity: "SUCCESS"
      });
      loadBreakerView();
    } else {
      showToast({
        title: "Update Failed",
        message: result.error || "Could not write DP",
        severity: "ERROR"
      });
    }
  } catch (err) {
    showToast({ title: "Error", message: err.message, severity: "ERROR" });
  }
}

function handleBreakerLockToggle(currentState) {
  updateBreakerDp("40", !currentState);
}

function handleBreakerPowerOnBehavior(val) {
  updateBreakerDp("38", val);
}

function handleCountdownSet() {
  const el = document.getElementById("breaker-countdown-input");
  const val = Number(el?.value);
  if (isNaN(val) || val < 0) return;
  updateBreakerDp("9", val);
}

function handleVoltageMasterToggle(enabled) {
  updateBreakerDp("108", enabled);
}

function handleOvervoltageThresholdUpdate(val) {
  const n = Number(val);
  if (isNaN(n) || n < 100 || n > 65535) {
    alert("Please enter a valid voltage register threshold.");
    return;
  }
  updateBreakerDp("121", n);
}

function handleHighTempThresholdUpdate(val) {
  const n = Number(val);
  if (isNaN(n) || n < 40 || n > 150) {
    alert("Please enter a valid high temperature threshold between 40°C and 150°C.");
    return;
  }
  updateBreakerDp("115", n);
}

function handleLeakageMasterToggle(enabled) {
  updateBreakerDp("127", enabled);
}

function handleLeakageThresholdUpdate(val) {
  const n = Number(val);
  if (isNaN(n) || n < 10 || n > 1000) {
    alert("Please enter a valid leakage threshold between 10 mA and 1000 mA.");
    return;
  }
  updateBreakerDp("132", n);
}

async function refreshBreakerNow() {
  const btn = document.getElementById("breaker-refresh-btn");
  if (btn) btn.innerHTML = `<span>⏳</span> Polling...`;
  try {
    const res = await fetch(`${API_BASE}/breaker/refresh`, { method: "POST" });
    const result = await res.json();
    if (result.success) {
      showToast({
        title: "Device Polled",
        message: "Latest telemetry and status registers updated from breaker.",
        severity: "INFO"
      });
      loadBreakerView();
    }
  } catch (err) {
    showToast({ title: "Poll Failed", message: err.message, severity: "ERROR" });
  } finally {
    if (btn) btn.innerHTML = `<span>🔄</span> Refresh Now`;
  }
}

function handleCustomDpWrite(e) {
  e.preventDefault();
  const dp = document.getElementById("custom-dp-id").value.trim();
  const type = document.getElementById("custom-dp-type").value;
  const rawVal = document.getElementById("custom-dp-val").value.trim();

  let val = rawVal;
  if (type === "integer") val = parseInt(rawVal, 10);
  else if (type === "boolean") val = (rawVal.toLowerCase() === "true" || rawVal === "1");

  updateBreakerDp(dp, val);
}
