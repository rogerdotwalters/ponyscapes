'use strict';
/* DATA - NPC: fisher */
Npcs.register({
  id: 'fisher', name: 'Marin', role: 'Fisher', look: [1, 2, 1, 3, 5, 4], gear: {},
  home: { x: 11.5, y: 29.5 }, radius: 2.5,
  tastes: { loves: ['cooked_fish'], likes: ['raw_fish', 'blackberry'], dislikes: ['apple'] },
  talk: [
    { min: 1, lines: ['Shh. You will scare the fish.', 'The lake gives, the lake takes.'] },
    { min: 3, lines: ['There is a big one down there. I can feel it.', 'Patience is the whole secret.'] },
    { min: 7, lines: ['Tell nobody, but I fish at night too, {friend}.', 'The water remembers everyone who stands beside it.'] },
    { min: 13, lines: ['If I ever vanish, I have left you my favourite rod.', 'Few people ever sit this quietly with me.'] }
  ]
});
