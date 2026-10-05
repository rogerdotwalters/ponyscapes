'use strict';
/* CLIENT - HOST ONLY: how hunger and thirst work for each player. A row per player slot with two drop-downs.
 *   Off         - the bar is hidden and never drains
 *   Superficial - the bar drains and shows, but being empty never hurts
 *   Relaxed / Normal / Hard - slower / default / faster drain, and empty slows you down */
class SettingsUI {
  constructor({ panel, list, closeButton, game }) {
    this.panel = panel; this.list = list; this.game = game; this.selects = [];
    for (let slot = 0; slot < CONFIG.sim.maxPlayers; slot++) this._createRow(slot);
    closeButton.addEventListener('click', () => this.close());
  }

  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }

  _createRow(slot) {
    const id = 'p' + (slot + 1), el = document.createElement('div');
    el.className = 'playerRow'; el.dataset.slot = slot;
    const options = Object.entries(CONFIG.sim.vitalModes).map(([key, m]) => `<option value="${key}">${m.label}</option>`).join('');
    el.innerHTML =
      `<div class="who"><i style="background:${CONFIG.sim.slotColors[slot]}"></i>${this.game.playerName(id)}${slot === 0 ? ' (you, host)' : ''}</div>` +
      `<label>Hunger <select data-vital="hunger">${options}</select></label><label>Thirst <select data-vital="thirst">${options}</select></label>`;
    for (const select of el.querySelectorAll('select')) {
      select.addEventListener('change', () => {
        const vital = select.dataset.vital;
        this.game.setVitalModes(id, vital === 'hunger' ? select.value : undefined, vital === 'thirst' ? select.value : undefined);
      });
      this.selects.push({ id, vital: select.dataset.vital, select });
    }
    this.list.appendChild(el);
  }

  /** Show what each player currently has (from the latest snapshot; slots nobody has joined yet show the default). */
  refresh() {
    const players = this.game.latestPlayers();
    for (const row of this.panel.querySelectorAll('.playerRow')) {            // names can change as people join and leave
      const slot = Number(row.dataset.slot), who = row.querySelector('.who');
      if (who) who.innerHTML = `<i style="background:${CONFIG.sim.slotColors[slot]}"></i>${LobbyUI.escape(this.game.playerName('p' + (slot + 1)))}${slot === 0 ? ' (you, host)' : ''}`;
    }
    for (const { id, vital, select } of this.selects) {
      const p = players[id];
      select.value = p ? p[vital + 'Mode'] : 'normal';
    }
  }
}
