'use strict';
/* SHARED - the town's storage and its upgradable buildings.
 *
 *   CARRYING     you can only carry a few STACKS of each bulk resource (wood, stone, clay): as many as your Constitution level, plus
 *                one for each pony with you (ridden or on a leash) and any Pack Pony buffs. The rest goes to a stockpile.
 *   STOCKPILES   built at the crafting table and placed like any station. Each holds ONE resource up to its capacity; walk up and press
 *                the interact key to deliver everything of that resource you carry. Upgrading one raises its capacity.
 *   CRAFTING     a crafting table (or any station) pulls missing ingredients from the stockpiles linked to it (within its link range),
 *                and outputs that do not fit in your pack go into them.
 *   UPGRADES     buildings level up with resources taken from the stockpiles round them (and your pack for the rest): a crafting table
 *                links stockpiles farther away, a stable settles wild ponies with fewer apples, a stockpile holds more.
 *
 * State lives on the World: map.stockpiles[tileKey] = { items: { itemId: count } }, map.buildingLevels[tileKey] = level (absent = 1). */
const STOCKPILE_DEPOSIT_RANGE = 1.8, TOWN_RANGE = 24;                  // tiles: deliver within arm's reach; upgrades draw on stockpiles this close to the building
const upgradeCost = (item, count) => Object.freeze({ item, count });

/** Level 1 is what you build; every later level lists what it costs. */
const BuildingUpgrades = Object.freeze({
  stockpile_wood: Object.freeze([
    { capacity: 100 }, { capacity: 250, cost: [upgradeCost('plank', 30), upgradeCost('rope', 2)] },
    { capacity: 500, cost: [upgradeCost('plank', 60), upgradeCost('stone', 10), upgradeCost('rope', 4)] }, { capacity: 1000, cost: [upgradeCost('plank', 120), upgradeCost('brick', 20), upgradeCost('rope', 6)] }
  ]),
  stockpile_stone: Object.freeze([
    { capacity: 100 }, { capacity: 250, cost: [upgradeCost('plank', 20), upgradeCost('stone', 20)] },
    { capacity: 500, cost: [upgradeCost('plank', 40), upgradeCost('stone', 50), upgradeCost('rope', 2)] }, { capacity: 1000, cost: [upgradeCost('plank', 80), upgradeCost('brick', 40), upgradeCost('rope', 4)] }
  ]),
  stockpile_clay: Object.freeze([
    { capacity: 100 }, { capacity: 250, cost: [upgradeCost('plank', 20), upgradeCost('clay', 20)] },
    { capacity: 500, cost: [upgradeCost('plank', 40), upgradeCost('brick', 20)] }, { capacity: 1000, cost: [upgradeCost('plank', 80), upgradeCost('brick', 50), upgradeCost('rope', 4)] }
  ]),
  crafting_table: Object.freeze([
    { linkRange: 10 }, { linkRange: 20, cost: [upgradeCost('plank', 30), upgradeCost('rope', 4), upgradeCost('stone', 10)] },
    { linkRange: 40, cost: [upgradeCost('plank', 60), upgradeCost('brick', 20), upgradeCost('rope', 6)] }
  ]),
  stable: Object.freeze([
    { appleDiscount: 0 }, { appleDiscount: 1, cost: [upgradeCost('plank', 30), upgradeCost('rope', 4)] },
    { appleDiscount: 2, cost: [upgradeCost('plank', 60), upgradeCost('brick', 16), upgradeCost('rope', 6)] }
  ])
});
const DEFAULT_LINK_RANGE = BuildingUpgrades.crafting_table[0].linkRange;

