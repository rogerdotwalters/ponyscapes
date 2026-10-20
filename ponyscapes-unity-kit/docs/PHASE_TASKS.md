# Phase 0-2 task list

Mark tasks in `docs/PROGRESS.md`. Each has acceptance criteria.

## Phase 0 — scaffolding
- **T0.1 Project.** Unity 6 2D (URP) project exists; skeleton merged; compiles. *Accept:* opens with no errors.
- **T0.2 Packages.** Install packages listed in CLAUDE.md. *Accept:* Package Manager shows them; versions recorded in PROGRESS.md.
- **T0.3 Tests run.** `RngParityTests` passes in the Test Runner (EditMode). *Accept:* green; fix compile errors if any (the file has never been compiled).
- **T0.4 CI (optional, ask first).** game-ci or Unity Build Automation running EditMode tests.
- **T0.5 Fixture pipeline.** `node fixtures-tool/export-fixtures.js` regenerates `fixtures/`; a helper copies to `Assets/StreamingAssets/fixtures/`. *Accept:* documented one-liner.
- **T0.6 Hostile-pattern audit.** Grep `reference/.../shared/` for `Math.random`, `Date.now`, `performance.now`, `window`, `document`, `localStorage`; list each use in PROGRESS.md with the plan to inject it.

## Phase 1 — data pipeline
- **T1.1 Exporter.** `fixtures-tool/export-data.js` writes one JSON per registry. *Accept:* counts match the JS registries (print counts).
- **T1.2 Typed models + loader** in `Data`, ids preserved; `Registry<T>`.
- **T1.3 Validator** (EditMode test): every referenced id (recipe inputs, loot tables, shop stock, quest rewards, biome flora...) resolves.
- **T1.4 Config.** Port `config.js` (`CONFIG.sim`, `CONFIG.world`, `CONFIG.view`, TILE_SCALE) as typed config.

## Phase 2 — deterministic core
- **T2.1 Math/RNG/noise.** `Mulberry32` (given), `hash2`, `PerlinNoise` (`sample`, `fractal`), angle helpers. *Accept:* `rng.json`, `noise.json` exact.
- **T2.2 Tile types + grid containers** (`tileTypes.js`, `grids.js`).
- **T2.3 Layers.** Port `layers/*` one by one (`biomeLayer`, `zoneLayer` with `data/zones`, `buildingSites`, `caveSites`, `dungeonSpace`, `interiorSpace`, `worldLayers`).
- **T2.4 Terrain + World.** `terrainGenerator.js`, `world.js`, flora/trees/hedges/grass/groves/village. *Accept:* `world.json` tiles + solidity exact for all seeds/windows; add prop-layer fixtures as you port them.
- **T2.5 Movement.** `collision.js`, `playerMovement.js`, `pathfinding.js` with replayed-input fixtures.
- **T2.6 Debug viewer.** A throwaway Client scene that draws the tile grid as coloured quads from the C# World to eyeball it against the web build (`?solo=1`, same seed).

Stop and report after T2.6 (Milestone M1 "Same world").
