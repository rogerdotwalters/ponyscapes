'use strict';
/* DATA - bags. What you carry is a TOOL BELT (5 slots, the hotbar: keys 1-5) plus whatever your BAG holds. You always wear exactly one bag (the
 * Bag slot in Gear): everybody starts with the Starter Backpack (5 slots) and must buy a bigger one at the General Store or craft an upgrade at a
 * crafting table. Ponies wear bags too, and theirs are bigger: every pony has at least two pony-bag slots (rarer ponies more), and the starter
 * pony comes with a Starter Side Pack (10 slots). A pony's bags are its PACK: open it from your bag while you ride the pony or stand next to it.
 *   for     'player' (worn by you, in the Bag slot) | 'pony' (strapped onto one of your ponies)
 *   slots   how many slots it adds
 *   price   [[item, count]...] what it costs at the General Store (no price: not sold)
 *   craft   [[item, count]...] makes a recipe at the crafting table (an upgrade)
 *   color   its leather, for the icon */
const BagItems = new Registry('bags', { required: ['name', 'slots', 'for'], check: b => (['player', 'pony'].includes(b.for) ? null : "has an unknown 'for'") });
BagItems.registerAll([
  /* ---- worn by you ---- */
  { id: 'starter_backpack', name: 'Starter Backpack',  for: 'player', slots: 5,  color: '#9a6b3f' },
  { id: 'satchel',          name: 'Leather Satchel',   for: 'player', slots: 8,  color: '#7a4b2a', price: [['gold_coin', 8]],  craft: [['hide', 3], ['string', 2]] },
  { id: 'explorer_pack',    name: "Explorer's Pack",   for: 'player', slots: 12, color: '#3f6b3a', price: [['gold_coin', 20]], craft: [['hide', 5], ['wool', 4], ['rope', 2]], rarity: 'rare' },
  /* ---- strapped onto a pony ---- */
  { id: 'starter_side_pack', name: 'Starter Side Pack', for: 'pony',  slots: 10, color: '#a8763f' },
  { id: 'saddlebags',        name: 'Saddlebags',        for: 'pony',  slots: 15, color: '#6d4c2f', price: [['gold_coin', 12]], craft: [['hide', 4], ['rope', 2]] },
  { id: 'great_saddlebags',  name: 'Great Saddlebags',  for: 'pony',  slots: 20, color: '#5b2f4a', price: [['gold_coin', 30]], craft: [['hide', 8], ['wool', 4], ['rope', 3]], rarity: 'rare' }
]);
