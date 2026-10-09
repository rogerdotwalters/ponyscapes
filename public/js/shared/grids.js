'use strict';
/* SHARED - GRIDS: the overworld and every instance (a room inside a building, a cave) are separate game grids, each its own World with its own
 * coordinates. Nothing is teleported across the overworld: going through a door moves you to ANOTHER GRID.
 *
 *   grid id      ''                  the overworld (anything without a `grid` is here, so old saves just work)
 *                'room:<site>'       a shared room: the store, the carpenter, the vet (site = its BuildingSites index)
 *                'room:<site>:<k>'   (a shared building with several rooms, like the castle) its k-th room; the first one is plain 'room:<site>'
 *                'room:<site>:<n>'   a player's own copy of a room (their home; n = their home number, handed out by the server)
 *                'cave:<ring>'       a ring's boss lair
 *                'dungeon:<d>:<r>'   room <r> of room dungeon <d> (js/data/dungeons/ lists them; each room is a picture-sized 2D list: roomCodes.js)
 *   entities     players, animals and items on the ground carry `grid`; villagers and boats only live in the overworld.
 *                Two things are only ever near each other if they are on the SAME grid (sameGrid).
 *   GridSet      the worlds one machine holds: the server builds an instance the first time someone enters it, the client the one it stands in.
 * A new kind of instance = a plan class (tiles, walls, props, entry / exit) and a line in Grids.plan(). */
const gridOf = e => (e && e.grid) || '';
const sameGrid = (a, b) => gridOf(a) === gridOf(b);

