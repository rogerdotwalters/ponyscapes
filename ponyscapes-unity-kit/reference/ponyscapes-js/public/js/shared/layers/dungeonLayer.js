'use strict';
/* LAYER - dungeon sites. A zone's dungeon has ONE way in: the cave mouth in a cliff (layers/caveSites.js). The zone's guardian waits in the LAST layer of that
 * dungeon (js/data/dungeons/: `lair`), so there is no separate lair mouth in the overworld. site(zone) answers "where is the way in?" for the scroll that
 * reveals it and for the map; a zone with no dungeon has none (null). */
class DungeonLayer {
  constructor(terrain, zones) { this.id = 'dungeons'; this.terrain = terrain; this.zones = zones; }
  /** { ring, x, y } : the cave mouth of the dungeon that belongs to this zone, or null. */
  site(ring) {
    const defs = Dungeons.all(), mouth = this.terrain.caveSites.caves().find(c => defs[c.index].ring === ring);
    return mouth ? { ring, x: mouth.x, y: mouth.y } : null;
  }
  /** Lone cave props standing in the open (none: the dungeons' mouths are part of their cliffs). */
  sites() { return []; }
  nearestTo() { return null; }
}
