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

/** Server side: buying. Added to GameServer. */
Object.assign(GameServer.prototype, {
  _buy(id, itemId) {
    const p = this.players[id], inventory = this.inventories[id], near = p && Shops.counterNear(this.mapOf(p), p);
    if (!near) { this._notice(id, 'Walk up to the shop counter to buy'); return; }
    if (!Shops.stock(near.site).includes(itemId)) return;
    const pony = this._packPonyOf(id), pack = pony ? pony.pack : null, price = Shops.price(itemId);
    const have = item => inventory.count(item) + (pack ? pack.count(item) : 0);
    const short = price.find(([item, n]) => have(item) < n);
    if (short) { this._notice(id, `You need ${short[1]} ${ItemDefs[short[0]].name.toLowerCase()}s for the ${ItemDefs[itemId].name} (you have ${have(short[0])})`); return; }
    const trialInv = inventory.clone(), trialPack = pack ? pack.clone() : null;                // pay, then see whether it fits
    for (const [item, n] of price) { const fromBag = Math.min(trialInv.count(item), n); trialInv.remove(item, fromBag); if (n > fromBag) trialPack.remove(item, n - fromBag); }
    let left = trialInv.add(itemId, 1);
    if (left && trialPack) left = trialPack.add(itemId, left);
    if (left) { this._notice(id, 'No room in your bag for it'); return; }
    inventory.slots = trialInv.slots; if (pack) pack.slots = trialPack.slots;
    this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'bought', to: id, item: itemId, x: p.x, y: p.y });
    this._notice(id, `You bought the ${ItemDefs[itemId].name}` + (Bags.isPlayerBag(itemId) ? ': wear it from your bag (Wear bag) or Gear' : Bags.isPonyBag(itemId) ? ': put it on your pony from your bag (Put on pony)' : ''));
  }
});
