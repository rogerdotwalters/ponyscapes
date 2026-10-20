'use strict';
/* DATA - creature family: manticore */
Creatures.register({ id: 'manticore', name: 'Manticore', ring: 4, weight: 1.5, group: [1, 1], levelBase: 20, hp: 34, radius: 0.55, wanderSpeed: 0.8, fleeSpeed: 2.6, fleeSeconds: 2, chaseSpeed: 4.2, behavior: 'predator', hostile: true, hunt: 14, attack: { damage: 20, range: 3, cooldown: 1.6, ranged: true }, detect: { idle: 3, sneak: 4, walk: 6, run: 9 }, drops: [{ item: 'hide', min: 3, max: 3 }, { item: 'fang', min: 2, max: 3 }, { item: 'claw', min: 2, max: 2 }], sprite: { kind: 'manticore', color: '#b5532a' } });
