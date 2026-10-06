'use strict';
/* SHARED - what a character wears: a crown, an outfit (a dress or prince garb: the main slot) and a cape. Nothing else: no armour, no shield, no belt,
 * no scabbard. It is purely how you look. `gear` is part of the player state, so everybody sees what you wear. A new character wears the simple crown. */
const WardrobeSlots = Object.freeze(['crown', 'outfit', 'cape']);
const createWardrobe = () => ({ crown: 'crown_simple', outfit: '', cape: '', lasso: 'leash' });     // + the LASSO SLOT: thrown with L; better lassos catch rarer ponies

const Wardrobe = {
  /** Which slot an item goes into, or null if it is not wardrobe. */
  slotFor(itemId) { if (ItemDB.getLasso(itemId)) return 'lasso'; const equip = ItemDB.getEquip(itemId); return equip ? equip.slot : null; },
  /** Can THIS character wear it? Dresses are for princesses, garb for princes; crowns and capes are for everybody. */
  fits(itemId, appearance) {
    if (ItemDB.getLasso(itemId)) return true;
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
