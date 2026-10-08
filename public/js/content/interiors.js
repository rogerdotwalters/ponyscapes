'use strict';
/* ROOMS - what is inside each building, written by level-editor.html ("Download interiors.js"). Put this file at public/js/content/interiors.js.
 *
 *   <layout id>: { name, tiles: [rows of one-character tiles], furniture: [{ id, x, y, rot }], exit: [x, y] }
 *     tiles      see js/data/interiors/tiles.js:  .  nothing   w d s t r b h  floors   m  doormat (the way out)   W S P B  walls   V Q  walls with a window
 *     furniture  see js/data/furniture/: x, y = its top-left tile; rot 0-3 turns it (1 and 3 swap its width and depth)
 *     exit       the doormat tile: you arrive on the tile just north of it, and interact on it to go back outside
 * A building (js/data/buildings/) names the layout it opens into with `interior`. North is the top row; walls at the top and left of a room are
 * drawn tall, walls at the bottom and right are drawn low so you can see in. */
window.PONYSCAPES_INTERIORS = {
  "carpenter": {
    "name": "Carpenter's Workshop",
    "tiles": [
      "WWWVWWWWVWWW",
      "WddddddddddW",
      "WddddddddddW",
      "WddddddddddW",
      "WddddddddddW",
      "WddddddddddW",
      "WddddddddddW",
      "WddddddddddW",
      "WWWWWmWWWWWW"
    ],
    "furniture": [
      { "id": "workbench", "x": 1, "y": 1, "rot": 0 }, { "id": "workbench", "x": 4, "y": 1, "rot": 0 }, { "id": "lumber_rack", "x": 8, "y": 1, "rot": 0 },
      { "id": "lumber_rack", "x": 10, "y": 3, "rot": 1 }, { "id": "table", "x": 5, "y": 4, "rot": 0 }, { "id": "chair", "x": 5, "y": 5, "rot": 0 },
      { "id": "crate", "x": 1, "y": 6, "rot": 0 }, { "id": "crate", "x": 1, "y": 7, "rot": 0 }, { "id": "crate", "x": 2, "y": 7, "rot": 0 },
      { "id": "lamp", "x": 1, "y": 3, "rot": 0 }, { "id": "potted_plant", "x": 10, "y": 7, "rot": 0 }
    ],
    "exit": [5, 8]
  },
  "veterinary": {
    "name": "Veterinary",
    "tiles": [
      "PPQPPPPQPP",
      "PttttttttP",
      "PttttttttP",
      "PttttttttP",
      "PhhhhttttP",
      "PhhhhttttP",
      "PhhhhttttP",
      "PttttttttP",
      "PPPPmPPPPP"
    ],
    "furniture": [
      { "id": "medicine_cabinet", "x": 1, "y": 1, "rot": 0 }, { "id": "medicine_cabinet", "x": 2, "y": 1, "rot": 0 }, { "id": "exam_table", "x": 5, "y": 2, "rot": 0 },
      { "id": "lamp", "x": 8, "y": 1, "rot": 0 }, { "id": "hay_bale", "x": 1, "y": 6, "rot": 0 }, { "id": "hay_bale", "x": 2, "y": 6, "rot": 0 },
      { "id": "chair", "x": 7, "y": 5, "rot": 0 }, { "id": "potted_plant", "x": 8, "y": 7, "rot": 0 }
    ],
    "exit": [4, 8]
  },
  "general_store": {
    "name": "General Store",
    "tiles": [
      "WWVWWWWWWVWW",
      "WwwwwwwwwwwW",
      "WwwwwwwwwwwW",
      "WwwwwwwwwwwW",
      "WwwwwrrwwwwW",
      "WwwwwrrwwwwW",
      "WwwwwrrwwwwW",
      "WwwwwrrwwwwW",
      "WWWWWmWWWWWW"
    ],
    "furniture": [
      { "id": "goods_shelf", "x": 1, "y": 1, "rot": 0 }, { "id": "goods_shelf", "x": 3, "y": 1, "rot": 0 }, { "id": "lamp", "x": 5, "y": 1, "rot": 0 },
      { "id": "potted_plant", "x": 6, "y": 1, "rot": 0 }, { "id": "goods_shelf", "x": 7, "y": 1, "rot": 0 }, { "id": "goods_shelf", "x": 9, "y": 1, "rot": 0 },
      { "id": "goods_shelf", "x": 1, "y": 4, "rot": 1 }, { "id": "counter", "x": 8, "y": 4, "rot": 0 }, { "id": "crate", "x": 1, "y": 7, "rot": 0 },
      { "id": "crate", "x": 10, "y": 7, "rot": 0 }, { "id": "crate", "x": 10, "y": 6, "rot": 0 }
    ],
    "exit": [5, 8]
  },
  "player_home": {
    "name": "Your Home",
    "tiles": [
      "WWVWWWVWW",
      "WwwwwwwwW",
      "WwwwwwwwW",
      "WwwwwwwwW",
      "WwwwwwwwW",
      "WwwwwwwwW",
      "WwwwwwwwW",
      "WWWWmWWWW"
    ],
    "furniture": [
      { "id": "bed", "x": 1, "y": 1, "rot": 0 }, { "id": "worn_chest", "x": 2, "y": 1, "rot": 0 }, { "id": "wardrobe", "x": 5, "y": 1, "rot": 0 },
      { "id": "torn_rug", "x": 3, "y": 4, "rot": 0 }
    ],
    "exit": [4, 7]
  },
  "cottage": {
    "name": "Cottage",
    "tiles": [
      "WWVWWWW",
      "WwwwwwW",
      "WwwwwwW",
      "WwwwwwW",
      "WwwwwwW",
      "WWWmWWW"
    ],
    "furniture": [
      { "id": "bed", "x": 1, "y": 1, "rot": 0 }, { "id": "worn_chest", "x": 2, "y": 1, "rot": 0 }, { "id": "table", "x": 4, "y": 2, "rot": 0 },
      { "id": "chair", "x": 3, "y": 3, "rot": 0 }, { "id": "torn_rug", "x": 2, "y": 3, "rot": 0 }, { "id": "lamp", "x": 5, "y": 1, "rot": 0 }
    ],
    "exit": [3, 5]
  },
  "storehouse": {
    "name": "Storehouse",
    "tiles": [
      "SSSSSSSSSSSS",
      "SssssssssssS",
      "SssssssssssS",
      "SssssssssssS",
      "SssssssssssS",
      "SssssssssssS",
      "SssssssssssS",
      "SssssssssssS",
      "SSSSSmSSSSSS"
    ],
    "furniture": [
      { "id": "wool_bin", "x": 4, "y": 1, "rot": 0 }, { "id": "lumber_rack", "x": 1, "y": 1, "rot": 0 }, { "id": "lumber_rack", "x": 8, "y": 1, "rot": 0 },
      { "id": "crate", "x": 1, "y": 4, "rot": 0 }, { "id": "crate", "x": 1, "y": 5, "rot": 0 }, { "id": "crate", "x": 2, "y": 5, "rot": 0 },
      { "id": "hay_bale", "x": 10, "y": 4, "rot": 0 }, { "id": "hay_bale", "x": 10, "y": 5, "rot": 0 }, { "id": "hay_bale", "x": 9, "y": 5, "rot": 0 },
      { "id": "lamp", "x": 7, "y": 1, "rot": 0 }, { "id": "crate", "x": 10, "y": 7, "rot": 0 }
    ],
    "exit": [5, 8]
  }
};
