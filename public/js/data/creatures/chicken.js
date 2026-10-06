'use strict';
/* DATA - creature family: chicken */
Creatures.register({ id: 'chicken', name: 'Chicken', ring: 0, weight: 3, group: [2, 4], levelBase: 1, hp: 2, radius: 0.15, wanderSpeed: 0.6, fleeSpeed: 2.4, fleeSeconds: 2, carry: true, lure: true, detect: { idle: 1.5, sneak: 2, walk: 3.5, run: 5.5 }, drops: [{ item: 'chicken_meat', min: 1, max: 1 }, { item: 'feather', min: 1, max: 3 }, { item: 'egg', min: 1, max: 1, chance: 0.5 }], friend: { likes: ['raspberry', 'blueberry', 'apple'], loves: [], dislikes: ['chicken_meat', 'cooked_chicken'] }, sprite: { kind: 'bird', variant: 'chicken' } });
