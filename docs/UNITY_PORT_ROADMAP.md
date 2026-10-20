# Ponyscapes → Unity: porting roadmap

Draft based on a read of the repo as of 2026-10-20. Sizes and estimates are rough and assume one or two developers.

## 1. What we are porting

| Area | Where | Size | What it means for Unity |
|---|---|---|---|
| Simulation ("server") | `public/js/shared/` | 117 files, ~14.6k lines | Pure logic with no DOM and no sockets (`GameServer` is stepped at 30 Hz). Ports to C# nearly one-to-one. |
| Content data | `public/js/data/`, `public/js/content/` | 140 files, ~2.4k lines | Ponies, genes, creatures, items, crops, biomes, zones, quests, NPCs, dungeons. Becomes ScriptableObjects or JSON. |
| Client | `public/js/client/` | 124 files, ~19.9k lines | Rendering, input, audio, ~45 UI panels. Rebuilt with Unity systems, not translated. |
| Networking | `public/js/net/`, `src/`, `functions/`, `relay/` | ~1k lines | The host's browser runs the whole game and a Cloudflare Durable Object relays frames. Maps to Unity's listen-server model. |
| Tools and tests | `tools/` | 40 files, ~4.3k lines | `test-*.js` are headless tests of the simulation. They are useful as parity oracles. |
| Editors | `public/editor.html`, `js/editor/` | ~1.2k lines | Level, loot and content editors. Replaced by Unity Editor tooling. |

Features that shape the port:

- **Isometric 2:1 pixel art.** `isoProjection.js` uses `isoX = (x−y)·tileW/2`, `isoY = (x+y)·tileH/2`. The world is chunked and streamed, with a tree of zones, gateways, caves, dungeons and interiors (`grids.js` gives each its own grid).
- **Procedural art.** Terrain, creatures, trees, crops, buildings, ponies and characters are painted in code (`pixelTerrain`, `pixelBuildings`, `pixelPony` and others, with a ray-caster for buildings). `tools/export-art.js` already bakes the finite part into 3 PNG atlases (`public/assets/generated/`). There are ~1,400 pony colour looks, so ponies and characters are exported as shapes and recoloured at run time.
- **Genetics and breeding.** `ponyGenes`, `colorBreeding`, `hybrids`, `mutations` and `ponyPedigree`.
- **Farming and foraging, crafting, building, friendship hearts, skills and quests, the day/season/weather cycle, taming with a lasso, minigames** (Connect Four, memory, roundup), **puzzles and treasure.**
- **Multiplayer.** Up to 4 players. The host is authoritative, clients send inputs, and the host sends snapshots and deltas (`deltaCodec`, `snapshotBuilder`). Rooms use 5-character codes.
- **Saves.** `SaveData` serialised into IndexedDB (`saveStore.js`).
- **Input.** Keyboard and mouse, touch (virtual stick, tap-to-move) and a Switch-style gamepad layout.
- **Audio.** There are no audio files in the repo, so music, SFX, weather and world sounds are probably synthesised in code (`client/audio/`). This needs a decision in Phase 6.

## 2. Guiding decisions (confirm before starting)

1. **Port the simulation, don't wrap it.** Don't embed a JS engine. Re-implement `shared/` in C#, with the same tick rate, the same seeded RNG (`mulberry32`) and the same noise functions, so worlds generated from a seed match the web build. Keep the sim free of `UnityEngine` references, in its own assembly (`Ponyscapes.Sim`), so it can run in plain .NET tests and on a dedicated server later. This mirrors how `GameServer` is already isolated.
2. **Use JS as the oracle.** Before and during porting, add a Node script that dumps golden fixtures from the existing code, for example world tiles for N seeds, gene crosses for fixed RNG streams, pathfinding results, and sim state after K ticks with scripted inputs. The C# tests assert equality. The ~30 existing `tools/test-*.js` define the behaviours to match.
3. **Unity 6 + URP 2D.** Use the 2D Renderer with the Pixel Perfect Camera, an isometric Tilemap for ground (Cell Layout = Isometric Z as Y, with a custom sort axis for depth) and SpriteRenderers for props, creatures and buildings. Prefer a transparency sort axis of (0,1,0) over per-sprite sorting scripts.
4. **Art strategy: reuse, don't repaint.** Start from the existing baked atlases and bake more with `export-art.js`, slice them, and import them as Sprite Atlases. Ponies and characters use a palette-swap shader (shape sprite plus palette lookup) instead of 1,400 pre-coloured copies. Long term, decide whether to keep any run-time procedural painting (see Risk 2).
5. **Multiplayer: Netcode for GameObjects + Unity Relay + Lobby.** Keep host-authoritative, listen-server semantics, with the room code as the Relay join code. Replace the hand-rolled snapshot/delta codec with Netcode's replication where practical, but keep server-side interest management (the current `SERVER_STREAM_RADIUS` chunk streaming is a good model). The Cloudflare relay stays for the web build until it is retired.
6. **UI: UI Toolkit** (UXML/USS) for menus, bag, crafting, journal, stable and shop, with a few custom controls (heart meter, arched tool bar). Port `computeUiLayout` as a layout spec rather than literally.
7. **Input: the new Input System** with action maps, using the existing key, touch and gamepad bindings (`controlSettings.js`) as the spec.
8. **Target platforms:** answer this first (see Open questions). It drives the IAP, certification and WebGL decisions.

