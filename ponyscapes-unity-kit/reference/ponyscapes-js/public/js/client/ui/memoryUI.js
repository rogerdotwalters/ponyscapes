'use strict';
/* CLIENT - the Memory screen at the Pony Inn (shared/memoryGame.js holds the game; this draws it). Twenty-eight cards lie on a green cloth inside an oak frame with iron corners, in the same
 * hard-edged pixel style (and pixel size) as the Connect Four screen. Every card's BACK is a pixel artwork of the word PONYSCAPES in a medieval hand on a burgundy field with a gold border; its FRONT
 * is only a pony (PixelPony, in the variety's own colours) or an animal of the game (PixelCreatures), one of the money coins (CoinArt) or a lasso (ItemIcons): fourteen pictures picked at random every game (shared/memoryGame.js POOL). Press a card (or move with the arrow keys and press Enter / Space) to turn it over; cards flip
 * with a squash; a matched pair bursts into pixel particles in the colours of the pony's artwork. Play alone or head to head with the person across the table; there is no computer player.
 * Registered with the PanelGroup as 'memory'; closing stands you up. Portrait lays the cards out 4 across, a short wide screen 7 across with the names, status and buttons beside them. */
class MemoryUI {
  constructor({ game }) {
    this.game = game; this.cards = []; this.parts = []; this.pending = []; this.seq = -1; this.key = ''; this.raf = 0; this.last = 0; this.openedAt = 0; this.hover = -1; this.cursor = 0;
    this.faces = new Map(); this.backArt = null; this.msg = ''; this.pointer = null; this.touch = false; this.prevSt = '';
    const el = this.root = document.createElement('div');
    el.id = 'memScreen'; el.className = 'c4Screen'; el.hidden = true;
    el.innerHTML = '<div class="c4Card"><header><span>Memory &middot; The Pony Inn</span><button class="c4Close" tabindex="-1" aria-label="Stand up">&#x2715;</button></header>'
      + '<div class="c4Whos"><div class="c4Who opp"><canvas width="32" height="32"></canvas><b></b><i></i></div><div class="c4Who me"><canvas width="32" height="32"></canvas><b></b><i></i></div></div>'
      + '<canvas class="c4Board"></canvas><div class="c4Status"></div><div class="c4Btns"><button class="c4Ai" hidden>Play alone</button><button class="c4Again" hidden>Play again</button><button class="c4Leave">Stand up</button></div></div>';
    document.body.appendChild(el);
    const q = s => el.querySelector(s);
    this.cv = q('.c4Board'); this.g = this.cv.getContext('2d'); this.status = q('.c4Status'); this.btnAlone = q('.c4Ai'); this.btnAgain = q('.c4Again'); this.who = [q('.c4Who.opp'), q('.c4Who.me')];
    q('.c4Close').onclick = () => this.close(); q('.c4Leave').onclick = () => this.close();
    this.btnAlone.onclick = () => game.memAlone(); this.btnAgain.onclick = () => game.memAgain();
    this.cv.addEventListener('pointerdown', e => { this.touch = e.pointerType !== 'mouse'; this.pointer = this._xy(e); const i = this._cardAt(this.pointer); this.hover = this.touch ? -1 : i; if (i >= 0) { this.cursor = i; this._flip(i); } e.preventDefault(); });
    this.cv.addEventListener('pointermove', e => { this.touch = e.pointerType !== 'mouse'; this.pointer = this._xy(e); this.hover = this.touch ? -1 : this._cardAt(this.pointer); });
    this.cv.addEventListener('pointerleave', () => { this.hover = -1; this.pointer = null; });
    this._keys = e => this._onKey(e);
    game.events.on('openMemory', () => this._panels && this._panels.open('memory'));
    game.events.on('closeMemory', () => this._standUp());
    window.addEventListener('resize', () => this.isOpen && this._layout());
    window.addEventListener('orientationchange', () => this.isOpen && setTimeout(() => this._layout(), 250));
  }
  attach(panels) { this._panels = panels; }
  get isOpen() { return !this.root.hidden; }
  open() {
    this.root.hidden = false; this.seq = -1; this.key = ''; this.openedAt = performance.now(); this.last = this.openedAt; this.hover = -1; this.sig = ''; this.parts = []; this.pending = []; this.cards = []; this.prevSt = ''; this.cursor = 0;
    window.addEventListener('keydown', this._keys, true);
    this._layout();
    this.raf = requestAnimationFrame(t => this._frame(t));
  }
  close() { if (!this.isOpen) return; this._standUp(); this.game.memLeave(); }
  _standUp() { if (!this.isOpen) return; this.root.hidden = true; cancelAnimationFrame(this.raf); window.removeEventListener('keydown', this._keys, true); }

