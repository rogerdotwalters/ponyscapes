'use strict';
/* CLIENT - coins with FULL 3D rotation (coin-rotation-demo.html shows it off; the coin bag, coinBagUI.js, uses it for every coin). A coin's orientation is a unit
 * quaternion o = [w, x, y, z]; its matrix R turns the coin, a disc in its local xy plane facing +z (towards the viewer), to any pitch, yaw and roll at once. On screen the
 * disc's two in-plane axes become the columns of R's top-left 2x2 (an affine map of the pixel face), and its normal (R02, R12, R22) says which way it faces: R22 > 0
 * shows the front, R22 < 0 the back (the same art, mirrored), and (R02, R12) is the direction the thickness leans, so the reeded edge shows as it turns edge-on.
 *   CoinSpin.spin(o, w, dt)      turn o by the angular velocity w ([x, y, z] rad/s about the screen axes) for dt seconds
 *   CoinSpin.settle(o, rate, dt) ease o towards lying flat, front or back, whichever is nearer (keeping its roll)
 *   CoinSpin.draw(g, x, y, r, tier, o, lifted)  draw the coin at (x, y) with radius r into g, whole pixels (for a low-resolution canvas)
 *   CoinSpin.blit(...)  the same, rendered at 1 art pixel per pixel and scaled up crisp, for a canvas that is already scaled (the coin bag) */
const CoinSpin = (() => {
  const mul = (a, b) => [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3], a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2], a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1], a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; };
  const IDENTITY = () => [1, 0, 0, 0];
  const spin = (o, w, dt) => { const m = Math.hypot(w[0], w[1], w[2]); if (m * dt < 1e-9) return o; const h = m * dt / 2, s = Math.sin(h) / m; return norm(mul([Math.cos(h), w[0] * s, w[1] * s, w[2] * s], o)); };
  const mat = a => { const [w, x, y, z] = a; return [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]; };
  /** A random orientation (uniform). */
  const random = () => { const u = Math.random(), a = Math.random() * 6.2832, b = Math.random() * 6.2832; return [Math.sqrt(1 - u) * Math.sin(a), Math.sqrt(1 - u) * Math.cos(a), Math.sqrt(u) * Math.sin(b), Math.sqrt(u) * Math.cos(b)]; };
  /** How far the coin's normal is from facing the viewer: R22 (1 = face on, 0 = edge on, -1 = back). */
  const facing = o => mat(o)[2][2];
  const settle = (o, rate, dt) => {
    const R = mat(o), nx = R[0][2], ny = R[1][2], nz = R[2][2], s = nz >= 0 ? 1 : -1, sin = Math.hypot(nx, ny);
    if (sin < 1e-4) return o;
    const ang = Math.acos(Math.min(1, Math.abs(nz))), k = ang * Math.min(1, rate * dt) / sin / Math.max(dt, 1e-6);       // (axis n x target, as a rate)
    return spin(o, [ny * s * k, -nx * s * k, 0], dt);
  };

  const meta = tier => (tier !== null && typeof tier === 'object' ? PonyCoinArt.metal(tier.pony) : Coins.TIERS[tier]);
  const memo = new Map();
  /** The flat face of a coin: the game's own coin painter (coinArt.js), cropped to just the disc (no edge underneath), made once per kind and radius. */
  function texture(tier, r) {
    const key = (typeof tier === 'object' ? 'p' + tier.pony : tier) + ':' + r; let t = memo.get(key); if (t) return t;
    const size = 2 * r + 8, c = document.createElement('canvas'), g = c.getContext('2d'); c.width = c.height = size; g.imageSmoothingEnabled = false;
    const th = Math.max(2, Math.round(r * 0.3)), cx = size / 2, cy = size / 2 + Math.round(th / 2);
    CoinArt.draw(g, cx, cy, r, 1, tier);                                                                // (it draws the face at y - th/2 and the edge below)
    t = document.createElement('canvas'); t.width = t.height = 2 * r + 2; const o = t.getContext('2d'); o.imageSmoothingEnabled = false;
    o.beginPath(); o.arc(r + 1, r + 1, r + 1, 0, Math.PI * 2); o.clip();
    o.drawImage(c, -(cx - r - 1), -(cy - Math.round(th / 2) - r - 1)); memo.set(key, t); return t;
  }

  function draw(g, x, y, r, tier, orient, lifted = false) {
    r = Math.round(r); const R = mat(orient), T = meta(tier), tex = texture(tier, r), th = r * 0.34, nx = R[0][2], ny = R[1][2], nz = R[2][2], front = nz >= 0, N = 8, sgn = front ? 1 : -1;
    const ax = R[0][0], ay = R[1][0], bx = R[0][1], by = R[1][1];                                       // the disc's two axes on screen
    g.imageSmoothingEnabled = false;
    const disc = (ox, oy, color) => { g.save(); g.transform(ax * r, ay * r, bx * r, by * r, x + ox, y + oy); g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.restore(); };
    for (let k = 0; k <= N; k++) { const t = (k / N - 0.5) * sgn; disc(nx * t * th, ny * t * th, k % 2 ? T.edge[1] : T.edge[0]); }      // the thickness: discs from the far face to the near one
    g.save(); g.transform(ax, ay, bx, by, x + nx * 0.5 * th * sgn, y + ny * 0.5 * th * sgn); g.drawImage(tex, -r - 1, -r - 1);                    // the visible face on the near side
    const light = Math.max(0, (-nx * 0.5 - ny * 0.6 + nz * 0.62) * sgn), dim = lifted ? 0 : 0.04 + 0.34 * (1 - Math.min(1, light));                // lit from the top left
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(20,10,0,${dim.toFixed(2)})`; g.fillRect(-r - 1, -r - 1, 2 * r + 2, 2 * r + 2);
    g.globalCompositeOperation = 'source-over';
    if (light > 0.82) { g.fillStyle = `rgba(255,251,224,${Math.min(1, (light - 0.82) * 3).toFixed(2)})`; g.fillRect(-r * 0.55, -r * 0.55, 3, 2); }     // a glint when it catches the light
    g.restore();
  }

  let scratch = null;
  /** draw() into a small canvas at 1 pixel per art pixel, then scaled onto g (smoothing off), so the rotated edges stay chunky pixels at any zoom. `holder` (any object,
   *  e.g. the coin) keeps the finished sprite while the orientation has not changed (to 3 places), so a heap of coins lying still costs almost nothing to draw. */
  function blit(g, x, y, r, tier, orient, lifted = false, holder = null) {
    r = Math.round(r); const half = r + Math.ceil(r * 0.34) + 3, size = half * 2, key = orient.map(v => Math.round(v * 1000)).join() + (lifted ? 'L' : '');
    let src = holder && holder._spr && holder._sprKey === key ? holder._spr : null;
    if (!src) {
      if (!scratch) scratch = document.createElement('canvas');
      src = holder ? (holder._spr && holder._spr.width === size ? holder._spr : (holder._spr = document.createElement('canvas'))) : scratch;
      if (src.width !== size) src.width = src.height = size;
      if (scratch === src && scratch.width < size) scratch.width = scratch.height = size;
      const s = src.getContext('2d'); s.setTransform(1, 0, 0, 1, 0, 0); s.clearRect(0, 0, size, size);
      draw(s, half, half, r, tier, orient, lifted); if (holder) holder._sprKey = key;
    }
    g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, size, size, Math.round(x) - half, Math.round(y) - half, size, size);
  }
  return { spin, settle, random, facing, mat, mul, norm, identity: IDENTITY, texture, draw, blit };
})();
