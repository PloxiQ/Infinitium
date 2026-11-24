'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pty = require('@lydell/node-pty');

function findGitBash() {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe')
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch { /* ignore */ }
  }
  return null;
}

function resolveShell(kind, profileScript) {
  if (kind === 'cmd') {
    return {
      name: 'Command Prompt',
      file: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
      args: []
    };
  }

  if (kind === 'gitbash') {
    const bash = findGitBash();
    if (bash) {
      return { name: 'Git Bash', file: bash, args: ['--login', '-i'] };
    }
  }

  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const file = fs.existsSync(powershell) ? powershell : 'powershell.exe';
  const args = ['-NoLogo'];

  try {
    if (profileScript && fs.existsSync(profileScript)) {
      args.push('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', profileScript);
    }
  } catch { /* ignore */ }

  return { name: 'PowerShell', file, args };
}

function createPtyManager(options) {
  const sessions = new Map();
  const getWindow = options.getWindow;
  const getShell = options.getShell;
  const profileScript = options.profileScript;
  const version = options.version || '1.0.0';

  function send(channel, payload) {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }

  function create(opts) {
    const spec = resolveShell(getShell(), profileScript);

    const env = Object.assign({}, process.env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Infinitium',
      TERM_PROGRAM_VERSION: version
    });

    const proc = pty.spawn(spec.file, spec.args, {
      name: 'xterm-256color',
      cols: Number(opts.cols) > 0 ? Math.floor(opts.cols) : 100,
      rows: Number(opts.rows) > 0 ? Math.floor(opts.rows) : 30,
      cwd: opts.cwd || os.homedir(),
      env
    });

    const id = crypto.randomUUID();
    sessions.set(id, proc);

    proc.onData((data) => {
      send('pty:data', { id, data });
    });

    proc.onExit((event) => {
      sessions.delete(id);
      send('pty:exit', { id, exitCode: event && typeof event.exitCode === 'number' ? event.exitCode : 0 });
    });

    return { id, pid: proc.pid, shell: spec.name };
  }

  function write(id, data) {
    const proc = sessions.get(id);
    if (!proc || typeof data !== 'string') return;
    try {
      proc.write(data);
    } catch { /* session may have exited */ }
  }

  function resize(id, cols, rows) {
    const proc = sessions.get(id);
    if (!proc) return;
    const c = Math.max(2, Math.floor(Number(cols) || 0));
    const r = Math.max(2, Math.floor(Number(rows) || 0));
    try {
      proc.resize(c, r);
    } catch { /* ignore */ }
  }

  function dispose(id) {
    const proc = sessions.get(id);
    if (!proc) return;
    sessions.delete(id);
    try {
      proc.kill();
    } catch { /* ignore */ }
  }

  function disposeAll() {
    for (const [id, proc] of sessions) {
      sessions.delete(id);
      try {
        proc.kill();
      } catch { /* ignore */ }
    }
  }

  return { create, write, resize, dispose, disposeAll };
}

module.exports = { createPtyManager, resolveShell };
