'use strict';
/* DATA - the wardrobe: the ONLY things a character wears. Capes carry the only two stats there are: POWER (multiplies the pony's ability: a +0.15 cape
 * makes flight 15% longer and its cooldown 15% shorter) and DEF (each point soaks 2% of damage). Crowns and outfits are just how you look. Three slots:
 *   crown    a crown, tiara or circlet                       outfit   a dress (princess) or prince garb (prince): the main slot       cape   a cape or cloak
 * body: 'any' | 'princess' | 'prince' says who can wear it. look: how it is drawn (style + colours; a null colour means "use the colour you chose in the
 * character screen"). craft: [[item, count]...] makes a recipe at the crafting table automatically; an entry with no craft is found in treasure chests. */
const WardrobeItems = new Registry('wardrobe', { required: ['name', 'slot', 'look'], check: w => (['crown', 'outfit', 'cape'].includes(w.slot) ? null : 'has an unknown slot') });
WardrobeItems.registerAll([
  /* ---- crowns ---- */
  { id: 'crown_simple',   name: 'Simple Crown',      slot: 'crown', body: 'any', look: { style: 'royal',   color: '#f2c14e', gem: null } },
  { id: 'circlet_antler', name: 'Antler Circlet',    slot: 'crown', body: 'any', look: { style: 'circlet', color: '#d9c9a0', gem: null },      craft: [['antler', 2], ['rope', 1]] },
  { id: 'tiara_pearl',    name: 'Pearl Tiara',       slot: 'crown', body: 'any', look: { style: 'tiara',   color: '#e8edf5', gem: '#fdfdff' },  craft: [['gold_coin', 6], ['string', 1]] },
  { id: 'crown_gold',     name: 'Golden Crown',      slot: 'crown', body: 'any', look: { style: 'royal',   color: '#f7d24e', gem: '#e53935' },  craft: [['gold_coin', 10]] },
  { id: 'crown_dragon',   name: 'Dragonbone Crown',  slot: 'crown', body: 'any', look: { style: 'spiked',  color: '#c85a32', gem: '#ffb300' },  craft: [['dragon_scale', 4], ['gold_coin', 5]] },
  { id: 'crown_frost',    name: 'Frost Crown',       slot: 'crown', body: 'any', look: { style: 'spiked',  color: '#cfeeff', gem: '#5ec8ff' } },
  { id: 'crown_star',     name: 'Starlight Diadem',  slot: 'crown', body: 'any', look: { style: 'tiara',   color: '#b9a6ff', gem: '#ffe66d' } },
  /* ---- dresses (princess) ---- */
  { id: 'dress_sun',      name: 'Sundress',          slot: 'outfit', body: 'princess', look: { style: 'sundress', color: null,      trim: null },      craft: [['wool', 4], ['string', 2]] },
  { id: 'dress_ball',     name: 'Ball Gown',         slot: 'outfit', body: 'princess', look: { style: 'ball',     color: '#d94f8a', trim: '#ffffff' }, craft: [['wool', 8], ['string', 4], ['gold_coin', 3]] },
  { id: 'dress_dragon',   name: 'Dragonscale Gown',  slot: 'outfit', body: 'princess', look: { style: 'scaled',   color: '#2e8b57', trim: '#ffd54f' }, craft: [['dragon_scale', 5], ['wool', 4]] },
  { id: 'dress_star',     name: 'Starlight Gown',    slot: 'outfit', body: 'princess', look: { style: 'ball',     color: '#2a2f6b', trim: '#ffe66d' } },
  /* ---- prince garb ---- */
  { id: 'garb_tunic',     name: 'Royal Tunic',       slot: 'outfit', body: 'prince',   look: { style: 'tunic',    color: null,      trim: null },      craft: [['wool', 4], ['string', 2]] },
  { id: 'garb_doublet',   name: 'Gilded Doublet',    slot: 'outfit', body: 'prince',   look: { style: 'doublet',  color: '#7b1fa2', trim: '#f2c14e' }, craft: [['wool', 6], ['string', 3], ['gold_coin', 3]] },
  { id: 'garb_hunter',    name: "Hunter's Garb",     slot: 'outfit', body: 'prince',   look: { style: 'hunter',   color: '#3f6b3a', trim: '#8a5a33' }, craft: [['hide', 4], ['string', 2]] },
  { id: 'garb_midnight',  name: 'Midnight Garb',     slot: 'outfit', body: 'prince',   look: { style: 'doublet',  color: '#1c2240', trim: '#b9a6ff' } },
  /* ---- capes ---- */
  { id: 'cape_traveler',  name: "Traveller's Cape",  slot: 'cape', body: 'any', look: { style: 'plain',  color: '#7a5a3a', trim: '#5a3f26' }, power: 0.05, def: 1, craft: [['wool', 3], ['string', 1]] },
  { id: 'cape_royal',     name: 'Royal Cape',        slot: 'cape', body: 'any', look: { style: 'royal',  color: '#b0262e', trim: '#f5f1e6' }, power: 0.15, def: 3, craft: [['wool', 5], ['gold_coin', 3]] },
  { id: 'cape_fur',       name: 'Fur Cloak',         slot: 'cape', body: 'any', look: { style: 'fur',    color: '#ece6d6', trim: '#bdb5a2' }, power: 0.1, def: 5, craft: [['hide', 3], ['wool', 3]] },
  { id: 'cape_dragon',    name: 'Dragonscale Cape',  slot: 'cape', body: 'any', look: { style: 'scaled', color: '#2e7d4a', trim: '#ffd54f' }, power: 0.3, def: 6, craft: [['dragon_scale', 3], ['wool', 4]] },
  { id: 'cape_star',      name: 'Starlight Cape',    slot: 'cape', body: 'any', look: { style: 'star',   color: '#232a66', trim: '#ffe66d' }, power: 0.4, def: 4 }
]);
