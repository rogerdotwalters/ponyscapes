'use strict';
/* SHARED - GRIDS: the overworld and every instance (a room inside a building, a cave) are separate game grids, each its own World with its own
 * coordinates. Nothing is teleported across the overworld: going through a door moves you to ANOTHER GRID.
 *
 *   grid id      ''                  the overworld (anything without a `grid` is here, so old saves just work)
 *                'room:<site>'       a shared room: the store, the carpenter, the vet (site = its BuildingSites index)
 *                'room:<site>:<n>'   a player's own copy of a room (their home; n = their home number, handed out by the server)
 *                'cave:<ring>'       a ring's dungeon
 *   entities     players, animals and items on the ground carry `grid`; villagers and boats only live in the overworld.
 *                Two things are only ever near each other if they are on the SAME grid (sameGrid).
 *   GridSet      the worlds one machine holds: the server builds an instance the first time someone enters it, the client the one it stands in.
 * A new kind of instance = a plan class (tiles, walls, props, entry / exit) and a line in Grids.plan(). */
const gridOf = e => (e && e.grid) || '';
const sameGrid = (a, b) => gridOf(a) === gridOf(b);

/** An instance has no rings, biomes or cave sites: these answer for it. */
const NO_LAYERS = Object.freeze({
  rings: Object.freeze({ count: 0, width: 1, barrierAt: () => 0, barrierNear: () => -1, at: () => ({ index: 0 }), isUnlocked: () => true, def: () => ({ name: '' }), setUnlocked() {} }),
  biomes: Object.freeze({ at: () => 'normal' }), zones: null,
  dungeons: Object.freeze({ site: () => null, sites: () => [], nearestTo: () => null })
});

/** A cave, at its own coordinates (DungeonSpace): rock everywhere but the hall, the corridor and the arena, and a portal out. */
class CavePlan {
  constructor(ring) { this.ring = ring; }
  tileAt(tx, ty) { return DungeonSpace.tileAt(this.ring, tx, ty); }
  objAt() { return 0; }
  solidAt(tx, ty) { return this.tileAt(tx, ty) === TILE.CAVE_WALL; }
  exitPoint() { return DungeonSpace.exit(); }
  entryPoint() { return DungeonSpace.entry(); }
  arena() { return DungeonSpace.arena(); }
  /** The portal out, and (in a cave whose guardian lost its young: wantSystem.js) a trail of small glowing paw prints leading out of the lair. */
  propsIn(cx, cy) {
    const e = this.exitPoint(), out = [], here = (x, y) => Math.floor(x) >> CHUNK_SHIFT === cx && Math.floor(y) >> CHUNK_SHIFT === cy;
    if (here(e.x, e.y)) out.push({ tile: [Math.floor(e.x), Math.floor(e.y)], prop: { t: 'portal', x: e.x, y: e.y, r: 0.2, v: this.ring, ring: this.ring } });
    for (const [x, y, i] of this.tracks()) if (here(x, y)) out.push({ tile: [Math.floor(x), Math.floor(y)], prop: { t: 'tracks', x, y, r: 0, v: i, ring: this.ring } });
    return out;
  }
  /** [[x, y, n]]: the paw prints along the middle of the corridor, from the arena towards the entrance hall (none if no young are lost). */
  tracks() {
    const boss = Fauna.bossOf(this.ring);
    if (!boss || !boss.wants || !boss.wants.quest) return [];
    const out = [];
    for (let lx = 31.5, i = 0; lx >= 12; lx -= 2.4, i++) out.push([lx, 31.5 + 2.2 * Math.sin(Math.floor(lx) * 0.55 + this.ring), i]);
    return out;
  }
}

