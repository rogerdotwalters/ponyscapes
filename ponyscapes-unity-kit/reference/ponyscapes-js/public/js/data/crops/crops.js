'use strict';
/* DATA - crops. One line per crop: plant its seeds in tilled soil (a hoe), water it every day (a watering can), and it grows one day for every
 * day it was watered, until it is ripe. A crop only grows in its seasons: planted out of season it will not take, and when its season ends it
 * withers. This file also makes each crop's SEEDS (sold at the General Store) and, unless it names an existing item, its PRODUCE (a food).
 *
 *   seasons   which seasons it grows in (spring, summer, autumn, winter)      days      days of watering until ripe (the Admin page can change it)
 *   regrow    (optional) after a harvest it fruits again in this many days    yield     [min, max] produce per harvest
 *   produce   an existing item to give instead of making a food of its own    hunger    what its food restores
 *   look      how it is drawn: root (leaves over a bulb), bush (fruit on a bush), stalk (tall stalks), vine (a big fruit on vines)
 *   colors    leaf, crop (the produce), and an optional flower                 seedPrice gold coins for a packet of seeds
 *   wild      (optional) it also grows wild: where its produce lies about, [{ biome, rate per 1000 open tiles }] */
const Crops = new Registry('crops', { required: ['name', 'seasons', 'days', 'look'] });
Crops.registerAll([
  { id: 'turnip',     name: 'Turnip',     seasons: ['spring'],           days: 4,  look: 'root',  yield: [1, 1], hunger: 12, seedPrice: 1, colors: { leaf: '#5fae4e', crop: '#ece4f0', top: '#9b59b6' } },
  { id: 'potato',     name: 'Potato',     seasons: ['spring'],           days: 6,  look: 'root',  yield: [1, 3], hunger: 16, seedPrice: 2, colors: { leaf: '#4f9a3c', crop: '#c9a06a', flower: '#f4f0e6' } },
  { id: 'strawberry', name: 'Strawberry', seasons: ['spring'],           days: 8,  look: 'bush',  yield: [2, 3], hunger: 8,  seedPrice: 3, regrow: 4, colors: { leaf: '#3f8a3c', crop: '#e53935', flower: '#ffffff' } },
  { id: 'flax',       name: 'Flax',       seasons: ['spring', 'summer'], days: 5,  look: 'stalk', yield: [2, 3], produce: 'string', seedPrice: 1, colors: { leaf: '#6fae4e', crop: '#d9c98a', flower: '#6fa8e8' } },
  { id: 'wheat',      name: 'Wheat',      seasons: ['summer'],           days: 4,  look: 'stalk', yield: [1, 2], hunger: 4,  seedPrice: 1, colors: { leaf: '#9cbf4a', crop: '#e2c46a' } },
  { id: 'tomato',     name: 'Tomato',     seasons: ['summer'],           days: 8,  look: 'bush',  yield: [1, 3], hunger: 10, seedPrice: 2, regrow: 3, colors: { leaf: '#3f8a3c', crop: '#e0402a', flower: '#f2d24a' } },
  { id: 'corn',       name: 'Corn',       seasons: ['summer'],           days: 10, look: 'stalk', yield: [1, 2], hunger: 14, seedPrice: 2, tall: true, colors: { leaf: '#5fa84a', crop: '#f2c94c' } },
  { id: 'carrot',     name: 'Carrot',     seasons: ['autumn'],           days: 5,  look: 'root',  yield: [1, 2], hunger: 10, seedPrice: 1, wild: [{ biome: 'normal', rate: 4 }], colors: { leaf: '#5fae4e', crop: '#ef7d1a' } },
  { id: 'pumpkin',    name: 'Pumpkin',    seasons: ['autumn'],           days: 10, look: 'vine',  yield: [1, 1], hunger: 22, seedPrice: 3, colors: { leaf: '#4f9a3c', crop: '#e07a2e', flower: '#f2c230' } }
]);
// each crop's seeds, and its produce (a food) unless it gives an existing item
SpecialItems.registerAll(Crops.all().map(c => ({ id: 'seed_' + c.id, name: c.name + ' Seeds', maxStack: 50, kind: 'seed', seed: c.id, color: c.colors.crop, price: [['gold_coin', c.seedPrice || 1]] })));
Foods.registerAll(Crops.all().filter(c => !c.produce).map(c => Object.assign({ id: c.id, name: c.name, category: 'fruit', maxStack: 30, hunger: c.hunger || 6, thirst: 1, color: c.colors.crop }, c.wild ? { spawns: c.wild } : {})));
