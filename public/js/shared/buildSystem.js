'use strict';
/* SHARED - building: structure definitions, placement rules, and the built layers of the world.
 *
 * Everything player-built lives in a SLOT of a tile:
 *   'n' 'e' 's' 'w'  a wall-type piece (wall, window, door) as a thin slab FLUSH with that side of the tile.
 *                    A tile holds at most one per axis: two PERPENDICULAR pieces make a corner, parallel ones are
 *                    refused, but pieces on neighbouring tiles can sit back to back.
 *   'c'              a station (crafting table, clay furnace) that fills the tile
 *   'f'              the floor (kept in its own layer: map.floors, because a floor coexists with everything)
 * Walls block the EDGE of a tile (pathfinding checks edges), stations block the tile.
 * Open doors block nothing; the type switches between wood_door and wood_door_open. */
const defineStructure = (layer, extra = {}) => Object.freeze(Object.assign({ layer, blocks: true }, extra));
const StructureDefs = Object.freeze({
  wood_wall:      defineStructure('wall',    { name: 'Wood Wall', refundItemId: 'wood_wall', needsFloor: true }),               // walls stand on a floor (foundation)
  wood_window:    defineStructure('wall',    { name: 'Wood Window', refundItemId: 'wood_window', insert: 'wood_wall' }),         // windows and doors only go INTO an existing wall
  wood_door:      defineStructure('wall',    { name: 'Wood Door', refundItemId: 'wood_door', insert: 'wood_wall', toggles: 'wood_door_open', verb: 'Open' }),
  wood_door_open: defineStructure('wall',    { name: 'Wood Door (open)', refundItemId: 'wood_door', insert: 'wood_wall', toggles: 'wood_door', verb: 'Close', blocks: false }),
  wood_fence:     defineStructure('wall',    { name: 'Wood Fence', refundItemId: 'wood_fence', fence: true }),                      // fences need no foundation: build pens anywhere
  wood_gate:      defineStructure('wall',    { name: 'Wood Gate', refundItemId: 'wood_gate', insert: 'wood_fence', toggles: 'wood_gate_open', verb: 'Open', fence: true }),   // gates only go INTO a fence
  wood_gate_open: defineStructure('wall',    { name: 'Wood Gate (open)', refundItemId: 'wood_gate', insert: 'wood_fence', toggles: 'wood_gate', verb: 'Close', blocks: false, fence: true }),
  wood_floor:     defineStructure('floor',   { name: 'Wood Floor', refundItemId: 'wood_floor', blocks: false }),
  crafting_table: defineStructure('station', { name: 'Crafting Table', refundItemId: 'crafting_table' }),
  clay_furnace:   defineStructure('station', { name: 'Clay Furnace', refundItemId: 'clay_furnace' }),
  barn:           defineStructure('station', { name: 'Barn', refundItemId: 'barn', size: [5, 4], door: 2 }),                       // a barn the size of the General Store: shelters ponies like a stable, with a larger reach and a better apple discount
  barn_part:      defineStructure('station', { name: 'Barn', refundItemId: 'barn', partOf: 'barn' }),                              // (the other tiles of its footprint: the anchor is the north-west corner)                                              // a big barn: shelters ponies like a stable, with a larger reach and a better apple discount
  stable:         defineStructure('station', { name: 'Stable', refundItemId: 'stable', size: [3, 2], door: 1 }),                  // a timber stable with stalls, the size of a small home: a wild pony you lead here will take apples and settle
  stable_part:    defineStructure('station', { name: 'Stable', refundItemId: 'stable', partOf: 'stable' }),                                          // a roofed stall: a wild pony you lead here will take apples and settle
  campfire:       defineStructure('station', { name: 'Campfire', refundItemId: 'campfire', light: true }),
  stockpile_wood:  defineStructure('station', { name: 'Wood Stockpile', refundItemId: 'stockpile_wood', stockpile: 'wood' }),      // town storage: see stockpiles.js
  stockpile_stone: defineStructure('station', { name: 'Stone Stockpile', refundItemId: 'stockpile_stone', stockpile: 'stone' }),
  stockpile_clay:  defineStructure('station', { name: 'Clay Stockpile', refundItemId: 'stockpile_clay', stockpile: 'clay' })
});

