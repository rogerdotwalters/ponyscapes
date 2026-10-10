'use strict';
/* CONTENT - the rooms of the castle, written as MODULES instead of by hand in level-editor.html.
 *
 * Each module (MODULES below) is one room of the castle as it stands RESTORED: its size, floor and walls, furniture, and the doorways (`links`) to the
 * other rooms. The RUINED castle's rooms are not drawn again: ruined(module) works them out from the same module (carpets rotted down to the flagstones,
 * holes knocked in the walls, lamps out, hearths cold, tables and beds broken up, fallen masonry along the walls), so both versions always have the same
 * shape, the same doorways and the same ways through. Every room is its own instance (js/shared/grids.js): the castle building lists them in order in
 * `rooms` (js/data/buildings/castle.js; the first one is the entrance), and a doorway in one leads to another by its key.
 *
 *   tiles    js/data/interiors/tiles.js:  s stone  c cellar flags  d dark wood  w wood  t tiles  r red carpet  b blue carpet  S D walls  Z window  n doorway  m doormat
 *   exitTo   the room the doormat leads back to (none: outside)         links  [{ x, y, to, name }]: a doorway tile in the wall, and the room it opens into
 *
 * The result is handed to js/shared/layers/interiorSpace.js as layouts 'castle_<key>' (restored) and 'castle_<key>_ruined'. Loaded after the furniture
 * (it needs their sizes) and before interiorSpace.js. */
