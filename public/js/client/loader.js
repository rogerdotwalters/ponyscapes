'use strict';
/* CLIENT - loading. Three stages, so moving about never waits for something to be made:
 *   1. the PAGE: index.html shows the small loading screen (#loading) while the game's scripts arrive (they are `defer`red);
 *   2. the START (Loader.initial): before play steps in, the land around the character is built, the ground around them is painted
 *      (TerrainRenderer's ground blocks), everything they hold, wear and carry has its pictures loaded, the village's buildings are painted
 *      (pixelBuildings.js: too slow to make while you walk), and the scene is drawn once so every sprite
 *      on screen is ready;
 *   3. PLAYING (Loader.background): everything else is loaded in small slices when the browser is idle: every other item's picture, your own
 *      artwork (editor.html), each creature's frames, the ground of every biome, the ground a little farther out, and the late scripts
 *      (<meta name="lazy-script"> in index.html: the smooth fallback creature drawings). */
const Loader = (() => {
  const root = () => document.getElementById('loading');
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

  /** The loading screen: a line of text and a bar (fraction 0..1, or null for no bar). */
  function show(text, fraction = null) {
    const el = root(); if (!el) return;
    el.hidden = false;
    el.querySelector('.ldText').textContent = text;
    const bar = el.querySelector('.ldBar'); bar.hidden = fraction === null;
    if (fraction !== null) bar.firstElementChild.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
  }
  function hide() { const el = root(); if (el) el.hidden = true; }

  /** Resolves when a picture has loaded (or failed, or `ms` passed): a missing picture never holds up the game. Also starts it in the SpriteRegistry. */
  function picture(src, ms = 5000) {
    if (typeof src !== 'string' || !src) return Promise.resolve();
    SpriteRegistry.image(src);
    return new Promise(res => {
      const img = new Image(), done = () => res(); const t = setTimeout(done, ms);
      img.onload = img.onerror = () => { clearTimeout(t); done(); };
      img.src = src;
    });
  }
  /** Every picture an item can show: its icon, and your own held / ground / placed / worn images (editor.html). */
  function itemPictures(id) {
    const def = ItemDefs[id]; if (!def) return [];
    const out = [ItemIcons.url(id)], s = ContentPack.isPlain(def.sprites) ? def.sprites : null;
    if (s) {
      for (const k of ['icon', 'held', 'ground', 'placed']) if (typeof s[k] === 'string') out.push(s[k]);
      if (ContentPack.isPlain(s.worn)) for (const d of SpriteRegistry.DIRS) if (typeof s.worn[d] === 'string') out.push(s.worn[d]);
    }
    return out;
  }
  /** A sprite set's pictures (creatures, characters): its four directions, and a pony variety's own sets. */
  function setPictures(set) {
    if (!ContentPack.isPlain(set)) return [];
    const out = SpriteRegistry.DIRS.map(d => set[d]).filter(v => typeof v === 'string');
    if (ContentPack.isPlain(set.variants)) for (const v of Object.values(set.variants)) out.push(...setPictures(v));
    return out;
  }
  /** What the player starts with: the tool belt and bag, their pony's pack, and what they wear. */
  function startingItems(game) {
    const ids = new Set();
    for (const s of (game.inventory && game.inventory.slots) || []) if (s) ids.add(s.id);
    for (const s of (game.pack && game.pack.inventory && game.pack.inventory.slots) || []) if (s) ids.add(s.id);
    for (const id of Object.values(game.gear || {})) if (typeof id === 'string' && id) ids.add(id);
    return [...ids];
  }

  /** Stage 2: everything needed before play steps in. */
  async function initial({ game, renderer }) {
    const steps = 4;
    show('Building the land around you...', 0); await nextFrame();
    game.map.ensureAround(game.local.x, game.local.y, CLIENT_STREAM_RADIUS + 1);

    show('Painting the ground...', 1 / steps); await nextFrame();
    renderer.render(game.getRenderState(1), 16, performance.now());                  // (places the camera on the character)
    const view = renderer.camera.bounds();
    let left = Infinity, total = 0;
    while (left > 0) {
      left = TerrainRenderer.load(game.map, view, 4); total = Math.max(total, left + 4);
      show('Painting the ground...', (1 + (1 - left / Math.max(1, total))) / steps); await nextFrame();
    }

    show('Unpacking your things...', 2 / steps); await nextFrame();
    const pics = [];
    for (const id of startingItems(game)) pics.push(...itemPictures(id));
    for (const body of ['prince', 'princess']) pics.push(...setPictures(ContentPack.character(body)));
    let loaded = 0;
    await Promise.all(pics.map(src => picture(src).then(() => { loaded++; show('Unpacking your things...', (2 + loaded / pics.length) / steps); })));

    show('Raising the village...', 2.6 / steps); await nextFrame();                       // the buildings, walls and towers: each painted once (pixelBuildings.js)
    const wm = game.worldMap, o = CONFIG.sim.levels.origin, piece = scratch();             // every wall and tower of the village, as it meets its ground
    if (wm) for (let ty = Math.floor(o.y) - 60; ty <= o.y + 60; ty++) for (let tx = Math.floor(o.x) - 60; tx <= o.x + 60; tx++) {
      if (Village.influence(tx, ty) <= 0) continue;
      const ob = wm.objAt(tx, ty);
      if (ob === OBJ.WALL || ob === OBJ.TOWER) PixelBuildings.drawPiece(piece, ob === OBJ.WALL ? 'wall' : 'tower', 0, 0, tx, ty);
    }
    const sites = BuildingSites.list;
    for (let i = 0; i < sites.length; i++) { PixelBuildings.art(sites[i]); show('Raising the village...', (2.6 + 0.4 * (i + 1) / sites.length) / steps); await nextFrame(); }

    show('Waking everyone up...', 3 / steps); await nextFrame();
    for (let i = 0; i < 3; i++) { renderer.render(game.getRenderState(1), 16, performance.now() + i * 120); await nextFrame(); }   // every sprite on screen is now drawn once
    show('Ready', 1); await nextFrame();
    hide();
  }

  /* ---- stage 3: the rest, in slices, while you play ---- */
  const idle = typeof requestIdleCallback === 'function' ? cb => requestIdleCallback(cb, { timeout: 500 }) : cb => setTimeout(() => cb({ timeRemaining: () => 6, didTimeout: true }), 60);
  const scratch = () => { const c = document.createElement('canvas'); c.width = 160; c.height = 160; return c.getContext('2d'); };
  /** Load a script (resolves even if it fails: these are extras). */
  const script = src => new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = s.onerror = () => res(); document.head.appendChild(s); });

  function background(game, renderer) {
    const jobs = [];
    const lazy = [...document.querySelectorAll('meta[name="lazy-script"]')].map(m => m.content);
    if (lazy.length) jobs.push(async () => { for (const src of lazy) await script(src); });          // in order: they register into a table loaded earlier
    jobs.push(...TerrainRenderer.warmJobs(Seasons.at(game.clockTick).season.id));                        // every biome's ground cells, this season
    for (const id of Object.keys(ItemDefs)) jobs.push(() => Promise.all(itemPictures(id).map(src => picture(src))));
    for (const def of Object.values(AnimalDefs)) {
      jobs.push(() => Promise.all(setPictures(def.sprites).map(src => picture(src))));
      const kind = def.sprite && def.sprite.kind;
      if (!def.pony && kind && PixelCreatures.has(kind)) for (let i = 0; i < 4; i++) for (const moving of [true, false]) {   // each walk and idle frame, painted once: one frame a job, and only
        const job = () => PixelCreatures.draw(scratch(), def.sprite, 80, 120, 1, { moving, phase: moving ? i * Math.PI / 2 + 0.1 : 0, now: moving ? 0 : i * 450, seed: 0, hunting: false });
        job.heavy = true; jobs.push(job);                                                                 // when the browser is truly idle (a dragon's frame takes a while)
      }
    }
    let i = 0;
    const run = async deadline => {
      let first = deadline.didTimeout;                                                       // a busy browser is never idle: still do one light job per slice
      while (i < jobs.length && (first ? !jobs[i].heavy : deadline.timeRemaining() > (jobs[i].heavy ? 12 : 4))) {
        first = false;
        const out = jobs[i++]();
        if (out && typeof out.then === 'function') { await out; break; }                    // (waited for the network: give the frame back)
      }
      if (i < jobs.length) { idle(run); return; }
      idle(ahead);                                                                          // then keep the ground a little farther out ready
    };
    /** When the browser has a moment, paint the ground beyond the screen in the direction you are heading (one block at a time). */
    const ahead = deadline => {
      const L = game.local, P = game.prevLocal, b = renderer.camera.bounds(), lead = 6 * TILE_HALF_W;
      const [sx, sy] = IsoProjection.worldDeltaToScreen(L.x - P.x, L.y - P.y), n = Math.hypot(sx, sy);
      const ox = n > 1e-6 ? sx / n * lead : 0, oy = n > 1e-6 ? sy / n * lead : 0;                    // the view, slid ahead of you
      if (n > 1e-6 && deadline.timeRemaining() > 6) TerrainRenderer.load(game.map, { minX: b.minX + ox, maxX: b.maxX + ox, minY: b.minY + oy, maxY: b.maxY + oy }, 1);
      setTimeout(() => idle(ahead), 120);
    };
    idle(run);
  }

  return { show, hide, initial, background };
})();
