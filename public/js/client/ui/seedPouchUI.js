'use strict';
/* CLIENT - a seed pouch: opening a seed pack in the garden window (gardenUI.js) gives a small cutaway leather pouch, like the coin bag (coinBagUI.js), full
 * of that pack's seeds on a little physics world: gravity, seeds sliding over each other and the pouch's walls, tumbling when they fall.
 *   - press a seed and drag it: inside the pouch it shoves the others about; let go over a dug hole of the field to plant it there (the garden window
 *     decides whether it takes), anywhere else and it drops back in through the neck
 *   - a tap flicks a seed and makes its neighbours jump
 * The pouch always shows the pack's real count: a seed planted leaves it once the server has taken it from your bag. At most ~40 seeds are drawn at once
 * (a bigger pack shows a share of them, and says how many there are). */
class SeedPouch {
  /** @param {{ item: string, game: object, garden: { dropSeed(item, x, y): boolean, hoverSeed(item, x, y) }, onClose(): void }} deps */
  constructor({ item, game, garden, onClose }) {
    this.item = item; this.game = game; this.garden = garden; this.def = ItemDefs[item];
    this.S = 2;
    this.el = document.createElement('div'); this.el.className = 'pouch';
    this.el.innerHTML = '<header><span class="pouchName"></span><button class="pouchClose" tabindex="-1" title="Close the pouch">&#x2715;</button></header><canvas></canvas><div class="pouchCount"></div>';
    this.nameEl = this.el.querySelector('.pouchName'); this.countEl = this.el.querySelector('.pouchCount'); this.canvas = this.el.querySelector('canvas');
    this.nameEl.textContent = this.def ? this.def.name.replace(/ Seeds$/, '') + ' seeds' : 'Seeds';
    this.el.querySelector('.pouchClose').addEventListener('click', e => { e.stopPropagation(); onClose(); });
    this.canvas.width = SeedPouch.W * this.S; this.canvas.height = SeedPouch.H * this.S; this.ctx = this.canvas.getContext('2d');
    this.look = SeedPouch.seedLook(this.def ? this.def.color : '#c9b27a');
    this.seeds = []; this.queue = 0; this.drag = null; this.ghost = null; this.raf = 0; this.last = 0; this.pendingOut = 0; this.pendingT = 0; this.lastCount = this.count(); this.hidden = 0;
    this.canvas.addEventListener('pointerdown', e => this._down(e));
    this.canvas.addEventListener('pointermove', e => this._move(e));
    this.canvas.addEventListener('pointerup', e => this._up(e));
    this.canvas.addEventListener('pointercancel', e => this._up(e, true));
    this._onInv = () => this._changed();
    game.events.on('inventoryChanged', this._onInv);
    this._reconcile();
    this.last = performance.now(); this.raf = requestAnimationFrame(t => this._frame(t));
  }

