'use strict';
/* DATA - biome: giant forest (the Giant Forest zone). Few trees, but huge ones (flora: redwood, great oak). Only the zone layer places it. */
Biomes.register({ id: 'giant_forest', levels: [8, 13], name: 'Giant Forest', rarity: 'rare', mapColor: '#2f6a3a', ponyVariant: 'moss', effect: null,
  ground: { grass: ['#4a7f3e', '#528a46', '#447738'], dirt: ['#7d6444', '#86694a', '#735c3e'] },
  cliff: { base: '#6a7060', moss: '#2f5a30', mossLight: '#4a7a40', grass: ['#4a7f3e', '#528a46', '#447738'] },
  bush: 0.03, stone: 0.008, flax: 0.012, berries: [['blackberry', 7], ['blueberry', 3]], appleTrees: 0, treeBoost: 0.02 });
