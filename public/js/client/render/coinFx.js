'use strict';
/* CLIENT - the physics of coins lying in the world (drawn by renderer.js _drawCoinPile, with the same pixel coins as the coin bag). Purely visual: the server only knows the
 * pile. A new pile makes up to 8 little coins that start in the thrower's hand (or high above the pile if nobody threw it), fly in an arc towards the pile's spot, bounce on the
 * ground (losing a little height each time), tumble while they move, roll on with friction and lie flat. World units are tiles; height is in screen pixels.
 *   CoinFx.make(drop, thrower | null, animate, nowMs) -> sim    CoinFx.step(sim, nowMs)    sim.coins: [{ x, y, z, f (0.5..0.9: how squashed it looks) }] */
const CoinFx = (() => {
  const G = 1100, BOUNCE = 0.5, ROLL = 5, MAX = 8, MAX_ITEM = 3;
  const isCoin = item => Coins.isCoin(item) || PonyCoins.varietyOf(item) !== null;
  const tierOf = item => (Coins.isCoin(item) ? Coins.tierOf(item) : { pony: PonyCoins.varietyOf(item) });
  const radius = item => (Coins.isCoin(item) ? 5 + 0.32 * Coins.tierOf(item) : 7);
  const seeded = n => { let h = (n * 374761393) | 0; return () => { h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }; };
  /** Where coin i of n rests: a loose scatter round the pile's spot (the same every frame, so a settled pile never shuffles). */
  function spot(d, i, n, rnd) { const a = i * 2.4 + rnd() * 0.6, rr = n === 1 ? 0 : 0.09 + 0.05 * Math.sqrt(i) + rnd() * 0.04; return [d.x + Math.cos(a) * rr, d.y + Math.sin(a) * rr]; }
  const maxOf = d => (isCoin(d.item) ? MAX : MAX_ITEM);
  function make(d, thrower, animate, now) {
    const item = !isCoin(d.item), n = Math.min(maxOf(d), Math.max(1, d.count | 0)), rnd = seeded(parseInt(d.id.slice(1), 10) || 1), coins = [];
    for (let i = 0; i < n; i++) {
      const [tx, ty] = spot(d, i, n, rnd);
      if (!animate) { coins.push({ x: tx, y: ty, z: 0, vx: 0, vy: 0, vz: 0, f: item ? 1 : 0.8, rot: 0, flip: 0, rest: true, wait: 0, tx, ty }); continue; }
      const ox = thrower ? thrower.x : tx, oy = thrower ? thrower.y : ty, z0 = thrower ? 24 : 80 + rnd() * 20, vz0 = thrower ? 150 + rnd() * 70 : 0;
      const dist = Math.hypot(tx - ox, ty - oy), fly = (vz0 + Math.sqrt(vz0 * vz0 + 2 * G * z0)) / G, sp = dist / (fly + 0.6 / ROLL * 2.2);   // (it lands a bit short and rolls the rest)
      const ang = Math.atan2(ty - oy, tx - ox);
      coins.push({ x: ox, y: oy, z: z0, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: vz0, f: item ? 1 : 0.9, rot: 0, flip: rnd() * 6, spin: 14 + rnd() * 10, rest: false, wait: i * 0.045, tx, ty });
    }
    return { coins, count: d.count, last: now, rest: !animate, item };
  }
  /** The pile grew or shrank (more coins dropped on it, a few picked up): the new coins just lie there. */
  function resize(sim, d) {
    const n = Math.min(maxOf(d), Math.max(1, d.count | 0)), rnd = seeded((parseInt(d.id.slice(1), 10) || 1) + 7);
    while (sim.coins.length > n) sim.coins.pop();
    while (sim.coins.length < n) { const [tx, ty] = spot(d, sim.coins.length, n, rnd); sim.coins.push({ x: tx, y: ty, z: 0, vx: 0, vy: 0, vz: 0, f: sim.item ? 1 : 0.8, rot: 0, flip: 0, rest: true, wait: 0, tx, ty }); }
    sim.count = d.count;
  }
  function step(sim, now) {
    if (sim.rest) return;
    let dt = Math.min(0.1, Math.max(0, (now - sim.last) / 1000)); sim.last = now;
    let moving = false;
    for (const c of sim.coins) {
      if (c.rest) continue;
      moving = true;
      if (c.wait > 0) { c.wait -= dt; c.hidden = true; continue; }
      c.hidden = false;
      for (let left = dt; left > 0; left -= 1 / 120) {
        const h = Math.min(left, 1 / 120);
        c.x += c.vx * h; c.y += c.vy * h; c.vz -= G * h; c.z += c.vz * h;
        if (c.z <= 0) {                                                                         // hit the ground: lose most of the fall, keep rolling
          c.z = 0;
          if (Math.abs(c.vz) > 70) { c.vz = -c.vz * BOUNCE; c.vx *= 0.8; c.vy *= 0.8; c.spin *= sim.item ? 0.7 : 0.8; } else c.vz = 0;
        }
        if (c.z === 0 && c.vz === 0) {                                                           // rolling on the ground
          const k = Math.exp(-ROLL * h); c.vx *= k; c.vy *= k; c.spin *= Math.exp(-3 * h);
          if (Math.hypot(c.vx, c.vy) < 0.05 && c.spin < 1.5) { c.rest = true; c.vx = c.vy = 0; break; }
        }
        c.flip += c.spin * h;
      }
      if (sim.item) { c.f = 1; c.rot = c.rest ? 0 : Math.sin(c.flip) * 0.5 * Math.min(1, c.spin / 8); } else c.f = c.rest ? 0.8 : 0.5 + 0.4 * Math.abs(Math.cos(c.flip));                              // tumbling it is thin, flat once it stops
    }
    if (!moving) sim.rest = true;
  }
  return { isCoin, tierOf, radius, make, resize, step };
})();
