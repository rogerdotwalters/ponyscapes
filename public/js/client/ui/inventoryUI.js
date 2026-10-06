'use strict';
/* CLIENT - backpack panel. Tap a stack, then tap a destination slot to move / merge / swap, or use the row below to drop it on the
 * ground (anyone can pick it up again with the interact key) or destroy it (tap Destroy twice: it is gone for good). */
class InventoryUI {
  constructor({ panel, grid, closeButton, game, actions }) {
    this.panel = panel; this.game = game; this.pickedIndex = null; this.slotElements = []; this.actions = actions || null; this.destroyArmed = false;
    const hotbar = CONFIG.sim.inventory.hotbarSlots;
    for (let i = 0; i < game.inventory.size; i++) {
      const el = SlotView.create(i, i < hotbar ? i + 1 : '');
      SlotView.onPress(el, () => this._onSlotPressed(i));
      grid.appendChild(el); this.slotElements.push(el);
    }
    closeButton.addEventListener('pointerdown', e => { e.preventDefault(); this.close(); });
    if (this.actions) {
      const press = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); if (!el.disabled) fn(); });
      press(this.actions.drop1, () => this._drop(1));
      press(this.actions.dropAll, () => this._drop(Infinity));
      press(this.actions.destroy, () => this._destroy());
    }
    game.events.on('inventoryChanged', () => this.refresh());
    game.events.on('selectedSlotChanged', () => this.refresh());
    this.refresh();
  }

  get isOpen() { return !this.panel.hidden; }
  toggle() { this.isOpen ? this.close() : this.open(); }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; this.pickedIndex = null; this.refresh(); }

  _onSlotPressed(index) {
    if (this.pickedIndex === null) {
      if (this.game.inventory.getSlot(index)) this.pickedIndex = index;     // pick up
    } else {
      if (index !== this.pickedIndex) this.game.moveSlot(this.pickedIndex, index);
      this.pickedIndex = null;                                              // drop (or cancel on same slot)
    }
    this.destroyArmed = false;
    this.refresh();
  }

  _picked() { return this.pickedIndex === null ? null : this.game.inventory.getSlot(this.pickedIndex); }
  _drop(count) {
    const s = this._picked();
    if (!s) return;
    this.game.dropItem(this.pickedIndex, Math.min(count, s.count));
    if (count >= s.count) this.pickedIndex = null;
    this.destroyArmed = false; this.refresh();
  }
  _destroy() {
    const s = this._picked();
    if (!s) return;
    if (!this.destroyArmed) { this.destroyArmed = true; this.refresh(); return; }   // first tap asks, the second does it
    this.game.destroyItem(this.pickedIndex, s.count);
    this.pickedIndex = null; this.destroyArmed = false; this.refresh();
  }

  refresh() {
    if (this.pickedIndex !== null && !this.game.inventory.getSlot(this.pickedIndex)) this.pickedIndex = null;
    this.slotElements.forEach((el, i) => {
      SlotView.fill(el, this.game.inventory.getSlot(i));
      el.classList.toggle('selected', i === this.game.selectedSlot);
      el.classList.toggle('picked', i === this.pickedIndex);
    });
    if (!this.actions) return;
    const s = this._picked(), A = this.actions, def = s && ItemDefs[s.id];
    A.label.textContent = s ? `${def ? def.name : s.id}${s.count > 1 ? ' x' + s.count : ''}` : 'Tap an item to move, drop or destroy it';
    A.drop1.disabled = A.destroy.disabled = !s; A.dropAll.disabled = !s || s.count < 2;
    A.destroy.textContent = this.destroyArmed ? 'Really destroy?' : 'Destroy';
    A.destroy.classList.toggle('armed', this.destroyArmed);
  }
}
