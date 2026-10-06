'use strict';
/* DATA - creature family: owl */
Creatures.register({ id: 'owl', name: 'Owl', ring: 1, weight: 2, group: [1, 1], levelBase: 7, hp: 3, radius: 0.18, wanderSpeed: 0.5, fleeSpeed: 3.2, fleeSeconds: 2.5, lure: true, detect: { idle: 3, sneak: 3.5, walk: 6, run: 9 }, drops: [{ item: 'feather', min: 2, max: 4 }], friend: { likes: ['rabbit_meat', 'raw_fish'], loves: ['cooked_rabbit'], dislikes: ['apple'] }, sprite: { kind: 'bird', variant: 'owl' } });
