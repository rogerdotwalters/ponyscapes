'use strict';
/* DATA - NPC: farmer */
Npcs.register({
  id: 'farmer', name: 'Tobias', role: 'Farmer', look: [0, 1, 6, 2, 4, 3], gear: {},
  home: { x: 33.5, y: 22.5 }, radius: 3,
  tastes: { loves: ['cooked_mutton'], likes: ['wool', 'apple', 'blueberry'], dislikes: ['fang'] },
  talk: [
    { min: 1, lines: ['Weather is turning. The sheep always know first.', 'Mind the fence, friend.'] },
    { min: 3, lines: ['Good to see a friendly face on the road.', 'I counted forty sheep this morning. Then forty-one.'] },
    { min: 7, lines: ['Sit a while, {friend}. The fields are quiet tonight.', 'You have a way with animals. They like you.'] },
    { min: 13, lines: ['If the harvest fails, I know who I will turn to.', 'You are family now, {friend}.'] }
  ]
});
