'use strict';
/* SHARED - wildlife as data. Speeds are tiles / second. `detect` is how far away the animal notices a player, by what
 * the player is doing: sneaking up on a deer works, charging at it does not. */
/* AnimalDefs is BUILT from two data tables: PonyKinds (js/data/ponies/) and Creatures (js/data/creatures/). A pony entry only lists what is special about
 * it; the factories below add what every pony / creature shares. Nothing here names a particular animal. */
const PONY_DEFAULTS = Object.freeze({
  pony: true, tameApples: 2, levelBase: 1, hp: 8, radius: 0.3, wanderSpeed: 0.9, fleeSpeed: 3.6, fleeSeconds: 4, followSpeed: 3.4,
  tameable: true, lure: true, protected: true, drops: [], detect: Object.freeze({ idle: 3, sneak: 3.5, walk: 6, run: 9 }), behavior: 'timid'   // shy, never hunted, lured by food, tamed with a lasso
});
const CREATURE_DEFAULTS = Object.freeze({
  levelBase: 1, weight: 0, group: Object.freeze([1, 1]), radius: 0.3, wanderSpeed: 0.8, fleeSpeed: 2.5, fleeSeconds: 3, behavior: 'timid', drops: [],
  detect: Object.freeze({ idle: 2, sneak: 2.5, walk: 4.5, run: 6.5 })
});
const freezeDef = d => { for (const k of ['detect', 'attack', 'group', 'sprite']) if (d[k]) d[k] = Object.freeze(Object.assign(Array.isArray(d[k]) ? [] : {}, d[k])); return Object.freeze(d); };
const AnimalDefs = Object.freeze(Object.fromEntries([
  ...PonyKinds.all().map(k => [k.id, freezeDef(Object.assign({}, PONY_DEFAULTS, k))]),
  ...Creatures.all().map(c => [c.id, freezeDef(Object.assign({}, CREATURE_DEFAULTS, c))])
]));

/** What lives where: the creatures' own `ring` / `weight` / `group` fields, grouped by ring (cached). */
const Fauna = {
  pools: {},
  poolFor(ring) { return Fauna.pools[ring] || (Fauna.pools[ring] = Object.values(AnimalDefs).filter(d => d.ring === ring && d.weight > 0).map(d => ({ id: d.id, weight: d.weight, group: d.group }))); },
  bossOf(ring) { return Object.values(AnimalDefs).find(d => d.boss && d.bossRing === ring) || null; }
};
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
