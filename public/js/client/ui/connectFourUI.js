'use strict';
/* CLIENT - the Connect Four screen at the Pony Inn (shared/connectFour.js holds the game; this draws it). A blue board stands on a wooden table. Each side has a BAG of its own token, a pony coin
 * of its main pony's variety (PonyCoinArt): the opponent's sits in the top corner, yours on the table below the board. To play you RUMMAGE in your bag (tap / click it: the sack shakes and the coins
 * clink for a moment) and a coin pops out into your hand (it follows the mouse; on a touch screen it hovers by the bag). Then tap a column to drop it; tap the bag again to put it back. You may rummage
 * while it is your opponent's turn, so a coin is ready. The coins are the game's 3D pixel coins (CoinSpin): a dropped coin flies to the column, tumbles, falls *behind* the board so it shows through
 * the holes, bounces on the stack and settles face on; the winning four spin. The opponent's coins come out of their bag. SEAT 1 SEES THE BOARD MIRRORED (column 0 on the right), as if sitting across
 * the table. Keys: arrows + Enter / Space (bag, then column), 1-7 (rummage and drop in that column), Escape (stand up). Registered with the PanelGroup as 'connect4'; closing stands you up.
 * Layout: portrait stacks the names, the board and the buttons; a short wide screen (a phone on its side) puts the names, status and buttons in a column beside the board. */
class ConnectFourUI {
  constructor({ game }) {
    this.game = game; this.coins = new Map(); this.seq = -1; this.key = ''; this.raf = 0; this.hover = -1; this.last = 0; this.openedAt = 0;
    this.hand = null; this.rum = null; this.sent = null; this.queued = -1; this.oppRum = 0; this.shake = 0; this.pointer = null; this.touch = false; this.msg = '';
    const el = this.root = document.createElement('div');
    el.id = 'c4Screen'; el.hidden = true;
    el.innerHTML = '<div class="c4Card"><header><span>Connect Four &middot; The Pony Inn</span><button class="c4Close" tabindex="-1" aria-label="Stand up">&#x2715;</button></header>'
      + '<div class="c4Whos"><div class="c4Who opp"><canvas width="32" height="32"></canvas><b></b><i></i></div><div class="c4Who me"><canvas width="32" height="32"></canvas><b></b><i></i></div></div>'
      + '<canvas class="c4Board"></canvas><div class="c4Status"></div><div class="c4Btns"><button class="c4Ai" hidden>Play the computer</button><button class="c4Again" hidden>Play again</button><button class="c4Leave">Stand up</button></div></div>';
    document.body.appendChild(el);
    const q = s => el.querySelector(s);
    this.cv = q('.c4Board'); this.g = this.cv.getContext('2d'); this.status = q('.c4Status'); this.btnAi = q('.c4Ai'); this.btnAgain = q('.c4Again');
    this.who = [q('.c4Who.opp'), q('.c4Who.me')];
    q('.c4Close').onclick = () => this.close(); q('.c4Leave').onclick = () => this.close();
    this.btnAi.onclick = () => game.c4Ai(); this.btnAgain.onclick = () => game.c4Again();
    this.cv.addEventListener('pointermove', e => { this.touch = e.pointerType !== 'mouse'; this.pointer = this._xy(e); this.hover = this._colAt(this.pointer); });
    this.cv.addEventListener('pointerleave', () => { this.hover = -1; this.pointer = null; });
    this.cv.addEventListener('pointerdown', e => { this.touch = e.pointerType !== 'mouse'; this.pointer = this._xy(e); this.hover = this._colAt(this.pointer); this._press(this.pointer); e.preventDefault(); });
    this._keys = e => this._onKey(e);
    game.events.on('openConnect4', () => this._panels && this._panels.open('connect4'));
    game.events.on('closeConnect4', () => this._standUp());
    window.addEventListener('resize', () => this.isOpen && this._layout());
    window.addEventListener('orientationchange', () => this.isOpen && setTimeout(() => this._layout(), 250));
  }
  /** The PanelGroup (so opening this closes the other windows). */
  attach(panels) { this._panels = panels; }
  get isOpen() { return !this.root.hidden; }
  open() {
    this.root.hidden = false; this.coins.clear(); this.seq = -1; this.key = ''; this.openedAt = performance.now(); this.last = this.openedAt; this.hover = -1;
    this.hand = null; this.rum = null; this.sent = null; this.queued = -1; this.sig = '';
    window.addEventListener('keydown', this._keys, true);
    this._layout();
    this.raf = requestAnimationFrame(t => this._frame(t));
  }
  /** Stand up: tell the server (only when this window was really open). */
  close() { if (!this.isOpen) return; this._standUp(); this.game.c4Leave(); }
  _standUp() {
    if (!this.isOpen) return;
    this.root.hidden = true; cancelAnimationFrame(this.raf); window.removeEventListener('keydown', this._keys, true);
  }

