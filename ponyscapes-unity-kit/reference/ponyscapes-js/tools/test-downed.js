'use strict';
/* TOOLS - checks going down in a dungeon in Node (no browser):  node tools/test-downed.js
 * health 0 in a dungeon -> on your knees; the 7 second wait; snacks; a teammate picking you up; the village knock-out outside dungeons. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
/** Two players in the first dungeon room (or the overworld when `inside` is false), as { s, a, b, pa, pb }. */
const setup = inside => run(`(() => {
  const s = new GameServer(4242), a = s.addPlayer(), b = s.addPlayer(), mouth = s.map.terrain.caveSites.caves()[0];
  globalThis.S = s; globalThis.A = a; globalThis.B = b; globalThis.PA = s.players[a]; globalThis.PB = s.players[b];
  if (${inside}) for (const id of [a, b]) { const p = s.players[id]; p.x = mouth.x; p.y = mouth.y + 1.6; s.map.ensureAround(p.x, p.y, 2); s.tick += 40; s._interact(id, p); s.tick += 40; }
  return { a, b, grid: PA.grid };
})()`);
const secs = n => run(`for (let i = 0; i < ${Math.round(n * run('CONFIG.sim.tickRate'))}; i++) S._tickPlayer(A, PA)`);
/** Make room, add `item` to the pack, and return the hotbar slot it landed in (-1 if none). */
const onHotbar = item => run(`(() => { const inv = S.inventories[A]; inv.remove('knife', 1); inv.add('${item}', 3); for (let i = 0; i < CONFIG.sim.inventory.hotbarSlots; i++) if (inv.itemIdAt(i) === '${item}') return i; return -1; })()`);

test('health 0 in a dungeon: down on your knees with 7 seconds, hp stays 0, no teleport', () => {
  const r = setup(true); assert(r.grid.startsWith('dungeon:'));
  const out = run('(() => { const x = PA.x, y = PA.y; S._damagePlayer(A, 10000); return { down: PA.down, hp: PA.hp, grid: PA.grid, moved: PA.x !== x || PA.y !== y }; })()');
  assert.strictEqual(out.down, 7); assert.strictEqual(out.hp, 0); assert(out.grid.startsWith('dungeon:')); assert.strictEqual(out.moved, false);
  assert(run('S.pendingEvents.some(e => e.type === "downed" && e.to === A)'));
});

test('alone: after 7 seconds you get up with half health, and are safe for a moment', () => {
  setup(true); run('S._damagePlayer(A, 10000)');
  secs(6.5); assert(run('PA.down') > 0 && run('PA.hp') === 0);
  secs(1);
  assert.strictEqual(run('PA.down'), 0); assert(run('PA.hp') >= run('PA.maxHp') * 0.5 && run('PA.hp') < run('PA.maxHp') * 0.6);
  run('S._damagePlayer(A, 10000)'); assert(run('PA.hp') > 0 && run('PA.down') === 0, 'grace: nothing hurts you right after getting up');
  secs(2.1); run('S._damagePlayer(A, 10000)'); assert(run('PA.down') > 0, 'goes down again once the grace is over');
});

test('a downed player cannot move, and monsters skip them (hp 0)', () => {
  setup(true); run('S._damagePlayer(A, 10000)');
  const out = run('(() => { const x = PA.x; S.queueInput && 0; S._applyInput(A, { moveX: 1, moveY: 0, action: false, interact: false, slot: 0, seq: 1 }); return { dx: PA.x - x, hp: PA.hp, ack: PA.ack }; })()');
  assert.strictEqual(out.dx, 0); assert.strictEqual(out.hp, 0); assert.strictEqual(out.ack, 1);
});

test('snacks: eating shortens the wait and adds health for when you rise', () => {
  setup(true);
  run(`S._damagePlayer(A, 10000)`);
  const slot = onHotbar('apple'); assert(slot >= 0, 'the apple is on the hotbar');
  const eat = () => run(`S._applyInput(A, { moveX: 0, moveY: 0, action: true, interact: false, slot: ${slot}, seq: 2 })`);
  eat();
  const food = run(`ItemDefs.apple.food.hunger`), R = run('Downed.rules()');
  assert(Math.abs(run('PA.down') - (7 - food * R.snackSeconds)) < 1e-9, 'time shaved off');
  assert(Math.abs(run('PA.downHp') - food * R.snackHp) < 1e-9, 'health stored');
  assert.strictEqual(run('PA.hp'), 0, 'still down: hp stays 0 so monsters leave you alone');
  assert.strictEqual(run(`S.inventories[A].count('apple')`), 2);
  eat(); assert.strictEqual(run(`S.inventories[A].count('apple')`), 2, 'one at a time (eating takes a moment)');
  run('PA.down = 0.01'); secs(0.1);
  assert(run('PA.hp') >= run('PA.maxHp') * 0.5);
});

