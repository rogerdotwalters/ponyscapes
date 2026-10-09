'use strict';
/* SHARED - inventory data + rules. No UI, no networking.
 * A player's inventory is their TOOL BELT (slots 0..4: the hotbar, keys 1-5) followed by the slots of the BAG they wear (gear.bag; Bags below).
 * A pony's PACK is an Inventory too: the slots of every bag strapped onto it, one after another. */
const COIN_ITEM = 'gold_coin';                          // (gold: the unit everything is priced in; see coins.js for the whole coin system)
class Inventory {
  constructor(size = Bags.playerSize(null)) {
    this.slots = new Array(size).fill(null);          // null | { id, count }
    this._coins = null;                               // a person's COIN PURSE: real coins of ten kinds, a count of each (copper first; coins.js). They live here, not in a slot (null: a pack or chest, where they are an ordinary item)
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
  /** A detached copy with the same carry limit and purse (for "would this fit?" trials). */
  clone() { const c = Inventory.fromJSON(this.toJSON(), this.carryStacks); c._coins = this._coins ? this._coins.slice() : null; return c; }
  /** Take over a trial copy's contents once the trial has worked out. */
  adopt(trial) { this.slots = trial.slots; this._coins = trial._coins ? trial._coins.slice() : null; }
  /** The purse's worth in COPPER (null where there is no purse). Assigning a number makes the fewest coins worth that. */
  get purse() { return this._coins ? Coins.total(this._coins) : null; }
  set purse(copper) { this._coins = copper === null ? null : Coins.fromTotal(copper); }
  /** The count of each kind of coin, copper first (null where there is no purse). */
  get coins() { return this._coins; }
  setCoins(arr) { this._coins = Coins.sanitize(arr); }
  /** Is this item kept in the purse here? */
  _isCoin(itemId) { return this._coins !== null && Coins.isCoin(itemId); }
  /** Open the purse. `coins`: an array of counts, or (an older save) a number of GOLD coins, which are merged up (77 gold: 7 platinum and 7 gold). Gold coins that
   *  were lying in slots (an even older save) go in too. Call once when a person's inventory is loaded. */
  openPurse(coins = 0) {
    const arr = Array.isArray(coins) ? Coins.sanitize(coins) : Coins.empty();
    if (!Array.isArray(coins)) arr[Coins.GOLD] = Math.max(0, Math.floor(coins) || 0);
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i] && this.slots[i].id === COIN_ITEM) { arr[Coins.GOLD] += this.slots[i].count; this.slots[i] = null; }
    if (!Array.isArray(coins)) Coins.merge(arr);
    this._coins = arr;
    return this;
  }

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
  count(itemId) { if (this._isCoin(itemId)) return Math.floor(this.purse / Coins.value(itemId)); return this.slots.reduce((n, s) => n + (s && s.id === itemId ? s.count : 0), 0); }

  has(itemId, amount = 1) { return this.count(itemId) >= amount; }

  /** Would `amount` items fit? (used to validate crafting / refunds before changing anything) */
  canAdd(itemId, amount) {
    if (this._isCoin(itemId)) return this.purse + amount * Coins.value(itemId) <= Coins.MAX_TOTAL;
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
    if (this._isCoin(itemId)) return Coins.pay(this._coins, amount * Coins.value(itemId));                   // (paid in the purse's own coins, with change)
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

  /** Take exactly `n` coins of this kind out of the purse (a coin dropped on the ground). False if it does not hold that many. */
  takeCoins(itemId, n) {
    const t = Coins.tierOf(itemId);
    if (this._coins === null || t < 0 || !(n > 0) || this._coins[t] < n) return false;
    this._coins[t] -= n; return true;
  }

  /** Adds items (top up stacks first, then empty slots). Returns how many did NOT fit. */
  add(itemId, amount) {
    if (this._isCoin(itemId)) { const room = Math.max(0, Math.min(amount, Math.floor((Coins.MAX_TOTAL - this.purse) / Coins.value(itemId)))); Coins.add(this._coins, Coins.tierOf(itemId), room); return amount - room; }   // (that kind of coin is added, and merges up: 10 silver -> 1 gold)
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
  ['bow', 1], ['arrow', 20], ['torch', 3], ['jug', 1], ['plank', 30], ['rope', 8], ['string', 6], ['stone', 10], ['apple', 6]
]);

function createStarterInventory() {
  const inv = new Inventory().openPurse();
  if (CONFIG.sim.testKit) { TestKit.forEach(([item, count]) => inv.add(item, count)); inv.add('gold_coin', 25); }       // (25 gold in the purse: enough for a bigger bag)
  else inv.add('axe', 1);
  return inv;
}
