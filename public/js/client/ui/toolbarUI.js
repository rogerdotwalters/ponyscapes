'use strict';
/* CLIENT - hotbar. Reads the inventory, shows the selected slot, and asks the game to change selection. */
class ToolbarUI {
  constructor({ root, game }) {
    this.game = game; this.slotElements = [];
    for (let i = 0; i < CONFIG.sim.inventory.hotbarSlots; i++) {
      const el = SlotView.create(i, i + 1);
      SlotView.onPress(el, () => game.selectSlot(i));
      root.appendChild(el); this.slotElements.push(el);
    }
    game.events.on('inventoryChanged', () => this.refresh());
    game.events.on('selectedSlotChanged', () => this.refresh());
    this.refresh();
  }

  refresh() {
    this.slotElements.forEach((el, i) => {
      SlotView.fill(el, this.game.inventory.getSlot(i));
      el.classList.toggle('selected', i === this.game.selectedSlot);
    });
  }
}
