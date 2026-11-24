'use strict';

const { contextBridge, ipcRenderer, clipboard } = require('electron');

function subscribe(channel) {
  return (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('infinitium', {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  },
  pty: {
    create: (options) => ipcRenderer.invoke('pty:create', options || {}),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    dispose: (id) => ipcRenderer.send('pty:dispose', id),
    onData: subscribe('pty:data'),
    onExit: subscribe('pty:exit')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    reset: () => ipcRenderer.invoke('settings:reset')
  },
  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
    command: () => ipcRenderer.send('stats:command'),
    reset: () => ipcRenderer.invoke('stats:reset'),
    onTick: subscribe('stats:tick')
  },
  system: {
    info: () => ipcRenderer.invoke('system:info'),
    openPath: (target) => ipcRenderer.invoke('system:open-path', target),
    openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
    reveal: (target) => ipcRenderer.invoke('system:reveal', target),
    dataDir: () => ipcRenderer.invoke('system:info').then((info) => info.dataDir)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onState: subscribe('window:state')
  },
  clipboard: {
    read: () => clipboard.readText(),
    write: (text) => clipboard.writeText(String(text == null ? '' : text))
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    onCycleTabs: subscribe('tabs:cycle')
  }
});
