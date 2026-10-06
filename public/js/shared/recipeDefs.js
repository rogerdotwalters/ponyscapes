'use strict';
/* SHARED - crafting recipes as data.
 *   station : crafting must happen NEAR this built station (null = by hand)
 *   tools   : items you must carry but that are NOT used up (a knife, a stone hammer, a brick form ...)
 * Progression: stone -> knife / stone hammer -> hunt -> hide -> rope -> CRAFTING TABLE -> everything else -> bricks -> CLAY FURNACE. */
const makeRecipe = (id, name, ingredients, outputs, extra = {}) =>
  Object.freeze(Object.assign({ id, name, station: null, tools: [], ingredients, outputs }, extra));
const ing = (item, count) => ({ item, count });

const BASE_RECIPES = ({
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
  make_stockpile_wood:  makeRecipe('make_stockpile_wood', 'Wood Stockpile', [ing('plank', 10), ing('rope', 2)], [ing('stockpile_wood', 1)], { station: 'crafting_table', tools: ['stone_hammer'] }),
  make_stockpile_stone: makeRecipe('make_stockpile_stone', 'Stone Stockpile', [ing('plank', 8), ing('stone', 6), ing('rope', 1)], [ing('stockpile_stone', 1)], { station: 'crafting_table', tools: ['stone_hammer'] }),
  make_stockpile_clay:  makeRecipe('make_stockpile_clay', 'Clay Stockpile', [ing('plank', 8), ing('clay', 4), ing('rope', 1)], [ing('stockpile_clay', 1)], { station: 'crafting_table', tools: ['stone_hammer'] }),

  /* ---- weapons: at the crafting table ---- */
  make_wooden_sword:  makeRecipe('make_wooden_sword', 'Wooden Sword', [ing('plank', 3), ing('string', 1)], [ing('wooden_sword', 1)], { station: 'crafting_table', tools: ['knife'] }),
  make_stone_sword:   makeRecipe('make_stone_sword', 'Stone Sword', [ing('stone', 2), ing('plank', 2), ing('rope', 1)], [ing('stone_sword', 1)], { station: 'crafting_table', tools: ['knife'] }),

  /* ---- at the clay furnace or a campfire (a plank is the fuel) ---- */
});

/** Cooking recipes are GENERATED from the food table: a raw food that names what it cooks into (and a recipe id) gets one. */
/** Wardrobe recipes are GENERATED from the wardrobe table: an item with a `craft` list gets "make_<id>" at the crafting table. */
/** ...and so is every other item with a `craft` list (your own items from the content editor included): "make_<id>" at the crafting table. */
const WARDROBE_RECIPES = Object.fromEntries(Object.values(ItemDefs).filter(w => Array.isArray(w.craft) && w.craft.length && !BASE_RECIPES['make_' + w.id]).map(w =>
  ['make_' + w.id, makeRecipe('make_' + w.id, w.name, w.craft.filter(([item]) => ItemDefs[item]).map(([item, n]) => ing(item, n)), [ing(w.id, 1)], { station: 'crafting_table', tools: w.equip ? ['knife'] : [] })]));
const COOK_STATIONS = ['clay_furnace', 'campfire'];
const COOK_RECIPES = Object.fromEntries(Foods.where(f => f.cooksInto && f.recipe).map(f =>
  [f.recipe.id, makeRecipe(f.recipe.id, f.recipe.name, [ing(f.id, 1), ing('plank', 1)], [ing(f.cooksInto, 1)], { station: COOK_STATIONS })]));
const RecipeDefs = Object.freeze(Object.assign({}, BASE_RECIPES, COOK_RECIPES, WARDROBE_RECIPES));

/** Display names of the stations. */
const StationNames = Object.freeze({ crafting_table: 'Crafting Table', clay_furnace: 'Clay Furnace', campfire: 'Campfire', stable: 'Stable' });
/** A recipe's station can be one id or a list of alternatives. */
const stationList = recipe => (Array.isArray(recipe.station) ? recipe.station : recipe.station ? [recipe.station] : []);
