'use strict';
/* DATA - weapons. One line per entry. Anything you fight with. tool.kind picks the handler (knife / spear / sword / bow). */
const Weapons = new Registry('weapons', { required: ['name', 'tool'] });
Weapons.registerAll([
  { id: 'knife', name: 'Knife', tool: { kind: 'knife', damage: 2, reach: 1, swingTime: 0.4, impactTime: 0.2 } },
  { id: 'bow', name: 'Bow', tool: { kind: 'bow', damage: 3, reach: 6, swingTime: 0.8, impactTime: 0.55 } },
  { id: 'spear', name: 'Spear', tool: { kind: 'spear', damage: 3, reach: 1.6, swingTime: 0.6, impactTime: 0.3 } },
  { id: 'wooden_sword', name: 'Wooden Sword', tool: { kind: 'sword', damage: 3, reach: 1.25, swingTime: 0.45, impactTime: 0.225 }, kind: 'weapon' },
  { id: 'stone_sword', name: 'Stone Sword', tool: { kind: 'sword', damage: 5, reach: 1.3, swingTime: 0.5, impactTime: 0.25 }, kind: 'weapon' }
]);
