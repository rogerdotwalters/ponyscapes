'use strict';
/* BEHAVIOUR - territorial: minds its own business (wanders) until someone comes too close, then attacks until they get well away. Sneaking
 * past is safer than running past. Bears. */
const TERRITORY_STANCE = { idle: 0.6, walk: 1, run: 1, row: 0.8 };                  // (everyone moves at full speed: standing still is the only quiet)
Behaviors.register(Object.assign({}, Behaviors.get('predator'), {
  id: 'territorial',
  range(a, def, h) { if (a.wave) return 90; const base = def.aggro || def.hunt, stance = TERRITORY_STANCE[h.state] || 1; return a.aggroT > 0 ? base * 2 : base * stance; },
  think(sys, a, def, humans, dt) {
    a.aggroT = Math.max(0, (a.aggroT || 0) - dt);
    a.attackT = Math.max(0, a.attackT - dt);
    const found = this.pickTarget(sys, a, def, humans);
    if (!found) { if (a.state === 'chase') { a.state = 'idle'; a.timer = 1; } sys._wander(a, def, dt); return; }
    a.aggroT = 6;                                                                       // once provoked it stays angry for a while
    this.attack(sys, a, def, found.target, found.dist);
  }
}));
