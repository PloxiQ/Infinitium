'use strict';

const fs = require('fs');
const path = require('path');

function dayKey(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyData() {
  return {
    launches: 0,
    totalSeconds: 0,
    totalCommands: 0,
    daily: {},
    firstLaunch: null
  };
}

function createStatsStore(dir) {
  const file = path.join(dir, 'stats.json');
  let data = emptyData();
  let dirty = false;

  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    data = Object.assign(emptyData(), parsed);
    if (!data.daily || typeof data.daily !== 'object') data.daily = {};
  } catch {
    /* first run */
  }

  let sessionStart = Date.now();
  let lastTick = sessionStart;
  let sessionCommands = 0;

  function today() {
    const key = dayKey();
    if (!data.daily[key]) data.daily[key] = { seconds: 0, commands: 0, launches: 0 };
    return data.daily[key];
  }

  function prune() {
    const keys = Object.keys(data.daily).sort();
    while (keys.length > 120) {
      const key = keys.shift();
      delete data.daily[key];
    }
  }

  function save() {
    fs.mkdirSync(dir, { recursive: true });
    prune();
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    dirty = false;
  }

  function addSeconds(seconds) {
    if (seconds <= 0) return;
    data.totalSeconds += seconds;
    today().seconds += seconds;
    dirty = true;
  }

  function tick() {
    const now = Date.now();
    const delta = Math.floor((now - lastTick) / 1000);
    if (delta > 0) {
      addSeconds(delta);
      lastTick += delta * 1000;
    }
  }

  function snapshot() {
    tick();
    return {
      launches: data.launches,
      totalSeconds: data.totalSeconds,
      totalCommands: data.totalCommands,
      daily: data.daily,
      firstLaunch: data.firstLaunch,
      sessionSeconds: Math.max(0, Math.floor((Date.now() - sessionStart) / 1000)),
      sessionCommands,
      startedAt: new Date(sessionStart).toISOString()
    };
  }

  return {
    file,
    start() {
      data.launches += 1;
      if (!data.firstLaunch) data.firstLaunch = new Date().toISOString();
      today().launches += 1;
      save();
    },
    tick,
    addCommand() {
      data.totalCommands += 1;
      today().commands += 1;
      sessionCommands += 1;
      dirty = true;
    },
    snapshot,
    flush() {
      tick();
      if (dirty) save();
    },
    reset() {
      data = emptyData();
      sessionStart = Date.now();
      lastTick = sessionStart;
      sessionCommands = 0;
      save();
      return snapshot();
    }
  };
}

module.exports = { createStatsStore, dayKey };
