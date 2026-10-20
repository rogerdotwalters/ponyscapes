'use strict';
/* DATA - biome: crystal */
Biomes.register({ id: 'crystal', levels: [10, 15], treeTint: 'rgba(150,225,255,.55)', name: 'Crystal Hollow', rarity: 'rare', from: 2.5, mapColor: '#9fe0e6', ponyVariant: 'crystal', effect: 'glints',
  cliff: { base: '#9fc0cf', moss: '#6fc0d0', mossLight: '#b8ecf2', grass: ['#8fc2b8', '#9ccdc4', '#84b8ae'] },
  water: { deep: ['#2a8fb4', '#2f98bd', '#2686aa'], shallow: ['#a6f0f0', '#b0f3f3', '#9ce9ea'] },
  ground: { grass: ['#8fc2b8', '#9ccdc4', '#84b8ae'], dirt: ['#a9b6bd', '#b3c0c6', '#9fabb2'] },
  bush: 0.02, stone: 0.05, flax: 0.004, berries: [['blueberry', 6], ['lingonberry', 4]], appleTrees: 0, treeBoost: -0.005 });
