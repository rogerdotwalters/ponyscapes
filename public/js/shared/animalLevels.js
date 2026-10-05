'use strict';
/* SHARED - animal levels. They SCALE FROM THE ORIGIN (the starting village): every `tilesPerLevel` tiles of distance adds a level,
 * on top of the species' own base level, so the land gets steadily more dangerous, and ponies steadily rarer and stronger, the farther
 * you go. A level is a pure function of where the animal lives, so the client and server agree and a chunk always holds the same herd.
 *
 * What a level does:
 *   health        +18% per level above 1        spider bite   +10% per level
 *   hunting XP    +20% per level                top speed     +1% per level (to +50%)
 *   ponies:       need more apples to settle (+1 per 5 levels), are harder to lasso when above your Horsemanship,
 *                 need more Horsemanship to ride (+1 per 3 levels) and carry you faster (+1.2% per level, to +50%). */
const AnimalLevels = {
  distance(x, y) { const o = CONFIG.sim.levels.origin; return Math.hypot(x - o.x, y - o.y); },
  /** How many "level steps" out from the origin this spot is (a fraction). */
  band(x, y) { return AnimalLevels.distance(x, y) / CONFIG.sim.levels.tilesPerLevel; },
  /** The level of an animal of `type` born at (x, y). `h` is a 0..1 hash so the same place always rolls the same number. */
  roll(type, x, y, h) {
    const raw = ((AnimalDefs[type] && AnimalDefs[type].levelBase) || 1) + AnimalLevels.band(x, y), spread = 1 + raw * 0.12;
    return clamp(Math.round(raw + (h - 0.5) * 2 * spread), 1, CONFIG.sim.levels.max);
  },
  hpFactor: level => 1 + 0.18 * ((level || 1) - 1),
  damageFactor: level => 1 + 0.10 * ((level || 1) - 1),
  speedFactor: level => 1 + Math.min(0.5, 0.01 * ((level || 1) - 1)),
  xpFactor: level => 1 + 0.2 * ((level || 1) - 1),
  /** Apples a caught pony of this level must eat before it settles. */
  applesNeeded: (def, level) => (def.tameApples || 2) + Math.floor(((level || 1) - 1) / 5),
  /** Horsemanship needed to ride a pony of this type and level. */
  rideLevel: (type, level) => (CONFIG.sim.ponyRideLevels[type] || 1) + Math.floor(((level || 1) - 1) / 3),
  rideSpeedFactor: level => 1 + Math.min(0.5, 0.012 * ((level || 1) - 1)),
  /** Wild animals around a spot are about this level (for the map). */
  zoneLevel: (x, y) => Math.max(1, Math.round(1 + AnimalLevels.band(x, y))),
  /** How threatening a level looks to you: 'easy' | 'even' | 'hard' | 'deadly' by how far above your own level it is. */
  threat(level, mine) { const d = level - mine; return d <= 0 ? 'easy' : d <= 3 ? 'even' : d <= 8 ? 'hard' : 'deadly'; }
};
