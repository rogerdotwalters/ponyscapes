'use strict';
/* SHARED - shops. A building whose data has `shop: [item ids]` sells those items at its shop counter (any furniture with `shop: true`, like the
 * Shop Counter). Walk up to the counter and press the interact key: the Shop window lists what is for sale and what it costs (each item's
 * `price` in its data table, in gold coins). Buying is decided by the server: it takes the coins from your bag (and then from the pack of

 * the pony beside you) and puts what you bought in your bag (or that pack). The General Store sells bags (data/items/bags.js).
 * SELLING: the same counter buys what is in your bag for gold coins: an item's `sell` (coins each, 0 = not wanted), else half its shop price,
 * else the table below, else 1 coin. Coins, carried creatures and quest items are never bought. */
const SELL_VALUES = Object.freeze({
  log: 1, plank: 2, stone: 1, hide: 2, wool: 2, bone: 1, antler: 2, hay: 1, rope: 2, clay: 1, brick: 2, string: 1, linen: 3, arrow: 1, coffee_beans: 2, bamboo: 1,
  claw: 3, fang: 3, feather: 1, chitin: 4, dragon_scale: 25, golden_apple: 6, crystal_apple: 8, pink_apple: 3, egg: 1, fried_egg: 2, jug_water: 1, message_bottle: 4,
  rabbit_meat: 2, venison: 3, mutton: 3, chicken_meat: 2, bear_meat: 4, raw_fish: 2, banana: 1, cocoa_pod: 2, sugar_cane: 1, torch: 1
});
const NEVER_BOUGHT = new Set(['gold_coin', 'bear_cub', 'dungeon_scroll', 'treasure_map']);
const SHOP_REACH = 1.4;
const Shops = {
  /** What a building site sells: [item ids] that exist and have a price. */
  stock(site) { const list = site && site.def && Array.isArray(site.def.shop) ? site.def.shop : []; return list.filter(id => ItemDefs[id] && Array.isArray(ItemDefs[id].price) && ItemDefs[id].price.length); },
  /** An item's price: [[item, count]...]. */
  price: id => (ItemDefs[id] && ItemDefs[id].price) || [],
  /** What the shop pays for one of this item (0: not bought). */
  sellValue(id) {
    const d = ItemDefs[id];
    if (!d || NEVER_BOUGHT.has(id) || d.kind === 'creature' || d.creature) return 0;
    if (Number.isFinite(d.sell)) return Math.max(0, Math.floor(d.sell));
    const coins = Array.isArray(d.price) && d.price.find(([item]) => item === 'gold_coin');
    if (coins) return Math.max(1, Math.floor(coins[1] / 2));
    if (SELL_VALUES[id]) return SELL_VALUES[id];
    if (/^cook/.test(id)) return 3;
    return 1;
  },
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
  /** Sell some of an item from your bag at the counter for gold coins. */
  _sell(id, itemId, count) {
    const p = this.players[id], inventory = this.inventories[id], near = p && Shops.counterNear(this.mapOf(p), p);
    if (!near) { this._notice(id, 'Walk up to the shop counter to sell'); return; }
    const value = Shops.sellValue(itemId), n = Math.min(clamp(count | 0, 1, 9999), inventory.count(itemId));
    if (!value || n <= 0) { this._notice(id, value ? `You have no ${ItemDefs[itemId].name.toLowerCase()} to sell` : 'The shop does not want that'); return; }
    const trial = inventory.clone(); trial.remove(itemId, n);
    if (trial.add('gold_coin', n * value)) { this._notice(id, 'No room in your bag for the coins'); return; }
    inventory.slots = trial.slots; this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'gain', to: id, item: 'gold_coin', count: n * value });
    this._notice(id, `Sold ${n} ${ItemDefs[itemId].name} for ${n * value} coin${n * value === 1 ? '' : 's'}`);
  },
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
