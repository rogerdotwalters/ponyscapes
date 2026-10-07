'use strict';
/* DATA - special items. One line per entry. Quest items and oddities that do not fit another table. Written out in full. */
const SpecialItems = new Registry('special items', { required: ['name', 'maxStack'] });
SpecialItems.registerAll([
  { id: 'jug', name: 'Wooden Jug', maxStack: 5, kind: 'jug', price: [['gold_coin', 2]] },
  { id: 'message_bottle', name: 'Message in a Bottle', maxStack: 5, kind: 'treasure', use: { opensAny: [['treasure_map', 3], ['dungeon_scroll', 2]] } },
  { id: 'treasure_map', name: 'Treasure Map', maxStack: 5, kind: 'treasure', use: { reveals: true } },
  { id: 'brick_form', name: 'Brick Form', maxStack: 1, kind: 'tool-item' },
  { id: 'torch', name: 'Torch', maxStack: 10, kind: 'light', price: [['gold_coin', 1]] },
  { id: 'captured_rabbit', name: 'Rabbit (carried)', maxStack: 4, kind: 'creature', creature: 'rabbit' },
  { id: 'captured_cat', name: 'Cat (carried)', maxStack: 4, kind: 'creature', creature: 'cat' },
  { id: 'captured_chicken', name: 'Chicken (carried)', maxStack: 4, kind: 'creature', creature: 'chicken' },
  { id: 'captured_duck', name: 'Duck (carried)', maxStack: 4, kind: 'creature', creature: 'duck' },
  { id: 'captured_lemur', name: 'Lemur (carried)', maxStack: 4, kind: 'creature', creature: 'lemur' },
  { id: 'captured_toucan', name: 'Toucan (carried)', maxStack: 4, kind: 'creature', creature: 'toucan' },
  { id: 'bear_cub', name: 'Bear Cub (carried)', maxStack: 3, rarity: 'rare', kind: 'creature', creature: 'bear_cub' },                    // a lost cub: take it home to its mother in the cave
  { id: 'dungeon_scroll', name: 'Cave Scroll', maxStack: 5, kind: 'treasure', use: { revealsCave: true } }
]);
