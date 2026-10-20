'use strict';
/* DATA - creature family: bat */
Creatures.register({ id: 'bat', name: 'Bat', ring: 1, weight: 2.5, group: [2, 4], levelBase: 5, hp: 2, radius: 0.15, wanderSpeed: 1.6, fleeSpeed: 3.5, fleeSeconds: 1.5, chaseSpeed: 4.2, behavior: 'nocturnal', hostile: true, hunt: 9, attack: { damage: 3, range: 0.6, cooldown: 1 }, detect: { idle: 3, sneak: 3.5, walk: 6, run: 9 }, drops: [{ item: 'hide', min: 1, max: 1, chance: 0.3 }], sprite: { kind: 'bat', color: '#3a2f4a' } });
