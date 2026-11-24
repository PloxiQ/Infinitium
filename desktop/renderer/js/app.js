(function () {
  'use strict';

  const { $, $$ } = window.UI;
  const api = window.infinitium;
  const VIEWS = ['terminal', 'dashboard', 'stats', 'settings'];
  const ACCENTS = ['cyan', 'purple', 'green', 'amber'];

  const state = {
    settings: null,
    info: null,
    view: 'terminal',
    lastSystem: null,
    lastStats: null
  };

  let terminalView = null;
  let dashboard = null;
  let statsView = null;
  let settingsView = null;
  let palette = null;

  function toast(message, kind) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'error' ? ' is-error' : '');
    el.textContent = String(message);
    host.appendChild(el);
    window.setTimeout(() => {
      el.classList.add('is-out');
      window.setTimeout(() => el.remove(), 240);
    }, 3200);
  }

  function setView(name) {
    const view = VIEWS.indexOf(name) !== -1 ? name : 'terminal';
    state.view = view;

    $$('.rail-btn[data-nav]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.nav === view);
    });

    $$('.view[data-view]').forEach((section) => {
      section.classList.toggle('is-active', section.dataset.view === view);
    });

    if (view === 'terminal' && terminalView) terminalView.onShow();
    if (view === 'dashboard' && dashboard) dashboard.onShow();
    if (view === 'stats' && statsView) statsView.onShow();
  }

  function applySettings(settings) {
    state.settings = settings;
    document.body.dataset.accent = ACCENTS.indexOf(settings.accent) !== -1 ? settings.accent : 'cyan';
    document.body.classList.toggle('reduce-motion', !!settings.reduceMotion);
    if (terminalView) terminalView.applySettings(settings);
    if (settingsView) settingsView.sync(settings);
  }

  async function updateSettings(patch) {
    const settings = await api.settings.update(patch);
    applySettings(settings);
    refreshPalette();
    return settings;
  }

  function previewFontSize(value) {
    if (!terminalView || !state.settings) return;
    terminalView.applySettings(Object.assign({}, state.settings, { fontSize: value }));
  }

  function adjustFontSize(delta) {
    if (!state.settings) return;
    const current = Number(state.settings.fontSize) || 13;
    const next = Math.max(10, Math.min(20, current + delta));
    if (next === current) return;
    previewFontSize(next);
    updateSettings({ fontSize: next });
  }

  function onStatsReset(snapshot) {
    state.lastStats = snapshot;
    if (dashboard && state.lastSystem) dashboard.update({ system: state.lastSystem, stats: snapshot });
    if (statsView) statsView.update({ stats: snapshot });
  }

  function onSettingsReset(settings) {
    applySettings(settings);
    refreshPalette();
  }

  async function openPath(target, label) {
    if (!target) {
      toast(`${label || 'That folder'} was not found.`, 'error');
      return;
    }
    const result = await api.system.openPath(target);
    if (result && result.ok === false) {
      toast(result.error || `Could not open ${label || 'that path'}.`, 'error');
    }
  }

  function refreshPalette() {
    if (!palette || !state.info) return;

    const commands = [
      {
        label: 'New terminal tab',
        hint: 'Ctrl Shift T',
        icon: '+',
        keywords: 'terminal shell tab create',
        run: () => {
          setView('terminal');
          terminalView.createTab();
        }
      },
      {
        label: 'Close current tab',
        hint: 'Ctrl Shift W',
        icon: '×',
        keywords: 'terminal tab close',
        run: () => terminalView.closeActiveTab()
      },
      {
        label: 'Clear terminal',
        icon: '⌫',
        keywords: 'terminal clear screen scrollback',
        run: () => terminalView.clear()
      },
      {
        label: 'Go to Terminal',
        hint: 'Alt 1',
        icon: '1',
        keywords: 'view navigate shell',
        run: () => setView('terminal')
      },
      {
        label: 'Go to Dashboard',
        hint: 'Alt 2',
        icon: '2',
        keywords: 'view navigate home overview',
        run: () => setView('dashboard')
      },
      {
        label: 'Go to Statistics',
        hint: 'Alt 3',
        icon: '3',
        keywords: 'view navigate charts metrics stats statistics telemetry',
        run: () => setView('stats')
      },
      {
        label: 'Go to Settings',
        hint: 'Alt 4',
        icon: '4',
        keywords: 'view navigate preferences options',
        run: () => setView('settings')
      },
      {
        label: 'Open home folder',
        icon: '~',
        keywords: 'explorer files user profile',
        run: () => openPath(state.info.home, 'Home folder')
      },
      {
        label: 'Open project folder',
        icon: '▸',
        keywords: 'explorer files repository source',
        run: () => openPath(state.info.project, 'Project folder')
      },
      {
        label: 'Open data folder',
        icon: '▤',
        keywords: 'explorer files settings stats appdata',
        run: () => openPath(state.info.dataDir, 'Data folder')
      }
    ];

    if (state.info.vscode) {
      commands.push({
        label: 'Open Visual Studio Code',
        icon: '</>',
        keywords: 'editor code vscode',
        run: () => openPath(state.info.vscode, 'VS Code')
      });
    }

    commands.push({
      label: state.settings.reduceMotion ? 'Disable reduced motion' : 'Enable reduced motion',
      icon: '◎',
      keywords: 'animation accessibility motion',
      run: () => updateSettings({ reduceMotion: !state.settings.reduceMotion })
    });

    palette.setCommands(commands);
  }

  function bindChrome() {
    $('#win-min').addEventListener('click', () => api.window.minimize());
    $('#win-max').addEventListener('click', () => api.window.toggleMaximize());
    $('#win-close').addEventListener('click', () => api.window.close());

    api.window.onState((payload) => {
      document.body.classList.toggle('is-maximized', !!(payload && payload.maximized));
    });

    api.window.isMaximized().then((maximized) => {
      document.body.classList.toggle('is-maximized', !!maximized);
    });

    $('#titlebar').addEventListener('dblclick', (event) => {
      if (event.target.closest('.win-controls') || event.target.closest('.cmd-trigger')) return;
      api.window.toggleMaximize();
    });

    $('#cmd-trigger').addEventListener('click', () => palette.open());

    $$('.rail-btn[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => setView(btn.dataset.nav));
    });

    $$('[data-nav-jump]').forEach((el) => {
      el.addEventListener('click', () => setView(el.dataset.navJump));
    });
  }

  function bindKeys() {
    window.addEventListener('keydown', (event) => {
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.shiftKey && event.code === 'KeyP') {
        event.preventDefault();
        palette.toggle();
        return;
      }

      if (mod && event.shiftKey && event.code === 'KeyT') {
        event.preventDefault();
        setView('terminal');
        terminalView.createTab();
        return;
      }

      if (mod && event.shiftKey && event.code === 'KeyW') {
        event.preventDefault();
        terminalView.closeActiveTab();
        return;
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey && /^Digit[1-4]$/.test(event.code)) {
        event.preventDefault();
        setView(VIEWS[Number(event.code.slice(5)) - 1]);
        return;
      }

      if (mod && !event.shiftKey && (event.code === 'Equal' || event.code === 'NumpadAdd')) {
        event.preventDefault();
        adjustFontSize(1);
        return;
      }

      if (mod && !event.shiftKey && (event.code === 'Minus' || event.code === 'NumpadSubtract')) {
        event.preventDefault();
        adjustFontSize(-1);
        return;
      }

      if (mod && event.code === 'Digit0') {
        event.preventDefault();
        updateSettings({ fontSize: 13 });
        return;
      }

      if (event.key === 'Escape' && palette.isOpen()) {
        palette.close();
      }
    });
  }

  const actions = {
    setView,
    newTab: () => terminalView.createTab(),
    openPalette: () => palette.open(),
    toast,
    updateSettings,
    previewFontSize,
    onStatsReset,
    onSettingsReset
  };

  async function boot() {
    if (!api) {
      toast('Infinitium preload bridge is unavailable.', 'error');
      return;
    }

    const [settings, info] = await Promise.all([api.settings.get(), api.system.info()]);
    state.settings = settings;
    state.info = info;

    document.body.dataset.accent = ACCENTS.indexOf(settings.accent) !== -1 ? settings.accent : 'cyan';
    document.body.classList.toggle('reduce-motion', !!settings.reduceMotion);

    terminalView = new window.TerminalView(api, state);
    dashboard = new window.Dashboard(api, state, actions);
    statsView = new window.StatsView(api, state);
    settingsView = new window.SettingsView(api, state, actions);
    palette = new window.Palette(actions);

    dashboard.init();
    statsView.init();
    settingsView.init();
    settingsView.setInfo(info);
    settingsView.sync(settings);
    dashboard.setInfo(info);
    palette.init();
    refreshPalette();

    bindChrome();
    bindKeys();

    await terminalView.init();

    const initialStats = await api.stats.get();
    state.lastStats = initialStats;
    statsView.update({ stats: initialStats });

    api.stats.onTick((payload) => {
      state.lastSystem = payload.system || state.lastSystem;
      state.lastStats = payload.stats || state.lastStats;
      dashboard.update(payload);
      statsView.update(payload);

      const rail = document.getElementById('rail-status');
      if (rail && payload.system) {
        rail.classList.toggle('is-hot', payload.system.cpu >= 90);
        rail.title = `CPU ${Math.round(payload.system.cpu)}% · Memory ${Math.round(payload.system.mem.pct)}%`;
      }
    });

    api.app.onCycleTabs((payload) => {
      setView('terminal');
      terminalView.cycleTab(payload && payload.delta === -1 ? -1 : 1);
    });

    setView(settings.startView || 'terminal');

    window.__infinitiumTest = {
      type: (text) => terminalView.type(text),
      setView,
      getState: () => state
    };
  }

  boot().catch((err) => {
    console.error(err);
    toast(`Failed to start: ${String((err && err.message) || err)}`, 'error');
  });
})();
