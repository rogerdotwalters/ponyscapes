'use strict';
/* GAME SETTINGS - the numbers the in-game Admin page changes (Menu > Admin, code needed). Everyone loads this file, so what is here is the game.
 *
 * To keep what you set on the Admin page: press "Export JSON" there and paste it over the { ... } below (or press "Download gameSettings.js"
 * and replace this file with it). Anything missing or out of range uses the built-in value.
 *
 *   globalSpeed            1-100     how fast everything moves (players, ponies, animals, villagers, boats); 100 = the game as built
 *   dayShare               10-90     % of each day that is daylight (the rest is night); 54 = as built (about 13 hours of light)
 *   gameHoursPerRealHour   1-5000    in-game hours that pass in one real hour; 180 = as built (a day takes 8 real minutes)
 *   trees                  per biome: { "<biome>": { "amount": % of the normal tree density (100 = as built), "max": highest tree cover, % of grass tiles } }
 *                          Trees are decided when a world's land is made, so they change from the next time a world is started or continued. */
window.PONYSCAPES_SETTINGS = {
  "globalSpeed": 100,
  "dayShare": 54,
  "gameHoursPerRealHour": 180,
  "trees": {}
};
