'use strict';
/* LAYER - dungeon sites. Each ring hides ONE cave somewhere random inside it (a pure function of the world seed). Entering it takes you to that
 * ring's dungeon in cave space; the boss inside is what unlocks the next ring. */
class DungeonLayer {
  constructor(terrain, rings) { this.id = 'dungeons'; this.terrain = terrain; this.rings = rings; this.cache = {}; }
  /** { ring, x, y } : the cave mouth for a ring, on open ground inside that ring. */
  site(ring) {
    if (this.cache[ring]) return this.cache[ring];
    const o = CONFIG.sim.levels.origin, W = this.rings.width, seed = this.terrain.seed;
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = hash3(seed, ring, attempt, 81) * Math.PI * 2;
      const radius = ring === 0 ? 130 + hash3(seed, ring, attempt, 82) * 200 : ring * W + W * (0.2 + 0.6 * hash3(seed, ring, attempt, 82));
      const tx = Math.floor(o.x + Math.cos(angle) * radius), ty = Math.floor(o.y + Math.sin(angle) * radius), tile = this.terrain.tile(tx, ty);
      if ((tile !== TILE.GRASS && tile !== TILE.DIRT) || this.terrain.hasTree(tx, ty, tile) || this.rings.at(tx + 0.5, ty + 0.5).index !== ring) continue;
      return (this.cache[ring] = { ring, x: tx + 0.5, y: ty + 0.5 });
    }
    return (this.cache[ring] = { ring, x: o.x + (ring + 1) * 150, y: o.y + 0.5 });                 // (practically unreachable fallback)
  }
  sites() { return Array.from({ length: this.rings.count }, (_, i) => this.site(i)); }
  nearestTo(x, y, range) { return this.sites().filter(s => Math.hypot(s.x - x, s.y - y) <= range).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0] || null; }
}
