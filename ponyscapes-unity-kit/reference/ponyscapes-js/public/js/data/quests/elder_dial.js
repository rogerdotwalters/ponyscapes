'use strict';
/* DATA - quest: the Sunken Dial (a walk and a memory puzzle) */
QuestDefs.register({
  id: 'elder_dial', giver: 'elder', title: 'The Sunken Dial', requires: ['elder_stone'],
  offer: 'The stone was only the first of three. Another waits on the south shore of the pond, a ring of runes. It will repeat its song to you: sing it back.',
  progress: 'Find the ring of runes on the south shore of the pond, south-west of the village. Listen with your eyes: it shows the order it wants.',
  done: 'The pond is quiet and the ring is awake. I have not heard that song since I was young.',
  steps: [{ type: 'visit', x: 8.5, y: 35.5, radius: 4, text: 'Walk to the south shore of the pond' }, { type: 'puzzle', node: 'pond_dial', text: 'Repeat the song of the Sunken Dial' }],
  reward: { coins: 40, friendship: 6, xp: ['friendship', 40] }
});