  static get W() { return 110; }
  static get H() { return 134; }
  static get CX() { return 55; }
  static get CAP() { return 48; }
  static get R() { return 5; }
  /** Half the inside width of the pouch at height y: a narrow neck under the drawstring, a round belly. */
  static halfWidth(y) {
    if (y < 24) return 15;
    if (y < 92) { const t = (y - 24) / 68; return 15 + 29 * (t * t * (3 - 2 * t)); }
    const k = (y - 92) / 34; return k >= 1 ? 0 : 44 * Math.sqrt(1 - k * k);
  }
  /** A seed packet's seeds are pale: the crop's colour, mixed with husk. */
  static seedLook(hex) {
    const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16), mix = (a, b) => Math.round(a * 0.3 + b * 0.7);
    const r = mix((n >> 16) & 255, 205), g = mix((n >> 8) & 255, 178), b = mix(n & 255, 122), h = v => v.toString(16).padStart(2, '0');
    const dark = c => h(Math.round(c * 0.62));
    return { body: '#' + h(r) + h(g) + h(b), lit: '#' + h(Math.min(255, r + 40)) + h(Math.min(255, g + 40)) + h(Math.min(255, b + 40)), shade: '#' + dark(r) + dark(g) + dark(b) };
  }
  /** One seed, lying at angle `ang`, as a few hard pixels: an outline, the husk, a lit edge. (Also used for the seed that follows the pointer.) */
  static drawSeed(g, x, y, ang, look, k = 1) {
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(k, k);
    const body = [[-2, 3], [-1, 5], [0, 7], [1, 5], [2, 3]];                                        // an oval, five rows tall
    g.fillStyle = '#1d120a'; g.fillRect(-1, -3, 3, 1); g.fillRect(-1, 3, 3, 1); for (const [dy, w] of body) g.fillRect(-Math.floor(w / 2) - 1, dy, w + 2, 1);
    g.fillStyle = look.body; for (const [dy, w] of body) g.fillRect(-Math.floor(w / 2), dy, w, 1);
    g.fillStyle = look.shade; g.fillRect(-1, 2, 3, 1); g.fillRect(1, 1, 2, 1); g.fillStyle = look.lit; g.fillRect(-2, -1, 3, 1); g.fillRect(-1, -2, 2, 1);
    g.restore();
  }

  count() { return this.game.inventory.count(this.item); }
  dispose() { cancelAnimationFrame(this.raf); this.raf = 0; this._endDrag(); this.game.events.off && this.game.events.off('inventoryChanged', this._onInv); this.disposed = true; this.el.remove(); }

  /* ---- keeping the pile in step with the pack ---- */
  _shownCount() { return Math.max(0, this.count() - this.pendingOut); }
  _changed() {
    const now = this.count();
    if (now < this.lastCount && this.pendingOut > 0) this.pendingOut = Math.max(0, this.pendingOut - (this.lastCount - now));     // the server caught up with a planted seed
    this.lastCount = now; this._reconcile();
  }
  _reconcile() {
    const total = this._shownCount(), want = Math.min(total, SeedPouch.CAP), have = this.seeds.filter(s => !(this.drag && s === this.drag.seed)).length + this.queue;
    this.hidden = total - want;
    this.countEl.textContent = total ? `${total} seed${total === 1 ? '' : 's'}` : 'Empty';
    this.el.classList.toggle('empty', !total);
    if (want > have) this.queue += want - have;
    else if (want < have) {
      let drop = have - want; const take = Math.min(drop, this.queue); this.queue -= take; drop -= take;
      const mine = this.seeds.filter(s => !(this.drag && s === this.drag.seed)).sort((a, b) => a.y - b.y);                     // from the top of the pile
      for (const s of mine) { if (drop-- <= 0) break; this.seeds.splice(this.seeds.indexOf(s), 1); }
    }
  }
  _spawn(x, y) {
    const s = { x, y, px: x, py: y, vx: (Math.random() - 0.5) * 40, vy: 30 + Math.random() * 40, ang: Math.random() * 6 };
    this.seeds.push(s); return s;
  }

  /* ---- the physics: position based (each seed is moved by gravity, then pushed out of whatever it overlaps), several passes a frame ---- */
  _step(dt) {
    const G = 520, C = this.seeds, drag = this.drag && this.drag.seed, r = SeedPouch.R, cx = SeedPouch.CX, min = r * 1.7;
    for (const c of C) { if (c === drag) continue; c.vy += G * dt; c.px = c.x; c.py = c.y; c.x += c.vx * dt; c.y += c.vy * dt; }
    for (let it = 0; it < 5; it++) {
      for (let i = 0; i < C.length; i++) {
        const a = C[i];
        for (let j = i + 1; j < C.length; j++) {
          const b = C[j], dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
          const d2 = dx * dx + dy * dy; if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.001, push = (min - d) / d, wa = a === drag ? 0 : 1, wb = b === drag ? 0 : 1, w = wa + wb; if (!w) continue;
          const sx = dx * push, sy = dy * push;
          a.x -= sx * wa / w; a.y -= sy * wa / w; b.x += sx * wb / w; b.y += sy * wb / w;
        }
      }
      for (const c of C) {
        if (c === drag) continue;
        if (c.y < 28) { c.y = 28; if (c.vy < 0) c.vy = 0; }
        const hw = SeedPouch.halfWidth(c.y) - r;
        if (c.y > 92) {                                                                                 // the round bottom: keep inside the ellipse (44 x 34 around y 92)
          const ex = (c.x - cx) / Math.max(1, 44 - r), ey = (c.y - 92) / Math.max(1, 34 - r), l = Math.hypot(ex, ey);
          if (l > 1) { c.x = cx + (c.x - cx) / l; c.y = 92 + (c.y - 92) / l; }
        } else if (c.x < cx - hw) c.x = cx - hw; else if (c.x > cx + hw) c.x = cx + hw;
      }
    }
    for (const c of C) {
      if (c === drag) continue;
      c.vx = (c.x - c.px) / dt * 0.985; c.vy = (c.y - c.py) / dt * 0.985;
      if (Math.abs(c.vx) < 4) c.vx *= 0.8;
      c.ang += c.vx * dt * 0.08;
    }
  }
  _frame(now) {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    for (let n = 0; n < 2 && this.queue > 0; n++) { this.queue--; this._spawn(SeedPouch.CX + (Math.random() - 0.5) * 10, 30 + Math.random() * 4); }   // pour them in
    if (this.pendingOut > 0 && (this.pendingT += dt) > 2.5) { this.pendingOut = 0; this.pendingT = 0; this._reconcile(); }              // (a seed the server never took: show the truth)
    for (let i = 0; i < 2; i++) this._step(dt / 2);
    this._draw();
    this.raf = requestAnimationFrame(t => this._frame(t));
  }

  /* ---- drawing: a cutaway leather pouch, a drawstring round its neck ---- */
  _draw() {
    const g = this.ctx, S = this.S, W = SeedPouch.W, H = SeedPouch.H, cx = SeedPouch.CX, hw = SeedPouch.halfWidth;
    g.setTransform(S, 0, 0, S, 0, 0); g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false;
    const rows = (y0, y1, grow, color) => { g.fillStyle = color; for (let y = y0; y <= y1; y++) { const h = Math.round(hw(y) + grow); if (h > 0 || grow > 0) g.fillRect(cx - h, y, h * 2, 1); } };
    rows(12, 130, 5, '#1d120a');                                                                       // ink outline
    rows(13, 129, 4, '#6e5530'); rows(13, 129, 2, '#82683c');                                          // the burlap wall, cut through
    rows(14, 128, 0, '#2a1d0e');                                                                       // the inside
    for (let y = 26; y < 128; y++) { const h = Math.round(hw(y)); g.fillStyle = y < 70 ? '#1f150a' : '#34240f'; g.fillRect(cx - h, y, 1, 1); g.fillRect(cx + h - 1, y, 1, 1); }
    g.fillStyle = '#c9b27a'; for (let y = 22; y < 124; y += 5) { const h = Math.round(hw(y)); g.fillRect(cx - h - 3, y, 1, 2); g.fillRect(cx + h + 2, y, 1, 2); }   // stitching
    g.fillStyle = '#1d120a'; g.fillRect(cx - 22, 12, 44, 7); g.fillStyle = '#9a8048'; g.fillRect(cx - 21, 13, 42, 5); g.fillStyle = '#b89c5c'; g.fillRect(cx - 21, 13, 42, 1);   // the folded rim
    const order = [...this.seeds].sort((a, b) => a.y - b.y);
    for (const s of order) if (!(this.drag && s === this.drag.seed && this.drag.out)) {
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(Math.round(s.x) - 3, Math.round(s.y) + 4, 7, 1);                    // a drop of shadow
      SeedPouch.drawSeed(g, s.x, s.y, s.ang, this.look);
    }
    g.imageSmoothingEnabled = false;                                                                   // the drawstring, over the neck in front of the seeds pouring in
    g.fillStyle = '#1d120a'; g.fillRect(cx - 19, 30, 38, 6); g.fillStyle = '#d6be8c'; g.fillRect(cx - 18, 31, 36, 4); g.fillStyle = '#a08a5a'; for (let x = cx - 18; x < cx + 18; x += 3) g.fillRect(x, 33, 1, 2);
    g.fillStyle = '#1d120a'; g.fillRect(cx + 12, 33, 8, 11); g.fillStyle = '#d6be8c'; g.fillRect(cx + 13, 34, 3, 8); g.fillRect(cx + 17, 34, 2, 6);
    if (this.hidden > 0) { g.fillStyle = '#1d120a'; g.fillRect(cx - 24, 118, 48, 10); g.fillStyle = '#f4e6c1'; g.font = 'bold 8px Georgia'; g.textAlign = 'center'; g.fillText(`+${this.hidden} more`, cx, 126); }
  }

  /* ---- the pointer: press a seed, drag it, let go ---- */
  _local(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * SeedPouch.W, y: (e.clientY - r.top) / r.height * SeedPouch.H, in: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }; }
  _down(e) {
    if (this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); e.stopPropagation();
    const p = this._local(e); let best = null, bd = Infinity;
    for (const s of this.seeds) { const d = Math.hypot(s.x - p.x, s.y - p.y) - SeedPouch.R; if (d < 4 && d < bd) { bd = d; best = s; } }       // (the nearest one under the finger, with a little slack)
    if (!best) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* (the pointer is already gone) */ }
    const now = performance.now();
    this.drag = { seed: best, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, out: false, vx: 0, vy: 0, lx: p.x, ly: p.y, lt: now };
    best.vx = best.vy = 0; this.canvas.classList.add('grabbing');
  }
  _move(e) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const p = this._local(e), now = performance.now(), dtm = Math.max(1, now - d.lt);
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
    d.vx = (p.x - d.lx) / dtm * 1000 * 0.5 + d.vx * 0.5; d.vy = (p.y - d.ly) / dtm * 1000 * 0.5 + d.vy * 0.5; d.lx = p.x; d.ly = p.y; d.lt = now;
    d.seed.x = p.x; d.seed.y = p.y; d.seed.px = p.x; d.seed.py = p.y;
    d.out = !p.in; this._ghostAt(d.out ? e : null);
    this.garden.hoverSeed(this.item, d.out ? e.clientX : null, e.clientY);
  }
  _up(e, cancelled) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const p = this._local(e), s = d.seed;
    this.garden.hoverSeed(this.item, null, 0);
    if (!cancelled && !p.in && d.moved && this.garden.dropSeed(this.item, e.clientX, e.clientY)) {      // planted: the seed leaves the pouch (the server takes it from your bag)
      this.seeds.splice(this.seeds.indexOf(s), 1); this.pendingOut++; this.pendingT = 0; this._endDrag(); return;
    }
    if (!d.moved && !cancelled) {                                                                       // a tap: a flick
      s.vy = -80; s.vx = (Math.random() - 0.5) * 40;
      for (const o of this.seeds) if (o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 18) { o.vy -= 50; o.vx += (o.x - s.x) * 3; }
    } else if (!cancelled && p.in) { s.vx = Math.max(-300, Math.min(300, d.vx)); s.vy = Math.max(-300, Math.min(300, d.vy)); }
    if (cancelled || !p.in || !this._inside(s)) { s.x = SeedPouch.CX + (Math.random() - 0.5) * 8; s.y = 32; s.vx = 0; s.vy = 0; s.px = s.x; s.py = s.y; }   // out of bounds: back in through the neck
    this._endDrag();
  }
  _inside(s) { return s.y >= 26 && s.y <= 126 && Math.abs(s.x - SeedPouch.CX) <= SeedPouch.halfWidth(Math.min(s.y, 91)) + 2; }
  _endDrag() { this.drag = null; this.canvas.classList.remove('grabbing'); this._ghostAt(null); }
  /** The seed that follows the pointer once it has left the pouch (so it can be seen on its way to a hole). */
  _ghostAt(e) {
    if (!e) { if (this.ghost) { this.ghost.remove(); this.ghost = null; } return; }
    if (!this.ghost) {
      const c = document.createElement('canvas'); c.width = c.height = 48; c.className = 'coinGhost';
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false; SeedPouch.drawSeed(g, 24, 24, -0.5, this.look, 3.5);
      document.body.appendChild(c); this.ghost = c;
    }
    const gs = this.ghost.style; gs.left = e.clientX - 24 + 'px'; gs.top = e.clientY - 24 + 'px';
  }
}
