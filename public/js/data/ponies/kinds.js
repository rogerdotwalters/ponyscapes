'use strict';
/* DATA - the pony kinds. baseSpeed: tiles / second at full gallop at level 1 (the level curve in CONFIG.sim.ponySpeed scales it);
 * lassoTier: the lasso it takes to catch one (1 = the plain rope lasso; see the lassos in data/items/tools.js).
 * DATA - the pony kinds. Which ring each lives in, how common it is and how big a herd; the rest (shy, protected, lured by food, tameable with a lasso)
 * is the common pony behaviour applied by the animal factory. Add a pony = add a line (and its look in the variants table if it needs one). */
PonyKinds.register({ id: 'pony_plain', name: 'Pony', baseSpeed: 3.8, lassoTier: 1, ring: 0, weight: 2.5, group: [1, 3], levelBase: 1, tameApples: 2 });
PonyKinds.register({ id: 'pony_earth', name: 'Earth Pony', baseSpeed: 4.4, lassoTier: 1, ring: 1, weight: 3, group: [1, 3], levelBase: 6, tameApples: 2 });
PonyKinds.register({ id: 'pony_pegasus', name: 'Pegasus', baseSpeed: 5.2, lassoTier: 2, ring: 2, weight: 2, group: [1, 2], levelBase: 11, tameApples: 3, mystical: true, wings: true, abilities: ['fly'], fleeSpeed: 4.2, followSpeed: 3.8 });
PonyKinds.register({ id: 'pony_unicorn', name: 'Unicorn', baseSpeed: 4.8, lassoTier: 3, ring: 3, weight: 2, group: [1, 2], levelBase: 16, tameApples: 4, mystical: true, horn: true });
PonyKinds.register({ id: 'pony_alicorn', name: 'Alicorn', rarity: 'rare', baseSpeed: 5.6, lassoTier: 4, ring: 4, weight: 1.5, group: [1, 1], levelBase: 21, tameApples: 5, mystical: true, wings: true, horn: true, abilities: ['fly'], fleeSpeed: 4.4, followSpeed: 4.0 });