const CastleRooms = (() => {
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
  const keyNum = key => [...key].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 7);

  /** A blank room: stone walls round `floor`. */
  function blank(w, h, floor, wall) {
    const g = [];
    for (let y = 0; y < h; y++) g.push(Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? wall : floor)));
    return g;
  }
  const rect = (g, x, y, w, h, ch) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy][xx] = ch; };

  /** A module from a little script of drawing steps. */
  function room(name, w, h, { floor = 's', wall = 'S', exit, exitTo, paint = () => {}, windows = [], links = [], furniture = [] }) {
    const g = blank(w, h, floor, wall);
    paint(g);
    for (const [x, y] of windows) g[y][x] = 'Z';
    return { name, w, h, g, exit, exitTo, links, furniture: furniture.map(([id, x, y, rot = 0]) => ({ id, x, y, rot })) };
  }

  const MODULES = {
    gatehall: room('Gatehouse', 13, 9, {
      exit: [6, 8], windows: [[3, 0], [9, 0]],
      paint: g => { rect(g, 5, 1, 3, 7, 'r'); },
      links: [{ x: 6, y: 0, to: 'greathall', name: 'Great Hall' }, { x: 0, y: 4, to: 'guardroom', name: 'Guardroom' }, { x: 12, y: 4, to: 'kitchen', name: 'Kitchen' }],
      furniture: [['weapon_rack', 2, 1], ['weapon_rack', 9, 1], ['candelabra', 4, 1], ['candelabra', 8, 1], ['bench', 1, 6], ['bench', 9, 6], ['cask', 11, 2], ['cask', 11, 3], ['cask', 1, 2]]
    }),
    greathall: room('Great Hall', 15, 12, {
      exit: [7, 11], exitTo: 'gatehall', windows: [[5, 0], [9, 0], [0, 5], [14, 4], [14, 9], [0, 10]],
      paint: g => { rect(g, 6, 1, 3, 10, 'r'); rect(g, 4, 1, 7, 2, 'd'); rect(g, 6, 1, 3, 2, 'r'); },
      links: [{ x: 0, y: 2, to: 'solar', name: "Lord's Solar" }, { x: 0, y: 7, to: 'library', name: 'Library' }, { x: 14, y: 6, to: 'chapel', name: 'Chapel' }],
      furniture: [['throne', 7, 1], ['great_hearth', 1, 1], ['great_hearth', 11, 1], ['candelabra', 5, 1], ['candelabra', 9, 1],
        ['banquet_table', 3, 4, 1], ['banquet_table', 11, 4, 1], ['bench', 2, 5, 1], ['bench', 12, 5, 1], ['bench', 4, 5, 1], ['bench', 10, 5, 1], ['grand_rug', 6, 4], ['candelabra', 5, 9], ['candelabra', 9, 9]]
    }),
    guardroom: room('Guardroom', 11, 9, {
      exit: [5, 8], exitTo: 'gatehall', windows: [[8, 0], [10, 4]], floor: 's',
      links: [{ x: 5, y: 0, to: 'cellar', name: 'Cellar' }],
      furniture: [['bunk', 1, 1], ['bunk', 3, 1], ['bunk', 7, 1], ['bunk', 9, 1], ['long_table', 3, 4], ['bench', 3, 5], ['weapon_rack', 1, 6], ['weapon_rack', 8, 6], ['cask', 9, 4], ['lamp', 1, 4]]
    }),
    cellar: room('Cellar', 13, 9, {
      exit: [11, 8], exitTo: 'guardroom', floor: 'c', wall: 'D',
      furniture: [['cask', 1, 1], ['cask', 2, 1], ['cask', 3, 1], ['cask', 1, 2], ['cask', 5, 1], ['crate', 7, 1], ['crate', 8, 1], ['worn_chest', 11, 1],
        ['cask', 1, 5], ['cask', 1, 6], ['crate', 4, 6], ['crate', 5, 6], ['crate', 5, 5], ['hay_bale', 9, 5], ['hay_bale', 10, 5], ['worn_chest', 11, 3], ['candelabra', 8, 6], ['trapdoor', 6, 3]]
    }),
    kitchen: room('Kitchen', 11, 9, {
      exit: [5, 8], exitTo: 'gatehall', floor: 't', windows: [[3, 0], [7, 0]],
      links: [{ x: 10, y: 4, to: 'pantry', name: 'Pantry' }],
      furniture: [['great_hearth', 1, 1], ['workbench', 5, 2], ['workbench', 5, 4], ['long_table', 2, 6], ['cask', 9, 1], ['cask', 9, 2], ['crate', 9, 6], ['crate', 9, 7], ['hay_bale', 1, 4], ['lamp', 7, 6]]
    }),
    pantry: room('Pantry', 7, 7, {
      exit: [3, 6], exitTo: 'kitchen', floor: 'c', wall: 'D',
      furniture: [['goods_shelf', 1, 1], ['goods_shelf', 4, 1], ['cask', 1, 3], ['cask', 1, 4], ['crate', 5, 3], ['crate', 5, 4], ['hay_bale', 3, 3]]
    }),
    library: room('Library', 11, 9, {
      exit: [5, 8], exitTo: 'greathall', floor: 'w', windows: [[0, 4], [10, 4]],
      paint: g => { rect(g, 3, 3, 5, 3, 'b'); },
      furniture: [['bookshelf', 1, 1], ['bookshelf', 2, 1], ['bookshelf', 3, 1], ['bookshelf', 4, 1], ['bookshelf', 6, 1], ['bookshelf', 7, 1], ['bookshelf', 8, 1], ['bookshelf', 9, 1],
        ['bookshelf', 1, 3], ['bookshelf', 1, 4], ['bookshelf', 9, 3], ['bookshelf', 9, 4], ['reading_desk', 3, 3], ['chair', 3, 4], ['reading_desk', 6, 3], ['chair', 7, 4], ['candelabra', 5, 1], ['candelabra', 1, 7], ['candelabra', 9, 7], ['grand_rug', 4, 5]]
    }),
    chapel: room('Chapel', 9, 12, {
      exit: [4, 11], exitTo: 'greathall', windows: [[2, 0], [6, 0], [0, 4], [8, 4], [0, 8], [8, 8]],
      paint: g => { rect(g, 4, 1, 1, 10, 'b'); rect(g, 3, 1, 3, 2, 'b'); },
      furniture: [['altar', 3, 1], ['candelabra', 2, 1], ['candelabra', 6, 1], ['bench', 1, 4], ['bench', 5, 4], ['bench', 1, 6], ['bench', 5, 6], ['bench', 1, 8], ['bench', 5, 8], ['candelabra', 1, 10], ['candelabra', 7, 10]]
    }),
    solar: room("Lord's Solar", 11, 9, {
      exit: [5, 8], exitTo: 'greathall', floor: 'w', windows: [[3, 0], [8, 0], [10, 4]],
      paint: g => { rect(g, 3, 3, 5, 4, 'r'); },
      furniture: [['royal_bed', 1, 1], ['fireplace', 4, 1], ['dresser', 6, 1], ['bookshelf', 8, 1], ['bookshelf', 9, 1], ['grand_rug', 4, 4], ['reading_desk', 8, 5], ['chair', 8, 6], ['candelabra', 3, 1], ['candelabra', 9, 7], ['potted_plant', 1, 6]]
    })
  };
  const KEYS = Object.keys(MODULES);                       // (the entrance first; add new rooms at the END: a room's grid is named by its place in this list)

  const rotated = (def, rot) => (rot % 2 ? [def.size[1], def.size[0]] : [def.size[0], def.size[1]]);
  const sizeOf = f => { const def = typeof FurnitureDefs !== 'undefined' && FurnitureDefs.get(f.id); return def ? rotated(def, f.rot || 0) : [1, 1]; };

  /** The restored room as a layout. */
  function restored(key) {
    const m = MODULES[key];
    return { name: m.name, tiles: m.g.map(r => r.join('')), furniture: m.furniture.map(f => Object.assign({}, f)), exit: m.exit.slice(), exitTo: m.exitTo, links: m.links.map(l => Object.assign({}, l)) };
  }

  /** The same room gone to ruin: derived, never hand-drawn. */
  function ruined(key) {
    const m = MODULES[key], seed = keyNum(key), g = m.g.map(r => r.slice());
    const keepClear = new Set();                                                                  // tiles round a doorway / the doormat stay whole and open
    for (const [x, y] of [m.exit, ...m.links.map(l => [l.x, l.y])]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) keepClear.add((y + dy) * m.w + x + dx);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const ch = g[y][x], n = hash(x, y, seed);
      if (ch === 'r' || ch === 'b') g[y][x] = n < 0.35 ? 'c' : 's';                                // carpets rotted away to the flagstones
      else if (ch === 't') g[y][x] = n < 0.4 ? 'c' : 's';
      else if (ch === 'w') g[y][x] = n < 0.5 ? 'd' : 'w';
      else if (ch === 's' && n < 0.12) g[y][x] = 'c';                                              // worn flags
      else if (ch === 'Z') g[y][x] = n < 0.5 ? 'S' : 'Z';                                           // some windows blind, the rest stay as they were
      else if ((ch === 'S' || ch === 'D') && !keepClear.has(y * m.w + x) && (y === 0 || y === m.h - 1 ? x > 1 && x < m.w - 2 : y > 1 && y < m.h - 2) && n < 0.2) g[y][x] = '.';   // a hole knocked through the wall
    }
    const swap = { great_hearth: 'cold_great_hearth', fireplace: 'cold_hearth', banquet_table: 'long_table', royal_bed: 'bunk', grand_rug: 'old_rug', dresser: 'rubble' };
    const drop = { lamp: 1, candelabra: 1, potted_plant: 1, chair: 0.4, bench: 0.35, bunk: 0.4, banquet_table: 0.3, long_table: 0.3, weapon_rack: 0.5, cask: 0.3, reading_desk: 0.4, bookshelf: 0.35, goods_shelf: 0.5, workbench: 0.3, dresser: 0 };
    const furniture = [];
    for (const f of m.furniture) {
      const n = hash(f.x, f.y, seed + 5);
      if (n < (drop[f.id] || 0)) { if (f.id === 'bookshelf' || f.id === 'goods_shelf') furniture.push({ id: 'rubble', x: f.x, y: f.y, rot: 0 }); continue; }
      const id = swap[f.id] || f.id;
      furniture.push({ id, x: f.x, y: f.y, rot: f.id === 'royal_bed' ? 0 : f.rot });
    }
    const taken = new Set();                                                                       // tiles furniture covers, and the floor that may take a heap of masonry
    for (const f of furniture) { const [fw, fh] = sizeOf(f); for (let yy = f.y; yy < f.y + fh; yy++) for (let xx = f.x; xx < f.x + fw; xx++) taken.add(yy * m.w + xx); }
    const heaps = Math.round(m.w * m.h / 22);
    for (let i = 0, placed = 0; i < 400 && placed < heaps; i++) {
      const x = 1 + Math.floor(hash(i, 1, seed) * (m.w - 2)), y = 1 + Math.floor(hash(i, 2, seed) * (m.h - 2)), at = y * m.w + x;
      if (taken.has(at) || keepClear.has(at) || (g[y][x] !== 's' && g[y][x] !== 'c' && g[y][x] !== 'd')) continue;
      const wallAdjacent = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => /[SDZ.]/.test(g[y + dy][x + dx]));
      if (!wallAdjacent) continue;                                                                 // (masonry falls along the walls: never into the way through)
      furniture.push({ id: 'rubble', x, y, rot: 0 }); taken.add(at); placed++;
    }
    return { name: m.name, tiles: g.map(r => r.join('')), furniture, exit: m.exit.slice(), exitTo: m.exitTo, links: m.links.map(l => Object.assign({}, l)) };
  }

  /** Every layout, by id: 'castle_<key>' and 'castle_<key>_ruined'. */
  const layouts = {};
  for (const key of KEYS) { layouts['castle_' + key] = restored(key); layouts['castle_' + key + '_ruined'] = ruined(key); }
  /** The `rooms` table of the castle building: key -> layout id, entrance first. */
  const rooms = suffix => Object.fromEntries(KEYS.map(k => [k, 'castle_' + k + suffix]));

  globalThis.PONYSCAPES_GENERATED_INTERIORS = Object.assign(globalThis.PONYSCAPES_GENERATED_INTERIORS || {}, layouts);   // (merged in by Interiors: interiorSpace.js)
  return { KEYS, MODULES, layouts, rooms, restored, ruined };
})();
