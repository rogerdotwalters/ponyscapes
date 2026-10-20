# Ponyscapes → Unity port kit

Everything needed to start porting Ponyscapes to Unity with Claude Code.

## What is in the box
| Path | What |
|---|---|
| `CLAUDE.md` | Instructions Claude reads first in the Unity project |
| `docs/` | Roadmap, architecture/source map, porting conventions, Phase 0-2 tasks, progress log |
| `reference/ponyscapes-js/` | The original game's source, art assets and Node tests (read-only reference and parity oracle) |
| `fixtures-tool/export-fixtures.js` | Dumps golden fixtures (RNG, noise, world tiles) from the original |
| `fixtures/` | Fixtures already generated |
| `unity-skeleton/` | Assembly definitions, a first C# port (`Mulberry32`) with its parity test, `.gitignore`, `.gitattributes` (Git LFS for art/audio) |

## Quick start
1. Create a new Unity 6 **2D (URP)** project (Unity Hub), or let Claude do it with the `new-unity-project` skill.
2. Copy this kit's contents into the project root so `CLAUDE.md`, `docs/`, `reference/`, `fixtures-tool/`, `fixtures/` sit beside `Assets/`; then merge `unity-skeleton/` into the project (its `Assets/` into yours, plus `.gitignore` and `.gitattributes`). Then copy `fixtures/rng.json` etc. into `Assets/StreamingAssets/fixtures/`.
3. `git init`, commit, then start Claude Code in the project root: *"Read CLAUDE.md and begin the first session."*
4. Check the original runs on your machine: `cd reference/ponyscapes-js && node tools/test-genes.js` (Node 18+).

## Caveats
- `Mulberry32.cs` and its test were written without a C# compiler available and have never been compiled or run. Claude's first job (T0.3) is to make them pass.
- The fixtures are regenerated from `reference/` so they stay in sync if you update the reference.
- Open questions (platforms, art, audio, web build) are listed in `docs/ROADMAP.md` §6 and tracked in `docs/PROGRESS.md`; Claude is told to ask rather than guess.
