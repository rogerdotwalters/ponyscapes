'use strict';
/* TOOLS - checks the pony limits and Follow / Stay in Node:  node tools/test-ponycap.js
 * twenty ponies per person (spawner, lasso), at most ten wild ponies in view, and a pony told to follow goes where you go while one told to stay waits. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };
const fresh = () => run(`globalThis.S = new GameServer(31); globalThis.a = S.joinHuman(null, 'host', null, 'ka'); globalThis.owned = id => Object.values(S.animals.animals).filter(x => x.owner === id && AnimalDefs[x.type].pony).length;`);

test('nobody keeps more than twenty ponies', () => {
  fresh();
  assert.strictEqual(run(`CONFIG.sim.ponyCap.base + CONFIG.sim.ponyCap.perLevel * (CONFIG.sim.ponyCap.cost.length - 1)`), 20);
  run(`for (let i = 0; i < 5; i++) S._devSpawnPonies('random', 12, '')`);
  assert.strictEqual(run(`owned(a)`), 20);
  run(`S._devSpawnLegend('applejack')`);
  assert.strictEqual(run(`owned(a)`), 20, 'a legend does not get past it either');
  assert.strictEqual(run(`S._ponyCount(a) >= S._ponyCapOf(a)`), true);
});

test('only ten wild ponies come into view', () => {
  fresh();
  run(`S.animals.animals = {}; const p = S.players[a]; p.x = 300; p.y = 300; S.map.ensureAround(300, 300, 4); globalThis.W = S.wildPonies;
    for (let i = 0; i < 12; i++) S.animals.spawn('pony_earth', 300 + (i % 4) * 3 - 4, 300 + Math.floor(i / 4) * 3 - 3);`);
  assert.strictEqual(run(`W._nearby(S.players[a])`), 12);
  run(`const before = Object.keys(S.animals.animals).length; globalThis.before = before; for (let t = 0; t < 40; t++) { for (const k in W.regions) W.regions[k].pending = 5; W.update(60 * (t + 1)); }`);
  assert.strictEqual(run(`Object.keys(S.animals.animals).length`), run(`before`), 'nothing new arrives while ten or more are in view');
});

test('follow: a pony goes where you go; stay: it waits; main ponies obey too', () => {
  fresh();
  run(`S.players[a].x = 100; S.players[a].y = 100; S.map.ensureAround(100, 100, 4); S.animals.animals = {};
    globalThis.P = S.animals.release('pony_earth', 100, 103, a, 5, { level: 2, variant: 0 }); P.leashed = false; P.main = false; S._remember(a, P);`);
  assert.strictEqual(run(`ponyFollows(P)`), false, 'a plain pony does not follow');
  run(`S._ponyCmd(a, { animal: P.id, mode: 'follow' })`);
  assert.strictEqual(run(`ponyFollows(P)`), true);
  run(`S.players[a].x = 112; S.players[a].y = 100; for (let i = 0; i < 300; i++) S.step()`);
  assert(run(`Math.hypot(P.x - S.players[a].x, P.y - S.players[a].y)`) < 6, 'it caught up');
  run(`S._ponyCmd(a, { animal: P.id, mode: 'stay' })`);
  const x0 = run(`P.x`);
  run(`S.players[a].x = 125; for (let i = 0; i < 200; i++) S.step()`);
  assert(Math.abs(run(`P.x`) - x0) < 1.5, 'it stayed');
  run(`P.main = true`);
  assert.strictEqual(run(`ponyFollows(P)`), false, 'a main pony told to stay stays');
  run(`S._ponyCmd(a, { animal: P.id, mode: 'follow' })`);
  assert.strictEqual(run(`ponyFollows(P) && P.stay`), false);
  run(`S._ponyCmd('p9', { animal: P.id, mode: 'stay' })`);
  assert.strictEqual(run(`ponyFollows(P)`), true, 'only the owner can command it');
});
console.log(passed + ' passed');
