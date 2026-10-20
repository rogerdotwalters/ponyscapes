'use strict';
/* DATA - biome: fire */
Biomes.register({ id: 'fire', levels: [7, 12], treeTint: 'rgba(150,50,25,.6)', name: 'Fire & Magma', rarity: 'uncommon', mapColor: '#c5552a', ponyVariant: 'ember', effect: 'embers',
  cliff: { base: '#4a3a38', moss: '#7a3a22', mossLight: '#b5522a', grass: ['#6a4a40', '#745248', '#5f423a'] },
  water: { deep: ['#e0561a', '#ea6420', '#d84c14'], shallow: ['#ffa43a', '#ffb04a', '#f79a2e'] },                 // (molten rock)
  ground: { grass: ['#6a4a40', '#745248', '#5f423a'], dirt: ['#7a4a35', '#85523b', '#6d422f'] },
  bush: 0.01, stone: 0.05, flax: 0, berries: [['juniper', 6], ['lingonberry', 4]], appleTrees: 0, treeBoost: -0.01 });
