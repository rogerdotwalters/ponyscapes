'use strict';
/* SHARED - tile / object kinds and the numeric keys used to address tiles in an unbounded world. */
const TILE = Object.freeze({ GRASS: 0, DIRT: 1, STONE: 2, WATER: 3, SAND: 4, CLAY: 5, SHALLOW: 6 });   // WATER is deep (solid); SHALLOW can be waded
/** Any kind of water: where you drink, fish and cannot build. */
const isWaterTile = tile => tile === TILE.WATER || tile === TILE.SHALLOW;
const OBJ  = Object.freeze({ NONE: 0, WALL: 1, TOWER: 2, HOUSE: 3, DOOR: 4 });   // solid, tile-sized structures

/* A tile coordinate (tx, ty) packs into ONE number, so it can key a Map / JSON object (+-2M tiles). */
const KEY_OFFSET = 1 << 21, KEY_STRIDE = 1 << 22;
const tileKey = (tx, ty) => (tx + KEY_OFFSET) * KEY_STRIDE + (ty + KEY_OFFSET);
const keyTileX = key => Math.floor(Number(key) / KEY_STRIDE) - KEY_OFFSET;
const keyTileY = key => (Number(key) % KEY_STRIDE) - KEY_OFFSET;
