'use strict';
/* DATA - the friendship ladder. EVERY friendship (with a person or an animal) is a LEVEL, shown as a COLOUR, with three hearts to fill; filling
 * the three hearts moves you up to the next colour and the hearts start again. Four tiers x six hues = 24 levels:
 *   basic     yellow, green, blue, red, orange, purple          (levels 1-6)         pastel    soft versions of the same six        (7-12)
 *   metallic  gold, verdigris, steel blue, ruby, copper, amethyst (13-18)              electric  glowing neon, with sparks          (19-24)
 * `tier` decides how the hearts are DRAWN (flat / soft / shiny / crackling). How high you may climb is limited by your Friendship skill (people)
 * or Animal Friendship skill (animals): see CONFIG.sim.friendship. Add a colour or a tier here and the whole game follows. */
const FriendshipLevels = new Registry('friendship levels', { required: ['level', 'name', 'tier', 'color'] });
{
  const HUES = ['yellow', 'green', 'blue', 'red', 'orange', 'purple'];
  const LADDER = {
    basic:    [['Yellow', '#f5c518'], ['Green', '#3bb54a'], ['Blue', '#2f7de1'], ['Red', '#e53935'], ['Orange', '#f57c00'], ['Purple', '#8e44ad']],
    pastel:   [['Pastel Yellow', '#fff0a0'], ['Pastel Green', '#b5ecb5'], ['Pastel Blue', '#b0d4ff'], ['Pastel Red', '#ffb3b8'], ['Pastel Orange', '#ffd2a6'], ['Pastel Purple', '#d8c3f5']],
    metallic: [['Gold', '#d9a521'], ['Verdigris', '#3fae9c'], ['Steel Blue', '#6f93bd'], ['Ruby', '#b3122d'], ['Copper', '#b86f33'], ['Amethyst', '#9a55c9']],
    electric: [['Electric Yellow', '#fff200'], ['Electric Green', '#39ff14'], ['Electric Blue', '#00e5ff'], ['Electric Red', '#ff1744'], ['Electric Orange', '#ff9100'], ['Electric Purple', '#d500f9']]
  };
  let level = 0;
  for (const tier of ['basic', 'pastel', 'metallic', 'electric']) LADDER[tier].forEach(([name, color], i) => FriendshipLevels.register({ id: tier + '_' + HUES[i], level: ++level, name, tier, hue: HUES[i], color }));
}
