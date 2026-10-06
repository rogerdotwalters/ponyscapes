'use strict';
/* SHARED - how fast a pony is and how it grows. Client and server both use these (the rider's speed is predicted on the client).
 *
 *   SPEED   every pony kind has a baseSpeed (tiles / second at full gallop, level 1). Its level scales that by CONFIG.sim.ponySpeed.curve, a list of
 *           [level, multiplier] points (editable in editor.html > Settings). You ride at that speed; a wild pony flees at wildFleeFactor of it. So to
 *           catch a pegasus you must first raise your own pony until it is faster than the pegasus you are after.
 *   LEVELS  ponies you own gain XP from the distance you ride, from what you do in the saddle, from food you feed them and from grooming. */
const PonySpeed = {
  /** The curve's multiplier at a level (straight lines between the points; flat beyond the ends). */
  factor(level) {
    const pts = (CONFIG.sim.ponySpeed.curve || [[1, 1]]).slice().sort((a, b) => a[0] - b[0]), L = level || 1;
    if (L <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (L <= pts[i][0]) { const [l0, m0] = pts[i - 1], [l1, m1] = pts[i]; return m0 + (m1 - m0) * (L - l0) / Math.max(1e-9, l1 - l0); }
    return pts[pts.length - 1][1];
  },
  base(type) { const d = AnimalDefs[type]; return (d && d.baseSpeed) || CONFIG.sim.ponySpeed.defaultBase; },
  /** Full gallop, tiles / second. */
  top(type, level) { return PonySpeed.base(type) * PonySpeed.factor(level); },
  /** Ridden: { walk, run }. */
  ride(type, level) { const run = PonySpeed.top(type, level); return { walk: run * CONFIG.sim.ponySpeed.walkFraction, run }; },
  /** How fast a WILD pony of this kind and level runs away. */
  flee(type, level) { return PonySpeed.top(type, level) * CONFIG.sim.ponySpeed.wildFleeFactor; }
};

const PonyXp = {
  /** Total XP for a level. */
  xpFor(level) { const L = CONFIG.sim.ponyLeveling; return Math.round(L.xpBase * Math.pow(Math.max(0, (level || 1) - 1), L.xpExponent)); },
  levelFor(xp) { let l = 1; while (l < CONFIG.sim.levels.max && xp >= PonyXp.xpFor(l + 1)) l++; return l; },
  /** { level, into, need, fraction } for an animal (a tamed pony that has never earned XP starts at the bottom of its level). */
  progress(a) {
    const xp = Number.isFinite(a.xp) ? a.xp : PonyXp.xpFor(a.level), level = a.level || 1, base = PonyXp.xpFor(level), next = PonyXp.xpFor(level + 1);
    return { level, into: Math.max(0, Math.round(xp - base)), need: next - base, fraction: clamp((xp - base) / Math.max(1, next - base), 0, 1) };
  }
};
