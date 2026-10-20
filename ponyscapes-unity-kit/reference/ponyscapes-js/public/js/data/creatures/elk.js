'use strict';
/* DATA - creature family: elk */
Creatures.register({ id: 'elk', name: 'Elk', ring: 1, weight: 3, group: [1, 3], levelBase: 6, hp: 7, radius: 0.3, wanderSpeed: 0.9, fleeSpeed: 3.8, fleeSeconds: 4, detect: { idle: 3.5, sneak: 4, walk: 6.5, run: 9.5 }, drops: [{ item: 'bone', min: 1, max: 1, chance: 0.6 }, { item: 'venison', min: 3, max: 4 }, { item: 'hide', min: 1, max: 2 }, { item: 'antler', min: 2, max: 3 }], friend: { likes: ['apple', 'lingonberry'], loves: ['cranberry'], dislikes: ['venison'] }, sprite: { kind: 'deer', color: '#8a5a33', scale: 1.35, antlers: 'great' } });
