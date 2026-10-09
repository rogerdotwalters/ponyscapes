'use strict';
/* LAYER STACK - the world is generated in layers, each its own class. The terrain generator composes them and asks each one only its own
 * question: rings ("which area, locked?"), biomes ("what kind of land?"), zones ("how strong?" - optional), dungeons ("where are the caves?").
 * Remove a layer and the others carry on (zones === null means creatures use their own base levels). */
class WorldLayers {
  constructor(terrain, seed) {
    this.rings = new RingLayer(seed);
    this.biomes = new BiomeLayer(seed, this.rings);
    this.zones = CONFIG.world.zones ? new ZoneLayer(this.rings, this.biomes) : null;
    this.dungeons = new DungeonLayer(terrain, this.rings);
  }
}
