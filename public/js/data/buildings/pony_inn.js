'use strict';
/* DATA - building: the Pony Inn. A warm common room with a bar (Hattie the innkeeper stands behind it from morning to night) and two CONNECT FOUR tables: sit at one and
 * play another player, or the computer, with pony coins for tokens (shared/connectFour.js). The room is `pony_inn` in js/content/interiors.js. */
BuildingDefs.register({ id: 'pony_inn', name: 'The Pony Inn', glyph: '🐴', size: [6, 5], door: 2, interior: 'pony_inn', instance: 'shared', hours: [8, 23], keeper: 'bar_counter',
  exterior: { wall: '#e2c690', side: '#bf9f6a', roof: '#7a3f2e', trim: '#4a2a1c', sign: '#f6e2b0', infill: 'plaster', props: ['lantern', 'barrels', 'flowers', 'hay'] } });
