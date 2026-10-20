'use strict';
/* DATA - building: a home for the next friend to join. Whoever the host's game gives it to can go in (their own copy of the room); it is locked to everyone else (interiorSystem.js). */
BuildingDefs.register({ id: 'vacant_home', name: "Neighbour's Home", glyph: '🔒', size: [4, 3], door: 1, interior: 'player_home', instance: 'player', home: true, locked: true,
  exterior: { wall: '#cfc7b8', side: '#aca493', roof: '#7a7f8c', trim: '#4a4f5c', sign: '#e6e0d2', infill: 'stone', chimney: false, boarded: true, props: [] } });
