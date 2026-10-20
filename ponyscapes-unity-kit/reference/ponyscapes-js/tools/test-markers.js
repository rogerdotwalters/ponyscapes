'use strict';
/* TOOLS - checks the enemy level markers and health numbers in Node:  node tools/test-markers.js */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const marker = (lv, me) => { const m = run(`AnimalLevels.marker(${lv}, ${me})`); return m.kind + (m.kind === 'up' || m.kind === 'down' ? m.count : ''); };

test('markers: arrows down for weaker, a diamond for even, arrows up for stronger', () => {
  assert.strictEqual(marker(1, 20), 'down2'); assert.strictEqual(marker(5, 8), 'down1'); assert.strictEqual(marker(8, 9), 'even'); assert.strictEqual(marker(9, 9), 'even'); assert.strictEqual(marker(10, 9), 'even');
  assert.strictEqual(marker(12, 9), 'up1'); assert.strictEqual(marker(16, 10), 'up2');
});
test('a skull only when a LOW level player faces something very high (8+ levels above, at least double)', () => {
  assert.strictEqual(marker(10, 1), 'skull'); assert.strictEqual(marker(25, 3), 'skull');
  assert.strictEqual(marker(6, 1), 'up2', 'five levels above is not the skull');
  assert.strictEqual(marker(40, 32), 'up2', 'a high level player is never skulled by a slightly higher level');
});
test('the bar uses the health the server gives a creature of that level', () => {
  const r = run(`(() => { const s = new GameServer(4242), out = []; for (const [type, lv] of [['slime', 1], ['slime', 10], ['slime_king', 10], ['boss_cave_bear', 5], ['wolf', 7]]) { const id = s.animals.spawn(type, 10, 10, 0, { level: lv }); out.push(s.animals.animals[id].maxHp === AnimalLevels.maxHp(AnimalDefs[type], lv)); } return out; })()`);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), [true, true, true, true, true]);
});
console.log(`${passed} passed`);
