'use strict';
/* CLIENT - the tool bar: the five tool slots of the character (lasso, hoe, sword, fishing rod, axe: keys 1-5, the D-pad), the selected one lit.
 * An item taken in hand from the Bag (seeds, food, a building piece, the shovel...) shows in a slot of its own beside the bar while it is in hand;
 * choosing any tool puts it away again. */
const TOOL_SLOT_NAMES = { lasso: 'Lasso', hoe: 'Hoe', sword: 'Sword', rod: 'Rod', axe: 'Axe' };

/** What the action button (touch) and the trigger (controller) does with the item in hand: "Chop", "Cast", "Attack"... */
const TOOL_VERBS = { axe: 'Chop', hoe: 'Till', rod: 'Cast', leash: 'Lasso', sword: 'Attack', knife: 'Attack', spear: 'Attack', bow: 'Shoot', shovel: 'Dig', trowel: 'Dig', water: 'Water', sickle: 'Cut', shears: 'Shear', brush: 'Brush', hammer: 'Hit' };
function toolVerb(itemId) {
  const tool = ItemDB.getTool(itemId), def = itemId && ItemDefs[itemId];
  if (tool) return TOOL_VERBS[tool.kind] || 'Use';
  if (!def) return 'Use';
  return ItemDB.getPlaceable(itemId) ? 'Place' : def.seed ? 'Plant' : ItemDB.getFood(itemId) || ItemDB.getDrink(itemId) ? 'Use' : 'Use';
}

class ToolbarUI {
  constructor({ root, game }) {
    this.game = game; this.slotElements = [];
    for (let i = 0; i < ToolSlots.length; i++) {
      const el = SlotView.create(i, i + 1);
      SlotView.onPress(el, () => game.selectSlot(i));
      root.appendChild(el); this.slotElements.push(el);
    }
    this.handEl = SlotView.create(-1, '');                         // the Bag item in hand
    this.handEl.classList.add('handSlot'); this.handEl.hidden = true;
    SlotView.onPress(this.handEl, () => game.selectSlot(game.selectedSlot));          // (a press puts it away)
    root.appendChild(this.handEl);
    game.events.on('inventoryChanged', () => this.refresh());
    game.events.on('selectedSlotChanged', () => this.refresh());
    game.events.on('gearChanged', () => this.refresh());
    this.refresh();
  }

  refresh() {
    const g = this.game, gear = g.gear, inHand = g.hand >= 0 ? g.inventory.getSlot(g.hand) : null;
    this.slotElements.forEach((el, i) => {
      const name = ToolSlots[i], item = gear[name];
      SlotView.fill(el, item ? { id: item, count: 1 } : null);
      if (!item) { el.querySelector('.qty').textContent = TOOL_SLOT_NAMES[name]; el.title = `${TOOL_SLOT_NAMES[name]} slot: empty (Menu > Gear)`; }
      el.classList.toggle('selected', i === g.selectedSlot && !inHand);
      el.classList.toggle('empty', !item);
    });
    this.handEl.hidden = !inHand;
    if (inHand) { SlotView.fill(this.handEl, inHand); this.handEl.classList.add('selected'); this.handEl.title = (ItemDefs[inHand.id] ? ItemDefs[inHand.id].name : inHand.id) + ' (in hand: press a tool to put it away)'; }
  }
}
