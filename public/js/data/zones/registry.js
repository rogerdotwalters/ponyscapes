'use strict';
/* DATA - the zones. The world is a TREE of zones (the sketch: a main zone with sub zones branching off it, which have sub zones of their own). Every zone is its
 * own blob of land with ONE biome, walled in by cliffs of that biome and joined to its parent by a gateway in the wall; the whole map floats in open sea
 * behind an invisible barrier. Each zone is one small data file (and one <script> line); where it goes is worked out from the world seed (layers/zoneLayer.js).
 *
 *   index      0, 1, 2 ... (no gaps): the zone's number in saves, on the wire and in creatures' `ring` fields      name / color   as shown on the map
 *   biome      the zone's biome id (js/data/biomes/)      radius   tiles; a number, or [min, max] to roll it from the seed
 *   parent     id of the zone it branches off (leave out for the one root zone, which holds the village). A zone with 3 children has them placed round it at random.
 *   locked     true: its gateway starts shut (a barrier you cannot pass) until it is opened      unlockedBy   id of the zone whose guardian opens it when beaten
 *   fauna      which tier of creatures lives here (the creatures' `ring`; default: the zone's own index)
 *   levelMin / levelMax   the level band of the wild things (rising from the middle out)       boss   the guardian of the zone's dungeon lair (optional)
 * (The old five-ring world is kept in legacy/ring-world/.) */
const Zones = new Registry('zones', {
  required: ['index', 'name', 'radius', 'levelMin', 'levelMax', 'color', 'biome'],
  check: z => (Number.isInteger(z.index) && z.index >= 0 ? null : 'needs a whole-number index')
});
