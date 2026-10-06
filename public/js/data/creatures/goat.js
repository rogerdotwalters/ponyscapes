'use strict';
/* DATA - creature family: goat */
Creatures.register({ id: 'goat', name: 'Goat', ring: 0, weight: 2, group: [1, 3], levelBase: 2, hp: 5, radius: 0.23, wanderSpeed: 0.8, fleeSpeed: 2.6, fleeSeconds: 3, tameable: true, lure: true, followSpeed: 2.4, detect: { idle: 1.5, sneak: 2, walk: 3.5, run: 6 }, drops: [{ item: 'bone', min: 1, max: 1, chance: 0.6 }, { item: 'mutton', min: 2, max: 2 }, { item: 'hide', min: 1, max: 1 }], friend: { likes: ['apple', 'blueberry', 'lingonberry'], loves: ['cranberry'], dislikes: ['raw_fish'] }, sprite: { kind: 'goat' } });
