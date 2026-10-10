'use strict';
/* SHARED - shops. A building whose data has `shop: [item ids]` sells those items at its shop counter (any furniture with `shop: true`, like the
 * Shop Counter). Walk up to the counter and press the interact key: the Shop window lists what is for sale and what it costs (each item's
 * `price` in its data table, in gold coins). Buying is decided by the server: it takes the coins from your bag (and then from the pack of
 * the pony beside you) and puts what you bought in your bag (or that pack). The General Store sells bags (data/items/bags.js). */
const SHOP_REACH = 1.4;
const Shops = {
  /** What a building site sells: [item ids] that exist and have a price. */
  stock(site) { const list = site && site.def && Array.isArray(site.def.shop) ? site.def.shop : []; return list.filter(id => ItemDefs[id] && Array.isArray(ItemDefs[id].price) && ItemDefs[id].price.length); },
  /** An item's price: [[item, count]...]. */
  price: id => (ItemDefs[id] && ItemDefs[id].price) || [],
  /** What a price asks for in coins, in COPPER (the coin entries of the price, any kind of coin, added up). */
  coinPrice: price => price.reduce((sum, [item, n]) => sum + (Coins.isCoin(item) ? n * Coins.value(item) : 0), 0),
  /** What the shop pays for ONE of an item, in COPPER (0 = it buys nothing: coins). Every other item sells. In order: the item's own `sell` (copper, in its data); 40% of what the
   *  shop charges for it; 60% of what its ingredients sell for; food by what it fills (2 copper a point); a tool or weapon by its damage; else by rarity. At least 1. */
  sellPrice(id, depth = 0) {
    const def = ItemDefs[id];
    if (!def || Coins.isCoin(id) || depth > 4) return 0;
    if (Shops._sell[id] !== undefined) return Shops._sell[id];
    const own = Number.isFinite(+def.sell) ? Math.max(0, Math.round(+def.sell)) : null, buy = Shops.coinPrice(Shops.price(id));
    let v;
    if (own !== null) v = own;
    else if (buy > 0) v = buy * 0.4;
    else if (Array.isArray(def.craft) && def.craft.length) v = 0.6 * def.craft.reduce((sum, [item, n]) => sum + Shops.sellPrice(item, depth + 1) * (+n || 1), 0);
    else if (def.food) v = ((+def.food.hunger || 0) + (+def.food.thirst || 0)) * 2;
    else if (def.tool) v = 60 + 40 * (+def.tool.damage || 0);
    else v = Shops.RARITY_SELL[def.rarity] || Shops.RARITY_SELL.common;
    v = own === 0 ? 0 : Math.max(1, Math.round(v));
    if (depth === 0) Shops._sell[id] = v;
    return v;
  },
  RARITY_SELL: { common: 20, uncommon: 60, rare: 200, epic: 600, legendary: 2000 },                       // copper, for something with no price, recipe, food value or tool
  _sell: {},
  /** Pure (client + server): a shop counter within reach of p in this room? { site, dist } or null. */
  counterNear(map, p) {
    if (!map || map.kind !== 'room' || !map.plan || !map.plan.layout) return null;
    const site = Grids.siteOf(map.grid);
    if (!Shops.stock(site).length) return null;
    let best = null;
    for (const f of map.plan.layout.furniture) {
      const def = FurnitureDefs.get(f.id);
      if (!def || !def.shop) continue;
      const dx = Math.max(f.x - p.x, 0, p.x - (f.x + f.w)), dy = Math.max(f.y - p.y, 0, p.y - (f.y + f.h)), d = Math.hypot(dx, dy);
      if (d <= SHOP_REACH && (!best || d < best.dist)) best = { site, dist: d };
    }
    return best;
  }
};

function findShopInteraction(map, p) {
  const near = Shops.counterNear(map, p);
  return near ? { kind: 'shop', label: 'Shop', dist: near.dist, site: near.site.index } : null;
}
Interactions.extra.push(findShopInteraction);
InteractionHandlers.shop = (server, id, p, action) => server.pendingEvents.push({ type: 'shop', to: id, site: action.site, items: Shops.stock(BuildingSites.list[action.site]) });

