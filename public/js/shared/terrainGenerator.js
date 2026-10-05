'use strict';
/* SHARED - procedural terrain from LAYERED Perlin noise, tuned for land.
 *
 *   continents  (very low frequency)  decide where big landmasses and seas are
 *   hills       (medium)              bends coastlines, raises highlands
 *   detail      (high)                roughens shores and rock edges
 *   + a constant LAND_BIAS and the village's influence lift everything toward land, so water is the exception:
 *     lakes, bays and the odd sea, not the default.
 *   moisture / forest / patch noise decide grass vs dirt and where trees cluster.
 *
 * tile(tx, ty) is a PURE function of the seed and the coordinates, which is what lets chunks be generated in any
 * order, discarded, and regenerated identically on the client and the server. */
const TERRAIN = Object.freeze({
  continentScale: 1 / 170, hillScale: 1 / 55, detailScale: 1 / 15,
  weight: Object.freeze({ continent: 0.58, hills: 0.28, detail: 0.14 }),
  contrast: 1.9,                  // stretches the layered noise so coasts and highlands have real range
  landBias: 0.0,                  // pushes the world toward land (seaLevel is calibrated against it)
  seaLevel: -0.15, wadeBand: 0.06, beachWidth: 0.04, rockLevel: 0.26,    // deep water below seaLevel - wadeBand, a wadeable shallow band up to seaLevel
  dryMoisture: -0.2, wetMoisture: 0.22, forestScore: 0.07,
  clayBand: 0.10, clayMoisture: 0.0, clayPatch: 0.1,
  treeBase: 0.012, treeMax: 0.40
});

const VILLAGE_LAND_LIFT = 1.2;

class TerrainGenerator {
  constructor(seed) {
    this.seed = seed | 0;
    this.continents = new PerlinNoise(this.seed + 101);
    this.hills = new PerlinNoise(this.seed + 202);
    this.detail = new PerlinNoise(this.seed + 303);
    this.moistureNoise = new PerlinNoise(this.seed + 404);
    this.forestNoise = new PerlinNoise(this.seed + 505);
    this.patchNoise = new PerlinNoise(this.seed + 606);
    this.rockNoise = new PerlinNoise(this.seed + 707);
    this.clayNoise = new PerlinNoise(this.seed + 808);
    this.warpX = new PerlinNoise(this.seed + 909);
    this.warpY = new PerlinNoise(this.seed + 1010);
  }

  /** Natural terrain height in roughly [-1, 1]; below seaLevel is water. */
  elevation(tx, ty) {
    const T = TERRAIN, w = T.weight;
    const continent = this.continents.fractal(tx * T.continentScale, ty * T.continentScale, 4);
    const hills = this.hills.fractal(tx * T.hillScale, ty * T.hillScale, 3);
    const detail = this.detail.fractal(tx * T.detailScale, ty * T.detailScale, 2);
    const layered = w.continent * continent + w.hills * hills + w.detail * detail;
    return T.contrast * layered + T.landBias;
  }

  // the everyday biomes (meadow / forest / wetland / dry) sweep across much larger areas than the first version
  moisture(tx, ty) { return this.moistureNoise.fractal(tx / 220, ty / 220, 3); }
  forestiness(tx, ty) { return this.forestNoise.fractal(tx / 80, ty / 80, 2); }

  /** Final ground type of a tile. */
  tile(tx, ty) {
    const forced = Village.tile(tx, ty);
    if (forced >= 0) return forced;
    const T = TERRAIN, e = this.elevation(tx, ty);
    const shore = e + VILLAGE_LAND_LIFT * Village.influence(tx, ty);          // the village is lifted out of the sea, not turned into rock
    if (shore < T.seaLevel - T.wadeBand) return TILE.WATER;
    if (shore < T.seaLevel) return TILE.SHALLOW;
    if (shore < T.seaLevel + T.beachWidth) return TILE.SAND;
    if (e > T.rockLevel && this.rockNoise.fractal(tx / 16, ty / 16, 3) > 0.02) return TILE.STONE;   // highlands break into outcrops
    const moisture = this.moisture(tx, ty);
    // clay flats: damp low ground just inland of the beaches, in patches
    if (shore < T.seaLevel + T.beachWidth + T.clayBand && moisture > T.clayMoisture && this.clayNoise.fractal(tx / 11, ty / 11, 2) > T.clayPatch) return TILE.CLAY;
    if (moisture < T.dryMoisture && this.patchNoise.fractal(tx / 8, ty / 8, 2) > 0.05) return TILE.DIRT;
    return TILE.GRASS;
  }