/** An instance has no rings, biomes or cave sites: these answer for it. */
const NO_LAYERS = Object.freeze({
  rings: Object.freeze({ count: 0, width: 1, barrierAt: () => 0, barrierNear: () => -1, gateAt: () => -1, at: () => ({ index: 0 }), isUnlocked: () => true, def: () => ({ name: '' }), setUnlocked() {} }),
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

/** Which chests of the room dungeons have been opened (grid|tx|ty), on this machine. The server fills it as chests open and the client when told, so a room
 *  rebuilt after everyone left still shows its empty chests. */
const DungeonState = { opened: new Set(), key: (grid, tx, ty) => `${grid}|${tx}|${ty}` };

/** One room of a room dungeon, at its own coordinates: tile (x, y) of the room's picture is tile (x, y) here, everything outside it is rock.
 *  Entrance patch (2) = the way back, exit patch (3) = the way on, chests (5) are props; spawn nodes and named enemies are placed by DungeonSystem. */
class DungeonRoomPlan {
  constructor(grid, dungeon, index, room) {
    this.grid = grid; this.dungeon = dungeon; this.index = index; this.room = room; this.ring = dungeon.ring;
    this.seed = 7001 + dungeon.rooms.length * 31 + index * 977 + room.w * 13 + room.h;               // (decides where the pools and spires are: the same on every machine)
    this.pools = new PerlinNoise(this.seed);
    this.mouths = new Set([room.entrances, room.exits].filter(t => t.length).map(t => { const m = this._middle(t); return m.y * room.w + m.x; }));   // the middle tile of the entrance and the exit patch is a cave mouth: a block of rock with an arch
    this.clear = new Set();                                                                              // tiles kept free of pools and spires: round every marker, so a chest or a way on is never in water or behind a spire
    for (const list of [room.entrances, room.exits, room.chests, room.spawns, room.enemies]) for (const t of list) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.clear.add((t.y + dy) * room.w + t.x + dx);
  }
  /** Is this floor tile under a pool? (blobs of shallow water, never near a marker, never on a code tile) */
  isPool(tx, ty) {
    const R = this.room;
    return R.code(tx, ty) === RoomCode.FLOOR && !this.clear.has(ty * R.w + tx) && this.pools.fractal(tx / 8, ty / 8, 2) > 0.2;
  }
  tileAt(tx, ty) { return this.room.walkable(tx, ty) ? (this.isPool(tx, ty) ? TILE.SHALLOW : TILE.CAVE) : TILE.CAVE_WALL; }
  /** Rock you can see is a block: a wall tile touching floor. (The deep rock behind it stays flat dark ground.) A wall on the south / east side of the floor is LOW so you
   *  can see over it; on the north / west it is tall, like a room's walls. The entrance and the exit are cave mouths. */
  objAt(tx, ty) {
    const R = this.room;
    if (this.mouths.has(ty * R.w + tx)) return OBJ.CAVEMOUTH_IN;
    if (R.walkable(tx, ty)) return OBJ.NONE;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && R.walkable(tx + dx, ty + dy)) { near = true; break; }
    if (!near) return OBJ.NONE;
    return R.walkable(tx, ty - 1) || R.walkable(tx - 1, ty) || R.walkable(tx - 1, ty - 1) ? OBJ.CAVEROCK_LOW : OBJ.CAVEROCK_TALL;
  }
  solidAt(tx, ty) { return !this.room.walkable(tx, ty) || this.mouths.has(ty * this.room.w + tx); }
  get first() { return this.index === 0; }
  get last() { return this.index === this.dungeon.rooms.length - 1; }
  /** The tile of a patch (entrance / exit) nearest its middle. */
  _middle(tiles) {
    const cx = tiles.reduce((n, t) => n + t.x, 0) / tiles.length, cy = tiles.reduce((n, t) => n + t.y, 0) / tiles.length;
    return tiles.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? b : a));
  }
  /** Where you stand when you come in at a patch: the open floor next to it (not on it, so the key does not at once take you back). */
  _landing(tiles) {
    const mid = this._middle(tiles), R = this.room, patch = new Set(tiles.map(t => t.y * R.w + t.x));
    let best = null;
    for (let r = 1; r <= 6 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = mid.x + dx, y = mid.y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !R.walkable(x, y) || patch.has(y * R.w + x) || R.code(x, y) !== RoomCode.FLOOR) continue;
      const d = Math.hypot(dx, dy) - (dy > 0 ? 0.35 : 0); if (!best || d < best.d) best = { x, y, d };
    }
    return best ? { x: best.x + 0.5, y: best.y + 0.5 } : { x: mid.x + 0.5, y: mid.y + 0.5 };
  }
  entryPoint() { return this._landing(this.room.entrances); }            // arriving from the room before (or from outside)
  arrivalFromNext() { return this._landing(this.room.exits); }          // arriving back from the room after
  exitPoint() { const m = this._middle(this.room.entrances); return { x: m.x + 0.5, y: m.y + 0.5 }; }
  /** The entrance / exit patches as { x0, y0, x1, y1 } boxes in tiles (to see how near you are). */
  patch(kind) { const t = kind === 'entrance' ? this.room.entrances : this.room.exits; return t.map(p => [p.x, p.y, p.x + 1, p.y + 1]); }
  /** A chest stands on every chest tile, and stalagmites (blocking little spires) stand about the floor, more of them by the walls. (The mouths are blocks, not props.) */
  propsIn(cx, cy) {
    const R = this.room, out = [], x0 = cx * CHUNK_SIZE, y0 = cy * CHUNK_SIZE;
    for (const c of R.chests) if ((c.x >> CHUNK_SHIFT) === cx && (c.y >> CHUNK_SHIFT) === cy) out.push({ tile: [c.x, c.y], prop: { t: 'dungeon_chest', x: c.x + 0.5, y: c.y + 0.5, r: 0.32 / TILE_SCALE, v: 0, opened: DungeonState.opened.has(DungeonState.key(this.grid, c.x, c.y)) } });
    for (let ty = y0; ty < y0 + CHUNK_SIZE; ty++) for (let tx = x0; tx < x0 + CHUNK_SIZE; tx++) {
      if (R.code(tx, ty) !== RoomCode.FLOOR || this.clear.has(ty * R.w + tx) || this.isPool(tx, ty)) continue;
      const h = hash3(this.seed, tx, ty, 5);
      if (h >= 0.09) continue;
      let wall = false; for (let dy = -1; dy <= 1 && !wall; dy++) for (let dx = -1; dx <= 1; dx++) if (!R.walkable(tx + dx, ty + dy)) { wall = true; break; }
      if (h < (wall ? 0.075 : 0.011)) out.push({ tile: [tx, ty], prop: { t: 'stalagmite', x: tx + 0.5 + (hash3(this.seed, tx, ty, 6) - 0.5) * 0.4, y: ty + 0.5 + (hash3(this.seed, tx, ty, 7) - 0.5) * 0.4, r: 0.28 / TILE_SCALE, v: Math.floor(hash3(this.seed, tx, ty, 8) * 6) } });
    }
    return out;
  }
}

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
  /** The doorways to the other rooms of the same building (a room of a building with several: interiorSystem.js). */
  links() { return this.plan.links ? this.plan.links() : []; }
}

