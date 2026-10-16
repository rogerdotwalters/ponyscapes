'use strict';
/* CLIENT - the Connect Four screen at the Pony Inn (shared/connectFour.js holds the game; this draws it). A blue board stands on a wooden table. Each side has a STACK of its own token, a pony coin
 * of its main pony's variety (PonyCoinArt): the opponent's in the top corner, yours on the table below the board. To play, PRESS AND HOLD the top coin of your stack and DRAG it: it comes away under
 * your finger or mouse; let go over a column to drop it there (let go anywhere else and it goes back on the stack). The coin always stays flat, facing you: released, it slides to above its column, falls
 * down the track *behind* the board so it shows through the holes, bounces on the stack and settles; the winning four spin. The opponent's coins slide out of their stack. The coins are the game's 3D
 * pixel coins (CoinSpin). SEAT 1 SEES THE BOARD MIRRORED (column 0 on the right), as if sitting across the table. Keys: arrows + Enter / Space, or 1-7, drop a coin from your stack; Escape stands up.
 * Registered with the PanelGroup as 'connect4'; closing stands you up. Layout: portrait stacks the names, the board and the buttons; a short wide screen (a phone on its side) puts the names, status
 * and buttons in a column beside the board. */
class ConnectFourUI {
  constructor({ game }) {
    this.game = game; this.coins = new Map(); this.seq = -1; this.key = ''; this.raf = 0; this.hover = -1; this.last = 0; this.openedAt = 0;
    this.drag = null; this.sent = null; this.oppPull = 0; this.shake = 0; this.pointer = null; this.touch = false; this.msg = '';
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
    this.cv.addEventListener('pointerdown', e => { this.touch = e.pointerType !== 'mouse'; this.pointer = this._xy(e); this.hover = this._colAt(this.pointer); this._grab(this.pointer, e); e.preventDefault(); });
    this.cv.addEventListener('pointermove', e => { this.touch = e.pointerType !== 'mouse'; this.pointer = this._xy(e); this.hover = this._colAt(this.pointer); });
    this.cv.addEventListener('pointerup', e => { this.pointer = this._xy(e); this._release(e); });
    this.cv.addEventListener('pointercancel', e => this._release(e, true));
    this.cv.addEventListener('pointerleave', e => { if (!this.drag) { this.hover = -1; this.pointer = null; } });
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
    this.drag = null; this.sent = null; this.sig = '';
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
    const tall = rows + 1.5 + 1.6;                                                                       // the room above the board (a coin falls from there), the board, the table with the stack
    const cell = side ? Math.min((vw - 300) / (cols + 0.52), (vh - 64) / tall) : Math.min((vw - 52) / (cols + 0.52), (vh - 252) / tall);
    this.cell = Math.max(26, Math.min(72, Math.floor(cell))); const c = this.cell;
    this.pad = Math.round(c * 0.26); this.A = Math.max(2, Math.round(c / 15)); this.bx = this.pad; this.by = Math.round(c * 1.5);      // (A: screen pixels to one pixel of the pixel art)
    this.bw = c * cols; this.bh = c * rows; this.table = this.by + this.bh + this.pad;                   // (the table top, below the board)
    this.cv.width = this.bw + this.pad * 2; this.cv.height = this.table + Math.round(c * 1.6);
    this.cv.style.width = this.cv.width + 'px'; this.cv.style.height = this.cv.height + 'px';
    this.myStack = { x: this.cv.width - c * 0.95, y: this.table + c * 0.62, s: 1 };                      // yours stands on the table, the opponent's in the top corner
    this.oppStack = { x: this.cv.width - c * 0.8, y: c * 0.9, s: 0.72 };
    this.board = null; this.wall = null; this.tableArt = null; this.root.style.setProperty('--c4w', this.cv.width + 'px');
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
  _nearStack(pt, st) { return !!pt && Math.hypot(pt.x - st.x, pt.y - st.y + this.cell * 0.2) < this.cell * 0.85 * st.s; }
  _cells(board) { return board.split('').map(ch => (ch === '.' ? -1 : +ch)); }
  _mine() { const c = this.game.connect4; return !!c && c.status === 'playing' && c.turn === c.seat; }

  /* ---------------------------------------- what you do ---------------------------------------- */
  _say(text) { this.msg = text; this.msgAt = performance.now(); }
  /** Pressed on the canvas: on your stack, a copy of the coin comes away in your hand. */
  _grab(pt, e) {
    const c = this.game.connect4; if (!c) return;
    if (this._nearStack(pt, this.myStack)) {
      if (c.status === 'waiting' && !c.names[1 - c.seat] && !c.ai) { this._say('Wait for somebody to sit across the table'); return; }
      if (c.status === 'done') { this._say('The game is over'); return; }
      this.drag = { who: c.seat, x: pt.x, y: pt.y, o: CoinSpin.identity(), dx: 0, dy: 0, id: e.pointerId };
      try { this.cv.setPointerCapture(e.pointerId); } catch (err) { /* (a pointer that cannot be captured still drags inside the canvas) */ }
      this._say('');
    } else if (this._colAt(pt) >= 0) { this._say('Press your coin and drag it to a column'); this.shake = 0.5; }
  }
  /** Let go: over a column the coin drops; anywhere else it goes back on the stack. */
  _release(e, cancelled) {
    const d = this.drag; if (!d) return;
    this.drag = null;
    try { this.cv.releasePointerCapture(d.id); } catch (err) { /* already released */ }
    const col = cancelled ? -1 : this._colAt(this.pointer);
    if (col >= 0) this._dropAt(col, { x: d.x, y: d.y }); else this._say('Drag it over a column and let go');
  }
  _dropAt(col, from) {
    const c = this.game.connect4;
    if (!c || c.status !== 'playing') { this._say('Not yet: the game has not begun'); return; }
    if (c.turn !== c.seat) { this._say('Wait for your turn'); return; }
    if (ConnectFour.rowFor(this._cells(c.board), col) < 0) { this._say('That column is full'); return; }
    this.sent = { x: from.x, y: from.y, col, at: performance.now() };                                    // (the coin slides from where you let go once the server has it)
    this._say(''); this.game.c4Drop(col);
  }
  _onKey(e) {
    const c = this.game.connect4;
    if (e.key === 'Escape') { this.close(); e.stopPropagation(); e.preventDefault(); return; }
    if (!c) return;
    let handled = true;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const d = (this.hover < 0 ? 3 : this._dcol(this.hover)) + (e.key === 'ArrowLeft' ? -1 : 1); this.hover = this._dcol(Math.max(0, Math.min(6, d))); this.pointer = null; }
    else if (e.key === 'Enter' || e.key === ' ') this._dropAt(this.hover < 0 ? this._dcol(3) : this.hover, { x: this.myStack.x, y: this.myStack.y - this.cell * 0.4 });
    else if (/^[1-7]$/.test(e.key)) this._dropAt(this._dcol(+e.key - 1), { x: this.myStack.x, y: this.myStack.y - this.cell * 0.4 });
    else handled = false;
    if (handled) { e.stopPropagation(); e.preventDefault(); }
  }

