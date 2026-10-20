'use strict';
/* CLIENT - the garden window. Tap a tilled tile with a hoe, trowel, shovel, watering can or seeds in hand and a window shows its nine plots (farming.js), with your
 * SEED PACKS in a scrolling list on the side and a TOOL DRAWER under the bed.
 *   - DRAG a tool out of the drawer onto a plot: the hoe loosens packed soil, the hand trowel (or shovel) digs a hole, the watering can waters. There is no
 *     "selected tool": a tool does its job where you drop it. Your bare hand is implied: TAP a plot to cover a seed, clear a withered crop or pick what is ripe.
 *   - tap a seed pack to open its POUCH (seedPouchUI.js, like the coin bag) beside the window; several can be open at once. Drag a seed out of a pouch onto
 *     a dug, empty hole to plant it: the pouch's count follows what your bag really holds.
 *   - whenever something stops a job (no tool, wrong season, soil packed, too far away) the line under the bed says so, in red.
 * Dig a hole, drop a seed in, cover it, water it; it grows a day for each day it was watered. */
const GARDEN_TOOLS = [
  { id: 'hoe', kind: 'hoe', name: 'Hoe', hint: 'Loosen soil that has packed down' },
  { id: 'hand_trowel', kind: 'trowel', name: 'Hand trowel', hint: 'Dig a hole to plant in' },
  { id: 'shovel', kind: 'shovel', name: 'Shovel', hint: 'Dig a hole to plant in' },
  { id: 'watering_can', kind: 'water', name: 'Watering can', hint: 'Water a plot for today' }
];
const GARDEN_CELL = 34, GARDEN_PAD = 7, GARDEN_ART = GARDEN_CELL * 3 + GARDEN_PAD * 2;      // the bed is drawn in art pixels (like the coin bag) and shown at a whole number of screen pixels each

