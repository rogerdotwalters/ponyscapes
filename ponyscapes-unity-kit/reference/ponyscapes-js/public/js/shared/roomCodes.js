'use strict';
/* SHARED - the language of a dungeon room. A room is a 2D list of NUMBERS, one per tile; a PNG of the same size is just a picture of that list
 * (tools/cave-rooms.js turns a folder of PNGs into js/content/caveRooms.js, so a 100x150 PNG is a 100x150 tile room).
 *
 *   code   meaning                         notes
 *   0      floor                           walkable
 *   1      wall                            solid (everything outside the picture is wall too)
 *   2      entrance                        where you arrive; interact on it to go BACK a room (the first room: back outside)
 *   3      exit / next room                interact on it to go ON to the next room (the last room: back outside)
 *   4      enemy spawn node                a random enemy from the dungeon's list stands here
 *   5      chest                           a one-time loot chest
 *   6-999  (reserved: doors, traps, switches, keys, healing springs ...)
 *   1000+  a SPECIFIC enemy                1000 + the creature's number (js/shared/enemyCodes.js: EnemyCodes)
 *
 * A PNG can be drawn two ways:
 *   16-bit grey  the pixel value IS the code (0 = floor ... 1000+ = enemies). Exact, but nearly black on screen.
 *   8-bit grey   a viewable palette (RoomPixels below): mid grey floor, darker grey wall, light greys for the markers, and the 31 darkest
 *                non-black greys (1-31) are enemies 1000-1030. Black is solid rock (a wall). Anything off the palette snaps to the nearest entry. */
const RoomCode = Object.freeze({ FLOOR: 0, WALL: 1, ENTRANCE: 2, EXIT: 3, SPAWN: 4, CHEST: 5, ENEMY_BASE: 1000, MAX: 65535 });
const isEnemyCode = code => code >= RoomCode.ENEMY_BASE;

/** The 8-bit grey of each code, as painted into a PNG. */
const RoomPixels = Object.freeze({
  [RoomCode.FLOOR]: 128, [RoomCode.WALL]: 64, [RoomCode.ENTRANCE]: 255, [RoomCode.EXIT]: 224, [RoomCode.SPAWN]: 192, [RoomCode.CHEST]: 160,
  VOID: 0,                                       // black: rock outside the cave (reads as a wall)
  ENEMY_FIRST: 1, ENEMY_LAST: 31                 // grey 1..31 = enemy code 1000..1030 (only the first 31 creatures can be drawn in 8 bits; use 16 bits for the rest)
});
const ROOM_PALETTE = [[0, RoomCode.WALL], [64, RoomCode.WALL], [128, RoomCode.FLOOR], [160, RoomCode.CHEST], [192, RoomCode.SPAWN], [224, RoomCode.EXIT], [255, RoomCode.ENTRANCE]];

/** The code an 8-bit grey stands for. */
function roomCodeOfGrey(g) {
  if (g >= RoomPixels.ENEMY_FIRST && g <= RoomPixels.ENEMY_LAST) return RoomCode.ENEMY_BASE + g - RoomPixels.ENEMY_FIRST;
  let best = ROOM_PALETTE[0];
  for (const e of ROOM_PALETTE) if (Math.abs(e[0] - g) < Math.abs(best[0] - g)) best = e;
  return best[1];
}
/** The 8-bit grey that draws a code (an enemy past the 31st has no 8-bit grey: null). */
function roomGreyOfCode(code) {
  if (isEnemyCode(code)) { const g = code - RoomCode.ENEMY_BASE + RoomPixels.ENEMY_FIRST; return g <= RoomPixels.ENEMY_LAST ? g : null; }
  return RoomPixels[code] === undefined ? RoomPixels[RoomCode.WALL] : RoomPixels[code];       // (a reserved code with no look yet is drawn as wall)
}

const ROOM_MAX_SIDE = 400;

