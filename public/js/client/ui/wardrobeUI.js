'use strict';
/* CLIENT - the Wardrobe panel: the three things you wear (crown, outfit, cape), the lasso slot (L throws it), the bag slot (your bag: always one;
 * wear a bigger one to swap), and everything in your bag you could put on or slot in. Better lassos (crafted from the one before) catch rarer ponies. */
const WARDROBE_LABELS = { crown: 'Crown', outfit: 'Outfit', cape: 'Cape', lasso: 'Lasso', bag: 'Bag' };

class WardrobeUI {
  constructor({ panel, body, closeButton, game }) {
    this.panel = panel; this.body = body; this.game = game;
    closeButton.addEventListener('click', () => this.close());
    game.events.on('gearChanged', () => this.isOpen && this.refresh());
    game.events.on('inventoryChanged', () => this.isOpen && this.refresh());
    body.addEventListener('click', e => this._onClick(e));
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }

  _onClick(e) {
    const el = e.target.closest('[data-unequip],[data-equip]');
    if (!el) return;
    if (el.dataset.unequip) this.game.unequip(el.dataset.unequip);
    else this.game.equip(Number(el.dataset.equip));
  }

  refresh() {
    const g = this.game, gear = g.gear, appearance = g.local && g.local.appearance;
    const slotHtml = name => {
      const item = gear[name], icon = item ? `<img alt="" src="${ItemIcons.url(item)}">` : '';
      return `<button class="gslot${item ? ' filled' : ''}" ${item ? `data-unequip="${name}"` : ''} title="${item ? 'Take off ' + ItemDefs[item].name : 'Empty'}">${icon}<span>${WARDROBE_LABELS[name]}</span></button>`;
    };
    const wearable = [];
    g.inventory.slots.forEach((s, i) => { if (s && Wardrobe.slotFor(s.id)) wearable.push({ i, id: s.id, fits: Wardrobe.fits(s.id, appearance) }); });
    this.body.innerHTML =
      `<div class="gpreview"><canvas id="wardrobePreview" width="120" height="152"></canvas><div><div class="gsum">${WardrobeUI.worn(gear)}</div><small class="gwho">${CharacterLook.describe(appearance).body}${gear.cape ? ` &middot; Power ${Math.round(Wardrobe.power(gear) * 100)}% &middot; Def ${Wardrobe.def(gear)} (${Math.round(Wardrobe.damageReduction(gear) * 100)}% less damage)` : ''}</small></div></div>` +
      `<div class="ggrid">${WardrobeSlots.concat(GearExtraSlots).map(slotHtml).join('')}</div>` +
      `<small class="gwho">${WardrobeUI.lassoLine(gear.lasso)} ${WardrobeUI.bagLine(gear.bag)}</small>` +
      `<div class="gtitle">In your pack</div>` +
      (wearable.length ? wearable.map(w => `<div class="grow"><img alt="" src="${ItemIcons.url(w.id)}"><span>${ItemDefs[w.id].name}<small>${WardrobeUI.describe(w.id, gear)}</small></span>${w.fits ? `<button data-equip="${w.i}">${ItemDB.getLasso(w.id) ? 'Equip' : Bags.isPlayerBag(w.id) ? 'Swap bag' : 'Wear'}</button>` : '<em>not for you</em>'}</div>`).join('') : '<div class="gnone">Nothing to wear yet. Make crowns, dresses, garb and capes at a crafting table.</div>');
  }
  /** Draw the character as they look right now, slowly turning so every side of the outfit and cape shows. Driven by the main frame loop (like the other panels). */
  tick(frameMs) {
    if (this.panel.hidden !== false) return;
    const canvas = this.body.querySelector('#wardrobePreview'); if (!canvas || typeof canvas.getContext !== 'function') return;
    const now = performance.now();
    renderCharacterPortrait(canvas, this.game.local.appearance, Math.PI / 4 + Math.sin(now / 1100) * 1.9, now, this.game.gear);
  }
  /** One line under an item in the pack: which slot, and who may wear it (or what a lasso can catch). */
  static describe(id, gear) {
    const lasso = ItemDB.getLasso(id);
    if (Bags.isPlayerBag(id)) return `Bag &middot; ${Bags.slots(id)} slots (yours: ${Bags.slots((gear && gear.bag) || CONFIG.sim.inventory.starterBag)})`;
    if (lasso) return `Lasso &middot; ${WardrobeUI.catches(lasso.tier)}${lasso.chance ? ` &middot; +${Math.round(lasso.chance * 100)}% catch` : ''}`;
    return `${WARDROBE_LABELS[ItemDefs[id].equip.slot]} &middot; ${Wardrobe.forWhom(id)}${WardrobeUI.stats(id)}`;
  }
  /** The ponies a lasso of this tier holds: every kind whose lassoTier is no higher. */
  static catches(tier) {
    const kinds = Object.values(AnimalDefs).filter(d => d.pony && (d.lassoTier || 1) <= tier).map(d => d.name);
    return kinds.length ? 'holds ' + kinds.join(', ') : 'tier ' + tier;
  }
  static bagLine(item) {
    return item && ItemDefs[item] ? `Your ${ItemDefs[item].name} holds ${Bags.slots(item)} things beside your ${Bags.BELT}-slot tool belt: buy a bigger bag at the General Store or craft one.` : '';
  }
  static lassoLine(item) {
    const lasso = item && ItemDB.getLasso(item);
    return lasso ? `L throws your ${ItemDefs[item].name}: it ${WardrobeUI.catches(lasso.tier)}. Craft a better one at a crafting table to catch rarer ponies.` : 'No lasso in the lasso slot: Equip one from your pack (L throws it).';
  }
  /** A cape's two stats, in words: Power (multiplies a pony's ability) and Def (soaks damage). */
  static stats(id) { const e = ItemDefs[id].equip; return e.slot === 'cape' ? ` &middot; Power +${Math.round(e.power * 100)}% &middot; Def ${e.def}` : ''; }
  static worn(gear) { const names = WardrobeSlots.map(s => gear[s] ? ItemDefs[gear[s]].name : null).filter(Boolean); return names.length ? 'Wearing ' + names.join(', ') : 'Wearing nothing special'; }
}
