'use strict';
/* BEHAVIOUR - slimeking: hunts like a predator (oozes after the nearest living person and splashes on them), but every `slam.cooldown` seconds it picks a target at a distance and
 * JUMPS: squats for `windup` seconds (state 'windup', a red ring marks where it will land), flies to that spot over `flight` seconds (state 'jump', lift 0..1 for the client's arc),
 * lands (a 'slam' event) hurting everyone within `radius` (full damage at the middle, 40% at the rim, nothing for a rider in the air), then rests for `recover` seconds (state 'slam').
 * Below 2/3 and 1/3 of its health a landing also shakes loose `minions` small slimes. Its jump ignores walls on the way (it lands on the floor where its target stood). */
Behaviors.register(Object.assign({}, Behaviors.get('predator'), {
  id: 'slimeking',
  think(sys, a, def, humans, dt) {
    const S = def.slam;
    a.attackT = Math.max(0, a.attackT - dt); a.kingT = Math.max(0, (a.kingT || 0) - dt);
    a.jumpLift = 0;
    if (a.kingPhase === 'windup') {
      sys._steerAlong(a, 0, 0, 0); a.state = 'windup'; a.kingPhaseT -= dt;
      if (a.kingPhaseT <= 0) { a.kingPhase = 'jump'; a.kingPhaseT = S.flight; a.jumpFrom = { x: a.x, y: a.y }; sys.emit({ type: 'slimeLeap', x: a.x, y: a.y }); }
      return;
    }
    if (a.kingPhase === 'jump') {
      a.state = 'jump'; a.kingPhaseT -= dt;
      const t = clamp(1 - a.kingPhaseT / S.flight, 0, 1), from = a.jumpFrom, to = a.jumpTo;
      a.x = from.x + (to.x - from.x) * t; a.y = from.y + (to.y - from.y) * t; a.vx = (to.x - from.x) / S.flight; a.vy = (to.y - from.y) / S.flight; a.tvx = a.tvy = 0;
      a.jumpLift = Math.sin(t * Math.PI);
      if (a.kingPhaseT <= 0) this.land(sys, a, def, humans);
      return;
    }
    if (a.kingPhase === 'recover') {
      sys._steerAlong(a, 0, 0, 0); a.state = 'slam'; a.kingPhaseT -= dt;
      if (a.kingPhaseT <= 0) a.kingPhase = '';
      return;
    }
    const found = this.pickTarget(sys, a, def, humans);
    if (!found) { if (a.state === 'chase') { a.state = 'idle'; a.timer = 1; } sys._wander(a, def, dt); return; }
    if (a.kingT <= 0 && found.dist >= S.minRange && found.dist <= S.range) { this.startJump(sys, a, def, found.target); return; }
    this.attack(sys, a, def, found.target, found.dist);
  },
  startJump(sys, a, def, target) {
    const S = def.slam, enraged = a.hp < a.maxHp * 0.5;
    a.kingPhase = 'windup'; a.kingPhaseT = S.windup; a.kingT = enraged ? S.enragedCooldown : S.cooldown;
    a.jumpTo = { x: target.x, y: target.y }; a.facing = Math.atan2(target.y - a.y, target.x - a.x);
    sys.emit({ type: 'slimeWindup', x: target.x, y: target.y, r: S.radius, seconds: S.windup + S.flight });          // the red ring on the floor
  },
  land(sys, a, def, humans) {
    const S = def.slam;
    a.x = a.jumpTo.x; a.y = a.jumpTo.y; a.vx = a.vy = 0; a.kingPhase = 'recover'; a.kingPhaseT = S.recover; a.state = 'slam';
    for (const h of humans) {
      if (h.hp <= 0) continue;
      const d = Math.hypot(h.x - a.x, h.y - a.y);
      if (d <= S.radius) sys.damagePlayer(h.id, S.damage * AnimalLevels.damageFactor(a.level) * (1 - 0.6 * d / S.radius));
    }
    sys.emit({ type: 'slimeSlam', x: a.x, y: a.y, r: S.radius });
    const third = a.maxHp / 3, was = a.minionsAt === undefined ? 3 : a.minionsAt, now = a.hp > third * 2 ? 3 : a.hp > third ? 2 : 1;   // 3 = full, 2 = under two thirds, 1 = under one third
    if (now < was) {
      a.minionsAt = now;
      for (let i = 0; i < S.minions; i++) {
        const ang = (i / S.minions) * Math.PI * 2 + sys.rng(), id = sys.spawn('slime', a.x + Math.cos(ang) * 2.2, a.y + Math.sin(ang) * 2.2, 0, { level: S.minionLevel, grid: gridOf(a) });
        sys.animals[id].wave = true; sys.emit({ type: 'slimePuff', x: sys.animals[id].x, y: sys.animals[id].y });
      }
    }
  }
}));
