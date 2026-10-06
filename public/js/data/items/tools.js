'use strict';
/* DATA - tools. One line per entry. Things you use on the world that are not weapons. */
const Tools = new Registry('tools', { required: ['name', 'tool'] });
Tools.registerAll([
  { id: 'axe', name: 'Axe', tool: { kind: 'axe', damage: 1, reach: 1, swingTime: 0.5, impactTime: 0.25 } },
  { id: 'stone_hammer', name: 'Stone Hammer', tool: { kind: 'hammer', damage: 1, reach: 1, swingTime: 0.5, impactTime: 0.25 } },
  { id: 'shovel', name: 'Shovel', tool: { kind: 'shovel', damage: 0, reach: 1.1, swingTime: 0.7, impactTime: 0.4 } },
  { id: 'fishing_rod', name: 'Fishing Rod', tool: { kind: 'rod', damage: 0, reach: 3, swingTime: 1.2, impactTime: 0.9 } },
  /* ---- lassos: they live in the LASSO SLOT (thrown with L). A better lasso reaches farther, lands more often and catches rarer ponies (a pony kind's lassoTier).
   *      Each one is made at the crafting table from the one before it (the equipped one counts), so a lasso is UPGRADED rather than replaced. ---- */
  { id: 'leash', name: 'Rope Lasso', maxStack: 5, lasso: { tier: 1, chance: 0 }, tool: { kind: 'leash', damage: 0, reach: 5, swingTime: 0.8, impactTime: 0.45 } },
  { id: 'lasso_silk', name: 'Silk Lasso', maxStack: 1, rarity: 'uncommon', lasso: { tier: 2, chance: 0.06 }, craft: [['leash', 1], ['string', 6], ['wool', 4]], tool: { kind: 'leash', damage: 0, reach: 6, swingTime: 0.75, impactTime: 0.42 } },
  { id: 'lasso_gold', name: 'Golden Lasso', maxStack: 1, rarity: 'rare', lasso: { tier: 3, chance: 0.12 }, craft: [['lasso_silk', 1], ['gold_coin', 8], ['rope', 4]], tool: { kind: 'leash', damage: 0, reach: 7, swingTime: 0.7, impactTime: 0.4 } },
  { id: 'lasso_star', name: 'Starlight Lasso', maxStack: 1, rarity: 'epic', lasso: { tier: 4, chance: 0.2 }, craft: [['lasso_gold', 1], ['feather', 6], ['dragon_scale', 2]], tool: { kind: 'leash', damage: 0, reach: 8, swingTime: 0.65, impactTime: 0.38 } },
  /* ---- brushes: groom a pony you own (Use, standing beside it): it grows fonder and gains XP. `groom` multiplies the XP. ---- */
  { id: 'brush', name: 'Wooden Brush', groom: 1, tool: { kind: 'brush', damage: 0, reach: 1.6, swingTime: 0.7, impactTime: 0.4 } },
  { id: 'soft_brush', name: 'Soft Brush', rarity: 'uncommon', groom: 1.6, craft: [['brush', 1], ['wool', 3], ['plank', 1]], tool: { kind: 'brush', damage: 0, reach: 1.6, swingTime: 0.6, impactTime: 0.35 } }
]);
