'use strict';
/* DATA - quest: the Humming Stone (the first quest: a lantern puzzle) */
QuestDefs.register({
  id: 'elder_stone', giver: 'elder', title: 'The Humming Stone',
  offer: 'There is an old stone near my house that has hummed since before the village. Lately its lights have scattered. Put out every light and I will tell you why it matters.',
  progress: 'The stone stands just south of my house, by the lane. Its lanterns flip together with the ones beside them: think before you press.',
  done: 'The hum is calm again. You have a patient mind, {friend}. There is more to find.',
  steps: [{ type: 'puzzle', node: 'rune_stone', text: 'Put out the lights on the Old Rune Stone' }],
  reward: { coins: 20, friendship: 5, xp: ['crafting', 30] }
});
