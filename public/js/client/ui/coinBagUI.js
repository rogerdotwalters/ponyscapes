'use strict';
/* CLIENT - the coin bag: a button opens a cutaway (vertically sliced) sack holding ALL your coins, drawn in chunky pixels and moved by a small
 * physics world (gravity, coins stacking and sliding on each other and the bag's walls). Press a coin and drag it: inside the bag it pushes the
 * others about and can be let go to fall back in; drag it out over the game world and let go to DROP it there (the server puts the coins on the
 * ground at that spot, within a few tiles of you: whoever steps close picks them up, which is how coins change hands).
 *
 * Lots of coins: up to ~110 are shown one by one. Beyond that the pile is made of bigger coins (worth 5, 25, 100, 500 ...): a coin's size says what
 * it is worth, and dragging one out drops that many. The bag follows the purse; coins you drop leave it at once (the purse catches up a moment later). */
class CoinBagUI {
  constructor({ panel, canvas, count, closeButton, game, camera }) {
    this.panel = panel; this.canvas = canvas; this.countEl = count; this.game = game; this.camera = camera;
    this.ctx = canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.coins = []; this.queue = []; this.drag = null; this.ghost = null; this.pendingOut = 0; this.pendingT = 0; this.lastPurse = null; this.raf = 0; this.last = 0; this.hover = 0;
    closeButton.addEventListener('pointerdown', e => { e.preventDefault(); this.close(); });
    canvas.addEventListener('pointerdown', e => this._down(e));
    canvas.addEventListener('pointermove', e => this._move(e));
    canvas.addEventListener('pointerup', e => this._up(e));
    canvas.addEventListener('pointercancel', e => this._up(e, true));
    game.events.on('inventoryChanged', () => this._purseChanged());
  }

