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
  [SpecialItems, d => Object.assign({}, d)]
];

const ItemRegistry = new Registry('items', { required: ['name', 'maxStack'] });
for (const [table, make] of ITEM_MAKERS) for (const entry of table.all()) {
  const item = make(entry);
  for (const key of ['tool', 'food', 'drink', 'equip', 'look', 'placeable']) if (item[key]) item[key] = Object.freeze(Object.assign({}, item[key]));
  ItemRegistry.register(item);
}
const ItemDefs = ItemRegistry.toObject();

const ItemDB = {
  get: id => ItemDefs[id] || null,
  maxStack: id => (ItemDefs[id] ? ItemDefs[id].maxStack : 1),
  getTool: id => (ItemDefs[id] && ItemDefs[id].tool) || null,
  getDrink: id => (ItemDefs[id] && ItemDefs[id].drink) || null,
  getUse: id => (ItemDefs[id] && ItemDefs[id].use) || null,
  getFood: id => (ItemDefs[id] && ItemDefs[id].food) || null,
  getEquip: id => (ItemDefs[id] && ItemDefs[id].equip) || null,
  getPlaceable: id => (ItemDefs[id] && ItemDefs[id].placeable) || null
};
