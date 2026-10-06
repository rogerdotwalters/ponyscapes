'use strict';
/* SHARED - wildlife as data. Speeds are tiles / second. `detect` is how far away the animal notices a player, by what
 * the player is doing: sneaking up on a deer works, charging at it does not. */
/** Ponies are protected (never hunted), shy, lured by food and can be tamed with a leash. Mystical ones glow. */
const ponyDef = (id, name, extra) => Object.freeze(Object.assign({
  id, name, pony: true, tameApples: 2, levelBase: 1, minDistance: 0,                 // apples to feed it, in a stable or pen, before a CAUGHT wild pony settles and becomes yours
  hp: 8, radius: 0.3, wanderSpeed: 0.9, fleeSpeed: 3.6, fleeSeconds: 4, followSpeed: 3.4,
  tameable: true, lure: true, protected: true, drops: [], detect: Object.freeze({ idle: 3, sneak: 3.5, walk: 6, run: 9 })
}, extra));

/** Clean up one (possibly hand-edited) creature definition. `drawAs` is the built-in artwork it uses until it has images of its own. */
function buildCreatureDef(d, id, isNew) {
  const out = Object.assign({}, d), num = (v, lo, hi, fallback) => (Number.isFinite(+v) ? clamp(+v, lo, hi) : fallback);
  out.name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 40) : id;
  out.rarity = RarityDefs[d.rarity] ? d.rarity : 'common';
  for (const [k, lo, hi] of [['hp', 1, 9999], ['radius', 0.08, 1], ['wanderSpeed', 0, 10], ['fleeSpeed', 0, 12], ['fleeSeconds', 0, 30], ['followSpeed', 0, 12], ['chaseSpeed', 0, 12], ['hunt', 0, 40], ['levelBase', 1, 99], ['minDistance', 0, 5000], ['tameApples', 1, 20]]) {
    if (d[k] !== undefined) out[k] = num(d[k], lo, hi, d[k]);
  }
  if (isNew) out.drawAs = BUILT_IN_CREATURES.includes(d.drawAs) ? d.drawAs : BUILT_IN_CREATURES.includes(d.base) ? d.base : 'sheep';
  if (!d.detect) out.detect = { idle: 2, sneak: 2.5, walk: 4.5, run: 6.5 };
  if (!Array.isArray(d.drops)) out.drops = [];
  delete out.spawns; delete out.base;
  return out;
}
const BUILT_IN_CREATURES = ['pony_earth', 'pony_pegasus', 'pony_unicorn', 'pony_alicorn', 'spider', 'rabbit', 'deer', 'sheep'];

const AnimalDefs = ContentPack.mergeDefs('creatures', {
  pony_earth:    ponyDef('pony_earth', 'Earth Pony', {}),
  pony_pegasus:  ponyDef('pony_pegasus', 'Pegasus', { levelBase: 6, minDistance: 125, tameApples: 3, mystical: true, wings: true, fleeSpeed: 4.2, followSpeed: 3.8 }),
  pony_unicorn:  ponyDef('pony_unicorn', 'Unicorn', { levelBase: 4, minDistance: 75, tameApples: 4, mystical: true, horn: true }),
  pony_alicorn:  ponyDef('pony_alicorn', 'Alicorn', { rarity: 'rare', levelBase: 12, minDistance: 300, tameApples: 5, mystical: true, wings: true, horn: true, fleeSpeed: 4.4, followSpeed: 4.0, detect: Object.freeze({ idle: 4, sneak: 4.5, walk: 7, run: 10 }) }),
  /** Hostile ONLY in the dark: by day it skitters away like any wild animal; at night it hunts anyone standing outside the light. */
  spider: Object.freeze({
    id: 'spider', name: 'Giant Spider', levelBase: 3, minDistance: 25, hp: 10, radius: 0.3, wanderSpeed: 0.8, fleeSpeed: 2.2, fleeSeconds: 2, chaseSpeed: 2.7,
    hostile: true, hunt: 11, attack: Object.freeze({ damage: 9, range: 0.8, cooldown: 1.2 }),
    detect: Object.freeze({ idle: 1.5, sneak: 2, walk: 4, run: 6 }),
    drops: [{ item: 'string', min: 2, max: 4 }]
  }),
  rabbit: Object.freeze({
    id: 'rabbit', name: 'Rabbit', levelBase: 1, minDistance: 0, hp: 1, radius: 0.14, wanderSpeed: 0.7, fleeSpeed: 2.9, fleeSeconds: 2.5,
    carry: true, lure: true,                                                                 // small enough to just pick up
    detect: Object.freeze({ idle: 2, sneak: 2.5, walk: 4.5, run: 6.5 }),
    drops: [{ item: 'rabbit_meat', min: 1, max: 1 }, { item: 'hide', min: 1, max: 1, chance: 0.5 }]
  }),
  deer: Object.freeze({
    id: 'deer', name: 'Deer', levelBase: 2, minDistance: 30, hp: 4, radius: 0.22, wanderSpeed: 0.9, fleeSpeed: 3.4, fleeSeconds: 4,
    tameable: true, lure: true, followSpeed: 3.2,
    detect: Object.freeze({ idle: 3, sneak: 3.5, walk: 6, run: 9 }),
    drops: [{ item: 'venison', min: 2, max: 3 }, { item: 'hide', min: 1, max: 1 }, { item: 'antler', min: 1, max: 2, chance: 0.8 }]
  }),
  sheep: Object.freeze({
    id: 'sheep', name: 'Sheep', levelBase: 1, minDistance: 0, hp: 3, radius: 0.22, wanderSpeed: 0.6, fleeSpeed: 1.5, fleeSeconds: 2,
    tameable: true, lure: true, followSpeed: 1.8,
    detect: Object.freeze({ idle: 0.8, sneak: 1, walk: 1.8, run: 3.2 }),
    drops: [{ item: 'mutton', min: 2, max: 2 }, { item: 'wool', min: 1, max: 3 }]
  })
}, buildCreatureDef);

