#!/usr/bin/env node
/* Screenshots scenes under both renderers (headless Chromium) and reports render time / FPS.
 *   NODE_PATH=/opt/node-tools/node_modules node tools/render-compare.js [--base http://localhost:8123] [--out dir] [--scene name] [--w 1280 --h 720] [--bench 0]
 * Needs the game served from ./public (python3 -m http.server 8123 -d public). Then: python3 tools/image-diff.py <out>/x-canvas.png <out>/x-pixi.png
 * Screenshots are deterministic: requestAnimationFrame runs on a virtual 60 Hz clock and stops after 30 simulation ticks, then the frame is drawn
 * again with a fixed `now`, so both renderers draw the same world state. FPS / CPU time are measured on a separate, free-running page.
 * NOTE: headless Chromium has no GPU: WebGL runs in software (SwiftShader), so the Pixi numbers are NOT what a real device would see. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:8123'), out = arg('out', 'shots'), only = arg('scene', ''), bench = arg('bench', '1') === '1';
const W = +arg('w', 1280), H = +arg('h', 720);
const SCENES = require('./render-scenes.js');

const VIRTUAL_TIME = () => {                       // runs before the page's own scripts
  let vt = 0, t0;
  const real = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => real(() => {
    const p = window.ponyscapes;
    if (p && t0 === undefined) t0 = p.game.clockTick;
    if (t0 !== undefined && p.game.clockTick >= t0 + 30) { window.__frozen = true; return; }
    vt += 1000 / 60; cb(vt);
  });
};

async function open(browser, renderer, sc, virtual) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: sc.dpr || 1 });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (virtual) await page.addInitScript(VIRTUAL_TIME);
  await page.goto(`${base}/index.html?${sc.query}&renderer=${renderer}`);
  await page.waitForFunction(() => window.ponyscapes && window.ponyscapes.renderer, null, { timeout: 60000, polling: 100 });
  if (sc.setup) await page.evaluate(sc.setup);
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
      { const { page, errors } = await open(browser, renderer, sc, true);                    // the screenshot
        await page.waitForFunction(() => window.__frozen, null, { timeout: 120000, polling: 100 });
        await page.evaluate(() => { const { game, renderer } = window.ponyscapes; for (let i = 0; i < 40; i++) renderer.render(game.getRenderState(1), 16, 5000); });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(out, `${name}-${renderer}.png`) }); row.errors = errors; await page.close(); }
      if (bench) { const { page, errors } = await open(browser, renderer, sc, false);        // the timings
        await page.waitForTimeout(5000);
        row.fps = await page.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 3000) res(n / ((performance.now() - t0) / 1000)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
        const perf = await page.evaluate(() => window.ponyscapes.renderer.perf());
        row.fps = +row.fps.toFixed(1); row.cpuMsAvg = +perf.avg.toFixed(2); row.cpuMsP95 = +perf.p95.toFixed(2); row.errors = row.errors.concat(errors); await page.close(); }
      results.push(row);
    }
  }
  await browser.close();
  console.log(JSON.stringify(results));
})();