/** A grid that is not the overworld: its chunks come from its plan (a RoomPlan or a CavePlan). */
class InstanceWorld extends World {
  constructor(seed, grid, kind, plan) {
    super(seed, { seed: seed | 0, layers: NO_LAYERS, tile: (tx, ty) => plan.tileAt(tx, ty), biomeAt: () => 'normal', hasTree: () => false, appleTreeAt: () => false });
    this.grid = grid; this.kind = kind; this.plan = plan;
  }
  generate(cx, cy) {
    const P = this.plan, x0 = cx * CHUNK_SIZE, y0 = cy * CHUNK_SIZE;
    const chunk = {
      cx, cy, tiles: new Uint8Array(CHUNK_AREA), obj: new Uint8Array(CHUNK_AREA), solid: new Uint8Array(CHUNK_AREA),
      propIndex: new Int16Array(CHUNK_AREA).fill(-1), props: [], biomes: new Uint8Array(CHUNK_AREA).fill(255), renderItems: null, boatSpot: null, animals: []
    };
    for (let ly = 0; ly < CHUNK_SIZE; ly++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const tx = x0 + lx, ty = y0 + ly, li = (ly << CHUNK_SHIFT) | lx;
      chunk.tiles[li] = P.tileAt(tx, ty); chunk.obj[li] = P.objAt(tx, ty); chunk.solid[li] = P.solidAt(tx, ty) ? 1 : 0;
    }
    for (const { tile: [tx, ty], prop } of P.propsIn(cx, cy)) addChunkProp(chunk, ((ty - y0) << CHUNK_SHIFT) | (tx - x0), prop);
    return chunk;
  }
  /** Where you arrive, and where the way out is. */
  entryPoint() { return this.plan.entryPoint(); }
  exitPoint() { return this.plan.exitPoint(); }
}

const Grids = {
  OVERWORLD: '',
  room: (siteIndex, n) => (n === undefined || n === null ? `room:${siteIndex}` : `room:${siteIndex}:${n}`),
  cave: ring => `cave:${ring}`,
  /** { kind: 'room', site, n } | { kind: 'cave', ring } | null for the overworld or anything malformed. */
  parse(id) {
    if (typeof id !== 'string' || !id) return null;
    let m = /^room:(\d{1,2})(?::(\d{1,5}))?$/.exec(id);
    if (m) return { kind: 'room', site: Number(m[1]), n: m[2] === undefined ? undefined : Number(m[2]) };
    m = /^cave:(\d)$/.exec(id);
    return m ? { kind: 'cave', ring: Number(m[1]) } : null;
  },
  /** The plan an instance is built from, or null (a room nobody designed yet, an unknown cave...). */
  plan(id) {
    const g = Grids.parse(id);
    if (!g) return null;
    if (g.kind === 'cave') return g.ring < DungeonSpace.COUNT ? new CavePlan(g.ring) : null;
    const site = BuildingSites.list[g.site], layout = site && Interiors.get(site.def.interior);
    if (!layout || (site.def.instance === 'player') !== (g.n !== undefined)) return null;          // a player building's rooms are numbered; a shared one's is not
    return new RoomPlan(site, layout);
  },
  /** Is this a grid id that can exist ('' included)? */
  valid(id) { return id === '' || !!Grids.plan(id); },
  /** The building site a room grid belongs to (null for caves and the overworld). */
  siteOf(id) { const g = Grids.parse(id); return g && g.kind === 'room' ? BuildingSites.list[g.site] || null : null; },
  create(seed, id) { const plan = Grids.plan(id), g = Grids.parse(id); return plan ? new InstanceWorld(seed, id, g.kind, plan) : null; }
};

/** The grids one machine holds: the overworld, plus an instance for each grid id asked for (built on first use). */
class GridSet {
  constructor(seed, overworld) { this.seed = seed | 0; this.worlds = new Map([['', overworld]]); this.onCreate = null; }
  get overworld() { return this.worlds.get(''); }
  /** The World for a grid id (an unknown id gets the overworld). */
  get(id) {
    id = id || '';
    let w = this.worlds.get(id);
    if (w) return w;
    w = Grids.create(this.seed, id);
    if (!w) return this.overworld;
    this.worlds.set(id, w);
    if (this.onCreate) this.onCreate(w);
    return w;
  }
  of(entity) { return this.get(gridOf(entity)); }
  has(id) { return this.worlds.has(id || ''); }
  ids() { return [...this.worlds.keys()]; }
  /** Forget an instance nobody is in (it is rebuilt from its plan next time). Never the overworld. */
  drop(id) { if (id) this.worlds.delete(id); }
}
