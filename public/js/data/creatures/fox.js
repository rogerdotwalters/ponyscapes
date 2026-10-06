'use strict';
/* DATA - creature family: fox */
Creatures.register({ id: 'fox', name: 'Fox', ring: 1, weight: 3, group: [1, 2], levelBase: 6, hp: 4, radius: 0.2, wanderSpeed: 0.8, fleeSpeed: 3.7, fleeSeconds: 3, lure: true, detect: { idle: 3.5, sneak: 4, walk: 7, run: 10 }, drops: [{ item: 'hide', min: 1, max: 1 }, { item: 'rabbit_meat', min: 1, max: 1, chance: 0.4 }], friend: { likes: ['rabbit_meat', 'raspberry', 'blackberry', 'egg'], loves: ['cooked_rabbit'], dislikes: ['apple'] }, sprite: { kind: 'canine', variant: 'fox' } });
