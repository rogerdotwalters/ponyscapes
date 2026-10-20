'use strict';
/* DATA - tree species. Every tree in the world is one of these: a felled tree drops its SAPLINGS (with the logs), and a sapling planted in one
 * of its seasons grows, a day at a time, into a full tree of its kind (js/shared/groves.js).
 *
 *   look     how it is drawn: leafy (a round crown) or pine (a cone of needles)       fruit   it bears apples (which kind: the biome's `apples`)
 *   days     in-game days from sapling to full tree                                   seasons when a sapling will take (spring, summer, autumn, winter)
 *   saplings [min, max] saplings a felled one drops                                   color   the sapling's colour (its icon) */
/* Also, for the world's own plant life (js/data/flora/ says WHICH species each biome grows):
 *   tint     (optional) a colour wash over the crown, so kinds that share a look still read as different trees
 *   scale    (optional) how much bigger than a normal tree it is drawn and stands (1.9: a giant); `logs` times the logs a felled one drops
 *   spread   (optional) how a standing tree seeds its neighbours, a day at a time (js/shared/floraSystem.js): `chance` it sows a sapling that day,
 *            `range` tiles around it to drop it, and `crowd` the most trees (and saplings) allowed within 2 tiles of the new one. Only into ground where its
 *            biome grows that species, and only in a season it takes in. Omit it and the species never spreads by itself. */
