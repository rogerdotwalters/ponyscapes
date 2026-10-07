'use strict';
/* LAYER - where the buildings stand in the overworld, and their doors. Pure functions of tile coordinates (like the village), so every chunk
 * can ask "is there a building here?" on its own. A building's look and its room come from js/data/buildings/; this is only the map.
 * Each site's index also names its room's grid ('room:<site>', js/shared/grids.js): a 'player' building gives each player a room of their own. */
const BuildingSites = (() => {
  /** The village street: [building id, west x, north y]. The door is on the south face (see the building's `door`). */
  const PLACED = [['carpenter', 8, 23], ['general_store', 24, 23], ['veterinary', 30, 23], ['player_home', 14, 30],
    ['storehouse', 28, 31], ['vacant_home', 23, 16], ['vacant_home', 28, 16], ['vacant_home', 33, 16]];   // (add new sites at the END: a room's grid is named by its index)
  const list = PLACED.filter(([id]) => BuildingDefs.has(id)).map(([id, x0, y0], index) => {
    const def = BuildingDefs.get(id), [w, h] = def.size;
    return Object.freeze({ index, id, def, x0, y0, w, h, x1: x0 + w - 1, y1: y0 + h - 1, doorX: x0 + clamp(def.door, 0, w - 1), doorY: y0 + h - 1 });
  });

  /** The site covering this tile, or null. */
  function at(tx, ty) { for (const s of list) if (tx >= s.x0 && tx <= s.x1 && ty >= s.y0 && ty <= s.y1) return s; return null; }
  /** OBJ.DOOR on a door tile, OBJ.HOUSE on the rest of a building, else OBJ.NONE. */
  function obj(tx, ty) { const s = at(tx, ty); return !s ? OBJ.NONE : tx === s.doorX && ty === s.doorY ? OBJ.DOOR : OBJ.HOUSE; }
  /** Where you stand outside the door (and where you come out). */
  function doorFront(s) { return { x: s.doorX + 0.5, y: s.doorY + 1.45 }; }
  /** The building whose door is within reach of (x, y), with the distance, or null. */
  function nearDoor(x, y, reach) {
    let best = null;
    for (const s of list) { const f = doorFront(s), d = Math.hypot(f.x - x, f.y - y); if (d <= reach && (!best || d < best.dist)) best = { site: s, dist: d }; }
    return best;
  }
  return { list, at, obj, doorFront, nearDoor };
})();
