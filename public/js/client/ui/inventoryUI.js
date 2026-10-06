'use strict';
/* CLIENT - backpack panel. Tap a stack, then tap a destination slot to move / merge / swap. */
class InventoryUI {
  constructor({ panel, grid, closeButton, game }) {
    this.panel = panel; this.game = game; this.pickedIndex = null; this.slotElements = [];
    const hotbar = CONFIG.sim.inventory.hotbarSlots;
    for (let i = 0; i < game.inventory.size; i++) {
      const el = SlotView.create(i, i < hotbar ? i + 1 : '');
      SlotView.onPress(el, () => this._onSlotPressed(i));
      grid.appendChild(el); this.slotElements.push(el);
    }
    closeButton.addEventListener('pointerdown', e => { e.preventDefault(); this.close(); });
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
    this.refresh();
  }

  refresh() {
    this.slotElements.forEach((el, i) => {
      SlotView.fill(el, this.game.inventory.getSlot(i));
      el.classList.toggle('selected', i === this.game.selectedSlot);
      el.classList.toggle('picked', i === this.pickedIndex);
    });
  }
}
