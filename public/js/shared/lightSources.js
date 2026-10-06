'use strict';
/* SHARED - everything that gives light: campfires you built and torches people hold. Used by the renderer (to cut
 * pools of light out of the night) and by the spiders (who will not walk into the light). */
const LightSources = {
  /** [{ x, y, radius }] in tiles. `players` is any { x, y, held } list. */
  collect(map, players) {
    const L = CONFIG.sim.light, out = [];
    for (const key of Object.keys(map.built)) {
      if (map.built[key].c === 'campfire') out.push({ x: keyTileX(key) + 0.5, y: keyTileY(key) + 0.5, radius: L.campfireRadius, kind: 'campfire' });
    }
    for (const p of players) if (p.held === 'torch') out.push({ x: p.x, y: p.y, radius: L.torchRadius, kind: 'torch' });
    return out;
  },
  /** Inside a light's reach? `slack` < 1 means "well inside", not just at the faint edge. */
  isLit(sources, x, y, slack = 0.9) { return sources.some(s => Math.hypot(s.x - x, s.y - y) <= s.radius * slack); },
  nearest(sources, x, y) {
    let best = null, bd = Infinity;
    for (const s of sources) { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = s; } }
    return best;
  },
  /** Is it dark out? (night, ignoring local light) */
  isDark(tick) { return DayCycle.daylight(DayCycle.hourAt(tick)) < CONFIG.sim.light.darkBelow; }
};
