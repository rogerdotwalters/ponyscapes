'use strict';
/* DATA - tree species. Every tree in the world is one of these: a felled tree drops its SAPLINGS (with the logs), and a sapling planted in one
 * of its seasons grows, a day at a time, into a full tree of its kind (js/shared/groves.js).
 *
 *   look     how it is drawn: leafy (a round crown) or pine (a cone of needles)       fruit   it bears apples (which kind: the biome's `apples`)
 *   days     in-game days from sapling to full tree                                   seasons when a sapling will take (spring, summer, autumn, winter)
 *   saplings [min, max] saplings a felled one drops                                   color   the sapling's colour (its icon) */
/* Also, for the world's own plant life (js/data/flora/ says WHICH species each biome grows):
 *   tint     (optional) a colour wash over the crown, so kinds that share a look still read as different trees
 *   spread   (optional) how a standing tree seeds its neighbours, a day at a time (js/shared/floraSystem.js): `chance` it sows a sapling that day,
 *            `range` tiles around it to drop it, and `crowd` the most trees (and saplings) allowed within 2 tiles of the new one. Only into ground where its
 *            biome grows that species, and only in a season it takes in. Omit it and the species never spreads by itself. */
const TreeSpecies = new Registry('tree species', { required: ['name', 'look', 'days', 'seasons'] });
TreeSpecies.registerAll([
  { id: 'oak',   name: 'Oak',        look: 'leafy', days: 6,  seasons: ['spring', 'autumn'], saplings: [1, 2], color: '#5f9c4a', spread: { chance: 0.04, range: 2, crowd: 5 } },
  { id: 'pine',  name: 'Pine',       look: 'pine',  days: 9,  seasons: ['autumn', 'winter'], saplings: [1, 2], color: '#2f6b4b', spread: { chance: 0.035, range: 2, crowd: 5 } },
  { id: 'apple', name: 'Apple Tree', look: 'leafy', days: 12, seasons: ['spring'],           saplings: [1, 1], color: '#7cc142', fruit: true, spread: { chance: 0.08, range: 2, crowd: 4 } },
  { id: 'spruce', name: 'Spruce',    look: 'pine',  days: 10, seasons: ['autumn', 'winter'], saplings: [1, 2], color: '#2a5a66', tint: 'rgba(30,80,120,.24)', spread: { chance: 0.06, range: 2, crowd: 6 } },
  { id: 'hard_pine', name: 'Hard Pine', look: 'pine', days: 14, seasons: ['autumn', 'winter', 'spring'], saplings: [1, 2], color: '#4a5a2a', tint: 'rgba(70,80,10,.26)', spread: { chance: 0.05, range: 2, crowd: 6 } },
  { id: 'ash',   name: 'Ash',        look: 'leafy', days: 8,  seasons: ['spring', 'summer'], saplings: [1, 2], color: '#9fb85a', tint: 'rgba(225,235,130,.2)', spread: { chance: 0.05, range: 2, crowd: 5 } }
]);
/** Which species a tree prop is: planted and generated ones say so (`sp`); older ones are told apart by their look (and apples). */
TreeSpecies.of = prop => (prop && prop.sp) || (prop && prop.forage === 'apple_tree' ? 'apple' : prop && prop.v % 2 === 1 ? 'pine' : 'oak');
// each species' sapling (an item: planted with the interact key)
SpecialItems.registerAll(TreeSpecies.all().map(t => ({ id: 'sapling_' + t.id, name: t.name.replace(/ Tree$/, '') + ' Sapling', maxStack: 20, kind: 'sapling', sapling: t.id, color: t.color })));
