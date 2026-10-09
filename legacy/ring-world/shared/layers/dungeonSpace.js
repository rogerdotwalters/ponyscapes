'use strict';
/* LAYER - the shape of a cave. Each ring's cave is its own GRID (js/shared/grids.js: 'cave:<ring>'), so these are local coordinates from (0, 0):
 * a pure function of (cave number, tile): an entry hall, a winding corridor, and a round boss arena. Everything outside is rock. */
const DungeonSpace = {
  SIZE: 64, COUNT: 5,
  entry() { return { x: 8.5, y: 31.5 }; },      // where you arrive
  exit() { return { x: 5.5, y: 31.5 }; },       // the way back out (a glowing portal)
  arena() { return { x: 42.5, y: 32.5 }; },     // where the boss waits
  /** The tile at (lx, ly) of cave `index`. */
  tileAt(index, lx, ly) {
    if (lx < 0 || ly < 0 || lx >= DungeonSpace.SIZE || ly >= DungeonSpace.SIZE) return TILE.CAVE_WALL;
    const rough = hash3(index, lx, ly, 5) * 1.6;                                                           // ragged cave edges
    if (lx >= 4 && lx <= 13 && ly >= 27 && ly <= 36 && (lx > 4 && lx < 13 && ly > 27 && ly < 36 || rough > 0.5)) return TILE.CAVE;
    if (lx >= 13 && lx <= 33 && Math.abs(ly - (31.5 + 2.2 * Math.sin(lx * 0.55 + index))) <= 1.7) return TILE.CAVE;
    if (Math.hypot(lx - 42.5, ly - 32.5) < 13 + rough) return TILE.CAVE;
    return TILE.CAVE_WALL;
  }
};