  get isOpen() { return !this.panel.hidden; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  open() {
    const was = this.isOpen; this.panel.hidden = false;
    if (!was) { this.coins = []; this.queue = []; this.pendingOut = 0; this.lastPurse = this.game.inventory.purse || 0; this._reconcile(); this.last = performance.now(); this.raf = requestAnimationFrame(t => this._frame(t)); if (typeof Sfx !== 'undefined' && Sfx.bag) Sfx.bag(true); }
  }
  close() {
    const was = this.isOpen; this.panel.hidden = true; this._endDrag(true); cancelAnimationFrame(this.raf); this.raf = 0;
    if (was && typeof Sfx !== 'undefined' && Sfx.bag) Sfx.bag(false);
  }

  /* ---- the bag's shape (low-res art pixels; the canvas is 140 x 170 and shown scaled up with hard edges) ---- */
  static get W() { return 140; }
  static get H() { return 170; }
  /** Half the inside width of the sack at height y: a narrow neck, flaring into a round belly. */
  static halfWidth(y) {
    if (y < 22) return 18;
    if (y < 40) return 18 + (y - 22) / 18 * 2;
    if (y < 100) { const t = (y - 40) / 60; return 20 + 36 * (t * t * (3 - 2 * t)); }
    if (y < 135) return 56 + 4 * (y - 100) / 35;
    const k = (y - 135) / 30; return k >= 1 ? 0 : 60 * Math.sqrt(1 - k * k);
  }
  static get CX() { return 70; }

  /* ---- coins ---- */
  static DENOMS = [1, 5, 25, 100, 500, 2500, 10000, 50000];
  static radiusOf(v) { return 4 + Math.max(0, CoinBagUI.DENOMS.indexOf(v)); }
  /** The pieces that make up `n` coins: one by one up to 110, else the smallest coin size that keeps the count down, plus change in smaller ones. */
  static plan(n) {
    n = Math.max(0, Math.floor(n)); const D = CoinBagUI.DENOMS, out = [];
    if (n <= 110) { for (let i = 0; i < n; i++) out.push(1); return out; }
    let t = 0; while (t < D.length - 1 && n / D[t] > 110) t++;
    let rest = n; const big = Math.floor(rest / D[t]); for (let i = 0; i < big; i++) out.push(D[t]); rest -= big * D[t];
    for (let k = t - 1; k >= 0; k--) { const c = Math.floor(rest / D[k]); for (let i = 0; i < c; i++) out.push(D[k]); rest -= c * D[k]; }
    return out;
  }
  _sum() { let s = 0; for (const c of this.coins) s += c.v; for (const v of this.queue) s += v; return s; }

  _purseChanged() {
    const purse = this.game.inventory.purse || 0;
    if (this.lastPurse !== null && purse < this.lastPurse && this.pendingOut > 0) this.pendingOut = Math.max(0, this.pendingOut - (this.lastPurse - purse));   // the server caught up with a drop
    this.lastPurse = purse;
    if (this.isOpen) this._reconcile();
  }
  /** Make the bag hold what the purse says (less coins already sent out): pour more in, or take coins out (breaking a big coin into change). */
  _reconcile() {
    const target = Math.max(0, (this.game.inventory.purse || 0) - this.pendingOut), have = this._sum();
    this.countEl.textContent = (this.game.inventory.purse || 0).toLocaleString();
    if (target > have) { for (const v of CoinBagUI.plan(target - have)) this.queue.push(v); }
    else if (target < have) {
      let left = have - target;
      while (left > 0 && this.queue.length) { const v = this.queue.pop(); if (v <= left) left -= v; else { for (const c of CoinBagUI.plan(v - left)) this.queue.push(c); left = 0; } }
      const order = [...this.coins].filter(c => c !== (this.drag && this.drag.coin)).sort((a, b) => a.y - b.y);                         // from the top of the pile
      for (const c of order) {
        if (left <= 0) break;
        this.coins.splice(this.coins.indexOf(c), 1);
        if (c.v <= left) left -= c.v; else { for (const v of CoinBagUI.plan(c.v - left)) this._spawn(v, c.x, c.y); left = 0; }
      }
    }
    if (this.coins.length + this.queue.length > 150) this._consolidate(target);
  }
  /** Too many coins to show: re-plan the pile with bigger coins, keeping the places of the coins that stay. */
  _consolidate(total) {
    const plan = CoinBagUI.plan(total).sort((a, b) => b - a), keep = this.coins.filter(c => !(this.drag && c === this.drag.coin)).sort((a, b) => b.y - a.y);
    this.queue = [];
    for (let i = 0; i < plan.length; i++) { if (keep[i]) { keep[i].v = plan[i]; keep[i].r = CoinBagUI.radiusOf(plan[i]); } else this.queue.push(plan[i]); }
    for (const c of keep.slice(plan.length)) this.coins.splice(this.coins.indexOf(c), 1);
  }
  _spawn(v, x, y) {
    const c = { x, y, px: x, py: y, vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 20, v, r: CoinBagUI.radiusOf(v), spin: Math.random() * 6 };
    this.coins.push(c); return c;
  }

  /* ---- the physics: position based (each coin is moved by gravity, then pushed out of whatever it overlaps), run a few times a frame ---- */
  _step(dt) {
    const G = 520, C = this.coins, drag = this.drag && this.drag.coin, iters = 5, cx = CoinBagUI.CX;
    for (const c of C) {
      if (c === drag) continue;
      c.vy += G * dt; c.px = c.x; c.py = c.y; c.x += c.vx * dt; c.y += c.vy * dt;
    }
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < C.length; i++) {
        const a = C[i];
        for (let j = i + 1; j < C.length; j++) {
          const b = C[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
          if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
          const d2 = dx * dx + dy * dy; if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.001, push = (min - d) / d, wa = a === drag ? 0 : 1, wb = b === drag ? 0 : 1, w = wa + wb; if (!w) continue;
          const sx = dx * push, sy = dy * push;
          a.x -= sx * wa / w; a.y -= sy * wa / w; b.x += sx * wb / w; b.y += sy * wb / w;
        }
      }
      for (const c of C) {
        if (c === drag) continue;
        const top = 22 + c.r; if (c.y < top) { c.y = top; if (c.vy < 0) c.vy = 0; }
        const hw = CoinBagUI.halfWidth(c.y) - c.r;
        if (c.y > 135 - 0.01) {                                                                         // the round bottom: keep inside the ellipse (60 x 30 around y 135)
          const ex = (c.x - cx) / (60 - c.r), ey = (c.y - 135) / (30 - c.r), l = Math.hypot(ex, ey);
          if (l > 1) { c.x = cx + (c.x - cx) / l; c.y = 135 + (c.y - 135) / l; }
        } else if (c.x < cx - hw) c.x = cx - hw; else if (c.x > cx + hw) c.x = cx + hw;
      }
    }
    for (const c of C) {
      if (c === drag) continue;
      c.vx = (c.x - c.px) / dt * 0.985; c.vy = (c.y - c.py) / dt * 0.985;                              // (a little loss each step: the coins settle)
      if (Math.abs(c.vx) < 3) c.vx *= 0.8;
      c.spin += c.vx * dt * 0.1;
    }
  }

