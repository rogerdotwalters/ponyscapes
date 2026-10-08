'use strict';
/* DATA - NPC: veterinarian (runs the veterinary, 8-5) */
Npcs.register({
  id: 'veterinarian', name: 'Dr. Fern', role: 'Veterinarian', look: [0, 2, 7, 3, 6, 4], gear: {},
  home: { x: 31.5, y: 28.5 }, radius: 2.5, works: 'veterinary',
  tastes: { loves: ['apple'], likes: ['hay', 'brush'], dislikes: ['raw_fish'] },
  talk: [
    { min: 1, lines: ['Is your pony eating well? That is always my first question.', 'Gentle hands, calm voice. That is all the medicine most animals need.'] },
    { min: 3, lines: ['I can tell a happy pony from across the road.', 'Do keep their hooves clean, will you?'] },
    { min: 7, lines: ['You are good with them, {friend}. Better than most.', 'The wild ones remember kindness. Even the grumpy ones.'] },
    { min: 13, lines: ['Animals trust you, {friend}. So do I.', 'If ever a pony of yours is ill, my door is open. Any hour.'] }
  ]
});
