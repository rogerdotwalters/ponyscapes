'use strict';
/* DATA - NPC: baker */
Npcs.register({
  id: 'baker', name: 'Bramble', role: 'Baker', look: [0, 0, 3, 1, 3, 1], gear: { outfit: 'garb_tunic' },
  home: { x: 26.5, y: 19.5 }, radius: 3,
  tastes: { loves: ['egg'], likes: ['apple', 'raspberry', 'blueberry', 'cooked_rabbit'], dislikes: ['raw_fish'] },
  talk: [
    { min: 1, lines: ['Fresh bread, if you have coin. Otherwise, good morning!', 'Mind the flour on the floor, traveller.'] },
    { min: 3, lines: ['Ah, {friend}, I saved you the heel of the loaf.', 'Nothing beats a warm oven on a cold morning.'] },
    { min: 7, lines: ['You know, I never tell anyone my secret: it is the eggs.', 'Come by at dawn and I will teach you to knead.'] },
    { min: 13, lines: ['You are the best friend this old kitchen ever had.', 'Take whatever you like from the cooling rack, I mean it.'] }
  ]
});
