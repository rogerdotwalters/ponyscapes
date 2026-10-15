#!/usr/bin/env node
/* TOOLS - optimization test for the BROWSER side: opens the game solo in headless Chromium, drops N ponies around the player, and measures the frame
 * rate and the CPU time of render() (and of the whole frame), then CPU-profiles it and lists the hottest functions.
 *   NODE_PATH=/opt/node-tools/node_modules node tools/bench-render.js [--ponies 50] [--secs 6] [--renderer canvas|pixi] [--base http://localhost:8123] [--profile 1] [--owned 1]
 * Needs the game served from ./public (python3 -m http.server 8123 -d public). Headless Chromium has no GPU, so only compare runs with each other. */
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:8123'), N = +arg('ponies', 50), SECS = +arg('secs', 6), renderer = arg('renderer', 'canvas'), profile = arg('profile', '1') === '1', owned = arg('owned', '0') === '1';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${base}/index.html?solo=1&hour=12&renderer=${renderer}`);
  for (let i = 0; i < 400 && !(await page.evaluate(() => !!(window.ponyscapes && window.ponyscapes.renderer))); i++) await page.waitForTimeout(50);
  await page.waitForTimeout(1500);
  const live = await page.evaluate(([n, owned]) => {                                                  // N ponies in a ring in view of the player
    const s = ponyscapes.adapter.server, me = s.players[ponyscapes.game.myId], types = ['pony_plain', 'pony_earth', 'pony_pegasus', 'pony_unicorn'];
    for (const k of Object.keys(s.animals.animals)) if (!s.animals.animals[k].owner) delete s.animals.animals[k];
    for (let i = 0; i < n; i++) { const a = i * 2.399, r = 1.5 + (i % 12) * 0.7, x = me.x + Math.cos(a) * r, y = me.y + Math.sin(a) * r;
      if (owned) s.animals.release(types[i % 4], x, y, me.id, undefined, { level: 1 + (i % 8) }); else s.animals.spawn(types[i % 4], x, y, 0, { level: 1 + (i % 8) }); }
    return Object.keys(s.animals.animals).length;
  }, [N, owned]);
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const res = await page.evaluate(secs => new Promise(res => { const ft = []; let last = performance.now(); const t0 = last;
    const f = now => { ft.push(now - last); last = now; if (now - t0 > secs * 1000) res({ ft, perf: ponyscapes.renderer.perf() }); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), SECS);
  const srt = res.ft.slice(1).sort((a, b) => a - b), avg = srt.reduce((a, b) => a + b, 0) / srt.length;
  console.log(`renderer=${renderer} ponies added=${N} animals live=${live}`);
  console.log(`frames=${srt.length} fps=${(1000 / avg).toFixed(1)} frame ms: avg ${avg.toFixed(1)} p95 ${srt[Math.floor(srt.length * 0.95)].toFixed(1)} max ${srt[srt.length - 1].toFixed(1)}  |  frames over 20 ms: ${srt.filter(x => x > 20).length}`);
  console.log(`render() CPU ms: avg ${res.perf.avg.toFixed(2)} p95 ${res.perf.p95.toFixed(2)} max ${res.perf.max.toFixed(2)}`);
  if (profile) {
    const { profile: p } = await cdp.send('Profiler.stop'), self = {}, byId = new Map(p.nodes.map(n => [n.id, n]));
    const dt = p.timeDeltas; p.samples.forEach((id, i) => { const n = byId.get(id), cf = n.callFrame, k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`; self[k] = (self[k] || 0) + (dt[i] || 0); });
    const total = Object.values(self).reduce((a, b) => a + b, 0);
    console.log('\nhottest functions by SELF time:');
    for (const [k, v] of Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${(100 * v / total).toFixed(1).padStart(5)}%  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
    // who calls the hottest function: its self time split by the nearest callers in game code
    const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const label = cf => `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
    const top = Object.entries(self).sort((a, b) => b[1] - a[1]).find(([k]) => !/idle|program/.test(k))[0], callers = {};
    p.samples.forEach((id, i) => { if (label(byId.get(id).callFrame) !== top) return;
      let q = parent.get(id), chain = []; while (q && chain.length < 4) { const c = byId.get(q).callFrame; if (c.url) chain.push(label(c)); q = parent.get(q); }
      const k = chain.join('  <  '); callers[k] = (callers[k] || 0) + (dt[i] || 0); });
    console.log(`\ncallers of ${top}:`); for (const [k, v] of Object.entries(callers).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  await browser.close();
})();
