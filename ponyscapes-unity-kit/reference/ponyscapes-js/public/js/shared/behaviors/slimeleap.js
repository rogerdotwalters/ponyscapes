'use strict';
/* BEHAVIOUR - slimeleap: a green slime. It oozes after you like any territorial creature (and hunts across a whole dungeon room when it is one of the Warren's wave), but from a few
 * tiles away it SQUATS (state 'windup', half a second, a small red ring on the floor where you stand), LEAPS at that spot (state 'jump', a short hop with lift 0..1 for the client's arc)
 * and splashes down (hurting whoever is still within `radius` of it: step aside and it lands harmlessly), then catches its breath (state 'slam'). The data's `leap` block:
 * { cooldown, windup, flight, recover, range, minRange, radius, damage }. The cooldown is rolled a little different each time, so a crowd does not all jump together. */
Behaviors.register(Object.assign({}, Behaviors.get('territorial'), {
  id: 'slimeleap',
  think(sys, a, def, humans, dt) {
    const L = def.leap;
    a.attackT = Math.max(0, a.attackT - dt); a.aggroT = Math.max(0, (a.aggroT || 0) - dt); a.leapT = Math.max(0, (a.leapT === undefined ? 1 + sys.rng() * 2 : a.leapT) - dt);
    a.jumpLift = 0;
    if (a.leapPhase === 'windup') {
      sys._steerAlong(a, 0, 0, 0); a.state = 'windup'; a.leapPhaseT -= dt;
      if (a.leapPhaseT <= 0) { a.leapPhase = 'jump'; a.leapPhaseT = L.flight; a.jumpFrom = { x: a.x, y: a.y }; }
      return;
    }
    if (a.leapPhase === 'jump') {
      a.state = 'jump'; a.leapPhaseT -= dt;
      const t = clamp(1 - a.leapPhaseT / L.flight, 0, 1), from = a.jumpFrom, to = a.jumpTo;
      a.x = from.x + (to.x - from.x) * t; a.y = from.y + (to.y - from.y) * t; a.vx = (to.x - from.x) / L.flight; a.vy = (to.y - from.y) / L.flight; a.tvx = a.tvy = 0;
      a.jumpLift = 0.55 * Math.sin(t * Math.PI);                                                              // (a hop, not the king's leap)
      if (a.leapPhaseT <= 0) this.land(sys, a, def, humans);
      return;
    }
    if (a.leapPhase === 'recover') {
      sys._steerAlong(a, 0, 0, 0); a.state = 'slam'; a.leapPhaseT -= dt;
      if (a.leapPhaseT <= 0) a.leapPhase = '';
      return;
    }
    const found = this.pickTarget(sys, a, def, humans);
    if (!found) { if (a.state === 'chase') { a.state = 'idle'; a.timer = 1; } sys._wander(a, def, dt); return; }
    a.aggroT = 6;
    if (a.leapT <= 0 && found.dist >= L.minRange && found.dist <= L.range) { this.start(sys, a, def, found.target); return; }
    this.attack(sys, a, def, found.target, found.dist);
  },
  start(sys, a, def, target) {
    const L = def.leap;
    a.leapPhase = 'windup'; a.leapPhaseT = L.windup; a.leapT = L.cooldown * (0.7 + 0.6 * sys.rng());
    a.jumpTo = { x: target.x, y: target.y }; a.facing = Math.atan2(target.y - a.y, target.x - a.x);
    sys.emit({ type: 'slimeWindup', x: target.x, y: target.y, r: L.radius, seconds: L.windup + L.flight });
  },
  land(sys, a, def, humans) {
    const L = def.leap;
    a.x = a.jumpTo.x; a.y = a.jumpTo.y; a.vx = a.vy = 0; a.leapPhase = 'recover'; a.leapPhaseT = L.recover; a.state = 'slam';
    for (const h of humans) if (h.hp > 0 && Math.hypot(h.x - a.x, h.y - a.y) <= L.radius) sys.damagePlayer(h.id, L.damage * AnimalLevels.damageFactor(a.level));
    sys.emit({ type: 'slimeLand', x: a.x, y: a.y });
  }
}));
