'use strict';
/* DATA - creature family: spider */
Creatures.register({ id: 'spider', name: 'Giant Spider', ring: 2, weight: 3, group: [1, 2], levelBase: 10, hp: 10, radius: 0.3, wanderSpeed: 0.8, fleeSpeed: 2.2, fleeSeconds: 2, chaseSpeed: 2.7, behavior: 'nocturnal', hostile: true, hunt: 11, attack: { damage: 9, range: 0.8, cooldown: 1.2 }, detect: { idle: 1.5, sneak: 2, walk: 4, run: 6 }, drops: [{ item: 'string', min: 2, max: 4 }], sprite: { kind: 'spider' } });