const WALL_THICKNESS = 0.2;                                // fraction of a tile
const BUILD_REACH = 2.6;                                   // tiles from the builder to the target tile centre
const STATION_RANGE = 2.4, DOOR_RANGE = 1.1;               // tiles
const PLAYER_CLEARANCE = CONFIG.sim.playerRadius - 0.01;   // forgiving overlap test so you can build right next to yourself
const SIDES = Object.freeze(['n', 'e', 's', 'w']);         // clockwise
const OPPOSITE_SIDE = Object.freeze({ n: 's', s: 'n', e: 'w', w: 'e' });
const BUILD_SLOTS = Object.freeze(['n', 'e', 's', 'w', 'c']);

/** The slot a structure goes into when placed on the side `wallSide` (walls) / tile (the rest). */
const slotFor = (structureId, wallSide) => { const layer = StructureDefs[structureId].layer; return layer === 'floor' ? 'f' : layer === 'station' ? 'c' : wallSide; };

/** [x0, y0, x1, y1] of the piece in `slot` of tile (tx, ty), in world tile coordinates. */
function slabBox(tx, ty, slot) {
  const t = WALL_THICKNESS;
  switch (slot) {
    case 'n': return [tx, ty, tx + 1, ty + t];
    case 's': return [tx, ty + 1 - t, tx + 1, ty + 1];
    case 'w': return [tx, ty, tx + t, ty + 1];
    case 'e': return [tx + 1 - t, ty, tx + 1, ty + 1];
    default:  return [tx + 0.06, ty + 0.06, tx + 0.94, ty + 0.94];     // stations (and floors, for distance checks)
  }
}

/** The tiles a station covers when its anchor (north-west corner) is on (tx, ty): [[x, y], ...] (one tile for the small ones). */
function footprintOf(type, tx, ty) {
  const size = StructureDefs[type] && StructureDefs[type].size || [1, 1], out = [];
  for (let y = 0; y < size[1]; y++) for (let x = 0; x < size[0]; x++) out.push([tx + x, ty + y]);
  return out;
}
/** The big station (stable, barn) a tile belongs to: { type, tx, ty, w, h } of its anchor, or null. A tile that holds an anchor answers for itself. */
function anchorOf(map, tx, ty) {
  const here = map.built[tileKey(tx, ty)], c = here && here.c, def = c && StructureDefs[c];
  if (!def) return null;
  if (def.size) return { type: c, tx, ty, w: def.size[0], h: def.size[1] };
  if (!def.partOf) return null;
  const big = StructureDefs[def.partOf], [w, h] = big.size;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const a = map.built[tileKey(tx - dx, ty - dy)];
    if (a && a.c === def.partOf) return { type: def.partOf, tx: tx - dx, ty: ty - dy, w, h };
  }
  return null;
}

const builtAt = (map, tx, ty, slot) => { const t = map.built[tileKey(tx, ty)]; return (t && t[slot]) || null; };

/** Sets (type) or clears (null) the piece in a slot and refreshes the derived collision boxes. */
function setBuiltSide(map, tx, ty, slot, type) {
  const key = tileKey(tx, ty);
  const tile = map.built[key] || (map.built[key] = {});
  if (type) tile[slot] = type; else delete tile[slot];
  const slots = Object.keys(tile);
  if (!slots.length) { delete map.built[key]; delete map.slabs[key]; return; }
  const boxes = slots.filter(s => StructureDefs[tile[s]].blocks).map(s => slabBox(tx, ty, s));    // an open door has no box
  if (boxes.length) map.slabs[key] = boxes; else delete map.slabs[key];
}

/** Is there something solid on this side of the tile? (Open doors do not count.) */
function wallOnSide(map, tx, ty, side) {
  const type = builtAt(map, tx, ty, side);
  return !!type && StructureDefs[type].blocks;
}

/** Is the edge between tile (tx,ty) and its orthogonal neighbour (tx+dx, ty+dy) walled off (from either tile)? */
function edgeBlocked(map, tx, ty, dx, dy) {
  const side = dx === 1 ? 'e' : dx === -1 ? 'w' : dy === 1 ? 's' : 'n';
  return wallOnSide(map, tx, ty, side) || wallOnSide(map, tx + dx, ty + dy, OPPOSITE_SIDE[side]);
}

