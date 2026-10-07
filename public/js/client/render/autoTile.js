'use strict';
/* CLIENT - AUTOTILING: the ground changes at its borders, the retro way. Every kind of ground has a RANK; where a tile touches ground of a higher
 * rank, that neighbour spills over the shared edge (and round the corner) into it, with a stepped, pixel-jagged rim and a dark outline: grass
 * creeps over a dirt path, onto the beach and between the cobbles, a jungle's grass over the meadow's at a biome border; the beach runs
 * out over the shallows with a line of foam, and the shallows over deep water.
 *
 * It is generic: a tile asks which of its 8 neighbours outrank it, and for each such neighbour's ground builds a 4-bit EDGE mask (N E S W) and
 * a 4-bit CORNER mask (a diagonal neighbour whose two sides are not that ground already). The masks are made once (16 x 16 combinations x 4
 * jag patterns), cached, and used for any pair of grounds, so a new kind of ground only needs a rank (RANKS) to blend with every other.
 *
 * Masks are in tile ART pixels (TW x TH: 2 x 2 ground cells, PixelTerrain's AW x AH each), drawn over the tile's diamond. The jag is fixed at
 * both ends of every edge, so neighbouring tiles' fringes always meet. */
const AutoTile = (() => {
  /** Who spills over whom (higher over lower). Ground not listed never blends (water, room floors). */
  const RANKS = { water: -3, shallow: -2, cave: 0, sand: 1, clay: 2, stone: 3, dirt: 4, grass: 5 };     // the shallows lap over deep water, the beach over the shallows
  /** Kinds of ground that are water: land spilling onto them gets a FOAM rim, and land beside them a wet band (terrainRenderer). */
  const WATERY = { water: true, shallow: true };
  /** Paved, CRISP ground (cobbles): nothing spills over it and it spills over nothing; instead it is edged with a straight curb wherever it
   *  meets other ground (terrainRenderer). */
  const CRISP = { stone: true };
  const TW = 80, TH = 40, FRINGE = 0.24, JAG = 0.07, SEGMENTS = 6, VARIANTS = 4;
  const N = 1, E = 2, S = 4, W = 8;                                                // edges
  const NE = 1, SE = 2, SW = 4, NW = 8;                                            // corners
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
  const masks = new Map();

  /** How deep the fringe reaches at position t (0..1) along one edge: f at both ends, jagged in steps between. */
  function depth(t, edge, variant, f = FRINGE) {
    const seg = Math.min(SEGMENTS - 1, Math.floor(t * SEGMENTS));
    if (seg === 0 || seg === SEGMENTS - 1 || variant < 0) return f;                // (variant -1: a straight edge, for curbs)
    return f + (Math.floor(hash(variant, edge, seg) * 3) - 1) * JAG * f / FRINGE;
  }
  /** Tile-local (u, v) of an art pixel's centre (u along +x, v along +y of the world), and whether it is on the diamond. */
  function uv(x, y) {
    const dx = (x + 0.5 - TW / 2) / (TW / 2), dy = (y + 0.5) / (TH / 2);
    return [(dx + dy) / 2, (dy - dx) / 2];
  }
  const onTile = (u, v) => u >= 0 && u <= 1 && v >= 0 && v <= 1;
  const OVER = 0.05;                                                               // the fringe reaches this far past the tile's edge: it covers the cells' overlap
  const nearTile = (u, v) => u >= -OVER && u <= 1 + OVER && v >= -OVER && v <= 1 + OVER;

  /** { fill, rim }: canvases of the fringe for these edges / corners (variant: one of a few jag patterns; scale: its depth, 1 = a full fringe,
   *  true = half; the surf uses a few steps in between). */
  function mask(edges, corners, variant, scale = 1) {
    if (scale === true) scale = 0.5;
    const step = Math.round(scale * 20), key = edges * 16 + corners + 256 * (variant + 1) + 2048 * step, f = FRINGE * step / 20;
    let m = masks.get(key);
    if (m) return m;
    const inFringe = (u, v) => {
      if (!nearTile(u, v)) return false;
      if ((edges & N) && v < depth(u, 0, variant, f)) return true;
      if ((edges & E) && u > 1 - depth(v, 1, variant, f)) return true;
      if ((edges & S) && v > 1 - depth(u, 2, variant, f)) return true;
      if ((edges & W) && u < depth(v, 3, variant, f)) return true;
      const r = f * 1.05;                                                     // corners: a stepped quarter round, as deep as an edge's end
      if ((corners & NE) && (1 - u) * (1 - u) + v * v < r * r) return true;
      if ((corners & SE) && (1 - u) * (1 - u) + (1 - v) * (1 - v) < r * r) return true;
      if ((corners & SW) && u * u + (1 - v) * (1 - v) < r * r) return true;
      if ((corners & NW) && u * u + v * v < r * r) return true;
      return false;
    };
    const grid = new Uint8Array(TW * TH);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const [u, v] = uv(x, y); grid[y * TW + x] = inFringe(u, v) ? 2 : onTile(u, v) ? 1 : 0; }
    const fill = document.createElement('canvas'), rim = document.createElement('canvas');
    fill.width = rim.width = TW; fill.height = rim.height = TH;
    const fc = fill.getContext('2d'), rc = rim.getContext('2d');
    fc.fillStyle = rc.fillStyle = '#000';
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      if (grid[y * TW + x] !== 2) continue;
      fc.fillRect(x, y, 1, 1);
      const out = (dx, dy) => { const xx = x + dx, yy = y + dy; return xx >= 0 && xx < TW && yy >= 0 && yy < TH && grid[yy * TW + xx] === 1; };
      if (out(1, 0) || out(-1, 0) || out(0, 1) || out(0, -1)) rc.fillRect(x, y, 1, 1);   // the fringe's edge towards the tile's own ground
    }
    m = { fill, rim };
    if (masks.size > 3000) masks.clear();
    masks.set(key, m);
    return m;
  }

  const OFFS = [[0, -1, N], [1, 0, E], [0, 1, S], [-1, 0, W]];
  const DIAG = [[1, -1, NE, N, E], [1, 1, SE, S, E], [-1, 1, SW, S, W], [-1, -1, NW, N, W]];
  /** What spills into the tile at (tx, ty): [{ look, edges, corners }] lowest rank first (draw in this order). `here` is the tile's own ground
   *  and `lookAt(tx, ty)` any tile's: { id, rank } or null (no blending). */
  function spills(here, tx, ty, lookAt) {
    if (!here || CRISP[here.kind]) return null;
    let out = null;
    const seen = {};
    const add = (look, e, c) => {
      if (!look || look.id === here.id || look.rank <= here.rank || CRISP[look.kind]) return;
      const s = seen[look.id] || (seen[look.id] = { look, edges: 0, corners: 0 });
      s.edges |= e; s.corners |= c;
    };
    const side = {};
    for (const [dx, dy, bit] of OFFS) { const l = lookAt(tx + dx, ty + dy); side[bit] = l; add(l, bit, 0); }
    for (const [dx, dy, bit, a, b] of DIAG) {
      const l = lookAt(tx + dx, ty + dy);
      if (l && !(side[a] && side[a].id === l.id) && !(side[b] && side[b].id === l.id)) add(l, 0, bit);
    }
    for (const id in seen) (out || (out = [])).push(seen[id]);
    return out && out.sort((p, q) => p.look.rank - q.look.rank);
  }
  const variantOf = (tx, ty) => Math.floor(hash(tx, ty, 77) * VARIANTS);
  /** Which sides (edges, and corners not already covered) of the tile at (tx, ty) touch ground that passes `test`: { edges, corners } or null. */
  function touching(tx, ty, lookAt, test) {
    let edges = 0, corners = 0;
    for (const [dx, dy, bit] of OFFS) if (test(lookAt(tx + dx, ty + dy))) edges |= bit;
    for (const [dx, dy, bit, a, b] of DIAG) if (!(edges & a) && !(edges & b) && test(lookAt(tx + dx, ty + dy))) corners |= bit;
    return edges || corners ? { edges, corners } : null;
  }

  return { RANKS, WATERY, CRISP, TW, TH, mask, spills, touching, variantOf };
})();
