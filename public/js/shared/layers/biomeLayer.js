'use strict';
/* LAYER - biomes. Biomes are spread across the WHOLE map, not tied to distance: the world is cut into big jittered cells (like a cracked
 * mud flat), every tile belongs to its nearest cell centre, and each cell picks a biome by RARITY (common biomes fill most cells; crystal,
 * rainbow and candy are rare; magic is ultra rare). Slow noise bends the borders so regions are irregular. The village is always meadow.
 * A biome may also keep away from the village: its `from` (in rings, from the ring layer) is the nearest it appears; a region that reaches
 * in past that line is another biome on the inner side, so the edge follows the ring's wobbly boundary.
 * Rarity and `from` can be changed on the Admin page (GameSettings.biomeSpawn): like trees, from the next time a world is started. */
class BiomeLayer {
  constructor(seed, rings) {
    this.id = 'biomes'; this.seed = seed | 0; this.warpX = new PerlinNoise(seed + 5001); this.warpY = new PerlinNoise(seed + 5002);
    this.cell = CONFIG.world.biomeCell; this.rings = rings || null; this.pool = null; this.settings = null; this.cache = new Map();
  }
  /** Every placeable biome with its weight and its `from` (the Admin page's values over the data's). Rebuilt if the settings were replaced. */
  _pool() {
    const settings = GameSettings.values.biomes;
    if (!this.pool || this.settings !== settings) {
      this.settings = settings; this.cache.clear();
      this.pool = Biomes.where(b => !b.terrainOnly).map(b => { const s = GameSettings.biomeSpawn(b); return { id: b.id, w: BIOME_RARITY[s.rarity] || 0, from: s.from }; });
    }
    return this.pool;
  }
  /** Where a cell's centre lies (its jittered middle). */
  centre(cx, cy) { const S = this.cell; return [(cx + 0.15 + 0.7 * hash3(this.seed, cx, cy, 72)) * S, (cy + 0.15 + 0.7 * hash3(this.seed, cx, cy, 73)) * S]; }
  /** Rings out from the village (2.5 = halfway through ring 2), from the ring layer's wobbly distance. */
  ringPos(x, y) { return this.rings ? Math.max(0, this.rings.effectiveRadius(x, y)) / this.rings.width : Infinity; }
  /** Pick by rarity among `open` with the roll `h`. */
  _pick(open, h) {
    let roll = h * open.reduce((n, b) => n + b.w, 0);
    for (const b of open) { if ((roll -= b.w) < 0) return b; }
    return open[0] || { id: 'normal', from: 0 };
  }
  /** The biome a cell holds (the same for everyone, forever): picked by rarity among the biomes allowed at its centre. */
  cellBiome(cx, cy) {
    const pool = this._pool(), key = cx * 100003 + cy, hit = this.cache.get(key); if (hit) return hit;
    const [x, y] = this.centre(cx, cy), pos = this.ringPos(x, y);
    const chosen = this._pick(pool.filter(b => b.w > 0 && b.from <= pos), hash3(this.seed, cx, cy, 71));
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, chosen); return chosen;
  }
  /** The cell a tile belongs to: [cx, cy] (the nearest cell centre, after the slow noise bent the borders). */
  _cellAt(tx, ty) {
    const S = this.cell, wx = tx + 55 * this.warpX.fractal(tx / 170, ty / 170, 2), wy = ty + 55 * this.warpY.fractal(tx / 170, ty / 170, 2);
    const cx0 = Math.floor(wx / S), cy0 = Math.floor(wy / S);
    let best = Infinity, bx = cx0, by = cy0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = cx0 + dx, cy = cy0 + dy;
      const [px, py] = this.centre(cx, cy);
      const d = (wx - px) * (wx - px) + (wy - py) * (wy - py);
      if (d < best) { best = d; bx = cx; by = cy; }
    }
    return [bx, by];
  }
  /** One id for the whole region a land tile is in (a cell's stretch of one biome): what a "per biome" limit counts within. The village's meadow is one region. */
  regionKey(tx, ty) {
    const o = CONFIG.sim.levels.origin;
    if (Math.hypot(tx - o.x, ty - o.y) < CONFIG.world.villageBiomeRadius) return 'village';
    const [bx, by] = this._cellAt(tx, ty);
    return bx + ':' + by + ':' + this.at(tx, ty);
  }
  /** The biome id of a land tile. */
  at(tx, ty) {
    const o = CONFIG.sim.levels.origin;
    if (Math.hypot(tx - o.x, ty - o.y) < CONFIG.world.villageBiomeRadius) return 'normal';
    const [bx, by] = this._cellAt(tx, ty);
    const chosen = this.cellBiome(bx, by);
    if (!chosen.from) return chosen.id;
    const pos = this.ringPos(tx, ty);                                       // a region reaching in past where its biome may start: that inner part
    if (pos >= chosen.from) return chosen.id;                               // is another biome (allowed there), so the line follows the ring
    return this._pick(this._pool().filter(b => b.w > 0 && b.from <= pos), hash3(this.seed, bx, by, 74)).id;
  }
}
