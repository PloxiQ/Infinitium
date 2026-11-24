(function () {
  'use strict';

  const { $, debounce } = window.UI;

  class SettingsView {
    constructor(api, state, actions) {
      this.api = api;
      this.state = state;
      this.actions = actions;
      this.info = null;
    }

    init() {
      this.accentEl = $('#accent-swatches');
      this.fontInput = $('#font-size');
      this.fontOut = $('#font-size-out');
      this.cursorSelect = $('#cursor-style');
      this.reduceMotion = $('#reduce-motion');
      this.shellSelect = $('#shell-select');
      this.startView = $('#start-view');
      this.fontName = $('#font-name');

      this.saveFontSize = debounce((value) => {
        this.actions.updateSettings({ fontSize: value });
      }, 180);

      this.accentEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-accent]');
        if (button) this.actions.updateSettings({ accent: button.dataset.accent });
      });

      this.fontInput.addEventListener('input', () => {
        const value = Number(this.fontInput.value);
        this.fontOut.textContent = String(value);
        this.actions.previewFontSize(value);
        this.saveFontSize(value);
      });

      this.cursorSelect.addEventListener('change', () => {
        this.actions.updateSettings({ cursorStyle: this.cursorSelect.value });
      });

      this.reduceMotion.addEventListener('change', () => {
        this.actions.updateSettings({ reduceMotion: this.reduceMotion.checked });
      });

      this.shellSelect.addEventListener('change', () => {
        const value = this.shellSelect.value;
        this.actions.updateSettings({ shell: value }).then(() => {
          const labels = { powershell: 'PowerShell 5.1', cmd: 'Command Prompt', gitbash: 'Git Bash' };
          this.actions.toast(`New tabs will use ${labels[value] || value}.`);
        });
      });

      this.startView.addEventListener('change', () => {
        this.actions.updateSettings({ startView: this.startView.value });
      });

      $('#open-data').addEventListener('click', () => {
        this.api.system.openPath(this.state.info.dataDir);
      });

      $('#reset-stats').addEventListener('click', async () => {
        if (!window.confirm('Reset all statistics? This cannot be undone.')) return;
        const snapshot = await this.api.stats.reset();
        this.actions.onStatsReset(snapshot);
        this.actions.toast('Statistics reset.');
      });

      $('#reset-settings').addEventListener('click', async () => {
        if (!window.confirm('Reset all settings to their defaults?')) return;
        const settings = await this.api.settings.reset();
        this.actions.onSettingsReset(settings);
        this.actions.toast('Settings reset to defaults.');
      });
    }

    setInfo(info) {
      this.info = info;
      $('#data-path').textContent = info.dataDir;
      $('#about-version').textContent = `v${info.versions.app}`;
      $('#about-runtime').textContent = `Electron ${info.versions.electron}`;
      $('#about-node').textContent = info.versions.node;
      $('#about-chrome').textContent = info.versions.chrome;
      $('#rail-version').textContent = `v${info.versions.app}`;

      const gitOption = this.shellSelect.querySelector('option[value="gitbash"]');
      if (gitOption) {
        gitOption.disabled = !info.gitBash;
        gitOption.textContent = info.gitBash ? 'Git Bash' : 'Git Bash (not installed)';
      }
    }

    sync(settings) {
      this.accentEl.querySelectorAll('[data-accent]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.accent === settings.accent);
      });

      this.fontInput.value = String(settings.fontSize);
      this.fontOut.textContent = String(settings.fontSize);
      this.cursorSelect.value = settings.cursorStyle || 'bar';
      this.reduceMotion.checked = !!settings.reduceMotion;
      this.shellSelect.value = settings.shell || 'powershell';
      this.startView.value = settings.startView || 'terminal';
      if (this.fontName) this.fontName.textContent = settings.fontFamily;
    }
  }

  window.SettingsView = SettingsView;
})();