const boxesTouch = (a, b) => a[0] <= b[2] + 1e-6 && b[0] <= a[2] + 1e-6 && a[1] <= b[3] + 1e-6 && b[1] <= a[3] + 1e-6;

/** How well would a wall on `side` of tile (tx,ty) connect to what is already built? Continuing a line (same direction)
 *  counts double, meeting one at a corner counts once. New walls snap to the best connection. */
function wallConnections(map, tx, ty, side) {
  const box = slabBox(tx, ty, side), horizontal = b => b[2] - b[0] > b[3] - b[1];
  let score = 0;
  for (let ny = ty - 1; ny <= ty + 1; ny++) for (let nx = tx - 1; nx <= tx + 1; nx++) {
    for (const other of map.slabs[tileKey(nx, ny)] || []) if (boxesTouch(box, other)) score += horizontal(box) === horizontal(other) ? 2 : 1;
  }
  return score;
}

const BuildSystem = {
  /** The tile in front of the player: their tile + the snapped 8-way facing direction. */
  targetTile(p) {
    const a = snapAngle8(p.facing);
    return { tx: Math.floor(p.x) + Math.round(Math.cos(a)), ty: Math.floor(p.y) + Math.round(Math.sin(a)) };
  },

  /** The tile side facing the builder (opposite the direction of travel dx,dy), then turned `rotation` quarter-turns clockwise. */
  sideFor(dx, dy, rotation = 0) {
    const base = Math.abs(dx) > Math.abs(dy) + 1e-6 ? (dx > 0 ? 'w' : 'e') : (dy > 0 ? 'n' : 's');
    return SIDES[(SIDES.indexOf(base) + rotation) % 4];
  },

  /**
   * Every side a wall could go on, best first: sides that CONNECT to existing walls come first, then the rest clockwise
   * from the side facing the builder. Rotating cycles through this list, so the first choice already snaps to your walls.
   */
  sideOptions(map, tx, ty, dx, dy) {
    const tile = map.built[tileKey(tx, ty)] || {}, base = BuildSystem.sideFor(dx, dy, 0);
    const clockwise = [0, 1, 2, 3].map(i => SIDES[(SIDES.indexOf(base) + i) % 4]);
    const valid = clockwise.filter(s => !tile[s] && !tile[OPPOSITE_SIDE[s]] && !tile.c);
    return (valid.length ? valid : [base])
      .map((side, order) => ({ side, order, score: wallConnections(map, tx, ty, side) }))
      .sort((a, b) => b.score - a.score || a.order - b.order).map(o => o.side);
  },

  /**
   * Can `structureId` go into `slot` of tile (tx,ty)?
   *   walls            need a FLOOR on the tile (the foundation) and a free side
   *   windows / doors  only replace an existing plain wall piece
   *   floors, stations as before
   * @param {string} slot 'n'|'e'|'s'|'w' | 'c' | 'f'  @param {Array<{x,y}>} positions everybody who could be in the way  @param {{x,y}} [builder] enables the reach check
   */
  canPlace(map, tx, ty, slot, positions, builder, structureId) {
    const no = reason => ({ ok: false, reason });
    const def = structureId ? StructureDefs[structureId] : null;
    if (isWaterTile(map.tile(tx, ty))) return no('Cannot build on water');
    if (map.objAt(tx, ty) !== OBJ.NONE || map.propAt(tx, ty)) return no('Something is in the way');
    if (typeof Groves !== 'undefined' && Groves.at(map, tx, ty)) return no('A sapling is growing there');
    const key = tileKey(tx, ty), tile = map.built[key] || {};
    const insert = !!(def && def.insert);
    if (slot === 'f') { if (map.floors[key]) return no('Already has a floor'); }
    else if (slot === 'c') {
      if (Object.keys(tile).length) return no('Something is in the way');
      for (const [fx, fy] of footprintOf(structureId, tx, ty).slice(1)) {                           // the rest of a big building's footprint must be free ground too
        const k2 = tileKey(fx, fy);
        if (isWaterTile(map.tile(fx, fy)) || map.objAt(fx, fy) !== OBJ.NONE || map.propAt(fx, fy) || (map.built[k2] && Object.keys(map.built[k2]).length) || map.floors[k2]
            || (typeof Groves !== 'undefined' && Groves.at(map, fx, fy))) return no('A ' + def.name.toLowerCase() + ' needs a clear ' + def.size[0] + ' x ' + def.size[1] + ' space');
      }
    }
    else if (insert) {
      const existing = tile[slot];
      if (!existing) return no(def.fence ? 'Gates go into an existing fence' : 'Windows and doors go into an existing wall');
      if (existing !== def.insert) {                                                                // already holds a window / door / gate, or is the wrong kind of piece
        const sameFamily = StructureDefs[existing].insert === def.insert;
        return no(sameFamily ? 'That ' + (def.fence ? 'fence' : 'wall') + ' already has a ' + StructureDefs[existing].name.toLowerCase().replace(' (open)', '').replace('wood ', '')
                             : (def.fence ? 'Gates only go into a plain wood fence' : 'Windows and doors only go into a plain wood wall'));
      }
    } else {
      if (tile.c) return no('Something is in the way');
      if (def && def.needsFloor && !map.floors[key]) return no('Walls need a floor to stand on: build a floor first');
      if (tile[slot]) return no('There is already a wall there');
      if (tile[OPPOSITE_SIDE[slot]]) return no('Parallel walls cannot share a tile');
    }
    if (builder && Math.hypot(tx + 0.5 - builder.x, ty + 0.5 - builder.y) > BUILD_REACH) return no('Too far away');
    if (slot !== 'f' && !insert) {
      for (const [fx, fy] of slot === 'c' ? footprintOf(structureId, tx, ty) : [[tx, ty]]) {
        const [x0, y0, x1, y1] = slabBox(fx, fy, slot);
        for (const q of positions) if (circleOverlapsBox(q.x, q.y, PLAYER_CLEARANCE, x0, y0, x1, y1)) return no('Someone is standing there');
      }
    }
    return { ok: true };
  },

  /** Sides of a tile that already hold a plain wall, nearest the direction the builder faces first: where a window / door can go. */
  insertOptions(map, tx, ty, dx, dy, hostType = 'wood_wall') {
    const tile = map.built[tileKey(tx, ty)] || {}, base = BuildSystem.sideFor(dx, dy, 0);
    const clockwise = [0, 1, 2, 3].map(i => SIDES[(SIDES.indexOf(base) + i) % 4]);
    const walls = clockwise.filter(s => tile[s] === hostType);
    return walls.length ? walls : [base];
  },

  /** Does the big station whose anchor is on (tx, ty) have all its tiles? (An older, one-tile stable does not.) */
  complete(map, tx, ty) {
    const a = anchorOf(map, tx, ty);
    return !a || footprintOf(a.type, a.tx, a.ty).slice(1).every(([x, y]) => { const t = map.built[tileKey(x, y)]; return t && t.c === a.type + '_part'; });
  },

  place(map, tx, ty, type, slot) {
    if (slot === 'f') map.floors[tileKey(tx, ty)] = type;
    else if (slot === 'c' && StructureDefs[type].size) {                                            // a big station: the anchor here, its other tiles as parts
      const [first, ...rest] = footprintOf(type, tx, ty);
      setBuiltSide(map, first[0], first[1], 'c', type);
      for (const [x, y] of rest) setBuiltSide(map, x, y, 'c', type + '_part');
    } else setBuiltSide(map, tx, ty, slot, type);
  },

  /** Removes one piece; returns its type (or null when there was none). */
  remove(map, tx, ty, slot) {
    if (slot === 'f') { const key = tileKey(tx, ty), type = map.floors[key] || null; delete map.floors[key]; return type; }
    const type = builtAt(map, tx, ty, slot);
    if (type && slot === 'c' && (StructureDefs[type].size || StructureDefs[type].partOf)) {            // taking down any tile of a big station takes it all down
      const a = anchorOf(map, tx, ty);
      if (a) { for (const [x, y] of footprintOf(a.type, a.tx, a.ty)) setBuiltSide(map, x, y, 'c', null); return a.type; }
    }
    if (type) setBuiltSide(map, tx, ty, slot, null);
    return type;
  },

  /** Client side: make the walls / stations (map.built) identical to the server's dictionary. */
  replaceAll(map, builtDict) {
    for (const key of new Set([...Object.keys(map.built), ...Object.keys(builtDict)])) {
      const have = map.built[key] || {}, want = builtDict[key] || {};
      for (const slot of BUILD_SLOTS) if (have[slot] !== want[slot]) setBuiltSide(map, keyTileX(key), keyTileY(key), slot, want[slot] || null);
    }
  },
  replaceFloors(map, floorDict) { map.floors = Object.assign({}, floorDict); },

  /** The nearest thing a stone hammer can take down: wall pieces and stations first, floors only if nothing else is near.
   *  Returns { tx, ty, slot, type, x, y } (x,y = centre) or null. */
  findDemolishable(map, p, reach, stationsOnly = false) {
    const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
    let best = null, bestScore = Infinity;
    const consider = (tx, ty, slot, type, floorPenalty) => {
      if (stationsOnly && slot !== 'c') return;
      const [x0, y0, x1, y1] = slabBox(tx, ty, slot), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const gap = Math.hypot(p.x - clamp(p.x, x0, x1), p.y - clamp(p.y, y0, y1));
      if (gap > reach) return;
      const dist = Math.hypot(cx - p.x, cy - p.y);
      const score = gap - FACING_PREFERENCE * (dist > 1e-6 ? ((cx - p.x) * fx + (cy - p.y) * fy) / dist : 0) + floorPenalty;
      if (score < bestScore) { bestScore = score; best = { tx, ty, slot, type, x: cx, y: cy }; }
    };
    for (const key of Object.keys(map.built)) for (const slot of Object.keys(map.built[key])) consider(keyTileX(key), keyTileY(key), slot, map.built[key][slot], 0);
    for (const key of Object.keys(map.floors)) consider(keyTileX(key), keyTileY(key), 'f', map.floors[key], 1);
    return best;
  },

  /** Nearest door within `range` of the player: { tx, ty, slot, type, dist } or null. */
  findDoor(map, p, range = DOOR_RANGE) {
    let best = null;
    const px = Math.floor(p.x), py = Math.floor(p.y), span = Math.ceil(range) + 1;
    for (let ty = py - span; ty <= py + span; ty++) for (let tx = px - span; tx <= px + span; tx++) {
      const tile = map.built[tileKey(tx, ty)];
      if (!tile) continue;
      for (const slot of SIDES) {
        if (!tile[slot] || !StructureDefs[tile[slot]].toggles) continue;
        const [x0, y0, x1, y1] = slabBox(tx, ty, slot), dist = Math.hypot(p.x - clamp(p.x, x0, x1), p.y - clamp(p.y, y0, y1));
        if (dist <= range && (!best || dist < best.dist)) best = { tx, ty, slot, type: tile[slot], dist };
      }
    }
    return best;
  },

  /** Every station within `range` of the player: [{ type, tx, ty, dist }]. */
  stationTilesNear(map, p, range = STATION_RANGE) {
    const found = [], span = Math.ceil(range) + 1, px = Math.floor(p.x), py = Math.floor(p.y);
    for (let ty = py - span; ty <= py + span; ty++) for (let tx = px - span; tx <= px + span; tx++) {
      const tile = map.built[tileKey(tx, ty)], dist = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y);
      if (tile && tile.c && dist <= range) found.push({ type: tile.c, tx, ty, dist });
    }
    return found.sort((a, b) => a.dist - b.dist);
  },

  /** Which stations are within crafting range of the player? (a Set of structure ids) */
  stationsNear(map, p, range = STATION_RANGE) {
    const found = new Set(), span = Math.ceil(range) + 1, px = Math.floor(p.x), py = Math.floor(p.y);
    for (let ty = py - span; ty <= py + span; ty++) for (let tx = px - span; tx <= px + span; tx++) {
      const tile = map.built[tileKey(tx, ty)];
      if (tile && tile.c && Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) <= range) found.add(tile.c);
    }
    if (typeof HomeCrafts !== 'undefined') for (const st of HomeCrafts.stationsNear(map, p, range)) found.add(st);   // a loom (or any furniture station) in the room
    return found;
  }
};
