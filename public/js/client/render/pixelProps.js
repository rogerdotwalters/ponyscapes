'use strict';
/* CLIENT - retro pixel-art trees, stumps and logs, in the style of the pixel characters and creatures (same on-screen pixel size, PX).
 * Each tree is painted once per look (leafy or pine, its size, its biome's tint, apples or not) into two small canvases: the trunk and the
 * crown (so the crown alone sways when you chop). A felled tree is the two together, rotated as it topples; a stump is left behind and the
 * tree breaks into logs on the ground (drawn by PixelLogs). Everything is outlined and drawn with hard edges. */
const PixelProps = (() => {
  const { hex, css, shade, light, mix, outline } = PixelCharacter.util;
  const PX = 1.25, cache = new PackedCache(3000, 'prop');
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
  /** fruit: the colour of the apples among its leaves, or null. */
  function treeArt(variant, tint, fruit, wash) {
    const pine = variant % 2 === 1, m = 0.95 + (variant % 5) * 0.05, key = `${pine ? 'p' : 'l'}|${m}|${tint || ''}|${fruit || ''}|${wash || ''}`;
    if (cache.has(key)) return cache.get(key);
    const cw = Math.ceil(W * m), ch = Math.ceil(H * m), bark = BARK.map(c => tint && tint.includes('235,246,255') ? mix(c, '#dfe8ef', 0.35) : c);   // (snowy bark is a little frosted)
    const pal = (pine ? NEEDLE : LEAF).map(c => tinted(tinted(c, wash), tint));                 // (the species' own wash first, then the season's / biome's)
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
      const x = Math.round(ax * m), y = Math.round(ay * m), s = Math.max(3, Math.round(3 * m));
      cc.fillStyle = shade(fruit, 0.5); cc.fillRect(x - 1, y - 1, s + 2, s + 2);                 // a dark rim, so even a green apple shows among the leaves
      cc.fillStyle = fruit; cc.fillRect(x, y, s, s); cc.fillStyle = shade(fruit, 0.8); cc.fillRect(x + 1, y + s - 1, s - 1, 1); cc.fillStyle = light(fruit, 0.45); cc.fillRect(x, y, 1, 1); cc.fillStyle = '#3b6b2a'; cc.fillRect(x + (s >> 1), y - 1, 1, 1);
    }
    outline(tc, '#1e140c', cw, ch); outline(cc, '#14261a', cw, ch);
    const art = { trunk: T, crown: Cn, m, w: cw, h: ch };
    cache.set(key, art);
    return art;
  }

  /** A standing tree at (sx, sy); the crown sways by shakeX (when chopped). fruit: an apple tree's forage state (apples while ripe). */
  function drawTree(ctx, sx, sy, variant, shakeX, fruit, biome, tint, wash) {
    const art = treeArt(variant, tint, fruit && fruit.ripe ? (ItemDefs[fruit.drop] && ItemDefs[fruit.drop].color) || '#d9382b' : null, wash), u = PX, left = sx - AX * art.m * u, top = sy - GROUND * art.m * u;
    ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse(sx + 5, sy + 3, 26 * art.m, 11 * art.m, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.trunk, left, top, art.w * u, art.h * u);
    ctx.drawImage(art.crown, left + Math.round(shakeX / u) * u, top, art.w * u, art.h * u);
    ctx.restore();
  }

  /** A planted sapling (groves.js) at (sx, sy), `frac` 0..1 grown: a sprout first, then a small tree of its kind that fills out as it grows. */
  function drawSapling(ctx, sx, sy, sp, frac, tint) {
    const def = (typeof TreeSpecies !== 'undefined' && TreeSpecies.get(sp)) || { look: 'leafy' }, pine = def.look === 'pine', u = PX;
    if (frac < 0.3) {                                                               // a sprout: a stem and a few leaves (a tiny cone for a pine)
      const leaf = light(tinted(pine ? '#2f6b4b' : '#5f9c4a', tint), 0.18), dark = shade(leaf, 0.62), k = u * 2.2, art = [];
      for (let y = -1; y >= -6; y--) art.push([0, y, '#6b4a2a']);                    // the stem
      if (pine) { for (let r = 0; r < 4; r++) for (let x = -r; x <= r; x++) art.push([x, -10 + r * 2, r % 2 ? dark : leaf], [x, -9 + r * 2, leaf]); }
      else for (const [x, y, c] of [[-1, -6, leaf], [-2, -6, leaf], [-3, -7, leaf], [-2, -7, dark], [1, -7, leaf], [2, -7, leaf], [3, -8, leaf], [2, -8, dark], [0, -8, leaf], [0, -9, leaf], [-1, -4, leaf], [-2, -4, dark], [1, -4, leaf]]) art.push([x, y, c]);
      const at = new Set(art.map(([x, y]) => x + ',' + y)), px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(sx + (x - 0.5) * k), Math.round(sy + y * k), Math.ceil(k), Math.ceil(k)); };
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a5233'; ctx.beginPath(); ctx.ellipse(sx, sy, 6, 2.4, 0, 0, Math.PI * 2); ctx.fill();   // a patch of freshly dug earth
      for (const [x, y] of art) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!at.has((x + dx) + ',' + (y + dy))) px(x + dx, y + dy, '#1e2a14');   // a dark outline, so it shows on grass
      for (const [x, y, c] of art) px(x, y, c);
      return;
    }
    const k = 0.3 + 0.55 * frac;                                                    // a young tree, growing towards full size
    ctx.save(); ctx.translate(sx, sy); ctx.scale(k, k); drawTree(ctx, 0, 0, pine ? 1 : 0, 0, null, null, tint); ctx.restore();
  }

  /** A felled tree toppling: rotated about its foot by `angle` (radians, + to the right), fading out by `alpha` as it breaks into logs. */
  function drawFalling(ctx, sx, sy, variant, angle, alpha, tint, wash) {
    const art = treeArt(variant, tint, null, wash), u = PX;
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

  /* ---- berry bushes: a low mound of dithered leaves over a few dark stems, berries as outlined pixel blobs. The foliage is its own canvas, so it alone sways. ---- */
  const BW = 44, BH = 34, BGROUND = 31, BAX = 22;
  const DRY = ['#3d3a1c', '#55512a', '#6e6a36', '#878240', '#a09a52', '#bbb46c'];                  // a picked bush: dry and olive
  const BUSH_SHAPES = [[[22, 20, 15, 10], [11, 24, 9, 6], [33, 24, 9, 6], [22, 13, 10, 7]], [[22, 19, 16, 10], [10, 23, 8, 6], [34, 22, 8, 7], [17, 13, 8, 6], [28, 12, 8, 6]], [[22, 21, 14, 9], [12, 21, 9, 7], [32, 24, 10, 6], [24, 13, 11, 7]]];
  const BERRY_SPOTS = [[11, 22], [18, 14], [27, 11], [34, 21], [22, 22], [30, 17], [14, 17], [24, 27], [8, 26], [36, 26]];
  function bushArt(variant, tint, berry, ripe, cut) {
    const v = variant % 3, key = `b|${v}|${tint || ''}|${cut ? 'cut' : ripe ? berry : 'dry'}`;
    if (cache.has(key)) return cache.get(key);
    const pal = (ripe || cut ? LEAF : DRY).map(c => ripe || cut ? tinted(c, tint) : c);
    const T = canvas(BW, BH), tc = T.getContext('2d'), C = canvas(BW, BH), cc = C.getContext('2d');
    const stem = v === 1 ? [[17, 31, 19, 26], [26, 31, 25, 25], [22, 31, 22, 27]] : [[18, 31, 18, 26], [23, 31, 24, 26], [28, 31, 29, 27]];
    for (const [x0, y0, x1, y1] of stem) for (let s = 0; s <= 6; s++) { tc.fillStyle = s % 3 === 2 ? BARK[1] : BARK[0]; tc.fillRect(Math.round(x0 + (x1 - x0) * s / 6), Math.round(y0 + (y1 - y0) * s / 6), 1, 1); }   // twigs under the foliage
    litBlob(cc, cut ? [[22, 27, 11, 4], [22, 25, 8, 3]] : BUSH_SHAPES[v], 1, pal, cut ? { noise: 0.25 } : { noise: 0.6, clumps: 0.05 });          // (a bush the hedge cutter cut down: a low, flat-topped stub)
    if (ripe) BERRY_SPOTS.forEach(([bx, by], i) => {
      if ((i + v) % 4 === 3) return;                                                               // a little variation between bushes
      cc.fillStyle = shade(berry, 0.45); cc.fillRect(bx - 1, by - 1, 4, 4);                         // a dark rim, so every colour shows among the leaves
      cc.fillStyle = berry; cc.fillRect(bx, by, 2, 2); cc.fillStyle = shade(berry, 0.78); cc.fillRect(bx + 1, by + 1, 1, 1); cc.fillStyle = light(berry, 0.55); cc.fillRect(bx, by, 1, 1);
    });
    outline(tc, '#1e140c', BW, BH); outline(cc, '#14261a', BW, BH);
    const art = { trunk: T, crown: C, w: BW, h: BH };
    cache.set(key, art);
    return art;
  }
  /** A berry bush at (sx, sy); the foliage sways by shakeX (wind, picking, brushing past). */
  function drawBush(ctx, sx, sy, variant, ripe, berry, shakeX, tint, cut) {
    const art = bushArt(variant, tint, berry, ripe, cut), u = PX, left = sx - BAX * u, top = sy - BGROUND * u;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(sx + 3, sy + 2, 19, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.trunk, left, top, art.w * u, art.h * u);
    ctx.drawImage(art.crown, left + Math.round(shakeX / u) * u, top, art.w * u, art.h * u);
    ctx.restore();
  }

  /* ---- mushrooms: a little cluster of caps on short stems, in the item's colour (flora: the Mushroom Kingdom). Picked, only the stems are left. ---- */
  function mushroomArt(variant, color, ripe) {
    const key = `m|${variant % 4}|${color}|${ripe ? 1 : 0}`;
    if (cache.has(key)) return cache.get(key);
    const W = 30, H = 22, c = canvas(W, H), g = c.getContext('2d'), v = variant % 4;
    const caps = [[[9, 15, 5], [20, 13, 6], [15, 18, 3]], [[12, 14, 6], [22, 17, 4]], [[7, 17, 4], [15, 12, 6], [23, 16, 4]], [[16, 13, 7], [8, 18, 3], [24, 19, 3]]][v];
    for (const [x, y, r] of caps) {
      g.fillStyle = '#e9e0c6'; g.fillRect(x - 1, y, 2, 20 - y);                                                      // the stem
      g.fillStyle = shade('#e9e0c6', 0.7); g.fillRect(x, y, 1, 20 - y);
      if (!ripe) continue;
      for (let yy = -r; yy <= 1; yy++) for (let xx = -r; xx <= r; xx++) {                                              // the cap: a dome, lit on the left
        if (xx * xx / (r * r) + yy * yy / ((r * 0.7) * (r * 0.7)) > 1) continue;
        g.fillStyle = xx + yy < -r * 0.7 ? light(color, 0.35) : xx > r * 0.4 ? shade(color, 0.7) : color; g.fillRect(x + xx, y + yy - 1, 1, 1);
        if ((xx * 7 + yy * 3 + v) % 5 === 0 && yy < 0) { g.fillStyle = light(color, 0.7); g.fillRect(x + xx, y + yy - 1, 1, 1); }     // spots
      }
    }
    outline(g, '#1e140c', W, H);
    cache.set(key, c);
    return c;
  }
  function drawMushroom(ctx, sx, sy, variant, color, ripe, shakeX) {
    const c = mushroomArt(variant, color, ripe), u = PX * 1.7;                                                   // (a little larger than a pixel of the trees: they are small things)
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(sx + 1, sy + 1, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(c, sx - 15 * u + Math.round((shakeX || 0) / u) * u, sy - 20 * u, c.width * u, c.height * u); ctx.restore();
  }

  /* ---- hedges: a berry bush cut down and planted, TRIMMED: a neat block, a round ball or tiers, in the same dithered leaves (no berries). ---- */
  const HW = 48, HH = 50, HGROUND = 45, HAX = 24;
  function hedgeArt(variant, style, tint) {
    const key = `h|${style}|${variant % 4}|${tint || ''}`;
    if (cache.has(key)) return cache.get(key);
    const pal = LEAF.map(c => tinted(c, tint)), T = canvas(HW, HH), tc = T.getContext('2d'), C = canvas(HW, HH), cc = C.getContext('2d');
    const stub = (x0, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x < x0 + 3; x++) { tc.fillStyle = x === x0 ? BARK[3] : x === x0 + 2 ? BARK[0] : BARK[1]; tc.fillRect(x, y, 1, 1); } };
    if (style === 0) {                                                                              // a neat block: top and two faces, clipped square
      const top = 14, hgt = 18, hw = 17, hh = 8.5, cy = top + hh, put = (x, y, i) => { const j = Math.max(0, Math.min(pal.length - 1, i)); cc.fillStyle = pal[j]; cc.fillRect(x, y, 1, 1); };
      for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
        const dx = x + 0.5 - HAX, dy = y + 0.5 - cy, inTop = Math.abs(dx) / hw + Math.abs(dy) / hh <= 1;
        const edge = cy + hh * (1 - Math.abs(dx) / hw);                                             // y of the diamond's lower edge at this column
        const inSide = Math.abs(dx) < hw && y + 0.5 > edge && y + 0.5 <= edge + hgt;
        if (!inTop && !inSide) continue;
        const dither = BAYER[(x & 1) + (y & 1) * 2], grain = (hash(Math.floor(x / 3), Math.floor(y / 2) + variant) - 0.5) * 1.1;
        if (inTop) put(x, y, Math.floor((0.62 - dy / hh * 0.2 - dx / hw * 0.1) * 5 + dither * 0.9 + grain * 0.8));
        else put(x, y, Math.floor((dx < 0 ? 2.3 : 1.2) + dither * 0.9 + grain) - ((y + 0.5 - edge) / hgt > 0.8 ? 1 : 0));
      }
      for (let k = 0; k < 14; k++) { const x = 8 + Math.floor(hash(k, variant) * 32), y = 20 + Math.floor(hash(variant, k + 9) * 22); if (cc.getImageData(x, y, 1, 1).data[3]) { cc.fillStyle = pal[5]; cc.fillRect(x, y, 2, 1); cc.fillStyle = pal[0]; cc.fillRect(x, y + 1, 2, 1); } }   // clipped leaf ends
    } else if (style === 1) {                                                                       // a round ball on a short stem
      stub(23, 38, HGROUND);
      litBlob(cc, [[HAX, 24, 15, 15]], 1, pal, { noise: 0.35, clumps: 0.025 });
    } else {                                                                                        // tiers, widest at the bottom
      stub(23, 40, HGROUND);
      litBlob(cc, [[HAX, 34, 16, 8], [HAX, 25, 12, 7], [HAX, 17, 8, 6], [HAX, 11, 4, 4]], 1, pal, { noise: 0.3, clumps: 0.02 });
    }
    outline(tc, '#1e140c', HW, HH); outline(cc, '#14261a', HW, HH);
    const art = { trunk: T, crown: C, w: HW, h: HH };
    cache.set(key, art);
    return art;
  }
  /** A trimmed hedge at (sx, sy); style 0 block, 1 ball, 2 tiers. It barely sways (it is clipped and dense). */
  function drawHedge(ctx, sx, sy, variant, style, shakeX, tint) {
    const art = hedgeArt(variant, style, tint), u = PX, left = sx - HAX * u, top = sy - HGROUND * u;
    ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse(sx + 3, sy + 2, style === 0 ? 24 : 19, style === 0 ? 10 : 7.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.trunk, left, top, art.w * u, art.h * u);
    ctx.drawImage(art.crown, left + Math.round(shakeX / u) * u, top, art.w * u, art.h * u);
    ctx.restore();
  }

  return { drawTree, drawMushroom, drawBush, drawHedge, drawSapling, drawFalling, drawStump, tinted, treeArt, stumpArt };
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

