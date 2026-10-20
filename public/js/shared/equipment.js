'use strict';
/* SHARED - what a character wears: a crown, an outfit (a dress or prince garb: the main slot) and a cape. Nothing else: no armour, no shield, no belt,
 * no scabbard. It is purely how you look. `gear` is part of the player state, so everybody sees what you wear. A new character wears the simple crown. */
const WardrobeSlots = Object.freeze(['crown', 'outfit', 'cape']);
/** The TOOL SLOTS: the five slots of the tool bar (keys 1-5, the D-pad). Each takes its own kind of tool, and any quality of it (a better axe replaces the axe).
 *  Everything else you use (seeds, food, building pieces, the shovel, the watering can...) lives in the Bag and is taken in hand from there. */
const ToolSlots = Object.freeze(['lasso', 'hoe', 'sword', 'rod', 'axe']);
const SWORD_SLOT_KINDS = Object.freeze(['knife', 'sword', 'spear', 'bow']);          // the "sword" slot: whatever you fight with
const createWardrobe = () => ({ crown: 'crown_simple', outfit: '', cape: '', lasso: 'leash', hoe: '', sword: '', rod: '', axe: '', bag: CONFIG.sim.inventory.starterBag });     // + the tool slots (the lasso is also thrown with L; better lassos catch rarer ponies) and the BAG SLOT (inventory.js)
/** Slots that are not clothes: what is in them still shows in Gear. */
const GearExtraSlots = Object.freeze(['lasso', 'hoe', 'sword', 'rod', 'axe', 'bag']);

const Wardrobe = {
  /** Which slot an item goes into, or null if it is not wardrobe. */
  slotFor(itemId) {
    if (ItemDB.getLasso(itemId)) return 'lasso';
    if (Bags.isPlayerBag(itemId)) return 'bag';
    const tool = ItemDB.getTool(itemId), kind = tool && tool.kind;
    if (kind === 'hoe' || kind === 'rod' || kind === 'axe') return kind;
    if (SWORD_SLOT_KINDS.includes(kind)) return 'sword';
    const equip = ItemDB.getEquip(itemId); return equip ? equip.slot : null;
  },
  /** Is this one of the five tool slots? */
  isToolSlot: slot => ToolSlots.includes(slot),
  /** What is in your hand: an item you took out of the Bag (`hand` is its slot there, -1 for none), else the selected tool slot (0-4). */
  heldFor(gear, sel, hand, inventory) {
    if (Number.isInteger(hand) && hand >= 0 && hand < inventory.size && inventory.itemIdAt(hand)) return inventory.itemIdAt(hand);
    return (gear && gear[ToolSlots[sel | 0]]) || '';
  },
  /** Put each tool you carry loose (the Bag or the old tool belt) into its empty tool slot: a new character's starter kit, and old saves that kept their tools in the belt. */
  autoEquip(gear, inventory) {
    for (const slot of ToolSlots) {
      if (gear[slot]) continue;
      for (let i = 0; i < inventory.size; i++) {
        const item = inventory.itemIdAt(i);
        if (item && Wardrobe.slotFor(item) === slot && ItemDB.getTool(item)) { inventory.remove(item, 1); gear[slot] = item; break; }
      }
    }
  },
  /** Can THIS character wear it? Dresses are for princesses, garb for princes; crowns and capes are for everybody. */
  fits(itemId, appearance) {
    if (ItemDB.getLasso(itemId) || Bags.isPlayerBag(itemId) || ToolSlots.includes(Wardrobe.slotFor(itemId))) return true;
    const equip = ItemDB.getEquip(itemId);
    if (!equip) return false;
    if (!equip.body || equip.body === 'any') return true;
    const look = CharacterLook.sanitize(appearance) || CharacterLook.defaultFor(0);
    return equip.body === (look[0] === CharacterLook.PRINCESS ? 'princess' : 'prince');
  },
  /** The cape's two numbers. Nothing else you wear has stats. */
  power: gear => { const e = gear && gear.cape && ItemDB.getEquip(gear.cape); return e ? e.power : 0; },
  def: gear => { const e = gear && gear.cape && ItemDB.getEquip(gear.cape); return e ? e.def : 0; },
  /** 0..maxReduction of incoming damage that the cape's DEF soaks. */
  damageReduction: gear => Math.min(CONFIG.sim.combat.maxReduction, Wardrobe.def(gear) * CONFIG.sim.combat.defPerPoint),
  /** What an item says about who it is for, in words. */
  forWhom: itemId => { const e = ItemDB.getEquip(itemId); return e && e.body === 'princess' ? 'a dress for a princess' : e && e.body === 'prince' ? 'garb for a prince' : 'for anyone'; }
};
