'use strict';
/* TOOLS - checks energy, sleeping, camping and the night's moon ponies in Node (no browser):  node tools/test-sleep.js
 * energy drains awake; food gives some back but never past the eating cap; you sleep whenever you are tired (no bedtime, nobody is put to bed); camping needs woods and no danger;
 * sleep fills energy and wakes you rested; the night is skipped when everyone sleeps; moon ponies come only at night and leave with the dawn unless caught. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const clockAt = hour => run(`GameSettings.setClock(S.tick, ${hour})`);
const steps = n => run(`for (let i = 0; i < ${n}; i++) S.step()`);
const secs = n => steps(Math.round(n * run('CONFIG.sim.tickRate')));
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

run(`globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.PA = S.players[A];
globalThis.homeBed = () => { const site = BuildingSites.list.find(b => b.def.instance === 'player'); if (!site) return null; const grid = S.interiors.gridFor(A, site), room = S.grids.get(grid); const bed = room.grid === grid ? Sleep.bedOf(room) : null; return bed ? { grid, bed } : null; };
globalThis.woods = (clean) => {                                   // a spot in the overworld with trees around it
  for (let r = 6; r < 200; r += 3) for (let a = 0; a < 6.28; a += 0.35) {
    const x = Village.spawns[0].x + Math.cos(a) * r, y = Village.spawns[0].y + Math.sin(a) * r;
    S.map.ensureAround(x, y, 3);
    const tile = S.map.tile(Math.floor(x), Math.floor(y));
    if (isWaterTile(tile) || S.map.navBlocked(Math.floor(x), Math.floor(y))) continue;
    if (Sleep.treesAround(S.map, { x, y }) < CONFIG.sim.sleep.campTrees) continue;
    if (clean) { PA.x = x; PA.y = y; S.animals.animals = {}; PA.energy = 20; const f = Interactions.find(S.map, {}, PA, '', S.animals.animals, A, {}, {}); if (!f || f.kind !== 'camp') continue; }
    return { x, y };
  }
  return null;
};
globalThis.open = () => { for (let r = 3; r < 100; r += 2) for (let a = 0; a < 6.28; a += 0.5) {
    const x = Village.spawns[0].x + Math.cos(a) * r, y = Village.spawns[0].y + Math.sin(a) * r;
    S.map.ensureAround(x, y, 3);
    if (!isWaterTile(S.map.tile(Math.floor(x), Math.floor(y))) && !S.map.navBlocked(Math.floor(x), Math.floor(y)) && Sleep.treesAround(S.map, { x, y }, 5) === 0) return { x, y };
  } return null; };
globalThis.at = pt => { PA.x = pt.x; PA.y = pt.y; PA.vx = PA.vy = 0; S.animals.animals = {}; };`);

test('a day is 20% longer: 150 game hours per real hour', () => {
  assert.strictEqual(run('GameSettings.values.gameHoursPerRealHour'), 150);
  assert.strictEqual(run('CONFIG.sim.time.dayLengthSeconds'), 576);
});

test('energy drains while awake, whatever the hunger and thirst switch says', () => {
  assert.strictEqual(run('CONFIG.sim.vitals'), false);
  run('PA.energy = CONFIG.sim.energy.max'); secs(60);
  const e = run('PA.energy'); assert(e < 100 && e > 95, 'about 3 points in a minute, got ' + e);
});

test('food gives back some energy, but eating alone stops at the eating cap', () => {
  run('PA.energy = 30; PA.eatT = 0; PA.held = "apple"'); run(`S.inventories[A].add('apple', 30)`);
  const eat = () => { run('PA.eatT = 0; PA.held = "apple"; S.vitals.consumeHeld(A, PA, S.inventories[A], { action: true }, TICK_DT)'); return run('PA.energy'); };
  const first = eat(); assert(first > 30, 'an apple restores some energy');
  let last = first; for (let i = 0; i < 20; i++) last = eat();
  assert(last <= run('CONFIG.sim.energy.eatMax') + 1e-9, 'food alone never lifts you past ' + run('CONFIG.sim.energy.eatMax') + ', got ' + last);
  assert(last > 50, 'but it does get you close');
});

test('the energy bar is saved with the character and loaded back', () => {
  run('PA.energy = 41');
  const saved = run('SaveData.sanitizeCharacter(JSON.parse(JSON.stringify(SaveData.exportCharacter(S, A))))');
  assert.strictEqual(saved.energy, 41);
});

test('no bedtime and no forced sleep: awake and tired at 02:00 you stay on your feet', () => {
  run('PA.energy = 10; PA.asleep = false'); clockAt(2); secs(30);
  assert.strictEqual(run('PA.asleep'), false);
  clockAt(1.9); secs(5); assert.strictEqual(run('PA.asleep'), false);
});

test('the bed: any hour when tired, refused when rested', () => {
  const home = run('!!homeBed()');
  if (!home) { console.log('       (no home room drawn in this world: bed checks skipped)'); return; }
  run('(() => { const h = homeBed(); S._moveToGrid(A, PA, h.grid, h.bed.cx + 1, h.bed.cy); })()');
  clockAt(13); run('PA.energy = 100'); run('S.sleep.useBed(A, PA)'); assert.strictEqual(run('PA.asleep'), false, 'rested: not tired');
  run('PA.energy = 20'); run('S.sleep.useBed(A, PA)'); assert.strictEqual(run('PA.asleep'), true, 'tired at midday: you may sleep');
  secs(60); assert.strictEqual(run('PA.asleep'), false, 'woke up by itself'); assert(run('PA.energy') > 98, 'rested');
});

test('camping: needs woods, and gets you energy back; the woods and a campfire are warmer', () => {
  const spot = run('woods()'); assert(spot, 'found woods'); run('S._moveToGrid ? 0 : 0'); run(`PA.grid = ''`);
  run(`at(woods(true))`); clockAt(14);
  run('PA.energy = 100'); run('S.sleep.camp(A, PA)'); assert.strictEqual(run('PA.asleep'), false, 'not tired: no camping');
  run('PA.energy = 30'); const a = run('Interactions.find(S.map, {}, PA, "", S.animals.animals, A, {}, {})'); assert(a && a.kind === 'camp', 'the Camp button shows when tired in the woods: ' + JSON.stringify(a && a.kind));
  run('S.sleep.camp(A, PA)'); assert.strictEqual(run('PA.asleep && PA.camping'), true);
  secs(5); const e1 = run('PA.energy'); assert(e1 > 30 + 5, 'resting fills energy, got ' + e1);
  secs(60); assert.strictEqual(run('PA.asleep'), false, 'rested: awake'); assert(run('PA.energy') > 97, 'rested');
});

test('camping is refused in the open and with something dangerous near', () => {
  run('at(open())'); run('PA.energy = 20');
  assert.strictEqual(run('Interactions.find(S.map, {}, PA, "", S.animals.animals, A, {}, {})'), null, 'no Camp button in the open');
  run('S.sleep.camp(A, PA)'); assert.strictEqual(run('PA.asleep'), false);
  run('at(woods())'); run('PA.energy = 20');
  const id = run('S.animals.spawn("spider", PA.x + 4, PA.y)');
  assert.strictEqual(run('Sleep.campProblem(S.map, PA, S.animals.animals) !== ""'), true, 'a spider near: unsafe');
  run('S.sleep.camp(A, PA)'); assert.strictEqual(run('PA.asleep'), false);
});

test('a hurt sleeper wakes up', () => {
  run('at(woods())'); run('PA.energy = 20; PA.hp = PA.maxHp'); clockAt(14); run('S.sleep.camp(A, PA)'); assert.strictEqual(run('PA.asleep'), true);
  steps(3); run('PA.hp -= 5'); steps(2);
  assert.strictEqual(run('PA.asleep'), false);
});

test('everyone asleep at night: the rest of the night is skipped and they wake rested', () => {
  run('at(woods())'); run('PA.energy = 40; PA.hp = PA.maxHp'); clockAt(23.5); run('S.sleep.camp(A, PA)'); assert.strictEqual(run('PA.asleep'), true);
  secs(4);
  assert.strictEqual(run('PA.asleep'), false); assert(run('PA.energy') > 99, 'rested');
  const hour = run('DayCycle.hourAt(S.tick)'); assert(Math.abs(hour - 6) < 0.2, 'woke at morning, got ' + hour);
});

test('moon ponies: only at night, super rare, gone with the dawn unless caught', () => {
  assert(run('CONFIG.sim.night.moonPonyChance') <= 0.05, 'super rare');
  run('at(open()); PA.asleep = false; S.nightEvents.rolled = {}'); run('CONFIG.sim.night.moonPonyChance = 1'); clockAt(14);
  run('S.tick = Math.ceil(S.tick / 60) * 60; S.nightEvents.update(S.tick)');
  assert.strictEqual(run('S.nightEvents.moonPonies().length'), 0, 'none by day');
  clockAt(0); for (let i = 0; i < 6 && !run('S.nightEvents.moonPonies().length'); i++) run('S.nightEvents.update(Math.ceil(S.tick / 60) * 60 + ' + i * 60 + ')');         // (a won night keeps looking for room)
  assert.strictEqual(run('S.nightEvents.moonPonies().length'), 1, 'one comes in the night');
  const moon = run('(() => { const a = S.nightEvents.moonPonies()[0]; return { epic: PonyRarity.of(a.look, a.type).rarity.order >= 3, variant: PonyLook.describe(a.look).variantId }; })()');
  assert(moon.epic, 'an epic (or better) pony'); assert.strictEqual(moon.variant, 'moon');
  run('S.nightEvents.update(Math.ceil(S.tick / 60) * 60)'); assert.strictEqual(run('S.nightEvents.moonPonies().length'), 1, 'one roll per night');
  run('S.nightEvents.moonPonies()[0].captor = A');                                                     // caught!
  clockAt(10); run('S.nightEvents.update(Math.ceil(S.tick / 60) * 60)');
  assert.strictEqual(run('Object.values(S.animals.animals).filter(a => a.type === "pony_moon").length'), 1, 'a caught moon pony stays');
  run('Object.values(S.animals.animals).find(a => a.type === "pony_moon").captor = ""; S.nightEvents.update(Math.ceil(S.tick / 60) * 60)');
  assert.strictEqual(run('Object.values(S.animals.animals).filter(a => a.type === "pony_moon").length'), 0, 'a wild one fades at dawn');
});

console.log(passed + ' passed');
