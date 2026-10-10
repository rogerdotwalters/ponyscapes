'use strict';
/* DATA - weapons. One line per entry. Anything you fight with. tool.kind picks the handler (knife / spear / sword / bow). */
const Weapons = new Registry('weapons', { required: ['name', 'tool'] });
Weapons.registerAll([
  { id: 'knife', name: 'Knife', tool: { kind: 'knife', damage: 2, reach: 1, swingTime: 0.4, impactTime: 0.2 } },
  { id: 'bow', name: 'Bow', tool: { kind: 'bow', damage: 3, reach: 6, swingTime: 0.8, impactTime: 0.55 } },
  { id: 'spear', name: 'Spear', tool: { kind: 'spear', damage: 3, reach: 1.6, swingTime: 0.6, impactTime: 0.3 } },
  { id: 'wooden_sword', name: 'Wooden Sword', tool: { kind: 'sword', damage: 3, reach: 1.25, swingTime: 0.45, impactTime: 0.225 }, kind: 'weapon', price: [['gold_coin', 5]] },
  { id: 'stone_sword', name: 'Stone Sword', tool: { kind: 'sword', damage: 5, reach: 1.3, swingTime: 0.5, impactTime: 0.25 }, kind: 'weapon', price: [['gold_coin', 14]] },
  /* ---- the Smithy's swords (a sword sweeps a fan in front of you; damage is per hit, swingTime the seconds a swing takes): lighter ones are quick, heavier ones hit hard and slowly ---- */
  { id: 'iron_sword', name: 'Iron Sword', tool: { kind: 'sword', damage: 8, reach: 1.4, swingTime: 0.5, impactTime: 0.25 }, kind: 'weapon', price: [['gold_coin', 40]], blade: '#a9b0bd', edge: '#e6eaf2' },
  { id: 'rapier', name: 'Rapier', tool: { kind: 'sword', damage: 6, reach: 1.75, swingTime: 0.3, impactTime: 0.15 }, kind: 'weapon', price: [['gold_coin', 55]], blade: '#cfd8e6', edge: '#ffffff' },
  { id: 'steel_sword', name: 'Steel Sword', tool: { kind: 'sword', damage: 11, reach: 1.45, swingTime: 0.5, impactTime: 0.25 }, kind: 'weapon', price: [['gold_coin', 90]], blade: '#c4d0de', edge: '#f4f8ff' },
  { id: 'broadsword', name: 'Broadsword', tool: { kind: 'sword', damage: 16, reach: 1.6, swingTime: 0.85, impactTime: 0.45 }, kind: 'weapon', price: [['gold_coin', 150]], blade: '#8e98aa', edge: '#dfe5f0' },
  { id: 'gilded_sword', name: 'Gilded Sword', tool: { kind: 'sword', damage: 14, reach: 1.5, swingTime: 0.4, impactTime: 0.2 }, kind: 'weapon', price: [['gold_coin', 260]], rarity: 'rare', blade: '#f0d27a', edge: '#fff3c4' }
]);
