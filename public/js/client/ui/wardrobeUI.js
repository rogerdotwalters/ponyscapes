'use strict';
/* CLIENT - the Wardrobe panel: the three things you wear (crown, outfit, cape), and everything in your bag you could put on. Purely about how you look. */
const WARDROBE_LABELS = { crown: 'Crown', outfit: 'Outfit', cape: 'Cape' };

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
      `<div class="ggrid">${WardrobeSlots.map(slotHtml).join('')}</div>` +
      `<div class="gtitle">In your pack</div>` +
      (wearable.length ? wearable.map(w => `<div class="grow"><img alt="" src="${ItemIcons.url(w.id)}"><span>${ItemDefs[w.id].name}<small>${WARDROBE_LABELS[ItemDefs[w.id].equip.slot]} &middot; ${Wardrobe.forWhom(w.id)}${WardrobeUI.stats(w.id)}</small></span>${w.fits ? `<button data-equip="${w.i}">Wear</button>` : '<em>not for you</em>'}</div>`).join('') : '<div class="gnone">Nothing to wear yet. Make crowns, dresses, garb and capes at a crafting table.</div>');
  }
  /** Draw the character as they look right now, slowly turning so every side of the outfit and cape shows. Driven by the main frame loop (like the other panels). */
  tick(frameMs) {
    if (this.panel.hidden !== false) return;
    const canvas = this.body.querySelector('#wardrobePreview'); if (!canvas || typeof canvas.getContext !== 'function') return;
    const now = performance.now();
    renderCharacterPortrait(canvas, this.game.local.appearance, Math.PI / 4 + Math.sin(now / 1100) * 1.9, now, this.game.gear);
  }
  /** A cape's two stats, in words: Power (multiplies a pony's ability) and Def (soaks damage). */
  static stats(id) { const e = ItemDefs[id].equip; return e.slot === 'cape' ? ` &middot; Power +${Math.round(e.power * 100)}% &middot; Def ${e.def}` : ''; }
  static worn(gear) { const names = WardrobeSlots.map(s => gear[s] ? ItemDefs[gear[s]].name : null).filter(Boolean); return names.length ? 'Wearing ' + names.join(', ') : 'Wearing nothing special'; }
}
