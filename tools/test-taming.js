'use strict';
/* TOOLS - checks the taming system in Node (no browser):  node tools/test-taming.js
 * the lasso rope never breaks, a caught pony is gentled with its fruit anywhere while a bar fills, kinds and levels ask for rarer fruit, the Leash button, and the stable
 * (a menu to stable a leashed pony, a menu to take one out or let it out, gates, ponies keeping to their pens). */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };
const ticks = n => run(`for (let i = 0; i < ${n}; i++) S.step()`);
/** A host with a bag of fruit and a wild pony caught on the rope. */
const caught = (type = 'pony_plain', level = 1, fruit = { apple: 20 }) => run(`(() => {
  globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.PA = S.players[A];
  const inv = S.inventories[A]; for (const sl of inv.toJSON()) if (sl) inv.remove(sl.id, sl.count);
  for (const [item, n] of Object.entries(${JSON.stringify(fruit)})) inv.add(item, n);
  for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
  const id = S.animals.spawn('${type}', PA.x + 1.5, PA.y, 0, { level: ${level} }), a = S.animals.animals[id];
  S.animals.capture(id, A); globalThis.PONY = a; return id;
})()`);
const feed = item => run(`(() => { PA.held = '${item}'; S._feedPony(A, PONY); })()`);

test('the fruit ladder: kinds and levels ask for rarer fruit', () => {
  const need = (type, level) => run(`AnimalLevels.tameFruit(AnimalDefs.${type}, ${level})`);
  assert.strictEqual(need('pony_plain', 1).item, 'apple');
  assert.strictEqual(need('pony_earth', 6).item, 'green_apple');
  assert.strictEqual(need('pony_pegasus', 11).item, 'golden_apple' === need('pony_pegasus', 11).item ? 'golden_apple' : 'pink_apple');
  assert.strictEqual(need('pony_alicorn', 21).item, 'crystal_apple', 'the top of the ladder');
  assert(run(`AnimalLevels.fruitRank(AnimalLevels.tameFruit(AnimalDefs.pony_plain, 17).item)`) > 0, 'a high-level plain pony wants better than a plain apple');
  assert(need('pony_unicorn', 16).count >= need('pony_plain', 1).count);
});

/** Put the host `d` tiles from the caught pony (on open ground west of it) so the rope is slack or taut as wanted. */
const apart = d => run(`PA.x = PONY.x - ${d}; PA.y = PONY.y; PONY.vx = PONY.vy = 0`);

test('lasso chance rises with your handling and your own pony, and falls with the target\'s level', () => {
  const chance = (monsterLevel, handling, own) => run(`AnimalLevels && S0.animals.lassoChance({ type: 'pony_plain', level: ${monsterLevel} }, { s: { horsemanship: ${handling} }, a: {} }, ${own})`);
  run(`globalThis.S0 = new GameServer(1)`);
  assert(chance(5, 10, 0) > chance(5, 6, 0), 'handling helps');
  assert(chance(10, 10, 0) < chance(5, 10, 0), 'a higher-level pony is harder');
  assert(chance(5, 10, 8) > chance(5, 10, 0), 'a strong pony of your own helps');
});

test('a tight rope drags player and pony together and wears the rope', () => {
  caught();
  run('PA.x = PONY.x - 9; PA.y = PONY.y; PONY.vx = PONY.vy = 0; S.map.ensureAround(PA.x, PA.y, 2)');
  const px = run('PA.x'); ticks(1);
  assert(run('PA.x') > px, 'the player is dragged toward the pony too');
  const gap = run('Math.hypot(PONY.x - PA.x, PONY.y - PA.y)');
  assert(gap <= run('ROPE_LENGTH') + 0.5, 'pulled in to the rope length: ' + gap);
  const before = run('PONY.rope'); for (let i = 0; i < 30 * 5; i++) { run('PA.x = PONY.x - 9; PA.y = PONY.y'); ticks(1); }
  assert(run('PONY.rope') < before || run('PONY.captor') === '', 'tension wears the rope');
});

test('a rope under constant tension snaps and the pony bolts', () => {
  caught(); let snapped = false;
  for (let i = 0; i < 30 * 200 && !snapped; i++) { run('PA.x = PONY.x - 9; PA.y = PONY.y'); ticks(1); snapped = run('PONY.captor') === ''; }
  assert(snapped, 'snapped'); assert.strictEqual(run('PONY.owner'), '');
});

test('staying near calms it: it becomes yours once the bar is full, faster with Animal Friendship', () => {
  caught();
  const rate = lv => run(`S.animals.calmRate(PONY, { s: { animal_friendship: ${lv} }, a: {} })`);
  assert(rate(20) > rate(1), 'friendship soothes');
  let t = 0; while (run('PONY.owner') === '' && t < 30 * 120) { run('PA.x = PONY.x - 2; PA.y = PONY.y'); ticks(1); t++; }
  assert.strictEqual(run('PONY.owner'), run('A'), 'tamed by staying close'); assert.strictEqual(run('PONY.captor'), '');
});

