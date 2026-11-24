(function () {
  'use strict';

  const { $, $$, fmtBytes, fmtDuration, dayKey } = window.UI;

  class Dashboard {
    constructor(api, state, actions) {
      this.api = api;
      this.state = state;
      this.actions = actions;
      this.clockTimer = null;
      this.info = null;
    }

    init() {
      this.dateEl = $('#dash-date');
      this.greetEl = $('#dash-greeting');
      this.clockEl = $('#dash-clock');

      this.updateClock();
      this.clockTimer = setInterval(() => this.updateClock(), 1000);

      $$('[data-quick]').forEach((button) => {
        button.addEventListener('click', () => this.runQuick(button.dataset.quick));
      });
    }

    updateClock() {
      const now = new Date();
      if (this.clockEl) {
        this.clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (this.dateEl) {
        this.dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      }
      if (this.greetEl) {
        const hour = now.getHours();
        let greeting = 'Good evening';
        if (hour < 5) greeting = 'Working late';
        else if (hour < 12) greeting = 'Good morning';
        else if (hour < 18) greeting = 'Good afternoon';
        this.greetEl.textContent = greeting;
      }
    }

    setInfo(info) {
      this.info = info;
      $('#sys-host').textContent = info.hostname;
      $('#sys-os').textContent = info.os;
      $('#sys-cpu').textContent = info.cpuModel;
      $('#sys-ip').textContent = info.ip || 'offline';
      $('#sys-runtime').textContent = `Electron ${info.versions.electron}`;
      $('#sys-cores').textContent = `${info.cores} cores`;
      $('#dash-cpu-chip').textContent = `${info.cores} cores`;

      const vscode = $('#quick-vscode');
      if (vscode) {
        vscode.disabled = !info.vscode;
        vscode.title = info.vscode ? 'Open Visual Studio Code' : 'VS Code was not found';
      }
    }

    shellLabel() {
      const shell = this.state.settings.shell;
      if (shell === 'cmd') return 'Command Prompt';
      if (shell === 'gitbash') return 'Git Bash';
      return 'PowerShell 5.1';
    }

    update(payload) {
      const system = payload.system;
      const stats = payload.stats;
      if (!system) return;

      const cpu = Math.round(system.cpu);
      const cpuEl = $('#dash-cpu');
      if (cpuEl) cpuEl.innerHTML = `${cpu}<span>%</span>`;
      const cpuBar = $('#dash-cpu-bar');
      if (cpuBar) cpuBar.style.width = `${cpu}%`;
      const cpuFoot = $('#dash-cpu-foot');
      if (cpuFoot) {
        cpuFoot.textContent = cpu > 85 ? 'Heavy load' : cpu > 45 ? 'Moderate load' : 'Idle';
      }

      const mem = Math.round(system.mem.pct);
      const memEl = $('#dash-mem');
      if (memEl) memEl.innerHTML = `${mem}<span>%</span>`;
      const memBar = $('#dash-mem-bar');
      if (memBar) memBar.style.width = `${mem}%`;
      const memFoot = $('#dash-mem-foot');
      if (memFoot) memFoot.textContent = `${fmtBytes(system.mem.used)} of ${fmtBytes(system.mem.total)} in use`;
      const memChip = $('#dash-mem-chip');
      if (memChip) memChip.textContent = fmtBytes(system.mem.total);

      if (system.disk) {
        const disk = system.disk;
        const diskEl = $('#dash-disk');
        if (diskEl) diskEl.textContent = fmtBytes(disk.free);
        const diskBar = $('#dash-disk-bar');
        if (diskBar) diskBar.style.width = `${Math.round(disk.pct)}%`;
        const diskFoot = $('#dash-disk-foot');
        if (diskFoot) diskFoot.textContent = `free of ${fmtBytes(disk.total)}`;
        const diskChip = $('#dash-disk-chip');
        if (diskChip) diskChip.textContent = `${disk.letter} drive`;
      }

      const uptime = $('#dash-uptime');
      if (uptime) uptime.textContent = fmtDuration(system.uptime);

      if (!stats) return;
      const today = stats.daily[dayKey()] || { commands: 0 };
      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };

      setText('dash-session-commands', stats.sessionCommands);
      setText('dash-session-time', fmtDuration(stats.sessionSeconds));
      setText('dash-today-commands', today.commands);
      setText('dash-launches', stats.launches);
      setText('sys-shell', this.shellLabel());

      if (stats.firstLaunch) {
        setText('dash-first-launch', `First launch ${new Date(stats.firstLaunch).toLocaleDateString()}`);
      }
    }

    runQuick(action) {
      switch (action) {
        case 'new-tab':
          this.actions.setView('terminal');
          this.actions.newTab();
          break;
        case 'home':
          this.api.system.openPath(this.state.info.home);
          break;
        case 'project':
          this.api.system.openPath(this.state.info.project);
          break;
        case 'vscode':
          if (this.state.info.vscode) this.api.system.openPath(this.state.info.vscode);
          else this.actions.toast('VS Code was not found on this PC.', 'error');
          break;
        case 'palette':
          this.actions.openPalette();
          break;
        default:
          break;
      }
    }

    onShow() {
      this.updateClock();
    }
  }

  window.Dashboard = Dashboard;
})();
