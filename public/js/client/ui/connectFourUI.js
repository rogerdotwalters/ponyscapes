'use strict';
/* CLIENT - the Connect Four screen at the Pony Inn (shared/connectFour.js holds the game; this draws it). A blue board stands on a wooden table; each side's coins are the pony coins of its
 * main pony's variety (PonyCoinArt), drawn with the game's 3D coin painter (CoinSpin): a dropped coin tumbles, falls behind the board, hits the stack with a bounce and settles face
 * on. The four that win spin. SEAT 1 SEES THE BOARD MIRRORED (column 0 on the right), as if sitting across the table from seat 0: the same game, seen from the other side.
 * Click or tap a column (or use the arrow keys and Enter, or the keys 1-7) to drop a coin on your turn. Registered with the PanelGroup as 'connect4'; standing up (closing) tells the server. */
class ConnectFourUI {
  constructor({ game }) {
    this.game = game; this.coins = new Map(); this.seq = -1; this.key = ''; this.raf = 0; this.hover = -1; this.last = 0; this.openedAt = 0; this.tokens = ['', ''];
    const el = this.root = document.createElement('div');
    el.id = 'c4Screen'; el.hidden = true;
    el.innerHTML = '<div class="c4Card"><header><span>Connect Four &middot; The Pony Inn</span><button class="c4Close" tabindex="-1" aria-label="Stand up">&#x2715;</button></header>'
      + '<div class="c4Who top"><canvas width="32" height="32"></canvas><b></b><i></i></div><canvas class="c4Board"></canvas><div class="c4Who bottom"><canvas width="32" height="32"></canvas><b></b><i></i></div>'
      + '<div class="c4Status"></div><div class="c4Btns"><button class="c4Ai" hidden>Play the computer</button><button class="c4Again" hidden>Play again</button><button class="c4Leave">Stand up</button></div></div>';
    document.body.appendChild(el);
    const q = s => el.querySelector(s);
    this.cv = q('.c4Board'); this.g = this.cv.getContext('2d'); this.status = q('.c4Status'); this.btnAi = q('.c4Ai'); this.btnAgain = q('.c4Again');
    this.who = [q('.c4Who.top'), q('.c4Who.bottom')];
    q('.c4Close').onclick = () => this.close(); q('.c4Leave').onclick = () => this.close();
    this.btnAi.onclick = () => game.c4Ai(); this.btnAgain.onclick = () => game.c4Again();
    this.cv.addEventListener('pointermove', e => { this.hover = this._colAt(e); });
    this.cv.addEventListener('pointerleave', () => { this.hover = -1; });
    this.cv.addEventListener('pointerdown', e => { this.hover = this._colAt(e); this._drop(this.hover); e.preventDefault(); });
    this._keys = e => this._onKey(e);
    game.events.on('openConnect4', () => this._panels && this._panels.open('connect4'));
    game.events.on('closeConnect4', () => this._standUp());
    window.addEventListener('resize', () => this.isOpen && this._layout());
  }
  /** The PanelGroup (so opening this closes the other windows). */
  attach(panels) { this._panels = panels; }
  get isOpen() { return !this.root.hidden; }
  open() {
    this.root.hidden = false; this.coins.clear(); this.seq = -1; this.key = ''; this.openedAt = performance.now(); this.last = this.openedAt; this.hover = -1;
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
  _layout() {
    const vw = window.innerWidth, vh = window.innerHeight, cols = ConnectFour.COLS, rows = ConnectFour.ROWS;
    const cell = Math.max(30, Math.min(72, Math.floor(Math.min((vw - 52) / cols, (vh - 250) / (rows + 1.6)))));
    this.cell = cell; this.pad = Math.round(cell * 0.2);
    this.bx = this.pad; this.by = Math.round(cell * 1.5);                                             // the board's top-left; above it is room for a coin to fall from
    this.bw = cell * cols; this.bh = cell * rows;
    this.cv.width = this.bw + this.pad * 2; this.cv.height = this.by + this.bh + Math.round(cell * 0.55);
    this.cv.style.width = this.cv.width + 'px'; this.cv.style.height = this.cv.height + 'px';
    this.board = null;
  }
  /** The displayed column for a real one (seat 1 sees the board mirrored). */
  _dcol(col) { const c = this.game.connect4; return c && c.seat === 1 ? ConnectFour.COLS - 1 - col : col; }
  _colAt(e) {
    const r = this.cv.getBoundingClientRect(), x = (e.clientX - r.left) * (this.cv.width / r.width) - this.bx, d = Math.floor(x / this.cell);
    if (d < 0 || d >= ConnectFour.COLS) return -1;
    return this._dcol(d);                                                                              // (mirroring is its own inverse)
  }
  _drop(col) {
    const c = this.game.connect4;
    if (!c || col < 0 || c.status !== 'playing' || c.turn !== c.seat || ConnectFour.rowFor(this._cells(c.board), col) < 0) return;
    if ([...this.coins.values()].some(k => k.state === 'fall' && k.who === c.seat && performance.now() - k.born < 350)) return;   // (one at a time)
    this.game.c4Drop(col);
  }
  _cells(board) { return board.split('').map(ch => (ch === '.' ? -1 : +ch)); }
  _onKey(e) {
    const c = this.game.connect4;
    if (e.key === 'Escape') { this.close(); e.stopPropagation(); e.preventDefault(); return; }
    if (!c) return;
    let handled = true;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const d = (this.hover < 0 ? 3 : this._dcol(this.hover)) + (e.key === 'ArrowLeft' ? -1 : 1); this.hover = this._dcol(Math.max(0, Math.min(6, d))); }
    else if (e.key === 'Enter' || e.key === ' ') this._drop(this.hover < 0 ? this._dcol(3) : this.hover);
    else if (/^[1-7]$/.test(e.key)) this._drop(this._dcol(+e.key - 1));
    else handled = false;
    if (handled) { e.stopPropagation(); e.preventDefault(); }
  }

