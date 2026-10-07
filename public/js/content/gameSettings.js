'use strict';
/* GAME SETTINGS - the numbers the in-game Admin page changes (Menu > Admin, code needed). Everyone loads this file, so what is here is the game.
 *
 * To keep what you set on the Admin page: press "Export JSON" there and paste it over the { ... } below (or press "Download gameSettings.js"
 * and replace this file with it). Anything missing or out of range uses the built-in value.
 *
 *   globalSpeed            1-100     how fast everything moves (players, ponies, animals, villagers, boats); 100 = the game as built
 *   dayShare               10-90     % of each day that is daylight (the rest is night); 54 = as built (about 13 hours of light)
 *   gameHoursPerRealHour   1-5000    in-game hours that pass in one real hour; 180 = as built (a day takes 8 real minutes)
 *   seasonDays             1-365     in-game days in each season (spring, summer, autumn, winter); 20 = as built
 *   animalSense            10-300    how far animals notice you, % of their own senses; 100 = as built
 *   senseLevelScale        0-20      % farther an animal notices you for each level it has above 1; 3 = as built
 *   fleeLevelScale         0-10      % faster a fleeing animal runs for each level above 1 (ponies have their own speeds); 2 = as built
 *   stealthDex             0-50      % closer you get before animals notice you, for every 10 levels of Dexterity; 10 = as built
 *   stealthFriend          0-50      the same for every 10 levels of Animal Friendship; 15 = as built
 *   stealthCap             0-90      the most those two together can take off an animal's senses, %; 60 = as built
 *   crops                  { "<crop id>": days it takes to grow } for any crop you want faster or slower than its own (js/data/crops/crops.js)
 *   trees                  per biome: { "<biome>": { "amount": % of the normal tree density (100 = as built), "max": highest tree cover, % of grass tiles } }
 *                          Trees are decided when a world's land is made, so they change from the next time a world is started or continued.
 *   biomes                 per biome: { "<biome>": { "rarity": "common" | "uncommon" | "rare" | "ultra" | "never", "from": 0-5 } }
 *                          from: the nearest to the village it appears, in rings (0.7 = the outer edge of the Heartland, 2.5 = halfway through
 *                          the Deepwood). Leave a biome out to use its own (js/data/biomes/). Like trees, from the next world start. */
window.PONYSCAPES_SETTINGS = {
  "globalSpeed": 100,
  "dayShare": 54,
  "gameHoursPerRealHour": 180,
  "seasonDays": 20,
  "animalSense": 100,
  "senseLevelScale": 3,
  "fleeLevelScale": 2,
  "stealthDex": 10,
  "stealthFriend": 15,
  "stealthCap": 60,
  "crops": {},
  "trees": {},
  "biomes": {}
};