test('snacks: lots of food gets you up at once; non-food does nothing', () => {
  setup(true); run(`S._damagePlayer(A, 10000); PA.down = 1`);
  const slot = onHotbar('cooked_venison'); assert(slot >= 0);
  run(`S._applyInput(A, { moveX: 0, moveY: 0, action: true, interact: false, slot: ${slot}, seq: 3 })`);
  assert.strictEqual(run('PA.down'), 0, 'a big snack ends the wait');
  const dmg = run('PA.hp'); assert(dmg >= run('PA.maxHp') * 0.5);
  setup(true); run(`S._damagePlayer(A, 10000)`);
  run(`S._applyInput(A, { moveX: 0, moveY: 0, action: true, interact: false, slot: 0, seq: 4 })`);   // (slot 0 holds a tool)
  assert(run('PA.down') > 6.9);
});

test('a teammate picks you up with Interact, in any mode; the one on their feet is not blocked by being far away', () => {
  const r = setup(true);
  run('S.downed.setMode("hard")'); run('S._damagePlayer(A, 10000)');
  run('PB.x = PA.x + 3; PB.y = PA.y'); run('S._interact(B, PB)'); assert(run('PA.down') > 0, 'too far to reach');
  run('PB.x = PA.x + 1; PB.y = PA.y'); assert.strictEqual(run('Downed.findAlly(S.players, PB, B).who'), r.a);
  run('S._interact(B, PB)');
  assert.strictEqual(run('PA.down'), 0); assert.strictEqual(run('PA.hp'), run('PA.maxHp') * 0.5);
  assert(run('S.pendingEvents.some(e => e.type === "revived" && e.to === A && e.by === B)'));
  assert.strictEqual(run('Downed.findAlly(S.players, PB, B)'), null);
});

test('a downed player cannot pick anyone up; someone on another grid cannot either', () => {
  setup(true); run('S._damagePlayer(A, 10000); S._damagePlayer(B, 10000)'); run('PB.x = PA.x + 1; PB.y = PA.y');
  run('S._interact(B, PB)'); assert(run('PA.down') > 0 && run('PB.down') > 0);
  setup(true); run('S._damagePlayer(A, 10000)'); run('PB.grid = ""'); run('PB.x = PA.x; PB.y = PA.y');
  assert.strictEqual(run('Downed.findAlly(S.players, PB, B)'), null);
});

test('outside a dungeon nothing changes: knocked out, back at the village with half health', () => {
  setup(false); run('PA.x += 20; PA.y += 20');
  run('S._damagePlayer(A, 10000)');
  assert.strictEqual(run('PA.down'), 0); assert.strictEqual(run('PA.hp'), run('PA.maxHp') * 0.5);
  assert(run('S.pendingEvents.some(e => e.type === "died" && e.to === A)'));
});

test('every difficulty has downed rules (medium and hard borrow easy)', () => {
  for (const m of ['easy', 'medium', 'hard']) assert.strictEqual(run(`Downed.rules("${m}").seconds`), 7);
  assert.strictEqual(run('Downed.mode("nonsense")'), 'easy');
  setup(true); run('S.downed.setMode("hard")'); assert.strictEqual(run('S.settings.difficulty'), 'hard');
  run('S.downed.setMode("bogus")'); assert.strictEqual(run('S.downed.mode'), 'easy');
});

test('the host changes the mode with a command; others cannot', () => {
  const r = setup(true);
  run(`S.receiveCommand(B, { type: 'setDifficulty', mode: 'hard' })`); assert.strictEqual(run('S.downed.mode'), 'easy');
  run(`S.receiveCommand(A, { type: 'setDifficulty', mode: 'hard' })`); assert.strictEqual(run('S.downed.mode'), 'hard');
});

console.log(`${passed} passed`);
