'use strict';
/* SHARED - crafting recipes as data.
 *   station : crafting must happen NEAR this built station (null = by hand)
 *   tools   : items you must carry but that are NOT used up (a knife, a stone hammer, a brick form ...)
 * Progression: stone -> knife / stone hammer -> hunt -> hide -> rope -> CRAFTING TABLE -> everything else -> bricks -> CLAY FURNACE. */
const makeRecipe = (id, name, ingredients, outputs, extra = {}) =>
  Object.freeze(Object.assign({ id, name, station: null, tools: [], ingredients, outputs }, extra));
const ing = (item, count) => ({ item, count });

const RecipeDefs = Object.freeze({
  /* ---- by hand ---- */
  make_planks:        makeRecipe('make_planks', 'Planks', [ing('log', 1)], [ing('plank', 2)]),
  make_knife_wood:    makeRecipe('make_knife_wood', 'Knife (wood handle)', [ing('stone', 1), ing('plank', 1)], [ing('knife', 1)]),
  make_knife_antler:  makeRecipe('make_knife_antler', 'Knife (antler handle)', [ing('stone', 1), ing('antler', 1)], [ing('knife', 1)]),
  make_stone_hammer:  makeRecipe('make_stone_hammer', 'Stone Hammer', [ing('stone', 2), ing('plank', 1)], [ing('stone_hammer', 1)]),
  make_rope_hide:     makeRecipe('make_rope_hide', 'Rope (from hide)', [ing('hide', 1)], [ing('rope', 2)], { tools: ['knife'] }),
  make_rope_wool:     makeRecipe('make_rope_wool', 'Rope (from wool)', [ing('wool', 3)], [ing('rope', 1)]),
  make_rope_string:   makeRecipe('make_rope_string', 'Rope (from string)', [ing('string', 3)], [ing('rope', 1)]),
  make_torch:         makeRecipe('make_torch', 'Torches (x2)', [ing('plank', 1), ing('string', 1)], [ing('torch', 2)]),
  make_campfire:      makeRecipe('make_campfire', 'Campfire', [ing('log', 3), ing('stone', 4)], [ing('campfire', 1)]),
  make_leash:         makeRecipe('make_leash', 'Lasso', [ing('rope', 2)], [ing('leash', 1)]),
  make_jug:           makeRecipe('make_jug', 'Wooden Jug', [ing('plank', 3)], [ing('jug', 1)]),
  make_crafting_table: makeRecipe('make_crafting_table', 'Crafting Table', [ing('plank', 6), ing('rope', 2)], [ing('crafting_table', 1)], { tools: ['stone_hammer', 'knife'] }),
  make_brick:         makeRecipe('make_brick', 'Bricks', [ing('clay', 2)], [ing('brick', 2)], { tools: ['brick_form'] }),

  /* ---- at the crafting table ---- */
  make_wood_fence:    makeRecipe('make_wood_fence', 'Wood Fence (x2)', [ing('plank', 2)], [ing('wood_fence', 2)], { station: 'crafting_table' }),
  make_wood_gate:     makeRecipe('make_wood_gate', 'Wood Gate', [ing('plank', 2), ing('rope', 1)], [ing('wood_gate', 1)], { station: 'crafting_table' }),
  make_shovel:        makeRecipe('make_shovel', 'Shovel', [ing('plank', 2), ing('stone', 2), ing('rope', 1)], [ing('shovel', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_wood_wall:     makeRecipe('make_wood_wall', 'Wood Wall', [ing('plank', 2)], [ing('wood_wall', 1)], { station: 'crafting_table' }),
  make_wood_floor:    makeRecipe('make_wood_floor', 'Wood Floor', [ing('plank', 2)], [ing('wood_floor', 2)], { station: 'crafting_table' }),
  make_wood_window:   makeRecipe('make_wood_window', 'Wood Window', [ing('plank', 3)], [ing('wood_window', 1)], { station: 'crafting_table' }),
  make_wood_door:     makeRecipe('make_wood_door', 'Wood Door', [ing('plank', 4), ing('rope', 1)], [ing('wood_door', 1)], { station: 'crafting_table' }),
  make_bow:           makeRecipe('make_bow', 'Bow', [ing('plank', 3), ing('rope', 2)], [ing('bow', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_arrows:        makeRecipe('make_arrows', 'Arrows (x4)', [ing('plank', 1), ing('stone', 1)], [ing('arrow', 4)], { station: 'crafting_table', tools: ['knife'] }),
  make_spear:         makeRecipe('make_spear', 'Spear', [ing('plank', 2), ing('stone', 1), ing('rope', 1)], [ing('spear', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_fishing_rod:   makeRecipe('make_fishing_rod', 'Fishing Rod', [ing('plank', 2), ing('rope', 2)], [ing('fishing_rod', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_brick_form:    makeRecipe('make_brick_form', 'Brick Form', [ing('plank', 4), ing('rope', 1)], [ing('brick_form', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_stable:        makeRecipe('make_stable', 'Stable', [ing('plank', 12), ing('rope', 3), ing('string', 4)], [ing('stable', 1)], { station: 'crafting_table', tools: ['stone_hammer', 'knife'] }),
  make_clay_furnace:  makeRecipe('make_clay_furnace', 'Clay Furnace', [ing('brick', 8)], [ing('clay_furnace', 1)], { station: 'crafting_table' }),

  /* ---- armour, weapons and gear: at the crafting table ---- */
  make_hide_cap:      makeRecipe('make_hide_cap', 'Hide Cap', [ing('hide', 2), ing('string', 2)], [ing('hide_cap', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_hide_vest:     makeRecipe('make_hide_vest', 'Hide Vest', [ing('hide', 4), ing('rope', 2)], [ing('hide_vest', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_hide_leggings: makeRecipe('make_hide_leggings', 'Hide Leggings', [ing('hide', 3), ing('rope', 1)], [ing('hide_leggings', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_hide_boots:    makeRecipe('make_hide_boots', 'Hide Boots', [ing('hide', 2), ing('string', 2)], [ing('hide_boots', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_hide_gloves:   makeRecipe('make_hide_gloves', 'Hide Gloves', [ing('hide', 1), ing('string', 2)], [ing('hide_gloves', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_wooden_shield: makeRecipe('make_wooden_shield', 'Wooden Shield', [ing('plank', 4), ing('rope', 1)], [ing('wooden_shield', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_wooden_sword:  makeRecipe('make_wooden_sword', 'Wooden Sword', [ing('plank', 3), ing('string', 1)], [ing('wooden_sword', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_stone_sword:   makeRecipe('make_stone_sword', 'Stone Sword', [ing('stone', 2), ing('plank', 2), ing('rope', 1)], [ing('stone_sword', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_tool_belt:     makeRecipe('make_tool_belt', 'Tool Belt', [ing('hide', 3), ing('rope', 2)], [ing('tool_belt', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_scabbard:      makeRecipe('make_scabbard', 'Scabbard', [ing('hide', 2), ing('rope', 1)], [ing('scabbard', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_sling:         makeRecipe('make_sling', 'Sword Sling', [ing('hide', 2), ing('string', 3)], [ing('sling', 1)], { station: 'crafting_table', tools: ['knife'] }),

  /* ---- at the clay furnace or a campfire (a plank is the fuel) ---- */
  cook_rabbit:        makeRecipe('cook_rabbit', 'Roast Rabbit', [ing('rabbit_meat', 1), ing('plank', 1)], [ing('cooked_rabbit', 1)], { station: ['clay_furnace', 'campfire'] }),
  cook_venison:       makeRecipe('cook_venison', 'Roast Venison', [ing('venison', 1), ing('plank', 1)], [ing('cooked_venison', 1)], { station: ['clay_furnace', 'campfire'] }),
  cook_mutton:        makeRecipe('cook_mutton', 'Roast Mutton', [ing('mutton', 1), ing('plank', 1)], [ing('cooked_mutton', 1)], { station: ['clay_furnace', 'campfire'] }),
  cook_fish:          makeRecipe('cook_fish', 'Grilled Fish', [ing('raw_fish', 1), ing('plank', 1)], [ing('cooked_fish', 1)], { station: ['clay_furnace', 'campfire'] })
});

/** Display names of the stations. */
const StationNames = Object.freeze({ crafting_table: 'Crafting Table', clay_furnace: 'Clay Furnace', campfire: 'Campfire', stable: 'Stable' });
/** A recipe's station can be one id or a list of alternatives. */
const stationList = recipe => (Array.isArray(recipe.station) ? recipe.station : recipe.station ? [recipe.station] : []);
