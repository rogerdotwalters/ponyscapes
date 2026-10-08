/* The scenes render-compare.js shoots. `query` is the page's query string (solo=1 skips the title screen); `setup(page, fake)` (optional) runs once the
 * game exists; with `fake` the page's clock is virtual: advance it with page.clock.runFor(ms). */
const settle = async (page, fake, ms = 600) => { if (fake) await page.clock.runFor(ms); else await page.waitForTimeout(ms); await page.waitForTimeout(100); };
const ev = (page, fn, arg) => page.evaluate(fn, arg);

/** Get on Misty (the starting pony) and face `angle` (radians; Math.PI/4 faces the camera). */
async function ride(page, fake, angle) {
  for (let i = 0; i < 10; i++) {
    if (await ev(page, () => !!ponyscapes.game.local.mount)) break;
    await ev(page, () => ponyscapes.game.requestInteract()); await settle(page, fake, 400);
  }
  await ev(page, a => {                                                   // everyone in the picture faces `a`, whatever the simulation says
    const g = ponyscapes.game, get = g.getRenderState.bind(g);
    g.getRenderState = al => { const st = get(al); for (const id in st.players) st.players[id] = { ...st.players[id], facing: a, vx: 0, vy: 0 }; for (const id in st.animals) if (st.animals[id].rider) st.animals[id] = { ...st.animals[id], facing: a }; return st; };
  }, angle);
  await settle(page, fake, 300);
}

module.exports = {
  village: { query: 'solo=1&hour=12' },
  night: { query: 'solo=1&hour=23' },
  home: { query: 'solo=1&hour=12&enter=player_home', setup: (page, fake) => settle(page, fake, 1500) },
  ride_camera: { query: 'solo=1&hour=12', setup: (page, fake) => ride(page, fake, Math.PI / 4) },
  ride_away: { query: 'solo=1&hour=12', setup: (page, fake) => ride(page, fake, -3 * Math.PI / 4) },
  ride_left: { query: 'solo=1&hour=12', setup: (page, fake) => ride(page, fake, 3 * Math.PI / 4) },
  ride_right: { query: 'solo=1&hour=12', setup: (page, fake) => ride(page, fake, -Math.PI / 4) },
  two_players: { query: 'solo=1&hour=12', setup: async (page, fake) => {          // a second player on the host's server (what a joined friend looks like)
    await ev(page, () => { const s = ponyscapes.adapter.server, me = s.players[ponyscapes.game.myId], id = s.joinHuman('prince', 'Friend'); const f = s.players[id]; if (f) { f.x = me.x + 2.5; f.y = me.y - 1.5; } });
    await settle(page, fake, 1500);
  } },
};
