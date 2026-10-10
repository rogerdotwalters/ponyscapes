'use strict';
/* DATA - building: the Smithy. Hilda the blacksmith works here (her data's `works`): the counter sells swords for coins (shopSystem.js: `shop`), lighter ones swing fast, heavier ones hit hard. */
BuildingDefs.register({ id: 'blacksmith', name: 'Smithy', glyph: '\u2694', size: [5, 4], door: 2, interior: 'blacksmith', instance: 'shared', hours: [8, 17], keeper: 'counter',
  shop: ['wooden_sword', 'stone_sword', 'iron_sword', 'rapier', 'steel_sword', 'broadsword', 'gilded_sword'],
  exterior: { wall: '#bdb7ae', side: '#9b958b', roof: '#4a4f5c', trim: '#2c2f38', sign: '#e8d6a8', infill: 'stone', props: ['firewood', 'barrels', 'lantern', 'crates'] } });
