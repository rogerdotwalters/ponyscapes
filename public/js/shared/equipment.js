'use strict';
/* SHARED - what a character wears and carries on its body.
 *   head chest legs feet hands  armour (each piece has a `defense` value)
 *   shield                      extra damage reduction
 *   belt                        a tool belt adds a SECOND utility bar (inventory slots beltStart..)
 *   back                        a scabbard or sling gives the sword its own slot, separate from every bar
 *   weapon                      the sword in that slot (drawn / sheathed with one button)
 * `gear` is part of the player state, so everybody can see what you wear. */
const EquipSlots = Object.freeze(['head', 'chest', 'legs', 'feet', 'hands', 'shield', 'belt', 'back']);
const createGear = () => ({ head: '', chest: '', legs: '', feet: '', hands: '', shield: '', belt: '', back: '', weapon: '' });

const Gear = {
  /** Which gear slot an item goes into: its own equip slot, or 'weapon' for swords. */
  slotFor(itemId) {
    const equip = ItemDB.getEquip(itemId);
    if (equip) return equip.slot;
    const tool = ItemDB.getTool(itemId);
    return tool && tool.kind === 'sword' ? 'weapon' : null;
  },
  hasBelt: gear => !!gear.belt,
  hasSheath: gear => !!gear.back && !!(ItemDefs[gear.back] && ItemDefs[gear.back].sheath),
  armourPoints(gear) { return ['head', 'chest', 'legs', 'feet', 'hands', 'shield'].reduce((n, s) => n + (gear[s] ? ItemDB.getEquip(gear[s]).defense : 0), 0); },
  /** 0..maxReduction of incoming damage that is absorbed. */
  damageReduction(gear) {
    const C = CONFIG.sim.combat;
    return Math.min(C.maxReduction, Gear.armourPoints(gear) * C.armorPerPoint + (gear.shield ? C.shieldReduction : 0));
  },
  /** The item the character holds: the drawn sword if it is out, else the selected bar slot. */
  heldItem(gear, drawn, barItem) { return drawn && gear.weapon ? gear.weapon : barItem; },
  isBeltSlot: index => index >= CONFIG.sim.inventory.beltStart,
  beltEmpty: inventory => inventory.slots.slice(CONFIG.sim.inventory.beltStart).every(s => !s)
};
