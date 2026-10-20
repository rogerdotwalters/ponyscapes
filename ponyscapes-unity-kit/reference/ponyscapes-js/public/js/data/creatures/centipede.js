'use strict';
/* DATA - creature family: centipede */
Creatures.register({ id: 'centipede', name: 'Giant Centipede', ring: 3, weight: 2.5, group: [1, 2], levelBase: 15, hp: 14, radius: 0.4, wanderSpeed: 0.8, fleeSpeed: 2.6, fleeSeconds: 2, chaseSpeed: 3.4, behavior: 'nocturnal', hostile: true, hunt: 10, attack: { damage: 11, range: 1, cooldown: 1.0 }, detect: { idle: 3, sneak: 4, walk: 6, run: 9 }, drops: [{ item: 'chitin', min: 1, max: 3 }, { item: 'string', min: 1, max: 2 }], sprite: { kind: 'centipede', color: '#8a3a2a' } });