  /* ---------------------------------------- the coins ---------------------------------------- */
  _spot(k) { const dc = this._dcol(k.col); return { x: this.bx + (dc + 0.5) * this.cell, y: this.by + (k.row + 0.5) * this.cell }; }
  _newCoin(col, row, who, animate) {
    const o = animate ? CoinSpin.random() : CoinSpin.identity(), k = { col, row, who, state: animate ? 'fall' : 'rest', born: performance.now(), o, w: animate ? [(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6] : [0, 0, 0], vy: 0, y: 0, bounces: 0 };
    const s = this._spot(k); k.y = animate ? -this.cell * 0.2 : s.y; k.vy = animate ? 60 : 0;
    return k;
  }
  /** Bring the coins in line with the server's board: new ones fall in; a fresh board lets the old ones drop out of the bottom. */
  _sync(c) {
    const b = c.board, seen = new Set(), animate = this.seq >= 0, startNew = c.key !== this.key;
    if (startNew) { this.key = c.key; this.coins.clear(); }
    for (let i = 0; i < b.length; i++) {
      if (b[i] === '.') continue;
      seen.add(i);
      if (!this.coins.has(i)) this.coins.set(i, this._newCoin(i % 7, Math.floor(i / 7), +b[i], animate && !startNew));
    }
    for (const [i, k] of this.coins) if (!seen.has(i) && k.state !== 'out') { k.state = 'out'; k.vy = -80; k.w = [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0]; }
    this.seq = c.seq;
    const win = new Set((c.line || []).map(([cc, rr]) => rr * 7 + cc));
    for (const [i, k] of this.coins) k.win = win.has(i);
  }
  _step(dt) {
    const g = this.cell * 30, c = this.game.connect4;
    for (const [i, k] of this.coins) {
      const s = this._spot(k);
      if (k.state === 'fall') {
        k.vy += g * dt; k.y += k.vy * dt; k.o = CoinSpin.spin(k.o, k.w, dt);
        if (k.y >= s.y) {                                                                              // it hits the stack: a bounce, or it comes to rest
          k.y = s.y;
          if (Math.abs(k.vy) > this.cell * 3.4 && k.bounces < 3) { k.vy = -k.vy * 0.36; k.bounces++; k.w = k.w.map(v => v * 0.55); this._clink(k.bounces); }
          else { k.state = 'rest'; k.vy = 0; this._clink(0); }
        }
      } else if (k.state === 'rest') {
        k.y += (s.y - k.y) * Math.min(1, 12 * dt);
        if (k.win && c && c.status === 'done') k.o = CoinSpin.spin(k.o, [0, 4.2, 0], dt);               // the winning four spin
        else { const o = k.o, sign = o[0] < 0 ? -1 : 1, m = Math.min(1, 9 * dt); k.o = CoinSpin.norm(o.map((v, n) => v * sign * (1 - m) + (n === 0 ? 1 : 0) * m)); }          // eased face-on
      } else if (k.state === 'out') {
        k.vy += g * 0.7 * dt; k.y += k.vy * dt; k.o = CoinSpin.spin(k.o, k.w, dt);
        if (k.y > this.cv.height + this.cell) this.coins.delete(i);
      }
    }
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
  _coin(g, k, x, y, alpha) {
    const r = Math.round(this.cell * 0.4), tier = { pony: this.game.connect4 ? this.game.connect4.tokens[k.who] : 'meadow' };
    if (alpha !== undefined) g.globalAlpha = alpha;
    CoinSpin.blit(g, x, y, r, tier, k.o, false, k);
    g.globalAlpha = 1;
  }
  _draw(now) {
    const g = this.g, c = this.game.connect4, cell = this.cell, W = this.cv.width, H = this.cv.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#9b6a3a'; g.fillRect(0, this.by + this.bh + this.pad, W, H);                           // the table the board stands on
    g.fillStyle = '#b98a52'; g.fillRect(0, this.by + this.bh + this.pad, W, 4);
    g.fillStyle = '#1f3c7a'; g.fillRect(this.bx + 4, this.by + this.bh, this.pad + 6, this.pad * 2); g.fillRect(this.bx + this.bw - this.pad - 10, this.by + this.bh, this.pad + 6, this.pad * 2);   // the board's feet
    for (const k of this.coins.values()) {                                                                 // (behind the board, so they show through its holes)
      const s = this._spot(k);
      if (k.win && c && c.status === 'done' && k.state === 'rest') { g.fillStyle = `rgba(255,232,120,${(0.35 + 0.25 * Math.sin(now / 160)).toFixed(2)})`; g.beginPath(); g.arc(s.x, s.y, cell * 0.52, 0, Math.PI * 2); g.fill(); }
      this._coin(g, k, s.x, k.y);
    }
    g.drawImage(this._boardArt(), this.bx - this.pad, this.by - this.pad);                               // the board's front, with its holes
    if (c && c.status === 'playing' && c.turn === c.seat) {                                              // your coin hovers over the column you point at
      const col = this.hover, dc = col < 0 ? -1 : this._dcol(col);
      if (dc >= 0 && ConnectFour.rowFor(this._cells(c.board), col) >= 0) this._coin(g, this.ghost || (this.ghost = { who: c.seat, o: CoinSpin.identity() }), this.bx + (dc + 0.5) * cell, this.by - cell * 0.62 + Math.sin(now / 260) * 3, 0.78);
    }
  }
  _frame(now) {
    if (!this.isOpen) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const c = this.game.connect4;
    if (!c && now - this.openedAt > 900) { this._standUp(); return; }                                    // the server stood us up (walked away, left the room)
    if (c) { if (this.ghost) this.ghost.who = c.seat; if (c.seq !== this.seq || c.key !== this.key) this._sync(c); this._labels(c); }
    this._step(dt); this._draw(now);
    this.raf = requestAnimationFrame(t => this._frame(t));
  }
  _icon(el, variety) {
    const cv = el.querySelector('canvas');
    if (!variety || cv.dataset.v === variety) return;
    cv.dataset.v = variety; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 32, 32); CoinArt.draw(g, 16, 17, 13, 1, { pony: variety });
  }
  _labels(c) {
    const me = c.seat, opp = 1 - me, sig = [c.status, c.turn, c.winner, c.names.join('|'), c.tokens.join('|'), c.ai, c.again.join(), me].join('/');
    if (sig === this.sig) return;
    this.sig = sig;
    const top = this.who[0], bottom = this.who[1];
    top.querySelector('b').textContent = c.names[opp] || 'Waiting for an opponent...'; bottom.querySelector('b').textContent = (c.names[me] || 'You') + ' (you)';
    this._icon(top, c.names[opp] ? c.tokens[opp] : ''); this._icon(bottom, c.tokens[me]);
    top.classList.toggle('turn', c.status === 'playing' && c.turn === opp); bottom.classList.toggle('turn', c.status === 'playing' && c.turn === me);
    top.querySelector('i').textContent = c.status === 'playing' && c.turn === opp ? 'thinking...' : ''; bottom.querySelector('i').textContent = c.status === 'playing' && c.turn === me ? 'your turn' : '';
    let text = '';
    if (c.status === 'waiting') text = 'Sit and wait for another player to sit across the table, or play the innkeeper’s computer.';
    else if (c.status === 'playing') text = c.turn === me ? 'Your turn: tap a column to drop your coin.' : `${c.names[opp]} is choosing...`;
    else text = c.winner < 0 ? 'A draw! The board is full.' : c.winner === me ? 'Four in a row! You win!' : `${c.names[opp]} lines up four. Better luck next time!`;
    if (me === 1) text += '  (You see the board from your side of the table.)';
    this.status.textContent = text;
    this.btnAi.hidden = !(c.status === 'waiting' && !c.ai);
    this.btnAgain.hidden = c.status !== 'done'; this.btnAgain.disabled = !!c.again[me]; this.btnAgain.textContent = c.again[me] ? 'Waiting for them...' : 'Play again';
  }
}
