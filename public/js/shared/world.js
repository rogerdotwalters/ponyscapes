'use strict';
/* SHARED - the world: an unbounded grid of 16x16-tile CHUNKS that are generated lazily and can be dropped again.
 * Client and server each hold their own World built from the same seed; only changes (felled trees, built walls)
 * are ever sent over the wire.
 *
 * (Many functions still call their World parameter `map`; it is a World.) */
const CHUNK_SHIFT = 4, CHUNK_SIZE = 1 << CHUNK_SHIFT, CHUNK_MASK = CHUNK_SIZE - 1, CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
/** Does this prop stop movement? Felled trees, berry bushes and loose stones (you walk over them) do not. */
const NON_BLOCKING_PROPS = new Set(['bush', 'stone', 'clay', 'flax', 'mound', 'bottle']);
const propBlocks = prop => prop.alive !== false && !NON_BLOCKING_PROPS.has(prop.t);

const chunkKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

class World {
  constructor(seed) {
    this.seed = seed | 0;
    this.terrain = new TerrainGenerator(this.seed);
    this.chunks = new Map();            // chunkKey -> chunk
    this.built = {};                    // tileKey -> { n|e|s|w: structureType }   (authoritative on the server)
    this.slabs = {};                    // tileKey -> [[x0,y0,x1,y1], ...]          derived collision boxes
    this.floors = {};                   // tileKey -> floor type (a floor coexists with walls, tables, ...)
    this.treeStates = {};               // tileKey -> { hp, alive } for damaged / felled trees only
    this.forageStates = {};             // tileKey -> { ripe: false } for picked bushes / stones only
    this.treasureDug = {};              // site tileKey -> true once somebody has unearthed it
    this.onChunkGenerated = null;       // hook: the server spawns boats here
    this.lastChunk = null;
  }

  /* ---- chunks ---- */
  chunk(cx, cy) {
    const key = chunkKey(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = generateChunk(this, cx, cy);
      this.chunks.set(key, chunk);
      if (this.onChunkGenerated) this.onChunkGenerated(chunk);
    }
    return chunk;
  }
  peekChunkOfTile(tx, ty) { return this.chunks.get(chunkKey(tx >> CHUNK_SHIFT, ty >> CHUNK_SHIFT)) || null; }
  chunkOfTile(tx, ty) {
    const cx = tx >> CHUNK_SHIFT, cy = ty >> CHUNK_SHIFT, last = this.lastChunk;
    if (last && last.cx === cx && last.cy === cy) return last;       // consecutive lookups are almost always in the same chunk
    return (this.lastChunk = this.chunk(cx, cy));
  }

  /** Generate every chunk within `radius` chunks of a world position (at most `budget` new ones). Returns how many were made. */
  ensureAround(x, y, radius, budget = Infinity) {
    const ccx = Math.floor(x) >> CHUNK_SHIFT, ccy = Math.floor(y) >> CHUNK_SHIFT;
    let made = 0;
    for (let r = 0; r <= radius && made < budget; r++)                // nearest ring first
      for (let cy = ccy - r; cy <= ccy + r && made < budget; cy++) for (let cx = ccx - r; cx <= ccx + r && made < budget; cx++) {
        if (Math.max(Math.abs(cx - ccx), Math.abs(cy - ccy)) !== r || this.chunks.has(chunkKey(cx, cy))) continue;
        this.chunk(cx, cy); made++;
      }
    return made;
  }

  /** Drop chunks farther than `keepRadius` chunks from every given {x,y} centre. Walls and tree states live on the World, so they survive. */
  unloadFar(centres, keepRadius) {
    const near = centres.map(c => [Math.floor(c.x) >> CHUNK_SHIFT, Math.floor(c.y) >> CHUNK_SHIFT]);
    for (const [key, chunk] of this.chunks) {
      if (!near.some(([cx, cy]) => Math.abs(chunk.cx - cx) <= keepRadius && Math.abs(chunk.cy - cy) <= keepRadius)) this.chunks.delete(key);
    }
    this.lastChunk = null;
  }

