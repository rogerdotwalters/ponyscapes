'use strict';
/* DATA - NPC: merchant */
Npcs.register({
  id: 'merchant', name: 'Ozzy', role: 'Merchant', look: [0, 3, 9, 1, 6, 5], gear: { outfit: 'garb_doublet', cape: 'cape_traveler' },
  home: { x: 22.5, y: 22.0 }, radius: 1.5, works: 'general_store',
  tastes: { loves: ['gold_coin'], likes: ['dragon_scale', 'antler', 'string'], dislikes: ['stone'] },
  talk: [
    { min: 1, lines: ['Everything is for sale, and nothing is stolen.', 'Looking? Buying? Admiring my cape?'] },
    { min: 3, lines: ['For you, {friend}, a very small discount.', 'Business is quiet. I blame the weather.'] },
    { min: 7, lines: ['Between us: the roads past the Wilds are paved with gold. And teeth.', 'You are good for business. Good for my spirits too.'] },
    { min: 13, lines: ['Take this advice for free, which I never do: trust nobody but yourself and me.', 'My oldest friend. And my best customer.'] }
  ]
});