const TreeSpecies = new Registry('tree species', { required: ['name', 'look', 'days', 'seasons'] });
TreeSpecies.registerAll([
  { id: 'oak',   name: 'Oak',        look: 'leafy', days: 6,  seasons: ['spring', 'autumn'], saplings: [1, 2], color: '#5f9c4a', spread: { chance: 0.04, range: 2, crowd: 3 } },
  { id: 'pine',  name: 'Pine',       look: 'pine',  days: 9,  seasons: ['autumn', 'winter'], saplings: [1, 2], color: '#2f6b4b', spread: { chance: 0.035, range: 2, crowd: 3 } },
  { id: 'apple', name: 'Apple Tree', look: 'leafy', days: 12, seasons: ['spring'],           saplings: [1, 1], color: '#7cc142', fruit: true, spread: { chance: 0.08, range: 2, crowd: 2 } },
  { id: 'spruce', name: 'Spruce',    look: 'pine',  days: 10, seasons: ['autumn', 'winter'], saplings: [1, 2], color: '#2a5a66', tint: 'rgba(30,80,120,.24)', spread: { chance: 0.06, range: 2, crowd: 3 } },
  { id: 'hard_pine', name: 'Hard Pine', look: 'pine', days: 14, seasons: ['autumn', 'winter', 'spring'], saplings: [1, 2], color: '#4a5a2a', tint: 'rgba(70,80,10,.26)', spread: { chance: 0.05, range: 2, crowd: 3 } },
  { id: 'ash',   name: 'Ash',        look: 'leafy', days: 8,  seasons: ['spring', 'summer'], saplings: [1, 2], color: '#9fb85a', tint: 'rgba(225,235,130,.2)', spread: { chance: 0.05, range: 2, crowd: 3 } },
  /* the biomes of the deeper zones (js/data/flora/): the same two looks, washed in the zone's colours; `scale` makes a species bigger than a normal tree (its picture, its trunk, its logs) */
  { id: 'gumdrop',   name: 'Gumdrop Tree',  look: 'leafy', days: 8,  seasons: ['spring', 'summer'], saplings: [1, 2], color: '#f48fb1', tint: 'rgba(255,120,180,.34)', spread: { chance: 0.05, range: 2, crowd: 3 } },
  { id: 'candy_pine', name: 'Candy Cane Pine', look: 'pine', days: 10, seasons: ['autumn', 'winter'], saplings: [1, 2], color: '#ff6f91', tint: 'rgba(255,90,130,.3)', spread: { chance: 0.04, range: 2, crowd: 3 } },
  { id: 'willow',    name: 'Willow',        look: 'leafy', days: 7,  seasons: ['spring', 'summer'], saplings: [1, 2], color: '#6fbf9a', tint: 'rgba(60,200,180,.22)', spread: { chance: 0.05, range: 2, crowd: 3 } },
  { id: 'redwood',   name: 'Redwood',       look: 'pine',  days: 20, seasons: ['spring', 'autumn'], saplings: [1, 1], color: '#7a4a2a', tint: 'rgba(120,50,20,.2)', scale: 1.9, logs: 2, spread: { chance: 0.02, range: 3, crowd: 2 } },
  { id: 'great_oak', name: 'Great Oak',     look: 'leafy', days: 18, seasons: ['spring', 'autumn'], saplings: [1, 1], color: '#4f8a3a', tint: 'rgba(20,80,10,.12)', scale: 1.8, logs: 2, spread: { chance: 0.02, range: 3, crowd: 2 } },
  { id: 'mahogany',  name: 'Mahogany',      look: 'leafy', days: 12, seasons: ['spring', 'summer'], saplings: [1, 2], color: '#2f7a40', tint: 'rgba(0,90,40,.3)', scale: 1.25, spread: { chance: 0.05, range: 2, crowd: 3 } },
  { id: 'fig',       name: 'Strangler Fig', look: 'leafy', days: 10, seasons: ['spring', 'summer'], saplings: [1, 2], color: '#4a8a3a', tint: 'rgba(40,110,20,.26)', spread: { chance: 0.05, range: 2, crowd: 3 } },
  { id: 'crystal_tree', name: 'Crystal Tree', look: 'leafy', days: 10, seasons: ['spring', 'autumn'], saplings: [1, 2], color: '#9fe0e6', tint: 'rgba(120,220,255,.42)', spread: { chance: 0.04, range: 2, crowd: 3 } },
  { id: 'crystal_pine', name: 'Crystal Pine', look: 'pine', days: 12, seasons: ['autumn', 'winter'], saplings: [1, 2], color: '#7fcfe0', tint: 'rgba(140,225,255,.4)', spread: { chance: 0.04, range: 2, crowd: 3 } },
  { id: 'cinder_oak', name: 'Cinder Oak',   look: 'leafy', days: 9,  seasons: ['spring', 'autumn'], saplings: [1, 2], color: '#6a3a2a', tint: 'rgba(110,40,20,.5)', spread: { chance: 0.04, range: 2, crowd: 3 } },
  { id: 'ember_pine', name: 'Ember Pine',   look: 'pine',  days: 11, seasons: ['autumn', 'winter'], saplings: [1, 2], color: '#a8432a', tint: 'rgba(200,60,20,.4)', spread: { chance: 0.04, range: 2, crowd: 3 } },
  { id: 'cloud_tree', name: 'Cloud Tree',   look: 'leafy', days: 8,  seasons: ['spring', 'summer'], saplings: [1, 2], color: '#e6d6f5', tint: 'rgba(255,200,240,.42)', spread: { chance: 0.04, range: 2, crowd: 3 } },
  { id: 'rainbow_pine', name: 'Rainbow Pine', look: 'pine', days: 10, seasons: ['autumn', 'winter'], saplings: [1, 2], color: '#b9a6ff', tint: 'rgba(170,150,255,.4)', spread: { chance: 0.04, range: 2, crowd: 3 } }
]);
/** Which species a tree prop is: planted and generated ones say so (`sp`); older ones are told apart by their look (and apples). */
TreeSpecies.of = prop => (prop && prop.sp) || (prop && prop.forage === 'apple_tree' ? 'apple' : prop && prop.v % 2 === 1 ? 'pine' : 'oak');
// each species' sapling (an item: planted with the interact key)
SpecialItems.registerAll(TreeSpecies.all().map(t => ({ id: 'sapling_' + t.id, name: t.name.replace(/ Tree$/, '') + ' Sapling', maxStack: 20, kind: 'sapling', sapling: t.id, color: t.color })));