const Grids = {
  OVERWORLD: '',
  room: (siteIndex, n) => (n === undefined || n === null ? `room:${siteIndex}` : `room:${siteIndex}:${n}`),
  cave: ring => `cave:${ring}`,
  dungeon: (d, r) => `dungeon:${d}:${r}`,
  /** { kind: 'room', site, n } | { kind: 'cave', ring } | { kind: 'dungeon', dungeon, room } | null for the overworld or anything malformed. */
  parse(id) {
    if (typeof id !== 'string' || !id) return null;
    let m = /^room:(\d{1,2})(?::(\d{1,5}))?$/.exec(id);
    if (m) return { kind: 'room', site: Number(m[1]), n: m[2] === undefined ? undefined : Number(m[2]) };
    m = /^dungeon:(\d{1,2}):(\d{1,2})$/.exec(id);
    if (m) return { kind: 'dungeon', dungeon: Number(m[1]), room: Number(m[2]) };
    m = /^cave:(\d)$/.exec(id);
    return m ? { kind: 'cave', ring: Number(m[1]) } : null;
  },
  /** The plan an instance is built from, or null (a room nobody designed yet, an unknown cave...). */
  plan(id) {
    const g = Grids.parse(id);
    if (!g) return null;
    if (g.kind === 'cave') return g.ring < DungeonSpace.COUNT ? new CavePlan(g.ring) : null;
    if (g.kind === 'dungeon') {
      const dungeon = Dungeons.all()[g.dungeon], room = dungeon && CaveRooms.get(dungeon.rooms[g.room]);
      return room ? new DungeonRoomPlan(id, dungeon, g.room, room) : null;                          // (a room missing from js/content/caveRooms.js is simply not there)
    }
    const site = BuildingSites.list[g.site], def = site && site.def;
    if (!def) return null;
    if (def.instance === 'player') { const layout = Interiors.get(def.interior); return layout && g.n !== undefined ? new RoomPlan(site, layout, '') : null; }   // a player building's rooms are numbered by owner
    if (g.n === undefined) { const layout = Interiors.get(def.interior); return layout ? new RoomPlan(site, layout, Grids.roomKeys(site)[0] || '') : null; }   // a shared building's first room
    const key = Grids.roomKeys(site)[g.n], layout = key && Interiors.get(def.rooms[key]);                       // ... and its other rooms: room:<site>:<k>, k = the room's place in the building's `rooms`
    return layout ? new RoomPlan(site, layout, key) : null;
  },
  /** The names of a building's rooms, entrance first ([] for a building with just the one room). */
  roomKeys: site => (site.def.rooms ? Object.keys(site.def.rooms) : []),
  /** The grid id of the room `key` of a (shared) building: its first room is plain 'room:<site>'. */
  roomOf(site, key) { const k = Grids.roomKeys(site).indexOf(key); return k < 0 ? null : k === 0 ? Grids.room(site.index) : Grids.room(site.index, k); },
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
