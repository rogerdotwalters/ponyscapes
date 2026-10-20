'use strict';
/* LOOT TABLES - what creatures and chests drop, as saved by the editor (editor.html > Loot > Download lootTables.js). Put the downloaded file here to make it the game for everyone;
 * anything you save on a device in the editor wins over this file on that device. Empty = every creature and chest uses its own built-in table (js/data/creatures/, js/data/dungeons/).
 *   tables   { "creature:<id>": [entries], "chest:<dungeon id>": [entries] }       an entry: { item, min, max, chance }  (chance 0-1; leave it out for always) */
window.PONYSCAPES_LOOT = { version: 1, tables: {} };
