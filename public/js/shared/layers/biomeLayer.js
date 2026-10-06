'use strict';
/* LAYER - biomes. Biomes are spread across the WHOLE map, not tied to distance: the world is cut into big jittered cells (like a cracked
 * mud flat), every tile belongs to its nearest cell centre, and each cell picks a biome by RARITY (common biomes fill most cells; crystal,
 * rainbow and candy are rare; magic is ultra rare). Slow noise bends the borders so regions are irregular. The village is always meadow. */
class BiomeLayer {
  constructor(seed) {
    this.id = 'biomes'; this.seed = seed | 0; this.warpX = new PerlinNoise(seed + 5001); this.warpY = new PerlinNoise(seed + 5002);
    this.cell = CONFIG.world.biomeCell; this.pool = null; this.total = 0; this.cache = new Map();
  }
  _pool() {
    if (!this.pool) { this.pool = Biomes.where(b => !b.terrainOnly).map(b => ({ id: b.id, w: BIOME_RARITY[b.rarity] })); this.total = this.pool.reduce((n, b) => n + b.w, 0); }
    return this.pool;
  }
  /** The biome a cell holds (the same for everyone, forever). */
  cellBiome(cx, cy) {
    const key = cx * 100003 + cy, hit = this.cache.get(key); if (hit) return hit;
    const pool = this._pool(); let roll = hash3(this.seed, cx, cy, 71) * this.total, chosen = pool[0].id;
    for (const b of pool) { if ((roll -= b.w) < 0) { chosen = b.id; break; } }
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, chosen); return chosen;
  }
  /** The biome id of a land tile. */
  at(tx, ty) {
    const o = CONFIG.sim.levels.origin;
    if (Math.hypot(tx - o.x, ty - o.y) < CONFIG.world.villageBiomeRadius) return 'normal';
    const S = this.cell, wx = tx + 55 * this.warpX.fractal(tx / 170, ty / 170, 2), wy = ty + 55 * this.warpY.fractal(tx / 170, ty / 170, 2);
    const cx0 = Math.floor(wx / S), cy0 = Math.floor(wy / S);
    let best = Infinity, bx = cx0, by = cy0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = cx0 + dx, cy = cy0 + dy;
      const px = (cx + 0.15 + 0.7 * hash3(this.seed, cx, cy, 72)) * S, py = (cy + 0.15 + 0.7 * hash3(this.seed, cx, cy, 73)) * S;
      const d = (wx - px) * (wx - px) + (wy - py) * (wy - py);
      if (d < best) { best = d; bx = cx; by = cy; }
    }
    return this.cellBiome(bx, by);
  }
}
