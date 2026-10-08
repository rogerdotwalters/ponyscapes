'use strict';
/* DATA - buildings: the villagers' own homes, one each (a building's `resident` is the villager who lives there: shared/npcSystem.js sends them home
 * to sleep and out again in the morning). They are locked to visitors; their rooms (js/content/interiors.js 'cottage') are for later. Where they
 * stand is BuildingSites (js/shared/layers/buildingSites.js). Each takes its villager's name. */
[
  ['baker',        { wall: '#e8d3a6', side: '#c4ab77', roof: '#9a5a3a', trim: '#5b3a24', infill: 'plaster', props: ['barrels', 'flowers'] }],
  ['child',        { wall: '#d9e0c0', side: '#b3bb97', roof: '#5f8a5a', trim: '#3a5236', infill: 'plaster', props: ['flowers', 'hay'] }],
  ['elder',        { wall: '#d6c9b4', side: '#b3a68f', roof: '#6b5a7a', trim: '#3f3450', infill: 'stone', props: ['lantern', 'flowers'] }],
  ['guard',        { wall: '#c9c4b8', side: '#a8a396', roof: '#7a3b30', trim: '#4a2a24', infill: 'stone', props: ['lantern', 'crates'] }],
  ['carpenter',    { wall: '#c9a26b', side: '#a8834f', roof: '#7a5a36', trim: '#4a3322', infill: 'planks', props: ['firewood', 'crates'] }],
  ['merchant',     { wall: '#e6cf9a', side: '#c4ab77', roof: '#8e3b3b', trim: '#5b2424', infill: 'plaster', props: ['crates', 'barrels'] }],
  ['veterinarian', { wall: '#eef0ea', side: '#c9cdc4', roof: '#4f8a8b', trim: '#2f5d5e', infill: 'plaster', props: ['hay', 'flowers'] }],
  ['farmer',       { wall: '#d8c493', side: '#b49f6e', roof: '#8a6a3a', trim: '#4f3a1f', infill: 'planks', props: ['hay', 'barrels'] }],
  ['fisher',       { wall: '#c8d6dc', side: '#a2b3bb', roof: '#4a6f8a', trim: '#2c4357', infill: 'planks', props: ['barrels', 'lantern'] }],
  ['blacksmith',   { wall: '#bdb7ae', side: '#9b958b', roof: '#4a4f5c', trim: '#2c2f38', infill: 'stone', props: ['firewood', 'barrels'] }]
].forEach(([npc, look]) => {
  if (!Npcs.has(npc)) return;
  BuildingDefs.register({ id: 'home_' + npc, name: Npcs.get(npc).name + "'s Home", glyph: '\u{1F3E0}', size: [3, 3], door: 1, interior: 'cottage', instance: 'shared', locked: true, resident: npc,
    exterior: Object.assign({ sign: '#f2e6cf', dormer: false }, look) });
});
