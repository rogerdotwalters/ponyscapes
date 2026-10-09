'use strict';
/* CLIENT - the garden window. Tap a tilled tile with a hoe, shovel, watering can or seeds in hand and a window shows its nine plots (farming.js), with your
 * SEED PACKS in a scrolling list on the side and your gardening tools along the bottom.
 *   - pick a tool and tap a plot: hoe loosens packed soil, shovel digs a hole, can waters, hand covers a seed / fills a hole / clears a withered crop / picks
 *     what is ripe. The server checks each job (reach, the tool you carry) and answers with the new state of the field.
 *   - tap a seed pack to open its POUCH (seedPouchUI.js, like the coin bag) beside the window; several can be open at once. Drag a seed out of a pouch onto
 *     a dug, empty hole to plant it: the pouch's count follows what your bag really holds.
 * Dig a hole, drop a seed in, cover it, water it; it grows a day for each day it was watered. */
const GARDEN_TOOLS = [
  { id: 'hand', kind: '', name: 'Hand', hint: 'Cover seeds, fill holes, clear withered crops and pick what is ripe' },
  { id: 'hoe', kind: 'hoe', name: 'Hoe', hint: 'Loosen soil that has packed down' },
  { id: 'shovel', kind: 'shovel', name: 'Shovel', hint: 'Dig a hole to plant in' },
  { id: 'watering_can', kind: 'water', name: 'Watering can', hint: 'Water a plot for today' }
];
const GARDEN_CELL = 100, GARDEN_PAD = 14, GARDEN_SIZE = GARDEN_CELL * 3 + GARDEN_PAD * 2;

