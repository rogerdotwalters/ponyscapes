'use strict';
/* DATA - dungeon: the Old Cavern (the cave in zone 1's hills). Three rooms and then, as its LAST layer, the Cave Bear's lair (`lair`); the temporary rooms are made by tools/cave-rooms.js. */
Dungeons.register({
  id: 'cavern', name: 'The Old Cavern', ring: 0, rooms: ['cavern_1', 'cavern_2', 'cavern_3'], lair: true,
  enemies: [['slime', 9], ['wolf', 1]],                // mostly slimes, a wolf now and then
  loot: [{ item: 'gold_coin', min: 15, max: 45 }, { item: 'torch', min: 1, max: 3, chance: 0.7 }, { item: 'apple', min: 2, max: 5, chance: 0.6 }, { item: 'stone', min: 3, max: 8, chance: 0.5 }]
});