/** What lives where: [animal, weight, [min, max group size]]. */
const BiomeFauna = ContentPack.mergeFauna({
  meadow:   [['sheep', 4, [2, 4]], ['rabbit', 3, [1, 3]], ['deer', 1, [1, 2]], ['pony_earth', 2.5, [1, 3]], ['pony_pegasus', 0.5, [1, 1]], ['pony_alicorn', 0.12, [1, 1]]],
  forest:   [['deer', 5, [1, 3]], ['rabbit', 3, [1, 2]], ['spider', 3, [1, 2]], ['pony_unicorn', 1.2, [1, 2]], ['pony_earth', 1, [1, 2]], ['pony_alicorn', 0.1, [1, 1]]],
  wetland:  [['rabbit', 2, [1, 2]], ['deer', 1, [1, 1]], ['pony_unicorn', 1.5, [1, 1]], ['pony_earth', 1, [1, 2]]],
  dry:      [['rabbit', 2, [1, 2]], ['spider', 2, [1, 2]], ['pony_earth', 0.8, [1, 1]], ['pony_pegasus', 0.4, [1, 1]]],
  highland: [['sheep', 3, [2, 3]], ['deer', 3, [1, 2]], ['spider', 2, [1, 2]], ['pony_pegasus', 2, [1, 2]]],
  beach:    [],
  // the far-off biomes: each has ponies you will not find anywhere else
  blossom:  [['pony_earth', 3, [1, 3]], ['pony_unicorn', 1.5, [1, 2]], ['sheep', 2, [1, 3]], ['rabbit', 2, [1, 2]], ['pony_pegasus', 0.6, [1, 1]]],
  crystal:  [['pony_unicorn', 3, [1, 2]], ['pony_pegasus', 1, [1, 2]], ['pony_alicorn', 0.5, [1, 1]], ['rabbit', 1, [1, 2]], ['spider', 1.2, [1, 1]]],
  starlit:  [['pony_unicorn', 2.5, [1, 2]], ['pony_alicorn', 0.7, [1, 1]], ['spider', 3.5, [1, 2]], ['deer', 1, [1, 1]]],
  ember:    [['pony_earth', 2, [1, 2]], ['pony_pegasus', 1.6, [1, 2]], ['pony_alicorn', 0.4, [1, 1]], ['spider', 2, [1, 2]], ['rabbit', 1, [1, 2]]]
}, AnimalDefs);
const FAUNA_CHANCE = 0.5;                       // chance that a chunk holds an animal group
const ANIMAL_ACTIVE_RADIUS = 50;                // animals farther than this from every player are frozen
const ANIMAL_SYNC_RADIUS = 70;                  // ... and not sent to clients
const ANIMAL_RESPAWN_SECONDS = 300;

/** Taming and keeping animals. */
const LURE_RADIUS = 5, LURE_STOP = 1.3, TRUST_SECONDS = 4;           // food in your hand calms animals within this many tiles; they walk up to you
//                                                   and keep trusting you for TRUST_SECONDS after, so you can swap to the leash
const LEASH_FOLLOW_DISTANCE = 1.8, LEASH_TELEPORT_DISTANCE = 9, LEASH_STUCK_SECONDS = 2.5;
const PET_HOME_RADIUS = 5;                        // a pet that is not on a leash wanders this far from where it was let go
const PICKUP_RANGE = 1.1, UNTIE_RANGE = 1.8, TAME_SPEED_BONUS = 1.2;

/** The lasso: thrown at a tameable animal within LASSO_RANGE tiles and LASSO_HALF_ANGLE radians of where you face. */
const LASSO_HALF_ANGLE = 0.55, LASSO_CLOSE = 1.8;          // inside LASSO_CLOSE tiles the cone does not matter
/** Catch chance by what the animal is doing, before distance and Horsemanship. */
const LASSO_BASE_CHANCE = { lured: 0.92, idle: 0.65, wander: 0.55, follow: 0.55, flee: 0.28 };
/** A caught (leashed, not yet tamed) wild pony breaks free after this long outside a stable or pen. */
const CAPTURE_BREAK_SECONDS = 150, CAPTURE_WARN_FRACTION = 0.7;
