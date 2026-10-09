'use strict';
/* LAYER STACK - the world is generated in layers, each its own class. The terrain generator composes them and asks each one only its own
 * question: zones ("which zone, how strong, where does the world end?"), biomes ("what kind of land?"), dungeons ("where is the way in?").
 * `rings` is the zone layer under its old name (see layers/zoneLayer.js). The earlier ring/biome-cell world is kept in legacy/ring-world/. */
class WorldLayers {
  constructor(terrain, seed) {
    this.zones = new ZoneLayer(seed);
    this.rings = this.zones;
    this.biomes = new BiomeLayer(seed, terrain, this.zones);
    this.zones.biomes = this.biomes;
    this.dungeons = new DungeonLayer(terrain, this.zones);
  }
}
