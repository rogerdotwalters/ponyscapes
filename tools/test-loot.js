'use strict';
/* TOOLS - checks the loot tables in Node (no browser):  node tools/test-loot.js
 * slime / slime king / chest tables, saving on a device, importing and exporting, and that the game really uses them. */
const assert = require('assert');
const { run, ctx } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
/** A pretend localStorage, so "saved on this device" can be tested. */
const store = {}; ctx.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);              // (compares by value, across the game's own context)
const items = key => run(`LootTables.current('${key}').map(e => e.item).sort()`);

test('slimes drop goo, bone, apples, rope and coins; the king drops all of them for sure; the Warren chests hold them too', () => {
  same(items('creature:slime'), ['apple', 'bone', 'gold_coin', 'goo', 'rope']);
  same(items('creature:slime_king'), ['apple', 'bone', 'gold_coin', 'goo', 'rope']);
  for (const e of run(`LootTables.current('creature:slime_king')`)) assert(e.chance === undefined, 'always: ' + e.item);
  for (const item of ['goo', 'bone', 'apple', 'rope', 'gold_coin']) assert(items('chest:slime_warren').includes(item), 'chest has ' + item);
  assert(run(`!!ItemDefs.goo`));
});

test('every creature and every dungeon has a table to edit', () => {
  const keys = run('LootTables.all().map(t => t.key)');
  assert(keys.includes('chest:cavern') && keys.includes('chest:slime_warren') && keys.includes('creature:slime') && keys.includes('creature:slime_king'));
  assert(!keys.some(k => /pony/.test(k)));
});

test('a killed slime drops from its table: only listed items, within min..max', () => {
  const seen = run(`(() => { const s = new GameServer(4242), seen = {}; for (let i = 0; i < 300; i++) { const id = s.animals.spawn('slime', 10, 10, 0, { level: 1 }); for (const d of s.animals.damage(id, 9999).drops) { seen[d.item] = seen[d.item] || [999, 0]; seen[d.item][0] = Math.min(seen[d.item][0], d.count); seen[d.item][1] = Math.max(seen[d.item][1], d.count); } } return seen; })()`);
  same(Object.keys(seen).sort(), ['apple', 'bone', 'gold_coin', 'goo', 'rope']);
  assert(seen.goo[0] >= 1 && seen.goo[1] <= 2); assert(seen.gold_coin[1] <= 3);
});

test('saving on this device changes what drops, and survives a reload; resetting puts the built-in back', () => {
  assert.strictEqual(run(`LootTables.source('creature:slime')`), 'built-in');
  assert.strictEqual(run(`LootTables.save('creature:slime', [{ item: 'rope', min: 3, max: 3 }, { item: 'nonsense', min: 1, max: 1 }, { item: 'goo', min: 5, max: 2, chance: 0.5 }])`), true);
  same(run(`LootTables.current('creature:slime')`), [{ item: 'rope', min: 3, max: 3 }, { item: 'goo', min: 5, max: 5, chance: 0.5 }], 'cleaned');
  assert.strictEqual(run(`LootTables.source('creature:slime')`), 'device');
  run('LootTables.reload()'); assert.strictEqual(run(`LootTables.source('creature:slime')`), 'device', 'read back from the device');
  const drops = run(`(() => { const s = new GameServer(4242), seen = new Set(); for (let i = 0; i < 100; i++) { const id = s.animals.spawn('slime', 10, 10, 0, { level: 1 }); for (const d of s.animals.damage(id, 9999).drops) seen.add(d.item); } return [...seen].sort(); })()`);
  same(drops, ['goo', 'rope']);
  run(`LootTables.reset('creature:slime')`); same(items('creature:slime'), ['apple', 'bone', 'gold_coin', 'goo', 'rope']);
});

test('an empty table drops nothing; the chest table is what a chest holds', () => {
  run(`LootTables.save('creature:slime', [])`);
  assert.strictEqual(run(`(() => { const s = new GameServer(4242); let n = 0; for (let i = 0; i < 50; i++) { const id = s.animals.spawn('slime', 10, 10, 0, { level: 1 }); n += s.animals.damage(id, 9999).drops.length; } return n; })()`), 0);
  run(`LootTables.reset('creature:slime')`);
  run(`LootTables.save('chest:slime_warren', [{ item: 'rope', min: 7, max: 7 }])`);
  same(run(`new GameServer(4242).dungeons.rollLoot(Dungeons.all()[1], 5, 5)`), [{ item: 'rope', count: 7 }]);
  run(`LootTables.reset('chest:slime_warren')`);
});

test('export and import: a lootTables.js round trip, and junk is refused', () => {
  run(`LootTables.save('creature:slime_king', [{ item: 'goo', min: 2, max: 4, chance: 0.5 }])`);
  const text = run('LootTables.exportText()'); assert(/PONYSCAPES_LOOT/.test(text) && /slime_king/.test(text));
  run(`LootTables.reset('creature:slime_king')`); assert.strictEqual(run(`LootTables.source('creature:slime_king')`), 'built-in');
  globalThis.__t = text; ctx.__t = text;
  assert.strictEqual(run('LootTables.importText(__t)'), 1); same(run(`LootTables.current('creature:slime_king')`), [{ item: 'goo', min: 2, max: 4, chance: 0.5 }]);
  assert.strictEqual(run(`LootTables.importText('not loot at all')`), -1);
  run(`LootTables.reset('creature:slime_king')`);
});

test('sample: counts what a table is worth over many kills', () => {
  const t = run(`LootTables.sample([{ item: 'goo', min: 1, max: 1 }, { item: 'rope', min: 2, max: 2, chance: 0 }], 10)`);
  same(t, { goo: 10 });
});

test('the dev code: one lock for Dev settings and the Editor', () => {
  assert.strictEqual(run(`DevLock.check(' PNKPI ')`), true); assert.strictEqual(run(`DevLock.check('nope')`), false);
});

console.log(`${passed} passed`);
