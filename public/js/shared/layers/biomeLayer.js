'use strict';
/* LAYER - biomes. Every zone has ONE biome (js/data/zones/); a tile has the biome of the zone it is in. (Beaches and clay flats are decided by the tile, in
 * TerrainGenerator.biomeAt.) The earlier cell-and-rarity biome map is kept in legacy/ring-world/. */
class BiomeLayer {
  constructor(zones) { this.id = 'biomes'; this.zones = zones; }
  /** One id for the whole region a land tile is in: what a "per region" limit counts within (one per zone). */
  regionKey(tx, ty) { return 'zone:' + this.zones.at(tx, ty).index; }
  /** The biome id of a land tile. */
  at(tx, ty) { return this.zones.biomeAt(tx, ty); }
}
