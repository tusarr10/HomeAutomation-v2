const app = {
  token: localStorage.getItem('sh_token') || '',
  channels: [],
  rules: [],
  savedRemotes: [],
  irPollInterval: null,
  irCountdownTimer: null,
  irTimeRemaining: 25,
  refreshTimer: null,

  init() {
    this.setupTheme();
    this.setupTabs();
    this.setupEventListeners();
    this.startDashboard();
    this.checkAuth();
    this.loadIrRemotes();
  },

  setupTheme() {
    const savedTheme = localStorage.getItem('sh_theme') || 'dark';
    if (savedTheme === 'light') {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
    }
  },

  toggleTheme() {
    if (document.body.classList.contains('light-theme')) {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
      localStorage.setItem('sh_theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      localStorage.setItem('sh_theme', 'light');
    }
  },

  setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetId = tab.getAttribute('data-tab');
        const pane = document.getElementById(targetId);
        if (pane) pane.classList.add('active');

        // Tab specific loading
        if (targetId === 'tab-logs') this.loadLogs();
        if (targetId === 'tab-wifi') { this.switchTab('tab-settings'); }
        if (targetId === 'tab-settings') { this.loadSettings(); this.loadWifiStatus(); this.loadI2cSettings(); this.renderSettingsGpioTable(); }
        if (targetId === 'tab-sysinfo') this.loadStatus();
        if (targetId === 'tab-gpio') { this.loadGpios(); }
        if (targetId === 'tab-sensors') { this.loadGpios(); this.loadIrStatus(); this.loadIrRemotes(); }
        if (targetId === 'tab-users') this.loadPairingStatus();
      });
    });
  },

  switchTab(tabId) {
    if (tabId === 'tab-wifi') tabId = 'tab-settings';
    const tabBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    if (tabBtn) tabBtn.click();
  },

  setupEventListeners() {
    document.getElementById('theme-toggle-btn').addEventListener('click', () => this.toggleTheme());
    document.getElementById('logout-btn').addEventListener('click', () => {
      if (this.token) this.logout();
      else this.showLoginModal();
    });

    // Login Form
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });

    // Wi-Fi Mode
    document.getElementById('save-wifi-mode-btn').addEventListener('click', () => this.saveWifiMode());
    document.getElementById('scan-wifi-btn').addEventListener('click', () => this.scanWifi());
    document.getElementById('wifi-connect-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.connectWifi();
    });
    document.getElementById('btn-reset-wifi').addEventListener('click', () => this.resetWifi());

    // GPIO Form
    document.getElementById('open-add-gpio-btn').addEventListener('click', () => this.openAddGpioModal());
    document.getElementById('gpio-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveGpioChannel();
    });

    // Rule Form
    document.getElementById('open-add-rule-btn').addEventListener('click', () => this.openAddRuleModal());
    document.getElementById('rule-type-select').addEventListener('change', (e) => this.handleRuleTypeChange(e.target.value));
    document.getElementById('rule-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveRule();
    });

    // Settings Form
    document.getElementById('settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    // Central Receiver Form
    const recvForm = document.getElementById('receiver-form');
    if (recvForm) {
      recvForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveReceiverSettings();
      });
    }

    // System Maintenance
    document.getElementById('btn-reboot').addEventListener('click', () => this.reboot());
    document.getElementById('btn-factory-reset').addEventListener('click', () => this.factoryReset());

    // Change Password Form
    document.getElementById('change-pass-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.changePassword();
    });

    // OTA Form (Legacy fallback if present)
    const otaForm = document.getElementById('ota-form');
    if (otaForm) {
      otaForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.uploadOta();
      });
    }

    // Logs
    document.getElementById('refresh-logs-btn').addEventListener('click', () => this.loadLogs());
  },

  _isAutoLoggingIn: false,

  async apiRequest(url, options = {}) {
    options.headers = options.headers || {};
    if (this.token) {
      options.headers['Authorization'] = 'Bearer ' + this.token;
      options.headers['X-Session-Token'] = this.token;
    }

    try {
      const res = await fetch(url, options);
      if (res.status === 401 || res.status === 403) {
        if (!url.includes('/api/auth/login')) {
          // Token expired or invalid session: attempt silent auto-login
          const savedPass = localStorage.getItem('sh_pass') || 'admin';
          const savedUser = localStorage.getItem('sh_user') || 'admin';
          const remember = localStorage.getItem('sh_remember') !== 'false';

          if (remember && !this._isAutoLoggingIn) {
            this._isAutoLoggingIn = true;
            const authed = await this.autoLogin(savedUser, savedPass);
            this._isAutoLoggingIn = false;
            if (authed) {
              // Retry request with fresh token
              if (this.token) {
                options.headers['Authorization'] = 'Bearer ' + this.token;
                options.headers['X-Session-Token'] = this.token;
              }
              return await fetch(url, options);
            }
          }
          this.showLoginModal('Session expired. Please log in to continue.');
        }
      }
      return res;
    } catch (err) {
      console.error('API Error:', err);
      throw err;
    }
  },

  async autoLogin(user = 'admin', pass = 'admin') {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (data.success && data.token) {
        this.token = data.token;
        localStorage.setItem('sh_token', this.token);
        localStorage.setItem('sh_user', user);
        localStorage.setItem('sh_pass', pass);
        localStorage.setItem('sh_remember', 'true');
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
          logoutBtn.title = 'Logout (' + (user || 'admin') + ')';
          logoutBtn.innerText = '🚪';
        }
        this.hideLoginModal();
        return true;
      }
    } catch (e) {
      console.warn('Auto-login failed:', e);
    }
    return false;
  },

  async checkAuth() {
    try {
      const res = await this.apiRequest('/api/auth/check');
      const data = await res.json();
      const logoutBtn = document.getElementById('logout-btn');
      if (data.authenticated) {
        this.hideLoginModal();
        if (logoutBtn) {
          logoutBtn.title = 'Logout (' + (data.adminUser || 'admin') + ')';
          logoutBtn.innerText = '🚪';
        }
      } else {
        // Device session expired or not active: attempt auto-login
        const savedPass = localStorage.getItem('sh_pass') || 'admin';
        const savedUser = localStorage.getItem('sh_user') || 'admin';
        const remember = localStorage.getItem('sh_remember') !== 'false';

        if (remember) {
          const authed = await this.autoLogin(savedUser, savedPass);
          if (authed) {
            this.refreshAll();
            return;
          }
        }

        // Auto-login failed or disabled: clear state and prompt user
        this.token = '';
        localStorage.removeItem('sh_token');
        if (logoutBtn) {
          logoutBtn.title = 'Admin Login';
          logoutBtn.innerText = '🔐';
        }
        this.showLoginModal('Please log in with admin password to control devices.');
      }
    } catch (e) {
      // Offline / network failure: attempt auto-login or show modal
      const savedPass = localStorage.getItem('sh_pass') || 'admin';
      const savedUser = localStorage.getItem('sh_user') || 'admin';
      const authed = await this.autoLogin(savedUser, savedPass);
      if (!authed) {
        this.showLoginModal();
      }
    }
  },

  showLoginModal(msg = '') {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.remove('hidden');
    const userInp = document.getElementById('login-username');
    const passInp = document.getElementById('login-password');
    if (userInp) userInp.value = localStorage.getItem('sh_user') || 'admin';
    if (passInp) passInp.value = localStorage.getItem('sh_pass') || 'admin';
    const errEl = document.getElementById('login-error');
    if (errEl) {
      if (msg) {
        errEl.innerText = msg;
        errEl.classList.remove('hidden');
        errEl.style.color = 'var(--text-muted)';
      } else {
        errEl.classList.add('hidden');
      }
    }
  },

  hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.add('hidden');
  },

  async login() {
    const userInp = document.getElementById('login-username');
    const passInp = document.getElementById('login-password');
    const user = userInp ? userInp.value.trim() : 'admin';
    const pass = passInp ? passInp.value : '';
    const remember = document.getElementById('login-remember') ? document.getElementById('login-remember').checked : true;
    const errEl = document.getElementById('login-error');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (data.success && data.token) {
        this.token = data.token;
        localStorage.setItem('sh_token', this.token);
        if (remember) {
          localStorage.setItem('sh_user', user);
          localStorage.setItem('sh_pass', pass);
          localStorage.setItem('sh_remember', 'true');
        } else {
          localStorage.removeItem('sh_user');
          localStorage.removeItem('sh_pass');
          localStorage.setItem('sh_remember', 'false');
        }
        this.hideLoginModal();
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
          logoutBtn.title = 'Logout (' + (user || 'admin') + ')';
          logoutBtn.innerText = '🚪';
        }
        this.startDashboard();
      } else {
        if (errEl) {
          errEl.innerText = data.error || 'Invalid username or password';
          errEl.style.color = 'var(--danger)';
          errEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (errEl) {
        errEl.innerText = 'Network error during login';
        errEl.style.color = 'var(--danger)';
        errEl.classList.remove('hidden');
      }
    }
  },

  async logout() {
    try {
      await this.apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    this.token = '';
    localStorage.removeItem('sh_token');
    localStorage.removeItem('sh_pass');
    localStorage.setItem('sh_remember', 'false');
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.title = 'Admin Login';
      logoutBtn.innerText = '🔐';
    }
    this.showLoginModal('Logged out. Enter credentials to log back in.');
  },

  startDashboard() {
    this.refreshAll();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this.pollStatus(), 3000);
  },

  refreshAll() {
    this.loadStatus();
    this.loadGpios();
    this.loadRules();
    this.loadWifiStatus();
    this.loadI2cSettings();
    this.loadPairingStatus();
  },

  async pollStatus() {
    try {
      const res = await this.apiRequest('/api/status');
      if (res.ok) {
        const data = await res.json();
        this.renderStatus(data);
        // Also fetch latest GPIO states to reflect instant hardware changes
        this.loadGpios(true);
      }
    } catch (e) {}
  },

  async loadStatus() {
    try {
      const res = await this.apiRequest('/api/status');
      if (res.ok) {
        const data = await res.json();
        this.renderStatus(data);
      }
    } catch (e) {}
  },

  renderStatus(d) {
    if (d.deviceName) {
      document.getElementById('header-device-name').innerText = d.deviceName;
      document.title = d.deviceName + ' - Dashboard';
    }

    const badge = document.getElementById('wifi-badge');
    if (d.staConnected) {
      badge.className = 'badge badge-success';
      badge.innerText = 'Wi-Fi: Connected (' + (d.rssi || 0) + ' dBm)';
    } else if (d.apActive) {
      badge.className = 'badge badge-warning';
      badge.innerText = 'Wi-Fi: Hotspot AP';
    } else {
      badge.className = 'badge badge-danger';
      badge.innerText = 'Wi-Fi: Offline';
    }

    // Stats
    const modeNames = ['AP Only', 'Router Only', 'AP + Router'];
    document.getElementById('stat-mode').innerText = 'Mode: ' + (modeNames[d.wifiMode] || 'AP + Router');
    document.getElementById('stat-ip').innerText = d.staConnected ? d.staIp : d.apIp;
    document.getElementById('stat-ssid').innerText = 'SSID: ' + (d.staConnected ? d.staSsid : d.apSsid);
    
    // Uptime
    const sec = d.uptimeSec || 0;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    document.getElementById('stat-uptime').innerText = `${h}h ${m}m ${s}s`;
    document.getElementById('stat-time').innerText = 'NTP: ' + (d.formattedTime || 'Not Synced');

    // Heap & Flash
    document.getElementById('stat-heap').innerText = Math.round((d.freeHeap || 0) / 1024) + ' KB';
    const fsUsed = Math.round((d.fsUsed || 0) / 1024);
    const fsTotal = Math.round((d.fsTotal || 0) / 1024);
    document.getElementById('stat-flash').innerText = `Storage: ${fsUsed}/${fsTotal} KB`;

    // System Diagnostics Tab
    const setElem = (id, val, isHtml = false) => {
      const el = document.getElementById(id);
      if (el) {
        if (isHtml) el.innerHTML = val;
        else el.innerText = val;
      }
    };

    const fmtDuration = (sSec) => {
      if (!sSec || sSec <= 0) return '0s';
      const days = Math.floor(sSec / 86400);
      const hours = Math.floor((sSec % 86400) / 3600);
      const mins = Math.floor((sSec % 3600) / 60);
      const secs = sSec % 60;
      const p = [];
      if (days > 0) p.push(`${days}d`);
      if (hours > 0 || days > 0) p.push(`${hours}h`);
      if (mins > 0 || hours > 0 || days > 0) p.push(`${mins}m`);
      p.push(`${secs}s`);
      return p.join(' ');
    };

    // Diagnostics Quick Summary Cards
    setElem('diag-uptime', fmtDuration(d.uptimeSec));
    setElem('diag-uptime-raw', `Raw: ${d.uptimeSec || 0}s`);
    setElem('diag-boot-count', `${d.bootCount || 1}`);
    setElem('diag-heap-cur', `${Math.round((d.freeHeap || 0) / 1024)} KB`);
    setElem('diag-heap-min', `Min: ${Math.round((d.minFreeHeap || d.freeHeap || 0) / 1024)} KB`);
    setElem('diag-fs-summary', `${fsUsed}/${fsTotal} KB`);
    setElem('diag-fs-free-sub', `Free: ${Math.round((d.fsFree || 0) / 1024)} KB (${100 - (d.fsPercent || 0)}%)`);

    // 1. Reset & Boot Diagnostics
    setElem('diag-reset-reason', d.resetReason || 'Unknown');
    setElem('diag-reset-details', d.resetDetails || d.resetReason || 'Normal boot');
    setElem('diag-reset-raw', d.resetRaw || 'None');
    setElem('diag-restarts', `${d.bootCount || 1}`);
    setElem('diag-uptime-full', `${fmtDuration(d.uptimeSec)} (${d.uptimeSec || 0} seconds)`);

    // 2. RAM & Heap Memory Diagnostics
    setElem('diag-free-heap', `${d.freeHeap || 0} bytes (${Math.round((d.freeHeap || 0) / 1024)} KB)`);
    setElem('diag-min-free-heap', `${d.minFreeHeap || d.freeHeap || 0} bytes (${Math.round((d.minFreeHeap || d.freeHeap || 0) / 1024)} KB)`);
    setElem('diag-max-block', `${d.maxFreeBlock || 0} bytes (${Math.round((d.maxFreeBlock || 0) / 1024)} KB)`);
    setElem('diag-heap-frag', `${d.heapFragPercent !== undefined ? d.heapFragPercent : 0}% fragmentation`);

    // 3. Flash & LittleFS Storage
    const flashRealMb = Math.round((d.flashSize || 0) / (1024 * 1024));
    setElem('diag-flash-real', `${Math.round((d.flashSize || 0) / 1024)} KB (${flashRealMb} MB) [Configured: ${Math.round((d.flashConfigSize || 0) / 1024)} KB]`);
    setElem('diag-flash-speed-mode', `${Math.round((d.flashSpeed || 40000000) / 1000000)} MHz &bull; ${d.flashMode || 'QIO'}`, true);
    setElem('diag-flash-id', `0x${d.flashChipId || '0000'}`);
    setElem('diag-sketch-size', `${Math.round((d.sketchSize || 0) / 1024)} KB`);
    setElem('diag-sketch-free', `${Math.round((d.freeSketchSpace || 0) / 1024)} KB`);
    setElem('diag-fs-total', `${fsTotal} KB (${d.fsTotal || 0} bytes)`);
    setElem('diag-fs-used', `${fsUsed} KB (${d.fsUsed || 0} bytes)`);
    setElem('diag-fs-free', `${Math.round((d.fsFree || 0) / 1024)} KB (${d.fsFree || 0} bytes)`);
    setElem('diag-fs-percent', `${d.fsPercent || 0}% used &bull; ${100 - (d.fsPercent || 0)}% available`, true);

    // 4. Wi-Fi & Network Diagnostics
    setElem('diag-wifi-mode', modeNames[d.wifiMode] || 'AP + Router');
    setElem('diag-wifi-ssid', d.staConnected ? d.staSsid : '(Not connected)');
    let rssiQuality = 'N/A';
    if (d.staConnected) {
      const r = d.rssi || 0;
      const qual = r >= -60 ? 'Excellent' : r >= -70 ? 'Good' : r >= -80 ? 'Fair' : 'Weak';
      rssiQuality = `${r} dBm (${qual})`;
    }
    setElem('diag-wifi-rssi', rssiQuality);
    setElem('diag-wifi-uptime', d.staConnected ? fmtDuration(d.wifiUptimeSec) : 'Offline');
    setElem('diag-ip-mode', d.useStaticIp ? 'Static IP (Manual)' : 'DHCP Client (Automatic)');
    setElem('diag-sta-ip', d.staConnected ? d.staIp : 'N/A');
    setElem('diag-gateway', d.staConnected ? (d.staGateway || '0.0.0.0') : 'N/A');
    setElem('diag-subnet', d.staConnected ? (d.staSubnet || '255.255.255.0') : 'N/A');
    const dnsStr = (d.dns1 || d.dns2) ? `${d.dns1 || 'None'} / ${d.dns2 || 'None'}` : 'Router Assigned';
    setElem('diag-dns', dnsStr);
    setElem('diag-ap-info', d.apActive ? `SSID: ${d.apSsid} &bull; IP: ${d.apIp}` : 'AP Disabled', true);
    setElem('diag-mac', d.mac || 'N/A');

    // 5. Microcontroller Platform & Software
    setElem('diag-dev-name', d.deviceName || 'SmartHome-NodeMCU');
    setElem('diag-fw-ver', `v${d.firmwareVersion || '1.5.0'}`);
    setElem('diag-core-ver', `Arduino ESP8266 Core v${d.coreVersion || '3.1.2'}`);
    setElem('diag-sdk-ver', `Espressif Non-OS SDK ${d.sdkVersion || '2.2.2'}`);
    setElem('diag-cpu-freq', `${d.cpuFreq || 80} MHz`);
    setElem('diag-ntp-time', d.formattedTime || 'Not Synced');

    // Legacy Element Fallback (guarantees old cached HTML still displays values)
    setElem('info-fw-ver', `v${d.firmwareVersion || '1.4.0'}`);
    setElem('info-cpu-freq', `${d.cpuFreq || 80} MHz`);
    setElem('info-free-heap', `${d.freeHeap || 0} bytes (${Math.round((d.freeHeap || 0) / 1024)} KB)`);
    setElem('info-flash-total', `${Math.round((d.flashSize || 0) / 1024)} KB`);
    setElem('info-fs-used', `${fsUsed} KB`);
    setElem('info-fs-free', `${Math.round((d.fsFree || 0) / 1024)} KB`);
    setElem('info-mac', d.mac || '-');
    setElem('info-reset-reason', d.resetReason || '-');
  },

  // ==== GPIO MANAGEMENT ====
  async loadGpios(silent = false) {
    try {
      const res = await this.apiRequest('/api/gpio');
      if (res.ok) {
        this.channels = await res.json();
        this.renderGpios();
      }
    } catch (e) {
      if (!silent) console.error(e);
    }
  },

  renderGpios() {
    const overviewContainer = document.getElementById('overview-gpio-grid');
    const relaysContainer = document.getElementById('gpio-cards-container');
    const sensorsContainer = document.getElementById('sensors-cards-container');

    // Also populate settings provisioning table
    this.renderSettingsGpioTable();

    const relays = this.channels.filter(ch => !ch.isSensor && ch.type !== 'IR_TRANSMITTER');
    const sensors = this.channels.filter(ch => ch.isSensor || ch.type === 'IR_RECEIVER' || ch.type === 'IR_TRANSMITTER' || ch.type === 'VOLTAGE_ADC' || ch.direction === 'INPUT');

    // 1. RENDER RELAYS / ACTUATORS (TAB: tab-gpio)
    if (relaysContainer) {
      if (relays.length === 0) {
        relaysContainer.innerHTML = `
          <div style="text-align: center; padding: 30px; color: var(--text-muted); grid-column: 1 / -1; background: var(--bg-hover); border-radius: 8px;">
            <p style="margin-bottom: 12px; font-size: 1rem;">No GPIO relay channels configured.</p>
            <button class="btn btn-primary btn-sm" onclick="app.openAddGpioModal()">➕ Add Relay Output</button>
            <button class="btn btn-success btn-sm" style="margin-left: 8px;" onclick="app.populatePcfChannels()">⚡ Add 8 PCF Relays (P0-P7)</button>
          </div>
        `;
      } else {
        let rHtml = '';
        relays.forEach(ch => {
          const isOn = ch.state;
          const statusClass = isOn ? 'on' : '';
          const cardActiveClass = isOn ? 'active-on' : '';
          const stateText = isOn ? 'ON' : 'OFF';

          rHtml += `
            <div class="gpio-card ${cardActiveClass}">
              <div class="gpio-card-top">
                <div class="gpio-title-group">
                  <h4>${ch.name} <span class="badge" style="font-size:0.68rem; padding: 2px 5px; background: rgba(59,130,246,0.2); color:#60a5fa; border-radius: 4px;">${ch.function || 'Relay'}</span></h4>
                  <span class="gpio-meta">Pin: <strong>${ch.label}</strong> &bull; Room: <strong>${ch.room}</strong></span>
                  <span class="gpio-meta">${ch.activeLow ? 'Active-Low (Relay)' : 'Active-High'} &bull; Boot: <strong>${ch.initialMode === 1 ? 'Always OFF' : ch.initialMode === 2 ? 'Always ON' : 'Restore Last State'}</strong></span>
                  ${ch.bootSensitive ? `<span class="hint-text text-warning">⚠️ ${ch.note}</span>` : ''}
                </div>
                <div style="text-align: right;">
                  <span class="gpio-status-indicator ${statusClass}"></span>
                  <strong>${stateText}</strong>
                </div>
              </div>
              <div class="gpio-controls">
                <button class="btn ${isOn ? 'btn-danger' : 'btn-success'} btn-sm" onclick="app.toggleGpio(${ch.id})">
                  ${isOn ? 'Turn OFF' : 'Turn ON'}
                </button>
                <button class="btn btn-secondary btn-sm" onclick="app.pulseGpio(${ch.id}, 500)">
                  Pulse (0.5s)
                </button>
                <button class="btn btn-secondary btn-sm" onclick="app.editGpio(${ch.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="app.deleteGpio(${ch.id})">Delete</button>
              </div>
            </div>
          `;
        });
        relaysContainer.innerHTML = rHtml;
      }
    }

    // 2. RENDER SENSORS & INFRARED (TAB: tab-sensors)
    if (sensorsContainer) {
      if (sensors.length === 0) {
        sensorsContainer.innerHTML = `
          <div style="text-align: center; padding: 36px 20px; color: var(--text-muted); grid-column: 1 / -1; background: var(--bg-hover); border-radius: 8px;">
            <div style="font-size: 2.2rem; margin-bottom: 10px;">📡</div>
            <h3 style="margin-bottom: 6px;">No Sensor Pins Configured</h3>
            <p style="font-size: 0.9rem; margin-bottom: 16px; color: var(--text-muted);">Configure an IR Receiver to learn remote keys, an IR Blaster to transmit signals, or a Voltage ADC sensor.</p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
              <button class="btn btn-primary btn-sm" onclick="app.quickAddSensor(14, 'IR Receiver Sensor', 'IR Receiver')">➕ Add D5 as IR Receiver</button>
              <button class="btn btn-primary btn-sm" onclick="app.quickAddSensor(13, 'IR Blaster LED', 'IR Transmitter')">➕ Add D7 as IR Transmitter</button>
              <button class="btn btn-primary btn-sm" onclick="app.quickAddSensor(17, 'Voltage Sensor', 'Voltage')">➕ Add A0 as Voltage Sensor</button>
            </div>
          </div>
        `;
      } else {
        let sHtml = '';
        sensors.forEach(ch => {
          // A. IR RECEIVER CARD
          if (ch.type === 'IR_RECEIVER' || (ch.function && ch.function.toLowerCase() === 'ir receiver')) {
            const lastCodeText = ch.lastCode ? `${ch.protocol || 'NEC'} ${ch.lastCode} (${ch.bits || 32} bits)` : 'No code detected yet (Listening on 38kHz)';
            const ageText = (ch.ageMs !== undefined) ? ` &bull; ${Math.round(ch.ageMs/1000)}s ago` : '';
            sHtml += `
              <div class="gpio-card" style="border-left: 4px solid #0ea5e9;">
                <div class="gpio-card-top">
                  <div class="gpio-title-group">
                    <h4>${ch.name} <span class="badge" style="font-size:0.7rem; padding: 2px 6px; background: #0ea5e9; color:#fff; border-radius: 4px;">🎯 IR RECEIVER</span></h4>
                    <span class="gpio-meta">${ch.room} &bull; Pin: <strong>${ch.label}</strong> &bull; Mode: <strong>Demodulator / Learner</strong></span>
                  </div>
                  <div style="text-align: right;">
                    <span class="badge badge-info" style="font-size:0.75rem; background: rgba(14, 165, 233, 0.2); color: #38bdf8;">🟢 Active Listening</span>
                  </div>
                </div>
                <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px 14px; margin: 12px 0;">
                  <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 3px; display: flex; justify-content: space-between;">
                    <span>Last Captured IR Remote Signal:</span>
                    <span>${ageText}</span>
                  </div>
                  <div style="font-family: monospace; font-size: 1rem; color: #38bdf8; font-weight: 700;">${lastCodeText}</div>
                </div>
                <div class="gpio-controls" style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <button class="btn btn-primary btn-sm" onclick="app.openIrTrainModal()">🎯 Train / Learn Key</button>
                  <button class="btn btn-secondary btn-sm" onclick="app.openSavedRemotesModal()">📋 View Saved Keys (${app.getTotalSavedButtons()})</button>
                  <button class="btn btn-secondary btn-sm" onclick="app.pollIrCode()">🔄 Sample / Poll IR</button>
                  <button class="btn btn-secondary btn-sm" onclick="app.editGpio(${ch.id})">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="app.deleteGpio(${ch.id})">Delete</button>
                </div>
              </div>
            `;
            return;
          }

          // B. IR TRANSMITTER CARD
          if (ch.type === 'IR_TRANSMITTER' || (ch.function && ch.function.toLowerCase() === 'ir transmitter')) {
            let blasterPills = '';
            if (app.savedRemotes && app.savedRemotes.length > 0) {
              app.savedRemotes.forEach(r => {
                if (r.buttons && r.buttons.length > 0) {
                  r.buttons.forEach(b => {
                    blasterPills += `<button class="btn btn-secondary btn-sm" style="font-size: 0.8rem; padding: 4px 10px; border: 1px solid rgba(245,158,11,0.3); background: rgba(245,158,11,0.1);" onclick="app.blastSavedKey('${r.name}', '${b.name}')">🚀 ${r.name}: ${b.name}</button>`;
                  });
                }
              });
            }
            if (!blasterPills) {
              blasterPills = `<span style="font-size: 0.8rem; color: var(--text-muted);">No saved remote buttons. Use an IR Receiver to learn keys, or blast manual hex below.</span>`;
            }

            sHtml += `
              <div class="gpio-card" style="border-left: 4px solid #f59e0b;">
                <div class="gpio-card-top">
                  <div class="gpio-title-group">
                    <h4>${ch.name} <span class="badge" style="font-size:0.7rem; padding: 2px 6px; background: #f59e0b; color:#111; border-radius: 4px; font-weight: 700;">🚀 IR TRANSMITTER</span></h4>
                    <span class="gpio-meta">${ch.room} &bull; Pin: <strong>${ch.label}</strong> &bull; IR Blaster LED</span>
                  </div>
                  <div style="text-align: right;">
                    <span class="badge" style="font-size:0.75rem; background: rgba(245, 158, 11, 0.2); color: #f59e0b;">Ready to Blast</span>
                  </div>
                </div>
                
                <div style="margin: 12px 0;">
                  <div style="font-size: 0.8rem; font-weight: 600; color: #f59e0b; margin-bottom: 6px;">⚡ Quick Blaster (Learned Keys):</div>
                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${blasterPills}
                  </div>
                </div>

                <div style="background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px; margin-top: 10px;">
                  <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">Manual Code Blaster:</div>
                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <select id="ir-tx-proto-${ch.id}" class="form-control" style="width: 110px; font-size: 0.82rem; padding: 4px 6px;">
                      <option value="NEC">NEC</option>
                      <option value="SAMSUNG">Samsung</option>
                      <option value="SONY">Sony</option>
                      <option value="RC5">RC5</option>
                      <option value="LG">LG</option>
                      <option value="PANASONIC">Panasonic</option>
                    </select>
                    <input id="ir-tx-hex-${ch.id}" class="form-control" placeholder="0x00FF807F" style="font-size: 0.82rem; padding: 4px 8px; flex: 1; min-width: 120px;">
                    <button class="btn btn-warning btn-sm" onclick="app.blastManualKey(${ch.pin}, ${ch.id})">🚀 Blast</button>
                  </div>
                </div>

                <div class="gpio-controls" style="margin-top: 12px;">
                  <button class="btn btn-secondary btn-sm" onclick="app.openSavedRemotesModal()">📋 Manage Keys</button>
                  <button class="btn btn-secondary btn-sm" onclick="app.editGpio(${ch.id})">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="app.deleteGpio(${ch.id})">Delete</button>
                </div>
              </div>
            `;
            return;
          }

          // C. VOLTAGE ADC SENSOR CARD
          if (ch.type === 'VOLTAGE_ADC' || ch.pin === 17 || (ch.function && ch.function.toLowerCase() === 'voltage')) {
            const voltVal = (ch.value !== undefined) ? Number(ch.value).toFixed(2) : '0.00';
            const pct = Math.min(100, Math.max(0, (Number(ch.value || 0) / 3.3) * 100)).toFixed(1);
            sHtml += `
              <div class="gpio-card" style="border-left: 4px solid #10b981;">
                <div class="gpio-card-top">
                  <div class="gpio-title-group">
                    <h4>${ch.name} <span class="badge" style="font-size:0.7rem; padding: 2px 6px; background: #10b981; color:#fff; border-radius: 4px;">⚡ VOLTAGE ADC</span></h4>
                    <span class="gpio-meta">${ch.room} &bull; Pin: <strong>${ch.label}</strong> &bull; Range: 0.00V - 3.30V</span>
                  </div>
                  <div style="text-align: right;">
                    <span id="sensor-volt-val-${ch.id}" style="font-size: 1.4rem; font-weight: 800; color: #10b981; display: inline-block; transition: transform 0.2s;">${voltVal} V</span>
                    <div id="sensor-volt-adc-${ch.id}" style="font-size: 0.75rem; color: var(--text-muted);">Raw ADC: ${ch.rawAdc || 0}/1023</div>
                  </div>
                </div>

                <!-- Voltage Progress Bar -->
                <div style="margin: 12px 0 6px 0; background: rgba(255,255,255,0.06); height: 8px; border-radius: 4px; overflow: hidden;">
                  <div id="sensor-volt-bar-${ch.id}" style="height: 100%; width: ${pct}%; background: linear-gradient(90deg, #10b981, #34d399); border-radius: 4px; transition: width 0.4s ease;"></div>
                </div>

                <div class="gpio-controls" style="margin-top: 10px;">
                  <button class="btn btn-success btn-sm" onclick="app.sampleVoltage(${ch.id})">⚡ Sample Live ADC</button>
                  <button class="btn btn-secondary btn-sm" onclick="app.editGpio(${ch.id})">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="app.deleteGpio(${ch.id})">Delete</button>
                </div>
              </div>
            `;
            return;
          }

          // D. PIR MOTION SENSOR
          if (ch.type === 'PIR_MOTION' || (ch.function && ch.function.toLowerCase().includes('motion'))) {
            sHtml += `
              <div class="gpio-card" style="border-left: 4px solid #8b5cf6;">
                <div class="gpio-card-top">
                  <div class="gpio-title-group">
                    <h4>${ch.name} <span class="badge" style="font-size:0.7rem; padding: 2px 6px; background: #8b5cf6; color:#fff; border-radius: 4px;">🚶 PIR MOTION</span></h4>
                    <span class="gpio-meta">${ch.room} &bull; Pin: <strong>${ch.label}</strong> &bull; Direction: INPUT</span>
                  </div>
                  <div style="text-align: right;">
                    <span class="badge ${ch.state ? 'badge-danger' : 'badge-success'}" style="font-size: 0.85rem; padding: 5px 10px;">
                      ${ch.state ? '🚶 MOTION DETECTED' : '🟢 IDLE / CLEAR'}
                    </span>
                  </div>
                </div>
                <div class="gpio-controls" style="margin-top: 12px;">
                  <button class="btn btn-secondary btn-sm" onclick="app.loadGpios()">🔄 Refresh</button>
                  <button class="btn btn-secondary btn-sm" onclick="app.editGpio(${ch.id})">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="app.deleteGpio(${ch.id})">Delete</button>
                </div>
              </div>
            `;
            return;
          }

          // E. DOOR / WINDOW SENSOR
          if (ch.type === 'DOOR_SENSOR' || (ch.function && (ch.function.toLowerCase().includes('door') || ch.function.toLowerCase().includes('window')))) {
            sHtml += `
              <div class="gpio-card" style="border-left: 4px solid #ec4899;">
                <div class="gpio-card-top">
                  <div class="gpio-title-group">
                    <h4>${ch.name} <span class="badge" style="font-size:0.7rem; padding: 2px 6px; background: #ec4899; color:#fff; border-radius: 4px;">🚪 CONTACT SENSOR</span></h4>
                    <span class="gpio-meta">${ch.room} &bull; Pin: <strong>${ch.label}</strong> &bull; Direction: INPUT</span>
                  </div>
                  <div style="text-align: right;">
                    <span class="badge ${ch.state ? 'badge-warning' : 'badge-success'}" style="font-size: 0.85rem; padding: 5px 10px;">
                      ${ch.state ? '🚪 CONTACT OPEN' : '🔒 CLOSED / SECURE'}
                    </span>
                  </div>
                </div>
                <div class="gpio-controls" style="margin-top: 12px;">
                  <button class="btn btn-secondary btn-sm" onclick="app.loadGpios()">🔄 Refresh</button>
                  <button class="btn btn-secondary btn-sm" onclick="app.editGpio(${ch.id})">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="app.deleteGpio(${ch.id})">Delete</button>
                </div>
              </div>
            `;
            return;
          }

          // F. OTHER GENERIC SENSORS
          sHtml += `
            <div class="gpio-card" style="border-left: 4px solid #6366f1;">
              <div class="gpio-card-top">
                <div class="gpio-title-group">
                  <h4>${ch.name} <span class="badge" style="font-size:0.7rem; padding: 2px 6px; background: #6366f1; color:#fff; border-radius: 4px;">SENSOR</span></h4>
                  <span class="gpio-meta">${ch.room} &bull; Pin: <strong>${ch.label}</strong> &bull; ${ch.function}</span>
                </div>
                <div style="text-align: right;">
                  <span class="badge ${ch.state ? 'badge-info' : 'badge-secondary'}">${ch.state ? 'ACTIVE' : 'INACTIVE'}</span>
                </div>
              </div>
              <div class="gpio-controls" style="margin-top: 10px;">
                <button class="btn btn-secondary btn-sm" onclick="app.loadGpios()">🔄 Refresh</button>
                <button class="btn btn-secondary btn-sm" onclick="app.editGpio(${ch.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="app.deleteGpio(${ch.id})">Delete</button>
              </div>
            </div>
          `;
        });
        sensorsContainer.innerHTML = sHtml;
      }
    }

    // 3. RENDER OVERVIEW SWITCHES
    if (overviewContainer) {
      if (relays.length === 0) {
        overviewContainer.innerHTML = `
          <div style="text-align: center; padding: 20px; color: var(--text-muted); grid-column: 1 / -1;">
            <p style="margin-bottom: 8px;">No relay outputs configured.</p>
            <button class="btn btn-primary btn-sm" onclick="app.openAddGpioModal()">➕ Add Relay</button>
          </div>
        `;
      } else {
        let ovHtml = '';
        relays.forEach(ch => {
          const isOn = ch.state;
          const statusClass = isOn ? 'on' : '';
          const cardActiveClass = isOn ? 'active-on' : '';
          const stateText = isOn ? 'ON' : 'OFF';

          ovHtml += `
            <div class="gpio-card ${cardActiveClass}">
              <div class="gpio-card-top">
                <div class="gpio-title-group">
                  <h4>${ch.name}</h4>
                  <span class="gpio-meta">${ch.room} &bull; ${ch.function} (${ch.label})</span>
                </div>
                <div>
                  <span class="gpio-status-indicator ${statusClass}"></span>
                  <strong>${stateText}</strong>
                </div>
              </div>
              <div class="gpio-controls">
                <button class="btn ${isOn ? 'btn-danger' : 'btn-success'}" onclick="app.toggleGpio(${ch.id})">
                  ${isOn ? 'Turn OFF' : 'Turn ON'}
                </button>
                <button class="btn btn-secondary" onclick="app.pulseGpio(${ch.id}, 500)">
                  Pulse (0.5s)
                </button>
              </div>
            </div>
          `;
        });
        overviewContainer.innerHTML = ovHtml;
      }
    }
  },

  renderSettingsGpioTable() {
    const tbody = document.getElementById('settings-gpio-tbody');
    if (!tbody) return;

    if (!this.channels || this.channels.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 18px; color: var(--text-muted);">No GPIO channels configured yet. Click <strong>➕ Add GPIO Channel</strong> or <strong>⚡ Add 8 PCF Relays</strong> above.</td></tr>`;
      return;
    }

    let rows = '';
    this.channels.forEach(ch => {
      const isSensor = ch.isSensor || ch.direction === 'INPUT';
      const dirBadge = isSensor ? `<span class="badge" style="background: rgba(14,165,233,0.2); color: #0284c7; padding: 2px 6px;">INPUT</span>` : `<span class="badge" style="background: rgba(16,185,129,0.2); color: #059669; padding: 2px 6px;">OUTPUT</span>`;
      
      let valDisplay = '';
      if (ch.type === 'VOLTAGE_ADC') {
        valDisplay = `<strong>${Number(ch.value || 0).toFixed(2)} V</strong>`;
      } else if (ch.type === 'IR_RECEIVER') {
        valDisplay = ch.lastCode ? `<code style="font-size:0.75rem; color:#0284c7;">${ch.lastCode}</code>` : `<span style="color:var(--text-muted);">Listening</span>`;
      } else if (ch.type === 'IR_TRANSMITTER') {
        valDisplay = `<span style="color:#f59e0b;">Ready</span>`;
      } else {
        valDisplay = ch.state ? `<strong class="text-success">ON</strong>` : `<span class="text-muted">OFF</span>`;
      }

      rows += `
        <tr>
          <td><strong>${ch.id}</strong></td>
          <td><code>${ch.label || ('Pin ' + ch.pin)}</code></td>
          <td><strong>${ch.name}</strong></td>
          <td>${ch.room}</td>
          <td>${ch.function}</td>
          <td>${dirBadge} ${ch.type}</td>
          <td>${valDisplay}</td>
          <td>
            <button class="btn btn-secondary btn-sm" style="padding: 2px 7px; font-size: 0.75rem;" onclick="app.editGpio(${ch.id})">Edit</button>
            <button class="btn btn-danger btn-sm" style="padding: 2px 7px; font-size: 0.75rem;" onclick="app.deleteGpio(${ch.id})">Delete</button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = rows;
  },

  openAddSensorModal() {
    this.openAddGpioModal();
    const title = document.getElementById('gpio-modal-title');
    if (title) title.innerText = 'Configure New Sensor Channel';
    const funcSelect = document.getElementById('gpio-func-select');
    if (funcSelect) funcSelect.value = 'IR Receiver';
    const pinSelect = document.getElementById('gpio-pin-select');
    if (pinSelect) pinSelect.value = '14';
  },

  async quickAddSensor(pin, name, func) {
    try {
      const res = await this.apiRequest('/api/gpio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: pin,
          name: name,
          room: 'Living Room',
          function: func,
          activeLow: true,
          initialMode: 0
        })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(`Added ${name} on Pin ${pin}!`);
        await this.loadGpios();
        await this.loadIrStatus();
      } else {
        alert(data.error || 'Failed to add sensor channel');
      }
    } catch (e) {
      alert('Error adding sensor: ' + e.message);
    }
  },

  async sampleVoltage(chId) {
    try {
      const res = await this.apiRequest('/api/gpio');
      if (res.ok) {
        this.channels = await res.json();
        const voltCh = this.channels.find(c => c.id === chId || c.pin === 17 || c.type === 'VOLTAGE_ADC');
        if (voltCh) {
          const valEl = document.getElementById(`sensor-volt-val-${voltCh.id}`);
          const rawEl = document.getElementById(`sensor-volt-adc-${voltCh.id}`);
          const barEl = document.getElementById(`sensor-volt-bar-${voltCh.id}`);
          const v = Number(voltCh.value || 0).toFixed(2);
          if (valEl) {
            valEl.innerText = `${v} V`;
            valEl.style.transform = 'scale(1.2)';
            setTimeout(() => valEl.style.transform = 'scale(1)', 250);
          }
          if (rawEl) rawEl.innerText = `Raw ADC: ${voltCh.rawAdc || 0}/1023`;
          if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, (voltCh.value / 3.3) * 100))}%`;
          this.showToast(`⚡ Voltage Sampled: ${v} V (Raw ADC: ${voltCh.rawAdc || 0}/1023)`);
        } else {
          this.renderGpios();
        }
      }
    } catch (e) {
      console.error(e);
    }
  },

  async pollIrCode() {
    try {
      const res = await this.apiRequest('/api/ir/train/result');
      if (res.ok) {
        const data = await res.json();
        if (data.hexCode) {
          alert(`🎯 Last Demodulated IR Signal:\nProtocol: ${data.protocol}\nHex Code: ${data.hexCode}\nBits: ${data.bits}\nAge: ${Math.round((data.ageMs || 0)/1000)} seconds ago`);
        } else {
          alert('No IR signal received yet. Point your remote at Pin D5 and press any button, or click "Train / Learn Key".');
        }
      }
    } catch (e) {
      alert('Error reading IR code: ' + e.message);
    }
  },

  async refreshSensors() {
    await this.loadGpios();
    await this.loadIrStatus();
    await this.loadIrRemotes();
    this.showToast('Sensors & remotes refreshed');
  },

  showToast(message, duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 99999; display: flex; flex-direction: column; gap: 8px; pointer-events: none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = 'background: #0f172a; color: #fff; border: 1px solid #38bdf8; border-radius: 6px; padding: 10px 16px; font-size: 0.88rem; box-shadow: 0 4px 12px rgba(0,0,0,0.5); pointer-events: auto; display: flex; align-items: center; gap: 8px;';
    toast.innerHTML = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },



  async toggleGpio(id) {
    try {
      const res = await this.apiRequest('/api/gpio/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, action: 'toggle' })
      });
      if (res && res.ok) {
        this.loadGpios(true);
      }
    } catch (e) {
      console.error('Toggle GPIO error:', e);
    }
  },

  async pulseGpio(id, durationMs) {
    try {
      await this.apiRequest('/api/gpio/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, action: 'pulse', duration: durationMs })
      });
      this.loadGpios(true);
    } catch (e) {}
  },

  openAddGpioModal() {
    document.getElementById('gpio-edit-id').value = '';
    document.getElementById('gpio-modal-title').innerText = 'Add New GPIO Channel';
    document.getElementById('gpio-pin-group').style.display = 'block';
    document.getElementById('gpio-name-input').value = '';
    document.getElementById('gpio-room-input').value = '';
    document.getElementById('gpio-func-select').value = 'Light';
    document.getElementById('gpio-active-low').checked = true;
    document.getElementById('gpio-init-mode').value = '0';

    // Populate pins dynamically based on I2C state
    const pinSelect = document.getElementById('gpio-pin-select');
    if (pinSelect) {
      const i2c = this.i2cConfig || {};
      let html = '';
      if (i2c.enabled) {
        html += '<optgroup label="PCF8574 I2C Expander Pins (Active)">';
        for (let p = 100; p <= 107; p++) {
          html += `<option value="${p}">P${p - 100} (Pin ${p}) - PCF8574 Relay ${p - 99}</option>`;
        }
        html += '</optgroup>';
      }

      html += '<optgroup label="ESP8266 Native Pins">';
      const nativePins = [
        { pin: 5, label: 'D1 (GPIO 5) - SCL' },
        { pin: 4, label: 'D2 (GPIO 4) - SDA' },
        { pin: 14, label: 'D5 (GPIO 14) - SPI SCLK' },
        { pin: 12, label: 'D6 (GPIO 12) - SPI MISO' },
        { pin: 13, label: 'D7 (GPIO 13) - SPI MOSI' },
        { pin: 16, label: 'D0 (GPIO 16) - WAKE Pin' },
        { pin: 0, label: 'D3 (GPIO 0) - Boot Sensitive' },
        { pin: 2, label: 'D4 (GPIO 2) - Boot Sensitive' },
        { pin: 15, label: 'D8 (GPIO 15) - Boot Sensitive' },
        { pin: 17, label: 'A0 (ADC0) - Dedicated Analog Voltage Input (0-3.3V)' }
      ];

      nativePins.forEach(p => {
        if (i2c.enabled && (p.pin === i2c.sdaPin || p.pin === i2c.sclPin)) {
          html += `<option value="${p.pin}" disabled>${p.label} (Reserved for I2C)</option>`;
        } else {
          html += `<option value="${p.pin}">${p.label}</option>`;
        }
      });
      html += '</optgroup>';
      pinSelect.innerHTML = html;
    }

    document.getElementById('gpio-modal').classList.remove('hidden');
  },

  editGpio(id) {
    const ch = this.channels.find(c => c.id === id);
    if (!ch) return;

    document.getElementById('gpio-edit-id').value = ch.id;
    document.getElementById('gpio-modal-title').innerText = 'Edit GPIO Channel: ' + ch.name;
    document.getElementById('gpio-pin-group').style.display = 'none'; // Pin cannot be changed while editing
    document.getElementById('gpio-name-input').value = ch.name;
    document.getElementById('gpio-room-input').value = ch.room;
    document.getElementById('gpio-func-select').value = ch.function;
    document.getElementById('gpio-active-low').checked = ch.activeLow;
    document.getElementById('gpio-init-mode').value = ch.initialMode;
    document.getElementById('gpio-modal').classList.remove('hidden');
  },

  async saveGpioChannel() {
    const editId = document.getElementById('gpio-edit-id').value;
    const pin = parseInt(document.getElementById('gpio-pin-select').value);
    const name = document.getElementById('gpio-name-input').value.trim();
    const room = document.getElementById('gpio-room-input').value.trim();
    const func = document.getElementById('gpio-func-select').value;
    const activeLow = document.getElementById('gpio-active-low').checked;
    const initMode = parseInt(document.getElementById('gpio-init-mode').value);

    const payload = {
      name: name,
      room: room,
      function: func,
      activeLow: activeLow,
      initialMode: initMode
    };

    try {
      let res;
      if (editId) {
        payload.id = parseInt(editId);
        payload.enabled = true;
        res = await this.apiRequest('/api/gpio/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        payload.pin = pin;
        res = await this.apiRequest('/api/gpio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (data.success) {
        this.closeModal('gpio-modal');
        this.loadGpios();
      } else {
        alert(data.error || 'Failed to save channel');
      }
    } catch (e) {
      alert('Error saving GPIO channel');
    }
  },

  async deleteGpio(id) {
    if (!confirm('Are you sure you want to delete this GPIO channel configuration?')) return;
    try {
      const res = await this.apiRequest('/api/gpio/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      });
      const data = await res.json();
      if (data.success) {
        this.loadGpios();
      } else {
        alert(data.error || 'Failed to delete channel');
      }
    } catch (e) {
      alert('Error deleting GPIO channel');
    }
  },

  // ==== AUTOMATION RULES ====
  async loadRules() {
    try {
      const res = await this.apiRequest('/api/automation');
      if (res.ok) {
        this.rules = await res.json();
        this.renderRules();
      }
    } catch (e) {}
  },

  renderRules() {
    const container = document.getElementById('rules-container');
    if (this.rules.length === 0) {
      container.innerHTML = '<p class="placeholder-text">No automation rules created yet.</p>';
      return;
    }

    let html = '<div class="table-responsive"><table class="data-table"><thead><tr><th>Name</th><th>Type</th><th>Target</th><th>Details</th><th>Triggers</th><th>Status</th><th>Action</th></tr></thead><tbody>';

    const typeNames = ['Auto-Off Timer', 'Interlock Link', 'Daily Schedule'];

    this.rules.forEach(r => {
      const targetCh = this.channels.find(c => c.id === r.targetGpioId);
      const targetName = targetCh ? targetCh.name : 'Channel ' + r.targetGpioId;
      let details = '';

      if (r.type === 0) {
        details = `Turn OFF after ${r.param1}s`;
      } else if (r.type === 1) {
        const srcCh = this.channels.find(c => c.id === r.sourceGpioId);
        const srcName = srcCh ? srcCh.name : 'Channel ' + r.sourceGpioId;
        details = `When ${srcName} is ${r.condState ? 'ON' : 'OFF'} &rarr; Set ${r.targetState ? 'ON' : 'OFF'}`;
      } else if (r.type === 2) {
        const hh = String(Math.floor(r.param1 / 60)).padStart(2, '0');
        const mm = String(r.param1 % 60).padStart(2, '0');
        details = `Every day at ${hh}:${mm} &rarr; Turn ${r.targetState ? 'ON' : 'OFF'}`;
      }

      html += `
        <tr>
          <td><strong>${r.name}</strong></td>
          <td>${typeNames[r.type] || 'Rule'}</td>
          <td>${targetName}</td>
          <td>${details}</td>
          <td>${r.execCount || 0}</td>
          <td>
            <button class="btn btn-sm ${r.enabled ? 'btn-success' : 'btn-secondary'}" onclick="app.toggleRule(${r.id})">
              ${r.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="app.deleteRule(${r.id})">Delete</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  },

  openAddRuleModal() {
    // Populate select boxes with available GPIO channels
    const targetSel = document.getElementById('rule-target-select');
    const sourceSel = document.getElementById('rule-source-select');

    let opts = '';
    this.channels.forEach(ch => {
      opts += `<option value="${ch.id}">${ch.name} (${ch.room})</option>`;
    });

    targetSel.innerHTML = opts;
    sourceSel.innerHTML = opts;

    document.getElementById('rule-name-input').value = '';
    document.getElementById('rule-type-select').value = '0';
    this.handleRuleTypeChange('0');
    document.getElementById('rule-modal').classList.remove('hidden');
  },

  handleRuleTypeChange(typeVal) {
    const t = parseInt(typeVal);
    document.getElementById('rule-timer-fields').classList.toggle('hidden', t !== 0);
    document.getElementById('rule-interlock-fields').classList.toggle('hidden', t !== 1);
    document.getElementById('rule-schedule-fields').classList.toggle('hidden', t !== 2);
  },

  async saveRule() {
    const name = document.getElementById('rule-name-input').value.trim();
    const type = parseInt(document.getElementById('rule-type-select').value);
    const targetId = parseInt(document.getElementById('rule-target-select').value);

    let sourceId = 0;
    let condState = true;
    let targetState = false;
    let param1 = 0;

    if (type === 0) {
      param1 = parseInt(document.getElementById('rule-seconds-input').value) || 300;
      targetState = false; // Auto-off sets target to false
    } else if (type === 1) {
      sourceId = parseInt(document.getElementById('rule-source-select').value);
      condState = document.getElementById('rule-cond-state').value === '1';
      targetState = document.getElementById('rule-target-action').value === '1';
    } else if (type === 2) {
      const timeVal = document.getElementById('rule-time-input').value; // "HH:MM"
      const parts = timeVal.split(':');
      param1 = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
      targetState = document.getElementById('rule-sched-action').value === '1';
    }

    try {
      const res = await this.apiRequest('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          type: type,
          sourceGpioId: sourceId,
          targetGpioId: targetId,
          condState: condState,
          targetState: targetState,
          param1: param1
        })
      });
      const data = await res.json();
      if (data.success) {
        this.closeModal('rule-modal');
        this.loadRules();
      } else {
        alert(data.error || 'Failed to save automation rule');
      }
    } catch (e) {
      alert('Error saving rule');
    }
  },

  async toggleRule(id) {
    try {
      await this.apiRequest('/api/automation/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      });
      this.loadRules();
    } catch (e) {}
  },

  async deleteRule(id) {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      const res = await this.apiRequest('/api/automation/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
      });
      this.loadRules();
    } catch (e) {}
  },

  // ==== WI-FI CONFIGURATION ====
  handleIpModeChange(mode) {
    const fields = document.getElementById('static-ip-fields');
    if (!fields) return;
    if (mode === 'static') {
      fields.classList.remove('hidden');
      const curIpEl = document.getElementById('stat-ip');
      const curIp = curIpEl ? curIpEl.innerText : '';
      const ipInput = document.getElementById('wifi-static-ip');
      if (ipInput && (!ipInput.value || ipInput.value === '0.0.0.0') && curIp && curIp !== '0.0.0.0') {
        ipInput.value = curIp;
      }
    } else {
      fields.classList.add('hidden');
    }
  },

  async loadWifiStatus() {
    try {
      const res = await this.apiRequest('/api/wifi/status');
      if (res.ok) {
        const data = await res.json();
        // Set mode radio
        const modeRadio = document.querySelector(`input[name="wifi-mode"][value="${data.mode}"]`);
        if (modeRadio) modeRadio.checked = true;

        // Set IP assignment mode radio
        const isStatic = !!data.useStaticIp;
        const dhcpRadio = document.getElementById('ip-mode-dhcp');
        const staticRadio = document.getElementById('ip-mode-static');
        if (isStatic) {
          if (staticRadio) staticRadio.checked = true;
          this.handleIpModeChange('static');
        } else {
          if (dhcpRadio) dhcpRadio.checked = true;
          this.handleIpModeChange('dhcp');
        }

        if (data.staConnected || data.staSsid) {
          document.getElementById('wifi-ssid').value = data.staSsid || '';
        }

        // Prepopulate static IP configuration fields
        if (document.getElementById('wifi-static-ip')) {
          document.getElementById('wifi-static-ip').value = data.staticIp || (data.staConnected ? data.staIp : '');
        }
        if (document.getElementById('wifi-gateway')) {
          document.getElementById('wifi-gateway').value = data.staticGateway || (data.staConnected ? data.staGateway : '');
        }
        if (document.getElementById('wifi-subnet')) {
          document.getElementById('wifi-subnet').value = data.staticSubnet || (data.staConnected ? data.staSubnet : '255.255.255.0');
        }
        if (document.getElementById('wifi-dns1')) {
          document.getElementById('wifi-dns1').value = data.staticDns1 || data.dns1 || '8.8.8.8';
        }
        if (document.getElementById('wifi-dns2')) {
          document.getElementById('wifi-dns2').value = data.staticDns2 || data.dns2 || '1.1.1.1';
        }
      }
    } catch (e) {}
  },

  async saveWifiMode() {
    const sel = document.querySelector('input[name="wifi-mode"]:checked');
    if (!sel) return;
    const mode = parseInt(sel.value);

    try {
      const res = await this.apiRequest('/api/wifi/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode })
      });
      const data = await res.json();
      alert(data.message || 'Wi-Fi operating mode updated');
    } catch (e) {
      alert('Error updating Wi-Fi mode');
    }
  },

  async scanWifi() {
    const statusEl = document.getElementById('wifi-scan-status');
    const tableEl = document.getElementById('wifi-scan-table');
    const tbody = document.getElementById('wifi-scan-tbody');
    const btn = document.getElementById('scan-wifi-btn');

    btn.disabled = true;
    statusEl.innerText = 'Scanning for nearby Wi-Fi networks (may take 2-4 seconds)...';
    tableEl.classList.add('hidden');

    try {
      const res = await this.apiRequest('/api/wifi/scan');
      const list = await res.json();
      btn.disabled = false;

      if (!list || list.length === 0) {
        statusEl.innerText = 'No Wi-Fi networks found. Try scanning again.';
        return;
      }

      statusEl.innerText = `Found ${list.length} network(s):`;
      let rows = '';
      list.forEach(n => {
        const isSecure = n.encryption !== 'Open';
        rows += `
          <tr>
            <td><strong>${n.ssid}</strong> ${n.isHidden ? '<small>(Hidden)</small>' : ''}</td>
            <td>${n.rssi} dBm</td>
            <td>${isSecure ? '🔒 ' + n.encryption : '🔓 Open'}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="app.selectNetwork('${encodeURIComponent(n.ssid)}')">
                Select
              </button>
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = rows;
      tableEl.classList.remove('hidden');
    } catch (e) {
      btn.disabled = false;
      statusEl.innerText = 'Failed to scan networks.';
    }
  },

  selectNetwork(encodedSsid) {
    const ssid = decodeURIComponent(encodedSsid);
    document.getElementById('wifi-ssid').value = ssid;
    document.getElementById('wifi-pass').focus();
  },

  async connectWifi() {
    const ssid = document.getElementById('wifi-ssid').value.trim();
    const pass = document.getElementById('wifi-pass').value;
    const ipModeEl = document.getElementById('ip-mode-static');
    const isStatic = ipModeEl ? ipModeEl.checked : false;
    const btn = document.getElementById('btn-connect-wifi');

    if (!ssid) {
      alert('Please enter or select a Wi-Fi SSID');
      return;
    }

    const getVal = (id, def = '') => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : def;
    };

    const payload = {
      ssid: ssid,
      password: pass,
      useStaticIp: isStatic,
      staticIp: getVal('wifi-static-ip'),
      staticGateway: getVal('wifi-gateway'),
      staticSubnet: getVal('wifi-subnet', '255.255.255.0'),
      staticDns1: getVal('wifi-dns1', '8.8.8.8'),
      staticDns2: getVal('wifi-dns2', '1.1.1.1')
    };

    if (isStatic && !payload.staticIp) {
      alert('Please enter a valid Static IP Address or choose DHCP mode.');
      return;
    }

    btn.disabled = true;
    btn.innerText = 'Connecting...';

    try {
      const res = await this.apiRequest('/api/wifi/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      alert(data.message || 'Connecting to network. Please check status in a few seconds.');
    } catch (e) {
      alert('Error initiating connection');
    } finally {
      btn.disabled = false;
      btn.innerText = 'Connect & Save';
    }
  },

  async saveIpConfigOnly() {
    const ipModeEl = document.getElementById('ip-mode-static');
    const isStatic = ipModeEl ? ipModeEl.checked : false;
    const getVal = (id, def = '') => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : def;
    };

    const payload = {
      useStaticIp: isStatic,
      staticIp: getVal('wifi-static-ip'),
      staticGateway: getVal('wifi-gateway'),
      staticSubnet: getVal('wifi-subnet', '255.255.255.0'),
      staticDns1: getVal('wifi-dns1', '8.8.8.8'),
      staticDns2: getVal('wifi-dns2', '1.1.1.1')
    };

    if (isStatic && !payload.staticIp) {
      alert('Please enter a valid Static IP Address.');
      return;
    }

    const btn = document.getElementById('btn-save-ip-only');
    if (btn) { btn.disabled = true; btn.innerText = 'Applying...'; }

    try {
      const res = await this.apiRequest('/api/wifi/ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      alert(data.message || 'IP configuration updated.');
      this.loadWifiStatus();
      this.loadStatus();
    } catch (e) {
      alert('Failed to update IP configuration');
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = '💾 Apply IP Settings Only'; }
    }
  },

  async resetWifi() {
    if (!confirm('Are you sure you want to clear saved Wi-Fi credentials? The device will start setup AP mode.')) return;
    try {
      await this.apiRequest('/api/wifi/reset', { method: 'POST' });
      alert('Wi-Fi credentials erased. Connect to device setup hotspot at 192.168.4.1.');
    } catch (e) {}
  },

  async syncNtp() {
    try {
      const res = await this.apiRequest('/api/settings/ntp-sync', { method: 'POST' });
      const data = await res.json();
      if (data.formattedTime) {
        alert(`NTP Time Synchronized!\nCurrent Time: ${data.formattedTime}`);
      } else {
        alert(data.message || 'NTP sync requested.');
      }
      this.loadStatus();
    } catch (e) {
      alert('Failed to synchronize NTP time. Check Wi-Fi router internet connection.');
    }
  },

  togglePassVisibility(id) {
    const el = document.getElementById(id);
    if (el) el.type = (el.type === 'password') ? 'text' : 'password';
  },

  // ==== SETTINGS ====
  async loadSettings() {
    this.loadReceiverSettings();
    try {
      const res = await this.apiRequest('/api/settings');
      if (res.ok) {
        const data = await res.json();
        document.getElementById('settings-device-name').value = data.deviceName || '';
        document.getElementById('settings-ap-ssid').value = data.apSsid || '';
        document.getElementById('settings-ap-pass').value = data.apPass || '';
        document.getElementById('settings-tz').value = data.timezoneOffset || '0';
      }
    } catch (e) {}
  },

  async saveSettings() {
    const payload = {
      deviceName: document.getElementById('settings-device-name').value.trim(),
      apSsid: document.getElementById('settings-ap-ssid').value.trim(),
      apPass: document.getElementById('settings-ap-pass').value,
      timezoneOffset: parseInt(document.getElementById('settings-tz').value)
    };

    try {
      const res = await this.apiRequest('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      alert(data.message || 'Settings saved successfully');
      this.loadStatus();
    } catch (e) {
      alert('Error saving settings');
    }
  },

  // ==== CENTRAL RECEIVER & MULTI-NODE TELEMETRY ====
  handleReceiverToggle(enabled) {
    const badge = document.getElementById('receiver-status-badge');
    if (badge) {
      badge.className = enabled ? 'badge badge-success' : 'badge badge-secondary';
      badge.innerText = enabled ? 'Active' : 'Disabled';
    }
  },

  handleReceiverProtoChange(proto) {
    const isHttp = parseInt(proto) === 0;
    const pathGroup = document.getElementById('recv-http-path-group');
    if (pathGroup) {
      pathGroup.style.display = isHttp ? 'block' : 'none';
    }
  },

  generateNodeId() {
    const macEl = document.getElementById('diag-mac');
    const mac = (macEl && macEl.innerText && macEl.innerText !== 'N/A') ? macEl.innerText.replace(/:/g, '') : '';
    const input = document.getElementById('recv-node-id');
    if (input) {
      input.value = mac ? 'NODE-' + mac : 'NODE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    }
  },

  async loadReceiverSettings() {
    try {
      const res = await this.apiRequest('/api/receiver');
      if (res.ok) {
        const d = await res.json();
        const enabledCheck = document.getElementById('recv-enabled');
        if (enabledCheck) enabledCheck.checked = !!d.enabled;
        this.handleReceiverToggle(d.enabled);

        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.value = val;
        };
        const setTxt = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.innerText = val;
        };

        setVal('recv-node-id', d.nodeId || '');
        setVal('recv-node-name', d.nodeName || '');
        setVal('recv-server-host', d.serverHost || '192.168.1.10');
        setVal('recv-server-port', d.serverPort || 2000);
        setVal('recv-http-path', d.httpPath || '/api/node/telemetry');
        setVal('recv-auth-token', d.authToken || '');
        setVal('recv-interval', d.reportIntervalSec || 10);

        const changeCheck = document.getElementById('recv-state-change');
        if (changeCheck) changeCheck.checked = (d.sendOnStateChange !== false);

        const proto = d.protocol || 0;
        const protoRadio = document.querySelector(`input[name="recv-proto"][value="${proto}"]`);
        if (protoRadio) protoRadio.checked = true;
        this.handleReceiverProtoChange(proto);

        // Diagnostics
        setTxt('recv-diag-target', d.serverEndpoint || '-');
        setTxt('recv-diag-status', d.lastSyncStatus || 'Not configured');
        setTxt('recv-diag-time', d.lastSyncTimestamp || 'Never');
        setTxt('recv-diag-sent', d.packetsSent || 0);
        setTxt('recv-diag-failed', d.packetsFailed || 0);
        setTxt('recv-diag-response', d.lastServerResponse || 'None');
      }
    } catch (e) {}
  },

  async saveReceiverSettings() {
    const protoRadio = document.querySelector('input[name="recv-proto"]:checked');
    const protoVal = protoRadio ? parseInt(protoRadio.value) : 0;
    const getVal = (id, def = '') => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : def;
    };

    const host = getVal('recv-server-host');
    if (!host) {
      alert('Please enter a valid Receiver Server Host or IP address');
      return;
    }

    const enabledEl = document.getElementById('recv-enabled');
    const changeEl = document.getElementById('recv-state-change');

    const payload = {
      enabled: enabledEl ? enabledEl.checked : false,
      serverHost: host,
      serverPort: parseInt(getVal('recv-server-port', '2000')) || 2000,
      protocol: protoVal,
      httpPath: getVal('recv-http-path', '/api/node/telemetry'),
      reportIntervalSec: parseInt(getVal('recv-interval', '10')) || 10,
      sendOnStateChange: changeEl ? changeEl.checked : true,
      nodeId: getVal('recv-node-id'),
      nodeName: getVal('recv-node-name'),
      authToken: getVal('recv-auth-token')
    };

    try {
      const res = await this.apiRequest('/api/receiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      alert(data.message || 'Receiver configuration saved successfully');
      this.loadReceiverSettings();
    } catch (e) {
      alert('Failed to save receiver server settings');
    }
  },

  async testReceiverConnection() {
    const btn = document.getElementById('btn-test-receiver');
    if (btn) { btn.disabled = true; btn.innerText = 'Testing...'; }

    try {
      const res = await this.apiRequest('/api/receiver/test', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Connection Successful!\n${data.message}\nServer Response: ${data.response || 'ACK'}`);
      } else {
        alert(`❌ Connection Test Failed!\n${data.message}`);
      }
      this.loadReceiverSettings();
    } catch (e) {
      alert('Error testing connection to receiver server. Make sure central server is listening.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = '⚡ Test Connection Now'; }
    }
  },

  async pushTelemetryNow() {
    const btn = document.getElementById('btn-push-receiver');
    if (btn) { btn.disabled = true; btn.innerText = 'Pushing...'; }

    try {
      const res = await this.apiRequest('/api/receiver/push', { method: 'POST' });
      const data = await res.json();
      alert(data.message || (data.success ? 'Telemetry pushed successfully' : 'Push failed'));
      this.loadReceiverSettings();
    } catch (e) {
      alert('Error pushing telemetry');
    } finally {
      if (btn) { btn.disabled = false; btn.innerText = '📤 Push Telemetry Now'; }
    }
  },

  async reboot() {
    if (!confirm('Reboot SmartHome Controller now?')) return;
    try {
      await this.apiRequest('/api/system/reboot', { method: 'POST' });
      alert('Device is rebooting. Please wait 10 seconds and reload page.');
    } catch (e) {}
  },

  async factoryReset() {
    const confirmation = prompt('WARNING: This will wipe all Wi-Fi settings, GPIO channels, and rules!\nType "RESET" to confirm:');
    if (confirmation !== 'RESET') return;

    try {
      await this.apiRequest('/api/system/factory-reset', { method: 'POST' });
      alert('Factory reset complete. The device is restarting in setup AP mode.');
      window.location.reload();
    } catch (e) {}
  },

  // ==== ACCOUNT PASSWORD ====
  async changePassword() {
    const currPass = document.getElementById('curr-pass').value;
    const newPass = document.getElementById('new-pass').value;
    const confPass = document.getElementById('confirm-pass').value;

    if (newPass !== confPass) {
      alert('New passwords do not match');
      return;
    }

    try {
      const res = await this.apiRequest('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currPass, newPassword: newPass })
      });
      const data = await res.json();
      if (data.success) {
        alert('Password changed successfully! Please log in again.');
        this.logout();
      } else {
        alert(data.error || 'Failed to change password');
      }
    } catch (e) {
      alert('Error updating password');
    }
  },

  // ==== BACKUP & RESTORE ====
  downloadSettingsBackup() {
    const url = this.token ? `/api/backup/download?token=${encodeURIComponent(this.token)}` : '/api/backup/download';
    window.location.href = url;
  },

  downloadFirmwareBackup() {
    const url = this.token ? `/api/firmware/download?token=${encodeURIComponent(this.token)}` : '/api/firmware/download';
    window.location.href = url;
  },

  async restoreSettingsBackup() {
    const fileInput = document.getElementById('backup-restore-file');
    const file = fileInput ? fileInput.files[0] : null;
    const statusMsg = document.getElementById('restore-status-msg');
    if (!file) {
      alert('Please select a .json configuration backup file');
      return;
    }

    if (!confirm('⚠️ Restoring settings will overwrite existing device configurations and restart the controller. Continue?')) {
      return;
    }

    if (statusMsg) statusMsg.innerHTML = 'Reading and validating backup file...';

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const jsonText = e.target.result;
        const parsed = JSON.parse(jsonText);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON structure');
        }

        if (statusMsg) statusMsg.innerHTML = 'Uploading backup to device...';

        const res = await this.apiRequest('/api/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: jsonText
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (statusMsg) statusMsg.innerHTML = '<span style="color:var(--success);">✅ Configuration restored successfully! Controller is rebooting now...</span>';
          alert('Configuration restored successfully! Controller is restarting. Page will reload in 15 seconds.');
          setTimeout(() => {
            window.location.reload();
          }, 15000);
        } else {
          if (statusMsg) statusMsg.innerHTML = '<span style="color:var(--danger);">❌ ' + (data.error || 'Restore failed') + '</span>';
          alert('Restore failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        if (statusMsg) statusMsg.innerHTML = '<span style="color:var(--danger);">❌ Error: ' + err.message + '</span>';
        alert('Failed to process backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
  },

  // ==== FILE PRE-VALIDATION ====
  validateFirmwareFile(input) {
    const file = input.files[0];
    const info = document.getElementById('ota-fw-file-info');
    const submitBtn = document.getElementById('ota-fw-submit-btn');
    if (!file) {
      if (info) info.innerHTML = '';
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      if (buffer.byteLength < 4) {
        if (info) info.innerHTML = '<span style="color:var(--danger);">❌ File is too small to be a valid firmware binary</span>';
        if (submitBtn) submitBtn.disabled = true;
        return;
      }
      const bytes = new Uint8Array(buffer);
      const magic = bytes[0];
      const sizeKb = Math.round(file.size / 1024);

      if (magic === 0xE9) {
        if (info) info.innerHTML = `<span style="color:var(--success);">✅ Valid ESP8266 Firmware Binary (Magic byte: 0xE9 confirmed, Size: ${sizeKb} KB)</span>`;
        if (submitBtn) submitBtn.disabled = false;
      } else {
        if (info) info.innerHTML = `<span style="color:var(--danger); font-weight: bold;">⚠️ REJECTED: Header magic byte is 0x${magic.toString(16).toUpperCase()} (Expected 0xE9). This is NOT an ESP8266 firmware binary! If this is a filesystem image, please use the Filesystem upload form below.</span>`;
        if (submitBtn) submitBtn.disabled = true;
      }
    };
    reader.readAsArrayBuffer(file.slice(0, 16));
  },

  validateFilesystemFile(input) {
    const file = input.files[0];
    const info = document.getElementById('ota-fs-file-info');
    const submitBtn = document.getElementById('ota-fs-submit-btn');
    if (!file) {
      if (info) info.innerHTML = '';
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      if (buffer.byteLength < 4) {
        if (info) info.innerHTML = '<span style="color:var(--danger);">❌ File is too small to be a valid LittleFS image</span>';
        if (submitBtn) submitBtn.disabled = true;
        return;
      }
      const bytes = new Uint8Array(buffer);
      const magic = bytes[0];
      const sizeKb = Math.round(file.size / 1024);

      if (magic === 0xE9) {
        if (info) info.innerHTML = `<span style="color:var(--danger); font-weight: bold;">⚠️ REJECTED: This file starts with ESP8266 firmware header (0xE9)! Flashing a firmware binary into the LittleFS filesystem partition will corrupt the file storage. Please use the Application Firmware form above.</span>`;
        if (submitBtn) submitBtn.disabled = true;
      } else {
        if (info) info.innerHTML = `<span style="color:var(--success);">✅ Valid Filesystem Binary Image (Magic byte: 0x${magic.toString(16).toUpperCase()}, Size: ${sizeKb} KB)</span>`;
        if (submitBtn) submitBtn.disabled = false;
      }
    };
    reader.readAsArrayBuffer(file.slice(0, 16));
  },

  // ==== OTA DUAL-TARGET UPLOAD ====
  uploadOta(targetType = 'firmware') {
    const isFs = targetType === 'fs';
    const inputId = isFs ? 'ota-fs-file' : 'ota-fw-file';
    const progContainerId = isFs ? 'ota-fs-progress-container' : 'ota-fw-progress-container';
    const progBarId = isFs ? 'ota-fs-progress-bar' : 'ota-fw-progress-bar';
    const statusMsgId = isFs ? 'ota-fs-status-msg' : 'ota-fw-status-msg';
    const submitBtnId = isFs ? 'ota-fs-submit-btn' : 'ota-fw-submit-btn';

    const fileInput = document.getElementById(inputId) || document.getElementById('ota-file-input');
    const file = fileInput ? fileInput.files[0] : null;
    if (!file) {
      alert(`Please select a ${isFs ? 'LittleFS filesystem' : 'firmware'} .bin file`);
      return;
    }

    if (!file.name.endsWith('.bin')) {
      alert('Invalid file format. File must end with .bin');
      return;
    }

    const progressContainer = document.getElementById(progContainerId) || document.getElementById('ota-progress-container');
    const progressBar = document.getElementById(progBarId) || document.getElementById('ota-progress-bar');
    const statusMsg = document.getElementById(statusMsgId) || document.getElementById('ota-status-msg');
    const submitBtn = document.getElementById(submitBtnId) || document.getElementById('ota-submit-btn');

    if (progressContainer) progressContainer.classList.remove('hidden');
    if (submitBtn) submitBtn.disabled = true;
    if (statusMsg) statusMsg.innerText = `Uploading ${isFs ? 'LittleFS filesystem' : 'application firmware'} binary...`;

    const formData = new FormData();
    formData.append(isFs ? 'filesystem' : 'firmware', file);

    const xhr = new XMLHttpRequest();
    const endpoint = `/api/ota/upload?type=${isFs ? 'fs' : 'firmware'}`;
    xhr.open('POST', endpoint, true);
    if (this.token) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + this.token);
      xhr.setRequestHeader('X-Session-Token', this.token);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && progressBar) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = pct + '%';
        progressBar.innerText = pct + '%';
      }
    };

    xhr.onload = () => {
      if (submitBtn) submitBtn.disabled = false;
      if (xhr.status === 200) {
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.innerText = '100%';
        }
        if (statusMsg) {
          statusMsg.innerText = `✅ ${isFs ? 'Filesystem' : 'Firmware'} flashed successfully! Controller is rebooting now. Reconnecting in 15 seconds...`;
        }
        setTimeout(() => {
          window.location.reload();
        }, 15000);
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          if (statusMsg) statusMsg.innerText = '❌ Update failed: ' + (res.error || 'Upload error');
        } catch (e) {
          if (statusMsg) statusMsg.innerText = '❌ Update failed with HTTP ' + xhr.status;
        }
      }
    };

    xhr.onerror = () => {
      if (submitBtn) submitBtn.disabled = false;
      if (statusMsg) statusMsg.innerText = `❌ Network error during ${isFs ? 'filesystem' : 'firmware'} upload`;
    };

    xhr.send(formData);
  },

  // ==== LOGS ====
  async loadLogs() {
    const terminal = document.getElementById('log-terminal');
    try {
      const res = await this.apiRequest('/api/logs');
      if (res.ok) {
        const logs = await res.json();
        if (logs.length === 0) {
          terminal.innerText = 'No logs recorded yet.';
          return;
        }
        let txt = '';
        logs.forEach(l => {
          const sec = Math.floor(l.uptimeMs / 1000);
          txt += `[${sec}s] ${l.msg}\n`;
        });
        terminal.innerText = txt;
        terminal.scrollTop = terminal.scrollHeight;
      }
    } catch (e) {
      terminal.innerText = 'Failed to load system logs.';
    }
  },

  closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  },

  // ==== I2C EXPANDER & DUAL-AUTH PAIRING ====
  i2cConfig: { enabled: false, sdaPin: 4, sclPin: 5, address: 32, addressHex: '0x20', detected: false, detectedAddress: 32 },

  async loadI2cSettings() {
    try {
      const res = await this.apiRequest('/api/i2c');
      if (res.ok) {
        this.i2cConfig = await res.json();
        this.renderI2cSettings();
      }
    } catch (e) {
      console.warn('[I2C] Failed to load I2C settings:', e);
    }
  },

  renderI2cSettings() {
    const c = this.i2cConfig;
    const badge = document.getElementById('i2c-status-badge');
    const enabledCb = document.getElementById('i2c-enabled');
    const fields = document.getElementById('i2c-options-fields');
    const sdaSel = document.getElementById('i2c-sda-select');
    const sclSel = document.getElementById('i2c-scl-select');
    const addrInp = document.getElementById('i2c-addr-input');

    if (enabledCb) enabledCb.checked = !!c.enabled;
    if (fields) fields.style.display = c.enabled ? 'block' : 'none';
    if (sdaSel) sdaSel.value = String(c.sdaPin || 4);
    if (sclSel) sclSel.value = String(c.sclPin || 5);
    if (addrInp) {
      if (c.detectedAddress) {
        addrInp.value = '0x' + c.detectedAddress.toString(16).toUpperCase();
      } else {
        addrInp.value = c.addressHex || '0x20';
      }
    }

    if (badge) {
      if (c.enabled) {
        if (c.detected) {
          const hex = c.detectedAddress ? ('0x' + c.detectedAddress.toString(16).toUpperCase()) : (c.addressHex || '0x20');
          badge.className = 'badge badge-success';
          badge.innerText = `Active @ ${hex} (PCF8574 Detected)`;
        } else {
          badge.className = 'badge badge-warning';
          badge.innerText = 'I2C Bus Enabled (Expander not detected)';
        }
      } else {
        badge.className = 'badge badge-secondary';
        badge.innerText = 'Disabled';
      }
    }
  },

  onI2cToggle(enabled) {
    const fields = document.getElementById('i2c-options-fields');
    if (fields) fields.style.display = enabled ? 'block' : 'none';
  },

  toggleI2cPanel() {
    const body = document.getElementById('i2c-panel-body');
    if (body) {
      body.style.display = (body.style.display === 'none') ? 'block' : 'none';
    }
  },

  async saveI2cSettings(reboot = false) {
    const enabled = document.getElementById('i2c-enabled').checked;
    const sdaPin = parseInt(document.getElementById('i2c-sda-select').value);
    const sclPin = parseInt(document.getElementById('i2c-scl-select').value);
    let addrStr = document.getElementById('i2c-addr-input').value.trim();
    let addr = 32;
    if (addrStr.startsWith('0x') || addrStr.startsWith('0X')) {
      addr = parseInt(addrStr, 16);
    } else {
      addr = parseInt(addrStr, 10);
    }
    if (isNaN(addr) || addr < 1 || addr > 127) addr = 32;

    try {
      const res = await this.apiRequest('/api/i2c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, sdaPin, sclPin, address: addr, reboot })
      });
      const data = await res.json();
      if (data.success) {
        const msg = data.message || (enabled ? 'I2C Expander ENABLED! Pins P0-P7 are active.' : 'I2C Expander DISABLED. Pins D1 & D2 are now free for regular relays.');
        alert(reboot ? (msg + ' Device restarting...') : msg);
        if (!reboot) {
          await this.loadI2cSettings();
          await this.loadGpios();
        }
      } else {
        alert(data.error || 'Failed to save I2C settings');
      }
    } catch (e) {
      alert('Error saving I2C settings: ' + e.message);
    }
  },

  async populatePcfChannels() {
    if (!confirm('Populate all 8 PCF8574 relay channels (P0-P7 / Pins 100-107)?')) return;
    try {
      const res = await this.apiRequest('/api/i2c/auto-channels', { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'PCF8574 channels processed!');
      await this.loadGpios();
    } catch (e) {
      alert('Error populating channels: ' + e.message);
    }
  },

  async scanI2cBus() {
    const sdaPin = parseInt(document.getElementById('i2c-sda-select').value);
    const sclPin = parseInt(document.getElementById('i2c-scl-select').value);
    const resultEl = document.getElementById('i2c-scan-result');
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.innerHTML = '<em>Scanning I2C bus on SDA=' + sdaPin + ', SCL=' + sclPin + '...</em>';
    }

    try {
      const res = await this.apiRequest(`/api/i2c/scan?sda=${sdaPin}&scl=${sclPin}`);
      if (res.ok) {
        const data = await res.json();
        if (data.devices && data.devices.length > 0) {
          let html = `<strong>Found ${data.devices.length} I2C Device(s):</strong><ul style="margin: 6px 0 0 18px; padding: 0;">`;
          data.devices.forEach(d => {
            html += `<li><strong>${d.hex}</strong> (${d.type})</li>`;
            if (d.type && d.type.includes('PCF8574')) {
              const addrInp = document.getElementById('i2c-addr-input');
              if (addrInp) addrInp.value = d.hex;
            }
          });
          html += '</ul>';
          resultEl.innerHTML = html;
          await this.loadI2cSettings();
        } else {
          resultEl.innerHTML = '<span class="text-warning">⚠️ No I2C devices responded on this bus. Check wiring (SDA/SCL) and pull-up resistors.</span>';
        }
      } else {
        resultEl.innerHTML = '<span class="text-danger">Scan error from device.</span>';
      }
    } catch (e) {
      if (resultEl) resultEl.innerHTML = '<span class="text-danger">Failed to scan I2C bus: ' + e.message + '</span>';
    }
  },

  async loadPairingStatus() {
    try {
      const res = await this.apiRequest('/api/auth/pair');
      if (res.ok) {
        const data = await res.json();
        const badge = document.getElementById('pairing-status-badge');
        const unpairBtn = document.getElementById('unpair-server-btn');
        if (badge) {
          if (data.paired) {
            badge.className = 'badge badge-success';
            badge.innerText = 'Paired (Dual-Auth Active)';
          } else {
            badge.className = 'badge badge-secondary';
            badge.innerText = 'Unpaired';
          }
        }
        if (unpairBtn) {
          unpairBtn.style.display = data.paired ? 'inline-block' : 'none';
        }
      }
    } catch (e) {
      console.warn('[Pairing] Status check failed:', e);
    }
  },

  async submitServerPairing() {
    const key = document.getElementById('server-pair-key').value.trim();
    if (!key || key.length < 6) {
      alert('Server pairing key must be at least 6 characters');
      return;
    }

    const payload = { serverKey: key };
    const adminPassInput = document.getElementById('pair-admin-pass');
    if (adminPassInput && adminPassInput.value) {
      payload.adminPassword = adminPassInput.value;
    }

    try {
      const res = await this.apiRequest('/api/auth/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('Node successfully paired to Central Server! Server key is now active for login.');
        document.getElementById('server-pair-key').value = '';
        if (adminPassInput) adminPassInput.value = '';
        await this.loadPairingStatus();
      } else {
        alert(data.error || 'Failed to pair server key');
      }
    } catch (e) {
      alert('Error pairing server key: ' + e.message);
    }
  },

  async unpairServerKey() {
    if (!confirm('Are you sure you want to unpair this node from the Central Server? The server pairing key will be invalidated.')) {
      return;
    }

    try {
      const res = await this.apiRequest('/api/auth/unpair', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        alert('Node successfully unpaired.');
        await this.loadPairingStatus();
      } else {
        alert(data.error || 'Failed to unpair');
      }
    } catch (e) {
      alert('Error unpairing: ' + e.message);
    }
  },

  // ==== INFRARED (IR) REMOTE LEARNING & TRANSMISSION ====
  async loadIrRemotes() {
    try {
      const res = await this.apiRequest('/api/ir/remotes');
      if (res.ok) {
        const data = await res.json();
        this.savedRemotes = data.remotes || [];
      }
    } catch (e) {
      console.error('Error loading IR remotes:', e);
    }
  },

  getTotalSavedButtons() {
    if (!this.savedRemotes) return 0;
    return this.savedRemotes.reduce((sum, r) => sum + (r.buttons ? r.buttons.length : 0), 0);
  },

  openIrTrainModal() {
    const modal = document.getElementById('ir-train-modal');
    if (!modal) return;
    document.getElementById('ir-captured-section').classList.add('hidden');
    document.getElementById('ir-save-btn').classList.add('hidden');
    document.getElementById('ir-start-listen-btn').classList.remove('hidden');
    document.getElementById('ir-train-status-text').innerText = '📡 Ready to Learn';
    document.getElementById('ir-train-status-text').style.color = '#0ea5e9';
    document.getElementById('ir-train-hint').innerText = 'Click "Start Listening", then point your physical remote at the IR sensor (Pin D5) and press any button.';
    document.getElementById('ir-train-timer').style.display = 'none';
    this.openModal('ir-train-modal');
  },

  async beginIrTraining() {
    try {
      const res = await this.apiRequest('/api/ir/train/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutSec: 25 })
      });
      if (!res.ok) throw new Error('Failed to start training');

      document.getElementById('ir-start-listen-btn').classList.add('hidden');
      document.getElementById('ir-train-status-text').innerText = '🎯 Listening for Signal...';
      document.getElementById('ir-train-status-text').style.color = '#f59e0b';
      document.getElementById('ir-train-hint').innerText = 'Point remote at the sensor and press any button!';
      const timerElem = document.getElementById('ir-train-timer');
      timerElem.style.display = 'block';

      this.irTimeRemaining = 25;
      timerElem.innerText = `${this.irTimeRemaining}s`;

      if (this.irCountdownTimer) clearInterval(this.irCountdownTimer);
      if (this.irPollInterval) clearInterval(this.irPollInterval);

      this.irCountdownTimer = setInterval(() => {
        this.irTimeRemaining--;
        timerElem.innerText = `${this.irTimeRemaining}s`;
        if (this.irTimeRemaining <= 0) {
          this.stopIrTraining();
          document.getElementById('ir-train-status-text').innerText = '⏰ Timed Out';
          document.getElementById('ir-train-status-text').style.color = '#ef4444';
          document.getElementById('ir-train-hint').innerText = 'No signal was detected within 25 seconds. Try again closer to the sensor.';
          document.getElementById('ir-start-listen-btn').classList.remove('hidden');
          timerElem.style.display = 'none';
        }
      }, 1000);

      this.irPollInterval = setInterval(async () => {
        try {
          const pollRes = await this.apiRequest('/api/ir/train/result');
          if (pollRes.ok) {
            const result = await pollRes.json();
            if (result.captured) {
              this.stopIrTraining();
              timerElem.style.display = 'none';
              document.getElementById('ir-train-status-text').innerText = '✅ Code Captured Successfully!';
              document.getElementById('ir-train-status-text').style.color = '#10b981';
              document.getElementById('ir-train-hint').innerText = 'Give this button a name to store it in LittleFS:';

              document.getElementById('ir-captured-proto').innerText = result.protocol;
              document.getElementById('ir-captured-hex').innerText = result.hexCode;
              document.getElementById('ir-captured-bits').innerText = result.bits;
              document.getElementById('ir-captured-section').classList.remove('hidden');

              document.getElementById('ir-train-proto').value = result.protocol;
              document.getElementById('ir-train-hex').value = result.hexCode;
              document.getElementById('ir-train-bits').value = result.bits;

              document.getElementById('ir-save-btn').classList.remove('hidden');
            }
          }
        } catch (err) {
          console.error(err);
        }
      }, 700);
    } catch (e) {
      alert('Error starting IR training: ' + e.message);
    }
  },

  stopIrTraining() {
    if (this.irCountdownTimer) {
      clearInterval(this.irCountdownTimer);
      this.irCountdownTimer = null;
    }
    if (this.irPollInterval) {
      clearInterval(this.irPollInterval);
      this.irPollInterval = null;
    }
    this.apiRequest('/api/ir/train/stop', { method: 'POST' }).catch(() => {});
  },

  async saveTrainedKey() {
    const remoteName = document.getElementById('ir-remote-name').value.trim();
    const buttonName = document.getElementById('ir-button-name').value.trim();
    const protocol = document.getElementById('ir-train-proto').value || 'NEC';
    const hexCode = document.getElementById('ir-train-hex').value;
    const bits = parseInt(document.getElementById('ir-train-bits').value) || 32;

    if (!remoteName || !buttonName || !hexCode) {
      alert('Please enter both Remote Name and Button Name.');
      return;
    }

    try {
      const res = await this.apiRequest('/api/ir/remotes/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteName, buttonName, protocol, hexCode, bits })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Saved "${buttonName}" for remote "${remoteName}"!`);
        this.closeModal('ir-train-modal');
        await this.loadIrRemotes();
        this.renderGpios();
      } else {
        alert(data.error || 'Failed to save button');
      }
    } catch (e) {
      alert('Error saving button: ' + e.message);
    }
  },

  openSavedRemotesModal() {
    this.renderSavedRemotesModal();
    this.openModal('ir-remotes-modal');
  },

  renderSavedRemotesModal() {
    const container = document.getElementById('ir-remotes-list');
    if (!container) return;

    if (!this.savedRemotes || this.savedRemotes.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
          <p style="font-size: 1rem; margin-bottom: 8px;">No remote controls learned yet.</p>
          <p style="font-size: 0.85rem;">Click "Train / Learn Key" on your IR Receiver card to add your first remote button!</p>
        </div>
      `;
      return;
    }

    let html = '';
    this.savedRemotes.forEach(rem => {
      html += `
        <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="margin: 0; color: #38bdf8;">📺 ${rem.name}</h4>
            <button class="btn btn-danger btn-sm" style="font-size: 0.75rem; padding: 2px 8px;" onclick="app.deleteRemote('${rem.name}')">Delete Remote</button>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;">
      `;

      if (rem.buttons && rem.buttons.length > 0) {
        rem.buttons.forEach(btn => {
          html += `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 8px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; font-size: 0.85rem;">${btn.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${btn.protocol} ${btn.hexCode}</div>
              </div>
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-success btn-sm" style="font-size: 0.75rem; padding: 3px 7px;" title="Blast IR Signal" onclick="app.blastSavedKey('${rem.name}', '${btn.name}')">🚀</button>
                <button class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 3px 7px;" title="Delete Key" onclick="app.deleteIrButton('${rem.name}', '${btn.name}')">🗑️</button>
              </div>
            </div>
          `;
        });
      } else {
        html += `<div style="font-size: 0.8rem; color: var(--text-muted);">No buttons in this remote.</div>`;
      }

      html += `</div></div>`;
    });

    container.innerHTML = html;
  },

  async deleteIrButton(remoteName, buttonName) {
    if (!confirm(`Delete key "${buttonName}" from remote "${remoteName}"?`)) return;
    try {
      const res = await this.apiRequest('/api/ir/remotes/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteName, buttonName })
      });
      if (res.ok) {
        await this.loadIrRemotes();
        this.renderSavedRemotesModal();
        this.renderGpios();
      }
    } catch (e) {
      alert('Error deleting key: ' + e.message);
    }
  },

  async deleteRemote(remoteName) {
    if (!confirm(`Delete entire remote "${remoteName}" and all its buttons?`)) return;
    try {
      const res = await this.apiRequest('/api/ir/remotes/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteName })
      });
      if (res.ok) {
        await this.loadIrRemotes();
        this.renderSavedRemotesModal();
        this.renderGpios();
      }
    } catch (e) {
      alert('Error deleting remote: ' + e.message);
    }
  },

  async blastSavedKey(remoteName, buttonName) {
    try {
      const res = await this.apiRequest('/api/ir/transmit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteName, buttonName })
      });
      const data = await res.json();
      if (data.success) {
        console.log(`[IR] Blasted: ${remoteName} -> ${buttonName}`);
        this.showToast(`🚀 IR Signal Blasted: <strong>${remoteName}</strong> &bull; ${buttonName}!`);
      } else {
        alert(data.error || 'Failed to blast IR signal');
      }
    } catch (e) {
      alert('Error blasting IR signal: ' + e.message);
    }
  },

  async blastManualKey(pin, channelId) {
    const protoElem = document.getElementById(`ir-tx-proto-${channelId}`);
    const hexElem = document.getElementById(`ir-tx-hex-${channelId}`);
    const protocol = protoElem ? protoElem.value : 'NEC';
    const hexCode = hexElem ? hexElem.value.trim() : '';

    if (!hexCode) {
      alert('Please enter a Hex Code (e.g. 0xE0E040BF).');
      return;
    }

    try {
      const res = await this.apiRequest('/api/ir/transmit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, protocol, hexCode, bits: 32 })
      });
      const data = await res.json();
      if (data.success) {
        alert(`🚀 IR Signal Blasted on Pin ${pin}: ${protocol} ${hexCode}`);
      } else {
        alert(data.error || 'Failed to blast signal');
      }
    } catch (e) {
      alert('Error transmitting signal: ' + e.message);
    }
  },
};

document.addEventListener('DOMContentLoaded', () => app.init());
