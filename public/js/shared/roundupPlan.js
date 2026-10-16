'use strict';
/* SHARED - the Round-Up arena (js/data/minigames/roundup.js): a meadow in the style of the starter area, fenced all round with old wooden rails, a pole at each end for each side,
 * trees all round outside the fence and wild flowers inside. It is an INSTANCE like a room or a cave (js/shared/grids.js): the grid 'roundup:<n>', built by the server when a
 * round starts and by each player's client when they are taken in, from this plan alone, so every machine builds the same arena. (The rules: roundupSystem.js.)
 *
 * Coordinates are the grid's own: the meadow spans (0, 0) .. (2 margin + w, 2 margin + h), the fence stands on the edge of the box (margin, margin) .. (margin + w, margin + h) and
 * everything beyond the meadow is dark. Side 0 defends the west pole (small x), side 1 the east pole; on screen they are the upper-left and lower-right ends. */
const RoundupArena = (() => {
  const def = Minigames.get('roundup'), A = def.arena, M = A.margin, W = A.w, H = A.h;
  const box = Object.freeze({ x0: M, y0: M, x1: M + W, y1: M + H });                           // inside the fence
  const outer = Object.freeze({ x0: 0, y0: 0, x1: 2 * M + W, y1: 2 * M + H });                 // the whole meadow
  const midY = M + Math.floor(H / 2) + 0.5;
  const poles = Object.freeze([{ x: M + A.inset, y: midY }, { x: M + W - A.inset, y: midY }].map(Object.freeze));
  const SLOT_RADIUS = 1.9, FACING = [0, Math.PI];                                             // sheep tied to a pole stand in a ring round it; slot 0 faces the middle of the arena

  /** Where the k-th sheep of a side's pole stands. */
  function slot(team, k) {
    const a = FACING[team] + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI * 2 / A.slots), pole = poles[team];
    return { x: pole.x + Math.cos(a) * SLOT_RADIUS, y: pole.y + Math.sin(a) * SLOT_RADIUS * 0.9 };
  }
  /** Where the k-th person of a side starts: between their pole and the middle. */
  function start(team, k) { const pole = poles[team], dir = team ? -1 : 1; return { x: pole.x + dir * 3.4, y: midY + (k % 2 ? 1 : -1) * (1.2 + Math.floor(k / 2) * 1.8) }; }
  /** Sheep start in the middle third, spread out: n points, at least `gap` apart (a pure function of n and the salt). */
  function sheepSpots(n, salt = 1) {
    const out = [], cx = (box.x0 + box.x1) / 2, rx = W / 2 - A.inset - 5, ry = H / 2 - 2.5;
    for (let i = 0, tries = 0; out.length < n && tries < 400; tries++, i++) {
      const x = cx + (hash3(salt, i, 1, 11) * 2 - 1) * rx, y = midY + (hash3(salt, i, 2, 11) * 2 - 1) * ry;
      if (out.every(o => Math.hypot(o.x - x, o.y - y) >= 2.2)) out.push({ x, y });
    }
    return out;
  }
  /** Is this point inside the fence (with room for a body of radius r)? */
  const inside = (x, y, r = 0) => x >= box.x0 + r && x <= box.x1 - r && y >= box.y0 + r && y <= box.y1 - r;
  const clampIn = (o, r) => { o.x = clamp(o.x, box.x0 + r, box.x1 - r); o.y = clamp(o.y, box.y0 + r, box.y1 - r); };
  return { def, A, M, W, H, box, outer, poles, midY, slot, start, sheepSpots, inside, clampIn, SLOT_RADIUS };
})();

