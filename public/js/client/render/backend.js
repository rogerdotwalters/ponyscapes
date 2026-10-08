'use strict';
/* CLIENT - picks the render backend. A backend is an object with:
 *   camera, resize(), rebuildBuilt(), render(state, frameMs, now)   (what main.js, the loader and the pointer code use)
 *   ready     (optional) a promise that resolves once it can draw
 *   backend   'canvas' | 'pixi'
 * 'canvas' (renderer.js) is the default. ?renderer=pixi selects the Pixi (WebGL) backend: pixi.min.js (vendored, public/vendor/pixi) and
 * pixi/pixiRenderer.js are only fetched then, so the default page does not pay for them. */
const RenderBackend = (() => {
  const PIXI_SCRIPTS = ['vendor/pixi/pixi.min.js', 'js/client/render/pixi/dynamicAtlas.js', 'js/client/render/pixi/canvasRecorder.js', 'js/client/render/pixi/stampCache.js', 'js/client/render/pixi/seeThrough.js', 'js/client/render/pixi/pixiRenderer.js'];
  const loadScript = src => new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
  const nameOf = query => (query && query.get('renderer')) === 'pixi' ? 'pixi' : 'canvas';

  /** Fetch whatever the chosen backend needs (resolves to its name). A backend that fails to load falls back to canvas. */
  async function prepare(query) {
    const name = nameOf(query);
    if (name !== 'pixi') return 'canvas';
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

  function create(name, opts) { return instrument(name === 'pixi' && typeof PixiRenderer !== 'undefined' ? new PixiRenderer(opts) : new Renderer(opts)); }
  return { prepare, create };
})();