  /* ---------------------------------------- geometry ---------------------------------------- */
  static get CW() { return 72; } static get CH() { return 92; }                                          // a card's size in art pixels
  _layout() {
    const vw = window.innerWidth, vh = window.innerHeight, N = MemoryGame.N, side = vw > vh && vh < 520, cols = side ? 7 : 4, rows = N / cols, R = MemoryUI.CH / MemoryUI.CW, gapK = 0.12, padK = 0.2;
    this.root.classList.toggle('side', side); this.cols = cols; this.rows = rows;
    const fitW = side ? vw - 320 : vw - 52, fitH = side ? vh - 64 : vh - 262;
    const cw = Math.min((fitW / (cols + (cols + 1) * gapK + 2 * padK)), (fitH / (rows * R + (rows + 1) * gapK + 2 * padK)));
    this.cw = Math.max(34, Math.min(104, Math.floor(cw))); this.ch = Math.round(this.cw * R); this.gap = Math.round(this.cw * gapK); this.pad = Math.round(this.cw * padK);
    this.A = this.cw / MemoryUI.CW;                                                                          // screen pixels to one art pixel (a card is 72 art pixels wide)
    this.cv.width = this.pad * 2 + this.gap * (cols + 1) + this.cw * cols; this.cv.height = this.pad * 2 + this.gap * (rows + 1) + this.ch * rows;
    this.cv.style.width = this.cv.width + 'px'; this.cv.style.height = this.cv.height + 'px'; this.root.style.setProperty('--c4w', this.cv.width + 'px');
    this.frame = null;
  }
  _pos(i) { const c = i % this.cols, r = Math.floor(i / this.cols); return { x: this.pad + this.gap + c * (this.cw + this.gap), y: this.pad + this.gap + r * (this.ch + this.gap) }; }
  _xy(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (this.cv.width / r.width), y: (e.clientY - r.top) * (this.cv.height / r.height) }; }
  _cardAt(pt) {
    if (!pt) return -1;
    for (let i = 0; i < MemoryGame.N; i++) { const p = this._pos(i); if (pt.x >= p.x && pt.x < p.x + this.cw && pt.y >= p.y && pt.y < p.y + this.ch) return i; }
    return -1;
  }
  _mine() { const m = this.game.memory; return !!m && m.status === 'playing' && m.turn === m.seat; }

  /* ---------------------------------------- what you do ---------------------------------------- */
  _say(text) { this.msg = text; this.msgAt = performance.now(); }
  _flip(i) {
    const m = this.game.memory; if (!m) return;
    if (m.status === 'waiting') { this._say('Wait for somebody to sit across the table, or play alone'); return; }
    if (m.status === 'done') { this._say('The game is over'); return; }
    if (!this._mine()) { this._say('Wait for your turn'); return; }
    const c = this.cards[i];
    if (!c || c.target !== 0 || c.state !== '.') return;
    if (this.cards.filter(k => k.state === 'u').length >= 2) return;
    this.game.memFlip(i);
  }
  _onKey(e) {
    const m = this.game.memory;
    if (e.key === 'Escape') { this.close(); e.stopPropagation(); e.preventDefault(); return; }
    if (!m) return;
    let handled = true;
    const N = MemoryGame.N, c = this.cols;
    if (e.key === 'ArrowLeft') this.cursor = (this.cursor + N - 1) % N;
    else if (e.key === 'ArrowRight') this.cursor = (this.cursor + 1) % N;
    else if (e.key === 'ArrowUp') this.cursor = (this.cursor + N - c) % N;
    else if (e.key === 'ArrowDown') this.cursor = (this.cursor + c) % N;
    else if (e.key === 'Enter' || e.key === ' ') this._flip(this.cursor);
    else handled = false;
    if (handled) { this.pointer = null; this.hover = -1; this.keyNav = true; e.stopPropagation(); e.preventDefault(); }
  }

  /* ---------------------------------------- the cards ---------------------------------------- */
  _sync(m) {
    const n = MemoryGame.N;
    if (this.key !== m.key || this.cards.length !== n) { this.cards = Array.from({ length: n }, () => ({ f: 0, state: '.', face: -1, owner: -1, target: 0, matchedAt: 0 })); this.key = m.key; this.prevSt = ''; this.parts = []; this.pending = []; }
    const fresh = [];
    for (let i = 0; i < n; i++) {
      const k = this.cards[i], st = m.st[i], face = m.fc[i] === '-' ? -1 : parseInt(m.fc[i], 36), own = m.own[i] === '-' ? -1 : +m.own[i];
      if (st === 'm' && k.state !== 'm') fresh.push(i);
      k.state = st; k.owner = own; if (face >= 0) k.face = face;
      k.target = st === '.' ? 0 : 1;
    }
    if (fresh.length) this.pending.push({ cells: fresh, at: performance.now() + 380 });                       // (the burst waits for the second card to finish turning over)
    this.seq = m.seq;
  }
  _step(dt, now) {
    for (const k of this.cards) { const d = k.target - k.f; if (d) k.f = Math.abs(d) <= dt * 5 ? k.target : k.f + Math.sign(d) * dt * 5; }
    for (const p of [...this.pending]) if (now >= p.at) { this.pending.splice(this.pending.indexOf(p), 1); for (const i of p.cells) this._burst(i); }
    for (const p of this.parts) { p.life -= dt; p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 0.8; }
    this.parts = this.parts.filter(p => p.life > 0);
  }
  /** A burst of pixels from a matched card, in the colours of its pony's artwork (and a few gold glints). */
  _burst(i) {
    const k = this.cards[i]; if (!k || k.face < 0) return;
    const p = this._pos(i), cx = p.x + this.cw / 2, cy = p.y + this.ch / 2, cols = this._face(k.face).colors, A = this.A;
    for (let j = 0; j < 34; j++) {
      const a = Math.random() * Math.PI * 2, sp = (60 + Math.random() * 230) * (this.cw / 72), gold = j % 9 === 0;
      this.parts.push({ x: cx + Math.cos(a) * this.cw * 0.18, y: cy + Math.sin(a) * this.ch * 0.15, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 0.7 + Math.random() * 0.7, max: 1.4,
        color: gold ? '#ffe27a' : cols[Math.floor(Math.random() * cols.length)] || '#fff', s: Math.max(1, Math.round((Math.random() < 0.3 ? 3 : 2) * A)) });
    }
  }

  /* ---------------------------------------- pixel art ---------------------------------------- */
  /** A canvas of art pixels (w x h) painted by fn(g, w, h); drawn later with smoothing off at `A` screen pixels per art pixel. */
  static art(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
  _blit(g, art, x, y, w, h) { g.imageSmoothingEnabled = false; g.drawImage(art, 0, 0, art.width, art.height, x, y, w === undefined ? art.width * this.A : w, h === undefined ? art.height * this.A : h); }

  /** The glyphs of the card back: a heavy 7 x 9 capital with serifs (only the letters of PONYSCAPES). */
  static get GLYPHS() {
    return {
      P: ['1111100', '1100110', '1100011', '1100011', '1100110', '1111100', '1100000', '1100000', '1110000'],
      O: ['0111110', '1100011', '1100011', '1100011', '1100011', '1100011', '1100011', '1100011', '0111110'],
      N: ['1100011', '1110011', '1111011', '1111011', '1101111', '1100111', '1100111', '1100011', '1100011'],
      Y: ['1100011', '1100011', '0110110', '0110110', '0011100', '0011100', '0011100', '0011100', '0111110'],
      S: ['0111110', '1100011', '1100000', '0111100', '0011110', '0000011', '0000011', '1100011', '0111110'],
      C: ['0111110', '1100011', '1100000', '1100000', '1100000', '1100000', '1100000', '1100011', '0111110'],
      A: ['0011100', '0011100', '0110110', '0110110', '1100011', '1111111', '1100011', '1100011', '1100011'],
      E: ['1111111', '1100000', '1100000', '1111100', '1100000', '1100000', '1100000', '1100000', '1111111']
    };
  }
  /** The back of every card: PONYSCAPES in gold on a burgundy lattice with a double gold border, a horseshoe beneath. */
  _back() {
    if (this.backArt) return this.backArt;
    const N = ConnectFourUI.noise, G = MemoryUI.GLYPHS, INK = '#1c140e', GOLD = '#f2cf6a', GL = '#fff0a8', GD = '#b98a2a';
    return (this.backArt = MemoryUI.art(MemoryUI.CW, MemoryUI.CH, (g, w, h) => {
      const px = (x, y, ww, hh, c) => { g.fillStyle = c; g.fillRect(x, y, ww, hh); };
      px(0, 0, w, h, INK);
      for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {                                    // the field: a diamond lattice with a little noise
        const d = ((x + y) % 8 === 0) || ((x - y + 800) % 8 === 0), n = N(x, y, 3);
        px(x, y, 1, 1, d ? '#a8404c' : n > 0.92 ? '#9a3844' : n < 0.07 ? '#6d2230' : '#8a2f3a');
      }
      const frame = (o, c) => { px(o, o, w - 2 * o, 1, c); px(o, h - 1 - o, w - 2 * o, 1, c); px(o, o, 1, h - 2 * o, c); px(w - 1 - o, o, 1, h - 2 * o, c); };
      frame(2, GOLD); frame(3, INK); frame(5, GD); frame(6, INK);                                           // gold, ink, brass, ink: the double border
      for (const [cx, cy] of [[8, 8], [w - 9, 8], [8, h - 9], [w - 9, h - 9]]) { px(cx - 2, cy, 5, 1, GOLD); px(cx, cy - 2, 1, 5, GOLD); px(cx - 1, cy - 1, 3, 3, GL); px(cx, cy, 1, 1, INK); }   // a studded corner
      const word = (text, y0) => {
        const gw = text.length * 8 - 1, x0 = Math.round((w - gw) / 2);
        const on = []; text.split('').forEach((ch, k) => G[ch].forEach((row, r) => row.split('').forEach((v, c) => { if (v === '1') on.push([x0 + k * 8 + c, y0 + r, r]); })));
        for (const [x, y] of on) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) px(x + dx, y + dy, 1, 1, INK);      // an ink outline round every letter
        for (const [x, y, r] of on) px(x, y, 1, 1, r < 2 ? GL : r > 6 ? GD : GOLD);                                                     // lit on top, shaded at the foot
      };
      word('PONY', 22); word('SCAPES', 37);
      px(14, 53, w - 28, 1, GD); px(14, 54, w - 28, 1, INK); for (let x = 14; x < w - 14; x += 6) px(x, 53, 2, 1, GOLD);        // a rule under the name, with studs
      const hs = (cx, cy) => {                                                                              // a horseshoe, open end up
        const pts = []; for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) { const d = Math.hypot(x - 6.5, y - 7.2), notch = y < 6 && Math.abs(x - 6.5) < 2.6; if (d <= 7 && d >= 3.6 && !notch) pts.push([x, y]); }
        for (const [x, y] of pts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) px(cx + x + dx, cy + y + dy, 1, 1, INK);
        for (const [x, y] of pts) px(cx + x, cy + y, 1, 1, y < 5 ? GL : y > 9 ? GD : GOLD);
        for (const [x, y] of [[2, 8], [11, 8], [3, 4], [10, 4], [5, 11], [8, 11]]) px(cx + x, cy + y, 1, 1, INK);                       // its nail holes
      };
      hs(Math.round(w / 2 - 7), 60);
    }));
  }
  /** The front of a card: the pony of face `f` (its variety's colours) standing on a meadow in a cream frame. { canvas, colors: the pony's own colours, for the particles }. */
  _face(f) {
    let a = this.faces.get(f); if (a) return a;
    const [kind, id, type] = MemoryGame.POOL[f], N = ConnectFourUI.noise, W = MemoryUI.CW, H = MemoryUI.CH, INK = '#1c140e', def = AnimalDefs[type] || {};
    let waiting = false;
    const pony = document.createElement('canvas'); pony.width = 90; pony.height = 90;                                                  // the picture alone first (its colours feed the particles)
    const pg = pony.getContext('2d'); pg.imageSmoothingEnabled = false;
    let look = { mane: [['#d9a05b', '#7fb4ff', '#c58bd6', '#e0c25a', '#6fcf97', '#f08a80'][f % 6]] };                                   // (an animal's sky: a colour of its own)
    if (kind === 'pony') {
      const vi = Math.max(0, PonyVariantTable.all().findIndex(v => v.id === id)); look = PonyLook.describe(PonyLook.fromGene(7000 + f * 131, vi));
      if (typeof PixelPony.setBudget === 'function') PixelPony.setBudget(Infinity);
      try { PixelPony.draw(pg, look, 'right', 45, 70, { moving: false, phase: 0, now: 0, seed: 0, lift: true, flying: false, kind: { wings: !!def.wings, horn: !!def.horn, mystical: !!def.mystical } }); } finally { if (typeof PixelPony.setBudget === 'function') PixelPony.setBudget(3); }
    } else if (kind === 'coin') {                                                                                                 // a money coin, face on, big
      const ti = Math.max(0, Coins.TIERS.findIndex(t => t.id === id)); look = { mane: [Coins.TIERS[ti].face[1]] };
      CoinArt.draw(pg, 45, 52, 20, 1, ti);
    } else if (kind === 'item') {                                                                                                  // an item's icon (a lasso), enlarged
      const img = ItemIcons.image(id); look = { mane: ['#c9a35a'] };
      if (img && img.complete && img.naturalWidth) pg.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 8, 4, 74, 74); else waiting = true;     // (not loaded yet: drawn blank, and built again next time)
    } else {
      const tmp = document.createElement('canvas'); tmp.width = 90; tmp.height = 90; const tg = tmp.getContext('2d'); tg.imageSmoothingEnabled = false;
      PixelCreatures.draw(tg, Object.assign({ kind: 'sheep' }, def.sprite || {}), 45, 70, 1, { moving: false, phase: 0, now: 0, seed: 0, hunting: false, extra: '' });
      const k = (def.sprite && def.sprite.kind === 'deer') ? 1.3 : 1.8; pg.drawImage(tmp, 0, 0, 90, 90, Math.round(45 - 45 * k), Math.round(70 - 70 * k), Math.round(90 * k), Math.round(90 * k));      // (animals are small: drawn bigger, standing on the same ground line)
    }
    const data = pg.getImageData(0, 0, 90, 90).data, count = new Map();
    for (let i = 0; i < data.length; i += 4 * 2) { if (data[i + 3] < 220) continue; const r = data[i] >> 4, g2 = data[i + 1] >> 4, b = data[i + 2] >> 4; if (r + g2 + b < 8) continue; const key = r << 8 | g2 << 4 | b; count.set(key, (count.get(key) || 0) + 1); }
    const colors = [...count.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([key]) => `rgb(${(key >> 8 & 15) * 17},${(key >> 4 & 15) * 17},${(key & 15) * 17})`);
    const mane = look.mane || ['#88a'], hex = c => { const n = parseInt(c.slice(1, 7), 16); return [n >> 16, n >> 8 & 255, n & 255]; }, mixc = (c, t, k) => { const [r, g2, b] = hex(c), [r2, g2b, b2] = hex(t); return `rgb(${Math.round(r + (r2 - r) * k)},${Math.round(g2 + (g2b - g2) * k)},${Math.round(b + (b2 - b) * k)})`; };
    const canvas = MemoryUI.art(W, H, (g, w, h) => {
      const px = (x, y, ww, hh, c) => { g.fillStyle = c; g.fillRect(x, y, ww, hh); };
      px(0, 0, w, h, INK); px(1, 1, w - 2, h - 2, '#e8d9b0'); px(2, 2, w - 4, h - 4, '#c9b27a'); px(3, 3, w - 6, h - 6, INK);          // ink, cream, a darker cream line, ink
      const x0 = 4, y0 = 4, fw = w - 8, fh = h - 8, ground = Math.round(fh * 0.8);
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {                                                                     // the field: a sky in the pony's own mane colour, banded, over a meadow
        const n = N(x, y, 9 + f), sky = y < ground, band = Math.floor(y / 6);
        px(x0 + x, y0 + y, 1, 1, sky ? mixc(mane[0], '#ffffff', 0.62 + band * 0.04 + (n > 0.93 ? 0.1 : 0)) : mixc('#5f9a4a', mane[0], 0.12 + (n > 0.8 ? 0.0 : 0.08) + (y - ground) * 0.01));
      }
      px(x0, y0 + ground, fw, 1, INK);
      for (let x = 2; x < fw - 2; x += 5) { const th = 1 + Math.floor(N(x, 5, f) * 3); px(x0 + x, y0 + ground - th, 1, th, '#4f8a3a'); }       // grass tufts along the horizon
      px(x0 + 12, y0 + ground + 8, 3, 1, '#7fbf5f'); px(x0 + fw - 20, y0 + ground + 5, 3, 1, '#7fbf5f');
      g.imageSmoothingEnabled = false; g.drawImage(pony, 0, 0, 90, 90, Math.round(w / 2 - 45), 4, 90, 90);                              // the pony (a 90 x 90 canvas with its ground line at 70)
      px(0, 0, w, 3, INK); px(0, h - 3, w, 3, INK); px(0, 0, 3, h, INK); px(w - 3, 0, 3, h, INK);                                      // (the frame again over anything that stands outside the field)
      px(0, 0, w, 1, INK); px(1, 1, w - 2, 1, '#e8d9b0'); px(1, 1, 1, h - 2, '#e8d9b0'); px(1, h - 2, w - 2, 1, '#c9b27a'); px(w - 2, 1, 1, h - 2, '#c9b27a'); px(2, 2, w - 4, 1, '#c9b27a'); px(2, 2, 1, h - 4, '#c9b27a'); px(2, h - 3, w - 4, 1, '#c9b27a'); px(w - 3, 2, 1, h - 4, '#c9b27a');
      px(0, 0, 1, h, INK); px(w - 1, 0, 1, h, INK); px(0, h - 1, w, 1, INK);
    });
    a = { canvas, colors: colors.length ? colors : ['#fff'] };
    if (!waiting) this.faces.set(f, a);
    return a;
  }
  /** The oak frame with iron corners and the green cloth inside it. */
  _frameArt() {
    if (this.frame) return this.frame;
    const N = ConnectFourUI.noise, A = this.A, w = Math.ceil(this.cv.width / A), h = Math.ceil(this.cv.height / A), padA = Math.round(this.pad / A), INK = '#1c140e';
    return (this.frame = MemoryUI.art(w, h, (g) => {
      const px = (x, y, ww, hh, c) => { g.fillStyle = c; g.fillRect(x, y, ww, hh); };
      const OAK = ['#a8763f', '#9a6a38', '#8a5a33', '#b5834a'];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const row = Math.floor(y / 8), seam = y % 8 === 0, grain = N(Math.floor(x / 6), row, 7) > 0.8 && y % 2 === 0; px(x, y, 1, 1, seam ? '#6d4429' : grain ? '#8a5a33' : OAK[Math.floor(N(row, 3, 1) * 4)]); }
      const f = Math.max(3, padA - 1);
      for (let y = f; y < h - f; y++) for (let x = f; x < w - f; x++) { const n = N(x, y, 5), weave = (x + y) % 6 === 0 ? 0.035 : 0; px(x, y, 1, 1, n > 0.9 ? '#3d8558' : n < 0.1 ? '#235a39' : weave ? '#2c7048' : '#2f6b46'); }   // the cloth, with a faint weave
      px(f - 2, f - 2, w - 2 * f + 4, 2, INK); px(f - 2, h - f, w - 2 * f + 4, 2, INK); px(f - 2, f - 2, 2, h - 2 * f + 4, INK); px(w - f, f - 2, 2, h - 2 * f + 4, INK);
      px(f, f, w - 2 * f, 2, '#1c4a2e'); px(f, f, 2, h - 2 * f, '#1c4a2e');                                 // the frame's shadow on the cloth
      px(0, 0, w, 2, INK); px(0, h - 2, w, 2, INK); px(0, 0, 2, h, INK); px(w - 2, 0, 2, h, INK);
      px(2, 2, w - 4, 2, '#d6a263'); px(2, 2, 2, h - 4, '#d6a263'); px(2, h - 4, w - 4, 2, '#5a3a20'); px(w - 4, 2, 2, h - 4, '#5a3a20');
      const plate = (x0, y0, dx, dy) => {
        const L = Math.max(10, padA * 2), T = Math.max(6, padA - 2);
        for (let i = 0; i < L; i++) for (let t = 0; t < T; t++) { px(x0 + dx * i, y0 + dy * t, 1, 1, '#6d6d76'); px(x0 + dx * t, y0 + dy * i, 1, 1, '#6d6d76'); }
        px(x0 + dx * 2, y0 + dy * 2, 2, 2, '#c9c9d0'); px(x0 + dx * 6, y0 + dy * 2, 2, 2, '#c9c9d0'); px(x0 + dx * 2, y0 + dy * 6, 2, 2, '#c9c9d0');
      };
      plate(3, 3, 1, 1); plate(w - 5, 3, -1, 1); plate(3, h - 5, 1, -1); plate(w - 5, h - 5, -1, -1);
    }));
  }

  /* ---------------------------------------- drawing ---------------------------------------- */
  _draw(now) {
    const g = this.g, m = this.game.memory, A = this.A, W = this.cv.width, H = this.cv.height;
    g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false;
    this._blit(g, this._frameArt(), 0, 0);
    const mine = this._mine(), shown = [];
    for (let i = 0; i < this.cards.length; i++) {
      const k = this.cards[i], p = this._pos(i), up = k.f > 0.5, face = up && k.face >= 0, lift = (k.state === 'u' || (k.f > 0 && k.f < 1) ? 3 : 0) * A, sx = Math.abs(1 - 2 * k.f);
      const hot = mine && k.state === '.' && (this.hover === i || (this.keyNav && this.cursor === i && !this.touch)), cw = Math.max(2, Math.round(this.cw * Math.max(0.04, sx))), cx = p.x + (this.cw - cw) / 2, cy = p.y - lift - (hot ? 3 * A : 0);
      g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(Math.round(cx + 2 * A), Math.round(p.y + 2 * A), cw, this.ch);                         // the shadow on the cloth
      if (k.state === 'm' && k.owner >= 0 && k.f >= 1) { g.fillStyle = m && !m.solo && k.owner === 1 ? '#7fb4ff' : '#ffd96a'; g.fillRect(Math.round(cx - 2 * A), Math.round(cy - 2 * A), cw + 4 * A, this.ch + 4 * A); }       // the owner's colour round a matched pair
      this._blit(g, face ? this._face(k.face).canvas : this._back(), Math.round(cx), Math.round(cy), cw, this.ch);
      if (hot) { g.fillStyle = 'rgba(255,240,170,.22)'; g.fillRect(Math.round(cx), Math.round(cy), cw, this.ch); }
      if (this.keyNav && this.cursor === i && !this.touch) { g.strokeStyle = '#ffd96a'; g.lineWidth = Math.max(2, 2 * A); g.strokeRect(Math.round(p.x - 3 * A), Math.round(p.y - 3 * A), this.cw + 6 * A, this.ch + 6 * A); }
      if (k.state === 'm' && k.f >= 1) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(Math.round(cx), Math.round(cy), cw, this.ch); }          // matched cards are dimmed a little: what is left is what you still look for
    }
    for (const p of this.parts) {                                                                                                           // the particles, snapped to the art pixel grid
      g.globalAlpha = Math.min(1, p.life / 0.35); g.fillStyle = p.color;
      g.fillRect(Math.round(p.x / A) * A, Math.round(p.y / A) * A, p.s, p.s);
    }
    g.globalAlpha = 1;
  }
  _frame(now) {
    if (!this.isOpen) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const m = this.game.memory;
    if (!m && now - this.openedAt > 900) { this._standUp(); return; }
    if (m) { if (m.seq !== this.seq || m.key !== this.key) this._sync(m); this._labels(m); }
    if (!this.cards.length) this.cards = [];
    this._step(dt, now); this._draw(now);
    this.raf = requestAnimationFrame(t => this._frame(t));
  }
  _icon(el, variety) {
    const cv = el.querySelector('canvas');
    if (!variety || cv.dataset.v === variety) return;
    cv.dataset.v = variety; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 32, 32); CoinArt.draw(g, 16, 17, 13, 1, { pony: variety });
  }
  _labels(m) {
    const me = m.seat, opp = 1 - me, hint = this.msg && performance.now() - this.msgAt < 4000 ? this.msg : '';
    const sig = [m.status, m.turn, m.winner, m.names.join('|'), m.tokens.join('|'), m.solo, m.again.join(), me, m.score.join(), m.moves, hint].join('/');
    if (sig === this.sig) return;
    this.sig = sig;
    const [top, bottom] = this.who, solo = m.solo;
    top.style.display = solo ? 'none' : '';
    top.querySelector('b').textContent = m.names[opp] || 'Empty seat'; bottom.querySelector('b').textContent = (m.names[me] || 'You') + ' (you)';
    this._icon(top, m.names[opp] ? m.tokens[opp] : ''); this._icon(bottom, m.tokens[me]);
    top.classList.toggle('turn', !solo && m.status === 'playing' && m.turn === opp); bottom.classList.toggle('turn', !solo && m.status === 'playing' && m.turn === me);
    const pairs = n => (m.status === 'waiting' ? '' : `${n} pair${n === 1 ? '' : 's'}`);
    top.querySelector('i').textContent = pairs(m.score[opp]); bottom.querySelector('i').textContent = solo ? `${m.moves} move${m.moves === 1 ? '' : 's'}` : pairs(m.score[me]);
    let text = '';
    if (hint) text = hint;
    else if (m.status === 'waiting') text = 'Wait for another player to sit across the table, or play alone.';
    else if (m.status === 'playing') text = solo ? 'Turn over two cards and find the matching ponies.' : m.turn === me ? 'Your turn: turn over two cards. A pair lets you go again.' : `${m.names[opp]} is choosing...`;
    else text = solo ? `All ${MemoryGame.PAIRS} pairs found in ${m.moves} moves!` : m.winner < 0 ? `A draw, ${m.score[0]} pairs each!` : m.winner === me ? `You win, ${m.score[me]} pairs to ${m.score[opp]}!` : `${m.names[opp]} wins, ${m.score[opp]} pairs to ${m.score[me]}.`;
    this.status.textContent = text;
    this.btnAlone.hidden = !(m.status === 'waiting' && !m.solo);
    this.btnAgain.hidden = m.status !== 'done'; this.btnAgain.disabled = !m.solo && !!m.again[me]; this.btnAgain.textContent = !m.solo && m.again[me] ? 'Waiting for them...' : 'Play again';
  }
}
