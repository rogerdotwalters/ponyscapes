'use strict';
/* DATA - creature family: rabbit */
Creatures.register({ id: 'rabbit', name: 'Rabbit', ring: 0, weight: 3, group: [1, 3], levelBase: 1, hp: 1, radius: 0.14, wanderSpeed: 0.7, fleeSpeed: 2.9, fleeSeconds: 2.5, carry: true, lure: true, detect: { idle: 2, sneak: 2.5, walk: 4.5, run: 6.5 }, drops: [{ item: 'rabbit_meat', min: 1, max: 1 }, { item: 'hide', min: 1, max: 1, chance: 0.5 }], friend: { likes: ['raspberry', 'blueberry', 'blackberry'], loves: ['apple'], dislikes: ['rabbit_meat'] }, sprite: { kind: 'rabbit' } });