  _frame(now) {
    if (!this.isOpen) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    for (let n = 0; n < 4 && this.queue.length; n++) { const v = this.queue.shift(), cx = CoinBagUI.CX; this._spawn(v, cx + (Math.random() - 0.5) * 16, 24 + Math.random() * 4); }   // pour them in
    if (this.pendingOut > 0 && (this.pendingT += dt) > 2.5) { this.pendingOut = 0; this.pendingT = 0; this._reconcile(); }   // (a drop the server never confirmed: show the truth)
    const sub = 2; for (let i = 0; i < sub; i++) this._step(dt / sub);
    this._draw();
    this.raf = requestAnimationFrame(t => this._frame(t));
  }

  /* ---- drawing: scan-lines and discs, so everything is hard-edged pixels ---- */
  _draw() {
    const g = this.ctx, W = CoinBagUI.W, H = CoinBagUI.H, cx = CoinBagUI.CX, hw = CoinBagUI.halfWidth;
    g.clearRect(0, 0, W, H);
    const rows = (y0, y1, grow, color) => { g.fillStyle = color; for (let y = y0; y <= y1; y++) { const h = Math.round(hw(y) + grow); if (h > 0 || grow > 0) g.fillRect(cx - h, y, h * 2, 1); } };
    rows(12, 166, 6, '#1d120a');                                                                       // ink outline
    rows(13, 165, 5, '#7a4e2a');                                                                       // the leather wall (cut through: it has thickness)
    rows(13, 165, 2, '#8a5a30');
    g.fillStyle = '#6a4222'; for (let y = 14; y < 165; y++) { const h = Math.round(hw(y)); g.fillRect(cx - h - 5, y, 1, 1); g.fillRect(cx + h + 4, y, 1, 1); }   // outer shading
    rows(14, 164, 0, '#24160b');                                                                       // the inside of the bag
    for (let y = 22; y < 164; y += 1) { const h = Math.round(hw(y)); g.fillStyle = y < 70 ? '#1c1109' : '#2c1b0e'; g.fillRect(cx - h, y, 1, 1); g.fillRect(cx + h - 1, y, 1, 1); }
    g.fillStyle = '#c9a86a'; for (let y = 20; y < 160; y += 5) { const h = Math.round(hw(y)); g.fillRect(cx - h - 3, y, 1, 2); g.fillRect(cx + h + 2, y, 1, 2); }   // stitching down the cut edges
    g.fillStyle = '#1d120a'; g.fillRect(cx - 28, 14, 56, 7); g.fillStyle = '#9a6a38'; g.fillRect(cx - 27, 15, 54, 5); g.fillStyle = '#b98550'; g.fillRect(cx - 27, 15, 54, 1);   // the folded rim of the neck
    g.fillStyle = '#1d120a'; g.fillRect(cx - 26, 20, 52, 1); g.fillStyle = '#2a1a0e'; g.fillRect(cx - 17, 21, 34, 2);
    g.fillStyle = '#1d120a'; g.fillRect(cx - 24, 33, 48, 6); g.fillStyle = '#d6be8c'; g.fillRect(cx - 23, 34, 46, 4); g.fillStyle = '#a08a5a'; for (let x = cx - 23; x < cx + 23; x += 3) g.fillRect(x, 36, 1, 2);   // the rope tied round the neck
    g.fillStyle = '#1d120a'; g.fillRect(cx + 17, 36, 9, 12); g.fillStyle = '#d6be8c'; g.fillRect(cx + 18, 37, 3, 9); g.fillRect(cx + 22, 37, 3, 7);   // its two hanging ends
    for (const c of this.coins) { if (!(this.drag && c === this.drag.coin && this.drag.out)) this._drawCoin(g, c, this.drag && c === this.drag.coin); }
  }
  _drawCoin(g, c, lifted) {
    const x = Math.round(c.x), y = Math.round(c.y), r = c.r, tier = CoinBagUI.DENOMS.indexOf(c.v);
    const disc = (rr, color, dx = 0, dy = 0) => { g.fillStyle = color; for (let j = -rr; j <= rr; j++) { const w = Math.floor(Math.sqrt(rr * rr + rr * 0.5 - j * j)); g.fillRect(x + dx - w, y + dy + j, w * 2 + 1, 1); } };
    disc(r + 1, '#1d120a'); disc(r, lifted ? '#ffe07a' : '#d9a02a'); disc(r - 1, '#f0c24a'); disc(Math.max(1, r - 3), '#d9a02a');            // ink, rim, face, a stamped ring
    g.fillStyle = '#fff0a8'; g.fillRect(x - r + 2, y - r + 2, 2, 1); g.fillRect(x - r + 1, y - r + 3, 1, 2);                                    // a glint
    g.fillStyle = '#9a6a14'; if (tier <= 0) g.fillRect(x, y, 1, 1);
    else if (tier === 1) g.fillRect(x - 1, y - 1, 3, 3);
    else if (tier === 2) { g.fillRect(x - 2, y, 5, 1); g.fillRect(x, y - 2, 1, 5); }
    else { g.fillStyle = tier >= 5 ? '#c83a3a' : '#3a78c8'; g.fillRect(x - 1, y - 1, 3, 3); g.fillStyle = '#fff'; g.fillRect(x - 1, y - 1, 1, 1); }
  }