/** Server side: buying and selling. Added to GameServer. */
Object.assign(GameServer.prototype, {
  /** Sell `count` of an item from the bag at a shop counter (the General Store buys EVERYTHING but coins). The coins go straight into the purse. */
  _sell(id, itemId, count) {
    const p = this.players[id], inventory = this.inventories[id], near = p && Shops.counterNear(this.mapOf(p), p);
    if (!near) { this._notice(id, 'Walk up to the shop counter to sell'); return; }
    const each = Shops.sellPrice(itemId);
    if (!each) { this._notice(id, 'The shop does not buy that'); return; }
    const n = Math.min(inventory.count(itemId), Math.max(1, Math.floor(+count) || 1));
    if (n < 1) return;
    const total = each * n;
    if (inventory.purse + total > Coins.MAX_TOTAL) { this._notice(id, 'Your coin purse is full'); return; }
    inventory.remove(itemId, n);
    Coins.add(inventory._coins, 0, total); Coins.merge(inventory._coins);                                    // (copper in; the purse merges up)
    this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'sold', to: id, item: itemId, count: n, copper: total, x: p.x, y: p.y });
    this._notice(id, `Sold ${n} ${ItemDefs[itemId].name} for ${Coins.format(total)}`);
  },

  /** `pay`: the coins the player put on the counter (an array of counts, copper first). The coin part of the price is taken from THEM (the shop gives
   *  change when a bigger coin was needed); anything else a price asks for comes out of the bag (and the pack beside you) as before. */
  _buy(id, itemId, pay) {
    const p = this.players[id], inventory = this.inventories[id], near = p && Shops.counterNear(this.mapOf(p), p);
    if (!near) { this._notice(id, 'Walk up to the shop counter to buy'); return; }
    if (!Shops.stock(near.site).includes(itemId)) return;
    const pony = this._packPonyOf(id), pack = pony ? pony.pack : null, price = Shops.price(itemId), coinPrice = Shops.coinPrice(price), others = price.filter(([item]) => !Coins.isCoin(item));
    const have = item => inventory.count(item) + (pack ? pack.count(item) : 0);
    const short = others.find(([item, n]) => have(item) < n);
    if (short) { this._notice(id, `You need ${short[1]} ${ItemDefs[short[0]].name.toLowerCase()}s for the ${ItemDefs[itemId].name} (you have ${have(short[0])})`); return; }
    const paid = Coins.sanitize(pay), paidTotal = Coins.total(paid);
    if (coinPrice > 0) {
      if (inventory.coins === null || paid.some((n, t) => n > inventory.coins[t])) { this._notice(id, 'Put coins from your bag on the counter'); return; }
      if (paidTotal < coinPrice) { this._notice(id, `The counter needs ${Coins.format(coinPrice)}: you put down ${Coins.format(paid)}`); return; }
    }
    const trialInv = inventory.clone(), trialPack = pack ? pack.clone() : null;                // pay, then see whether it fits
    for (const [item, n] of others) { const fromBag = Math.min(trialInv.count(item), n); trialInv.remove(item, fromBag); if (n > fromBag) trialPack.remove(item, n - fromBag); }
    if (coinPrice > 0) {
      for (let t = 0; t < Coins.N; t++) trialInv._coins[t] -= paid[t];                          // the coins on the counter go to the shop ...
      const change = Coins.fromTotal(paidTotal - coinPrice);
      for (let t = 0; t < Coins.N; t++) if (change[t]) Coins.add(trialInv._coins, t, change[t]);   // ... and the change comes back
      Coins.merge(trialInv._coins);                                                               // (and the purse merges up again)
    }
    let left = trialInv.add(itemId, 1);
    if (left && trialPack) left = trialPack.add(itemId, left);
    if (left) { this._notice(id, 'No room in your bag for it'); return; }
    inventory.adopt(trialInv); if (pack) pack.slots = trialPack.slots;
    this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'bought', to: id, item: itemId, x: p.x, y: p.y });
    this._notice(id, `You bought the ${ItemDefs[itemId].name}` + (coinPrice > paidTotal ? '' : paidTotal > coinPrice ? ` (change: ${Coins.format(paidTotal - coinPrice)})` : '') + (Bags.isPlayerBag(itemId) ? ': wear it from your bag (Wear bag) or Gear' : Bags.isPonyBag(itemId) ? ': put it on your pony from your bag (Put on pony)' : ''));
  }
});
