'use strict';
/* DATA - materials. One line per entry. Plain stackable ingredients: add a material = add a line. */
const Materials = new Registry('materials', { required: ['name', 'maxStack'] });
Materials.registerAll([
  { id: 'log', name: 'Log', maxStack: 20, resource: 'wood' },
  { id: 'plank', name: 'Plank', maxStack: 40, resource: 'wood' },
  { id: 'stone', name: 'Stone', maxStack: 20, resource: 'stone' },
  { id: 'hide', name: 'Hide', maxStack: 20 },
  { id: 'wool', name: 'Wool', maxStack: 20 },
  { id: 'bone', name: 'Bone', maxStack: 20 },                                                                                                   // dogs love them (hunted animals drop them)
  { id: 'antler', name: 'Antler', maxStack: 10, rarity: 'uncommon', spawns: [{ biome: 'forest', rate: 1.5 }, { biome: 'jungle', rate: 1 }] },   // shed antlers lie about in the woods
  { id: 'gold_coin', name: 'Gold Coin', maxStack: 999, rarity: 'rare', spawns: [{ biome: 'beach', rate: 0.6 }] },                              // the odd coin washed up long ago
  { id: 'copper_coin', name: 'Copper Coin', maxStack: 999 },                                                                                      // the coin system (shared/coins.js): these live in the purse, and lie on the ground as piles
  { id: 'silver_coin', name: 'Silver Coin', maxStack: 999, rarity: 'uncommon' },
  { id: 'platinum_coin', name: 'Platinum Coin', maxStack: 999, rarity: 'rare' },
  { id: 'titanium_coin', name: 'Titanium Coin', maxStack: 999, rarity: 'rare' },
  { id: 'ruby_coin', name: 'Ruby Coin', maxStack: 999, rarity: 'epic' },
  { id: 'sapphire_coin', name: 'Sapphire Coin', maxStack: 999, rarity: 'epic' },
  { id: 'emerald_coin', name: 'Emerald Coin', maxStack: 999, rarity: 'epic' },
  { id: 'amethyst_coin', name: 'Amethyst Coin', maxStack: 999, rarity: 'legendary' },
  { id: 'diamond_coin', name: 'Diamond Coin', maxStack: 999, rarity: 'legendary' },
  { id: 'coffee_beans', name: 'Coffee Beans', maxStack: 40, color: '#6b3e22', spawns: [{ biome: 'jungle', rate: 3 }] },                         // jungle pickings
  { id: 'bamboo', name: 'Bamboo', maxStack: 20, color: '#9cc25a', spawns: [{ biome: 'jungle', rate: 5 }] },
  { id: 'hay', name: 'Hay', maxStack: 50, color: '#d9b45a' },                                                                                // cut grass, dried (grass.js)
  { id: 'rope', name: 'Rope', maxStack: 30 },
  { id: 'goo', name: 'Slime Goo', maxStack: 30, color: '#7fd37a', sell: 12 },                                                                          // what slimes leave behind (the Slime Warren)
  { id: 'clay', name: 'Clay', maxStack: 20, resource: 'clay' },
  { id: 'brick', name: 'Brick', maxStack: 40, resource: 'stone' },
  { id: 'arrow', name: 'Arrow', maxStack: 30 },
  { id: 'string', name: 'String', maxStack: 40 },
  { id: 'linen', name: 'Linen', maxStack: 20, color: '#efe8d6' },                // woven from string on a loom (in your home)
  /* ---- dyes: squeezed out of anything at a dye press (in your home); each thing gives the dye of its colour (js/shared/homeCrafts.js) ---- */
  { id: 'dye_red', name: 'Red Dye', maxStack: 20, dye: true, color: '#c62828' },
  { id: 'dye_orange', name: 'Orange Dye', maxStack: 20, dye: true, color: '#ef7d1a' },
  { id: 'dye_yellow', name: 'Yellow Dye', maxStack: 20, dye: true, color: '#f2c230' },
  { id: 'dye_green', name: 'Green Dye', maxStack: 20, dye: true, color: '#3f9a3c' },
  { id: 'dye_blue', name: 'Blue Dye', maxStack: 20, dye: true, color: '#2f6fd1' },
  { id: 'dye_purple', name: 'Purple Dye', maxStack: 20, dye: true, color: '#7b45c4' },
  { id: 'dye_pink', name: 'Pink Dye', maxStack: 20, dye: true, color: '#ec6fa8' },
  { id: 'dye_brown', name: 'Brown Dye', maxStack: 20, dye: true, color: '#7a5233' },
  { id: 'dye_white', name: 'White Dye', maxStack: 20, dye: true, color: '#f2efe6' },
  { id: 'dye_black', name: 'Black Dye', maxStack: 20, dye: true, color: '#2a2a33' },
  { id: 'dragon_scale', name: 'Dragon Scale', maxStack: 20, rarity: 'epic' },
  { id: 'claw', name: 'Claw', maxStack: 20 },
  { id: 'fang', name: 'Fang', maxStack: 20 },
  { id: 'feather', name: 'Feather', maxStack: 30 },
  { id: 'chitin', name: 'Chitin Plate', maxStack: 20 }
]);
