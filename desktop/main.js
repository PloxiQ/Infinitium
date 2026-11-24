'use strict';

const { app, BrowserWindow, Menu, ipcMain, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { createSettingsStore } = require('./lib/settings');
const { createStatsStore } = require('./lib/stats');
const { createPtyManager } = require('./lib/pty-manager');

const APP_ID = 'com.infinitium.shell';
const isDev = process.argv.includes('--dev');

app.setName('Infinitium Shell');
app.setAppUserModelId(APP_ID);

let win = null;
let settings = null;
let stats = null;
let ptyManager = null;
let statsTimer = null;
let boundsTimer = null;
let cpuPrev = null;
let infoCache = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(bootstrap).catch((err) => {
    console.error(err);
    app.quit();
  });
}

async function bootstrap() {
  Menu.setApplicationMenu(null);

  const userData = app.getPath('userData');
  settings = createSettingsStore(userData);
  stats = createStatsStore(userData);
  stats.start();

  ptyManager = createPtyManager({
    getWindow: () => win,
    getShell: () => settings.get().shell,
    profileScript: path.join(process.env.LOCALAPPDATA || '', 'Infinitium', 'infinitium-profile.ps1'),
    version: app.getVersion()
  });

  registerIpc();
  createWindow();
  startStatsLoop();

  app.on('before-quit', () => {
    if (statsTimer) clearInterval(statsTimer);
    stats.flush();
    ptyManager.disposeAll();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

function createWindow() {
  const s = settings.get();
  const saved = s.window || {};

  const options = {
    width: saved.width || 1280,
    height: saved.height || 820,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    show: false,
    title: 'Infinitium Shell',
    backgroundColor: '#070b16',
    icon: path.join(__dirname, 'assets', 'infinitium.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  };

  if (Number.isInteger(saved.x) && Number.isInteger(saved.y)) {
    options.x = saved.x;
    options.y = saved.y;
  }

  win = new BrowserWindow(options);

  if (Number.isInteger(options.x)) {
    const b = win.getBounds();
    const displays = screen.getAllDisplays();
    const visible = displays.some((d) => {
      const a = d.workArea;
      return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y;
    });
    if (!visible) win.center();
  }

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    if (s.window && s.window.maximized) win.maximize();
    if (process.env.INFINITIUM_SMOKE) {
      runSmokeTest().catch((err) => {
        console.error('[smoke] failed:', err);
        app.quit();
      });
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.control && !input.alt && input.key === 'Tab') {
      event.preventDefault();
      win.webContents.send('tabs:cycle', { delta: input.shift ? -1 : 1 });
    }
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  if (isDev) {
    win.webContents.on('console-message', (...args) => {
      const d = args[0];
      if (d && typeof d === 'object' && typeof d.message === 'string') {
        console.log('[renderer]', d.message);
      } else {
        console.log('[renderer]', args[2]);
      }
    });
  }

  win.on('resize', scheduleBoundsSave);
  win.on('move', scheduleBoundsSave);
  win.on('maximize', () => { sendWindowState(); scheduleBoundsSave(); });
  win.on('unmaximize', () => { sendWindowState(); scheduleBoundsSave(); });
  win.on('close', () => {
    saveBounds();
    if (stats) stats.flush();
  });
  win.on('closed', () => {
    win = null;
  });

  win.webContents.on('did-finish-load', () => {
    sendTick();
    sendWindowState();
  });
}

function sendWindowState() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('window:state', { maximized: win.isMaximized() });
  }
}

function scheduleBoundsSave() {
  clearTimeout(boundsTimer);
  boundsTimer = setTimeout(saveBounds, 400);
}

function saveBounds() {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  if (win.isMaximized()) {
    settings.update({ window: { maximized: true } });
    return;
  }
  const b = win.getBounds();
  settings.update({ window: { width: b.width, height: b.height, x: b.x, y: b.y, maximized: false } });
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:update', (event, patch) => settings.update(patch || {}));
  ipcMain.handle('settings:reset', () => settings.reset());

  ipcMain.handle('stats:get', () => stats.snapshot());
  ipcMain.on('stats:command', () => stats.addCommand());
  ipcMain.handle('stats:reset', () => {
    stats.reset();
    return stats.snapshot();
  });

  ipcMain.handle('system:info', () => getSystemInfo());

  ipcMain.handle('system:open-path', async (event, target) => {
    if (typeof target !== 'string' || !target) return { ok: false, error: 'Invalid path.' };
    try {
      fs.accessSync(target);
    } catch {
      return { ok: false, error: 'That path does not exist.' };
    }
    const error = await shell.openPath(target);
    return error ? { ok: false, error } : { ok: true };
  });

  ipcMain.handle('system:open-external', async (event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'Only http(s) links are allowed.' };
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('system:reveal', (event, target) => {
    if (typeof target === 'string' && target) shell.showItemInFolder(target);
    return { ok: true };
  });

  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('pty:create', (event, opts) => ptyManager.create(opts || {}));
  ipcMain.on('pty:write', (event, id, data) => ptyManager.write(id, data));
  ipcMain.on('pty:resize', (event, id, cols, rows) => ptyManager.resize(id, cols, rows));
  ipcMain.on('pty:dispose', (event, id) => ptyManager.dispose(id));

  ipcMain.on('window:minimize', () => { if (win) win.minimize(); });
  ipcMain.on('window:toggle-maximize', () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', () => { if (win) win.close(); });
  ipcMain.handle('window:is-maximized', () => !!win && win.isMaximized());
}

function getSystemInfo() {
  if (infoCache) return infoCache;

  const vscode = findFirst([
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
    'C:\\Program Files\\Microsoft VS Code\\Code.exe',
    'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe'
  ]);

  const gitBash = findFirst([
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe')
  ]);

  const cpus = os.cpus();

  infoCache = {
    hostname: os.hostname(),
    os: os.version(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: cpus.length ? cpus[0].model.trim() : 'Unknown CPU',
    cores: cpus.length,
    home: os.homedir(),
    project: app.isPackaged ? path.dirname(app.getPath('exe')) : path.resolve(__dirname, '..'),
    dataDir: app.getPath('userData'),
    ip: primaryIp(),
    vscode,
    gitBash,
    shells: {
      powershell: powershellPath(),
      cmd: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
      gitbash: gitBash
    },
    versions: {
      app: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome
    }
  };

  return infoCache;
}

function findFirst(paths) {
  for (const p of paths) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return null;
}

function powershellPath() {
  const full = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return fs.existsSync(full) ? full : 'powershell.exe';
}

function primaryIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const addr of nets[name] || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return null;
}

function cpuPercent() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  let pct = 0;
  if (cpuPrev) {
    const dTotal = total - cpuPrev.total;
    const dIdle = idle - cpuPrev.idle;
    if (dTotal > 0) pct = (1 - dIdle / dTotal) * 100;
  }
  cpuPrev = { idle, total };
  return Math.max(0, Math.min(100, pct));
}

function diskInfo() {
  try {
    const s = fs.statfsSync('C:\\');
    const total = s.bsize * s.blocks;
    const free = s.bsize * s.bavail;
    const used = total - free;
    return {
      letter: 'C:',
      total,
      free,
      used,
      pct: total > 0 ? (used / total) * 100 : 0
    };
  } catch {
    return null;
  }
}

function systemSnapshot() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return {
    ts: Date.now(),
    cpu: cpuPercent(),
    mem: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      pct: totalMem > 0 ? (usedMem / totalMem) * 100 : 0
    },
    disk: diskInfo(),
    uptime: os.uptime()
  };
}

function sendTick() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('stats:tick', {
    system: systemSnapshot(),
    stats: stats.snapshot()
  });
}

function startStatsLoop() {
  statsTimer = setInterval(() => {
    stats.tick();
    sendTick();
  }, 1000);
}

async function runSmokeTest() {
  const outDir = process.env.INFINITIUM_SMOKE_DIR || path.join(os.tmpdir(), 'infinitium-smoke');
  fs.mkdirSync(outDir, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
    console.log('[smoke] saved', name);
  };

  await wait(2200);
  await shot('01-terminal');

  win.webContents.focus();
  for (const ch of 'get-date') {
    win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
  }
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await wait(1600);
  await shot('02-keyboard');

  await win.webContents.executeJavaScript("window.__infinitiumTest && window.__infinitiumTest.type('echo pty-ok\\r')");
  await wait(1600);
  await shot('03-pty');

  for (const [view, name] of [['dashboard', '04-dashboard'], ['stats', '05-stats'], ['settings', '06-settings']]) {
    await win.webContents.executeJavaScript(`document.querySelector('[data-nav="${view}"]').click()`);
    await wait(900);
    await shot(name);
  }

  await win.webContents.executeJavaScript("document.querySelector('#cmd-trigger').click()");
  await wait(500);
  await shot('07-palette');

  console.log('[smoke] done ->', outDir);
  app.quit();
}
