'use strict';
/* LAYER - cliffs, hills and the cave mouths of the room dungeons. These are HAND-MADE shapes (the STAMPS below, drawn as text) that are dropped, after the
 * land has been generated, at random places in the centre ring. Where a stamp lands it overrides the generated ground; everything outside is untouched.
 * Like the rest of the terrain it is a pure function of the world seed: client and server place exactly the same cliffs.
 *
 *   stamp characters   1 2 3   a cliff you cannot walk through, that high (1 = a low rise, 3 = a tall bluff); drawn as stacked rock
 *                      ,       bare dirt (the cleared yard in front of a cave); no trees, bushes or animal homes grow on it
 *                      S       bare stone you can walk on
 *                      E       a CAVE MOUTH: walkable, and the way into the dungeon (a 'cave' prop with `dungeon` = the dungeon's id)
 *                      .       leave the generated land alone
 * A stamp only lands where every tile it changes is dry land. The first stamp of a `dungeon` kind carries the mouth of the first dungeon, the second the
 * second one's, and so on (js/data/dungeons/). */
const CLIFF_STAMPS = Object.freeze({
  // a bluff with a cave in its southern face (E): cliffs on three sides, a stony yard in front
  cave_hill: Object.freeze({ dungeon: true, rows: [
    '.....11111111....',
    '...1112222221....',
    '..111222333221...',
    '.11122333333221..',
    '.11223333333321..',
    '.11223333333221..',
    '.11122333333221..',
    '..111223333221...',
    '..1122222222211..',
    '..11,,,,E,,,,11..',
    '...,,,,,,,,,,,...',
    '....,,,SS,,,.....'
  ] }),
  // a long low ridge
  ridge: Object.freeze({ rows: [
    '..1111111111111111..',
    '.111222222222222111.',
    '11122233333333222111',
    '.111222222222222111.',
    '..1111111111111111..'
  ] }),
  // a little round hill
  knoll: Object.freeze({ rows: [
    '..1111..',
    '.112211.',
    '11223211',
    '11233211',
    '11223211',
    '.112211.',
    '..1111..'
  ] }),
  // a broken crag: two bluffs and a boulder field between them
  crag: Object.freeze({ rows: [
    '.111......11.',
    '1122111..1221',
    '1223211.12321',
    '1222211.12211',
    '.11111S..111.',
    '..SS......S..',
    '....11.S.....',
    '...1221......',
    '....111......'
  ] })
});
for (const [id, s] of Object.entries(CLIFF_STAMPS)) {                                    // (a typo in a stamp is caught the moment the game starts)
  const w = s.rows[0].length;
  if (!s.rows.every(r => r.length === w && /^[.123,SE]+$/.test(r))) throw new Error(`cliff stamp "${id}" has a ragged row or an unknown character`);
  if (!!s.dungeon !== s.rows.some(r => r.includes('E'))) throw new Error(`cliff stamp "${id}": exactly the dungeon stamps have a cave mouth (E)`);
}

class CaveSites {
  /** @param terrain a TerrainGenerator (its baseTile() is the land before any stamp)  @param rings the ring layer */
  constructor(terrain, rings) {
    this.id = 'caveSites'; this.terrain = terrain; this.rings = rings; this.placed = null; this.mouths = null;
    this.COUNT = { ridge: 4, knoll: 6, crag: 4 };                       // how many of each cliff-only stamp the centre ring gets
    this.reach2 = Infinity; this.bounds = [];
  }

