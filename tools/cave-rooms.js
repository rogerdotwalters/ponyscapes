#!/usr/bin/env node
'use strict';
/* TOOLS - dungeon rooms: PNG <-> 2D list.
 *
 *   node tools/cave-rooms.js build            every public/assets/dungeons/rooms/<id>.png  ->  public/js/content/caveRooms.js   (npm run rooms)
 *   node tools/cave-rooms.js samples          make the temporary rooms (random caves) as PNGs, then build                        (npm run rooms:samples)
 *   node tools/cave-rooms.js show <id>        print a room as text, to check it
 *
 * Drop a PNG into public/assets/dungeons/rooms/ and run `build`: a 100x150 picture is a 100x150 tile room. The file name (lower case, a-z 0-9 _) is the
 * room's id; a dungeon lists its rooms by id (public/js/data/dungeons/). What each grey means: public/assets/dungeons/README.md and js/shared/roomCodes.js. */
const fs = require('fs'), path = require('path');
const png = require('./pngGrey');
const { RoomCode, CaveRoom, roomGreyOfCode, isEnemyCode } = require('../public/js/shared/roomCodes');

const ROOT = path.join(__dirname, '..', 'public');
const ROOMS_DIR = path.join(ROOT, 'assets', 'dungeons', 'rooms'), CONTENT = path.join(ROOT, 'js', 'content', 'caveRooms.js');
const prettyName = id => id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/* ---------- PNG folder -> content file ---------- */
function loadRooms() {
  const rooms = {}, problems = [];
  for (const file of fs.existsSync(ROOMS_DIR) ? fs.readdirSync(ROOMS_DIR).filter(f => f.toLowerCase().endsWith('.png')).sort() : []) {
    const id = file.slice(0, -4).toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(id)) { problems.push(`${file}: the file name must be lower case letters, digits and _ (starting with a letter)`); continue; }
    try {
      const img = png.decode(fs.readFileSync(path.join(ROOMS_DIR, file)));
      const room = CaveRoom.fromGrey(id, img.width, img.height, img.grey, img.depth, prettyName(id));
      if (!room) { problems.push(`${file}: ${img.width}x${img.height} is too big (the most is 400x400)`); continue; }
      const bad = room.problems();
      if (bad.length) { problems.push(`${file}: ${bad.join('; ')}`); continue; }
      rooms[id] = room;
    } catch (e) { problems.push(`${file}: ${e.message}`); }
  }
  return { rooms, problems };
}

function writeContent(rooms) {
  const body = Object.values(rooms).map(r => `  ${JSON.stringify(r.id)}: { "name": ${JSON.stringify(r.name)}, "rows": [\n${r.toRows().map(row => '    ' + JSON.stringify(row)).join(',\n')}\n  ] }`).join(',\n');
  fs.writeFileSync(CONTENT, `'use strict';
/* ROOMS - the dungeon rooms, made by tools/cave-rooms.js from the PNGs in assets/dungeons/rooms/ (npm run rooms). DO NOT EDIT BY HAND: edit the PNG and build again.
 *   <room id>: { name, rows: [[tile code, ...], ...] }   one number per tile, row by row (north at the top). 0 floor, 1 wall, 2 entrance, 3 exit, 4 enemy spawn, 5 chest,
 *   1000+ a specific enemy (js/shared/enemyCodes.js).  Dungeons (js/data/dungeons/) list the room ids they are made of, in order. */
window.PONYSCAPES_CAVE_ROOMS = {
${body}
};
`);
}

function build() {
  const { rooms, problems } = loadRooms();
  writeContent(rooms);
  for (const r of Object.values(rooms)) console.log(`  ${r.id.padEnd(14)} ${r.w}x${r.h} tiles   ${r.spawns.length} spawn nodes, ${r.enemies.length} named enemies, ${r.chests.length} chests`);
  for (const p of problems) console.error('  SKIPPED ' + p);
  console.log(`wrote ${path.relative(process.cwd(), CONTENT)}: ${Object.keys(rooms).length} rooms${problems.length ? `, ${problems.length} skipped` : ''}`);
  if (problems.length) process.exitCode = 1;
}

