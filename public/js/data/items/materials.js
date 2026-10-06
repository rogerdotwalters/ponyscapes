'use strict';
/* DATA - materials. One line per entry. Plain stackable ingredients: add a material = add a line. */
const Materials = new Registry('materials', { required: ['name', 'maxStack'] });
Materials.registerAll([
  { id: 'log', name: 'Log', maxStack: 20 },
  { id: 'plank', name: 'Plank', maxStack: 40 },
  { id: 'stone', name: 'Stone', maxStack: 20 },
  { id: 'hide', name: 'Hide', maxStack: 20 },
  { id: 'wool', name: 'Wool', maxStack: 20 },
  { id: 'antler', name: 'Antler', maxStack: 10 },
  { id: 'gold_coin', name: 'Gold Coin', maxStack: 999 },
  { id: 'rope', name: 'Rope', maxStack: 30 },
  { id: 'clay', name: 'Clay', maxStack: 20 },
  { id: 'brick', name: 'Brick', maxStack: 40 },
  { id: 'arrow', name: 'Arrow', maxStack: 30 },
  { id: 'string', name: 'String', maxStack: 40 },
  { id: 'dragon_scale', name: 'Dragon Scale', maxStack: 20 },
  { id: 'claw', name: 'Claw', maxStack: 20 },
  { id: 'fang', name: 'Fang', maxStack: 20 },
  { id: 'feather', name: 'Feather', maxStack: 30 },
  { id: 'chitin', name: 'Chitin Plate', maxStack: 20 }
]);
