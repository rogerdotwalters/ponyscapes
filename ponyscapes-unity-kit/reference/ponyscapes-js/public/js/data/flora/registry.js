'use strict';
/* DATA - flora: the PLANT LISTS of the biomes. One small file per biome says which plants grow there and how often; the world generator, the daily seeding
 * of new trees (shared/floraSystem.js) and the Map Preview all read it. A biome with no entry here keeps what its biome file says (the older tables).
 *
 *   trees      [[treeSpeciesId, weight]]   what a tree here is (species: js/data/trees/trees.js). A species that is not listed never grows here, from seed or by spreading
 *   bushes     [[berryItemId, weight]]     what a berry bush here bears (how many bushes: the biome's `bush` chance)
 *   mushrooms  [[mushroomItemId, weight]]  (optional) mushrooms that grow on the ground here, picked like berries
 *   mushroomChance                         (optional) chance that a free tile holds a mushroom patch
 *   treeScale                              (optional) times the trees' density here (default 1; 0.5 = half as many trees)
 *   spreadBoost                            (optional) times the trees' own spread chance here (default 1: 0 stops trees spreading)
 * The id is the biome's id. */
const Flora = new Registry('flora', {
  required: ['trees', 'bushes'],
  check: f => {
    if (!Biomes.has(f.id)) return 'is not a biome';
    for (const [id] of f.trees) if (!TreeSpecies.has(id)) return `lists the unknown tree "${id}"`;
    return null;
  }
});
/** The tree list of a biome, or null if it has none (the older tables then decide). */
Flora.treesIn = biome => { const f = Flora.get(biome); return f ? f.trees : null; };
/** The berry list of a biome, or null. */
Flora.bushesIn = biome => { const f = Flora.get(biome); return f && f.bushes.length ? f.bushes : null; };
/** Is this species grown in this biome? (true for a biome with no list: the old rules do not say) */
Flora.allows = (biome, species) => { const t = Flora.treesIn(biome); return !t || t.some(([id]) => id === species); };
/** One entry of a weighted list `[[id, weight], ...]` for a roll `h` in [0, 1). */
Flora.pick = (list, h) => { let roll = h * list.reduce((n, [, w]) => n + w, 0); for (const [id, w] of list) { if ((roll -= w) < 0) return id; } return list[list.length - 1][0]; };
