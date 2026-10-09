/* The scenes render-compare.js shoots. `query` is the page's query string (solo=1 skips the title screen); `setup(page, fake)` (optional) runs once the
 * game exists; with `fake` the page's clock is virtual: advance it with page.clock.runFor(ms). */
const settle = async (page, fake, ms = 600) => { if (fake) await page.clock.runFor(ms); else await page.waitForTimeout(ms); await page.waitForTimeout(100); };
const ev = (page, fn, arg) => page.evaluate(fn, arg);

/** Run the local server by hand (its own timer stalls on the fake clock) and send the client the snapshots. */
async function stepServer(page, fake, n) {
  await ev(page, n => { window.__reseed(777); const a = ponyscapes.adapter; for (let i = 0; i < n; i++) { a.server.step(); if (a.server.tick % CONFIG.net.snapshotEvery === 0) a._sendSnapshot(); } }, n);
  await settle(page, fake, 100);
}

/** Get on Misty (the starting pony) and face `angle` (radians; Math.PI/4 faces the camera). */
async function ride(page, fake, angle, fly = false) {
  await ev(page, () => { const s = ponyscapes.adapter.server, me = s.players[ponyscapes.game.myId], a = Object.values(s.animals.animals).find(x => x.owner === me.id); me.x = a.x + 0.4; me.y = a.y + 0.4; });   // (stand next to Misty)
  await stepServer(page, fake, 30);
  for (let i = 0; i < 20 && !(await ev(page, () => !!ponyscapes.game.local.mount)); i++) { await ev(page, () => ponyscapes.game.requestInteract()); await settle(page, fake, 200); await stepServer(page, fake, 10); }
  if (!(await ev(page, () => !!ponyscapes.game.local.mount))) throw new Error('could not mount the pony');
  await ev(page, ([a, fly]) => {                                                   // only the rider and the pony are left, standing still facing `a`, whatever the simulation says (villagers wander differently from run to run)
    const g = ponyscapes.game, get = g.getRenderState.bind(g);
    g.getRenderState = al => { const st = get(al); st.npcs = {}; for (const id in st.animals) if (!st.animals[id].rider) delete st.animals[id]; for (const id in st.players) st.players[id] = { ...st.players[id], x: 19.5, y: 25.5, facing: a, vx: 0, vy: 0, ...(fly ? { lift: 1, flying: true } : {}) }; for (const id in st.animals) if (st.animals[id].rider) st.animals[id] = { ...st.animals[id], x: 19.5, y: 25.5, facing: a, vx: 0, vy: 0, ...(fly ? { type: 'pony_pegasus', flying: true, lift: 1 } : {}) }; return st; };
  }, [angle, fly]);
  await stepServer(page, fake, 20);
}

module.exports = {
  /** Particles, floating text and a hearts / bubble over a villager, drawn right after the events happen. */
  effects: { query: 'solo=1&hour=12', setup: async (page, fake) => {
    await settle(page, fake, 300);
    await ev(page, () => { window.__reseed(5); const g = ponyscapes.game, me = g.local, E = g.events, to = g.myId;
      E.emit('chop', { key: 'k1', x: me.x + 1.5, y: me.y, to }); E.emit('hit', { x: me.x, y: me.y + 1.5, to }); E.emit('harvested', { x: me.x - 1.5, y: me.y, to, color: '#e59a2e' });
      E.emit('gain', { to, item: 'log', count: 2 }); E.emit('levelup', { to, name: 'Woodcutting', level: 3 }); E.emit('xp', { to, skill: 'woodcutting', amount: 7 }); });
  } },
  /** Pixi only (the canvas backend has no see-through effect): the player stands behind the General Store, under its roof. */
  seethrough: { query: 'solo=1&hour=12', seethrough: true, setup: async (page, fake) => {
    await ev(page, () => { const s = ponyscapes.adapter.server, me = s.players[ponyscapes.game.myId], site = BuildingSites.list.find(x => x.id === 'general_store'); me.x = site.x0 + 1.5; me.y = site.y0 - 0.2; });
    await stepServer(page, fake, 30);
  } },
  village: { query: 'solo=1&hour=12' },
  night: { query: 'solo=1&hour=23' },
  home: { query: 'solo=1&hour=12&enter=player_home', setup: (page, fake) => settle(page, fake, 1500) },
  stable: { query: 'solo=1&hour=12', setup: async (page, fake) => {          // the paddock's stable, a barn beside it, and a stretch of fence
    await ev(page, () => { const s = ponyscapes.adapter.server, me = s.players[ponyscapes.game.myId], P = Village.paddock; const put = (x, y, t, slot) => BuildSystem.place(s.map, x, y, t, slot);
      put(P.x0 - 4, P.y1 + 3, 'barn', 'c'); put(P.x0 - 7, P.y1 + 3, 'stable', 'c'); for (let i = 0; i < 6; i++) put(P.x0 - 8 + i, P.y1 + 6, 'wood_fence', 's'); put(P.x0 - 6, P.y1 + 6, 'wood_gate', 's');
      s.builtRev++; me.x = P.x0 - 5.5; me.y = P.y1 + 5; });
    await stepServer(page, fake, 30);
  } },
  inventory: { query: 'solo=1&hour=12', full: true, setup: async (page, fake) => {          // the bag open beside the starting pony, with its pack
    await ev(page, () => { const s = ponyscapes.adapter.server, me = s.players[ponyscapes.game.myId], a = Object.values(s.animals.animals).find(x => x.owner === me.id); me.x = a.x + 0.4; me.y = a.y + 0.4; });
    await stepServer(page, fake, 40);
    await page.keyboard.press('KeyI');
    await settle(page, fake, 400);
  } },
  sleeping: { query: 'solo=1&hour=12&enter=player_home', setup: async (page, fake) => {          // the player asleep in their bed
    await settle(page, fake, 1500);
    await ev(page, () => { const g = ponyscapes.game, get = g.getRenderState.bind(g); g.getRenderState = al => { const st = get(al); for (const id in st.players) st.players[id] = { ...st.players[id], asleep: true, vx: 0, vy: 0 }; return st; }; });
    await settle(page, fake, 300);
  } },
  ride_camera: { query: 'solo=1&hour=12', setup: (page, fake) => ride(page, fake, Math.PI / 4) },
  ride_away: { query: 'solo=1&hour=12', setup: (page, fake) => ride(page, fake, -3 * Math.PI / 4) },
  ride_fly: { query: 'solo=1&hour=12', setup: (page, fake) => ride(page, fake, 3 * Math.PI / 4, true) },
  ride_left: { query: 'solo=1&hour=12', setup: (page, fake) => ride(page, fake, 3 * Math.PI / 4) },
  ride_right: { query: 'solo=1&hour=12', setup: (page, fake) => ride(page, fake, -Math.PI / 4) },
  two_players: { query: 'solo=1&hour=12', setup: async (page, fake) => {          // a second player on the host's server (what a joined friend looks like)
    await ev(page, () => { const s = ponyscapes.adapter.server, me = s.players[ponyscapes.game.myId], id = s.joinHuman('prince', 'Friend'); const f = s.players[id]; if (f) { f.x = me.x + 2.5; f.y = me.y - 1.5; } });
    await stepServer(page, fake, 30);
  } },
};
