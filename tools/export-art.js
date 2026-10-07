#!/usr/bin/env node
/* Paints the game's heavy, finite art in a headless browser and writes it as PNG atlases (public/assets/generated/art-*.png + art-index.json),
 * which the game loads at start instead of painting the same pictures in code the first time they appear (public/js/client/render/artPack.js).
 *
 *   node tools/export-art.js            export, then check the written pack against the painters
 *   node tools/export-art.js --check    export to memory and fail (exit 1) if the pack on disk is out of date -- run it in CI
 *
 * Needs Playwright with a Chromium (`npm i --no-save playwright`, or NODE_PATH pointing at an install; CHROME_PATH picks a browser binary).
 * The painters in the game do all the drawing, so after changing any art code, re-run this and commit the new files. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');

let playwright;
try { playwright = require('playwright'); } catch (e) { console.error('Playwright is not installed: run `npm i --no-save playwright` (or set NODE_PATH to an install).'); process.exit(2); }

const root = path.resolve(__dirname, '..'), pub = path.join(root, 'public'), outDir = path.join(pub, 'assets', 'generated');
const check = process.argv.includes('--check');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve() {                                        // a tiny static server for public/ (the page loads its scripts from it)
  const server = http.createServer((req, res) => {
    const file = path.join(pub, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(pub) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, url: 'http://127.0.0.1:' + server.address().port })));
}

async function openGame(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems = [];
  page.on('pageerror', e => problems.push(String(e)));
  await page.goto(url + '/index.html');
  await page.waitForFunction(() => typeof PixelCrops !== 'undefined' && typeof TerrainRenderer !== 'undefined' && typeof ArtPack !== 'undefined', null, { timeout: 60000 });
  await page.addScriptTag({ path: path.join(__dirname, 'art-sweeps.js') });
  return { page, problems };
}

(async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  let failed = false;
  try {
    const { page, problems } = await openGame(browser, url);
    const t0 = Date.now();
    const { index, pngs, stats } = await page.evaluate(() => window.__art.exportPack());
    if (problems.length) throw new Error('the game threw while painting: ' + problems[0]);
    console.log(`painted ${stats.entries} pictures (${Object.entries(stats.counts).map(([k, v]) => k + ' ' + v).join(', ')}); ${stats.unique} distinct, ${stats.atlases} atlas(es), ${stats.skipped} skipped, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await page.close();

    const indexFile = path.join(outDir, 'art-index.json'), json = JSON.stringify(index);
    if (check) {
      const old = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : null;
      if (!old || old.digest !== index.digest) { console.error(`art pack is OUT OF DATE (disk ${old ? old.digest : 'none'}, painters ${index.digest}): run node tools/export-art.js and commit public/assets/generated/`); failed = true; }
      else console.log('art pack is up to date (' + index.digest + ')');
    } else {
      fs.mkdirSync(outDir, { recursive: true });
      for (const f of fs.readdirSync(outDir)) if (/^art-.*\.(png|json)$/.test(f)) fs.unlinkSync(path.join(outDir, f));
      index.atlases.forEach((name, i) => fs.writeFileSync(path.join(outDir, name), Buffer.from(pngs[i].split(',')[1], 'base64')));
      fs.writeFileSync(indexFile, json);
      const bytes = index.atlases.reduce((a, n) => a + fs.statSync(path.join(outDir, n)).size, 0);
      console.log(`wrote ${index.atlases.length} PNG(s), ${(bytes / 1024).toFixed(0)} KB, and art-index.json (${(json.length / 1024).toFixed(0)} KB), digest ${index.digest}`);

      // check what was written: load it the way the game does and compare every picture with a fresh painting
      const v = await openGame(browser, url);
      const ok = await v.page.evaluate(() => ArtPack.load());
      if (!ok) throw new Error('the written pack did not load');
      const r = await v.page.evaluate(() => window.__art.verify());
      console.log('verify:', JSON.stringify(r));
      if (r.missing || r.different || r.wrongSize) { console.error('the pack does not match the painters'); failed = true; }
      await v.page.close();
    }
  } finally { await browser.close(); server.close(); }
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
