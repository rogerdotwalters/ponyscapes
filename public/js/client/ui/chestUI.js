'use strict';
/* CLIENT - the Chest window: opens at a chest in a room (homeCrafts.js). What is inside (take 1 / 10 / all) and what is in your bag (store 1 / 10 / all).
 * It closes when you walk away. The server decides everything; the contents arrive with the town's stockpiles. */
class ChestUI {
  constructor({ panel, body, closeButton, game, requestOpen }) {
    this.panel = panel; this.body = body; this.game = game; this.chest = null; this.since = 0; this.signature = '';
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b || b.disabled || !this.chest) return;
      const { fx, fy } = this.chest, item = b.dataset.item, count = Number(b.dataset.count);
      game.net.sendCommand({ type: b.dataset.act === 'put' ? 'chestPut' : 'chestTake', fx, fy, item, count });
    });
    game.events.on('chest', e => { this.chest = { fx: e.fx, fy: e.fy, name: e.name || 'Chest', slots: e.slots || 24 }; requestOpen(); });
    for (const ev of ['stockpilesChanged', 'inventoryChanged']) game.events.on(ev, () => this.isOpen && this.refresh());
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }
  /** Walked away from the chest: close. */
  tick(frameMs) {
    if (!this.isOpen || (this.since += frameMs) < 300) return;
    this.since = 0;
    const c = this.chest, g = this.game;
    if (!c || !HomeCrafts.near(g.map, g.local, d => d.container).some(h => h.f.x === c.fx && h.f.y === c.fy)) this.close();
  }
  _row(id, n, act, label) {
    const stack = Math.min(n, ItemDB.maxStack(id)), b = (count, text) => `<button data-act="${act}" data-item="${id}" data-count="${count}">${text}</button>`;
    return `<span class="ttake"><img alt="" src="${ItemIcons.url(id)}"><b>${n}</b>${b(1, label + ' 1')}${n > 1 ? b(Math.min(10, n), label + ' ' + Math.min(10, n)) : ''}${n > 10 ? b(n > stack ? stack : n, n > stack ? 'Stack' : 'All') : ''}</span>`;
  }
  refresh() {
    const g = this.game, c = this.chest; if (!c) return;
    const held = HomeCrafts.chestItems(g.worldMap, HomeCrafts.storeKey(g.grid, { x: c.fx, y: c.fy })), inside = Object.entries(held).filter(([, n]) => n > 0);
    const bag = {}; for (const s of g.inventory.slots) if (s) bag[s.id] = (bag[s.id] || 0) + s.count;
    const mine = Object.entries(bag);
    this.body.innerHTML = `<div class="ttitle">${c.name} <small>${inside.length} / ${c.slots} kinds of item</small></div><div class="titems">${inside.map(([id, n]) => this._row(id, n, 'take', 'Take')).join('') || '<span class="tsub">Empty</span>'}</div>` +
      `<div class="ttitle">Your bag</div><div class="titems">${mine.map(([id, n]) => this._row(id, n, 'put', 'Store')).join('') || '<span class="tsub">Nothing to store</span>'}</div>`;
  }
}
