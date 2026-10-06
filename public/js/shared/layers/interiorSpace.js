'use strict';
/* LAYER - interior space: the inside of every building. Like the caves (DungeonSpace), a room is not a separate world: it is a block of ordinary
 * tiles far outside the overworld, built by the same chunk code, so collision, lighting, saving and multiplayer all work inside.
 *
 *   INSTANCES  every room is one block (STRIDE x STRIDE tiles). A 'shared' building has ONE room, numbered by its site (BuildingSites); a 'player'
 *              building gives every player a room of their own (PLAYER_BASE + the player's home number x SITES + the site). Everyone who walks
 *              into the store stands in the same room; everyone who walks into the player home stands in their own.
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

const InteriorSpace = {
  BASE_X: 1000000, BASE_Y: 1200000, STRIDE: 64, PER_ROW: 256, ROWS: 64, PLAYER_BASE: 256, SITES: 16, PAD: 8, MARGIN: 48,
  contains(tx, ty) {
    const S = InteriorSpace;
    return tx >= S.BASE_X && ty >= S.BASE_Y && tx < S.BASE_X + S.STRIDE * S.PER_ROW && ty < S.BASE_Y + S.STRIDE * S.ROWS;
  },
  /** Interior space and the dark band around it (nothing but void: no overworld shows at the edge of the screen). */
  region(tx, ty) {
    const S = InteriorSpace, m = S.MARGIN;
    return tx >= S.BASE_X - m && ty >= S.BASE_Y - m && tx < S.BASE_X + S.STRIDE * S.PER_ROW + m && ty < S.BASE_Y + S.STRIDE * S.ROWS + m;
  },
  /** Which room (instance number) a tile belongs to, or -1. */
  indexOf(tx, ty) {
    const S = InteriorSpace; if (!S.contains(tx, ty)) return -1;
    return Math.floor((ty - S.BASE_Y) / S.STRIDE) * S.PER_ROW + Math.floor((tx - S.BASE_X) / S.STRIDE);
  },
  /** A room's top-left tile (inset PAD tiles in its block, so darkness surrounds it). */
  originOf(index) { const S = InteriorSpace; return { x: S.BASE_X + (index % S.PER_ROW) * S.STRIDE + S.PAD, y: S.BASE_Y + Math.floor(index / S.PER_ROW) * S.STRIDE + S.PAD }; },
  /** A player's own room in a 'player' building: their home number `n` (the server hands these out per player). */
  playerInstance(n, siteIndex) { return InteriorSpace.PLAYER_BASE + n * InteriorSpace.SITES + siteIndex; },
  /** The building site a room belongs to. */
  siteOf(index) { const S = InteriorSpace; return BuildingSites.list[index < S.PLAYER_BASE ? index : (index - S.PLAYER_BASE) % S.SITES] || null; },
  layoutOf(index) { const site = InteriorSpace.siteOf(index); return site ? Interiors.get(site.def.interior) : null; },
  /** The room tile at (tx, ty): { layout, lx, ly, i } or null (outside every room). */
  cell(tx, ty) {
    const index = InteriorSpace.indexOf(tx, ty); if (index < 0) return null;
    const L = InteriorSpace.layoutOf(index); if (!L) return null;
    const o = InteriorSpace.originOf(index), lx = tx - o.x, ly = ty - o.y;
    return lx >= 0 && ly >= 0 && lx < L.w && ly < L.h ? { layout: L, lx, ly, i: ly * L.w + lx } : null;
  },
  tileAt(tx, ty) { const c = InteriorSpace.cell(tx, ty); return c ? c.layout.grid[c.i] : InteriorTileInfo.VOID_TILE; },
  objAt(tx, ty) { const c = InteriorSpace.cell(tx, ty); return c ? c.layout.walls[c.i] : 0; },
  solidAt(tx, ty) { const c = InteriorSpace.cell(tx, ty); return c ? !!c.layout.solid[c.i] : true; },
  /** A wall at the bottom / right of a room (floor above or to the left of it) is drawn low, so you can see into the room. */
  wallIsLow(tx, ty) {
    const floor = (x, y) => { const c = InteriorSpace.cell(x, y); return !!c && !c.layout.walls[c.i] && !isInteriorVoid(c.layout.grid[c.i]); };
    return floor(tx, ty - 1) || floor(tx - 1, ty) || floor(tx - 1, ty - 1);
  },
  /** World positions of a room's doormat (centre) and where you arrive (the tile north of it). */
  exitPoint(index) { const L = InteriorSpace.layoutOf(index), o = InteriorSpace.originOf(index); return L ? { x: o.x + L.exit[0] + 0.5, y: o.y + L.exit[1] + 0.5 } : null; },
  entryPoint(index) { const e = InteriorSpace.exitPoint(index); return e ? { x: e.x, y: e.y - 1 } : null; },
  /** Furniture props whose top-left tile lies in chunk (cx, cy) (world coordinates; x, y = the centre of the piece). */
  furnitureIn(cx, cy) {
    const x0 = cx * CHUNK_SIZE, y0 = cy * CHUNK_SIZE, index = InteriorSpace.indexOf(x0, y0), out = [];
    if (index < 0) return out;
    const L = InteriorSpace.layoutOf(index), o = InteriorSpace.originOf(index);
    if (!L) return out;
    for (const f of L.furniture) {
      const tx = o.x + f.x, ty = o.y + f.y;
      if (tx < x0 || ty < y0 || tx >= x0 + CHUNK_SIZE || ty >= y0 + CHUNK_SIZE) continue;
      out.push({ tile: [tx, ty], prop: { t: 'furniture', id: f.id, x: tx + f.w / 2, y: ty + f.h / 2, w: f.w, h: f.h, rot: f.rot, r: 0 } });
    }
    return out;
  }
};
