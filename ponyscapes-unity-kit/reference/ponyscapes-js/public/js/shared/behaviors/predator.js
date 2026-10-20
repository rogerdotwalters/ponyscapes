'use strict';
/* BEHAVIOUR - predator: hunts the nearest living person within `hunt` tiles, day or night, and keeps at it. Melee creatures close in and bite; a creature
 * with attack.ranged (a dragon's breath, a manticore's spines) stops at range and attacks from there. Lions, dragons, beastmen, bosses. */
Behaviors.register({
  id: 'predator',
  /** Who does this animal go for? The nearest living person inside its hunting range. */
  pickTarget(sys, a, def, humans) {
    let target = null, best = Infinity;
    for (const h of humans) {
      if (h.hp <= 0) continue;
      const d = Math.hypot(h.x - a.x, h.y - a.y);
      if (d < this.range(a, def, h) && d < best) { target = h; best = d; }
    }
    return target ? { target, dist: best } : null;
  },
  range(a, def, h) { return def.hunt; },
  think(sys, a, def, humans, dt) {
    a.attackT = Math.max(0, a.attackT - dt);
    const found = this.pickTarget(sys, a, def, humans);
    if (!found) { if (a.state === 'chase') { a.state = 'idle'; a.timer = 1; } sys._wander(a, def, dt); return; }
    this.attack(sys, a, def, found.target, found.dist);
  },
  /** Close in (or hold at range), and strike when ready. */
  attack(sys, a, def, target, dist) {
    a.state = 'chase';
    const ranged = !!def.attack.ranged, reach = ranged ? def.attack.range * 0.85 : def.attack.range;
    if (dist <= reach) {
      sys._steerAlong(a, 0, 0, 0); a.facing = Math.atan2(target.y - a.y, target.x - a.x);
      if (a.attackT <= 0) {
        a.attackT = def.attack.cooldown;
        sys.damagePlayer(target.id, def.attack.damage * AnimalLevels.damageFactor(a.level));
        sys.emit({ type: ranged ? 'breath' : 'bite', x: a.x, y: a.y, tx: target.x, ty: target.y, kind: def.sprite && def.sprite.kind });
      }
    } else sys._steerAlong(a, target.x - a.x, target.y - a.y, def.chaseSpeed || def.fleeSpeed);
  }
});
