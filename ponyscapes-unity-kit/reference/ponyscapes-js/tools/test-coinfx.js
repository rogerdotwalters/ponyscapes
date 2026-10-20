'use strict';
/* TOOLS - the physics of coins lying in the world (client/render/coinFx.js) in Node:  node tools/test-coinfx.js
 * a thrown pile flies, bounces and comes to rest near its spot; a pile that was already there lies flat at once; the pile's coin count is capped. */
const assert = require('assert'), fs = require('fs'), path = require('path');
const { run } = require('./headless')();
run(fs.readFileSync(path.join(__dirname, '..', 'public/js/client/render/coinFx.js'), 'utf8') + '\n;globalThis.CoinFx = CoinFx;');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

test('a thrown pile bounces and settles close to its spot', () => {
  const r = JSON.parse(run(`(() => {
    const d = { id: 'd5', item: 'gold_coin', count: 6, x: 10, y: 10 }, sim = CoinFx.make(d, { x: 8, y: 9.5 }, true, 0);
    let t = 0, maxZ = 0, bounces = 0, prevVz = 0;
    for (; t < 6000 && !sim.rest; t += 16) { CoinFx.step(sim, t); for (const c of sim.coins) { maxZ = Math.max(maxZ, c.z); if (prevVz < 0 && c.vz > 0) bounces++; prevVz = c.vz; } }
    return JSON.stringify({ rest: sim.rest, t, maxZ, bounces, n: sim.coins.length, far: Math.max(...sim.coins.map(c => Math.hypot(c.x - 10, c.y - 10))), flat: sim.coins.every(c => c.z === 0 && c.f === 0.8) });
  })()`));
  assert(r.rest && r.t < 5000, 'it comes to rest: ' + JSON.stringify(r)); assert(r.maxZ > 20, 'it flew'); assert(r.bounces >= 1, 'it bounced');
  assert.strictEqual(r.n, 6); assert(r.far < 0.9, 'it ends near the pile: ' + r.far); assert(r.flat);
});
test('a pile that was already there lies flat at once, and big piles show at most 8 coins', () => {
  const r = JSON.parse(run(`(() => { const s = CoinFx.make({ id: 'd9', item: 'copper_coin', count: 500, x: 3, y: 4 }, null, false, 0); return JSON.stringify({ rest: s.rest, n: s.coins.length, z: s.coins.map(c => c.z) }); })()`));
  assert(r.rest); assert.strictEqual(r.n, 8); assert(r.z.every(z => z === 0));
});
test('every other item lies in the world with the same physics: thrown, bouncing, up to 3 pieces, no edge-on tumbling, still at rest', () => {
  const r = JSON.parse(run(`(() => {
    const d = { id: 'd5', item: 'log', count: 9, x: 10, y: 10 }, sim = CoinFx.make(d, { x: 8, y: 9.5 }, true, 0);
    let t = 0, maxZ = 0, minF = 1, maxRot = 0;
    for (; t < 6000 && !sim.rest; t += 16) { CoinFx.step(sim, t); for (const c of sim.coins) { maxZ = Math.max(maxZ, c.z); minF = Math.min(minF, c.f); maxRot = Math.max(maxRot, Math.abs(c.rot)); } }
    const still = CoinFx.make({ id: 'd9', item: 'apple', count: 2, x: 3, y: 4 }, null, false, 0);
    return JSON.stringify({ rest: sim.rest, n: sim.coins.length, maxZ, minF, maxRot, restRot: sim.coins.map(c => c.rot), far: Math.max(...sim.coins.map(c => Math.hypot(c.x - 10, c.y - 10))), stillRest: still.rest, stillN: still.coins.length });
  })()`));
  assert(r.rest && r.n === 3, JSON.stringify(r)); assert(r.maxZ > 20, 'it flew'); assert.strictEqual(r.minF, 1, 'items do not squash like a spinning coin');
  assert(r.maxRot > 0.05 && r.maxRot <= 0.5, 'it wobbled in the air: ' + r.maxRot); assert(r.restRot.every(x => x === 0), 'and lies still'); assert(r.far < 0.9);
  assert(r.stillRest && r.stillN === 2);
});
test('pony coins count as coins too', () => assert(run(`CoinFx.isCoin('pony_coin_candy') && CoinFx.isCoin('gold_coin') && !CoinFx.isCoin('log')`)));
console.log(passed + ' passed');
