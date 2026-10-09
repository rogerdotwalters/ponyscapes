'use strict';
/* DATA - zone 1: the Meadows. Mostly meadow, with ONE orchard patch covering about 15% of the land. The cave in its hills holds the Old Cavern, whose last layer is the Cave Bear's lair. */
Zones.register({
  id: 'meadows', index: 0, name: 'The Meadows', radius: 200, levelMin: 1, levelMax: 5, color: '#9ac27a', boss: 'boss_cave_bear', bossName: 'Cave Bear',
  biomes: [{ id: 'normal', share: 0.85 }, { id: 'apple', share: 0.15, patches: 1 }]
});
