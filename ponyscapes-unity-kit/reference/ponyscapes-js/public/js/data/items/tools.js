'use strict';
/* DATA - tools. One line per entry. Things you use on the world that are not weapons. */
const Tools = new Registry('tools', { required: ['name', 'tool'] });
Tools.registerAll([
  { id: 'axe', name: 'Axe', tool: { kind: 'axe', damage: 1, reach: 1, swingTime: 0.5, impactTime: 0.25 } },
  { id: 'stone_hammer', name: 'Stone Hammer', tool: { kind: 'hammer', damage: 1, reach: 1, swingTime: 0.5, impactTime: 0.25 } },
  { id: 'shovel', name: 'Shovel', tool: { kind: 'shovel', damage: 0, reach: 1.1, swingTime: 0.7, impactTime: 0.4 } },
  /* ---- shears: Use beside a sheep (any creature with `shear` in its data) and its wool pops off onto the ground; it grows back in a while ---- */
  { id: 'shears', name: 'Shears', price: [['gold_coin', 4]], craft: [['stone', 2], ['string', 1], ['plank', 1]], tool: { kind: 'shears', damage: 0, reach: 1.5, swingTime: 0.55, impactTime: 0.3 } },
  /* ---- the sickle: mows the grass in a three-tile swath in front of you; cut grass gives hay (grass.js). Knives, swords and shears cut a tile ---- */
  { id: 'sickle', name: 'Sickle', price: [['gold_coin', 3]], craft: [['stone', 1], ['plank', 1]], tool: { kind: 'sickle', damage: 0, reach: 1.1, swingTime: 0.45, impactTime: 0.22 } },
  /* ---- farming (farming.js): a hoe tills the ground (a half tile in front of you), a watering can waters what grows there ---- */
  { id: 'hoe', name: 'Hoe', price: [['gold_coin', 3]], craft: [['plank', 2], ['stone', 1]], tool: { kind: 'hoe', damage: 0, reach: 1, swingTime: 0.5, impactTime: 0.3 } },
  { id: 'hand_trowel', name: 'Hand Trowel', price: [['gold_coin', 2]], craft: [['plank', 1], ['stone', 1]], tool: { kind: 'trowel', damage: 0, reach: 1, swingTime: 0.5, impactTime: 0.3 } },   // digs the holes seeds go in (a shovel does too)
  { id: 'watering_can', name: 'Watering Can', price: [['gold_coin', 3]], craft: [['plank', 3], ['string', 1]], tool: { kind: 'water', damage: 0, reach: 1, swingTime: 0.6, impactTime: 0.35 } },
  /* ---- the hedge cutter (hedges.js): Use beside a berry bush to cut it down (a Hedge Bush to plant, and its berries); Use on a planted hedge to trim it into the next shape ---- */
  { id: 'hedge_cutter', name: 'Hedge Cutter', price: [['gold_coin', 4]], craft: [['stone', 2], ['string', 1], ['plank', 1]], tool: { kind: 'hedge', damage: 0, reach: 1.3, swingTime: 0.55, impactTime: 0.3 } },
  { id: 'fishing_rod', name: 'Fishing Rod', tool: { kind: 'rod', damage: 0, reach: 3, swingTime: 1.2, impactTime: 0.9 } },
  /* ---- lassos: they live in the LASSO SLOT (thrown with L). A better lasso reaches farther, lands more often and catches rarer ponies (a pony kind's lassoTier).
   *      Each one is made at the crafting table from the one before it (the equipped one counts), so a lasso is UPGRADED rather than replaced. ---- */
  { id: 'leash', name: 'Old Rope Lasso', maxStack: 1, lasso: { tier: 1, chance: 0 }, tool: { kind: 'leash', damage: 0, reach: 5, swingTime: 0.8, impactTime: 0.45 } },
  { id: 'lasso_silk', name: 'Silk Lasso', maxStack: 1, rarity: 'uncommon', lasso: { tier: 2, chance: 0.06 }, craft: [['leash', 1], ['string', 6], ['wool', 4]], tool: { kind: 'leash', damage: 0, reach: 6, swingTime: 0.75, impactTime: 0.42 } },
  { id: 'lasso_gold', name: 'Golden Lasso', maxStack: 1, rarity: 'rare', lasso: { tier: 3, chance: 0.12 }, craft: [['lasso_silk', 1], ['gold_coin', 8], ['rope', 4]], tool: { kind: 'leash', damage: 0, reach: 7, swingTime: 0.7, impactTime: 0.4 } },
  { id: 'lasso_star', name: 'Starlight Lasso', maxStack: 1, rarity: 'epic', lasso: { tier: 4, chance: 0.2 }, craft: [['lasso_gold', 1], ['feather', 6], ['dragon_scale', 2]], tool: { kind: 'leash', damage: 0, reach: 8, swingTime: 0.65, impactTime: 0.38 } },
  /* ---- the lasso dealer in the stable sells these for gold (no recipe): themed lassos with their own look, reach and cast speed. Tier 2 = pegasi, 3 = unicorns, 4 = alicorns; Fire and Lightning cast fastest, Cloud and Jungle reach farthest, Rainbow is the best rope in the land. ---- */
  { id: 'lasso_red', name: 'Red Lasso', maxStack: 1, rarity: 'uncommon', lasso: { tier: 2, chance: 0.05 }, price: [['gold_coin', 8]], tool: { kind: 'leash', damage: 0, reach: 6, swingTime: 0.7, impactTime: 0.4 } },
  { id: 'lasso_blue', name: 'Blue Lasso', maxStack: 1, rarity: 'uncommon', lasso: { tier: 2, chance: 0.05 }, price: [['gold_coin', 8]], tool: { kind: 'leash', damage: 0, reach: 7, swingTime: 0.8, impactTime: 0.45 } },
  { id: 'lasso_yellow', name: 'Yellow Lasso', maxStack: 1, rarity: 'uncommon', lasso: { tier: 2, chance: 0.08 }, price: [['gold_coin', 9]], tool: { kind: 'leash', damage: 0, reach: 6, swingTime: 0.75, impactTime: 0.42 } },
  { id: 'lasso_flower', name: 'Flower Lasso', maxStack: 1, rarity: 'uncommon', lasso: { tier: 2, chance: 0.07 }, price: [['gold_coin', 10]], tool: { kind: 'leash', damage: 0, reach: 6, swingTime: 0.75, impactTime: 0.42 } },
  { id: 'lasso_candy', name: 'Candy Lasso', maxStack: 1, rarity: 'uncommon', lasso: { tier: 2, chance: 0.08 }, price: [['gold_coin', 12]], tool: { kind: 'leash', damage: 0, reach: 6, swingTime: 0.72, impactTime: 0.4 } },
  { id: 'lasso_water', name: 'Water Lasso', maxStack: 1, rarity: 'rare', lasso: { tier: 3, chance: 0.1 }, price: [['gold_coin', 22]], tool: { kind: 'leash', damage: 0, reach: 7, swingTime: 0.72, impactTime: 0.4 } },
  { id: 'lasso_jungle', name: 'Jungle Lasso', maxStack: 1, rarity: 'rare', lasso: { tier: 3, chance: 0.1 }, price: [['gold_coin', 24]], tool: { kind: 'leash', damage: 0, reach: 8, swingTime: 0.8, impactTime: 0.45 } },
  { id: 'lasso_fire', name: 'Fire Lasso', maxStack: 1, rarity: 'rare', lasso: { tier: 3, chance: 0.12 }, price: [['gold_coin', 26]], tool: { kind: 'leash', damage: 0, reach: 6, swingTime: 0.6, impactTime: 0.34 } },
  { id: 'lasso_cloud', name: 'Cloud Lasso', maxStack: 1, rarity: 'rare', lasso: { tier: 3, chance: 0.1 }, price: [['gold_coin', 28]], tool: { kind: 'leash', damage: 0, reach: 8, swingTime: 0.65, impactTime: 0.37 } },
  { id: 'lasso_crystal', name: 'Crystal Lasso', maxStack: 1, rarity: 'rare', lasso: { tier: 3, chance: 0.12 }, price: [['gold_coin', 30]], tool: { kind: 'leash', damage: 0, reach: 7, swingTime: 0.7, impactTime: 0.4 } },
  { id: 'lasso_ponytail', name: 'Ponytail Lasso', maxStack: 1, rarity: 'rare', lasso: { tier: 3, chance: 0.14 }, price: [['gold_coin', 34]], tool: { kind: 'leash', damage: 0, reach: 6, swingTime: 0.68, impactTime: 0.38 } },
  { id: 'lasso_lightning', name: 'Lightning Lasso', maxStack: 1, rarity: 'epic', lasso: { tier: 4, chance: 0.16 }, price: [['gold_coin', 55]], tool: { kind: 'leash', damage: 0, reach: 7, swingTime: 0.5, impactTime: 0.28 } },
  { id: 'lasso_sun', name: 'Sun Lasso', maxStack: 1, rarity: 'epic', lasso: { tier: 4, chance: 0.2 }, price: [['gold_coin', 70]], tool: { kind: 'leash', damage: 0, reach: 8, swingTime: 0.65, impactTime: 0.37 } },
  { id: 'lasso_harmony', name: 'Harmony Lasso', maxStack: 1, rarity: 'epic', lasso: { tier: 4, chance: 0.22 }, price: [['gold_coin', 85]], tool: { kind: 'leash', damage: 0, reach: 8, swingTime: 0.6, impactTime: 0.34 } },
  { id: 'lasso_rainbow', name: 'Rainbow Lasso', maxStack: 1, rarity: 'legendary', lasso: { tier: 4, chance: 0.25 }, price: [['gold_coin', 100]], tool: { kind: 'leash', damage: 0, reach: 9, swingTime: 0.6, impactTime: 0.34 } },
  /* ---- brushes: groom a pony you own (Use, standing beside it): it grows fonder and gains XP. `groom` multiplies the XP. ---- */
  { id: 'brush', name: 'Wooden Brush', groom: 1, tool: { kind: 'brush', damage: 0, reach: 1.6, swingTime: 0.7, impactTime: 0.4 } },
  { id: 'soft_brush', name: 'Soft Brush', rarity: 'uncommon', groom: 1.6, craft: [['brush', 1], ['wool', 3], ['plank', 1]], tool: { kind: 'brush', damage: 0, reach: 1.6, swingTime: 0.6, impactTime: 0.35 } }
]);
