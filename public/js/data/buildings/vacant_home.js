'use strict';
/* DATA - building: an empty home, kept for players to come. Locked for now: its door says so (interiorSystem.js). */
BuildingDefs.register({ id: 'vacant_home', name: 'Empty Home', glyph: '🔒', size: [4, 3], door: 1, interior: 'player_home', instance: 'shared', locked: true,
  exterior: { wall: '#cfc7b8', side: '#aca493', roof: '#7a7f8c', trim: '#4a4f5c', sign: '#e6e0d2' } });
