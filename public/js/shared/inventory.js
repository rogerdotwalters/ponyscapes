'use strict';
/* SHARED - inventory data + rules. No UI, no networking.
 * A player's inventory is their TOOL BELT (slots 0..4: the hotbar, keys 1-5) followed by the slots of the BAG they wear (gear.bag; Bags below).
 * A pony's PACK is an Inventory too: the slots of every bag strapped onto it, one after another. */
class Inventory {
  constructor(size = Bags.playerSize(null)) {
    this.slots = new Array(size).fill(null);          // null | { id, count }
    this.carryStacks = null;                          // stacks of EACH limited resource (wood, stone, clay) this pack may hold; null = no limit (see Carry)
    this.limitHit = null;                             // the resource an add() was last turned away for (the server tells the player why)
  }

  static fromJSON(data, carryStacks = null) {
    const inv = new Inventory(data.length);
    data.forEach((s, i) => { inv.slots[i] = s ? { id: s.id, count: s.count } : null; });
    inv.carryStacks = carryStacks;
    return inv;
  }
  toJSON() { return this.slots.map(s => (s ? { id: s.id, count: s.count } : null)); }
  /** A detached copy with the same carry limit (for "would this fit?" trials). */
  clone() { return Inventory.fromJSON(this.toJSON(), this.carryStacks); }

  /** How many more NEW stacks of this item's resource the carry limit allows (Infinity when it is not limited). */
  _stackAllowance(itemId) {
    const resource = this.carryStacks === null ? null : Carry.limited(itemId);
    if (!resource) return Infinity;
    let used = 0;
    for (const s of this.slots) if (s && Carry.limited(s.id) === resource) used++;
    return Math.max(0, this.carryStacks - used);
  }

  get size() { return this.slots.length; }
  getSlot(index) { return this.slots[index] || null; }
  itemIdAt(index) { const s = this.getSlot(index); return s ? s.id : ''; }
  count(itemId) { return this.slots.reduce((n, s) => n + (s && s.id === itemId ? s.count : 0), 0); }

  has(itemId, amount = 1) { return this.count(itemId) >= amount; }

  /** Would `amount` items fit? (used to validate crafting / refunds before changing anything) */
  canAdd(itemId, amount) {
    const max = ItemDB.maxStack(itemId);
    let room = 0, newStacks = this._stackAllowance(itemId);
    this.slots.forEach(s => {
      if (s && s.id === itemId) room += max - s.count;
      else if (!s && newStacks > 0) { room += max; newStacks--; }
    });
    return room >= amount;
  }

