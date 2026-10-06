'use strict';
/* SHARED - harvestable world resources. */
const TreeDef = Object.freeze({
  maxHp: 5,
  requiredTool: 'axe',
  logsMin: 2, logsMax: 3,
  respawnSeconds: 40,
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

/** Which berries a bush grows in each biome: [itemId, weight]. */
const BiomeBerries = Object.freeze({
  meadow:   [['raspberry', 7], ['blueberry', 3]],
  forest:   [['blackberry', 7], ['blueberry', 3]],
  wetland:  [['cranberry', 8], ['blueberry', 2]],
  dry:      [['juniper', 1]],
  beach:    [['seaberry', 1]],
  highland: [['lingonberry', 8], ['blueberry', 2]],
  blossom:  [['raspberry', 6], ['blueberry', 4]],
  crystal:  [['blueberry', 6], ['lingonberry', 4]],
  starlit:  [['blackberry', 6], ['blueberry', 4]],
  ember:    [['juniper', 6], ['lingonberry', 4]]
});
/** Chance that a free tile of this biome holds a bush. */
const BushChance = Object.freeze({ meadow: 0.022, forest: 0.04, wetland: 0.045, dry: 0.02, beach: 0.012, highland: 0.03, blossom: 0.05, crystal: 0.02, starlit: 0.035, ember: 0.012 });
const MAX_BUSH_CHANCE = Math.max(...Object.values(BushChance));
/** Chance that a free tile holds a loose stone: by biome, and much higher on rocky ground. */
const StoneChance = Object.freeze({ meadow: 0.01, forest: 0.008, wetland: 0.006, dry: 0.02, beach: 0.015, highland: 0.04, blossom: 0.006, crystal: 0.05, starlit: 0.012, ember: 0.05 });
const ROCKY_STONE_CHANCE = 0.07, MAX_STONE_CHANCE = 0.07;

/** Chance that a clay-flat tile holds a diggable deposit. */
const CLAY_DEPOSIT_CHANCE = 0.22;

/** Flax grows in damp, open country: chance per free grass / dirt tile by biome. */
const FlaxChance = Object.freeze({ meadow: 0.022, wetland: 0.05, forest: 0.012, dry: 0.004, highland: 0.006, beach: 0, blossom: 0.04, crystal: 0.004, starlit: 0.02, ember: 0 });
const MAX_FLAX_CHANCE = 0.05;

/** What the beginner's chest at the village holds (each player may open it once). */
const StarterLoot = Object.freeze([
  { item: 'plank', count: 8 }, { item: 'log', count: 2 }, { item: 'string', count: 4 }, { item: 'stone', count: 4 },
  { item: 'raspberry', count: 6 }, { item: 'jug', count: 1 }, { item: 'torch', count: 2 }
]);

/** Apples grow on some trees in open country; bottles wash up on sand and float in the shallows. */
const APPLE_TREE_CHANCE = 0.17, APPLE_BIOMES = ['meadow', 'forest', 'wetland', 'blossom'];
const BURIED_BOTTLE_CHANCE = 0.012, FLOATING_BOTTLE_CHANCE = 0.01;

/** Every biome, in the order stored (as one byte per tile) on a chunk. */
const BiomeIds = Object.freeze(['meadow', 'forest', 'wetland', 'dry', 'highland', 'beach', 'clay', 'blossom', 'crystal', 'starlit', 'ember']);
const BiomeIndex = Object.freeze(Object.fromEntries(BiomeIds.map((b, i) => [b, i])));
/** The far-off biomes: how far from the origin each first appears (tiles), how often, and what it is called. */
const SpecialBiomes = Object.freeze([
  Object.freeze({ id: 'blossom', name: 'Blossom Fields', minDistance: 110,  weight: 4 }),
  Object.freeze({ id: 'crystal', name: 'Crystal Hollow', minDistance: 200,  weight: 3 }),
  Object.freeze({ id: 'starlit', name: 'Starfall Glade', minDistance: 290, weight: 2.5 }),
  Object.freeze({ id: 'ember',   name: 'Ember Flats',    minDistance: 375, weight: 2.5 })
]);
const BiomeNames = Object.freeze({ meadow: 'Meadow', forest: 'Forest', wetland: 'Wetland', dry: 'Dry Plains', highland: 'Highland', beach: 'Beach', clay: 'Clay Flats',
  blossom: 'Blossom Fields', crystal: 'Crystal Hollow', starlit: 'Starfall Glade', ember: 'Ember Flats' });
const SPECIAL_BIOME_CELL = 160, SPECIAL_BIOME_CHANCE = 0.62;           // patches are about 110-150 tiles across
