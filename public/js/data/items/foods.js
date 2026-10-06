'use strict';
/* DATA - foods. One line per entry. EVERY food and drink lives here and only here. hunger/thirst are what it restores; category decides how it behaves (berry, fruit, meat, drink). A raw food names what it cooks into. */
const Foods = new Registry('foods', { required: ['name', 'category', 'maxStack'], check: f => (['berry', 'fruit', 'meat', 'drink'].includes(f.category) ? null : 'has an unknown category') });
Foods.registerAll([
  { id: 'jug_water', name: 'Jug of Water', category: 'drink', maxStack: 5, hunger: 0, thirst: 35, returns: 'jug' },
  { id: 'rabbit_meat', name: 'Raw Rabbit', category: 'meat', maxStack: 10, hunger: 9, thirst: 0, cooksInto: 'cooked_rabbit', recipe: { id: 'cook_rabbit', name: 'Roast Rabbit' } },
  { id: 'venison', name: 'Raw Venison', category: 'meat', maxStack: 10, hunger: 16, thirst: 0, cooksInto: 'cooked_venison', recipe: { id: 'cook_venison', name: 'Roast Venison' } },
  { id: 'mutton', name: 'Raw Mutton', category: 'meat', maxStack: 10, hunger: 14, thirst: 0, cooksInto: 'cooked_mutton', recipe: { id: 'cook_mutton', name: 'Roast Mutton' } },
  { id: 'raspberry', name: 'Raspberry', category: 'berry', maxStack: 30, hunger: 8, thirst: 2, color: '#d6336c' },
  { id: 'blackberry', name: 'Blackberry', category: 'berry', maxStack: 30, hunger: 9, thirst: 2, color: '#3d2b5e' },
  { id: 'blueberry', name: 'Blueberry', category: 'berry', maxStack: 30, hunger: 9, thirst: 2, color: '#4a6fd1' },
  { id: 'cranberry', name: 'Cranberry', category: 'berry', maxStack: 30, hunger: 6, thirst: 2, color: '#c0392b' },
  { id: 'lingonberry', name: 'Lingonberry', category: 'berry', maxStack: 30, hunger: 7, thirst: 2, color: '#e8575a' },
  { id: 'juniper', name: 'Juniper Berry', category: 'berry', maxStack: 30, hunger: 5, thirst: 2, color: '#6b78b5' },
  { id: 'seaberry', name: 'Sea Buckthorn', category: 'berry', maxStack: 30, hunger: 7, thirst: 2, color: '#f2a33a' },
  { id: 'chicken_meat', name: 'Raw Chicken', category: 'meat', maxStack: 10, hunger: 8, thirst: 0, cooksInto: 'cooked_chicken', recipe: { id: 'cook_chicken', name: 'Roast Chicken' } },
  { id: 'cooked_chicken', name: 'Roast Chicken', category: 'meat', maxStack: 10, hunger: 16, thirst: 0 },
  { id: 'egg', name: 'Egg', category: 'meat', maxStack: 12, hunger: 5, thirst: 0, cooksInto: 'fried_egg', recipe: { id: 'cook_egg', name: 'Fry Egg' } },
  { id: 'fried_egg', name: 'Fried Egg', category: 'meat', maxStack: 12, hunger: 11, thirst: 0 },
  { id: 'apple', name: 'Apple', category: 'fruit', maxStack: 30, hunger: 10, thirst: 3, color: '#d9382b' },
  { id: 'raw_fish', name: 'Raw Fish', category: 'meat', maxStack: 10, hunger: 9, thirst: 0, cooksInto: 'cooked_fish', recipe: { id: 'cook_fish', name: 'Grilled Fish' } },
  { id: 'cooked_rabbit', name: 'Roast Rabbit', category: 'meat', maxStack: 10, hunger: 17, thirst: 0 },
  { id: 'cooked_venison', name: 'Roast Venison', category: 'meat', maxStack: 10, hunger: 28, thirst: 0 },
  { id: 'cooked_mutton', name: 'Roast Mutton', category: 'meat', maxStack: 10, hunger: 24, thirst: 0 },
  { id: 'cooked_fish', name: 'Grilled Fish', category: 'meat', maxStack: 10, hunger: 20, thirst: 0 },
  { id: 'bear_meat', name: 'Raw Bear Meat', category: 'meat', maxStack: 10, hunger: 20, thirst: 0, cooksInto: 'cooked_bear', recipe: { id: 'cook_bear', name: 'Roast Bear' } },
  { id: 'cooked_bear', name: 'Roast Bear', category: 'meat', maxStack: 10, hunger: 34, thirst: 0 }
]);
