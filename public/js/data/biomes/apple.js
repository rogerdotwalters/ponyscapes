'use strict';
/* DATA - biome: apple */
Biomes.register({ id: 'apple', levels: [4, 9], name: 'Orchard', rarity: 'uncommon', from: 0.7, mapColor: '#8fcf5a', ponyVariant: 'orchard', effect: 'petals',
  ground: { grass: ['#86c870', '#8fd179', '#7dbf68'], dirt: ['#b49a78', '#bda282', '#aa9070'] },
  bush: 0.05, stone: 0.006, flax: 0.03, berries: [['raspberry', 6], ['blueberry', 4]], appleTrees: 0.7, apples: [['apple', 4], ['green_apple', 3], ['golden_apple', 2], ['pink_apple', 1.5], ['crab_apple', 1.5], ['russet_apple', 0.6]], edgeApples: { crystal: 'crystal_apple' }, treeBoost: 0.05 });