  /* ---------------------------------------- the coins ---------------------------------------- */
  _spot(k) { const dc = this._dcol(k.col); return { x: this.bx + (dc + 0.5) * this.cell, y: this.by + (k.row + 0.5) * this.cell }; }
  /** A coin that starts at (x0, y0) (a hand, or a stack), flies to above its column, then falls into place; `animate` false: it is simply there. */
  _newCoin(col, row, who, animate, from) {
    const k = { col, row, who, state: animate ? 'move' : 'rest', born: performance.now(), o: CoinSpin.identity(), w: [0, 0, 0], vy: 0, bounces: 0, t: 0 };
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
      const from = mine ? (this.sent || { x: this.myStack.x, y: this.myStack.y - this.cell * 0.4 }) : { x: this.oppStack.x, y: this.oppStack.y - this.cell * 0.3 };
      if (!mine) this.oppPull = 0.4;
      this.coins.set(i, this._newCoin(i % 7, Math.floor(i / 7), who, animate && !startNew, from));
      if (mine) this.sent = null;
    }
    for (const [i, k] of this.coins) if (!seen.has(i) && k.state !== 'out') { k.state = 'out'; k.vy = -80; }
    this.seq = c.seq;
    const win = new Set((c.line || []).map(([cc, rr]) => rr * 7 + cc));
    for (const k of this.coins.values()) k.win = win.has(k.row * 7 + k.col);
  }
  _step(dt) {
    const g = this.cell * 30, c = this.game.connect4;
    for (const [i, k] of this.coins) {
      const s = this._spot(k);
      if (k.state === 'move') {                                                                          // out of the hand (or the stack) and over the column
        k.t += dt / 0.24; const u = Math.min(1, k.t), e = u * u * (3 - 2 * u);
        k.x = k.x0 + (s.x - k.x0) * e; k.y = k.y0 + (k.topY - k.y0) * e;
        if (u >= 1) { k.state = 'fall'; k.vy = 40; }
      } else if (k.state === 'fall') {
        k.x = s.x; k.vy += g * dt; k.y += k.vy * dt;
        if (k.y >= s.y) {                                                                                // it hits the stack: a bounce, or it comes to rest
          k.y = s.y;
          if (Math.abs(k.vy) > this.cell * 3.4 && k.bounces < 3) { k.vy = -k.vy * 0.36; k.bounces++; this._clink(k.bounces); }
          else { k.state = 'rest'; k.vy = 0; this._clink(0); }
        }
      } else if (k.state === 'rest') {
        k.x = s.x; k.y += (s.y - k.y) * Math.min(1, 12 * dt);
        if (k.win && c && c.status === 'done') k.o = CoinSpin.spin(k.o, [0, 4.2, 0], dt);               // the winning four spin
        else { const o = k.o, sign = o[0] < 0 ? -1 : 1, m = Math.min(1, 9 * dt); k.o = CoinSpin.norm(o.map((v, n) => v * sign * (1 - m) + (n === 0 ? 1 : 0) * m)); }          // eased face-on
      } else if (k.state === 'out') {
        k.x = s.x; k.vy += g * 0.7 * dt; k.y += k.vy * dt;
        if (k.y > this.cv.height + this.cell) this.coins.delete(i);
      }
    }
    if (this.drag && this.pointer) { const k = Math.min(1, 30 * dt); this.drag.x += (this.pointer.x - this.drag.x) * k; this.drag.y += (this.pointer.y - this.drag.y) * k; }      // (the coin follows your finger a hair behind)
    this.shake = Math.max(0, this.shake - dt); this.oppPull = Math.max(0, this.oppPull - dt);
  }
  _clink(n) { try { Sfx.chime(n ? 0.18 : 0.3, 0); } catch (e) { /* a sound must never stop the game */ } }

  /* ---------------------------------------- drawing ---------------------------------------- */
  /** Pixel art, painted small and scaled up with hard edges (the game's own look): `fn(g, w, h)` paints a w x h grid of art pixels with fillRect. */
  _pixels(wpx, hpx, fn) {
    const A = this.A, w = Math.ceil(wpx / A), h = Math.ceil(hpx / A), c = document.createElement('canvas'); c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h); c.drawW = w * A; c.drawH = h * A; return c;
  }
  _blit(g, art, x, y) { g.imageSmoothingEnabled = false; g.drawImage(art, 0, 0, art.width, art.height, x, y, art.drawW, art.drawH); }
  static noise(x, y, k = 0) { let h = (x * 374761393 + y * 668265263 + k * 2246822519) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }
  /** The board: an oak frame (planks, grain, iron corner plates with rivets) round a face of painted royal-blue wood, with round holes ringed in brass. */
  _boardArt() {
    if (this.board) return this.board;
    const N = ConnectFourUI.noise, A = this.A, cellA = this.cell / A, padA = Math.round(this.pad / A), COLS = ConnectFour.COLS, ROWS = ConnectFour.ROWS;
    return (this.board = this._pixels(this.bw + 2 * this.pad, this.bh + 2 * this.pad, (g, w, h) => {
      const px = (x, y, ww, hh, c) => { g.fillStyle = c; g.fillRect(x, y, ww, hh); };
      const OAK = ['#a8763f', '#9a6a38', '#8a5a33', '#b5834a'], INK = '#1c140e';
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {                                          // the oak frame: planks with grain
        const row = Math.floor(y / 5), seam = y % 5 === 0, grain = N(Math.floor(x / 4), row, 7) > 0.8;
        px(x, y, 1, 1, seam ? '#6d4429' : grain ? '#8a5a33' : OAK[Math.floor(N(row, 3, 1) * 4)]);
      }
      const f = Math.max(2, padA - 1);                                                                    // the painted face, inset in the frame
      for (let y = f; y < h - f; y++) for (let x = f; x < w - f; x++) {
        const cx = Math.floor((x - padA) / cellA), n = N(x, y, 5), seam = (x - padA) % Math.round(cellA * 2) === 0;
        px(x, y, 1, 1, seam ? '#1d3f78' : n > 0.93 ? '#4a82d4' : n < 0.06 ? '#2a5496' : y < f + 2 ? '#4a82d4' : (cx + Math.floor((y - padA) / cellA)) % 2 ? '#356cb8' : '#3a72c4');
      }
      px(f - 1, f - 1, w - 2 * f + 2, 1, INK); px(f - 1, h - f, w - 2 * f + 2, 1, INK); px(f - 1, f - 1, 1, h - 2 * f + 2, INK); px(w - f, f - 1, 1, h - 2 * f + 2, INK);   // an ink line round the face
      px(0, 0, w, 1, INK); px(0, h - 1, w, 1, INK); px(0, 0, 1, h, INK); px(w - 1, 0, 1, h, INK);        // ...and round the whole board, with a lit top-left edge and a dark bottom-right one
      px(1, 1, w - 2, 1, '#d6a263'); px(1, 1, 1, h - 2, '#d6a263'); px(1, h - 2, w - 2, 1, '#5a3a20'); px(w - 2, 1, 1, h - 2, '#5a3a20');
      g.globalCompositeOperation = 'destination-out';                                                      // the holes
      const rA = cellA * 0.4;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const cx = padA + (c + 0.5) * cellA, cy = padA + (r + 0.5) * cellA;
        for (let y = Math.floor(cy - rA); y <= Math.ceil(cy + rA); y++) for (let x = Math.floor(cx - rA); x <= Math.ceil(cx + rA); x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rA) px(x, y, 1, 1, '#000');
      }
      g.globalCompositeOperation = 'source-over';
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {                                      // a brass ring round each hole: lit on its upper left, shaded on its lower right
        const cx = padA + (c + 0.5) * cellA, cy = padA + (r + 0.5) * cellA;
        for (let y = Math.floor(cy - rA - 3); y <= Math.ceil(cy + rA + 3); y++) for (let x = Math.floor(cx - rA - 3); x <= Math.ceil(cx + rA + 3); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > rA && d <= rA + 1) px(x, y, 1, 1, x + y < cx + cy ? '#f6dc7a' : '#b98a2a');
          else if (d > rA + 1 && d <= rA + 1.8) px(x, y, 1, 1, '#4a3314');
          else if (d > rA - 1.2 && d <= rA) px(x, y, 1, 1, 'rgba(10,18,40,.55)');                        // the shadowed lip inside the hole
        }
      }
      const plate = (x0, y0, dx, dy) => {                                                                    // iron corner plates with rivets
        const L = Math.max(5, padA * 2), T = Math.max(3, padA - 1);
        for (let i = 0; i < L; i++) for (let t = 0; t < T; t++) { px(x0 + dx * i, y0 + dy * t, 1, 1, '#6d6d76'); px(x0 + dx * t, y0 + dy * i, 1, 1, '#6d6d76'); }
        px(x0 + dx, y0 + dy, 1, 1, '#c9c9d0'); px(x0 + dx * 3, y0 + dy, 1, 1, '#c9c9d0'); px(x0 + dx, y0 + dy * 3, 1, 1, '#c9c9d0');
      };
      plate(1, 1, 1, 1); plate(w - 2, 1, -1, 1); plate(1, h - 2, 1, -1); plate(w - 2, h - 2, -1, -1);
    }));
  }
  /** The tavern wall behind the board: dark vertical planks. */
  _wallArt() {
    if (this.wall) return this.wall;
    const N = ConnectFourUI.noise;
    return (this.wall = this._pixels(this.cv.width, this.table, (g, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const pl = Math.floor(x / 9), seam = x % 9 === 0, n = N(x, Math.floor(y / 3), pl), knot = Math.hypot((x % 9) - 4, ((y + pl * 13) % 40) - 20) < 1.6 && N(pl, 1, 9) > 0.6;
        g.fillStyle = seam ? '#1c1208' : knot ? '#2a1a0c' : n > 0.9 ? '#52381f' : ['#43301c', '#3d2b18', '#48341f'][pl % 3];
        g.fillRect(x, y, 1, 1);
      }
    }));
  }
  /** The table the board stands on: planks seen from above, nailed down. */
  _tableArtPix() {
    if (this.tableArt) return this.tableArt;
    const N = ConnectFourUI.noise;
    return (this.tableArt = this._pixels(this.cv.width, this.cv.height - this.table, (g, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const row = Math.floor(y / 7), seam = y % 7 === 0, joint = (x + row * 31) % 57 === 0 && !seam, n = N(Math.floor(x / 3), row, 4);
        g.fillStyle = y === 0 ? '#1c140e' : y === 1 ? '#e0b070' : seam || joint ? '#6d4429' : n > 0.82 ? '#a8763f' : ['#c18d50', '#b98248', '#c9965a'][row % 3];
        g.fillRect(x, y, 1, 1);
      }
      for (const nx of [6, w - 8]) for (let r = 0; r * 7 + 4 < h; r++) { g.fillStyle = '#3a3a42'; g.fillRect(nx, r * 7 + 3, 2, 2); g.fillStyle = '#9a9aa4'; g.fillRect(nx, r * 7 + 3, 1, 1); }   // nail heads
    }));
  }
  _coin(g, k, x, y, alpha, scale = 1, nocache = false) {
    const r = Math.max(5, Math.round(this.cell * 0.37 * scale)), c = this.game.connect4, tier = { pony: c ? c.tokens[k.who] : 'meadow' };
    if (alpha !== undefined) g.globalAlpha = alpha;
    CoinSpin.blit(g, x, y, r, tier, k.o, false, nocache ? null : k);
    g.globalAlpha = 1;
  }
  /** One coin lying face up: pressing it spawns a copy in your hand (the coin itself stays); `shake` (0..1) rattles it. */
  _drawStack(g, st, who, now, shaking, label, lifted) {
    const c = this.cell, s = st.s, jig = shaking ? Math.sin(now / 30) * c * 0.025 : 0;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(st.x, st.y + c * 0.3 * s, c * 0.4 * s, c * 0.1 * s, 0, 0, Math.PI * 2); g.fill();
    this._coin(g, { who, o: CoinSpin.identity() }, st.x + jig, st.y, 1, s * 1.1, true);
    if (label) { g.font = `600 ${Math.max(10, Math.round(c * 0.25))}px Georgia, serif`; g.textAlign = 'center'; g.fillStyle = '#f6efe0'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeText(label, st.x, st.y + c * 0.62 * s); g.fillText(label, st.x, st.y + c * 0.62 * s); }
  }
  _draw(now) {
    const g = this.g, c = this.game.connect4, cell = this.cell, W = this.cv.width, H = this.cv.height;
    g.clearRect(0, 0, W, H);
    this._blit(g, this._wallArt(), 0, 0);                                                                 // the wall, the table and the board's two wooden feet
    this._blit(g, this._tableArtPix(), 0, this.table);
    const fy = this.by + this.bh, fh = this.table - fy + this.A * 2, fw = Math.round(this.pad * 1.3);
    for (const fx of [this.bx + this.pad * 0.5, this.bx + this.bw - this.pad * 0.5 - fw]) { g.fillStyle = '#1c140e'; g.fillRect(fx - this.A, fy, fw + this.A * 2, fh); g.fillStyle = '#8a5a33'; g.fillRect(fx, fy, fw, fh - this.A); g.fillStyle = '#b5834a'; g.fillRect(fx, fy, this.A, fh - this.A); }
    for (const k of this.coins.values()) {                                                                 // (behind the board, so they show through its holes)
      if (k.win && c && c.status === 'done' && k.state === 'rest') { g.fillStyle = `rgba(255,232,120,${(0.35 + 0.25 * Math.sin(now / 160)).toFixed(2)})`; const r = Math.round(cell * 0.5); for (let yy = -r; yy <= r; yy += this.A) { const ww = Math.round(Math.sqrt(r * r - yy * yy)); g.fillRect(Math.round(k.x - ww), Math.round(k.y + yy), ww * 2, this.A); } }
      if (k.state === 'move') continue;                                                                    // (flying over the column: drawn in front, below)
      this._coin(g, k, k.x, k.y);
    }
    this._blit(g, this._boardArt(), this.bx - this.pad, this.by - this.pad);                              // the board's front, with its holes
    for (const k of this.coins.values()) if (k.state === 'move') this._coin(g, k, k.x, k.y);
    if (c) {
      const opp = 1 - c.seat;
      this._drawStack(g, this.oppStack, opp, now, this.oppPull > 0, '', false);
      this._drawStack(g, this.myStack, c.seat, now, this.shake > 0, this.drag ? '' : 'drag a coin', !!this.drag);
      if (this.drag) {                                                                                     // the coin in your hand, flat, and the column it would fall in
        const d = this.drag, col = this._colAt(d), dc = col < 0 ? -1 : this._dcol(col);
        if (this._mine() && dc >= 0 && ConnectFour.rowFor(this._cells(c.board), col) >= 0) { g.fillStyle = 'rgba(255,236,160,.2)'; g.fillRect(this.bx + dc * cell, this.by, cell, this.bh); g.fillStyle = 'rgba(255,214,90,.9)'; g.fillRect(this.bx + dc * cell, this.by - this.A * 2, cell, this.A * 2); }
        this._coin(g, d, d.x, d.y - cell * 0.35, 1, 1.15);
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
    const sig = [c.status, c.turn, c.winner, c.names.join('|'), c.tokens.join('|'), c.ai, c.again.join(), me, this.drag ? 1 : 0, hint].join('/');
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
    else if (c.status === 'playing') text = c.turn === me ? (this.drag ? 'Let go over a column.' : 'Your turn: press your coin and drag it to a column.') : `${c.names[opp]} is choosing...`;
    else text = c.winner < 0 ? 'A draw! The board is full.' : c.winner === me ? 'Four in a row! You win!' : `${c.names[opp]} lines up four. Better luck next time!`;
    this.status.textContent = text;
    this.btnAi.hidden = !(c.status === 'waiting' && !c.ai);
    this.btnAgain.hidden = c.status !== 'done'; this.btnAgain.disabled = !!c.again[me]; this.btnAgain.textContent = c.again[me] ? 'Waiting for them...' : 'Play again';
  }
}
