'use strict';
/* DATA - biome: candy */
Biomes.register({ id: 'candy', levels: [9, 14], treeTint: 'rgba(255,140,190,.6)', name: 'Candy Lands', rarity: 'rare', mapColor: '#f7a8cc', ponyVariant: 'candy', effect: 'sprinkles',
  cliff: { base: '#e0a7c2', moss: '#ff7eb6', mossLight: '#ffb3d6', grass: ['#f6b6d2', '#f9c3dc', '#f0a9c8'] },
  water: { deep: ['#e8689c', '#ee73a6', '#e05d93'], shallow: ['#ffb0cf', '#ffbbd6', '#fba5c7'] },                 // (syrup)
  ground: { grass: ['#f6b6d2', '#f9c3dc', '#f0a9c8'], dirt: ['#d9a07c', '#e2aa86', '#d09972'] },
  bush: 0.06, stone: 0.004, flax: 0.01, berries: [['raspberry', 6], ['cranberry', 4]], appleTrees: 0.2, treeBoost: 0 });
