'use strict';
/* SHARED - the hand-built starting village that is stamped into the otherwise procedural world.
 * Everything is a pure function of tile coordinates, so any chunk can ask "what is at (tx, ty)?" independently. */
const Village = (() => {
  const AREA = { x0: 3, y0: 3, x1: 36, y1: 36 };
  const LAKE = { cx: 31, cy: 9, rx: 7.2, ry: 5 }, POND = { cx: 6.2, cy: 31.4, rx: 4.1, ry: 3.5 };
  const SHALLOW_RING = 1.28;                           // the shallows reach this much farther than the deep water
  const PLAZA = { x0: 17, y0: 17, x1: 23, y1: 23 };
  const KEEP = { x0: 4, y0: 4, x1: 11, y1: 10 };
  const HOME_SITE = BuildingSites.list.find(s => s.def.instance === 'player');           // the buildings themselves are BuildingSites (data: js/data/buildings/)
  const HOME = HOME_SITE ? { x0: HOME_SITE.x0, y0: HOME_SITE.y0, x1: HOME_SITE.x1, y1: HOME_SITE.y1 } : { x0: 14, y0: 30, x1: 17, y1: 32 };   // the player home
  const WORKSHOP = { x: 19, y: 31 };                                   // the open-air crafting table in the home's yard (the testing version builds it)
  const PADDOCK = { x0: 21, y0: 31, x1: 26, y1: 35 };                  // the starter fenced paddock (with a stable inside), east of the home
  const SPAWNS = [{ x: 19.5, y: 25.5 }, { x: 21.5, y: 25.5 }, { x: 19.5, y: 27.5 }, { x: 21.5, y: 27.5 }];
  const INFLUENCE_FALLOFF = 16;                       // tiles over which natural terrain is lifted above sea level

  const within = (r, tx, ty) => tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1;
  const inEllipse = (e, tx, ty, scale = 1) => {       // jittered edge so the shore is not a perfect oval
    const nx = (tx + 0.5 - e.cx) / (e.rx * scale), ny = (ty + 0.5 - e.cy) / (e.ry * scale);
    return nx * nx + ny * ny < 1 + (hash2(tx, ty) - 0.5) * 0.35;
  };

  /** Ground type forced by the village, or -1 to leave it to the terrain generator. */
  function tile(tx, ty) {
    if (inEllipse(LAKE, tx, ty) || inEllipse(POND, tx, ty)) return TILE.WATER;
    if (within(PLAZA, tx, ty) || within(KEEP, tx, ty) || ((tx === 7 || tx === 8) && ty === 11)) return TILE.STONE;
    const inX = tx >= AREA.x0 && tx <= AREA.x1, inY = ty >= AREA.y0 && ty <= AREA.y1;
    if (inX && (ty === 20 || ty === 21)) return TILE.DIRT;                                  // east-west road
    if (inY && (tx === 20 || tx === 21)) return TILE.DIRT;                                  // north-south road
    if ((tx === 7 || tx === 8) && ty >= 11 && ty <= 19) return TILE.DIRT;                   // keep gate road
    if (ty === 28 && tx >= 10 && tx <= 19) return TILE.DIRT;                                // west street (carpenter)
    if (ty === 29 && tx >= 21 && tx <= 31) return TILE.DIRT;                                // east street (general store, veterinary)
    for (const s of BuildingSites.list) {                                                    // a path from every door down to its street (or a step outside)
      const street = s.doorY >= 28 ? s.doorY + 1 : s.doorY < 20 ? 19 : s.doorX > 20 ? 28 : 27;      // (north of the main road: a step down to it)
      if (tx === s.doorX && ty > s.doorY && ty <= street) return TILE.DIRT;
    }
    if (inEllipse(LAKE, tx, ty, SHALLOW_RING) || inEllipse(POND, tx, ty, SHALLOW_RING)) return TILE.SHALLOW;   // wading ring round the deep water
    return -1;
  }

  /** Solid structure on this tile (keep walls and towers, houses). */
  function obj(tx, ty) {
    if (within(KEEP, tx, ty)) {
      if ([[KEEP.x0, KEEP.y0], [KEEP.x1, KEEP.y0], [KEEP.x0, KEEP.y1], [KEEP.x1, KEEP.y1], [6, KEEP.y1], [9, KEEP.y1]].some(([x, y]) => x === tx && y === ty)) return OBJ.TOWER;
      const edge = tx === KEEP.x0 || tx === KEEP.x1 || ty === KEEP.y0 || ty === KEEP.y1;
      const gate = ty === KEEP.y1 && (tx === 7 || tx === 8);
      return edge && !gate ? OBJ.WALL : OBJ.NONE;
    }
    return BuildingSites.obj(tx, ty);                                                       // the carpenter, store, veterinary, homes...
  }

  /** 1 inside the village, fading to 0 over INFLUENCE_FALLOFF tiles. Used to lift natural terrain so the village stays on land. */
  function influence(tx, ty) {
    const dx = Math.max(AREA.x0 - tx, 0, tx - AREA.x1), dy = Math.max(AREA.y0 - ty, 0, ty - AREA.y1);
    const t = clamp(1 - Math.hypot(dx, dy) / INFLUENCE_FALLOFF, 0, 1);
    return t * t * (3 - 2 * t);
  }

  /** Keep random trees away from buildings and the spawn area. */
  function blocksTrees(tx, ty) {
    if (Math.hypot(tx + 0.5 - 20.5, ty + 0.5 - 26.5) < 4) return true;
    if (tx >= HOME.x0 - 2 && tx <= HOME.x1 + 2 && ty >= HOME.y0 - 2 && ty <= HOME.y1 + 3) return true;   // keep the starter home's yard clear
    if (tx >= PADDOCK.x0 - 1 && tx <= PADDOCK.x1 + 1 && ty >= PADDOCK.y0 - 1 && ty <= PADDOCK.y1 + 1) return true;   // ...and the paddock
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (obj(tx + dx, ty + dy)) return true;
    return false;
  }

  // well + barrels: fixed list with small deterministic jitter
  const props = new Map();
  const rng = mulberry32(4242);
  props.set(tileKey(20, 20), { t: 'well', x: 20.5, y: 20.5, r: 0.5 / TILE_SCALE, v: 0 });
  [[17.5, 17.5], [22.5, 17.5], [17.5, 22.5], [22.5, 22.5], [5.5, 5.5], [10.5, 5.5], [10.5, 9.5], [5.5, 9.5],
   [13.5, 24.5], [29.5, 23.5], [34.5, 25.5], [23.5, 24.5]].forEach(([x, y]) => {
    props.set(tileKey(Math.floor(x), Math.floor(y)), { t: 'barrel', x: x + (rng() - 0.5) * 0.2, y: y + (rng() - 0.5) * 0.2, r: 0.26 / TILE_SCALE, v: 0 });
  });
  /** Real things standing about each building (its data `exterior.props`: barrels, crates, firewood, flowers, hay), on the ground beside its door
   *  rather than painted on its wall: you walk round them and they sort with you. */
  (function placeDecor() {
    const GROUND = { barrels: 'barrel', crates: 'crate', firewood: 'firewood', flowers: 'planter', hay: 'hay' }, used = new Set();
    for (const s of BuildingSites.list) {
      const spots = [[s.doorX + 1, s.y1 + 1], [s.doorX - 1, s.y1 + 1], [s.doorX + 2, s.y1 + 1], [s.doorX - 2, s.y1 + 1], [s.x1 + 1, s.y1], [s.x0 - 1, s.y1], [s.x1 + 1, s.y1 - 1], [s.x0 - 1, s.y1 - 1]];
      for (const name of (s.def.exterior && s.def.exterior.props) || []) {
        const kind = GROUND[name]; if (!kind) continue;                                  // (a lantern and the sign stay on the wall)
        const spot = spots.find(([tx, ty]) => {
          const key = tileKey(tx, ty), t = tile(tx, ty);
          return !used.has(key) && !props.has(key) && tx !== s.doorX && !BuildingSites.at(tx, ty) && !within(KEEP, tx, ty) && !within(PADDOCK, tx, ty)
            && !(tx === WORKSHOP.x && ty === WORKSHOP.y) && t !== TILE.WATER && t !== TILE.SHALLOW;
        });
        if (!spot) continue;
        const [tx, ty] = spot, v = Math.floor(rng() * 4), jit = () => (rng() - 0.5) * 0.16;
        used.add(tileKey(tx, ty));
        props.set(tileKey(tx, ty), kind === 'barrel' ? { t: 'barrel', x: tx + 0.5 + jit(), y: ty + 0.5 + jit(), r: 0.26 / TILE_SCALE, v }
          : { t: 'decor', kind, x: tx + 0.5 + jit(), y: ty + 0.5 + jit(), r: 0.3 / TILE_SCALE, v });
      }
    }
  })();
  props.set(tileKey(23, 26), { t: 'chest', x: 23.5, y: 26.5, r: 0.32 / TILE_SCALE, v: 0 });          // the beginner's loot chest, next to the spawn
  // three apple trees near the home (ordinary trees you can also pick fruit from)
  [[19, 33], [12, 33], [18, 36]].forEach(([tx, ty], i) => props.set(tileKey(tx, ty), {
    t: 'tree', x: tx + 0.5, y: ty + 0.5, r: 0.33 / TILE_SCALE, v: 2 + i, hp: TreeDef.maxHp, forage: 'apple_tree', drop: 'apple', ripe: true
  }));
  const propAtTile = (tx, ty) => props.get(tileKey(tx, ty)) || null;

  /** Chunks that contain the lake / pond always get a boat. */
  const hasBoatFeature = (cx, cy) => (cx === (LAKE.cx >> CHUNK_SHIFT) && cy === (LAKE.cy >> CHUNK_SHIFT)) || (cx === (POND.cx >> CHUNK_SHIFT) && cy === (POND.cy >> CHUNK_SHIFT));

  return { tile, obj, influence, blocksTrees, propAtTile, hasBoatFeature, spawns: SPAWNS, home: HOME, workshop: WORKSHOP, paddock: PADDOCK };
})();
