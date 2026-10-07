'use strict';
/* SHARED - groves: trees you plant. A felled tree drops saplings of its species (data/trees/trees.js); hold one and press the interact key at
 * open grass or dirt in the overworld (one of its seasons) and it takes. Every new day it grows a day, whatever the weather, until it has grown
 * its species' days: then it is a full tree like any other (chop it, pick its apples; felled, it grows back like the wild ones).
 *
 * State lives in the FARM table (map.farm, farming.js), under keys of their own: "g<tx>,<ty>" -> { t: species, d: days grown, g: 1 once grown }.
 * So it is sent to every player and saved with the world exactly like the fields. A grown one becomes a real tree prop in its chunk (here, for
 * a chunk already loaded, and on generation for one that is not). */
const Groves = {
  key: (tx, ty) => 'g' + tx + ',' + ty,
  isKey: key => key.charCodeAt(0) === 103,                                         // 'g'
  tileOf(key) { const i = key.indexOf(','); return [+key.slice(1, i), +key.slice(i + 1)]; },
  at: (map, tx, ty) => (map && map.farm && map.farm[Groves.key(tx, ty)]) || null,
  /** The tile a step ahead of you (where a sapling goes). */
  frontTile: p => [Math.floor(p.x + Math.cos(p.facing) * 0.9), Math.floor(p.y + Math.sin(p.facing) * 0.9)],
  inSeason(sp, seasonIndex) { const t = TreeSpecies.get(sp); return !!t && t.seasons.includes(Seasons.LIST[seasonIndex].id); },
  seasonNames: sp => { const t = TreeSpecies.get(sp); return t ? t.seasons.map(s => Seasons.byId(s).name).join(' and ') : ''; },
  /** 0..1: how far a sapling has grown. */
  growth(entry) { const t = TreeSpecies.get(entry.t); return entry.g ? 1 : Math.min(1, (entry.d | 0) / Math.max(1, t ? t.days : 6)); },
  /** Open grass or dirt in the overworld, nothing on the tile (no tree, prop, building, farm plot or sapling), not in the village's streets. */
  plantable(map, tx, ty) {
    if (!map || map.grid || map.kind !== 'world') return false;
    const t = map.tile(tx, ty);
    if (t !== TILE.GRASS && t !== TILE.DIRT) return false;
    if (map.objAt(tx, ty) || map.built[tileKey(tx, ty)] || (map.floors && map.floors[tileKey(tx, ty)]) || BuildingSites.at(tx, ty) || Village.blocksTrees(tx, ty)) return false;
    if (map.propAt(tx, ty) || Groves.at(map, tx, ty)) return false;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) if (Farming.plotAt(map, tx * 2 + sx, ty * 2 + sy)) return false;
    return true;
  },
  /** The tree a grown sapling becomes. */
  treeProp(map, tx, ty, sp) {
    const def = TreeSpecies.get(sp) || TreeSpecies.get('oak'), h = hash3(map.terrain.seed, tx, ty, 91);
    const tree = { t: 'tree', sp: def.id, x: tx + 0.5, y: ty + 0.5, r: 0.33 / TILE_SCALE, v: 2 * Math.floor(h * 4) + (def.look === 'pine' ? 1 : 0), hp: TreeDef.maxHp, alive: true };
    if (def.fruit) Object.assign(tree, { forage: 'apple_tree', drop: map.terrain.appleKindAt ? map.terrain.appleKindAt(tx, ty) : 'apple', ripe: true });
    return withSavedState(map, tx, ty, tree);
  },
  /** Put a grown tree into its chunk (if that chunk is loaded and the tile is still free). */
  place(map, tx, ty, entry, chunk = map.peekChunkOfTile(tx, ty)) {
    if (!chunk || !entry.g) return;
    const li = ((ty & CHUNK_MASK) << CHUNK_SHIFT) | (tx & CHUNK_MASK);
    if (chunk.propIndex[li] >= 0) return;
    addChunkProp(chunk, li, Groves.treeProp(map, tx, ty, entry.t));
    chunk.renderItems = null;                                                      // (the renderer's list of what stands in the chunk)
  },
  /** Every grown tree into the loaded chunks (a player's machine, after the farm arrives). */
  sync(map) { if (map && map.farm) for (const key in map.farm) if (Groves.isKey(key)) { const [tx, ty] = Groves.tileOf(key); Groves.place(map, tx, ty, map.farm[key]); } },
  /** A chunk being generated takes the grown trees planted in it. */
  intoChunk(world, chunk) {
    if (!world.farm) return;
    const x0 = chunk.cx * CHUNK_SIZE, y0 = chunk.cy * CHUNK_SIZE;
    for (const key in world.farm) {
      if (!Groves.isKey(key)) continue;
      const [tx, ty] = Groves.tileOf(key);
      if (tx >= x0 && tx < x0 + CHUNK_SIZE && ty >= y0 && ty < y0 + CHUNK_SIZE) Groves.place(world, tx, ty, world.farm[key], chunk);
    }
  }
};

/* ---- planting (the interact key; client + server) ---- */
function findGroveInteraction(map, p, heldItemId) {
  const held = heldItemId && ItemDefs[heldItemId];
  if (!held || !held.sapling) return null;
  const [tx, ty] = Groves.frontTile(p);
  return Groves.plantable(map, tx, ty) ? { kind: 'plant_tree', label: 'Plant ' + held.name, dist: 0.35, tx, ty } : null;
}
Interactions.extra.push(findGroveInteraction);
InteractionHandlers.plant_tree = (server, id, p, action) => server._plantTree(id, p, action);

/* ---- the server side ---- */
Object.assign(GameServer.prototype, {
  _plantTree(id, p, action) {
    const inventory = this.inventories[id], slot = p.sel | 0, s = inventory.slots[slot], def = s && ItemDefs[s.id];
    if (!def || !def.sapling) { this._notice(id, 'Hold a sapling to plant it'); return; }
    if (!Groves.plantable(this.map, action.tx, action.ty)) { this._notice(id, 'Plant it on open grass or dirt, with nothing on the spot'); return; }
    const season = Seasons.at(this.tick), species = TreeSpecies.get(def.sapling);
    if (!Groves.inSeason(def.sapling, season.index)) { this._notice(id, `${species.name} saplings only take in ${Groves.seasonNames(def.sapling)}: it is ${season.season.name} now`); return; }
    s.count--; if (s.count <= 0) inventory.slots[slot] = null;
    this._farm()[Groves.key(action.tx, action.ty)] = { t: def.sapling, d: 0 };
    this.inventoryRev[id]++; this._farmChanged(); this.progress.award(id, 'foraging', 6);
    this.pendingEvents.push({ type: 'planted', x: action.tx + 0.5, y: action.ty + 0.5 });
    this._notice(id, `${def.name} planted: ${/^[aeiou]/i.test(species.name) ? "an" : "a"} ${species.name.toLowerCase()} in ${species.days} days`);
  },
  /** A new day for one sapling (called from the farm's new day): it grows, and once grown stands as a tree. */
  _growGrove(key, entry) {
    if (entry.g) return;
    const def = TreeSpecies.get(entry.t);
    if (!def) return;
    entry.d = (entry.d | 0) + 1;
    if (entry.d < def.days) return;
    entry.g = 1;
    const [tx, ty] = Groves.tileOf(key);
    Groves.place(this.map, tx, ty, entry);
  }
});
