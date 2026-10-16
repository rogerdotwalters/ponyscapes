'use strict';
/* CLIENT - the Round-Up's pictures (roundupSystem.js, roundupPlan.js): the old fence and its signpost beside the village, the pole each side defends, the wild flowers of the
 * arena meadow, and the ropes. The fence, sign and pole are painted with PixelDecor's ray-cast scenes (cached); the flag on the pole, the ropes and the rings are plain canvas
 * strokes that change every frame. (sx, sy) is the point on the ground the thing stands on. */
const RoundupSprites = (() => {
  const { scene, render, M, ART } = PixelDecor;
  const cache = new Map();
  const art = (key, build) => { let a = cache.get(key); if (!a) { const s = scene(); build(s); a = render(s); cache.set(key, a); } return a; };
  const TEAM = ['#d9534f', '#3b7ddd'], TEAM_LIGHT = ['#f08a80', '#8cb4f2'], ROPE_DARK = '#3a2a18';
  const POLE_TOP = 52 * ART, RING = 38 * ART;                                         // world pixels above the ground: the top of the pole, and the ring the ropes are tied to

  function stamp(ctx, a, sx, sy, shadow) {
    const smooth = ctx.imageSmoothingEnabled;
    if (shadow) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(sx + 2, sy + 2, shadow[0], shadow[1], 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(a.canvas, sx + a.minX * ART, sy + a.minY * ART, a.canvas.width * ART, a.canvas.height * ART);
    ctx.imageSmoothingEnabled = smooth;
  }

  /** One tile of the old fence: weathered posts at both ends and two rails; some have a snapped rail or a short post. */
  function fence(ctx, sx, sy, v) {
    const k = ((v | 0) % 3 + 3) % 3;
    stamp(ctx, art('fence' + k, s => {
      const rail = M.wood('#8a7660', { dir: 'h', pw: 4, seed: 11 + k }), post = M.wood('#6b5a47', { dir: 'v', pw: 3, seed: 5 + k });
      s.box(-0.5, -0.07, -0.4, 0.07, 0, 30, post);
      s.box(0.4, -0.07, 0.5, 0.07, 0, k === 1 ? 23 : 30, post);
      s.box(-0.45, -0.035, 0.45, 0.035, 20, 25, rail);
      if (k === 2) s.box(-0.45, -0.035, -0.05, 0.035, 8, 13, rail); else s.box(-0.45, -0.035, 0.45, 0.035, 8, 13, rail);
    }), sx, sy, [18, 6]);
  }

  /** The signpost beside the gap in the fence: a board with a sheep on it. */
  function sign(ctx, sx, sy) {
    stamp(ctx, art('sign', s => {
      const post = M.wood('#6b5a47', { dir: 'v', pw: 3, seed: 3 }), board = M.wood('#b69259', { dir: 'h', pw: 5, seed: 7 });
      s.box(-0.05, -0.05, 0.05, 0.05, 0, 40, post);
      s.box(-0.34, -0.04, 0.34, 0.04, 22, 38, board);
      s.decal((g, P, px, rect) => {
        const [x, y] = P(0, 0.04, 30), wool = '#f6f1e2', shade = '#cfc7b0', dark = '#3a2a18';
        rect(x - 5, y - 3, 9, 5, wool); rect(x - 4, y + 1, 8, 1, shade); rect(x + 3, y - 2, 3, 3, dark); rect(x - 4, y + 2, 1, 2, dark); rect(x + 1, y + 2, 1, 2, dark);
        px(x + 4, y - 3, dark);
      });
    }), sx, sy, [11, 4]);
  }

  /** A side's pole: a cairn, a post with a ring for the ropes and a banner in the side's colour that shows its score. `info`: { score, steal (0..1 or 0), name }. */
  function pole(ctx, sx, sy, team, info, now) {
    stamp(ctx, art('pole', s => {
      const wood = M.wood('#7a5230', { dir: 'v', pw: 3, seed: 2 }), stone = M.stone('#9a958a', { course: 4, seed: 6 });
      s.cyl(0, 0, 0, 5, 0.32, stone, 0.2);
      s.box(-0.07, -0.07, 0.07, 0.07, 5, 52, wood);
      s.box(-0.22, -0.05, 0.22, 0.05, 44, 48, wood);
      s.cyl(0, 0, 34, 38, 0.13, M.solid('#c9a84a'), 0.1);
    }), sx, sy, [26, 10]);
    const col = TEAM[team] || TEAM[0], wave = k => Math.sin(now / 260 + k * 0.9 + team * 2);
    const top = sy - POLE_TOP, w = 30, h = 17;                                                  // the banner, waving a little
    ctx.fillStyle = ROPE_DARK; ctx.fillRect(sx - 1, top - 1, 3, 4);
    ctx.beginPath(); ctx.moveTo(sx + 1, top);
    for (let i = 0; i <= 6; i++) ctx.lineTo(sx + 2 + i * w / 6, top + wave(i) * 2);
    for (let i = 6; i >= 0; i--) ctx.lineTo(sx + 2 + i * w / 6, top + h + wave(i) * 2);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(30,20,12,.7)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = TEAM_LIGHT[team] || TEAM_LIGHT[0]; ctx.fillRect(sx + 2, top + 2 + wave(0) * 2, w * 0.9, 2);
    ctx.font = '700 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2.6;
    const label = String(info ? info.score : 0), lx = sx + 2 + w * 0.5, ly = top + h * 0.56 + wave(3) * 2;
    ctx.strokeText(label, lx, ly); ctx.fillText(label, lx, ly);
    if (info && info.steal > 0) {                                                               // somebody is untying a sheep: how far they have got
      const bw = 48, bx = Math.round(sx - bw / 2), by = Math.round(top - 16);
      ctx.fillStyle = 'rgba(20,14,8,.78)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 9);
      ctx.fillStyle = '#ffb04a'; ctx.fillRect(bx, by, Math.round(bw * Math.min(1, info.steal)), 5);
    }
  }
  /** Where a rope tied to the pole is fastened (screen). */
  const poleRing = (sx, sy) => ({ x: sx, y: sy - RING });

  /** A few wild flowers on the grass. */
  function flowers(ctx, sx, sy, v, now) {
    const cols = [['#fff6e0', '#ffd23f'], ['#ff9ec4', '#fff2a0'], ['#ffe066', '#e08a1e'], ['#a8c8ff', '#fff6e0']][(v | 0) & 3];
    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * 7 + ((v * 5 + i * 3) % 4) - 2, dy = (i % 2 ? 3 : -2), sway = Math.sin(now / 700 + sx * 0.05 + i) * 0.8, h = 7 + ((v + i) % 3) * 2;
      ctx.fillStyle = '#4f8a3a'; ctx.fillRect(Math.round(sx + dx), Math.round(sy + dy - h), 1, h);
      ctx.fillStyle = cols[0]; ctx.fillRect(Math.round(sx + dx - 2 + sway), Math.round(sy + dy - h - 2), 5, 3); ctx.fillRect(Math.round(sx + dx - 1 + sway), Math.round(sy + dy - h - 3), 3, 5);
      ctx.fillStyle = cols[1]; ctx.fillRect(Math.round(sx + dx - 1 + sway), Math.round(sy + dy - h - 1), 2, 2);
    }
  }

  /** A rope from (ax, ay) to (bx, by) on screen: braided, dark outlined, sagging unless pulled tight; the side's colour in a light strand. */
  function rope(ctx, ax, ay, bx, by, team, taut) {
    const sag = taut ? 0 : 5 + Math.hypot(bx - ax, by - ay) * 0.1, mx = (ax + bx) / 2, my = Math.max(ay, by) + sag - (taut ? 0 : 0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = ROPE_DARK; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, taut ? (ay + by) / 2 : my, bx, by); ctx.stroke();
    ctx.strokeStyle = taut ? '#e6cf9a' : '#b58a52'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.strokeStyle = TEAM_LIGHT[team] || '#f0e0b0'; ctx.lineWidth = 0.9; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineCap = 'butt';
  }

  /** A ring on the ground in a side's colour (under a sheep or a person that belongs to it). */
  function ring(ctx, sx, sy, rx, ry, team, alpha = 0.9) {
    ctx.strokeStyle = TEAM[team] || '#fff'; ctx.globalAlpha = alpha; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(sx, sy + 1, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }

  return { fence, sign, pole, poleRing, flowers, rope, ring, TEAM, POLE_TOP };
})();
