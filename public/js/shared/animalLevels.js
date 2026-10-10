'use strict';
/* SHARED - animal levels. A level is a pure function of where the animal lives (its ring's level band, via the OPTIONAL zone layer), so the client
 * and server agree and a chunk always holds the same herd. The farther out the ring, the stronger the wild things.
 *
 * What a level does:
 *   health        +18% per level above 1        spider bite   +10% per level
 *   hunting XP    +20% per level                top speed     +1% per level (to +50%)
 *   ponies:       need more apples to settle (+1 per 5 levels), are harder to lasso when above your Horsemanship,
 *                 need more Horsemanship to ride (+1 per 3 levels) and carry you faster (+1.2% per level, to +50%).
 *   catching:     a WILD animal above your level cannot be caught, tamed or picked up at all: ponies by Horsemanship, others by
 *                 Animal Friendship (tooWild). */
const AnimalLevels = {
  distance(x, y) { const o = CONFIG.sim.levels.origin; return Math.hypot(x - o.x, y - o.y); },
  /** The level of an animal of `type` born at (x, y). `h` is a 0..1 hash so the same place always rolls the same number.
   *  With the zone layer (`layers.zones`) the level comes from the ring's band; WITHOUT it every creature just uses its own base level. */
  roll(type, x, y, h, layers) {
    const def = AnimalDefs[type], zones = layers && layers.zones;
    if (def && def.boss) return Zones.all().find(r => r.index === def.bossRing).levelMax;           // a boss is always the top level of its area
    if (zones) return clamp(zones.levelAt(x, y, h), 1, CONFIG.sim.levels.max);
    const base = (def && def.levelBase) || 1, spread = 1 + base * 0.12;
    return clamp(Math.round(base + (h - 0.5) * 2 * spread), 1, CONFIG.sim.levels.max);
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
  /** The skill that decides whether you can catch, tame or pick up an animal: Horsemanship for ponies, Animal Friendship for every other animal. */
  tameSkill: def => (def && def.pony ? 'horsemanship' : 'animal_friendship'),
  /** Why you cannot catch / tame / pick up this WILD animal yet, or null if you can: its level may not be above your level in its skill
   *  (a level 1 rider cannot rope a level 2 pony, nor a level 1 friend of animals pick up a level 2 cat). */
  tooWild(a, lv) {
    const def = AnimalDefs[a.type], skill = AnimalLevels.tameSkill(def), need = a.level || 1, have = Skills._s(lv, skill);
    return have >= need ? null : `This level ${need} ${def.name.toLowerCase()} is too wild for you: it takes ${SkillDefs[skill].name} ${need} (you have ${have})`;
  },
  /** Wild animals around a spot are about this level (for the map). */
  zoneLevel: (x, y, layers) => (layers && layers.zones ? layers.zones.zoneLevel(x, y) : 1),
  /** How threatening a level looks to you: 'easy' | 'even' | 'hard' | 'deadly' by how far above your own level it is. */
  /** The marker beside an enemy's name for how its level compares with yours (`mine`): { kind, count, color, text }.
   *  kind 'down' (weaker than you: one arrow, two when much weaker) | 'even' | 'up' (stronger: one arrow, two when well above you) | 'skull' (a LOW level player facing something VERY high:
   *  at least 8 levels above you and at least double your level). */
  marker(level, mine) {
    const d = level - mine, lv = Math.max(1, level || 1), me = Math.max(1, mine || 1);
    if (d >= 8 && lv >= me * 2) return { kind: 'skull', count: 1, color: '#f4f0e6', text: 'Far beyond you' };
    if (d >= 5) return { kind: 'up', count: 2, color: '#ff5a4f', text: 'Much stronger than you' };
    if (d >= 2) return { kind: 'up', count: 1, color: '#ffab6b', text: 'Stronger than you' };
    if (d >= -1) return { kind: 'even', count: 1, color: '#ffe08a', text: 'About your level' };
    if (d >= -5) return { kind: 'down', count: 1, color: '#8be28b', text: 'Weaker than you' };
    return { kind: 'down', count: 2, color: '#6fd0a0', text: 'Much weaker than you' };
  },
  /** An enemy's health at its level (the same sum the server makes when it is born), for drawing its bar. */
  maxHp: (def, level) => Math.max(1, Math.round(def.hp * (1 + 0.18 * ((level || 1) - 1)))),
  threat(level, mine) { const d = level - mine; return d <= 0 ? 'easy' : d <= 3 ? 'even' : d <= 8 ? 'hard' : 'deadly'; }
};
