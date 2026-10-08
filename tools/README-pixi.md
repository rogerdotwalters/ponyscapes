# The Pixi renderer

**PixiJS 8 (WebGL) is the default renderer.** The 2D-canvas renderer is retired but kept: `?renderer=canvas` selects it, and the game uses it automatically
when WebGL is not available, when the Pixi scripts cannot be loaded (the single-file bundle of `tools/bundle.py` does not include Pixi), or if Pixi fails
to start (the page then reloads once with `?renderer=canvas`). It cannot simply be deleted: `PixiRenderer extends Renderer` (`renderer.js`) and uses its
logic for what is visible and in what order. Game logic (`js/shared/`) is untouched; only `js/client/render/`, `main.js` (backend choice) and `index.html`
(one script tag) know about the backends.

- `js/client/render/backend.js` - `RenderBackend.prepare(query)` / `create(name, opts)`. The Pixi scripts are fetched at start (about 680 KB for Pixi itself).
- `public/vendor/pixi/pixi.min.js` - PixiJS **8.8.1** (MIT, copied unmodified from the npm package `pixi.js@8.8.1`). Upgrade by replacing the file. No bundler.
- `js/client/render/pixi/` - the backend.
- `?seethrough=0` turns the see-through effect off (the canvas backend has none; use it for pixel comparisons).

## How it works (the hybrid)

Most draw code is 2D-canvas calls (about 400 sites). Instead of rewriting each one, the Pixi backend **records** what an item's existing draw code
does, turns the recording into a cached texture, and puts the texture in the scene as a sprite, in the same depth order as before.

```
terrain blocks (sprites) -> ground layer (2D canvas texture: water ripples, surf, biome details, interior floors, farm soil ...)
  -> grass, tap marker, depth-sorted items (sprites) -> building names (sprites) -> night (render texture) -> particles + floating text -> overlay layer (2D canvas, normally empty)
```

| piece | file | what it does |
|---|---|---|
| `PixiRenderer` | `pixiRenderer.js` | `extends Renderer`: Renderer still decides what is visible and in which order; this class puts it on screen. Same camera maths, nearest-neighbour textures, whole-pixel placement. Off-screen items are skipped. |
| `CanvasRecorder` | `canvasRecorder.js` | A stand-in for `CanvasRenderingContext2D` that records calls, hashes them **relative to the item's anchor** (so identical-looking items share one picture) and tracks the bounding box. `figure()` / `cut()` split a recording (see below). Unsupported calls throw, so a gap is loud. |
| `StampCache` | `stampCache.js` | Replays a new recording once onto a shelf-packed texture page at the camera's scale. Things that stand still are painted at their exact sub-pixel phase (so building slices meet without seams at non-integer zoom); things that move are anchored on a whole device pixel and hashed coarsely. Pages are capped and recycled. |
| `DynamicAtlas` | `dynamicAtlas.js` | Packs grass clumps and marker frames (small pictures from the canvas painters) into shared textures. |
| `PaletteSwap` | `paletteFilter.js` | The palette-swap filter. Ponies and characters stay in the art pack's **marker colours** (`rgb(slot,254,254)`; outline and cutie mark included) as one texture per frame, shared by every figure; a 256x1 texture holds each figure's real colours. Also the red hurt flash. |
| `SeeThrough` | `seeThrough.js` | New effect (the canvas backend has none): buildings and built walls in front of the player, overlapping them, fade out softly in an ellipse round the player. A filter on just those sprites. |
| `PixiLighting` | `pixiLighting.js` | Day / night / torch and lamp pools: a render texture filled with the night colour with soft sprites drawn into it with the `erase` blend, plus additive glows. Same numbers as `lighting.js`. |

