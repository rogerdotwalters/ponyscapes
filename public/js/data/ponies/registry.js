'use strict';
/* DATA - pony tables: the kinds (plain, earth, pegasus, unicorn, alicorn), the varieties (one per biome), the traits (the bonus every pony has)
 * and the abilities (flight, magic). Each table is a Registry; each entry is a small data record. */
const PonyKinds = new Registry('pony kinds', { required: ['name', 'ring', 'weight', 'group'] });
const PonyVariantTable = new Registry('pony varieties', { required: ['name', 'accessory'] });
const PonyTraits = new Registry('pony traits', { required: ['name', 'stat', 'base', 'perLevel'] });
const PonyAbilities = new Registry('pony abilities', { required: ['name', 'cooldown', 'slot'] });
const PonyGeneTable = new Registry('pony genes', { required: ['name', 'part', 'kind'] });             // the gene loci (genes.js): what a pony inherits, in the order they sit in its look
const SkyPonyTable = new Registry('sky ponies', { required: ['kind', 'variant', 'when'] });                  // ponies that appear only in certain weather or at certain hours (skyPonies.js, shared/skyEvents.js)
const HybridTable = new Registry('pony hybrids', { required: ['name', 'rarity'] });                 // crossbred varieties: two varieties (or hybrids) make a new one (hybrids.js, shared/hybrids.js)
const PonySkillTrees = new Registry('pony skill trees', { required: ['skills'] });         // one per variety (variants.js): its skills, unlocked by the pony's level (skills.js)
