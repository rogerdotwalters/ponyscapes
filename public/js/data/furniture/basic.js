'use strict';
/* DATA - the first batch of furniture: home, workshop, store and veterinary pieces. */
FurnitureDefs.registerAll([
  { id: 'bed', name: 'Bed', size: [1, 2], solid: true, unique: true, height: 16, style: 'bed', colors: { frame: '#7a5233', blanket: '#5b7fb5', pillow: '#f3eee2' } },
  { id: 'table', name: 'Table', size: [2, 1], solid: true, height: 22, style: 'table', colors: { top: '#a8763f', leg: '#6d4c2f' } },
  { id: 'chair', name: 'Chair', size: [1, 1], solid: false, height: 14, style: 'chair', colors: { seat: '#a8763f', back: '#8a5f33' } },
  { id: 'bookshelf', name: 'Bookshelf', size: [1, 1], solid: true, height: 58, style: 'shelf', colors: { wood: '#6d4c2f', goods: ['#9e3b3b', '#3e5f93', '#5c8a4a', '#d9b45a'] } },
  { id: 'dresser', name: 'Dresser', size: [1, 1], solid: true, height: 34, style: 'cabinet', colors: { wood: '#8a5f33', front: '#a8763f', knob: '#d9b45a' } },
  { id: 'rug', name: 'Round Rug', size: [2, 2], solid: false, height: 0, style: 'rug', colors: { main: '#a54848', edge: '#e2c874' } },
  { id: 'fireplace', name: 'Fireplace', size: [2, 1], solid: true, height: 46, style: 'fireplace', light: 3, colors: { stone: '#9a948a', dark: '#3a3530', fire: '#ff9a2a' } },
  { id: 'potted_plant', name: 'Potted Plant', size: [1, 1], solid: true, height: 30, style: 'plant', colors: { pot: '#b8734a', leaf: '#5e9c4a' } },
  { id: 'lamp', name: 'Standing Lamp', size: [1, 1], solid: false, height: 44, style: 'lamp', light: 2.5, colors: { pole: '#4a3a2a', shade: '#f2d99a' } },
  { id: 'counter', name: 'Shop Counter', size: [3, 1], solid: true, shop: true, height: 26, style: 'counter', colors: { top: '#c49a62', front: '#8a5f33', trim: '#5b3e24' } },
  { id: 'goods_shelf', name: 'Goods Shelf', size: [2, 1], solid: true, height: 50, style: 'shelf', colors: { wood: '#8a5f33', goods: ['#e2c874', '#b8734a', '#e9e4d6', '#9e3b3b', '#5c8a4a'] } },
  { id: 'crate', name: 'Crate', size: [1, 1], solid: true, height: 20, style: 'crate', colors: { wood: '#b58a55', band: '#7a5233' } },
  { id: 'workbench', name: 'Workbench', size: [2, 1], solid: true, height: 24, style: 'workbench', colors: { top: '#c49a62', leg: '#6d4c2f', tool: '#9aa0a8' } },
  { id: 'lumber_rack', name: 'Lumber Rack', size: [2, 1], solid: true, height: 36, style: 'lumber', colors: { frame: '#6d4c2f', plank: '#d4a873' } },
  { id: 'exam_table', name: 'Exam Table', size: [2, 1], solid: true, height: 22, style: 'table', colors: { top: '#dfe8e6', leg: '#8a9a98', pad: '#7fb3b0' } },
  { id: 'medicine_cabinet', name: 'Medicine Cabinet', size: [1, 1], solid: true, height: 50, style: 'cabinet', colors: { wood: '#d6dcd8', front: '#eef2ef', knob: '#c0392b', cross: '#c0392b' } },
  { id: 'hay_bale', name: 'Hay Bale', size: [1, 1], solid: true, height: 18, style: 'hay', colors: { hay: '#e0c46c', band: '#a8873a' } },
  /* ---- the starting home: a wardrobe (opens your Wardrobe), a worn chest (25 slots, js/shared/homeCrafts.js) and a small torn carpet ---- */
  { id: 'wardrobe', name: 'Wardrobe', size: [2, 1], solid: true, height: 62, style: 'wardrobe', wardrobe: true, colors: { wood: '#6d4c2f', front: '#8a5f33', trim: '#4a3322', knob: '#d9b45a' } },
  { id: 'worn_chest', name: 'Worn Chest', size: [1, 1], solid: true, height: 20, style: 'chest', container: { slots: 25 }, colors: { wood: '#7a5233', lid: '#8c6340', band: '#5a5a62', lock: '#d9b45a' } },
  { id: 'torn_rug', name: 'Small Torn Carpet', size: [2, 1], solid: false, height: 0, style: 'torn_rug', colors: { main: '#8a3f3f', edge: '#c9a65a', dark: '#5e2a2a' } },
  /* ---- home crafts (js/shared/homeCrafts.js): station = a crafting station you stand at; press = squeeze dye out of what you hold; store = a bin for one item ---- */
  { id: 'loom', name: 'Loom', size: [2, 1], solid: true, height: 44, style: 'loom', station: 'loom', colors: { wood: '#8a5f33', light: '#b8875a', warp: '#efe8d6', cloth: '#d9cfb4' } },
  { id: 'dye_press', name: 'Dye Press', size: [1, 1], solid: true, height: 34, style: 'press', press: true, colors: { wood: '#7a5233', light: '#a8763f', iron: '#5a5a66', tub: '#6d4c2f' } },
  /* ---- the stable (data/buildings/pony_stable.js, shared/stableSystem.js): a stall holds one pony; walk up and press the interact key ---- */
  { id: 'stall', name: 'Stall', size: [2, 2], solid: false, stall: true, height: 24, style: 'stall', colors: { wood: '#8a5f33', post: '#6d4c2f', hay: '#e0c46c' } },
  { id: 'wool_bin', name: 'Wool Bin', size: [2, 1], solid: true, height: 20, style: 'bin', store: { item: 'wool', capacity: 500 }, colors: { wood: '#9a6a3c', band: '#5b3e24', fill: '#f2efe6' } }
]);
