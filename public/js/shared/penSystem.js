'use strict';
/* SHARED - is this spot inside a PEN? A pen is a region fully closed off by fences, walls, closed gates / doors,
 * water or solid structures. Flood-fill outward tile by tile; if it spills past `limit` tiles it is not a pen. */
const PenSystem = {
  /** @returns {{enclosed:boolean, area:number}} */
  analyze(map, x, y, limit = 160) {
    const sx = Math.floor(x), sy = Math.floor(y), seen = new Set([tileKey(sx, sy)]), queue = [[sx, sy]];
    const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let head = 0; head < queue.length; head++) {
      if (queue.length > limit) return { enclosed: false, area: limit };
      const [tx, ty] = queue[head];
      for (const [dx, dy] of STEPS) {
        const nx = tx + dx, ny = ty + dy, key = tileKey(nx, ny);
        const built = map.built[key];
        if (seen.has(key) || edgeBlocked(map, tx, ty, dx, dy) || map.isSolid(nx, ny) || (built && built.c)) continue;      // 'c' = a station (table, furnace) fills the tile   // water, buildings and stations are boundaries too
        seen.add(key); queue.push([nx, ny]);
      }
    }
    return { enclosed: true, area: queue.length };
  }
};

/** Where a caught wild pony will settle down: beside a stable, or inside any closed-in pen (fences + shut gate). */
const STABLE_RANGE = 2.8, SHELTER_PEN_LIMIT = 120;
const Shelter = {
  /** The nearest stable within range of (x, y): { tx, ty, dist } or null. */
  stableNear(map, x, y, range = STABLE_RANGE) {
    const px = Math.floor(x), py = Math.floor(y), span = Math.ceil(range) + 6;                    // (far enough to see the anchor of a big barn)
    let best = null;
    for (let ty = py - span; ty <= py + span; ty++) for (let tx = px - span; tx <= px + span; tx++) {
      const tile = map.built[tileKey(tx, ty)];
      if (!tile || (tile.c !== 'stable' && tile.c !== 'barn')) continue;
      const [w, h] = StructureDefs[tile.c].size, reach = tile.c === 'barn' ? range + 1.2 : range;   // a barn reaches a little farther
      const dist = Math.hypot(x - clamp(x, tx, tx + w), y - clamp(y, ty, ty + h));                // (from the nearest point of the building)
      if (dist <= reach && (!best || dist < best.dist) && Shelter._reaches(map, x, y, tx, ty, w, h)) best = { tx, ty, dist, type: tile.c };
    }
    if (map.grid === '' || map.grid === undefined) for (const site of BuildingSites.list) {              // the village STABLE (its door and walls count: a pony beside it is in shelter)
      if (!site.def.stable) continue;
      const dist = Math.hypot(x - clamp(x, site.x0, site.x1 + 1), y - clamp(y, site.y0, site.y1 + 1));
      if (dist <= range + 0.6 && (!best || dist < best.dist) && Shelter._reaches(map, x, y, site.x0, site.y0, site.w, site.h)) best = { tx: site.x0, ty: site.y0, dist, type: site.id };
    }
    return best;
  },
  /** Can you walk from (x, y) to the building in a few steps? A pony on the other side of a fence does not count as "in" the stable. */
  _reaches(map, x, y, stx, sty, sw = 1, sh = 1, maxSteps = 7) {
    const sx = Math.floor(x), sy = Math.floor(y), STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]], seen = new Set([tileKey(sx, sy)]);
    const inside = (tx, ty) => tx >= stx && tx < stx + sw && ty >= sty && ty < sty + sh;
    let frontier = [[sx, sy]];
    for (let step = 0; step < maxSteps && frontier.length; step++) {
      const next = [];
      for (const [tx, ty] of frontier) for (const [dx, dy] of STEPS) {
        const nx = tx + dx, ny = ty + dy, key = tileKey(nx, ny);
        if (edgeBlocked(map, tx, ty, dx, dy)) continue;
        if (inside(nx, ny)) return true;                                    // reached the building itself
        if (seen.has(key) || map.isSolid(nx, ny) || (map.built[key] && map.built[key].c)) continue;
        seen.add(key); next.push([nx, ny]);
      }
      frontier = next;
    }
    return false;
  },
  /** { kind: 'stable' | 'pen', ... } or null. */
  find(map, x, y) {
    const stable = Shelter.stableNear(map, x, y);
    if (stable) return { kind: 'stable', tx: stable.tx, ty: stable.ty };
    const pen = PenSystem.analyze(map, x, y, SHELTER_PEN_LIMIT);
    return pen.enclosed ? { kind: 'pen', area: pen.area } : null;
  }
};
