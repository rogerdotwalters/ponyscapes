'use strict';
/* DATA - biome: mushroom (the Mushroom Kingdom). Only the zone layer places it. */
Biomes.register({ id: 'mushroom', levels: [3, 8], name: 'Mushroom Kingdom', rarity: 'rare', mapColor: '#b0609a', ponyVariant: 'meadow', effect: null,
  ground: { grass: ['#6f5f8f', '#78689a', '#675787'], dirt: ['#8a6a70', '#94747a', '#7f6066'] },
  cliff: { base: '#7b6285', moss: '#9a4f8a', mossLight: '#c46fb0', grass: ['#6f5f8f', '#78689a', '#675787'] },
  bush: 0.045, stone: 0.008, flax: 0.02, berries: [['blackberry', 5], ['blueberry', 5]], appleTrees: 0.03, treeBoost: 0.07 });
