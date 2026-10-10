'use strict';
/* DATA - building: the village STABLE, beside the starter paddock. Everybody can walk in, and every player gets a stable of their OWN (instance: 'player',
 * like a home, but open to all: `stable: true`). Inside are stalls (furniture with `stall: true`) where you keep your ponies: stand beside a stall and press the
 * interact key to put a pony in, or to take the one in it out (shared/stableSystem.js). */
BuildingDefs.register({ id: 'pony_stable', name: 'Stable', glyph: '\u{1F40E}', size: [4, 3], door: 1, interior: 'pony_stable', instance: 'player', stable: true,
  exterior: { wall: '#d9c18c', side: '#b49e6e', roof: '#8a3f2f', trim: '#4a3322', stone: '#8d8a83', sign: '#f2e6cf', infill: 'planks', chimney: false, dormer: false, props: ['hay', 'barrels', 'lantern'] } });
