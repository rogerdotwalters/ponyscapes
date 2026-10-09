'use strict';
/* SHARED - the hand-built starting village that is stamped into the otherwise procedural world.
 * Everything is a pure function of tile coordinates, so any chunk can ask "what is at (tx, ty)?" independently. */
const Village = (() => {
  const AREA = { x0: -14, y0: -4, x1: 64, y1: 52 };
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

  /** The village's concrete (paving): the two main roads, the gate road, the two streets, the plaza and the keep's court. */
  function pavedAt(tx, ty) {
    if (within(PLAZA, tx, ty) || within(KEEP, tx, ty) || ((tx === 7 || tx === 8) && ty === 11)) return true;
    const inX = tx >= AREA.x0 && tx <= AREA.x1, inY = ty >= AREA.y0 && ty <= AREA.y1;
    if (inX && (ty === 20 || ty === 21)) return true;                                        // east-west road
    if (inY && (tx === 20 || tx === 21)) return true;                                        // north-south road
    if ((tx === 7 || tx === 8) && ty >= 11 && ty <= 19) return true;                         // keep gate road
    if (ty === 28 && tx >= 10 && tx <= 19) return true;                                      // west street
    if (ty === 29 && tx >= 21 && tx <= 60) return true;                                      // east street
    return false;
  }

  /** The concrete path from every door to the nearest paving (or to another path): a shortest way round the buildings, water and the home's yard that
   *  goes straight where it can. Worked out once, the first time the ground is asked for (the tiles are a pure function of the site list). */
  let spurs = null;
  function spurSet() {
    if (spurs) return spurs;
    spurs = new Set();
    const key = (x, y) => y * 4096 + x + 2048, rects = [PADDOCK, { x0: HOME.x0 - 2, y0: HOME.y0 - 1, x1: HOME.x1 + 3, y1: HOME.y1 + 1 }];
    const blocked = (x, y) => x < AREA.x0 || y < AREA.y0 || x > AREA.x1 || y > AREA.y1 || !!obj(x, y) || inEllipse(LAKE, x, y, SHALLOW_RING) || inEllipse(POND, x, y, SHALLOW_RING) || props.has(tileKey(x, y))
      || (x === WORKSHOP.x && y === WORKSHOP.y) || rects.some(r => within(r, x, y));
    for (const site of BuildingSites.list) {
      const sx = site.frontX, sy = site.frontY;
      if (pavedAt(sx, sy) || spurs.has(key(sx, sy))) continue;
      const dist = new Map([[key(sx, sy) * 5 + 4, 0]]), open = [[0, sx, sy, 4]], prev = new Map();           // state: tile + the way we came in (4: none)
      const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let goal = null, guard = 0;
      while (open.length && !goal && guard++ < 60000) {
        let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
        const [d, x, y, dir] = open.splice(bi, 1)[0], sk = key(x, y) * 5 + dir;
        if (d > dist.get(sk)) continue;
        if (pavedAt(x, y) || (spurs.has(key(x, y)))) { goal = sk; break; }
        for (let k = 0; k < 4; k++) {
          const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
          if (blocked(nx, ny)) continue;
          const nd = d + 1 + (dir !== 4 && dir !== k ? 0.7 : 0), nk = key(nx, ny) * 5 + k;
          if (nd < (dist.has(nk) ? dist.get(nk) : Infinity)) { dist.set(nk, nd); prev.set(nk, sk); open.push([nd, nx, ny, k]); }
        }
      }
      for (let k = goal; k !== undefined; k = prev.get(k)) spurs.add(Math.floor(k / 5));
    }
    return spurs;
  }
  const spurAt = (tx, ty) => spurSet().has(ty * 4096 + tx + 2048);

  /** Ground type forced by the village, or -1 to leave it to the terrain generator. */
  function tile(tx, ty) {
    if (inEllipse(LAKE, tx, ty) || inEllipse(POND, tx, ty)) return TILE.WATER;
    if (pavedAt(tx, ty) || spurAt(tx, ty)) return TILE.STONE;
    if (inEllipse(LAKE, tx, ty, SHALLOW_RING) || inEllipse(POND, tx, ty, SHALLOW_RING)) return TILE.SHALLOW;   // wading ring round the deep water
    return -1;
  }

  /** Solid structure on this tile (the castle on the keep's footprint, houses: BuildingSites). */
  function obj(tx, ty) {
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
    return spurAt(tx, ty);                                                                  // (the concrete paths stay clear)
  }

  // well + barrels: fixed list with small deterministic jitter
  const props = new Map();
  const rng = mulberry32(4242);
  props.set(tileKey(20, 20), { t: 'well', x: 20.5, y: 20.5, r: 0.5 / TILE_SCALE, v: 0 });
  [[17.5, 17.5], [22.5, 17.5], [17.5, 22.5], [22.5, 22.5],
   [13.5, 24.5], [28.5, 22.5], [37.5, 22.5], [16.5, 26.5]].forEach(([x, y]) => {
    props.set(tileKey(Math.floor(x), Math.floor(y)), { t: 'barrel', x: x + (rng() - 0.5) * 0.2, y: y + (rng() - 0.5) * 0.2, r: 0.26 / TILE_SCALE, v: 0 });
  });
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
