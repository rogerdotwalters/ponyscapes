'use strict';
/* CLIENT - procedural item icons (no image assets). One painter per item id; results are cached as data URLs. */
const ItemIcons = (() => {
  const SIZE = 48, cache = {};

  /** A drumstick: a plump piece of meat on a bone. */
  const drumstick = (ctx, meat, light) => {
    ctx.fillStyle = '#efe9da'; ctx.fillRect(20, 28, 5, 14); ctx.beginPath(); ctx.arc(19, 43, 3.4, 0, Math.PI * 2); ctx.arc(26, 43, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = meat; ctx.beginPath(); ctx.ellipse(24, 20, 13, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(19, 15, 5, 3.4, -0.5, 0, Math.PI * 2); ctx.fill();
  };
  /** A braided rope along a path (pts: [x, y] samples): dark outline, the rope, then the twists of the braid.
   *  An old rope (worn) has missing and rotten twists here and there. */
  const braidedRope = (ctx, pts, look, width, worn) => {
    const line = (color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    line(look.dark, width + 2.4); line(look.rope, width);
    for (let i = 1; i < pts.length - 1; i += 2) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i + 1], [x, y] = pts[i], len = Math.hypot(x1 - x0, y1 - y0) || 1, tx = (x1 - x0) / len, ty = (y1 - y0) / len, h = width / 2 - 0.4;
      if (worn && (i % 7 === 3 || i % 11 === 5)) continue;                                                // a twist worn away
      ctx.strokeStyle = worn && i % 5 === 1 ? '#4a3a26' : look.braid; ctx.lineWidth = 1.5;               // ...or gone dark with age
      ctx.beginPath(); ctx.moveTo(x - ty * h - tx * 1.4, y + tx * h - ty * 1.4); ctx.lineTo(x + ty * h + tx * 1.4, y - tx * h + ty * 1.4); ctx.stroke();
    }
  };
  const curve = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
  const quad = (a, b, c) => t => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]];
  /** A ribbon tail hanging from the ring, with a notched tip in the lasso's trim colour. */
  const ribbon = (ctx, a, b, c, color, look) => {
    const pts = curve(12, quad(a, b, c));
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const [col, w] of [[look.dark, 6.4], [color, 4.2]]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.beginPath(); pts.slice(1, -3).forEach(([x, y], i) => (i ? ctx.lineTo(x - 1, y) : ctx.moveTo(x - 1, y))); ctx.stroke();
    const [ex, ey] = c, [qx, qy] = pts[pts.length - 3], len = Math.hypot(ex - qx, ey - qy) || 1, tx = (ex - qx) / len, ty = (ey - qy) / len, nx = -ty, ny = tx;
    ctx.fillStyle = look.tip; ctx.strokeStyle = look.dark; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(qx + nx * 3, qy + ny * 3); ctx.lineTo(ex + nx * 3 + tx * 2, ey + ny * 3 + ty * 2); ctx.lineTo(ex - tx * 1, ey - ty * 1); ctx.lineTo(ex - nx * 3 + tx * 2, ey - ny * 3 + ty * 2); ctx.lineTo(qx - nx * 3, qy - ny * 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  /** A lasso in its own colours (LASSO_LOOKS): a braided loop run through a ring, its end hanging down. The starter rope is old and frayed;
   *  better lassos have ribbon tails and sparkle. */
  const lassoPainter = id => ctx => {
    const look = lassoLook(id), tier = (ItemDB.getLasso(id) || { tier: 1 }).tier, worn = !!look.worn;
    const cx = 29, cy = 27, r = 13, ringAt = -2.2, hx = cx + Math.cos(ringAt) * r, hy = cy + Math.sin(ringAt) * r;
    if (look.tails) {                                                                                     // ribbon tails behind the loop
      ribbon(ctx, [hx - 1, hy + 2], [hx - 11, hy + 9], [4, 39], look.tails[0], look);
      ribbon(ctx, [hx + 1, hy + 3], [hx - 8, hy + 13], [11, 43], look.tails[1], look);
    } else {                                                                                              // a plain rope end, frayed at the tip
      braidedRope(ctx, curve(14, quad([hx - 1, hy + 2], [hx - 11, hy + 10], [6, 42])), look, 3.6, worn);
      ctx.strokeStyle = look.tip; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.beginPath();
      for (const [fx, fy] of [[-3.5, 2], [-1.5, 4], [1, 4.5], [3, 2.5], [-4, -0.5]]) { ctx.moveTo(6, 42); ctx.lineTo(6 + fx, 42 + fy); }
      ctx.stroke();
    }
    braidedRope(ctx, curve(40, t => { const a = ringAt + 0.25 + t * (Math.PI * 2 - 0.25); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }), look, 4.4, worn);
    if (worn) {                                                                                           // a fraying strand sprung loose, and a thin, faded patch
      ctx.strokeStyle = look.tip; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(38, 36); ctx.quadraticCurveTo(42, 38, 43, 42); ctx.moveTo(38.5, 35.5); ctx.lineTo(42, 34); ctx.stroke();
      ctx.strokeStyle = 'rgba(214,190,150,.45)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(cx, cy, r, 2.2, 2.7); ctx.stroke();
    }
    ctx.lineWidth = 4.2; ctx.strokeStyle = look.dark; ctx.beginPath(); ctx.arc(hx, hy, 4.6, 0, Math.PI * 2); ctx.stroke();   // the ring (honda): tarnished iron on the old rope
    ctx.lineWidth = 2.4; ctx.strokeStyle = look.honda; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = worn ? 'rgba(160,150,135,.6)' : 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(hx, hy, 4.6, 3.6, 4.6); ctx.stroke();
    ctx.fillStyle = look.tip; for (let k = 1; k < tier; k++) { const x = 44 - (k % 2) * 3, y = -1 + k * 5; ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 1, y - 1); ctx.lineTo(x + 3, y); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x, y + 3); ctx.lineTo(x - 1, y + 1); ctx.lineTo(x - 3, y); ctx.lineTo(x - 1, y - 1); ctx.closePath(); ctx.fill(); }
  };
  /** A grooming brush: wooden back, a row of bristles. */
  const brushPainter = bristles => ctx => {
    ctx.lineCap = 'round'; ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(8, 40); ctx.lineTo(20, 28); ctx.stroke();
    ctx.save(); ctx.translate(29, 20); ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#a8763f'; ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 1.5; ctx.fillRect(-12, -5, 24, 9); ctx.strokeRect(-12, -5, 24, 9);
    ctx.strokeStyle = bristles; ctx.lineWidth = 1.6; ctx.beginPath(); for (let x = -10; x <= 10; x += 2.5) { ctx.moveTo(x, -5); ctx.lineTo(x, -12); } ctx.stroke();
    ctx.restore();
  };
  const painters = {
    axe(ctx) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(10, 41); ctx.lineTo(30, 13); ctx.stroke();
      ctx.fillStyle = '#c9ced6'; ctx.strokeStyle = '#6b727c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(24, 9); ctx.lineTo(36, 5); ctx.lineTo(43, 21); ctx.lineTo(33, 22); ctx.lineTo(28, 17); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#eef2f7'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(37, 8); ctx.lineTo(41, 19); ctx.stroke();
    },
    plank(ctx) {
      ctx.save(); ctx.translate(24, 24); ctx.rotate(-0.5);
      for (const [y, color] of [[-8, '#c9a066'], [2, '#b98e55']]) {
        ctx.fillStyle = color; ctx.fillRect(-18, y, 36, 9);
        ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1.2; ctx.strokeRect(-18, y, 36, 9);
        ctx.strokeStyle = 'rgba(90,55,25,.45)'; ctx.beginPath(); ctx.moveTo(-11, y + 3); ctx.lineTo(9, y + 3); ctx.stroke();
      }
      ctx.restore();
    },
    stone_hammer(ctx) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(11, 41); ctx.lineTo(28, 17); ctx.stroke();
      ctx.save(); ctx.translate(30, 13); ctx.rotate(0.59);
      ctx.fillStyle = '#8d8d93'; ctx.fillRect(-12, -7, 24, 14); ctx.strokeStyle = '#55555b'; ctx.lineWidth = 1.5; ctx.strokeRect(-12, -7, 24, 14);
      ctx.fillStyle = '#b4b4ba'; ctx.fillRect(-12, -7, 24, 4); ctx.strokeStyle = '#d9c9a6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-1, -8); ctx.lineTo(-1, 8); ctx.stroke();
      ctx.restore();
    },
    wood_wall(ctx) {
      const P = (x, y, h) => [24 + (x - y) * 17, 24 + (x + y) * 8.5 - h];     // tiny iso projection for the icon
      const poly = (pts, fill) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
      const y0 = 0.4, y1 = 0.6, H = 24, ox = -0.5, oy = -0.5;                 // thin slab centred in its tile
      const q = (x, y, h) => P(x + ox, y + oy, h);
      poly([q(0, y1, 0), q(1, y1, 0), q(1, y1, H), q(0, y1, H)], '#a97a45');
      poly([q(1, y1, 0), q(1, y0, 0), q(1, y0, H), q(1, y1, H)], '#8a5f32');
      poly([q(0, y0, H), q(1, y0, H), q(1, y1, H), q(0, y1, H)], '#d9b27a');
      ctx.strokeStyle = 'rgba(60,35,15,.55)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (const x of [0.25, 0.5, 0.75]) { const a = q(x, y1, 0), b = q(x, y1, H); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
    },
    string(ctx) {
      ctx.strokeStyle = '#e8dcb0'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      for (const [rx, ry, rot] of [[13, 9, 0], [11, 7, 1.0], [9, 6, 2.1]]) { ctx.beginPath(); ctx.ellipse(24, 26, rx, ry, rot, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = '#c9bb88'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(33, 29); ctx.quadraticCurveTo(40, 38, 31, 42); ctx.stroke();
    },
    torch(ctx) {
      ctx.strokeStyle = '#6b4727'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(14, 42); ctx.lineTo(26, 22); ctx.stroke();
      ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(20, 24); ctx.quadraticCurveTo(18, 12, 27, 4); ctx.quadraticCurveTo(26, 14, 34, 16); ctx.quadraticCurveTo(36, 26, 28, 28); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(23, 25); ctx.quadraticCurveTo(24, 16, 28, 14); ctx.quadraticCurveTo(31, 22, 28, 26); ctx.closePath(); ctx.fill();
    },
    campfire(ctx) {
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; ctx.fillStyle = i % 2 ? '#8d8d93' : '#a8a8ae'; ctx.beginPath(); ctx.ellipse(24 + Math.cos(a) * 15, 36 + Math.sin(a) * 5, 4.5, 3.2, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(12, 38); ctx.lineTo(36, 32); ctx.moveTo(12, 32); ctx.lineTo(36, 38); ctx.stroke();
      ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(15, 33); ctx.quadraticCurveTo(14, 16, 25, 6); ctx.quadraticCurveTo(26, 18, 35, 22); ctx.quadraticCurveTo(38, 32, 32, 35); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(20, 34); ctx.quadraticCurveTo(21, 22, 26, 18); ctx.quadraticCurveTo(31, 26, 29, 34); ctx.closePath(); ctx.fill();
    },
    wooden_sword(ctx) { swordIcon(ctx, '#d6b07a', '#f0d9ae'); },
    stone_sword(ctx) { swordIcon(ctx, '#9a9aa2', '#d2d2d8'); },
    apple(ctx) {
      const g = ctx.createRadialGradient(19, 22, 3, 24, 28, 17); g.addColorStop(0, '#ff7060'); g.addColorStop(1, '#b8231a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(24, 15); ctx.bezierCurveTo(10, 8, 5, 28, 14, 38); ctx.bezierCurveTo(19, 44, 22, 41, 24, 41); ctx.bezierCurveTo(26, 41, 29, 44, 34, 38); ctx.bezierCurveTo(43, 28, 38, 8, 24, 15); ctx.fill();
      ctx.strokeStyle = '#5b3f2a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(24, 15); ctx.quadraticCurveTo(25, 9, 29, 6); ctx.stroke();
      ctx.fillStyle = '#4a9a3c'; ctx.beginPath(); ctx.ellipse(31, 10, 7, 3.4, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(16, 22, 2.6, 4.4, 0.5, 0, Math.PI * 2); ctx.fill();
    },
    shovel(ctx) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(34, 6); ctx.lineTo(22, 28); ctx.stroke();
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(30, 6); ctx.lineTo(39, 10); ctx.stroke();       // the T handle
      ctx.fillStyle = '#aab1ba'; ctx.strokeStyle = '#656c75'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(18, 26); ctx.lineTo(27, 30); ctx.bezierCurveTo(26, 38, 20, 44, 12, 43); ctx.bezierCurveTo(8, 38, 12, 30, 18, 26); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(18, 32); ctx.lineTo(15, 39); ctx.stroke();
    },
    message_bottle(ctx) {
      ctx.fillStyle = 'rgba(140,210,195,.8)'; ctx.strokeStyle = '#3f8a7c'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(20, 8); ctx.lineTo(28, 8); ctx.lineTo(28, 16); ctx.bezierCurveTo(37, 20, 38, 34, 34, 41); ctx.lineTo(14, 41); ctx.bezierCurveTo(10, 34, 11, 20, 20, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b07a46'; ctx.fillRect(19, 4, 10, 6);
      ctx.fillStyle = '#f1e6c4'; ctx.strokeStyle = '#a58f5c'; ctx.lineWidth = 1; ctx.fillRect(20, 20, 8, 17); ctx.strokeRect(20, 20, 8, 17);
      ctx.strokeStyle = '#a58f5c'; ctx.beginPath(); ctx.moveTo(22, 25); ctx.lineTo(26, 25); ctx.moveTo(22, 29); ctx.lineTo(26, 29); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(16, 29, 1.8, 7, 0.1, 0, Math.PI * 2); ctx.fill();
    },
    treasure_map(ctx) {
      ctx.fillStyle = '#ecdcab'; ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(6, 10); ctx.lineTo(18, 7); ctx.lineTo(30, 11); ctx.lineTo(42, 8); ctx.lineTo(42, 38); ctx.lineTo(30, 41); ctx.lineTo(18, 37); ctx.lineTo(6, 40); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(18, 7); ctx.lineTo(18, 37); ctx.moveTo(30, 11); ctx.lineTo(30, 41); ctx.stroke();
      ctx.fillStyle = '#7fb0c8'; ctx.beginPath(); ctx.ellipse(12, 26, 4, 6, 0.2, 0, Math.PI * 2); ctx.fill();                     // a lake
      ctx.fillStyle = '#6a9a4c'; ctx.beginPath(); ctx.arc(24, 18, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(36, 28, 3, 0, Math.PI * 2); ctx.fill();   // trees
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(26, 28); ctx.lineTo(34, 36); ctx.moveTo(34, 28); ctx.lineTo(26, 36); ctx.stroke();   // the X
      ctx.setLineDash([2, 3]); ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(10, 14); ctx.quadraticCurveTo(20, 24, 28, 30); ctx.stroke(); ctx.setLineDash([]);
    },
    gold_coin(ctx) {
      for (const [x, y] of [[18, 30], [30, 26], [24, 17]]) {
        ctx.fillStyle = '#e0a82c'; ctx.strokeStyle = '#8a6012'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd966'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c28a1a'; ctx.font = 'bold 9px Georgia'; ctx.textAlign = 'center'; ctx.fillText('G', x, y + 3.2);
      }
    },
    stable(ctx) {
      ctx.fillStyle = '#a97a45'; ctx.strokeStyle = '#5a3a1c'; ctx.lineWidth = 1.6; ctx.fillRect(9, 20, 30, 20); ctx.strokeRect(9, 20, 30, 20);
      ctx.fillStyle = '#c75b3c'; ctx.beginPath(); ctx.moveTo(5, 21); ctx.lineTo(24, 7); ctx.lineTo(43, 21); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a1a10'; ctx.fillRect(17, 26, 14, 14);                                                              // the open stall
      ctx.fillStyle = '#d9b64a'; ctx.beginPath(); ctx.ellipse(24, 38, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();               // hay
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(14, 20); ctx.lineTo(14, 40); ctx.moveTo(34, 20); ctx.lineTo(34, 40); ctx.stroke();
    },
    stone(ctx) {
      for (const [x, y, rx, ry, c] of [[22, 30, 14, 9, '#8d8d93'], [33, 33, 8, 6, '#a8a8ae'], [13, 34, 7, 5, '#76767c']]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.4, ry * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      }
    },
    knife(ctx) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(8, 41); ctx.lineTo(19, 29); ctx.stroke();
      ctx.fillStyle = '#c9ced6'; ctx.strokeStyle = '#6b727c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(18, 30); ctx.lineTo(38, 6); ctx.lineTo(41, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#eef2f7'; ctx.beginPath(); ctx.moveTo(24, 24); ctx.lineTo(37, 10); ctx.stroke();
    },
    jug(ctx) { jugBody(ctx, null); },
    jug_water(ctx) { jugBody(ctx, '#4f9bd9'); },
    hide(ctx) {
      ctx.fillStyle = '#9a6b3d'; ctx.strokeStyle = '#6b4727'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(10, 14); ctx.lineTo(20, 10); ctx.lineTo(28, 14); ctx.lineTo(38, 10); ctx.lineTo(41, 22); ctx.lineTo(35, 28); ctx.lineTo(39, 38); ctx.lineTo(26, 36); ctx.lineTo(15, 40); ctx.lineTo(12, 28); ctx.lineTo(7, 22);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.beginPath(); ctx.ellipse(22, 22, 9, 6, 0.4, 0, Math.PI * 2); ctx.fill();
    },
    wool(ctx) {
      for (const [x, y, r, c] of [[16, 28, 9, '#e6e1d3'], [30, 28, 9, '#e6e1d3'], [23, 22, 10, '#f2efe6'], [14, 20, 7, '#f7f4ec'], [32, 20, 7, '#f7f4ec'], [23, 33, 8, '#dcd6c6']]) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    },
    antler(ctx) {
      ctx.strokeStyle = '#d9c9a6'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(24, 42); ctx.lineTo(24, 26); ctx.moveTo(24, 30); ctx.lineTo(12, 18); ctx.moveTo(24, 26); ctx.lineTo(34, 12);
      ctx.moveTo(14, 20); ctx.lineTo(10, 8); ctx.moveTo(30, 18); ctx.lineTo(40, 20); ctx.stroke();
      ctx.strokeStyle = '#a79672'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(25, 40); ctx.lineTo(25, 28); ctx.stroke();
    },
    rabbit_meat(ctx) { meatChunk(ctx, '#d9776b', '#f0b3a8', 0.8); },
    chicken_meat(ctx) { drumstick(ctx, '#e8a79b', '#f4cfc6'); },
    cooked_chicken(ctx) { drumstick(ctx, '#b8672d', '#d99a55'); },
    egg(ctx) { ctx.fillStyle = '#f6efe0'; ctx.beginPath(); ctx.ellipse(24, 28, 11, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#c9b99a'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(19.5, 22, 3, 5, -0.4, 0, Math.PI * 2); ctx.fill(); },
    fried_egg(ctx) { ctx.fillStyle = '#fbf8ef'; ctx.beginPath(); ctx.moveTo(8, 26); ctx.bezierCurveTo(6, 14, 20, 8, 28, 12); ctx.bezierCurveTo(40, 10, 44, 24, 38, 33); ctx.bezierCurveTo(32, 42, 12, 40, 8, 26); ctx.fill(); ctx.strokeStyle = '#d9d0b8'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = '#f5b82e'; ctx.beginPath(); ctx.arc(24, 26, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(21.5, 23.5, 2, 0, Math.PI * 2); ctx.fill(); },
    feather(ctx) { ctx.fillStyle = '#ece7dd'; ctx.beginPath(); ctx.moveTo(10, 40); ctx.bezierCurveTo(8, 22, 20, 8, 38, 6); ctx.bezierCurveTo(40, 22, 30, 36, 14, 38); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#b9b2a2'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.beginPath(); ctx.moveTo(9, 42); ctx.quadraticCurveTo(24, 26, 37, 8); ctx.lineWidth = 2; ctx.strokeStyle = '#8f8878'; ctx.stroke(); ctx.strokeStyle = 'rgba(150,142,126,.7)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 4; i++) { const t = 0.2 + i * 0.2, x = 9 + 28 * t, y = 42 - 34 * t; ctx.moveTo(x, y + 1); ctx.lineTo(x + 7, y + 6); } ctx.stroke(); },
    venison(ctx) { meatChunk(ctx, '#a8323a', '#d96b72', 1.1); },
    mutton(ctx) { meatChunk(ctx, '#c4585a', '#eba3a0', 1); },
    rope(ctx) {
      ctx.strokeStyle = '#c9a76a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (const r of [16, 11, 6]) { ctx.beginPath(); ctx.ellipse(24, 26, r, r * 0.65, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = '#a98a50'; ctx.lineWidth = 1.2; for (const r of [16, 11, 6]) { ctx.beginPath(); ctx.ellipse(24, 26, r, r * 0.65, 0, 0.3, 0.9); ctx.stroke(); }
      ctx.strokeStyle = '#c9a76a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(38, 28); ctx.quadraticCurveTo(44, 36, 36, 41); ctx.stroke();
    },
    clay(ctx) {
      for (const [x, y, rx, ry] of [[22, 30, 14, 9], [33, 33, 8, 6], [13, 34, 7, 5]]) {
        ctx.fillStyle = '#b0643a'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c97a4b'; ctx.beginPath(); ctx.ellipse(x, y - 1.5, rx * 0.85, ry * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,225,190,.55)'; ctx.beginPath(); ctx.ellipse(x - rx * 0.3, y - ry * 0.5, rx * 0.35, ry * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      }
    },
    brick(ctx) {
      ctx.fillStyle = '#a8503a'; ctx.strokeStyle = '#6e2f20'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(6, 22); ctx.lineTo(30, 12); ctx.lineTo(42, 18); ctx.lineTo(42, 30); ctx.lineTo(18, 40); ctx.lineTo(6, 34); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c4694f'; ctx.beginPath(); ctx.moveTo(6, 22); ctx.lineTo(30, 12); ctx.lineTo(42, 18); ctx.lineTo(18, 28); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(18, 28); ctx.lineTo(18, 40); ctx.stroke();
    },
    brick_form(ctx) {
      ctx.fillStyle = '#8a5f32'; ctx.strokeStyle = '#5a3f2a'; ctx.lineWidth = 1.8; ctx.fillRect(6, 14, 36, 24); ctx.strokeRect(6, 14, 36, 24);
      ctx.fillStyle = '#2f1f12'; ctx.fillRect(10, 18, 13, 16); ctx.fillRect(25, 18, 13, 16);
      ctx.fillStyle = '#b07a46'; ctx.fillRect(6, 14, 36, 3);
    },
    crafting_table(ctx) {
      ctx.fillStyle = '#6f4a28'; ctx.fillRect(10, 24, 5, 17); ctx.fillRect(33, 24, 5, 17);
      ctx.fillStyle = '#b98a52'; ctx.strokeStyle = '#5a3f2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(4, 24); ctx.lineTo(22, 15); ctx.lineTo(44, 24); ctx.lineTo(26, 33); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(15, 25); ctx.lineTo(24, 20); ctx.stroke();
      ctx.fillStyle = '#8d8d93'; ctx.fillRect(22, 17, 7, 5); ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(30, 27); ctx.lineTo(37, 25); ctx.stroke();
    },
    clay_furnace(ctx) {
      ctx.fillStyle = '#b4703f'; ctx.fillRect(8, 30, 32, 10);
      ctx.fillStyle = '#c4733f'; ctx.beginPath(); ctx.ellipse(24, 28, 17, 15, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(7, 28, 34, 4);
      ctx.fillStyle = '#d28a58'; ctx.beginPath(); ctx.ellipse(19, 20, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a1a12'; ctx.beginPath(); ctx.ellipse(26, 33, 8, 7, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(18, 33, 16, 5);
      ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.ellipse(26, 35, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a85f33'; ctx.fillRect(31, 5, 6, 14);
    },
    wood_floor(ctx) {
      ctx.fillStyle = '#b98e55'; ctx.strokeStyle = '#5a3f2a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(24, 10); ctx.lineTo(44, 24); ctx.lineTo(24, 38); ctx.lineTo(4, 24); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(70,40,15,.45)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (const t of [0.25, 0.5, 0.75]) { ctx.moveTo(24 - 20 * t, 10 + 14 * t); ctx.lineTo(44 - 20 * t, 24 + 14 * t); }
      ctx.stroke();
    },
    wood_window(ctx) {
      ctx.fillStyle = '#a97a45'; ctx.strokeStyle = '#5a3f2a'; ctx.lineWidth = 2; ctx.fillRect(8, 8, 32, 34); ctx.strokeRect(8, 8, 32, 34);
      ctx.fillStyle = 'rgba(150,205,235,.9)'; ctx.fillRect(13, 13, 22, 24); ctx.strokeRect(13, 13, 22, 24);
      ctx.strokeStyle = '#5a3f2a'; ctx.beginPath(); ctx.moveTo(24, 13); ctx.lineTo(24, 37); ctx.moveTo(13, 25); ctx.lineTo(35, 25); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(16, 18); ctx.lineTo(21, 15); ctx.stroke();
    },
    wood_door(ctx) {
      ctx.fillStyle = '#8a5a2c'; ctx.strokeStyle = '#3f2a16'; ctx.lineWidth = 2; ctx.fillRect(10, 6, 28, 36); ctx.strokeRect(10, 6, 28, 36);
      ctx.strokeStyle = 'rgba(40,24,10,.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(19, 7); ctx.lineTo(19, 41); ctx.moveTo(29, 7); ctx.lineTo(29, 41); ctx.stroke();
      ctx.fillStyle = '#e0b84a'; ctx.beginPath(); ctx.arc(33, 25, 2.6, 0, Math.PI * 2); ctx.fill();
    },
    bow(ctx) {
      ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(14, 6); ctx.quadraticCurveTo(42, 24, 14, 42); ctx.stroke();
      ctx.strokeStyle = '#efe9d6'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(14, 6); ctx.lineTo(14, 42); ctx.stroke();
      ctx.strokeStyle = '#c9a066'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, 24); ctx.lineTo(38, 24); ctx.stroke();
    },
    arrow(ctx) {
      ctx.lineCap = 'round'; ctx.strokeStyle = '#c9a066'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, 40); ctx.lineTo(36, 12); ctx.stroke();
      ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.moveTo(34, 8); ctx.lineTo(44, 4); ctx.lineTo(40, 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d95b43'; ctx.beginPath(); ctx.moveTo(8, 40); ctx.lineTo(4, 32); ctx.lineTo(14, 36); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(8, 40); ctx.lineTo(16, 44); ctx.lineTo(14, 34); ctx.closePath(); ctx.fill();
    },
    spear(ctx) {
      ctx.lineCap = 'round'; ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(6, 42); ctx.lineTo(34, 14); ctx.stroke();
      ctx.fillStyle = '#c9ced6'; ctx.strokeStyle = '#6b727c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(30, 12); ctx.lineTo(44, 4); ctx.lineTo(37, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
    },
    fishing_rod(ctx) {
      ctx.lineCap = 'round'; ctx.strokeStyle = '#a07a45'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, 42); ctx.lineTo(38, 8); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(38, 8); ctx.quadraticCurveTo(46, 22, 38, 36); ctx.stroke();
      ctx.fillStyle = '#d9d9d9'; ctx.beginPath(); ctx.arc(38, 37, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7c7c80'; ctx.beginPath(); ctx.arc(15, 33, 4, 0, Math.PI * 2); ctx.fill();
    },
    raw_fish(ctx) { fishBody(ctx, '#8fb4c9', '#d9e9f2'); },
    cooked_fish(ctx) { fishBody(ctx, '#c58a4a', '#e8b878'); },
    cooked_rabbit(ctx) { meatChunk(ctx, '#8a4a2a', '#c98a5a', 0.8); },
    cooked_venison(ctx) { meatChunk(ctx, '#6e3320', '#b06a46', 1.1); },
    cooked_mutton(ctx) { meatChunk(ctx, '#7c4026', '#c07a52', 1); },
    bone(ctx) {
      ctx.save(); ctx.translate(24, 24); ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#f2ead6'; ctx.strokeStyle = '#a89a7a'; ctx.lineWidth = 1.5;
      ctx.fillRect(-12, -3.5, 24, 7); ctx.strokeRect(-12, -3.5, 24, 7);
      for (const [x, y] of [[-13, -4], [-13, 4], [13, -4], [13, 4]]) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.fillRect(-12, -3, 24, 6); ctx.restore();
    },
    bear_cub(ctx) {
      const fur = '#8a5a35';
      ctx.fillStyle = fur; for (const x of [13, 35]) { ctx.beginPath(); ctx.arc(x, 13, 6, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#c99a6a'; for (const x of [13, 35]) { ctx.beginPath(); ctx.arc(x, 13, 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = fur; ctx.beginPath(); ctx.arc(24, 27, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9b48a'; ctx.beginPath(); ctx.ellipse(24, 33, 7.5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#241a14'; ctx.beginPath(); ctx.arc(18, 24, 2.2, 0, Math.PI * 2); ctx.arc(30, 24, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(24, 31, 3, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(18.7, 23.3, 0.8, 0, Math.PI * 2); ctx.arc(30.7, 23.3, 0.8, 0, Math.PI * 2); ctx.fill();
    },
    leash: lassoPainter('leash'), lasso_silk: lassoPainter('lasso_silk'), lasso_gold: lassoPainter('lasso_gold'), lasso_star: lassoPainter('lasso_star'),
    brush: brushPainter('#4a3424'), soft_brush: brushPainter('#f4ead8'),
    captured_rabbit(ctx) {
      ctx.fillStyle = '#a98d6c'; ctx.beginPath(); ctx.ellipse(24, 30, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(19, 14, 3.2, 10, -0.15, 0, Math.PI * 2); ctx.ellipse(28, 14, 3.2, 10, 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8b3b3'; ctx.beginPath(); ctx.ellipse(19, 14, 1.4, 7, -0.15, 0, Math.PI * 2); ctx.ellipse(28, 14, 1.4, 7, 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#241a14'; ctx.beginPath(); ctx.arc(19, 28, 1.6, 0, Math.PI * 2); ctx.arc(29, 28, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d98a8a'; ctx.beginPath(); ctx.arc(24, 32, 1.8, 0, Math.PI * 2); ctx.fill();
    },
    wood_fence(ctx) {
      ctx.fillStyle = '#c4975a'; ctx.strokeStyle = '#6b4727'; ctx.lineWidth = 1.5;
      for (const x of [8, 22, 36]) { ctx.fillRect(x, 12, 5, 28); ctx.strokeRect(x, 12, 5, 28); }
      for (const y of [18, 29]) { ctx.fillRect(6, y, 36, 5); ctx.strokeRect(6, y, 36, 5); }
    },
    wood_gate(ctx) {
      ctx.fillStyle = '#c4975a'; ctx.strokeStyle = '#6b4727'; ctx.lineWidth = 1.5;
      for (const x of [6, 37]) { ctx.fillRect(x, 10, 5, 31); ctx.strokeRect(x, 10, 5, 31); }
      ctx.fillStyle = '#a8763f'; ctx.fillRect(11, 16, 26, 20); ctx.strokeRect(11, 16, 26, 20);
      ctx.beginPath(); ctx.moveTo(11, 36); ctx.lineTo(37, 16); ctx.moveTo(11, 26); ctx.lineTo(37, 26); ctx.stroke();
      ctx.fillStyle = '#e0b84a'; ctx.beginPath(); ctx.arc(34, 26, 1.8, 0, Math.PI * 2); ctx.fill();
    },
    log(ctx) { PixelLogs.icon(ctx); }                                       // the pixel-art log (pixelProps.js)
  };
  /** A small cluster of berries on a leaf, in the item's own colour. */
  function berryPainter(color) {
    return ctx => {
      ctx.fillStyle = '#3f8a45'; ctx.beginPath(); ctx.ellipse(31, 12, 9, 4.5, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2d6a33'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(22, 17); ctx.lineTo(38, 8); ctx.stroke();
      for (const [x, y] of [[17, 27], [29, 26], [23, 36], [12, 37], [34, 37], [24, 21]]) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 2, 5, 0, Math.PI); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(x - 2.5, y - 2.5, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    };
  }
  function swordIcon(ctx, blade, edge) {
    ctx.lineCap = 'round'; ctx.fillStyle = blade; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(15, 31); ctx.lineTo(38, 6); ctx.lineTo(42, 9); ctx.lineTo(19, 35); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = edge; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(19, 30); ctx.lineTo(38, 9); ctx.stroke();
    ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(10, 30); ctx.lineTo(24, 40); ctx.stroke();       // crossguard
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(17, 35); ctx.lineTo(9, 43); ctx.stroke();            // grip
    ctx.fillStyle = '#d9b45a'; ctx.beginPath(); ctx.arc(8, 44, 3, 0, Math.PI * 2); ctx.fill();
  }
  function jugBody(ctx, water) {
    ctx.fillStyle = '#b07a46'; ctx.strokeStyle = '#6b4727'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(18, 9); ctx.lineTo(30, 9); ctx.lineTo(29, 16); ctx.bezierCurveTo(40, 20, 40, 40, 24, 42); ctx.bezierCurveTo(8, 40, 8, 20, 19, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a5a33'; ctx.fillRect(17, 7, 14, 5);
    ctx.strokeStyle = '#6b4727'; ctx.beginPath(); ctx.moveTo(14, 26); ctx.lineTo(34, 26); ctx.moveTo(15, 33); ctx.lineTo(33, 33); ctx.stroke();
    if (water) { ctx.fillStyle = water; ctx.beginPath(); ctx.ellipse(24, 10, 5.5, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(21, 9.4, 3, 1); }
  }
  function fishBody(ctx, body, belly) {
    ctx.fillStyle = body; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(6, 24); ctx.quadraticCurveTo(22, 8, 36, 22); ctx.lineTo(44, 14); ctx.lineTo(44, 34); ctx.lineTo(36, 26); ctx.quadraticCurveTo(22, 40, 6, 24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(20, 28, 11, 4, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#10202f'; ctx.beginPath(); ctx.arc(12, 22, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  function meatChunk(ctx, base, fat, scale) {
    ctx.save(); ctx.translate(24, 26); ctx.scale(scale, scale);
    ctx.fillStyle = base; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-16, -2); ctx.bezierCurveTo(-14, -16, 8, -18, 15, -6); ctx.bezierCurveTo(20, 6, 8, 16, -6, 14); ctx.bezierCurveTo(-16, 12, -18, 6, -16, -2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = fat; ctx.beginPath(); ctx.ellipse(-3, -2, 8, 4, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f3efe6'; ctx.beginPath(); ctx.arc(11, 4, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  /** Wardrobe items are drawn from their own data: the kind of crown / dress / cape and its colours. A null colour means "the colour you chose". */
  function wardrobePainter(def) {
    const look = def.look, slot = def.equip.slot, DEFAULT = { outfit: def.equip.body === 'prince' ? '#2f5fc0' : '#e0709a', trim: '#f2c14e' };
    const col = look.color || DEFAULT.outfit, trim = look.trim || DEFAULT.trim, dark = c => shadeHex(c, 0.7), light = c => shadeHex(c, 1.25);
    const outline = ctx => { ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.6; ctx.stroke(); };
    if (slot === 'crown') return ctx => {
      const gem = look.gem;
      ctx.fillStyle = look.color;
      if (look.style === 'tiara') { ctx.beginPath(); ctx.moveTo(6, 32); ctx.quadraticCurveTo(24, 14, 42, 32); ctx.lineTo(42, 36); ctx.quadraticCurveTo(24, 20, 6, 36); ctx.closePath(); ctx.fill(); outline(ctx); for (const [x, y] of [[13, 25], [24, 18], [35, 25]]) { ctx.beginPath(); ctx.moveTo(x - 2.4, y + 3); ctx.lineTo(x, y - 6); ctx.lineTo(x + 2.4, y + 3); ctx.closePath(); ctx.fill(); outline(ctx); } }
      else if (look.style === 'circlet') { ctx.lineWidth = 5; ctx.strokeStyle = look.color; ctx.beginPath(); ctx.ellipse(24, 30, 16, 6, 0, 0, Math.PI * 2); ctx.stroke(); for (const x of [10, 18, 30, 38]) { ctx.beginPath(); ctx.moveTo(x - 1.5, 27); ctx.lineTo(x + (x < 24 ? -3 : 3), 12); ctx.lineTo(x + 2, 26); ctx.closePath(); ctx.fill(); } }
      else if (look.style === 'spiked') { ctx.beginPath(); ctx.moveTo(6, 36); ctx.lineTo(6, 22); ctx.lineTo(13, 8); ctx.lineTo(18, 24); ctx.lineTo(24, 4); ctx.lineTo(30, 24); ctx.lineTo(35, 8); ctx.lineTo(42, 22); ctx.lineTo(42, 36); ctx.closePath(); ctx.fill(); outline(ctx); }
      else { ctx.beginPath(); ctx.moveTo(7, 36); ctx.lineTo(7, 18); ctx.lineTo(15, 26); ctx.lineTo(24, 10); ctx.lineTo(33, 26); ctx.lineTo(41, 18); ctx.lineTo(41, 36); ctx.closePath(); ctx.fill(); outline(ctx); ctx.fillStyle = dark(look.color); ctx.fillRect(7, 31, 34, 5); }
      if (gem) { ctx.fillStyle = gem; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(24, 30, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(22, 28, 2, 2); }
    };
    if (slot === 'cape') return ctx => {
      ctx.fillStyle = look.color; ctx.beginPath(); ctx.moveTo(14, 6); ctx.lineTo(34, 6); ctx.lineTo(43, 42); ctx.quadraticCurveTo(24, 36, 5, 42); ctx.closePath(); ctx.fill(); outline(ctx);
      ctx.fillStyle = dark(look.color); ctx.beginPath(); ctx.moveTo(24, 8); ctx.lineTo(34, 6); ctx.lineTo(43, 42); ctx.quadraticCurveTo(34, 38, 28, 38); ctx.closePath(); ctx.fill();
      ctx.fillStyle = look.trim; if (look.style === 'fur' || look.style === 'royal') { ctx.fillRect(12, 4, 24, 7); for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(14 + i * 4.4, 11, 2.6, 0, Math.PI * 2); ctx.fill(); } }
      else { ctx.fillRect(14, 5, 20, 4); }
      if (look.style === 'star') for (const [x, y] of [[18, 20], [30, 26], [22, 34], [34, 14]]) { ctx.fillStyle = look.trim; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
      if (look.style === 'scaled') { ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { ctx.beginPath(); ctx.arc(14 + c * 7 + (r % 2) * 3.5, 16 + r * 6, 3.4, 0, Math.PI); ctx.stroke(); } }
      ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(24, 8, 2.6, 0, Math.PI * 2); ctx.fill();
    };
    const dress = def.equip.body === 'princess';                                                        // an outfit: a dress or garb
    return ctx => {
      ctx.fillStyle = col; ctx.beginPath();
      if (dress) { ctx.moveTo(17, 6); ctx.lineTo(31, 6); ctx.lineTo(29, 17); ctx.lineTo(43, 43); ctx.lineTo(5, 43); ctx.lineTo(19, 17); ctx.closePath(); }
      else { ctx.moveTo(10, 8); ctx.lineTo(18, 6); ctx.lineTo(24, 12); ctx.lineTo(30, 6); ctx.lineTo(38, 8); ctx.lineTo(41, 26); ctx.lineTo(35, 27); ctx.lineTo(35, 44); ctx.lineTo(13, 44); ctx.lineTo(13, 27); ctx.lineTo(7, 26); ctx.closePath(); }
      ctx.fill(); outline(ctx);
      ctx.fillStyle = trim; if (dress) { ctx.fillRect(19, 16, 10, 3); ctx.fillRect(5, 40, 38, 3.5); } else { ctx.fillRect(13, 24, 22, 3); ctx.fillRect(21, 7, 6, 5); if (look.style === 'doublet') for (const y of [30, 35, 40]) ctx.fillRect(23, y, 2.4, 2.4); }
      if (look.style === 'scaled') { ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { ctx.beginPath(); ctx.arc(14 + c * 6 + (r % 2) * 3, 24 + r * 5, 3, 0, Math.PI); ctx.stroke(); } }
    };
  }
  const shadeHex = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, Math.round(v * k))); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c).map(v => v.toString(16).padStart(2, '0')).join(''); };

  const fallback = ctx => { ctx.fillStyle = '#9aa'; ctx.font = 'bold 28px Georgia'; ctx.textAlign = 'center'; ctx.fillText('?', 24, 34); };

  /** A stockpile: a pallet with its resource heaped on it. */
  function stockpileIcon(ctx, resource) {
    ctx.fillStyle = '#7a5230'; ctx.fillRect(6, 34, 36, 6); ctx.fillStyle = '#5a3a20'; ctx.fillRect(9, 40, 5, 4); ctx.fillRect(34, 40, 5, 4); ctx.fillRect(21, 40, 6, 4);
    if (resource === 'wood') for (const [x, y] of [[13, 29], [24, 29], [35, 29], [18, 21], [30, 21], [24, 13]]) { ctx.fillStyle = '#9a6b3d'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#d9b27a'; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill(); }
    else if (resource === 'stone') for (const [x, y, r] of [[14, 29, 6], [26, 30, 7], [36, 29, 5.5], [20, 21, 6], [31, 21, 6], [25, 13, 5]]) { ctx.fillStyle = '#8d8d93'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#b4b4ba'; ctx.beginPath(); ctx.ellipse(x - 1.5, y - 2, r * 0.45, r * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
    else for (const [x, y] of [[14, 29], [26, 29], [36, 29], [20, 21], [31, 21], [25, 13]]) { ctx.fillStyle = '#b8643c'; ctx.beginPath(); ctx.ellipse(x, y, 6, 4.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#d98a5c'; ctx.beginPath(); ctx.ellipse(x - 1.5, y - 1.5, 2.6, 1.6, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  painters.stockpile_wood = ctx => stockpileIcon(ctx, 'wood');
  painters.stockpile_stone = ctx => stockpileIcon(ctx, 'stone');
  painters.stockpile_clay = ctx => stockpileIcon(ctx, 'clay');

  /** A bag in its own leather: a backpack (worn by you) or a pair of saddlebags on a strap (a pony's). Bigger bags get brass buckles. */
  const bagPainter = def => ctx => {
    const leather = def.color || '#9a6b3f', dark = 'rgba(0,0,0,.35)', big = def.bag.slots >= (def.bag.for === 'pony' ? 15 : 8);
    const pouch = (x, y, w, h) => {
      ctx.fillStyle = leather; ctx.strokeStyle = dark; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - 5); ctx.quadraticCurveTo(x + w, y + h, x + w - 5, y + h); ctx.lineTo(x + 5, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x + 2, y + 2, w - 4, 4);
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x, y, w, h * 0.38);                                   // the flap
      ctx.fillStyle = big ? '#e8c45a' : '#d8cfb8'; ctx.fillRect(x + w / 2 - 2.5, y + h * 0.3, 5, 5);           // buckle
    };
    if (def.bag.for === 'pony') {
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(12, 14); ctx.quadraticCurveTo(24, 6, 36, 14); ctx.stroke();
      pouch(4, 14, 17, 26); pouch(27, 14, 17, 26);
    } else {
      ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(24, 12, 7, Math.PI, 0); ctx.stroke();
      pouch(9, 12, 30, 31);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(14, 30, 20, 9);                                         // front pocket
    }
  };

  /** An item you created without an icon yet: a badge in its colour (or its rarity's) with its first letter. */
  const badgePainter = def => ctx => {
    const color = def.color || rarityOf(def.rarity).color;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(24, 24, 18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = 'bold 22px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((def.name || '?')[0].toUpperCase(), 24, 25);
  };

  /** The procedural icon (ignores any image you gave the item). */
  function proceduralUrl(itemId) {
    const key = '\u0000' + itemId;
    if (cache[key]) return cache[key];
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
    const def = ItemDB.get(itemId), paint = painters[itemId] || (def && def.lasso ? lassoPainter(itemId) : def && def.bag ? bagPainter(def) : def && def.kind === 'wardrobe' ? wardrobePainter(def) : def && def.kind === 'berry' ? berryPainter(def.color) : def ? badgePainter(def) : fallback);
    paint(canvas.getContext('2d'));
    return (cache[key] = canvas.toDataURL());
  }
  /** The icon to show: your image if the item has one (editor.html), else the procedural one. */
  function url(itemId) { return SpriteRegistry.itemIconSrc(itemId) || proceduralUrl(itemId); }
  /** The icon as a loaded image, for drawing on the canvas (null until it has loaded). */
  function image(itemId) { return SpriteRegistry.image(url(itemId)); }
  return { url, proceduralUrl, image };
})();
