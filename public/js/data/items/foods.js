'use strict';
/* (APPLES carry a `pony` block: what the Apple button does when you give one to your pony, see shared/appleSystem.js. heal: the share of its health restored at once; regen: [hp a second, seconds] health regeneration for YOU, the only thing an apple does for the player; speed: [% faster, seconds] for its rider; cooldowns: the share of the rider's power cooldowns taken off; xp: pony experience.) */
/* DATA - foods. One line per entry. EVERY food and drink lives here and only here. hunger/thirst are what it restores; category decides how it behaves (berry, fruit, meat, drink). A raw food names what it cooks into. */
const Foods = new Registry('foods', { required: ['name', 'category', 'maxStack'], check: f => (['berry', 'fruit', 'meat', 'drink', 'mushroom'].includes(f.category) ? null : 'has an unknown category') });
Foods.registerAll([
  { id: 'jug_water', name: 'Jug of Water', category: 'drink', maxStack: 5, hunger: 0, thirst: 35, returns: 'jug' },
  { id: 'rabbit_meat', name: 'Raw Rabbit', category: 'meat', maxStack: 10, hunger: 9, thirst: 0, cooksInto: 'cooked_rabbit', recipe: { id: 'cook_rabbit', name: 'Roast Rabbit' } },
  { id: 'venison', name: 'Raw Venison', category: 'meat', maxStack: 10, hunger: 16, thirst: 0, cooksInto: 'cooked_venison', recipe: { id: 'cook_venison', name: 'Roast Venison' } },
  { id: 'mutton', name: 'Raw Mutton', category: 'meat', maxStack: 10, hunger: 14, thirst: 0, cooksInto: 'cooked_mutton', recipe: { id: 'cook_mutton', name: 'Roast Mutton' } },
  { id: 'raspberry', name: 'Raspberry', category: 'berry', maxStack: 30, hunger: 8, thirst: 2, color: '#d6336c' },
  { id: 'blackberry', name: 'Blackberry', category: 'berry', maxStack: 30, hunger: 9, thirst: 2, color: '#3d2b5e' },
  { id: 'blueberry', name: 'Blueberry', category: 'berry', maxStack: 30, hunger: 9, thirst: 2, color: '#4a6fd1' },
  { id: 'button_mushroom', name: 'Button Mushroom', category: 'mushroom', maxStack: 30, hunger: 6, thirst: 0, color: '#e6d9bd' },
  { id: 'red_cap', name: 'Red Cap', category: 'mushroom', maxStack: 30, hunger: 7, thirst: 0, color: '#c9382c' },
  { id: 'honey_cap', name: 'Honey Cap', category: 'mushroom', maxStack: 30, hunger: 8, thirst: 0, color: '#d9a03a' },
  { id: 'violet_cap', name: 'Violet Cap', category: 'mushroom', maxStack: 30, hunger: 7, thirst: 1, color: '#8e5cc4' },
  { id: 'glow_cap', name: 'Glow Cap', category: 'mushroom', maxStack: 30, hunger: 9, thirst: 1, color: '#5fd6c8' },
  { id: 'cranberry', name: 'Cranberry', category: 'berry', maxStack: 30, hunger: 6, thirst: 2, color: '#c0392b' },
  { id: 'lingonberry', name: 'Lingonberry', category: 'berry', maxStack: 30, hunger: 7, thirst: 2, color: '#e8575a' },
  { id: 'juniper', name: 'Juniper Berry', category: 'berry', maxStack: 30, hunger: 5, thirst: 2, color: '#6b78b5' },
  { id: 'seaberry', name: 'Sea Buckthorn', category: 'berry', maxStack: 30, hunger: 7, thirst: 2, color: '#f2a33a' },
  { id: 'chicken_meat', name: 'Raw Chicken', category: 'meat', maxStack: 10, hunger: 8, thirst: 0, cooksInto: 'cooked_chicken', recipe: { id: 'cook_chicken', name: 'Roast Chicken' } },
  { id: 'cooked_chicken', name: 'Roast Chicken', category: 'meat', maxStack: 10, hunger: 16, thirst: 0 },
  { id: 'egg', name: 'Egg', category: 'meat', maxStack: 12, hunger: 5, thirst: 0, cooksInto: 'fried_egg', recipe: { id: 'cook_egg', name: 'Fry Egg' } },
  { id: 'fried_egg', name: 'Fried Egg', category: 'meat', maxStack: 12, hunger: 11, thirst: 0 },
  { id: 'apple', name: 'Apple', category: 'fruit', maxStack: 30, hunger: 10, thirst: 3, color: '#d9382b', apple: true, pony: { heal: 0.3 } },
  /* ---- more apples: they grow in the Orchard (its `apples` table). Every kind of apple does what an apple does (ponies, taming) ---- */
  { id: 'green_apple', name: 'Green Apple', category: 'fruit', maxStack: 30, hunger: 9, thirst: 4, color: '#7cc142', apple: true, pony: { heal: 0.3, regen: [2, 6] } },
  { id: 'golden_apple', name: 'Golden Apple', category: 'fruit', maxStack: 30, hunger: 12, thirst: 3, color: '#f2c94c', apple: true, pony: { heal: 0.5, speed: [40, 15] }, rarity: 'uncommon' },
  { id: 'pink_apple', name: 'Pink Lady Apple', category: 'fruit', maxStack: 30, hunger: 11, thirst: 3, color: '#f07fa0', apple: true, pony: { heal: 0.45, cooldowns: 0.5 }, rarity: 'uncommon' },
  { id: 'crab_apple', name: 'Crab Apple', category: 'fruit', maxStack: 30, hunger: 6, thirst: 2, color: '#b5482e', apple: true, pony: { heal: 0.15, regen: [1, 5] } },
  { id: 'crystal_apple', name: 'Crystal Apple', category: 'fruit', maxStack: 30, hunger: 15, thirst: 6, color: '#9fe0e6', apple: true, pony: { heal: 1, cooldowns: 1, speed: [60, 12] }, rarity: 'epic' },   // grows only on Orchard apple trees where the Orchard meets a Crystal Hollow
  { id: 'russet_apple', name: 'Russet Apple', category: 'fruit', maxStack: 30, hunger: 11, thirst: 2, color: '#b07a3a', apple: true, pony: { heal: 0.4, xp: 20 }, rarity: 'rare' },
  { id: 'raw_fish', name: 'Raw Fish', category: 'meat', maxStack: 10, hunger: 9, thirst: 0, cooksInto: 'cooked_fish', recipe: { id: 'cook_fish', name: 'Grilled Fish' } },
  { id: 'cooked_rabbit', name: 'Roast Rabbit', category: 'meat', maxStack: 10, hunger: 17, thirst: 0 },
  { id: 'cooked_venison', name: 'Roast Venison', category: 'meat', maxStack: 10, hunger: 28, thirst: 0 },
  { id: 'cooked_mutton', name: 'Roast Mutton', category: 'meat', maxStack: 10, hunger: 24, thirst: 0 },
  { id: 'cooked_fish', name: 'Grilled Fish', category: 'meat', maxStack: 10, hunger: 20, thirst: 0 },
  { id: 'bear_meat', name: 'Raw Bear Meat', category: 'meat', maxStack: 10, hunger: 20, thirst: 0, cooksInto: 'cooked_bear', recipe: { id: 'cook_bear', name: 'Roast Bear' } },
  { id: 'cooked_bear', name: 'Roast Bear', category: 'meat', maxStack: 10, hunger: 34, thirst: 0 },
  /* ---- the jungle's fruit: lying about under the canopy (spawns: rate per 1000 open jungle tiles) ---- */
  { id: 'banana', name: 'Banana', category: 'fruit', maxStack: 30, hunger: 12, thirst: 2, color: '#f2d43a', spawns: [{ biome: 'jungle', rate: 6 }] },
  { id: 'cocoa_pod', name: 'Cocoa Pod', category: 'fruit', maxStack: 30, hunger: 7, thirst: 1, color: '#b8642a', spawns: [{ biome: 'jungle', rate: 3 }] },
  { id: 'sugar_cane', name: 'Sugar Cane', category: 'fruit', maxStack: 30, hunger: 4, thirst: 6, color: '#a9c95a', spawns: [{ biome: 'jungle', rate: 3 }] }   // chewed for its sweet juice
]);