class GardenUI {
  constructor({ panel, canvas, seedList, toolBar, pouchHost, title, hint, closeButton, game, requestOpen }) {
    Object.assign(this, { panel, canvas, seedList, toolBar, pouchHost, titleEl: title, hintEl: hint, game, requestOpen });
    this.tile = null; this.tool = 'hand'; this.pouches = new Map(); this.hover = -1; this.dragSeed = null; this.particles = []; this.shake = {}; this.raf = 0;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(GARDEN_SIZE * this.dpr); this.ctx = canvas.getContext('2d');
    closeButton.addEventListener('click', () => this.close());
    panel.addEventListener('pointerdown', e => { if (e.target === panel) this.close(); });                 // (a tap outside the windows closes it)
    canvas.addEventListener('pointermove', e => { this.hover = this._cellAt(e.clientX, e.clientY); });
    canvas.addEventListener('pointerleave', () => { this.hover = -1; });
    canvas.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.hover = this._cellAt(e.clientX, e.clientY); this._use(this.hover); });
    toolBar.addEventListener('click', e => { const b = e.target.closest('button[data-tool]'); if (b && !b.disabled) this._pickTool(b.dataset.tool); });
    seedList.addEventListener('click', e => { const b = e.target.closest('button[data-seed]'); if (b) this._togglePouch(b.dataset.seed); });
    game.events.on('inventoryChanged', () => { if (this.isOpen) { this._renderSeeds(); this._renderTools(); } });
    game.events.on('openGarden', e => { if (e && Number.isInteger(e.tx)) this.show(e.tx, e.ty); });
  }

  get isOpen() { return !this.panel.hidden; }
  /** Open the window on the field at tile (tx, ty) (goes through the panel group, so any other window closes). */
  show(tx, ty) {
    if (!this.game.fieldAt(tx, ty)) { this.game.events.emit('notice', { to: this.game.myId, text: 'Nothing is tilled there' }); return; }
    this.tile = { tx, ty }; this.requestOpen();
  }
  open() {
    if (!this.tile) return;
    const held = ItemDB.getTool(this.game.heldItemId());
    this.tool = held && GARDEN_TOOLS.some(t => t.kind && t.kind === held.kind) ? GARDEN_TOOLS.find(t => t.kind === held.kind).id : 'hand';
    this.panel.hidden = false; this.hover = -1; this.particles = [];
    this.titleEl.textContent = 'Garden plot'; this._renderTools(); this._renderSeeds(); this._say('');
    if (!this.raf) this.raf = requestAnimationFrame(t => this._frame(t));
  }
  close() {
    this.panel.hidden = true; cancelAnimationFrame(this.raf); this.raf = 0;
    for (const p of this.pouches.values()) p.dispose();
    this.pouches.clear(); this.pouchHost.textContent = '';
  }

  /* ---- the side list and the tools ---- */
  /** Every seed pack in your bag: { item, count } */
  _packs() {
    const inv = this.game.inventory, seen = new Map();
    for (let i = 0; i < inv.size; i++) { const s = inv.getSlot(i); if (s && ItemDefs[s.id] && ItemDefs[s.id].seed) seen.set(s.id, (seen.get(s.id) || 0) + s.count); }
    return [...seen].map(([item, count]) => ({ item, count }));
  }
  _renderSeeds() {
    const packs = this._packs();
    for (const [item, pouch] of [...this.pouches]) if (!pouch.count() && !pouch.pendingOut) this._closePouch(item);
    if (!packs.length && !this.pouches.size) { this.seedList.innerHTML = '<p class="gardenNone">No seed packs yet. The General Store sells them, and harvests sometimes give a few back.</p>'; return; }
    this.seedList.innerHTML = packs.map(({ item, count }) => {
      const def = ItemDefs[item], ok = this._inSeason(item);
      return `<button class="seedPack${this.pouches.has(item) ? ' open' : ''}${ok ? '' : ' off'}" data-seed="${item}" tabindex="-1" title="${ok ? 'Open the pouch' : `${Farming.seasonNames(def.seed)} only`}">` +
        `<img alt="" src="${ItemIcons.url(item)}"><span class="seedName">${def.name.replace(/ Seeds$/, '')}</span><span class="seedCount">${count}</span>` +
        `<small>${ok ? 'in season' : Farming.seasonNames(def.seed) + ' only'}</small></button>`;
    }).join('');
  }
  _inSeason(item) { const def = ItemDefs[item]; return !!def && Farming.inSeason(def.seed, Seasons.at(this.game.clockTick).index); }
  _renderTools() {
    const inv = this.game.inventory;
    this.toolBar.innerHTML = GARDEN_TOOLS.map(t => {
      const have = !t.kind || Farming.hasTool(inv, t.kind);
      return `<button data-tool="${t.id}" class="${this.tool === t.id ? 'on' : ''}" ${have ? '' : 'disabled'} tabindex="-1" title="${have ? t.hint : 'You need a ' + t.name.toLowerCase()}">` +
        `${t.kind ? `<img alt="" src="${ItemIcons.url(t.id)}">` : '<span class="handIcon">&#x270B;</span>'}<span>${t.name}</span></button>`;
    }).join('');
  }
  _pickTool(id) { this.tool = id; this._renderTools(); const t = GARDEN_TOOLS.find(x => x.id === id); this._say(t ? t.hint : ''); }
  _say(text) { this.hintEl.textContent = text || 'Pick a tool and tap a plot. Open a seed pack to drag its seeds into the holes you dig.'; }

  /* ---- pouches ---- */
  _togglePouch(item) { if (this.pouches.has(item)) this._closePouch(item); else this._openPouch(item); }
  _openPouch(item) {
    if (this.pouches.has(item) || !ItemDefs[item]) return;
    const pouch = new SeedPouch({ item, game: this.game, garden: this, onClose: () => this._closePouch(item) });
    this.pouches.set(item, pouch); this.pouchHost.appendChild(pouch.el); this._renderSeeds();
    if (!this._inSeason(item)) this._say(`${ItemDefs[item].name.replace(/ Seeds$/, '')} only grows in ${Farming.seasonNames(ItemDefs[item].seed)}: it will not take now.`);
  }
  _closePouch(item) { const p = this.pouches.get(item); if (!p) return; p.dispose(); this.pouches.delete(item); this._renderSeeds(); }
  /** A seed is being dragged over the page (clientX null: not over the window): light the hole under it. */
  hoverSeed(item, cx, cy) { this.dragSeed = cx === null ? null : item; this.hover = cx === null ? -1 : this._cellAt(cx, cy); }
  /** A seed was let go at (cx, cy): true if it was planted (the pouch then lets it go). */
  dropSeed(item, cx, cy) {
    const i = this._cellAt(cx, cy), field = this._field(); this.dragSeed = null; this.hover = -1;
    if (i < 0 || !field) return false;
    const plot = field.cells[i], note = text => { this.game.events.emit('notice', { to: this.game.myId, text }); return false; };
    if (plot.c) return note('Something is already planted there');
    if (!plot.h) return note(plot.u ? 'The soil is packed hard: loosen it with the hoe, then dig a hole' : 'Dig a hole with the shovel first');
    if (!this._inSeason(item)) return note(`${ItemDefs[item].name.replace(/ Seeds$/, '')} only grows in ${Farming.seasonNames(ItemDefs[item].seed)}`);
    this.game.fieldOp('plant', this.tile.tx, this.tile.ty, i, item); this._burst(i, 'plant'); this._say('Now cover it with your hand, and water it.');
    return true;
  }

  /* ---- the plots ---- */
  _field() { return this.tile ? this.game.fieldAt(this.tile.tx, this.tile.ty) : null; }
  _rect(i) { return { x: GARDEN_PAD + (i % 3) * GARDEN_CELL, y: GARDEN_PAD + Math.floor(i / 3) * GARDEN_CELL }; }
  /** The plot under a screen point, or -1. */
  _cellAt(cx, cy) {
    const r = this.canvas.getBoundingClientRect(); if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return -1;
    const x = (cx - r.left) / r.width * GARDEN_SIZE - GARDEN_PAD, y = (cy - r.top) / r.height * GARDEN_SIZE - GARDEN_PAD;
    if (x < 0 || y < 0 || x >= GARDEN_CELL * 3 || y >= GARDEN_CELL * 3) return -1;
    return Math.floor(y / GARDEN_CELL) * 3 + Math.floor(x / GARDEN_CELL);
  }
  /** What the chosen tool does to a plot: an op, or '' when there is nothing to do (and why). */
  _opFor(plot) {
    const today = Seasons.at(this.game.clockTick).day;
    if (this.tool === 'hoe') return plot.u ? { op: 'till' } : { why: plot.c ? 'Something is growing there' : 'The soil is loose already' };
    if (this.tool === 'shovel') return plot.c ? { why: 'Something is planted there' } : plot.h ? { why: 'There is a hole there already: drag a seed into it' } : plot.u ? { why: 'Packed hard: loosen it with the hoe first' } : { op: 'dig' };
    if (this.tool === 'watering_can') return plot.w === today ? { why: 'Already watered today' } : { op: 'water' };
    if (Farming.ripe(plot)) return { op: 'harvest' };
    if (plot.c && plot.dead) return { op: 'clear' };
    if (plot.c && !plot.v) return { op: 'cover' };
    if (!plot.c && plot.h) return { op: 'cover' };
    return { why: plot.c ? 'It is still growing: water it each day' : 'Nothing to do here with your hand: dig a hole with the shovel' };
  }
  _use(i) {
    const field = this._field(); if (i < 0 || !field) return;
    const act = this._opFor(field.cells[i]);
    if (!act.op) { this._say(act.why); this.shake[i] = performance.now(); return; }
    const t = GARDEN_TOOLS.find(x => x.id === this.tool);
    if (t && t.kind && !Farming.hasTool(this.game.inventory, t.kind)) { this._say(`You need a ${t.name.toLowerCase()}.`); return; }
    this.game.fieldOp(act.op, this.tile.tx, this.tile.ty, i); this._burst(i, act.op);
    this._say(act.op === 'dig' ? 'Drag a seed from a pouch into the hole.' : act.op === 'cover' ? 'Water it so it can grow.' : act.op === 'harvest' ? 'A fine harvest!' : '');
  }
  _burst(i, op) {
    const r = this._rect(i), cx = r.x + GARDEN_CELL / 2, cy = r.y + GARDEN_CELL / 2, water = op === 'water', gold = op === 'harvest', n = water ? 14 : 10;
    for (let k = 0; k < n; k++) this.particles.push({
      x: cx + (Math.random() - 0.5) * (water ? 60 : 24), y: water ? cy - 46 - Math.random() * 20 : cy + 6, vx: (Math.random() - 0.5) * (water ? 20 : 150), vy: water ? 120 + Math.random() * 80 : -(80 + Math.random() * 120),
      life: 0.5 + Math.random() * 0.3, t: 0, color: water ? '#6cc3f0' : gold ? '#ffe27a' : op === 'plant' ? '#e8d9a0' : '#6b4526', size: water ? 3 : 4, g: water ? 0 : 520
    });
  }

  /* ---- drawing ---- */
  _frame(now) {
    if (!this.isOpen) return;
    const me = this.game.local, field = this._field();
    if (!field || !me || Math.hypot(this.tile.tx + 0.5 - me.x, this.tile.ty + 0.5 - me.y) > Farming.REACH + 2) { this.close(); return; }       // (the field is gone, or you walked away from it)
    this._draw(field, now);
    this.raf = requestAnimationFrame(t => this._frame(t));
  }
  _draw(field, now) {
    const g = this.ctx, k = this.dpr, today = Seasons.at(this.game.clockTick).day, dt = Math.min(0.05, (now - (this.lastDraw || now)) / 1000); this.lastDraw = now;
    g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, GARDEN_SIZE, GARDEN_SIZE); g.imageSmoothingEnabled = false;
    g.fillStyle = '#1d120a'; g.fillRect(0, 0, GARDEN_SIZE, GARDEN_SIZE);                                      // a plank frame round the bed
    g.fillStyle = '#7a5a34'; g.fillRect(3, 3, GARDEN_SIZE - 6, GARDEN_SIZE - 6); g.fillStyle = '#946d3e'; g.fillRect(3, 3, GARDEN_SIZE - 6, 3); g.fillStyle = '#5c4122'; g.fillRect(3, GARDEN_SIZE - 6, GARDEN_SIZE - 6, 3);
    g.fillStyle = '#3a2512'; g.fillRect(GARDEN_PAD - 4, GARDEN_PAD - 4, GARDEN_CELL * 3 + 8, GARDEN_CELL * 3 + 8);
    for (let i = 0; i < 9; i++) this._drawPlot(g, field.cells[i], i, today, now);
    for (const p of this.particles) { p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.particles = this.particles.filter(p => p.t < p.life);
    for (const p of this.particles) { g.globalAlpha = 1 - p.t / p.life; g.fillStyle = p.color; g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
    g.globalAlpha = 1;
  }
  _drawPlot(g, plot, i, today, now) {
    const { x, y } = this._rect(i), S = GARDEN_CELL, cx = x + S / 2, cy = y + S / 2, wet = plot.w === today, packed = !!plot.u, state = Farming.stateOf(plot);
    const sh = this.shake[i] && now - this.shake[i] < 300 ? Math.sin((now - this.shake[i]) * 0.07) * 3 * (1 - (now - this.shake[i]) / 300) : 0, ox = x + sh;
    g.fillStyle = packed ? '#a17c50' : wet ? '#4b2f1b' : '#7a5233'; g.fillRect(ox + 3, y + 3, S - 6, S - 6);                             // the soil
    g.fillStyle = packed ? '#b99468' : wet ? '#5a3a24' : '#8a6040'; g.fillRect(ox + 3, y + 3, S - 6, 4);
    g.fillStyle = packed ? '#8a6a42' : wet ? '#3b2314' : '#6a4529'; g.fillRect(ox + 3, y + S - 7, S - 6, 4);
    for (let n = 0; n < 16; n++) {                                                                                   // specks of earth, the same every frame
      const h = (i * 131 + n * 977) % 997; g.fillStyle = h % 3 ? (wet ? '#3b2314' : '#6a4529') : (packed ? '#c7a574' : '#93694a');
      g.fillRect(ox + 8 + (h * 7) % (S - 20), y + 8 + (h * 13) % (S - 20), 3, 2);
    }
    if (packed) { g.strokeStyle = '#7d5c36'; g.lineWidth = 2; g.beginPath(); g.moveTo(ox + 20, y + 30); g.lineTo(ox + 44, y + 44); g.lineTo(ox + 40, y + 62); g.moveTo(ox + 70, y + 24); g.lineTo(ox + 62, y + 50); g.stroke(); }   // cracks
    else for (let n = 1; n < 4; n++) { g.fillStyle = wet ? 'rgba(20,10,4,.35)' : 'rgba(40,22,10,.28)'; g.fillRect(ox + 8, y + 8 + n * 21, S - 16, 3); }    // furrows
    if (state === 'hole' || state === 'seed') {                                                                      // a dug hole (with the seed in it)
      g.fillStyle = '#1d0f06'; g.beginPath(); g.ellipse(cx + sh, cy + 4, 28, 17, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a170b'; g.beginPath(); g.ellipse(cx + sh, cy + 6, 24, 13, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#9a7248'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx + sh, cy + 4, 28, 17, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      if (state === 'seed') { const crop = Crops.get(plot.c), look = SeedPouch.seedLook(crop ? crop.colors.crop : '#c9b27a'); SeedPouch.drawSeed(g, cx + sh, cy + 6, -0.3, look, 3.2); }
    } else if (plot.c) {                                                                                             // covered: a mound, and the crop on it
      g.fillStyle = wet ? '#3a2314' : '#7d5638'; g.beginPath(); g.ellipse(cx + sh, cy + 22, 34, 14, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = wet ? '#4f301d' : '#946a45'; g.beginPath(); g.ellipse(cx + sh, cy + 19, 30, 11, 0, Math.PI, Math.PI * 2); g.fill();
      PixelCrops.draw(g, cx + sh, cy + 24, plot, 2.5);
      const days = Farming.growDays(plot.c), frac = state === 'ripe' ? 1 : state === 'dead' ? 0 : Math.min(1, plot.d / days);                  // a little growth bar
      g.fillStyle = '#1d120a'; g.fillRect(ox + 22, y + S - 14, S - 44, 6); g.fillStyle = state === 'dead' ? '#7a5a33' : state === 'ripe' ? '#ffe27a' : '#7fd05a'; g.fillRect(ox + 23, y + S - 13, Math.round((S - 46) * frac), 4);
      if (state === 'ripe') { g.strokeStyle = `rgba(255,226,122,${0.55 + 0.35 * Math.sin(now / 250 + i)})`; g.lineWidth = 3; g.strokeRect(ox + 5, y + 5, S - 10, S - 10); }
    }
    if (wet) { g.fillStyle = '#6cc3f0'; g.fillRect(ox + S - 18, y + 9, 5, 5); g.fillRect(ox + S - 17, y + 6, 3, 3); g.fillRect(ox + S - 19, y + 13, 7, 3); }          // a drop: watered today
    const planting = !!this.dragSeed;
    if (this.hover === i) {                                                                                          // what the pointer is over
      const ok = planting ? plot.h && !plot.c : !!this._opFor(plot).op;
      g.strokeStyle = ok ? '#ffe08a' : 'rgba(255,255,255,.35)'; g.lineWidth = ok ? 4 : 2; g.strokeRect(ox + 2, y + 2, S - 4, S - 4);
    }
  }
}