/** One room, checked and ready: `codes` is row-major (y * w + x). Build it with CaveRoom.fromRows (a 2D list) or CaveRoom.fromGrey (a decoded PNG). */
class CaveRoom {
  constructor(id, name, w, h, codes) {
    this.id = id; this.name = name; this.w = w; this.h = h; this.codes = codes;
    this.entrances = []; this.exits = []; this.spawns = []; this.chests = []; this.enemies = [];          // [{ x, y }] (enemies: { x, y, code })
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = codes[y * w + x];
      if (c === RoomCode.ENTRANCE) this.entrances.push({ x, y });
      else if (c === RoomCode.EXIT) this.exits.push({ x, y });
      else if (c === RoomCode.SPAWN) this.spawns.push({ x, y });
      else if (c === RoomCode.CHEST) this.chests.push({ x, y });
      else if (isEnemyCode(c)) this.enemies.push({ x, y, code: c });
    }
  }
  code(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? RoomCode.WALL : this.codes[y * this.w + x]; }
  /** Can you stand here? (the picture's edge, rock and a reserved code we do not know yet are not) */
  walkable(x, y) { return this.code(x, y) !== RoomCode.WALL && (this.code(x, y) < 6 || isEnemyCode(this.code(x, y))); }
  /** Every problem with the room that would stop it being played (an empty list = fine). */
  problems() {
    const out = [];
    if (!this.entrances.length) out.push('no entrance (code 2)');
    if (!this.exits.length) out.push('no exit (code 3)');
    if (this.entrances.length && this.exits.length) {                                                 // the way on must be reachable from the way in
      const seen = new Uint8Array(this.w * this.h), stack = [this.entrances[0].x + this.entrances[0].y * this.w];
      seen[stack[0]] = 1;
      while (stack.length) {
        const i = stack.pop(), x = i % this.w, y = (i - x) / this.w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, ni = ny * this.w + nx;
          if (nx >= 0 && ny >= 0 && nx < this.w && ny < this.h && !seen[ni] && this.walkable(nx, ny)) { seen[ni] = 1; stack.push(ni); }
        }
      }
      if (!this.exits.some(e => seen[e.x + e.y * this.w])) out.push('the exit cannot be reached from the entrance');
    }
    return out;
  }
  /** Back to the 2D list. */
  toRows() { const rows = []; for (let y = 0; y < this.h; y++) rows.push(Array.from(this.codes.subarray(y * this.w, (y + 1) * this.w))); return rows; }

  /** From a 2D list of codes (rows may differ in length: short rows are padded with walls). Returns null if it is not a usable list. */
  static fromRows(id, rows, name) {
    if (!Array.isArray(rows) || !rows.length || rows.length > ROOM_MAX_SIDE) return null;
    const w = Math.max(...rows.map(r => (Array.isArray(r) ? r.length : 0)));
    if (!w || w > ROOM_MAX_SIDE) return null;
    const codes = new Uint16Array(w * rows.length).fill(RoomCode.WALL);
    rows.forEach((r, y) => { if (Array.isArray(r)) r.forEach((c, x) => { codes[y * w + x] = Number.isInteger(c) && c >= 0 && c <= RoomCode.MAX ? c : RoomCode.WALL; }); });
    return new CaveRoom(id, typeof name === 'string' && name ? name : id, w, rows.length, codes);
  }
  /** From the grey values of a decoded PNG (row-major, one number per pixel) and its bit depth (8 or 16). */
  static fromGrey(id, w, h, grey, depth, name) {
    const codes = new Uint16Array(w * h);
    for (let i = 0; i < codes.length; i++) codes[i] = depth === 16 ? grey[i] : roomCodeOfGrey(grey[i]);
    return w > 0 && h > 0 && w <= ROOM_MAX_SIDE && h <= ROOM_MAX_SIDE ? new CaveRoom(id, name || id, w, h, codes) : null;
  }
}

/** The rooms in js/content/caveRooms.js (window.PONYSCAPES_CAVE_ROOMS = { id: { name, rows } }), checked. A broken one is left out, never a crash. */
const CaveRooms = (() => {
  const root = typeof globalThis !== 'undefined' ? globalThis : {}, raw = root.PONYSCAPES_CAVE_ROOMS && typeof root.PONYSCAPES_CAVE_ROOMS === 'object' ? root.PONYSCAPES_CAVE_ROOMS : {};
  const rooms = {};
  for (const [id, r] of Object.entries(raw)) {
    const room = r && /^[a-z][a-z0-9_]{0,39}$/.test(id) ? CaveRoom.fromRows(id, r.rows, r.name) : null;
    if (room && !room.problems().length) rooms[id] = Object.freeze(room);
  }
  /** Add a room made by code (the Slime Warren's: slimeRooms.js). It must have no problems. */
  const register = room => { if (room && !room.problems().length) rooms[room.id] = Object.freeze(room); };
  return { rooms, get: id => rooms[id] || null, ids: () => Object.keys(rooms), register };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { RoomCode, RoomPixels, CaveRoom, isEnemyCode, roomCodeOfGrey, roomGreyOfCode, ROOM_MAX_SIDE };
