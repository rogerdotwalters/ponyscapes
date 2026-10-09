'use strict';
/* TOOLS - checks the garden fields in Node (no browser):  node tools/test-farming.js
 * a hoe tills a tile into nine plots; the garden window's jobs (till, dig, plant, cover, water, harvest) are checked by the server; days grow what is covered
 * and watered; old half-tile saves become fields. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

run(`globalThis.T = (() => {
  const s = new GameServer(4242), id = s.addPlayer(), p = s.players[id], inv = s.inventories[id];
  let spot = null;
  for (let r = 1; r < 40 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) for (let dy = -r; dy <= r && !spot; dy++) {
    const tx = Math.floor(p.x) + dx, ty = Math.floor(p.y) + dy; if (Farming.tillable(s.map, tx * 2, ty * 2)) spot = [tx, ty];
  }
  p.x = spot[0] + 0.5; p.y = spot[1] + 1.5;
  for (const it of ['hoe', 'shovel', 'watering_can']) if (!inv.has(it, 1)) inv.add(it, 1);
  return { s, id, p, inv, tx: spot[0], ty: spot[1] };
})()`);
const T = run('T');
const field = () => run('T.s._farm()[Farming.key(T.tx, T.ty)]');
const op = (o, i, item) => run(`T.s._fieldOp(T.id, ${JSON.stringify({ op: o, tx: T.tx, ty: T.ty, i, item })})`);
const plot = i => JSON.parse(run(`JSON.stringify(T.s._farm()[Farming.key(T.tx, T.ty)].cells[${i}])`));
const season = () => run('Seasons.at(T.s.tick).index');
const seedFor = () => run(`Crops.all().find(c => c.seasons.includes(Seasons.LIST[${season()}].id)).id`);

test('a hoe tills a whole tile into a field of nine tilled plots', () => {
  assert(!field());
  run('T.s._till(T.id, T.tx * 2, T.ty * 2)');
  assert.strictEqual(run('T.s._farm()[Farming.key(T.tx, T.ty)].cells.length'), 9);
  assert.strictEqual(run('Farming.plotAt(T.s.map, T.tx * 2 + 1, T.ty * 2 + 1) === T.s._farm()[Farming.key(T.tx, T.ty)]'), true);
});

test('dig, plant, cover and water: a seed only goes into a dug hole, and growth needs it covered', () => {
  const crop = seedFor(); run(`T.inv.add('seed_${crop}', 3)`);
  op('plant', 4, 'seed_' + crop); assert.strictEqual(plot(4).c, '', 'no hole yet');
  op('dig', 4); assert.strictEqual(plot(4).h, 1);
  const before = run(`T.inv.count('seed_${crop}')`);
  op('plant', 4, 'seed_' + crop); assert.strictEqual(plot(4).c, crop);
  assert.strictEqual(run(`T.inv.count('seed_${crop}')`), before - 1, 'one seed left the pouch');
  op('water', 4); op('cover', 4); assert.strictEqual(plot(4).v, 1);
});

test('a covered, watered crop grows a day; an uncovered one does not', () => {
  const crop = plot(4).c, today = run('T.s._today()');
  run(`(() => { const f = T.s._farm()[Farming.key(T.tx, T.ty)]; f.cells[4].w = ${today}; f.cells[5] = { w: ${today}, c: '${crop}', d: 0, h: 1, v: 0 }; T.s._farmNewDay(${today}); })()`);
  assert.strictEqual(plot(4).d, 1); assert.strictEqual(plot(5).d, 0);
});

test('ripe crops are picked by the hand and leave packed soil; the hoe loosens it; out-of-reach and tool-less jobs are refused', () => {
  const crop = plot(4).c;
  run(`T.s._farm()[Farming.key(T.tx, T.ty)].cells[4].d = Farming.growDays('${crop}')`);
  op('harvest', 4); assert(!plot(4).c); assert.strictEqual(plot(4).u, 1);
  op('dig', 4); assert.strictEqual(plot(4).h || 0, 0, 'packed soil is not dug');
  op('till', 4); assert.strictEqual(plot(4).u || 0, 0);
  run('T.inv.remove("shovel", 1)'); op('dig', 4); assert.strictEqual(plot(4).h || 0, 0, 'no shovel');
  run('T.inv.add("shovel", 1); T.p.x += 30'); op('dig', 4); assert.strictEqual(plot(4).h || 0, 0, 'too far');
});

test('an old save with half-tile plots becomes a field', () => {
  const farm = JSON.parse(run(`JSON.stringify(SaveData.sanitizeWorld({ v: SaveData.VERSION, seed: 1, farm: { '6,8': { w: 3, c: 'turnip', d: 2, idle: 0 }, '7,9': { w: -1, c: '', d: 0, idle: 0 } } }).farm)`));
  assert.strictEqual(farm['f3,4'].cells[0].c, 'turnip'); assert.strictEqual(farm['f3,4'].cells[0].v, 1); assert.strictEqual(farm['f3,4'].cells[0].d, 2);
  assert.strictEqual(farm['f3,4'].cells.length, 9);
  const again = JSON.parse(run(`JSON.stringify(SaveData.sanitizeWorld({ v: SaveData.VERSION, seed: 1, farm: ${JSON.stringify(farm)} }).farm)`));
  assert.deepStrictEqual(again, farm, 'a field survives a save');
});

console.log(`${passed} passed`);
