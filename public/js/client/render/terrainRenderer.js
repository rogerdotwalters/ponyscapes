'use strict';
/* CLIENT - the ground: textured half-tile cells of grass, dirt, sand, clay, cobbles and cave rock (pixelGround.js; tilled soil where the farm is),
 * and animated water. The season colours the grass. */
const OCEAN_COLOR = '#2c6b99';
const DETAIL = TILE_HALF_W / 32;          // ground detail was authored for 64px tiles

const TerrainRenderer = (() => {
  const GRASS = ['#5f9c4a', '#68a652', '#589145'], DIRT = ['#a07a52', '#a98258', '#98724b'], STONE = ['#a9a59c', '#b3afa5', '#9d998f'];
  const SAND = ['#dccb94', '#d4c18a', '#e2d29d'], CLAY = ['#b8734a', '#c27d52', '#ad6a44'];
  const WATER = ['#2c6b99', '#2f70a0', '#2a6794'], SHALLOW = ['#6fb4c6', '#76bacb', '#68adc0'];      // (the shallows: sand seen through clear water)

  /** Ground colours and effects by biome come from the BIOME TABLE (js/data/biomes/): [grass x3, dirt x3]. A biome with ground: null uses the plain meadow colours. */
  const GROUND = Object.fromEntries(Biomes.all().filter(b => b.ground).map(b => [b.id, [b.ground.grass, b.ground.dirt]]));
  const EFFECT = Object.fromEntries(Biomes.all().filter(b => b.effect && BiomeEffects.has(b.effect)).map(b => [b.id, BiomeEffects.get(b.effect)]));
  const CAVE_FLOOR = ['#2b2f3a', '#30343f', '#272b35'], CAVE_WALL = ['#15171e', '#181b22', '#12141a'];

  let season = 'spring', today = 0;
  /** The renderer tells us the season (it colours the grass) and the day (watered soil is dark for the rest of it). */
  function setDate(seasonId, day) { season = seasonId; today = day; }

  /** The ground as 2 x 2 half-tile cells of pixel texture (pixelGround.js); a tilled cell is drawn as soil. */
  function cells(ctx, kind, pal, tx, ty, farm, seasonal) {
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const cx = tx * 2 + sx, cy = ty * 2 + sy, wx = tx + 0.25 + sx * 0.5, wy = ty + 0.25 + sy * 0.5, plot = farm && farm[cx + ',' + cy];
      const v = Math.floor(PixelTerrain.hash(cx, cy, 1) * 997);
      const c = plot ? PixelTerrain.cell('soil', SOIL, v, season, plot.w === today) : PixelTerrain.cell(kind, pal, v, seasonal ? season : '');
      PixelTerrain.draw(ctx, c, (wx - wy) * TILE_HALF_W, (wx + wy) * TILE_HALF_H);
    }
  }
  const SOIL = ['#7a5233', '#83593a', '#704b2e'];

  /* ---- the ground in BLOCKS: the overworld's still ground (grass, dirt, sand, clay, stone) is painted once into screen-aligned blocks (canvases)
   * and drawn as a few pictures instead of four cells per tile, every frame. Blocks load around what the camera sees (and a margin), one or two
   * a frame, nearest first, and the least recently seen are forgotten. Water, the biomes' animated details, tilled soil, ring barriers and
   * built floors stay live on top. A tile whose block is not baked yet is drawn the old way, so nothing ever waits for one. */
  const BW = 8 * TILE_HALF_W, BH = 8 * TILE_HALF_H;                                  // a block: a screen-aligned rectangle of the ground, in world pixels
  const MARGIN = 2 * TILE_HALF_W;                                                    // blocks are loaded this far (world pixels) beyond the screen's edges
  const PAD = 1;                                                                     // each block is painted (and drawn) 1 pixel bigger all round: no seams
  const BAKE_MS = 4;                                                                 // a frame bakes one block, and another only while it has used less than this
  const spare = [];                                                                  // canvases of forgotten blocks, reused (making a canvas is slow)
  const blockStore = new WeakMap();                                                 // map -> Map(key -> { canvas, x0, y0, season, scale })
  let bakeScale = 1, keepBlocks = 0;
  /** The renderer passes the camera's scale: blocks are baked at it (to 1.5x at most, to keep their memory small). */
  function setScale(s) { bakeScale = clamp(Math.round(s * 2) / 2, 1, 1.5); }
  const blockKey = (bx, by) => (bx + 32768) * 65536 + (by + 32768);
  const blocksOf = map => { let m = blockStore.get(map); if (!m) { m = new Map(); blockStore.set(map, m); } return m; };
  /** The blocks that meet a world-pixel rectangle: [[bx, by], ...]. */
  function blocksIn(b) {
    const out = [];
    for (let by = Math.floor(b.minY / BH); by * BH < b.maxY; by++) for (let bx = Math.floor(b.minX / BW); bx * BW < b.maxX; bx++) out.push([bx, by]);
    return out;
  }
  const grow = (b, m) => ({ minX: b.minX - m, maxX: b.maxX + m, minY: b.minY - m, maxY: b.maxY + m });
  /** Was every block this tile (centred at cx, cy) reaches into drawn this frame? (else the tile is drawn on its own) */
  function inDrawn(drawn, cx, cy) {
    const bx0 = Math.floor((cx - TILE_HALF_W) / BW), bx1 = Math.floor((cx + TILE_HALF_W) / BW), by0 = Math.floor((cy - TILE_HALF_H) / BH), by1 = Math.floor((cy + TILE_HALF_H) / BH);
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) if (!drawn.has(blockKey(bx, by))) return false;
    return true;
  }
  /** Still ground: baked into its block. (Everything else is drawn every frame.) */
  const STILL = t => t === TILE.GRASS || t === TILE.DIRT || t === TILE.SAND || t === TILE.CLAY || t === TILE.STONE || t === TILE.CAVE || t === TILE.CAVE_WALL || t === TILE.WATER || t === TILE.SHALLOW;
  /** One tile's still ground (no tilled soil: that is drawn live). */
  function stillGround(ctx, map, type, tx, ty) { const look = lookOf(map, tx, ty, type); if (look) cells(ctx, look.kind, look.pal, tx, ty, null, look.seasonal); }

  /* ---- autotiling (autoTile.js): each tile's ground is a LOOK (kind + palette, and a rank); a neighbour that outranks it spills into it ---- */
  const looks = new Map(), BIOME_ORDER = Object.fromEntries(Biomes.ids().map((id, i) => [id, i + 1]));
  /** One look per kind and palette (made once). The rank orders kinds (AutoTile.RANKS) and, within a kind, biomes (a biome's grass over the meadow's). */
  function look(kind, pal, seasonal, biome) {
    const id = kind + '|' + pal[0];
    let l = looks.get(id);
    if (!l) { l = { id, kind, pal, seasonal, rank: (AutoTile.RANKS[kind] ?? -1) * 100 + (biome ? BIOME_ORDER[biome] || 0 : 0), dark: PixelCharacter.util.shade(pal[0], 0.68) }; looks.set(id, l); }
    return l;
  }
  /** The still ground of a tile as a look, or null (water, room floors: they are drawn otherwise and never blend). */
  function lookOf(map, tx, ty, type = map.tile(tx, ty)) {
    if (type === TILE.GRASS) { const b = map.biome(tx, ty), p = GROUND[b]; return p ? look('grass', p[0], false, b) : look('grass', GRASS, true); }
    if (type === TILE.DIRT) { const b = map.biome(tx, ty), p = GROUND[b]; return p ? look('dirt', p[1], false, b) : look('dirt', DIRT, false); }
    if (type === TILE.SAND) return look('sand', SAND, false);
    if (type === TILE.CLAY) return look('clay', CLAY, false);
    if (type === TILE.CAVE) return look('cave', CAVE_FLOOR, false);
    if (type === TILE.CAVE_WALL) return look('cave', CAVE_WALL, false);
    if (type === TILE.STONE) return look('stone', STONE, false);
    if (type === TILE.WATER) return look('water', WATER, false);
    if (type === TILE.SHALLOW) return look('shallow', SHALLOW, false);
    return null;
  }
  const scratch = document.createElement('canvas'), tint = document.createElement('canvas');
  scratch.width = tint.width = AutoTile.TW; scratch.height = tint.height = AutoTile.TH;
  const sc = scratch.getContext('2d'), tc = tint.getContext('2d');
  const ART = AutoTile.TW / (2 * TILE_HALF_W);                                        // art pixels per world pixel
  const FOAM = '#eef8fb', SHALLOW_RIM = 'rgba(190,235,245,.7)', WET = 'rgba(30,55,80,.3)';
  const watery = l => !!l && !!AutoTile.WATERY[l.kind];
  /** Paint over a tile the fringes of every neighbouring ground that outranks it. Land running out over water is the SHORE: the outer half of
   *  its fringe is wet (darker) and its rim is foam. */
  function blend(ctx, map, tx, ty, here) {
    const list = AutoTile.spills(here, tx, ty, (x, y) => lookOf(map, x, y));
    if (!list) return;
    const cx = (tx - ty) * TILE_HALF_W, cy = (tx + ty + 1) * TILE_HALF_H, variant = AutoTile.variantOf(tx, ty);
    for (const { look: l, edges, corners } of list) {
      const m = AutoTile.mask(edges, corners, variant);
      sc.globalCompositeOperation = 'source-over'; sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, AutoTile.TW, AutoTile.TH);
      sc.setTransform(ART, 0, 0, ART, AutoTile.TW / 2 - cx * ART, -(cy - TILE_HALF_H) * ART); sc.imageSmoothingEnabled = false;
      cells(sc, l.kind, l.pal, tx, ty, null, l.seasonal);                             // the neighbour's ground, laid over this whole tile ...
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalCompositeOperation = 'destination-in'; sc.drawImage(m.fill, 0, 0);   // ... cut to the fringe
      if (watery(here) && !watery(l)) {                                                // the shore: wet ground along the waterline
        const thin = AutoTile.mask(edges, corners, variant, true);
        tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, AutoTile.TW, AutoTile.TH); tc.fillStyle = WET; tc.fillRect(0, 0, AutoTile.TW, AutoTile.TH);
        tc.globalCompositeOperation = 'destination-in'; tc.drawImage(m.fill, 0, 0);
        tc.globalCompositeOperation = 'destination-out'; tc.drawImage(thin.fill, 0, 0);
        sc.globalCompositeOperation = 'source-atop'; sc.drawImage(tint, 0, 0);
      }
      const rim = !watery(here) ? l.dark : watery(l) ? SHALLOW_RIM : FOAM;             // a dark outline on land; on water, foam where the beach meets it
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, AutoTile.TW, AutoTile.TH); tc.fillStyle = rim; tc.fillRect(0, 0, AutoTile.TW, AutoTile.TH);
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(m.rim, 0, 0);
      sc.globalCompositeOperation = 'source-over'; sc.drawImage(tint, 0, 0);       // and a dark rim where it meets this tile's own ground
      ctx.drawImage(scratch, cx - TILE_HALF_W, cy - TILE_HALF_H, 2 * TILE_HALF_W, 2 * TILE_HALF_H);
    }
  }
  /** Paint one block: every tile whose ground reaches into it, in the same order as the live drawing (its tiles' chunks are made if needed). */
  function bake(map, bx, by) {
    const s = bakeScale, store = blocksOf(map), key = blockKey(bx, by), old = store.get(key);
    const x0 = bx * BW - PAD, y0 = by * BH - PAD, W = Math.ceil((BW + 2 * PAD) * s), H = Math.ceil((BH + 2 * PAD) * s);
    const canvas = old ? old.canvas : spare.pop() || document.createElement('canvas'), ctx = canvas.getContext('2d');
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; } else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); }
    ctx.setTransform(s, 0, 0, s, -x0 * s, -y0 * s); ctx.imageSmoothingEnabled = false;
    const ex = TILE_HALF_W + 4, ey = TILE_HALF_H + 4, l = x0 - ex, r = x0 + BW + 2 * PAD + ex, t = y0 - ey, b = y0 + BH + 2 * PAD + ey;
    const tile = (x, y) => [(x / TILE_HALF_W + y / TILE_HALF_H) / 2, (y / TILE_HALF_H - x / TILE_HALF_W) / 2];
    const cs = [tile(l, t), tile(r, t), tile(l, b), tile(r, b)], tx0 = Math.floor(Math.min(...cs.map(c => c[0]))), tx1 = Math.ceil(Math.max(...cs.map(c => c[0])));
    const ty0 = Math.floor(Math.min(...cs.map(c => c[1]))), ty1 = Math.ceil(Math.max(...cs.map(c => c[1])));
    const inBlock = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const cx = (tx - ty) * TILE_HALF_W, cy = (tx + ty + 1) * TILE_HALF_H;
      if (cx < l || cx > r || cy < t || cy > b) continue;
      const type = map.tile(tx, ty); if (STILL(type)) { stillGround(ctx, map, type, tx, ty); inBlock.push(tx, ty, type); }
    }
    for (let i = 0; i < inBlock.length; i += 3) blend(ctx, map, inBlock[i], inBlock[i + 1], lookOf(map, inBlock[i], inBlock[i + 1], inBlock[i + 2]));   // then the borders, over all of it
    store.delete(key); store.set(key, { canvas, x0, y0, season, scale: s });
  }
  const fresh = p => p && p.season === season && p.scale === bakeScale;
  /** Bake what is missing (or out of date) around a world-pixel rectangle (plus MARGIN), nearest its middle first: at most `budget`, and after
   *  the first only while less than `ms` has gone by. Forgets the least recently used blocks beyond what is needed. Returns how many are left. */
  function load(map, bounds, budget, ms = Infinity) {
    if (map.kind !== 'world') return 0;
    const want = blocksIn(grow(bounds, MARGIN)), store = blocksOf(map), mx = (bounds.minX + bounds.maxX) / 2, my = (bounds.minY + bounds.maxY) / 2, todo = [];
    for (const [bx, by] of want) if (!fresh(store.get(blockKey(bx, by)))) todo.push([Math.hypot((bx + 0.5) * BW - mx, (by + 0.5) * BH - my), bx, by]);
    todo.sort((u, v) => u[0] - v[0]);
    const t0 = performance.now(); let done = 0;
    while (done < todo.length && done < budget && (done === 0 || performance.now() - t0 < ms)) { bake(map, todo[done][1], todo[done][2]); done++; }
    keepBlocks = Math.max(keepBlocks, Math.ceil(want.length * 1.3));
    if (store.size > keepBlocks) for (const [k, p] of store) { store.delete(k); if (spare.length < 6) spare.push(p.canvas); if (store.size <= keepBlocks) break; }
    return todo.length - done;
  }
  /** Jobs that make every biome's ground cells (all their varieties) for this season, so new ground never has to (the loader runs them while you play). */
  function warmJobs(seasonId) {
    const sets = [['grass', GRASS, seasonId], ['dirt', DIRT, ''], ['sand', SAND, ''], ['clay', CLAY, ''], ['stone', STONE, ''], ['water', WATER, ''], ['shallow', SHALLOW, '']];
    for (const [, [grass, dirt]] of Object.entries(GROUND)) sets.push(['grass', grass, ''], ['dirt', dirt, '']);
    return sets.map(([kind, pal, s]) => () => { for (let v = 0; v < 6; v++) PixelTerrain.cell(kind, pal, v, s); });   // one small job per ground
  }

  function draw(g, map, bounds, range, now) {
    const anyFloors = Object.keys(map.floors).length > 0, ctx = g.ctx, farm = map.farm && Object.keys(map.farm).length ? map.farm : null;
    const t = now / 1000, { minX, maxX, minY, maxY } = bounds, rings = map.layers && map.layers.rings;
    const smooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    const blocked = map.kind === 'world', store = blocked ? blocksOf(map) : null, drawn = new Set();
    if (blocked) {
      load(map, bounds, 3, BAKE_MS);
      for (const [bx, by] of blocksIn(bounds)) {
        const key = blockKey(bx, by), p = store.get(key);
        if (!p) continue;                                                                     // (its tiles are drawn one by one below until it is baked)
        ctx.drawImage(p.canvas, p.x0, p.y0, BW + 2 * PAD, BH + 2 * PAD);
        store.delete(key); store.set(key, p); drawn.add(key);                                  // (recently used)
      }
    }
    for (let ty = range.ty0; ty <= range.ty1; ty++) for (let tx = range.tx0; tx <= range.tx1; tx++) {
      const cx = (tx - ty) * TILE_HALF_W, cy = (tx + ty + 1) * TILE_HALF_H;
      if (cx < minX - TILE_HALF_W || cx > maxX + TILE_HALF_W || cy < minY - TILE_HALF_H || cy > maxY + TILE_HALF_H) continue;
      const type = map.tile(tx, ty), noise = hash2(tx, ty), variant = (noise * 3) | 0, baked = blocked && inDrawn(drawn, cx, cy);
      if (type === TILE.WATER || type === TILE.SHALLOW) {                                  // water: baked with its shore; only the ripples move
        const here = lookOf(map, tx, ty, type);
        if (!baked) { stillGround(ctx, map, type, tx, ty); blend(ctx, map, tx, ty, here); }
        ripples(ctx, type === TILE.SHALLOW, tx, ty, cx, cy, t);
        surf(ctx, map, tx, ty, cx, cy, here, t);                                          // waves washing up the shore
      }
      else if (type >= INTERIOR_TILE_BASE) { diamondPath(ctx, cx, cy); InteriorSprites.tile(ctx, type, cx, cy, tx, ty); }   // a room's floor (or the dark outside it)
      else {
        if (!baked) { stillGround(ctx, map, type, tx, ty); blend(ctx, map, tx, ty, lookOf(map, tx, ty, type)); }
        if (farm && (type === TILE.GRASS || type === TILE.DIRT) && (farm[tx * 2 + ',' + ty * 2] || farm[(tx * 2 + 1) + ',' + ty * 2] || farm[tx * 2 + ',' + (ty * 2 + 1)] || farm[(tx * 2 + 1) + ',' + (ty * 2 + 1)])) {
          const p = GROUND[map.biome(tx, ty)];                                                  // tilled soil: live (it darkens when watered)
          cells(ctx, type === TILE.GRASS ? 'grass' : 'dirt', p ? p[type === TILE.GRASS ? 0 : 1] : (type === TILE.GRASS ? GRASS : DIRT), tx, ty, farm, type === TILE.GRASS && !p);
        }
        if (type === TILE.GRASS) {
          const effect = EFFECT[map.biome(tx, ty)];
          if (effect) {
            diamondPath(ctx, cx, cy);
            if (effect.tint) effect.tint(ctx, tx, ty, t);
            if (noise > effect.above) effect.detail(ctx, cx + (hash2(tx + 9, ty) - 0.5) * 30 * DETAIL, cy + (hash2(tx, ty + 9) - 0.5) * 12 * DETAIL, noise, tx, ty, t);
          }
        }
      }
      if (rings && rings.barrierAt(tx, ty)) drawBarrier(ctx, cx, cy, t, tx, ty);          // a sealed ring's magical wall
      if (anyFloors && map.floors[tileKey(tx, ty)]) StructureSprites.drawFloor(ctx, cx, cy);   // built floors sit on top of the ground
    }
    ctx.imageSmoothingEnabled = smooth;
  }

  /** Slightly oversized diamond so neighbouring tiles never show seams. */
  function diamondPath(ctx, cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - TILE_HALF_H - 0.5); ctx.lineTo(cx + TILE_HALF_W + 0.5, cy);
    ctx.lineTo(cx, cy + TILE_HALF_H + 0.5); ctx.lineTo(cx - TILE_HALF_W - 0.5, cy); ctx.closePath();
  }

  /** The ring barrier: a shimmering violet wall of light. */
  function drawBarrier(ctx, cx, cy, t, tx, ty) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + tx * 0.7 + ty * 0.9);
    diamondPath(ctx, cx, cy); ctx.fillStyle = `rgba(130,80,230,${(0.35 + 0.25 * pulse).toFixed(2)})`; ctx.fill();
    const h = 30 + 10 * pulse, grad = ctx.createLinearGradient(0, cy - h, 0, cy);
    grad.addColorStop(0, 'rgba(190,150,255,0)'); grad.addColorStop(1, `rgba(170,120,255,${(0.45 + 0.3 * pulse).toFixed(2)})`);
    ctx.fillStyle = grad; ctx.fillRect(cx - TILE_HALF_W * 0.55, cy - h, TILE_HALF_W * 1.1, h);
    ctx.fillStyle = `rgba(255,255,255,${(0.25 + 0.4 * pulse).toFixed(2)})`; ctx.fillRect(cx - 1, cy - h * (0.4 + 0.5 * pulse), 2, 5);
  }





  /* ---- the SURF: on water beside land, waves wash up over the wet ground and draw back, a foam line at their edge (stepped, the retro way) ---- */
  const SURF_STEPS = 7, SURF_REACH = 0.55, SURF_WATER = 'rgba(118,186,203,.86)', SURF_FOAM = '#f4fbfd';
  const surfShape = new WeakMap(), surfArt = new Map();
  /** Where land meets this water tile: { edges, corners, variant } (all the land around it together), or 0. Remembered per map. */
  function shoreOf(map, tx, ty, here) {
    let m = surfShape.get(map); if (!m) { m = new Map(); surfShape.set(map, m); }
    const key = tileKey(tx, ty); let s = m.get(key);
    if (s !== undefined) return s;
    const list = AutoTile.spills(here, tx, ty, (x, y) => lookOf(map, x, y));
    let edges = 0, corners = 0;
    for (const sp of list || []) if (!watery(sp.look)) { edges |= sp.edges; corners |= sp.corners; }
    s = edges || corners ? { edges, corners, variant: AutoTile.variantOf(tx, ty) } : 0;
    if (m.size > 20000) m.clear();
    m.set(key, s); return s;
  }
  /** One frame of the surf for a shore: water from the fringe's edge in to depth step k (0 = drawn right back), with its foam line. */
  function surfFrame(s, k) {
    const key = s.edges * 16 + s.corners + 256 * s.variant + 1024 * k;
    let c = surfArt.get(key);
    if (c) return c;
    const full = AutoTile.mask(s.edges, s.corners, s.variant, 1), reach = AutoTile.mask(s.edges, s.corners, s.variant, 1 - SURF_REACH * k / (SURF_STEPS - 1));
    c = document.createElement('canvas'); c.width = AutoTile.TW; c.height = AutoTile.TH;
    const g = c.getContext('2d');
    g.fillStyle = SURF_WATER; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(full.fill, 0, 0);       // the water over the fringe ...
    g.globalCompositeOperation = 'destination-out'; g.drawImage(reach.fill, 0, 0);     // ... up to where this wave reaches
    g.globalCompositeOperation = 'source-over';
    const depth = 1 - SURF_REACH * k / (SURF_STEPS - 1), wake = AutoTile.mask(s.edges, s.corners, s.variant, Math.min(1, depth + 0.16));
    const foam = document.createElement('canvas'); foam.width = c.width; foam.height = c.height;
    const f = foam.getContext('2d');
    f.fillStyle = SURF_FOAM;                                                           // a dither of foam just behind the wave's edge ...
    for (let y = 0; y < c.height; y++) for (let x = (y & 1); x < c.width; x += 2) f.fillRect(x, y, 1, 1);
    f.globalCompositeOperation = 'destination-in'; f.drawImage(wake.fill, 0, 0);
    f.globalCompositeOperation = 'destination-out'; f.drawImage(reach.fill, 0, 0);
    f.globalCompositeOperation = 'source-over'; g.drawImage(foam, 0, 0);
    f.clearRect(0, 0, c.width, c.height); f.fillRect(0, 0, c.width, c.height);         // ... and a solid line of it at the edge
    f.globalCompositeOperation = 'destination-in'; f.drawImage(reach.rim, 0, 0);
    g.drawImage(foam, 0, 0);
    if (surfArt.size > 4000) surfArt.clear();
    surfArt.set(key, c); return c;
  }
  /** The waves on one shore tile at time t: each wave washes in and draws back; neighbouring tiles lag a little, so the waves run along the coast. */
  function surf(ctx, map, tx, ty, cx, cy, here, t) {
    const s = shoreOf(map, tx, ty, here);
    if (!s) return;
    const w = (Math.sin(t * 1.1 - (tx + ty) * 0.35 + Math.sin(tx * 0.37 - ty * 0.21) * 0.8) + 1) / 2, k = Math.round(Math.pow(w, 1.6) * (SURF_STEPS - 1));
    ctx.drawImage(surfFrame(s, k), cx - TILE_HALF_W, cy - TILE_HALF_H, 2 * TILE_HALF_W, 2 * TILE_HALF_H);
  }

  /** The water's ripples: two short bright strokes that drift to and fro (live, over the baked water and its shore). */
  function ripples(ctx, shallow, tx, ty, cx, cy, t) {
    const drift = Math.sin(t * (shallow ? 1.8 : 1.4) + tx * 0.8 + ty * 0.6) * (shallow ? 5 : 4) * DETAIL;
    ctx.strokeStyle = shallow ? 'rgba(240,250,255,.5)' : 'rgba(190,225,240,.35)'; ctx.lineWidth = shallow ? 1.2 : 1.5; ctx.beginPath();
    ctx.moveTo(cx - 12 * DETAIL + drift, cy - 2 * DETAIL); ctx.lineTo(cx - 3 * DETAIL + drift, cy - 2 * DETAIL);
    ctx.moveTo(cx + 3 * DETAIL - drift, cy + 4 * DETAIL); ctx.lineTo(cx + 12 * DETAIL - drift, cy + 4 * DETAIL); ctx.stroke();
  }

  return { draw, setDate, setScale, load, warmJobs, stats: map => { let px = 0; const st = blocksOf(map); for (const p of st.values()) px += p.canvas.width * p.canvas.height; return { blocks: st.size, megabytes: Math.round(px * 4 / 1e6) }; } };
})();
