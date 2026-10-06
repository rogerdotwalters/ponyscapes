'use strict';
/* LAYER - level zones (OPTIONAL). Turns "where are we" into "how strong are the wild things here": each ring has a level band (1-5, 5-10,
 * 10-15, 15-20, 20-25) and the level climbs through the band from the ring's inner edge to its outer edge.
 *
 * The world does not need this layer: with it removed (CONFIG.world.zones = false), every creature simply uses its own `levelBase`. */
class ZoneLayer {
  constructor(rings) { this.id = 'zones'; this.rings = rings; }
  band(x, y) { const r = this.rings.at(x, y), def = this.rings.def(r.index); return { ring: r.index, min: def.levelMin, max: def.levelMax, depth: r.depth }; }
  /** A level for something born here; `h` (0..1) is a hash so the same spot always rolls the same. Stays inside the ring's band. */
  levelAt(x, y, h) {
    const b = this.band(x, y), base = b.min + b.depth * (b.max - b.min);
    return clamp(Math.round(base + (h - 0.5) * 2), b.min, b.max);
  }
  /** About what level the wild things are at this spot (for the map). */
  zoneLevel(x, y) { const b = this.band(x, y); return Math.round(b.min + b.depth * (b.max - b.min)); }
}
