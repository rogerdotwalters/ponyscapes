# Architecture: the original, and where each piece goes

## The original in one page

- **Host-authoritative.** `GameServer` (`shared/gameServer.js`, ~1.2k lines + many systems) is a pure object: no timers, no sockets. A host adapter (`net/hostAdapter.js`) steps it at `CONFIG.sim.tickRate` (30 Hz), feeds it per-player input queues, and ships snapshots / deltas. Remote players (`net/remoteAdapter.js`) send inputs and render what they receive. A Cloudflare Durable Object only relays frames (`relayProtocol.js`).
- **World.** `World(seed)` streams 2D chunks (`CHUNK_SHIFT`) generated from layered noise: zones (a tree with gateways), biomes, buildings sites, caves. Instances (caves, dungeons, interiors) are separate grids (`grids.js`). Tiles are small ints (`tileTypes.js`); props (trees, flora, crops, structures) are separate layers.
- **Entities.** Players (`being.js`), animals (`animal*.js`, `behaviors/`), NPCs (`npc*.js`), ponies (`pony*.js`, genes + breeding), boats, drops.
- **Content.** Declarative tables under `data/` and `content/`, registered through `core/registry.js`.
- **Client.** Isometric 2:1 projection (`isoX=(x-y)*tileW/2`, `isoY=(x+y)*tileH/2`), Canvas/PixiJS renderers, procedural pixel-art painters, baked "art pack" atlases, DOM/canvas UI panels, keyboard/touch/gamepad input, synthesised audio.
- **Saves.** `shared/saveData.js` sanitises/serialises; `net/saveStore.js` keeps them in IndexedDB.

## Mapping table

| Original | Unity target | Notes |
|---|---|---|
| `shared/mathUtils.js`, `noise.js` | `Sim/Core` | `mulberry32`, hash2, Perlin, lerp/angles. Exact-parity tested. |
| `shared/config.js`, `gameSettings.js` | `Data` (typed config + ScriptableObject) | Keep `TILE_SCALE` semantics. |
| `data/**`, `content/**` | JSON (exported by Node) -> typed C# models -> optional ScriptableObjects | Ids unchanged. |
| `core/registry.js` | `Data/Registry<T>` | |
| `shared/world.js`, `terrainGenerator.js`, `layers/*`, `grids.js`, `village.js`, `groves.js`, `hedges.js` | `Sim/World` | Chunk streaming; budget per tick. |
| `shared/collision.js`, `pathfinding.js`, `playerMovement.js` | `Sim/Movement` | |
| `shared/inventory.js`, `itemDefs.js`, `equipment.js`, `stockpiles.js`, `coins.js` | `Sim/Items` | |
| `shared/pony*.js`, `colorBreeding.js`, `hybrids.js`, `mutations` | `Sim/Ponies` | Highest-value, most test-covered. |
| `shared/animal*.js`, `behaviors/*`, `wildPonies.js`, `packSystem.js` | `Sim/Animals` | |
| `shared/farming.js`, `forageSystem.js`, `floraSystem.js`, `treeSystem.js`, `buildSystem.js`, `craftingSystem.js` | `Sim/Economy` | |
| `shared/npc*.js`, `friendship*.js`, `questSystem.js`, `shopSystem.js`, `tradeSystem.js`, `puzzles.js` | `Sim/Social` | |
| `shared/dungeonSystem.js`, `interiorSystem.js`, `lootTables.js` | `Sim/Dungeons` | |
| `shared/gameServer.js` | `Sim/GameServer.cs` | Last: it wires everything. |
| `shared/deltaCodec.js`, `snapshotBuilder.js` | `Net` | Replace with Netcode replication where practical. |
| `client/render/*` | `Client/Render` | Isometric Tilemap + SpriteRenderers + URP 2D lights; not a line-by-line port. |
| `client/render/pixel*.js` (procedural painters) | baked atlases + palette-swap shader (decide per category) | See `tools/README-art.md`. |
| `client/ui/*` | `Client/UI` (UI Toolkit) | |
| `client/input/*` | `Client/Input` (Input System) | Bindings in `controlSettings.js`. |
| `client/audio/*` | `Client/Audio` | Decision pending: render synth to clips vs. reimplement. |
| `net/saveStore.js`, `shared/saveData.js` | `Sim/Save` + `Client/Save` | JSON, versioned, import from web export. |
| `editor/*` | Unity Editor tooling | Later. |

## Porting order

Follow the `<script>` order in `reference/ponyscapes-js/public/index.html` (minus `net/` and `client/`): it is already a dependency order. Leaves first (math, noise, config, tile types), then world, then entities/systems, `GameServer` last.
