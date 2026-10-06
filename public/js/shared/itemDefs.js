'use strict';
/* SHARED - data-driven item definitions (think ScriptableObjects). Add an item = add an entry. */
/** Berries are food: eating one restores `hunger`. `color` is used for the icon and the bush sprite. */
const makeBerry = (id, name, hunger, color) => Object.freeze({ id, name, maxStack: 30, kind: 'berry', food: Object.freeze({ hunger, thirst: 2 }), color });
const makeMeat = (id, name, hunger) => Object.freeze({ id, name, maxStack: 10, kind: 'meat', food: Object.freeze({ hunger, thirst: 0 }) });
const placeableItem = (id, name, maxStack) => Object.freeze({ id, name, maxStack, kind: 'building', placeable: Object.freeze({ structure: id }) });   // what it builds is in StructureDefs
const makeGear = (id, name, slot, defense, extra = {}) => Object.freeze(Object.assign({ id, name, maxStack: 1, kind: 'gear', equip: Object.freeze({ slot, defense }) }, extra));
const makeSword = (id, name, damage, swingTime, reach) => Object.freeze({ id, name, maxStack: 1, kind: 'weapon', tool: Object.freeze({ kind: 'sword', damage, reach, swingTime, impactTime: swingTime * 0.5 }) });
const makeMaterial = (id, name, maxStack, extra = {}) => Object.freeze(Object.assign({ id, name, maxStack, kind: 'material' }, extra));

/** Bulk resources. You carry only a few STACKS of each (Constitution + your ponies decide how many) and deliver the rest to a
 *  stockpile in town, which crafting tables pull from. An item joins a resource with `resource: 'wood'`. */
const ResourceTypes = Object.freeze({
  wood:  Object.freeze({ id: 'wood',  name: 'Wood',  stockpile: 'stockpile_wood' }),
  stone: Object.freeze({ id: 'stone', name: 'Stone', stockpile: 'stockpile_stone' }),
  clay:  Object.freeze({ id: 'clay',  name: 'Clay',  stockpile: 'stockpile_clay' })
});
const ToolKinds = Object.freeze(['axe', 'hammer', 'knife', 'spear', 'bow', 'rod', 'sword', 'shovel', 'leash']);
const ItemEquipSlots = Object.freeze(['head', 'chest', 'legs', 'feet', 'hands', 'shield', 'belt', 'back']);

/** Clean up one (possibly hand-edited) item definition. Built-ins keep what they build; new items cannot build structures. */
function buildItemDef(d, id, isNew) {
  const out = Object.assign({}, d), num = (v, lo, hi, fallback) => (Number.isFinite(+v) ? clamp(+v, lo, hi) : fallback);
  delete out.base;
  out.name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 40) : id;
  out.maxStack = Math.round(num(d.maxStack, 1, 999, 1));
  out.rarity = RarityDefs[d.rarity] ? d.rarity : 'common';
  if (d.resource !== undefined && !ResourceTypes[d.resource]) delete out.resource;
  if (d.food) out.food = { hunger: num(d.food.hunger, 0, 100, 0), thirst: num(d.food.thirst, 0, 100, 0) };
  if (d.tool) {
    if (!ToolKinds.includes(d.tool.kind)) delete out.tool;
    else {
      const swingTime = num(d.tool.swingTime, 0.15, 3, 0.5);
      out.tool = { kind: d.tool.kind, damage: num(d.tool.damage, 0, 999, 1), reach: num(d.tool.reach, 0.5, 8, 1), swingTime, impactTime: num(d.tool.impactTime, 0.05, swingTime, swingTime / 2) };
    }
  }
  if (d.equip) { if (ItemEquipSlots.includes(d.equip.slot)) out.equip = { slot: d.equip.slot, defense: num(d.equip.defense, 0, 99, 0) }; else delete out.equip; }
  if (isNew) delete out.placeable;
  out.spawns = Array.isArray(d.spawns) ? d.spawns.filter(s => s && typeof s.biome === 'string' && +s.rate > 0).map(s => ({ biome: s.biome, rate: Math.min(50, +s.rate) })) : [];
  return out;
}