  /** Removes items, preferring the backpack end so hotbar stacks stay put. Returns false if there aren't enough. */
  remove(itemId, amount) {
    if (!this.has(itemId, amount)) return false;
    let left = amount;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== itemId) continue;
      const taken = Math.min(s.count, left);
      s.count -= taken; left -= taken;
      if (s.count <= 0) this.slots[i] = null;
    }
    return true;
  }

  /** Adds items (top up stacks first, then empty slots). Returns how many did NOT fit. */
  add(itemId, amount) {
    const max = ItemDB.maxStack(itemId);
    let left = amount;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (left <= 0) break;
      if (s && s.id === itemId && s.count < max) { const t = Math.min(max - s.count, left); s.count += t; left -= t; }
    }
    let newStacks = this._stackAllowance(itemId);
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      if (newStacks <= 0) { this.limitHit = Carry.limited(itemId); break; }        // carrying all the stacks of this resource you can
      const t = Math.min(max, left);
      this.slots[i] = { id: itemId, count: t }; left -= t; newStacks--;
    }
    return left;
  }

  /** Grow or shrink to n slots (a new bag). Stacks beyond the end move into free slots (the bag first, then the belt). False (and nothing
   *  changes) if they would not all fit. */
  resize(n, firstFree = CONFIG.sim.inventory.hotbarSlots) {
    const kept = this.slots.slice(0, n), extra = this.slots.slice(n).filter(Boolean);
    while (kept.length < n) kept.push(null);
    const free = [];
    for (let i = 0; i < n; i++) if (!kept[i]) free.push(i);
    free.sort((a, b) => (a >= firstFree) === (b >= firstFree) ? a - b : a >= firstFree ? -1 : 1);
    if (extra.length > free.length) return false;
    extra.forEach((stack, k) => { kept[free[k]] = stack; });
    this.slots = kept;
    return true;
  }
  /** How many slots hold something. */
  get used() { return this.slots.reduce((n, s) => n + (s ? 1 : 0), 0); }

  /** Moves a stack: merges into the same item, otherwise swaps. Returns true if anything changed. */
  move(from, to) {
    const valid = i => Number.isInteger(i) && i >= 0 && i < this.slots.length;
    if (!valid(from) || !valid(to) || from === to) return false;
    const a = this.slots[from], b = this.slots[to];
    if (!a) return false;
    if (b && b.id === a.id) {
      const moved = Math.min(ItemDB.maxStack(a.id) - b.count, a.count);
      b.count += moved; a.count -= moved;
      if (a.count <= 0) this.slots[from] = null;
      return moved > 0;
    }
    this.slots[from] = b; this.slots[to] = a;
    return true;
  }
}

/** Bags: how big a player's inventory and a pony's pack are. */
const Bags = {
  get BELT() { return CONFIG.sim.inventory.hotbarSlots; },
  /** Slots a bag item adds (0 for anything that is not a bag). */
  slots: id => { const b = ItemDB.getBag(id); return b ? b.slots : 0; },
  isPlayerBag: id => { const b = ItemDB.getBag(id); return !!(b && b.for === 'player'); },
  isPonyBag: id => { const b = ItemDB.getBag(id); return !!(b && b.for === 'pony'); },
  /** A player's inventory size: the belt plus the bag they wear (a missing bag counts as the starter backpack). */
  playerSize(gear) { const bag = gear && Bags.isPlayerBag(gear.bag) ? gear.bag : CONFIG.sim.inventory.starterBag; return Bags.BELT + Bags.slots(bag); },
  /** How many bags a pony can wear: 2, 3 for a rare or epic pony, 4 for a legendary one. */
  ponyBagSlots(a) { const order = a && a.look ? a.look[5] | 0 : 0; return CONFIG.sim.inventory.ponyBagSlots + (order >= 4 ? 2 : order >= 2 ? 1 : 0); },
  /** A pony's pack size: all its bags together. */
  packSize: bags => (bags || []).reduce((n, id) => n + Bags.slots(id), 0)
};

/** The starting pack. The testing version hands out every basic tool and a stock of materials: the belt and the starter backpack take the tools,
 *  the starter pony's side pack the rest (TestKitPony: gameServer._giveStarterPony). Otherwise just an axe. */
const TestKit = Object.freeze([
  ['axe', 1], ['stone_hammer', 1], ['knife', 1], ['shovel', 1], ['fishing_rod', 1],              // the tool belt (keys 1-5)
  ['sickle', 1], ['brush', 1], ['hoe', 1], ['watering_can', 1], ['seed_turnip', 10]                // the starter backpack (the Old Rope Lasso waits in the lasso slot)
]);
const TestKitPony = Object.freeze([                                                               // the starter pony's side pack: all ten slots
  ['bow', 1], ['arrow', 20], ['torch', 3], ['jug', 1], ['plank', 30], ['rope', 8], ['string', 6], ['stone', 10], ['apple', 6], ['gold_coin', 25]   // (gold for a bigger bag)
]);

function createStarterInventory() {
  const inv = new Inventory();
  if (CONFIG.sim.testKit) TestKit.forEach(([item, count]) => inv.add(item, count)); else inv.add('axe', 1);
  return inv;
}
