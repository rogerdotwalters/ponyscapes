'use strict';
/* DATA - creature family: dog */
Creatures.register({ id: 'dog', name: 'Dog', ring: 0, weight: 1.5, group: [1, 2], levelBase: 2, hp: 6, radius: 0.25, wanderSpeed: 0.9, fleeSpeed: 3, fleeSeconds: 2.5, tameable: true, lure: true, followSpeed: 3.6, detect: { idle: 2, sneak: 2.5, walk: 4.5, run: 7 }, drops: [{ item: 'hide', min: 1, max: 1 }], friend: { likes: ['mutton', 'cooked_mutton', 'cooked_rabbit'], loves: ['cooked_venison'], dislikes: ['apple'] }, sprite: { kind: 'canine', variant: 'dog' } });
