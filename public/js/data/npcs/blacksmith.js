'use strict';
/* DATA - NPC: blacksmith */
Npcs.register({
  id: 'blacksmith', name: 'Hilda', role: 'Blacksmith', look: [1, 3, 8, 2, 8, 6], gear: {},
  home: { x: 14.5, y: 19.5 }, radius: 2.5, works: 'blacksmith',
  tastes: { loves: ['gold_coin'], likes: ['stone', 'hide', 'claw', 'fang'], dislikes: ['wool'] },
  talk: [
    { min: 1, lines: ['Mind the sparks. Need something mended?', 'Iron does not forgive a lazy hand.'] },
    { min: 3, lines: ['Ha! You hold a hammer like you mean it.', 'I have been hammering since before the Wilds had a name.'] },
    { min: 7, lines: ['Come closer, {friend}. Let me show you how to fold steel.', 'A blade is only as honest as its smith.'] },
    { min: 13, lines: ['I would trust you with my last good anvil.', 'Some friendships are forged: this is one.'] }
  ]
});
