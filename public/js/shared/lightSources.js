'use strict';
/* SHARED - everything that gives light: campfires you built and torches people hold. Used by the renderer (to cut
 * pools of light out of the night) and by the spiders (who will not walk into the light). */
const LightSources = {
  /** [{ x, y, radius }] in tiles. `players` is any { x, y, held } list; `animals` (optional, any { x, y, type, look } map) adds ponies with
   *  a Night Light, which only glow while `dark`. */
  collect(map, players, animals = null, dark = false) {
    const L = CONFIG.sim.light, out = [];
    for (const key of Object.keys(map.built)) {
      if (map.built[key].c === 'campfire') out.push({ x: keyTileX(key) + 0.5, y: keyTileY(key) + 0.5, radius: L.campfireRadius, kind: 'campfire' });
    }
    const here = e => gridOf(e) === (map.grid || '');                 // only what is on this map's grid gives it light
    for (const p of players) if (p.held === 'torch' && here(p)) out.push({ x: p.x, y: p.y, radius: L.torchRadius, kind: 'torch' });
    if (animals && dark) for (const id in animals) {
      const a = animals[id];
      if (!a.look || !here(a)) continue;
      const glow = PonyRarity.of(a.look, a.type).abilities.find(ab => ab.passive);
      const light = glow && glow.effectDefs.find(e => e.kind === 'light');
      if (light) out.push({ x: a.x, y: a.y, radius: light.radius, kind: 'pony' });
    }
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
