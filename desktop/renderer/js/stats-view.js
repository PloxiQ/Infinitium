(function () {
  'use strict';

  const { $, fmtDuration, fmtWeek, dayKey, debounce } = window.UI;

  function hexToRgba(hex, alpha) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!match) return `rgba(110, 231, 249, ${alpha})`;
    return `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${alpha})`;
  }

  function drawLine(ctx, history, key, xFor, yFor, color, width, glow) {
    ctx.save();
    ctx.beginPath();
    history.forEach((point, index) => {
      const x = xFor(index);
      const y = yFor(point[key]);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawDot(ctx, x, y, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }

  class StatsView {
    constructor(api, state) {
      this.api = api;
      this.state = state;
      this.history = [];
      this.canvas = null;
      this.ctx = null;
      this.weekEl = null;
      this.weekSig = '';
    }

    init() {
      this.canvas = $('#stats-chart');
      this.ctx = this.canvas.getContext('2d');
      this.weekEl = $('#week-chart');

      const redraw = debounce(() => this.draw(), 60);
      new ResizeObserver(redraw).observe(this.canvas.parentElement);
      window.addEventListener('resize', redraw);
    }

    visible() {
      const view = document.querySelector('[data-view="stats"]');
      return !!view && view.classList.contains('is-active');
    }

    update(payload) {
      const system = payload.system;
      if (system) {
        const last = this.history[this.history.length - 1];
        if (!last || last.ts !== system.ts) {
          this.history.push({ ts: system.ts, cpu: system.cpu, mem: system.mem.pct });
          if (this.history.length > 60) this.history.shift();
        }
      }

      if (payload.stats) {
        this.updateMetrics(payload.stats);
        this.renderWeek(payload.stats);
      }

      if (this.visible()) this.draw();
    }

    onShow() {
      this.draw();
    }

    updateMetrics(stats) {
      const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };

      set('stat-session-time', fmtDuration(stats.sessionSeconds));
      set('stat-session-commands', stats.sessionCommands);
      set('stat-total-commands', stats.totalCommands);
      set('stat-total-time', fmtDuration(stats.totalSeconds));
      set('stat-launches', `${stats.launches} launches`);

      if (stats.startedAt) {
        set('stat-session-sub', `since ${new Date(stats.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      }
      if (stats.firstLaunch) {
        set('stat-total-sub', `since ${new Date(stats.firstLaunch).toLocaleDateString()}`);
      }
    }

    renderWeek(stats) {
      if (!this.weekEl) return;

      const days = [];
      const now = new Date();
      for (let i = 6; i >= 0; i -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = dayKey(date);
        days.push({
          date,
          key,
          data: stats.daily[key] || { seconds: 0, commands: 0 }
        });
      }

      const signature = days.map((d) => `${d.key}:${d.data.seconds}:${d.data.commands}`).join('|');
      if (signature === this.weekSig) return;
      this.weekSig = signature;

      const total = days.reduce((sum, d) => sum + (d.data.seconds || 0), 0);
      const max = Math.max(60, ...days.map((d) => d.data.seconds || 0));
      const todayKey = dayKey();

      this.weekEl.innerHTML = '';
      for (const day of days) {
        const wrap = document.createElement('div');
        wrap.className = 'week-day' + (day.key === todayKey ? ' is-today' : '');

        const track = document.createElement('div');
        track.className = 'week-bar-track';

        const bar = document.createElement('div');
        bar.className = 'week-bar';
        const seconds = day.data.seconds || 0;
        bar.style.height = `${seconds > 0 ? Math.max(4, Math.round((seconds / max) * 100)) : 1.5}%`;
        bar.title = `${fmtDuration(seconds)} · ${day.data.commands || 0} commands`;

        track.appendChild(bar);

        const label = document.createElement('span');
        label.className = 'week-day-label';
        label.textContent = day.date.toLocaleDateString([], { weekday: 'short' });

        const value = document.createElement('em');
        value.className = 'week-day-value';
        value.textContent = fmtWeek(seconds);

        wrap.appendChild(track);
        wrap.appendChild(label);
        wrap.appendChild(value);
        this.weekEl.appendChild(wrap);
      }

      const totalEl = $('#week-total');
      if (totalEl) totalEl.textContent = `${fmtDuration(total)} total`;
    }

    draw() {
      if (!this.canvas || !this.ctx) return;

      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(10, Math.floor(rect.width));
      const height = Math.max(10, Math.floor(rect.height));
      const dpr = window.devicePixelRatio || 1;

      if (this.canvas.width !== Math.floor(width * dpr) || this.canvas.height !== Math.floor(height * dpr)) {
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
      }

      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const style = getComputedStyle(document.body);
      const accent = style.getPropertyValue('--accent').trim() || '#6ee7f9';
      const accent2 = style.getPropertyValue('--accent-2').trim() || '#c792ea';
      const dim = '#5a6785';

      const pad = { left: 34, right: 12, top: 14, bottom: 22 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      if (plotW <= 0 || plotH <= 0) return;

      ctx.font = '9px "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';

      for (let i = 0; i <= 4; i += 1) {
        const value = i * 25;
        const y = pad.top + (1 - value / 100) * plotH;

        ctx.strokeStyle = 'rgba(140, 170, 230, 0.09)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();

        ctx.fillStyle = dim;
        ctx.textAlign = 'right';
        ctx.fillText(`${value}%`, pad.left - 8, y);
      }

      ctx.fillStyle = dim;
      ctx.textAlign = 'left';
      ctx.fillText('60s ago', pad.left, height - 8);
      ctx.textAlign = 'right';
      ctx.fillText('now', width - pad.right, height - 8);

      if (this.history.length < 2) {
        ctx.fillStyle = dim;
        ctx.textAlign = 'center';
        ctx.font = '11px "Segoe UI", sans-serif';
        ctx.fillText('Collecting samples…', pad.left + plotW / 2, pad.top + plotH / 2);
        return;
      }

      const lastIndex = this.history.length - 1;
      const offset = 59 - lastIndex;
      const xFor = (index) => pad.left + ((index + offset) / 59) * plotW;
      const yFor = (value) => pad.top + (1 - Math.max(0, Math.min(100, value)) / 100) * plotH;

      const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      gradient.addColorStop(0, hexToRgba(accent, 0.26));
      gradient.addColorStop(1, hexToRgba(accent, 0.01));

      ctx.beginPath();
      this.history.forEach((point, index) => {
        const x = xFor(index);
        const y = yFor(point.cpu);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(xFor(lastIndex), pad.top + plotH);
      ctx.lineTo(xFor(0), pad.top + plotH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      drawLine(ctx, this.history, 'cpu', xFor, yFor, accent, 1.8, true);
      drawLine(ctx, this.history, 'mem', xFor, yFor, accent2, 1.5, false);

      const last = this.history[lastIndex];
      drawDot(ctx, xFor(lastIndex), yFor(last.cpu), accent);
      drawDot(ctx, xFor(lastIndex), yFor(last.mem), accent2);
    }
  }

  window.StatsView = StatsView;
})();
