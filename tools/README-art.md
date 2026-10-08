# The art pack

The game paints a lot of its pixel art in code (ground cells, creature frames, trees, crops, the village's buildings, ponies and the player
character). Doing that the first time each picture is needed made start-up slow and caused hitches while walking. `node tools/export-art.js` paints all of the finite,
heavy art once in a headless browser and saves it as PNG atlases in `public/assets/generated/`:

- `art-index.json` — which picture is where (`[atlas, x, y, w, h]`, by the same key the painter uses) and a digest of everything
- `art-<digest>-N.png` — the atlases (about 1.6 MB for all three; about 35 MB once decoded in memory: `ArtPack.stats.atlasMB`, shown in the debug overlay)

At start `Loader.initial` calls `ArtPack.load()`. Each painter's cache is a `PackedCache` (`js/client/render/artPack.js`): on a miss it asks the
pack first and paints only if the pack has nothing under that key. So **the pack can only ever help**: a missing or partly stale pack means
the old behaviour for those pictures, never a wrong one (keys include everything that changes the picture, e.g. a building's key includes the
ground at the foot of its walls).

## What is in it

| namespace | what | painter |
|---|---|---|
| `terrain` | every ground cell, 6 variants, all seasons, soil, curbs | `PixelTerrain.cell` |
| `creature` | every walk / idle frame of every pixel creature (stag, shorn; not the red-eyed "hunting" frames) | `PixelCreatures.draw` |
| `prop` | trees (10 looks x every season / biome tint), the stump | `PixelProps.treeArt` |
| `crop` | every crop at every growth stage | `PixelCrops.art` |
| `building` | the village's buildings and wall / tower tiles | `PixelBuildings.art / pieceArt` |
| `pony` | the SHAPES of every pony frame (see below) | `PixelPony.draw` |
| `char` | the SHAPES of every character frame (see below) | `PixelCharacter.draw` |

### Ponies and characters: shapes saved once, colours applied when built

There are about 1,400 pony colour looks and countless character colour choices, far too many to save. But both painters only ever use the entries
of their palette (coat, mane, mark, hair, skin, outfit...), so the exporter paints each frame ONCE with a stand-in palette whose colours are
markers (`rgb(slot, 254, 254)`: see `SlotArt` in `artPack.js`). Each saved pixel is a marker ("palette slot 7"), a fixed colour (an eye's shine, a
flame) or empty. When a pony or character is built, one pass over a few thousand pixels turns markers into that figure's colours.

- A figure is saved as LAYERS in the order the painter draws them, so what is in front stays in front. A pony has layer A (behind the cutie
  mark), the mark (laid on by the game), layer B (in front of it) and, for frost ponies, C. A character has body, head, hair (back / front),
  cape (behind / front / over) and crown layers, each keyed only by what changes its shape (outfit style, hair style, cape style, crown style...).
- The outline round the whole figure, and a character's red hurt flash, are applied after the layers are joined.
- A frame is about 7x faster to build this way for a pony and about 3x for a character.
- The painters must only use palette entries, never work a colour out themselves (a derived colour belongs in `makePalette` / `palette`). The
  exporter's verification builds every combination both ways (all 1,284 pony looks x frames; all 1,440 body / outfit / hair / crown / cape
  structures in random colours) and fails on any pixel that differs.
- A pony whose colours coincide in a way the painter compares (a pure white coat; a mane colour equal to a wing's) is painted live
  (`liveOnly` in `makePalette`).

**Not in the pack** (too many combinations, or too rare, so still painted live): ponies with an animated biome effect (flames, frost, stars:
20 frames each), the red-eyed "hunting" creature frames, apple trees (fruit colours), grass clumps, shore waves and ground borders (masks),
anything from the content editor.

## Re-exporting

Run it after changing any painter or any data they read (creature or biome tables, building sites, crops, tile size...) and commit the new
files:

```
npm i --no-save playwright        # once (or point NODE_PATH at an install); CHROME_PATH picks a browser binary
npm run art                       # paint, write, then verify every picture against a fresh painting (must report different: 0)
npm run art:check                 # exits 1 if the committed pack is out of date -- for CI
```

What to paint lives in `tools/art-sweeps.js` (the page-side script): add a sweep there when a painter gains a new variant worth shipping (`PONY_FX`
lists the pony effects that are packed; each adds about 2.5 MB of decoded pictures).
The export is deterministic: unchanged art gives the same digest and the same files.
