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
const GARDEN_CELL = 34, GARDEN_PAD = 7, GARDEN_ART = GARDEN_CELL * 3 + GARDEN_PAD * 2;      // the bed is drawn in art pixels (like the coin bag) and shown at a whole number of screen pixels each

class GardenUI {
  constructor({ panel, canvas, seedList, toolBar, pouchHost, title, hint, closeButton, game, requestOpen }) {
    Object.assign(this, { panel, canvas, seedList, toolBar, pouchHost, titleEl: title, hintEl: hint, game, requestOpen });
    this.tile = null; this.tool = 'hand'; this.pouches = new Map(); this.hover = -1; this.dragSeed = null; this.particles = []; this.shake = {}; this.raf = 0;
    this.ctx = canvas.getContext('2d'); this._fit();
    window.addEventListener('resize', () => this.isOpen && this._fit());
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

  /** The bed is drawn at 3 screen pixels to the art pixel (2 on a small screen) so the pixels stay crisp. */
  _fit() {
    this.S = Math.min(window.innerWidth - 60, (window.innerHeight - 250) * 1.15) < GARDEN_ART * 3 ? 2 : 3;
    this.canvas.width = this.canvas.height = GARDEN_ART * this.S; this.canvas.style.width = this.canvas.style.height = GARDEN_ART * this.S + 'px';
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
    this.panel.hidden = false; this.hover = -1; this.particles = []; this._fit();
    this.titleEl.textContent = 'Garden plot'; this._renderTools(); this._renderSeeds(); this._say('');
    if (!this.raf) this.raf = requestAnimationFrame(t => this._frame(t));
  }
  close() {
    this.panel.hidden = true; cancelAnimationFrame(this.raf); this.raf = 0;
    for (const p of this.pouches.values()) p.dispose();
    this.pouches.clear(); this.pouchHost.textContent = '';
  }

  /** The hand tool's picture: a pixel-art open hand (drawn once). */
  static handIcon() {
    if (GardenUI._hand) return GardenUI._hand;
    const rows = ['......KK........', '.....KSSK.KK....', '.....KSSKKSSK...', '.KK..KSSKSSSK...', 'KSSK.KSSKSSSK.KK', 'KSSKKKSSSSSSKKSK', 'KSSSKSSSSSSSKSSK', '.KSSSSSSSSSSSSSK',
      '..KSSSSSSSSSSSK.', '..KSSSSSSSSSSDK.', '...KSSSSSSSSDK..', '...KSSSSSSSDDK..', '....KSSSSSDDK...', '....KKSSSDDKK...', '.....KKDDDKK....', '.......KKKK.....'];
    const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d'), col = { K: '#1d120a', S: '#e8b890', D: '#b98258' };
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x * 3, y * 3, 3, 3); } }));
    g.fillStyle = '#f8dcc0'; for (const [x, y] of [[7, 2], [7, 3], [10, 4], [6, 6], [4, 6]]) g.fillRect(x * 3, y * 3, 3, 3);
    return (GardenUI._hand = c.toDataURL());
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
        `<img alt="" src="${t.kind ? ItemIcons.url(t.id) : GardenUI.handIcon()}"><span>${t.name}</span></button>`;
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
    const x = (cx - r.left) / r.width * GARDEN_ART - GARDEN_PAD, y = (cy - r.top) / r.height * GARDEN_ART - GARDEN_PAD;
    if (x < 0 || y < 0 || x >= GARDEN_CELL * 3 || y >= GARDEN_CELL * 3) return -1;
    return Math.floor(y / GARDEN_CELL) * 3 + Math.floor(x / GARDEN_CELL);
  }
  /** What the chosen tool does to a plot: an op, or why not. */
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
  /** A line about a plot, for the hint under the bed while the pointer is over it. */
  _describe(plot) {
    const state = Farming.stateOf(plot), crop = plot.c && Crops.get(plot.c), name = crop ? crop.name : '', today = Seasons.at(this.game.clockTick).day, wet = plot.w === today ? ' Watered today.' : '';
    switch (state) {
      case 'packed': return 'Packed soil: loosen it with the hoe.';
      case 'loose': return 'Loose soil: dig a hole with the shovel.' + wet;
      case 'hole': return 'A hole, ready for a seed: drag one in from a pouch.' + wet;
      case 'seed': return `${name} seed in the hole: cover it with your hand.` + wet;
      case 'growing': return `${name}: day ${plot.d} of ${Farming.growDays(plot.c)}. It grows a day for each day it is watered.` + wet;
      case 'ripe': return `${name} is ripe: pick it with your hand.`;
      default: return `The ${name.toLowerCase()} has withered: clear it with your hand.`;
    }
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
  /** A burst of art-pixel specks: earth for digging and covering, drops for water, gold for a harvest. */
  _burst(i, op) {
    const r = this._rect(i), cx = r.x + GARDEN_CELL / 2, cy = r.y + GARDEN_CELL / 2, water = op === 'water', gold = op === 'harvest', n = water ? 14 : 10;
    for (let k = 0; k < n; k++) this.particles.push({
      x: Math.round(cx + (Math.random() - 0.5) * (water ? 20 : 8)), y: Math.round(water ? cy - 15 - Math.random() * 6 : cy + 2), vx: (Math.random() - 0.5) * (water ? 6 : 50), vy: water ? 40 + Math.random() * 26 : -(26 + Math.random() * 40),
      life: 0.5 + Math.random() * 0.3, t: 0, color: water ? (k % 3 ? '#6cc3f0' : '#bfe8ff') : gold ? (k % 2 ? '#ffe27a' : '#fff3b0') : op === 'plant' ? '#e8d9a0' : (k % 2 ? '#6b4526' : '#8a6040'), size: water ? 1 : 2, g: water ? 0 : 170
    });
  }

  /* ---- drawing (pixel art, in art pixels: the canvas is scaled by whole numbers) ---- */
  _frame(now) {
    if (!this.isOpen) return;
    const me = this.game.local, field = this._field();
    if (!field || !me || Math.hypot(this.tile.tx + 0.5 - me.x, this.tile.ty + 0.5 - me.y) > Farming.REACH + 2) { this.close(); return; }       // (the field is gone, or you walked away from it)
    if (this.hover !== this.lastHover) { this.lastHover = this.hover; if (this.hover >= 0 && !this.dragSeed) this._say(this._describe(field.cells[this.hover])); }
    this._draw(field, now);
    this.raf = requestAnimationFrame(t => this._frame(t));
  }
  /** A filled pixel ellipse (hard edges). */
  static ellipse(g, cx, cy, rx, ry, color) {
    g.fillStyle = color;
    for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5))))); g.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
  }
  _draw(field, now) {
    const g = this.ctx, S = this.S, today = Seasons.at(this.game.clockTick).day, dt = Math.min(0.05, (now - (this.lastDraw || now)) / 1000), A = GARDEN_ART; this.lastDraw = now;
    g.setTransform(S, 0, 0, S, 0, 0); g.clearRect(0, 0, A, A); g.imageSmoothingEnabled = false;
    g.fillStyle = '#1d120a'; g.fillRect(0, 0, A, A);                                                              // the wooden frame: inked, lit above, shaded below
    g.fillStyle = '#8a5f32'; g.fillRect(1, 1, A - 2, A - 2); g.fillStyle = '#b98a50'; g.fillRect(1, 1, A - 2, 1); g.fillRect(1, 1, 1, A - 2);
    g.fillStyle = '#5a3a1e'; g.fillRect(1, A - 2, A - 2, 1); g.fillRect(A - 2, 1, 1, A - 2);
    g.fillStyle = '#74512a'; for (let y = 4; y < A - 4; y += 5) { g.fillRect(2, y, GARDEN_PAD - 4, 1); g.fillRect(A - GARDEN_PAD + 2, y + 2, GARDEN_PAD - 4, 1); }   // grain
    for (const [x, y] of [[3, 3], [A - 4, 3], [3, A - 4], [A - 4, A - 4]]) { g.fillStyle = '#1d120a'; g.fillRect(x - 1, y - 1, 3, 3); g.fillStyle = '#d6be8c'; g.fillRect(x, y, 1, 1); }   // nails
    g.fillStyle = '#1d120a'; g.fillRect(GARDEN_PAD - 2, GARDEN_PAD - 2, GARDEN_CELL * 3 + 4, GARDEN_CELL * 3 + 4);
    for (let i = 0; i < 9; i++) this._drawPlot(g, field.cells[i], i, today, now);
    for (const p of this.particles) { p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.particles = this.particles.filter(p => p.t < p.life);
    for (const p of this.particles) { g.fillStyle = p.color; g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
  }
  _drawPlot(g, plot, i, today, now) {
    const { x, y } = this._rect(i), C = GARDEN_CELL, state = Farming.stateOf(plot), wet = plot.w === today, packed = state === 'packed';
    const age = this.shake[i] ? now - this.shake[i] : 999, sh = age < 300 ? Math.round(Math.sin(age * 0.07) * 2 * (1 - age / 300)) : 0, ox = x + sh, cx = ox + C / 2 | 0, cy = y + C / 2 | 0;
    const base = packed ? '#a17c50' : wet ? '#4b2f1b' : '#7a5233', hi = packed ? '#b99468' : wet ? '#5a3a24' : '#8a6040', lo = packed ? '#8a6a42' : wet ? '#3b2314' : '#6a4529';
    g.fillStyle = '#1d120a'; g.fillRect(ox, y, C, C);                                                                   // an inked bed square
    g.fillStyle = base; g.fillRect(ox + 1, y + 1, C - 2, C - 2); g.fillStyle = hi; g.fillRect(ox + 1, y + 1, C - 2, 1); g.fillStyle = lo; g.fillRect(ox + 1, y + C - 2, C - 2, 1);
    for (let n = 0; n < 14; n++) {                                                                                       // specks of earth (the same every frame)
      const h = (i * 131 + n * 977) % 997; g.fillStyle = h % 3 ? lo : packed ? '#c7a574' : '#93694a';
      g.fillRect(ox + 3 + (h * 7) % (C - 8), y + 3 + (h * 13) % (C - 8), h % 4 ? 1 : 2, 1);
    }
    if (packed) { g.fillStyle = '#6e4f2c'; for (const [dx, dy] of [[6, 8], [7, 9], [8, 10], [9, 11], [9, 12], [8, 13], [20, 6], [19, 7], [19, 8], [18, 9], [17, 10]]) g.fillRect(ox + dx, y + dy, 1, 1); }   // cracks
    else { g.fillStyle = wet ? 'rgba(20,10,4,.4)' : 'rgba(40,22,10,.3)'; for (let n = 1; n < 4; n++) { g.fillRect(ox + 3, y + 3 + n * 7, C - 6, 1); } }   // furrows
    if (state === 'hole' || state === 'seed') {                                                                          // a dug hole (with the seed in it)
      GardenUI.ellipse(g, cx, cy + 1, 12, 7, '#1d120a'); GardenUI.ellipse(g, cx, cy, 11, 6, '#a47a4c'); GardenUI.ellipse(g, cx, cy + 1, 10, 6, '#2a170b'); GardenUI.ellipse(g, cx, cy + 2, 8, 4, '#1d0f06');
      if (state === 'seed') { const crop = Crops.get(plot.c); SeedPouch.drawSeed(g, cx, cy + 2, -0.25, SeedPouch.seedLook(crop ? crop.colors.crop : '#c9b27a'), 1); }
    } else if (plot.c) {                                                                                                // covered: a mound, and the crop on it
      GardenUI.ellipse(g, cx, cy + 6, 13, 5, '#1d120a'); GardenUI.ellipse(g, cx, cy + 6, 12, 4, wet ? '#3a2314' : '#7d5638'); GardenUI.ellipse(g, cx, cy + 5, 10, 2, wet ? '#4f301d' : '#9a6f48');
      PixelCrops.draw(g, cx, cy + 7, plot, 1 / 1.25);                                                                   // (one art pixel of the crop to one of the bed)
      const frac = state === 'ripe' ? 1 : state === 'dead' ? 0 : Math.min(1, plot.d / Farming.growDays(plot.c)), bw = C - 14;   // a little growth bar
      g.fillStyle = '#1d120a'; g.fillRect(ox + 6, y + C - 6, bw, 4); g.fillStyle = '#3a2a16'; g.fillRect(ox + 7, y + C - 5, bw - 2, 2);
      g.fillStyle = state === 'dead' ? '#7a5a33' : state === 'ripe' ? '#ffe27a' : '#7fd05a'; g.fillRect(ox + 7, y + C - 5, Math.round((bw - 2) * frac), 2);
    }
    if (state === 'ripe' && Math.sin(now / 260 + i) > -0.2) { g.fillStyle = '#ffe27a'; for (const [dx, dy] of [[2, 2], [C - 5, 2], [2, C - 5], [C - 5, C - 5]]) { g.fillRect(ox + dx, y + dy, 3, 1); g.fillRect(ox + dx, y + dy, 1, 3); } }   // gold corners: ready to pick
    if (wet) { g.fillStyle = '#1d120a'; g.fillRect(ox + C - 8, y + 3, 5, 6); g.fillStyle = '#6cc3f0'; g.fillRect(ox + C - 7, y + 5, 3, 3); g.fillRect(ox + C - 6, y + 4, 1, 1); g.fillStyle = '#bfe8ff'; g.fillRect(ox + C - 7, y + 5, 1, 1); }   // a drop: watered today
    if (this.hover === i) {                                                                                              // what the pointer is over
      const ok = this.dragSeed ? plot.h && !plot.c : !!this._opFor(plot).op;
      g.fillStyle = ok ? '#ffe08a' : 'rgba(241,224,180,.4)';
      g.fillRect(ox, y, C, 1); g.fillRect(ox, y + C - 1, C, 1); g.fillRect(ox, y, 1, C); g.fillRect(ox + C - 1, y, 1, C);
      if (ok) { g.fillStyle = '#1d120a'; g.fillRect(ox + 1, y + 1, C - 2, 1); g.fillRect(ox + 1, y + C - 2, C - 2, 1); g.fillRect(ox + 1, y + 1, 1, C - 2); g.fillRect(ox + C - 2, y + 1, 1, C - 2); }
    }
  }
}
