'use strict';
/* DATA - quest: the Broken Tablet (a sliding puzzle; then report back) */
QuestDefs.register({
  id: 'guard_tablet', giver: 'guard', title: 'The Broken Tablet', requires: ['elder_dial'],
  offer: 'My patrol found a slab east of the village with pieces that slide about. The Elder says the stone and the ring belong to it. Put it back in order, then tell me what it says.',
  progress: 'The tablet is out east past the vacant houses. Slide the pieces into the gap until the numbers run in order.',
  done: 'So that is what it says. Well done, all of you. I shall tell the Elder.',
  steps: [{ type: 'puzzle', node: 'broken_tablet', text: 'Put the Broken Tablet back in order' }, { type: 'talk', npc: 'guard', text: 'Report to Captain Rowan' }],
  reward: { coins: 75, items: [['torch', 3]], friendship: 8, xp: ['crafting', 40] }
});
