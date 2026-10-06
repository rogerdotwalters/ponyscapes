'use strict';
/* CLIENT - the Town window (T): what you can carry, every stockpile (what it holds, take things out when you stand at it) and every
 * upgradable building with what its next level costs. Delivering is the interact key (F) at a stockpile. The server decides everything. */
class TownUI {
  constructor({ panel, body, closeButton, game }) {
    this.panel = panel; this.body = body; this.game = game; this.since = 0; this.signature = '';
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      const tx = Number(b.dataset.tx), ty = Number(b.dataset.ty);
      if (b.dataset.act === 'take') this.game.takeFromStockpile(tx, ty, b.dataset.item, Number(b.dataset.count));
      else if (b.dataset.act === 'upgrade') this.game.upgradeBuilding(tx, ty);
    });
    for (const ev of ['stockpilesChanged', 'inventoryChanged', 'builtChanged']) game.events.on(ev, () => this.isOpen && this._refreshSoon());
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }
  /** You walk up to stockpiles while it is open, so it re-checks now and then (rebuilding only when something shown changed). */
  tick(frameMs) { if (this.isOpen && (this.since += frameMs) > 400) { this.since = 0; this._refreshSoon(); } }

  _model() {
    const g = this.game, map = g.map, me = g.local, near = STATION_RANGE + 0.5;
    const piles = Stockpiles.list(map, me).map(p => Object.assign(p, { near: p.dist <= near }));
    const buildings = Buildings.list(map, me).map(b => Object.assign(b, { afford: b.next ? Buildings.afford(map, b.key, g.inventory, b.next.cost) : [] }));
    const usage = Carry.usage(g.inventory, me.carryStacks);
    return { piles, buildings, usage, con: Skills._a(me.lv, 'constitution'), companions: me.companions | 0, carryBuff: (me.buffs && me.buffs.carry) | 0, limit: me.carryStacks };
  }
  _refreshSoon() { const model = this._model(), sig = JSON.stringify(model, (k, v) => (k === 'dist' ? Math.round(v) : v)); if (sig !== this.signature) this.refresh(model, sig); }

  refresh(model = this._model(), sig = null) {
    this.signature = sig || JSON.stringify(model, (k, v) => (k === 'dist' ? Math.round(v) : v));
    const icon = id => `<img alt="" src="${ItemIcons.url(id)}">`, name = id => (ItemDefs[id] ? ItemDefs[id].name : id);
    const carry = Object.entries(model.usage).map(([r, u]) => `<span class="${u.used >= u.limit ? 'full' : ''}">${ResourceTypes[r].name} <b>${u.used}/${u.limit}</b></span>`).join('');
    const why = `Constitution ${model.con}` + (model.companions ? ` + ${Math.min(CONFIG.sim.carry.maxPonyBonus, model.companions * CONFIG.sim.carry.perPony)} for ponies with you` : '') + (model.carryBuff ? ` + ${model.carryBuff} Pack Pony` : '');
    const carryHtml = `<div class="tcarry"><div class="ttitle">Stacks you can carry</div><div class="tstacks">${carry}</div><small>${why}. Lead or ride a pony to carry more; deliver the rest to a stockpile (stand at it, press F).</small></div>`;

    const pileCards = model.piles.map(p => {
      const items = Object.entries(p.items).filter(([, n]) => n > 0);
      const takes = p.near ? items.map(([id, n]) => {
        const stack = Math.min(n, ItemDB.maxStack(id));
        return `<span class="ttake">${icon(id)}<b>${n}</b><button data-act="take" data-tx="${p.tx}" data-ty="${p.ty}" data-item="${id}" data-count="10" ${n < 1 ? 'disabled' : ''}>Take ${Math.min(10, n)}</button><button data-act="take" data-tx="${p.tx}" data-ty="${p.ty}" data-item="${id}" data-count="${stack}">Stack</button></span>`;
      }).join('') : items.map(([id, n]) => `<span class="tchip">${icon(id)}<b>${n}</b></span>`).join('');
      return `<div class="tcard"><div class="thead">${icon(p.type)}<div><b>${StructureDefs[p.type].name}</b> <span class="tlv">Lv ${p.level}/${p.maxLevel}</span><div class="tsub">${p.near ? 'You are here' : Math.round(p.dist) + ' tiles away'}</div></div></div>` +
        `<div class="tbar"><i style="width:${Math.round(100 * p.total / Math.max(1, p.capacity))}%"></i><span>${p.total} / ${p.capacity}</span></div>` +
        `<div class="titems">${takes || '<span class="tsub">Empty</span>'}</div>${!p.near && items.length ? '<div class="tsub">Walk up to it to take things out.</div>' : ''}</div>`;
    }).join('');
    const pilesHtml = '<div class="ttitle">Stockpiles</div>' + (pileCards || '<div class="tempty">No stockpiles yet. Craft a Wood, Stone or Clay Stockpile at a crafting table and place it in town: crafting tables pull from the stockpiles near them.</div>');

    const buildingCards = model.buildings.map(b => {
      const cost = b.next ? b.afford.map(c => `<span class="tchip ${c.have < c.count ? 'missing' : ''}">${icon(c.item)}<b>${c.have}/${c.count}</b></span>`).join('') : '';
      const ok = b.next && b.afford.every(c => c.have >= c.count);
      return `<div class="tcard"><div class="thead">${icon(StructureDefs[b.type].refundItemId)}<div><b>${b.name}</b> <span class="tlv">Lv ${b.level}/${b.maxLevel}</span><div class="tsub">${b.perk} &middot; ${Math.round(b.dist)} tiles away</div></div></div>` +
        (b.next ? `<div class="tnext">Level ${b.next.level}: ${b.next.perk}</div><div class="titems">${cost}</div><button class="tup" data-act="upgrade" data-tx="${b.tx}" data-ty="${b.ty}" ${ok ? '' : 'disabled'}>Upgrade</button>` : '<div class="tsub">Fully upgraded</div>') + '</div>';
    }).join('');
    const buildingsHtml = '<div class="ttitle">Buildings <small>upgrades use the stockpiles within ' + TOWN_RANGE + ' tiles, then your pack</small></div>' + (buildingCards || '<div class="tempty">Nothing to upgrade yet.</div>');
    this.body.innerHTML = carryHtml + pilesHtml + buildingsHtml;
  }
}
