'use strict';
/* TOOLS - the stretchy coin bag (client/ui/elasticBag.js + the physics in coinBagUI.js) in Node:  node tools/test-elasticbag.js
 * the bag grows with the weight of its coins, stays between its minimum and maximum stretch, bulges under a heap and springs back, and resists more the further it is pulled. */
const assert = require('assert'), fs = require('fs'), path = require('path');
const { run } = require('./headless')();
const load = f => fs.readFileSync(path.join(__dirname, '..', 'public/js/client/' + f), 'utf8');
run(load('render/coinSpin.js') + '\n;globalThis.CoinSpin = CoinSpin;');
run(load('ui/elasticBag.js') + '\n;globalThis.ElasticBag = ElasticBag;');
run(load('ui/coinBagUI.js').replace(/^'use strict';/, '') + '\n;globalThis.CoinBagUI = CoinBagUI;');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

/** Pour `n` coins of kind `t` into a bag and run its physics for `secs`; returns the numbers worth looking at. */
const pour = (n, t, secs = 6, weightScale = 1) => JSON.parse(run(`(() => {
  const ui = Object.create(CoinBagUI.prototype); ui.bag = new ElasticBag(); ui.drag = null; ui.coins = [];
  const r = CoinBagUI.radiusOf(${t}), m = Math.pow(r / 8, 2); ui.weight = ${n} * m * ${weightScale};
  for (let i = 0; i < ${n}; i++) ui.coins.push({ x: 95 + (Math.random() - 0.5) * 20, y: 30 + (i % 8) * 4, px: 0, py: 0, vx: 0, vy: 0, t: ${t}, r, o: CoinSpin.random(), w: [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 0] });
  let maxOff = -99, minOff = 99, maxSag = 0;
  for (let f = 0; f < ${secs} * 60; f++) {
    if (f % 4 === 0 && ui.queue) { }
    ui._step(1 / 120); ui._step(1 / 120);
    for (const s of [0, 1]) for (const o of ui.bag.off[s]) { maxOff = Math.max(maxOff, o); minOff = Math.min(minOff, o); }
    maxSag = Math.max(maxSag, ui.bag.sag);
  }
  const b = ui.bag, belly = (b.off[0][12] + b.off[1][12]) / 2, out = ui.coins.filter(c => c.y > b.bottom() + 1 || Math.abs(c.x - 95) > 100).length;
  const lowY = b.bottom() - 25, len = b.bottom() - 22, low = b.edge(lowY, 0) + b.edge(lowY, 1), high = b.edge(60, 0) + b.edge(60, 1);
  return JSON.stringify({ len, low, high, fill: b.fill, belly, neck: (b.off[0][1] + b.off[1][1]) / 2, sag: b.sag, maxOff, minOff, maxSag, growth: b.growth, out, n: ui.coins.length });
})()`));

