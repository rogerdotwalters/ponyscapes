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
/** Clean up one (possibly hand-edited) creature from js/content/customContent.js. A new one copies everything (behaviour, look) from its `base`.
 *  Where it lives: `ring` (0 = the village's ring), `weight` (how common there; 0 = never by itself), `group` [min, max] and, optionally,
 *  `biomes`: only in these biomes of its ring. `rarity` is the lowest rarity a pony of this kind can be born with. */
function buildCreatureDef(d, id) {
  const out = Object.assign({}, d), num = (v, lo, hi, fallback) => (Number.isFinite(+v) ? clamp(+v, lo, hi) : fallback);
  out.name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 40) : id;
  out.rarity = RarityDefs[d.rarity] ? d.rarity : 'common';
  for (const [k, lo, hi] of [['hp', 1, 9999], ['radius', 0.08, 1], ['wanderSpeed', 0, 10], ['fleeSpeed', 0, 12], ['fleeSeconds', 0, 30], ['followSpeed', 0, 12], ['chaseSpeed', 0, 12], ['hunt', 0, 40], ['levelBase', 1, 99], ['tameApples', 1, 20], ['weight', 0, 100]]) {
    if (d[k] !== undefined) out[k] = num(d[k], lo, hi, d[k]);
  }
  out.ring = Math.round(num(d.ring, 0, Math.max(0, Rings.size - 1), 0));
  if (d.everyRing !== undefined) out.everyRing = !!d.everyRing;
  const min = Math.max(1, Math.round(num(d.group && d.group[0], 1, 20, 1))); out.group = [min, Math.max(min, Math.round(num(d.group && d.group[1], 1, 20, min)))];
  if (Array.isArray(d.biomes)) out.biomes = d.biomes.filter(b => Biomes.has(b)); else delete out.biomes;
  if (!Array.isArray(d.drops)) out.drops = [];
  delete out.base;
  return out;
}

const AnimalDefs = ContentPack.mergeDefs('creatures', Object.fromEntries([
  ...PonyKinds.all().map(k => [k.id, freezeDef(Object.assign({}, PONY_DEFAULTS, k))]),
  ...Creatures.all().map(c => [c.id, freezeDef(Object.assign({}, CREATURE_DEFAULTS, c))])
]), buildCreatureDef);

/** What lives where: the creatures' own `ring` / `weight` / `group` (and optional `biomes`) fields, grouped by ring (cached).
 *  `everyRing: true` puts a creature in every ring (a biome's own wildlife: its level still comes from the ring and biome it is born in). */
const Fauna = {
  pools: {},
  poolFor(ring) { return Fauna.pools[ring] || (Fauna.pools[ring] = Object.values(AnimalDefs).filter(d => (d.ring === ring || d.everyRing) && d.weight > 0).map(d => ({ id: d.id, weight: d.weight, group: d.group, biomes: d.biomes || null, pony: !!d.pony }))); },
  /** The ring's pool, without the creatures that keep to other biomes. A biome with `ownFauna` keeps only its own creatures (and its ponies). */
  poolAt(ring, biome) {
    const own = !!(Biomes.get(biome) || {}).ownFauna;
    return Fauna.poolFor(ring).filter(f => (f.biomes && f.biomes.length ? f.biomes.includes(biome) : !own || f.pony));
  },
  bossOf(ring) { return Object.values(AnimalDefs).find(d => d.boss && d.bossRing === ring) || null; }
};
const FAUNA_CHANCE = 0.5;                       // chance that a chunk holds an animal group
const ANIMAL_ACTIVE_RADIUS = 36;                // animals farther than this from every player are frozen
const ANIMAL_SYNC_RADIUS = 70;                  // ... and not sent to clients
const ANIMAL_RESPAWN_SECONDS = 300;
/** ANIMAL HOMES: wild animals (not ponies) live around a home in the land (a burrow, a den, a nest...): they wander at most NODE_ROAM_RADIUS tiles from it,
 *  and a home whose animals were hunted fills up again one animal at a time, out of sight of every player. */
const NODE_ROAM_RADIUS = 7, NODE_ROAM_PULL = 3, NODE_REFILL_DISTANCE = 14;

/** Taming and keeping animals. */
const LURE_RADIUS = 5, LURE_STOP = 1.3, TRUST_SECONDS = 4;           // food in your hand calms animals within this many tiles; they walk up to you
//                                                   and keep trusting you for TRUST_SECONDS after, so you can swap to the leash
const LEASH_FOLLOW_DISTANCE = 1.8, LEASH_TELEPORT_DISTANCE = 9, LEASH_STUCK_SECONDS = 2.5;
const MAIN_PONY_FOLLOW_DISTANCE = 2.4;        // your main pony trots along a little farther back than one on a rope
const PET_HOME_RADIUS = 5;                        // a pet that is not on a leash wanders this far from where it was let go
const PICKUP_RANGE = 1.1, UNTIE_RANGE = 1.8, TAME_SPEED_BONUS = 1.2;

/** The lasso: thrown at a tameable animal within LASSO_RANGE tiles and LASSO_HALF_ANGLE radians of where you face. */
const LASSO_HALF_ANGLE = 0.55, LASSO_CLOSE = 1.8;          // inside LASSO_CLOSE tiles the cone does not matter
/** Catch chance by what the animal is doing, before distance and Horsemanship. */
const LASSO_BASE_CHANCE = { lured: 0.92, idle: 0.65, wander: 0.55, follow: 0.55, flee: 0.28 };
/** A caught (leashed, not yet tamed) wild pony breaks free after this long outside a stable or pen. */
const CAPTURE_BREAK_SECONDS = 150, CAPTURE_WARN_FRACTION = 0.7;
