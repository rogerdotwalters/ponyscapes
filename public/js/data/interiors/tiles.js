'use strict';
/* DATA - the tiles a room is painted with in level-editor.html. Each is one character in a layout's rows (js/content/interiors.js).
 *   kind     'floor' (walk on it), 'wall' (a solid block; drawn tall at the back of a room, low at the front so you can see in), 'void' (outside the room)
 *   colors   floor: [three shades]; wall: { top, left, right }          pattern  how the game decorates it (planks, stone, checker, carpet, straw, mat, plaster, brick)
 *   window   (walls) draw a window in it                                  exit    (floors) the doormat: interact here to go back outside
 * Tile ids and object ids are given out in this order, so add new ones at the END (saved rooms store characters, not ids). */
const InteriorTiles = new Registry('interiorTiles', {
  required: ['char', 'name', 'kind'],
  check: t => (typeof t.char !== 'string' || t.char.length !== 1 ? 'needs a one-character char' : ['floor', 'wall', 'void'].includes(t.kind) ? null : 'kind must be floor, wall or void')
});
InteriorTiles.registerAll([
  { id: 'void', char: '.', name: 'Nothing (outside)', kind: 'void', colors: ['#0b0d12', '#0b0d12', '#0b0d12'] },
  { id: 'wood_floor', char: 'w', name: 'Wood floor', kind: 'floor', pattern: 'planks', colors: ['#b98a57', '#b1834f', '#c0915e'] },
  { id: 'dark_floor', char: 'd', name: 'Dark wood floor', kind: 'floor', pattern: 'planks', colors: ['#7a5333', '#73502f', '#835a38'] },
  { id: 'stone_floor', char: 's', name: 'Stone floor', kind: 'floor', pattern: 'stone', colors: ['#a7a39a', '#9e9a91', '#b0aca3'] },
  { id: 'tile_floor', char: 't', name: 'Tiled floor', kind: 'floor', pattern: 'checker', colors: ['#e9e4d6', '#5f7c8a', '#e9e4d6'] },
  { id: 'red_carpet', char: 'r', name: 'Red carpet', kind: 'floor', pattern: 'carpet', colors: ['#9e3b3b', '#a54141', '#963636'] },
  { id: 'blue_carpet', char: 'b', name: 'Blue carpet', kind: 'floor', pattern: 'carpet', colors: ['#3e5f93', '#44669a', '#3a598b'] },
  { id: 'straw', char: 'h', name: 'Straw', kind: 'floor', pattern: 'straw', colors: ['#d9bf6a', '#cfb460', '#e2c874'] },
  { id: 'doormat', char: 'm', name: 'Doormat (the way out)', kind: 'floor', pattern: 'mat', exit: true, colors: ['#8a5a3a', '#8a5a3a', '#8a5a3a'] },
  { id: 'wood_wall', char: 'W', name: 'Wood wall', kind: 'wall', pattern: 'planks', colors: { top: '#6d4c2f', left: '#b8875a', right: '#946a42' } },
  { id: 'stone_wall', char: 'S', name: 'Stone wall', kind: 'wall', pattern: 'stone', colors: { top: '#8f897c', left: '#b4aea0', right: '#8f897c' } },
  { id: 'plaster_wall', char: 'P', name: 'Plaster wall', kind: 'wall', pattern: 'plaster', colors: { top: '#a99a86', left: '#efe6d4', right: '#d6ccb8' } },
  { id: 'brick_wall', char: 'B', name: 'Brick wall', kind: 'wall', pattern: 'brick', colors: { top: '#7a3b2c', left: '#b25a43', right: '#934a37' } },
  { id: 'wood_window', char: 'V', name: 'Wood wall with window', kind: 'wall', pattern: 'planks', window: true, colors: { top: '#6d4c2f', left: '#b8875a', right: '#946a42' } },
  { id: 'plaster_window', char: 'Q', name: 'Plaster wall with window', kind: 'wall', pattern: 'plaster', window: true, colors: { top: '#a99a86', left: '#efe6d4', right: '#d6ccb8' } }
]);
