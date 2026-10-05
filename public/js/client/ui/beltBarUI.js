'use strict';
/* CLIENT - the second utility bar (tool belt) and the separate sword slot (scabbard / sling). */
class BeltBarUI {
  constructor({ root, game }) {
    this.game = game; this.root = root; this.slotElements = [];
    const inv = CONFIG.sim.inventory;
    for (let i = 0; i < inv.beltSlots; i++) {
      const el = SlotView.create(inv.beltStart + i, '\u21E7' + (i + 1));          // Shift+1..6
      SlotView.onPress(el, () => game.selectSlot(inv.beltStart + i));
      root.appendChild(el); this.slotElements.push(el);
    }
    game.events.on('inventoryChanged', () => this.refresh());
    game.events.on('selectedSlotChanged', () => this.refresh());
    this.refresh();
  }
  refresh() {
    const start = CONFIG.sim.inventory.beltStart;
    this.slotElements.forEach((el, i) => {
      SlotView.fill(el, this.game.inventory.getSlot(start + i));
      el.classList.toggle('selected', start + i === this.game.selectedSlot && !this.game.drawn);
    });
  }
}

/** One extra slot that only exists while a scabbard / sling is worn. It holds the sword; tapping it draws / sheathes. */
class SwordSlotUI {
  constructor({ button, game }) {
    this.button = button; this.game = game;
    button.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); game.toggleDrawn(); });
    game.events.on('gearChanged', () => this.refresh());
    game.events.on('selectedSlotChanged', () => this.refresh());
    this.refresh();
  }
  refresh() {
    const gear = this.game.gear;
    this.button.innerHTML = gear.weapon ? `<img alt="" src="${ItemIcons.url(gear.weapon)}">` : '<span class="empty">&#9876;</span>';
    this.button.classList.toggle('drawn', !!this.game.drawn && !!gear.weapon);
    this.button.title = gear.weapon ? (this.game.drawn ? 'Sheathe (X)' : 'Draw (X)') : 'Empty scabbard';
  }
}
