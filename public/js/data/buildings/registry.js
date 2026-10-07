'use strict';
/* DATA - buildings you can walk into. Each one is ONE small file in this folder; where they stand in the village is BuildingSites
 * (js/shared/layers/buildingSites.js), and what is inside is a layout in js/content/interiors.js (made with level-editor.html).
 *
 *   size       [w, h] tiles it covers outside                door     which tile along the front (south) face holds the door (0 = west end)
 *   interior   the layout id in js/content/interiors.js       instance 'shared' (everyone goes into the same room) or 'player' (each player
 *                                                                       gets their own copy of the room: a home)
 *   exterior   how the game draws it (client/render/pixelBuildings.js): colours { wall (the upper floor's infill), roof, trim (the timbers),
 *              stone, glass, sign } and its make-up: infill 'plaster' | 'stone' | 'planks', chimney (default yes), dormer (default: 5 wide or more),
 *              boarded (windows boarded up), props ['lantern', 'firewood', 'barrels', 'crates', 'flowers', 'hay'] beside its door
 *   glyph      the picture on its hanging sign
 *   sprites    { exterior }: a picture of the whole building (optional; bottom centre at the front corner) */
const BuildingDefs = new Registry('buildings', {
  required: ['name', 'size', 'door', 'interior', 'exterior'],
  check: b => (b.instance && b.instance !== 'shared' && b.instance !== 'player' ? 'instance must be "shared" or "player"' : null)
});