/* ---- WOOL: a fluffy tuft on the ground (and the wool icon), and SHEARS (their icon) ---- */
const PixelWool = (() => {
  const { outline } = PixelCharacter.util;
  const PX = 1.25, WOOL = ['#cfc8b6', '#e6e1d3', '#f4f1e8', '#ffffff'];
  let ground = null;
  function paint(g, ox, oy) {
    const px = (x, y, c) => { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); };
    for (const [cx, cy, r] of [[5, 6, 3.6], [10, 5, 4], [14, 6.5, 3.4], [8, 3, 3], [12, 2.5, 2.6]]) for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy); if (d > r) continue;
      const v = (cy - y) / r * 0.6 + (cx - x) / r * 0.25 + 0.45;                   // lit from the upper left, puffy
      px(x, y, WOOL[Math.max(0, Math.min(3, Math.floor(v * 3.2 + ((x + y) & 1) * 0.3)))]);
    }
    for (const [x, y] of [[6, 7], [11, 6], [9, 4], [13, 7]]) px(x, y, WOOL[0]);       // curls
  }
  function art() { if (ground) return ground; const c = document.createElement('canvas'); c.width = 20; c.height = 12; const g = c.getContext('2d'); paint(g, 1, 1); outline(g, '#5a5244', 20, 12); return (ground = c); }
  function drawGround(ctx, sx, sy, seed, lift = 0) {
    const c = art(), u = PX, flip = seed % 2 ? -1 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, 10, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(sx, sy - 11 * u - lift); ctx.scale(flip, 1); ctx.drawImage(c, -10 * u, 0, 20 * u, 12 * u); ctx.restore();
  }
  function icon(g) { const c = art(); g.save(); g.imageSmoothingEnabled = false; g.drawImage(c, 4, 10, 40, 24); g.restore(); }
  /** The shears' icon: two steel blades crossed at a rivet over wooden loop handles, in pixels. */
  function shearsIcon(g) {
    const c = document.createElement('canvas'); c.width = 24; c.height = 24; const s = c.getContext('2d'), px = (x, y, col) => { s.fillStyle = col; s.fillRect(x, y, 1, 1); };
    for (let i = 0; i < 11; i++) { px(12 + i * 0.75 | 0, 11 - i, '#e4e8ee'); px(13 + i * 0.75 | 0, 11 - i, '#9aa2ad'); px(10 - i * 0.2 | 0, 11 - i, '#e4e8ee'); px(11 - i * 0.2 | 0, 11 - i, '#9aa2ad'); }   // blades
    for (const [cx, cy] of [[7, 17], [15, 18]]) for (let a = 0; a < 16; a++) { const x = Math.round(cx + Math.cos(a / 16 * Math.PI * 2) * 3), y = Math.round(cy + Math.sin(a / 16 * Math.PI * 2) * 2.6); px(x, y, a < 8 ? '#6e4e32' : '#a07a4a'); }   // loop handles
    for (let y = 12; y < 16; y++) { px(10, y, '#8c6844'); px(13, y, '#8c6844'); }
    px(11, 11, '#4a4148'); px(12, 11, '#4a4148');                                        // the rivet
    outline(s, '#1e1a18', 24, 24);
    g.save(); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, 48, 48); g.restore();
  }
  return { drawGround, icon, shearsIcon };
})();

