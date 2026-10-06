'use strict';
/* CLIENT - the bag panel. Three sections, rows of five:
 *   Tool belt   slots 1-5: the hotbar (keys 1-5)
 *   Bag         the slots of the bag you wear (the Starter Backpack: 5). Buy a bigger one at the General Store or craft one; "Wear" swaps it
 *   Pony pack   the bags strapped onto the pony you ride or stand next to (the Starter Side Pack: 10), and its bag slots
 * Tap a stack, then tap a destination slot (in any section) to move / merge / swap it. The row below acts on the stack you picked: Wear a
 * bag / put a pony bag on, send it To the pony / To your bag, drop it on the ground (anyone can pick it up again with the interact key) or
 * destroy it (tap Destroy twice: it is gone for good).
 * Riding one of your ponies, its section has the button that makes it your MAIN pony (the one that follows you everywhere). It lives here
 * rather than on the screen so it is never hit by accident. */
class InventoryUI {
  constructor({ panel, body, closeButton, game, actions }) {
    this.panel = panel; this.body = body; this.game = game; this.picked = null; this.actions = actions || null; this.destroyArmed = false;
    this.shape = ''; this.slotEls = { me: [], pack: [] };
    closeButton.addEventListener('pointerdown', e => { e.preventDefault(); this.close(); });
    if (this.actions) {
      const press = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); if (!el.disabled) fn(); });
      press(this.actions.use, () => this._use());
      press(this.actions.drop1, () => this._drop(1));
      press(this.actions.dropAll, () => this._drop(Infinity));
      press(this.actions.destroy, () => this._destroy());
    }
    body.addEventListener('pointerdown', e => {
      const b = e.target.closest('button[data-bag],#invMainPony');
      if (!b) return;
      e.preventDefault();
      if (b.id === 'invMainPony') game.makeMainPony(); else this._onBagSlot(Number(b.dataset.bag));
    });
    for (const ev of ['inventoryChanged', 'selectedSlotChanged', 'packChanged', 'gearChanged']) game.events.on(ev, () => this.refresh());
    this.refresh();
  }

  get isOpen() { return !this.panel.hidden; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; this.picked = null; this.refresh(); }

  _inv(pack) { return pack ? (this.game.pack ? this.game.pack.inventory : null) : this.game.inventory; }
  _slot(ref) { const inv = ref && this._inv(ref.pack); return inv ? inv.getSlot(ref.i) : null; }
  _picked() { return this._slot(this.picked); }

  _onSlotPressed(pack, i) {
    const here = { pack, i };
    if (!this.picked) { if (this._slot(here)) this.picked = here; }               // pick up
    else {
      const from = this.picked;
      if (from.pack !== pack || from.i !== i) {
        if (!from.pack && !pack) this.game.moveSlot(from.i, i);
        else this.game.packMove(from, here);
      }
      this.picked = null;                                                           // put down (or cancel on the same slot)
    }
    this.destroyArmed = false;
    this.refresh();
  }
  /** A pony bag slot: with a pony bag picked from your bag, strap it on; a bag already there: take it off (it goes into your bag). */
  _onBagSlot(index) {
    const s = this._picked(), pack = this.game.pack;
    if (!pack) return;
    if (s && !this.picked.pack && Bags.isPonyBag(s.id) && !pack.bags[index]) { this.game.equip(this.picked.i); this.picked = null; }
    else if (pack.bags[index]) this.game.ponyBagOff(index);
    this.refresh();
  }
  /** The blue button: what makes sense for the picked stack. */
  _useAction() {
    const s = this._picked(), from = this.picked, g = this.game;
    if (!s) return null;
    if (!from.pack && Bags.isPlayerBag(s.id)) return { label: 'Wear bag', run: () => g.equip(from.i) };
    if (!from.pack && Bags.isPonyBag(s.id) && g.pack && g.pack.bags.includes('')) return { label: 'Put on pony', run: () => g.equip(from.i) };
    if (!from.pack && g.pack && g.pack.inventory.size) return { label: 'To pony', run: () => g.packMove(from, { pack: true, i: -1 }) };
    if (from.pack) return { label: 'To my bag', run: () => g.packMove(from, { pack: false, i: -1 }) };
    return null;
  }
  _use() { const a = this._useAction(); if (!a) return; a.run(); this.picked = null; this.destroyArmed = false; this.refresh(); }
  _drop(count) {
    const s = this._picked();
    if (!s) return;
    this.game.dropItem(this.picked.i, Math.min(count, s.count), this.picked.pack);
    if (count >= s.count) this.picked = null;
    this.destroyArmed = false; this.refresh();
  }
  _destroy() {
    const s = this._picked();
    if (!s) return;
    if (!this.destroyArmed) { this.destroyArmed = true; this.refresh(); return; }   // first tap asks, the second does it
    this.game.destroyItem(this.picked.i, s.count, this.picked.pack);
    this.picked = null; this.destroyArmed = false; this.refresh();
  }

  /** Riding another pony of yours (or getting off): the Make main pony button comes and goes. */
  refreshPony() { this.refresh(); }

  /** Rebuild the sections when their shape changed (a new bag, another pony in reach), else just refill the slots. */
  _build() {
    const g = this.game, inv = g.inventory, belt = Bags.BELT, pack = g.pack, bag = g.gear.bag;
    const canMain = !!(pack && pack.riding && g.mainPonyHint && g.mainPonyHint());
    const shape = JSON.stringify([inv.size, bag, pack ? [pack.id, pack.name, pack.bags, pack.inventory.size, pack.riding, pack.main, canMain] : null]);
    if (shape === this.shape) return;
    this.shape = shape;
    const bagName = bag && ItemDefs[bag] ? ItemDefs[bag].name : 'No bag';
    const html = [`<div class="invsec">Tool belt<small>keys 1-${belt}</small></div><div class="invgrid" data-sec="belt"></div>`,
      `<div class="invsec">${bagName}<small>${inv.size - belt} slots</small></div><div class="invgrid" data-sec="bag"></div>`];
    if (pack) {
      const star = pack.main ? ' <span title="Your main pony: it follows you everywhere">&#x2605;</span>' : '';
      const mainBtn = canMain ? '<button id="invMainPony" tabindex="-1" title="Make it the pony that follows you everywhere">&#x2605; Make main pony</button>' : '';
      html.push(`<div class="invsec">${pack.riding ? 'Riding' : 'Beside you'}: ${pack.name}${star}${mainBtn}<small>${pack.inventory.size} pack slots</small></div>`);
      html.push(`<div class="invbags">${pack.bags.map((b, k) => b
        ? `<button class="invbag filled" data-bag="${k}" tabindex="-1" title="Take the ${ItemDefs[b].name} off (into your bag)"><img alt="" src="${ItemIcons.url(b)}">${ItemDefs[b].name} &#x2715;</button>`
        : `<button class="invbag" data-bag="${k}" tabindex="-1" title="An empty bag slot: pick a pony bag from your bag, then tap here">empty bag slot</button>`).join('')}</div>`);
      html.push(pack.inventory.size ? '<div class="invgrid" data-sec="pack"></div>' : '<div class="invnote">No bags on this pony yet: buy saddlebags at the General Store.</div>');
    } else html.push('<div class="invnote">Ride one of your ponies, or stand next to it, to open its pack.</div>');
    this.body.innerHTML = html.join('');
    this.slotEls = { me: [], pack: [] };
    const beltGrid = this.body.querySelector('[data-sec="belt"]'), bagGrid = this.body.querySelector('[data-sec="bag"]'), packGrid = this.body.querySelector('[data-sec="pack"]');
    for (let i = 0; i < inv.size; i++) {
      const el = SlotView.create(i, i < belt ? i + 1 : '');
      SlotView.onPress(el, () => this._onSlotPressed(false, i));
      (i < belt ? beltGrid : bagGrid).appendChild(el); this.slotEls.me.push(el);
    }
    if (packGrid) for (let i = 0; i < pack.inventory.size; i++) {
      const el = SlotView.create(i, '');
      SlotView.onPress(el, () => this._onSlotPressed(true, i));
      packGrid.appendChild(el); this.slotEls.pack.push(el);
    }
  }

  refresh() {
    if (this.picked && !this._picked()) this.picked = null;
    this._build();
    const P = this.picked;
    this.slotEls.me.forEach((el, i) => {
      SlotView.fill(el, this.game.inventory.getSlot(i));
      el.classList.toggle('selected', i === this.game.selectedSlot);
      el.classList.toggle('picked', !!P && !P.pack && P.i === i);
    });
    this.slotEls.pack.forEach((el, i) => { SlotView.fill(el, this.game.pack.inventory.getSlot(i)); el.classList.toggle('picked', !!P && P.pack && P.i === i); });
    const s = this._picked(), ponyBag = s && !P.pack && Bags.isPonyBag(s.id);
    for (const b of this.body.querySelectorAll('.invbag')) b.classList.toggle('target', !!ponyBag && !b.classList.contains('filled'));
    if (!this.actions) return;
    const A = this.actions, def = s && ItemDefs[s.id], use = this._useAction();
    A.label.textContent = s ? `${def ? def.name : s.id}${s.count > 1 ? ' x' + s.count : ''}${P.pack ? ' (pony pack)' : ''}` : 'Tap an item to move, drop or destroy it';
    A.use.hidden = !use; if (use) A.use.textContent = use.label;
    A.drop1.disabled = A.destroy.disabled = !s; A.dropAll.disabled = !s || s.count < 2;
    A.destroy.textContent = this.destroyArmed ? 'Really destroy?' : 'Destroy';
    A.destroy.classList.toggle('armed', this.destroyArmed);
  }
}
