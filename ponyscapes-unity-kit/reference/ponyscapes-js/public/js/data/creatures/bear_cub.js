'use strict';
/* DATA - creature family: bear cub. The Cave Bear's lost cubs (quest: wantSystem.js). They wander the first ring, come to you only for fish, and
 * will not be picked up until you have fed them one. Carry them to the cave and give them back to their mother to calm her for good. */
Creatures.register({ id: 'bear_cub', name: 'Bear Cub', ring: 0, weight: 0, group: [1, 1], levelBase: 1, hp: 4, radius: 0.24, wanderSpeed: 0.6, fleeSpeed: 2.4, fleeSeconds: 1.6,
  carry: true, lure: true, lureItems: ['raw_fish', 'cooked_fish'], protected: true, detect: { idle: 1.6, sneak: 2, walk: 3.5, run: 5.5 }, drops: [],
  wants: { items: ['raw_fish', 'cooked_fish'], every: 0, unlocks: 'pickup' }, friend: { likes: ['raw_fish'], loves: ['cooked_fish'], dislikes: [] },
  sprite: { kind: 'bear', color: '#8a5a35', scale: 0.55 } });
