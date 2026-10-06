'use strict';
/* CLIENT - retro pixel-art trees, stumps and logs, in the style of the pixel characters and creatures (same on-screen pixel size, PX).
 * Each tree is painted once per look (leafy or pine, its size, its biome's tint, apples or not) into two small canvases: the trunk and the
 * crown (so the crown alone sways when you chop). A felled tree is the two together, rotated as it topples; a stump is left behind and the
 * tree breaks into logs on the ground (drawn by PixelLogs). Everything is outlined and drawn with hard edges. */
const PixelProps = (() => {
  const { hex, css, shade, light, mix, outline } = PixelCharacter.util;
  const PX = 1.25, cache = new Map();
  const W = 64, H = 88, GROUND = 85, AX = 32;                                // the tree's art box, the row its roots stand on, the column over its tile
  const BAYER = [0, 0.5, 0.75, 0.25];                                         // 2x2 ordered dither
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };

  /** A biome tint ('rgba(r,g,b,a)') laid over a palette colour, the way the old trees were tinted. */
  function tinted(color, tint) {
    if (!tint) return color;
    const m = /rgba?\(([^)]+)\)/.exec(tint); if (!m) return color;
    const [r, g, b, a = 1] = m[1].split(',').map(Number);
    return mix(color, css([r, g, b]), Math.min(0.85, a));
  }
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  /** A union of ellipses (art units, painted at scale m), lit from the upper left with dithered steps through a palette (dark -> light). */
  function litBlob(ctx, parts, m, pal, opts = {}) {
    const pts = new Map();
    for (const [acx, acy, arx, ary] of parts) {
      const cx = acx * m, cy = acy * m, rx = arx * m, ry = ary * m;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        const ny = (y + 0.5 - cy) / ry; if (Math.abs(ny) > 1) continue;
        const half = rx * Math.sqrt(1 - ny * ny);
        for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) pts.set(x + ',' + y, [x, y]);
      }
    }
    const xs = [...pts.values()].map(p => p[0]), ys = [...pts.values()].map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (const [x, y] of pts.values()) {
      const nx = (x - mx) / ((x1 - x0) / 2 || 1), ny = (y - my) / ((y1 - y0) / 2 || 1);
      const edge = !pts.has(x + ',' + (y + 1)) || !pts.has((x + 1) + ',' + y) ? -0.35 : !pts.has(x + ',' + (y - 1)) ? 0.25 : 0;   // rims: shadowed below and right, lit on top
      let v = 0.55 - nx * 0.28 - ny * 0.42 + edge + (opts.noise ? (hash(Math.floor((x + (y % 6 < 3 ? 0 : 2)) / 4), Math.floor(y / 3)) - 0.5) * opts.noise : 0);
      let i = Math.floor(v * (pal.length - 1) + BAYER[(x & 1) + (y & 1) * 2] * 0.9);
      i = Math.max(0, Math.min(pal.length - 1, i));
      ctx.fillStyle = pal[i]; ctx.fillRect(x, y, 1, 1);
    }
    if (opts.clumps) for (const [x, y] of pts.values()) {                    // leaf clumps: little bright arcs, darker pockets
      const h = hash(x, y);
      if (h < opts.clumps && pts.has(x + ',' + (y + 2))) { ctx.fillStyle = pal[pal.length - 1]; ctx.fillRect(x, y, 1, 1); ctx.fillStyle = pal[Math.max(0, pal.length - 3)]; ctx.fillRect(x, y + 1, 1, 1); }
      else if (h > 1 - opts.clumps * 0.6) { ctx.fillStyle = pal[0]; ctx.fillRect(x, y, 1, 1); }
    }
    return pts;
  }

  /** Bark: a column-shaded trunk with grooves, from art row y0 to y1, w wide at x (centre cx), flaring into roots at the bottom. */
  function trunk(ctx, m, cx, y0, y1, w, bark) {
    const top = Math.round(y0 * m), bot = Math.round(y1 * m), flare = Math.round(4 * m);
    for (let y = top; y <= bot; y++) {
      const extra = y > bot - flare ? Math.round((y - (bot - flare)) * 0.8) : 0, half = (w * m) / 2 + extra, left = Math.round(cx * m - half), right = Math.round(cx * m + half);
      for (let x = left; x < right; x++) {
        const k = (x - left) / Math.max(1, right - left - 1);
        let i = k < 0.2 ? 3 : k < 0.55 ? 2 : k < 0.85 ? 1 : 0;
        if ((x + Math.floor(y / (3 * m))) % 4 === 0 && i > 0) i--;              // grooves in the bark
        ctx.fillStyle = bark[i]; ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  const LEAF = ['#1f4a26', '#2b6233', '#3a7d3a', '#4f9843', '#6fb453', '#9fd56e'];
  const NEEDLE = ['#173d22', '#21502c', '#2c6436', '#3a7a42', '#55955a', '#7fb87a'];
  const BARK = ['#3a2616', '#553a24', '#6e4e32', '#8c6844'];
  const LEAFY_CROWN = [[32, 30, 22, 17], [17, 40, 12, 10], [47, 40, 12, 10], [32, 16, 15, 11], [23, 48, 10, 6], [41, 48, 10, 6]];
  const APPLES = { leafy: [[17, 36], [44, 39], [26, 26], [37, 18], [50, 30], [30, 41], [20, 24]], pine: [[20, 66], [42, 68], [27, 50], [37, 44], [31, 60], [33, 32]] };

  /** The trunk and crown canvases for one look. */
  function treeArt(variant, tint, fruit) {
    const pine = variant % 2 === 1, m = 0.95 + (variant % 5) * 0.05, key = `${pine ? 'p' : 'l'}|${m}|${tint || ''}|${fruit ? 1 : 0}`;
    if (cache.has(key)) return cache.get(key);
    const cw = Math.ceil(W * m), ch = Math.ceil(H * m), bark = BARK.map(c => tint && tint.includes('235,246,255') ? mix(c, '#dfe8ef', 0.35) : c);   // (snowy bark is a little frosted)
    const pal = (pine ? NEEDLE : LEAF).map(c => tinted(c, tint));
    const T = canvas(cw, ch), tc = T.getContext('2d'), Cn = canvas(cw, ch), cc = Cn.getContext('2d');
    if (pine) {
      trunk(tc, m, AX, 64, GROUND, 6, bark);
      for (let i = 0; i < 4; i++) {                                                 // four tiers of boughs, jagged along the bottom
        const base = 74 - i * 15, half = 27 - i * 5.5, hgt = 24, apex = base - hgt;
        const pts = new Map();
        for (let y = Math.round(apex * m); y <= Math.round(base * m); y++) {
          const k = (y / m - apex) / hgt, hw = half * k * m, jag = (Math.round(y / m) === Math.round(base) || Math.round(y / m) === Math.round(base) - 1) && ((Math.floor(y / m) + 0) % 1 === 0);
          for (let x = Math.round(AX * m - hw); x < Math.round(AX * m + hw); x++) {
            if (jag && Math.floor((x / m) / 3) % 2 === 0 && y >= Math.round((base - 1) * m)) continue;   // notches between the needle tufts
            pts.set(x + ',' + y, [x, y]);
          }
        }
        for (const [x, y] of pts.values()) {
          const k = (x / m - AX) / half, v = 0.62 - k * 0.45 - ((y / m) - (base - hgt / 2)) / hgt * 0.5 + (!pts.has(x + ',' + (y + 1)) ? -0.3 : 0) + (hash(x, y) - 0.5) * 0.35;
          let idx = Math.max(0, Math.min(pal.length - 1, Math.floor(v * (pal.length - 1) + BAYER[(x & 1) + (y & 1) * 2] * 0.9)));
          if ((x + y * 2) % 7 === 0 && idx > 1) idx -= 2;                            // needle strokes
          cc.fillStyle = pal[idx]; cc.fillRect(x, y, 1, 1);
        }
      }
    } else {
      trunk(tc, m, AX, 46, GROUND, 8, bark);
      tc.fillStyle = bark[0]; for (const [x0, y0, x1, y1] of [[31, 54, 23, 45], [34, 53, 42, 44]]) for (let s = 0; s <= 12; s++) { const x = (x0 + (x1 - x0) * s / 12) * m, y = (y0 + (y1 - y0) * s / 12) * m; tc.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(2 * m)), Math.max(1, Math.round(2 * m))); }   // limbs into the crown
      tc.fillStyle = bark[0]; tc.fillRect(Math.round(31 * m), Math.round(64 * m), Math.max(1, Math.round(2 * m)), Math.max(1, Math.round(3 * m)));   // a knot
      litBlob(cc, LEAFY_CROWN, m, pal, { noise: 0.7, clumps: 0.035 });
    }
    if (fruit) for (const [ax, ay] of APPLES[pine ? 'pine' : 'leafy']) {           // apples among the leaves
      const x = Math.round(ax * m), y = Math.round(ay * m), s = Math.max(2, Math.round(2 * m));
      cc.fillStyle = '#c62828'; cc.fillRect(x, y, s, s); cc.fillStyle = '#ff6a5a'; cc.fillRect(x, y, 1, 1); cc.fillStyle = '#3b6b2a'; cc.fillRect(x + (s >> 1), y - 1, 1, 1);
    }
    outline(tc, '#1e140c', cw, ch); outline(cc, '#14261a', cw, ch);
    const art = { trunk: T, crown: Cn, m, w: cw, h: ch };
    cache.set(key, art);
    return art;
  }

  /** A standing tree at (sx, sy); the crown sways by shakeX (when chopped). fruit: an apple tree's forage state (apples while ripe). */
  function drawTree(ctx, sx, sy, variant, shakeX, fruit, biome, tint) {
    const art = treeArt(variant, tint, !!(fruit && fruit.ripe)), u = PX, left = sx - AX * art.m * u, top = sy - GROUND * art.m * u;
    ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse(sx + 5, sy + 3, 26 * art.m, 11 * art.m, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.trunk, left, top, art.w * u, art.h * u);
    ctx.drawImage(art.crown, left + Math.round(shakeX / u) * u, top, art.w * u, art.h * u);
    ctx.restore();
  }

  /** A felled tree toppling: rotated about its foot by `angle` (radians, + to the right), fading out by `alpha` as it breaks into logs. */
  function drawFalling(ctx, sx, sy, variant, angle, alpha, tint) {
    const art = treeArt(variant, tint, false), u = PX;
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha;
    ctx.translate(sx, sy - 2); ctx.rotate(angle);
    const left = -AX * art.m * u, top = -GROUND * art.m * u;
    ctx.drawImage(art.trunk, left, top, art.w * u, art.h * u); ctx.drawImage(art.crown, left, top, art.w * u, art.h * u);
    ctx.restore();
  }

  /** A stump: a cut face with growth rings over a ring of roots. */
  function stumpArt() {
    if (cache.has('stump')) return cache.get('stump');
    const c = canvas(22, 16), g = c.getContext('2d'), px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    for (let y = 4; y <= 13; y++) for (let x = 3; x <= 18; x++) {                 // the bark round the side, flaring at the roots
      const flare = y > 10 ? (y - 10) : 0; if (x < 3 + (y > 10 ? -flare : 1) || x > 18 + (y > 10 ? flare - 1 : -1)) continue;
      const k = (x - 3) / 15; px(x, y, (x + Math.floor(y / 3)) % 4 === 0 ? BARK[0] : k < 0.25 ? BARK[3] : k < 0.6 ? BARK[2] : BARK[1]);
    }
    for (let y = 1; y <= 7; y++) for (let x = 3; x <= 18; x++) {                 // the cut face
      const nx = (x - 10.5) / 7.5, ny = (y - 4) / 3; if (nx * nx + ny * ny > 1) continue;
      const r = Math.sqrt(nx * nx + ny * ny); px(x, y, r > 0.82 ? '#a8804e' : (Math.round(r * 5) % 2 ? '#c9a06a' : '#dcb880'));
    }
    px(10, 4, '#8c6844'); px(11, 4, '#8c6844');
    outline(g, '#1e140c', 22, 16);
    cache.set('stump', c); return c;
  }
  function drawStump(ctx, sx, sy) {
    const c = stumpArt(), u = PX * 1.15;
    ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(sx + 2, sy + 1, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(c, sx - 11 * u, sy - 14 * u, 22 * u, 16 * u); ctx.restore();
  }

  return { drawTree, drawFalling, drawStump, tinted };
})();

