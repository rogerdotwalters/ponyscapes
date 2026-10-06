'use strict';
/* DATA - creature family: lion */
Creatures.register({ id: 'lion', name: 'Lion', ring: 3, weight: 2.5, group: [1, 3], levelBase: 15, hp: 15, radius: 0.4, wanderSpeed: 0.8, fleeSpeed: 2.6, fleeSeconds: 2, chaseSpeed: 4.4, behavior: 'predator', hostile: true, hunt: 12, attack: { damage: 13, range: 1.2, cooldown: 1.1 }, detect: { idle: 3, sneak: 4, walk: 6, run: 9 }, drops: [{ item: 'hide', min: 2, max: 2 }, { item: 'fang', min: 1, max: 2, chance: 0.7 }], sprite: { kind: 'lion', color: '#c9a24a' } });
