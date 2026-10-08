'use strict';
/* CLIENT - the grass (grass.js decides how tall it is). Every grass tile holds one clump of short, medium or tall blades, set a little off the
 * tile's centre and leaning its own way, in its biome's (and season's) green. The clumps sway in the wind and part around whoever walks
 * through them: they bend away from people and animals passing close and lie flat under their feet.
 *
 * Each clump is a tiny pixel picture, made once per height, look, lean and bend and cached. A clump near someone is drawn in the depth-sorted
 * pass (so the grass in front of their feet covers them and the grass behind does not); every other clump is drawn straight after the ground. */
const GrassRenderer = (() => {
  const { shade, light, mix } = PixelCharacter.util;
  const PX = 1.25, W = 30, H = 26, BASE = 22, CX = 15, BEND = 4, NEAR = 1.4;
  const BLADES = [0, 5, 8, 12], HEIGHT = [[0, 0], [3, 6], [6, 11], [11, 19]], SPREAD = [0, 10, 16, 22];
  const cache = new LruCache(8000);
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };

  /** The grass colours at a tile: [shadow, body, lit, tip], from its biome's ground and, for the meadow's own grass, the season.
   *  Worked out once per look and season (it used to be recomputed for every grass tile on screen, every frame). */
  const palettes = new Map();
  function paletteOf(look, season) {
    const key = look.id + '|' + season;
    let p = palettes.get(key);
    if (!p) { p = makePalette(look, season); palettes.set(key, p); }
    return p;
  }
  function makePalette(look, season) {
    let base = look.pal[1];
    if (look.seasonal) base = season === 'autumn' ? mix(base, '#c9a046', 0.6) : season === 'winter' ? mix(base, '#dfe7ea', 0.55) : season === 'summer' ? mix(base, '#3f7a2e', 0.2) : light(base, 0.05);
    const tip = look.seasonal && (season === 'summer' || season === 'autumn') ? '#d9c48a' : light(base, 0.32);
    return [shade(base, 0.5), shade(base, 0.78), light(base, 0.16), tip];
  }
  /** One clump's picture. */
  function clump(level, variant, mirror, bend, pal, palKey) {
    const key = level + '|' + variant + '|' + mirror + '|' + bend + '|' + palKey;
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), flat = Math.max(0, Math.abs(bend) - 2) * 0.22;     // bent hard, it lies lower
    for (let i = 0; i < BLADES[level]; i++) {                                         // a tuft: blades fanning out from its root, curving over
      const r = k => hash(variant, i, k), [lo, hi] = HEIGHT[level], side = mirror ? -1 : 1;
      const off = (i / Math.max(1, BLADES[level] - 1) - 0.5) * SPREAD[level] * (0.75 + r(1) * 0.5), bx = CX + side * off * 0.45, by = BASE + Math.round((r(2) - 0.5) * 2);
      const h = Math.round((lo + r(3) * (hi - lo)) * (1 - Math.abs(off) / (SPREAD[level] + 1) * 0.55)), fan = side * off / (SPREAD[level] / 2 + 0.01) * (1.6 + r(4) * 1.4);
      for (let t = 0; t <= h; t++) {
        const f = t / Math.max(1, h), x = Math.round(bx + fan * f * f * (1 + h / 10) + bend * f * f * (1.2 + h / 9)), y = Math.round(by - t * (1 - flat) + (Math.abs(fan) > 2.4 ? f * f * 2 : 0));
        g.fillStyle = t === h ? pal[3] : t < 2 ? pal[0] : f < 0.6 ? pal[1] : pal[2];
        g.fillRect(x, y, 1, 1);
      }
    }
    c.atlasKey = 'grass|' + key;                                                      // (the Pixi backend packs it into a texture page under this key)
    cache.set(key, c); return c;
  }

  /** Draw the grass on screen. Returns the clumps near someone, for the depth-sorted pass: [{ depth, draw() }].
   *  movers: [{ x, y }] everyone who can push the grass aside. onFar(art, x, y, w, h), if given, receives the clumps that are not near anyone (the Pixi
   *  backend draws them as sprites) instead of them being drawn here. */
  function draw(ctx, map, bounds, range, tick, now, movers, onFar) {
    const near = [];
    if (!map || map.kind !== 'world' || typeof Grass === 'undefined') return near;
    const t = now / 1000, season = Seasons.at(tick).season.id, { minX, maxX, minY, maxY } = bounds, farm = map.farm || {}, floors = map.floors || {};
    const close = movers.filter(m => m.x > range.tx0 - 2 && m.x < range.tx1 + 2 && m.y > range.ty0 - 2 && m.y < range.ty1 + 2);
    const sky = Weather.view, blow = sky ? sky.wind : 0, lean = sky && blow > 0.15 ? Math.sign(Math.cos(sky.dir) - Math.sin(sky.dir)) * blow * 1.8 : 0;
    const smooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    for (let ty = range.ty0; ty <= range.ty1; ty++) for (let tx = range.tx0; tx <= range.tx1; tx++) {
      const cx = (tx - ty) * TILE_HALF_W, cy = (tx + ty + 1) * TILE_HALF_H;
      if (cx < minX - TILE_HALF_W || cx > maxX + TILE_HALF_W || cy < minY || cy > maxY + 40) continue;
      const level = Grass.levelAt(map, tx, ty, tick);
      if (!level) continue;
      if (floors[tileKey(tx, ty)] || map.built[tileKey(tx, ty)] || farm['g' + tx + ',' + ty] || farm['h' + tx + ',' + ty] || farm[tx * 2 + ',' + ty * 2] || farm[(tx * 2 + 1) + ',' + (ty * 2 + 1)]) continue;   // (paved, built on, tilled or planted)
      const h = k => hash(tx, ty, k), wx = tx + 0.5 + (h(1) - 0.5) * 0.46, wy = ty + 0.5 + (h(2) - 0.5) * 0.46;
      let push = 0, under = false, isNear = false;
      for (const m of close) {
        const d = Math.hypot(wx - m.x, wy - m.y);
        if (d > NEAR) continue;
        isNear = true;
        if (d < 0.32) under = true;
        if (d < 0.95) push += Math.sign(((wx - wy) - (m.x - m.y)) || 1) * (1 - d / 0.95) * 6;                // away from them, on screen
      }
      const wind = level > 1 ? Math.sin(t * (1.6 + blow * 1.4) + tx * 0.45 + ty * 0.3) * (level === 3 ? 1.4 : 0.8) * (1 + blow * 1.6) + lean * (level === 3 ? 1.6 : 1) : 0;   // (a strong wind sways it faster and leans it downwind: weather.js)
      const bend = Math.max(-BEND, Math.min(BEND, Math.round(Math.round((h(5) - 0.5) * 2) + wind + push + (under ? Math.sign(push || 1) * 3 : 0))));
      const look = TerrainRenderer.lookOf(map, tx, ty), pal = paletteOf(look, season), art = clump(under ? Math.max(1, level - 1) : level, Math.floor(h(3) * 6), h(4) < 0.5, bend, pal, look.id + season);
      const sx = (wx - wy) * TILE_HALF_W, sy = (wx + wy) * TILE_HALF_H;
      const paint = () => ctx.drawImage(art, sx - CX * PX, sy - BASE * PX, W * PX, H * PX);
      if (isNear) near.push({ depth: wx + wy, draw: paint, art, x: sx - CX * PX, y: sy - BASE * PX, w: W * PX, h: H * PX }); else if (onFar) onFar(art, sx - CX * PX, sy - BASE * PX, W * PX, H * PX); else paint();
    }
    ctx.imageSmoothingEnabled = smooth;
    return near;
  }
  return { draw };
})();
