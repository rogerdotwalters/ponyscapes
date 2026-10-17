'use strict';
/* DATA - building: the Pony Inn. A big inn in five rooms (one grid, `pony_inn` in js/content/interiors.js): the RECEPTION just inside the door (Hattie the innkeeper stands behind the front desk from morning
 * to night), the main LOBBY beyond it with the games (two CONNECT FOUR tables, shared/connectFour.js, and a MEMORY table, shared/memoryGame.js), a KITCHEN, and two GUEST ROOMS. */
BuildingDefs.register({ id: 'pony_inn', name: 'The Pony Inn', glyph: '🐴', size: [10, 6], door: 5, interior: 'pony_inn', instance: 'shared', hours: [8, 23], keeper: 'bar_counter',
  exterior: { wall: '#e2c690', side: '#bf9f6a', roof: '#7a3f2e', trim: '#4a2a1c', sign: '#f6e2b0', infill: 'plaster', props: ['lantern', 'barrels', 'flowers', 'hay'] } });
