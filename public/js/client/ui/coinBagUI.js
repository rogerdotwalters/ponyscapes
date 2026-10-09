'use strict';
/* CLIENT - the coin bag: the Coins button floats a cutaway (vertically sliced) sack over the world, with no window round it (tap outside to close). It holds
 * ALL your coins, real ones of ten kinds (coins.js: copper, silver, gold, platinum, titanium, then the gem coins), drawn as big pixel-art medieval coins
 * (coinArt.js) that move on a small physics world: gravity, coins stacking and sliding on each other and on the bag's walls, tumbling when they fall.
 *   - at a SHOP counter the bag opens beside the shop window in PAY mode (startPay): you hold a coin and drag it onto the counter tray; the coins you
 *     put down count towards the price, and the shop gives change
 *   - press a coin and drag it: inside the bag it shoves the others about; let go over the game world to DROP it there (the server puts it on the ground
 *     at that spot, within a few tiles of you: whoever steps close picks it up, which is how coins change hands)
 *   - double-tap a coin to BREAK it into the kind below (a platinum into ten gold ...), "Merge coins" turns every full set back into the next kind
 *   - a tap flicks a coin and makes its neighbours jump
 * At most ~64 coins are drawn at once (a bigger purse shows a share of each kind; merging makes them fewer). */
