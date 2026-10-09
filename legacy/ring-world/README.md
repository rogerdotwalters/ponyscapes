# Legacy: the ring world

This folder keeps the **old procedural map** in case we ever want to go back to that style. Nothing in here is loaded by the game.

## What the old system was

* **Five concentric rings** around the village (The Heartland, The Wilds, The Deepwood, The Badlands, The Dragonlands), each 400 tiles wide, with wobbly
  (noise-bent) boundaries. Each ring had a level band, a map colour, and a boss that guarded the barrier to the next ring.
* **Biomes spread over the whole map** in big jittered cells ("cracked mud flat"), picked by rarity (common to ultra), with an optional `from` ring so some
  biomes keep away from the village.
* A separate **level-zone layer** (ring band + biome band) set how strong wild things were.
* One **cave per ring**, hidden at a random spot, each leading to that ring's boss lair; only ring 0 also had the hand-made cliff + room dungeon (the Old Cavern).
* Terrain noise scales were tuned for that size (continents 1/170, hills 1/55).

## What replaced it (see `public/js/`)

First a single 200-tile island (`ring-world-final` is the last commit before that), then a **tree of zones** (the Meadows with sub zones and gateways: see the main README). The details below are the single-island step; the zone tree builds on it.

* The map is about **half the size**: one zone, 200 tiles from the village, ending in a beach, open sea and a thin wall of light.
* **Zones** (`data/zones/`, `shared/layers/zoneLayer.js`) replace the rings. Zone 1, **The Meadows**, is meadow with exactly **one orchard patch (~15%)**.
  The patch is placed from the world seed and sized by measurement (`shared/layers/biomeLayer.js`), so it is procedural but the same for everyone.
* The Cave Bear's lair is no longer a separate cave in the open: it is the **last layer of the Old Cavern** (`lair: true` in `data/dungeons/cavern.js`).
* Rings 1 to 4 and their layers are gone from the loaded game. Their creatures and bosses (`data/creatures/`) are still in the data, just never placed.

## What is here (paths mirror `public/js/`, as they were before the change)

| File here | What it was |
| --- | --- |
| `shared/layers/ringLayer.js` | the rings: wobbly distance bands, locks, barriers |
| `shared/layers/biomeLayer.js` | biome cells by rarity and `from` |
| `shared/layers/zoneLayer.js` | level bands from ring + biome |
| `shared/layers/dungeonLayer.js`, `dungeonSpace.js` | one hidden cave per ring, and the lair's shape |
| `shared/layers/caveSites.js`, `worldLayers.js` | cliff/cave stamps (larger spread); the layer stack |
| `shared/terrainGenerator.js` | terrain at the old scales |
| `shared/config.js`, `world.js`, `worldProgress.js`, `grids.js`, `dungeonSystem.js`, `wantSystem.js`, `animalLevels.js`, `animalDefs.js`, `saveData.js`, `gameServer.js` | the files that were edited around the change |
| `data/rings/*` | the five ring definitions |
| `data/dungeons/*` | the dungeon registry and the Old Cavern as it was |
| `client/*`, `editor/editor.js` | UI files that said `Rings` and now say `Zones` |
| `index.html`, `editor.html` | the script lists (ring files instead of zone files) |

## Going back

1. Copy the files back to the same paths under `public/js/` (and `public/`), and delete `public/js/data/zones/`.
2. `ringLayer.js` goes back into the `<script>` lists of `index.html` and `editor.html` (the copies here already have it).
3. Note `Rings` was renamed `Zones` in a few files; the copies here use `Rings`, so restore those files together.
4. Saves: bosses defeated are stored by ring number, so ring 0's progress carries over either way.

(`git log` also has the full history: the commit before "Shrink the map to one zone" is the last one with the ring world.)
