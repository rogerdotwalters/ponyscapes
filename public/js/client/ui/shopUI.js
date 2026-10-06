'use strict';
/* CLIENT - the Shop window: opens at a shop counter (the General Store's: shopSystem.js). What is for sale, what it costs and how many coins you
 * have (your bag plus the pack of the pony beside you), and a Buy button. It closes when you walk away from the counter. The server decides. */
class ShopUI {
  constructor({ panel, body, closeButton, game, requestOpen }) {
    this.panel = panel; this.body = body; this.game = game; this.items = []; this.site = -1; this.since = 0;
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => { const b = e.target.closest('button[data-buy]'); if (b && !b.disabled) game.buy(b.dataset.buy); });
    game.events.on('shop', e => { this.items = e.items || []; this.site = e.site; requestOpen(); });
    for (const ev of ['inventoryChanged', 'packChanged', 'gearChanged']) game.events.on(ev, () => this.isOpen && this.refresh());
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }
  /** Walked away from the counter: close. */
  tick(frameMs) {
    if (!this.isOpen || (this.since += frameMs) < 300) return;
    this.since = 0;
    if (!Shops.counterNear(this.game.map, this.game.local)) this.close();
  }
  _have(item) { const g = this.game; return g.inventory.count(item) + (g.pack ? g.pack.inventory.count(item) : 0); }
  static what(id, gear) {
    const bag = ItemDB.getBag(id);
    if (!bag) return '';
    if (bag.for === 'player') return `A bag for you: ${bag.slots} slots (yours has ${Bags.slots((gear && gear.bag) || CONFIG.sim.inventory.starterBag)})`;
    return `A pony bag: ${bag.slots} pack slots (ponies wear two or more)`;
  }
  refresh() {
    const g = this.game, site = BuildingSites.list[this.site], coins = this._have('gold_coin');
    const rows = this.items.map(id => {
      const def = ItemDefs[id], price = Shops.price(id), afford = price.every(([item, n]) => this._have(item) >= n);
      const cost = price.map(([item, n]) => `<span class="need${this._have(item) < n ? ' missing' : ''}"><img alt="" src="${ItemIcons.url(item)}">${n}</span>`).join(' ');
      return `<div class="recipe"><div class="out"><img alt="" src="${ItemIcons.url(id)}"></div><div class="info"><div class="name">${def.name}</div><small class="gwho">${ShopUI.what(id, g.gear)}</small><div class="needs">${cost}</div></div><button class="shopbuy" data-buy="${id}" ${afford ? '' : 'disabled'}>Buy</button></div>`;
    });
    this.body.innerHTML = `<div class="shophead">${site ? site.def.name : 'Shop'} &middot; you have <img alt="" src="${ItemIcons.url('gold_coin')}"> <b>${coins}</b></div>` + (rows.join('') || '<div class="gnone">Nothing for sale.</div>');
  }
}
