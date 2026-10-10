'use strict';
/* SHARED - the rooms of the Slime Warren (js/data/dungeons/slime_warren.js), made by code instead of from PNGs: smooth, winding caves of about 50 x 50 tiles (the first levels a little
 * smaller, the last a little bigger) and a round arena for the Slime King. Each room is a pure function of its id, so the client and the server always build the same one.
 *
 * A cave is grown the usual way: scatter floor at random, then smooth it a few times (a tile becomes rock when most of its neighbours are rock), keep the biggest open area, put the
 * way in at the rock face nearest the north-west and the way on at the rock face FARTHEST from it by walking distance, and a chest far from both. No enemies are written into the rooms:
 * the Warren's waves (dungeonSystem.js) bring the slimes. */
const SlimeRooms = (() => {
  /** The sets of rooms: the Warren's (levels 1-5 about 50 x 50, then the King's arena) and the castle crypt's (smaller: three levels, then the Baron's). */
  const SETS = {
    warren: { prefix: 'slime', name: 'Slime cave', sizes: [40, 45, 50, 55, 60], salt: 4100, chest: 5100, arena: { id: 'slime_king', name: 'The Slime King', size: 38, salt: 6100, pillars: 77 } },
    crypt:  { prefix: 'crypt', name: 'Crypt level', sizes: [34, 38, 42], salt: 9100, chest: 9700, arena: { id: 'crypt_baron', name: 'The Slime Baron', size: 34, salt: 9900, pillars: 91 } }
  };
  const SIZES = SETS.warren.sizes, ARENA = SETS.warren.arena.size;  const rngOf = (salt) => (x, y, k) => hash3(salt, x, y, k);

  /** Walking distance (4-way) from tile (sx, sy) over the open tiles of a Uint8Array grid (1 = open), -1 where not reachable. */
  function distances(open, w, h, sx, sy) {
    const dist = new Int32Array(w * h).fill(-1), queue = [sy * w + sx];
    dist[queue[0]] = 0;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head], x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, ni = ny * w + nx;
        if (nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && open[ni] && dist[ni] < 0) { dist[ni] = dist[i] + 1; queue.push(ni); }
      }
    }
    return dist;
  }

  /** The open tiles of a smoothed random cave, only the biggest connected area of them. */
  function carve(w, h, salt) {
    const R = rngOf(salt);
    for (let attempt = 0; attempt < 12; attempt++) {
      let open = new Uint8Array(w * h);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) open[y * w + x] = R(x, y, attempt) < 0.5 ? 1 : 0;
      for (let pass = 0; pass < 5; pass++) {
        const next = new Uint8Array(w * h);
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          let rock = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!open[(y + dy) * w + x + dx]) rock++;
          next[y * w + x] = rock >= 5 ? 0 : 1;
        }
        open = next;
      }
      let best = null;                                                                                    // the biggest area
      const seen = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        if (!open[i] || seen[i]) continue;
        const area = [i]; seen[i] = 1;
        for (let head = 0; head < area.length; head++) {
          const j = area[head], x = j % w, y = (j - x) / w;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nj = (y + dy) * w + x + dx; if (open[nj] && !seen[nj]) { seen[nj] = 1; area.push(nj); } }
        }
        if (!best || area.length > best.length) best = area;
      }
      if (best && best.length > w * h * 0.38) { const out = new Uint8Array(w * h); for (const i of best) out[i] = 1; return out; }
    }
    const out = new Uint8Array(w * h);                                                                    // (never happens: an open hall with rock pillars)
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) out[y * w + x] = (x % 7 === 3 && y % 7 === 3) ? 0 : 1;
    return out;
  }

  /** A rock tile with open floor right beside it (4-way), on the room's inside: the places a mouth can be cut. Returns [{ x, y, fx, fy }] (fx, fy: the floor beside it). */
  function faces(open, w, h) {
    const out = [];
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      if (open[y * w + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open[(y + dy) * w + x + dx]) { out.push({ x, y, fx: x + dx, fy: y + dy }); break; }
    }
    return out;
  }

  /** Build a room from its open tiles: 0 floor, 1 rock, 2 the way back (entrance), 3 the way on (exit), 5 a chest. */
  function finish(id, name, w, h, open, salt, chests) {
    const codes = []; for (let y = 0; y < h; y++) { const row = []; for (let x = 0; x < w; x++) row.push(open[y * w + x] ? 0 : 1); codes.push(row); }
    const fs = faces(open, w, h);
    if (!fs.length) return null;
    const entrance = fs.reduce((a, b) => (a.x + a.y <= b.x + b.y ? a : b));                               // nearest the north-west corner
    const dist = distances(open, w, h, entrance.fx, entrance.fy);
    let exit = null;
    for (const f of fs) { const d = dist[f.fy * w + f.fx]; if (d >= 0 && Math.hypot(f.x - entrance.x, f.y - entrance.y) > 6 && (!exit || d > exit.d)) exit = { f, d }; }
    if (!exit) return null;
    codes[entrance.y][entrance.x] = 2; codes[exit.f.y][exit.f.x] = 3;
    const dExit = distances(open, w, h, exit.f.fx, exit.f.fy), R = rngOf(salt);
    for (let c = 0; c < chests; c++) {                                                                    // the floor tile farthest (by walking) from both ways, out of 60 tries
      let best = null;
      for (let t = 0; t < 60; t++) {
        const x = 2 + Math.floor(R(c, t, 90) * (w - 4)), y = 2 + Math.floor(R(c, t, 91) * (h - 4)), i = y * w + x;
        if (!open[i] || dist[i] < 0 || codes[y][x] !== 0) continue;
        const score = Math.min(dist[i], dExit[i]) + R(c, t, 92) * 4;
        if (!best || score > best.score) best = { x, y, score };
      }
      if (best) codes[best.y][best.x] = 5;
    }
    return CaveRoom.fromRows(id, codes, name);
  }

  /** Cave level 1-5 (index 0-4). */
  function level(index, set = SETS.warren) {
    const size = set.sizes[index] || 50, id = `${set.prefix}_${index + 1}`;
    for (let salt = 0; salt < 20; salt++) {
      const open = carve(size, size, set.salt + index * 131 + salt * 7919), room = finish(id, `${set.name} ${index + 1}`, size, size, open, set.chest + index * 17 + salt, 1);
      if (room && !room.problems().length) return room;
    }
    return null;
  }

  /** The Slime King's round arena: a wide floor with rock pillars standing about, the way in on the west, a way out on the east. */
  function arena(set = SETS.warren) {
    const A = set.arena, w = A.size, h = A.size, open = new Uint8Array(w * h), c = (w - 1) / 2, R = rngOf(A.pillars);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= 16.5 + (R(x, y, 1) - 0.5) * 1.6) open[y * w + x] = 1;
    }
    for (const [px, py] of [[-8, -6], [8, -6], [-8, 7], [8, 7], [0, -10], [0, 11]]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx * dx + dy * dy <= 2) open[Math.round(c + py + dy) * w + Math.round(c + px + dx)] = 0;
    return finish(A.id, A.name, w, h, open, A.salt, 1);
  }

  const build = () => Object.values(SETS).flatMap(set => set.sizes.map((_, i) => level(i, set)).concat([arena(set)])).filter(Boolean);
  const rooms = build();
  for (const room of rooms) CaveRooms.register(room);
  return { rooms, level, arena, SETS, SIZES, ARENA };
})();
