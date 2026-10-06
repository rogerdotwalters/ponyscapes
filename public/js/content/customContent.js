'use strict';
/* YOUR CONTENT. This file is written by the content editor (editor.html -> "Download customContent.js") and loaded before
 * the game's own definitions, so anything here is merged over (or added to) the built-in items, creatures and characters.
 * Everything is optional: an empty file means "the game exactly as built".
 *
 *   items:      { <itemId>: { name, kind, maxStack, rarity, resource, food, tool, equip, color, sprites, spawns } }
 *               A built-in id (e.g. "axe") overrides just the fields you give; a new id creates a new item.
 *               sprites: { icon, ground, held, placed, worn: { up, down, left, right } }      (paths relative to index.html, or data: URLs)
 *               spawns:  [{ biome: 'forest', rate: 2 }]                                     (rate = how many per 1000 open tiles of that biome)
 *
 *   creatures:  { <creatureId>: { name, base, rarity, hp, wanderSpeed, ..., sprites, spawns } }
 *               `base` (for a new creature) is the built-in creature it copies: its stats, its behaviour and how it is drawn until it has images.
 *               rarity:  the LOWEST rarity one can be born with (ponies roll their own rarity at birth, never below this).
 *               sprites: { up, down, left, right, frames, fps, scale, anchorY, variants: { frost: { up, down, left, right } } }
 *               spawns:  [{ biome: 'meadow', weight: 2, min: 1, max: 3 }]                  (replaces ALL of the creature's built-in spawns)
 *
 *   characters: { prince: { sprites: { up, down, left, right, frames, fps, scale, anchorY } }, princess: { sprites: { ... } } }
 *
 * Any direction you leave empty falls back to the others (up -> right -> left, down -> left -> right), and a creature or
 * character with no images at all is drawn by the game's own procedural artwork. */
window.PONYSCAPES_CONTENT = {
  version: 1,
  items: {},
  creatures: {},
  characters: {}
};