  /* ---------------------------------------- geometry ---------------------------------------- */
  /** Size the board to the room there is: the card is a column (portrait) or the board with a side column (a short, wide screen). */
  _layout() {
    const vw = window.innerWidth, vh = window.innerHeight, cols = ConnectFour.COLS, rows = ConnectFour.ROWS, side = vw > vh && vh < 520;
    this.root.classList.toggle('side', side);
    const tall = rows + 1.5 + 1.6;                                                                       // the room above the board (a coin falls from there), the board, the table with the bag
    const cell = side ? Math.min((vw - 300) / (cols + 0.4), (vh - 64) / tall) : Math.min((vw - 52) / (cols + 0.4), (vh - 252) / tall);
    this.cell = Math.max(26, Math.min(72, Math.floor(cell))); const c = this.cell;
    this.pad = Math.round(c * 0.2); this.bx = this.pad; this.by = Math.round(c * 1.5);
    this.bw = c * cols; this.bh = c * rows; this.table = this.by + this.bh + this.pad;                   // (the table top, below the board)
    this.cv.width = this.bw + this.pad * 2; this.cv.height = this.table + Math.round(c * 1.6);
    this.cv.style.width = this.cv.width + 'px'; this.cv.style.height = this.cv.height + 'px';
    this.myBag = { x: this.cv.width - c * 0.95, y: this.table + c * 0.5, s: 1 };                         // yours stands on the table, the opponent's in the top corner
    this.oppBag = { x: this.cv.width - c * 0.8, y: c * 0.95, s: 0.72 };
    this.board = null; this.root.style.setProperty('--c4w', this.cv.width + 'px');
  }
  /** Canvas coordinates of a pointer event. */
  _xy(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (this.cv.width / r.width), y: (e.clientY - r.top) * (this.cv.height / r.height) }; }
  /** The displayed column for a real one (seat 1 sees the board mirrored). */
  _dcol(col) { const c = this.game.connect4; return c && c.seat === 1 ? ConnectFour.COLS - 1 - col : col; }
  /** The real column under a canvas point (-1: none). */
  _colAt(pt) {
    if (!pt) return -1;
    const d = Math.floor((pt.x - this.bx) / this.cell);
    if (d < 0 || d >= ConnectFour.COLS || pt.y > this.table) return -1;
    return this._dcol(d);                                                                                // (mirroring is its own inverse)
  }
  _nearBag(pt, bag) { return !!pt && Math.hypot(pt.x - bag.x, pt.y - bag.y + this.cell * 0.15) < this.cell * 0.95 * bag.s; }
  _cells(board) { return board.split('').map(ch => (ch === '.' ? -1 : +ch)); }
  _mine() { const c = this.game.connect4; return !!c && c.status === 'playing' && c.turn === c.seat; }

  /* ---------------------------------------- what you do ---------------------------------------- */
  _press(pt) {
    const c = this.game.connect4; if (!c) return;
    if (this._nearBag(pt, this.myBag)) { this._bag(); return; }
    const col = this._colAt(pt);
    if (col < 0) return;
    if (!this.hand) { this._say(this.rum ? 'Still rummaging...' : 'Rummage in your bag for a coin first'); this.shake = 0.5; return; }
    this._dropHand(col);
  }
  /** The bag was tapped: rummage for a coin, or put the coin in your hand back. */
  _bag() {
    const c = this.game.connect4;
    if (!c || c.status === 'waiting' && !c.names[1 - c.seat] && !c.ai) { this._say('Wait for somebody to sit across the table'); return; }
    if (c.status === 'done') { this._say('The game is over'); return; }
    if (this.rum) return;
    if (this.hand) { this.hand = null; this._say('Back in the bag'); return; }
    this.rum = { t: 0, dur: 0.6 + Math.random() * 0.7 }; this.shake = 0; this._say('');
  }
  _say(text) { this.msg = text; this.msgAt = performance.now(); }
  _dropHand(col) {
    const c = this.game.connect4;
    if (!c || c.status !== 'playing') { this._say('Not yet: the game has not begun'); return; }
    if (c.turn !== c.seat) { this._say('Wait for your turn'); return; }
    if (ConnectFour.rowFor(this._cells(c.board), col) < 0) { this._say('That column is full'); return; }
    this.sent = { x: this.hand.x, y: this.hand.y, col, at: performance.now() };                         // (the coin flies from your hand once the server has it)
    this.hand = null; this._say(''); this.game.c4Drop(col);
  }
  _onKey(e) {
    const c = this.game.connect4;
    if (e.key === 'Escape') { this.close(); e.stopPropagation(); e.preventDefault(); return; }
    if (!c) return;
    let handled = true;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const d = (this.hover < 0 ? 3 : this._dcol(this.hover)) + (e.key === 'ArrowLeft' ? -1 : 1); this.hover = this._dcol(Math.max(0, Math.min(6, d))); this.pointer = null; }
    else if (e.key === 'Enter' || e.key === ' ') { if (this.hand) this._dropHand(this.hover < 0 ? this._dcol(3) : this.hover); else this._bag(); }
    else if (/^[1-7]$/.test(e.key)) { const col = this._dcol(+e.key - 1); if (this.hand) this._dropHand(col); else { this.queued = col; this._bag(); } }
    else handled = false;
    if (handled) { e.stopPropagation(); e.preventDefault(); }
  }

  /* ---------------------------------------- the coins ---------------------------------------- */
  _spot(k) { const dc = this._dcol(k.col); return { x: this.bx + (dc + 0.5) * this.cell, y: this.by + (k.row + 0.5) * this.cell }; }
  /** A coin that starts at (x0, y0) (a hand, or a bag), flies to above its column, then falls into place; `animate` false: it is simply there. */
  _newCoin(col, row, who, animate, from) {
    const k = { col, row, who, state: animate ? 'move' : 'rest', born: performance.now(), o: animate ? CoinSpin.random() : CoinSpin.identity(), w: animate ? [(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6] : [0, 0, 0], vy: 0, bounces: 0, t: 0 };
    const s = this._spot(k);
    if (animate) { k.x0 = from.x; k.y0 = from.y; k.x = from.x; k.y = from.y; k.topY = this.by - this.cell * 0.55; } else { k.x = s.x; k.y = s.y; }
    return k;
  }
  /** Bring the coins in line with the server's board: new ones fly in; a fresh board lets the old ones drop out of the bottom. */
  _sync(c) {
    const b = c.board, seen = new Set(), animate = this.seq >= 0, startNew = c.key !== this.key;
    if (startNew) { this.key = c.key; this.coins.clear(); }
    for (let i = 0; i < b.length; i++) {
      if (b[i] === '.') continue;
      seen.add(i);
      if (this.coins.has(i)) continue;
      const who = +b[i], mine = who === c.seat;
      let from = mine ? (this.sent || { x: this.myBag.x, y: this.myBag.y - this.cell }) : { x: this.oppBag.x, y: this.oppBag.y };
      if (!mine) this.oppRum = 0.55;
      this.coins.set(i, this._newCoin(i % 7, Math.floor(i / 7), who, animate && !startNew, from));
      if (mine) this.sent = null;
    }
    for (const [i, k] of this.coins) if (!seen.has(i) && k.state !== 'out') { k.state = 'out'; k.vy = -80; k.w = [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0]; }
    this.seq = c.seq;
    const win = new Set((c.line || []).map(([cc, rr]) => rr * 7 + cc));
    for (const k of this.coins.values()) k.win = win.has(k.row * 7 + k.col);
  }
  _step(dt) {
    const g = this.cell * 30, c = this.game.connect4;
    for (const [i, k] of this.coins) {
      const s = this._spot(k);
      if (k.state === 'move') {                                                                          // out of the hand (or the bag) and over the column
        k.t += dt / 0.24; const u = Math.min(1, k.t), e = u * u * (3 - 2 * u);
        k.x = k.x0 + (s.x - k.x0) * e; k.y = k.y0 + (k.topY - k.y0) * e - Math.sin(u * Math.PI) * this.cell * 0.4; k.o = CoinSpin.spin(k.o, k.w, dt);
        if (u >= 1) { k.state = 'fall'; k.vy = 40; }
      } else if (k.state === 'fall') {
        k.x = s.x; k.vy += g * dt; k.y += k.vy * dt; k.o = CoinSpin.spin(k.o, k.w, dt);
        if (k.y >= s.y) {                                                                                // it hits the stack: a bounce, or it comes to rest
          k.y = s.y;
          if (Math.abs(k.vy) > this.cell * 3.4 && k.bounces < 3) { k.vy = -k.vy * 0.36; k.bounces++; k.w = k.w.map(v => v * 0.55); this._clink(k.bounces); }
          else { k.state = 'rest'; k.vy = 0; this._clink(0); }
        }
      } else if (k.state === 'rest') {
        k.x = s.x; k.y += (s.y - k.y) * Math.min(1, 12 * dt);
        if (k.win && c && c.status === 'done') k.o = CoinSpin.spin(k.o, [0, 4.2, 0], dt);               // the winning four spin
        else { const o = k.o, sign = o[0] < 0 ? -1 : 1, m = Math.min(1, 9 * dt); k.o = CoinSpin.norm(o.map((v, n) => v * sign * (1 - m) + (n === 0 ? 1 : 0) * m)); }          // eased face-on
      } else if (k.state === 'out') {
        k.x = s.x; k.vy += g * 0.7 * dt; k.y += k.vy * dt; k.o = CoinSpin.spin(k.o, k.w, dt);
        if (k.y > this.cv.height + this.cell) this.coins.delete(i);
      }
    }
    if (this.rum) {                                                                                      // rummaging: the sack shakes and the coins clink, then one pops out
      this.rum.t += dt;
      if (Math.floor(this.rum.t * 9) !== Math.floor((this.rum.t - dt) * 9)) this._clink(1);
      if (this.rum.t >= this.rum.dur) { this.rum = null; this.hand = { who: this.game.connect4 ? this.game.connect4.seat : 0, x: this.myBag.x, y: this.myBag.y - this.cell * 0.5, born: performance.now(), o: CoinSpin.identity(), pop: 0 }; this._say('Got one! Tap a column to drop it'); if (this.queued >= 0) { const q = this.queued; this.queued = -1; this._dropHand(q); } }
    }
    if (this.hand) {                                                                                     // in your hand: it follows the mouse; with a finger it waits by the bag
      this.hand.pop = Math.min(1, this.hand.pop + dt / 0.35);
      const home = { x: this.myBag.x - this.cell * 0.15, y: this.myBag.y - this.cell * 1.25 }, want = !this.touch && this.pointer ? { x: this.pointer.x, y: this.pointer.y - this.cell * 0.2 } : home;
      const k = Math.min(1, 14 * dt); this.hand.x += (want.x - this.hand.x) * k; this.hand.y += (want.y - this.hand.y) * k;
      const T = performance.now(); this.hand.o = CoinSpin.norm([1, Math.sin(T / 420) * 0.06, Math.cos(T / 530) * 0.06, Math.sin(T / 650) * 0.03]);                // (a gentle sway in the hand)
    }
    this.shake = Math.max(0, this.shake - dt); this.oppRum = Math.max(0, this.oppRum - dt);
  }
  _clink(n) { try { Sfx.chime(n ? 0.18 : 0.3, 0); } catch (e) { /* a sound must never stop the game */ } }

  /* ---------------------------------------- drawing ---------------------------------------- */
  _boardArt() {
    if (this.board) return this.board;
    const cell = this.cell, c = document.createElement('canvas'), g = c.getContext('2d'), w = this.bw + 2 * this.pad, h = this.bh + 2 * this.pad;
    c.width = w; c.height = h;
    const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#3b67c4'); grad.addColorStop(1, '#27498f');
    g.fillStyle = grad; g.beginPath(); g.roundRect ? g.roundRect(0, 0, w, h, cell * 0.22) : g.rect(0, 0, w, h); g.fill();
    g.strokeStyle = '#1a3470'; g.lineWidth = 3; g.stroke();
    g.globalCompositeOperation = 'destination-out';
    for (let r = 0; r < ConnectFour.ROWS; r++) for (let cc = 0; cc < ConnectFour.COLS; cc++) { g.beginPath(); g.arc(this.pad + (cc + 0.5) * cell, this.pad + (r + 0.5) * cell, cell * 0.43, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(15,35,90,.9)'; g.lineWidth = Math.max(2, cell * 0.05);
    for (let r = 0; r < ConnectFour.ROWS; r++) for (let cc = 0; cc < ConnectFour.COLS; cc++) { g.beginPath(); g.arc(this.pad + (cc + 0.5) * cell, this.pad + (r + 0.5) * cell, cell * 0.45, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(4, 4, w - 8, Math.max(3, cell * 0.12));
    return (this.board = c);
  }
  _coin(g, k, x, y, alpha, scale = 1, nocache = false) {
    const r = Math.max(5, Math.round(this.cell * 0.4 * scale)), c = this.game.connect4, tier = { pony: c ? c.tokens[k.who] : 'meadow' };
    if (alpha !== undefined) g.globalAlpha = alpha;
    CoinSpin.blit(g, x, y, r, tier, k.o, false, nocache ? null : k);
    g.globalAlpha = 1;
  }
  /** A burlap sack of coins: its mouth tied with cord, a few of its coins peeking out; `shake` (0..1) rattles it. */
  _drawBag(g, bag, who, now, shaking, label) {
    const c = this.cell, s = bag.s, x = bag.x, y = bag.y, tier = this.game.connect4 ? this.game.connect4.tokens[who] : 'meadow';
    const rock = shaking ? Math.sin(now / 38) * 0.11 : 0, jig = shaking ? Math.sin(now / 27) * c * 0.03 : 0;
    g.save(); g.translate(x + jig, y + c * 0.5 * s); g.rotate(rock); g.scale(s, s);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, c * 0.02, c * 0.62, c * 0.16, 0, 0, Math.PI * 2); g.fill();
    const r = c * 0.58;                                                                                   // the sack
    g.beginPath(); g.moveTo(-r * 0.42, -r * 0.95); g.bezierCurveTo(-r * 1.25, -r * 0.2, -r * 1.05, r * 0.05, -r * 0.5, 0); g.lineTo(r * 0.5, 0); g.bezierCurveTo(r * 1.05, r * 0.05, r * 1.25, -r * 0.2, r * 0.42, -r * 0.95); g.closePath();
    const grad = g.createLinearGradient(-r, -r, r, 0); grad.addColorStop(0, '#c2975a'); grad.addColorStop(1, '#8c6636'); g.fillStyle = grad; g.fill(); g.strokeStyle = '#4e3414'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(70,44,14,.35)'; g.lineWidth = 1; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * r * 0.28, -r * 0.8); g.lineTo(i * r * 0.36, -r * 0.1); g.stroke(); }
    for (let i = 0; i < 3; i++) {                                                                         // coins poking out of the mouth (they jostle while you rummage)
      const dx = (i - 1) * r * 0.36, wob = shaking ? Math.sin(now / 90 + i * 2) * 0.35 : 0, up = shaking ? Math.abs(Math.sin(now / 110 + i * 1.7)) * c * 0.1 : 0;
      this._coin(g, { who, o: CoinSpin.mul(CoinSpin.identity(), [Math.cos(0.5 + wob), Math.sin(0.5 + wob), 0, 0]) }, dx, -r * 1.02 - up, 1, 0.5, true);
    }
    g.fillStyle = '#7a1f1f'; g.fillRect(-r * 0.5, -r * 0.98, r, c * 0.07);                                // the cord round the neck
    g.restore();
    if (label) { g.font = `600 ${Math.max(10, Math.round(c * 0.26))}px Georgia, serif`; g.textAlign = 'center'; g.fillStyle = '#f6efe0'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeText(label, x, y + c * 0.78 * s); g.fillText(label, x, y + c * 0.78 * s); }
  }
  _draw(now) {
    const g = this.g, c = this.game.connect4, cell = this.cell, W = this.cv.width, H = this.cv.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#9b6a3a'; g.fillRect(0, this.table, W, H - this.table);                               // the table the board stands on
    g.fillStyle = '#b98a52'; g.fillRect(0, this.table, W, 4);
    g.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 0; x < W; x += Math.round(cell * 0.9)) g.fillRect(x, this.table + 6, 2, H - this.table);
    g.fillStyle = '#1f3c7a'; g.fillRect(this.bx + 4, this.by + this.bh, this.pad + 6, this.pad * 2); g.fillRect(this.bx + this.bw - this.pad - 10, this.by + this.bh, this.pad + 6, this.pad * 2);   // the board's feet
    for (const k of this.coins.values()) {                                                                 // (behind the board, so they show through its holes)
      if (k.win && c && c.status === 'done' && k.state === 'rest') { g.fillStyle = `rgba(255,232,120,${(0.35 + 0.25 * Math.sin(now / 160)).toFixed(2)})`; g.beginPath(); g.arc(k.x, k.y, cell * 0.52, 0, Math.PI * 2); g.fill(); }
      if (k.state === 'move') continue;                                                                    // (flying over the column: drawn in front, below)
      this._coin(g, k, k.x, k.y);
    }
    g.drawImage(this._boardArt(), this.bx - this.pad, this.by - this.pad);                               // the board's front, with its holes
    for (const k of this.coins.values()) if (k.state === 'move') this._coin(g, k, k.x, k.y);
    if (c) {
      const opp = 1 - c.seat;
      this._drawBag(g, this.oppBag, opp, now, this.oppRum > 0, '');
      this._drawBag(g, this.myBag, c.seat, now, !!this.rum || this.shake > 0, this.hand || this.rum ? '' : 'your coins');
      if (this.hand) {                                                                                     // the coin in your hand, and where it would go
        const h = this.hand, col = this.touch ? -1 : (this.pointer ? this._colAt(this.pointer) : this.hover >= 0 ? this.hover : -1), dc = col < 0 ? -1 : this._dcol(col);
        if (this._mine() && dc >= 0 && ConnectFour.rowFor(this._cells(c.board), col) >= 0) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(this.bx + dc * cell, this.by, cell, this.bh); }
        const pop = h.pop, lift = (1 - pop) * (1 - pop) * cell * 0.9;
        this._coin(g, h, h.x, h.y + lift - Math.sin(pop * Math.PI) * cell * 0.25, 1, 1.12);
      }
    }
  }
  _frame(now) {
    if (!this.isOpen) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const c = this.game.connect4;
    if (!c && now - this.openedAt > 900) { this._standUp(); return; }                                    // the server stood us up (walked away, left the room)
    if (c) { if (c.seq !== this.seq || c.key !== this.key) this._sync(c); this._labels(c); }
    this._step(dt); this._draw(now);
    this.raf = requestAnimationFrame(t => this._frame(t));
  }
  _icon(el, variety) {
    const cv = el.querySelector('canvas');
    if (!variety || cv.dataset.v === variety) return;
    cv.dataset.v = variety; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 32, 32); CoinArt.draw(g, 16, 17, 13, 1, { pony: variety });
  }
  _labels(c) {
    const me = c.seat, opp = 1 - me, hint = this.msg && performance.now() - this.msgAt < 4000 ? this.msg : '';
    const sig = [c.status, c.turn, c.winner, c.names.join('|'), c.tokens.join('|'), c.ai, c.again.join(), me, this.hand ? 1 : 0, this.rum ? 1 : 0, hint].join('/');
    if (sig === this.sig) return;
    this.sig = sig;
    const [top, bottom] = this.who;
    top.querySelector('b').textContent = c.names[opp] || 'Empty seat'; bottom.querySelector('b').textContent = (c.names[me] || 'You') + ' (you)';
    this._icon(top, c.names[opp] ? c.tokens[opp] : ''); this._icon(bottom, c.tokens[me]);
    top.classList.toggle('turn', c.status === 'playing' && c.turn === opp); bottom.classList.toggle('turn', c.status === 'playing' && c.turn === me);
    top.querySelector('i').textContent = c.status === 'playing' && c.turn === opp ? 'turn' : ''; bottom.querySelector('i').textContent = c.status === 'playing' && c.turn === me ? 'your turn' : '';
    let text = '';
    if (hint) text = hint;
    else if (c.status === 'waiting') text = 'Wait for another player to sit across the table, or play the innkeeper’s computer.';
    else if (c.status === 'playing') text = c.turn === me ? (this.hand ? 'Tap a column to drop your coin.' : this.rum ? 'Rummaging...' : 'Your turn: tap your bag of coins to pull one out.') : `${c.names[opp]} is choosing...` + (this.hand ? ' (your coin is ready)' : ' Rummage in your bag meanwhile.');
    else text = c.winner < 0 ? 'A draw! The board is full.' : c.winner === me ? 'Four in a row! You win!' : `${c.names[opp]} lines up four. Better luck next time!`;
    this.status.textContent = text;
    this.btnAi.hidden = !(c.status === 'waiting' && !c.ai);
    this.btnAgain.hidden = c.status !== 'done'; this.btnAgain.disabled = !!c.again[me]; this.btnAgain.textContent = c.again[me] ? 'Waiting for them...' : 'Play again';
  }
}
