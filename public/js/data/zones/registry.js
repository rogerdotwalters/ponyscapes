'use strict';
/* DATA - the zones. The world is made of ZONES, each its own procedurally generated area with a level band, a colour on the map and a boss that guards the way
 * to the NEXT zone. For now there is exactly one (zone 1: the Meadows); more are added as one small file each (and one <script> line).
 *
 *   index      0-based position (zone 1 is index 0)       radius   how far from the village the zone reaches, in tiles
 *   levelMin / levelMax   the level band of the wild things in it      color   its colour on the map      boss   the creature that guards the way on
 *   biomes     [{ id, share, patches }]: what the zone is made of. `share` is the fraction of the zone's land that biome covers; the biome with no
 *              `patches` fills whatever is left, one with `patches: n` is laid down as n irregular patches (see ZoneBiomes in layers/zoneLayer.js)
 * (The old five-ring world is kept in legacy/ring-world/.) */
const Zones = new Registry('zones', { required: ['index', 'name', 'radius', 'levelMin', 'levelMax', 'color', 'boss', 'biomes'] });
