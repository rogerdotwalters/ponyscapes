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
  same(items('creature:slime'), ['apple', 'bone', 'goo', 'rope', 'silver_coin']);
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
  same(Object.keys(seen).sort(), ['apple', 'bone', 'goo', 'rope', 'silver_coin']);
  assert(seen.goo[0] >= 1 && seen.goo[1] <= 2); assert(seen.silver_coin[1] <= 6 * 1.2 + 1, 'level 1: a few silver at most');
});

test('saving on this device changes what drops, and survives a reload; resetting puts the built-in back', () => {
  assert.strictEqual(run(`LootTables.source('creature:slime')`), 'built-in');
  assert.strictEqual(run(`LootTables.save('creature:slime', [{ item: 'rope', min: 3, max: 3 }, { item: 'nonsense', min: 1, max: 1 }, { item: 'goo', min: 5, max: 2, chance: 0.5 }])`), true);
  same(run(`LootTables.current('creature:slime')`), [{ item: 'rope', min: 3, max: 3 }, { item: 'goo', min: 5, max: 5, chance: 0.5 }], 'cleaned');
  assert.strictEqual(run(`LootTables.source('creature:slime')`), 'device');
  run('LootTables.reload()'); assert.strictEqual(run(`LootTables.source('creature:slime')`), 'device', 'read back from the device');
  const drops = run(`(() => { const s = new GameServer(4242), seen = new Set(); for (let i = 0; i < 100; i++) { const id = s.animals.spawn('slime', 10, 10, 0, { level: 1 }); for (const d of s.animals.damage(id, 9999).drops) seen.add(d.item); } return [...seen].sort(); })()`);
  same(drops, ['goo', 'rope']);
  run(`LootTables.reset('creature:slime')`); same(items('creature:slime'), ['apple', 'bone', 'goo', 'rope', 'silver_coin']);
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


/** Total coins (in copper) a creature of `level` drops over `n` kills. */
const coinsOver = (type, level, n) => run(`(() => { const s = new GameServer(4242); let copper = 0; const seen = new Set(); for (let i = 0; i < ${n}; i++) { const id = s.animals.spawn('${type}', 10, 10, 0, { level: ${level} }); for (const d of s.animals.damage(id, 99999).drops) if (Coins.isCoin(d.item)) { const v = d.count * Coins.value(d.item); copper += v; seen.add(v); } } return { copper, distinct: seen.size }; })()`);

test('coins: a slime drops coins every time, more of them the higher its level, and no two kills pay the same', () => {
  const l2 = coinsOver('slime', 2, 200), l10 = coinsOver('slime', 10, 200);
  assert(l10.copper > l2.copper * 1.8, 'level 10 pays much more than level 2: ' + l2.copper + ' vs ' + l10.copper);
  assert(l2.distinct > 4 && l10.distinct > 8, 'varies: ' + l2.distinct + ', ' + l10.distinct);
  assert(coinsOver('slime', 1, 50).copper >= 50 * 10, 'a coin drop on every kill (at least a silver)');
});

test('coins: every enemy drops them, from its health, unless its table already has coins', () => {
  const hostile = run(`Object.values(AnimalDefs).filter(d => (d.hostile || d.boss) && !d.pony).map(d => d.id)`);
  assert(hostile.length > 10);
  for (const id of hostile) assert(run(`LootTables.current('creature:${id}').some(e => Coins.isCoin(e.item))`), id + ' has a coin entry');
  assert.strictEqual(run(`LootTables.current('creature:boss_cave_bear').filter(e => Coins.isCoin(e.item)).length`), 1, 'the bear keeps its own single coin entry');
  assert(coinsOver('wolf', 3, 20).copper > 0 && coinsOver('boss_cave_bear', 5, 5).copper > 0);
});

test('the General Store buys everything in your bag except coins, for coins in your purse', () => {
  assert(run(`Object.values(ItemDefs).filter(d => !Coins.isCoin(d.id)).every(d => Shops.sellPrice(d.id) >= 1)`), 'every item has a sell price');
  assert.strictEqual(run(`Shops.sellPrice('gold_coin')`), 0);
  assert.strictEqual(run(`Shops.sellPrice('goo')`), 12, 'an item\'s own sell value');
  assert.strictEqual(run(`Shops.sellPrice('satchel')`), run(`Math.round(Shops.coinPrice(Shops.price('satchel')) * 0.4)`), '40% of what it costs');
  const r = run(`(() => {
    const s = new GameServer(4242), id = s.addPlayer(), p = s.players[id], site = BuildingSites.list.find(b => b.def.shop), grid = Grids.room(site.index), world = s.grids.get(grid);
    const f = world.plan.layout.furniture.find(g => FurnitureDefs.get(g.id) && FurnitureDefs.get(g.id).shop);
    s._moveToGrid(id, p, grid, f.x + f.w / 2, f.y + f.h + 0.4);
    const inv = s.inventories[id]; for (const sl of inv.toJSON()) if (sl) inv.remove(sl.id, sl.count); const before = inv.purse; inv.add('goo', 7); inv.add('bone', 3);
    s._sell(id, 'goo', 3); const afterOne = inv.purse - before, gooLeft = inv.count('goo');
    s._sell(id, 'goo', 9999); s._sell(id, 'bone', 1); s._sell(id, 'gold_coin', 5);
    const notice = s.pendingEvents.filter(e => e.type === 'sold').length;
    p.x += 40; s._sell(id, 'bone', 1);
    return { afterOne, gooLeft, gooNow: inv.count('goo'), boneNow: inv.count('bone'), gained: inv.purse - before, sold: notice, coinSold: inv.count('gold_coin') };
  })()`);
  assert.strictEqual(r.afterOne, 36); assert.strictEqual(r.gooLeft, 4); assert.strictEqual(r.gooNow, 0); assert.strictEqual(r.boneNow, 2, 'sold one bone only, and none away from the counter');
  assert.strictEqual(r.sold, 3, 'three sales; coins and the far-away try did nothing');
});

console.log(`${passed} passed`);
