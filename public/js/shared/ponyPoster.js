'use strict';
/* SHARED - the COIN POSTER on the wall of your home (data/furniture/basic.js `coin_poster`). Lasso a wild pony and it sheds the collector coin of its own
 * variety (data/items/ponyCoins.js); carry the coin home, open the poster and drag the coin from your bag onto its slot. One coin per variety is pinned
 * (the coin is used up), and the poster remembers what you have collected (server.posterCoins, saved with your character). */
function findPoster(map, p) {
  const [hit] = HomeCrafts.near(map, p, def => def.poster);
  if (!hit || p.asleep) return null;
  const [other] = HomeCrafts.near(map, p, def => def.container || def.wardrobe);                      // (a chest or wardrobe that is nearer than the poster keeps its own button)
  if (other && other.dist < hit.dist - 0.05) return null;
  return { kind: 'coin_poster', label: 'Look at the coin poster', dist: hit.dist, fx: hit.f.x, fy: hit.f.y };
}
Interactions.extra.unshift(findPoster);                                                               // (ahead of the chest and wardrobe: the nearer of them wins)
InteractionHandlers.coin_poster = (server, id, p, action) => { if (server._roomPiece(p, action, d => d.poster)) server.pendingEvents.push({ type: 'openPoster', to: id }); };

Object.assign(GameServer.prototype, {
  /** Press one pony coin from the bag onto the poster (you must be standing at it). */
  _posterCoin(id, item) {
    const p = this.players[id], inventory = this.inventories[id], map = p && this.mapOf(p);
    if (!p || !inventory || typeof item !== 'string' || HomeCrafts.near(map, p, def => def.poster).length === 0) return;
    const variety = PonyCoins.varietyOf(item);
    if (!variety || !inventory.has(item, 1)) return;
    const placed = this.posterCoins[id] = this.posterCoins[id] || {};
    if (placed[variety]) { this._notice(id, `Your poster already has the ${PonyVariantTable.all().find(v => v.id === variety).name} coin`); return; }
    inventory.remove(item, 1); placed[variety] = true; this.inventoryRev[id]++;
    const left = PonyCoins.ids.filter(v => !placed[v]).length;
    this._notice(id, left ? `Pinned! ${PonyCoins.ids.length - left} of ${PonyCoins.ids.length} coins on your poster` : 'Your coin poster is complete!');
    this.pendingEvents.push({ type: 'posterCoin', to: id, item });
  }
});
