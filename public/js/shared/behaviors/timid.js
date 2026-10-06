'use strict';
/* BEHAVIOUR - timid: wander, come to food held out in a calm hand, bolt from anyone who notices you. Rabbits, deer, sheep, elk, wild ponies. */
Behaviors.register({
  id: 'timid',
  think(sys, a, def, humans, dt) {
    let threat = null, threatDist = Infinity, lured = null, luredDist = Infinity, luredBy = null;
    const trusting = (a.trustT = Math.max(0, (a.trustT || 0) - dt)) > 0;                   // it saw food a moment ago: only a charging player spooks it
    for (const h of humans) {
      const d = Math.hypot(h.x - a.x, h.y - a.y);
      const lure = lureFor(def, h.held, h.lv, h.buffs);
      if (lure && h.state !== 'run' && d < lure.radius) {                                      // food in a calm hand: come closer
        if (d < luredDist) { lured = h; luredDist = d; luredBy = lure; }
        continue;
      }
      if (a.isFriendOf(h.id) && h.state !== 'run') continue;                                 // a friend (one whole heart or more) does not make it bolt
      if (trusting && h.state !== 'run') continue;
      const notice = def.detect[STEALTH_KEY[h.state] || 'walk'];
      if (d < notice && d < threatDist) { threat = h; threatDist = d; }
    }
    if (threat) { a.state = 'flee'; a.fleeT = def.fleeSeconds; a.fx = a.x - threat.x; a.fy = a.y - threat.y; a.trustT = 0; }
    else if (lured && a.state !== 'flee') {
      a.state = 'lured'; a.trustT = luredBy.trust;
      sys._steerAlong(a, lured.x - a.x, lured.y - a.y, luredDist > LURE_STOP ? def.wanderSpeed * luredBy.approach : 0);
      return;
    }
    else if (trusting && a.state === 'lured') { sys._steerAlong(a, 0, 0, 0); return; }     // stand still and wait for you
    else if (a.state === 'flee' && (a.fleeT -= dt) <= 0) { a.state = 'idle'; a.timer = 1 + sys.rng() * 2; a.hurt = false; }
    else if (a.state === 'lured') { a.state = 'idle'; a.timer = 1.5; }

    const flee = def.pony ? PonySpeed.flee(a.type, a.level) : def.fleeSpeed;            // a wild pony runs at its kind's speed for its level: outrun it to catch it
    if (a.state === 'flee') { sys._steerAlong(a, a.fx, a.fy, flee * (a.hurt ? HURT_SPEED_FACTOR : 1)); return; }
    sys._wander(a, def, dt);
  }
});