class RoundupPlan {
  constructor(grid, n) { this.grid = grid; this.n = n; this.seed = 8101 + n * 17; this.arena = RoundupArena; }
  tileAt(tx, ty) { const o = RoundupArena.outer; return tx >= o.x0 && ty >= o.y0 && tx < o.x1 && ty < o.y1 ? TILE.GRASS : TILE.CAVE_WALL; }
  objAt() { return OBJ.NONE; }
  /** Nothing outside the fence can be walked on (the trees and the dark); the fence itself is a row of rails (decorate). */
  solidAt(tx, ty) { const b = RoundupArena.box; return tx < b.x0 || ty < b.y0 || tx >= b.x1 || ty >= b.y1; }
  entryPoint() { return RoundupArena.start(0, 0); }
  exitPoint() { return { x: (RoundupArena.box.x0 + RoundupArena.box.x1) / 2, y: RoundupArena.midY }; }

  /** The fence: wooden rails (the same pieces players build, js/shared/buildSystem.js) along the four edges of the box, placed on the grid's world by whoever builds it. */
  decorate(world) {
    const b = RoundupArena.box;
    for (let tx = b.x0; tx < b.x1; tx++) { BuildSystem.place(world, tx, b.y0, 'wood_fence', 'n'); BuildSystem.place(world, tx, b.y1 - 1, 'wood_fence', 's'); }
    for (let ty = b.y0; ty < b.y1; ty++) { BuildSystem.place(world, b.x0, ty, 'wood_fence', 'w'); BuildSystem.place(world, b.x1 - 1, ty, 'wood_fence', 'e'); }
  }

  /** The poles, the trees round the outside and the flowers on the grass, in chunk (cx, cy): [{ tile: [tx, ty], prop }]. */
  propsIn(cx, cy) {
    const out = [], x0 = cx * CHUNK_SIZE, y0 = cy * CHUNK_SIZE, b = RoundupArena.box, o = RoundupArena.outer, seed = this.seed;
    RoundupArena.poles.forEach((p, team) => {
      const tx = Math.floor(p.x), ty = Math.floor(p.y);
      if (tx >= x0 && tx < x0 + CHUNK_SIZE && ty >= y0 && ty < y0 + CHUNK_SIZE) out.push({ tile: [tx, ty], prop: { t: 'roundup_pole', x: p.x, y: p.y, r: 0.3 / TILE_SCALE, v: team, team } });
    });
    for (let ty = Math.max(y0, o.y0); ty < Math.min(y0 + CHUNK_SIZE, o.y1); ty++) for (let tx = Math.max(x0, o.x0); tx < Math.min(x0 + CHUNK_SIZE, o.x1); tx++) {
      const inBox = tx >= b.x0 && ty >= b.y0 && tx < b.x1 && ty < b.y1;
      if (inBox) {                                                                       // wild flowers and a few bushes on the meadow, never by a pole
        const h = hash3(seed, tx, ty, 21);
        if (h < 0.07 && RoundupArena.poles.every(p => Math.hypot(p.x - tx - 0.5, p.y - ty - 0.5) > 3.2)) out.push({ tile: [tx, ty], prop: { t: 'flowers', x: tx + 0.5 + (hash3(seed, tx, ty, 22) - 0.5) * 0.5, y: ty + 0.5 + (hash3(seed, tx, ty, 23) - 0.5) * 0.5, r: 0, v: Math.floor(hash3(seed, tx, ty, 24) * 4) } });
        continue;
      }
      const d = Math.max(b.x0 - tx - 1, tx - b.x1, b.y0 - ty - 1, ty - b.y1, 0) + 1;       // how far outside the fence: 1 = the row against it
      if (d < 2) continue;                                                               // (a clear walk of grass against the rails)
      const h = hash3(seed, tx, ty, 31);
      if (h < (d < 4 ? 0.22 : 0.62)) out.push({ tile: [tx, ty], prop: { t: 'tree', x: tx + 0.5 + (hash3(seed, tx, ty, 32) - 0.5) * 0.4, y: ty + 0.5 + (hash3(seed, tx, ty, 33) - 0.5) * 0.4, r: 0.33 / TILE_SCALE, v: Math.floor(hash3(seed, tx, ty, 34) * 8), hp: TreeDef.maxHp, alive: true } });
    }
    return out;
  }
}
