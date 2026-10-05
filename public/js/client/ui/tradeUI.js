'use strict';
/* CLIENT - the trade window. The server owns the trade; this just shows its state and sends offers / confirmations. */
class TradeUI {
  constructor({ panel, body, closeButton, game, requestOpen }) {
    this.panel = panel; this.body = body; this.game = game; this.requestOpen = requestOpen;
    closeButton.addEventListener('click', () => { if (game.trade) game.cancelTrade(); this.close(); });
    game.events.on('tradeChanged', () => { if (game.trade && !this.isOpen) this.requestOpen(); if (!game.trade && this.isOpen) this.close(); this.refresh(); });
    game.events.on('inventoryChanged', () => this.isOpen && this.refresh());
    body.addEventListener('click', e => this._onClick(e));
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }

  _onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const g = this.game, act = el.dataset.act, item = el.dataset.item;
    if (act === 'start') { const target = g.nearestTrader(); if (target) g.requestTrade(target); else g.events.emit('notice', { to: g.myId, text: 'Nobody within reach to trade with' }); }
    else if (act === 'accept') g.acceptTrade();
    else if (act === 'cancel') { g.cancelTrade(); this.close(); }
    else if (act === 'confirm') g.confirmTrade(!(g.trade && g.trade.myConfirm));
    else if (act === 'more' || act === 'less') {
      const have = g.inventory.count(item), now = (g.trade && g.trade.mine[item]) || 0;
      g.offerTrade(item, clamp(now + (act === 'more' ? 1 : -1), 0, have));
    }
  }

  _list(offer) {
    const items = Object.entries(offer);
    return items.length ? items.map(([id, n]) => `<div class="trow"><img alt="" src="${ItemIcons.url(id)}"><span>${ItemDefs[id].name} &times; ${n}</span></div>`).join('') : '<div class="tnone">nothing yet</div>';
  }

  refresh() {
    const g = this.game, t = g.trade;
    if (!t) { this.body.innerHTML = '<div class="tnone">Stand next to another player and trade items safely. Both sides must confirm.</div><button class="tbig" data-act="start">Trade with the nearest player</button>'; return; }
    const who = t.with.toUpperCase();
    if (t.status === 'pending') {
      this.body.innerHTML = t.incoming
        ? `<div class="tmsg">${who} wants to trade with you.</div><button class="tbig" data-act="accept">Accept</button><button class="tbig alt" data-act="cancel">Decline</button>`
        : `<div class="tmsg">Waiting for ${who} to accept...</div><button class="tbig alt" data-act="cancel">Cancel</button>`;
      return;
    }
    const mine = {}; g.inventory.slots.forEach(s => { if (s) mine[s.id] = (mine[s.id] || 0) + s.count; });
    const pack = Object.keys(mine).map(id => {
      const n = t.mine[id] || 0;
      return `<div class="trow"><img alt="" src="${ItemIcons.url(id)}"><span>${ItemDefs[id].name} (${mine[id]})</span><button data-act="less" data-item="${id}">&minus;</button><b>${n}</b><button data-act="more" data-item="${id}">+</button></div>`;
    }).join('');
    this.body.innerHTML =
      `<div class="tcols"><div><div class="gtitle">You offer ${t.myConfirm ? '&#10003;' : ''}</div>${this._list(t.mine)}</div>` +
      `<div><div class="gtitle">${who} offers ${t.theirConfirm ? '&#10003;' : ''}</div>${this._list(t.theirs)}</div></div>` +
      `<button class="tbig${t.myConfirm ? ' on' : ''}" data-act="confirm">${t.myConfirm ? 'Confirmed (tap to undo)' : 'Confirm trade'}</button><button class="tbig alt" data-act="cancel">Cancel</button>` +
      `<div class="gtitle">Your pack: tap + to offer</div>${pack}`;
  }
}