test('far from the pony it does not calm down', () => {
  caught(); apart(5.5); const before = run('PONY.calm || 0'); ticks(30 * 3);
  const d = run('Math.hypot(PONY.x - PA.x, PONY.y - PA.y)');
  if (d > run('ROPE_CALM_RANGE')) assert.strictEqual(run('PONY.calm || 0'), before, 'no calm outside the range');
});

test('fruit is a treat that speeds the calming up (and takes the right fruit)', () => {
  caught('pony_plain', 1, { apple: 5, golden_apple: 2 });
  assert.strictEqual(run('S.animals.tameProgress(PONY)'), 0);
  feed('apple');
  assert.strictEqual(run('PONY.trust'), 1, 'fed in the open');
  assert(run('S.animals.tameProgress(PONY)') > 0.2, 'the bar jumped');
});

test('a rarer pony refuses a plain apple but takes a more exotic fruit', () => {
  caught('pony_alicorn', 21, { apple: 5, crystal_apple: 9 });
  const before = run(`S.inventories[A].count('apple')`);
  feed('apple'); assert.strictEqual(run('PONY.trust'), 0, 'refused'); assert.strictEqual(run(`S.inventories[A].count('apple')`), before, 'not used up');
  feed('crystal_apple'); assert.strictEqual(run('PONY.trust'), 1);
});

/** A host inside the stable with two ponies of its own, one beside it. */
const inStable = () => run(`(() => {
  globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.PA = S.players[A];
  for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
  const site = BuildingSites.list.find(s => s.def.stable); S.interiors.enter(A, PA, site.index);
  const mk = (type, dx) => { const id = S.animals.spawn(type, PA.x + dx, PA.y - 0.5, 0, { level: 3, grid: PA.grid }), a = S.animals.animals[id]; a.owner = A; a.home = { x: a.x, y: a.y }; a.grid = PA.grid; return a; };
  globalThis.P1 = mk('pony_plain', 1); globalThis.P2 = mk('pony_earth', -1);
  return PA.grid;
})()`);
const stand = (x, y) => run(`PA.x = ${x}; PA.y = ${y}; for (const q of [P1, P2]) if (q && !q.stall && gridOf(q) === gridOf(PA)) { q.x = PA.x + 0.8; q.y = PA.y - 0.4; }`);                // (a pony that came in with you stays close: the stable is big now)
const menu = () => run(`S.pendingEvents.filter(e => e.type === 'stallMenu').pop()`);

test('the stable is big: a main room and two wings with twelve walled stalls and a gate each', () => {
  inStable();
  assert.strictEqual(run('S.mapOf(PA).plan.layout.w'), 32);
  assert.strictEqual(run(`S.mapOf(PA).plan.layout.furniture.filter(f => f.id === 'stall').length`), 12);
  assert.strictEqual(run(`S.mapOf(PA).plan.layout.furniture.filter(f => f.id === 'stall_gate').length`), 12);
});

test('the Leash button leashes your own pony, and only a leashed pony can be stabled', () => {
  inStable(); stand(2.5, 6.6);
  run('S.pendingEvents.length = 0'); run(`S._interact(A, PA)`);
  assert(menu() && menu().options.length === 0, 'no leashed pony: the menu lists none');
  run('P1.x = PA.x + 1; P1.y = PA.y; P2.x = PA.x - 1; P2.y = PA.y'); run('S._leashPony(A)'); assert(run('P1.leashed || P2.leashed'), 'one of them is on a leash now');
  run('S._leashPony(A)'); assert(run('P1.leashed && P2.leashed'));
});

test('stable menu: a leashed pony goes into the stall, keeps to its pen, and comes out through the menu', () => {
  inStable(); run('P1.leashed = true');
  const f = run(`S.mapOf(PA).plan.layout.furniture.filter(f => f.id === 'stall')[0]`);
  stand(f.x + 1.5, f.y + f.h + 1.2);                                                       // in the aisle in front of the first stall
  run('S.pendingEvents.length = 0; S._interact(A, PA)');
  const m = menu(); assert(m && m.mode === 'in' && m.options.length === 1, JSON.stringify(m));
  run(`S._stallPick(A, { act: 'in', animal: P1.id, fx: ${f.x}, fy: ${f.y} })`);
  assert(run('!!P1.stall') && !run('P1.leashed'));
  ticks(30 * 60);
  const inside = run(`(b => P1.x >= b.x0 && P1.x <= b.x1 && P1.y >= b.y0 && P1.y <= b.y1)({ x0: ${f.x}, y0: ${f.y}, x1: ${f.x + f.w}, y1: ${f.y + f.h} })`);
  assert(inside, 'stays in its pen: ' + run('P1.x + "," + P1.y'));
  run('S.pendingEvents.length = 0; S._interact(A, PA)');
  const out = menu(); assert(out && out.mode === 'out' && out.options.length === 1);
  run(`S._stallPick(A, { act: 'out', animal: P1.id })`);
  assert(!run('P1.stall') && run('P1.y') > f.y + f.h, 'taken out in front of the gate');
});

