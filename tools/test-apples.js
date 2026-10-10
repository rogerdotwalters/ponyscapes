'use strict';
/* TOOLS - checks the Apple button in Node (no browser):  node tools/test-apples.js
 * an apple heals the pony at once, special apples add effects, the player only gets health regeneration, and nothing is wasted. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
/** The host riding (or standing beside) an own pony that has lost half its health, with `apples` of each kind in the bag. */
const setup = (apples, ride = true) => run(`(() => {
  globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.PA = S.players[A];
  const inv = S.inventories[A]; for (const sl of inv.toJSON()) if (sl) inv.remove(sl.id, sl.count);
  for (const [item, n] of Object.entries(${JSON.stringify(apples)})) inv.add(item, n);
  for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];          // (the testing starter pony)
  const id = S.animals.spawn('pony_plain', PA.x + 1, PA.y, 0, { level: 4 }), a = S.animals.animals[id];
  a.owner = A; a.maxHp = 40; a.hp = 20; globalThis.PONY = a;
  if (${ride}) { a.rider = A; PA.mount = id; PA.mountLevel = 4; }
  PA.hp = 50; PA.maxHp = 100; PA.abilityCd = [10, 8, 0, 0]; PA.hunger = 50; PA.thirst = 50;
  return id;
})()`);
const give = item => run(`S._giveApple(A, '${item}')`);
const count = item => run(`S.inventories[A].count('${item}')`);

test('every apple has a pony block, and the special ones do more than heal', () => {
  const kinds = run('AppleRules.kinds()'); assert(kinds.length >= 7, kinds.join());
  assert.strictEqual(run(`AppleRules.of('apple').heal`), 0.3); assert.strictEqual(run(`AppleRules.special('apple')`), false);
  for (const id of ['golden_apple', 'pink_apple', 'crystal_apple', 'russet_apple']) assert(run(`AppleRules.special('${id}')`), id);
  assert.strictEqual(run(`AppleRules.kinds()[0]`), run(`AppleRules.kinds().find(id => !AppleRules.special(id))`), 'plain ones come first');
});

test('an apple heals the pony you ride at once (30%), is used up, and the player only gets regeneration', () => {
  setup({ apple: 3 }); give('apple');
  assert.strictEqual(run('PONY.hp'), 32, '20 + 30% of 40'); assert.strictEqual(count('apple'), 2);
  assert.strictEqual(run('PA.hp'), 50, 'no instant health for the player'); assert.strictEqual(run('PA.hunger'), 50); assert.strictEqual(run('PA.thirst'), 50);
  assert(run('PA.regenT') > 0 && run('PA.regenRate') > 0, 'regeneration started');
  run('for (let i = 0; i < 30 * 3; i++) S._tickPlayer(A, PA)'); assert(run('PA.hp') > 50 && run('PA.hp') < 60, 'a trickle: ' + run('PA.hp'));
  run('for (let i = 0; i < 30 * 20; i++) S._tickPlayer(A, PA)'); assert.strictEqual(run('PA.regenT'), 0, 'it ends'); assert.strictEqual(run('PA.regenRate'), 0);
});

test('with no pony hurt, a plain apple is not wasted; a special one still works', () => {
  setup({ apple: 1, golden_apple: 1 }); run('PONY.hp = PONY.maxHp');
  give('apple'); assert.strictEqual(count('apple'), 1, 'kept'); assert(run(`S.pendingEvents.some(e => e.type === 'notice' && /full health/.test(e.text))`));
  give('golden_apple'); assert.strictEqual(count('golden_apple'), 0, 'a golden apple has more to give');
});

test('special apples: golden speeds the rider, pink and crystal cut power cooldowns, crystal heals fully, russet trains the pony', () => {
  setup({ golden_apple: 1 }); give('golden_apple'); assert(run('PA.dashT') > 10 && run('PA.dashBoost') === 40); assert.strictEqual(run('PONY.hp'), 40, '50% of 40 is 20: 20 + 20');
  setup({ pink_apple: 1 }); give('pink_apple'); same(run('PA.abilityCd'), [5, 4, 0, 0]);
  setup({ crystal_apple: 1 }); give('crystal_apple'); assert.strictEqual(run('PONY.hp'), 40); same(run('PA.abilityCd'), [0, 0, 0, 0]); assert(run('PA.dashT') > 0);
  setup({ russet_apple: 1 }); const xp = () => run('(PONY.xp || 0) + (PONY.level || 0) * 1000'); const before = xp(); give('russet_apple'); assert(xp() > before, 'xp or a level');
});

test('with no ridden pony the nearest own pony close by gets it; far away or none: nothing is used up', () => {
  setup({ apple: 2 }, false); give('apple'); assert.strictEqual(run('PONY.hp'), 32); assert.strictEqual(count('apple'), 1);
  run('PONY.x += 30'); give('apple'); assert.strictEqual(count('apple'), 1, 'too far'); assert(run(`S.pendingEvents.some(e => e.type === 'notice' && /next to it/.test(e.text))`));
  setup({}); give('apple'); assert(run(`S.pendingEvents.some(e => e.type === 'notice' && /no apples/.test(e.text))`));
  setup({ log: 1 }); give('log'); assert.strictEqual(count('log'), 1, 'only apples');
});

test('the command works, and the button picks the plainest apple unless you choose another', () => {
  setup({ apple: 1, crab_apple: 2, golden_apple: 1 });
  const has = item => count(item);
  const carried = run(`AppleRules.carried(item => S.inventories[A].count(item))`);
  assert.strictEqual(run(`AppleRules.pick(AppleRules.carried(item => S.inventories[A].count(item)), '')`), run(`AppleRules.kinds().find(id => !AppleRules.special(id) && S.inventories[A].count(id) > 0)`));
  assert.strictEqual(run(`AppleRules.pick(AppleRules.carried(item => S.inventories[A].count(item)), 'golden_apple')`), 'golden_apple');
  assert.strictEqual(run(`AppleRules.pick([], 'golden_apple')`), '');
  run(`S.receiveCommand(A, { type: 'apple', item: 'apple' })`); assert.strictEqual(run('PONY.hp'), 32);
});

test('a downed player cannot use it', () => {
  setup({ apple: 1 }); run('PA.down = 5'); give('apple'); assert.strictEqual(count('apple'), 1);
});

console.log(`${passed} passed`);
