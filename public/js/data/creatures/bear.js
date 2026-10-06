'use strict';
/* DATA - creature family: bear */
Creatures.register({ id: 'bear', name: 'Bear', ring: 2, weight: 2.5, group: [1, 1], levelBase: 10, hp: 18, radius: 0.45, wanderSpeed: 0.8, fleeSpeed: 2.6, fleeSeconds: 2, chaseSpeed: 3.6, behavior: 'territorial', hostile: true, hunt: 6, attack: { damage: 12, range: 1.3, cooldown: 1.6 }, detect: { idle: 3, sneak: 4, walk: 6, run: 9 }, drops: [{ item: 'bear_meat', min: 2, max: 3 }, { item: 'hide', min: 2, max: 2 }, { item: 'claw', min: 1, max: 2, chance: 0.6 }], sprite: { kind: 'bear', color: '#5a3a22' }, aggro: 6 });
