'use strict';
/* LAYER - biomes, laid out per ZONE. A zone (js/data/zones/) lists what it is made of: `biomes: [{ id, share, patches? }]`. The one without `patches` is the
 * background (zone 1: meadow, 85%); the others are laid down as irregular patches sized so that together they cover their `share` of the zone's LAND (zone 1:
 * one orchard patch, 15%). Where the patch goes is a pure function of the world seed. The village is always meadow.
 *
 * Sizing is measured, not guessed: the first time a tile is asked about, the layer samples the zone's land (a coarse grid), finds the nicest spot for each
 * patch (the one with the most land round it) and widens the patch until it covers the right share of that land. Every machine does the same sums, so the
 * patches are the same for everyone. */
const BIOME_SAMPLE_STEP = 4, PATCH_WOBBLE = 14;
class BiomeLayer {
  constructor(seed, terrain, zones) {
    this.id = 'biomes'; this.seed = seed | 0; this.terrain = terrain; this.zones = zones;
    this.warp = new PerlinNoise(seed + 5001); this.patches = null; this.fill = 'normal';
  }
  /** Is this point inside the patch? Its edge wanders by a few tiles (the warp noise), so it is a blob and not a disc. */
  _inside(p, x, y) { return Math.hypot(x - p.x, y - p.y) + PATCH_WOBBLE * this.warp.fractal(x / 40, y / 40, 2) < p.r; }
  /** Work out the patches (once). */
  _build() {
    const zone = this.zones.def(0), o = CONFIG.sim.levels.origin, T = this.terrain, step = BIOME_SAMPLE_STEP, vr = CONFIG.world.villageBiomeRadius, land = [];
    this.patches = [];
    const fill = zone.biomes.find(b => !b.patches); this.fill = fill ? fill.id : 'normal';
    for (let y = -zone.radius; y <= zone.radius; y += step) for (let x = -zone.radius; x <= zone.radius; x += step) {
      const px = o.x + x, py = o.y + y, tile = T.baseTile(Math.floor(px), Math.floor(py));
      if ((tile === TILE.GRASS || tile === TILE.DIRT) && Math.hypot(x, y) >= vr) land.push([px, py]);                 // (the village's meadow is not part of the sum)
    }
    let k = 0;
    for (const entry of zone.biomes.filter(b => b.patches)) {
      for (let n = 0; n < entry.patches; n++, k++) {
        const target = land.length * entry.share / entry.patches;
        let best = null;
        for (let attempt = 0; attempt < 12; attempt++) {                                                              // the candidate with the most land round it
          const a = hash3(this.seed, k, attempt, 7) * Math.PI * 2, d = zone.radius * (0.45 + 0.25 * hash3(this.seed, k, attempt, 8));
          const cx = o.x + Math.cos(a) * d, cy = o.y + Math.sin(a) * d, around = land.reduce((c, [x, y]) => c + (Math.hypot(x - cx, y - cy) < 60 ? 1 : 0), 0);
          if (!best || around > best.around) best = { x: cx, y: cy, around };
        }
        const patch = { id: entry.id, x: best.x, y: best.y, r: 0 };
        let lo = 0, hi = zone.radius;                                                                                  // widen it until it covers the right share of the land
        for (let i = 0; i < 16; i++) {
          patch.r = (lo + hi) / 2;
          const covered = land.reduce((c, [x, y]) => c + (this._inside(patch, x, y) ? 1 : 0), 0);
          if (covered < target) lo = patch.r; else hi = patch.r;
        }
        patch.r = (lo + hi) / 2;
        this.patches.push(patch);
      }
    }
  }
  /** One id for the whole region a land tile is in: what a "per region" limit counts within (the village's meadow is one region; each patch another). */
  regionKey(tx, ty) {
    const o = CONFIG.sim.levels.origin;
    if (Math.hypot(tx - o.x, ty - o.y) < CONFIG.world.villageBiomeRadius) return 'village';
    return '0:' + this.at(tx, ty);
  }
  /** The biome id of a land tile. */
  at(tx, ty) {
    const o = CONFIG.sim.levels.origin;
    if (Math.hypot(tx - o.x, ty - o.y) < CONFIG.world.villageBiomeRadius) return 'normal';
    if (!this.patches) this._build();
    for (const p of this.patches) if (Math.hypot(tx - p.x, ty - p.y) < p.r + PATCH_WOBBLE * 1.6 && this._inside(p, tx, ty)) return p.id;     // (the first test spares the noise)
    return this.fill;
  }
}
