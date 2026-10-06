'use strict';
/* DATA - special items. One line per entry. Quest items and oddities that do not fit another table. Written out in full. */
const SpecialItems = new Registry('special items', { required: ['name', 'maxStack'] });
SpecialItems.registerAll([
  { id: 'jug', name: 'Wooden Jug', maxStack: 5, kind: 'jug' },
  { id: 'message_bottle', name: 'Message in a Bottle', maxStack: 5, kind: 'treasure', use: { opensAny: [['treasure_map', 3], ['dungeon_scroll', 2]] } },
  { id: 'treasure_map', name: 'Treasure Map', maxStack: 5, kind: 'treasure', use: { reveals: true } },
  { id: 'brick_form', name: 'Brick Form', maxStack: 1, kind: 'tool-item' },
  { id: 'torch', name: 'Torch', maxStack: 10, kind: 'light' },
  { id: 'captured_rabbit', name: 'Rabbit (carried)', maxStack: 4, kind: 'creature', creature: 'rabbit' },
  { id: 'dungeon_scroll', name: 'Cave Scroll', maxStack: 5, kind: 'treasure', use: { revealsCave: true } }
]);
