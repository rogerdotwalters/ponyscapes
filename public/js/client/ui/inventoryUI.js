'use strict';
/* CLIENT - the bag panel. Two sections (three beside an open chest: the worn chest in your home, homeCrafts.js), rows of five:
 *   Inventory   ONE grid: your tool belt (slots 1-5, the hotbar: keys 1-5) followed by the slots of the bag you wear (the Starter Backpack: 40).
 *               It grows or shrinks by itself when you wear another bag (buy a bigger one at the General Store or craft one; "Wear" swaps it)
 *   Pony pack   the bags strapped onto the pony you ride or stand next to (the Starter Side Pack: 10), and its bag slots
 * Tap a stack, then tap a destination slot (in any section) to move / merge / swap it. With a mouse you can also DRAG a stack onto a slot (or onto
 * a pony bag slot). The row below acts on the stack you picked: Wear a
 * bag / put a pony bag on, send it To the pony / To your bag, drop it on the ground (anyone can pick it up again with the interact key) or
 * destroy it (tap Destroy twice: it is gone for good).
 * Riding one of your ponies, its section has the button that makes it your MAIN pony (the one that follows you everywhere). It lives here
 * rather than on the screen so it is never hit by accident. */
class InventoryUI {
  /** The purse as "3 x [gold coin]  2 x [silver coin]" (biggest first), then its worth in copper: icons instead of letters, so no one has to decode "1 T, 1 P". */
  static coinHtml(coins) {
    const arr = coins || Coins.empty(), chips = [];
    for (let t = Coins.N - 1; t >= 0; t--) if (arr[t]) chips.push(`<i class="coinChip" title="${Coins.TIERS[t].name}: ${Coins.TIERS[t].value.toLocaleString()} copper each"><b>${arr[t].toLocaleString()}</b>&times;<img alt="${Coins.TIERS[t].name}" src="${ItemIcons.url(Coins.TIERS[t].id)}"></i>`);
    return (chips.length ? chips.join('') : '<i class="coinChip none">0</i>') + `<small class="coinWorth">Total ${Coins.total(arr).toLocaleString()}c</small>`;
  }
  constructor({ panel, body, closeButton, game, actions }) {
    this.panel = panel; this.body = body; this.game = game; this.picked = null; this.actions = actions || null; this.destroyArmed = false;
    this.shape = ''; this.slotEls = { me: [], pack: [], chest: [] };
    closeButton.addEventListener('pointerdown', e => { e.preventDefault(); this.close(); });
    if (this.actions) {
      const press = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); if (!el.disabled) fn(); });
      press(this.actions.use, () => this._use());
      if (this.actions.hold) press(this.actions.hold, () => this._hold());
      press(this.actions.drop1, () => this._drop(1));
      press(this.actions.dropAll, () => this._drop(Infinity));
      press(this.actions.destroy, () => this._destroy());
    }
    body.addEventListener('pointerdown', e => {
      const b = e.target.closest('button[data-bag],#invMainPony');
      if (!b) { if (e.target.closest('#invDropCoins')) { e.preventDefault(); game.events.emit('openCoins'); } else if (e.target.closest('#invPonyCoins')) { e.preventDefault(); game.events.emit('openPonyCoins'); } return; }
      e.preventDefault();
      if (b.id === 'invMainPony') game.makeMainPony(); else this._onBagSlot(Number(b.dataset.bag));
    });
    for (const ev of ['inventoryChanged', 'selectedSlotChanged', 'packChanged', 'chestChanged', 'gearChanged']) game.events.on(ev, () => this.refresh());
    this._initScrollHandle();
    this.refresh();
  }

  /** A scroll handle drawn by the game: phones (Android Chrome especially) fade or hide the native scrollbar and ignore its styling, so this stays
   *  on screen while the bag is open, shows where you are, and can be dragged (or the track tapped) to move. The native bar is hidden in the CSS. */
  _initScrollHandle() {
    const body = this.body, track = document.createElement('div'), thumb = document.createElement('div');
    track.id = 'invScroll'; thumb.id = 'invScrollThumb'; track.appendChild(thumb); this.panel.appendChild(track);
    this.scrollTrack = track; this.scrollThumb = thumb;
    const range = () => { const th = thumb.offsetHeight, room = Math.max(1, track.clientHeight - th), max = Math.max(1, body.scrollHeight - body.clientHeight); return { room, max }; };
    let grab = null;
    thumb.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); thumb.setPointerCapture(e.pointerId); grab = { y: e.clientY, top: body.scrollTop }; thumb.classList.add('drag'); });
    thumb.addEventListener('pointermove', e => { if (!grab) return; const r = range(); body.scrollTop = grab.top + (e.clientY - grab.y) * r.max / r.room; });
    const end = () => { grab = null; thumb.classList.remove('drag'); };
    thumb.addEventListener('pointerup', end); thumb.addEventListener('pointercancel', end);
    track.addEventListener('pointerdown', e => { if (e.target !== track) return; e.preventDefault(); const r = range(), box = track.getBoundingClientRect(); body.scrollTop = (e.clientY - box.top - thumb.offsetHeight / 2) * r.max / r.room; });
    body.addEventListener('scroll', () => this._syncScrollHandle(), { passive: true });
    window.addEventListener('resize', () => this._syncScrollHandle());
    if (window.ResizeObserver) new ResizeObserver(() => this._syncScrollHandle()).observe(body);
  }
  /** Place the handle beside the body and size / position its thumb for how much there is to scroll. */
  _syncScrollHandle() {
    const body = this.body, track = this.scrollTrack, thumb = this.scrollThumb;
    if (!track || this.panel.hidden) return;
    const over = body.scrollHeight - body.clientHeight;
    track.style.display = over > 1 ? '' : 'none';
    if (over <= 1) return;
    track.style.top = body.offsetTop + 'px'; track.style.height = body.clientHeight + 'px';
    const th = Math.max(56, Math.round(body.clientHeight * body.clientHeight / body.scrollHeight));
    thumb.style.height = th + 'px';
    thumb.style.transform = `translateY(${Math.round(body.scrollTop / over * (body.clientHeight - th))}px)`;
  }

  get isOpen() { return !this.panel.hidden; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  open() { const was = this.isOpen; this.panel.hidden = false; this.refresh(); this._syncScrollHandle(); if (!was) Sfx.bag(true); }                       // (the bag rustles open and shut; panels.closeAll() also calls close() on a closed bag: silent)
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
    if (me && Wardrobe.slotFor(s.id) && !Bags.isPonyBag(s.id)) return { label: Wardrobe.isToolSlot(Wardrobe.slotFor(s.id)) ? 'Equip' : 'Wear', run: () => g.equip(from.i) };      // a tool goes into its tool slot, clothes onto you
    if (me && g.chest) return { label: 'To chest', run: () => g.packMove(InventoryUI.wire(from), { chest: true, i: -1 }) };
    if (me && g.pack && g.pack.inventory.size) return { label: 'To pony', run: () => g.packMove(InventoryUI.wire(from), { pack: true, i: -1 }) };
    if (!me) return { label: 'To my bag', run: () => g.packMove(InventoryUI.wire(from), { pack: false, i: -1 }) };
    return null;
  }
  /** Take it in hand (seeds, food, a building piece, the shovel...): the tool bar's selection is put aside until you choose a tool again. */
  _holdAction() {
    const s = this._picked(), from = this.picked;
    if (!s || from.sec !== 'me' || Bags.isPlayerBag(s.id) || Bags.isPonyBag(s.id)) return null;
    return { label: 'Hold', run: () => { this.game.holdFromBag(from.i); this.game.events.emit('closePanels'); } };
  }
  _hold() { const a = this._holdAction(); if (!a) return; a.run(); this.picked = null; this.destroyArmed = false; this.refresh(); }
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
    const html = [`<div class="invpurse"><img alt="" src="${ItemIcons.url('gold_coin')}"><b>Coins</b><span id="invCoins">0</span><button id="invDropCoins" tabindex="-1" title="Open your coin bag: drag coins out onto the world to drop them">Coin bag</button><button id="invPonyCoins" tabindex="-1" title="Open your pony coin bag: the collector coins from the ponies you have caught">Pony coins</button></div>`,
      '<div class="invgrid" data-sec="all">',
      `<div class="invsec"><span>${bagName}</span><small>${belt} pockets + ${inv.size - belt} bag slots</small></div>`, '<!--me-->'];
    if (chest) html.push(`<div class="invsec"><span>${chest.name}</span><small>${chest.inventory.size} slots</small></div>`, '<!--chest-->');
    if (pack) {                                                                                  // the pony's pack is part of the same grid: its slots follow yours, tinted
      const star = pack.main ? ' <span title="Your main pony: it follows you everywhere">&#x2605;</span>' : '';
      const mainBtn = canMain ? '<button id="invMainPony" tabindex="-1" title="Make it the pony that follows you everywhere">&#x2605; Make main</button>' : '';
      html.push(`<div class="invsec pony"><span>${pack.riding ? 'Riding' : 'Beside you'}: ${pack.name}${star}</span>${mainBtn}<small>${pack.inventory.size} pack slots</small></div>`);
      html.push(`<div class="invbags">${pack.bags.map((b, k) => b
        ? `<button class="invbag filled" data-bag="${k}" tabindex="-1" title="Take the ${ItemDefs[b].name} off (into your bag)"><img alt="" src="${ItemIcons.url(b)}">${ItemDefs[b].name} &#x2715;</button>`
        : `<button class="invbag" data-bag="${k}" tabindex="-1" title="An empty bag slot: pick a pony bag from your bag, then tap here">empty bag slot</button>`).join('')}</div>`);
      html.push(pack.inventory.size ? '<!--pack-->' : '<div class="invnote">No bags on this pony yet: buy saddlebags at the General Store.</div>');
    } else html.push('<div class="invnote">Ride one of your ponies, or stand next to it, to open its pack.</div>');
    html.push('</div>');
    this.body.innerHTML = html.join('');
    this.slotEls = { me: [], pack: [], chest: [] };
    const fill = (marker, sec, n, list, num) => {                                               // swap a marker comment for n slots, all in the one grid
      const node = [...this.body.querySelector('.invgrid').childNodes].find(c => c.nodeType === 8 && c.data === marker);
      if (!node) return;
      for (let i = 0; i < n; i++) {
        const el = SlotView.create(i, num ? num(i) : '');
        if (num && i < belt) el.classList.add('belt');
        if (sec === 'pack') el.classList.add('ponyslot');
        this._bindSlot(el, sec, i);
        node.parentNode.insertBefore(el, node); list.push(el);
      }
      node.remove();
    };
    fill('me', 'me', inv.size, this.slotEls.me, i => (i < belt ? i + 1 : ''));
    if (chest) fill('chest', 'chest', chest.inventory.size, this.slotEls.chest);
    if (pack && pack.inventory.size) fill('pack', 'pack', pack.inventory.size, this.slotEls.pack);
  }

  refresh() {
    if (this.picked && !this._picked()) this.picked = null;
    this._build();
    const P = this.picked, coinEl = this.body.querySelector('#invCoins'), dropCoins = this.body.querySelector('#invDropCoins');
    if (coinEl) { const html = InventoryUI.coinHtml(this.game.inventory.coins); if (coinEl.dataset.h !== html) { coinEl.dataset.h = html; coinEl.innerHTML = html; } }
    if (dropCoins) dropCoins.disabled = !(this.game.inventory.purse > 0);
    this.slotEls.me.forEach((el, i) => {
      SlotView.fill(el, this.game.inventory.getSlot(i));
      el.classList.toggle('selected', i === this.game.hand);                                  // (the slot of the Bag item in hand)
      el.classList.toggle('picked', !!P && P.sec === 'me' && P.i === i);
    });
    this.slotEls.pack.forEach((el, i) => { SlotView.fill(el, this.game.pack.inventory.getSlot(i)); el.classList.toggle('picked', !!P && P.sec === 'pack' && P.i === i); });
    this.slotEls.chest.forEach((el, i) => { SlotView.fill(el, this.game.chest.inventory.getSlot(i)); el.classList.toggle('picked', !!P && P.sec === 'chest' && P.i === i); });
    const s = this._picked(), ponyBag = s && P.sec === 'me' && Bags.isPonyBag(s.id);
    for (const b of this.body.querySelectorAll('.invbag')) b.classList.toggle('target', !!ponyBag && !b.classList.contains('filled'));
    this._syncScrollHandle();
    if (!this.actions) return;
    const A = this.actions, def = s && ItemDefs[s.id], use = this._useAction();
    A.label.textContent = s ? `${def ? def.name : s.id}${s.count > 1 ? ' x' + s.count : ''}${P.sec === 'pack' ? ' (pony pack)' : P.sec === 'chest' ? ' (chest)' : ''}` : 'Tap an item to move, drop or destroy it';
    A.use.hidden = !use; if (use) A.use.textContent = use.label;
    if (A.hold) A.hold.hidden = !this._holdAction();
    A.drop1.disabled = A.destroy.disabled = !s; A.dropAll.disabled = !s || s.count < 2;
    A.destroy.textContent = this.destroyArmed ? 'Really destroy?' : 'Destroy';
    A.destroy.classList.toggle('armed', this.destroyArmed);
  }
}
