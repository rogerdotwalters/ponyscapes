'use strict';
/* BEHAVIOUR - nocturnal: it RUNS from torches and campfires at any hour (a bolder, higher-level one keeps less distance); by day it skitters about like
 * any wild animal; at night it hunts anyone standing outside the light. Spiders, bats, centipedes. */
Behaviors.register({
  id: 'nocturnal',
  think(sys, a, def, humans, dt) {
    if (this.fleeLight(sys, a, def, dt)) return;
    if (LightSources.isDark(sys.getTick())) { this.huntInDark(sys, a, def, humans, dt); return; }
    Behaviors.get('timid').think(sys, a, def, humans, dt);
  },
  fleeLight(sys, a, def, dt) {
    const lights = sys.getLights(), margin = Math.max(0, 3 - 0.12 * ((a.level || 1) - 1));
    let source = null, worst = 0;
    for (const s of lights) {
      const fear = s.radius + margin, depth = fear - Math.hypot(a.x - s.x, a.y - s.y);          // how far inside its fear zone it is
      if (depth > worst) { worst = depth; source = s; }
    }
    if (source) { a.state = 'flee'; a.lightFleeT = 1.4; a.fx = a.x - source.x; a.fy = a.y - source.y; a.attackT = Math.max(a.attackT, 0.5); }
    else if (!(a.lightFleeT > 0)) return false;
    else a.lightFleeT -= dt;
    sys._steerAlong(a, a.fx, a.fy, def.fleeSpeed * 1.6);                                    // it outruns what it would chase at
    return true;
  },
  /** Night: hunt the nearest person who is NOT standing in light; back away from any light we stumble into. */
  huntInDark(sys, a, def, humans, dt) {
    const lights = sys.getLights();
    a.attackT = Math.max(0, a.attackT - dt);
    if (LightSources.isLit(lights, a.x, a.y, 1.0)) { const source = LightSources.nearest(lights, a.x, a.y); a.state = 'flee'; sys._steerAlong(a, a.x - source.x, a.y - source.y, def.fleeSpeed); return; }
    let target = null, targetDist = Infinity;
    for (const h of humans) {
      if (h.hp <= 0 || LightSources.isLit(lights, h.x, h.y)) continue;
      const d = Math.hypot(h.x - a.x, h.y - a.y);
      if (d < def.hunt && d < targetDist) { target = h; targetDist = d; }
    }
    if (!target) { if (a.state === 'chase' || a.state === 'flee') { a.state = 'idle'; a.timer = 1; } sys._wander(a, def, dt); return; }
    Behaviors.get('predator').attack(sys, a, def, target, targetDist);
  }
});
