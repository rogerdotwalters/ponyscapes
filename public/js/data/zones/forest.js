'use strict';
/* DATA - zone 2: the Forest, branching off the Meadows. Its gateway is shut until the Cave Bear falls. */
Zones.register({ id: 'forest', index: 1, name: 'The Forest', biome: 'forest', parent: 'meadows', radius: [64, 76], locked: true, unlockedBy: 'meadows', levelMin: 5, levelMax: 10, color: '#3f7f3f' });
