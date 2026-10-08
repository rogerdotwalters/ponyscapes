'use strict';
/* SERVER-SIDE - bags (data/items/bags.js). Your inventory is your tool belt plus the bag you wear (gear.bag): swap it for a bigger one in Gear or
 * from the bag panel. You always wear one, so the bag slot is never empty. Each of your ponies has bag slots too (Bags.ponyBagSlots): strap pony
 * bags on and they become the pony's PACK (a.bags: the bag in each slot, '' when empty; a.pack: an Inventory as big as all of them together).
 * You reach a pony's pack while you ride it, or standing next to it (CONFIG.sim.inventory.packReach), on the same grid. The bag panel shows it
 * and moves stacks between your bag and the pack. These methods are added to GameServer. */
Object.assign(GameServer.prototype, {
  /** Give a pony of yours its bag slots (and an empty pack) the first time it needs them. Returns the pony. */
  _ponyBags(a) {
    if (!a.bags) a.bags = new Array(Bags.ponyBagSlots(a)).fill('');
    if (!a.pack) { a.pack = new Inventory(0); a.pack.carryStacks = null; }
    const size = Bags.packSize(a.bags);
    if (a.pack.size !== size) a.pack.resize(size, 0);
    return a;
  },
  /** Can this animal carry bags (one of your own, kept ponies)? */
  _canWearBags(a, id) { return !!(a && a.owner === id && AnimalDefs[a.type] && AnimalDefs[a.type].pony && !a.trial && !a.captor); },
  /** The pony whose pack this player can reach right now: the one they ride, else their nearest pony within reach (the main pony first). */
  _packPonyOf(id) {
    const p = this.players[id];
    if (!p || p.boat) return null;
    const ridden = p.mount && this.animals.animals[p.mount];
    if (ridden) return this._canWearBags(ridden, id) ? this._ponyBags(ridden) : null;
    let best = null, bestD = CONFIG.sim.inventory.packReach;
    for (const a of Object.values(this.animals.animals)) {
      if (!this._canWearBags(a, id) || !sameGrid(a, p)) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y) - (a.main ? 0.75 : 0);                  // (your main pony wins a near tie)
      if (d <= bestD) { bestD = d; best = a; }
    }
    return best ? this._ponyBags(best) : null;
  },

  /* ---- your own bag ---- */
  /** Wear the bag in inventory slot `from`: everything you carry moves into it (refused if it would not fit); the old bag goes into your inventory. */
  _equipBag(id, inventory, from) {
    const p = this.players[id], item = inventory.itemIdAt(from), old = p.gear.bag;
    if (!Bags.isPlayerBag(item)) return;
    const trial = inventory.clone();
    trial.slots[from] = null;
    if (!trial.resize(Bags.playerSize({ bag: item }))) { this._notice(id, `The ${ItemDefs[item].name} is too small for everything you carry`); return; }
    if (old && trial.add(old, 1) > 0) { this._notice(id, `No room left for your ${ItemDefs[old].name}: drop something first`); return; }
    inventory.slots = trial.slots; p.gear.bag = item;
    this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'equip', to: id, item });
    this._notice(id, `You wear the ${ItemDefs[item].name} now: ${Bags.slots(item)} bag slots` + (old ? ` (your ${ItemDefs[old].name} is in it)` : ''));
  },

  /* ---- pony packs ---- */
  /** Strap the pony bag in your inventory slot `from` onto the pony you can reach (its first free bag slot). */
  _ponyBagOn(id, inventory, from) {
    const item = inventory.itemIdAt(from), a = this._packPonyOf(id);
    if (!Bags.isPonyBag(item)) return;
    if (!a) { this._notice(id, 'Ride one of your ponies, or stand next to it, to strap a bag on'); return; }
    const k = a.bags.indexOf('');
    if (k < 0) { this._notice(id, `Every bag slot of ${this._ponyName(a)} is taken: take a bag off first`); return; }
    this._takeFromSlot(inventory, from, 1);
    a.bags[k] = item; a.pack.resize(Bags.packSize(a.bags), 0);
    this.inventoryRev[id]++;
    this._notice(id, `${this._ponyName(a)} carries the ${ItemDefs[item].name} now: ${a.pack.size} pack slots`);
  },
  /** Take the bag in bag slot `index` off the pony (into your inventory). The pack must still hold everything without it. */
  _ponyBagOff(id, inventory, index) {
    const a = this._packPonyOf(id), item = a && Number.isInteger(index) ? a.bags[index] : '';
    if (!item) return;
    const bags = a.bags.slice(); bags[index] = '';
    const trial = a.pack.clone();
    if (!trial.resize(Bags.packSize(bags), 0)) { this._notice(id, 'The rest of the pack cannot hold everything: take some things out first'); return; }
    if (inventory.add(item, 1) > 0) { this._notice(id, 'No room in your bag for it'); return; }
    a.bags = bags; a.pack.slots = trial.slots;
    this.inventoryRev[id]++;
  },
  /** Move a stack between your inventory and the pack of the pony you can reach ({ pack: bool, i } each end; to.i < 0: wherever it fits). */
  _packMove(id, inventory, cmd) {
    const from = cmd.from || {}, to = cmd.to || {}, a = (from.pack || to.pack) ? this._packPonyOf(id) : null, chest = (from.chest || to.chest) ? this._chestOf(id) : null;
    if ((from.pack || to.pack) && !a) { this._notice(id, 'Your pony is too far away'); return; }
    if ((from.chest || to.chest) && !chest) { this._notice(id, 'The chest is too far away'); return; }
    const pick = r => (r.chest ? chest : r.pack ? a.pack : inventory), src = pick(from), dst = pick(to);
    const valid = (inv, i) => Number.isInteger(i) && i >= 0 && i < inv.size;
    if (!valid(src, from.i) || !src.slots[from.i]) return;
    if (src === dst) { if (src.move(from.i, to.i)) this.inventoryRev[id]++; return; }
    const stack = src.slots[from.i];
    if (!(to.i >= 0)) {                                                             // "to the pony" / "to my bag": top up stacks, then a free slot
      dst.limitHit = null;
      const left = dst.add(stack.id, stack.count);
      if (left === stack.count) { this._notice(id, dst.limitHit ? this._carryNotice(dst.limitHit) : to.chest ? 'The chest is full' : to.pack ? 'The pack is full' : 'Your bag is full'); return; }
      stack.count = left; if (!left) src.slots[from.i] = null;
      this.inventoryRev[id]++; return;
    }
    if (!valid(dst, to.i)) return;
    const there = dst.slots[to.i];
    if (there && there.id === stack.id) {                                           // same item: merge
      const moved = Math.min(ItemDB.maxStack(stack.id) - there.count, stack.count);
      if (moved <= 0) return;
      there.count += moved; stack.count -= moved; if (stack.count <= 0) src.slots[from.i] = null;
      this.inventoryRev[id]++; return;
    }
    src.slots[from.i] = there; dst.slots[to.i] = stack;                             // swap (as long as you can carry that much wood, stone and clay)
    const into = dst === inventory ? stack : there, over = into && Carry.limited(into.id) ? PackRules.overCarry(inventory) : null;
    if (over) { dst.slots[to.i] = there; src.slots[from.i] = stack; this._notice(id, this._carryNotice(over)); return; }
    this.inventoryRev[id]++;
  },
  _carryNotice(resource) { const r = ResourceTypes[resource]; return `You cannot carry more ${r ? r.name.toLowerCase() : resource}: leave it in the pack or take it to a stockpile`; },
  _ponyName(a) { return a.look ? PonyLook.describe(a.look).name : AnimalDefs[a.type].name; },

  /** Private: the pack the player can reach, only when it changed (false: none any more; null: no change). */
  packUpdateFor(id) {
    const a = this._packPonyOf(id), wire = a ? { id: a.id, name: this._ponyName(a), bags: a.bags.slice(), slots: a.pack.toJSON(), riding: this.players[id].mount === a.id, main: !!a.main } : false;
    const json = JSON.stringify(wire);
    if (this.packSent[id] === json) return null;
    this.packSent[id] = json;
    return wire;
  },

  /** packUpdateFor, but only looked at every few ticks (or when your things changed): it walks the animals. */
  packUpdateCheck(id) {
    const rev = this.inventoryRev[id];
    if (this.packCheck[id] === rev && this.tick % 5 !== 0) return null;
    this.packCheck[id] = rev;
    return this.packUpdateFor(id);
  },
  /** A pony's bags and pack for a save ({ bags, pack } or {}). */
  _exportPack(a) { return a.bags && a.bags.some(Boolean) ? { bags: a.bags.slice(), pack: a.pack ? a.pack.toJSON() : [] } : {}; },
  /** Put saved bags and pack back on a pony (already sanitized: SaveData._pack). */
  _restorePack(a, q) {
    if (!q || !Array.isArray(q.bags)) return;
    const n = Bags.ponyBagSlots(a), bags = q.bags.slice(0, n);
    while (bags.length < n) bags.push('');
    a.bags = bags; a.pack = Inventory.fromJSON(q.pack || [], null);
    if (!a.pack.resize(Bags.packSize(bags), 0)) a.pack.slots.length = Bags.packSize(bags);      // (sanitized saves always fit)
  },
  /** Things that would not fit anywhere (an older, bigger inventory): into your main pony's pack, else on the ground at your feet. */
  _stowOverflow(id, items) {
    const p = this.players[id], a = this._mainPonyOf(id);
    for (const it of items) {
      let left = it.count;
      if (a && this._canWearBags(a, id)) left = this._ponyBags(a).pack.add(it.id, left);
      if (left > 0) left = this.inventories[id].add(it.id, left);
      if (left > 0) this._dropOnGround(it.id, left, p.x + 0.4, p.y + 0.4, gridOf(p));
    }
    if (items.length) this.inventoryRev[id]++;
  }
});

const PackRules = {
  /** The resource a player inventory holds too many stacks of (the carry limit), or null. */
  overCarry(inv) {
    if (inv.carryStacks === null) return null;
    const n = {};
    for (const s of inv.slots) { const r = s && Carry.limited(s.id); if (r) n[r] = (n[r] || 0) + 1; }
    return Object.keys(n).find(r => n[r] > inv.carryStacks) || null;
  }
};
