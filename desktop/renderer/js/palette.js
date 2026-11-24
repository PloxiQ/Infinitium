(function () {
  'use strict';

  class Palette {
    constructor(actions) {
      this.actions = actions;
      this.commands = [];
      this.items = [];
      this.index = 0;
      this.el = null;
      this.input = null;
      this.list = null;
    }

    init() {
      this.el = document.getElementById('palette');
      this.input = document.getElementById('palette-input');
      this.list = document.getElementById('palette-list');

      this.input.addEventListener('input', () => this.render(this.input.value));
      this.input.addEventListener('keydown', (event) => this.onKey(event));
      this.el.addEventListener('mousedown', (event) => {
        if (event.target === this.el) this.close();
      });
    }

    setCommands(commands) {
      this.commands = Array.isArray(commands) ? commands : [];
    }

    isOpen() {
      return !!this.el && !this.el.hidden;
    }

    open() {
      this.el.hidden = false;
      this.input.value = '';
      this.render('');
      requestAnimationFrame(() => this.input.focus());
    }

    close() {
      this.el.hidden = true;
    }

    toggle() {
      if (this.isOpen()) this.close();
      else this.open();
    }

    render(query) {
      if (!this.list) return;

      const needle = String(query || '').trim().toLowerCase();
      this.items = this.commands
        .filter((command) => {
          if (!needle) return true;
          const haystack = `${command.label} ${command.keywords || ''}`.toLowerCase();
          return haystack.indexOf(needle) !== -1;
        })
        .slice(0, 12);
      this.index = 0;

      this.list.innerHTML = '';

      if (!this.items.length) {
        const empty = document.createElement('div');
        empty.className = 'palette-empty';
        empty.textContent = 'No matching commands';
        this.list.appendChild(empty);
        return;
      }

      this.items.forEach((command) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'palette-item';

        const icon = document.createElement('span');
        icon.className = 'palette-item-icon';
        icon.textContent = command.icon || '›';

        const label = document.createElement('span');
        label.className = 'palette-item-label';
        label.textContent = command.label;

        button.appendChild(icon);
        button.appendChild(label);

        if (command.hint) {
          const hint = document.createElement('span');
          hint.className = 'palette-item-hint';
          hint.textContent = command.hint;
          button.appendChild(hint);
        }

        button.addEventListener('click', () => this.run(command));
        this.list.appendChild(button);
      });

      this.highlight();
    }

    highlight() {
      const nodes = Array.from(this.list.querySelectorAll('.palette-item'));
      nodes.forEach((node, index) => {
        node.classList.toggle('is-selected', index === this.index);
      });
      const selected = nodes[this.index];
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    move(delta) {
      if (!this.items.length) return;
      this.index = (this.index + delta + this.items.length) % this.items.length;
      this.highlight();
    }

    runSelected() {
      const command = this.items[this.index];
      if (command) this.run(command);
    }

    run(command) {
      this.close();
      setTimeout(() => {
        try {
          command.run();
        } catch (err) {
          this.actions.toast(String((err && err.message) || err), 'error');
        }
      }, 0);
    }

    onKey(event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.move(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.move(-1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.runSelected();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    }
  }

  window.Palette = Palette;
})();