/** Stacks of each limited resource a player may carry. `p` is a player (lv, buffs, companions). */
const Carry = {
  limited: id => { const r = ItemDB.resource(id); return r && CONFIG.sim.carry.limited.includes(r) ? r : null; },
  stacksFor(p) {
    const C = CONFIG.sim.carry, con = Skills._a(p && p.lv, 'constitution');
    return C.base + con + Math.min(C.maxPonyBonus, ((p && p.companions) | 0) * C.perPony) + ((p && p.buffs && p.buffs.carry) | 0);
  },
  /** "2 of 3 wood stacks" style summary: { resource: { used, limit } } for an inventory. */
  usage(inventory, limit) {
    const out = {};
    for (const r of CONFIG.sim.carry.limited) out[r] = { used: 0, limit };
    for (const s of inventory.slots) { const r = s && Carry.limited(s.id); if (r) out[r].used++; }
    return out;
  }
};

/** Pulls from / pushes into a set of stockpiles as if they were one store. A clone works on a detached copy (for "would this work?"). */
class StockSupply {
  constructor(map, keys) { this.map = map; this.keys = keys; }
  get empty() { return !this.keys.length; }
  _piles() { return this.keys.map(k => ({ key: k, pile: this.map.stockpiles[k] })).filter(e => e.pile); }
  count(item) { return this._piles().reduce((n, e) => n + (e.pile.items[item] || 0), 0); }
  /** Removes up to n; returns how many were taken. */
  take(item, n) {
    let left = n;
    for (const { pile } of this._piles()) {
      const have = pile.items[item] || 0, t = Math.min(have, left);
      if (!t) continue;
      if (have - t > 0) pile.items[item] = have - t; else delete pile.items[item];
      left -= t; if (left <= 0) break;
    }
    return n - left;
  }
  /** Stores up to n in piles of the item's resource with room; returns how many did NOT fit. */
  put(item, n) {
    const resource = ItemDB.resource(item);
    let left = n;
    if (!resource) return left;
    for (const { key, pile } of this._piles()) {
      if (left <= 0) break;
      if (Stockpiles.resourceAt(this.map, key) !== resource) continue;
      const room = Stockpiles.capacity(this.map, key) - Stockpiles.total(pile), t = Math.min(room, left);
      if (t > 0) { pile.items[item] = (pile.items[item] || 0) + t; left -= t; }
    }
    return left;
  }
  clone() {
    const copy = { built: this.map.built, buildingLevels: this.map.buildingLevels, stockpiles: {} };
    for (const k of this.keys) if (this.map.stockpiles[k]) copy.stockpiles[k] = { items: Object.assign({}, this.map.stockpiles[k].items) };
    return new StockSupply(copy, this.keys.slice());
  }
}