## 3. Phased roadmap

### Phase 0 – Discovery and scaffolding (1–2 weeks)
- Decide the open questions below. Write a one-page "definition of parity".
- Create the Unity 6 project (see the `new-unity-project` skill), set up source control (LFS or Plastic for art), assembly definitions (`Sim`, `Data`, `Client`, `Net`, `Editor`), and CI (game-ci or Unity Build Automation) with EditMode and PlayMode test runs.
- Build the **fixture exporter** in Node (`tools/export-fixtures.js`) on top of `tools/headless.js`.
- Audit `shared/` for Unity-hostile patterns (global scope, `Math.random`/`Date.now` use, JS object-as-map state, dynamic property bags) and list them. A quick grep found only 13 direct `Math.random`/`Date.now` uses in `shared/`, which is good.
- **Exit criteria:** empty project builds on CI. Fixtures exist for world gen, RNG and noise.

### Phase 1 – Data pipeline (2–3 weeks)
- Write a Node exporter that serialises everything in `public/js/data/` and `content/` into JSON (the data is already declarative). Import with an `AssetPostprocessor` into ScriptableObjects, or load JSON at boot through typed C# models.
- Port the registries (`core/registry.js`) as typed C# lookups with IDs kept identical (save compatibility depends on them).
- Port `config.js` into a ScriptableObject or a typed config class. Keep TILE_SCALE semantics.
- **Exit criteria:** every item, pony kind, creature, crop, biome, zone, NPC, quest and dungeon loads and round-trips by ID. A validation window reports dangling references.

### Phase 2 – Deterministic core: math, world and generation (3–4 weeks)
- Port `mathUtils`, `noise`, `mulberry32`, `tileTypes`, `time`, `seasons`, `weather`.
- Port `world`, `terrainGenerator`, `layers/*` (biome, zone, ring, cave sites, building sites, dungeon space, interior space), `grids`, `village`, `groves`, `hedges`, `grass`, `floraSystem`, `treeSystem`.
- Port `collision`, `pathfinding`, `playerMovement`.
- **Exit criteria:** for 20+ seeds, chunk-by-chunk tile, biome, zone and prop output matches the JS fixtures bit for bit. Movement and collision replays match.

