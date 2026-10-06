'use strict';
/* LAYER - the insides of buildings. Every room is its own GRID (an instance: js/shared/grids.js), with its own coordinates from (0, 0), built by the
 * same chunk code as the overworld, so collision, saving and multiplayer all work inside.
 *
 *   INSTANCES  a 'shared' building has ONE room ('room:<site>'): everyone who walks into the store stands in the same room. A 'player' building
 *              gives every player a room of their own ('room:<site>:<n>', n = their home number).
 *   LAYOUTS    what a room looks like comes from js/content/interiors.js (level-editor.html): rows of tile characters (js/data/interiors/tiles.js),
 *              furniture (js/data/furniture/) and the doormat (the way out). ?content=draft plays the level editor's unsaved draft (solo testing).
 *   TILES      a floor is a tile id from INTERIOR_TILE_BASE up; a wall is an object id from INTERIOR_OBJ_BASE up (solid, drawn as a block). */
const INTERIOR_TILE_BASE = 32, INTERIOR_OBJ_BASE = 16;

/** The tile table, numbered: by character, by tile id, by wall object id. */
const InteriorTileInfo = (() => {
  const all = InteriorTiles.all(), byChar = {}, byTile = {}, byObj = {};
  let walls = 0;
  all.forEach((def, i) => {
    const info = Object.freeze({ def, tile: INTERIOR_TILE_BASE + i, obj: def.kind === 'wall' ? INTERIOR_OBJ_BASE + (walls++) : 0 });
    byChar[def.char] = info; byTile[info.tile] = info; if (info.obj) byObj[info.obj] = info;
  });
  const VOID = (all.find(d => d.kind === 'void') ? byChar[all.find(d => d.kind === 'void').char] : null);
  return { byChar, byTile, byObj, VOID_TILE: VOID ? VOID.tile : TILE.CAVE_WALL, voidChar: VOID ? VOID.def.char : '.' };
})();
const isInteriorVoid = tile => tile === InteriorTileInfo.VOID_TILE;

/** The room layouts (file, or the level editor's draft), checked and turned into grids. */
const Interiors = (() => {
  const DRAFT_KEY = 'ponyscapes.interiorsDraft', MAX = 40;
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const root = typeof globalThis !== 'undefined' ? globalThis : {};
  let raw = plain(root.PONYSCAPES_INTERIORS) ? root.PONYSCAPES_INTERIORS : {}, source = 'file';
  try {
    if (typeof location !== 'undefined' && typeof localStorage !== 'undefined' && new URLSearchParams(location.search).get('content') === 'draft') {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) { raw = JSON.parse(draft); source = 'draft'; }
    }
  } catch (e) { /* a broken draft never stops the game */ }

  /** A furniture piece's footprint once turned: [w, h]. */
  const footprint = (def, rot) => ((rot | 0) % 2 ? [def.size[1], def.size[0]] : [def.size[0], def.size[1]]);

  /** One layout, made safe: rows padded to a rectangle (at most MAX x MAX), unknown tiles become nothing, furniture inside the room. */
  function build(id, L) {
    if (!plain(L) || !Array.isArray(L.tiles)) return null;
    const rows = L.tiles.filter(r => typeof r === 'string').slice(0, MAX).map(r => r.slice(0, MAX));
    const h = rows.length, w = Math.max(0, ...rows.map(r => r.length));
    if (!w || !h) return null;
    const grid = new Uint8Array(w * h), walls = new Uint8Array(w * h), solid = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const info = InteriorTileInfo.byChar[rows[y][x]] || InteriorTileInfo.byChar[InteriorTileInfo.voidChar];
      grid[y * w + x] = info ? info.tile : InteriorTileInfo.VOID_TILE; walls[y * w + x] = info ? info.obj : 0;
      solid[y * w + x] = !info || info.def.kind !== 'floor' ? 1 : 0;
    }
    const furniture = [];
    for (const f of Array.isArray(L.furniture) ? L.furniture : []) {
      const def = plain(f) && FurnitureDefs.get(f.id);
      if (!def) continue;
      const rot = ((f.rot | 0) % 4 + 4) % 4, [fw, fh] = footprint(def, rot), x = f.x | 0, y = f.y | 0;
      if (x < 0 || y < 0 || x + fw > w || y + fh > h) continue;
      furniture.push({ id: def.id, x, y, rot, w: fw, h: fh });
      if (def.solid) for (let yy = y; yy < y + fh; yy++) for (let xx = x; xx < x + fw; xx++) solid[yy * w + xx] = 1;
    }
    let exit = Array.isArray(L.exit) ? [L.exit[0] | 0, L.exit[1] | 0] : null;
    const exitTile = InteriorTileInfo.byChar.m;
    if (!exit || exit[0] < 0 || exit[1] < 0 || exit[0] >= w || exit[1] >= h) {                     // no exit given: the first doormat, else the middle of the bottom row
      exit = null;
      for (let i = 0; i < grid.length && !exit; i++) if (exitTile && grid[i] === exitTile.tile) exit = [i % w, Math.floor(i / w)];
      if (!exit) exit = [w >> 1, h - 1];
    }
    const ex = exit[0], ey = exit[1];
    grid[ey * w + ex] = exitTile ? exitTile.tile : grid[ey * w + ex]; walls[ey * w + ex] = 0; solid[ey * w + ex] = 0;   // the doormat is always walkable
    return Object.freeze({ id, name: typeof L.name === 'string' ? L.name : id, w, h, grid, walls, solid, furniture, exit: [ex, ey] });
  }
  const layouts = {};
  for (const [id, L] of Object.entries(raw)) { const built = /^[a-z][a-z0-9_]{0,39}$/.test(id) ? build(id, L) : null; if (built) layouts[id] = built; }
  return { DRAFT_KEY, MAX, source, raw, layouts, footprint, build, get: id => layouts[id] || null, ids: () => Object.keys(layouts) };
})();

