'use strict';
/* SERVER-SIDE - the abandoned castle is full of slimes. The first time anyone steps into one of the RUINED castle's rooms, slimes ooze out of its corners: more in the big rooms,
 * tougher the deeper in (CastleSlimes.LEVELS, by room). They are ordinary slimes (they leap too), they do not spawn again once beaten, and restoring the castle clears them for good
 * (restored, it is a fine hall: no slimes; if it ever falls to ruin again they come back). The trapdoor in the cellar leads on to a slime dungeon of its own (data/dungeons/castle_crypt.js). */
class CastleSlimes {
  constructor(server) { this.server = server; this.populated = new Set(); }

  /** Called whenever someone arrives on a grid. */
  enter(grid) {
    const g = Grids.parse(grid);
    if (!g || g.kind !== 'room' || this.populated.has(grid)) return;
    const site = BuildingSites.list[g.site];
    if (!site || site.id !== 'castle' || site.def.id !== 'castle_ruins') return;                   // (only while it is a ruin)
    this.populated.add(grid);
    const s = this.server, world = s.grids.get(grid), plan = world.plan, L = plan.layout, key = plan.key || 'gatehall';
    if (!plan.isFloor) return;
    const near = [[L.exit[0] + 0.5, L.exit[1] - 0.5], ...(L.links || []).map(l => [l.x + 0.5, l.y + 0.5])];             // (nobody is ambushed on arrival)
    const tiles = [];
    for (let y = 1; y < L.h - 1; y++) for (let x = 1; x < L.w - 1; x++) {
      if (!plan.isFloor(x, y) || plan.solidAt(x, y) || near.some(([nx, ny]) => Math.hypot(nx - x - 0.5, ny - y - 0.5) < 3.2)) continue;
      tiles.push([x, y]);
    }
    const want = clamp(Math.round(tiles.length / 16), 2, 7), level = CastleSlimes.LEVELS[key] || 4, seed = s.map.terrain.seed;
    for (let i = 0; i < want && tiles.length; i++) {
      const [x, y] = tiles.splice(Math.floor(hash3(seed, i, g.n || 0, 811) * tiles.length), 1)[0];
      const id = s.animals.spawn('slime', x + 0.5, y + 0.5, 0, { level, grid }), a = s.animals.animals[id];
      a.home = { x: x + 0.5, y: y + 0.5 };
    }
  }

  /** Forget a castle's slimes (it was restored, or has fallen to ruin again): the ones alive are gone and its rooms will fill again if they need to. */
  clear(siteIndex) {
    const s = this.server;
    for (const [id, a] of Object.entries(s.animals.animals)) { const g = Grids.parse(gridOf(a)); if (a.type === 'slime' && g && g.kind === 'room' && g.site === siteIndex) delete s.animals.animals[id]; }
    for (const grid of [...this.populated]) { const g = Grids.parse(grid); if (g && g.site === siteIndex) this.populated.delete(grid); }
  }
}
CastleSlimes.LEVELS = Object.freeze({ gatehall: 3, greathall: 5, guardroom: 4, cellar: 6, kitchen: 4, pantry: 3, library: 5, chapel: 5, solar: 6 });
