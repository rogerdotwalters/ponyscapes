'use strict';
/* SHARED (server side) - the world's plants grow on after it is generated. Once a day, every standing tree near a player has a small chance to seed a SAPLING of its
 * own kind on a free tile beside it (the species' `spread` in js/data/trees/trees.js). The sapling is an ordinary planted one (groves.js): it shows, it is sent
 * to everyone, it is saved with the world, and after the species' `days` it stands as a full tree. So a grove thickens, a meadow slowly fills with its apples.
 *
 * Rules, so the world stays what its zones say it is:
 *   - only a species its biome's plant list allows (js/data/flora/): no pine ever sprouts in the Orchard, no oak in the Meadow
 *   - only in a season the species takes in, only on free open ground (never a wall, a gateway, a path, the village, a field)
 *   - never crowded: at most `crowd` trees and saplings within 2 tiles of the new one
 *   - a handful of sprouts a day and a cap on saplings waiting to grow, so nothing runs away
 *   - only near players (the rest of the world is not loaded; it is never ahead of what anyone sees) */
const FLORA = Object.freeze({ maxSproutsPerDay: 12, maxSaplings: 300, activeRadius: 90, crowdRadius: 2 });

const FloraRules = {
  /** Trees and saplings within `r` tiles of (tx, ty). */
  crowd(map, tx, ty, r) {
    let n = 0;
    for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
      const p = map.peekPropAt(x, y);
      if ((p && p.t === 'tree') || Groves.at(map, x, y)) n++;
    }
    return n;
  },
  /** Can `species` sprout on this tile? (the biome, the ground and the crowding; not the season) */
  canSprout(map, species, tx, ty, crowd) {
    const T = map.terrain;
    if (!Groves.plantable(map, tx, ty) || (T.isGate && T.isGate(tx, ty)) || T.layers.zones.wallDistance(tx, ty) < 2) return false;
    if (!Flora.allows(T.layers.biomes.at(tx, ty), species)) return false;
    return FloraRules.crowd(map, tx, ty, FLORA.crowdRadius) < crowd;
  }
};

Object.assign(GameServer.prototype, {
  /** One new day (`prev` is the day that ended): seed saplings round the trees near players. Returns how many sprouted. */
  _spreadFlora(prev) {
    const map = this.map, farm = this._farm(), season = Seasons.indexOfDay(prev + 1), humans = this._humans().filter(h => !gridOf(h));
    if (!humans.length) return 0;
    let waiting = 0; for (const key in farm) if (Groves.isKey(key) && !farm[key].g) waiting++;
    let budget = Math.min(FLORA.maxSproutsPerDay, FLORA.maxSaplings - waiting), sprouted = 0;
    if (budget <= 0) return 0;
    const near = chunk => humans.some(h => Math.hypot(chunk.cx * CHUNK_SIZE + 8 - h.x, chunk.cy * CHUNK_SIZE + 8 - h.y) < FLORA.activeRadius);
    const chunks = [...map.chunks.values()].filter(near);
    for (let i = chunks.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [chunks[i], chunks[j]] = [chunks[j], chunks[i]]; }      // (no corner of the map always goes first)
    for (const chunk of chunks) for (const prop of chunk.props) {
      if (budget <= 0) return sprouted;
      if (prop.t !== 'tree' || !prop.alive) continue;
      const sp = TreeSpecies.of(prop), def = TreeSpecies.get(sp), rule = def && def.spread;
      if (!rule || !def.seasons.includes(Seasons.LIST[season].id)) continue;
      const here = map.terrain.layers.biomes.at(Math.floor(prop.x), Math.floor(prop.y)), boost = (Flora.get(here) || {}).spreadBoost;
      if (this.rng() >= rule.chance * (boost === undefined ? 1 : boost)) continue;
      const tx = Math.floor(prop.x) + Math.round((this.rng() * 2 - 1) * rule.range), ty = Math.floor(prop.y) + Math.round((this.rng() * 2 - 1) * rule.range);
      if (!FloraRules.canSprout(map, sp, tx, ty, rule.crowd)) continue;
      farm[Groves.key(tx, ty)] = { t: sp, d: 0 };
      budget--; sprouted++;
    }
    if (sprouted) this._farmChanged();
    return sprouted;
  }
});