const ItemDefs = ContentPack.mergeDefs('items', {
  axe: Object.freeze({
    id: 'axe', name: 'Axe', maxStack: 1,
    tool: Object.freeze({ kind: 'axe', damage: 1, reach: 1.0, swingTime: 0.5, impactTime: 0.25 })
  }),
  log: Object.freeze({ id: 'log', name: 'Log', maxStack: 20, resource: 'wood' }),
  plank: Object.freeze({ id: 'plank', name: 'Plank', maxStack: 40, resource: 'wood' }),
  stone_hammer: Object.freeze({
    id: 'stone_hammer', name: 'Stone Hammer', maxStack: 1,
    tool: Object.freeze({ kind: 'hammer', damage: 1, reach: 1.0, swingTime: 0.5, impactTime: 0.25 })   // dismantles buildings; also a crafting tool
  }),
  stone: makeMaterial('stone', 'Stone', 20, { resource: 'stone' }),
  knife: Object.freeze({
    id: 'knife', name: 'Knife', maxStack: 1,
    tool: Object.freeze({ kind: 'knife', damage: 2, reach: 1.0, swingTime: 0.4, impactTime: 0.2 })   // hunts animals
  }),
  jug: Object.freeze({ id: 'jug', name: 'Wooden Jug', maxStack: 5, kind: 'jug' }),
  jug_water: Object.freeze({ id: 'jug_water', name: 'Jug of Water', maxStack: 5, kind: 'jug', drink: Object.freeze({ thirst: 35, returns: 'jug' }) }),
  hide: makeMaterial('hide', 'Hide', 20),
  wool: makeMaterial('wool', 'Wool', 20),
  antler: makeMaterial('antler', 'Antler', 10, { rarity: 'uncommon', spawns: [{ biome: 'forest', rate: 1.5 }, { biome: 'highland', rate: 1 }] }),   // shed antlers lie about in the woods
  rabbit_meat: makeMeat('rabbit_meat', 'Raw Rabbit', 9),
  venison: makeMeat('venison', 'Raw Venison', 16),
  mutton: makeMeat('mutton', 'Raw Mutton', 14),
  raspberry:   makeBerry('raspberry',   'Raspberry',       8, '#d6336c'),
  blackberry:  makeBerry('blackberry',  'Blackberry',      9, '#3d2b5e'),
  blueberry:   makeBerry('blueberry',   'Blueberry',       9, '#4a6fd1'),
  cranberry:   makeBerry('cranberry',   'Cranberry',       6, '#c0392b'),
  lingonberry: makeBerry('lingonberry', 'Lingonberry',     7, '#e8575a'),
  juniper:     makeBerry('juniper',     'Juniper Berry',   5, '#6b78b5'),
  seaberry:    makeBerry('seaberry',    'Sea Buckthorn',   7, '#f2a33a'),
  apple: Object.freeze({ id: 'apple', name: 'Apple', maxStack: 30, kind: 'fruit', food: Object.freeze({ hunger: 10, thirst: 3 }), color: '#d9382b' }),
  shovel: Object.freeze({
    id: 'shovel', name: 'Shovel', maxStack: 1,
    tool: Object.freeze({ kind: 'shovel', damage: 0, reach: 1.1, swingTime: 0.7, impactTime: 0.4 })     // digs up buried bottles and treasure
  }),
  message_bottle: Object.freeze({ id: 'message_bottle', name: 'Message in a Bottle', maxStack: 5, kind: 'treasure', use: Object.freeze({ opens: 'treasure_map' }) }),
  treasure_map: Object.freeze({ id: 'treasure_map', name: 'Treasure Map', maxStack: 5, kind: 'treasure', use: Object.freeze({ reveals: true }) }),   // use it up to add a map to your journal
  gold_coin: makeMaterial('gold_coin', 'Gold Coin', 999, { rarity: 'rare', spawns: [{ biome: 'beach', rate: 0.6 }, { biome: 'dry', rate: 0.3 }] }),   // the odd coin washed up or dropped long ago
  rope: makeMaterial('rope', 'Rope', 30),
  clay: makeMaterial('clay', 'Clay', 20, { resource: 'clay' }),
  brick: makeMaterial('brick', 'Brick', 40, { resource: 'stone' }),
  brick_form: Object.freeze({ id: 'brick_form', name: 'Brick Form', maxStack: 1, kind: 'tool-item' }),
  arrow: makeMaterial('arrow', 'Arrow', 30),
  bow: Object.freeze({ id: 'bow', name: 'Bow', maxStack: 1, tool: Object.freeze({ kind: 'bow', damage: 3, reach: 6, swingTime: 0.8, impactTime: 0.55 }) }),
  spear: Object.freeze({ id: 'spear', name: 'Spear', maxStack: 1, tool: Object.freeze({ kind: 'spear', damage: 3, reach: 1.6, swingTime: 0.6, impactTime: 0.3 }) }),
  fishing_rod: Object.freeze({ id: 'fishing_rod', name: 'Fishing Rod', maxStack: 1, tool: Object.freeze({ kind: 'rod', damage: 0, reach: 3, swingTime: 1.2, impactTime: 0.9 }) }),
  raw_fish: makeMeat('raw_fish', 'Raw Fish', 9),
  cooked_rabbit: makeMeat('cooked_rabbit', 'Roast Rabbit', 17),
  cooked_venison: makeMeat('cooked_venison', 'Roast Venison', 28),
  cooked_mutton: makeMeat('cooked_mutton', 'Roast Mutton', 24),
  cooked_fish: makeMeat('cooked_fish', 'Grilled Fish', 20),
  string: makeMaterial('string', 'String', 40),
  torch: Object.freeze({ id: 'torch', name: 'Torch', maxStack: 10, kind: 'light' }),                       // hold it: light around you, and spiders keep away
  campfire: placeableItem('campfire', 'Campfire', 5),
  hide_cap: makeGear('hide_cap', 'Hide Cap', 'head', 2),
  hide_vest: makeGear('hide_vest', 'Hide Vest', 'chest', 5),
  hide_leggings: makeGear('hide_leggings', 'Hide Leggings', 'legs', 3),
  hide_boots: makeGear('hide_boots', 'Hide Boots', 'feet', 2),
  hide_gloves: makeGear('hide_gloves', 'Hide Gloves', 'hands', 1),
  wooden_shield: makeGear('wooden_shield', 'Wooden Shield', 'shield', 3),
  tool_belt: makeGear('tool_belt', 'Tool Belt', 'belt', 0),                                                // adds a second utility bar
  scabbard: makeGear('scabbard', 'Scabbard', 'back', 0, { sheath: true }),                                 // gives the sword its own separate slot
  sling: makeGear('sling', 'Sword Sling', 'back', 0, { sheath: true }),
  wooden_sword: makeSword('wooden_sword', 'Wooden Sword', 3, 0.45, 1.25),
  stone_sword: makeSword('stone_sword', 'Stone Sword', 5, 0.5, 1.3),
  // the lasso (item id 'leash'): THROWN at a wild animal up to `reach` tiles away; tied animals follow on the rope
  leash: Object.freeze({ id: 'leash', name: 'Lasso', maxStack: 5, tool: Object.freeze({ kind: 'leash', damage: 0, reach: 5, swingTime: 0.8, impactTime: 0.45 }) }),
  captured_rabbit: Object.freeze({ id: 'captured_rabbit', name: 'Rabbit (carried)', maxStack: 4, kind: 'creature', creature: 'rabbit' }),   // a small animal you picked up
  wood_fence: placeableItem('wood_fence', 'Wood Fence', 40),
  wood_gate: placeableItem('wood_gate', 'Wood Gate', 10),
  wood_wall: placeableItem('wood_wall', 'Wood Wall', 20),
  wood_window: placeableItem('wood_window', 'Wood Window', 10),
  wood_door: placeableItem('wood_door', 'Wood Door', 10),
  wood_floor: placeableItem('wood_floor', 'Wood Floor', 40),
  crafting_table: placeableItem('crafting_table', 'Crafting Table', 5),
  stable: placeableItem('stable', 'Stable', 3),
  clay_furnace: placeableItem('clay_furnace', 'Clay Furnace', 5),
  stockpile_wood: placeableItem('stockpile_wood', 'Wood Stockpile', 3),
  stockpile_stone: placeableItem('stockpile_stone', 'Stone Stockpile', 3),
  stockpile_clay: placeableItem('stockpile_clay', 'Clay Stockpile', 3)
}, buildItemDef);

/** Items lying about in the world, per biome: [[itemId, rate per 1000 open tiles], ...] (from each item's `spawns`). */
const ItemSpawnTable = (() => {
  const table = {};
  for (const def of Object.values(ItemDefs)) for (const s of def.spawns || []) (table[s.biome] = table[s.biome] || []).push([def.id, s.rate]);
  return Object.freeze(table);
})();

const ItemDB = {
  get: id => ItemDefs[id] || null,
  rarity: id => rarityOf(ItemDefs[id] && ItemDefs[id].rarity),
  resource: id => (ItemDefs[id] && ItemDefs[id].resource) || null,
  maxStack: id => (ItemDefs[id] ? ItemDefs[id].maxStack : 1),
  getTool: id => (ItemDefs[id] && ItemDefs[id].tool) || null,
  getDrink: id => (ItemDefs[id] && ItemDefs[id].drink) || null,
  getUse: id => (ItemDefs[id] && ItemDefs[id].use) || null,
  getFood: id => (ItemDefs[id] && ItemDefs[id].food) || null,
  getEquip: id => (ItemDefs[id] && ItemDefs[id].equip) || null,
  getPlaceable: id => (ItemDefs[id] && ItemDefs[id].placeable) || null
};