/* ---------- a room as text ---------- */
function show(id) {
  const { rooms, problems } = loadRooms(), room = rooms[id];
  if (!room) { console.error(problems.join('\n') || `no room "${id}"`); process.exit(1); }
  const ch = c => (c === RoomCode.FLOOR ? '.' : c === RoomCode.WALL ? '#' : c === RoomCode.ENTRANCE ? 'E' : c === RoomCode.EXIT ? 'X' : c === RoomCode.SPAWN ? 's' : c === RoomCode.CHEST ? 'C' : isEnemyCode(c) ? 'M' : '?');
  for (let y = 0; y < room.h; y++) console.log(Array.from({ length: room.w }, (_, x) => ch(room.code(x, y))).join(''));
}

/* ---------- temporary rooms: random caves ---------- */
const mulberry = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A random cave as a 2D list: cellular automata caves, one connected cavern, an entrance patch at one end and an exit patch at the far end, spawn nodes,
 *  chests in nooks and (optionally) named enemies. `enemies` = creature numbers (1000+). */
function makeCave({ w, h, seed, fill = 0.47, spawns = 4, chests = 1, enemies = [] }) {
  const rng = mulberry(seed), W = RoomCode.WALL, F = RoomCode.FLOOR, at = (g, x, y) => (x < 0 || y < 0 || x >= w || y >= h ? W : g[y * w + x]);
  let g = new Uint16Array(w * h).fill(W);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) g[y * w + x] = rng() < fill ? F : W;
  for (let step = 0; step < 5; step++) {
    const next = new Uint16Array(w * h).fill(W);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let walls = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(g, x + dx, y + dy) === W) walls++;
      next[y * w + x] = walls >= 5 ? W : F;
    }
    g = next;
  }
  const bfs = (from, ok) => {                                                       // distances from a tile over the tiles `ok`; -1 = unreachable
    const dist = new Int32Array(w * h).fill(-1), queue = [from]; dist[from] = 0;
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i], x = c % w, y = (c - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (y + dy) * w + x + dx; if (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h && dist[n] < 0 && ok(n)) { dist[n] = dist[c] + 1; queue.push(n); } }
    }
    return dist;
  };
  const label = new Int32Array(w * h), sizes = [0];                                  // keep only the biggest cavern: label every connected patch of floor
  for (let i = 0; i < g.length; i++) {
    if (g[i] !== F || label[i]) continue;
    const id = sizes.length, stack = [i]; label[i] = id; sizes.push(0);
    while (stack.length) {
      const c = stack.pop(), x = c % w, y = (c - x) / w; sizes[id]++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (y + dy) * w + x + dx; if (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h && g[n] === F && !label[n]) { label[n] = id; stack.push(n); } }
    }
  }
  const biggest = sizes.indexOf(Math.max(...sizes.slice(1)));
  for (let i = 0; i < g.length; i++) if (g[i] === F && label[i] !== biggest) g[i] = W;
  const floors = []; for (let i = 0; i < g.length; i++) if (g[i] === F) floors.push(i);
  // the entrance and the exit are cave MOUTHS: a single tile set into a wall (rock to the north, open floor to the south), at the two far ends of the cave
  const inRange = i => { const x = i % w, y = (i - x) / w; return x >= 3 && x < w - 3 && y >= 2 && y < h - 3; };
  const spots0 = floors.filter(i => inRange(i) && at(g, i % w, Math.floor(i / w) - 1) === W && at(g, i % w, Math.floor(i / w) + 1) === F);
  if (!spots0.length) return null;
  const tall = h > w * 1.2, along = i => (tall ? Math.floor(i / w) : i % w);
  let start = spots0[0]; for (const i of spots0) if (along(i) + rng() * 3 < along(start)) start = i;                    // entrance: the western end (the northern end of a tall cave) ...
  const fromStart = bfs(start, n => g[n] !== W);
  let end = start; for (const i of spots0) if (fromStart[i] > fromStart[end]) end = i;                                  // exit: as far from it as you can walk
  const mouth = (centre, code) => {
    const cx = centre % w, cy = (centre - cx) / w;
    for (let dx = -2; dx <= 2; dx++) { const x = cx + dx; if (x < 1 || x >= w - 1) continue; g[cy * w + x] = W; for (let dy = 1; dy <= 2; dy++) if (cy + dy < h - 1) g[(cy + dy) * w + x] = F; if (dx >= -1 && dx <= 1) g[(cy - 1) * w + x] = W; }
    g[centre] = code;                                                                                                  // (the wall segment is five tiles wide, with the mouth in the middle and a landing in front of it)
  };
  mouth(start, RoomCode.ENTRANCE); mouth(end, RoomCode.EXIT);
  const dist = bfs(start, n => g[n] !== W), far = Math.max(...floors.map(i => dist[i]));
  const spots = (ok, count, spacing, taken) => {                                  // random floor tiles far enough from each other
    const pool = floors.filter(i => g[i] === F && ok(i)), out = [];
    for (let tries = 0; tries < 4000 && out.length < count && pool.length; tries++) {
      const i = pool[Math.floor(rng() * pool.length)], x = i % w, y = (i - x) / w;
      if ([...taken, ...out].every(j => Math.hypot(j % w - x, Math.floor(j / w) - y) >= spacing)) out.push(i);
    }
    return out;
  };
  const taken = [start, end];
  for (const i of spots(i => dist[i] >= far * 0.15 && dist[i] > 6, spawns, 7, taken)) { g[i] = RoomCode.SPAWN; taken.push(i); }
  for (const code of enemies) for (const i of spots(i => dist[i] >= far * 0.3, 1, 5, taken)) { g[i] = code; taken.push(i); }
  const nook = i => { const x = i % w, y = (i - x) / w; let walls = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(g, x + dx, y + dy) === W) walls++; return walls; };
  for (const need of [5, 4, 3]) {
    const got = spots(i => dist[i] >= far * 0.25 && nook(i) >= need, chests - taken.filter(i => g[i] === RoomCode.CHEST).length, 9, taken);
    for (const i of got) { g[i] = RoomCode.CHEST; taken.push(i); }
    if (taken.filter(i => g[i] === RoomCode.CHEST).length >= chests) break;
  }
  const rows = Array.from({ length: h }, (_, y) => Array.from(g.subarray(y * w, (y + 1) * w)));
  return CaveRoom.fromRows('t', rows).problems().length ? null : rows;                     // (null: this cave came out unusable, try another seed)
}

