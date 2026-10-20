'use strict';
/* DATA - zone: the Jungle, the next zone on after the Forest. Its gateway is shut until the Forest's guardian falls (`unlockedBy`); until that guardian exists, open it from Dev settings or with worldProgress.setGate(7, true). */
Zones.register({ id: 'jungle', index: 7, name: 'The Jungle', biome: 'jungle', parent: 'forest', radius: [84, 96], locked: true, unlockedBy: 'forest', fauna: 2, levelMin: 10, levelMax: 15, color: '#2e8b57' });
