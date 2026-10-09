'use strict';
/* CLIENT - the bag panel. Two sections (three beside an open chest: the worn chest in your home, homeCrafts.js), rows of five:
 *   Inventory   ONE grid: your tool belt (slots 1-5, the hotbar: keys 1-5) followed by the slots of the bag you wear (the Starter Backpack: 5).
 *               It grows or shrinks by itself when you wear another bag (buy a bigger one at the General Store or craft one; "Wear" swaps it)
 *   Pony pack   the bags strapped onto the pony you ride or stand next to (the Starter Side Pack: 10), and its bag slots
 * Tap a stack, then tap a destination slot (in any section) to move / merge / swap it. With a mouse you can also DRAG a stack onto a slot (or onto
 * a pony bag slot). The row below acts on the stack you picked: Wear a
 * bag / put a pony bag on, send it To the pony / To your bag, drop it on the ground (anyone can pick it up again with the interact key) or
 * destroy it (tap Destroy twice: it is gone for good).
 * Riding one of your ponies, its section has the button that makes it your MAIN pony (the one that follows you everywhere). It lives here
 * rather than on the screen so it is never hit by accident. */
class InventoryUI {
  constructor({ panel, body, closeButton, game, actions }) {
    this.panel = panel; this.body = body; this.game = game; this.picked = null; this.actions = actions || null; this.destroyArmed = false;
    this.shape = ''; this.slotEls = { me: [], pack: [], chest: [] };
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
      if (!b) { if (e.target.closest('#invDropCoins')) { e.preventDefault(); game.dropCoins(10); } return; }
      e.preventDefault();
      if (b.id === 'invMainPony') game.makeMainPony(); else this._onBagSlot(Number(b.dataset.bag));
    });
    for (const ev of ['inventoryChanged', 'selectedSlotChanged', 'packChanged', 'chestChanged', 'gearChanged']) game.events.on(ev, () => this.refresh());
    this.refresh();
  }

  get isOpen() { return !this.panel.hidden; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  open() { const was = this.isOpen; this.panel.hidden = false; this.refresh(); if (!was) Sfx.bag(true); }                       // (the bag rustles open and shut; panels.closeAll() also calls close() on a closed bag: silent)
  close() { const was = this.isOpen; this.panel.hidden = true; this.picked = null; this.refresh(); if (was) Sfx.bag(false); }

  _inv(sec) { return sec === 'chest' ? (this.game.chest ? this.game.chest.inventory : null) : sec === 'pack' ? (this.game.pack ? this.game.pack.inventory : null) : this.game.inventory; }
  _slot(ref) { const inv = ref && this._inv(ref.sec); return inv ? inv.getSlot(ref.i) : null; }
  /** A section ref as the server wants it. */
  static wire(ref) { return { pack: ref.sec === 'pack', chest: ref.sec === 'chest', i: ref.i }; }
  _picked() { return this._slot(this.picked); }

  _onSlotPressed(sec, i) {
    const here = { sec, i };
    if (!this.picked) { if (this._slot(here)) this.picked = here; }               // pick up
    else {
      const from = this.picked;
      if (from.sec !== sec || from.i !== i) {
        if (from.sec === 'me' && sec === 'me') this.game.moveSlot(from.i, i);
        else this.game.packMove(InventoryUI.wire(from), InventoryUI.wire(here));
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
    if (s && this.picked.sec === 'me' && Bags.isPonyBag(s.id) && !pack.bags[index]) { this.game.equip(this.picked.i); this.picked = null; }
    else if (pack.bags[index]) this.game.ponyBagOff(index);
    this.refresh();
  }
  /** The blue button: what makes sense for the picked stack. */
  _useAction() {
    const s = this._picked(), from = this.picked, g = this.game;
    if (!s) return null;
    const me = from.sec === 'me';
    if (me && Bags.isPlayerBag(s.id)) return { label: 'Wear bag', run: () => g.equip(from.i) };
    if (me && Bags.isPonyBag(s.id) && g.pack && g.pack.bags.includes('')) return { label: 'Put on pony', run: () => g.equip(from.i) };
    if (me && g.chest) return { label: 'To chest', run: () => g.packMove(InventoryUI.wire(from), { chest: true, i: -1 }) };
    if (me && g.pack && g.pack.inventory.size) return { label: 'To pony', run: () => g.packMove(InventoryUI.wire(from), { pack: true, i: -1 }) };
    if (!me) return { label: 'To my bag', run: () => g.packMove(InventoryUI.wire(from), { pack: false, i: -1 }) };
    return null;
  }
  _use() { const a = this._useAction(); if (!a) return; a.run(); this.picked = null; this.destroyArmed = false; this.refresh(); }
  _drop(count) {
    const s = this._picked();
    if (!s) return;
    this.game.dropItem(this.picked.i, Math.min(count, s.count), this.picked.sec === 'pack', this.picked.sec === 'chest');
    if (count >= s.count) this.picked = null;
    this.destroyArmed = false; this.refresh();
  }
  _destroy() {
    const s = this._picked();
    if (!s) return;
    if (!this.destroyArmed) { this.destroyArmed = true; this.refresh(); return; }   // first tap asks, the second does it
    this.game.destroyItem(this.picked.i, s.count, this.picked.sec === 'pack', this.picked.sec === 'chest');
    this.picked = null; this.destroyArmed = false; this.refresh();
  }

  /** Touch: tap to pick, tap to put down. Mouse: press and drag a stack onto another slot (a click without moving still picks / puts down). */
  _bindSlot(el, sec, i) {
    el.dataset.sec = sec; el.dataset.i = i;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      if (e.pointerType !== 'mouse') { this._onSlotPressed(sec, i); return; }
      if (e.button !== 0) return;
      this._beginMouse(e, sec, i);
    });
  }
  _beginMouse(e, sec, i) {
    const here = { sec, i }, st = { x: e.clientX, y: e.clientY, drag: false, ghost: null };
    const move = ev => {
      if (!st.drag) {
        if (Math.hypot(ev.clientX - st.x, ev.clientY - st.y) < 6 || !this._slot(here)) return;
        st.drag = true; this.picked = here; this.destroyArmed = false;
        const g = document.createElement('div'); g.className = 'invGhost';
        const slot = this._slot(here); g.innerHTML = `<img alt="" src="${ItemIcons.url(slot.id)}">` + (slot.count > 1 ? `<span>${slot.count}</span>` : '');
        document.body.appendChild(g); st.ghost = g; this.refresh(); this.panel.classList.add('dragging');
      }
      st.ghost.style.left = ev.clientX + 'px'; st.ghost.style.top = ev.clientY + 'px';
      for (const t of this.body.querySelectorAll('.dropover')) t.classList.remove('dropover');
      const over = this._targetAt(ev.clientX, ev.clientY); if (over) over.classList.add('dropover');
    };
    const up = ev => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      for (const t of this.body.querySelectorAll('.dropover')) t.classList.remove('dropover');
      this.panel.classList.remove('dragging');
      if (!st.drag) { this._onSlotPressed(sec, i); return; }
      if (st.ghost) st.ghost.remove();
      const target = ev.type === 'pointerup' ? this._targetAt(ev.clientX, ev.clientY) : null;
      if (target && target.dataset.bag !== undefined) this._onBagSlot(Number(target.dataset.bag));
      else if (target) { const ts = target.dataset.sec; if (ts !== sec || Number(target.dataset.i) !== i) { this.picked = here; this._onSlotPressed(ts, Number(target.dataset.i)); return; } }
      this.picked = null; this.refresh();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  /** The slot (or pony bag slot) under a screen point, inside this panel. */
  _targetAt(x, y) {
    const el = document.elementFromPoint(x, y), t = el && el.closest('.slot[data-sec],button.invbag[data-bag]');
    return t && this.body.contains(t) ? t : null;
  }

  /** Riding another pony of yours (or getting off): the Make main pony button comes and goes. */
  refreshPony() { this.refresh(); }

  /** Rebuild the sections when their shape changed (a new bag, another pony in reach), else just refill the slots. */
  _build() {
    const g = this.game, inv = g.inventory, belt = Bags.BELT, pack = g.pack, bag = g.gear.bag, chest = g.chest;
    const canMain = !!(pack && pack.riding && g.mainPonyHint && g.mainPonyHint());
    const shape = JSON.stringify([inv.size, bag, chest ? [chest.key, chest.inventory.size] : null, pack ? [pack.id, pack.name, pack.bags, pack.inventory.size, pack.riding, pack.main, canMain] : null]);
    if (shape === this.shape) return;
    this.shape = shape;
    const bagName = bag && ItemDefs[bag] ? ItemDefs[bag].name : 'No bag';
    const html = [`<div class="invpurse"><img alt="" src="${ItemIcons.url('gold_coin')}"><b>Coin purse</b><span id="invCoins">0</span><button id="invDropCoins" tabindex="-1" title="Tip out 10 coins (or all you have, if fewer)">Drop 10</button></div>`,
      `<div class="invsec">Inventory: ${bagName}<small>${belt} belt + ${inv.size - belt} bag slots</small></div><div class="invgrid" data-sec="inv"></div>`];
    if (chest) html.push(`<div class="invsec">${chest.name}<small>${chest.inventory.size} slots</small></div><div class="invgrid" data-sec="chest"></div>`);
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
    this.slotEls = { me: [], pack: [], chest: [] };
    const invGrid = this.body.querySelector('[data-sec="inv"]'), packGrid = this.body.querySelector('[data-sec="pack"]');
    for (let i = 0; i < inv.size; i++) {
      const el = SlotView.create(i, i < belt ? i + 1 : '');
      if (i < belt) el.classList.add('belt');
      this._bindSlot(el, 'me', i);
      invGrid.appendChild(el); this.slotEls.me.push(el);
    }
    const chestGrid = this.body.querySelector('[data-sec="chest"]');
    if (chestGrid) for (let i = 0; i < chest.inventory.size; i++) {
      const el = SlotView.create(i, ''); this._bindSlot(el, 'chest', i);
      chestGrid.appendChild(el); this.slotEls.chest.push(el);
    }
    if (packGrid) for (let i = 0; i < pack.inventory.size; i++) {
      const el = SlotView.create(i, '');
      this._bindSlot(el, 'pack', i);
      packGrid.appendChild(el); this.slotEls.pack.push(el);
    }
  }

  refresh() {
    if (this.picked && !this._picked()) this.picked = null;
    this._build();
    const P = this.picked, coinEl = this.body.querySelector('#invCoins'), dropCoins = this.body.querySelector('#invDropCoins');
    if (coinEl) coinEl.textContent = this.game.inventory.purse || 0;
    if (dropCoins) dropCoins.disabled = !(this.game.inventory.purse > 0);
    this.slotEls.me.forEach((el, i) => {
      SlotView.fill(el, this.game.inventory.getSlot(i));
      el.classList.toggle('selected', i === this.game.selectedSlot);
      el.classList.toggle('picked', !!P && P.sec === 'me' && P.i === i);
    });
    this.slotEls.pack.forEach((el, i) => { SlotView.fill(el, this.game.pack.inventory.getSlot(i)); el.classList.toggle('picked', !!P && P.sec === 'pack' && P.i === i); });
    this.slotEls.chest.forEach((el, i) => { SlotView.fill(el, this.game.chest.inventory.getSlot(i)); el.classList.toggle('picked', !!P && P.sec === 'chest' && P.i === i); });
    const s = this._picked(), ponyBag = s && P.sec === 'me' && Bags.isPonyBag(s.id);
    for (const b of this.body.querySelectorAll('.invbag')) b.classList.toggle('target', !!ponyBag && !b.classList.contains('filled'));
    if (!this.actions) return;
    const A = this.actions, def = s && ItemDefs[s.id], use = this._useAction();
    A.label.textContent = s ? `${def ? def.name : s.id}${s.count > 1 ? ' x' + s.count : ''}${P.sec === 'pack' ? ' (pony pack)' : P.sec === 'chest' ? ' (chest)' : ''}` : 'Tap an item to move, drop or destroy it';
    A.use.hidden = !use; if (use) A.use.textContent = use.label;
    A.drop1.disabled = A.destroy.disabled = !s; A.dropAll.disabled = !s || s.count < 2;
    A.destroy.textContent = this.destroyArmed ? 'Really destroy?' : 'Destroy';
    A.destroy.classList.toggle('armed', this.destroyArmed);
  }
}
