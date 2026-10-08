#!/usr/bin/env node
/* Screenshots scenes under both renderers (headless Chromium) and reports render time / FPS.
 *   NODE_PATH=/opt/node-tools/node_modules node tools/render-compare.js [--base http://localhost:8123] [--out dir] [--scene name] [--w 1280 --h 720] [--bench 0]
 * Needs the game served from ./public (python3 -m http.server 8123 -d public). Then: python3 tools/image-diff.py <out>/x-canvas.png <out>/x-pixi.png
 * The diffable image is the game's canvas read back from a page on Playwright's fake clock with a seeded Math.random, drawn with a fixed `now`, so
 * both renderers draw the same world state. FPS / CPU time are measured on a separate real-time page, which also gives the *-full.png screenshot.
 * NOTE: headless Chromium has no GPU: WebGL runs in software (SwiftShader), so the Pixi numbers are NOT what a real device would see. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:8123'), out = arg('out', 'shots'), only = arg('scene', ''), bench = arg('bench', '1') === '1', shots = arg('shots', '1') === '1';
const W = +arg('w', 1280), H = +arg('h', 720);
const SCENES = require('./render-scenes.js');

const SEEDED_RANDOM = () => {                       // the same "random" numbers in every page
  let a = 12345; window.__reseed = v => { a = v; };    // (the renderers' particles draw random numbers too: scenes reseed before stepping the world)
  Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

/** Opens a scene. With `fake` the page runs on Playwright's fake clock (timers, rAF and performance.now are virtual), so both renderers see the same
 *  simulation; `runFor` then advances it. Else the page runs in real time (for FPS). */
async function open(browser, renderer, sc, fake) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: sc.dpr || 1 });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(SEEDED_RANDOM);
  if (fake) await page.clock.install({ time: 0 });
  await page.goto(`${base}/index.html?${sc.query}&renderer=${renderer}${sc.seethrough ? '' : '&seethrough=0'}`);
  for (let i = 0; i < 400 && !(await page.evaluate(() => !!(window.ponyscapes && window.ponyscapes.renderer))); i++) { if (fake) await page.clock.runFor(50); await page.waitForTimeout(50); }
  if (fake) { await page.clock.runFor(1500); await page.waitForTimeout(100); }                  // (the local server's own timer stalls on the fake clock: scenes step it by hand, see render-scenes.js)
  if (sc.setup) await sc.setup(page, !!fake);
  return { page, errors };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results = [];
  for (const [name, sc] of Object.entries(SCENES)) {
    if (only && only !== name) continue;
    for (const renderer of ['canvas', 'pixi']) {
      const row = { scene: name, renderer };
      if (shots) { const { page, errors } = await open(browser, renderer, sc, true);                    // the deterministic frame: the game's canvas, read back right after drawing
        const png = await page.evaluate(() => { const { game, renderer } = window.ponyscapes; renderer.camera.initialised = false; for (let i = 0; i < 40; i++) renderer.render(game.getRenderState(1), 16, 5000); window.__cam = [renderer.camera.x, renderer.camera.y, renderer.camera.scale]; return document.getElementById('game').toDataURL('image/png'); });
        row.camera = await page.evaluate(() => window.__cam);   // (40 draws: bakes everything, settles the camera)
        fs.writeFileSync(path.join(out, `${name}-${renderer}.png`), Buffer.from(png.split(',')[1], 'base64')); row.errors = errors; await page.close(); }
      if (bench) { const { page, errors } = await open(browser, renderer, sc, false);        // the timings
        await page.waitForTimeout(5000);
        await page.screenshot({ path: path.join(out, `${name}-${renderer}-full.png`) });                  // (real time: not diffable, but what a player sees, UI included)
        row.fps = await page.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 3000) res(n / ((performance.now() - t0) / 1000)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
        const perf = await page.evaluate(() => window.ponyscapes.renderer.perf());
        row.fps = +row.fps.toFixed(1); row.cpuMsAvg = +perf.avg.toFixed(2); row.cpuMsP95 = +perf.p95.toFixed(2); row.errors = row.errors.concat(errors); await page.close(); }
      results.push(row);
    }
  }
  await browser.close();
  console.log(JSON.stringify(results));
})();
