'use strict';
/* TOOLS - checks the slime castle and the Smithy in Node (no browser):  node tools/test-castle.js
 * the ruined castle's slimes, the trapdoor to the Slime Cellars, their waves and the Slime Baron, and the blacksmith's swords. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
const world = () => run(`(() => { globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.PA = S.players[A]; globalThis.CASTLE = BuildingSites.list.find(b => b.id === 'castle'); return CASTLE.index; })()`);
const roomGrid = key => run(`Grids.room(CASTLE.index, Grids.roomKeys(CASTLE).indexOf('${key}'))`);
const into = (key, x, y) => run(`S._moveToGrid(A, PA, '${roomGrid(key)}', ${x}, ${y})`);
const slimesIn = grid => run(`Object.values(S.animals.animals).filter(a => a.type === 'slime' && a.grid === '${grid}').map(a => a.level)`);

test('the ruined castle fills with slimes the first time a room is entered: more in big rooms, tougher deeper in', () => {
  world();
  into('gatehall', 6.5, 6.5); const gate = slimesIn(roomGrid('gatehall'));
  into('greathall', 7.5, 9.5); const hall = slimesIn(roomGrid('greathall'));
  into('pantry', 3.5, 4.5); const pantry = slimesIn(roomGrid('pantry'));
  assert(gate.length >= 2 && hall.length >= gate.length && pantry.length >= 2, [gate.length, hall.length, pantry.length].join());
  assert(hall.every(l => l === 5) && gate.every(l => l === 3), 'levels by room');
  assert.strictEqual(slimesIn(roomGrid('library')).length, 0, 'rooms nobody has entered stay empty');
  into('gatehall', 6.5, 6.5); assert.strictEqual(slimesIn(roomGrid('gatehall')).length, gate.length, 'not again');
});

test('slimes are not on the way in, and not inside furniture', () => {
  world(); into('greathall', 7.5, 10.5);
  const bad = run(`(() => { const plan = S.grids.get('${roomGrid('greathall')}').plan, out = []; for (const a of Object.values(S.animals.animals)) if (a.type === 'slime') { if (Math.hypot(a.x - 7.5, a.y - 10.5) < 3) out.push('near the door'); if (plan.solidAt(Math.floor(a.x), Math.floor(a.y))) out.push('in furniture'); } return out; })()`);
  same(bad, []);
});

test('restoring the castle clears the slimes for good; a restored castle never gets them', () => {
  world(); into('kitchen', 5.5, 6.5); assert(slimesIn(roomGrid('kitchen')).length > 0);
  run(`S.interiors.setRestored('castle', true)`); assert.strictEqual(run(`Object.values(S.animals.animals).filter(a => a.type === 'slime' && String(a.grid).startsWith('room:' + CASTLE.index)).length`), 0);
  into('kitchen', 5.5, 6.5); assert.strictEqual(slimesIn(roomGrid('kitchen')).length, 0, 'no slimes in the restored castle');
  run(`S.interiors.setRestored('castle', false)`); into('chapel', 4.5, 8.5); assert(slimesIn(roomGrid('chapel')).length > 0, 'ruined again: they come back');
});

test('the cellar has a trapdoor (ruined or restored) that leads down into the Slime Cellars, and back up to the cellar', () => {
  world();
  for (const restored of [false, true]) {
    run(`S.interiors.setRestored('castle', ${restored})`);
    const has = run(`Interiors.get(BuildingSites.list[CASTLE.index].def.rooms.cellar).furniture.some(f => f.id === 'trapdoor')`); assert(has, 'trapdoor, restored=' + restored);
  }
  run(`S.interiors.setRestored('castle', false)`); into('cellar', 6.5, 4.8);
  assert.strictEqual(run(`Interactions.find(S.mapOf(PA), {}, PA, '', {}, A).kind`), 'enter_crypt'); into('cellar', 1.5, 7.5); assert.notStrictEqual(run(`(Interactions.find(S.mapOf(PA), {}, PA, '', {}, A) || {}).kind`), 'enter_crypt', 'only at the trapdoor');
  into('cellar', 6.5, 4.8); run('S._interact(A, PA)');
  assert.strictEqual(run('PA.grid'), 'dungeon:2:0', 'down');
  const plan = run('S.mapOf(PA).plan'), spot = run('(p => p._landing(p.room.entrances))(S.mapOf(PA).plan)'); run(`PA.x = ${spot.x}; PA.y = ${spot.y}`); run('S.tick += 60; S._interact(A, PA)');
  assert.strictEqual(run('PA.grid'), roomGrid('cellar'), 'up again, into the cellar');
});

test('the Slime Cellars: three waves, each tougher; then the Slime Baron, who leaps and slams', () => {
  world(); run('S.dungeons.debugTeleport(A, PA, "crypt:0")'); assert.strictEqual(run('PA.grid'), 'dungeon:2:0');
  const w = run('Dungeons.all()[2].waves'); for (const k of ['max', 'level', 'total']) for (let i = 1; i < w.length; i++) assert(w[i][k] > w[i - 1][k], k);
  assert(run('Object.keys(S.dungeons.waves).length') === 1);
  for (let n = 0; n < 3; n++) {
    for (let i = 0; i < 60 && !run(`S.dungeons.cleared.has(PA.grid)`); i++) { run(`for (let t = 0; t < 150; t++) S.step(); for (const id of Object.keys(S.animals.animals)) { const a = S.animals.animals[id]; if (a.wave && a.grid === PA.grid) S.animals.damage(id, 99999); }`); }
    assert(run(`S.dungeons.cleared.has(PA.grid)`), 'level ' + (n + 1) + ' cleared');
    const spot = run('(p => p._landing(p.room.exits))(S.mapOf(PA).plan)'); run(`PA.x = ${spot.x}; PA.y = ${spot.y}; S.tick += 60; S._interact(A, PA)`);
  }
  assert.strictEqual(run('PA.grid'), 'dungeon:2:3', 'the arena');
  const baron = run(`(() => { const k = Object.values(S.animals.animals).find(a => a.type === 'slime_baron'); return k && { level: k.level }; })()`); assert(baron && baron.level === 9);
  run(`S.worldProgress && 0`); run(`(() => { const k = Object.values(S.animals.animals).find(a => a.type === 'slime_baron'); PA.x = k.x + 6; PA.y = k.y; PA.hp = PA.maxHp; })()`);
  const seen = new Set(); for (let i = 0; i < 30 * 10; i++) { run(`(() => { const k = Object.values(S.animals.animals).find(a => a.type === 'slime_baron'); PA.x = k.x + 6; PA.y = k.y; S.step(); })()`); seen.add(run(`Object.values(S.animals.animals).find(a => a.type === 'slime_baron').state`)); }
  for (const st of ['windup', 'jump', 'slam']) assert(seen.has(st), st);
  run(`S.animals.damage(Object.keys(S.animals.animals).find(id => S.animals.animals[id].type === 'slime_baron'), 999999)`);
  assert(run('S.pendingEvents.some(e => e.type === "kingDefeated")'));
});

test('the overworld still has just the two cave mouths (the cellars have none)', () => {
  world(); same(run('S.map.terrain.caveSites.caves().map(c => c.dungeon)'), ['cavern', 'slime_warren']);
});

test('the Smithy: a shop on the village edge where Hilda works, selling seven swords from fast to heavy', () => {
  world();
  const smithy = run(`(() => { const b = BuildingSites.list.find(x => x.id === 'blacksmith'); return b && { index: b.index, stock: Shops.stock(b) }; })()`);
  assert(smithy, 'a Smithy in the village'); assert.strictEqual(smithy.stock.length, 7);
  assert.strictEqual(run(`Npcs.get('blacksmith').works`), 'blacksmith');
  const price = id => run(`Shops.coinPrice(Shops.price('${id}'))`), damage = id => run(`ItemDefs.${id}.tool.damage`), swing = id => run(`ItemDefs.${id}.tool.swingTime`);
  assert(price('wooden_sword') < price('stone_sword') && price('stone_sword') < price('iron_sword') && price('iron_sword') < price('steel_sword') && price('steel_sword') < price('broadsword') && price('broadsword') < price('gilded_sword'));
  assert(damage('broadsword') > damage('steel_sword') && damage('steel_sword') > damage('iron_sword') && damage('iron_sword') > damage('stone_sword'));
  assert(swing('rapier') < swing('iron_sword') && swing('broadsword') > swing('iron_sword'), 'the rapier is quick, the broadsword slow');
  assert.strictEqual(run(`ItemDefs.broadsword.tool.kind`), 'sword');
});

test('buying a sword at the Smithy takes the coins; the Smithy does not buy things (only the General Store does)', () => {
  world();
  const r = run(`(() => {
    const site = BuildingSites.list.find(b => b.id === 'blacksmith'), grid = Grids.room(site.index), w = S.grids.get(grid), f = w.plan.layout.furniture.find(g => g.id === 'counter');
    S._moveToGrid(A, PA, grid, f.x + f.w / 2, f.y + f.h + 0.4);
    const inv = S.inventories[A]; for (const sl of inv.toJSON()) if (sl) inv.remove(sl.id, sl.count); inv.add('gold_coin', 100);
    const before = inv.purse; S._buy(A, 'iron_sword', Coins.empty().map((n, i) => (i === 4 ? 1 : 0)));
    const bought = inv.count('iron_sword'), paid = before - inv.purse;
    inv.add('rope', 2); S._sell(A, 'rope', 2);
    return { bought, paid, rope: inv.count('rope') };
  })()`);
  assert.strictEqual(r.bought, 1); assert.strictEqual(r.paid, 4000, 'a titanium coin put down, change given back'); assert.strictEqual(r.rope, 2, 'the Smithy does not buy rope');
});

console.log(`${passed} passed`);
