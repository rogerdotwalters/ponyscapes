'use strict';
/* CLIENT - the pixel-art painter for everything that stands in the world but is not a building, a tree or a creature: furniture, the walls and floors
 * of rooms, the barrels / crates / firewood outside houses, the stockpiles, the well, the chest. It works like pixelBuildings.js: a piece is described
 * as a few solid shapes (boxes and cylinders, in tile units; heights in art pixels), RAY-CAST once, art pixel by art pixel, textured by what each
 * pixel hits (planks, staves, fieldstone, brick, cloth, straw...), lit from the upper left, with a dark contact line where one shape stands in front
 * of another and a 1-pixel outline round the whole, then cached and drawn with hard edges at ART world pixels per art pixel.
 *
 *   scene()            a new scene:  s.box(x0, y0, x1, y1, z0, z1, material)   s.cyl(cx, cy, z0, z1, radius, material, bulge)   s.decal((g, P) => ...)
 *   render(scene)      -> { canvas, minX, minY }  (art pixels, relative to the scene's origin: tile coordinate (0, 0) on the ground)
 *   Materials are functions (hit) => colour | null (null: see through). hit = { face: 'S' | 'E' | 'T' | 'C' (cylinder side), u, v (art px along / up the face),
 *   fw, fh (the face's size), k (light), x, y, z }. */
