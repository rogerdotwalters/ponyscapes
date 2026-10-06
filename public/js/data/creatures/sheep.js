'use strict';
/* DATA - creature family: sheep */
Creatures.register({ id: 'sheep', name: 'Sheep', ring: 0, weight: 4, group: [2, 4], levelBase: 1, hp: 3, radius: 0.22, wanderSpeed: 0.6, fleeSpeed: 1.5, fleeSeconds: 2, tameable: true, lure: true, followSpeed: 1.8, detect: { idle: 0.8, sneak: 1, walk: 1.8, run: 3.2 }, drops: [{ item: 'bone', min: 1, max: 1, chance: 0.6 }, { item: 'mutton', min: 2, max: 2 }, { item: 'wool', min: 1, max: 3 }], friend: { likes: ['apple', 'blueberry', 'blackberry'], loves: ['raspberry'], dislikes: ['mutton'] }, sprite: { kind: 'sheep' } });
