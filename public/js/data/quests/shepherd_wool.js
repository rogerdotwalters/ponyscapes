'use strict';
/* DATA - quest: Wool for Marnie. A round-up at the old fence (the Round-Up minigame: shared/roundupSystem.js), then hand over the wool it earned. */
QuestDefs.register({
  id: 'shepherd_wool', giver: 'shepherd', title: 'Wool for Marnie',
  offer: 'My flock has run off across the meadow and my loom has nothing to spin. Step up to the old fence and round them up: tie three sheep to your pole in one round, and I will want the wool for it.',
  progress: 'Round up the sheep at the old fence, then bring me the wool. The harder you work them, the more there is.',
  done: 'Look at all that wool! My loom has not hummed like this in years. Thank you, {friend}.',
  steps: [
    { type: 'minigame', game: 'roundup', sheep: 3, text: 'Tie 3 sheep to your pole in a Round-Up at the old fence' },
    { type: 'deliver', item: 'wool', count: 6, text: 'Bring Marnie 6 wool' }
  ],
  reward: { coins: 20, items: [['apple', 4]], friendship: 8, xp: ['animal_friendship', 40] }
});
