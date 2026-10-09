'use strict';
/* DATA - creature family: slime. Lives in caves (weight 0: it never turns up in the wild, only where a dungeon puts it). Slow, soft and sticky; it oozes after
 * whoever comes near and splashes on them. */
Creatures.register({ id: 'slime', name: 'Slime', ring: 0, weight: 0, group: [1, 1], levelBase: 3, hp: 5, radius: 0.26, wanderSpeed: 0.35, fleeSpeed: 1.2, fleeSeconds: 1, chaseSpeed: 1.7, behavior: 'territorial', hostile: true, hunt: 6, aggro: 3, attack: { damage: 3, range: 0.7, cooldown: 1.4 }, detect: { idle: 2, sneak: 2.5, walk: 4, run: 6 }, drops: [{ item: 'gold_coin', min: 1, max: 3, chance: 0.5 }], sprite: { kind: 'slime', color: '#5fbf6a' } });   // wobbles about in the dark
