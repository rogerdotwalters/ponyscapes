'use strict';
/* CLIENT - the Shop window: opens at a shop counter (the General Store's: shopSystem.js). What is for sale and what it costs, as the COINS the shop asks
 * for ("x2" beside the coin's picture, the same coin you have in your coin bag). Press Buy and the coin bag opens beside the window, and the counter has a SLOT
 * for every kind of coin the price asks for, with how many it needs beside it ("0 / 5"). HOLD a coin and drag it onto its slot: it has to be the right kind (to pay
 * 5 copper put in 5 copper coins; break or merge coins in the bag to get the kinds you need). When every slot is full the shop takes the coins and hands over the
 * goods. Click a slot to take a coin back. It closes when you walk away from the
 * counter. The server decides (shopSystem.js). */
class ShopUI {
  constructor({ panel, body, closeButton, game, requestOpen, coinBag }) {
    this.panel = panel; this.body = body; this.game = game; this.coinBag = coinBag; this.items = []; this.site = -1; this.since = 0;
    this.tab = 'buy';                                                                    // 'buy' or 'sell' (the General Store buys everything but coins)
    this.paying = null;                                                                  // { item, ask (coins the shop asks for), copper, offered, sent }
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => {
      const t = e.target.closest('button[data-tab]'); if (t) { this.tab = t.dataset.tab; this.refresh(); return; }
      const s = e.target.closest('button[data-sell]'); if (s) { this.game.sell(s.dataset.sell, s.dataset.count === 'all' ? 9999 : 1); return; }
      const b = e.target.closest('button[data-buy]'); if (b && !b.disabled) { this._buy(b.dataset.buy); return; }
      if (e.target.closest('button[data-cancel]')) { this._stopPaying(); this.refresh(); return; }
      const chip = e.target.closest('[data-take]'); if (chip && this.paying && !this.paying.sent) this.coinBag.unoffer(Number(chip.dataset.take));
    });
    game.events.on('shop', e => { this.items = e.items || []; this.site = e.site; requestOpen(); });
    game.events.on('bought', () => { if (this.paying) { this._stopPaying(); this.refresh(); } });
    for (const ev of ['inventoryChanged', 'packChanged', 'gearChanged']) game.events.on(ev, () => this.isOpen && !this.paying && this.refresh());
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this._stopPaying(); this.refresh(); }
  close() { this.panel.hidden = true; this._stopPaying(); }
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

  /** "x2 [coin]" for each kind of coin a price asks for (a price in gold is shown in the biggest coins that make it: 25 gold is x2 platinum and x5 gold). */
  static askChips(copper, offered = null) {
    const ask = Coins.fromTotal(copper), out = [];
    for (let t = Coins.N - 1; t >= 0; t--) if (ask[t]) out.push(`<span class="coinChip${offered && offered[t] >= ask[t] ? ' met' : ''}" title="${Coins.TIERS[t].name}">x${ask[t]}<img alt="${Coins.TIERS[t].name}" src="${ItemIcons.url(Coins.TIERS[t].id)}"></span>`);
    return out.join(' ');
  }

  /* ---- buying: put the coins on the counter ---- */
  _buy(id) {
    const copper = Shops.coinPrice(Shops.price(id)), g = this.game;
    if (copper <= 0) { g.buy(id, Coins.empty()); return; }                              // (nothing to pay in coins: the server takes whatever else it asks for)
    if ((g.inventory.purse || 0) < copper) return;
    this.paying = { item: id, copper, offered: Coins.empty(), sent: false };
    this.panel.classList.add('paying');
    this.refresh();
    const zone = this.body.querySelector('#shopCounter'), need = Coins.fromTotal(copper);
    this.coinBag.startPay({
      zone, onOffer: offered => this._offered(offered),
      slotAt: q => { for (const el of zone.querySelectorAll('[data-slot]')) { const r = el.getBoundingClientRect(); if (q.x >= r.left - 6 && q.x <= r.right + 6 && q.y >= r.top - 6 && q.y <= r.bottom + 6) return Number(el.dataset.slot); } return -1; },
      hasSlot: t => need[t] > 0,
      accepts: t => need[t] > 0 && this.paying && this.paying.offered[t] < need[t],
      onReject: (t, slot) => this._reject(t, slot),
      onOver: slot => zone.querySelectorAll('[data-slot]').forEach(el => el.classList.toggle('over', Number(el.dataset.slot) === slot))
    });
  }
  _stopPaying() { if (this.paying) { this.paying = null; this.coinBag.endPay(); } this.panel.classList.remove('paying'); }
  _offered(offered) {
    const pay = this.paying; if (!pay || pay.sent) return;
    pay.offered = offered;
    if (Coins.total(offered) >= pay.copper) {                                           // enough on the counter: the shop takes it
      pay.sent = true; this.game.buy(pay.item, offered); this.coinBag.commitOffer();
      this._drawPay();
      setTimeout(() => { if (this.paying === pay) { pay.sent = false; this._drawPay(); } }, 1800);   // (if the shop refused, the coins come back to the bag and you can try again)
      return;
    }
    this._drawPay();
  }
  /** A coin was let go over the wrong slot (or one that is full / not asked for): it goes back in the bag, and the counter says why. */
  _reject(t, slot) {
    const pay = this.paying, note = this.body.querySelector('#shopPaid'); if (!pay || !note) return;
    const name = Coins.TIERS[t].name, need = Coins.fromTotal(pay.copper);
    pay.note = slot >= 0 && slot !== t ? `That slot takes ${Coins.TIERS[slot].name} coins. Break or merge coins in your bag to get the right kind.`
      : need[t] > 0 ? `You have already put down all the ${name} coins it asks for.` : `This price does not use ${name} coins. Break or merge coins in your bag to get the kinds it asks for.`;
    note.textContent = pay.note; note.classList.add('warn'); clearTimeout(pay.noteTimer); pay.noteTimer = setTimeout(() => { if (this.paying === pay) { pay.note = ''; this._drawPay(); } }, 3200);
  }
  _drawPay() {
    const pay = this.paying, zone = this.body.querySelector('#shopCounter'); if (!pay || !zone) return;
    const need = Coins.fromTotal(pay.copper), slots = [];
    for (let t = Coins.N - 1; t >= 0; t--) if (need[t]) {
      const got = pay.offered[t], full = got >= need[t];
      slots.push(`<div class="paySlot${full ? ' full' : ''}${got ? ' has' : ''}" data-slot="${t}"${got ? ` data-take="${t}" title="Take one back"` : ''}><img alt="${Coins.TIERS[t].name}" src="${ItemIcons.url(Coins.TIERS[t].id)}"><span class="slotName">${Coins.TIERS[t].name}</span><b class="slotCount">${got} / ${need[t]}</b></div>`);
    }
    zone.innerHTML = pay.sent ? '<span class="paying">Paying...</span>' : slots.join('');
    const note = this.body.querySelector('#shopPaid'); note.classList.toggle('warn', !!pay.note);
    note.textContent = pay.sent ? '' : pay.note || 'Drag each coin onto its slot';
  }

  refresh() {
    const g = this.game, site = BuildingSites.list[this.site], purse = InventoryUI.coinHtml(g.inventory.coins);
    if (this.paying) {                                                                  // the counter: what the shop asks for, and where the coins go
      const id = this.paying.item, def = ItemDefs[id];
      this.body.innerHTML = `<div class="payTitle"><img alt="" src="${ItemIcons.url(id)}"><span>${def.name}</span><small>${site ? site.def.name : 'Shop'}</small></div>` +
        `<div class="shopPay"><div class="askLine"><span>Put down:</span></div><div id="shopCounter"></div><div class="paidRow" id="shopPaid"></div>` +
        `<div class="gempty">Hold a coin in your coin bag and drag it onto the slot of its own kind. Double-tap a coin to break it into smaller ones; Merge coins makes bigger ones.</div><div class="payBtns"><button class="tbig alt" data-cancel>Cancel</button></div></div>`;
      this._drawPay(); return;
    }
    if (this.tab === 'sell' && !(site && site.def.buys)) this.tab = 'buy';
    const tabs = !(site && site.def.buys) ? '' : `<div class="shopTabs"><button data-tab="buy" class="${this.tab === 'buy' ? 'on' : ''}">Buy</button><button data-tab="sell" class="${this.tab === 'sell' ? 'on' : ''}">Sell</button></div>`;
    if (this.tab === 'sell') { this._drawSell(site, purse, tabs); return; }
    const rows = this.items.map(id => {
      const def = ItemDefs[id], price = Shops.price(id), copper = Shops.coinPrice(price), others = price.filter(([item]) => !Coins.isCoin(item));
      const afford = (g.inventory.purse || 0) >= copper && others.every(([item, n]) => this._have(item) >= n);
      const cost = (copper ? ShopUI.askChips(copper) : '') + others.map(([item, n]) => `<span class="need${this._have(item) < n ? ' missing' : ''}">x${n}<img alt="" src="${ItemIcons.url(item)}"></span>`).join(' ');
      return `<div class="recipe"><div class="out"><img alt="" src="${ItemIcons.url(id)}"></div><div class="info"><div class="name">${def.name}</div><small class="gwho">${ShopUI.what(id, g.gear)}</small><div class="needs">${cost}</div></div><button class="shopbuy" data-buy="${id}"${afford ? '' : ' disabled'}>Buy</button></div>`;
    });
    this.body.innerHTML = `<div class="shophead">${site ? site.def.name : 'Shop'} &middot; your coins: <span class="shopPurse">${purse}</span></div>` + tabs + (rows.join('') || '<div class="gnone">Nothing for sale.</div>');
  }

  /** The Sell tab: everything in your bag the shop will buy (all but coins), with what one is worth and buttons to sell one or the whole stack. */
  _drawSell(site, purse, tabs) {
    const have = {};
    for (const s of this.game.inventory.slots) if (s && Shops.sellPrice(s.id)) have[s.id] = (have[s.id] || 0) + s.count;
    const rows = Object.entries(have).sort((a, b) => ItemDefs[a[0]].name.localeCompare(ItemDefs[b[0]].name)).map(([id, n]) => {
      const each = Shops.sellPrice(id);
      return `<div class="recipe"><div class="out"><img alt="" src="${ItemIcons.url(id)}"><span class="qty">${n}</span></div><div class="info"><div class="name">${ItemDefs[id].name}</div><div class="needs">${ShopUI.askChips(each)} each</div></div>` +
        `<button class="shopbuy" data-sell="${id}" data-count="1">Sell 1</button>${n > 1 ? `<button class="shopbuy" data-sell="${id}" data-count="all">All ${n}</button>` : ''}</div>`;
    });
    this.body.innerHTML = `<div class="shophead">${site ? site.def.name : 'Shop'} &middot; your coins: <span class="shopPurse">${purse}</span></div>` + tabs + (rows.join('') || '<div class="gnone">Your bag has nothing to sell.</div>');
  }
}
