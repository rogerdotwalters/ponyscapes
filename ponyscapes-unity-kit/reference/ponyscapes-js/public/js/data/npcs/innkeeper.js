'use strict';
/* DATA - NPC: Hattie, who keeps the Pony Inn (js/data/buildings/pony_inn.js). She stands behind the bar from morning to night and strolls outside the door the rest of the time. */
Npcs.register({
  id: 'innkeeper', name: 'Hattie', role: 'Innkeeper', look: [1, 4, 2, 1, 4, 5], gear: { outfit: 'dress_sun' },
  home: { x: 32.5, y: 44.6 }, radius: 1.4, works: 'pony_inn',
  tastes: { loves: ['apple', 'cooked_mutton'], likes: ['raspberry', 'blueberry', 'egg'], dislikes: ['fang'] },
  talk: [
    { min: 1, lines: ['Welcome to the Pony Inn! Take a seat at a Connect Four table and drop a coin or two.', 'Nobody leaves my inn without a game. Or a bun.'] },
    { min: 3, lines: ['The trick is the middle column, {friend}. Everybody forgets the middle column.', 'Bring a friend and sit across the table: you will see the board from your own side.'] },
    { min: 7, lines: ['I have been beaten by a toddler and a goat, {friend}. Do not tell anyone.', 'Those pony coins make a lovely clink when they land.'] },
    { min: 13, lines: ['You are the best player this inn has ever had, {friend}. The goat was close.', 'First round is always on the house for you.'] }
  ]
});
