'use strict';
/* TOOLS - optimization test: times the game server's tick and snapshot with N ponies around one player (no browser):
 *   node tools/bench-ponies.js [ponies=50] [ticks=300] [--owned]      (--owned: the ponies belong to the player, as in a big stable)     (budget: one tick = TICK_MS ms)
 * Prints the average / p95 / worst ms per step() and per snapshot, and the share of each step() phase. */
const { ctx, run } = require('./headless')();
ctx.performance = { now: () => Number(process.hrtime.bigint()) / 1e6 };       // headless.js gives a millisecond clock: too coarse for a 1 ms tick
const OWNED = process.argv.includes('--owned');
const N = process.argv[2] === undefined ? 50 : +process.argv[2], TICKS = +process.argv[3] || 300;
run(`(() => {
  globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.PA = S.players[A];
  S.map.ensureAround(PA.x, PA.y, 3);
  for (let i = 0; i < ${N}; i++) {
    const a = i * 2.399, r = 2 + (i % 10) * 1.2;                              // spiral round the player
    const type = ['pony_plain', 'pony_earth', 'pony_pegasus', 'pony_unicorn'][i % 4], x = PA.x + Math.cos(a) * r, y = PA.y + Math.sin(a) * r;
    if (${OWNED}) S.animals.release(type, x, y, A, undefined, { level: 1 + (i % 8) }); else S.animals.spawn(type, x, y, 0, { level: 1 + (i % 8) });
  }
  for (let i = 0; i < 30; i++) S.step();                                         // warm up
})()`);
const stats = xs => { xs = xs.slice().sort((a, b) => a - b); return { avg: xs.reduce((a, b) => a + b, 0) / xs.length, p95: xs[Math.floor(xs.length * 0.95)], max: xs[xs.length - 1] }; };
const t = run(`(() => { const out = { step: [], snap: [], upd: [] };
  for (let i = 0; i < ${TICKS}; i++) {
    let a = performance.now(); S.step(); out.step.push(performance.now() - a);
    a = performance.now(); S.takeSnapshot ? S.takeSnapshot() : 0; out.snap.push(performance.now() - a);
    if (S.animalUpdateFor) { a = performance.now(); S.animalUpdateFor(A); out.upd.push(performance.now() - a); }
  } return out; })()`);
const f = s => Object.entries(s).map(([k, v]) => k + ' ' + v.toFixed(3)).join('  ');
console.log(`${N} ponies added, animals live: ${run('Object.keys(S.animals.animals).length')}   tick budget ${run('TICK_MS').toFixed(1)} ms`);
console.log('step()     ms  ' + f(stats(t.step)));
console.log('snapshot() ms  ' + f(stats(t.snap)));
if (t.upd.length) console.log('update     ms  ' + f(stats(t.upd)));
