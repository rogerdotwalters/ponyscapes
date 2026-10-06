'use strict';
/* LEVEL EDITOR - paint the rooms inside buildings: tiles (floors, walls, windows, the doormat) on a grid, furniture on top, and see the room as
 * the game draws it. The rooms are kept as a DRAFT in this browser; "Download interiors.js" writes the file to put at
 * public/js/content/interiors.js, and "Play-test room" opens the game (solo) with the draft, standing inside a building that uses the room.
 *
 * A room is { name, tiles: [rows of one-character tiles], furniture: [{ id, x, y, rot }], exit: [x, y] } (see js/content/interiors.js). */
(() => {
  const $ = id => document.getElementById(id);
  const clone = v => JSON.parse(JSON.stringify(v));
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const DRAFT_AT_KEY = 'ponyscapes.interiorsDraftAt', MAX = Interiors.MAX, VOID = InteriorTileInfo.voidChar, MAT = 'm';
  const TILES = InteriorTiles.all(), byChar = Object.fromEntries(TILES.map(t => [t.char, t]));
  const kindOf = ch => (byChar[ch] ? byChar[ch].kind : 'void');
  const FILE_HEADER = `'use strict';
/* ROOMS - what is inside each building, written by level-editor.html ("Download interiors.js"). Put this file at public/js/content/interiors.js.
 *
 *   <layout id>: { name, tiles: [rows of one-character tiles], furniture: [{ id, x, y, rot }], exit: [x, y] }
 *     tiles      see js/data/interiors/tiles.js:  .  nothing   w d s t r b h  floors   m  doormat (the way out)   W S P B  walls   V Q  walls with a window
 *     furniture  see js/data/furniture/: x, y = its top-left tile; rot 0-3 turns it (1 and 3 swap its width and depth)
 *     exit       the doormat tile: you arrive on the tile just north of it, and interact on it to go back outside
 * A building (js/data/buildings/) names the layout it opens into with \`interior\`. */
`;

  /* ---------------------------------------------------------------- state ---------------------------------------------------------------- */
  const fileRooms = normalizeAll(Interiors.raw);
  let rooms = clone(fileRooms), current = null;
  const ui = { tool: 'paint', tile: 'w', lastFloor: 'w', lastWall: 'W', furniture: FurnitureDefs.ids()[0], rot: 0, zoom: 30, hover: null, drag: null, walls: true };
  const history = {};                                         // room id -> { undo: [json], redo: [json] }

  function normalizeAll(raw) { const out = {}; for (const [id, r] of Object.entries(plain(raw) ? raw : {})) if (/^[a-z][a-z0-9_]{0,39}$/.test(id)) { const n = normalize(r); if (n) out[id] = n; } return out; }
  function normalize(r) {
    if (!plain(r) || !Array.isArray(r.tiles)) return null;
    const rows = r.tiles.filter(t => typeof t === 'string').slice(0, MAX);
    const w = Math.max(1, ...rows.map(t => t.length));
    return {
      name: typeof r.name === 'string' ? r.name : '',
      tiles: rows.map(t => (t + VOID.repeat(w)).slice(0, Math.min(w, MAX))),
      furniture: (Array.isArray(r.furniture) ? r.furniture : []).filter(f => plain(f) && FurnitureDefs.has(f.id)).map(f => ({ id: f.id, x: f.x | 0, y: f.y | 0, rot: ((f.rot | 0) % 4 + 4) % 4 })),
      exit: Array.isArray(r.exit) ? [r.exit[0] | 0, r.exit[1] | 0] : null
    };
  }
  const room = () => rooms[current];
  const size = r => ({ w: r.tiles[0] ? r.tiles[0].length : 0, h: r.tiles.length });
  const charAt = (r, x, y) => (y >= 0 && y < r.tiles.length && x >= 0 && x < r.tiles[y].length ? r.tiles[y][x] : VOID);
  const setChar = (r, x, y, ch) => { const row = r.tiles[y]; r.tiles[y] = row.slice(0, x) + ch + row.slice(x + 1); };
  const usedBy = id => BuildingDefs.all().filter(b => b.interior === id);

  /* ---------------------------------------------------------------- draft ---------------------------------------------------------------- */
  let saveTimer = null;
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(Interiors.DRAFT_KEY, JSON.stringify(rooms)); localStorage.setItem(DRAFT_AT_KEY, String(Date.now())); } catch (e) { setStatus('Could not save the draft in this browser: ' + e.message); return; }
      setStatus();
    }, 150);
  }
  const sameAsFile = () => JSON.stringify(rooms) === JSON.stringify(fileRooms);
  function setStatus(text) { $('status').textContent = text || (sameAsFile() ? 'Matches js/content/interiors.js' : 'Draft saved in this browser · Download to put it in the game'); }

  /** Before any change: remember the room for Undo. */
  function remember() {
    const h = history[current] || (history[current] = { undo: [], redo: [] });
    h.undo.push(JSON.stringify(room())); if (h.undo.length > 150) h.undo.shift(); h.redo = [];
  }
  function undo(redo) {
    const h = history[current]; if (!h) return;
    const from = redo ? h.redo : h.undo, to = redo ? h.undo : h.redo;
    if (!from.length) return;
    to.push(JSON.stringify(room())); rooms[current] = JSON.parse(from.pop());
    changed(true);
  }
  /** After a change: save, redraw. */
  function changed(full) { saveDraft(); drawPlan(); drawPreview(); renderWarnings(); if (full) { renderRooms(); renderProps(); } }

  /* ---------------------------------------------------------------- editing ---------------------------------------------------------------- */
  /** Paint one tile. A doormat moves the room's exit (the old doormat becomes the wall beside it, or floor). */
  function paint(r, x, y, ch) {
    const { w, h } = size(r);
    if (x < 0 || y < 0 || x >= w || y >= h || charAt(r, x, y) === ch) return;
    if (ch === MAT) {
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (charAt(r, xx, yy) === MAT) {
        const n = [[xx - 1, yy], [xx + 1, yy], [xx, yy - 1], [xx, yy + 1]].map(([a, b]) => charAt(r, a, b));
        setChar(r, xx, yy, n.find(c => kindOf(c) === 'wall') || n.find(c => kindOf(c) === 'floor' && c !== MAT) || ui.lastFloor);
      }
      r.exit = [x, y];
    } else if (r.exit && r.exit[0] === x && r.exit[1] === y) r.exit = null;
    setChar(r, x, y, ch);
  }
  function rect(r, a, b, fn) { for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) fn(x, y, x === Math.min(a.x, b.x) || x === Math.max(a.x, b.x) || y === Math.min(a.y, b.y) || y === Math.max(a.y, b.y)); }
  function flood(r, x, y, ch) {
    const { w, h } = size(r), from = charAt(r, x, y);
    if (from === ch || x < 0 || y < 0 || x >= w || y >= h) return;
    const stack = [[x, y]], seen = new Set();
    while (stack.length) {
      const [cx, cy] = stack.pop(), k = cy * w + cx;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h || seen.has(k) || charAt(r, cx, cy) !== from) continue;
      seen.add(k); paint(r, cx, cy, ch);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }
  const footprint = f => Interiors.footprint(FurnitureDefs.get(f.id), f.rot);
  function pieceAt(r, x, y) {
    for (let i = r.furniture.length - 1; i >= 0; i--) { const f = r.furniture[i], [fw, fh] = footprint(f); if (x >= f.x && y >= f.y && x < f.x + fw && y < f.y + fh) return i; }
    return -1;
  }
  const fits = (r, f) => { const [fw, fh] = footprint(f), { w, h } = size(r); return f.x >= 0 && f.y >= 0 && f.x + fw <= w && f.y + fh <= h; };
  function resize(r, w, h) {
    w = clamp(w | 0, 3, MAX); h = clamp(h | 0, 3, MAX);
    const rows = [];
    for (let y = 0; y < h; y++) rows.push(((r.tiles[y] || '') + VOID.repeat(w)).slice(0, w));
    r.tiles = rows;
    r.furniture = r.furniture.filter(f => fits(r, f));
    if (r.exit && (r.exit[0] >= w || r.exit[1] >= h)) r.exit = null;
  }

  /* ---------------------------------------------------------------- the plan (top-down grid) ---------------------------------------------------------------- */
  const plan = $('plan'), pctx = plan.getContext('2d'), M = 18;
  const swatch = ch => {
    const t = byChar[ch];
    if (!t || t.kind === 'void') return '#0b0d12';
    return t.kind === 'wall' ? t.colors.left : t.colors[0];
  };
  function drawPlan() {
    const r = room(); if (!r) { plan.width = plan.height = 1; return; }
    const { w, h } = size(r), z = ui.zoom;
    plan.width = w * z + M * 2; plan.height = h * z + M * 2;
    const c = pctx;
    c.fillStyle = '#0f1722'; c.fillRect(0, 0, plan.width, plan.height);
    c.font = '10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < Math.max(w, h); i++) { c.fillStyle = '#6f7f92'; if (i < w) c.fillText(i, M + i * z + z / 2, M / 2); if (i < h) c.fillText(i, M / 2, M + i * z + z / 2); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = charAt(r, x, y), t = byChar[ch], px = M + x * z, py = M + y * z;
      c.fillStyle = t && t.pattern === 'checker' && (x + y) & 1 ? t.colors[1] : swatch(ch); c.fillRect(px, py, z, z);
      if (t && t.kind === 'wall') {
        c.fillStyle = t.colors.top; c.fillRect(px, py, z, z * 0.3);
        c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, z - 1, z - 1);
        if (t.window) { c.fillStyle = '#5f86a8'; c.fillRect(px + z * 0.3, py + z * 0.4, z * 0.4, z * 0.4); }
      } else if (ch === MAT) { c.strokeStyle = '#d9b45a'; c.lineWidth = 2; c.strokeRect(px + 3, py + 3, z - 6, z - 6); }
      else if (!t || t.kind === 'void') { c.strokeStyle = 'rgba(255,255,255,.04)'; c.strokeRect(px + 0.5, py + 0.5, z - 1, z - 1); }
      else { c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, z - 1, z - 1); }
    }
    if (r.exit) {                                                       // the way out, and where you arrive
      const [ex, ey] = r.exit;
      c.fillStyle = '#fff'; c.font = `bold ${Math.round(z * 0.45)}px sans-serif`; c.fillText('↓', M + ex * z + z / 2, M + ey * z + z / 2 + 1);
      c.setLineDash([4, 3]); c.strokeStyle = '#8be28b'; c.lineWidth = 2; c.strokeRect(M + ex * z + 3, M + (ey - 1) * z + 3, z - 6, z - 6); c.setLineDash([]);
    }
    r.furniture.forEach((f, i) => drawPiece(f, ui.drag && ui.drag.kind === 'move' && ui.drag.index === i ? 0.35 : 0.85));
    const hv = ui.hover;
    if (hv && !ui.drag) {
      if (ui.tool === 'furniture') { const ghost = { id: ui.furniture, x: hv.x, y: hv.y, rot: ui.rot }; drawPiece(ghost, 0.45, !fits(r, ghost)); }
      else { c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(M + hv.x * z + 1, M + hv.y * z + 1, z - 2, z - 2); }
    }
    const d = ui.drag;
    if (d && (d.kind === 'rect' || d.kind === 'room') && d.end) {
      const x0 = Math.min(d.start.x, d.end.x), y0 = Math.min(d.start.y, d.end.y), x1 = Math.max(d.start.x, d.end.x), y1 = Math.max(d.start.y, d.end.y);
      c.strokeStyle = '#ffd36a'; c.lineWidth = 2; c.setLineDash([5, 4]); c.strokeRect(M + x0 * z + 1, M + y0 * z + 1, (x1 - x0 + 1) * z - 2, (y1 - y0 + 1) * z - 2); c.setLineDash([]);
      c.fillStyle = '#ffd36a'; c.font = '11px sans-serif'; c.fillText(`${x1 - x0 + 1} x ${y1 - y0 + 1}`, M + (x0 + x1 + 1) * z / 2, M + y0 * z - 7);
    }
    if (d && d.kind === 'move' && hv) { const f = Object.assign({}, r.furniture[d.index], { x: hv.x - d.dx, y: hv.y - d.dy }); drawPiece(f, 0.7, !fits(r, f)); }
  }
  /** A furniture piece on the plan: its footprint, its name, and a bar along its back. */
  function drawPiece(f, alpha, bad) {
    const def = FurnitureDefs.get(f.id); if (!def) return;
    const [fw, fh] = footprint(f), z = ui.zoom, px = M + f.x * z, py = M + f.y * z, c = pctx, col = Object.values(def.colors || {}).find(v => typeof v === 'string' && v[0] === '#') || '#a8763f';
    c.globalAlpha = alpha; c.fillStyle = bad ? '#c0392b' : col; c.fillRect(px + 2, py + 2, fw * z - 4, fh * z - 4); c.globalAlpha = 1;
    c.strokeStyle = def.solid ? '#111' : '#ffffff'; c.setLineDash(def.solid ? [] : [3, 3]); c.lineWidth = 1.5; c.strokeRect(px + 2, py + 2, fw * z - 4, fh * z - 4); c.setLineDash([]);
    const back = [[px + 2, py + 2, fw * z - 4, 3], [px + fw * z - 5, py + 2, 3, fh * z - 4], [px + 2, py + fh * z - 5, fw * z - 4, 3], [px + 2, py + 2, 3, fh * z - 4]][f.rot | 0];
    c.fillStyle = '#111'; c.fillRect(...back);
    if (z >= 20) { c.fillStyle = '#fff'; c.font = `${Math.max(9, Math.round(z * 0.32))}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(def.name.length > 10 && fw * fh < 2 ? def.name.slice(0, 6) + '.' : def.name, px + fw * z / 2, py + fh * z / 2, fw * z - 6); }
  }
  const cellOf = e => { const b = plan.getBoundingClientRect(), x = (e.clientX - b.left) * plan.width / b.width, y = (e.clientY - b.top) * plan.height / b.height; return { x: Math.floor((x - M) / ui.zoom), y: Math.floor((y - M) / ui.zoom) }; };
  const inside = (r, p) => { const { w, h } = size(r); return p.x >= 0 && p.y >= 0 && p.x < w && p.y < h; };

  plan.addEventListener('contextmenu', e => e.preventDefault());
  plan.addEventListener('pointerdown', e => {
    const r = room(); if (!r) return;
    const p = cellOf(e); plan.setPointerCapture(e.pointerId);
    if (e.button === 2) { const i = pieceAt(r, p.x, p.y); if (i >= 0) { remember(); r.furniture.splice(i, 1); changed(); } return; }
    if (!inside(r, p) && ui.tool !== 'room' && ui.tool !== 'rect') return;
    if (ui.tool === 'paint' || ui.tool === 'erase') { remember(); ui.drag = { kind: 'paint' }; paint(r, p.x, p.y, ui.tool === 'erase' ? VOID : ui.tile); changed(); }
    else if (ui.tool === 'rect' || ui.tool === 'room') ui.drag = { kind: ui.tool, start: p, end: p };
    else if (ui.tool === 'fill') { remember(); flood(r, p.x, p.y, ui.tile); changed(); }
    else if (ui.tool === 'pick') { pickTile(charAt(r, p.x, p.y)); setTool('paint'); }
    else if (ui.tool === 'furniture') {
      const i = pieceAt(r, p.x, p.y);
      if (i >= 0) { const f = r.furniture[i]; ui.drag = { kind: 'move', index: i, dx: p.x - f.x, dy: p.y - f.y }; return; }
      const f = { id: ui.furniture, x: p.x, y: p.y, rot: ui.rot };
      if (fits(r, f)) { remember(); r.furniture.push(f); changed(); }
    }
  });
  plan.addEventListener('pointermove', e => {
    const r = room(); if (!r) return;
    const p = cellOf(e); ui.hover = inside(r, p) ? p : null;
    const d = ui.drag;
    if (d && d.kind === 'paint' && inside(r, p)) { paint(r, p.x, p.y, ui.tool === 'erase' ? VOID : ui.tile); changed(); return; }
    if (d && (d.kind === 'rect' || d.kind === 'room')) d.end = { x: clamp(p.x, 0, size(r).w - 1), y: clamp(p.y, 0, size(r).h - 1) };
    const t = ui.hover ? charAt(r, ui.hover.x, ui.hover.y) : null, i = ui.hover ? pieceAt(r, ui.hover.x, ui.hover.y) : -1;
    $('hoverInfo').textContent = ui.hover ? `x ${p.x}, y ${p.y} · ${byChar[t] ? byChar[t].name : 'nothing'}${i >= 0 ? ' · ' + FurnitureDefs.get(r.furniture[i].id).name : ''}` : '';
    drawPlan();
  });
  plan.addEventListener('pointerleave', () => { ui.hover = null; drawPlan(); });
  plan.addEventListener('pointerup', e => {
    const r = room(), d = ui.drag; ui.drag = null;
    if (!r || !d) return;
    if (d.kind === 'rect' || d.kind === 'room') {
      remember();
      const s = { x: clamp(d.start.x, 0, size(r).w - 1), y: clamp(d.start.y, 0, size(r).h - 1) };
      rect(r, s, d.end || s, (x, y, edge) => paint(r, x, y, d.kind === 'room' ? (edge ? ui.lastWall : ui.lastFloor) : ui.tile));
      changed();
    } else if (d.kind === 'move') {
      const p = cellOf(e), f = Object.assign({}, r.furniture[d.index], { x: p.x - d.dx, y: p.y - d.dy });
      if (fits(r, f) && (f.x !== r.furniture[d.index].x || f.y !== r.furniture[d.index].y)) { remember(); r.furniture[d.index] = f; changed(); } else drawPlan();
    }
  });

  /* ---------------------------------------------------------------- the preview (as the game draws it) ---------------------------------------------------------------- */
  const preview = $('preview'), vctx = preview.getContext('2d');
  function drawPreview() {
    const r = room(), wrap = $('previewWrap');
    const cw = Math.max(200, wrap.clientWidth - 16), ch = Math.max(180, Math.round(cw * 0.72)), dpr = window.devicePixelRatio || 1;
    preview.width = cw * dpr; preview.height = ch * dpr; preview.style.width = cw + 'px'; preview.style.height = ch + 'px';
    const c = vctx; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0b0d12'; c.fillRect(0, 0, preview.width, preview.height);
    if (!r) return;
    const L = Interiors.build('preview', r); if (!L) return;
    const { w, h } = L, minX = isoX(0, h), maxX = isoX(w, 0), minY = isoY(0, 0) - InteriorSprites.TALL - TILE_HALF_H, maxY = isoY(w, h) + 4;
    const s = Math.min(preview.width / (maxX - minX + 40), preview.height / (maxY - minY + 40));
    c.setTransform(s, 0, 0, s, (preview.width - (maxX + minX) * s) / 2, (preview.height - (maxY + minY) * s) / 2);
    const g = { ctx: c }, now = performance.now();
    const floorAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !L.walls[y * w + x] && !isInteriorVoid(L.grid[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!L.walls[y * w + x]) InteriorSprites.tile(c, L.grid[y * w + x], (x - y) * TILE_HALF_W, (x + y + 1) * TILE_HALF_H, x, y);
    const items = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = L.walls[y * w + x]; if (!o) continue;
      const low = !ui.walls || floorAt(x, y - 1) || floorAt(x - 1, y) || floorAt(x - 1, y - 1);
      items.push({ depth: x + y + 1, draw: () => InteriorSprites.wall(g, o, (x - y) * TILE_HALF_W, (x + y + 1) * TILE_HALF_H, { low, windowS: floorAt(x, y + 1), windowE: floorAt(x + 1, y) }) });
    }
    for (const f of L.furniture) items.push({ depth: f.x + f.w / 2 + f.y + f.h / 2, draw: () => InteriorSprites.furniture(g, { id: f.id, x: f.x + f.w / 2, y: f.y + f.h / 2, w: f.w, h: f.h, rot: f.rot }, now) });
    const [ex, ey] = L.exit, ax = ex + 0.5, ay = ey - 0.5;                               // someone standing where players arrive, for scale
    items.push({ depth: ax + ay, draw: () => drawPerson(c, isoX(ax, ay), isoY(ax, ay)) });
    items.sort((a, b) => a.depth - b.depth).forEach(i => i.draw());
  }
  function drawPerson(c, x, y) {
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(x, y, 9, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2b2b3a'; c.fillRect(x - 5, y - 18, 4, 18); c.fillRect(x + 1, y - 18, 4, 18);
    c.fillStyle = '#3e6fb5'; c.fillRect(x - 7, y - 40, 14, 23);
    c.fillStyle = '#f0c9a0'; c.beginPath(); c.arc(x, y - 47, 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e0b84a'; c.fillRect(x - 6, y - 57, 12, 4);
  }
  let pending = 0;
  const animate = () => { if (FurnitureDefs.all().some(d => d.style === 'fireplace') && room() && room().furniture.some(f => f.id === 'fireplace') && ++pending % 4 === 0) drawPreview(); requestAnimationFrame(animate); };

  /* ---------------------------------------------------------------- warnings ---------------------------------------------------------------- */
  function renderWarnings() {
    const r = room(), out = [];
    if (r) {
      const { w, h } = size(r), L = Interiors.build('check', r);
      if (!r.exit || charAt(r, r.exit[0], r.exit[1]) !== MAT) out.push(['bad', 'There is no doormat: paint one (m) where players come in and go out.']);
      else if (L && L.solid[(r.exit[1] - 1) * L.w + r.exit[0]] !== 0) out.push(['bad', 'Players arrive on the tile above the doormat: make it clear floor (no wall or solid furniture).']);
      if (!usedBy(current).length) out.push(['info', `No building opens into "${current}" yet: set a building's interior to it in js/data/buildings/.`]);
      const solidTiles = {};
      r.furniture.forEach((f, i) => {
        const def = FurnitureDefs.get(f.id), [fw, fh] = footprint(f);
        for (let y = f.y; y < f.y + fh; y++) for (let x = f.x; x < f.x + fw; x++) {
          if (kindOf(charAt(r, x, y)) !== 'floor') { out.push(['warn', `${def.name} at ${f.x},${f.y} stands on a wall or outside the room.`]); return; }
          if (def.solid) { const k = x + ',' + y; if (solidTiles[k] !== undefined) { out.push(['warn', `${def.name} at ${f.x},${f.y} overlaps ${FurnitureDefs.get(r.furniture[solidTiles[k]].id).name}.`]); return; } solidTiles[k] = i; }
        }
      });
      const open = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (kindOf(charAt(r, x, y)) === 'floor' && (x === 0 || y === 0 || x === w - 1 || y === h - 1) && charAt(r, x, y) !== MAT) open.push(`${x},${y}`);
      if (open.length) out.push(['warn', `Floor at the edge of the room (${open.slice(0, 4).join(' ')}${open.length > 4 ? '...' : ''}): players can see out into the dark. Walls usually go round the edge.`]);
    }
    $('warnings').innerHTML = out.length ? out.map(([k, t]) => `<div class="w ${k}">${t}</div>`).join('') : '<div class="w good">Ready to play.</div>';
  }

  /* ---------------------------------------------------------------- side panels ---------------------------------------------------------------- */
  function renderRooms() {
    const list = $('rooms'); list.innerHTML = '';
    for (const id of Object.keys(rooms)) {
      const b = usedBy(id), r = rooms[id], { w, h } = size(r);
      const el = document.createElement('button'); el.className = 'entry' + (id === current ? ' on' : '');
      el.innerHTML = `<span class="en"><b>${escapeHtml(r.name || id)}</b><small>${id} · ${w} x ${h}${b.length ? ' · ' + b.map(x => escapeHtml(x.name)).join(', ') : ' · not used yet'}</small></span>${fileRooms[id] ? (JSON.stringify(fileRooms[id]) !== JSON.stringify(r) ? '<span class="tag edited">edited</span>' : '') : '<span class="tag custom">new</span>'}`;
      el.addEventListener('click', () => select(id));
      list.appendChild(el);
    }
  }
  function renderProps() {
    const box = $('roomProps'), r = room(); box.innerHTML = '';
    if (!r) return;
    const { w, h } = size(r), b = usedBy(current);
    box.innerHTML = `<div class="ptitle">This room</div>
      <label>Name <input id="roomName" value="${escapeHtml(r.name)}"></label>
      <div class="row"><label>Width <input id="roomW" type="number" min="3" max="${MAX}" value="${w}"></label><label>Depth <input id="roomH" type="number" min="3" max="${MAX}" value="${h}"></label></div>
      <small>Used by: ${b.length ? b.map(x => escapeHtml(x.name)).join(', ') : 'no building yet'}</small>
      <div class="row"><button id="roomDup">Duplicate</button><button id="roomReset"${fileRooms[current] ? '' : ' disabled'}>Back to file</button><button id="roomDel" class="danger">Delete</button></div>`;
    $('roomName').addEventListener('input', e => { r.name = e.target.value; saveDraft(); renderRooms(); });
    const sizeChange = () => { remember(); resize(r, Number($('roomW').value), Number($('roomH').value)); changed(true); };
    $('roomW').addEventListener('change', sizeChange); $('roomH').addEventListener('change', sizeChange);
    $('roomDup').addEventListener('click', () => openNew(current));
    $('roomReset').addEventListener('click', () => { if (confirm(`Put "${r.name || current}" back the way js/content/interiors.js has it?`)) { remember(); rooms[current] = clone(fileRooms[current]); changed(true); } });
    $('roomDel').addEventListener('click', () => {
      if (!confirm(b.length ? `${b.map(x => x.name).join(', ')} open${b.length > 1 ? '' : 's'} into this room: it will have nothing inside. Delete "${current}"?` : `Delete "${current}"?`)) return;
      delete rooms[current]; current = Object.keys(rooms)[0] || null; changed(true);
    });
  }
  const TOOLS = [['paint', 'Paint', 'P'], ['room', 'Room', 'O'], ['rect', 'Rectangle', 'X'], ['fill', 'Fill', 'F'], ['pick', 'Pick', 'I'], ['erase', 'Erase', 'E'], ['furniture', 'Furniture', 'U']];
  function renderTools() {
    $('tools').innerHTML = TOOLS.map(([id, name, key]) => `<button data-tool="${id}" class="${ui.tool === id ? 'on' : ''}" title="${name} (${key})">${name} <kbd>${key}</kbd></button>`).join('');
  }
  function setTool(t) { ui.tool = t; renderTools(); renderPalette(); drawPlan(); }
  $('tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  function pickTile(ch) {
    if (!byChar[ch]) return;
    ui.tile = ch; const k = kindOf(ch);
    if (k === 'floor' && ch !== MAT) ui.lastFloor = ch;
    if (k === 'wall') ui.lastWall = ch;
    if (ui.tool === 'furniture' || ui.tool === 'erase') ui.tool = 'paint';
    renderTools(); renderPalette();
  }
  /** Tiles and furniture, each with a little picture drawn by the game's own code. */
  function renderPalette() {
    const tl = $('tileList'); tl.innerHTML = '';
    for (const t of TILES) {
      const el = document.createElement('button'); el.className = 'pal' + (ui.tile === t.char && ui.tool !== 'furniture' ? ' on' : '') + (t.char === ui.lastFloor || t.char === ui.lastWall ? ' room' : '');
      el.title = `${t.name} (${t.char})`;
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; el.appendChild(cv);
      const c = cv.getContext('2d'), info = InteriorTileInfo.byChar[t.char];
      c.setTransform(0.62, 0, 0, 0.62, 32, t.kind === 'wall' ? 50 : 30);
      if (t.kind === 'wall') { InteriorSprites.tile(c, InteriorTileInfo.byChar.w.tile, 0, 0, 1, 1); InteriorSprites.wall({ ctx: c }, info.obj, 0, 0, { windowS: true }); }
      else InteriorSprites.tile(c, info.tile, 0, 0, 3, 5);
      el.insertAdjacentHTML('beforeend', `<span>${t.name}</span><kbd>${t.char}</kbd>`);
      el.addEventListener('click', () => pickTile(t.char));
      tl.appendChild(el);
    }
    const fl = $('furnitureList'); fl.innerHTML = '';
    for (const def of FurnitureDefs.all()) {
      const el = document.createElement('button'); el.className = 'pal' + (ui.tool === 'furniture' && ui.furniture === def.id ? ' on' : '');
      el.title = `${def.name} (${def.size[0]} x ${def.size[1]}${def.solid ? ', solid' : ''})`;
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; el.appendChild(cv);
      const c = cv.getContext('2d'), [fw, fh] = def.size, k = 0.5 / Math.max(1, (fw + fh) / 2.4);
      c.setTransform(k, 0, 0, k, 32 - isoX(fw / 2, fh / 2) * k, 52 - isoY(fw, fh) * k + 6);
      InteriorSprites.furniture({ ctx: c }, { id: def.id, x: fw / 2, y: fh / 2, w: fw, h: fh, rot: 0 }, 0);
      el.insertAdjacentHTML('beforeend', `<span>${def.name}</span><kbd>${fw}x${fh}</kbd>`);
      el.addEventListener('click', () => { ui.furniture = def.id; setTool('furniture'); });
      fl.appendChild(el);
    }
  }
  const escapeHtml = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function select(id) { current = id; ui.hover = null; ui.drag = null; renderRooms(); renderProps(); drawPlan(); drawPreview(); renderWarnings(); }

  /* ---------------------------------------------------------------- new room ---------------------------------------------------------------- */
  function openNew(from) {
    $('newId').value = ''; $('newName').value = ''; $('newError').textContent = '';
    const sel = $('newFrom'); sel.innerHTML = '<option value="">An empty room (walls and a wood floor)</option>' + Object.keys(rooms).map(id => `<option value="${id}">A copy of ${escapeHtml(rooms[id].name || id)}</option>`).join('');
    sel.value = from || '';
    $('newDialog').showModal();
  }
  function emptyRoom(name) {
    const w = 10, h = 8, rows = [];
    for (let y = 0; y < h; y++) rows.push(y === 0 ? 'WWVWWWWVWW' : y === h - 1 ? 'WWWWmWWWWW' : 'W' + 'w'.repeat(w - 2) + 'W');
    return { name, tiles: rows, furniture: [], exit: [4, h - 1] };
  }
  $('newCreate').addEventListener('click', e => {
    const id = $('newId').value.trim(), err = $('newError');
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(id)) { e.preventDefault(); err.textContent = 'Use lower case letters, digits and _ (starting with a letter).'; return; }
    if (rooms[id]) { e.preventDefault(); err.textContent = `"${id}" is already taken.`; }
  });
  $('newDialog').addEventListener('close', () => {
    if ($('newDialog').returnValue !== 'ok') return;
    const id = $('newId').value.trim(), name = $('newName').value.trim() || id, from = $('newFrom').value;
    rooms[id] = from && rooms[from] ? Object.assign(clone(rooms[from]), { name }) : emptyRoom(name);
    current = id; changed(true);
  });
  $('btnNewRoom').addEventListener('click', () => openNew(''));

  /* ---------------------------------------------------------------- file in / out ---------------------------------------------------------------- */
  /** The rooms as a JS file: one row of tiles per line, one piece of furniture per line, so it is easy to read and to diff. */
  function fileText() {
    const q = JSON.stringify, ids = Object.keys(rooms);
    const body = ids.map((id, n) => {
      const r = rooms[id];
      return `  ${q(id)}: {\n    "name": ${q(r.name || id)},\n    "tiles": [\n${r.tiles.map(t => '      ' + q(t)).join(',\n')}\n    ],\n` +
        `    "furniture": [${r.furniture.length ? '\n' + r.furniture.map(f => `      { "id": ${q(f.id)}, "x": ${f.x}, "y": ${f.y}, "rot": ${f.rot} }`).join(',\n') + '\n    ' : ''}],\n` +
        `    "exit": ${r.exit ? `[${r.exit[0]}, ${r.exit[1]}]` : 'null'}\n  }${n < ids.length - 1 ? ',' : ''}`;
    }).join('\n');
    return FILE_HEADER + 'window.PONYSCAPES_INTERIORS = {\n' + body + '\n};\n';
  }
  $('btnDownload').addEventListener('click', () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([fileText()], { type: 'text/javascript' })); a.download = 'interiors.js';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    showBanner('Saved interiors.js: put it at <code>public/js/content/interiors.js</code> (replacing the one there).', [['OK', hideBanner]]);
  });
  $('importFile').addEventListener('change', e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result), json = text.trim().startsWith('{') ? text : text.slice(text.indexOf('{', text.indexOf('PONYSCAPES_INTERIORS')), text.lastIndexOf('}') + 1);
        const got = normalizeAll(JSON.parse(json));
        if (!Object.keys(got).length) throw new Error('no rooms in it');
        rooms = got; current = Object.keys(rooms)[0]; changed(true);
        showBanner(`Imported ${escapeHtml(file.name)}.`, [['OK', hideBanner]]);
      } catch (err) { showBanner(`Could not read ${escapeHtml(file.name)} (${escapeHtml(err.message)}).`, [['OK', hideBanner]]); }
    };
    reader.readAsText(file);
  });
  $('btnDiscard').addEventListener('click', () => {
    if (!confirm('Throw the draft away and go back to js/content/interiors.js?')) return;
    rooms = clone(fileRooms); try { localStorage.removeItem(Interiors.DRAFT_KEY); } catch (e) { /* nothing stored */ }
    current = rooms[current] ? current : Object.keys(rooms)[0] || null; setStatus(); renderRooms(); renderProps(); drawPlan(); drawPreview(); renderWarnings();
  });
  $('btnPlay').addEventListener('click', () => {
    if (!current) return;
    try { localStorage.setItem(Interiors.DRAFT_KEY, JSON.stringify(rooms)); } catch (e) { /* the game falls back to the file */ }
    const b = usedBy(current)[0];
    if (!b) { showBanner(`No building opens into "${escapeHtml(current)}" yet, so there is nowhere to walk in. Set a building's <code>interior</code> to it in js/data/buildings/.`, [['OK', hideBanner]]); return; }
    window.open(`index.html?solo=1&content=draft&enter=${encodeURIComponent(b.id)}`, '_blank');
  });
  $('btnUndo').addEventListener('click', () => undo(false));
  $('btnRedo').addEventListener('click', () => undo(true));
  $('zoom').addEventListener('input', e => { ui.zoom = Number(e.target.value); drawPlan(); });
  $('previewWalls').addEventListener('change', e => { ui.walls = e.target.checked; drawPreview(); });
  function showBanner(html, buttons) { const b = $('banner'); b.hidden = false; b.innerHTML = `<span>${html}</span>`; for (const [label, fn] of buttons) { const x = document.createElement('button'); x.textContent = label; x.addEventListener('click', fn); b.appendChild(x); } }
  const hideBanner = () => { $('banner').hidden = true; };

  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, select, textarea, dialog')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(e.shiftKey); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); undo(true); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'r') {
      const r = room(), i = r && ui.hover ? pieceAt(r, ui.hover.x, ui.hover.y) : -1;
      if (i >= 0 && ui.tool === 'furniture') { const f = Object.assign({}, r.furniture[i], { rot: (r.furniture[i].rot + 1) % 4 }); if (fits(r, f)) { remember(); r.furniture[i] = f; changed(); } }
      else { ui.rot = (ui.rot + 1) % 4; drawPlan(); }
      return;
    }
    const tool = TOOLS.find(t => t[2].toLowerCase() === k);
    if (tool) { setTool(tool[0]); return; }
    if (byChar[e.key]) pickTile(e.key);                                  // a tile's own character picks it (w, W, m, ...)
  });
  window.addEventListener('resize', () => drawPreview());

  /* ---------------------------------------------------------------- start ---------------------------------------------------------------- */
  let saved = null;
  try { const raw = localStorage.getItem(Interiors.DRAFT_KEY); if (raw) saved = normalizeAll(JSON.parse(raw)); } catch (e) { saved = null; }
  if (saved && Object.keys(saved).length && JSON.stringify(saved) !== JSON.stringify(fileRooms)) {
    rooms = saved;
    let at = ''; try { at = new Date(Number(localStorage.getItem(DRAFT_AT_KEY))).toLocaleString(); } catch (e) { /* unknown */ }
    showBanner(`Continuing your draft${at ? ' from ' + at : ''}, which differs from js/content/interiors.js.`, [['Keep the draft', hideBanner], ['Use the file instead', () => { rooms = clone(fileRooms); saveDraft(); hideBanner(); current = Object.keys(rooms)[0] || null; select(current); }]]);
  }
  current = Object.keys(rooms)[0] || null;
  renderTools(); renderPalette(); setStatus(); select(current);
  requestAnimationFrame(animate);
})();