  /* ---- per-tile queries (they generate the chunk if needed) ---- */
  tile(tx, ty) { return this.chunkOfTile(tx, ty).tiles[((ty & CHUNK_MASK) << CHUNK_SHIFT) | (tx & CHUNK_MASK)]; }
  /** The biome id of a tile ('meadow', 'blossom', ...). Worked out the first time it is asked for, then remembered. */
  biome(tx, ty) {
    const chunk = this.chunkOfTile(tx, ty), li = ((ty & CHUNK_MASK) << CHUNK_SHIFT) | (tx & CHUNK_MASK);
    let b = chunk.biomes[li];
    if (b === 255) { const tile = chunk.tiles[li]; b = isWaterTile(tile) ? 0 : BiomeIndex[this.terrain.biomeAt(tx, ty, tile)]; chunk.biomes[li] = b; }
    return BiomeIds[b];
  }
  objAt(tx, ty) { return this.chunkOfTile(tx, ty).obj[((ty & CHUNK_MASK) << CHUNK_SHIFT) | (tx & CHUNK_MASK)]; }
  isSolid(tx, ty) { return this.chunkOfTile(tx, ty).solid[((ty & CHUNK_MASK) << CHUNK_SHIFT) | (tx & CHUNK_MASK)] === 1; }
  /** The prop (tree / barrel / well, alive or not) standing on a tile, or null. */
  propAt(tx, ty) {
    const chunk = this.chunkOfTile(tx, ty), i = chunk.propIndex[((ty & CHUNK_MASK) << CHUNK_SHIFT) | (tx & CHUNK_MASK)];
    return i >= 0 ? chunk.props[i] : null;
  }
  /** Same, but only if the chunk is already loaded (never generates). */
  peekPropAt(tx, ty) {
    const chunk = this.peekChunkOfTile(tx, ty);
    if (!chunk) return null;
    const i = chunk.propIndex[((ty & CHUNK_MASK) << CHUNK_SHIFT) | (tx & CHUNK_MASK)];
    return i >= 0 ? chunk.props[i] : null;
  }
  /** Can a character path through this tile? Solid ground or a living prop blocks it (walls block edges, not tiles). */
  navBlocked(tx, ty) {
    const chunk = this.chunkOfTile(tx, ty), li = ((ty & CHUNK_MASK) << CHUNK_SHIFT) | (tx & CHUNK_MASK);
    if (chunk.solid[li]) return true;
    const built = this.built[tileKey(tx, ty)];
    if (built && built.c) return true;                                   // a table / furnace fills its tile
    const i = chunk.propIndex[li];
    return i >= 0 && propBlocks(chunk.props[i]);
  }
}

/** Build one chunk from the pure terrain functions + the village stamp. */
function generateChunk(world, cx, cy) {
  const T = world.terrain;
  const chunk = {
    cx, cy,
    tiles: new Uint8Array(CHUNK_AREA), obj: new Uint8Array(CHUNK_AREA), solid: new Uint8Array(CHUNK_AREA),
    propIndex: new Int16Array(CHUNK_AREA).fill(-1), props: [], biomes: new Uint8Array(CHUNK_AREA).fill(255),     // biomes: filled in lazily, one byte per tile
    renderItems: null, boatSpot: null, animals: []
  };
  const x0 = cx * CHUNK_SIZE, y0 = cy * CHUNK_SIZE;
  for (let ly = 0; ly < CHUNK_SIZE; ly++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const tx = x0 + lx, ty = y0 + ly, li = (ly << CHUNK_SHIFT) | lx;
    const tile = T.tile(tx, ty), obj = Village.obj(tx, ty);
    chunk.tiles[li] = tile; chunk.obj[li] = obj;
    chunk.solid[li] = tile === TILE.WATER || obj !== OBJ.NONE ? 1 : 0;
  }
  for (let ly = 0; ly < CHUNK_SIZE; ly++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    const tx = x0 + lx, ty = y0 + ly, li = (ly << CHUNK_SHIFT) | lx;
    const fixed = Village.propAtTile(tx, ty);
    if (fixed) { addChunkProp(chunk, li, withSavedState(world, tx, ty, Object.assign({ hp: 0, alive: true }, fixed))); continue; }
    if (chunk.obj[li] !== OBJ.NONE) continue;
    if (!T.hasTree(tx, ty, chunk.tiles[li])) { addForageable(world, chunk, li, tx, ty); continue; }
    const tree = {
      t: 'tree', x: tx + 0.5 + (hash3(T.seed, tx, ty, 2) - 0.5) * 0.3, y: ty + 0.5 + (hash3(T.seed, tx, ty, 3) - 0.5) * 0.3,
      r: 0.33 / TILE_SCALE, v: Math.floor(hash3(T.seed, tx, ty, 4) * 8), hp: TreeDef.maxHp, alive: true
    };
    if (T.appleTreeAt(tx, ty)) Object.assign(tree, { forage: 'apple_tree', drop: 'apple', ripe: true });      // fruit you can pick; the tree can still be chopped
    addChunkProp(chunk, li, withSavedState(world, tx, ty, tree));
  }
  const tileOf = (tx, ty) => (tx >= x0 && tx < x0 + CHUNK_SIZE && ty >= y0 && ty < y0 + CHUNK_SIZE)
    ? chunk.tiles[((ty - y0) << CHUNK_SHIFT) | (tx - x0)] : T.tile(tx, ty);
  if (chunk.tiles.includes(TILE.WATER) || chunk.tiles.includes(TILE.SHALLOW)) chunk.boatSpot = T.boatSpot(cx, cy, tileOf);
  chunk.animals = T.animalGroup(cx, cy, tileOf);
  return chunk;
}