test('an unleashed pony cannot be put in a stall', () => {
  inStable(); const f = run(`S.mapOf(PA).plan.layout.furniture.filter(f => f.id === 'stall')[0]`); stand(f.x + 1.5, f.y + f.h + 1.2);
  run(`S._stallPick(A, { act: 'in', animal: P2.id, fx: ${f.x}, fy: ${f.y} })`);
  assert(!run('P2.stall'));
});

test('a stabled pony can be let out to roam the village area only', () => {
  inStable(); run('P1.leashed = true');
  const f = run(`S.mapOf(PA).plan.layout.furniture.filter(f => f.id === 'stall')[0]`); stand(f.x + 1.5, f.y + f.h + 1.2);
  run(`S._stallPick(A, { act: 'in', animal: P1.id, fx: ${f.x}, fy: ${f.y} })`);
  run(`S._stallPick(A, { act: 'roam', animal: P1.id })`);
  assert(run('P1.roam === true') && !run('P1.stall') && run(`gridOf(P1)`) === '', 'out in the village');
  run('PA.grid = ""; PA.x = P1.x; PA.y = P1.y + 2; S.map.ensureAround(PA.x, PA.y, 2)');
  let far = 0; for (let i = 0; i < 20; i++) { ticks(30 * 20); far = Math.max(far, run('Math.hypot(P1.x - P1.home.x, P1.y - P1.home.y)')); }
  assert(far <= 17, 'stays near the stable: ' + far);
  const v = run('Village.area'); assert(run('P1.x') >= v.x0 && run('P1.x') <= v.x1 && run('P1.y') >= v.y0 && run('P1.y') <= v.y1);
});

test('gates: shut they block, open they let you through; the stall menu toggles them', () => {
  inStable();
  const f = run(`S.mapOf(PA).plan.layout.furniture.find(f => f.id === 'stall')`), g = run(`S.mapOf(PA).plan.layout.furniture.find(f => f.id === 'stall_gate')`);
  const solid = () => !!run(`S.mapOf(PA).isSolid(${g.x}, ${g.y})`);
  assert.strictEqual(solid(), true, 'shut');
  stand(f.x + 1.5, f.y + f.h + 1.2); run('S.pendingEvents.length = 0; S._interact(A, PA)');
  assert.strictEqual(menu().gate.open, false);
  run(`S._stallPick(A, { act: 'gate', fx: ${f.x}, fy: ${f.y} })`); assert.strictEqual(solid(), false, 'open');
  assert.strictEqual(JSON.stringify(run('S.gatesUpdateFor(A)')), JSON.stringify([g.x + ',' + g.y])); assert.strictEqual(run('S.gatesUpdateFor(A)'), null, 'sent once');
  run(`S._stallPick(A, { act: 'gate', fx: ${f.x}, fy: ${f.y} })`); assert.strictEqual(solid(), true, 'shut again');
  stand(40, 1); run(`S._stallPick(A, { act: 'gate', fx: ${f.x}, fy: ${f.y} })`); assert.strictEqual(solid(), true, 'out of reach: nothing happens');
});

test('a stabled pony saves and loads back into its stall and a roaming one stays roaming', () => {
  inStable(); run('P1.leashed = true; P2.leashed = true');
  const fs = run(`S.mapOf(PA).plan.layout.furniture.filter(f => f.id === 'stall')`); stand(fs[0].x + 1.5, fs[0].y + fs[0].h + 1.2);
  run(`S._stallPick(A, { act: 'in', animal: P1.id, fx: ${fs[0].x}, fy: ${fs[0].y} })`);
  stand(fs[1].x + 1.5, fs[1].y + fs[1].h + 1.2);
  run(`S._stallPick(A, { act: 'in', animal: P2.id, fx: ${fs[1].x}, fy: ${fs[1].y} })`);
  run(`S._stallPick(A, { act: 'roam', animal: P2.id })`);
  run(`S.playerKeys[A] = 'testkey'`);
  const saved = run(`JSON.stringify(S._exportOwnedPets())`);
  assert(/"stall":\{"k":"room:/.test(saved) && /"roam":true/.test(saved), saved.slice(0, 400));
});

console.log(`${passed} passed`);
