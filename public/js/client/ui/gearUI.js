'use strict';
/* CLIENT - the Gear panel: the eight worn slots + the sword slot, your armour value, and everything in your pack you can wear. */
const GEAR_LABELS = { head: 'Head', chest: 'Chest', legs: 'Legs', feet: 'Feet', hands: 'Hands', shield: 'Shield', belt: 'Belt', back: 'Back', weapon: 'Sword' };

class GearUI {
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
    const gear = this.game.gear, g = this.game, points = Gear.armourPoints(gear), reduction = Math.round(100 * Gear.damageReduction(gear));
    const slotHtml = name => {
      const item = gear[name], blocked = name === 'weapon' && !Gear.hasSheath(gear);
      const icon = item ? `<img alt="" src="${ItemIcons.url(item)}">` : '';
      return `<button class="gslot${item ? ' filled' : ''}${blocked ? ' blocked' : ''}" ${item ? `data-unequip="${name}"` : ''} title="${item ? 'Take off' : blocked ? 'Needs a scabbard or sling' : 'Empty'}">${icon}<span>${GEAR_LABELS[name]}</span></button>`;
    };
    const wearable = [];
    g.inventory.slots.forEach((s, i) => { if (s && Gear.slotFor(s.id)) wearable.push({ i, id: s.id }); });
    this.body.innerHTML =
      `<div class="gsum">HP ${Math.ceil(g.local.hp)}/${CONFIG.sim.health.max} &middot; Armour ${points} &middot; ${reduction}% less damage taken</div>` +
      `<div class="ggrid">${[...EquipSlots, 'weapon'].map(slotHtml).join('')}</div>` +
      `<div class="gtitle">In your pack</div>` +
      (wearable.length ? wearable.map(w => `<div class="grow"><img alt="" src="${ItemIcons.url(w.id)}"><span>${ItemDefs[w.id].name}</span><button data-equip="${w.i}">Wear</button></div>`).join('') : '<div class="gnone">Nothing to wear. Craft armour at a crafting table.</div>');
  }
}
