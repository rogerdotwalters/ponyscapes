'use strict';
/* DATA - biome: water (the Waterlands zone): lush wetland round lakes and shallows, with a water park. Only the zone layer places it. */
Biomes.register({ id: 'water', levels: [6, 10], name: 'Waterlands', rarity: 'rare', mapColor: '#4aa3d8', ponyVariant: 'marsh', effect: 'ripples',
  ground: { grass: ['#6fbf86', '#78c78f', '#67b57e'], dirt: ['#b4a27a', '#bdab83', '#aa986f'] },
  cliff: { base: '#7f95a3', moss: '#3f8a7a', mossLight: '#5fb09a', grass: ['#6fbf86', '#78c78f', '#67b57e'] },
  water: { deep: ['#1f7fb8', '#2387c0', '#1c78ae'], shallow: ['#7fd6e6', '#88dbea', '#76cfe0'] },
  bush: 0.04, stone: 0.006, flax: 0.04, berries: [['cranberry', 6], ['blueberry', 4]], appleTrees: 0, treeBoost: 0.0 });
