'use strict';
/* SHARED - the item registry. NOTHING is listed here: every item comes from one of the data tables under js/data/items/ (materials, foods,
 * tools, weapons, gear, placeables, specials), and each table has a small "maker" below that turns a table entry into the item the rest
 * of the game uses. Adding a food, a weapon or a crown is therefore one line in ITS table: this file never changes.
 *
 * ItemRegistry / ItemDefs / ItemDB stay what the systems already call. */
const ITEM_MAKERS = [
  [Materials,    d => ({ id: d.id, name: d.name, maxStack: d.maxStack, kind: 'material' })],
  [Foods,        d => (d.category === 'drink'
    ? { id: d.id, name: d.name, maxStack: d.maxStack, kind: 'jug', drink: { thirst: d.thirst, returns: d.returns } }
    : Object.assign({ id: d.id, name: d.name, maxStack: d.maxStack, kind: d.category, food: { hunger: d.hunger, thirst: d.thirst } }, d.color ? { color: d.color } : {}))],
  [Tools,        d => ({ id: d.id, name: d.name, maxStack: d.maxStack || 1, tool: d.tool })],
  [Weapons,      d => Object.assign({ id: d.id, name: d.name, maxStack: 1, tool: d.tool }, d.kind ? { kind: d.kind } : {})],
  [WardrobeItems, d => ({ id: d.id, name: d.name, maxStack: 1, kind: 'wardrobe', equip: { slot: d.slot, body: d.body || 'any', power: d.power || 0, def: d.def || 0 }, look: d.look })],
  [Placeables,   d => ({ id: d.id, name: d.name, maxStack: d.maxStack, kind: 'building', placeable: { structure: d.id } })],
  [BagItems,     d => ({ id: d.id, name: d.name, maxStack: 1, kind: 'bag', bag: { slots: d.slots, for: d.for }, color: d.color })],
  [SpecialItems, d => Object.assign({}, d)]
];

/** Bulk resources. You carry only a few STACKS of each (Constitution + your ponies decide how many) and deliver the rest to a
 *  stockpile in town, which crafting tables pull from. An item joins a resource with `resource: 'wood'` in its table. */
const ResourceTypes = Object.freeze({
  wood:  Object.freeze({ id: 'wood',  name: 'Wood',  stockpile: 'stockpile_wood' }),
  stone: Object.freeze({ id: 'stone', name: 'Stone', stockpile: 'stockpile_stone' }),
  clay:  Object.freeze({ id: 'clay',  name: 'Clay',  stockpile: 'stockpile_clay' })
});
const ToolKinds = Object.freeze(['axe', 'hammer', 'knife', 'spear', 'bow', 'rod', 'sword', 'shovel', 'leash', 'brush', 'shears', 'hoe', 'water', 'sickle', 'hedge']);
const ItemEquipSlots = Object.freeze(['crown', 'outfit', 'cape']);                     // the wardrobe slots (equipment.js)
/** Fields any table entry may carry through to its item: rarity, resource type, where it lies about, a crafting recipe, your pictures. */
const ITEM_EXTRAS = ['rarity', 'resource', 'spawns', 'craft', 'sprites', 'lasso', 'groom', 'price', 'sell', 'color', 'dye', 'apple', 'pony', 'blade', 'edge'];

const ItemRegistry = new Registry('items', { required: ['name', 'maxStack'] });
for (const [table, make] of ITEM_MAKERS) for (const entry of table.all()) {
  const item = make(entry);
  for (const key of ITEM_EXTRAS) if (entry[key] !== undefined && item[key] === undefined) item[key] = entry[key];
  for (const key of ['tool', 'food', 'drink', 'equip', 'look', 'placeable', 'bag']) if (item[key]) item[key] = Object.freeze(Object.assign({}, item[key]));
  ItemRegistry.register(item);
}

/** Clean up one (possibly hand-edited) item from js/content/customContent.js. Built-ins keep what they build; new items cannot build structures. */
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
  if (d.equip) {
    if (!ItemEquipSlots.includes(d.equip.slot)) delete out.equip;
    else {
      out.equip = { slot: d.equip.slot, body: ['any', 'prince', 'princess'].includes(d.equip.body) ? d.equip.body : 'any', power: num(d.equip.power, 0, 2, 0), def: num(d.equip.def, 0, 25, 0) };
      out.kind = 'wardrobe';
      if (!ContentPack.isPlain(out.look)) out.look = { style: { crown: 'royal', outfit: 'tunic', cape: 'plain' }[d.equip.slot], color: d.color || null };
    }
  }
  if (d.bag !== undefined) {
    if (!ContentPack.isPlain(d.bag) || !['player', 'pony'].includes(d.bag.for)) delete out.bag;
    else { out.bag = { slots: Math.round(num(d.bag.slots, 1, 30, 5)), for: d.bag.for }; out.maxStack = 1; out.kind = 'bag'; }
  }
  if (isNew) delete out.placeable;
  out.spawns = Array.isArray(d.spawns) ? d.spawns.filter(s => s && typeof s.biome === 'string' && +s.rate > 0).map(s => ({ biome: s.biome, rate: Math.min(50, +s.rate) })) : [];
  if (d.price !== undefined) out.price = Array.isArray(d.price) ? d.price.filter(c => Array.isArray(c) && typeof c[0] === 'string' && +c[1] > 0).map(c => [c[0], Math.round(+c[1])]) : undefined;
  if (d.craft !== undefined) out.craft = Array.isArray(d.craft) ? d.craft.filter(c => Array.isArray(c) && typeof c[0] === 'string' && +c[1] > 0).map(c => [c[0], Math.round(+c[1])]) : undefined;
  return out;
}
const ItemDefs = ContentPack.mergeDefs('items', ItemRegistry.toObject(), buildItemDef);

/** Items lying about in the world, per biome: [[itemId, rate per 1000 open tiles], ...] (from each item's `spawns`). */
const ItemSpawnTable = (() => {
  const table = {};
  for (const def of Object.values(ItemDefs)) for (const s of def.spawns || []) (table[s.biome] = table[s.biome] || []).push([def.id, s.rate]);
  return Object.freeze(table);
})();

const ItemDB = {
  get: id => ItemDefs[id] || null,
  /** Any kind of apple (red, green, golden ...): ponies love them all and settle on any of them. */
  isApple: id => !!(ItemDefs[id] && ItemDefs[id].apple),
  rarity: id => rarityOf(ItemDefs[id] && ItemDefs[id].rarity),
  resource: id => (ItemDefs[id] && ItemDefs[id].resource) || null,
  maxStack: id => (ItemDefs[id] ? ItemDefs[id].maxStack : 1),
  getTool: id => (ItemDefs[id] && ItemDefs[id].tool) || null,
  getDrink: id => (ItemDefs[id] && ItemDefs[id].drink) || null,
  getUse: id => (ItemDefs[id] && ItemDefs[id].use) || null,
  getFood: id => (ItemDefs[id] && ItemDefs[id].food) || null,
  getEquip: id => (ItemDefs[id] && ItemDefs[id].equip) || null,
  getPlaceable: id => (ItemDefs[id] && ItemDefs[id].placeable) || null,
  /** A lasso's { tier, chance }, or null. */
  getLasso: id => (ItemDefs[id] && ItemDefs[id].lasso) || null,
  /** A bag's { slots, for: 'player' | 'pony' }, or null (data/items/bags.js). */
  getBag: id => (ItemDefs[id] && ItemDefs[id].bag) || null
};
