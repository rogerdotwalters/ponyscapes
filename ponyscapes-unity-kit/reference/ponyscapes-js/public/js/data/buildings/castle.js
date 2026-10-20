'use strict';
/* DATA - building: the old castle, on the keep's footprint. It stands ABANDONED until the village restores it: two versions of ONE building, `castle` (restored)
 * and `castle_ruins` (what it is now; the restored one's `ruinedAs`). BuildingSites.list[i].def answers with whichever it is at the moment
 * (BuildingVersions, buildingSites.js), and InteriorSystem.setRestored('castle', true) restores it for everyone.
 *
 *   rooms   the instances inside, entrance first: key -> layout id (js/content/castleRooms.js makes them, js/shared/layers/interiorSpace.js builds them).
 *           Every room is its own grid ('room:<site>:<k>'); a doorway in one room's layout leads to another by its key.
 *   exterior.style 'castle'   drawn as a curtain wall, corner towers and a keep (client/render/pixelBuildings.js); `ruined` breaches the walls, drops
 *           the towers' tops, grows moss and ivy and boards the gate; `banner` is the colour of the flags it flies when restored. */
BuildingDefs.register({ id: 'castle', name: 'Castle', glyph: '\u{1F3F0}', size: [8, 7], door: 3, interior: 'castle_gatehall', instance: 'shared', rooms: CastleRooms.rooms(''), ruinedAs: 'castle_ruins',
  exterior: { style: 'castle', stone: '#a7a296', wall: '#c9c2b2', roof: '#6b4a4a', trim: '#4a3a2c', glass: '#aab7e4', banner: '#a8323a', sign: '#e8e0cc', props: [] } });
BuildingDefs.register({ id: 'castle_ruins', name: 'Ruined Castle', glyph: '\u{1F3DA}', size: [8, 7], door: 3, interior: 'castle_gatehall_ruined', instance: 'shared', rooms: CastleRooms.rooms('_ruined'),
  exterior: { style: 'castle', ruined: true, stone: '#8f8b80', wall: '#b3ad9f', roof: '#5a4545', trim: '#3a2f26', glass: '#6f7f9a', banner: '#7a3a3a', sign: '#cfc7b4', boarded: true, props: [] } });
