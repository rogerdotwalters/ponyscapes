'use strict';
/* DATA - dungeon: the Slime Cellars under the old castle. Its way in is the trapdoor in the castle's cellar (not a cave mouth in the hills: `entrance: 'castle'`), so it is
 * there whether the castle is a ruin or restored. Three smaller levels of slimes, each tougher than the last, and then the Slime Baron's arena. Same rules as the Slime
 * Warren (see slime_warren.js): the way on opens when every slime of a level is beaten. Rooms are made by code (shared/slimeRooms.js). */
Dungeons.register({
  id: 'castle_crypt', name: 'The Slime Cellars', ring: 0, rooms: ['crypt_1', 'crypt_2', 'crypt_3', 'crypt_baron'], entrance: 'castle',
  enemies: [['slime', 1]],
  waves: [
    { max: 7, rate: 2.6, level: 6, total: 14 },
    { max: 9, rate: 2.2, level: 8, total: 18 },
    { max: 11, rate: 1.8, level: 10, total: 24 }
  ],
  king: { room: 3, level: 9, type: 'slime_baron' },
  loot: [{ item: 'gold_coin', min: 30, max: 80 }, { item: 'goo', min: 2, max: 5, chance: 0.8 }, { item: 'bone', min: 1, max: 3, chance: 0.6 }, { item: 'apple', min: 3, max: 6, chance: 0.7 }, { item: 'rope', min: 1, max: 3, chance: 0.6 }, { item: 'torch', min: 1, max: 3, chance: 0.7 }, { item: 'iron_sword', min: 1, max: 1, chance: 0.08 }]
});
