'use strict';
/* DATA - quest: the Lost Cubs (the Cave Bear's three cubs; given in town by the veterinarian, who has heard the cave bear grieving) */
QuestDefs.register({
  id: 'bear_cubs', giver: 'veterinarian', title: 'The Lost Cubs',
  offer: 'Hunters from the hills tell me the great bear in the Old Cavern has lost her three cubs and cannot be calmed. A grieving mother is the most dangerous thing there is. Find the cave, study her cubs\' tracks, and bring them home. They are shy: only a fish will make one trust you. Do it, and she will not need to be fought at all.',
  progress: 'The cave is in the hills. Study the glowing paw prints in it: they show where the cubs wandered. Feed a cub a fish, pick it up (F), and carry it to their mother. While you hold one she will not attack you.',
  done: 'All three home and the bear at peace! Gentle hands, calm voice, {friend}: that is all the medicine she needed.',
  steps: [
    { type: 'visit', where: 'cave:0', radius: 5, text: 'Find the mouth of the Old Cavern in the hills' },
    { type: 'event', event: 'tracks', ring: 0, text: 'Study the paw prints in the cave' },
    { type: 'event', event: 'cubs', ring: 0, count: 3, what: 'cubs home', text: 'Bring the three lost cubs home to their mother' },
    { type: 'talk', npc: 'veterinarian', text: 'Tell Dr. Fern the cubs are home' }
  ],
  reward: { coins: 60, items: [['apple', 5]], friendship: 8, xp: ['animal_friendship', 120] }
});