class GardenUI {
  constructor({ panel, canvas, seedList, toolBar, pouchHost, title, hint, closeButton, game, requestOpen }) {
    Object.assign(this, { panel, canvas, seedList, toolBar, pouchHost, titleEl: title, hintEl: hint, game, requestOpen });
    this.tile = null; this.dragTool = null; this.toolGhost = null; this.warnUntil = 0; this.pouches = new Map(); this.hover = -1; this.dragSeed = null; this.particles = []; this.shake = {}; this.raf = 0;
    this.ctx = canvas.getContext('2d'); this._fit();
    window.addEventListener('resize', () => this.isOpen && this._fit());
    closeButton.addEventListener('click', () => this.close());
    panel.addEventListener('pointerdown', e => { if (e.target === panel) this.close(); });                 // (a tap outside the windows closes it)
    canvas.addEventListener('pointermove', e => { this.hover = this._cellAt(e.clientX, e.clientY); });
    canvas.addEventListener('pointerleave', () => { this.hover = -1; });
    canvas.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.hover = this._cellAt(e.clientX, e.clientY); this._use(this.hover, null); });
    toolBar.addEventListener('pointerdown', e => this._toolDown(e));                                         // (drag a tool out of the drawer onto a plot)
    toolBar.addEventListener('pointermove', e => this._toolMove(e));
    toolBar.addEventListener('pointerup', e => this._toolUp(e, false));
    toolBar.addEventListener('pointercancel', e => this._toolUp(e, true));
    game.events.on('notice', e => { if (this.isOpen && e && e.to === this.game.myId && e.text) this._say(e.text, true); });   // (the server's reasons show in the window too)
    seedList.addEventListener('click', e => { const b = e.target.closest('button[data-seed]'); if (b) this._togglePouch(b.dataset.seed); });
    game.events.on('inventoryChanged', () => { if (this.isOpen) { this._renderSeeds(); if (!this.dragTool) this._renderTools(); } });
    game.events.on('openGarden', e => { if (e && Number.isInteger(e.tx)) this.show(e.tx, e.ty); });
  }

  /** The bed is drawn at 3 screen pixels to the art pixel (2 on a small screen) so the pixels stay crisp. */
  _fit() {
    const room = Math.min(window.innerWidth - 56, (window.innerHeight - 250) * 1.15);                  // (what the screen can hold, less the window's frame and margins)
    this.S = Math.max(1, Math.min(3, Math.floor(room / GARDEN_ART)));
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
    document.body.classList.add('gardenOpen'); this.panel.hidden = false; this.hover = -1; this.particles = []; this.warnUntil = 0; this._fit();
    this.titleEl.textContent = 'Garden plot'; this._renderTools(); this._renderSeeds(); this._say('');
    if (!this.raf) this.raf = requestAnimationFrame(t => this._frame(t));
  }
  close() {
    document.body.classList.remove('gardenOpen'); this.panel.classList.remove('hasPouch'); this.panel.hidden = true; cancelAnimationFrame(this.raf); this.raf = 0; this._toolUp(null, true);
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
    const packs = this._packs(); this.panel.classList.toggle('hasPouch', this.pouches.size > 0);
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
      const have = Farming.hasTool(inv, t.kind);
      return `<button data-tool="${t.id}" class="${have ? '' : 'missing'}" tabindex="-1" title="${have ? 'Drag onto a plot: ' + t.hint : 'You need a ' + t.name.toLowerCase()}">` +
        `<img alt="" draggable="false" src="${ItemIcons.url(t.id)}"><span>${t.name}</span></button>`;
    }).join('');
  }
  /** Say something under the bed; `warn` (a reason a job did not work) shows in red and is kept for a few seconds before the pointer's own hints take over again. */
  _say(text, warn = false) {
    this.hintEl.classList.toggle('warn', !!warn); this.warnUntil = warn ? performance.now() + 3500 : 0;
    this.hintEl.textContent = text || 'Drag a tool from the drawer onto a plot. Tap a plot to pick, cover or clear. Open a seed pack and drag its seeds into the holes you dig.';
  }

  /* ---- the tool drawer: drag a tool onto a plot ---- */
  _toolDown(e) {
    const b = e.target.closest('button[data-tool]'); if (!b || this.dragTool || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = GARDEN_TOOLS.find(x => x.id === b.dataset.tool); if (!t) return;
    if (!Farming.hasTool(this.game.inventory, t.kind)) { this._say(`You need a ${t.name.toLowerCase()} for that. The General Store sells them.`, true); return; }
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* (the pointer is already gone) */ }
    this.dragTool = { id: t.id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, cell: -2 };
    b.classList.add('lifted');
  }
  _toolMove(e) {
    const d = this.dragTool; if (!d || e.pointerId !== d.pid) return;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
    if (!d.moved) return;
    if (!this.toolGhost) {
      const img = document.createElement('img'); img.className = 'coinGhost'; img.alt = ''; img.src = ItemIcons.url(d.id); img.style.cssText = 'width:56px;height:56px;image-rendering:pixelated';
      document.body.appendChild(img); this.toolGhost = img;
    }
    this.toolGhost.style.left = e.clientX - 28 + 'px'; this.toolGhost.style.top = e.clientY - 28 + 'px';
    this.hover = this._cellAt(e.clientX, e.clientY);
    if (this.hover !== d.cell) {                                                                       // (say why it would not work, or what it will do, as it crosses each plot)
      d.cell = this.hover; const field = this._field();
      if (this.hover >= 0 && field) { const act = this._opFor(field.cells[this.hover], d.id); this._say(act.op ? GARDEN_TOOLS.find(x => x.id === d.id).hint : act.why, !act.op); }
    }
  }
  _toolUp(e, cancelled) {
    const d = this.dragTool; if (!d || (e && e.pointerId !== d.pid)) return;
    this.dragTool = null; this.hover = -1;
    if (this.toolGhost) { this.toolGhost.remove(); this.toolGhost = null; }
    const b = this.toolBar.querySelector(`button[data-tool="${d.id}"]`); if (b) b.classList.remove('lifted');
    const t = GARDEN_TOOLS.find(x => x.id === d.id);
    if (cancelled || !e) return;
    if (!d.moved) { this._say(`Drag the ${t.name.toLowerCase()} onto a plot. ${t.hint}.`); return; }          // (a plain tap: tell them how it works)
    const cell = this._cellAt(e.clientX, e.clientY);
    if (cell < 0) { this._say(`Drop the ${t.name.toLowerCase()} onto one of the nine plots.`, true); return; }
    this._use(cell, d.id);
  }

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
    if (i < 0 || !field) { this._say('Drop the seed into a hole in the bed.', true); return false; }
    const plot = field.cells[i], note = text => { this._say(text, true); return false; };
    if (plot.c) return note('Something is already planted there');
    if (!plot.h) return note(plot.u ? 'The soil is packed hard: drag the hoe onto it, then dig a hole' : 'Dig a hole first: drag the hand trowel from the drawer onto this plot');
    if (!this._inSeason(item)) return note(`${ItemDefs[item].name.replace(/ Seeds$/, '')} only grows in ${Farming.seasonNames(ItemDefs[item].seed)}`);
    this.game.fieldOp('plant', this.tile.tx, this.tile.ty, i, item); this._burst(i, 'plant'); this._say('Now tap the seed to cover it with soil, then drag the watering can onto it.');
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
  /** What a tool (or, with none, your bare hand) does to a plot: an op, or why not. */
  _opFor(plot, tool = null) {
    const today = Seasons.at(this.game.clockTick).day;
    if (tool === 'hoe') return plot.u ? { op: 'till' } : { why: plot.c ? 'Something is growing there' : 'The soil is loose already' };
    if (tool === 'shovel' || tool === 'hand_trowel') return plot.c ? { why: 'Something is planted there' } : plot.h ? { why: 'There is a hole there already: drag a seed into it' } : plot.u ? { why: 'The soil is packed hard: drag the hoe onto it first' } : { op: 'dig' };
    if (tool === 'watering_can') return plot.w === today ? { why: 'Already watered today' } : { op: 'water' };
    if (Farming.ripe(plot)) return { op: 'harvest' };
    if (plot.c && plot.dead) return { op: 'clear' };
    if (plot.c && !plot.v) return { op: 'cover' };
    if (plot.c) return { why: 'It is still growing: water it each day with the watering can' };
    if (plot.h) return { why: 'Drag a seed from a pouch into the hole' };
    return { why: plot.u ? 'Packed hard: drag the hoe onto it to loosen it' : 'Drag the hand trowel onto it to dig a hole' };
  }
  /** A line about a plot, for the hint under the bed while the pointer is over it. */
  _describe(plot) {
    const state = Farming.stateOf(plot), crop = plot.c && Crops.get(plot.c), name = crop ? crop.name : '', today = Seasons.at(this.game.clockTick).day, wet = plot.w === today ? ' Watered today.' : '';
    switch (state) {
      case 'packed': return 'Packed soil: loosen it: drag the hoe onto it.';
      case 'loose': return 'Loose soil: dig a hole: drag the trowel onto it.' + wet;
      case 'hole': return 'A hole, ready for a seed: drag one in from a pouch.' + wet;
      case 'seed': return `${name} seed in the hole: tap it to cover it with soil.` + wet;
      case 'growing': return `${name}: day ${plot.d} of ${Farming.growDays(plot.c)}. It grows a day for each day it is watered.` + wet;
      case 'ripe': return `${name} is ripe: tap it to pick it.`;
      default: return `The ${name.toLowerCase()} has withered: tap it to clear it.`;
    }
  }
  /** A tool dropped on plot i, or (tool null) a tap with your bare hand. */
  _use(i, tool = null) {
    const field = this._field(); if (i < 0 || !field) return;
    const act = this._opFor(field.cells[i], tool);
    if (!act.op) { this._say(act.why, true); this.shake[i] = performance.now(); return; }
    const t = tool && GARDEN_TOOLS.find(x => x.id === tool);
    if (t && !Farming.hasTool(this.game.inventory, t.kind)) { this._say(`You need a ${t.name.toLowerCase()}.`, true); return; }
    this.game.fieldOp(act.op, this.tile.tx, this.tile.ty, i); this._burst(i, act.op);
    this._say(act.op === 'dig' ? 'Now drag a seed from a pouch into the hole.' : act.op === 'cover' ? 'Water it so it can grow: drag the watering can onto it.' : act.op === 'harvest' ? 'A fine harvest!' : '');
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
    if (this.hover !== this.lastHover) { this.lastHover = this.hover; if (this.hover >= 0 && !this.dragSeed && !this.dragTool && performance.now() > this.warnUntil) this._say(this._describe(field.cells[this.hover])); }
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
      const ok = this.dragSeed ? plot.h && !plot.c : !!this._opFor(plot, this.dragTool ? this.dragTool.id : null).op;
      g.fillStyle = ok ? '#ffe08a' : 'rgba(241,224,180,.4)';
      g.fillRect(ox, y, C, 1); g.fillRect(ox, y + C - 1, C, 1); g.fillRect(ox, y, 1, C); g.fillRect(ox + C - 1, y, 1, C);
      if (ok) { g.fillStyle = '#1d120a'; g.fillRect(ox + 1, y + 1, C - 2, 1); g.fillRect(ox + 1, y + C - 2, C - 2, 1); g.fillRect(ox + 1, y + 1, 1, C - 2); g.fillRect(ox + C - 2, y + 1, 1, C - 2); }
    }
  }
}
