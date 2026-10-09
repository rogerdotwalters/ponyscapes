'use strict';
/* CLIENT - how a character holds and swings each kind of tool, and the coded arm that does it. No arm pictures are needed: every character's arm is
 * drawn in code (chunky pixels in the sleeve and skin colours of the character) from the shoulder to a hand position, so the same few key poses
 * serve the prince, the princess and every outfit. The baked arm on the working side is left out of the character's frame (pixelCharacter.js,
 * anim.hideArm), and this arm takes its place.
 *
 * A POSE is where the hand is and how the tool points, relative to the shoulder and the way the character faces (on screen):
 *   a     the tool's elevation from the facing direction, in degrees: 0 points straight ahead, 90 straight up, -90 straight down, 180 behind
 *   r     how far ahead of the shoulder the hand is (screen pixels, along the facing direction);  h  how far below it (negative: above the shoulder)
 *   lat   sideways, across the body;   open  shears / cutters open (0..1);   tilt  a watering can tipped (0..1)
 * Each tool has three KEY poses: carry (idle), wind (drawn back) and hit (the instant of impact). A swing goes carry -> wind -> hit (landing exactly
 * on the tool's impactTime, when the server applies the effect) -> follow through -> back to carry. */
const ToolPose = (() => {
  const K = (a, r, h, lat = 0, open = 0, tilt = 0) => ({ a, r, h, lat, open, tilt });
  /** carry, wind, hit for each tool kind (tool.kind in data/items/tools.js and weapons.js). */
  const KEYS = {
    axe:    [K(60, 7, 8),  K(155, -2, -9),  K(-45, 11, 6)],              // overhead chop: head raised behind, brought down in front
    hammer: [K(60, 7, 8),  K(145, -1, -8),  K(-50, 11, 7)],
    shovel: [K(65, 6, 8),  K(108, 1, -5),   K(-72, 10, 9)],              // dig: raised, then driven down
    hoe:    [K(60, 7, 8),  K(128, 0, -8),   K(-32, 11, 8)],              // raised, then pulled down and in
    knife:  [K(20, 8, 8),  K(28, 2, 6),     K(-4, 14, 5)],               // a short stab
    spear:  [K(72, 7, 6),  K(14, 0, 3),     K(2, 14, 3)],                // a long thrust
    sword:  [K(50, 8, 8),  K(135, 0, -6, -5), K(-22, 12, 6, 5)],         // a slash across the body
    sickle: [K(35, 8, 9),  K(28, 3, 6, -6), K(26, 12, 6, 6)],            // a sweep
    hedge:  [K(40, 8, 8),  K(22, 6, 4, 0, 1), K(18, 13, 4, 0, 0)],       // open, then snip shut
    rod:    [K(75, 6, 8),  K(155, -1, -6),  K(32, 11, 2)],               // a cast: back over the shoulder, flicked forward
    brush:  [K(40, 7, 8),  K(-20, 5, 9),    K(-24, 13, 9)],              // a stroke along the pony
    shears: [K(35, 8, 8),  K(32, 10, 6, 0, 1), K(32, 11, 6, 0, 0)],
    water:  [K(0, 6, 10),  K(0, 8, 8, 0, 0, 0.35), K(0, 10, 6, 0, 0, 0.85)],   // tip the can to pour
    bow:    [K(0, 12, 2),  K(0, 12, 2),     K(0, 12, 2)],                // the bow arm stays out straight (the string is drawn back)
    leash:  [K(20, 7, 9),  K(85, 2, -10),   K(5, 14, -2)],               // the lasso swung overhead, then thrown
    torch:  [K(88, 5, -3), K(88, 5, -3),    K(88, 5, -3)],
    item:   [K(55, 7, 8),  K(80, 5, 4),     K(40, 9, 6)],                // anything else with a held picture
  };
  const smooth = t => t * t * (3 - 2 * t), clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
  const mixPose = (p, q, t) => ({ a: p.a + (q.a - p.a) * t, r: p.r + (q.r - p.r) * t, h: p.h + (q.h - p.h) * t, lat: p.lat + (q.lat - p.lat) * t, open: p.open + (q.open - p.open) * t, tilt: p.tilt + (q.tilt - p.tilt) * t });

  /** The pose `kind` is in: swingT (seconds left of the swing, 0 when idle), tool { swingTime, impactTime } (null for a plain held item). */
  function sample(kind, swingT, tool) {
    const [carry, wind, hit] = KEYS[kind] || KEYS.item;
    if (!(swingT > 0) || !tool) return mixPose(carry, carry, 0);
    const u = clamp01(1 - swingT / tool.swingTime), impact = clamp01(tool.impactTime / tool.swingTime), draw = Math.max(0.06, impact * 0.55);
    if (u < draw) return mixPose(carry, wind, smooth(u / draw));                                         // draw back (anticipation)
    if (u < impact) { const t = (u - draw) / Math.max(1e-3, impact - draw); return mixPose(wind, hit, 1 - Math.pow(1 - t, 3)); }   // the strike: fast, landing at the impact
    return mixPose(hit, carry, smooth(clamp01(((u - impact) / Math.max(1e-3, 1 - impact) - 0.3) / 0.7)));   // hold the follow-through a moment, then return
  }

  /** Where everything is, on screen. `pose` is a PlayerSprite pose (ux, uy: the facing as a unit screen vector; torsoTop), sx the character's centre. */
  function rig(kind, sample, sx, pose, view) {
    const fx = pose.ux, fy = pose.uy, side = fx >= 0 ? 1 : -1;
    const sideView = view === 'left' || view === 'right';
    const S = [sx + (sideView ? 0 : side * 6.2), pose.torsoTop - 1.5];                                   // the shoulder (the near arm in a side view)
    const pfx = -fy * side, pfy = fx * side;                                                            // across the body
    const H = [S[0] + fx * sample.r + pfx * sample.lat, S[1] + fy * sample.r * 0.55 + sample.h + pfy * sample.lat * 0.5];   // (depth is squashed on screen)
    const rad = sample.a * Math.PI / 180, dx = fx * Math.cos(rad), dy = fy * 0.5 * Math.cos(rad) - Math.sin(rad);   // (the ground is seen at a slant: toward / away from the camera is squashed to half)
    const len = Math.hypot(dx, dy) || 1;
    return { side, S, H, dir: [dx / len, dy / len], perp: [-dy / len * side, dx / len * side], f: [fx, fy], shorten: Math.max(0.5, Math.min(1, len)) };   // (shorten: a tool pointing at the camera looks shorter)
  }

  /** The elbow of a two-bone arm from S to H (each bone `bone` long): it bends downwards, away from the body. */
  function elbow(S, H, bone) {
    let dx = H[0] - S[0], dy = H[1] - S[1], d = Math.hypot(dx, dy);
    const reach = bone * 2 - 0.5;
    if (d > reach) { H = [S[0] + dx / d * reach, S[1] + dy / d * reach]; dx = H[0] - S[0]; dy = H[1] - S[1]; d = reach; }
    const a = d / 2, h = Math.sqrt(Math.max(0, bone * bone - a * a)), mx = S[0] + dx / 2, my = S[1] + dy / 2, nx = -dy / (d || 1), ny = dx / (d || 1);
    const e1 = [mx + nx * h, my + ny * h], e2 = [mx - nx * h, my - ny * h];
    return { E: e1[1] > e2[1] ? e1 : e2, H };
  }

  /** The arm, in chunky pixels on the character's own 1.3 px art grid: a sleeve (or bare skin) from the shoulder to the elbow to the wrist, a cuff and a hand,
   *  ink all round. `look`: PixelCharacter.armLook(). gridX / gridY: the art grid's origin (the figure's top left). */
  function drawArm(ctx, look, S, H, gridX, gridY, px) {
    const { E, H: hand } = elbow(S, H, 7.2), cells = new Map();
    const cell = (x, y, kind) => cells.set(Math.floor((x - gridX) / px) + ',' + Math.floor((y - gridY) / px), kind);
    const trace = (A, B, kindAt) => {
      const n = Math.max(2, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / (px * 0.5)));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t, k = kindAt(t), steep = Math.abs(B[1] - A[1]) >= Math.abs(B[0] - A[0]);
        cell(x, y, k); if (steep) cell(x + px, y, k === 'lit' ? 'sleeve' : k); else cell(x, y + px, k === 'lit' ? 'sleeve' : k);   // two pixels thick
      }
    };
    trace(S, E, t => (look.bare ? 'skin' : t < 0.12 ? 'lit' : 'sleeve'));
    trace(E, hand, t => (t > 0.86 ? 'hand' : t > 0.7 ? (look.bare ? 'skin' : 'cuff') : look.bare ? 'skin' : 'sleeve'));
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cell(hand[0] + dx * px - px / 2, hand[1] + dy * px - px / 2, 'hand');   // the hand: a 2 x 2 block
    const col = { sleeve: look.sleeve.b, lit: look.sleeve.l, cuff: look.cuff, skin: look.skin.b, hand: look.skin.b };
    const rect = (gx, gy, c) => { ctx.fillStyle = c; const x0 = Math.round(gridX + gx * px), y0 = Math.round(gridY + gy * px); ctx.fillRect(x0, y0, Math.round(gridX + (gx + 1) * px) - x0, Math.round(gridY + (gy + 1) * px) - y0); };
    for (const key of cells.keys()) {                                                                  // ink first, under everything ...
      const [gx, gy] = key.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cells.has((gx + dx) + ',' + (gy + dy))) rect(gx + dx, gy + dy, look.outline);
    }
    for (const [key, k] of cells) { const [gx, gy] = key.split(',').map(Number); rect(gx, gy, k === 'sleeve' && (gx + gy) % 5 === 0 ? look.sleeve.d : col[k]); }   // ... then the arm
  }

  return { KEYS, sample, rig, elbow, drawArm };
})();