/** The inside of one building, in its room grid's own coordinates: (0, 0) is the layout's top-left tile, everything outside it is the dark.
 *  Each room is its own GRID (js/shared/grids.js: 'room:<site>' shared, 'room:<site>:<n>' a player's own copy), built from this plan. */
class RoomPlan {
  constructor(site, layout) { this.site = site; this.layout = layout; }
  /** Index into the layout's arrays, or -1 outside the room. */
  cell(tx, ty) { const L = this.layout; return tx >= 0 && ty >= 0 && tx < L.w && ty < L.h ? ty * L.w + tx : -1; }
  tileAt(tx, ty) { const i = this.cell(tx, ty); return i < 0 ? InteriorTileInfo.VOID_TILE : this.layout.grid[i]; }
  objAt(tx, ty) { const i = this.cell(tx, ty); return i < 0 ? 0 : this.layout.walls[i]; }
  solidAt(tx, ty) { const i = this.cell(tx, ty); return i < 0 || !!this.layout.solid[i]; }
  /** Floor you could stand on (ignoring furniture): not a wall, not the dark. */
  isFloor(tx, ty) { const i = this.cell(tx, ty); return i >= 0 && !this.layout.walls[i] && !isInteriorVoid(this.layout.grid[i]); }
  /** A wall at the bottom / right of the room (floor above or to the left of it) is drawn low, so you can see in. */
  wallIsLow(tx, ty) { return this.isFloor(tx, ty - 1) || this.isFloor(tx - 1, ty) || this.isFloor(tx - 1, ty - 1); }
  /** The doormat (the way out) and the tile north of it (where you arrive). */
  exitPoint() { const [x, y] = this.layout.exit; return { x: x + 0.5, y: y + 0.5 }; }
  entryPoint() { const e = this.exitPoint(); return { x: e.x, y: e.y - 1 }; }
  /** Furniture props whose top-left tile lies in chunk (cx, cy): [{ tile: [tx, ty], prop }] (x, y = the centre of the piece). */
  propsIn(cx, cy) {
    const x0 = cx * CHUNK_SIZE, y0 = cy * CHUNK_SIZE, out = [];
    for (const f of this.layout.furniture) {
      if (f.x < x0 || f.y < y0 || f.x >= x0 + CHUNK_SIZE || f.y >= y0 + CHUNK_SIZE) continue;
      out.push({ tile: [f.x, f.y], prop: { t: 'furniture', id: f.id, x: f.x + f.w / 2, y: f.y + f.h / 2, w: f.w, h: f.h, rot: f.rot, r: 0 } });
    }
    return out;
  }
}
