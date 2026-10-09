'use strict';
/* SERVER-SIDE - what players own that is NOT in their pack: their ponies and pets, items dropped on the ground, the lasso in the lasso slot,
 * and the ponies' growth (grooming, feeding, riding). Kept apart from gameServer.js; these methods are added to GameServer.
 *
 * PETS BELONG TO A PLAYER, NOT A SEAT. A seat id ('p2') is reused by whoever sits down next, so an owned animal is tied to its owner's player
 * KEY (the secret each device keeps; the host knows it). While the owner plays, `a.owner` is their seat id as before. When they leave, their pets
 * stay where they stand, owned by an opaque "away" token ('~3'), so nobody else can ride, lasso or hunt them, and the world save keeps them with
 * the key. When that player comes back (this session or after the host restarts), the token turns back into their seat id. */
Object.assign(GameServer.prototype, {
  /* ---------------------------------------- pets kept per player ---------------------------------------- */
  _tokenFor(key) {
    let token = this.keyTokens[key];
    if (!token) { token = '~' + (++this.tokenSeq); this.keyTokens[key] = token; this.tokenKeys[token] = key; }
    return token;
  },
  /** The player key behind an animal's owner (a seat id while they play, an away token while they are gone), or ''. */
  _ownerKeyOf(a) { return (a.owner && (this.playerKeys[a.owner] || this.tokenKeys[a.owner])) || ''; },

  /** A player with a key sits down: the pets waiting for them are theirs again (and the fresh starter pony goes). Returns how many came back. */
  _claimPets(id, key) {
    const token = this.keyTokens[key];
    if (!token) return 0;
    let n = 0;
    for (const a of Object.values(this.animals.animals)) {
      if (a.owner !== token) continue;
      a.owner = id; n++; this._remember(id, a);
      if (a.parkedFriend) { a.friends[id] = a.parkedFriend; delete a.parkedFriend; }
    }
    if (n) for (const a of Object.values(this.animals.animals)) if (a.owner === id && a.starter) delete this.animals.animals[a.id];
    if (n) this._ensureMainPony(id);
    return n;
  },

  /** A player leaves: a pony they were still gentling bolts; every pet they own stays put and waits for them. */
  _parkPets(id) {
    const key = this.playerKeys[id];
    for (const a of Object.values(this.animals.animals)) {
      if (a.captor === id) { this.animals.releaseWild(a.id); continue; }
      if (a.owner !== id) continue;
      if (!key || a.trial) { if (a.leashed) this.animals.unleash(a.id); continue; }       // (nobody to come back for it)
      a.leashed = false; a.rider = ''; a.home = { x: a.x, y: a.y }; a.state = 'idle'; a.vx = a.vy = 0;
      if (a.friends[id]) a.parkedFriend = a.friends[id];                                // (friendship is per seat: kept aside until they are back)
      a.owner = this._tokenFor(key);
    }
  },

  /** Every pet with a known owner, for the world save: [{ key, type, level, xp, look, hpFraction, x, y, hx, hy, friend }]. */
  _exportOwnedPets() {
    const out = [];
    for (const a of Object.values(this.animals.animals)) {
      const key = this._ownerKeyOf(a);
      if (!key || a.trial) continue;
      const friend = a.friends[a.owner] || a.parkedFriend;
      out.push(Object.assign({ key, grid: gridOf(a) || undefined, main: a.main || undefined, type: a.type, level: a.level, xp: Number.isFinite(a.xp) ? a.xp : undefined, look: a.look ? a.look.slice() : null, hpFraction: a.maxHp ? a.hp / a.maxHp : 1,
        x: a.x, y: a.y, hx: a.home ? a.home.x : a.x, hy: a.home ? a.home.y : a.y, friend: Friendship.hasBond(friend) ? Friendship.encode(friend) : null }, this._exportPack(a)));
    }
    return out;
  },
  /** Bring saved pets back into the world, waiting for their owners (sanitized by SaveData). */
  _restoreOwnedPets(list) {
    for (const q of list) {
      const pet = this.animals.release(q.type, q.x, q.y, this._tokenFor(q.key), undefined, { level: q.level, variant: q.look ? q.look[4] | 0 : 0, grid: q.grid || '' });
      if (q.look && AnimalDefs[q.type].pony) pet.look = q.look;
      if (Number.isFinite(q.xp)) pet.xp = q.xp;
      if (q.main) pet.main = true;
      pet.hp = Math.max(1, Math.round(pet.maxHp * q.hpFraction)); pet.home = { x: q.hx, y: q.hy };
      if (q.friend) pet.parkedFriend = Friendship.decode(q.friend);
      this._restorePack(pet, q);
    }
  },

  /* ---------------------------------------- items on the ground ---------------------------------------- */
  /** Put items on the ground at (x, y) on a grid ('' = the overworld), joining a pile of the same item right there. Returns the drop. */
  _dropOnGround(item, count, x, y, grid = '') {
    if (!ItemDefs[item] || !(count > 0)) return null;
    for (const d of Object.values(this.drops)) if (d.item === item && gridOf(d) === grid && Math.hypot(d.x - x, d.y - y) < 0.6 && d.count + count <= 9999) { d.count += count; this.dropsRev++; return d; }
    const ids = Object.keys(this.drops);
    if (ids.length >= CONFIG.sim.drops.max) delete this.drops[ids[0]];                  // the oldest pile goes when the world is littered
    const id = 'd' + (this.nextDropId++), drop = { id, item, count, x: +x.toFixed(3), y: +y.toFixed(3) };
    if (grid) drop.grid = grid;
    this.drops[id] = drop; this.dropsRev++;
    return drop;
  },
  /** Take `count` from one inventory slot (no stacking rules: exactly that slot). */
  _takeFromSlot(inventory, slot, count) {
    const s = Number.isInteger(slot) && inventory.slots[slot];
    if (!s) return null;
    const n = clamp(count | 0, 1, s.count);
    s.count -= n; if (s.count <= 0) inventory.slots[slot] = null;
    return { item: s.id, count: n };
  },
  /** Drop items from a slot in front of you. */
  _handleDrop(id, inventory, cmd) {
    const p = this.players[id], taken = this._takeFromSlot(inventory, cmd.slot, cmd.count);
    if (!taken) return;
    this._dropOnGround(taken.item, taken.count, p.x + Math.cos(p.facing) * 0.55, p.y + Math.sin(p.facing) * 0.55, gridOf(p));
    this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'dropped', to: id, item: taken.item, count: taken.count, x: p.x, y: p.y });
  },
  /** Tip coins out of the purse onto the ground in front of you, or (the coin bag: drag a coin out onto the world) at the spot you pointed at,
   *  which has to be within a few tiles of you and not in a wall or the water. */
  _dropCoins(id, count, x, y) {
    const p = this.players[id], inventory = this.inventories[id], n = clamp(Math.floor(count) || 0, 0, inventory.purse || 0);
    if (!p || !n) return;
    let ax = p.x + Math.cos(p.facing) * 0.55, ay = p.y + Math.sin(p.facing) * 0.55;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const reach = CONFIG.sim.drops.throwRange || 4, dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy), k = d > reach ? reach / d : 1;
      const tx = p.x + dx * k, ty = p.y + dy * k, map = this.mapOf(p);
      if (!map.isSolid(Math.floor(tx), Math.floor(ty)) && !isWaterTile(map.tile(Math.floor(tx), Math.floor(ty)))) { ax = tx; ay = ty; }
    }
    inventory.remove('gold_coin', n);
    const pile = this._dropOnGround('gold_coin', n, ax, ay, gridOf(p));
    if (pile) pile.dropT = this.tick + 3 * CONFIG.sim.tickRate;                 // (not snatched straight back: it waits a few seconds)
    this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'dropped', to: id, item: 'gold_coin', count: n, x: p.x, y: p.y });
  },
  /** Coins lying within a step of someone jump into their purse: nobody has to pick coins up. Called every few ticks. */
  _gatherCoins() {
    for (const d of Object.values(this.drops)) {
      if (d.item !== 'gold_coin' || (d.dropT || 0) > this.tick) continue;
      for (const id of this.humanIds()) {
        const p = this.players[id], inventory = this.inventories[id];
        if (!p || !sameGrid(p, d) || Math.hypot(p.x - d.x, p.y - d.y) > CONFIG.sim.drops.coinRange) continue;
        const left = inventory.add('gold_coin', d.count), took = d.count - left;
        if (took > 0) { d.count = left; this.inventoryRev[id]++; this.pendingEvents.push({ type: 'gain', to: id, item: 'gold_coin', count: took }); }
        if (d.count <= 0) { delete this.drops[d.id]; this.dropsRev++; break; }
      }
    }
  },
  /** Destroy items from a slot for good. */
  _handleDestroy(id, inventory, cmd) {
    const taken = this._takeFromSlot(inventory, cmd.slot, cmd.count);
    if (!taken) return;
    this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'destroyed', to: id, item: taken.item, count: taken.count });
  },
  /** Interact key at a pile: as much as your pack takes, and the other piles of the same thing right around you too
   *  (a felled tree's logs come up in one go). */
  _pickUpDrop(id, drop) {
    const d = this.drops[drop.id], inventory = this.inventories[id], p = this.players[id];
    if (!d) return;
    inventory.limitHit = null;
    const near = Object.values(this.drops).filter(o => o !== d && o.item === d.item && sameGrid(o, d) && Math.hypot(o.x - p.x, o.y - p.y) <= CONFIG.sim.drops.gatherRange);
    let total = 0;
    for (const pile of [d, ...near]) {
      const taken = pile.count - inventory.add(pile.item, pile.count);
      if (!taken) break;
      pile.count -= taken; total += taken; if (pile.count <= 0) delete this.drops[pile.id];
    }
    if (!total) { if (!inventory.limitHit) this._notice(id, 'Inventory full'); return; }
    this.dropsRev++; this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'gain', to: id, item: d.item, count: total });
  },
  /** Piles near any person (for snapshots). */
  dropStates() {
    const humans = this._humans(), out = {};
    for (const d of Object.values(this.drops)) if (humans.some(h => sameGrid(h, d) && Math.hypot(h.x - d.x, h.y - d.y) < ANIMAL_SYNC_RADIUS)) out[d.id] = d;
    return out;
  },

  /* ---------------------------------------- the lasso slot ---------------------------------------- */
  /** L: throw the lasso from the lasso slot. Turns the input into a Use press for the swing, with the lasso in hand. */
  _lassoInput(id, p, input) {
    if (!input.lasso || p.swingT > 0 || p.flying) return input;
    if (!p.gear.lasso) { this._notice(id, 'Your lasso slot is empty: put a lasso in it (Gear)'); return input; }
    p.lassoSwing = true;
    return Object.assign({}, input, { action: true });
  },
  _lassoDone(p) { if (p.lassoSwing && p.swingT <= 0) p.lassoSwing = false; },
  /** An animal caught in an older save kept the lasso that caught it: it comes back now (into the lasso slot if empty, else the pack,
   *  else onto the ground). Lassos are tools now and are never used up, so newer catches have nothing to return. */
  _returnLasso(id, a) {
    const p = this.players[id], inventory = this.inventories[id], item = a && a.lassoItem;
    if (!item) return;
    delete a.lassoItem;
    if (!p) return;
    if (!p.gear.lasso) p.gear.lasso = item;
    else if (inventory.add(item, 1) > 0) this._dropOnGround(item, 1, p.x, p.y, gridOf(p));
    this.inventoryRev[id]++;
  },
  /** A lasso that is a crafting ingredient may be the one in the slot: it is taken into the pack for the craft, and the new one goes in its place. */
  _craftWithLasso(id, inventory, cmd) {
    const p = this.players[id], recipe = RecipeDefs[cmd.recipe], slotted = p.gear.lasso;
    const uses = recipe && slotted && recipe.ingredients.some(i => i.item === slotted) && !inventory.has(slotted, 1) && inventory.canAdd(slotted, 1);
    if (uses) { inventory.add(slotted, 1); p.gear.lasso = ''; }
    const before = this.inventoryRev[id];
    this._handleCraft(id, inventory, cmd);
    const crafted = this.inventoryRev[id] !== before;
    if (uses && !crafted) { inventory.remove(slotted, 1); p.gear.lasso = slotted; }                       // it did not work: put it back
    const made = crafted && recipe.outputs.find(o => ItemDB.getLasso(o.item));
    if (made && !p.gear.lasso && inventory.remove(made.item, 1)) { p.gear.lasso = made.item; this.inventoryRev[id]++; }
  },

  /* ---------------------------------------- your main pony ---------------------------------------- */
  /** Your main pony: the one pony that follows you everywhere (into buildings and caves too). */
  _mainPonyOf(id) { return Object.values(this.animals.animals).find(a => a.owner === id && a.main) || null; },
  /** Riding one of your own ponies: make it your main pony (the old one stays where it is, near its new home). */
  _makeMainPony(id) {
    const p = this.players[id], a = p && this.animals.animals[p.mount];
    if (!a || a.owner !== id || !AnimalDefs[a.type].pony || a.trial) { this._notice(id, 'Ride one of your own ponies to make it your main pony'); return; }
    if (a.main) { this._notice(id, 'This is already your main pony'); return; }
    const old = this._mainPonyOf(id);
    if (old) { old.main = false; old.home = { x: old.x, y: old.y }; old.state = 'idle'; }
    a.main = true;
    const name = a.look ? PonyLook.describe(a.look).name : AnimalDefs[a.type].name;
    this._notice(id, `${name} is your main pony now: it will follow you everywhere` + (old ? `. ${old.look ? PonyLook.describe(old.look).name : 'Your old one'} stays where it is` : ''));
    this.pendingEvents.push({ type: 'mainPony', to: id, x: a.x, y: a.y, name });
  },
  /** A main pony left far behind (you galloped off on another pony, or it is on another grid) catches up beside you. */
  _keepMainPoniesClose() {
    for (const id of this.humanIds()) {
      const p = this.players[id], a = this._mainPonyOf(id);
      if (!p || !a || a.rider || a.leashed || p.mount === a.id || p.boat) continue;
      if (sameGrid(a, p) && Math.hypot(a.x - p.x, a.y - p.y) < 12) continue;
      const spot = findLanding(this.mapOf(p), p.x - Math.cos(p.facing) * 1.5, p.y - Math.sin(p.facing) * 1.5, AnimalDefs[a.type].radius);
      a.grid = gridOf(p); a.x = spot.x; a.y = spot.y; a.vx = a.vy = 0; a.home = { x: a.x, y: a.y }; a.state = 'idle';
    }
  },
  /** Somebody with ponies but no main pony (an older save): their first pony becomes it. */
  _ensureMainPony(id) {
    if (this._mainPonyOf(id)) return;
    const first = Object.values(this.animals.animals).find(a => a.owner === id && AnimalDefs[a.type].pony && !a.trial);
    if (first) first.main = true;
  },

  /* ---------------------------------------- ponies grow ---------------------------------------- */
  /** XP for a pony someone owns; it levels up (faster, sturdier) when it has enough. */
  _ponyXp(a, amount) {
    const def = a && AnimalDefs[a.type];
    if (!def || !def.pony || !this.players[a.owner] || !(amount > 0) || a.trial) return;
    if (!Number.isFinite(a.xp)) a.xp = PonyXp.xpFor(a.level);
    a.xp += amount;
    const level = PonyXp.levelFor(a.xp);
    if (level <= a.level) return;
    const frac = a.maxHp ? a.hp / a.maxHp : 1;
    a.level = level; a.maxHp = Math.max(1, Math.round(def.hp * AnimalLevels.hpFactor(level))); a.hp = Math.max(1, Math.round(a.maxHp * frac));
    const rider = this.players[a.rider];
    if (rider) rider.mountLevel = level;
    const name = a.look ? PonyLook.describe(a.look).name : def.name, speed = PonySpeed.top(a.type, level);
    this.pendingEvents.push({ type: 'ponyLevel', to: a.owner, id: a.id, x: a.x, y: a.y, level, name, speed });
    this._notice(a.owner, `${name} reached level ${level}! Top speed ${speed.toFixed(1)} tiles a second`);
  },
  /** Riding: XP for the distance covered (paid out every few tiles). */
  _rideXp(p, a) {
    a.travel = (a.travel || 0) + Math.hypot(p.vx, p.vy) * TICK_DT;
    if (a.travel >= 5) { this._ponyXp(a, a.travel * CONFIG.sim.ponyLeveling.travelXpPerTile); a.travel = 0; }
  },
  /** A brush on your own pony: it grows fonder and gains XP (a better brush, more XP). */
  _groom(id, a, itemId) {
    const result = this.friendship.act(id, a, 'groom');
    if (!result || result.cooling) return;
    const mult = (ItemDefs[itemId] && ItemDefs[itemId].groom) || 1;
    this._ponyXp(a, CONFIG.sim.ponyLeveling.groomXp * mult);
    this.pendingEvents.push({ type: 'groomed', to: id, x: a.x, y: a.y, name: a.look ? PonyLook.describe(a.look).name : AnimalDefs[a.type].name });
  },
  /** Feeding your own pony a treat: XP too (more for food it likes). */
  _treat(id, p, act) {
    const a = this.animals.animals[act.animal.id], item = p.held, liked = a && a.opinionOf(item) !== 'neutral';
    const result = this.friendship.act(id, a, 'feed', item);
    if (result && result.points > 0 && a.owner === id) this._ponyXp(a, liked ? CONFIG.sim.ponyLeveling.feedLikedXp : CONFIG.sim.ponyLeveling.feedXp);
    return result;
  }
});

/** The brush: find a pet of yours within reach and groom it. */
class GroomHandler {
  constructor(deps) { Object.assign(this, deps); }
  find(p, tool) {
    let best = null;
    for (const a of Object.values(this.animals.animals)) {
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (a.owner === p.id && !a.rider && sameGrid(a, p) && d <= tool.reach + AnimalDefs[a.type].radius && (!best || d < best.d)) best = { a, d };
    }
    if (!best) { this.emit({ type: 'notice', to: p.id, text: 'Stand beside a pony of yours to groom it' }); return null; }
    return { ref: best.a.id, x: best.a.x, y: best.a.y };
  }
  isValid(p, target, tool) { const a = this.animals.animals[target.ref]; return !!a && a.owner === p.id && Math.hypot(a.x - p.x, a.y - p.y) <= tool.reach + 1; }
  apply(id, target) { this.groom(id, this.animals.animals[target.ref], this.getPlayer(id).held); }
}
