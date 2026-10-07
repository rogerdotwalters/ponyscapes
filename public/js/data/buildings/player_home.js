'use strict';
/* DATA - building: your home. Every player who walks in gets their OWN copy of the room (instance: 'player'). */
BuildingDefs.register({ id: 'player_home', name: 'Your Home', glyph: '🏠', size: [4, 3], door: 1, interior: 'player_home', instance: 'player',
  exterior: { wall: '#d8c3a5', side: '#b49e7f', roof: '#5b6f9c', trim: '#36425f', sign: '#f2e6cf', infill: 'stone', props: ['lantern', 'firewood', 'flowers'] } });
