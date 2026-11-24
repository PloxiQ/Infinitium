(function () {
  'use strict';

  const ACCENTS = {
    cyan: '#6ee7f9',
    purple: '#c792ea',
    green: '#5be7a9',
    amber: '#f5d67b'
  };

  const ACCENT_RGB = {
    cyan: '110, 231, 249',
    purple: '199, 146, 234',
    green: '91, 231, 169',
    amber: '245, 214, 123'
  };

  function themeFor(accent) {
    const cursor = ACCENTS[accent] || ACCENTS.cyan;
    const rgb = ACCENT_RGB[accent] || ACCENT_RGB.cyan;
    return {
      background: '#0b1020',
      foreground: '#d7e0f5',
      cursor,
      cursorAccent: '#0b1020',
      selectionBackground: `rgba(${rgb}, 0.25)`,
      selectionForeground: '#ffffff',
      black: '#12182b',
      red: '#ff6b81',
      green: '#5be7a9',
      yellow: '#f5d67b',
      blue: '#6fa8ff',
      magenta: '#c792ea',
      cyan: '#6ee7f9',
      white: '#c9d4ea',
      brightBlack: '#5a6785',
      brightRed: '#ff8fa3',
      brightGreen: '#7df3bc',
      brightYellow: '#ffe9a3',
      brightBlue: '#9cc4ff',
      brightMagenta: '#ddb0f3',
      brightCyan: '#a5f3fc',
      brightWhite: '#f5f9ff'
    };
  }

  class TerminalView {
    constructor(api, state) {
      this.api = api;
      this.state = state;
      this.tabs = [];
      this.byPty = new Map();
      this.active = null;
      this.counter = 0;
      this.host = null;
      this.tabsEl = null;
      this.statusEl = null;
    }

    async init() {
      this.host = document.getElementById('terminal-host');
      this.tabsEl = document.getElementById('tabs');
      this.statusEl = document.getElementById('term-status-text');

      this.api.pty.onData(({ id, data }) => {
        const tab = this.byPty.get(id);
        if (tab) tab.term.write(data);
      });

      this.api.pty.onExit(({ id, exitCode }) => {
        const tab = this.byPty.get(id);
        if (!tab) return;
        this.byPty.delete(id);
        tab.ptyId = null;
        tab.exited = true;
        tab.term.write(`\r\n\x1b[38;2;90;103;133m[process exited${exitCode ? ' ' + exitCode : ''}]\x1b[0m\r\n`);
        this.renderTab(tab);
        setTimeout(() => this.closeTab(tab), 700);
      });

      document.getElementById('tab-new').addEventListener('click', () => this.createTab());

      const onResize = window.UI.debounce(() => this.fitActive(), 50);
      new ResizeObserver(onResize).observe(this.host);
      window.addEventListener('resize', onResize);

      await this.createTab();
    }

    shellLabel() {
      const shell = this.state.settings.shell;
      if (shell === 'cmd') return 'Command Prompt';
      if (shell === 'gitbash') return 'Git Bash';
      return 'PowerShell';
    }

    async createTab() {
      this.counter += 1;
      const settings = this.state.settings;

      const tab = {
        id: `tab-${this.counter}`,
        name: this.shellLabel(),
        term: null,
        fit: null,
        ptyId: null,
        el: null,
        tabEl: null,
        exited: false
      };

      const term = new Terminal({
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        fontWeight: '400',
        fontWeightBold: '600',
        lineHeight: 1.15,
        letterSpacing: 0,
        cursorBlink: true,
        cursorStyle: settings.cursorStyle || 'bar',
        scrollback: 20000,
        allowTransparency: false,
        theme: themeFor(settings.accent)
      });

      const fit = new FitAddon.FitAddon();
      term.loadAddon(fit);

      try {
        term.loadAddon(new WebLinksAddon.WebLinksAddon((event, uri) => {
          event.preventDefault();
          this.api.system.openExternal(uri);
        }));
      } catch (err) {
        /* links are optional */
      }

      const el = document.createElement('div');
      el.className = 'term-instance';
      this.host.appendChild(el);
      tab.el = el;
      tab.term = term;
      tab.fit = fit;

      const tabEl = document.createElement('div');
      tabEl.className = 'tab';
      tabEl.dataset.tabId = tab.id;
      tabEl.setAttribute('role', 'tab');
      tabEl.setAttribute('aria-selected', 'false');
      tabEl.tabIndex = 0;
      tabEl.innerHTML = '<span class="tab-dot"></span><span class="tab-name"></span><button class="tab-close" type="button" title="Close tab" aria-label="Close tab">×</button>';
      tabEl.querySelector('.tab-name').textContent = tab.name;
      tabEl.addEventListener('click', (event) => {
        if (event.target.closest('.tab-close')) return;
        this.activate(tab);
      });
      tabEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.activate(tab);
        }
      });
      tabEl.querySelector('.tab-close').addEventListener('click', (event) => {
        event.stopPropagation();
        this.closeTab(tab);
      });
      tabEl.addEventListener('auxclick', (event) => {
        if (event.button === 1) {
          event.preventDefault();
          this.closeTab(tab);
        }
      });
      tab.tabEl = tabEl;
      this.tabsEl.appendChild(tabEl);

      term.open(el);

      term.onData((data) => {
        if (!tab.ptyId) return;
        this.api.pty.write(tab.ptyId, data);
        if (data.indexOf('\r') !== -1) this.api.stats.command();
      });

      term.attachCustomKeyEventHandler((event) => this.onTermKey(event, tab));

      this.tabs.push(tab);
      this.activate(tab);

      await new Promise((resolve) => requestAnimationFrame(resolve));
      this.fitTab(tab);

      try {
        const result = await this.api.pty.create({ cols: term.cols, rows: term.rows });
        tab.ptyId = result.id;
        tab.name = result.shell || tab.name;
        this.byPty.set(result.id, tab);
        this.renderTab(tab);
      } catch (err) {
        term.write(`\r\n\x1b[38;2;255;107;129mUnable to start shell: ${String((err && err.message) || err)}\x1b[0m\r\n`);
      }

      if (this.isVisible()) term.focus();
      this.updateStatus();
    }

    onTermKey(event, tab) {
      if (event.type !== 'keydown') return true;

      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        if (tab.term.hasSelection()) {
          this.api.clipboard.write(tab.term.getSelection());
          tab.term.clearSelection();
        }
        return false;
      }

      if (event.ctrlKey && event.shiftKey && event.code === 'KeyV') {
        const text = this.api.clipboard.read();
        if (text) tab.term.paste(text);
        return false;
      }

      if (event.ctrlKey && event.shiftKey && event.code === 'KeyA') {
        tab.term.selectAll();
        return false;
      }

      return true;
    }

    activate(tab) {
      if (!tab) return;
      this.active = tab;
      for (const item of this.tabs) {
        const on = item === tab;
        item.el.classList.toggle('is-active', on);
        item.tabEl.classList.toggle('is-active', on);
        item.tabEl.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      requestAnimationFrame(() => {
        this.fitTab(tab);
        if (this.isVisible()) tab.term.focus();
      });
      this.updateStatus();
    }

    isVisible() {
      const view = document.querySelector('[data-view="terminal"]');
      return !!view && view.classList.contains('is-active');
    }

    fitTab(tab) {
      if (!tab || !tab.fit || !tab.el) return;
      if (!tab.el.clientWidth || !tab.el.clientHeight) return;
      try {
        tab.fit.fit();
      } catch (err) {
        return;
      }
      if (tab.ptyId) {
        this.api.pty.resize(tab.ptyId, tab.term.cols, tab.term.rows);
      }
      this.updateStatus();
    }

    fitActive() {
      this.fitTab(this.active);
    }

    updateStatus() {
      if (!this.statusEl) return;
      if (!this.active) {
        this.statusEl.textContent = 'no session';
        return;
      }
      const term = this.active.term;
      this.statusEl.textContent = `${this.active.name} · ${term.cols} × ${term.rows}`;
    }

    renderTab(tab) {
      if (!tab || !tab.tabEl) return;
      tab.tabEl.querySelector('.tab-name').textContent = tab.name;
      tab.tabEl.classList.toggle('is-exited', !!tab.exited);
    }

    closeTab(tab) {
      const index = this.tabs.indexOf(tab);
      if (index === -1) return;

      this.tabs.splice(index, 1);

      if (tab.ptyId) {
        this.byPty.delete(tab.ptyId);
        this.api.pty.dispose(tab.ptyId);
        tab.ptyId = null;
      }

      try {
        tab.term.dispose();
      } catch (err) {
        /* ignore */
      }

      if (tab.el) tab.el.remove();
      if (tab.tabEl) tab.tabEl.remove();

      if (this.active === tab) {
        this.active = null;
        const next = this.tabs[Math.min(index, this.tabs.length - 1)];
        if (next) this.activate(next);
      }

      if (this.tabs.length === 0) {
        this.createTab();
      }
    }

    closeActiveTab() {
      if (this.active) this.closeTab(this.active);
    }

    cycleTab(delta) {
      if (!this.tabs.length) return;
      let index = this.tabs.indexOf(this.active);
      if (index === -1) index = 0;
      index = (index + delta + this.tabs.length) % this.tabs.length;
      this.activate(this.tabs[index]);
    }

    applySettings(settings) {
      for (const tab of this.tabs) {
        tab.term.options.fontSize = settings.fontSize;
        tab.term.options.fontFamily = settings.fontFamily;
        tab.term.options.cursorStyle = settings.cursorStyle || 'bar';
        tab.term.options.theme = themeFor(settings.accent);
      }
      this.fitActive();
    }

    onShow() {
      requestAnimationFrame(() => {
        this.fitActive();
        if (this.active) this.active.term.focus();
      });
    }

    type(text) {
      if (this.active && this.active.ptyId) {
        this.api.pty.write(this.active.ptyId, String(text));
      }
    }

    clear() {
      if (this.active) this.active.term.clear();
    }

    disposeAll() {
      for (const tab of this.tabs.slice()) {
        if (tab.ptyId) this.api.pty.dispose(tab.ptyId);
        try {
          tab.term.dispose();
        } catch (err) {
          /* ignore */
        }
      }
      this.tabs = [];
      this.byPty.clear();
      this.active = null;
    }
  }

  window.TerminalView = TerminalView;
})();
