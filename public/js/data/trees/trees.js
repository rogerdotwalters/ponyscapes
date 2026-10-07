'use strict';
/* DATA - tree species. Every tree in the world is one of these: a felled tree drops its SAPLINGS (with the logs), and a sapling planted in one
 * of its seasons grows, a day at a time, into a full tree of its kind (js/shared/groves.js).
 *
 *   look     how it is drawn: leafy (a round crown) or pine (a cone of needles)       fruit   it bears apples (which kind: the biome's `apples`)
 *   days     in-game days from sapling to full tree                                   seasons when a sapling will take (spring, summer, autumn, winter)
 *   saplings [min, max] saplings a felled one drops                                   color   the sapling's colour (its icon) */
const TreeSpecies = new Registry('tree species', { required: ['name', 'look', 'days', 'seasons'] });
TreeSpecies.registerAll([
  { id: 'oak',   name: 'Oak',        look: 'leafy', days: 6,  seasons: ['spring', 'autumn'], saplings: [1, 2], color: '#5f9c4a' },
  { id: 'pine',  name: 'Pine',       look: 'pine',  days: 9,  seasons: ['autumn', 'winter'], saplings: [1, 2], color: '#2f6b4b' },
  { id: 'apple', name: 'Apple Tree', look: 'leafy', days: 12, seasons: ['spring'],           saplings: [1, 1], color: '#7cc142', fruit: true }
]);
/** Which species a tree prop is: planted ones say so; the wild ones are told apart by their look (and apples). */
TreeSpecies.of = prop => (prop && prop.sp) || (prop && prop.forage === 'apple_tree' ? 'apple' : prop && prop.v % 2 === 1 ? 'pine' : 'oak');
// each species' sapling (an item: planted with the interact key)
SpecialItems.registerAll(TreeSpecies.all().map(t => ({ id: 'sapling_' + t.id, name: t.name.replace(/ Tree$/, '') + ' Sapling', maxStack: 20, kind: 'sapling', sapling: t.id, color: t.color })));
