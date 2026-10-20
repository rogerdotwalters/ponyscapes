'use strict';
/* DATA - NPC: Marnie the shepherd. She stands by the old fence east of the village (js/shared/village.js) and needs wool: the Round-Up minigame starts at the fence (shared/roundupSystem.js),
 * and her quest (data/quests/shepherd_wool.js) asks for it. */
Npcs.register({
  id: 'shepherd', name: 'Marnie', role: 'Shepherd', look: [1, 3, 1, 2, 5, 3], gear: { outfit: 'dress_sun' },
  home: { x: 45.5, y: 39.6 }, radius: 0.8,
  tastes: { loves: ['wool'], likes: ['apple', 'raspberry', 'cooked_mutton'], dislikes: ['fang'] },
  talk: [
    { min: 1, lines: ['My flock got out again, and the loom sits idle. I am nearly out of wool!', 'That old fence has seen better days. Step up to the gate if you fancy a round-up.'] },
    { min: 3, lines: ['A good lasso arm is worth its weight in wool, {friend}.', 'Never cross another rancher\'s rope, unless you mean to cut it!'] },
    { min: 7, lines: ['Sheep run in circles, {friend}. So do I, some days.', 'Bring a friend to the fence and see who has the faster loop.'] },
    { min: 13, lines: ['You could run my whole flock, {friend}. I mean it.', 'The village has never had so much wool. Bless you.'] }
  ]
});
