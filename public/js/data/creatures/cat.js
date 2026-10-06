'use strict';
/* DATA - creature family: cat */
Creatures.register({ id: 'cat', name: 'Cat', ring: 0, weight: 1.5, group: [1, 1], levelBase: 1, hp: 3, radius: 0.18, wanderSpeed: 0.8, fleeSpeed: 3.2, fleeSeconds: 2.5, carry: true, lure: true, detect: { idle: 2, sneak: 2.5, walk: 4.5, run: 7 }, drops: [{ item: 'hide', min: 1, max: 1 }], wants: { items: ['raw_fish', 'cooked_fish'], every: 90 }, friend: { likes: ['raw_fish', 'rabbit_meat', 'egg'], loves: ['cooked_fish'], dislikes: ['apple'] }, sprite: { kind: 'canine', variant: 'cat' } });
