'use strict';
/* CLIENT - the ground in HALF-TILE cells, in retro pixel art. Every tile is drawn as 2 x 2 small diamonds (the farm's plots: farming.js), each
 * a little textured picture (grass with tufts and flowers, dirt with pebbles, sand with ripples, cobbles, tilled soil...). The pictures are
 * made once per kind, palette, season and variant and cached; terrainRenderer.js picks one per cell by a hash, so the land never repeats
 * in an obvious way. The season colours the grass: fresh with flowers in spring, deep in summer, golden with fallen leaves in autumn, snowy in winter. */
const PixelTerrain = (() => {
  const { css, shade, light, mix } = PixelCharacter.util;
  const AW = 40, AH = 20, BLEED = 1, VARIANTS = 6;                 // a cell's art size (it is drawn TILE_HALF_W x TILE_HALF_H), and the overlap that hides seams
  const cache = new PackedCache(4000, 'terrain');
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
  const BAYER = [0, 0.5, 0.75, 0.25];

  /** Half-width of the diamond on art row y (with the bleed): a crisp 2:1 pixel diamond. */
  const halfAt = y => { const r = y - BLEED; const core = r < AH / 2 ? (r + 1) * 2 : (AH - r) * 2; return core + BLEED * 2; };

  /** Paints one cell: `pick(x, y, n)` gives each pixel's colour (n: a smooth noise 0..1); `features(px)` adds tufts, pebbles... */
  function make(pick, features) {
    const W = AW + BLEED * 2, H = AH + BLEED * 2, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), inside = (x, y) => y >= 0 && y < H && Math.abs(x + 0.5 - W / 2) <= halfAt(y);
    const px = (x, y, col) => { if (inside(x, y)) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) px(x, y, pick(x, y));
    if (features) features(px, inside);
    return c;
  }
  /** A smooth-ish noise over the cell (blocks of 4 x 2 art pixels, blended with dither). */
  const blotch = (x, y, v) => (hash(x >> 2, y >> 1, v) * 0.6 + hash(x >> 3, y >> 2, v + 7) * 0.4);
  const tone = (pal, x, y, v, bias = 0) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor((blotch(x, y, v) + bias) * pal.length + BAYER[(x & 1) + (y & 1) * 2] * 0.6 - 0.3)))];

  /* ---- the season's grass ---- */
  function grassPalette(base, season) {
    const p = base.slice();
    if (season === 'summer') return p.map(c => mix(c, '#3f7a2e', 0.18));
    if (season === 'autumn') return p.map((c, i) => mix(c, ['#b0863a', '#c99a46', '#a07434'][i % 3], 0.68));
    if (season === 'winter') return p.map(c => mix(c, '#dfe7ea', 0.6));
    if (season === 'spring') return p.map(c => light(c, 0.06));                              // spring: a fresh green
    return p;                                                                               // (a biome with its own ground: as it is)
  }

  const KINDS = {
    grass(pal, v, season) {
      const P = grassPalette(pal, season), dark = shade(P[0], 0.72), bright = light(P[2], 0.25);
      return make((x, y) => tone(P, x, y, v), (px, inside) => {
        for (let i = 0; i < 7; i++) {                                                        // grass tufts: a little V of blades
          const x = 4 + Math.floor(hash(i, v, 3) * (AW - 6)), y = 3 + Math.floor(hash(v, i, 5) * (AH - 4));
          px(x, y, dark); px(x - 1, y - 1, dark); px(x + 1, y - 1, dark); px(x, y - 2, bright);
        }
        const spots = { spring: 4, summer: 1, autumn: 5, winter: 3 }[season] || 0;
        for (let i = 0; i < spots; i++) {
          const x = 3 + Math.floor(hash(i + 20, v, 9) * (AW - 6)), y = 3 + Math.floor(hash(v, i + 20, 11) * (AH - 5));
          if (season === 'spring') { const c = ['#ffffff', '#ffe066', '#ff9ec7', '#c9b6ff'][i % 4]; px(x, y, c); px(x, y + 1, dark); }          // flowers
          else if (season === 'summer') { px(x, y, '#ffe066'); px(x + 1, y, '#ffe066'); }
          else if (season === 'autumn') { const c = ['#d9532b', '#e59a2e', '#b8402a'][i % 3]; px(x, y, c); px(x + 1, y, c); px(x, y + 1, shade(c, 0.8)); }   // fallen leaves
          else { for (let dy = 0; dy < 2; dy++) for (let dx = -2; dx <= 2; dx++) px(x + dx, y + dy, dy ? '#e8eff3' : '#ffffff'); }                      // snow
        }
      });
    },
    dirt(pal, v) {
      const P = pal, dark = shade(P[0], 0.7), lite = light(P[2], 0.2);
      return make((x, y) => tone(P, x, y, v), px => {
        for (let i = 0; i < 6; i++) { const x = 3 + Math.floor(hash(i, v, 13) * (AW - 6)), y = 2 + Math.floor(hash(v, i, 17) * (AH - 4)); px(x, y, dark); px(x + 1, y, i % 2 ? lite : dark); if (i % 3 === 0) px(x, y - 1, lite); }   // pebbles and clods
      });
    },
    sand(pal, v) {
      const P = pal, dark = shade(P[0], 0.85), lite = light(P[2], 0.3);
      return make((x, y) => ((x + 2 * y + Math.floor(hash(y >> 2, 0, v) * 6)) % 9 === 0 ? lite : tone(P, x, y, v)), px => {     // wind ripples
        for (let i = 0; i < 8; i++) px(3 + Math.floor(hash(i, v, 19) * (AW - 6)), 2 + Math.floor(hash(v, i, 23) * (AH - 4)), dark);
      });
    },
    clay(pal, v) {
      const P = pal, dark = shade(P[0], 0.72), sheen = light(P[2], 0.32);
      return make((x, y) => tone(P, x, y, v), px => {
        for (let i = 0; i < 3; i++) { const x = 6 + Math.floor(hash(i, v, 29) * (AW - 14)), y = 4 + Math.floor(hash(v, i, 31) * (AH - 8)); for (let k = 0; k < 5; k++) px(x + k, y, sheen); }   // a wet sheen
        for (let i = 0; i < 5; i++) px(3 + Math.floor(hash(i, v, 37) * (AW - 6)), 2 + Math.floor(hash(v, i, 41) * (AH - 4)), dark);
      });
    },
    stone(pal, v) {                                                                          // cobbles: rounded stones in mortar
      const P = pal, mortar = shade(P[0], 0.66);
      return make((x, y) => {
        const u = (x / 2 + y), w = (x / 2 - y), bu = Math.floor((u + 40) / 6), bw = Math.floor((w + 40) / 6);
        const edge = ((u + 40) % 6 < 0.9) || ((w + 40) % 6 < 0.9);
        if (edge) return mortar;
        const k = hash(bu, bw, v), lit = ((u + 40) % 6) < 2.4 && ((w + 40) % 6) > 3.6;
        return lit ? light(P[Math.floor(k * 3)], 0.12) : P[Math.floor(k * 3)];
      });
    },
    cave(pal, v) {
      const P = pal;
      return make((x, y) => tone(P, x, y, v), px => { for (let i = 0; i < 4; i++) px(3 + Math.floor(hash(i, v, 43) * (AW - 6)), 2 + Math.floor(hash(v, i, 47) * (AH - 4)), i % 2 ? 'rgba(150,170,220,.6)' : '#101218'); });
    },
    water(pal, v) {                                                                          // deep water: slow swells of blue, a few glints (the ripples move: terrainRenderer)
      const P = pal, lite = light(P[2], 0.18), deep = shade(P[0], 0.86);
      return make((x, y) => { const b = blotch(x, y, v); return b < 0.08 && (x + y) % 2 ? deep : tone(P, x, y, v, -0.1); }, px => {
        for (let i = 0; i < 3; i++) { const x = 4 + Math.floor(hash(i, v, 61) * (AW - 10)), y = 3 + Math.floor(hash(v, i, 67) * (AH - 6)); for (let k = 0; k < 3; k++) px(x + k, y, lite); }
      });
    },
    shallow(pal, v) {                                                                        // wadeable water: the sandy bottom shows through, sunlight in nets
      const P = pal, net = light(P[1], 0.22), stone = shade(P[0], 0.8);
      return make((x, y) => ((x + 3 * y + Math.floor(hash(y >> 2, 3, v) * 8)) % 13 === 0 ? net : tone(P, x, y, v)), px => {
        for (let i = 0; i < 4; i++) px(3 + Math.floor(hash(i, v, 71) * (AW - 6)), 2 + Math.floor(hash(v, i, 73) * (AH - 4)), stone);   // pebbles on the bottom
      });
    },
    soil(pal, v, season, wet) {                                                              // tilled earth: ridged furrows, darker when watered
      const base = wet ? ['#4e3420', '#553823', '#47301d'] : ['#7a5233', '#83593a', '#704b2e'], ridge = wet ? '#6a4a30' : '#9c7048', furrow = wet ? '#2f1f12' : '#5a3b22';
      return make((x, y) => { const r = ((Math.floor(x / 2) + y) % 5 + 5) % 5; return r === 0 ? ridge : r === 3 ? furrow : tone(base, x, y, v); }, px => {
        if (wet) for (let i = 0; i < 3; i++) px(4 + Math.floor(hash(i, v, 53) * (AW - 8)), 3 + Math.floor(hash(v, i, 59) * (AH - 6)), 'rgba(170,210,240,.55)');   // a glint of water
      });
    }
  };

  /** A cell picture: kind, its 3-colour palette, a variant (any integer), the season id, wet (soil). */
  function cell(kind, pal, variant, season, wet) {
    const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS, key = `${kind}|${pal.join()}|${v}|${kind === 'grass' ? season : ''}|${wet ? 1 : 0}`;
    let c = cache.get(key);
    if (!c) { c = KINDS[kind](pal, v, season, wet); cache.set(key, c); }
    return c;
  }
  /** Draws a cell centred at (x, y) in world pixels. */
  function draw(ctx, c, x, y) {
    const w = TILE_HALF_W * (AW + BLEED * 2) / AW, h = TILE_HALF_H * (AH + BLEED * 2) / AH;
    ctx.drawImage(c, x - w / 2, y - h / 2, w, h);
  }
  return { cell, draw, hash };
})();
