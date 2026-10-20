'use strict';
/* SHARED - buried treasure and the maps that lead to it.
 *
 * Treasure sites are a PURE function of the world seed (like terrain): about one chunk in ten hides a chest somewhere
 * on its land. A treasure map picks the nearest undug site that is far enough away to be worth the trip. Digging
 * with a shovel within a tile or so of the spot unearths it; dug sites are remembered on the World. */
const TREASURE = Object.freeze({
  chunkChance: 0.10,
  minMapDistance: 28, maxMapDistance: 260,         // tiles from the player when the map is read
  digRange: 1.3, warmRange: 6,                     // how close you must dig / when the shovel says "warm"
  maxMaps: 5
});
const TREASURE_EXTRAS = Object.freeze([
  { item: 'torch', min: 2, max: 4 }, { item: 'rope', min: 2, max: 3 }, { item: 'string', min: 3, max: 6 },
  { item: 'arrow', min: 6, max: 12 }, { item: 'apple', min: 4, max: 8 }, { item: 'brick', min: 3, max: 6 }, { item: 'leash', min: 1, max: 1 }
]);
const TREASURE_RARE = Object.freeze(['crown_frost', 'crown_star', 'dress_star', 'garb_midnight', 'cape_star', 'crown_gold', 'cape_royal']);

const TreasureSites = {
  /** The hidden spot of this chunk's treasure, or null. { tx, ty, key } */
  inChunk(map, cx, cy) {
    const T = map.terrain;
    if (hash3(T.seed, cx, cy, 70) >= TREASURE.chunkChance) return null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const tx = cx * CHUNK_SIZE + Math.floor(hash3(T.seed, cx, cy, 71 + attempt) * CHUNK_SIZE);
      const ty = cy * CHUNK_SIZE + Math.floor(hash3(T.seed, cx, cy, 81 + attempt) * CHUNK_SIZE);
      const tile = T.tile(tx, ty);
      if ((tile === TILE.GRASS || tile === TILE.DIRT || tile === TILE.SAND || tile === TILE.CLAY) && Village.influence(tx, ty) < 1) return { tx, ty, key: tileKey(tx, ty) };
    }
    return null;
  },

  /** The nearest undug site that is between min and max distance away and not in `exclude` (a Set of keys). */
  findFor(map, x, y, exclude) {
    const cx0 = Math.floor(x) >> CHUNK_SHIFT, cy0 = Math.floor(y) >> CHUNK_SHIFT, span = Math.ceil(TREASURE.maxMapDistance / CHUNK_SIZE) + 1;
    let best = null;
    for (let cy = cy0 - span; cy <= cy0 + span; cy++) for (let cx = cx0 - span; cx <= cx0 + span; cx++) {
      const site = TreasureSites.inChunk(map, cx, cy);
      if (!site || map.treasureDug[site.key] || (exclude && exclude.has(site.key))) continue;
      const d = Math.hypot(site.tx + 0.5 - x, site.ty + 0.5 - y);
      if (d >= TREASURE.minMapDistance && d <= TREASURE.maxMapDistance && (!best || d < best.dist)) best = Object.assign({ dist: d }, site);
    }
    return best;
  },

  /** An undug site within `range` of a point (its centre), or null. */
  near(map, x, y, range) {
    const cx0 = Math.floor(x) >> CHUNK_SHIFT, cy0 = Math.floor(y) >> CHUNK_SHIFT;
    for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
      const site = TreasureSites.inChunk(map, cx, cy);
      if (site && !map.treasureDug[site.key] && Math.hypot(site.tx + 0.5 - x, site.ty + 0.5 - y) <= range) return site;
    }
    return null;
  },

  /** What a chest holds: coins, a couple of useful things, and now and then a rare crown, outfit or cape. */
  rollLoot(rng) {
    const loot = [{ item: 'gold_coin', count: 25 + Math.floor(rng() * 60) }];
    const pool = TREASURE_EXTRAS.slice();
    for (let i = 0; i < 2; i++) { const e = pool.splice(Math.floor(rng() * pool.length), 1)[0]; loot.push({ item: e.item, count: e.min + Math.floor(rng() * (e.max - e.min + 1)) }); }
    if (rng() < 0.2) loot.push({ item: TREASURE_RARE[Math.floor(rng() * TREASURE_RARE.length)], count: 1 });
    return loot;
  }
};

/** Digging: a mound of sand with a bottle in it, or a place where treasure is buried. */
class ShovelHandler {
  /** @param {{map, getInventory, emit, getPlayer, pickUp:(id, found)=>void, digTreasure:(id, site)=>void, mapSitesOf:(id)=>Array}} deps */
  constructor(deps) { Object.assign(this, deps); this.warmAt = {}; }

  find(p, tool, id) {
    if (gridOf(p)) return null;                                          // (nothing to dig indoors or in a cave)
    const mound = findForageable(this.map, p, tool.reach, 'shovel');
    if (mound && forageKind(mound.prop) === 'mound') return { ref: 'm' + tileKey(mound.tx, mound.ty), kind: 'mound', x: mound.prop.x, y: mound.prop.y, found: mound };
    const site = TreasureSites.near(this.map, p.x, p.y, TREASURE.digRange);
    if (site) return { ref: 't' + site.key, kind: 'treasure', x: site.tx + 0.5, y: site.ty + 0.5, site };
    this._hintWarm(p, id);
    return null;
  }

  isValid(p, target, tool) {
    if (target.kind === 'mound') { const prop = this.map.propAt(target.found.tx, target.found.ty); return !!prop && !!prop.ripe && Math.hypot(prop.x - p.x, prop.y - p.y) <= tool.reach + IMPACT_REACH_SLACK; }
    return !this.map.treasureDug[target.site.key] && Math.hypot(target.x - p.x, target.y - p.y) <= TREASURE.digRange + IMPACT_REACH_SLACK;
  }

  apply(id, target) { if (target.kind === 'mound') this.pickUp(id, target.found); else this.digTreasure(id, target.site); }

  /** Digging near a mapped treasure but not on it: "warmer" feedback. */
  _hintWarm(p, id) {
    const sites = this.mapSitesOf(id) || [];
    const close = sites.find(s => Math.hypot(s.tx + 0.5 - p.x, s.ty + 0.5 - p.y) <= TREASURE.warmRange);
    if (close) this.emit({ type: 'notice', to: id, text: 'The ground feels different here... keep digging nearby' });
  }
}
