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
  { id: 'rope', name: 'Rope', maxStack: 30 },
  { id: 'clay', name: 'Clay', maxStack: 20, resource: 'clay' },
  { id: 'brick', name: 'Brick', maxStack: 40, resource: 'stone' },
  { id: 'arrow', name: 'Arrow', maxStack: 30 },
  { id: 'string', name: 'String', maxStack: 40 },
  { id: 'dragon_scale', name: 'Dragon Scale', maxStack: 20, rarity: 'epic' },
  { id: 'claw', name: 'Claw', maxStack: 20 },
  { id: 'fang', name: 'Fang', maxStack: 20 },
  { id: 'feather', name: 'Feather', maxStack: 30 },
  { id: 'chitin', name: 'Chitin Plate', maxStack: 20 }
]);
