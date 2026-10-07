'use strict';
/* DATA - the biome table. Every biome is ONE small file in this folder that registers itself here; the world, the renderer, the map and the
 * pony book all read this table, so adding a biome means adding a file (and one <script> line), nothing else.
 *
 *   rarity   how often the biome layer picks it for a region of the map: common / uncommon / rare / ultra (see BIOME_RARITY)
 *   from     (optional) the nearest to the village it appears, in rings: the ring's number plus how far through it (0.7 = the outer edge of
 *            the Heartland, 2.5 = halfway through the Deepwood); from there on outward it can turn up anywhere. Default 0 (everywhere)
 *   ground   [grass x3, dirt x3] colours, or null for the plain meadow look        mapColor  its colour on the map
 *   effect   the little animated detail the renderer draws (a BiomeEffects id)      ponyVariant  which pony variety lives here
 *   bush / stone / flax   chance a free tile holds one      berries  [[itemId, weight]]     appleTrees  share of trees that bear apples
 *   treeBoost            extra tree density (jungle is thick, ice is bare)
 *   levels   [min, max] level of the wild creatures here IN THE HEARTLAND (ring 0). Farther rings step every biome up by as much as the
 *            ring's own band steps up (meadow 1-5 in the Heartland is 5-10 in the Wilds; jungle 3-8 is 7-13). See ZoneLayer.
 *   ownFauna only the creatures that list this biome (their `biomes`) live here, plus its ponies; the everyday creatures stay out
 *   terrainOnly          not placed by the biome layer: decided by the tile (beach, clay flats) */
const BIOME_LEVELS = Object.freeze([1, 5]);                       // a biome without `levels` is as strong as the meadow
const BIOME_RARITY = Object.freeze({ common: 10, uncommon: 4, rare: 1.2, ultra: 0.25 });
const Biomes = new Registry('biomes', {
  required: ['name', 'mapColor', 'berries', 'bush', 'stone', 'flax'],
  check: b => (b.terrainOnly || BIOME_RARITY[b.rarity] ? null : 'needs a rarity (common / uncommon / rare / ultra)')
});