/** Write a room's 2D list as a PNG: the viewable 8-bit palette, or 16-bit if it names an enemy the palette cannot draw. */
function writePng(id, rows) {
  const w = rows[0].length, h = rows.length, codes = rows.flat(), sixteen = codes.some(c => roomGreyOfCode(c) === null);
  const grey = Uint16Array.from(codes, c => (sixteen ? c : roomGreyOfCode(c)));
  fs.mkdirSync(ROOMS_DIR, { recursive: true });
  fs.writeFileSync(path.join(ROOMS_DIR, id + '.png'), png.encode(w, h, grey, sixteen ? 16 : 8));
}

function samples() {
  const ids = (() => { const { run } = require('./headless')(); return Object.fromEntries(['boar', 'wolf', 'snake', 'panther', 'bear'].map(n => [n, run(`EnemyCodes.codeOf('${n}')`)])); })();
  const made = [
    { id: 'cavern_1', w: 48, h: 36, seed: 11, spawns: 4, chests: 1 },                                                              // a small first cave
    { id: 'cavern_2', w: 64, h: 64, seed: 22, spawns: 7, chests: 2, enemies: [ids.boar, ids.boar, ids.wolf] },                      // a bigger one with named enemies
    { id: 'cavern_3', w: 100, h: 150, seed: 33, spawns: 14, chests: 3, enemies: [ids.panther, ids.snake, ids.boar, ids.wolf, ids.bear] }   // a deep, tall cavern (100 wide, 150 tall)
  ];
  for (const m of made) {
    let rows = null, seed = m.seed;
    while (!(rows = makeCave(Object.assign({}, m, { seed })))) seed++;                                              // the first seed that makes a good cave
    writePng(m.id, rows); console.log(`made ${m.id}.png (${m.w}x${m.h}, seed ${seed})`);
  }
  build();
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'build') build(); else if (cmd === 'samples') samples(); else if (cmd === 'show' && arg) show(arg);
else console.log('usage: node tools/cave-rooms.js build | samples | show <room id>');
