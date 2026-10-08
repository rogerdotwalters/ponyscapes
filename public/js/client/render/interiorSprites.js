'use strict';
/* CLIENT - how rooms look: interior floor tiles, walls (tall at the back of a room, low at the front so you can see in) and furniture.
 * Used by the game's renderer and by level-editor.html, so a room looks the same in both. Everything is drawn in iso pixels (isoX / isoY),
 * so the caller sets up the camera. A furniture piece with its own picture (sprites.image) draws that instead. */
const InteriorSprites = (() => {
  const H = TILE_HALF_H, W = TILE_HALF_W;
  const P = (x, y) => [isoX(x, y), isoY(x, y)];
  const shadeOf = (hex, f) => {
    const n = parseInt(String(hex).slice(1), 16);
    if (!Number.isFinite(n)) return hex;
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 1) { r *= f; g *= f; b *= f; } else { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  };
  const polygon = (ctx, pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  const diamond = (ctx, cx, cy) => { ctx.beginPath(); ctx.moveTo(cx, cy - H - 0.5); ctx.lineTo(cx + W + 0.5, cy); ctx.lineTo(cx, cy + H + 0.5); ctx.lineTo(cx - W - 0.5, cy); ctx.closePath(); };
  const WOOD = ['#b98a57', '#b1834f', '#c0915e'];

  /* ------------------------------------------------ floors ------------------------------------------------ */
  /** One floor tile (centre cx, cy in iso pixels). Returns false if the id is not an interior tile. */
  function tile(ctx, tileId, cx, cy, tx, ty) {
    const info = InteriorTileInfo.byTile[tileId];
    if (!info) return false;
    const d = info.def, c = d.colors || WOOD, noise = hash2(tx, ty), v = (noise * 3) | 0;
    diamond(ctx, cx, cy);
    if (d.kind !== 'floor') { ctx.fillStyle = Array.isArray(c) ? c[0] : '#0b0d12'; ctx.fill(); return true; }
    const along = (f, color, width) => {                         // a line across the tile, parallel to the x axis, a fraction f of the way along y
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      ctx.moveTo(cx - W * f, cy - H + H * f); ctx.lineTo(cx + W - W * f, cy + H * f);
      ctx.stroke();
    };
    if (d.pattern === 'checker') { ctx.fillStyle = (tx + ty) & 1 ? c[1] : c[0]; ctx.fill(); }
    else if (d.pattern === 'mat') {
      ctx.fillStyle = WOOD[v]; ctx.fill();
      const k = 0.68; ctx.beginPath(); ctx.moveTo(cx, cy - H * k); ctx.lineTo(cx + W * k, cy); ctx.lineTo(cx, cy + H * k); ctx.lineTo(cx - W * k, cy); ctx.closePath();
      ctx.fillStyle = c[0]; ctx.fill(); ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = 2; ctx.stroke();
      return true;
    } else { ctx.fillStyle = c[v] || c[0]; ctx.fill(); }
    if (d.pattern === 'planks') { for (const f of [0.25, 0.5, 0.75]) along(f, 'rgba(60,35,15,.28)', 1); if (noise > 0.7) { ctx.fillStyle = 'rgba(60,35,15,.3)'; ctx.fillRect(cx + (noise - 0.85) * 40, cy - 2, 2, 2); } }
    else if (d.pattern === 'stone') { ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.2; diamond(ctx, cx, cy); ctx.stroke(); if (noise > 0.6) { ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 3, cy + 4); ctx.stroke(); } }
    else if (d.pattern === 'carpet') { ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; for (const f of [0.33, 0.66]) along(f, 'rgba(255,255,255,.08)', 1); }
    else if (d.pattern === 'straw') { ctx.strokeStyle = 'rgba(120,90,30,.45)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = hash2(tx * 7 + i, ty), b = hash2(tx, ty * 7 + i); const x = cx + (a - 0.5) * W * 1.1, y = cy + (b - 0.5) * H * 1.1; ctx.moveTo(x, y); ctx.lineTo(x + 6 * (a - 0.3), y - 3); } ctx.stroke(); }
    if (d.kind === 'floor') { ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; diamond(ctx, cx, cy); ctx.stroke(); }
    return true;
  }

  /* ------------------------------------------------ walls ------------------------------------------------ */
  const TALL = 70, LOW = 14;
  /** A wall block. opts: { low, windowS, windowE } (a window on the face toward the room). */
  function wall(g, objId, cx, cy, opts = {}) {
    const info = InteriorTileInfo.byObj[objId], ctx = g.ctx;
    const c = info ? info.def.colors : { top: '#6d4c2f', left: '#b8875a', right: '#946a42' }, pattern = info ? info.def.pattern : 'planks';
    const h = opts.low ? LOW : TALL, Lx = cx - W, Rx = cx + W, By = cy + H;
    polygon(ctx, [Lx, cy, cx, By, cx, By - h, Lx, cy - h], c.left);                 // south face
    polygon(ctx, [cx, By, Rx, cy, Rx, cy - h, cx, By - h], c.right);                // east face
    polygon(ctx, [cx, cy - H - h, Rx, cy - h, cx, By - h, Lx, cy - h], c.top);
    ctx.lineWidth = 1;
    if (pattern === 'planks') {
      ctx.strokeStyle = 'rgba(40,25,10,.25)'; ctx.beginPath();
      for (let u = 0.25; u < 1; u += 0.25) { ctx.moveTo(Lx + W * u, cy + H * u); ctx.lineTo(Lx + W * u, cy + H * u - h); ctx.moveTo(cx + W * u, By - H * u); ctx.lineTo(cx + W * u, By - H * u - h); }
      ctx.stroke();
    } else if (pattern === 'stone' || pattern === 'brick') {
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.beginPath();
      for (let y = pattern === 'brick' ? 7 : 12; y < h; y += pattern === 'brick' ? 7 : 12) { ctx.moveTo(Lx, cy - y); ctx.lineTo(cx, By - y); ctx.lineTo(Rx, cy - y); }
      ctx.stroke();
    } else if (pattern === 'plaster' && !opts.low) {
      polygon(ctx, [Lx, cy, cx, By, cx, By - 8, Lx, cy - 8], shadeOf(c.left, 0.72));                // a skirting board
      polygon(ctx, [cx, By, Rx, cy, Rx, cy - 8, cx, By - 8], shadeOf(c.right, 0.72));
    }
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(cx, By); ctx.lineTo(cx, By - h); ctx.stroke();
    if (info && info.def.window && !opts.low) {
      const pane = (face, u0, u1) => {
        const a = face(u0), b = face(u1);
        polygon(ctx, [a[0], a[1] - 28, b[0], b[1] - 28, b[0], b[1] - 52, a[0], a[1] - 52], '#5f86a8');
        polygon(ctx, [a[0], a[1] - 46, b[0], b[1] - 46, b[0], b[1] - 52, a[0], a[1] - 52], 'rgba(255,255,255,.35)');
        ctx.strokeStyle = '#4a3322'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1] - 28); ctx.lineTo(b[0], b[1] - 28); ctx.lineTo(b[0], b[1] - 52); ctx.lineTo(a[0], a[1] - 52); ctx.closePath();
        const m = face((u0 + u1) / 2); ctx.moveTo(m[0], m[1] - 28); ctx.lineTo(m[0], m[1] - 52); ctx.stroke();
      };
      if (opts.windowS) pane(u => [Lx + W * u, cy + H * u], 0.28, 0.72);
      if (opts.windowE) pane(u => [cx + W * u, By - H * u], 0.28, 0.72);
    }
  }

  /* ------------------------------------------------ furniture ------------------------------------------------ */
  /** A box over world rectangle [x0,y0]-[x1,y1], `h` pixels tall, raised `lift` pixels. Visible faces: south (y1) and east (x1). */
  function box(ctx, x0, y0, x1, y1, h, top, lift = 0, side) {
    const [ax, ay] = P(x0, y1), [bx, by] = P(x1, y1), [cx, cy] = P(x1, y0), [dx, dy] = P(x0, y0);
    const s = side || top;
    polygon(ctx, [ax, ay - lift, bx, by - lift, bx, by - lift - h, ax, ay - lift - h], shadeOf(s, 0.86));
    polygon(ctx, [bx, by - lift, cx, cy - lift, cx, cy - lift - h, bx, by - lift - h], shadeOf(s, 0.7));
    polygon(ctx, [dx, dy - lift - h, cx, cy - lift - h, bx, by - lift - h, ax, ay - lift - h], top);
  }
  /** A point on a front face: 'S' (y = y1, u along x) or 'E' (x = x1, u along y), `up` pixels above the floor. */
  const facePt = (b, face, u, up) => { const [x, y] = face === 'S' ? P(b.x0 + (b.x1 - b.x0) * u, b.y1) : P(b.x1, b.y0 + (b.y1 - b.y0) * u); return [x, y - up]; };
  const faceQuad = (ctx, b, face, u0, u1, h0, h1, color) => { const a = facePt(b, face, u0, h0), c = facePt(b, face, u1, h0), d = facePt(b, face, u1, h1), e = facePt(b, face, u0, h1); polygon(ctx, [...a, ...c, ...d, ...e], color); };
  /** The face a piece shows to the room: its front (rot 0 / 2 face south, 1 / 3 face east, as seen from the camera). */
  const frontFace = rot => (rot % 2 ? 'E' : 'S');

  const STYLES = {
    table(ctx, b, def, rot) {
      const c = def.colors, h = def.height || 22, legs = c.leg || '#6d4c2f', t = 0.1;
      for (const [x, y] of [[b.x0 + t, b.y0 + t], [b.x1 - t - 0.12, b.y0 + t], [b.x0 + t, b.y1 - t - 0.12], [b.x1 - t - 0.12, b.y1 - t - 0.12]]) box(ctx, x, y, x + 0.12, y + 0.12, h - 4, legs);
      box(ctx, b.x0 + 0.04, b.y0 + 0.04, b.x1 - 0.04, b.y1 - 0.04, 4, c.top, h - 4);
      if (c.pad) box(ctx, b.x0 + 0.12, b.y0 + 0.14, b.x1 - 0.12, b.y1 - 0.14, 3, c.pad, h);
    },
    workbench(ctx, b, def, rot) {
      STYLES.table(ctx, b, def, rot);
      const h = def.height || 24, c = def.colors, mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      box(ctx, mx - 0.45, my - 0.08, mx - 0.05, my + 0.06, 2, c.tool, h);                         // a saw
      box(ctx, mx + 0.15, my - 0.04, mx + 0.5, my + 0.02, 2, '#7a5233', h); box(ctx, mx + 0.42, my - 0.12, mx + 0.5, my + 0.1, 4, c.tool, h);   // a hammer
    },
    bed(ctx, b, def, rot) {
      const c = def.colors, i = 0.06;
      box(ctx, b.x0 + i, b.y0 + i, b.x1 - i, b.y1 - i, 8, c.frame);
      box(ctx, b.x0 + i + 0.04, b.y0 + i + 0.04, b.x1 - i - 0.04, b.y1 - i - 0.04, 5, c.blanket, 8);
      const head = { 0: [b.x0, b.y0, b.x1, b.y0 + 0.45], 1: [b.x1 - 0.45, b.y0, b.x1, b.y1], 2: [b.x0, b.y1 - 0.45, b.x1, b.y1], 3: [b.x0, b.y0, b.x0 + 0.45, b.y1] }[rot];
      box(ctx, head[0] + 0.12, head[1] + 0.1, head[2] - 0.12, head[3] - 0.1, 6, c.pillow, 12);
      const board = { 0: [b.x0 + i, b.y0 + i, b.x1 - i, b.y0 + i + 0.1], 1: [b.x1 - i - 0.1, b.y0 + i, b.x1 - i, b.y1 - i], 2: [b.x0 + i, b.y1 - i - 0.1, b.x1 - i, b.y1 - i], 3: [b.x0 + i, b.y0 + i, b.x0 + i + 0.1, b.y1 - i] }[rot];
      box(ctx, board[0], board[1], board[2], board[3], 22, c.frame);
    },
    chair(ctx, b, def, rot) {
      const c = def.colors, s = 0.26;
      box(ctx, b.x0 + 0.45, b.y0 + 0.45, b.x1 - 0.45, b.y1 - 0.45, 8, c.back);
      box(ctx, b.x0 + s, b.y0 + s, b.x1 - s, b.y1 - s, 3, c.seat, 8);
      const back = { 0: [b.x0 + s, b.y0 + s, b.x1 - s, b.y0 + s + 0.08], 1: [b.x1 - s - 0.08, b.y0 + s, b.x1 - s, b.y1 - s], 2: [b.x0 + s, b.y1 - s - 0.08, b.x1 - s, b.y1 - s], 3: [b.x0 + s, b.y0 + s, b.x0 + s + 0.08, b.y1 - s] }[rot];
      box(ctx, back[0], back[1], back[2], back[3], 14, c.back, 11);
    },
    shelf(ctx, b, def, rot) {
      const c = def.colors, h = def.height || 50, face = frontFace(rot), goods = c.goods || ['#9e3b3b'];
      box(ctx, b.x0 + 0.04, b.y0 + 0.04, b.x1 - 0.04, b.y1 - 0.04, h, c.wood);
      const fb = { x0: b.x0 + 0.04, y0: b.y0 + 0.04, x1: b.x1 - 0.04, y1: b.y1 - 0.04 }, rows = Math.max(2, Math.round(h / 14));
      for (let r = 0; r < rows; r++) {
        const y0 = 4 + r * (h - 6) / rows, y1 = y0 + (h - 6) / rows - 3;
        faceQuad(ctx, fb, face, 0.06, 0.94, y0, y1, 'rgba(30,18,8,.55)');
        for (let k = 0, u = 0.08; u < 0.9; k++) {
          const wdt = 0.05 + 0.06 * hash2(r * 13 + k, rot + 7), tall = (y1 - y0) * (0.55 + 0.4 * hash2(k, r * 5 + 3));
          faceQuad(ctx, fb, face, u, Math.min(0.92, u + wdt), y0, y0 + tall, goods[(k + r) % goods.length]);
          u += wdt + 0.015;
        }
      }
    },
    cabinet(ctx, b, def, rot) {
      const c = def.colors, h = def.height || 34, face = frontFace(rot), fb = { x0: b.x0 + 0.08, y0: b.y0 + 0.08, x1: b.x1 - 0.08, y1: b.y1 - 0.08 };
      box(ctx, fb.x0, fb.y0, fb.x1, fb.y1, h, c.wood);
      faceQuad(ctx, fb, face, 0.1, 0.48, 4, h - 4, c.front); faceQuad(ctx, fb, face, 0.52, 0.9, 4, h - 4, c.front);
      for (const u of [0.42, 0.58]) { const [x, y] = facePt(fb, face, u, h / 2); ctx.fillStyle = c.knob || '#d9b45a'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill(); }
      if (c.cross) { faceQuad(ctx, fb, face, 0.44, 0.56, h - 18, h - 8, c.cross); faceQuad(ctx, fb, face, 0.36, 0.64, h - 15, h - 11, c.cross); }
    },
    rug(ctx, b, def) {
      const c = def.colors, [cx, cy] = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), rw = (b.x1 - b.x0) / 2, rh = (b.y1 - b.y0) / 2;
      const ell = (k, color) => { ctx.beginPath(); ctx.ellipse(cx, cy, (rw + rh) / 2 * W * 0.92 * k, (rw + rh) / 2 * H * 0.92 * k, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };
      ell(1, c.edge); ell(0.86, c.main); ctx.strokeStyle = c.edge; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy, (rw + rh) / 2 * W * 0.5, (rw + rh) / 2 * H * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    },
    fireplace(ctx, b, def, rot, now) {
      const c = def.colors, h = def.height || 46, face = frontFace(rot);
      box(ctx, b.x0 + 0.04, b.y0 + 0.04, b.x1 - 0.04, b.y1 - 0.04, h, c.stone);
      const fb = { x0: b.x0 + 0.04, y0: b.y0 + 0.04, x1: b.x1 - 0.04, y1: b.y1 - 0.04 };
      faceQuad(ctx, fb, face, 0.22, 0.78, 3, 26, c.dark);
      const t = (now || 0) / 1000;
      for (let i = 0; i < 4; i++) {
        const u = 0.32 + i * 0.12, [x, y] = facePt(fb, face, u, 6), fl = 6 + 4 * Math.sin(t * 9 + i * 1.7);
        ctx.fillStyle = i % 2 ? '#ffd24a' : c.fire; ctx.beginPath(); ctx.ellipse(x, y - fl / 2, 3.2, fl / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      faceQuad(ctx, fb, face, 0.12, 0.88, h - 5, h, shadeOf(c.stone, 1.15));
    },
    plant(ctx, b, def, rot, now) {
      const c = def.colors, mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      box(ctx, mx - 0.18, my - 0.18, mx + 0.18, my + 0.18, 12, c.pot);
      const [x, y] = P(mx, my);
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + 0.3, r = 7 + 3 * (i % 2);
        ctx.fillStyle = shadeOf(c.leaf, 0.8 + 0.12 * (i % 3)); ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r, y - 20 + Math.sin(a) * r * 0.5, 5, 8, a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = shadeOf(c.leaf, 1.12); ctx.beginPath(); ctx.ellipse(x, y - 26, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
    },
    lamp(ctx, b, def, rot, now) {
      const c = def.colors, h = def.height || 44, [x, y] = P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      const glow = ctx.createRadialGradient(x, y - h + 6, 2, x, y - h + 6, 34);
      glow.addColorStop(0, 'rgba(255,230,160,.45)'); glow.addColorStop(1, 'rgba(255,230,160,0)'); ctx.fillStyle = glow; ctx.fillRect(x - 34, y - h - 28, 68, 68);
      ctx.fillStyle = c.pole; ctx.beginPath(); ctx.ellipse(x, y, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c.pole; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h + 8); ctx.stroke();
      polygon(ctx, [x - 6, y - h, x + 6, y - h, x + 10, y - h + 12, x - 10, y - h + 12], c.shade);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x - 5, y - h + 1, 3, 9);
    },
    counter(ctx, b, def, rot) {
      const c = def.colors, h = def.height || 26, face = frontFace(rot), fb = { x0: b.x0 + 0.04, y0: b.y0 + 0.08, x1: b.x1 - 0.04, y1: b.y1 - 0.08 };
      if (rot % 2) { fb.x0 = b.x0 + 0.08; fb.x1 = b.x1 - 0.08; fb.y0 = b.y0 + 0.04; fb.y1 = b.y1 - 0.04; }
      box(ctx, fb.x0, fb.y0, fb.x1, fb.y1, h - 4, c.front);
      box(ctx, fb.x0 - 0.03, fb.y0 - 0.03, fb.x1 + 0.03, fb.y1 + 0.03, 4, c.top, h - 4);
      for (const u of [0.33, 0.66]) faceQuad(ctx, fb, face, u - 0.005, u + 0.005, 0, h - 4, c.trim);
    },
    crate(ctx, b, def) {
      const c = def.colors, h = def.height || 20, fb = { x0: b.x0 + 0.1, y0: b.y0 + 0.1, x1: b.x1 - 0.1, y1: b.y1 - 0.1 };
      box(ctx, fb.x0, fb.y0, fb.x1, fb.y1, h, c.wood);
      for (const face of ['S', 'E']) {
        ctx.strokeStyle = c.band; ctx.lineWidth = 2; ctx.beginPath();
        const a = facePt(fb, face, 0.05, 2), bb = facePt(fb, face, 0.95, h - 2), cc = facePt(fb, face, 0.05, h - 2), d = facePt(fb, face, 0.95, 2);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(bb[0], bb[1]); ctx.moveTo(cc[0], cc[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
      }
    },
    lumber(ctx, b, def, rot) {
      const c = def.colors, h = def.height || 36, longX = (b.x1 - b.x0) >= (b.y1 - b.y0);
      const post = (x, y) => box(ctx, x, y, x + 0.1, y + 0.1, h, c.frame);
      if (longX) { post(b.x0 + 0.1, b.y0 + 0.45); post(b.x1 - 0.2, b.y0 + 0.45); } else { post(b.x0 + 0.45, b.y0 + 0.1); post(b.x0 + 0.45, b.y1 - 0.2); }
      for (const lift of [6, 15, 24]) for (const off of [0.25, 0.55]) {
        if (longX) box(ctx, b.x0 + 0.05, b.y0 + off, b.x1 - 0.05, b.y0 + off + 0.22, 4, c.plank, lift);
        else box(ctx, b.x0 + off, b.y0 + 0.05, b.x0 + off + 0.22, b.y1 - 0.05, 4, c.plank, lift);
      }
    },
    /** A loom: two posts and a beam, the warp threads strung down the frame, a length of woven cloth rolled at the front. */
    loom(ctx, b, def, rot, now) {
      const c = def.colors, h = def.height || 44, longX = (b.x1 - b.x0) >= (b.y1 - b.y0), face = frontFace(rot);
      const fb = { x0: b.x0 + 0.08, y0: b.y0 + 0.2, x1: b.x1 - 0.08, y1: b.y1 - 0.2 };
      if (!longX) { fb.x0 = b.x0 + 0.2; fb.x1 = b.x1 - 0.2; fb.y0 = b.y0 + 0.08; fb.y1 = b.y1 - 0.08; }
      const post = (u) => { const [x0, y0] = longX ? [fb.x0 + (fb.x1 - fb.x0) * u - 0.06, fb.y0] : [fb.x0, fb.y0 + (fb.y1 - fb.y0) * u - 0.06]; box(ctx, x0, y0, x0 + (longX ? 0.12 : fb.x1 - fb.x0), y0 + (longX ? fb.y1 - fb.y0 : 0.12), h, c.wood); };
      post(0.04); post(0.96);
      box(ctx, fb.x0, fb.y0, fb.x1, fb.y1, 4, c.light, h - 6);                                  // the top beam
      box(ctx, fb.x0 + 0.04, fb.y0, fb.x1 - 0.04, fb.y1, 6, c.wood, 6);                         // the cloth beam
      for (let u = 0.12; u < 0.9; u += 0.055) faceQuad(ctx, fb, face, u, u + 0.012, 12, h - 6, c.warp);   // the warp threads
      const shuttle = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin((now || 0) / 420));                                  // the shuttle drifting across
      faceQuad(ctx, fb, face, 0.1, 0.9, 12, 22, c.cloth);                                       // woven cloth
      faceQuad(ctx, fb, face, shuttle - 0.05, shuttle + 0.05, 22, 26, '#a8763f');
    },
    /** A dye press: a tub on legs with a big screw and a plank, a spout dripping colour into a pot. */
    press(ctx, b, def, rot, now) {
      const c = def.colors, h = def.height || 34, mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      box(ctx, mx - 0.34, my - 0.34, mx + 0.34, my + 0.34, 14, c.tub);                          // the tub
      box(ctx, mx - 0.3, my - 0.3, mx + 0.3, my + 0.3, 2, '#7b45c4', 14);                       // dye in it
      box(ctx, mx - 0.36, my - 0.06, mx + 0.36, my + 0.06, 4, c.light, 22);                     // the pressing plank
      box(ctx, mx - 0.04, my - 0.04, mx + 0.04, my + 0.04, h - 22, c.iron, 22);                  // the screw
      box(ctx, mx - 0.28, my - 0.03, mx + 0.28, my + 0.03, 3, c.wood, h - 3);                    // its handle
      const [sx, sy] = P(mx + 0.38, my + 0.38), drip = ((now || 0) / 600) % 1;
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(sx - 4, sy - 7, 8, 6);                             // a pot under the spout
      ctx.fillStyle = '#7b45c4'; ctx.fillRect(sx - 1, sy - 13 + drip * 6, 2, 2);                  // a drip
    },
    /** A bin: a slatted wooden box, heaped with what it holds (f.fill 0..1). */
    bin(ctx, b, def, rot, now, f) {
      const c = def.colors, h = def.height || 20, fb = { x0: b.x0 + 0.06, y0: b.y0 + 0.08, x1: b.x1 - 0.06, y1: b.y1 - 0.08 }, fill = Math.max(0, Math.min(1, (f && f.fill) || 0));
      box(ctx, fb.x0, fb.y0, fb.x1, fb.y1, h, shadeOf(c.wood, 0.75));
      if (fill > 0) {                                                                           // the heap of wool, rising as it fills
        const top = h - 4 + fill * 10, n = Math.round(3 + fill * 6);
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n, [x, y] = P(fb.x0 + (fb.x1 - fb.x0) * u, (fb.y0 + fb.y1) / 2 + Math.sin(i * 2.3) * 0.12);
          ctx.fillStyle = i % 2 ? c.fill : shadeOf(c.fill, 0.9); ctx.beginPath(); ctx.ellipse(x, y - top + Math.sin(i * 1.7) * 2, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      for (const face of ['S', 'E']) for (const u of [0.02, 0.5, 0.98]) faceQuad(ctx, fb, face, u - 0.02, u + 0.02, 0, h, c.band);   // corner posts
      for (const face of ['S', 'E']) faceQuad(ctx, fb, face, 0, 1, h / 2 - 1, h / 2 + 1, c.band);                                     // a slat
    },
    /** A chest: a wooden body under a lid with iron bands and a brass lock on the front. */
    chest(ctx, b, def, rot) {
      const c = def.colors, h = def.height || 24, body = h * 0.62, face = frontFace(rot), fb = { x0: b.x0 + 0.1, y0: b.y0 + 0.14, x1: b.x1 - 0.1, y1: b.y1 - 0.14 };
      box(ctx, fb.x0, fb.y0, fb.x1, fb.y1, body, c.wood);
      box(ctx, fb.x0 - 0.02, fb.y0 - 0.02, fb.x1 + 0.02, fb.y1 + 0.02, h - body, c.lid, body);                 // the lid
      for (const f of ['S', 'E']) for (const u of [0.14, 0.86]) faceQuad(ctx, fb, f, u - 0.05, u + 0.05, 0, h, c.band);   // iron bands
      faceQuad(ctx, fb, face, 0.43, 0.57, body - 6, body + 2, c.lock);                                           // the lock
      faceQuad(ctx, fb, face, 0.47, 0.53, body - 4, body - 1, '#5b4410');
    },
    hay(ctx, b, def) {
      const c = def.colors, h = def.height || 18, fb = { x0: b.x0 + 0.08, y0: b.y0 + 0.12, x1: b.x1 - 0.08, y1: b.y1 - 0.12 };
      box(ctx, fb.x0, fb.y0, fb.x1, fb.y1, h, c.hay);
      for (const face of ['S', 'E']) for (const u of [0.3, 0.7]) faceQuad(ctx, fb, face, u - 0.03, u + 0.03, 0, h, c.band);
      ctx.strokeStyle = 'rgba(120,90,30,.5)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const [x, y] = facePt(fb, 'S', 0.1 + i * 0.15, 4 + (i % 3) * 4); ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 2); }
      ctx.stroke();
    }
  };

  /** A furniture piece. `f`: { id, x, y (its centre, world), w, h, rot }. */
  function furniture(g, f, now) {
    const def = FurnitureDefs.get(f.id), ctx = g.ctx || g;
    if (!def) return;
    const b = { x0: f.x - f.w / 2, y0: f.y - f.h / 2, x1: f.x + f.w / 2, y1: f.y + f.h / 2 };
    const img = def.sprites && def.sprites.image && typeof SpriteRegistry !== 'undefined' ? SpriteRegistry.image(def.sprites.image) : null;
    if (img) {
      const left = isoX(b.x0, b.y1), right = isoX(b.x1, b.y0), width = right - left, height = width * img.naturalHeight / img.naturalWidth;
      ctx.drawImage(img, left, isoY(b.x1, b.y1) - height, width, height);                 // (as wide as the footprint, standing on its front corner)
      return;
    }
    if (def.height && def.style !== 'rug') { ctx.fillStyle = 'rgba(0,0,0,.14)'; const [cx, cy] = P(f.x, f.y); ctx.beginPath(); ctx.ellipse(cx, cy + 2, (f.w + f.h) * W * 0.32, (f.w + f.h) * H * 0.32, 0, 0, Math.PI * 2); ctx.fill(); }
    (STYLES[def.style] || STYLES.crate)(ctx, b, def, f.rot | 0, now, f);
  }

  return { tile, wall, furniture, box, styles: Object.keys(STYLES), TALL, LOW };
})();
