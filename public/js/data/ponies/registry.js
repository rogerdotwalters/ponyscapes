'use strict';
/* DATA - pony tables: the kinds (plain, earth, pegasus, unicorn, alicorn), the varieties (one per biome), the traits (the bonus every pony has)
 * and the abilities (flight, magic). Each table is a Registry; each entry is a small data record. */
const PonyKinds = new Registry('pony kinds', { required: ['name', 'ring', 'weight', 'group'] });
const PonyVariantTable = new Registry('pony varieties', { required: ['name', 'accessory'] });
const PonyTraits = new Registry('pony traits', { required: ['name', 'stat', 'base', 'perLevel'] });
const PonyAbilities = new Registry('pony abilities', { required: ['name', 'cooldown', 'slot'] });