### Phase 3 – Gameplay simulation (8–12 weeks, the largest block)
Port in dependency order, each with parity tests derived from the matching `tools/test-*.js`:
1. Inventory, items, equipment, bags, stockpiles, coins (`inventory`, `itemDefs`, `equipment`, `stockpiles`, `coins`).
2. Vitals, health, downed, sleep (`vitalsSystem`, `downed`, `sleepSystem`).
3. Tools and interaction (`toolSystem`, `toolHandlers`, `interaction`, `tapActions`), farming, forage, build, crafting, homeCrafts.
4. Animals and behaviours (`animal*`, `behaviors/*`, `wildPonies`, `packSystem`, `penSystem`, `castleSlimes`, `slimeRooms`, `nightEvents`, `skyEvents`).
5. **Ponies:** genes, colour breeding, hybrids, mutations, pedigree, abilities, skills, quality, care, progress, trade, poster (`pony*`, `colorBreeding`, `hybrids`).
6. NPCs, friendship, quests, shops, trade, puzzles, treasure, waypoints, roundup, Connect Four, memory game.
7. Dungeons and interiors (`dungeonSystem`, `interiorSystem`, `loot*`).
8. `GameServer` itself: the tick loop, per-player input queues (including the anti-speedhack `maxInputsPerTick`), event lists scoped by grid, and progression.
- Replace JS idioms deliberately: dictionaries to `Dictionary<,>`, event arrays to a typed event struct list, and dynamic player/entity bags to classes (or ECS components if you choose DOTS; the default recommendation is plain C# classes because the entity counts are small).
- **Exit criteria:** a scripted "playthrough" fixture (inputs → state hash every N ticks) matches the JS sim for the first day, a taming sequence, a breeding sequence, a farming cycle and a dungeon run.

### Phase 4 – Rendering vertical slice (4–6 weeks; can overlap late Phase 2/3)
- Isometric Tilemap ground with chunk streaming (mirrors `terrainRenderer`/`autoTile`), seasons and biome tints via tile colour or palette shader.
- Camera and Pixel Perfect Camera, y-sorted props and creatures, the see-through effect for trees and buildings (`seeThrough.js`), water and shallow wading, boats.
- Import baked atlases. Build the palette-swap shader for ponies and characters. Port the pony/character animation frame tables, and tool poses (`toolPose.js`).
- Lighting and time of day (`lighting.js`, `pixiLighting.js`) with URP 2D lights and a global light curve, plus fireflies, weather FX (rain, snow, thunder), rainbow trail and coin FX with VFX Graph or Particle System.
- Buildings, interiors and dungeon rooms (cavern rooms are PNGs already).
- **Exit criteria (vertical slice):** walk a seeded overworld in a single-player Unity build with terrain, trees, a village, creatures and a tamed pony, at 60 fps on target hardware. Compare screenshots with the web build for look-and-feel sign-off.

### Phase 5 – Input and UI (6–8 weeks)
- Input System action maps (keyboard/mouse, touch stick and tap-to-move, gamepad with the Switch-style layout and the on-screen hints from `gamepadHints`/`gamepadGuide`), target selector, rebinding UI.
- UI Toolkit screens, in priority order: HUD (date card, vitals, tool bar, mini map), Menu, Inventory/Bag/Character, Crafting, Dialogue, Shop and Trade, Stable and Pony Book, Journal and Map, Garden/Seed pouch, Settings, Lobby/Session, Wardrobe, Poster, then the minigame screens (Connect Four, Memory, Roundup, Puzzles).
- Safe areas, landscape lock and scaling for phones and tablets.
- Localisation scaffolding (`unity:localization`), since text is currently hard-coded in JS.
- **Exit criteria:** a new player can complete the first-hour flow with each of the three input methods.

### Phase 6 – Audio (2–3 weeks)
- Decide: (a) synthesise in Unity (a small DSP layer on `OnAudioFilterRead`), (b) render the existing synth output to .ogg clips with a one-off Node/WebAudio export, or (c) commission or replace. Option (b) is the quickest and preserves the current sound.
- Build the AudioMixer, music playback and soundtrack selection (`music.js`), weather ambience, positional world SFX.
- **Exit criteria:** audio parity checklist signed off.

### Phase 7 – Saves and migration (2–3 weeks)
- Port `SaveData` sanitisation and versioning to C# JSON (`System.Text.Json` or Newtonsoft) with a version field and migrations. Store in `persistentDataPath` (and Unity Cloud Save later, optionally).
- Keep the character/world split (`worldIndex`, `worldData`, `characters`).
- **Web-to-Unity import:** add an "Export save" button to the web game and an importer in Unity, since IndexedDB saves live only in the player's browser.
- **Exit criteria:** an existing web save loads in Unity and plays on, with the pony pedigrees, inventory and world edits intact.

### Phase 8 – Multiplayer (4–6 weeks)
- Netcode for GameObjects over Unity Transport, with Relay allocation and join codes tied to the 5-character room codes, and Lobby for listing and discovery.
- Host-authoritative flow: the host owns the `GameServer`. Clients send input commands (`maxInputsPerTick` semantics), and the host replicates per-player state, entities, chunk deltas, inventory revisions and grid-scoped events using interest management.
- Late join and rejoin (`serverOwned` player keys, away tokens, pony claims). Host migration is out of scope, as it is today.
- Optional cross-play with the web build: keep the Cloudflare relay protocol (`relayProtocol.js`) as a second transport only if the web build remains in service. Otherwise drop it.
- **Exit criteria:** four clients play for an hour with a host on a phone and on desktop, with no desyncs on the parity hashes and acceptable bandwidth.

### Phase 9 – Tooling and editors (2–4 weeks, can run in parallel)
- Replace `editor.html`, `levelEditor`, `lootEditor` and the cave-room tool with Unity custom inspectors or EditorWindows over the ScriptableObjects. Keep the dev-lock gate idea (`devLock.js`) for in-game dev settings.
- Admin/GameSettings (`gameSettings.js`) as a ScriptableObject plus a runtime override layer.

### Phase 10 – Polish, performance, QA, release (6–8 weeks)
- Profile on the weakest target device (chunk streaming, GC from sim allocations, sprite batching, atlas memory; the web version already budgets ~35 MB of decoded atlases).
- Accessibility, settings parity, tutorial and first-run flow, crash reporting and analytics.
- Platform builds, store listings, age ratings, optional IAP (if monetising) and cloud saves.
- Soak tests: 4-player 2-hour sessions, a save/load fuzz, long-running seasons.
- **Exit criteria:** release candidate.

### Rough timeline
Phases 0–3 are the critical path (about 16–23 weeks of sim work). Rendering, UI, audio and tooling run in parallel with a second developer, so a realistic total is **5–8 months with two developers** or **9–13 months solo**. Treat these as planning numbers, not commitments. Re-estimate at the end of Phase 2 once the real porting velocity is known.

## 4. Suggested milestones

| Milestone | Contents | Shows |
|---|---|---|
| M1 "Same world" | Phases 0–2 | Seeded worlds identical to the web build, walkable as coloured tiles |
| M2 "Looks right" | + Phase 4 slice | Walk the seeded world with real art, lighting, creatures |
| M3 "Plays solo" | + Phases 3, 5, 7 | The full single-player loop with UI and saves |
| M4 "Plays together" | + Phase 8 | 4-player sessions over Relay |
| M5 "Release candidate" | + Phases 6, 9, 10 | Everything, polished |

## 5. Main risks and mitigations

1. **Behavioural drift in the port.** Large, dense, dynamically-typed code, with very long lines and few type annotations. *Mitigation:* the golden-fixture and state-hash harness from Phase 0, and porting in dependency order with the existing tests as the spec.
2. **Procedural art does not map cleanly to Unity.** Part of the art (the ray-cast buildings, run-time-coloured ponies, season tints) depends on painting at run time. *Mitigation:* bake everything finite with `export-art.js`, use palette-swap shaders for ponies and characters, and for the rest either port the painters to C# writing into `Texture2D` at load (a fallback) or commission hand-drawn replacements. Decide per category in Phase 4.
3. **Floating-point and RNG divergence.** JS uses doubles and C# `float` is single precision. *Mitigation:* use `double` in the sim, port `Math.imul`/`>>> 0` semantics exactly in `mulberry32`, and test hashes early.
4. **Procedural-world and netcode performance on mobile.** Chunk generation runs on the host. *Mitigation:* generate on a worker thread or Jobs, with a budget like `SERVER_CHUNKS_PER_TICK`, and profile early.
5. **Scope creep in UI.** There are ~45 UI modules. *Mitigation:* prioritise by first-hour flow and build shared UI Toolkit components first.
6. **Save compatibility.** Players' saves live in browser storage. *Mitigation:* the export/import path in Phase 7 and keeping IDs stable in Phase 1.
7. **Web build expectations.** WebGL builds from Unity are much heavier than this ~3 MB JS game. *Mitigation:* decide whether the web version continues in parallel (see Open questions).

## 6. Open questions for the team

1. **Platforms:** iOS/Android, desktop, console, WebGL? The game is currently a landscape-only web app. Does the web version keep shipping?
2. **Cross-play** between the web and Unity versions during a transition, or a clean cut-over?
3. **Fidelity:** pixel-for-pixel look, or an opportunity to redraw the procedural art as hand-painted sprites?
4. **Audio:** reuse the synthesised sounds (render to clips) or replace?
5. **Monetisation or live services:** none today. Adding IAP, ads, cloud saves or leaderboards changes the package list.
6. **Team and timeline:** how many developers and how much time, to decide whether Phase 4 runs in parallel with Phase 3?
7. **Dedicated servers** as a future goal? If so, keep `Ponyscapes.Sim` free of Unity references from the start (the recommendation above already does).

## 7. First two weeks, concretely

1. Create the Unity 6 URP 2D project with the assembly layout, and set up CI with tests.
2. Write `tools/export-fixtures.js` and export fixtures for `mulberry32`, noise, `World` tiles and chunks for 20 seeds, and a few `GameServer` replays.
3. Port `mathUtils`, `noise`, RNG, `tileTypes` and `World` and make the fixture tests pass in EditMode.
4. Export the data folder to JSON and load one registry (items) end to end.
5. Import the existing atlases and render one chunk of the seeded world on an isometric Tilemap, as a smoke test of the pipeline.