  /** Every stamp that was placed: [{ id, x0, y0, w, h, flip, cave: { index, x, y } | null }], worked out once. */
  list() {
    if (this.placed) return this.placed;
    this.placed = [];                                                    // (set first: asking for tiles while placing sees no stamps)
    const T = this.terrain, seed = T.seed, o = CONFIG.sim.levels.origin, out = [];
    const land = tile => tile === TILE.GRASS || tile === TILE.DIRT || tile === TILE.STONE || tile === TILE.CLAY || tile === TILE.SAND;
    const fits = (stamp, x0, y0) => {                                                          // dry land under the whole footprint and one tile round it
      const w = stamp.rows[0].length, h = stamp.rows.length;
      for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) if (!land(T.baseTile(x0 + x, y0 + y))) return false;
      return true;
    };
    const clear = (x0, y0, w, h) => out.every(p => x0 > p.x0 + p.w + 5 || p.x0 > x0 + w + 5 || y0 > p.y0 + p.h + 5 || p.y0 > y0 + h + 5);
    const place = (id, key, minR, maxR, tries) => {
      const stamp = CLIFF_STAMPS[id], w = stamp.rows[0].length, h = stamp.rows.length;
      for (let attempt = 0; attempt < tries; attempt++) {
        const grow = 1 + attempt / 40, angle = hash3(seed, key, attempt, 91) * Math.PI * 2, radius = minR + hash3(seed, key, attempt, 92) * (maxR - minR) * grow;
        const x0 = Math.floor(o.x + Math.cos(angle) * radius - w / 2), y0 = Math.floor(o.y + Math.sin(angle) * radius - h / 2), flip = hash3(seed, key, attempt, 93) < 0.5;
        if (this.rings.at(x0 + w / 2, y0 + h / 2).index !== 0 || !clear(x0, y0, w, h) || !fits(stamp, x0, y0)) continue;
        const p = { id, x0, y0, w, h, flip, cave: null };
        if (stamp.dungeon) {                                                                    // find the E, and keep the mouth's position
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (stamp.rows[y][flip ? w - 1 - x : x] === 'E') p.cave = { index: out.filter(q => q.cave).length, x: x0 + x + 0.5, y: y0 + y + 0.5 };
        }
        out.push(p);
        return true;
      }
      return false;
    };
    const dungeons = Math.max(1, typeof Dungeons !== 'undefined' ? Dungeons.size : 1);
    for (let d = 0; d < dungeons; d++) place('cave_hill', 100 + d, 75, 190, 400);               // the dungeons' mouths first, so nothing else takes their ground
    let key = 0;
    for (const id of Object.keys(this.COUNT)) for (let i = 0; i < this.COUNT[id]; i++) place(id, key++, 50, 280, 60);
    this.placed = out;
    this.bounds = out.map(p => ({ p, x1: p.x0 + p.w, y1: p.y0 + p.h }));
    const far = out.reduce((m, p) => Math.max(m, Math.hypot(p.x0 + p.w / 2 - o.x, p.y0 + p.h / 2 - o.y) + Math.max(p.w, p.h)), 0);
    this.reach2 = far * far;                                                                      // (every other tile is far from every stamp: one comparison says so)
    return out;
  }

  /** The stamp character at a tile ('.' when no stamp touches it). */
  charAt(tx, ty) {
    if (!this.placed) this.list();
    const o = CONFIG.sim.levels.origin, dx = tx - o.x, dy = ty - o.y;
    if (dx * dx + dy * dy > this.reach2) return '.';
    for (const b of this.bounds) {
      const p = b.p;
      if (tx < p.x0 || ty < p.y0 || tx >= b.x1 || ty >= b.y1) continue;
      const row = CLIFF_STAMPS[p.id].rows[ty - p.y0];
      return row[p.flip ? p.w - 1 - (tx - p.x0) : tx - p.x0];
    }
    return '.';
  }
  /** The ground a stamp forces on this tile, or -1 to leave the generated land. */
  tileAt(tx, ty) {
    const c = this.charAt(tx, ty);
    return c === '.' ? -1 : c === ',' || c === 'E' ? TILE.DIRT : TILE.STONE;
  }
  /** The solid thing a stamp stands on this tile (a cliff of height 1-3), or OBJ.NONE. */
  objAt(tx, ty) {
    const c = this.charAt(tx, ty);
    return c === '1' ? OBJ.CLIFF1 : c === '2' ? OBJ.CLIFF2 : c === '3' ? OBJ.CLIFF3 : OBJ.NONE;
  }
  /** Does a stamp own this tile? (nothing grows or lives there but the stamp itself) */
  covers(tx, ty) { return this.charAt(tx, ty) !== '.'; }

  /** The dungeon mouths: [{ index, dungeon, x, y, ring }]. `index` counts the dungeons (js/data/dungeons/ order). Worked out once. */
  caves() {
    if (!this.mouths) { const defs = Dungeons.all(); this.mouths = this.list().filter(p => p.cave && defs[p.cave.index]).map(p => ({ index: p.cave.index, dungeon: defs[p.cave.index].id, x: p.cave.x, y: p.cave.y, ring: 0 })); }
    return this.mouths;
  }
}
