'use strict';
/* DATA - NPC: village guard */
Npcs.register({
  id: 'guard', name: 'Captain Rowan', role: 'Village Guard', look: [0, 4, 5, 2, 7, 2], gear: { outfit: 'garb_hunter', cape: 'cape_royal' },
  home: { x: 22.5, y: 18.5 }, radius: 1.5,
  tastes: { loves: ['cooked_venison'], likes: ['fang', 'claw', 'cooked_mutton'], dislikes: ['egg'] },
  talk: [
    { min: 1, lines: ['Move along, citizen. Nothing to see.', 'The Wilds are no place after dark.'] },
    { min: 3, lines: ['You handle yourself well out there. I noticed.', 'Report anything that howls.'] },
    { min: 7, lines: ['You have earned my trust, {friend}. That is not easy.', 'The barriers hold, but only because someone watches.'] },
    { min: 13, lines: ['I would follow you into the Dragonlands, {friend}.', 'There are good soldiers, and there are good friends. You are both.'] }
  ]
});
