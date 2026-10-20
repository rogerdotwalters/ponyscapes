'use strict';
/* DATA - pony skill trees: one per pony VARIETY (the biome a pony comes from: meadow, moss, frost ...). Each lists its skills in order; a skill unlocks when the pony reaches `level`.
 *   ability   the power it gives (shared/ponySkills.js)           byMark   true: the power comes from the pony's cutie mark instead (one for each mark)
 * Meadow ponies are first: Leaf Blast (a cone of leaves) and a power from the cutie mark. The other varieties get theirs as they are written (a variety without an entry has no tree). */
PonySkillTrees.register({ id: 'meadow', skills: [
  { id: 'leaf_blast', label: 'Leaf Blast', level: 3, ability: 'leaf_blast' },
  { id: 'cutie_mark', label: 'Cutie mark power', level: 6, byMark: true }
] });
/* The sky ponies' own powers (ponySkills.js): one that suits the sky they come from, and the cutie mark's. */
for (const [id, label, ability] of [['water', 'Tidal Wash', 'tidal_wash'], ['lightning', 'Lightning Strike', 'lightning_strike'], ['sun', 'Sunbeam', 'sunbeam'], ['star', 'Starfall', 'starfall']])
  PonySkillTrees.register({ id, skills: [{ id: ability, label, level: 3, ability }, { id: 'cutie_mark', label: 'Cutie mark power', level: 6, byMark: true }] });

