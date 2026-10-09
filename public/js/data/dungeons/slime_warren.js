'use strict';
/* DATA - dungeon: the Slime Warren. A second cave in the first zone's hills that stays blocked by rubble until the Cave Bear (the Old Cavern's guardian) is beaten. Five levels of
 * green slimes, each a little bigger and a lot nastier than the one before, and then the Slime King's arena.
 *
 * rooms     slime_1 .. slime_5 (about 50 x 50 tiles, made by code: shared/slimeRooms.js), then slime_king (the arena)
 * requires  { defeated: the zone whose guardian must be down first, text: what the rubble says }
 * waves     one row per level (room 1, 2 ...), the slimes that come at you while you are inside:
 *             max     most slimes alive at once                          rate    seconds between new slimes (while there is room for one)
 *             level   how tough each slime is (health +18% and bite +10% per level)             total   slimes in all: kill every one and the way on opens
 * king      { room: the arena's index, level }: the Slime King waits there (shared/behaviors/slimeking.js)
 * loot      what each level's chest can hold */
Dungeons.register({
  id: 'slime_warren', name: 'The Slime Warren', ring: 0, rooms: ['slime_1', 'slime_2', 'slime_3', 'slime_4', 'slime_5', 'slime_king'],
  requires: { defeated: 0, text: 'Rubble blocks the way in. Whatever lives in the Old Cavern has not been dealt with yet' },
  enemies: [['slime', 1]],
  waves: [
    { max: 5, rate: 3.5, level: 2, total: 8 },
    { max: 7, rate: 3.0, level: 4, total: 12 },
    { max: 9, rate: 2.5, level: 6, total: 16 },
    { max: 11, rate: 2.0, level: 8, total: 20 },
    { max: 13, rate: 1.5, level: 10, total: 26 }
  ],
  king: { room: 5, level: 10 },
  loot: [{ item: 'gold_coin', min: 20, max: 60 }, { item: 'torch', min: 1, max: 3, chance: 0.7 }, { item: 'apple', min: 3, max: 6, chance: 0.7 }, { item: 'cooked_venison', min: 1, max: 2, chance: 0.3 }]
});