const Stockpiles = {
  typeAt: (map, key) => { const t = map.built[key]; return (t && t.c) || null; },
  resourceAt(map, key) { const type = Stockpiles.typeAt(map, key); return type && StructureDefs[type].stockpile || null; },
  isStockpile: type => !!(type && StructureDefs[type] && StructureDefs[type].stockpile),
  total: pile => Object.values(pile.items).reduce((n, c) => n + c, 0),
  capacity(map, key) { const type = Stockpiles.typeAt(map, key); return Buildings.levelDef(map, key, type).capacity || 0; },

  /** Make sure a freshly placed stockpile has a record (call after BuildSystem.place). */
  ensure(map, tx, ty) {
    const key = tileKey(tx, ty);
    if (Stockpiles.isStockpile(Stockpiles.typeAt(map, key)) && !map.stockpiles[key]) map.stockpiles[key] = { items: {} };
  },
  /** A stockpile (or any upgraded building) was taken down. */
  forget(map, tx, ty) { const key = tileKey(tx, ty); delete map.stockpiles[key]; delete map.buildingLevels[key]; },
  isEmpty: (map, key) => !map.stockpiles[key] || Stockpiles.total(map.stockpiles[key]) === 0,

  /** Every stockpile: [{ key, tx, ty, type, resource, level, maxLevel, capacity, items, total }] sorted by distance from `from` (if given). */
  list(map, from = null) {
    const out = [];
    for (const key of Object.keys(map.stockpiles)) {
      const type = Stockpiles.typeAt(map, key);
      if (!Stockpiles.isStockpile(type)) continue;
      const pile = map.stockpiles[key], tx = keyTileX(key), ty = keyTileY(key);
      out.push({ key, tx, ty, type, resource: StructureDefs[type].stockpile, level: Buildings.level(map, key), maxLevel: BuildingUpgrades[type].length, capacity: Stockpiles.capacity(map, key),
        items: Object.assign({}, pile.items), total: Stockpiles.total(pile), dist: from ? Math.hypot(tx + 0.5 - from.x, ty + 0.5 - from.y) : 0 });
    }
    return out.sort((a, b) => a.dist - b.dist);
  },
  keysNear(map, x, y, range) {
    return Object.keys(map.stockpiles).filter(k => Stockpiles.isStockpile(Stockpiles.typeAt(map, k)) && Math.hypot(keyTileX(k) + 0.5 - x, keyTileY(k) + 0.5 - y) <= range);
  },
  /** The stockpile you are standing at (to deliver to): { key, tx, ty, type, dist } or null. */
  nearest(map, p, range = STOCKPILE_DEPOSIT_RANGE) {
    const st = BuildSystem.stationTilesNear(map, p, range).find(s => Stockpiles.isStockpile(s.type));
    return st ? Object.assign({ key: tileKey(st.tx, st.ty) }, st) : null;
  },

  /** Stockpiles the stations you stand at can reach: a crafting table's link range grows with its level. */
  linkedKeys(map, p) {
    const keys = new Set();
    for (const st of BuildSystem.stationTilesNear(map, p)) {
      if (Stockpiles.isStockpile(st.type)) { keys.add(tileKey(st.tx, st.ty)); continue; }
      const range = st.type === 'crafting_table' ? Buildings.levelDef(map, tileKey(st.tx, st.ty), st.type).linkRange : DEFAULT_LINK_RANGE;
      for (const k of Stockpiles.keysNear(map, st.tx + 0.5, st.ty + 0.5, range)) keys.add(k);
    }
    return [...keys];
  },
  supplyFor(map, p) { return new StockSupply(map, Stockpiles.linkedKeys(map, p)); },

  /** Deliver everything of the pile's resource from a pack (until the pile is full). Returns { moved: { itemId: n }, count, full }. */
  deposit(map, key, inventory) {
    const resource = Stockpiles.resourceAt(map, key), pile = map.stockpiles[key], moved = {};
    if (!resource || !pile) return { moved, count: 0, full: false };
    let room = Stockpiles.capacity(map, key) - Stockpiles.total(pile), count = 0;
    for (const slot of inventory.slots) {
      if (room <= 0) break;
      if (!slot || ItemDB.resource(slot.id) !== resource) continue;
      const t = Math.min(slot.count, room);
      moved[slot.id] = (moved[slot.id] || 0) + t; count += t; room -= t;
    }
    for (const [item, n] of Object.entries(moved)) { inventory.remove(item, n); pile.items[item] = (pile.items[item] || 0) + n; }
    return { moved, count, full: room <= 0 };
  },
  /** Take up to `count` of an item out (as much as the pack can carry). Returns how many were taken. */
  withdraw(map, key, inventory, item, count) {
    const pile = map.stockpiles[key];
    if (!pile || !(pile.items[item] > 0)) return 0;
    const want = Math.min(count, pile.items[item]), left = inventory.add(item, want), taken = want - left;
    if (taken > 0) { pile.items[item] -= taken; if (pile.items[item] <= 0) delete pile.items[item]; }
    return taken;
  },

  /** Client side: adopt the server's stockpiles and building levels. */
  replaceAll(map, data) {
    map.stockpiles = {};
    for (const [k, pile] of Object.entries(data.piles || {})) map.stockpiles[k] = { items: Object.assign({}, pile.items) };
    map.buildingLevels = Object.assign({}, data.levels || {});
    map.roomStores = Object.assign({}, data.rooms || {});                         // the bins in rooms (homeCrafts.js)
    map.roomChests = JSON.parse(JSON.stringify(data.chests || {}));                // the chests in rooms
  },
  exportState: map => ({ piles: JSON.parse(JSON.stringify(map.stockpiles)), levels: Object.assign({}, map.buildingLevels), rooms: Object.assign({}, map.roomStores || {}), chests: JSON.parse(JSON.stringify(map.roomChests || {})) })
};