class CoinBagUI {
  constructor({ panel, canvas, count, breakdown, mergeButton, game, camera }) {
    this.panel = panel; this.canvas = canvas; this.countEl = count; this.breakEl = breakdown; this.game = game; this.camera = camera;
    this.S = 3; this._fit();
    this.ctx = canvas.getContext('2d');
    this.pay = null; this.offered = Coins.empty();                                                    // pay mode: { zone, onOffer } and the coins put down on the counter so far
    window.addEventListener('resize', () => this.isOpen && this._fit());
    this.coins = []; this.queue = []; this.drag = null; this.ghost = null; this.raf = 0; this.last = 0;
    this.pendingOut = Coins.empty(); this.pendingT = 0; this.lastCoins = Coins.empty(); this.hint = null; this.lastTap = null; this.hidden = 0;
    mergeButton.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); game.coinChange('merge'); });
    canvas.addEventListener('pointerdown', e => this._down(e));
    canvas.addEventListener('pointermove', e => this._move(e));
    canvas.addEventListener('pointerup', e => this._up(e));
    canvas.addEventListener('pointercancel', e => this._up(e, true));
    game.events.on('inventoryChanged', () => this._purseChanged());
  }

  /** The canvas is drawn at a whole number of screen pixels per art pixel (2 to 4), as big as the screen allows, so the pixels stay crisp. */
  _fit() {
    const avail = Math.min(540, window.innerHeight - (this.pay ? 190 : 300)), k = Math.max(2, Math.min(4, Math.floor(avail / CoinBagUI.H)));
    this.S = k; this.canvas.width = CoinBagUI.W * k; this.canvas.height = CoinBagUI.H * k;
    this.canvas.style.width = CoinBagUI.W * k + 'px'; this.canvas.style.height = CoinBagUI.H * k + 'px';
  }

  /* ---- pay mode (the shop): coins dragged onto `zone` (an element) are put down on the counter instead of dropped on the world ---- */
  startPay({ zone, onOffer }) {
    this.pay = { zone, onOffer }; this.offered = Coins.empty(); this.panel.classList.add('pay');
    if (!this.isOpen) this.open(); else { this._fit(); this._reconcile(); }
  }
  endPay() {
    if (!this.pay) return;
    this.pay.zone.classList.remove('over'); this.pay = null; this.offered = Coins.empty(); this.panel.classList.remove('pay');
    if (this.isOpen) { this._fit(); this._reconcile(); }
  }
  /** Take a coin back off the counter into the bag. */
  unoffer(t) { if (this.offered[t] > 0) { this.offered[t]--; this._reconcile(); if (this.pay) this.pay.onOffer(this.offered.slice()); } }
  /** The coins on the counter have been handed to the shop (the server will take them): they leave the bag for good once the purse catches up. */
  commitOffer() { for (let t = 0; t < Coins.N; t++) this.pendingOut[t] += this.offered[t]; this.offered = Coins.empty(); this.pendingT = 0; if (this.pay) this.pay.onOffer(this.offered.slice()); this._reconcile(); }

  get isOpen() { return !this.panel.hidden; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  open() {
    const was = this.isOpen; this.panel.hidden = false;
    if (was) return;
    this.coins = []; this.queue = []; this.pendingOut = Coins.empty(); this.hint = null; this.lastTap = null; this._fit();
    if (!this.pay) this.offered = Coins.empty();
    this.lastCoins = (this.game.inventory.coins || Coins.empty()).slice(); this._reconcile();
    this.last = performance.now(); this.raf = requestAnimationFrame(t => this._frame(t));
    if (typeof Sfx !== 'undefined' && Sfx.bag) Sfx.bag(true);
  }
  close() {
    const was = this.isOpen; this.panel.hidden = true; this._endDrag(); cancelAnimationFrame(this.raf); this.raf = 0; this.endPay();
    if (was && typeof Sfx !== 'undefined' && Sfx.bag) Sfx.bag(false);
  }

  /* ---- the bag's shape (art units; the canvas is 140 x 170 of them, drawn at 4x) ---- */
  static get W() { return 140; }
  static get H() { return 170; }
  static get CX() { return 70; }
  /** Half the inside width of the sack at height y: a narrow neck, flaring into a round belly. */
  static halfWidth(y) {
    if (y < 22) return 18;
    if (y < 40) return 18 + (y - 22) / 18 * 2;
    if (y < 100) { const t = (y - 40) / 60; return 20 + 36 * (t * t * (3 - 2 * t)); }
    if (y < 135) return 56 + 4 * (y - 100) / 35;
    const k = (y - 135) / 30; return k >= 1 ? 0 : 60 * Math.sqrt(1 - k * k);
  }
  static radiusOf(t) { return 8 + 0.9 * t; }                                                       // a bigger kind is a bigger coin

  /* ---- keeping the pile in step with the purse ---- */
  /** What the bag should show: the purse's coins (less those just dragged out and not yet confirmed), at most ~64 of them. */
  _desired() {
    const have = this.game.inventory.coins || Coins.empty(), want = have.map((n, t) => Math.max(0, n - this.pendingOut[t] - this.offered[t])), sum = want.reduce((a, b) => a + b, 0), cap = 64;
    this.hidden = 0; if (sum <= cap) return want;
    const out = want.map(n => (n ? Math.max(1, Math.floor(n * cap / sum)) : 0));
    this.hidden = sum - out.reduce((a, b) => a + b, 0); return out;
  }
  _purseChanged() {
    const now = this.game.inventory.coins || Coins.empty();
    for (let t = 0; t < Coins.N; t++) if (now[t] < this.lastCoins[t] && this.pendingOut[t] > 0) this.pendingOut[t] = Math.max(0, this.pendingOut[t] - (this.lastCoins[t] - now[t]));   // the server caught up with a drop
    this.lastCoins = now.slice();
    if (this.isOpen) this._reconcile();
  }
  _reconcile() {
    const want = this._desired(), inv = this.game.inventory;
    this.countEl.textContent = Coins.format(inv.coins || Coins.empty());
    this.breakEl.textContent = this.hidden ? `Showing ${(this._shown()).toLocaleString()} of your coins: merge them to see them all` : '';
    for (let t = 0; t < Coins.N; t++) {
      const mine = this.coins.filter(c => c.t === t && !(this.drag && c === this.drag.coin)), queued = this.queue.filter(q => q.t === t).length, have = mine.length + queued;
      if (want[t] > have) for (let i = 0; i < want[t] - have; i++) this.queue.push({ t });
      else if (want[t] < have) {
        let drop = have - want[t];
        for (let i = this.queue.length - 1; i >= 0 && drop > 0; i--) if (this.queue[i].t === t) { this.queue.splice(i, 1); drop--; }
        mine.sort((a, b) => a.y - b.y);                                                                  // from the top of the pile
        for (const c of mine) { if (drop-- <= 0) break; this.coins.splice(this.coins.indexOf(c), 1); }
      }
    }
  }
  _shown() { return this.coins.length + this.queue.length + this.hidden; }
  _spawn(t, x, y) {
    const c = { x, y, px: x, py: y, vx: (Math.random() - 0.5) * 40, vy: 30 + Math.random() * 40, t, r: CoinBagUI.radiusOf(t), flip: Math.random() * 6, ang: Math.random() * 6 };
    this.coins.push(c); return c;
  }

  /* ---- the physics: position based (each coin is moved by gravity, then pushed out of whatever it overlaps), several passes a frame ---- */
  _step(dt) {
    const G = 560, C = this.coins, drag = this.drag && this.drag.coin, iters = 6, cx = CoinBagUI.CX;
    for (const c of C) { if (c === drag) continue; c.vy += G * dt; c.px = c.x; c.py = c.y; c.x += c.vx * dt; c.y += c.vy * dt; }
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < C.length; i++) {
        const a = C[i];
        for (let j = i + 1; j < C.length; j++) {
          const b = C[j], dx = b.x - a.x, dy = b.y - a.y, min = (a.r + b.r) * 0.97;
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
          const ex = (c.x - cx) / Math.max(1, 60 - c.r), ey = (c.y - 135) / Math.max(1, 30 - c.r), l = Math.hypot(ex, ey);
          if (l > 1) { c.x = cx + (c.x - cx) / l; c.y = 135 + (c.y - 135) / l; }
        } else if (c.x < cx - hw) c.x = cx - hw; else if (c.x > cx + hw) c.x = cx + hw;
      }
    }
    for (const c of C) {
      if (c === drag) continue;
      c.vx = (c.x - c.px) / dt * 0.985; c.vy = (c.y - c.py) / dt * 0.985;                              // (a little loss each step: the coins settle)
      if (Math.abs(c.vx) < 4) c.vx *= 0.8;
      const sp = Math.hypot(c.vx, c.vy);
      if (sp > 45) c.flip += sp * dt * 0.035 * (c.vx >= 0 ? 1 : -1); else c.flip += (Math.round(c.flip / Math.PI) * Math.PI - c.flip) * Math.min(1, dt * 6);   // tumbling while it moves, lying flat when it stops
      c.ang += c.vx * dt * 0.04;
    }
  }

  _frame(now) {
    if (!this.isOpen) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    for (let n = 0; n < 3 && this.queue.length; n++) {                                                  // pour them in (or let them fall out of a coin that was just broken)
      const q = this.queue.shift(), h = this.hint && this.hint.t === q.t && now < this.hint.until ? this.hint : null, cx = CoinBagUI.CX;
      this._spawn(q.t, h ? h.x + (Math.random() - 0.5) * 8 : cx + (Math.random() - 0.5) * 14, h ? h.y : 26 + Math.random() * 4);
    }
    if (this.pendingOut.some(n => n > 0) && (this.pendingT += dt) > 2.5) { this.pendingOut = Coins.empty(); this.pendingT = 0; this._reconcile(); }   // (a drop the server never confirmed: show the truth)
    for (let i = 0; i < 2; i++) this._step(dt / 2);
    this._draw();
    this.raf = requestAnimationFrame(t => this._frame(t));
  }

  /* ---- drawing ---- */
  _draw() {
    const g = this.ctx, S = this.S, W = CoinBagUI.W, H = CoinBagUI.H, cx = CoinBagUI.CX, hw = CoinBagUI.halfWidth;
    g.setTransform(S, 0, 0, S, 0, 0); g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false;
    const rows = (y0, y1, grow, color) => { g.fillStyle = color; for (let y = y0; y <= y1; y++) { const h = Math.round(hw(y) + grow); if (h > 0 || grow > 0) g.fillRect(cx - h, y, h * 2, 1); } };
    rows(12, 166, 6, '#1d120a');                                                                       // ink outline
    rows(13, 165, 5, '#7a4e2a');                                                                       // the leather wall (cut through: it has thickness)
    rows(13, 165, 2, '#8a5a30');
    g.fillStyle = '#6a4222'; for (let y = 14; y < 165; y++) { const h = Math.round(hw(y)); g.fillRect(cx - h - 5, y, 1, 1); g.fillRect(cx + h + 4, y, 1, 1); }
    rows(14, 164, 0, '#24160b');                                                                       // the inside of the bag
    for (let y = 22; y < 164; y++) { const h = Math.round(hw(y)); g.fillStyle = y < 70 ? '#1c1109' : '#2c1b0e'; g.fillRect(cx - h, y, 1, 1); g.fillRect(cx + h - 1, y, 1, 1); }
    g.fillStyle = '#c9a86a'; for (let y = 20; y < 160; y += 5) { const h = Math.round(hw(y)); g.fillRect(cx - h - 3, y, 1, 2); g.fillRect(cx + h + 2, y, 1, 2); }   // stitching down the cut edges
    g.fillStyle = '#1d120a'; g.fillRect(cx - 28, 14, 56, 7); g.fillStyle = '#9a6a38'; g.fillRect(cx - 27, 15, 54, 5); g.fillStyle = '#b98550'; g.fillRect(cx - 27, 15, 54, 1);   // the folded rim of the neck
    g.fillStyle = '#1d120a'; g.fillRect(cx - 26, 20, 52, 1); g.fillStyle = '#2a1a0e'; g.fillRect(cx - 17, 21, 34, 2);
    const order = [...this.coins].sort((a, b) => a.y - b.y);
    for (const c of order) if (!(this.drag && c === this.drag.coin && this.drag.out)) this._shadow(g, c);
    for (const c of order) if (!(this.drag && c === this.drag.coin && this.drag.out)) CoinArt.draw(g, c.x, c.y, c.r, 0.5 + 0.36 * Math.abs(Math.cos(c.flip)), c.t, !!(this.drag && c === this.drag.coin));
    g.imageSmoothingEnabled = false;                                                                   // the rope is drawn over the neck, in front of the coins pouring in
    g.fillStyle = '#1d120a'; g.fillRect(cx - 24, 33, 48, 6); g.fillStyle = '#d6be8c'; g.fillRect(cx - 23, 34, 46, 4); g.fillStyle = '#a08a5a'; for (let x = cx - 23; x < cx + 23; x += 3) g.fillRect(x, 36, 1, 2);
    g.fillStyle = '#1d120a'; g.fillRect(cx + 17, 36, 9, 12); g.fillStyle = '#d6be8c'; g.fillRect(cx + 18, 37, 3, 9); g.fillRect(cx + 22, 37, 3, 7);
  }
  _shadow(g, c) {                                                                                       // a dark pixel ellipse under the coin
    g.fillStyle = 'rgba(0,0,0,.3)'; const rx = Math.round(c.r), ry = Math.max(2, Math.round(c.r * 0.5)), cx = Math.round(c.x) + 1, cy = Math.round(c.y + c.r * 0.35) + 2;
    for (let j = -ry; j <= ry; j++) { const w = Math.round(rx * Math.sqrt(1 - (j * j) / (ry * ry))); g.fillRect(cx - w, cy + j, w * 2 + 1, 1); }
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
    const now = performance.now();
    this.drag = { coin: best, id: e.pointerId, sx: e.clientX, sy: e.clientY, t: now, moved: false, out: false, vx: 0, vy: 0, lx: p.x, ly: p.y, lt: now };
    best.vx = best.vy = 0; this.canvas.classList.add('grabbing');
  }
  _move(e) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const p = this._local(e), now = performance.now(), dtm = Math.max(1, now - d.lt);
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) d.moved = true;
    d.vx = (p.x - d.lx) / dtm * 1000 * 0.5 + d.vx * 0.5; d.vy = (p.y - d.ly) / dtm * 1000 * 0.5 + d.vy * 0.5; d.lx = p.x; d.ly = p.y; d.lt = now;
    d.coin.x = p.x; d.coin.y = p.y; d.coin.px = p.x; d.coin.py = p.y;
    d.out = !p.in; this._ghostAt(d.out ? e : null, d.coin.t);
    if (this.pay) this.pay.zone.classList.toggle('over', this._inZone(e));
  }
  _up(e, cancelled) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const p = this._local(e), c = d.coin, T = Coins.TIERS[c.t];
    if (this.pay) this.pay.zone.classList.remove('over');
    if (!cancelled && !p.in && d.moved && this.pay) {                                                   // paying: let go over the counter to put the coin down (anywhere else, it goes back in the bag)
      if (this._inZone(e)) {
        this.coins.splice(this.coins.indexOf(c), 1); this.offered[c.t]++; this.pay.onOffer(this.offered.slice()); this._endDrag(); return;
      }
    } else if (!cancelled && !p.in && d.moved) {                                                         // let go over the world: drop it there
      const w = this.camera.screenToWorld(e.clientX, e.clientY);
      this.game.dropCoins(T.id, 1, w.x, w.y);
      this.coins.splice(this.coins.indexOf(c), 1); this.pendingOut[c.t]++; this.pendingT = 0;
      this._endDrag(); return;
    }
    if (!d.moved && !cancelled) {                                                                       // a tap: a flick (a quick second tap breaks the coin)
      const now = performance.now(), again = this.lastTap && this.lastTap.tier === c.t && now - this.lastTap.time < 380 && Math.hypot(this.lastTap.x - p.x, this.lastTap.y - p.y) < 16;
      if (again && c.t > 0 && (this.game.inventory.coins || [])[c.t] > this.pendingOut[c.t]) {
        this.hint = { t: c.t - 1, x: c.x, y: c.y, until: now + 800 };                                    // (the pieces fall out where the coin was)
        this.coins.splice(this.coins.indexOf(c), 1); this.pendingOut[c.t]++; this.pendingT = 0; this.lastTap = null;
        this.game.coinChange('break', T.id); this._endDrag(); return;
      }
      this.lastTap = { tier: c.t, time: now, x: p.x, y: p.y };
      c.vy = -80; c.vx = (Math.random() - 0.5) * 40;
      for (const o of this.coins) if (o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 22) { o.vy -= 55; o.vx += (o.x - c.x) * 3; }
    } else if (!cancelled && p.in) { c.vx = Math.max(-320, Math.min(320, d.vx)); c.vy = Math.max(-320, Math.min(320, d.vy)); }
    if (cancelled || !p.in || !this._inside(c)) { c.x = CoinBagUI.CX + (Math.random() - 0.5) * 10; c.y = 26 + c.r; c.vx = 0; c.vy = 0; c.px = c.x; c.py = c.y; }   // out of bounds: back in through the neck
    this._endDrag();
  }
  _inZone(e) { const r = this.pay.zone.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; }
  _inside(c) { return c.y >= 22 && c.y <= 165 && Math.abs(c.x - CoinBagUI.CX) <= CoinBagUI.halfWidth(Math.min(c.y, 134)) + 2; }
  _endDrag() { this.drag = null; this.canvas.classList.remove('grabbing'); this._ghostAt(null); }
  /** The coin that follows the pointer once it has left the bag (so it can be seen on its way to the world or the counter): the same pixel coin, a canvas of its own. */
  _ghostAt(e, t) {
    if (!e) { if (this.ghost) { this.ghost.remove(); this.ghost = null; } return; }
    if (!this.ghost || this.ghost.tier !== t || this.ghost.k !== this.S) {
      if (this.ghost) this.ghost.remove();
      const r = CoinBagUI.radiusOf(t), c = CoinArt.canvas(t, r, this.S, 0.9); c.className = 'coinGhost'; c.tier = t; c.k = this.S;
      document.body.appendChild(c); this.ghost = c;
    }
    const gs = this.ghost.style; gs.left = e.clientX - this.ghost.width / 2 + 'px'; gs.top = e.clientY - this.ghost.height / 2 + 'px';
  }
}
