'use strict';
/* DATA - buildings you can walk into. Each one is ONE small file in this folder; where they stand in the village is BuildingSites
 * (js/shared/layers/buildingSites.js), and what is inside is a layout in js/content/interiors.js (made with level-editor.html).
 *
 *   size       [w, h] tiles it covers outside                door     which tile along the front (south) face holds the door (0 = west end)
 *   interior   the layout id in js/content/interiors.js       instance 'shared' (everyone goes into the same room) or 'player' (each player
 *                                                                       gets their own copy of the room: a home)
 *   exterior   how the game draws it (client/render/pixelBuildings.js): style 'castle' (a curtain wall, towers, gatehouse and keep: `ruined`, `banner`), colours { wall (the upper floor's infill), roof, trim (the timbers),
 *              stone, glass, sign } and its make-up: infill 'plaster' | 'stone' | 'planks', chimney (default yes), dormer (default: 5 wide or more),
 *              boarded (windows boarded up), props ['lantern', 'firewood', 'barrels', 'crates', 'flowers', 'hay'] beside its door
 *   hours      [open, close] of a shop (a villager who `works` there is inside, behind its keeper furniture, between them)    keeper  the furniture id they stand beside
 *   home       true: a home that belongs to ONE player (the host's game gives each person one, js/shared/interiorSystem.js); locked to everyone else
 *   resident   the villager who lives here (a home: they sleep inside, shared/npcSystem.js)
 *   glyph      the picture on its hanging sign
 *   rooms      (optional) a building of SEVERAL rooms: key -> layout id, entrance first (the first must be `interior`). Each room is its own instance, 'room:<site>:<k>'
 *              (k = its place in this list); the doorways in a layout (`links`) lead from one room to another by key, its doormat (`exitTo`) back
 *   ruinedAs   (optional) the id of this building's RUINED self: it stands as that until BuildingVersions says it is restored (InteriorSystem.setRestored), and then
 *              as this one. Both are the same size and place; each names its own rooms. js/data/buildings/castle.js
 *   sprites    { exterior }: a picture of the whole building (optional; bottom centre at the front corner) */
const BuildingDefs = new Registry('buildings', {
  required: ['name', 'size', 'door', 'interior', 'exterior'],
  check: b => (b.instance && b.instance !== 'shared' && b.instance !== 'player' ? 'instance must be "shared" or "player"' : null)
});
