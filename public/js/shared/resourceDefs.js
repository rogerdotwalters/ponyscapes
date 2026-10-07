'use strict';
/* SHARED - harvestable world resources. */
const TreeDef = Object.freeze({
  maxHp: 5,
  requiredTool: 'axe',
  logsMin: 2, logsMax: 3,
  respawnSeconds: 40,
  fallSeconds: 0.85,                             // how long a felled tree takes to hit the ground (then it breaks into logs)
  dropItemId: 'log'
});

/** Things you pick up by hand with the interact key, then they are gone for a while. */
const ForageDefs = Object.freeze({
  bush:  Object.freeze({ yieldMin: 2, yieldMax: 4, regrowSeconds: 90 }),      // berries
  stone: Object.freeze({ yieldMin: 1, yieldMax: 2, regrowSeconds: 420 }),     // loose stones
  flax:  Object.freeze({ yieldMin: 1, yieldMax: 2, regrowSeconds: 120 }),      // fibre plants: harvest them for string
  clay:  Object.freeze({ yieldMin: 2, yieldMax: 3, regrowSeconds: 150 }),     // clay deposits in clay flats
  apple_tree: Object.freeze({ yieldMin: 2, yieldMax: 4, regrowSeconds: 150 }),  // an apple tree is a normal tree you can ALSO pick fruit from
  mound:  Object.freeze({ yieldMin: 1, yieldMax: 1, regrowSeconds: 1500, tool: 'shovel' }),   // a mound of sand with a bottle buried in it: needs a shovel
  bottle: Object.freeze({ yieldMin: 1, yieldMax: 1, regrowSeconds: 1500 }),    // a bottle bobbing in the shallows: wade out and pick it up
  loot:   Object.freeze({ yieldMin: 1, yieldMax: 1, regrowSeconds: 900 })      // an item lying about (an antler, a coin, anything you give `spawns`): another turns up later
});
/** At most this much of every tile may hold a lying item (all the items' rates in a biome together). */
const MAX_LOOT_CHANCE = 0.05;
/** What kind of forageable is this prop? (an apple tree is a 'tree' that forages as 'apple_tree') */
const forageKind = prop => prop.forage || prop.t;
const FORAGE_RANGE = 1.1;                                                     // tiles from the player to the thing

/* Everything below that varies by biome is READ FROM THE BIOME TABLE (js/data/biomes/): these are just the lookups the systems use. */
const fromBiomes = field => Object.freeze(Object.fromEntries(Biomes.all().map(b => [b.id, b[field]])));
const BiomeBerries = fromBiomes('berries');                     // [itemId, weight] per biome
const BiomeApples = Object.freeze(Object.fromEntries(Biomes.all().map(b => [b.id, b.apples && b.apples.length ? b.apples : [['apple', 1]]])));   // which apples its trees bear
const BushChance = fromBiomes('bush'), StoneChance = fromBiomes('stone'), FlaxChance = fromBiomes('flax');
const AppleTreeChance = fromBiomes('appleTrees'), TreeBoost = fromBiomes('treeBoost');
const MAX_BUSH_CHANCE = Math.max(...Object.values(BushChance)), MAX_FLAX_CHANCE = Math.max(...Object.values(FlaxChance));
const ROCKY_STONE_CHANCE = 0.07, MAX_STONE_CHANCE = 0.07;
/** Chance that a clay-flat tile holds a diggable deposit. */
const CLAY_DEPOSIT_CHANCE = 0.22;

/** What the beginner's chest at the village holds (each player may open it once). */
const StarterLoot = Object.freeze([
  { item: 'plank', count: 8 }, { item: 'log', count: 2 }, { item: 'string', count: 4 }, { item: 'stone', count: 4 },
  { item: 'raspberry', count: 6 }, { item: 'jug', count: 1 }, { item: 'torch', count: 2 }
]);

/** Bottles wash up on sand and float in the shallows. (How many trees bear apples is a per-biome field: appleTrees.) */
const BURIED_BOTTLE_CHANCE = 0.012, FLOATING_BOTTLE_CHANCE = 0.01;

/** Every biome, in the order stored (as one byte per tile) on a chunk. */
const BiomeIds = Object.freeze(Biomes.ids());
const BiomeIndex = Object.freeze(Object.fromEntries(BiomeIds.map((b, i) => [b, i])));
const BiomeNames = Object.freeze(Object.fromEntries(Biomes.all().map(b => [b.id, b.name])));