test('an empty bag is a limp short teardrop; a fuller one is longer and wider in its lower half', () => {
  const e = pour(0, 0, 2), few = pour(6, 0, 4), many = pour(40, 0, 6), lots = pour(64, 4, 6);
  const show = (n, r) => n + ' length ' + r.len.toFixed(0) + ' lower width ' + r.low.toFixed(0) + ' upper width ' + r.high.toFixed(0);
  console.log('       ' + [show('empty', e), show('6 copper', few), show('40 copper', many), show('64 titanium', lots)].join('\n       '));
  assert(e.fill < 0.01 && e.len < 110, 'the empty bag is short: ' + e.len);
  assert(few.len > e.len && many.len > few.len && lots.len >= many.len, 'it lengthens with the weight');
  assert(few.low > e.low && many.low > few.low && lots.low >= many.low, 'its lower half widens');
  assert((lots.low - e.low) > 2 * (lots.high - e.high), 'the lower half widens more than the upper: ' + (lots.low - e.low) + ' vs ' + (lots.high - e.high));
  assert(many.neck < 4, 'the neck hardly stretches: ' + many.neck);
});
test('the stretch stays between the minimum and maximum, however hard it is stuffed', () => {
  const r = pour(200, 6, 8, 5), cfg = JSON.parse(run('JSON.stringify(ElasticBag.CONFIG)'));
  console.log('       200 big coins: max stretch', r.maxOff.toFixed(1), 'min', r.minOff.toFixed(1), 'sag', r.maxSag.toFixed(1), 'coins out of the bag', r.out);
  assert(r.maxOff <= cfg.maxStretch + 0.01, 'never past the maximum'); assert(r.minOff >= cfg.minStretch - 0.01, 'never under the minimum');
  assert(r.maxSag <= cfg.sagMax * 1.5 + 0.01); assert.strictEqual(r.out, 0, 'every coin stays inside');
});
test('a heap pushing on a wall bulges it, and it springs back when the push stops', () => {
  const r = JSON.parse(run(`(() => {
    const b = new ElasticBag(); for (let f = 0; f < 600; f++) b.update(1 / 120, 0);
    const rest = b.off[1][12]; let peak = 0;
    for (let f = 0; f < 120; f++) { b.push(100, 1, 3); b.update(1 / 120, 0); peak = Math.max(peak, b.off[1][12], b.off[1][11], b.off[1][10]); }
    const near = b.off[1][10], far = b.off[1][2];
    for (let f = 0; f < 1200; f++) b.update(1 / 120, 0);
    return JSON.stringify({ rest, peak, near, far, after: b.off[1][12] });
  })()`));
  assert(r.peak > r.rest + 2, 'it bulged: ' + JSON.stringify(r)); assert(r.near > r.far, 'more where it is pushed than far away');
  assert(Math.abs(r.after - r.rest) < 0.3, 'it came back: ' + JSON.stringify(r));
});
test('resistance: the same push stretches a stretched wall less than a slack one', () => {
  const r = JSON.parse(run(`(() => {
    const dx = weight => { const b = new ElasticBag(); for (let f = 0; f < 1200; f++) b.update(1 / 120, weight); const a = b.off[1][12]; for (let f = 0; f < 1200; f++) { b.push(100, 1, 4); b.update(1 / 120, weight); } return b.off[1][12] - a; };
    return JSON.stringify({ slack: dx(0), full: dx(1e6) });
  })()`));
  assert(r.slack > r.full + 0.5, 'it gets harder to stretch: ' + JSON.stringify(r));
});
test('coins in the bag turn in full 3D while they fall and bump, then lie flat (face up or flipped)', () => {
  const r = JSON.parse(run(`(() => {
    const ui = Object.create(CoinBagUI.prototype); ui.bag = new ElasticBag(); ui.drag = null; ui.weight = 20; ui.coins = [];
    for (let i = 0; i < 20; i++) ui.coins.push({ x: 95 + (Math.random() - 0.5) * 20, y: 30 + i * 3, px: 0, py: 0, vx: 0, vy: 0, t: 1, r: 9, o: CoinSpin.random(), w: [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 0] });
    let edgeOn = 0, minFace = 1, axes = new Set();
    for (let f = 0; f < 150; f++) { ui._step(1 / 120); ui._step(1 / 120); for (const c of ui.coins) { const n = CoinSpin.facing(c.o); if (Math.abs(n) < 0.35) edgeOn++; minFace = Math.min(minFace, Math.abs(n)); } }
    for (let f = 0; f < 600; f++) { ui._step(1 / 120); ui._step(1 / 120); }
    const flat = ui.coins.map(c => Math.abs(CoinSpin.facing(c.o))), norm = ui.coins.map(c => Math.hypot(...c.o));
    return JSON.stringify({ edgeOn, minFace, flatMin: Math.min(...flat), faceDown: ui.coins.filter(c => CoinSpin.facing(c.o) < 0).length, normOk: norm.every(n => Math.abs(n - 1) < 1e-6) });
  })()`));
  assert(r.edgeOn > 20 && r.minFace < 0.2, 'they turn right over onto their edges while falling: ' + JSON.stringify(r));
  assert(r.flatMin > 0.97, 'they end lying flat: ' + r.flatMin); assert(r.normOk, 'orientations stay unit quaternions');
});
test('CoinSpin: spinning about each axis, settling and facing behave', () => {
  const r = JSON.parse(run(`(() => {
    let o = CoinSpin.identity(); const f0 = CoinSpin.facing(o);
    o = CoinSpin.spin(o, [Math.PI, 0, 0], 1);                                      // half a turn about x: the back
    const back = CoinSpin.facing(o);
    o = CoinSpin.spin(CoinSpin.identity(), [0, Math.PI / 2, 0], 1);                // a quarter turn about y: edge on
    const edge = CoinSpin.facing(o);
    let t = CoinSpin.spin(CoinSpin.identity(), [0.9, 0.4, 0], 1); for (let i = 0; i < 300; i++) t = CoinSpin.settle(t, 5, 1 / 60);
    const rolled = CoinSpin.facing(CoinSpin.spin(CoinSpin.identity(), [0, 0, 2.2], 1));      // a roll about z keeps it facing us
    return JSON.stringify({ f0, back, edge, settled: CoinSpin.facing(t), rolled });
  })()`));
  assert(Math.abs(r.f0 - 1) < 1e-9 && Math.abs(r.back + 1) < 1e-9 && Math.abs(r.edge) < 1e-9 && r.settled > 0.999 && Math.abs(r.rolled - 1) < 1e-9, JSON.stringify(r));
});
console.log(passed + ' passed');
