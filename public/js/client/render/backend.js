'use strict';
/* CLIENT - picks the render backend. A backend is an object with:
 *   camera, resize(), rebuildBuilt(), render(state, frameMs, now)   (what main.js, the loader and the pointer code use)
 *   ready     (optional) a promise that resolves once it can draw
 *   backend   'canvas' | 'pixi'
 * 'pixi' (pixi/pixiRenderer.js, PixiJS 8 in public/vendor/pixi) is the DEFAULT. 'canvas' (renderer.js) is the retired path, kept because the Pixi
 * backend extends its Renderer class, and as the fallback: ?renderer=canvas asks for it, and it is used automatically when WebGL is not available
 * or the Pixi scripts cannot be loaded (for example in the single-file bundle of tools/bundle.py, which does not include Pixi). */
const RenderBackend = (() => {
  const PIXI_SCRIPTS = ['vendor/pixi/pixi.min.js', 'js/client/render/pixi/dynamicAtlas.js', 'js/client/render/pixi/canvasRecorder.js', 'js/client/render/pixi/stampCache.js', 'js/client/render/pixi/seeThrough.js', 'js/client/render/pixi/paletteFilter.js', 'js/client/render/pixi/pixiLighting.js', 'js/client/render/pixi/pixiRenderer.js'];
  const loadScript = src => new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
  const wanted = query => (query && query.get('renderer')) === 'canvas' ? 'canvas' : 'pixi';
  const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };

  /** Fetch whatever the chosen backend needs (resolves to the name of the backend to use). */
  async function prepare(query) {
    if (wanted(query) === 'canvas') return 'canvas';
    if (!hasWebGL()) { console.warn('WebGL is not available: using the canvas renderer'); return 'canvas'; }
    try { for (const src of PIXI_SCRIPTS) await loadScript(src); return 'pixi'; }
    catch (e) { console.error('Pixi renderer unavailable, using canvas:', e); return 'canvas'; }
  }

  /** Keeps the CPU time of the last 240 render() calls (ms): renderer.perf() -> { avg, p95, max, n }. */
  function instrument(r) {
    const ring = []; const inner = r.render.bind(r);
    r.render = (state, frameMs, now) => { const t0 = performance.now(); inner(state, frameMs, now); ring.push(performance.now() - t0); if (ring.length > 240) ring.shift(); };
    r.perf = () => {
      if (!ring.length) return { avg: 0, p95: 0, max: 0, n: 0 };
      const s = ring.slice().sort((a, b) => a - b);
      return { avg: ring.reduce((a, b) => a + b, 0) / ring.length, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], n: ring.length };
    };
    return r;
  }

  function create(name, opts) {
    if (name !== 'pixi' || typeof PixiRenderer === 'undefined') return instrument(new Renderer(opts));
    const r = instrument(new PixiRenderer(opts));
    r.ready.catch(e => {                                                                          // Pixi could not start (the page's canvas now has a WebGL context, so it cannot be drawn on with 2D): reload with the canvas renderer
      console.error('Pixi renderer failed to start, reloading with the canvas renderer:', e);
      const q = new URLSearchParams(location.search); q.set('renderer', 'canvas'); location.replace(location.pathname + '?' + q);
    });
    return r;
  }
  return { prepare, create };
})();