**Figures.** `PixelPony.draw` / `PixelCharacter.draw` check `ctx.figureOk()`; under the recorder they call `ctx.figure(...)` with the marker frame and the
palette instead of `drawImage`. The recorder splits the item there (what was drawn before, the figure, what follows), so shadows, tags and effects still
draw around the figure in order. Under a real canvas those methods do not exist and the old path runs unchanged. A pony painted live (`liveOnly`), a
frame missing from the art pack or a character with a missing layer simply takes the old (recorded) path.

**`ctx.cut()`** (hearts, want bubbles, speech bubbles, emotes) puts things that change every frame into their own small picture, so the thing they hang on is not re-painted.

## What is native Pixi, what is still 2D-canvas

| | |
|---|---|
| Pixi sprites / filters / render textures | terrain blocks, grass, all depth-sorted items (buildings, props, furniture, rooms, crops, drops, people, NPCs, creatures, ponies, boats), pony / character recolouring, see-through, building names, tap marker, build ghost, night lighting, particles, floating text, arrows, lassos |
| still drawn by the 2D canvas code, uploaded as a texture each frame **only if anything was painted** | the ground layer's *live* tile parts: water ripples, shore waves (cached pictures, but placed per tile), biome details (petals, embers, ...), ring barriers, interior floors, tilled soil, built floors |
| inside item recordings (cached, drawn by the canvas code once per distinct picture) | everything an item paints with vector calls |

"Cached at load time" is really **cached on first use**: pictures like grass clumps, shore waves and apple trees depend on far too many combinations to
make all at load; each is made once, the first time it is seen, and kept.

There is **no weather system** in the game (the word appears only in comments), so there is nothing to port for weather.

## Known differences from the canvas backend

- Pictures are placed on whole device pixels (the canvas backend draws at fractional positions); at a zoom that is not a whole number some pixel rows
  therefore differ by one. Typical full-frame difference is 0.2 - 1 % of pixels (see `render-compare.js`).
- Anti-aliased edges that the canvas backend draws where a picture meets a fractional boundary are hard-edged in Pixi.
- Rider / pony depth: the rider is drawn in front of the pony it sits on in both backends. (The far legs of a pony in profile are drawn behind its body by
  the pony painter itself, in both.) No other rule exists in the code; none was added.
- The 2D ground layer is above the terrain blocks and below the grass (the canvas backend draws terrain, live tiles, grass in one pass: same order).

## Comparing and testing

```
python3 -m http.server 8123 -d public &
export NODE_PATH=/opt/node-tools/node_modules
node tools/render-compare.js --out shots                  # every scene in tools/render-scenes.js, both renderers (+ FPS / CPU time; --bench 0 / --shots 0 to skip one)
python3 tools/image-diff.py shots/village-canvas.png shots/village-pixi.png shots/village-diff.png
node tools/render-flows.js                                # enter the home, open the chest, shop window, map, save round trip, second player, editor pages
```

The comparison frames are deterministic: Playwright's fake clock, a seeded `Math.random`, the local server stepped by hand, camera and rider fixed.
Timings are measured on a separate real-time page. **Headless Chromium has no GPU, so WebGL runs in software (SwiftShader): the Pixi numbers from this
harness say little about real devices** (and the canvas numbers are CPU-only too).

## Measured (headless Chromium, software WebGL, 1280x720; not representative of real devices)

| scene | canvas FPS / JS ms per render | pixi FPS / JS ms per render | pixel difference (canvas vs pixi) |
|---|---|---|---|
| village | 8.6 / 16.7 | 7.0 / 19.9 | 0.24 % |
| night | 6.7 / 23.5 | 3.9 / 25.3 | 0.19 % |
| home | 2.4 / 16.1 | 2.8 / 15.0 | 0.15 % |
| two players | 10.3 / 15.2 | 5.9 / 19.6 | 0.33 % |

Riding in the four directions and flying: 0.77 - 0.89 %. These show no speed-up in this environment (everything is software-rendered, and the Pixi path still
runs the item draw code in JS every frame to hash it); whether a real GPU is faster is **not measured**.
