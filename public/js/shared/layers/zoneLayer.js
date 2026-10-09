'use strict';
/* LAYER - the zones. The world is a set of ZONES (js/data/zones/); for now there is just one, zone 1, a wobbly-edged disc around the village. The layer answers
 *   "which zone is this tile in, and how deep into it?", "how strong are the wild things here?" (the level band), and owns the world's edge and the lock state.
 *
 * The zone's edge is IMPERFECT: distance from the centre is nudged by slow noise, so the coast is not a perfect circle. The land sinks into the sea there (see
 * TerrainGenerator.elevation, which asks edgeSink()) and, past the beach, a thin wall of shimmering light seals the world, so boats and flying ponies stop too.
 * When more zones exist, the edge of a zone whose guardian still stands is that same wall (isUnlocked / unlock / setUnlocked are already here for it).
 *
 * `layers.rings` is the same object under its old name: the older code (collision, minimap, saves) still says "ring" for "zone". */
const ZONE_EDGE_SINK_START = 45, ZONE_EDGE_SINK_LENGTH = 30, ZONE_BARRIER_WIDTH = 2.5;     // tiles: the land starts to sink this far inside the edge, over this distance; the wall is this thick
class ZoneLayer {
  constructor(seed) {
    this.id = 'zones'; this.noise = new PerlinNoise(seed + 4001);
    this.unlocked = new Set([0]);                                           // the first zone is always open
    this.count = Zones.size; this.wobble = CONFIG.world.zoneWobble;
    this.width = this.def(0).radius;                                        // (the first zone's radius: what "ring width" used to mean)
    this.edge = Zones.all().reduce((m, z) => Math.max(m, z.radius), 0);     // where the world ends
  }
  /** Distance from the centre, nudged by the noise: the "imperfect" part. */
  effectiveRadius(x, y) {
    const o = CONFIG.sim.levels.origin;
    return Math.hypot(x - o.x, y - o.y) + this.wobble * this.noise.fractal(x / 130, y / 130, 2);
  }
  /** { index, depth } : zone 0.. and how far through it (0 at the village, 1 at the edge). */
  at(x, y) { return { index: 0, depth: clamp(Math.max(0, this.effectiveRadius(x, y)) / this.width, 0, 1) }; }
  def(index) { return Zones.all().find(z => z.index === index); }

  /** How far the land is pushed down (0 inland, up to 2.4 at the edge) so that the zone ends in a beach and open sea. */
  edgeSink(tx, ty) {
    const o = CONFIG.sim.levels.origin, from = this.edge - ZONE_EDGE_SINK_START - this.wobble * 1.6;
    if (Math.hypot(tx - o.x, ty - o.y) < from) return 0;                    // (almost every tile leaves here without touching the noise)
    const t = clamp((this.effectiveRadius(tx, ty) - (this.edge - ZONE_EDGE_SINK_START)) / ZONE_EDGE_SINK_LENGTH, 0, 1);
    return 2.4 * t * t * (3 - 2 * t);
  }

  /* ---- locks and the edge ---- */
  isUnlocked(index) { return this.unlocked.has(index); }
  unlock(index) { this.unlocked.add(index); }
  setUnlocked(list) { this.unlocked = new Set([0, ...list]); }
  unlockedList() { return [...this.unlocked].sort((a, b) => a - b); }
  /** Is this tile part of the wall round the world? A thin band just past the edge; cheap for the (vast) majority of tiles. */
  barrierAt(tx, ty) {
    const o = CONFIG.sim.levels.origin, dist = Math.hypot(tx + 0.5 - o.x, ty + 0.5 - o.y), far = this.wobble * 1.6;
    if (dist < this.edge - far || dist > this.edge + ZONE_BARRIER_WIDTH + far) return false;
    const e = this.effectiveRadius(tx + 0.5, ty + 0.5);
    return e >= this.edge && e < this.edge + ZONE_BARRIER_WIDTH;
  }
  /** The zone number whose wall is within `range` tiles of (x, y), or -1. The world's outer wall counts as the zone after the last one (= `count`). */
  barrierNear(x, y, range) {
    const o = CONFIG.sim.levels.origin, dist = Math.hypot(x - o.x, y - o.y);
    if (Math.abs(dist - this.edge) > this.wobble * 1.6 + range + ZONE_BARRIER_WIDTH) return -1;
    const e = this.effectiveRadius(x, y);
    return e > this.edge - range && e < this.edge + ZONE_BARRIER_WIDTH + range ? this.count : -1;
  }

  /* ---- how strong are the wild things? ---- */
  /** The level band here: the biome's own band (orchard creatures are tougher than meadow ones), and how far through the zone the spot is. */
  band(x, y, biomes) {
    const r = this.at(x, y), biome = biomes ? Biomes.get(biomes.at(Math.floor(x), Math.floor(y))) : null, [lo, hi] = (biome && biome.levels) || BIOME_LEVELS;
    return { ring: r.index, min: lo, max: Math.max(lo, hi), depth: r.depth };
  }
  /** A level for something born here; `h` (0..1) is a hash so the same spot always rolls the same. Stays inside the band. */
  levelAt(x, y, h) {
    const b = this.band(x, y, this.biomes), base = b.min + b.depth * (b.max - b.min);
    return clamp(Math.round(base + (h - 0.5) * 2), b.min, b.max);
  }
  /** About what level the wild things are at this spot (for the map). */
  zoneLevel(x, y) { const b = this.band(x, y, this.biomes); return Math.round(b.min + b.depth * (b.max - b.min)); }
}
