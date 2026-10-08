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
    this.layers = new WorldLayers(this, this.seed);                         // rings, biomes, (zones), dungeons: each its own class
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
    if (e > T.rockLevel && Village.influence(tx, ty) < 0.5 && this.rockNoise.fractal(tx / 16, ty / 16, 3) > 0.02) return TILE.STONE;   // highlands break into outcrops (never inside the village: its paving is the only stone there)
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
    const biome = this.layers.biomes.at(tx, ty);
    const density = GameSettings.treeDensity(biome, T.treeBase + 0.9 * Math.max(0, this.forestiness(tx, ty) * 0.9 + this.moisture(tx, ty) * 0.5 - 0.02) + TreeBoost[biome], T.treeMax);   // (the Admin page's amount and cap per biome)
    return hash3(this.seed, tx, ty, 1) < density;
  }

  /** Which biome a tile belongs to: decides which berries grow there, which ponies live there and what colour the ground is. Beaches and clay flats are
   *  decided by the tile; everything else by the BIOME LAYER (rarity-weighted regions across the whole map). */
  biomeAt(tx, ty, tileType) {
    if (tileType === TILE.CLAY) return 'clay';
    if (tileType === TILE.SAND) return 'beach';
    return this.layers.biomes.at(tx, ty);
  }

  /** A bush on this tile? Returns { biome, berry } or null. The hash check is first so most tiles exit immediately. */
  bushAt(tx, ty, tileType) {
    if (tileType === TILE.STONE || isWaterTile(tileType) || tileType === TILE.CLAY || tileType >= TILE.CAVE) return null;
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
    if (isWaterTile(tileType) || tileType >= TILE.CAVE) return false;
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
  appleTreeAt(tx, ty) { const h = hash3(this.seed, tx, ty, 60); return h < 0.7 && h < AppleTreeChance[this.biomeAt(tx, ty, TILE.GRASS)]; }
  /** Which apple an apple tree here bears: if its biome has `edgeApples` and one of those neighbours is within EDGE_APPLE_RANGE tiles, a
   *  roll against that apple's chance (now and then an Orchard tree beside a Crystal Hollow bears crystal apples); else its biome's `apples`
   *  table. One kind per tree, always the same. */
  appleKindAt(tx, ty) {
    const own = this.biomeAt(tx, ty, TILE.GRASS), edges = BiomeEdgeApples[own];
    if (edges) {
      const h = hash3(this.seed, tx, ty, 64), rare = Object.values(edges).reduce((m, [, chance]) => Math.max(m, chance), 0);
      if (h < rare) for (let d = 2; d <= EDGE_APPLE_RANGE; d += 2) for (let k = 0; k < 8; k++) {             // (the roll first: most trees never look)
        const b = this.layers.biomes.at(Math.round(tx + Math.cos(k * Math.PI / 4) * d), Math.round(ty + Math.sin(k * Math.PI / 4) * d));
        if (edges[b] && h < edges[b][1]) return edges[b][0];
      }
    }
    const table = BiomeApples[this.biomeAt(tx, ty, TILE.GRASS)] || [['apple', 1]], total = table.reduce((n, [, w]) => n + w, 0);
    let roll = hash3(this.seed, tx, ty, 63) * total;
    for (const [item, weight] of table) { if ((roll -= weight) < 0) return item; }
    return table[0][0];
  }
  /** A mound of sand hiding a bottle (sand only), and a bottle floating in the shallows. */
  moundAt(tx, ty, tileType) { return tileType === TILE.SAND && hash3(this.seed, tx, ty, 61) < BURIED_BOTTLE_CHANCE && !Village.blocksTrees(tx, ty); }
  floatingBottleAt(tx, ty, tileType) { return tileType === TILE.SHALLOW && hash3(this.seed, tx, ty, 62) < FLOATING_BOTTLE_CHANCE; }

  /** An item lying on this tile (from ItemSpawnTable: each item's rate per 1000 open tiles of its biome), or null. */
  lootAt(tx, ty, tileType) {
    if (isWaterTile(tileType) || Village.blocksTrees(tx, ty)) return null;
    const h = hash3(this.seed, tx, ty, 70);
    if (h >= MAX_LOOT_CHANCE) return null;
    const table = ItemSpawnTable[this.biomeAt(tx, ty, tileType)];
    if (!table) return null;
    let roll = h * 1000;
    for (const [item, rate] of table) if ((roll -= rate) < 0) return item;
    return null;
  }

  /** A diggable clay deposit on this tile? */
  clayAt(tx, ty, tileType) { return tileType === TILE.CLAY && hash3(this.seed, tx, ty, 24) < CLAY_DEPOSIT_CHANCE; }

  /** The animal home in this chunk, or null: { node: { type, tx, ty, x, y, count, biome, variant }, members: [{ type, x, y, gene, variant, level, biome }] }.
   *  Deterministic, so a chunk always holds the same home. WHAT lives here is decided by the RING (each creature's own data says which ring it belongs to and
   *  how common it is). Wild ponies have no home: they come and go with the mornings (wildPonies.js), so a pony roll gives no group here.
   *  `free(tx, ty)` (optional) says whether a tile may hold the home's marker (no tree or bush on it). */
  animalGroup(cx, cy, tileOf, free) {
    if (hash3(this.seed, cx, cy, 21) >= FAUNA_CHANCE) return null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const tx = cx * CHUNK_SIZE + Math.floor(hash3(this.seed, cx, cy, 30 + attempt) * CHUNK_SIZE);
      const ty = cy * CHUNK_SIZE + Math.floor(hash3(this.seed, cx, cy, 50 + attempt) * CHUNK_SIZE);
      const tile = tileOf(tx, ty);
      if ((tile !== TILE.GRASS && tile !== TILE.DIRT) || Village.influence(tx, ty) >= 1 || (free && !free(tx, ty))) continue;   // not in the village, not on rock / water
      const biome = this.biomeAt(tx, ty, tile), fauna = Fauna.poolAt(this.layers.rings.at(tx + 0.5, ty + 0.5).index, biome);
      if (!fauna.length) continue;
      const total = fauna.reduce((n, f) => n + f.weight, 0);
      let roll = hash3(this.seed, cx, cy, 22) * total, chosen = fauna[0];
      for (const f of fauna) { if ((roll -= f.weight) < 0) { chosen = f; break; } }
      if (chosen.pony) return null;
      const type = chosen.id, [min, max] = chosen.group, count = min + Math.floor(hash3(this.seed, cx, cy, 23) * (max - min + 1));
      const node = { type, tx, ty, x: tx + 0.5, y: ty + 0.5, count, biome, variant: Math.floor(hash3(this.seed, cx, cy, 24) * 4) };
      const members = Array.from({ length: count }, (_, i) => {
        const x = node.x + (hash3(this.seed, cx, cy, 60 + i) - 0.5) * 2.4, y = node.y + (hash3(this.seed, cx, cy, 80 + i) - 0.5) * 2.4;
        return { type, x, y, gene: Math.floor(hash3(this.seed, cx, cy, 100 + i) * 2147483647), variant: 0, level: AnimalLevels.roll(type, x, y, hash3(this.seed, cx, cy, 120 + i), this.layers), biome };
      });
      return { node, members };
    }
    return null;
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
