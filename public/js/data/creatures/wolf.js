'use strict';
/* DATA - creature family: wolf */
Creatures.register({ id: 'wolf', name: 'Wolf', ring: 2, weight: 2.5, group: [1, 3], levelBase: 11, hp: 12, radius: 0.3, wanderSpeed: 0.9, fleeSpeed: 3, fleeSeconds: 2, chaseSpeed: 4.6, behavior: 'predator', hostile: true, hunt: 11, attack: { damage: 10, range: 1.1, cooldown: 1.0 }, detect: { idle: 3, sneak: 4, walk: 7, run: 10 }, drops: [{ item: 'bone', min: 1, max: 1, chance: 0.6 }, { item: 'hide', min: 1, max: 2 }, { item: 'fang', min: 1, max: 2, chance: 0.6 }], sprite: { kind: 'canine', variant: 'wolf' } });
