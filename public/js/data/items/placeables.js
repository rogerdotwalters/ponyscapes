'use strict';
/* DATA - placeable buildings. One line per entry. The ITEM you carry to build something. What it builds is in the structure table. */
const Placeables = new Registry('placeables', { required: ['name', 'maxStack'] });
Placeables.registerAll([
  { id: 'campfire', name: 'Campfire', maxStack: 5 },
  { id: 'wood_fence', name: 'Wood Fence', maxStack: 40 },
  { id: 'wood_gate', name: 'Wood Gate', maxStack: 10 },
  { id: 'wood_wall', name: 'Wood Wall', maxStack: 20 },
  { id: 'wood_window', name: 'Wood Window', maxStack: 10 },
  { id: 'wood_door', name: 'Wood Door', maxStack: 10 },
  { id: 'wood_floor', name: 'Wood Floor', maxStack: 40 },
  { id: 'crafting_table', name: 'Crafting Table', maxStack: 5 },
  { id: 'stable', name: 'Stable', maxStack: 3 },
  { id: 'barn', name: 'Barn', maxStack: 2 },
  { id: 'clay_furnace', name: 'Clay Furnace', maxStack: 5 },
  { id: 'stockpile_wood', name: 'Wood Stockpile', maxStack: 3 },          // town storage (stockpiles.js)
  { id: 'stockpile_stone', name: 'Stone Stockpile', maxStack: 3 },
  { id: 'stockpile_clay', name: 'Clay Stockpile', maxStack: 3 }
]);