  /** Does a tree grow here? Forests cluster where it is moist and the forest layer is high. */
  hasTree(tx, ty, tileType) {
    if (tileType !== TILE.GRASS || Village.blocksTrees(tx, ty)) return false;
    const T = TERRAIN;
    const density = clamp(T.treeBase + 0.9 * Math.max(0, this.forestiness(tx, ty) * 0.9 + this.moisture(tx, ty) * 0.5 - 0.02), 0, T.treeMax);
    return hash3(this.seed, tx, ty, 1) < density;
  }

  /** The far-off biomes (blossom, crystal, starlit, ember). The world is cut into jittered cells; some hold a round patch of one of them,
   *  but only once the cell is far enough from the ORIGIN. Returns a biome id or null. Pure function of the seed. */
  specialBiomeAt(tx, ty) {
    const dist = AnimalLevels.distance(tx, ty);
    if (dist < SpecialBiomes[0].minDistance - 55) return null;
    const S = SPECIAL_BIOME_CELL, wx = tx + 45 * this.warpX.fractal(tx / 78, ty / 78, 2), wy = ty + 45 * this.warpY.fractal(tx / 78, ty / 78, 2);
    const cx = Math.floor(wx / S), cy = Math.floor(wy / S);
    if (hash3(this.seed, cx, cy, 90) >= SPECIAL_BIOME_CHANCE) return null;
    const px = (cx + 0.25 + 0.5 * hash3(this.seed, cx, cy, 92)) * S, py = (cy + 0.25 + 0.5 * hash3(this.seed, cx, cy, 93)) * S;   // the patch's centre, which decides how far out it is
    const patchDist = AnimalLevels.distance(px, py);
    const kinds = SpecialBiomes.filter(k => patchDist >= k.minDistance);
    if (!kinds.length) return null;
    let roll = hash3(this.seed, cx, cy, 91) * kinds.reduce((n, k) => n + k.weight, 0), kind = kinds[0];
    for (const k of kinds) { if ((roll -= k.weight) < 0) { kind = k; break; } }
    const radius = S * (0.34 + 0.12 * hash3(this.seed, cx, cy, 94));
    return Math.hypot(wx - px, wy - py) < radius ? kind.id : null;
  }

  /** Which biome a land tile belongs to: decides which berries grow there, which animals live there and what colour the ground is. */
  biomeAt(tx, ty, tileType) {
    if (tileType === TILE.CLAY) return 'clay';
    if (tileType === TILE.SAND) return 'beach';
    const special = this.specialBiomeAt(tx, ty);
    if (special && (tileType === TILE.GRASS || tileType === TILE.DIRT)) return special;
    if (tileType === TILE.DIRT) return 'dry';
    const T = TERRAIN, moisture = this.moisture(tx, ty);
    if (this.elevation(tx, ty) > T.rockLevel) return 'highland';
    if (moisture > T.wetMoisture) return 'wetland';
    if (this.forestiness(tx, ty) * 0.9 + moisture * 0.5 > T.forestScore) return 'forest';
    return moisture < T.dryMoisture ? 'dry' : 'meadow';
  }

  /** A bush on this tile? Returns { biome, berry } or null. The hash check is first so most tiles exit immediately. */
  bushAt(tx, ty, tileType) {
    if (tileType === TILE.STONE || isWaterTile(tileType) || tileType === TILE.CLAY) return null;
    const h = hash3(this.seed, tx, ty, 11);
    if (h >= MAX_BUSH_CHANCE || Village.blocksTrees(tx, ty)) return null;
    const biome = this.biomeAt(tx, ty, tileType);
    if (h >= BushChance[biome]) return null;
    const table = BiomeBerries[biome], total = table.reduce((n, [, w]) => n + w, 0);
    let roll = hash3(this.seed, tx, ty, 12) * total;
    for (const [berry, weight] of table) { if ((roll -= weight) < 0) return { biome, berry }; }
    return { biome, berry: table[0][0] };
  }

  /** A loose stone on this tile? Rocky ground is full of them. Returns true / false. */
  stoneAt(tx, ty, tileType) {
    if (isWaterTile(tileType)) return false;
    const h = hash3(this.seed, tx, ty, 16);
    if (h >= MAX_STONE_CHANCE || Village.blocksTrees(tx, ty)) return false;
    return h < (tileType === TILE.STONE ? ROCKY_STONE_CHANCE : StoneChance[this.biomeAt(tx, ty, tileType)]);
  }

