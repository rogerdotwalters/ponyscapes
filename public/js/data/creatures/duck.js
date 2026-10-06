'use strict';
/* DATA - creature family: duck */
Creatures.register({ id: 'duck', name: 'Duck', ring: 0, weight: 2, group: [1, 3], levelBase: 1, hp: 2, radius: 0.15, wanderSpeed: 0.55, fleeSpeed: 2.2, fleeSeconds: 2, carry: true, lure: true, detect: { idle: 1.5, sneak: 2, walk: 3.5, run: 5.5 }, drops: [{ item: 'chicken_meat', min: 1, max: 1 }, { item: 'feather', min: 1, max: 3 }, { item: 'egg', min: 1, max: 1, chance: 0.3 }], friend: { likes: ['blueberry', 'blackberry', 'raspberry'], loves: ['apple'], dislikes: ['raw_fish'] }, sprite: { kind: 'bird', variant: 'duck' } });
