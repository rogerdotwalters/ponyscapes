'use strict';
/* DATA - quests. EVERY quest is one entry, each in its own file. Quests belong to the HOST'S WORLD, not to a player: one quest log for everybody.
 * Whoever is playing when a quest is finished shares its reward; a quest the world finished before you joined is closed to you.
 *   giver     the villager (an Npcs id) who offers it, and who you hand things to
 *   requires  [quest ids] that must be finished first (the story runs in order)
 *   title     shown in the dialogue and the Journal
 *   offer / progress / done   what the giver says before you accept, while it is under way, and afterwards
 *   steps     what to do, in order. Each: { type, text, ... }
 *               deliver  { item, count }               hand items to the giver (any player's bag counts toward the same total)
 *               puzzle   { node }                      solve a puzzle node (js/data/puzzles/)
 *               visit    { x, y, radius }              someone goes to a place
 *               talk     { npc }                       someone speaks to a villager (an Npcs id) from the dialogue window
 *   reward    { coins, items: [[item, count]], friendship: hearts-points with the giver, xp: [skill, amount] }: each player present gets all of it */
const QuestDefs = new Registry('quests', { required: ['giver', 'title', 'offer', 'steps', 'reward'], check: d => {
  if (!Array.isArray(d.steps) || !d.steps.length) return 'needs at least one step';
  const types = { deliver: ['item', 'count'], puzzle: ['node'], visit: ['x', 'y'], talk: ['npc'] };
  for (const s of d.steps) if (!types[s.type] || types[s.type].some(f => s[f] === undefined) || typeof s.text !== 'string') return `has a bad step (${s.type})`;
  return null;
} });
