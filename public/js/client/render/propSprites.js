'use strict';
/* CLIENT - trees, stumps, barrels, the well. (sx, sy) is the prop's footprint on screen. */
const TREE_SCALE_BASE = 1.35, TREE_SCALE_STEP = 0.07, STUMP_SCALE = 1.3;

const speciesWash = id => { const t = id && typeof TreeSpecies !== 'undefined' && TreeSpecies.get(id); return t && t.tint ? t.tint : null; };
const TREE_TINT = Object.fromEntries(Biomes.all().filter(b => b.treeTint).map(b => [b.id, b.treeTint]));      // (from the biome table)

const PropSprites = {
  /** A cave mouth: a rock arch with a black opening. Bigger and brooding for the deeper rings. */
  drawCave(g, sx, sy, ring, now) {
    const ctx = g.ctx, k = 1 + ring * 0.08;
    g.ellipse(sx, sy + 3, 34 * k, 12 * k, 'rgba(0,0,0,.3)');
    ctx.save(); ctx.translate(sx, sy); ctx.scale(k, k);
    g.polygon([-34, 0, -30, -26, -16, -44, 0, -50, 16, -44, 30, -26, 34, 0], '#6d6a66'); g.polygon([-34, 0, -30, -26, -22, -30, -26, 0], '#85827c'); g.polygon([34, 0, 30, -26, 22, -30, 26, 0], '#55524f');
    ctx.fillStyle = '#07070c'; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.quadraticCurveTo(-21, -34, 0, -36); ctx.quadraticCurveTo(21, -34, 20, 0); ctx.closePath(); ctx.fill();
    const glow = 0.5 + 0.5 * Math.sin(now / 500 + ring); g.ellipse(0, -10, 6 + glow * 2, 9, `rgba(${[120, 255, 120, 255, 255][ring] || 160},${[255, 200, 160, 120, 60][ring] || 140},255,${(0.12 + 0.12 * glow).toFixed(2)})`);
    ctx.restore();
  },
  /** The way out of a cave: a swirling blue-white portal. */
  drawPortal(g, sx, sy, now) {
    const ctx = g.ctx, t = now / 400;
    g.ellipse(sx, sy + 2, 16, 6, 'rgba(0,0,0,.3)');
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(${150 + i * 40},${200 + i * 20},255,${(0.7 - i * 0.18).toFixed(2)})`; ctx.lineWidth = 2.4 - i * 0.5; ctx.beginPath(); ctx.ellipse(sx, sy - 14, 9 - i * 2.2, 17 - i * 3.5, 0, t + i, t + i + Math.PI * 1.5); ctx.stroke(); }
    g.ellipse(sx, sy - 14, 5, 12, 'rgba(210,235,255,.5)');
  },
  /** A standing tree; `species` (TreeSpecies id) gives it its own wash of colour (spruce bluer, ash paler). */
  drawTree(g, sx, sy, variant, shakeX, fruit, biome, species) { PixelProps.drawTree(g.ctx, sx, sy, variant, shakeX, fruit, biome, TREE_TINT[biome] || PropSprites.seasonTint, speciesWash(species)); },     // retro pixel art (pixelProps.js); the season's colour where the biome has none
  /** A felled tree on its way down (see Effects.fall). */
  drawFallingTree(g, sx, sy, variant, angle, alpha, biome, species) { PixelProps.drawFalling(g.ctx, sx, sy, variant, angle, alpha, TREE_TINT[biome] || PropSprites.seasonTint, speciesWash(species)); },
  /** Mushrooms (a 'bush' prop with `plant: 'mushroom'`): a cluster of caps in its item's colour. */
  drawMushroom(g, sx, sy, plant, shakeX) { const def = ItemDB.get(plant.berry); PixelProps.drawMushroom(g.ctx, sx, sy, plant.v | 0, def ? def.color : '#c33', !!plant.ripe, shakeX); },
  seasonTint: null,                                                                // (set by the renderer each frame: Seasons)

  /** A small mound of sand with a faint glint: something is buried here (dig it up with a shovel). */
  drawMound(g, sx, sy, variant, now) {
    const ctx = g.ctx;
    g.ellipse(sx + 1, sy + 1, 13, 5.5, 'rgba(0,0,0,.18)');
    g.ellipse(sx, sy - 2, 11, 5.2, '#c9b377'); g.ellipse(sx - 2, sy - 4, 7, 3.2, '#e2d29d'); g.ellipse(sx + 3, sy - 1, 4, 2, '#b49f66');
    const tw = 0.5 + 0.5 * Math.sin(now / 420 + variant * 2);                  // twinkle
    ctx.strokeStyle = `rgba(255,248,210,${(0.35 + 0.6 * tw).toFixed(2)})`; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(sx + 5, sy - 11); ctx.lineTo(sx + 5, sy - 5); ctx.moveTo(sx + 2, sy - 8); ctx.lineTo(sx + 8, sy - 8); ctx.stroke();
  },

  /** A message in a bottle bobbing in the shallows. */
  drawBottle(g, sx, sy, variant, now) {
    const ctx = g.ctx, bob = Math.sin(now / 520 + variant * 1.7) * 1.8, tilt = Math.sin(now / 760 + variant) * 0.22;
    ctx.strokeStyle = 'rgba(235,248,255,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(sx, sy, 15 + bob, 6 + bob / 2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.translate(sx, sy - 5 + bob); ctx.rotate(tilt);
    g.ellipse(0, 0, 4.5, 8, 'rgba(150,215,200,.75)'); g.ellipse(0, -9, 2.2, 3.5, 'rgba(150,215,200,.75)');
    ctx.fillStyle = '#b07a46'; ctx.fillRect(-1.6, -14, 3.2, 3);                  // cork
    ctx.fillStyle = '#f1e6c4'; ctx.fillRect(-1.6, -5, 3.2, 9);                   // the rolled-up map inside
    g.ellipse(-1.5, -3, 1, 4, 'rgba(255,255,255,.55)');
    ctx.restore();
  },

  drawStump(g, sx, sy) { PixelProps.drawStump(g.ctx, sx, sy); },

  /** Berry bush (retro pixel art, pixelProps.js): a leafy mound; ripe bushes carry berries in the colour of their berry type, picked ones look dry. */
  drawBush(g, sx, sy, bush, shakeX, biome) {
    const def = ItemDB.get(bush.berry);
    PixelProps.drawBush(g.ctx, sx, sy, bush.v | 0, !!bush.ripe, def ? def.color : '#c33', shakeX || 0, TREE_TINT[biome] || PropSprites.seasonTint, !!bush.cut);
  },

  /** A planted, trimmed hedge (hedges.js): prop.s is its trim (0 block, 1 ball, 2 tiers). */
  drawHedge(g, sx, sy, hedge, shakeX, biome) { PixelProps.drawHedge(g.ctx, sx, sy, hedge.v | 0, hedge.s | 0, shakeX || 0, TREE_TINT[biome] || PropSprites.seasonTint); },

  /** Flax: slender green stalks with small blue flowers. Harvested plants are bare stubs. */
  drawFlax(g, sx, sy, plant) {
    const ctx = g.ctx;
    g.ellipse(sx + 1, sy + 1, 9, 3.5, 'rgba(0,0,0,.2)');
    const stalks = [[-6, -22], [-2, -28], [3, -25], [7, -19], [0, -20]];
    ctx.strokeStyle = plant.ripe ? '#5a9a3e' : '#8c9a55'; ctx.lineWidth = 1.6; ctx.beginPath();
    stalks.forEach(([x, h], i) => { if (!plant.ripe) h = -7 - (i % 2) * 3; ctx.moveTo(sx + (i - 2) * 2, sy); ctx.quadraticCurveTo(sx + x * 0.4, sy + h * 0.5, sx + x, sy + h); });
    ctx.stroke();
    if (plant.ripe) for (const [x, h] of stalks) { g.ellipse(sx + x, sy + h, 2.6, 2.2, '#6fa8e8'); g.ellipse(sx + x, sy + h, 1, 1, '#f4f0c8'); }
  },

  /** The beginner's loot chest. Open (and empty) once you have looted it. */
  drawChest(g, sx, sy, opened) { PixelDecor.drawChest(g.ctx, sx, sy, opened); },

  /** A few loose rocks lying in the grass. */
  drawStone(g, sx, sy, variant) {
    g.ellipse(sx + 1, sy + 1, 11, 4.5, 'rgba(0,0,0,.22)');
    const rocks = [[[0, -3, 6.5, 4.2, '#8d8d93'], [6, -2, 4, 3, '#a8a8ae'], [-5.5, -2, 3.6, 2.7, '#76767c']],
                   [[-1, -3, 5.5, 3.8, '#999aa0'], [5, -1.5, 3.4, 2.6, '#7b7b81']],
                   [[0, -3.5, 7, 4.6, '#8a8b91'], [-6, -1.5, 3.2, 2.4, '#a2a3a9'], [6.5, -1.5, 3, 2.2, '#6f7076']],
                   [[1, -3, 5, 3.4, '#9a9ba1'], [-5, -2, 3.6, 2.6, '#808187']]][variant % 4];
    for (const [x, y, rx, ry, c] of rocks) { g.ellipse(sx + x, sy + y, rx, ry, c); g.ellipse(sx + x - rx * 0.3, sy + y - ry * 0.35, rx * 0.4, ry * 0.3, 'rgba(255,255,255,.28)'); }
  },

  /** A diggable clay deposit: a glossy orange-brown mound. */
  drawClay(g, sx, sy, variant) {
    g.ellipse(sx + 1, sy + 1, 13, 5, 'rgba(0,0,0,.22)');
    const lumps = [[[0, -4, 9, 5.5], [-6, -2, 5, 3.5], [6, -2, 4.5, 3.2]], [[0, -4, 8, 5], [5, -3, 5.5, 3.6]], [[-1, -4, 9, 5.5], [-7, -1.5, 4, 3], [6, -2, 5, 3.4]], [[1, -4, 8.5, 5.2], [-5, -2, 5, 3.4]]][variant % 4];
    for (const [x, y, rx, ry] of lumps) {
      g.ellipse(sx + x, sy + y, rx, ry, '#b0643a'); g.ellipse(sx + x, sy + y - 1, rx * 0.85, ry * 0.8, '#c97a4b'); g.ellipse(sx + x - rx * 0.3, sy + y - ry * 0.5, rx * 0.35, ry * 0.25, 'rgba(255,225,190,.55)');
    }
  },

  /** The sign of an animal home in the wild (a creature's `marker`): a burrow, a den, a nest or a web. `v` varies the picture a little. */
  drawCritterHome(g, sx, sy, kind, v) {
    const ctx = g.ctx, flip = v % 2 ? -1 : 1;
    if (kind === 'burrow') {                                                                    // a low mound of earth with a dark hole in it
      g.ellipse(sx, sy + 1, 14, 6, 'rgba(0,0,0,.2)');
      g.ellipse(sx, sy - 2, 12, 6, '#8a6b45'); g.ellipse(sx - 2 * flip, sy - 4, 9, 4.2, '#a07d52');
      g.ellipse(sx + 1 * flip, sy - 3, 4.6, 3, '#2a1a0e'); g.ellipse(sx + 1 * flip, sy - 4, 3.4, 1.8, '#120a04');
      g.ellipse(sx - 7 * flip, sy - 1, 1.8, 1.2, '#b89968'); g.ellipse(sx + 8 * flip, sy - 1, 1.4, 1, '#7a5c3a');
    } else if (kind === 'den') {                                                                // a hollow under a heap of earth and stones
      g.ellipse(sx, sy + 1, 17, 7, 'rgba(0,0,0,.22)');
      g.ellipse(sx, sy - 5, 15, 9, '#6d5539'); g.ellipse(sx - 3 * flip, sy - 8, 11, 6, '#836846');
      g.ellipse(sx + 1 * flip, sy - 3, 7, 5, '#1d130a'); g.ellipse(sx + 1 * flip, sy - 4, 5, 3.2, '#0a0602');
      g.ellipse(sx - 11 * flip, sy - 2, 3.4, 2.4, '#8d8d93'); g.ellipse(sx + 11 * flip, sy - 3, 3, 2.2, '#76767c'); g.ellipse(sx - 5 * flip, sy - 12, 2.6, 1.8, '#9a9ba1');
    } else if (kind === 'nest') {                                                               // a ring of twigs and straw with eggs
      g.ellipse(sx, sy + 1, 12, 5, 'rgba(0,0,0,.2)');
      g.ellipse(sx, sy - 2, 10, 5, '#7a5a2e'); g.ellipse(sx, sy - 3, 8, 3.6, '#c9a85a');
      ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < 7; i++) { const a = i * 0.9 + v; ctx.moveTo(sx + Math.cos(a) * 6, sy - 3 + Math.sin(a) * 2.8); ctx.lineTo(sx + Math.cos(a) * 11, sy - 2 + Math.sin(a) * 5); }
      ctx.stroke();
      g.ellipse(sx - 2.5, sy - 4, 2.2, 1.7, '#f4efe0'); g.ellipse(sx + 2, sy - 4.5, 2.2, 1.7, '#efe7d0');
    } else if (kind === 'web') {                                                                // a funnel of silk spun between grass tufts
      ctx.save(); ctx.strokeStyle = 'rgba(235,235,240,.85)'; ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.moveTo(sx, sy - 3); ctx.lineTo(sx + Math.cos(a) * 13, sy - 3 + Math.sin(a) * 6.5); }
      ctx.stroke();
      for (const r of [4, 8, 12]) { ctx.beginPath(); ctx.ellipse(sx, sy - 3, r, r / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      g.ellipse(sx, sy - 3, 2, 1.2, '#1a1a1e');
    }
  },

  drawBarrel(g, sx, sy) { PixelDecor.drawProp(g.ctx, 'barrel', sx, sy); },

  drawWell(g, sx, sy) { PixelDecor.drawWell(g.ctx, sx, sy); }
};
