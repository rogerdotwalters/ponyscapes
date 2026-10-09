'use strict';
/* SERVER-SIDE - wild ponies come and go with the mornings. Ponies have no animal home (see animalSystem.js: nodes): each BIOME REGION (one stretch of
 * one biome: BiomeLayer.regionKey) may hold at most `perBiome` wild ponies (a biome's own `ponyMax` overrides it), and they are not all there from the start.
 * Every morning (CONFIG.sim.wildPonies.morningHour) the game rolls, for each region a player is near: every wild pony there may leave (only once nobody can
 * see it go), and every free place may be taken by a newcomer, who walks into view near a player rather than appearing in front of them.
 * Ponies somebody caught or owns are not wild any more: they never leave and free their place. */
class WildPonies {
  constructor(server) { this.s = server; this.regions = {}; this.leaving = new Set(); }

  /** Which morning it is: counts up each time the clock passes the morning hour (so a night skipped by sleeping still counts). */
  morningAt(tick) { return Math.floor((GameSettings.totalHours(tick) - CONFIG.sim.wildPonies.morningHour) / 24); }

  isWild(a) { return !!a && AnimalDefs[a.type].pony && !a.owner && !a.captor && !a.rider && !a.grid; }
  cap(biome) { const b = Biomes.get(biome); return b && Number.isFinite(b.ponyMax) ? b.ponyMax : CONFIG.sim.wildPonies.perBiome; }
  /** The wild ponies that belong to a region. */
  inRegion(key) { return Object.values(this.s.animals.animals).filter(a => a.regionKey === key && this.isWild(a)); }

  /** Called every tick; the work happens every two seconds, near players only. */
  update(tick) {
    if (tick % 60 !== 0) return;
    const humans = this.s._humans().filter(h => !gridOf(h));                   // (wild ponies live in the overworld)
    if (!humans.length) return;
    this._leave(humans);
    const W = CONFIG.sim.wildPonies, map = this.s.map, rng = this.s.rng, morning = this.morningAt(tick);
    for (const h of humans) {
      for (let n = 0; n < W.samples; n++) {
        const angle = rng() * Math.PI * 2, dist = W.spawnMin + rng() * (W.spawnMax - W.spawnMin);
        const x = h.x + Math.cos(angle) * dist, y = h.y + Math.sin(angle) * dist, tx = Math.floor(x), ty = Math.floor(y), tile = map.tile(tx, ty);
        if ((tile !== TILE.GRASS && tile !== TILE.DIRT) || map.navBlocked(tx, ty) || Village.influence(tx, ty) >= 1) continue;
        if (humans.some(o => Math.hypot(o.x - x, o.y - y) < W.spawnMin)) continue;         // never in front of anyone
        const key = map.layers.biomes.regionKey(tx, ty), r = this.regions[key] || (this.regions[key] = { key, morning: null, pending: 0 });
        if (r.morning !== morning) this._roll(r, morning, tx, ty);
        if (r.pending > 0 && this._place(r, x, y)) r.pending--;
      }
    }
  }

  /** The morning's roll for one region. */
  _roll(r, morning, tx, ty) {
    const W = CONFIG.sim.wildPonies, map = this.s.map, rng = this.s.rng, biome = map.biome(tx, ty), cap = this.cap(biome);
    const here = this.inRegion(r.key), first = r.morning === null;
    let staying = here.length;
    if (!first) for (const a of here) if (rng() < W.leaveChance) { this.leaving.add(a.id); staying--; }
    const free = Math.max(0, cap - staying), chance = first ? W.startFill : W.arriveChance;
    r.pending = 0;
    for (let i = 0; i < free; i++) if (rng() < chance) r.pending++;
    r.morning = morning; r.biome = biome;
  }

  /** A newcomer arrives at (x, y). Returns whether a pony could be made (some biomes have none to offer). */
  _place(r, x, y) {
    const map = this.s.map, ring = map.layers.zones.faunaAt(x, y), pool = Fauna.poolAt(ring, r.biome).filter(f => f.pony);
    if (!pool.length) { r.pending = 0; return false; }
    let roll = this.s.rng() * pool.reduce((n, f) => n + f.weight, 0), pick = pool[0];
    for (const f of pool) if ((roll -= f.weight) < 0) { pick = f; break; }
    const id = this.s.animals.spawn(pick.id, x, y);
    this.s.animals.animals[id].regionKey = r.key;
    return true;
  }

  /** Ponies that decided to leave go once nobody is close enough to see it; a pony that got caught meanwhile stays. */
  _leave(humans) {
    const W = CONFIG.sim.wildPonies, animals = this.s.animals.animals;
    for (const id of [...this.leaving]) {
      const a = animals[id];
      if (!a || !this.isWild(a)) { this.leaving.delete(id); continue; }
      if (humans.some(h => Math.hypot(h.x - a.x, h.y - a.y) < W.hideDistance)) continue;
      delete animals[id]; this.leaving.delete(id);
    }
  }
}
