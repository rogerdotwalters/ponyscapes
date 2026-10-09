'use strict';
/* LAYER - the zones. The world is a TREE of zones (js/data/zones/): the root holds the village, and every other zone branches off a parent. This layer
 *
 *   LAYS THEM OUT from the world seed. A zone's children are placed round it at random angles (the root's all the way round; a deeper zone's on the side facing away
 *   from its own parent), each overlapping its parent a little so the two blobs meet. Nothing else touches: if a spot is taken, the angle is nudged.
 *   CLASSIFIES every tile: land of some zone, a CLIFF WALL (round every zone's rim and along each border between two zones), a GATE (a gap in a border wall: the
 *   way into a sub zone), open SEA (a strip round the whole map) or FAR (everything beyond the sea: an invisible barrier, so boats and flying ponies cannot leave).
 *   OWNS the gates: a gate is open when its zone is unlocked. unlock() / lock() / setUnlocked() are the on/off switch (story, bosses, scripts); a shut gate is a
 *   barrier you cannot pass (drawn as a shimmering wall for now).
 *   SAYS how strong things are (the zone's level band, rising from its middle out) and which creature tier lives where.
 *
 * Zones are discs seen through a slow noise warp, so their edges wobble; a tile belongs to the zone it is deepest inside (smallest distance / radius).
 * `layers.rings` is this same object under its old name (collision, the minimap and saves still say "ring" for "zone"). */
const ZONE_KIND = Object.freeze({ LAND: 0, WALL: 1, GATE: 2, SEA: 3, FAR: 4 });
class ZoneLayer {
  constructor(seed) {
    this.id = 'zones'; this.seed = seed | 0; this.warpX = new PerlinNoise(seed + 4001); this.warpY = new PerlinNoise(seed + 4002);
    this.W = CONFIG.world; this.base = new Set(Zones.all().filter(z => !z.locked).map(z => z.index)); this.unlocked = new Set(this.base);
    this.count = Zones.size; this.nodes = null; this.chunks = new Map();
  }

  /* ---- the layout ---- */
  def(index) { return Zones.all().find(z => z.index === index); }
  /** Every zone's place: [{ def, x, y, r, parent: node | null, angle }] indexed by zone index. Worked out once; a pure function of the seed. */
  layout() {
    if (this.nodes) return this.nodes;
    const defs = Zones.all(), o = CONFIG.sim.levels.origin, seed = this.seed, nodes = [], K = this.W.zoneOverlap;
    for (let i = 0; i < defs.length; i++) if (!this.def(i)) throw new Error('zones need the indices 0..' + (defs.length - 1) + ' with no gap (missing ' + i + ')');
    const rollR = d => (Array.isArray(d.radius) ? d.radius[0] + (d.radius[1] - d.radius[0]) * hash3(seed, d.index, 1, 31) : d.radius);
    const roots = defs.filter(d => !d.parent);
    if (roots.length !== 1) throw new Error('zones need exactly one root (a zone with no parent)');
    const free = (x, y, r, except) => nodes.every(n => n === except || Math.hypot(n.x - x, n.y - y) >= (n.r + r) * 1.06);   // (only related zones may overlap)
    const place = (def, parent, x, y, angle) => { const n = { def, x, y, r: rollR(def), parent, angle }; nodes[def.index] = n; return n; };
    const grow = node => {
      const kids = defs.filter(d => d.parent === node.def.id).sort((a, b) => a.index - b.index);
      kids.forEach((kid, i) => {
        const r = rollR(kid), span = node.parent ? Math.min(2.4, 0.95 * kids.length) : Math.PI * 2;
        const mid = node.parent ? node.angle : hash3(seed, node.def.index, 2, 32) * Math.PI * 2;                             // the root: all the way round, from a random start
        const slot = node.parent ? mid - span / 2 + span * (i + 0.5) / kids.length : mid + Math.PI * 2 * (i + 0.5) / kids.length, wiggle = (node.parent ? span : Math.PI * 2) / kids.length;
        let best = null;
        for (let attempt = 0; attempt < 80 && !best; attempt++) {
          const a = slot + (hash3(seed, kid.index, attempt, 33) - 0.5) * wiggle * Math.min(1, 0.35 + attempt / 40);
          const d = (node.r + r) * K, x = node.x + Math.cos(a) * d, y = node.y + Math.sin(a) * d;
          if (free(x, y, r, node)) best = { x, y, a };
        }
        if (!best) { const a = slot, d = (node.r + r) * K; best = { x: node.x + Math.cos(a) * d, y: node.y + Math.sin(a) * d, a }; }     // (nowhere clear: take the slot anyway)
        const child = place(kid, node, best.x, best.y, best.a);
        child.r = r;
        grow(child);
      });
    };
    grow(place(roots[0], null, o.x, o.y, 0));
    this.nodes = nodes;
    this.reach = nodes.reduce((m, n) => Math.max(m, Math.hypot(n.x - o.x, n.y - o.y) + n.r), 0) + this.W.seaWidth;      // how far from the village anything of the world lies
    return nodes;
  }
  /** { x, y, r } : where a zone is (its middle and radius, before the edge wobble). */
  centreOf(index) { const n = this.layout()[index]; return { x: n.x, y: n.y, r: n.r }; }
  get width() { return this.layout()[0].r; }                                   // (the root zone's radius: what "ring width" used to mean)
  get edge() { this.layout(); return this.reach; }