/** Ground sprites for items that have one (everything else lies as its icon). */
const PixelGround = { log: PixelLogs.drawGround, wool: PixelWool.drawGround };

/* ---- DYES (a little stoppered bottle of colour) and LINEN (a folded bolt of cloth): pixel icons ---- */
const PixelCraftIcons = (() => {
  const { outline, shade, light } = PixelCharacter.util;
  const grid = (paint) => { const c = document.createElement('canvas'); c.width = 24; c.height = 24; const s = c.getContext('2d'); paint((x, y, col) => { s.fillStyle = col; s.fillRect(x, y, 1, 1); }); outline(s, '#1e1a18', 24, 24); return c; };
  const put = (g, c) => { g.save(); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, 48, 48); g.restore(); };
  function dye(g, color) {
    put(g, grid(px => {
      for (let y = 9; y <= 20; y++) for (let x = 6; x <= 17; x++) {                                // the round body of the bottle
        const d = Math.hypot(x - 11.5, y - 14.5); if (d > 5.8) continue;
        const glass = d > 4.6, liquid = y >= 11;
        px(x, y, glass ? '#cfe6ee' : liquid ? (x < 10 && y < 15 ? light(color, 0.3) : x > 13 || y > 18 ? shade(color, 0.72) : color) : '#e8f4f8');
      }
      for (let y = 5; y <= 8; y++) for (let x = 10; x <= 13; x++) px(x, y, x === 10 ? '#e8f4f8' : '#cfe6ee');   // the neck
      for (let x = 9; x <= 14; x++) { px(x, 3, '#8a5f33'); px(x, 4, '#a8763f'); }                   // the cork
      px(9, 12, '#ffffff'); px(8, 13, '#ffffff');                                                     // a gleam
    }));
  }
  function linen(g) {
    put(g, grid(px => {
      for (let k = 0; k < 3; k++) for (let y = 0; y < 4; y++) for (let x = 3; x <= 20; x++) {      // three folds stacked
        const yy = 7 + k * 4 + y, edge = y === 3, top = y === 0;
        px(x - k, yy, edge ? '#bfb59a' : top ? '#fffaf0' : (x + yy) % 4 === 0 ? '#e2d9c2' : '#efe8d6');
      }
      for (let y = 7; y < 19; y++) { px(21, y, '#cfc5a8'); }
      px(12, 9, '#c9a06a'); px(13, 9, '#c9a06a'); px(12, 13, '#c9a06a');                           // a twine tie
    }));
  }
  /* ---- farming: the hoe, the watering can, a seed packet, and each crop's produce ---- */
  function hoe(g) {
    put(g, grid(px => {
      for (let i = 0; i < 17; i++) { px(4 + i, 20 - i, '#8a5f33'); px(5 + i, 20 - i, '#b07a46'); }       // the long handle
      for (let y = 3; y <= 9; y++) for (let x = 15; x <= 21; x++) if (y - 3 <= (x - 15) * 0.6 + 2 && x - y > 9) px(x, y, '#9aa2ad');   // the blade
      for (let x = 17; x <= 21; x++) px(x, 3, '#e4e8ee'); for (let y = 4; y <= 9; y++) px(21, y, '#6b727c');
    }));
  }
  function wateringCan(g) {
    put(g, grid(px => {
      const tin = '#6f9fc8', lite = '#a9cdea', dark = '#41698f';
      for (let y = 10; y <= 20; y++) for (let x = 5; x <= 15; x++) px(x, y, x === 5 ? lite : x >= 14 || y === 20 ? dark : (x === 7 && y < 18) ? lite : tin);   // the body
      for (let x = 5; x <= 15; x++) px(x, 10, lite);
      for (let i = 0; i < 7; i++) { px(15 + i, 17 - i, tin); px(15 + i, 18 - i, dark); }                // the spout
      for (let y = 9; y <= 13; y++) { px(21, y, '#c8dcea'); px(22, y, dark); }                             // the rose
      for (let a = 0; a < 12; a++) px(Math.round(10 + Math.cos(Math.PI + a / 11 * Math.PI) * 5), Math.round(10 + Math.sin(Math.PI + a / 11 * Math.PI) * 5), dark);   // the handle
      px(23, 14, '#9fd0f2'); px(22, 16, '#9fd0f2'); px(23, 18, '#9fd0f2');                                   // drips
    }));
  }
  function seeds(g, color) {
    put(g, grid(px => {
      for (let y = 4; y <= 21; y++) for (let x = 5; x <= 18; x++) px(x, y, y <= 6 ? '#bfa06a' : x === 5 ? '#f3e6c4' : x === 18 || y === 21 ? '#c4ad7c' : '#e8d6a6');   // a paper packet
      for (let x = 5; x <= 18; x += 2) px(x, 4, '#8a6f45');                                                   // its folded, crimped top
      for (let y = 9; y <= 16; y++) for (let x = 8; x <= 15; x++) { const d = Math.hypot(x - 11.5, y - 12.5); if (d <= 3.6) px(x, y, d > 2.6 ? shade(color, 0.7) : x < 11 && y < 12 ? light(color, 0.3) : color); }   // the crop on the front
      px(11, 8, '#5fae4e'); px(12, 7, '#5fae4e'); px(12, 8, '#3f7a2e');
      for (const [x, y] of [[8, 18], [11, 19], [14, 18], [16, 19]]) px(x, y, '#7a5a33');                    // seeds
    }));
  }
  function produce(g, crop) {
    const C = crop.colors, col = C.crop, lite = light(col, 0.3), dark = shade(col, 0.68), leaf = C.leaf, ldark = shade(leaf, 0.7);
    const blob = (px, cx, cy, rx, ry) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (d <= 1) px(x, y, d > 0.7 && (x > cx || y > cy) ? dark : x < cx - rx * 0.2 && y < cy - ry * 0.2 ? lite : col); } };
    put(g, grid(px => {
      if (crop.look === 'root') {                                                                         // a root with its leafy top
        blob(px, 12, 14, 6, 5.5); for (let y = 19; y <= 22; y++) px(12 + (y - 19) * 0.3 | 0, y, dark);
        if (C.top) for (let x = 8; x <= 16; x++) px(x, 10 + Math.abs(x - 12) * 0.3 | 0, C.top);
        for (const [dx, h] of [[-3, 6], [0, 8], [3, 6]]) for (let k = 0; k < h; k++) px(12 + dx + (dx * k / 8 | 0), 8 - k, k % 2 ? ldark : leaf);
      } else if (crop.look === 'bush') {                                                                   // berries / fruit in a little cluster
        for (const [cx, cy, r] of [[8, 14, 4], [15, 13, 4.5], [11, 18, 4]]) blob(px, cx, cy, r, r);
        for (const [x, y] of [[8, 9], [15, 8], [11, 13], [12, 13]]) { px(x, y, leaf); px(x + 1, y, ldark); }
        if (crop.id === 'strawberry') for (const [x, y] of [[7, 14], [9, 16], [14, 12], [16, 15], [11, 19]]) px(x, y, '#ffe9a8');
      } else if (crop.look === 'stalk') {
        if (crop.tall) { for (let y = 5; y <= 19; y++) for (let x = 9; x <= 14; x++) { const w = Math.abs(x - 11.5); if (w < 3 - Math.abs(y - 12) / 9) px(x, y, (x + y) % 2 ? col : x < 11 ? lite : dark); } for (let y = 12; y <= 21; y++) { px(8 - (21 - y) * 0.2 | 0, y, leaf); px(15 + (21 - y) * 0.2 | 0, y, ldark); } }   // a cob in its husk
        else for (const dx of [-4, -1, 2, 5]) { for (let y = 10; y <= 21; y++) px(11 + dx + (y > 15 ? 0 : 0), y, y > 15 ? '#c9a35a' : '#a8843f'); for (let k = 0; k < 6; k++) px(11 + dx + (k % 2), 3 + k, k % 2 ? dark : col); }   // a sheaf of stalks
        if (!crop.tall) for (let x = 6; x <= 17; x++) px(x, 15, '#7a5a33');                                     // tied
      } else {                                                                                            // a big round fruit, ribbed
        blob(px, 12, 14, 8.5, 6.5); for (const dx of [-4, 0, 4]) for (let y = 9; y <= 19; y++) if ((y + dx) % 1 === 0 && Math.abs(dx) * 1.2 + Math.abs(y - 14) < 8) px(12 + dx, y, dark);
        for (let y = 5; y <= 8; y++) px(12, y, '#5a7a2a'); px(13, 5, '#5a7a2a'); px(14, 6, leaf);
      }
    }));
  }
  return { dye, linen, hoe, wateringCan, seeds, produce };
})();

