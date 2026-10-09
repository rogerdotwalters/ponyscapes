'use strict';
/* YOUR CONTENT. This file is written by the content editor (editor.html -> "Download customContent.js") and loaded before
 * the game's own definitions, so anything here is merged over (or added to) the built-in items, creatures and characters.
 * Everything is optional: an empty file means "the game exactly as built".
 *
 *   items:      { <itemId>: { name, kind, maxStack, rarity, resource, food, tool, equip, look, color, craft, sprites, spawns } }
 *               A built-in id (e.g. "axe") overrides just the fields you give; a new id creates a new item.
 *               equip:   { slot: 'crown' | 'outfit' | 'cape', body: 'any' | 'prince' | 'princess', power, def }   look: { style, color, trim, gem }
 *               craft:   [['plank', 4], ['rope', 1]]   (a recipe "make_<id>" at the crafting table)
 *               sprites: { icon, ground, held, placed, worn: { up, down, left, right } }      (paths relative to index.html, or data: URLs)
 *               spawns:  [{ biome: 'forest', rate: 2 }]                                       (rate = how many per 1000 open tiles of that biome)
 *
 *   creatures:  { <creatureId>: { name, base, rarity, hp, wanderSpeed, ..., ring, weight, group, biomes, sprites } }
 *               `base` (for a new creature) is the built-in creature it copies: its stats, its behaviour and how it is drawn until it has images.
 *               rarity:  the LOWEST rarity one can be born with (ponies roll their own rarity at birth, never below this).
 *               sprites: { up, down, left, right, frames, fps, scale, anchorY, variants: { frost: { up, down, left, right } } }
 *               ring: 0-4 (distance band from the village), weight: how common there (0 = never), group: [min, max] herd size,
 *               biomes: ['forest', 'jungle'] (optional: only in these biomes of its ring)
 *
 *   characters: { prince: { sprites: { up, down, left, right, frames, fps, scale, anchorY } }, princess: { sprites: { ... } } }
 *
 *   settings:   { ponySpeedCurve: [[1, 1], [10, 1.22], [99, 2.2]],      (level -> speed multiplier applied to every pony's baseSpeed)
 *                 ponySpeed: { walkFraction, wildFleeFactor, defaultBase }, ponyLeveling: { xpBase, xpExponent, travelXpPerTile, taskXp, feedXp, feedLikedXp, groomXp } }
 *               Pony creatures also take baseSpeed (tiles/s at level 1) and lassoTier (the lasso tier needed to catch one);
 *               lasso items take lasso: { tier, chance } and brushes groom (x the grooming XP).
 *
 * Any direction you leave empty falls back to the others (up -> right -> left, down -> left -> right), and a creature or
 * character with no images at all is drawn by the game's own procedural artwork. */
window.PONYSCAPES_CONTENT = {
  version: 1,
  items: {
    axe: { sprites: { icon: 'assets/items/axe_icon.png', held: 'assets/items/axe_held.png' } },
    spear: { sprites: { icon: 'assets/items/spear_icon.png', held: 'assets/items/spear_held.png' } },
    stone_hammer: { sprites: { icon: 'assets/items/stone_hammer_icon.png', held: 'assets/items/stone_hammer_held.png' } },
    knife: { sprites: { icon: 'assets/items/knife_icon.png', held: 'assets/items/knife_held.png' } },
    shovel: { sprites: { icon: 'assets/items/shovel_icon.png', held: 'assets/items/shovel_held.png' } },
    fishing_rod: { sprites: { icon: 'assets/items/fishing_rod_icon.png', held: 'assets/items/fishing_rod_held.png' } },
    hoe: { sprites: { icon: 'assets/items/hoe_icon.png', held: 'assets/items/hoe_held.png' } },
    sickle: { sprites: { icon: 'assets/items/sickle_icon.png', held: 'assets/items/sickle_held.png' } },
    hedge_cutter: { sprites: { icon: 'assets/items/hedge_cutter_icon.png', held: 'assets/items/hedge_cutter_held.png' } },
    wooden_sword: { sprites: { icon: 'assets/items/wooden_sword_icon.png', held: 'assets/items/wooden_sword_held.png' } },
    stone_sword: { sprites: { icon: 'assets/items/stone_sword_icon.png', held: 'assets/items/stone_sword_held.png' } },
    shears: { sprites: { icon: 'assets/items/shears_icon.png' } },
    watering_can: { sprites: { icon: 'assets/items/watering_can_icon.png' } },
    brush: { sprites: { icon: 'assets/items/brush_icon.png' } },
    soft_brush: { sprites: { icon: 'assets/items/soft_brush_icon.png' } },
    bow: { sprites: { icon: 'assets/items/bow_icon.png' } }
  },
  creatures: {},
  characters: {},
  settings: {}
};
