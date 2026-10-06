'use strict';
/* CLIENT - trees, stumps, barrels, the well. (sx, sy) is the prop's footprint on screen. */
const TREE_SCALE_BASE = 1.35, TREE_SCALE_STEP = 0.07, STUMP_SCALE = 1.3;

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
  drawTree(g, sx, sy, variant, shakeX, fruit, biome) {
    const ctx = g.ctx, scale = TREE_SCALE_BASE + (variant % 5) * TREE_SCALE_STEP;    // trees tower over the player
    g.ellipse(sx + 5, sy + 3, 24 * scale, 11 * scale, 'rgba(0,0,0,.25)');        // shadow stays put while the tree shakes
    ctx.save(); ctx.translate(sx, sy); ctx.scale(scale, scale);
    ctx.fillStyle = '#5b3f2a'; ctx.fillRect(-4, -26, 8, 26);
    ctx.translate(shakeX / scale, 0);                                             // sway the crown only
    if (variant % 2 === 0) {
      g.ellipse(-14, -38, 15, 13, '#3f7a3a'); g.ellipse(14, -38, 15, 13, '#3a7236');
      g.ellipse(0, -48, 20, 17, '#468a40'); g.ellipse(-4, -54, 13, 10, '#5ea24a');
    } else {
      const shades = ['#2f6a35', '#387a3d', '#428a45'];
      for (let i = 0; i < 3; i++) { const w = 26 - i * 6, yb = -16 - i * 18; g.polygon([-w, yb, w, yb, 0, yb - 32], shades[i]); }
    }
    const tint = TREE_TINT[biome];                                                   // far-off biomes have their own foliage colour
    if (tint) {
      if (variant % 2 === 0) { for (const [x, y, rx, ry] of [[-14, -38, 15, 13], [14, -38, 15, 13], [0, -48, 20, 17], [-4, -54, 13, 10]]) g.ellipse(x, y, rx, ry, tint); }
      else { const sh = [0, 1, 2]; for (const i of sh) { const w = 26 - i * 6, yb = -16 - i * 18; g.polygon([-w, yb, w, yb, 0, yb - 32], tint); } }
    }
    if (fruit && fruit.ripe) {                                                    // apples among the leaves
      const spots = variant % 2 === 0 ? [[-17, -36], [12, -33], [-6, -44], [5, -52], [19, -42], [-1, -34], [-12, -50]] : [[-14, -24], [11, -22], [-4, -40], [6, -46], [-1, -26], [13, -38]];
      for (const [ax, ay] of spots) { g.ellipse(ax, ay, 3.6, 3.6, '#d9382b'); g.ellipse(ax - 1.1, ay - 1.2, 1.1, 1.1, 'rgba(255,255,255,.6)'); ctx.fillStyle = '#3b6b2a'; ctx.fillRect(ax - 0.5, ay - 5, 1.2, 2.2); }
    }
    ctx.restore();
  },

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

  drawStump(g, sx, sy) {
    const ctx = g.ctx;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(STUMP_SCALE, STUMP_SCALE);
    g.ellipse(2, 2, 12, 5.5, 'rgba(0,0,0,.25)');
    g.ellipse(0, 0, 10, 5, '#6f4626'); ctx.fillStyle = '#8a5a33'; ctx.fillRect(-10, -8, 20, 8);
    g.ellipse(0, 0, 10, 5, '#8a5a33'); g.ellipse(0, -8, 10, 5, '#c9a06a'); g.ellipse(0, -8, 6, 3, '#b58a55');
    ctx.restore();
  },

  /** Berry bush: leafy mound; ripe bushes carry berries in the colour of their berry type. */
  drawBush(g, sx, sy, bush) {
    const ctx = g.ctx, ripe = bush.ripe, def = ItemDB.get(bush.berry), berry = def ? def.color : '#c33';
    ctx.save(); ctx.translate(sx, sy);
    g.ellipse(3, 2, 19, 8, 'rgba(0,0,0,.25)');
    const leaf = ripe ? ['#2f6f36', '#3b8341', '#4a9a4c'] : ['#6b7a3c', '#7d8c46', '#8d9a52'];     // picked bushes look dry
    g.ellipse(-11, -8, 12, 9, leaf[0]); g.ellipse(11, -8, 12, 9, leaf[0]);
    g.ellipse(0, -13, 15, 12, leaf[1]); g.ellipse(-3, -17, 9, 6, leaf[2]);
    if (ripe) {
      const spots = [[-12, -8], [-5, -16], [4, -19], [11, -9], [-1, -9], [7, -14], [-9, -14], [2, -5]];
      spots.forEach(([bx, by], i) => {
        if ((i + bush.v) % 5 === 4) return;                      // a little variation between bushes
        g.ellipse(bx, by, 3.2, 3.2, berry);
        g.ellipse(bx - 1, by - 1, 1, 1, 'rgba(255,255,255,.55)');
      });
    }
    ctx.restore();
  },

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
  drawChest(g, sx, sy, opened) {
    const ctx = g.ctx;
    g.ellipse(sx + 2, sy + 2, 22, 9, 'rgba(0,0,0,.25)');
    g.polygon([sx - 15, sy - 3, sx, sy + 4, sx, sy - 12, sx - 15, sy - 19], '#8a5a33');                       // front-left face
    g.polygon([sx, sy + 4, sx + 15, sy - 3, sx + 15, sy - 19, sx, sy - 12], '#6f4626');                      // front-right face
    ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(sx - 7, sy + 0.5); ctx.lineTo(sx - 7, sy - 15.5); ctx.moveTo(sx + 7, sy + 0.5); ctx.lineTo(sx + 7, sy - 15.5); ctx.stroke();
    if (opened) {
      g.polygon([sx - 15, sy - 19, sx, sy - 12, sx + 15, sy - 19, sx, sy - 26], '#2b1c10');                  // dark inside
      g.polygon([sx - 15, sy - 19, sx, sy - 26, sx, sy - 44, sx - 15, sy - 37], '#a97a45');                  // lid standing open
    } else {
      g.polygon([sx - 15, sy - 19, sx, sy - 12, sx + 15, sy - 19, sx, sy - 26], '#a97a45');                  // closed lid
      g.ellipse(sx, sy - 12.5, 2.6, 2.6, '#d9b45a');                                                          // lock
    }
  },

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

  drawBarrel(g, sx, sy) {
    const ctx = g.ctx;
    g.ellipse(sx + 3, sy + 2, 11, 5, 'rgba(0,0,0,.25)');
    ctx.save(); ctx.translate(sx, sy);
    g.ellipse(0, 0, 9, 4.5, '#6f4626'); ctx.fillStyle = '#8a5a33'; ctx.fillRect(-9, -18, 18, 18);
    g.ellipse(0, 0, 9, 4.5, '#8a5a33'); g.ellipse(0, -18, 9, 4.5, '#a8733f');
    ctx.strokeStyle = '#3b2a1c'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.ellipse(0, -6, 9, 4.5, 0, 0, Math.PI); ctx.moveTo(9, -13); ctx.ellipse(0, -13, 9, 4.5, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
  },

  drawWell(g, sx, sy) {
    const ctx = g.ctx;
    ctx.save(); ctx.translate(sx, sy);
    g.ellipse(4, 3, 26, 12, 'rgba(0,0,0,.25)');
    g.ellipse(0, 0, 20, 10, '#8d887c'); ctx.fillStyle = '#9a958a'; ctx.fillRect(-20, -16, 40, 16);
    g.ellipse(0, 0, 20, 10, '#9a958a'); g.ellipse(0, -16, 20, 10, '#b8b3a6'); g.ellipse(0, -16, 14, 7, '#2b5f86');
    ctx.strokeStyle = '#5b3f2a'; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(-17, -14); ctx.lineTo(-17, -52); ctx.moveTo(17, -14); ctx.lineTo(17, -52); ctx.stroke();
    g.polygon([-27, -50, 0, -70, 27, -50], '#8b3f35'); g.polygon([-27, -50, 27, -50, 22, -45, -22, -45], '#5e2a24');
    ctx.strokeStyle = '#d8c9a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(0, -28); ctx.stroke();
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-4, -28, 8, 6);
    ctx.restore();
  }
};
