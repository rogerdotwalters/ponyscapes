'use strict';
/* SHARED - what a pony's abilities do, as pure functions of the pony's level and the rider's cape POWER (so server and client agree). */
const PonyAbilityRules = {
  /** Does this kind of pony have this ability? */
  has: (type, id) => { const kind = (typeof AnimalDefs !== 'undefined' && AnimalDefs[type]) || PonyKinds.get(type); return !!kind && Array.isArray(kind.abilities) && kind.abilities.includes(id); },
  /** The cape's power turns 0.15 into x1.15. */
  multiplier: power => 1 + Math.max(0, power || 0),
  /** How long a flight lasts, in seconds. */
  flightDuration(level, power) {
    const a = PonyAbilities.get('fly'), base = Math.min(a.maxDuration, a.duration + a.durationPerLevel * ((level || 1) - 1));
    return +(base * PonyAbilityRules.multiplier(power)).toFixed(2);
  },
  /** How long before the next one, in seconds. */
  flightCooldown(level, power) {
    const a = PonyAbilities.get('fly'), base = Math.max(a.minCooldown, a.cooldown - a.cooldownPerLevel * ((level || 1) - 1));
    return +(base / PonyAbilityRules.multiplier(power)).toFixed(2);
  },
  /** 0 on the ground .. 1 fully aloft: how high the pair is drawn. Rises and settles over `rise` seconds. */
  lift(p) {
    if (!p || !p.flying) return 0;
    const rise = PonyAbilities.get('fly').rise, up = Math.min(1, ((p.flyDur || 0) - (p.flyT || 0)) / rise), down = Math.min(1, (p.flyT || 0) / rise);
    return Math.max(0, Math.min(up, down));
  }
};