const PixelDecor = (() => {
  const { hex, shade, light, mix, outline } = PixelCharacter.util;
  const ART = 1.5;                                                              // world pixels per art pixel (as the buildings)
  const HWa = TILE_HALF_W / ART, HHa = TILE_HALF_H / ART, LEN = Math.hypot(HWa, HHa), SQ2 = Math.SQRT2;
  const OUTLINE = '#1c140e';
  const hash = (a, b, c = 0) => { let h = (Math.floor(a) * 374761393 + Math.floor(b) * 668265263 + Math.floor(c) * 2246822519) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
  const sh = (c, k) => { k = Math.round(k * 12) / 12; return k === 1 ? c : k < 1 ? shade(c, k) : light(c, k - 1); };
  const A = px => px / ART;                                                     // world pixels -> art pixels (heights in the data are in world pixels)
  const rgbMemo = new Map();
  const rgbOf = c => { let v = rgbMemo.get(c); if (!v) { v = hex(c); if (rgbMemo.size > 6000) rgbMemo.clear(); rgbMemo.set(c, v); } return v; };

  /* ------------------------------------------------ materials ------------------------------------------------ */
  const M = {
    solid: c => h => sh(c, h.k),
    /** Boards: dir 'h' (running along the face) or 'v' (standing up), pw = a board's width in art pixels. */
    wood(base, o = {}) {
      const pw = o.pw || 5, dir = o.dir || 'h', seed = o.seed || 0, tn = [shade(base, 0.86), base, light(base, 0.1), shade(base, 0.94)];
      return h => {
        const side = h.face !== 'T', a = side && dir === 'v' ? h.u : h.v, b = side && dir === 'v' ? h.v : h.u;
        const pi = Math.floor(a / pw), fr = a - pi * pw, s = hash(pi, seed, h.face === 'T' ? 1 : 2);
        let c = tn[Math.floor(s * 4) % 4];
        if (fr < 1) c = shade(c, 0.64); else if (fr < 2) c = light(c, 0.09);
        else if (hash(Math.floor(b / (5 + s * 7)), pi, 7) > 0.84) c = shade(c, 0.88);                // grain
        const jl = 20 + (pi % 3) * 7;
        if ((b + s * 40) % jl < 1 && fr > 1) c = shade(c, 0.7);                                       // a butt joint
        return sh(c, h.k);
      };
    },
    /** Fieldstone blocks in courses. */
    stone(base, o = {}) {
      const ch = o.course || 6;
      return h => {
        const row = Math.floor(h.v / ch), fr = h.v - row * ch, len = 9 + hash(row, 3) * 5, off = hash(row, 9) * len, bi = Math.floor((h.u + off) / len), bx = (h.u + off) - bi * len;
        const s = hash(bi, row, o.seed || 0);
        let c = mix(base, s > 0.5 ? '#c9c4b6' : '#6b675e', Math.abs(s - 0.5) * 0.7);
        if (fr < 1 || bx < 1) c = shade(c, 0.6);
        else if (fr < 2) c = light(c, 0.1);
        else if (hash(h.u * 1.3, h.v, 5) > 0.93) c = shade(c, 0.86);
        return sh(c, h.k);
      };
    },
    brick(base, o = {}) {
      return h => {
        const row = Math.floor(h.v / 4), fr = h.v - row * 4, off = (row % 2) * 4, bi = Math.floor((h.u + off) / 8), bx = (h.u + off) - bi * 8, s = hash(bi, row, o.seed || 0);
        let c = mix(base, s > 0.5 ? '#d97a55' : '#6e2f22', Math.abs(s - 0.5) * 0.5);
        if (fr < 1 || bx < 1) c = mix(base, '#d6c9ae', 0.55);                                          // mortar
        else if (fr < 2) c = light(c, 0.08);
        return sh(c, h.k);
      };
    },
    plaster(base, o = {}) {
      return h => { let c = base; const s = hash(h.u, h.v, o.seed || 0); if (s > 0.94) c = shade(c, 0.93); else if (s < 0.04) c = light(c, 0.05); return sh(c, h.k); };
    },
    cloth(base, o = {}) {
      return h => {
        let c = ((Math.floor(h.u) + Math.floor(h.v)) & 1) ? base : shade(base, 0.93);
        if (o.stripe && Math.floor(h.u / o.stripe) % 2) c = mix(c, o.stripeColor || '#e8e0cf', 0.55);
        return sh(c, h.k);
      };
    },
    hay(base) {
      return h => {
        const s = hash(h.u * 0.7, Math.floor(h.v / 2), 4);
        let c = s > 0.7 ? light(base, 0.25) : s < 0.25 ? shade(base, 0.75) : base;
        if (hash(h.u, h.v, 8) > 0.9) c = shade(c, 0.6);
        return sh(c, h.k);
      };
    },
    /** A log's end (rings) in a grid of round ends, bark showing between them; on other faces, bark. */
    logs(bark, wood, o = {}) {
      const cell = o.cell || 5, end = o.end || 'S';
      return h => {
        if (h.face === end) {
          const cx = Math.floor(h.u / cell), cy = Math.floor(h.v / cell), dx = h.u - (cx + 0.5) * cell, dy = h.v - (cy + 0.5) * cell, d = Math.hypot(dx, dy), r = cell / 2 - 0.2;
          if (d > r) return sh(shade(bark, 0.45), h.k);
          if (d > r - 1) return sh(shade(bark, 0.85), h.k);
          const ring = Math.floor(d * 1.3 + hash(cx, cy) * 2) % 2;
          return sh(ring ? shade(wood, 0.84) : wood, h.k);
        }
        const row = Math.floor(h.v / cell), fr = h.v - row * cell;
        let c = fr < 1 ? shade(bark, 0.55) : hash(Math.floor(h.u / 3), row, 5) > 0.7 ? shade(bark, 0.82) : bark;
        return sh(c, h.k);
      };
    },
    /** Pick a material by face: { front, side, top, bottom? } (front: the face a piece shows to the room). */
    faced(front, o) { return h => (h.face === 'T' ? o.top : h.face === front ? o.front : o.side)(h); }
  };

  /* ------------------------------------------------ the scene and its ray cast ------------------------------------------------ */
  function scene() {
    const prims = [], decals = [];
    return { prims, decals,
      box(x0, y0, x1, y1, z0, z1, mat) { prims.push({ t: 'b', x0, y0, x1, y1, z0, z1, mat }); return this; },
      cyl(cx, cy, z0, z1, r, mat, bulge = 0) { prims.push({ t: 'c', cx, cy, z0, z1, r, mat, bulge }); return this; },
      decal(fn) { decals.push(fn); return this; } };
  }

  const hitInfo = { face: '', u: 0, v: 0, fw: 0, fh: 0, k: 1, x: 0, y: 0, z: 0 };
  /** The nearest hit of a pixel on a primitive: writes { n } into `out` and returns the colour, or null. */
  function castPrim(p, X, Y, out) {
    const h = hitInfo; let best = -Infinity, col = null;
    const tryHit = (n, face, u, v, fw, fh, k, x, y, z) => {
      if (n <= best) return;
      h.face = face; h.u = u; h.v = v; h.fw = fw; h.fh = fh; h.k = k; h.x = x; h.y = y; h.z = z;
      const c = p.mat(h);
      if (c) { best = n; col = c; }
    };
    if (p.t === 'b') {
      const { x0, y0, x1, y1, z0, z1 } = p;
      let x = X / HWa + y1, z = (x + y1) * HHa - Y;                                                 // the south face (y = y1)
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) tryHit((x + y1) * HHa + z, 'S', (x - x0) * LEN, z - z0, (x1 - x0) * LEN, z1 - z0, 1, x, y1, z);
      let y = x1 - X / HWa; z = (x1 + y) * HHa - Y;                                                 // the east face (x = x1)
      if (y >= y0 && y <= y1 && z >= z0 && z <= z1) tryHit((x1 + y) * HHa + z, 'E', (y1 - y) * LEN, z - z0, (y1 - y0) * LEN, z1 - z0, 0.78, x1, y, z);
      y = (z1 + Y - X * HHa / HWa) / (2 * HHa); x = X / HWa + y;                                    // the top
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) tryHit((x + y) * HHa + z1, 'T', (x - x0) * LEN, (y - y0) * LEN, (x1 - x0) * LEN, (y1 - y0) * LEN, 1.12, x, y, z1);
    } else {
      const { cx, cy, z0, z1, r, bulge } = p, sx = (cx - cy) * HWa, by = (cx + cy) * HHa, dx = X - sx, hgt = z1 - z0;
      const rAt = z => r * (1 + bulge * Math.sin(Math.PI * clamp((z - z0) / hgt, 0, 1)));
      let z = (z0 + z1) / 2, ok = true, t = 0, s = 0, rr = r;
      for (let i = 0; i < 4 && ok; i++) {
        rr = rAt(z); const rX = rr * SQ2 * HWa;
        if (Math.abs(dx) > rX) { ok = false; break; }
        t = dx / rX; s = Math.sqrt(1 - t * t); z = by + rr * SQ2 * HHa * s - Y;
      }
      if (ok && z >= z0 && z <= z1) {
        const k = 0.98 - 0.3 * t + (t < -0.55 ? 0.1 : 0);
        tryHit((cx + cy + rr * SQ2 * s) * HHa + z, 'C', (Math.asin(t) + Math.PI / 2) * r * SQ2 * HWa * 0.5 + 0, z - z0, Math.PI * r * SQ2 * HWa * 0.5, hgt, k, cx, cy, z);
      }
      const rY = r * SQ2 * HHa, ny = (Y - (by - z1)) / rY, nx = dx / (r * SQ2 * HWa);
      if (nx * nx + ny * ny <= 1) tryHit((cx + cy + r * SQ2 * ny) * HHa + z1, 'T', nx * r * LEN + r * LEN, ny * r * LEN + r * LEN, 2 * r * LEN, 2 * r * LEN, 1.12, cx + nx * r, cy + ny * r, z1);
    }
    out.n = best; return col;
  }

  /** Cast every pixel of a scene: { canvas, minX, minY } (cached by the callers). */
  function render(S, margin = 3) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const grow = (x, y, z) => { const X = (x - y) * HWa, Y = (x + y) * HHa - z; minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y); };
    for (const p of S.prims) {
      if (p.t === 'b') for (const x of [p.x0, p.x1]) for (const y of [p.y0, p.y1]) for (const z of [p.z0, p.z1]) grow(x, y, z);
      else { const rr = p.r * (1 + p.bulge), X = (p.cx - p.cy) * HWa, Y = (p.cx + p.cy) * HHa; minX = Math.min(minX, X - rr * SQ2 * HWa); maxX = Math.max(maxX, X + rr * SQ2 * HWa); minY = Math.min(minY, Y - p.z1 - rr * SQ2 * HHa); maxY = Math.max(maxY, Y - p.z0 + rr * SQ2 * HHa); }
    }
    if (!S.prims.length) { minX = maxX = minY = maxY = 0; }
    for (const d of S.decalBounds || []) grow(d[0], d[1], d[2]);
    minX = Math.floor(minX) - margin; minY = Math.floor(minY) - margin - (S.headroom || 0); maxX = Math.ceil(maxX) + margin; maxY = Math.ceil(maxY) + margin;
    const w = maxX - minX, hh = maxY - minY, canvas = document.createElement('canvas'); canvas.width = w; canvas.height = hh;
    const g = canvas.getContext('2d'), img = g.createImageData(w, hh), d = img.data, id = new Int16Array(w * hh).fill(-1), near = new Float32Array(w * hh), out = { n: 0 };
    for (let py = 0; py < hh; py++) for (let px = 0; px < w; px++) {
      let bestN = -Infinity, bestC = null, bestI = -1;
      for (let i = 0; i < S.prims.length; i++) { const c = castPrim(S.prims[i], px + minX + 0.5, py + minY + 0.5, out); if (c && out.n > bestN) { bestN = out.n; bestC = c; bestI = i; } }
      if (!bestC) continue;
      const o = py * w + px; id[o] = bestI; near[o] = bestN;
      const [r, gg, b] = rgbOf(bestC), i4 = o * 4; d[i4] = r; d[i4 + 1] = gg; d[i4 + 2] = b; d[i4 + 3] = 255;
    }
    const dark = new Uint8Array(w * hh);                                                            // contact lines: a pixel whose neighbour is a nearer, different shape
    for (let py = 0; py < hh; py++) for (let px = 0; px < w; px++) {
      const o = py * w + px; if (id[o] < 0) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= w || y >= hh) continue;
        const q = y * w + x; if (id[q] >= 0 && id[q] !== id[o] && near[q] > near[o] + 2.5) { dark[o] = 1; break; }
      }
    }
    for (let o = 0; o < dark.length; o++) if (dark[o]) { const i4 = o * 4; d[i4] = d[i4] * 0.62; d[i4 + 1] = d[i4 + 1] * 0.62; d[i4 + 2] = d[i4 + 2] * 0.62; }
    g.putImageData(img, 0, 0);
    const P = (x, y, z) => [(x - y) * HWa - minX, (x + y) * HHa - z - minY];
    const px = (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
    const rect = (x, y, rw, rh, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), rw, rh); };
    for (const fn of S.decals) fn(g, P, px, rect);
    outline(g, OUTLINE, w, hh);
    return { canvas, minX, minY };
  }

  /** A shaded pixel ellipse (leaves, a heap of wool, a clay lump): lit from the upper left through `pal` (dark -> light). */
  function blob(g, cx, cy, rx, ry, pal, seed = 0) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) continue;
      let v = 0.62 - nx * 0.3 - ny * 0.4 + (d > 0.72 ? -0.25 : 0) + (hash(x, y, seed) - 0.5) * 0.3;
      g.fillStyle = pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))]; g.fillRect(x, y, 1, 1);
    }
  }
  const tones = (c, n = 4) => Array.from({ length: n }, (_, i) => i < n / 2 ? shade(c, 0.6 + i * 0.2) : light(c, (i - n / 2 + 0.5) * 0.12));

  /* ------------------------------------------------ furniture ------------------------------------------------ */
  const cache = new LruCache(500);
  const frontOf = rot => (rot % 2 ? 'E' : 'S');
  const woodOf = (c, o) => M.wood(c, o);

  /** The face material of a cabinet / wardrobe / chest front: two doors in a frame, knobs, an optional cross. */
  function doorsMat(wood, front, knob, o = {}) {
    const frame = shade(wood, 0.72), panel = front, hi = light(front, 0.1), doors = o.doors || 2;
    return h => {
      const m = 2, w = h.fw, v = h.v, u = h.u, vh = h.fh;
      if (u < m || u > w - m || v < m || v > vh - m) return sh(frame, h.k);
      const dw = w / doors, di = Math.floor(u / dw), du = u - di * dw;
      if (du < 1 || du > dw - 1.5) return sh(shade(frame, 0.8), h.k);                                // the gap between doors
      if (du < 3 || du > dw - 3.5 || v < 4 || v > vh - 4) return sh(hi, h.k);                        // a raised rail
      for (let d = 0; d < doors - 1; d++) { const ux = (d + 1) * dw; if (Math.abs(u - ux) < 3.2 && Math.abs(v - vh / 2) < 1.6 && u !== ux) return sh(knob, h.k); }
      if (o.cross) { const cx = w / 2, cv = vh * 0.7; if ((Math.abs(u - cx) < 1.6 && Math.abs(v - cv) < 5) || (Math.abs(v - cv) < 1.6 && Math.abs(u - cx) < 5)) return sh(o.cross, h.k); }
      return sh(hash(Math.floor(u / 3), Math.floor(v / 5), 2) > 0.8 ? shade(panel, 0.93) : panel, h.k);
    };
  }
  /** A shelf front: boards and the goods standing on them. */
  function shelfMat(wood, goods, front, rows) {
    return h => {
      const w = h.fw, vh = h.fh, u = h.u, v = h.v, rh = vh / rows, row = Math.floor(v / rh), fr = v - row * rh;
      if (u < 1.5 || u > w - 1.5 || v > vh - 2) return sh(shade(wood, 0.8), h.k);
      if (fr < 1.6) return sh(light(wood, 0.08), h.k);                                                // a board
      const gh = rh * (0.5 + 0.35 * hash(Math.floor(u / 3.3), row, 3)), gi = Math.floor((u - 1.5) / 3.3), gc = goods[(gi + row * 2) % goods.length];
      if (fr - 1.6 < gh && hash(gi, row, 9) > 0.18) { const e = (u - 1.5) % 3.3; return sh(e < 0.8 ? shade(gc, 0.7) : e > 2.6 ? shade(gc, 0.85) : gc, h.k); }
      return sh(shade(wood, 0.45), h.k);                                                              // the dark inside
    };
  }

  const BUILD = {
    table(s, def, w, h, rot) {
      const c = def.colors, z = A(def.height || 22), t = 0.13, top = c.top, leg = c.leg || '#6d4c2f', long = w >= h ? 'x' : 'y';
      for (const [x, y] of [[0.1, 0.1], [w - 0.1 - t, 0.1], [0.1, h - 0.1 - t], [w - 0.1 - t, h - 0.1 - t]]) s.box(x, y, x + t, y + t, 0, z - 3, M.wood(leg, { dir: 'v', pw: 3 }));
      s.box(0.02, 0.02, w - 0.02, h - 0.02, z - 3, z, M.wood(top, { pw: 4 }));
      s.box(0.1, 0.1, w - 0.1, h - 0.1, z - 4, z - 3, M.solid(shade(top, 0.7)));
      if (c.pad) s.box(0.14, 0.16, w - 0.14, h - 0.16, z, z + 1, M.cloth(c.pad));
    },
    workbench(s, def, w, h, rot) {
      BUILD.table(s, def, w, h, rot);
      const z = A(def.height || 24), c = def.colors, mx = w / 2, my = h / 2;
      s.box(mx - 0.42, my - 0.1, mx - 0.04, my + 0.08, z, z + 1, M.solid(c.tool));                    // a saw
      s.box(mx + 0.1, my - 0.03, mx + 0.5, my + 0.03, z, z + 2, M.solid('#7a5233'));                  // a hammer
      s.box(mx + 0.42, my - 0.1, mx + 0.54, my + 0.1, z, z + 4, M.solid(c.tool));
      s.box(0.12, my - 0.18, 0.4, my + 0.18, z, z + 2.4, M.wood('#8a5f33', { pw: 3 }));               // a block of wood
    },
    bed(s, def, w, h, rot) {
      const c = def.colors, i = 0.05, head = rot, fr = c.frame;
      const hp = { 0: [0, 0, w, 0.45], 1: [w - 0.45, 0, w, h], 2: [0, h - 0.45, w, h], 3: [0, 0, 0.45, h] }[head];
      const bd = { 0: [i, i, w - i, i + 0.1], 1: [w - i - 0.1, i, w - i, h - i], 2: [i, h - i - 0.1, w - i, h - i], 3: [i, i, i + 0.1, h - i] }[head];
      const ft = { 0: [i, h - i - 0.07, w - i, h - i], 1: [i, i, i + 0.07, h - i], 2: [i, i, w - i, i + 0.07], 3: [w - i - 0.07, i, w - i, h - i] }[head];
      s.box(i, i, w - i, h - i, 2, 6, M.wood(fr, { pw: 3 }));
      for (const [x, y] of [[i, i], [w - i - 0.1, i], [i, h - i - 0.1], [w - i - 0.1, h - i - 0.1]]) s.box(x, y, x + 0.1, y + 0.1, 0, 2, M.solid(shade(fr, 0.7)));
      s.box(i + 0.04, i + 0.04, w - i - 0.04, h - i - 0.04, 6, 8.5, M.solid('#e9e1cd'));                // the mattress, linen at its edge
      const bl = { 0: [i + 0.04, i + 0.4, w - i - 0.04, h - i - 0.04], 1: [i + 0.04, i + 0.04, w - i - 0.4, h - i - 0.04], 2: [i + 0.04, i + 0.04, w - i - 0.04, h - i - 0.4], 3: [i + 0.4, i + 0.04, w - i - 0.04, h - i - 0.04] }[head];
      s.box(bl[0], bl[1], bl[2], bl[3], 6, 10, M.cloth(c.blanket, { stripe: 6, stripeColor: light(c.blanket, 0.18) }));   // the blanket, in folds
      s.box(hp[0] + 0.12, hp[1] + 0.1, hp[2] - 0.12, hp[3] - 0.1, 8.5, 11, M.cloth(c.pillow));
      s.box(bd[0], bd[1], bd[2], bd[3], 2, 17, M.wood(fr, { dir: 'v', pw: 3 }));
      s.box(ft[0], ft[1], ft[2], ft[3], 2, 8, M.wood(fr, { dir: 'v', pw: 3 }));
    },
    chair(s, def, w, h, rot) {
      const c = def.colors, st = 0.26, f = rot % 4, z = 8;
      for (const [x, y] of [[st, st], [w - st - 0.08, st], [st, h - st - 0.08], [w - st - 0.08, h - st - 0.08]]) s.box(x, y, x + 0.08, y + 0.08, 0, z, M.wood(c.back, { dir: 'v', pw: 3 }));
      s.box(st, st, w - st, h - st, z, z + 2, M.wood(c.seat, { pw: 3 }));
      const bk = { 0: [st, st, w - st, st + 0.07], 1: [w - st - 0.07, st, w - st, h - st], 2: [st, h - st - 0.07, w - st, h - st], 3: [st, st, st + 0.07, h - st] }[f];
      s.box(bk[0], bk[1], bk[2], bk[3], z + 2, z + 12, M.wood(c.back, { dir: 'v', pw: 2.5 }));
    },
    shelf(s, def, w, h, rot) {
      const c = def.colors, z = A(def.height || 50), front = frontOf(rot), rows = Math.max(2, Math.round(z / 9.5));
      s.box(0.04, 0.04, w - 0.04, h - 0.04, 0, z, M.faced(front, { front: shelfMat(c.wood, c.goods || ['#9e3b3b'], front, rows), side: M.wood(c.wood, { dir: 'v', pw: 4 }), top: M.wood(light(c.wood, 0.1), { pw: 4 }) }));
    },
    cabinet(s, def, w, h, rot) {
      const c = def.colors, z = A(def.height || 34), front = frontOf(rot);
      s.box(0.06, 0.06, w - 0.06, h - 0.06, 0, z, M.faced(front, { front: doorsMat(c.wood, c.front, c.knob || '#d9b45a', { cross: c.cross }), side: M.wood(c.wood, { dir: 'v', pw: 4 }), top: M.wood(light(c.front, 0.08), { pw: 4 }) }));
    },
    wardrobe(s, def, w, h, rot) {
      const c = def.colors, z = A(def.height || 62), front = frontOf(rot), horizontal = w >= h;
      s.box(0.04, 0.05, w - 0.04, h - 0.05, 2, z - 3, M.faced(front, { front: doorsMat(c.wood, c.front, c.knob, { doors: 2 }), side: M.wood(c.wood, { dir: 'v', pw: 4 }), top: M.wood(c.wood, { pw: 4 }) }));
      s.box(0.0, 0.0, w, h, z - 3, z, M.wood(shade(c.wood, 0.9), { pw: 4 }));                          // a crown moulding
      s.box(0.04, 0.05, w - 0.04, h - 0.05, 0, 2, M.solid(shade(c.wood, 0.7)));                         // a plinth
    },
    chest(s, def, w, h, rot) {
      const c = def.colors, z = A(def.height || 20), front = frontOf(rot), band = M.solid(c.band || '#5a5a62');
      const side = M.wood(c.wood, { pw: 4 });
      const withBands = base => hh => {
        const fw = hh.face === 'T' ? hh.fw : hh.fw, u = hh.u;
        if (hh.face !== 'T' && (Math.abs(u - fw * 0.2) < 1.3 || Math.abs(u - fw * 0.8) < 1.3)) return band(hh);
        if (hh.face === 'T' && (Math.abs(u - fw * 0.2) < 1.3 || Math.abs(u - fw * 0.8) < 1.3)) return band(hh);
        return base(hh);
      };
      s.box(0.07, 0.1, w - 0.07, h - 0.1, 0, z * 0.55, withBands(side));
      s.box(0.05, 0.08, w - 0.05, h - 0.08, z * 0.55, z, withBands(M.wood(c.lid, { pw: 4 })));
      s.box(0.05, 0.08, w - 0.05, h - 0.08, z * 0.55 - 0.7, z * 0.55 + 0.7, M.solid(shade(c.band || '#5a5a62', 0.9)));
      s.decal((g, P, px, rect) => {                                                                     // the lock
        const [x, y] = front === 'S' ? P(w / 2, h - 0.08, z * 0.55) : P(w - 0.07, h / 2, z * 0.55);
        rect(x - 1, y - 2, 3, 4, c.lock || '#d9b45a'); px(x, y, '#3a2a14');
      });
    },
    rug(s, def, w, h) {
      const c = def.colors, rx = w / 2, ry = h / 2;
      s.box(0, 0, w, h, 0, 0.6, h2 => {
        const nx = (h2.x - rx) / rx, ny = (h2.y - ry) / ry, d = Math.hypot(nx, ny);
        if (d > 1) return null;
        const col = d > 0.88 ? c.edge : d > 0.8 ? shade(c.main, 0.8) : d > 0.46 && d < 0.52 ? c.edge : d < 0.3 ? light(c.main, 0.12) : c.main;
        return sh(((Math.floor(h2.u) + Math.floor(h2.v)) & 1) ? col : shade(col, 0.95), 1);
      });
    },
    torn_rug(s, def, w, h) {
      const c = def.colors;
      s.box(0, 0, w, h, 0, 0.6, h2 => {
        const mx = Math.min(h2.x, w - h2.x), my = Math.min(h2.y, h2.y > h / 2 ? h - h2.y : h2.y), e = Math.min(mx, my * (w / h));
        const rag = hash(Math.floor(h2.u), Math.floor(h2.v), 11), cut = hash(Math.floor(h2.u / 3), Math.floor(h2.v / 3), 12);
        if (e < 0.05 + rag * 0.07 || (e < 0.2 && cut > 0.9 && h2.x > w * 0.55) || (h2.x > w - 0.32 && h2.y < 0.45 && cut > 0.3 && h2.x + (1 - h2.y) * 0.4 > w - 0.05)) return null;   // frayed, one corner torn away
        let col = e < 0.17 ? c.edge : e < 0.24 ? shade(c.main, 0.8) : c.main;
        if (e > 0.3 && hash(Math.floor(h2.x * 7), Math.floor(h2.y * 7), 13) > 0.86) col = c.dark;           // worn, stained patches
        if (hash(h2.u, h2.v, 14) > 0.9) col = shade(col, 0.88);
        if (e > 0.34 && e < 0.4 && cut > 0.5) col = c.edge;
        if (h2.x > 0.7 && h2.x < 0.9 && h2.y > 0.4 && h2.y < 0.6) return null;                             // a hole
        return sh(((Math.floor(h2.u) + Math.floor(h2.v)) & 1) ? col : shade(col, 0.94), 1);
      });
    },
    fireplace(s, def, w, h, rot) {
      const c = def.colors, z = A(def.height || 46), front = frontOf(rot);
      const hearth = (hh) => {
        const u = hh.u, v = hh.v, fw = hh.fw;
        if (u > fw * 0.2 && u < fw * 0.8 && v > 1 && v < A(26)) {                                       // the fire box, flames in it (a cold hearth: ash and a charred log)
          if (c.cold) return v < 2.5 ? '#4a4540' : v < 5 && Math.abs(u - fw * 0.5) < fw * 0.18 ? '#1c1a18' : shade(c.dark, 0.9);
          const f = (u - fw * 0.5) / (fw * 0.3), tip = A(18) * (1 - Math.abs(f) * 0.9) + hash(Math.floor(u), 0, 4) * 3;
          if (v < 2.5) return '#7a3510';
          if (v < tip) return v < tip * 0.45 ? '#fff0a0' : v < tip * 0.75 ? '#ffd24a' : c.fire;
          return shade(c.dark, 0.9);
        }
        return M.stone(c.stone, { course: 5 })(hh);
      };
      s.box(0.04, 0.04, w - 0.04, h - 0.04, 0, z - 3, M.faced(front, { front: hearth, side: M.stone(c.stone, { course: 5 }), top: M.stone(light(c.stone, 0.1)) }));
      s.box(0.0, 0.0, w, h, z - 3, z, M.stone(light(c.stone, 0.12), { course: 3 }));                      // the mantel
    },
    plant(s, def, w, h) {
      const c = def.colors, mx = w / 2, my = h / 2;
      s.cyl(mx, my, 0, 9, 0.2, M.solid(c.pot), 0.12);
      s.cyl(mx, my, 8.5, 9.5, 0.23, M.solid(shade(c.pot, 0.85)));
      s.cyl(mx, my, 9, 9.6, 0.17, M.solid('#4a3320'));
      s.decal((g, P) => {
        const [x, y] = P(mx, my, 9), pal = tones(c.leaf, 5);
        for (const [dx, dy, rx, ry] of [[-6, -11, 5, 6.5], [6, -10, 5, 6.5], [0, -17, 5.5, 7], [-3, -6, 4.5, 4], [4, -5, 4.5, 4]]) blob(g, x + dx, y + dy, rx, ry, pal, dx + dy);
      });
      s.headroom = 8;
    },
    lamp(s, def, w, h) {
      const c = def.colors, z = A(def.height || 44), mx = w / 2, my = h / 2;
      s.cyl(mx, my, 0, 2, 0.18, M.solid(c.pole));
      s.box(mx - 0.035, my - 0.035, mx + 0.035, my + 0.035, 2, z - 7, M.solid(c.pole));
      s.cyl(mx, my, z - 8, z, 0.17, M.solid(c.shade), -0.18);
      s.cyl(mx, my, z - 0.2, z + 0.8, 0.07, M.solid(shade(c.pole, 1.0)));
    },
    counter(s, def, w, h, rot) {
      const c = def.colors, z = A(def.height || 26), front = frontOf(rot);
      const frontMat = hh => {
        const u = hh.u, fw = hh.fw;
        if (u < 1.5 || u > fw - 1.5 || hh.v < 1.5) return sh(shade(c.front, 0.7), hh.k);
        if (Math.abs(u - fw / 3) < 1 || Math.abs(u - 2 * fw / 3) < 1) return sh(c.trim, hh.k);
        const pnl = hh.v > 3 && hh.v < z - 6;
        return sh(pnl && hash(Math.floor(u / 4), 1, 3) > 0.7 ? shade(c.front, 0.92) : c.front, hh.k);
      };
      s.box(0.04, 0.08, w - 0.04, h - 0.08, 0, z - 3, M.faced(front, { front: frontMat, side: M.wood(c.front, { dir: 'v', pw: 4 }), top: M.wood(c.top) }));
      s.box(0.0, 0.03, w, h - 0.03, z - 3, z, M.wood(c.top, { pw: 4 }));
    },
    crate(s, def, w, h) {
      const c = def.colors, z = A(def.height || 20), mx = w / 2;
      const planks = M.wood(c.wood, { dir: 'h', pw: 4 });
      s.box(0.1, 0.1, w - 0.1, h - 0.1, 0, z, hh => {
        const u = hh.u, v = hh.v, fw = hh.fw, fh = hh.fh;
        if (hh.face === 'T') return (u < 2 || u > fw - 2 || v < 2 || v > fh - 2) ? sh(c.band, hh.k) : planks(hh);
        if (u < 2 || u > fw - 2 || v < 2 || v > fh - 2) return sh(c.band, hh.k);
        const d = Math.abs(v - (fh - 4) * (u / fw) - 2);                                              // a diagonal brace
        if (d < 1.6) return sh(light(c.band, 0.1), hh.k);
        return planks(hh);
      });
    },
    lumber(s, def, w, h) {
      const c = def.colors, z = A(def.height || 36), longX = w >= h;
      const post = (x, y) => s.box(x, y, x + 0.1, y + 0.1, 0, z, M.wood(c.frame, { dir: 'v', pw: 3 }));
      if (longX) { post(0.1, 0.45); post(w - 0.2, 0.45); } else { post(0.45, 0.1); post(0.45, h - 0.2); }
      for (const lift of [4, 11, 18, 25]) for (const off of [0.2, 0.52]) {
        if (longX) s.box(0.05, off, w - 0.05, off + 0.26, lift, lift + 3.4, M.wood(c.plank, { pw: 2, seed: lift }));
        else s.box(off, 0.05, off + 0.26, h - 0.05, lift, lift + 3.4, M.wood(c.plank, { pw: 2, seed: lift }));
      }
    },
    loom(s, def, w, h, rot) {
      const c = def.colors, z = A(def.height || 44), longX = w >= h, wd = M.wood(c.wood, { dir: 'v', pw: 3 });
      if (longX) {
        for (const x of [0.06, w - 0.18]) s.box(x, 0.2, x + 0.12, h - 0.2, 0, z, wd);
        s.box(0.06, 0.24, w - 0.06, h - 0.24, z - 5, z - 2, M.wood(c.light, { pw: 3 }));
        s.box(0.18, 0.3, w - 0.18, h - 0.3, 3, 8, M.wood(c.wood, { pw: 3 }));
        s.box(0.18, h / 2 - 0.02, w - 0.18, h / 2 + 0.02, 7, z - 5, hh => (Math.floor(hh.u) % 3 === 0 ? sh(c.warp, hh.k) : null));
        s.box(0.22, h / 2 - 0.1, w - 0.22, h / 2 + 0.1, 3, 14, M.cloth(c.cloth, { stripe: 4, stripeColor: shade(c.cloth, 0.85) }));
      } else {
        for (const y of [0.06, h - 0.18]) s.box(0.2, y, w - 0.2, y + 0.12, 0, z, wd);
        s.box(0.24, 0.06, w - 0.24, h - 0.06, z - 5, z - 2, M.wood(c.light, { pw: 3 }));
        s.box(0.3, 0.18, w - 0.3, h - 0.18, 3, 8, M.wood(c.wood, { pw: 3 }));
        s.box(w / 2 - 0.02, 0.18, w / 2 + 0.02, h - 0.18, 7, z - 5, hh => (Math.floor(hh.u) % 3 === 0 ? sh(c.warp, hh.k) : null));
        s.box(w / 2 - 0.1, 0.22, w / 2 + 0.1, h - 0.22, 3, 14, M.cloth(c.cloth, { stripe: 4, stripeColor: shade(c.cloth, 0.85) }));
      }
    },
    press(s, def, w, h) {
      const c = def.colors, z = A(def.height || 34), mx = w / 2, my = h / 2;
      s.cyl(mx, my, 0, 9, 0.34, M.wood(c.tub, { dir: 'v', pw: 3 }), 0.06);
      s.cyl(mx, my, 8.6, 9.2, 0.3, M.solid('#7b45c4'));
      s.box(mx - 0.38, my - 0.07, mx + 0.38, my + 0.07, 14, 17, M.wood(c.light, { pw: 3 }));
      s.box(mx - 0.04, my - 0.04, mx + 0.04, my + 0.04, 9, z, M.solid(c.iron));
      s.box(mx - 0.3, my - 0.035, mx + 0.3, my + 0.035, z - 2, z, M.wood(c.wood, { pw: 2 }));
      s.box(mx + 0.32, my + 0.32, mx + 0.5, my + 0.5, 0, 4, M.wood('#5a3a22', { pw: 2 }));
    },
    bin(s, def, w, h, rot, f) {
      const c = def.colors, z = A(def.height || 20), fill = clamp((f && f.fill) || 0, 0, 1), wd = M.wood(shade(c.wood, 0.8), { dir: 'h', pw: 4 });
      s.box(0.06, 0.08, w - 0.06, h - 0.08, 0, z, hh => {
        if (hh.face === 'T') { const e = Math.min(hh.u, hh.fw - hh.u, hh.v, hh.fh - hh.v); return e < 2 ? sh(c.band, hh.k) : fill > 0 ? null : sh(shade(c.wood, 0.45), hh.k); }
        if (hh.u < 2 || hh.u > hh.fw - 2 || Math.abs(hh.v - z / 2) < 0.9) return sh(c.band, hh.k);
        return wd(hh);
      });
      if (fill > 0) s.decal((g, P) => {
        const n = Math.round(3 + fill * 7), pal = tones(c.fill, 5);
        for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, [x, y] = P(0.2 + (w - 0.4) * u, h / 2 + Math.sin(i * 2.3) * 0.12, z + fill * 5 + Math.sin(i * 1.7)); blob(g, x, y - 2, 6, 4.5, pal, i); }
      });
    },
    hay(s, def, w, h) {
      const c = def.colors, z = A(def.height || 18), band = M.solid(c.band), straw = M.hay(c.hay);
      s.box(0.08, 0.12, w - 0.08, h - 0.12, 0, z, hh => {
        const fw = hh.fw;
        if (hh.face !== 'T' && (Math.abs(hh.u - fw * 0.3) < 0.9 || Math.abs(hh.u - fw * 0.7) < 0.9)) return band(hh);
        if (hh.face === 'T' && (Math.abs(hh.u - fw * 0.3) < 0.9 || Math.abs(hh.u - fw * 0.7) < 0.9)) return band(hh);
        return straw(hh);
      });
    }
  };

  /** The picture of a furniture piece (cached): { canvas, minX, minY } relative to its north corner (tile (0, 0) of its footprint). */
  function furnitureArt(def, w, h, rot, extra) {
    const key = [def.id, def.style, w, h, rot, JSON.stringify(def.colors || {}), def.height || 0, extra || ''].join('|');
    let art = cache.get(key);
    if (art) return art;
    const s = scene(), f = (BUILD[def.style] || BUILD.crate);
    f(s, def, w, h, rot, extra === undefined ? null : { fill: extra / 8 });
    art = render(s); cache.set(key, art);
    return art;
  }

  /** Draw a furniture piece standing on footprint (x0, y0)-(x0 + w, y0 + h) (tiles). `f.fill` (bins). Returns false if its style has no pixel painter. */
  function drawFurniture(ctx, def, b, rot, f) {
    if (!BUILD[def.style]) return false;
    const w = Math.round(b.x1 - b.x0), h = Math.round(b.y1 - b.y0), art = furnitureArt(def, w, h, rot, f && f.fill !== undefined ? Math.round(f.fill * 8) : undefined);
    const ox = isoX(b.x0, b.y0), oy = isoY(b.x0, b.y0), smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.canvas, ox + art.minX * ART, oy + art.minY * ART, art.canvas.width * ART, art.canvas.height * ART);
    ctx.imageSmoothingEnabled = smooth;
    return true;
  }

  /* ------------------------------------------------ room walls ------------------------------------------------ */
  const WALL_TALL = 70 / ART, WALL_LOW = 14 / ART;
  function wallMaterial(def, opts, seed) {
    const c = def.colors, pat = def.pattern;
    const base = { S: c.left, E: c.right, T: c.top };
    const pick = col => pat === 'stone' ? M.stone(col, { seed }) : pat === 'brick' ? M.brick(col, { seed }) : pat === 'plaster' ? M.plaster(col, { seed }) : M.wood(col, { dir: 'v', pw: 6, seed });
    const mats = { S: pick(c.left), E: pick(c.right), T: pick(c.top) };
    const timber = M.wood('#5a3f2a', { dir: 'v', pw: 4 });
    const sill = def.window;
    return hh => {
      const m = mats[hh.face === 'T' ? 'T' : hh.face], fw = hh.fw;
      if (hh.face === 'T') return m(hh);
      if (pat === 'plaster' && !opts.low) {
        if (hh.v < 5) return sh(shade(c.left, 0.62), hh.k);                                             // a skirting board
        if (hh.v > hh.fh - 3 && hh.fh > 20) return sh('#5a3f2a', hh.k);                                  // a beam under the ceiling
        if (hh.u < 2 || hh.u > fw - 2) return timber(hh);                                                // a post at each corner
      }
      if (sill && !opts.low && ((hh.face === 'S' && opts.windowS) || (hh.face === 'E' && opts.windowE))) {
        const u0 = fw * 0.2, u1 = fw * 0.8, v0 = A(26), v1 = A(54);
        if (hh.u > u0 - 2 && hh.u < u1 + 2 && hh.v > v0 - 2 && hh.v < v1 + 2) {
          if (hh.u < u0 || hh.u > u1 || hh.v < v0 || hh.v > v1) return sh('#4a3322', hh.k);              // the frame
          if (Math.abs(hh.u - (u0 + u1) / 2) < 0.8 || Math.abs(hh.v - (v0 + v1) / 2) < 0.8) return sh('#4a3322', hh.k);   // mullions
          const d = (hh.u - u0) + (v1 - hh.v);                                                            // a glint across the glass
          return sh(d % 11 < 2.4 ? '#cfe6f2' : mix('#5f86a8', '#9fc4dc', (hh.v - v0) / (v1 - v0) * 0.7), 1);
        }
      }
      return m(hh);
    };
  }
  const wallCache = new LruCache(200);
  /** A room's wall block standing on tile (tx, ty) (iso centre cx, cy): its look comes from the tile's definition. */
  function drawWall(ctx, def, opts, cx, cy, tx, ty) {
    const low = !!opts.low, ws = !!opts.windowS, we = !!opts.windowE, key = [def.char, low, ws, we, tx & 3, ty & 3].join('|');
    let art = wallCache.get(key);
    if (!art) {
      const s = scene(), z = low ? WALL_LOW : WALL_TALL;
      s.box(0, 0, 1, 1, 0, z, wallMaterial(def, { low, windowS: ws, windowE: we }, (tx & 3) * 4 + (ty & 3)));
      art = render(s); wallCache.set(key, art);
    }
    const ox = cx, oy = cy - TILE_HALF_H, smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.canvas, ox + art.minX * ART, oy + art.minY * ART, art.canvas.width * ART, art.canvas.height * ART);
    ctx.imageSmoothingEnabled = smooth;
  }

  /* ------------------------------------------------ room floors ------------------------------------------------ */
  const FW = Math.round(2 * HWa), FH = Math.round(2 * HHa), floorCache = new LruCache(300);
  /** One floor tile as a diamond picture, hard-edged: the pattern comes from the tile's definition, joints from its place in the room. */
  function floorArt(def, tx, ty) {
    const key = [def.char, tx & 3, ty & 3].join('|');
    let c = floorCache.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = FW; c.height = FH;
    const g = c.getContext('2d'), img = g.createImageData(FW, FH), d = img.data, col = def.colors || ['#b98a57', '#b1834f', '#c0915e'], pat = def.pattern;
    for (let py = 0; py < FH; py++) for (let px = 0; px < FW; px++) {
      const a = (px + 0.5 - FW / 2) / HWa, b = (py + 0.5 - FH / 2) / HHa, x = 0.5 + (a + b) / 2, y = 0.5 + (b - a) / 2;
      if (x < 0 || x >= 1 || y < 0 || y >= 1) continue;
      const wx = (tx & 3) + x, wy = (ty & 3) + y, ux = x * LEN, uy = y * LEN;
      let colr;
      if (def.kind !== 'floor') colr = col[0];
      else if (pat === 'planks') {
        const row = Math.floor(wy * 4), fr = wy * 4 - row, s = hash(row, ty & 3, tx >> 2), j = (wx * 3 + s * 7) % 4, jc = Math.floor((wx * 3 + s * 7) / 4);
        colr = col[Math.floor(hash(row, jc, (ty & 3) + 7) * 3) % 3];
        if (fr < 0.14) colr = shade(colr, 0.62); else if (fr < 0.27) colr = light(colr, 0.07);
        else if (j < 0.09) colr = shade(colr, 0.66);
        else if (hash(Math.floor(wx * 9), row, 5) > 0.88) colr = shade(colr, 0.9);
        if (hash(px, py, 3) > 0.985) colr = shade(colr, 0.78);
      } else if (pat === 'stone') {
        const row = Math.floor(wy * 3), fr = wy * 3 - row, len = 1.3, off = hash(row, ty & 3) * len, bi = Math.floor((wx + off) / len), bx = (wx + off) / len - bi, s = hash(bi, row, tx & 3);
        colr = mix(col[Math.floor(s * 3) % 3], s > 0.5 ? '#d4cfc2' : '#7b776e', Math.abs(s - 0.5) * 0.5);
        if (fr < 0.1 || bx < 0.05) colr = shade(colr, 0.62); else if (fr < 0.2) colr = light(colr, 0.09);
        else if (hash(px, py, 6) > 0.95) colr = shade(colr, 0.88);
      } else if (pat === 'checker') {
        const cx = Math.floor(wx * 2), cy = Math.floor(wy * 2), fx = wx * 2 - cx, fy = wy * 2 - cy;
        colr = (cx + cy) & 1 ? col[1] : col[0];
        if (fx < 0.08 || fy < 0.08) colr = shade(colr, 0.8); else if (fx < 0.16 || fy < 0.16) colr = light(colr, 0.06);
        if (hash(px, py, 8) > 0.96) colr = shade(colr, 0.94);
      } else if (pat === 'carpet') {
        colr = ((px + py) & 1) ? col[0] : col[1];
        const e = Math.min(x, 1 - x, y, 1 - y);
        if (hash(px, py, 4) > 0.9) colr = col[2];
        if (e < 0.0) colr = shade(colr, 0.8);
      } else if (pat === 'straw') {
        colr = col[Math.floor(hash(px >> 1, py, 2) * 3) % 3];
        if (hash(px * 0.5, py, 9) > 0.8) colr = shade(col[0], 0.7); else if (hash(py, px, 10) > 0.92) colr = light(col[2], 0.3);
      } else if (pat === 'mat') {
        const e = Math.min(x, 1 - x, y, 1 - y), woodC = col[0];
        colr = '#7a5233';
        if (e > 0.1 && e < 0.9) { colr = ((px >> 1) + (py >> 1)) & 1 ? '#b99362' : '#a07d4f'; if (e < 0.2) colr = '#d9b45a'; else if (e < 0.26) colr = shade('#7a5233', 0.8); }
      } else colr = col[Math.floor(hash(px, py, 1) * 3) % 3];
      const [r, gg, bb] = rgbOf(colr), i4 = (py * FW + px) * 4; d[i4] = r; d[i4 + 1] = gg; d[i4 + 2] = bb; d[i4 + 3] = 255;
    }
    g.putImageData(img, 0, 0); floorCache.set(key, c);
    return c;
  }
  function drawFloor(ctx, def, cx, cy, tx, ty) {
    const c = floorArt(def, tx, ty), smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, cx - TILE_HALF_W, cy - TILE_HALF_H, TILE_HALF_W * 2, TILE_HALF_H * 2);
    ctx.imageSmoothingEnabled = smooth;
  }

  /* ------------------------------------------------ outdoor props: barrels, crates, firewood, planters, hay, the well, the chest ------------------------------------------------ */
  const STAVES = '#8a5a33', HOOP = '#3b3a40';
  const barrel = (s, cx, cy, z = 0, tall = 12, r = 0.2, seed = 0) => {
    const staves = M.wood(STAVES, { dir: 'v', pw: 3, seed });
    s.cyl(cx, cy, z, z + tall, r, h => {
      if (h.face === 'T') { const e = Math.hypot(h.u - h.fw / 2, h.v - h.fh / 2) / (h.fw / 2); return e > 0.82 ? sh(HOOP, 1.1) : e < 0.2 ? sh('#3a2a1c', 1) : sh(M.wood('#a8733f', { pw: 3, seed })(h), 1); }
      if (Math.abs(h.v - tall * 0.22) < 0.9 || Math.abs(h.v - tall * 0.78) < 0.9) return sh(HOOP, h.k);   // iron hoops
      if (h.v < 0.8 || h.v > tall - 0.8) return sh(shade(STAVES, 0.7), h.k);
      return staves(h);
    }, 0.1);
  };
  const crateBox = (s, x, y, sz, z = 0, seed = 0) => {
    const planks = M.wood('#b0854f', { dir: 'h', pw: 3.4, seed }), band = '#5a3f2a';
    s.box(x, y, x + sz, y + sz, z, z + A(sz * 24), h => {
      const m = 1.6, ez = h.u < m || h.u > h.fw - m || h.v < m || h.v > h.fh - m;
      if (ez) return sh(band, h.k);
      if (h.face !== 'T' && Math.abs(h.v - (h.fh - 3) * (h.u / h.fw) - 1.5) < 1.2) return sh(light(band, 0.12), h.k);
      return planks(h);
    });
  };
  const PROPS = {
    barrels(s) { barrel(s, 0.0, 0.0, 0, 12, 0.19, 1); barrel(s, 0.46, 0.08, 0, 12, 0.19, 2); barrel(s, 0.2, -0.22, 0, 12, 0.19, 3); },
    barrel(s) { barrel(s, 0, 0, 0, 13, 0.24, 1); },
    crates(s) { crateBox(s, -0.22, -0.2, 0.4, 0, 1); crateBox(s, 0.24, -0.12, 0.34, 0, 2); crateBox(s, -0.12, -0.12, 0.3, A(0.4 * 24), 3); },
    firewood(s) {
      const logs = M.logs('#6b4a2a', '#d4a86a', { cell: 5, end: 'S' });
      s.box(-0.5, -0.12, -0.5 + 0.2 * 4, 0.12, 0, 5 * 1, logs);
      s.box(-0.4, -0.12, -0.4 + 0.2 * 3, 0.12, 5, 10, logs);
      s.box(-0.3, -0.12, -0.3 + 0.2 * 2, 0.12, 10, 15, logs);
      s.box(-0.5, -0.12, -0.46, 0.12, 0, 15, M.wood('#4a3322', { dir: 'v', pw: 2 })); s.box(0.26, -0.12, 0.3, 0.12, 0, 15, M.wood('#4a3322', { dir: 'v', pw: 2 }));
    },
    flowers(s) {
      s.box(-0.4, -0.16, 0.4, 0.16, 0, 5, M.wood('#7a5232', { dir: 'h', pw: 2.6 }));
      s.box(-0.36, -0.12, 0.36, 0.12, 5, 5.6, M.solid('#4a3320'));
      s.decal((g, P, px, rect) => {
        const cols = ['#e05a5a', '#f2c94c', '#e88ac0', '#f4f0e6', '#b48ae8'];
        for (let i = 0; i < 9; i++) {
          const [x, y] = P(-0.34 + i * 0.085, -0.04 + Math.sin(i * 2.1) * 0.08, 5.5), tall = 3 + (i * 7) % 5;
          for (let k = 0; k < tall; k++) px(x, y - k, k > tall - 2 ? '#4f9a44' : '#3f7a3a');
          px(x - 1, y - tall - 1, '#4f9a44'); px(x + 1, y - tall, '#4f9a44');
          const c = cols[i % cols.length]; rect(x - 1, y - tall - 2, 3, 3, c); px(x, y - tall - 1, light(c, 0.55));
        }
      });
      s.headroom = 3;
    },
    hay(s) { const straw = M.hay('#d9b45a'), band = M.solid('#8a6a2a');
      s.box(-0.38, -0.2, 0.38, 0.2, 0, 9, h => (Math.abs(h.u - h.fw * 0.3) < 0.9 || Math.abs(h.u - h.fw * 0.7) < 0.9 ? band(h) : straw(h)));
    }
  };
  const propCache = new LruCache(60);
  function propArt(kind) {
    let a = propCache.get(kind);
    if (!a) { const s = scene(); (PROPS[kind] || PROPS.crates)(s); a = render(s); propCache.set(kind, a); }
    return a;
  }
  /** Stamp a prop into a building's picture (art pixels): it stands on ground point (x, y). */
  function stampProp(g, kind, x, y) { const a = propArt(kind); g.drawImage(a.canvas, Math.round(x + a.minX), Math.round(y + a.minY)); }
  /** Draw a prop standing in the world on (sx, sy). */
  function drawProp(ctx, kind, sx, sy) {
    const a = propArt(kind), smooth = ctx.imageSmoothingEnabled;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(sx + 2, sy + 2, kind === 'barrel' ? 12 : 20, kind === 'barrel' ? 5 : 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(a.canvas, sx + a.minX * ART, sy + a.minY * ART, a.canvas.width * ART, a.canvas.height * ART);
    ctx.imageSmoothingEnabled = smooth;
  }

  /** The village well: a ring of fieldstone with a wooden crank and a little shingled roof. */
  const wellCache = [];
  function wellArt() {
    if (wellCache[0]) return wellCache[0];
    const s = scene(), stone = M.stone('#9a958a', { course: 5, seed: 3 }), roof = M.wood('#8b3f35', { dir: 'h', pw: 4, seed: 2 }), post = M.wood('#5b3f2a', { dir: 'v', pw: 3 });
    s.cyl(0, 0, 0, 14, 0.46, h => {
      if (h.face === 'T') { const e = Math.hypot(h.u - h.fw / 2, h.v - h.fh / 2) / (h.fw / 2); return e > 0.74 ? sh(light('#a6a196', 0.1), 1.1) : e > 0.68 ? '#4f4a42' : hash(h.u, h.v, 3) > 0.9 ? '#6ea0c4' : (Math.floor((h.u + h.v) / 4) & 1) ? '#2b5f86' : '#33709a'; }
      return stone(h);
    });
    s.box(-0.46, -0.06, -0.38, 0.06, 14, 44, post); s.box(0.38, -0.06, 0.46, 0.06, 14, 44, post);       // the posts
    s.box(-0.42, -0.04, 0.42, 0.04, 36, 38, M.solid('#4a3322'));                                            // the windlass beam
    s.box(-0.04, -0.04, 0.04, 0.04, 24, 36, M.solid('#d8c9a0'));                                            // the rope
    s.cyl(0, 0, 21, 25, 0.08, M.wood('#7a5230', { dir: 'v', pw: 2 }), 0.3);                                  // the bucket
    s.box(-0.62, -0.5, 0.62, 0.5, 44, 46, roof);                                                            // the roof, stepped to a ridge
    s.box(-0.54, -0.42, 0.54, 0.42, 46, 48, M.wood('#9a4a3d', { dir: 'h', pw: 4, seed: 3 }));
    s.box(-0.44, -0.3, 0.44, 0.3, 48, 50, M.wood('#a85548', { dir: 'h', pw: 4, seed: 4 }));
    s.box(-0.34, -0.18, 0.34, 0.18, 50, 52, M.wood('#b8624f', { dir: 'h', pw: 4, seed: 5 }));
    s.box(-0.24, -0.06, 0.24, 0.06, 52, 54, M.solid('#8b3f35'));
    return (wellCache[0] = render(s));
  }
  function drawWell(ctx, sx, sy) {
    const a = wellArt(), smooth = ctx.imageSmoothingEnabled;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(sx + 3, sy + 3, 36, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(a.canvas, sx + a.minX * ART, sy + a.minY * ART, a.canvas.width * ART, a.canvas.height * ART);
    ctx.imageSmoothingEnabled = smooth;
  }

  /** The beginner's loot chest: iron-bound oak, its lid up once looted. */
  function chestArt(opened) {
    const key = 'chest' + (opened ? 'o' : 'c');
    let a = propCache.get(key);
    if (a) return a;
    const s = scene(), oak = M.wood('#8a5a33', { pw: 4, seed: 2 }), iron = '#4a4a54';
    const bands = base => h => (Math.abs(h.u - h.fw * 0.2) < 1.3 || Math.abs(h.u - h.fw * 0.8) < 1.3 ? sh(iron, h.k) : base(h));
    s.box(-0.32, -0.22, 0.32, 0.22, 0, 11, bands(oak));
    if (opened) {
      s.box(-0.32, -0.22, 0.32, 0.22, 10, 11, M.solid('#2b1c10'));
      s.box(-0.32, -0.26, 0.32, -0.2, 11, 25, bands(M.wood('#a97a45', { pw: 4, seed: 3 })));
    } else s.box(-0.32, -0.22, 0.32, 0.22, 11, 17, bands(M.wood('#a97a45', { pw: 4, seed: 3 })));
    s.decal((g, P, px, rect) => { const [x, y] = P(0, 0.22, opened ? 8 : 11); rect(x - 1, y - 2, 3, 4, '#d9b45a'); px(x, y, '#3a2a14'); });
    a = render(s); propCache.set(key, a);
    return a;
  }
  function drawChest(ctx, sx, sy, opened) {
    const a = chestArt(opened), smooth = ctx.imageSmoothingEnabled;
    ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(sx + 2, sy + 2, 24, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(a.canvas, sx + a.minX * ART, sy + a.minY * ART, a.canvas.width * ART, a.canvas.height * ART);
    ctx.imageSmoothingEnabled = smooth;
  }

  /* ------------------------------------------------ stockpiles: a plank pallet with what it holds stacked on it ------------------------------------------------ */
  function stockpileArt(resource, n) {
    const key = 'pile|' + resource + '|' + n;
    let a = propCache.get(key);
    if (a) return a;
    const s = scene(), pal = M.wood('#9a6b3d', { pw: 3 }), sideWood = M.wood('#6d4c2f', { dir: 'v', pw: 3 });
    s.box(-0.42, -0.42, 0.42, 0.42, 3, 5, pal);                                                              // the pallet's deck
    for (const x of [-0.42, -0.1, 0.3]) s.box(x, -0.42, x + 0.12, 0.42, 0, 3, M.wood('#7a5230', { dir: 'v', pw: 3 }));   // its runners
    s.box(-0.5, -0.5, -0.42, 0.5, 5, 20, sideWood); s.box(-0.5, -0.5, 0.5, -0.42, 5, 20, sideWood);         // a back and a side board holding the heap in
    s.box(0.42, -0.5, 0.5, 0.5, 5, 8, M.wood('#7a5230', { pw: 3 })); s.box(-0.5, 0.42, 0.5, 0.5, 5, 8, M.wood('#7a5230', { pw: 3 }));   // low rails at the front
    const spots = [[0, 0], [1, 0], [2, 0], [3, 0], [0.5, 1], [1.5, 1], [2.5, 1], [1, 2], [2, 2], [1.5, 3]];
    if (resource === 'wood') {
      const logs = M.logs('#6b4a2a', '#d9b27a', { cell: 5, end: 'S' });
      for (let i = 0; i < n; i++) { const [c, r] = spots[i], x = -0.36 + c * 0.2; s.box(x, -0.34, x + 0.2, 0.3, 5 + r * 5, 10 + r * 5, logs); }
    } else if (resource === 'stone') {
      for (let i = 0; i < n; i++) { const [c, r] = spots[i], x = -0.38 + c * 0.2 + hash(i, 1) * 0.04, y = -0.32 + hash(i, 2) * 0.2; s.box(x, y, x + 0.22, y + 0.46, 5 + r * 5, 10 + r * 5 - hash(i, 3), M.stone(i % 2 ? '#8d8d93' : '#a2a2a8', { course: 4, seed: i })); }
    } else {
      for (let i = 0; i < n; i++) { const [c, r] = spots[i], x = -0.38 + c * 0.2, y = -0.3 + hash(i, 5) * 0.12; s.box(x, y, x + 0.19, y + 0.5, 5 + r * 5, 10 + r * 5, M.brick(i % 2 ? '#b8643c' : '#a85a36', { seed: i })); }
    }
    a = render(s); propCache.set(key, a);
    return a;
  }
  function drawStockpile(ctx, resource, sx, sy, fill) {
    const n = Math.round(clamp(fill, 0, 1) * 10), a = stockpileArt(resource, n), smooth = ctx.imageSmoothingEnabled;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(sx + 2, sy + 2, 34, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(a.canvas, sx + a.minX * ART, sy + a.minY * ART, a.canvas.width * ART, a.canvas.height * ART);
    ctx.imageSmoothingEnabled = smooth;
  }

  return { ART, scene, render, M, hash, blob, tones, furnitureArt, drawFurniture, drawWall, drawFloor, stampProp, drawProp, drawWell, drawChest, drawStockpile, styles: Object.keys(BUILD) };
})();