/* ---- CROPS: a growing crop in a farm plot, by its look (root, bush, stalk, vine) and stage (0 sprout, 1 young, 2 grown / in flower, 3 ripe,
 *      'dead' withered). Painted once per crop and stage, outlined, drawn with hard edges standing on its plot. ---- */
const FIELD_CROP_SCALE = 0.7;                                                                   // (nine plots to a tile: a crop is smaller than the plot it grew in before)
const PixelCrops = (() => {
  const { outline, shade, light } = PixelCharacter.util;
  const PX = 1.25, cache = new PackedCache(1000, 'crop');
  function art(crop, stage) {
    const key = crop.id + '|' + stage;
    if (cache.has(key)) return cache.get(key);
    const tall = crop.tall && stage !== 0, W = 22, H = tall ? 34 : 24, G = H - 2, X = 11;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const px = (x, y, col) => { if (x >= 0 && y >= 0 && x < W && y < H) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); } };
    const line = (x0, y0, x1, y1, col) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1; for (let s = 0; s <= n; s++) px(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n, col); };
    const blob = (cx, cy, rx, ry, col, lit) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (d <= 1) px(x, y, lit && y < cy - ry * 0.3 && x < cx ? light(col, 0.25) : y > cy + ry * 0.4 ? shade(col, 0.78) : col); } };
    const C = crop.colors, leaf = C.leaf, dark = shade(leaf, 0.72), lite = light(leaf, 0.25);
    if (stage === 'dead') {                                                                    // withered: drooping brown stems
      const brown = '#7a5a33'; line(X, G, X - 4, G - 6, brown); line(X, G, X + 3, G - 7, brown); line(X + 3, G - 7, X + 6, G - 5, '#5a4022'); line(X - 4, G - 6, X - 6, G - 3, '#5a4022'); line(X, G, X, G - 4, '#8a6a40');
    } else if (stage === 0) {                                                                  // a sprout: two little leaves
      line(X, G, X, G - 3, leaf); px(X - 1, G - 4, lite); px(X - 2, G - 4, leaf); px(X + 1, G - 4, leaf); px(X + 2, G - 5, lite);
    } else if (crop.look === 'root') {
      const n = stage === 1 ? 3 : 5, hgt = stage === 1 ? 6 : 10;
      for (let i = 0; i < n; i++) { const a = -0.9 + i * 1.8 / (n - 1), tx = X + Math.sin(a) * hgt * 0.6, ty = G - hgt * Math.cos(a * 0.6); line(X, G - 1, tx, ty, i % 2 ? leaf : dark); px(tx, ty, lite); }
      if (stage === 2 && C.flower) { px(X - 3, G - hgt, C.flower); px(X + 3, G - hgt + 1, C.flower); }
      if (stage === 3) { blob(X, G - 1, 3.5, 2.5, C.crop, true); if (C.top) { px(X - 1, G - 3, C.top); px(X, G - 3, C.top); px(X + 1, G - 3, C.top); } }   // the root peeking out of the soil
    } else if (crop.look === 'bush') {
      const r = stage === 1 ? 4 : 6.5;
      blob(X, G - r, r, r * 0.85, leaf, true);
      for (let i = 0; i < 6; i++) px(X - r + 1 + (i * 5) % (r * 2 - 1), G - r * 1.6 + (i * 3) % (r * 1.4), dark);
      if (stage === 2 && C.flower) for (const [dx, dy] of [[-3, -7], [2, -9], [4, -4], [-1, -4]]) px(X + dx, G + dy, C.flower);
      if (stage === 3) for (const [dx, dy] of [[-4, -6], [1, -9], [4, -5], [-1, -3], [3, -10], [-3, -10]]) { px(X + dx, G + dy, C.crop); px(X + dx + 1, G + dy, C.crop); px(X + dx, G + dy + 1, shade(C.crop, 0.75)); px(X + dx, G + dy - 1, '#ffffff'); }
    } else if (crop.look === 'stalk') {
      const hgt = stage === 1 ? 9 : crop.tall ? 28 : 15;
      for (const dx of [-3, 0, 3]) {
        line(X + dx, G, X + dx + (dx > 0 ? 1 : dx < 0 ? -1 : 0), G - hgt + Math.abs(dx), dx ? dark : leaf);
        for (let y = G - 3; y > G - hgt + 4; y -= 5) { px(X + dx + 1, y, lite); px(X + dx + 2, y - 1, leaf); px(X + dx - 1, y - 2, leaf); }   // leaves along it
      }
      const top = G - hgt;
      if (stage === 2 && C.flower) for (const dx of [-3, 0, 3]) { px(X + dx, top + Math.abs(dx), C.flower); px(X + dx + 1, top + Math.abs(dx), C.flower); }
      if (stage === 3) {
        if (crop.tall) { for (let k = 0; k < 6; k++) { px(X + 2, G - 14 - k, C.crop); px(X + 3, G - 14 - k, shade(C.crop, 0.85)); } px(X + 4, G - 15, leaf); px(X, top, '#d9c98a'); px(X + 1, top - 1, '#d9c98a'); }   // a cob, and the tassel
        else for (const dx of [-3, 0, 3]) for (let k = 0; k < 4; k++) { px(X + dx + (dx > 0 ? 1 : dx < 0 ? -1 : 0), top + Math.abs(dx) + k, k % 2 ? shade(C.crop, 0.85) : C.crop); }   // golden heads
      }
    } else {                                                                                   // vine: leaves along the ground and a big fruit
      for (const [dx, dy] of [[-6, -2], [-2, -4], [3, -3], [7, -2]].slice(0, stage === 1 ? 2 : 4)) blob(X + dx, G + dy, 2.6, 2, leaf, true);
      line(X - 8, G - 1, X + 8, G - 1, dark);
      if (stage === 2 && C.flower) { px(X, G - 6, C.flower); px(X + 1, G - 6, C.flower); px(X, G - 5, C.flower); }
      if (stage === 3) { blob(X + 1, G - 4, 5.5, 4.5, C.crop, true); for (const dx of [-2, 1, 4]) line(X + dx, G - 8, X + dx, G - 1, shade(C.crop, 0.8)); px(X + 1, G - 9, '#5a7a2a'); px(X + 1, G - 10, '#5a7a2a'); }   // ribs and a stem
    }
    outline(g, '#1a2412', W, H);
    const out = { c, W, H, G, X };
    cache.set(key, out); return out;
  }
  /** A crop standing on its plot at (sx, sy) (the plot's centre on screen). */
  function draw(ctx, sx, sy, plot, k = 1) {
    const crop = Crops.get(plot.c); if (!crop) return;
    const a = art(crop, Farming.stage(plot)), u = PX * k;
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(a.c, sx - a.X * u, sy - (a.G + 1) * u + 2, a.W * u, a.H * u); ctx.restore();
  }
  return { draw, art };
})();
