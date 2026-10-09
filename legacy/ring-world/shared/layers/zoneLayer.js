'use strict';
/* LAYER - level zones (OPTIONAL). Turns "where are we" into "how strong are the wild things here". Two things decide it:
 *   the RING   each ring has a level band (1-5, 5-10, 10-15, 15-20, 20-25) and the level climbs through it from the inner edge to the outer edge;
 *   the BIOME  each biome declares its band in the Heartland (`levels`: meadow 1-5, jungle 3-8 ...); in a farther ring that band steps up by as
 *              much as the ring's own band does, so the meadow always matches the ring and harder biomes stay that much harder.
 *
 * The world does not need this layer: with it removed (CONFIG.world.zones = false), every creature simply uses its own `levelBase`. */
class ZoneLayer {
  constructor(rings, biomes) { this.id = 'zones'; this.rings = rings; this.biomes = biomes || null; }
  band(x, y) {
    const r = this.rings.at(x, y), def = this.rings.def(r.index), first = this.rings.def(0);
    const biome = this.biomes ? Biomes.get(this.biomes.at(Math.floor(x), Math.floor(y))) : null, [lo, hi] = (biome && biome.levels) || BIOME_LEVELS;
    const min = Math.max(1, lo + def.levelMin - first.levelMin), max = Math.max(min, hi + def.levelMax - first.levelMax);
    return { ring: r.index, min, max, depth: r.depth };
  }
  /** A level for something born here; `h` (0..1) is a hash so the same spot always rolls the same. Stays inside the band. */
  levelAt(x, y, h) {
    const b = this.band(x, y), base = b.min + b.depth * (b.max - b.min);
    return clamp(Math.round(base + (h - 0.5) * 2), b.min, b.max);
  }
  /** About what level the wild things are at this spot (for the map). */
  zoneLevel(x, y) { const b = this.band(x, y); return Math.round(b.min + b.depth * (b.max - b.min)); }
}
