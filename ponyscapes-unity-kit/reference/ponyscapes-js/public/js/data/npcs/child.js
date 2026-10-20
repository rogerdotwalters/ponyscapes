'use strict';
/* DATA - NPC: village child */
Npcs.register({
  id: 'child', name: 'Pip', role: 'Village Child', look: [0, 0, 2, 0, 2, 0], gear: {},
  home: { x: 17.5, y: 21.5 }, radius: 2.5,
  tastes: { loves: ['cooked_rabbit'], likes: ['raspberry', 'apple', 'egg'], dislikes: ['rope'] },
  talk: [
    { min: 1, lines: ['Hi! Do you have any berries?', 'I am NOT lost. I am exploring.'] },
    { min: 3, lines: ['You are nice! The other grown-ups are boring.', 'I saw a rabbit bigger than my head. Honest.'] },
    { min: 7, lines: ['Wanna see my secret hiding spot, {friend}?', 'When I grow up I will be a dragon tamer!'] },
    { min: 13, lines: ['You are my bestest friend in the whole village!', 'Do not tell Ozzy, but I know where he hides the cookies.'] }
  ]
});