  /** A flax plant (harvest for string) on this tile? */
  flaxAt(tx, ty, tileType) {
    if (tileType !== TILE.GRASS && tileType !== TILE.DIRT) return false;
    const h = hash3(this.seed, tx, ty, 42);
    if (h >= MAX_FLAX_CHANCE || Village.blocksTrees(tx, ty)) return false;
    return h < FlaxChance[this.biomeAt(tx, ty, tileType)];
  }

  /** Does this tree bear apples? */
  appleTreeAt(tx, ty) { return hash3(this.seed, tx, ty, 60) < APPLE_TREE_CHANCE && APPLE_BIOMES.includes(this.biomeAt(tx, ty, TILE.GRASS)); }
  /** A mound of sand hiding a bottle (sand only), and a bottle floating in the shallows. */
  moundAt(tx, ty, tileType) { return tileType === TILE.SAND && hash3(this.seed, tx, ty, 61) < BURIED_BOTTLE_CHANCE && !Village.blocksTrees(tx, ty); }
  floatingBottleAt(tx, ty, tileType) { return tileType === TILE.SHALLOW && hash3(this.seed, tx, ty, 62) < FLOATING_BOTTLE_CHANCE; }

  /** A diggable clay deposit on this tile? */
  clayAt(tx, ty, tileType) { return tileType === TILE.CLAY && hash3(this.seed, tx, ty, 24) < CLAY_DEPOSIT_CHANCE; }

  /** The animals that live in this chunk: [{ type, x, y }]. Deterministic, so a chunk always holds the same herd. */
  animalGroup(cx, cy, tileOf) {
    if (hash3(this.seed, cx, cy, 21) >= FAUNA_CHANCE) return [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const tx = cx * CHUNK_SIZE + Math.floor(hash3(this.seed, cx, cy, 30 + attempt) * CHUNK_SIZE);
      const ty = cy * CHUNK_SIZE + Math.floor(hash3(this.seed, cx, cy, 50 + attempt) * CHUNK_SIZE);
      const tile = tileOf(tx, ty);
      if ((tile !== TILE.GRASS && tile !== TILE.DIRT) || Village.influence(tx, ty) >= 1) continue;   // not in the village, not on rock / water
      const biome = this.biomeAt(tx, ty, tile), dist = AnimalLevels.distance(tx + 0.5, ty + 0.5);
      const fauna = (BiomeFauna[biome] || []).filter(f => dist >= (AnimalDefs[f[0]].minDistance || 0));          // rarer, stronger species only live farther from the origin
      if (!fauna.length) continue;
      const total = fauna.reduce((n, f) => n + f[1], 0);
      let roll = hash3(this.seed, cx, cy, 22) * total, chosen = fauna[0];
      for (const f of fauna) { if ((roll -= f[1]) < 0) { chosen = f; break; } }
      const [type, , [min, max]] = chosen, count = min + Math.floor(hash3(this.seed, cx, cy, 23) * (max - min + 1));
      const variant = AnimalDefs[type].pony ? PonyLook.variantOf(biome) : 0;                                    // each biome has its own kind of pony
      return Array.from({ length: count }, (_, i) => {
        const x = tx + 0.5 + (hash3(this.seed, cx, cy, 60 + i) - 0.5) * 2.4, y = ty + 0.5 + (hash3(this.seed, cx, cy, 80 + i) - 0.5) * 2.4;
        return { type, x, y, gene: Math.floor(hash3(this.seed, cx, cy, 100 + i) * 2147483647), variant, level: AnimalLevels.roll(type, x, y, hash3(this.seed, cx, cy, 120 + i)), biome };
      });
    }
    return [];
  }

  /** A shoreline water tile in this chunk where a boat can sit (or null). `tileOf` reads the chunk's own tiles first. */
  boatSpot(cx, cy, tileOf) {
    if (!Village.hasBoatFeature(cx, cy) && hash3(this.seed, cx, cy, 8) >= 0.25) return null;
    const spots = [];
    for (let ly = 0; ly < CHUNK_SIZE; ly++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const tx = cx * CHUNK_SIZE + lx, ty = cy * CHUNK_SIZE + ly;
      if (!isWaterTile(tileOf(tx, ty))) continue;                      // boats sit in the shallows, at the water's edge
      let water = 0, shore = 0, openX = 0, openY = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (isWaterTile(tileOf(tx + dx, ty + dy))) { water++; openX += dx; openY += dy; }
        else if (!dx || !dy) shore++;
      }
      if (water >= 5 && shore >= 1) spots.push({ x: tx + 0.5, y: ty + 0.5, facing: Math.atan2(openY, openX) });
    }
    return spots.length ? spots[Math.floor(hash3(this.seed, cx, cy, 9) * spots.length)] : null;
  }
}
