'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  accent: 'cyan',
  fontSize: 13,
  fontFamily: 'JetBrainsMono Nerd Font Mono',
  cursorStyle: 'bar',
  shell: 'powershell',
  startView: 'terminal',
  reduceMotion: false,
  window: {
    width: 1280,
    height: 820,
    x: null,
    y: null,
    maximized: false
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, patch) {
  const out = clone(base);
  if (!isPlainObject(patch)) return out;
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = merge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function createSettingsStore(dir) {
  const file = path.join(dir, 'settings.json');
  let data = clone(DEFAULTS);

  try {
    const raw = fs.readFileSync(file, 'utf8');
    data = merge(DEFAULTS, JSON.parse(raw));
  } catch {
    /* first run or unreadable file */
  }

  function save() {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  return {
    file,
    get: () => clone(data),
    update(patch) {
      data = merge(data, patch);
      save();
      return clone(data);
    },
    reset() {
      data = clone(DEFAULTS);
      save();
      return clone(data);
    }
  };
}

module.exports = { createSettingsStore, DEFAULTS };