const Buildings = {
  upgradeable: type => !!BuildingUpgrades[type],
  level: (map, key) => map.buildingLevels[key] || 1,
  levelDef(map, key, type) { const levels = BuildingUpgrades[type]; return levels ? levels[Math.min(levels.length, Buildings.level(map, key)) - 1] : {}; },
  /** What a level does, in words. */
  perk(type, def) {
    if (def.capacity) return `Holds ${def.capacity}`;
    if (def.linkRange) return `Uses stockpiles within ${def.linkRange} tiles`;
    if (def.appleDiscount !== undefined) return def.appleDiscount ? `Wild ponies settle with ${def.appleDiscount} fewer apple${def.appleDiscount === 1 ? '' : 's'}` : 'Wild ponies settle here';
    return '';
  },
  /** Every upgradable building: [{ key, tx, ty, type, name, level, maxLevel, perk, next:{level, perk, cost}|null, dist }]. */
  list(map, from = null) {
    const out = [];
    for (const key of Object.keys(map.built)) {
      const type = map.built[key].c;
      if (!Buildings.upgradeable(type)) continue;
      out.push(Buildings.describe(map, key, from));
    }
    return out.sort((a, b) => a.dist - b.dist);
  },
  describe(map, key, from = null) {
    const type = Stockpiles.typeAt(map, key), levels = BuildingUpgrades[type], level = Buildings.level(map, key), tx = keyTileX(key), ty = keyTileY(key);
    const nextDef = levels[level] || null;
    return { key, tx, ty, type, name: StructureDefs[type].name, level, maxLevel: levels.length, perk: Buildings.perk(type, levels[level - 1]),
      next: nextDef ? { level: level + 1, perk: Buildings.perk(type, nextDef), cost: nextDef.cost } : null, dist: from ? Math.hypot(tx + 0.5 - from.x, ty + 0.5 - from.y) : 0 };
  },
  /** Where an upgrade's resources come from: the stockpiles round the building, then the player's pack. */
  supplyFor(map, key) { return new StockSupply(map, Stockpiles.keysNear(map, keyTileX(key) + 0.5, keyTileY(key) + 0.5, TOWN_RANGE)); },
  /** How much of each cost item can be found: [{ item, count, have }]. */
  afford(map, key, inventory, costList) {
    const supply = Buildings.supplyFor(map, key);
    return costList.map(c => ({ item: c.item, count: c.count, have: supply.count(c.item) + (inventory ? inventory.count(c.item) : 0) }));
  },
  /** Level a building up, paying from stockpiles first. Returns { ok, reason?, level? }. */
  upgrade(map, key, inventory) {
    const type = Stockpiles.typeAt(map, key);
    if (!Buildings.upgradeable(type)) return { ok: false, reason: 'That cannot be upgraded' };
    const info = Buildings.describe(map, key);
    if (!info.next) return { ok: false, reason: `${info.name} is already at its highest level` };
    const short = Buildings.afford(map, key, inventory, info.next.cost).find(c => c.have < c.count);
    if (short) return { ok: false, reason: `Needs ${short.count} ${ItemDefs[short.item].name} (have ${short.have})` };
    const supply = Buildings.supplyFor(map, key);
    for (const c of info.next.cost) { const fromPiles = supply.take(c.item, c.count); if (fromPiles < c.count) inventory.remove(c.item, c.count - fromPiles); }
    map.buildingLevels[key] = info.next.level;
    return { ok: true, level: info.next.level, name: info.name };
  },
  /** A stable's apple discount for a pony standing at (x, y). */
  appleDiscountAt(map, x, y) {
    const stable = Shelter.stableNear(map, x, y);
    return stable ? Buildings.levelDef(map, tileKey(stable.tx, stable.ty), 'stable').appleDiscount || 0 : 0;
  }
};
