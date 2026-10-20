'use strict';
/* CLIENT (Pixi backend) - the palette swap. Ponies and characters are saved in the art pack as shapes in MARKER colours (rgb(slot, 254, 254): see
 * SlotArt in artPack.js). The Pixi backend keeps a frame in those colours (one texture shared by every pony or character) and a small 256 x 1
 * texture, the figure's palette, holds the real colour of each slot; this filter looks each marker up in it. Colours that are not markers (an eye's
 * shine, a flame) pass through. `wash` is the red hurt flash (a character's `hurt`): the canvas path washes every pixel of the figure the same way.
 * One filter object (and palette texture) per figure palette, kept until it has been unused for a while. */
const PaletteSwap = (() => {
  const FRAGMENT = `
    precision highp float;
    in vec2 vTextureCoord;
    out vec4 finalColor;
    uniform sampler2D uTexture;
    uniform highp vec4 uInputSize;
    uniform sampler2D uPalette;
    uniform float uWash;
    void main(void) {
      vec4 c = texture(uTexture, (floor(vTextureCoord * uInputSize.xy) + 0.5) * uInputSize.zw);   // (the centre of the texel: the figure's pixels stay hard-edged)
      if (c.a > 0.99 && abs(c.g - 0.99608) < 0.003 && abs(c.b - 0.99608) < 0.003) {
        c = texture(uPalette, vec2((floor(c.r * 255.0 + 0.5) + 0.5) / 256.0, 0.5));
      }
      if (uWash > 0.0) c.rgb = c.rgb * (1.0 - uWash) + vec3(1.0, 0.1569, 0.1569) * c.a * uWash;
      finalColor = c;
    }`;

  const cache = new Map();                                                                         // key -> { filter, texture, used }
  let frame = 0;

  /** The filter for a palette. `make()` gives the 256 colours as a Uint32Array of ABGR pixels (SlotArt.lutOf), only called for a palette not seen. */
  function filterFor(key, make, wash) {
    const k = key + (wash ? '|w' : '');
    let e = cache.get(k);
    if (!e) {
      const bytes = new Uint8Array(make().buffer.slice(0));                                       // (ABGR words in little-endian memory are R, G, B, A bytes)
      const source = new PIXI.BufferImageSource({ resource: bytes, width: 256, height: 1, format: 'rgba8unorm', scaleMode: 'nearest', autoGenerateMipmaps: false });
      const filter = new PIXI.Filter({
        glProgram: PIXI.GlProgram.from({ vertex: PIXI.defaultFilterVert, fragment: FRAGMENT, name: 'palette-swap' }),
        resources: { uPalette: source, paletteUniforms: { uWash: { value: wash ? 0.55 : 0, type: 'f32' } } },
        resolution: 1, antialias: 'off',
      });
      e = { filter, source, used: frame }; cache.set(k, e);
      if (cache.size > 600) sweep();
    }
    e.used = frame; return e.filter;
  }

  /** Forget palettes not used for ~10 s (called when the cache is large). */
  function sweep() {
    for (const [k, e] of cache) if (frame - e.used > 600) { e.filter.destroy(); e.source.destroy(); cache.delete(k); }
  }

  return { filterFor, tick() { frame++; }, size: () => cache.size };
})();
