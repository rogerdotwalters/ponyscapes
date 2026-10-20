'use strict';
/* DATA - NPC: village elder */
Npcs.register({
  id: 'elder', name: 'Elder Wren', role: 'Village Elder', look: [1, 5, 9, 4, 9, 7], gear: { cape: 'cape_fur' },
  home: { x: 20.5, y: 14.5 }, radius: 2,
  tastes: { loves: ['blueberry'], likes: ['antler', 'string', 'lingonberry'], dislikes: ['claw'] },
  talk: [
    { min: 1, lines: ['Welcome, young one. This village is older than it looks.', 'Walk gently in the Wilds.'] },
    { min: 3, lines: ['I knew your kind once: restless, brave, a little foolish.', 'Rings of the realm each keep a guardian.'] },
    { min: 7, lines: ['Listen, {friend}: the guardians guard more than caves.', 'Every colour of friendship was once a stranger.'] },
    { min: 13, lines: ['You shine, {friend}. I have not seen that colour in an age.', 'If I could pass on my staff, it would be to you.'] }
  ]
});
