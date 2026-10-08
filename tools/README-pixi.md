# The Pixi renderer (work in progress)

`?renderer=pixi` draws the game with PixiJS 8 (WebGL) instead of the 2D canvas. The canvas renderer stays the default. Game logic
(`js/shared/`) is untouched; only `js/client/render/`, `main.js` (backend choice) and `index.html` (one script tag) know about it.

- `js/client/render/backend.js` - `RenderBackend.prepare(query)` / `create(name, opts)`. Pixi is fetched only when asked for.
- `js/client/render/pixi/pixiRenderer.js` - `PixiRenderer extends Renderer`. Renderer decides what is on screen and in which order;
  the subclass changes how it is put on the screen (`_beginFrame`, `_endFrame`, `blockSink`).
- `public/vendor/pixi/pixi.min.js` - PixiJS **8.8.1** (MIT, copied unmodified from the npm package `pixi.js@8.8.1`). Upgrade by replacing the file.
  No bundler: it is a plain `<script>` added at run time. `tools/bundle.py` (single-file build) does not include it; the bundle is canvas-only.

## Hybrid approach

Most draw code is 2D-canvas calls (`ctx.*`, about 400 sites). Instead of rewriting each, the Pixi backend keeps running it into a transparent
screen-sized canvas ("the layer") that is uploaded as one texture, and moves things out of the layer into sprites stage by stage.

| stage | now Pixi sprites | still in the 2D layer |
|---|---|---|
| 1 | the ground's baked blocks (`TerrainRenderer` blocks) | everything else (water ripples, surf, biome effects, grass, buildings, props, people, lighting, effects) |

## Comparing

```
python3 -m http.server 8123 -d public &
NODE_PATH=/opt/node-tools/node_modules node tools/render-compare.js --out shots            # scenes in tools/render-scenes.js
python3 tools/image-diff.py shots/village-canvas.png shots/village-pixi.png shots/village-diff.png
```

Screenshots run on a virtual clock (30 simulation ticks, fixed `now`), so both renderers draw the same state; a villager who wanders with
`Math.random` can still differ. Timings are measured on a separate free-running page. Headless Chromium has no GPU, so WebGL is software
(SwiftShader): Pixi timings from this harness say little about real devices.
