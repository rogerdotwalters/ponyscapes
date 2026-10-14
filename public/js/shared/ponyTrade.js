'use strict';
/* SHARED (server) - PONY TRADE: the stable's size, sending ponies away, and the PONY VENDOR.
 *
 *   - You may keep `CONFIG.sim.ponyCap.base` ponies (30); every stable upgrade (bought with pony coins at the stable desk, ponyCare.js) adds `perLevel` more.
 *   - The stable desk's menu lists your ponies with a Remove button: the pony is sent away and goes wild (never your main pony, never one that is breeding).
 *   - The vendor (furniture `vendor: true`, in the stable) buys and sells ponies for GOLD. A few ponies are on offer each in-game day; a pony's price comes from its kind, its level and its rarity.
 *     It pays half for yours (never your main pony or one that is breeding). The vendor will not sell above your stable's pony limit. */
const PonyTrade = {
  cfg: () => CONFIG.sim.ponyTrade,
  /** Gold coins a pony of this kind, level and look is worth. */
  price(type, level, look) {
    const C = PonyTrade.cfg(), r = look ? clamp(look[5] | 0, 0, C.rarity.length - 1) : 0;
    return Math.max(1, Math.round((C.price[type] || 5) + (level || 1) * C.perLevel + C.rarity[r]));
  },
  sellPrice: (type, level, look) => Math.max(1, Math.floor(PonyTrade.price(type, level, look) * PonyTrade.cfg().sellFraction)),
  /** The ponies on offer in this stable on this in-game day (the same for everyone who asks): [{ i, gene, type, level }]. */
  stock(grid, day) {
    const C = PonyTrade.cfg();
    let h = 2166136261; for (const ch of `${grid}|${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rng = mulberry32(h >>> 0), out = [];
    for (let i = 0; i < C.stock; i++) {
      const type = C.buyKinds[Math.floor(rng() * C.buyKinds.length)], base = AnimalDefs[type].levelBase || 1;
      out.push({ i, gene: Math.floor(rng() * 2147483647), type, level: Math.min(C.maxStockLevel, Math.max(base, 1 + Math.floor(rng() * C.maxStockLevel))) });
    }
    return out;
  },
  /** How a pony looks in a vendor menu. */
  describe(type, level, look) {
    const d = PonyLook.describe(look);
    return { name: d.name, sex: d.sex, level, type, rarity: d.rarity.id, rarityName: d.rarity.name, color: d.rarity.color, kind: AnimalDefs[type].name };
  }
};

Object.assign(GameServer.prototype, {
  /** The grid of this player's own stable. */
  _stableGridOf(id) {
    const site = BuildingSites.list.find(s => s.def.stable);
    return site ? this.interiors.gridFor(id, site) : '';
  },
  /** How many ponies this player may keep. */
  _ponyCapOf(id) {
    const K = CONFIG.sim.ponyCap, room = this.care && this.care[this._stableGridOf(id)];
    return K.base + K.perLevel * ((room && room.cap) | 0);
  },
  _ponyCount: function (id) { return Object.values(this.animals.animals).filter(a => a.owner === id && AnimalDefs[a.type].pony && !a.trial).length; },

  /* ---------------------------------------- sending a pony away (the desk's menu) ---------------------------------------- */
  _removePony(id, p, aid) {
    const a = this.animals.animals[aid];
    if (!a || a.owner !== id || !AnimalDefs[a.type].pony) return;
    const name = Stable.nameOf(a);
    if (a.main) { this._notice(id, `${name} is your main pony: make another pony your main pony first`); return; }
    if (Stable.locked(a)) { this._notice(id, `${name} is breeding: leave the pair alone until the foal is born`); return; }
    if (a.rider) { this._notice(id, `${name} is being ridden`); return; }
    this._setFree(a);
    this._notice(id, `${name} was sent away and went wild`);
  },

  /* ---------------------------------------- the vendor ---------------------------------------- */
  _vendorNear(p, fx, fy) {
    const map = this.mapOf(p); if (!map || map.kind !== 'room' || !map.plan || !map.plan.layout) return null;
    const f = map.plan.layout.furniture.find(g => g.x === (fx | 0) && g.y === (fy | 0)), def = f && FurnitureDefs.get(f.id);
    return def && def.vendor && Stable.rectDist(f, p) <= Stable.REACH + 0.6 ? { f, def } : null;
  },
  _vendorDay() { return Math.floor(GameSettings.totalHours(this.tick) / 24); },
  _vendorInfo(id, p, f) {
    const grid = gridOf(p), day = this._vendorDay(), sold = (this.vendorSold = this.vendorSold || {})[grid + '|' + day] || [], cap = this._ponyCapOf(id), inv = this.inventories[id];
    const buy = PonyTrade.stock(grid, day).map(s => {
      const look = PonyLook.fromGene(s.gene, 0, AnimalDefs[s.type].rarity);
      return Object.assign({ i: s.i, price: PonyTrade.price(s.type, s.level, look), sold: sold.includes(s.i) }, PonyTrade.describe(s.type, s.level, look));
    });
    const mine = Object.values(this.animals.animals).filter(a => a.owner === id && AnimalDefs[a.type].pony && !a.trial);
    const sell = mine.map(a => Object.assign({ id: a.id, price: PonyTrade.sellPrice(a.type, a.level || 1, a.look), main: !!a.main, locked: Stable.locked(a), ridden: !!a.rider }, PonyTrade.describe(a.type, a.level || 1, a.look)));
    return { fx: f.x, fy: f.y, buy, sell, gold: Math.floor((inv.purse || 0) / Coins.value('gold_coin')), have: mine.length, cap };
  },
  _useVendor(id, p, action) {
    const hit = this._vendorNear(p, action.fx, action.fy); if (!hit || p.asleep) return;
    this.pendingEvents.push(Object.assign({ type: 'vendorMenu', to: id }, this._vendorInfo(id, p, hit.f)));
  },
  /** A button in the vendor's menu: buy (cmd.index) or sell (cmd.animal). */
  _vendorPick(id, cmd) {
    const p = this.players[id], hit = p && this._vendorNear(p, cmd.fx, cmd.fy), inv = this.inventories[id];
    if (!hit || p.asleep) return;
    const grid = gridOf(p), day = this._vendorDay(), key = grid + '|' + day, gold = Coins.value('gold_coin');
    if (cmd.act === 'buy') {
      const s = PonyTrade.stock(grid, day)[cmd.index | 0], sold = (this.vendorSold = this.vendorSold || {})[key] || (this.vendorSold[key] = []);
      if (!s || sold.includes(s.i)) { this._notice(id, 'That pony has been sold'); return; }
      const cap = this._ponyCapOf(id);
      if (this._ponyCount(id) >= cap) { this._notice(id, `You already keep ${cap} ponies: upgrade your stable at the desk, or sell one`); return; }
      const look = PonyLook.fromGene(s.gene, 0, AnimalDefs[s.type].rarity), price = PonyTrade.price(s.type, s.level, look);
      if (!Coins.pay(inv.coins, price * gold)) { this._notice(id, `That pony costs ${price} gold`); return; }
      Coins.merge(inv.coins); this.inventoryRev[id]++;
      const at = { x: hit.f.x + hit.f.w / 2, y: hit.f.y + 1.6 }, a = this.animals.release(s.type, at.x, at.y, id, s.gene, { level: s.level, variant: 0, grid });
      a.grid = grid; a.x = at.x; a.y = at.y; a.leashed = false; a.home = { x: at.x, y: at.y };
      if (this.players[id]) this._remember(id, a);
      sold.push(s.i);
      this._notice(id, `You bought ${Stable.nameOf(a)} for ${price} gold`);
    } else if (cmd.act === 'sell') {
      const a = this.animals.animals[String(cmd.animal || '')];
      if (!a || a.owner !== id || !AnimalDefs[a.type].pony) return;
      const name = Stable.nameOf(a);
      if (a.main) { this._notice(id, `${name} is your main pony: make another pony your main pony first`); return; }
      if (Stable.locked(a)) { this._notice(id, `${name} is breeding: leave the pair alone until the foal is born`); return; }
      if (a.rider) { this._notice(id, `${name} is being ridden`); return; }
      const price = PonyTrade.sellPrice(a.type, a.level || 1, a.look);
      for (const k of Object.keys(this.breeding || {})) if (k === a.stall) this._breedEnd(k);
      delete this.animals.animals[a.id];
      inv.add('gold_coin', price); this.inventoryRev[id]++;
      this._notice(id, `You sold ${name} for ${price} gold`);
      this.pendingEvents.push({ type: 'gain', to: id, item: 'gold_coin', count: price });
    } else return;
    this.pendingEvents.push(Object.assign({ type: 'vendorMenu', to: id }, this._vendorInfo(id, p, hit.f)));
  }
});

/** The vendor: the interact key opens its menu. */
function findVendor(map, p) {
  if (p.asleep || !map || map.kind !== 'room' || !map.plan || !map.plan.layout) return null;
  let best = null;
  for (const f of map.plan.layout.furniture) { const def = FurnitureDefs.get(f.id); if (def && def.vendor) { const dist = Stable.rectDist(f, p); if (dist <= Stable.REACH && (!best || dist < best.dist)) best = { dist, f }; } }
  return best ? { kind: 'vendor', label: 'Pony vendor', dist: best.dist - 0.3, fx: best.f.x, fy: best.f.y } : null;
}
Interactions.extra.unshift(findVendor);
InteractionHandlers.vendor = (server, id, p, action) => server._useVendor(id, p, action);
