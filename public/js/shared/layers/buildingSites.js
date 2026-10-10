'use strict';
/* LAYER - where the buildings stand in the overworld, and their doors. Pure functions of tile coordinates (like the village), so every chunk
 * can ask "is there a building here?" on its own. A building's look and its room come from js/data/buildings/; this is only the map.
 * Each site's index also names its room's grid ('room:<site>', js/shared/grids.js): a 'player' building gives each player a room of their own. */
/** Which buildings have been RESTORED. A building with `ruinedAs` (js/data/buildings/castle.js) is its ruined self until it is restored: BuildingSites.list[i].def
 *  answers with the right one, so the picture, the door and every room inside follow. Saved with the world and sent to every player (interiorSystem.js). */
const BuildingVersions = (() => {
  const restored = new Set();
  return {
    isRestored: id => restored.has(id),
    /** Restore (or ruin again) a building. Returns true if that changed anything. */
    set(id, on) { const had = restored.has(id); if (!!on === had) return false; if (on) restored.add(id); else restored.delete(id); return true; },
    wire: () => [...restored].sort(),
    /** Take the list a server sent (or the save held): exactly those are restored. Returns the ids whose state changed. */
    apply(list) {
      const next = new Set((Array.isArray(list) ? list : []).filter(id => typeof id === 'string' && BuildingDefs.has(id) && BuildingDefs.get(id).ruinedAs));
      const changed = [...new Set([...restored, ...next])].filter(id => restored.has(id) !== next.has(id));
      restored.clear(); for (const id of next) restored.add(id);
      return changed;
    }
  };
})();

const BuildingSites = (() => {
  /** The village: [building id, west x, north y, facing]. facing 's' (the default): the door is on the south face (the lower-left face on screen), 'e': on the
   *  east face (the lower-right one), `door` tiles along it. Both faces are the ones the camera sees. */
  const PLACED = [['carpenter', -2, 22, 'e'], ['general_store', 31, 24], ['veterinary', 41, 24], ['player_home', 14, 30],
    ['storehouse', 34, 33, 'e'], ['vacant_home', 24, 16], ['vacant_home', 37, 16, 'e'], ['vacant_home', 52, 16],
    ['home_baker', 11, 14], ['home_child', 9, 24], ['home_elder', 14, 8], ['home_guard', -4, 11, 'e'], ['home_carpenter', -6, 16], ['home_merchant', 31, 16],
    ['home_veterinarian', 54, 25], ['home_farmer', 24, 24], ['home_fisher', -10, 26, 'e'], ['home_blacksmith', -12, 16],
    ['castle', 4, 4], ['blacksmith', -18, 22]];                                                                                        // (the old castle, on the keep's footprint: ruined until it is restored)   // (add new sites at the END: a room's grid is named by its index)
  const list = PLACED.filter(([id]) => BuildingDefs.has(id)).map(([id, x0, y0, facing = 's'], index) => {
    const base = BuildingDefs.get(id), [w, h] = base.size, def = base;
    const x1 = x0 + w - 1, y1 = y0 + h - 1, east = facing === 'e', doorX = east ? x1 : x0 + clamp(def.door, 0, w - 1), doorY = east ? y0 + clamp(def.door, 0, h - 1) : y1;
    return Object.freeze({ index, id, get def() { return base.ruinedAs && !BuildingVersions.isRestored(id) ? BuildingDefs.get(base.ruinedAs) : base; },   // (a building with a ruined self: whichever it is now)
      x0, y0, w, h, x1, y1, facing, doorX, doorY, frontX: doorX + (east ? 1 : 0), frontY: doorY + (east ? 0 : 1) });   // (front: the tile outside the door)
  });

  /** The site covering this tile, or null. */
  function at(tx, ty) { for (const s of list) if (tx >= s.x0 && tx <= s.x1 && ty >= s.y0 && ty <= s.y1) return s; return null; }
  /** OBJ.DOOR on a door tile, OBJ.HOUSE on the rest of a building, else OBJ.NONE. */
  function obj(tx, ty) { const s = at(tx, ty); return !s ? OBJ.NONE : tx === s.doorX && ty === s.doorY ? OBJ.DOOR : OBJ.HOUSE; }
  /** Where you stand outside the door (and where you come out). */
  function doorFront(s) { return s.facing === 'e' ? { x: s.doorX + 1.45, y: s.doorY + 0.5 } : { x: s.doorX + 0.5, y: s.doorY + 1.45 }; }
  /** The building whose door is within reach of (x, y), with the distance, or null. */
  function nearDoor(x, y, reach) {
    let best = null;
    for (const s of list) { const f = doorFront(s), d = Math.hypot(f.x - x, f.y - y); if (d <= reach && (!best || d < best.dist)) best = { site: s, dist: d }; }
    return best;
  }
  return { list, at, obj, doorFront, nearDoor };
})();