  /* ---- the pointer: press a coin, drag it, let go ---- */
  _local(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * CoinBagUI.W, y: (e.clientY - r.top) / r.height * CoinBagUI.H, in: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }; }
  _down(e) {
    if (this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); e.stopPropagation();
    const p = this._local(e); let best = null, bd = Infinity;
    for (const c of this.coins) { const d = Math.hypot(c.x - p.x, c.y - p.y) - c.r; if (d < 3 && d < bd) { bd = d; best = c; } }                  // (the nearest one under the finger, with a little slack)
    if (!best) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* (the pointer is already gone) */ }
    this.drag = { coin: best, id: e.pointerId, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, out: false, vx: 0, vy: 0, lx: p.x, ly: p.y, lt: performance.now() };
    best.vx = best.vy = 0; this.canvas.classList.add('grabbing');
  }
  _move(e) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const p = this._local(e), now = performance.now(), dtm = Math.max(1, now - d.lt);
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true;
    d.vx = (p.x - d.lx) / dtm * 1000 * 0.5 + d.vx * 0.5; d.vy = (p.y - d.ly) / dtm * 1000 * 0.5 + d.vy * 0.5; d.lx = p.x; d.ly = p.y; d.lt = now;
    d.coin.x = p.x; d.coin.y = p.y; d.coin.px = p.x; d.coin.py = p.y;
    d.out = !p.in; this._ghostAt(d.out ? e : null, d.coin.v);
  }
  _up(e, cancelled) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const p = this._local(e), c = d.coin, panel = this.panel.getBoundingClientRect();
    const overPanel = e.clientX >= panel.left && e.clientX <= panel.right && e.clientY >= panel.top && e.clientY <= panel.bottom;
    if (!cancelled && !p.in && !overPanel) {                                                            // let go over the world: drop it there
      const w = this.camera.screenToWorld(e.clientX, e.clientY);
      this.game.dropCoins(c.v, w.x, w.y);
      this.coins.splice(this.coins.indexOf(c), 1); this.pendingOut += c.v; this.pendingT = 0;
      this._endDrag(false); return;
    }
    if (!d.moved && !cancelled) {                                                                       // a tap: a flick, and the coins around it jump
      c.vy = -140; c.vx = (Math.random() - 0.5) * 60;
      for (const o of this.coins) if (o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 18) { o.vy -= 50; o.vx += (o.x - c.x) * 3; }
    } else if (!cancelled && p.in) { c.vx = Math.max(-300, Math.min(300, d.vx)); c.vy = Math.max(-300, Math.min(300, d.vy)); }
    if (cancelled || !p.in || !this._inside(c)) { c.x = CoinBagUI.CX + (Math.random() - 0.5) * 10; c.y = 26; c.vx = 0; c.vy = 0; }                   // out of bounds: back in through the neck
    this._endDrag(false);
  }
  _inside(c) { return c.y >= 22 && c.y <= 165 && Math.abs(c.x - CoinBagUI.CX) <= CoinBagUI.halfWidth(Math.min(c.y, 134)) + 2; }
  _endDrag() { this.drag = null; this.canvas.classList.remove('grabbing'); this._ghostAt(null); }
  /** The coin that follows the pointer once it has left the bag (so it can be seen on its way to the world). */
  _ghostAt(e, v) {
    if (!e) { if (this.ghost) { this.ghost.remove(); this.ghost = null; } return; }
    if (!this.ghost) { this.ghost = document.createElement('div'); this.ghost.className = 'coinGhost'; document.body.appendChild(this.ghost); }
    this.ghost.textContent = v > 1 ? (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : v) : '';
    this.ghost.style.left = e.clientX + 'px'; this.ghost.style.top = e.clientY + 'px';
  }
}
