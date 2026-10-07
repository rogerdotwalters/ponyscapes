# The art pack

The game paints a lot of its pixel art in code (ground cells, creature frames, trees, crops, the village's buildings). Doing that the first
time each picture is needed made start-up slow and caused hitches while walking. `node tools/export-art.js` paints all of the finite,
heavy art once in a headless browser and saves it as PNG atlases in `public/assets/generated/`:

- `art-index.json` — which picture is where (`[atlas, x, y, w, h]`, by the same key the painter uses) and a digest of everything
- `art-<digest>-N.png` — the atlases (about 1.6 MB for all three)

At start `Loader.initial` calls `ArtPack.load()`. Each painter's cache is a `PackedCache` (`js/client/render/artPack.js`): on a miss it asks the
pack first and paints only if the pack has nothing under that key. So **the pack can only ever help**: a missing or partly stale pack means
the old behaviour for those pictures, never a wrong one (keys include everything that changes the picture, e.g. a building's key includes the
ground at the foot of its walls).

## What is in it

| namespace | what | painter |
|---|---|---|
| `terrain` | every ground cell, 6 variants, all seasons, soil, curbs | `PixelTerrain.cell` |
| `creature` | every walk / idle frame of every pixel creature (hunting, stag, shorn) | `PixelCreatures.draw` |
| `prop` | trees (10 looks x every season / biome tint), the stump | `PixelProps.treeArt` |
| `crop` | every crop at every growth stage | `PixelCrops.art` |
| `building` | the village's buildings and wall / tower tiles | `PixelBuildings.art / pieceArt` |

**Not in it** (too many combinations, so still painted live): ponies (about 1,400 coat / mane / mark looks), the player's character and
wardrobe, apple trees (fruit colours), grass clumps, shore waves and ground borders (masks), anything from the content editor.

## Re-exporting

Run it after changing any painter or any data they read (creature or biome tables, building sites, crops, tile size...) and commit the new
files:

```
npm i --no-save playwright        # once (or point NODE_PATH at an install); CHROME_PATH picks a browser binary
npm run art                       # paint, write, then verify every picture against a fresh painting (must report different: 0)
npm run art:check                 # exits 1 if the committed pack is out of date -- for CI
```

What to paint lives in `tools/art-sweeps.js` (the page-side script): add a sweep there when a painter gains a new variant worth shipping.
The export is deterministic: unchanged art gives the same digest and the same files.