/** Berry bushes, loose stones and clay deposits: small props you can pick up. A picked one stays gone across chunk reloads until it regrows. */
function addForageable(world, chunk, li, tx, ty) {
  const T = world.terrain, tile = chunk.tiles[li];
  const found = T.bushAt(tx, ty, tile);
  let prop;
  if (found) {
    prop = {
      t: 'bush', x: tx + 0.5 + (hash3(T.seed, tx, ty, 13) - 0.5) * 0.4, y: ty + 0.5 + (hash3(T.seed, tx, ty, 14) - 0.5) * 0.4,
      r: 0.2 / TILE_SCALE, v: Math.floor(hash3(T.seed, tx, ty, 15) * 4), berry: found.berry, drop: found.berry, biome: found.biome
    };
  } else if (T.flaxAt(tx, ty, tile)) {
    prop = {
      t: 'flax', x: tx + 0.5 + (hash3(T.seed, tx, ty, 43) - 0.5) * 0.5, y: ty + 0.5 + (hash3(T.seed, tx, ty, 44) - 0.5) * 0.5,
      r: 0.12 / TILE_SCALE, v: Math.floor(hash3(T.seed, tx, ty, 45) * 4), drop: 'string'
    };
  } else if (T.clayAt(tx, ty, tile)) {
    prop = {
      t: 'clay', x: tx + 0.5 + (hash3(T.seed, tx, ty, 25) - 0.5) * 0.4, y: ty + 0.5 + (hash3(T.seed, tx, ty, 26) - 0.5) * 0.4,
      r: 0.15 / TILE_SCALE, v: Math.floor(hash3(T.seed, tx, ty, 27) * 4), drop: 'clay'
    };
  } else if (T.moundAt(tx, ty, tile)) {
    prop = { t: 'mound', x: tx + 0.5, y: ty + 0.5, r: 0.15 / TILE_SCALE, v: Math.floor(hash3(T.seed, tx, ty, 63) * 4), drop: 'message_bottle' };
  } else if (T.floatingBottleAt(tx, ty, tile)) {
    prop = { t: 'bottle', x: tx + 0.5 + (hash3(T.seed, tx, ty, 64) - 0.5) * 0.4, y: ty + 0.5 + (hash3(T.seed, tx, ty, 65) - 0.5) * 0.4, r: 0.1 / TILE_SCALE, v: Math.floor(hash3(T.seed, tx, ty, 66) * 4), drop: 'message_bottle' };
  } else if (T.stoneAt(tx, ty, tile)) {
    prop = {
      t: 'stone', x: tx + 0.5 + (hash3(T.seed, tx, ty, 17) - 0.5) * 0.5, y: ty + 0.5 + (hash3(T.seed, tx, ty, 18) - 0.5) * 0.5,
      r: 0.12 / TILE_SCALE, v: Math.floor(hash3(T.seed, tx, ty, 19) * 4), drop: 'stone'
    };
  } else return;
  Object.assign(prop, { hp: 0, alive: true, ripe: true });
  addChunkProp(chunk, li, withSavedState(world, tx, ty, prop));
}

/** What players did to this prop (felled it, picked it) survives a chunk being dropped and regenerated. */
function withSavedState(world, tx, ty, prop) {
  const key = tileKey(tx, ty), tree = world.treeStates[key], forage = world.forageStates[key];
  if (tree && prop.t === 'tree') { prop.hp = tree.hp; prop.alive = tree.alive; }
  if (forage && ForageDefs[forageKind(prop)]) prop.ripe = forage.ripe;
  return prop;
}

function addChunkProp(chunk, li, prop) {
  chunk.propIndex[li] = chunk.props.length;
  chunk.props.push(prop);
}
