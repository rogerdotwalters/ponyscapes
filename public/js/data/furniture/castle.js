'use strict';
/* DATA - furniture for the castle (js/data/buildings/castle.js, js/content/castleRooms.js). Same shapes as basic.js, drawn by the same styles;
 * the ruined castle swaps the fine pieces for these worn ones (a cold hearth, rubble, plain casks). */
FurnitureDefs.registerAll([
  { id: 'long_table',   name: 'Long Table',      size: [4, 1], solid: true,  height: 24, style: 'table',     colors: { top: '#7a5233', leg: '#4a3322' } },
  { id: 'banquet_table', name: 'Banquet Table',  size: [5, 1], solid: true,  height: 24, style: 'table',     colors: { top: '#8a5f33', leg: '#4a3322', pad: '#7b2f3a' } },
  { id: 'bench',        name: 'Bench',           size: [3, 1], solid: false, height: 12, style: 'chair',     colors: { seat: '#8a5f33', back: '#6d4c2f' } },
  { id: 'throne',       name: 'Throne',          size: [1, 1], solid: false, height: 16, style: 'chair',     colors: { seat: '#b0323a', back: '#d9b45a' } },
  { id: 'great_hearth', name: 'Great Hearth',    size: [3, 1], solid: true,  height: 54, style: 'fireplace', light: 3.5, colors: { stone: '#8f897c', dark: '#2e2a26', fire: '#ff8a1f' } },
  { id: 'cold_hearth',  name: 'Cold Hearth',     size: [2, 1], solid: true,  height: 46, style: 'fireplace', colors: { stone: '#7f7a70', dark: '#2a2622', cold: true } },
  { id: 'cold_great_hearth', name: 'Cold Great Hearth', size: [3, 1], solid: true, height: 54, style: 'fireplace', colors: { stone: '#7f7a70', dark: '#2a2622', cold: true } },
  { id: 'bunk',         name: 'Bunk',            size: [1, 2], solid: true,  height: 16, style: 'bed',       colors: { frame: '#6d4c2f', blanket: '#6b6b5c', pillow: '#d8d2c0' } },
  { id: 'royal_bed',    name: 'Royal Bed',       size: [2, 2], solid: true,  height: 16, style: 'bed',       colors: { frame: '#5a3a24', blanket: '#7b2f3a', pillow: '#f3eee2' } },
  { id: 'weapon_rack',  name: 'Weapon Rack',     size: [2, 1], solid: true,  height: 40, style: 'lumber',    colors: { frame: '#4a4f5c', plank: '#9aa0a8' } },
  { id: 'cask',         name: 'Cask',            size: [1, 1], solid: true,  height: 24, style: 'crate',     colors: { wood: '#7a5233', band: '#3a3a42' } },
  { id: 'rubble',       name: 'Fallen Masonry',  size: [1, 1], solid: true,  height: 14, style: 'crate',     colors: { wood: '#8a867c', band: '#5f5b53' } },
  { id: 'altar',        name: 'Altar',           size: [3, 1], solid: true,  height: 28, style: 'counter',   colors: { top: '#e6e0d2', front: '#b8b2a4', trim: '#d9b45a' } },
  { id: 'candelabra',   name: 'Candelabra',      size: [1, 1], solid: false, height: 48, style: 'lamp', light: 2, colors: { pole: '#b8923a', shade: '#ffe9a8' } },
  { id: 'reading_desk', name: 'Reading Desk',    size: [2, 1], solid: true,  height: 26, style: 'workbench', colors: { top: '#8a5f33', leg: '#4a3322', tool: '#d8d2c0' } },
  { id: 'grand_rug',    name: 'Grand Rug',       size: [3, 2], solid: false, height: 0,  style: 'rug',       colors: { main: '#8c2f3a', edge: '#e2c874' } },
  { id: 'old_rug',      name: 'Rotten Rug',      size: [3, 2], solid: false, height: 0,  style: 'torn_rug',  colors: { main: '#6e3a3a', edge: '#9a8a5a', dark: '#40282a' } }
]);