/* ---- LOGS: a cut log lying on the ground (and the log's icon) ---- */
const PixelLogs = (() => {
  const { outline } = PixelCharacter.util;
  const PX = 1.25, BARK = ['#3a2616', '#553a24', '#6e4e32', '#8c6844'], cache = {};
  /** Paints a log lying along x into ctx at (ox, oy), each art pixel `b` canvas pixels. */
  function paint(g, ox, oy, b, len = 16) {
    const px = (x, y, c) => { g.fillStyle = c; g.fillRect(ox + x * b, oy + y * b, b, b); };
    for (let y = 0; y < 7; y++) for (let x = 2; x < len; x++) {                    // the bark, round in section: lit on top
      const k = y / 6; let c = k < 0.2 ? BARK[3] : k < 0.5 ? BARK[2] : k < 0.85 ? BARK[1] : BARK[0];
      if ((x * 3 + y * 7) % 11 === 0 || (y === 3 && x % 5 === 0)) c = BARK[0];
      px(x, y, c);
    }
    for (let y = 1; y < 6; y++) px(1, y, BARK[1]);                                  // the rough far end
    for (let y = 0; y < 7; y++) for (let x = len - 1; x < len + 3; x++) {           // the sawn near end, with rings
      const nx = (x - (len + 0.5)) / 2.2, ny = (y - 3) / 3.3; if (nx * nx + ny * ny > 1) continue;
      const r = Math.sqrt(nx * nx + ny * ny); px(x, y, r > 0.8 ? '#a8804e' : Math.round(r * 4) % 2 ? '#c9a06a' : '#e2c08a');
    }
    px(len + 1, 3, '#8c6844');
  }
  function art() {
    if (cache.ground) return cache.ground;
    const c = document.createElement('canvas'); c.width = 22; c.height = 9; const g = c.getContext('2d');
    paint(g, 1, 1, 1); outline(g, '#1e140c', 22, 9);
    return (cache.ground = c);
  }
  /** A log on the ground at (sx, sy); seed turns some of them round. */
  function drawGround(ctx, sx, sy, seed, lift = 0) {
    const c = art(), u = PX, flip = seed % 2 ? -1 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, 12, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(sx, sy - 9 * u - lift); ctx.scale(flip, 1); ctx.drawImage(c, -11 * u, 0, 22 * u, 9 * u); ctx.restore();
  }
  /** The log's item icon (a 48 x 48 canvas): the same log, bigger pixels, tilted a little. */
  function icon(g) {
    const c = document.createElement('canvas'); c.width = 22; c.height = 9; const s = c.getContext('2d');
    paint(s, 1, 1, 1); outline(s, '#1e140c', 22, 9);
    g.save(); g.imageSmoothingEnabled = false; g.translate(24, 25); g.rotate(-0.38); g.drawImage(c, -22, -9, 44, 18); g.restore();
  }
  return { drawGround, icon };
})();
