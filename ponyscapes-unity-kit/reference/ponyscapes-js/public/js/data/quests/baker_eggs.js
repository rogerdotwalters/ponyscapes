'use strict';
/* DATA - quest: Eggs for the Oven (a plain fetch quest, open from the start) */
QuestDefs.register({
  id: 'baker_eggs', giver: 'baker', title: 'Eggs for the Oven',
  offer: 'The whole village wants my honey cakes and I have no eggs! Bring me four and I will make you something good, and a coin or two besides.',
  progress: 'Still short of eggs. The chickens wander near the nests: be gentle.',
  done: 'Wonderful! Smell that? Honey cakes. Share them with whoever is near.',
  steps: [{ type: 'deliver', item: 'egg', count: 4, text: 'Bring Bramble 4 eggs' }],
  reward: { coins: 15, items: [['apple', 3]], friendship: 6, xp: ['foraging', 20] }
});
