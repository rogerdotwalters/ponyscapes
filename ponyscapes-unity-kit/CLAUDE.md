# CLAUDE.md — Ponyscapes Unity port

You are porting **Ponyscapes** (a cosy isometric pixel-art pony adventure, currently a ~3 MB vanilla-JS browser game) to **Unity 6 (URP, 2D)**. This file lives at the root of the Unity project. Read it fully, then `docs/ROADMAP.md`, then start at "First session" below.

## Layout of this project

```
CLAUDE.md                 this file
docs/ROADMAP.md           phases, milestones, risks, open questions
docs/ARCHITECTURE.md      JS source map -> C# targets, and how the original works
docs/PORTING_CONVENTIONS.md   rules for translating JS to C#, parity-testing method
docs/PHASE_TASKS.md       concrete task list for Phases 0-2 with acceptance criteria
docs/PROGRESS.md          YOU maintain this: what is done, what is next, decisions made
reference/ponyscapes-js/  the ORIGINAL game (read-only reference + test oracle). Do not edit.
fixtures-tool/            Node script that dumps golden JSON fixtures from the original
fixtures/                 fixtures already generated (rng, noise, world)
Assets/                   the Unity project (copied from unity-skeleton/)
```

## Ground rules

1. **The JS game is the spec.** When behaviour is unclear, read the JS in `reference/ponyscapes-js/public/js/` and the matching `tools/test-*.js`. Never invent mechanics. If the JS is ambiguous or looks buggy, port it faithfully and note it in `docs/PROGRESS.md` under "Quirks".
2. **Sim has no Unity dependency.** Everything in `Assets/Scripts/Sim` (assembly `Ponyscapes.Sim`, `noEngineReferences: true`) must compile without `UnityEngine`. Rendering, input, audio and UI live in `Client`; networking in `Net`; data loading in `Data`. Never reference `Client` from `Sim`.
3. **Determinism.** Use `double` in the sim wherever the JS uses numbers. Port `Math.imul`, `|0` and `>>>` semantics exactly. No `System.Random`, `UnityEngine.Random`, `DateTime.Now` or `Time.time` inside `Sim`: inject an RNG (`Mulberry32`) and the tick counter. Iterate collections in the same order as the JS (insertion order for objects/Maps; use `List` or ordered structures where order matters, not bare `Dictionary` enumeration).
4. **Parity before progress.** A system is not "ported" until a test compares it to a fixture dumped from the original (see `docs/PORTING_CONVENTIONS.md`). Add the fixture section to `fixtures-tool/export-fixtures.js`, regenerate, copy to `Assets/StreamingAssets/fixtures/`, write the EditMode test, run it.
5. **Stable IDs.** Item, pony kind, creature, biome, zone, quest ids and save-data field names stay identical to the JS (old saves must import).
6. **Small steps.** One system (or a handful of closely related files) per commit. Keep tests green. Update `docs/PROGRESS.md` at the end of each session.
7. **Don't repaint art by hand.** Reuse `reference/ponyscapes-js/public/assets/` (items, dungeon rooms, `generated/` atlases + `art-index.json`). Extend `tools/export-art.js` outputs if you need more baked art.
8. **Ask before big forks.** Platform targets, netcode choice, art direction and audio approach are open questions in the roadmap (§6). If the user has not answered them in `docs/PROGRESS.md`, ask; do not guess for those.

## Environment notes

- Unity: **Unity 6 (6000.x)** with Universal Render Pipeline, 2D Renderer. Use the Unity MCP / `unity-cli` skill if available to drive the Editor; otherwise edit files directly and have the user run tests.
- The Node reference tools need Node 18+: `cd reference/ponyscapes-js && node tools/test-genes.js` runs the original's tests (they load the whole shared code headlessly via `tools/headless.js`). `node fixtures-tool/export-fixtures.js` regenerates fixtures.
- The original's browser-only code is `public/js/client`, `net`, `editor`: do not port line by line; use it as a behaviour reference for the Unity client.
- The original has no module system: every file is a top-level `const`/`class` in one shared scope, loaded in the order of `reference/ponyscapes-js/public/index.html`. That load order is also a good dependency order for porting.

## First session (do this in order)

1. **Create the project.** In an empty directory, create a Unity 6 *2D (URP)* project (use the `new-unity-project` skill / `unity-cli`, or ask the user to create it in Unity Hub and open it). Then copy `unity-skeleton/*` into it (merge `Assets/`, add `.gitignore`, `.gitattributes`). Keep this kit's `docs/`, `reference/`, `fixtures-tool/`, `fixtures/` and this file at the project root (outside `Assets/`).
2. **Packages.** Ensure installed: Universal RP, 2D Sprite/Tilemap/Pixel Perfect (`com.unity.2d.*`), Input System, UI Toolkit (built in), Test Framework, Addressables (optional). Later: Netcode for GameObjects, Multiplayer Services (Relay/Lobby), Localization. Use the `unity-package-management` skill to verify ids/versions against the registry; do not guess versions.
3. **Prove the toolchain.** Open the project, let it compile, run EditMode tests. `RngParityTests` (already in the skeleton) must pass. It has not been compiled by anyone yet, so fix any compile error. If the Editor is not available to you, say so and ask the user to run the test.
4. **Do Phase 0-1 tasks** from `docs/PHASE_TASKS.md` (T0.x then T1.x), updating `docs/PROGRESS.md` as you go.
5. **Stop at the end of Phase 1** (or at any open question) and report: what is done, test results, what you propose next.

## Definition of done for any task

- Compiles with no warnings you introduced; assembly boundaries respected.
- Parity test(s) added and passing (Sim work) or a screenshot / Play Mode check described (Client work).
- `docs/PROGRESS.md` updated; change committed with a descriptive message.
