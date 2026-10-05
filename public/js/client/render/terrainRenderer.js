'use strict';
/* CLIENT - flat ground tiles: grass, dirt, stone, animated water. */
const OCEAN_COLOR = '#2c6b99';
const DETAIL = TILE_HALF_W / 32;          // ground detail was authored for 64px tiles

const TerrainRenderer = (() => {
  const GRASS = ['#5f9c4a', '#68a652', '#589145'], DIRT = ['#a07a52', '#a98258', '#98724b'], STONE = ['#a9a59c', '#b3afa5', '#9d998f'];
  const SAND = ['#dccb94', '#d4c18a', '#e2d29d'], CLAY = ['#b8734a', '#c27d52', '#ad6a44'];
  const WATER = ['#2c6b99', '#2f70a0', '#2a6794'], SHALLOW = ['rgba(98,181,214,.74)', 'rgba(104,186,217,.74)', 'rgba(92,175,209,.74)'];

  /** Ground colours by biome: [grass x3, dirt x3]. Anything not listed uses the plain meadow colours. */
  const GROUND = {
    forest:   [['#4f8a42', '#57944a', '#497f3d'], ['#8e6e4a', '#977650', '#866646']],
    wetland:  [['#4f9a6a', '#58a572', '#488d60'], ['#7d7a58', '#867f5d', '#757252']],
    dry:      [['#a3a34f', '#adad57', '#9a9a47'], ['#b58b55', '#bf955e', '#ab8250']],
    highland: [['#6f9462', '#789e6b', '#688a5b'], ['#8d7a63', '#96836b', '#847059']],
    blossom:  [['#8fc47a', '#98cd83', '#86ba72'], ['#b49a78', '#bda282', '#aa9070']],
    crystal:  [['#8fc2b8', '#9ccdc4', '#84b8ae'], ['#a9b6bd', '#b3c0c6', '#9fabb2']],
    starlit:  [['#3f4f86', '#46598f', '#39487a'], ['#4a4468', '#524c72', '#423c5e']],
    ember:    [['#6a4a40', '#745248', '#5f423a'], ['#7a4a35', '#85523b', '#6d422f']]
  };

  function draw(g, map, bounds, range, now) {
    const anyFloors = Object.keys(map.floors).length > 0;
    const t = now / 1000, { minX, maxX, minY, maxY } = bounds;
    for (let ty = range.ty0; ty <= range.ty1; ty++) for (let tx = range.tx0; tx <= range.tx1; tx++) {
      const cx = (tx - ty) * TILE_HALF_W, cy = (tx + ty + 1) * TILE_HALF_H;
      if (cx < minX - TILE_HALF_W || cx > maxX + TILE_HALF_W || cy < minY - TILE_HALF_H || cy > maxY + TILE_HALF_H) continue;
      const type = map.tile(tx, ty), noise = hash2(tx, ty), variant = (noise * 3) | 0;
      diamondPath(g.ctx, cx, cy);
      if (type === TILE.WATER) drawWater(g.ctx, map, tx, ty, cx, cy, variant, t);
      else if (type === TILE.SHALLOW) drawShallow(g.ctx, map, tx, ty, cx, cy, variant, t);
      else if (type === TILE.GRASS) drawGrass(g.ctx, tx, ty, cx, cy, variant, noise, map.biome(tx, ty), t);
      else if (type === TILE.DIRT) drawDirt(g.ctx, tx, ty, cx, cy, variant, noise, map.biome(tx, ty));
      else if (type === TILE.SAND) drawSand(g.ctx, tx, ty, cx, cy, variant, noise);
      else if (type === TILE.CLAY) drawClay(g.ctx, tx, ty, cx, cy, variant, noise);
      else drawStone(g.ctx, variant);
      if (anyFloors && map.floors[tileKey(tx, ty)]) StructureSprites.drawFloor(g.ctx, cx, cy);   // built floors sit on top of the ground
    }
  }

  /** Slightly oversized diamond so neighbouring tiles never show seams. */
  function diamondPath(ctx, cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - TILE_HALF_H - 0.5); ctx.lineTo(cx + TILE_HALF_W + 0.5, cy);
    ctx.lineTo(cx, cy + TILE_HALF_H + 0.5); ctx.lineTo(cx - TILE_HALF_W - 0.5, cy); ctx.closePath();
  }

  function drawGrass(ctx, tx, ty, cx, cy, variant, noise, biome, t) {
    const palette = GROUND[biome];
    ctx.fillStyle = palette ? palette[0][variant] : GRASS[variant]; ctx.fill();
    const ox = (hash2(tx + 9, ty) - 0.5) * 30 * DETAIL, oy = (hash2(tx, ty + 9) - 0.5) * 12 * DETAIL;
    if (palette && biomeDetail(ctx, biome, noise, cx + ox, cy + oy, tx, ty, t)) return;
    if (noise <= 0.62) return;
    ctx.strokeStyle = 'rgba(30,70,30,.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(cx + ox, cy + oy); ctx.lineTo(cx + ox - 2, cy + oy - 5);
    ctx.moveTo(cx + ox + 2, cy + oy); ctx.lineTo(cx + ox + 3, cy + oy - 5); ctx.stroke();
  }

  /** The little things that make a far-off biome look like itself: petals, crystal glints, twinkling stars, glowing embers. */
  function biomeDetail(ctx, biome, noise, x, y, tx, ty, t) {
    if (biome === 'blossom' && noise > 0.5) {
      for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#ffb3d1', '#ffffff', '#ff8fbd'][(tx + ty + i) % 3]; ctx.beginPath(); ctx.arc(x + (i - 1) * 7 * DETAIL, y + ((i * 5) % 7 - 3) * DETAIL, 1.7, 0, Math.PI * 2); ctx.fill(); }
      return true;
    }
    if (biome === 'crystal' && noise > 0.72) {
      const tw = 0.55 + 0.45 * Math.sin(t * 2 + tx * 1.7 + ty); ctx.fillStyle = `rgba(235,252,255,${(0.5 + 0.5 * tw).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 2.4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 2.4, y); ctx.closePath(); ctx.fill();
      return true;
    }
    if (biome === 'starlit' && noise > 0.55) {
      const tw = 0.5 + 0.5 * Math.sin(t * 1.6 + tx * 2.3 + ty * 1.1); ctx.fillStyle = `rgba(${noise > 0.8 ? '150,255,240' : '205,190,255'},${(0.25 + 0.7 * tw).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x, y, 1.3 + tw * 1.1, 0, Math.PI * 2); ctx.fill();
      return true;
    }
    if (biome === 'ember' && noise > 0.62) {
      const fl = 0.5 + 0.5 * Math.sin(t * 5 + tx * 3.1 + ty * 1.7); ctx.fillStyle = `rgba(255,${120 + (fl * 90) | 0},40,${(0.35 + 0.55 * fl).toFixed(2)})`;
      ctx.fillRect(x - 1.2, y - 1, 2.6, 2);
      return true;
    }
    return false;
  }

  function drawDirt(ctx, tx, ty, cx, cy, variant, noise, biome) {
    const palette = GROUND[biome];
    ctx.fillStyle = palette ? palette[1][variant] : DIRT[variant]; ctx.fill();
    if (noise > 0.6) { ctx.fillStyle = '#7d5d3b'; ctx.fillRect(cx + (noise - 0.8) * 60 * DETAIL, cy + (hash2(tx, ty + 3) - 0.5) * 12 * DETAIL, 2.5, 1.8); }
  }

  function drawSand(ctx, tx, ty, cx, cy, variant, noise) {
    ctx.fillStyle = SAND[variant]; ctx.fill();
    if (noise > 0.55) { ctx.fillStyle = 'rgba(150,125,70,.45)'; ctx.fillRect(cx + (noise - 0.78) * 70 * DETAIL, cy + (hash2(tx + 5, ty) - 0.5) * 14 * DETAIL, 2, 1.5); }
  }

  function drawClay(ctx, tx, ty, cx, cy, variant, noise) {
    ctx.fillStyle = CLAY[variant]; ctx.fill();
    if (noise > 0.4) { ctx.fillStyle = 'rgba(255,214,170,.28)'; ctx.fillRect(cx + (noise - 0.7) * 80 * DETAIL, cy + (hash2(tx + 3, ty) - 0.5) * 16 * DETAIL, 5 * DETAIL, 1.6); }   // wet sheen
    if (noise < 0.25) { ctx.fillStyle = 'rgba(90,45,25,.3)'; ctx.fillRect(cx + (noise - 0.12) * 120 * DETAIL, cy + (hash2(tx, ty + 4) - 0.5) * 14 * DETAIL, 3, 2); }
  }

  function drawStone(ctx, variant) {
    ctx.fillStyle = STONE[variant]; ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,.2)'; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawWater(ctx, map, tx, ty, cx, cy, variant, t) {
    ctx.fillStyle = WATER[variant]; ctx.fill();
    const drift = Math.sin(t * 1.4 + tx * 0.8 + ty * 0.6) * 4 * DETAIL;
    ctx.strokeStyle = 'rgba(190,225,240,.35)'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(cx - 14 * DETAIL + drift, cy - 3 * DETAIL); ctx.lineTo(cx - 2 * DETAIL + drift, cy - 3 * DETAIL);
    ctx.moveTo(cx + 2 * DETAIL - drift, cy + 4 * DETAIL); ctx.lineTo(cx + 14 * DETAIL - drift, cy + 4 * DETAIL); ctx.stroke();

    const edges = [[0, -1, cx, cy - TILE_HALF_H, cx + TILE_HALF_W, cy], [1, 0, cx + TILE_HALF_W, cy, cx, cy + TILE_HALF_H],
                   [0, 1, cx, cy + TILE_HALF_H, cx - TILE_HALF_W, cy], [-1, 0, cx - TILE_HALF_W, cy, cx, cy - TILE_HALF_H]];
    ctx.strokeStyle = 'rgba(225,240,245,.75)'; ctx.lineWidth = 2; ctx.beginPath();    // foam where water meets land
    for (const [dx, dy, x1, y1, x2, y2] of edges) {
      const nx = tx + dx, ny = ty + dy;
      if (!isWaterTile(map.tile(nx, ny))) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    }
    ctx.stroke();
  }

  /** Wadeable water: the sandy bottom shows through, with gentle ripples and a bright edge where it meets the beach. */
  function drawShallow(ctx, map, tx, ty, cx, cy, variant, t) {
    ctx.fillStyle = SAND[variant]; ctx.fill();                                   // the bottom
    ctx.fillStyle = SHALLOW[variant]; ctx.fill();                                // the water over it
    const drift = Math.sin(t * 1.8 + tx * 0.9 + ty * 0.7) * 5 * DETAIL;
    ctx.strokeStyle = 'rgba(240,250,255,.5)'; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(cx - 12 * DETAIL + drift, cy - 2 * DETAIL); ctx.lineTo(cx - 3 * DETAIL + drift, cy - 2 * DETAIL);
    ctx.moveTo(cx + 3 * DETAIL - drift, cy + 5 * DETAIL); ctx.lineTo(cx + 13 * DETAIL - drift, cy + 5 * DETAIL); ctx.stroke();
    const edges = [[0, -1, cx, cy - TILE_HALF_H, cx + TILE_HALF_W, cy], [1, 0, cx + TILE_HALF_W, cy, cx, cy + TILE_HALF_H],
                   [0, 1, cx, cy + TILE_HALF_H, cx - TILE_HALF_W, cy], [-1, 0, cx - TILE_HALF_W, cy, cx, cy - TILE_HALF_H]];
    ctx.strokeStyle = 'rgba(245,252,255,.8)'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (const [dx, dy, x1, y1, x2, y2] of edges) if (!isWaterTile(map.tile(tx + dx, ty + dy))) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke();
  }

  return { draw };
})();
