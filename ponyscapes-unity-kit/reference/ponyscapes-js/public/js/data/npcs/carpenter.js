'use strict';
/* DATA - NPC: carpenter (runs the workshop, 8-5) */
Npcs.register({
  id: 'carpenter', name: 'Hazel', role: 'Carpenter', look: [1, 1, 4, 2, 2, 3], gear: {},
  home: { x: 14.5, y: 28.5 }, radius: 2, works: 'carpenter',
  tastes: { loves: ['plank'], likes: ['log', 'rope', 'stone_hammer'], dislikes: ['egg'] },
  talk: [
    { min: 1, lines: ['Mind the sawdust. It gets everywhere.', 'Wood is honest, traveller. People less so.'] },
    { min: 3, lines: ['A good plank is worth ten promises.', 'Bring me logs and I will make you something that lasts.'] },
    { min: 7, lines: ['You have the hands for it, {friend}. Truly.', 'My father said: measure twice, cut once, and trust nobody with your chisel.'] },
    { min: 13, lines: ['If I built a house for every friend I trust, {friend}, yours would be first.', 'The best joint is the one nobody sees. Like us.'] }
  ]
});
