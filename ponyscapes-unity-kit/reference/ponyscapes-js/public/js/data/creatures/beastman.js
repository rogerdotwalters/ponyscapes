'use strict';
/* DATA - creature family: beastman */
Creatures.register({ id: 'beastman', name: 'Beastman', ring: 4, weight: 2.5, group: [2, 3], levelBase: 20, hp: 22, radius: 0.35, wanderSpeed: 0.8, fleeSpeed: 2.6, fleeSeconds: 2, chaseSpeed: 3.5, behavior: 'predator', hostile: true, hunt: 10, attack: { damage: 15, range: 1.2, cooldown: 1.2 }, detect: { idle: 3, sneak: 4, walk: 6, run: 9 }, drops: [{ item: 'hide', min: 2, max: 2 }, { item: 'claw', min: 1, max: 2 }, { item: 'fang', min: 1, max: 1 }], sprite: { kind: 'beastman', color: '#6b4a2a' } });