  /* ---- classifying tiles (in chunks, cached) ---- */
  /** What a tile is. Returns { kind, zone, depth, gate }: `zone` the nearest zone's index, `depth` how far in (0 middle, 1 rim), `gate` the zone index a gate leads to. */
  _classify(tx, ty) {
    const nodes = this.layout(), o = CONFIG.sim.levels.origin, W = this.W;
    if (Math.hypot(tx + 0.5 - o.x, ty + 0.5 - o.y) > this.reach + W.zoneWarp * 2) return { kind: ZONE_KIND.FAR, zone: 0, depth: 1, gate: -1 };      // (cheap: most of the world is out here)
    const wx = tx + 0.5 + W.zoneWarp * this.warpX.fractal(tx / 38, ty / 38, 2), wy = ty + 0.5 + W.zoneWarp * this.warpY.fractal(tx / 38, ty / 38, 2);
    let a = null, b = null, fa = Infinity, fb = Infinity, out = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(wx - n.x, wy - n.y), f = d / n.r;
      out = Math.min(out, d - n.r);
      if (f < fa) { b = a; fb = fa; a = n; fa = f; } else if (f < fb) { b = n; fb = f; }
    }
    if (fa >= 1) return { kind: out <= W.seaWidth ? ZONE_KIND.SEA : ZONE_KIND.FAR, zone: a.def.index, depth: 1, gate: -1 };
    const rim = (1 - fa) * a.r, border = b && fb < 1 ? (fb - fa) / (1 / a.r + 1 / b.r) : Infinity;                              // tiles to the zone's rim, and to the border with its neighbour
    const base = { zone: a.def.index, depth: fa, gate: -1, wall: Math.min(rim, border) };
    if (rim < W.wallWidth) return Object.assign(base, { kind: ZONE_KIND.WALL });                                              // the rim
    if (border < W.wallWidth / 2) {                                                                                           // a border with another zone
      const child = b.parent === a ? b : a.parent === b ? a : null;
      if (child) {
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, perp = Math.abs(((wx - a.x) * dy - (wy - a.y) * dx) / len);
        if (perp < W.gateHalfWidth) return Object.assign(base, { kind: ZONE_KIND.GATE, gate: child.def.index });
      }
      return Object.assign(base, { kind: ZONE_KIND.WALL });
    }
    return Object.assign(base, { kind: ZONE_KIND.LAND });
  }
  _chunk(tx, ty) {
    const cx = tx >> 4, cy = ty >> 4, key = (cx + 32768) * 65536 + (cy + 32768);
    let c = this.chunks.get(key);
    if (c) return c;
    if (this.chunks.size > 3000) this.chunks.clear();
    c = { kind: new Uint8Array(256), zone: new Uint8Array(256), depth: new Uint8Array(256), gate: new Int8Array(256), wall: new Uint8Array(256) };
    for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
      const r = this._classify(cx * 16 + lx, cy * 16 + ly), i = (ly << 4) | lx;
      c.kind[i] = r.kind; c.zone[i] = r.zone; c.depth[i] = Math.round(Math.min(1, r.depth) * 255); c.gate[i] = r.gate; c.wall[i] = r.wall === undefined ? 255 : Math.round(Math.min(63, r.wall) * 4);
    }
    this.chunks.set(key, c);
    return c;
  }
  kindAt(tx, ty) { return this._chunk(tx, ty).kind[((ty & 15) << 4) | (tx & 15)]; }
  /** { index, depth } : the zone this spot is in (the nearest one, over water or wall) and how far out from its middle (0..1). */
  at(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y), c = this._chunk(tx, ty), i = ((ty & 15) << 4) | (tx & 15);
    return { index: c.zone[i], depth: c.depth[i] / 255 };
  }
  /** Tiles from this one to the nearest cliff wall (rim or border), up to 63. */
  wallDistance(tx, ty) { return this._chunk(tx, ty).wall[((ty & 15) << 4) | (tx & 15)] / 4; }
  /** The biome id of the zone that owns this tile. */
  biomeAt(tx, ty) { return this.def(this.at(tx, ty).index).biome; }
  /** Which creature tier lives here (the zone's `fauna`, else its own index). */
  faunaAt(x, y) { const d = this.def(this.at(x, y).index); return d.fauna === undefined ? d.index : d.fauna; }

  /* ---- gates ---- */
  isUnlocked(index) { return this.unlocked.has(index); }
  unlock(index) { this.unlocked.add(index); }
  lock(index) { this.unlocked.delete(index); }
  /** Put the open zones back from a saved / sent list (the zones that start open always are). */
  setUnlocked(list) { this.unlocked = new Set([...this.base, ...list]); }
  unlockedList() { return [...this.unlocked].sort((a, b) => a - b); }
  /** The zone whose SHUT gate this tile is (-1 if it is no gate, or the gate is open). Drawn as a barrier. */
  gateAt(tx, ty) {
    const c = this._chunk(tx, ty), i = ((ty & 15) << 4) | (tx & 15);
    return c.kind[i] === ZONE_KIND.GATE && !this.unlocked.has(c.gate[i]) ? c.gate[i] : -1;
  }
  /** Can nothing pass this tile? A shut gate, or the far side of the sea. (Cheap: one cached lookup.) */
  barrierAt(tx, ty) {
    const c = this._chunk(tx, ty), i = ((ty & 15) << 4) | (tx & 15), k = c.kind[i];
    return k === ZONE_KIND.FAR || (k === ZONE_KIND.GATE && !this.unlocked.has(c.gate[i]));
  }
  /** The zone number behind a shut gate within `range` tiles of (x, y), or -1 (for the "the way is sealed" hint). */
  barrierNear(x, y, range) {
    for (let ty = Math.floor(y - range); ty <= Math.floor(y + range); ty++) for (let tx = Math.floor(x - range); tx <= Math.floor(x + range); tx++) {
      const g = this.gateAt(tx, ty); if (g >= 0 && Math.hypot(tx + 0.5 - x, ty + 0.5 - y) <= range + 0.7) return g;
    }
    return -1;
  }

  /* ---- how strong are the wild things? ---- */
  /** The level band here: the zone's own, and how far out from its middle the spot is. */
  band(x, y) { const r = this.at(x, y), d = this.def(r.index); return { ring: r.index, min: d.levelMin, max: Math.max(d.levelMin, d.levelMax), depth: r.depth }; }
  /** A level for something born here; `h` (0..1) is a hash so the same spot always rolls the same. Stays inside the band. */
  levelAt(x, y, h) {
    const b = this.band(x, y), base = b.min + b.depth * (b.max - b.min);
    return clamp(Math.round(base + (h - 0.5) * 2), b.min, b.max);
  }
  /** About what level the wild things are at this spot (for the map). */
  zoneLevel(x, y) { const b = this.band(x, y); return Math.round(b.min + b.depth * (b.max - b.min)); }
}
