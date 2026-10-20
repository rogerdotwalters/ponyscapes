# Porting conventions

## JS -> C# translation rules

| JS | C# |
|---|---|
| `number` | `double` in Sim (use `int` only where the JS clearly uses integers: tile coords, counts, ids) |
| `x \| 0`, `x >>> 0`, `Math.imul` | `unchecked((int)x)`, `(uint)`, `unchecked(a * b)`; port exactly, never "simplify" |
| `Math.floor/round` | `Math.Floor`; `Math.round(x)` is `Math.Floor(x + 0.5)` (NOT `Math.Round`) |
| `%` on negatives | JS and C# both truncate, but `&` masks on negative tile coords rely on two's complement: keep ints |
| `{}` used as a map | `Dictionary<string,T>` plus an insertion-order list when iteration order matters |
| object property bags | classes/structs with explicit fields; keep JS field names (PascalCase for public API is fine, but keep the save-file names via `[JsonProperty]`) |
| `undefined` / `null` | `null` or a nullable; be careful that JS `||` and `??` defaults differ for `0`/`''` |
| arrays of events (`pendingEvents`) | `List<GameEvent>` of small classes with a `Type` string and typed payload |
| closures / callbacks | delegates or small interfaces |
| global singletons (`ItemDB`, `Shops`, `Coins`...) | static classes in Sim that take their data from `Data`'s registries at startup, or injected services; keep call shapes recognisable |
| `Date.now` / `Math.random` | injected clock / RNG |

## Parity testing (the core method)

1. Find the JS function/system and its existing test in `reference/ponyscapes-js/tools/test-*.js`.
2. In `fixtures-tool/export-fixtures.js`, add a section that runs the JS in the headless context (`run(...)`) over inputs that exercise it (several seeds, edge cases, fixed RNG streams) and writes `fixtures/<name>.json`. Prefer plain numbers/strings/arrays.
3. Copy fixtures to `Assets/StreamingAssets/fixtures/` (a small script or a menu item does it).
4. Write an NUnit EditMode test in `Assets/Tests/EditMode` that runs the C# port over the same inputs and asserts **exact** equality (doubles with tolerance 0 first; loosen only with a written justification in PROGRESS.md).
5. For stateful systems, dump a **state hash every N ticks** from scripted inputs (JS: step the `GameServer`; C#: step the port) and compare the hash sequence; on mismatch, bisect by dumping sub-state.

## Data export

`Data` content is declarative: write `tools/export-data.js` (in `fixtures-tool/`) that loads the headless context and serialises each registry (`ItemDB`, ponies, creatures, crops, biomes, zones, NPCs, quests, dungeons...) to `Assets/StreamingAssets/GameData/<registry>.json`. A C# loader parses them into typed models. A validator reports dangling ids.

## Code style

- Namespaces `Ponyscapes.Sim.*`, `Ponyscapes.Data`, `Ponyscapes.Client.*`, `Ponyscapes.Net`.
- One public type per file. XML-doc comment on each ported type naming the source JS file: `/// Port of public/js/shared/world.js`.
- Prefer clarity to cleverness; avoid LINQ and allocations in per-tick paths.
