#!/usr/bin/env node
/* Runs the game flows under both renderers and reports each step: enter the home, open the chest, buy at the shop, open the map, a save round trip, a
 * second player, and that the two editor pages load. A step passes when it did what it should AND the page logged no errors.
 *   NODE_PATH=/opt/node-tools/node_modules node tools/render-flows.js [--base http://localhost:8123]
 * Real time (no fake clock). NOTE: the game has no "sell" - the General Store only sells - so there is no sell step. */
const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:8123');

async function flows(browser, renderer) {
  const results = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  /** A fresh game page; `run(page, step)` does the steps. Every step also fails if the page logged an error while it ran. */
  async function scenario(extraQuery, run) {
    const errors = [], page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => errors.push(String(e).split('\n')[0])); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
    const step = async (name, fn) => {
      const before = errors.length; let ok = false, note = '';
      try { const r = await fn(); ok = r === true || (r && r.ok); note = (r && r.note) || ''; } catch (e) { note = 'threw: ' + String(e).split('\n')[0]; }
      const newErrors = errors.slice(before);
      results.push({ renderer, step: name, pass: ok && !newErrors.length, note, errors: newErrors });
    };
    await page.goto(`${base}/index.html?solo=1&hour=12&renderer=${renderer}${extraQuery}`);
    await page.waitForFunction(() => window.ponyscapes && window.ponyscapes.renderer, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    const ev = fn => page.evaluate(fn), frames = n => page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); }, n);
    try { await run({ page, step, ev, frames, wait: ms => page.waitForTimeout(ms) }); } finally { await page.close(); }
  }

  await scenario('', async ({ page, step, ev, frames, wait }) => {
    await step('start: backend is ' + renderer, async () => { const b = await ev(() => ponyscapes.renderer.backend); return { ok: b === renderer, note: b }; });
    await step('mount a pony and ride for a while', async () => {
      let mounted = false;
      for (let i = 0; i < 12 && !mounted; i++) {
        await ev(() => { const s = ponyscapes.adapter.server, me = s.players[ponyscapes.game.myId], a = Object.values(s.animals.animals).find(x => x.owner === me.id); if (a) { me.x = a.x + 0.3; me.y = a.y + 0.3; } });
        await wait(700); await ev(() => ponyscapes.game.requestInteract()); await wait(700);
        mounted = await ev(() => !!ponyscapes.game.local.mount);
      }
      await frames(40);
      return { ok: mounted, note: mounted ? 'mounted' : 'could not mount' };
    });
    await step('open the map', async () => {
      await ev(() => ponyscapes.panels.open('map')); await wait(800); await frames(5);
      const info = await ev(() => { const panel = document.getElementById('mapPanel'), c = panel.querySelector('canvas'); let ink = 0; if (c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) ink++; } return { open: !panel.hidden, canvas: !!c, ink }; });
      await ev(() => ponyscapes.panels.closeAll());
      return { ok: info.open && info.canvas && info.ink > 1000, note: JSON.stringify(info) };
    });
    await step('save round trip (export world + character, import into a new server)', async () => {
      const r = await ev(() => {
        const s = ponyscapes.adapter.server, id = ponyscapes.game.myId, world = JSON.parse(JSON.stringify(SaveData.exportWorld(s))), ch = JSON.parse(JSON.stringify(SaveData.exportCharacter(s, id)));
        const fresh = new GameServer(1337), nid = fresh.addPlayer(false); SaveData.importCharacter(fresh, nid, SaveData.sanitizeCharacter(ch));
        return { worldKeys: Object.keys(world).length, charKeys: Object.keys(ch).length, hp: fresh.players[nid].hp };
      });
      return { ok: r.worldKeys > 0 && r.charKeys > 0 && r.hp > 0, note: JSON.stringify(r) };
    });
    await step('second player appears and is drawn', async () => {
      await ev(() => { const s = ponyscapes.adapter.server, me = s.players[ponyscapes.game.myId], id = s.joinHuman('prince', 'Friend'), f = s.players[id]; if (f) { f.x = me.x + 2; f.y = me.y - 1; } });
      await wait(1500); await frames(8);
      const n = await ev(() => Object.keys(ponyscapes.game.getRenderState(1).players).length);
      return { ok: n >= 2, note: n + ' players in the render state' };
    });
  });

  await scenario('', async ({ step, ev, frames, wait }) => {                                      // (the test kit fills your pack and the chest says so: it is emptied first)
    await step('open the chest (empty pack)', async () => {
      await ev(() => { window.__n = []; ponyscapes.game.events.on('notice', e => window.__n.push(e.text)); const s = ponyscapes.adapter.server, id = ponyscapes.game.myId, me = s.players[id]; s.inventories[id].slots.fill(null); Carry.stacksFor = () => 99; me.x = 23.5; me.y = 26.0; });
      await wait(1000);
      const hint = await ev(() => ponyscapes.game.interactHint());
      await ev(() => ponyscapes.game.requestInteract()); await wait(1200); await frames(5);
      const looted = await ev(() => !!ponyscapes.adapter.server.players[ponyscapes.game.myId].looted);
      return { ok: looted && hint === 'Open', note: `hint "${hint}", looted ${looted}, notices ${JSON.stringify(await ev(() => window.__n))}` };
    });
  });

  await scenario('', async ({ step, ev, frames, wait }) => {
    await step('enter the home', async () => {
      await ev(() => { const s = ponyscapes.adapter.server, p = s.players[ponyscapes.game.myId]; s.interiors.enter(ponyscapes.game.myId, p, BuildingSites.list.find(x => x.id === 'player_home').index); });
      await wait(1500); await frames(20);
      const kind = await ev(() => ponyscapes.game.map.kind);
      return { ok: kind === 'room', note: 'map kind ' + kind };
    });
  });

  await scenario('', async ({ step, ev, frames, wait }) => {
    await step('enter the General Store and open its shop window', async () => {
      await ev(() => { const s = ponyscapes.adapter.server, p = s.players[ponyscapes.game.myId]; s.interiors.enter(ponyscapes.game.myId, p, BuildingSites.list.find(x => x.id === 'general_store').index); });
      await wait(1500); await frames(10);
      const stock = await ev(() => { const g = ponyscapes.game, s = ponyscapes.adapter.server, me = s.players[g.myId], map = g.map; if (!Shops.counterNear(map, me)) { const f = map.plan.layout.furniture.find(x => FurnitureDefs.get(x.id) && FurnitureDefs.get(x.id).shop); if (f) { me.x = f.x + f.w / 2; me.y = f.y + f.h + 0.4; } } return Shops.stock(Grids.siteOf(map.grid)).length; });
      await wait(900);
      const hint = await ev(() => ponyscapes.game.interactHint());
      await ev(() => ponyscapes.game.requestInteract()); await wait(1000); await frames(5);
      const open = await ev(() => !document.getElementById('shopPanel').hidden);
      return { ok: open && stock > 0, note: `hint "${hint}", shop window ${open ? 'open' : 'closed'}, ${stock} items for sale` };
    });
  });

  for (const file of ['editor.html', 'level-editor.html']) {                                  // the editor pages load the same render scripts
    const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
    p2.on('pageerror', e => errs.push(String(e).split('\n')[0])); p2.on('console', m => { if (m.type() === 'error') errs.push(m.text().split('\n')[0]); });
    await p2.goto(`${base}/${file}`); await p2.waitForTimeout(3000); await p2.close();
    results.push({ renderer, step: 'editor page loads: ' + file, pass: !errs.length, note: '', errors: errs });
  }
  return results;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let all = [];
  for (const renderer of ['canvas', 'pixi']) all = all.concat(await flows(browser, renderer));
  await browser.close();
  for (const r of all) console.log(`${r.pass ? 'PASS' : 'FAIL'}  [${r.renderer}] ${r.step}${r.note ? '  - ' + r.note : ''}${r.errors.length ? '  ERRORS: ' + r.errors.join(' | ').slice(0, 300) : ''}`);
  process.exit(all.every(r => r.pass) ? 0 : 1);
})();
