'use strict';
/* DATA - tools. One line per entry. Things you use on the world that are not weapons. */
const Tools = new Registry('tools', { required: ['name', 'tool'] });
Tools.registerAll([
  { id: 'axe', name: 'Axe', tool: { kind: 'axe', damage: 1, reach: 1, swingTime: 0.5, impactTime: 0.25 } },
  { id: 'stone_hammer', name: 'Stone Hammer', tool: { kind: 'hammer', damage: 1, reach: 1, swingTime: 0.5, impactTime: 0.25 } },
  { id: 'shovel', name: 'Shovel', tool: { kind: 'shovel', damage: 0, reach: 1.1, swingTime: 0.7, impactTime: 0.4 } },
  { id: 'fishing_rod', name: 'Fishing Rod', tool: { kind: 'rod', damage: 0, reach: 3, swingTime: 1.2, impactTime: 0.9 } },
  { id: 'leash', name: 'Lasso', maxStack: 5, tool: { kind: 'leash', damage: 0, reach: 5, swingTime: 0.8, impactTime: 0.45 } }
]);
