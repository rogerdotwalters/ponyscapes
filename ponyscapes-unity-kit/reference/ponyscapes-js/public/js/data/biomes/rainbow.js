'use strict';
/* DATA - biome: rainbow */
Biomes.register({ id: 'rainbow', levels: [8, 13], treeTint: 'rgba(255,170,230,.35)', name: 'Rainbow Meadows', rarity: 'rare', mapColor: '#f2a6e0', ponyVariant: 'rainbow', effect: 'rainbowclouds',
  cliff: { base: '#e4e0f2', moss: '#ffc2e6', mossLight: '#c8e6ff', grass: ['#eaf0ff', '#f2f5ff', '#dfe8fb'] },
  water: { deep: ['#8fb6f0', '#9ac0f5', '#86aeea'], shallow: ['#d4e6ff', '#dcebff', '#cbe0fb'] },
  ground: { grass: ['#eaf0ff', '#f2f5ff', '#dfe8fb'], dirt: ['#d8c8ec', '#e0d1f2', '#cfbfe4'] },      // (cloud-white ground, washed with the rainbow)
  bush: 0.045, stone: 0.006, flax: 0.03, berries: [['raspberry', 3], ['blueberry', 3], ['blackberry', 2], ['cranberry', 2]], appleTrees: 0.1, treeBoost: 0.02 });
