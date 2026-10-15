'use strict';
/* TOOLS - checks quest waypoints and the Cave Bear quest in Node (no browser):  node tools/test-waypoints.js
 * The vet gives "The Lost Cubs" in town; its steps (find the cave, study the tracks, bring three cubs home, report back) each point somewhere. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const J = v => JSON.parse(JSON.stringify(v));
run(`(() => { globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.PA = S.players[A]; globalThis.vet = Object.values(S.npcs.npcs).find(n => n.type === 'veterinarian'); })()`);
const status = () => run(`QuestLog.status(S.quests.log, QuestDefs.get('bear_cubs'))`);
const step = () => run(`(() => { const c = QuestLog.current(S.quests.log, QuestDefs.get('bear_cubs')); return c ? c.index : -1; })()`);
const tick = () => run(`(() => { S.tick += 15 - (S.tick % 15); S.quests.update(S.tick); })()`);
const spot = () => J(run(`(() => { const g = { questLog: S.quests.wire && QuestLog.empty(), npcs: {}, worldMap: S.map, local: PA, treasureMaps: [], questMarks: [] }; g.questLog = S.quests.log; return Waypoints.questSpot(g, QuestDefs.get('bear_cubs'), QuestLog.current(S.quests.log, QuestDefs.get('bear_cubs')).step); })()`));

test('the Lost Cubs is the veterinarian\'s quest, open from the start, with a "!" over her head', () => {
  assert.strictEqual(status(), 'available');
  assert.strictEqual(run(`QuestLog.markerFor(S.quests.log, 'veterinarian')`), '!');
  assert.strictEqual(run(`QuestDefs.get('bear_cubs').giver`), 'veterinarian');
});

test('it is taken up in town, next to the vet', () => {
  run(`S.npcs._settle(vet, 'out'); PA.x = vet.x + 1; PA.y = vet.y; PA.grid = ''; S.quests.accept(A, 'bear_cubs')`);
  assert.strictEqual(status(), 'active'); assert.strictEqual(step(), 0);
});

test('step 1 points at the cave mouth, and is done by standing there', () => {
  const cave = J(run(`S.map.layers.dungeons.site(0)`)), at = spot();
  assert(cave && Math.hypot(at.x - cave.x, at.y - cave.y) < 0.01, 'waypoint on the cave');
  run(`PA.x = ${cave.x}; PA.y = ${cave.y + 1}; PA.grid = ''`); tick();
  assert.strictEqual(step(), 1);
});

test('step 2: the tracks (studied in the cave) are the next step, still pointing at the cave', () => {
  run(`S.wants.track(A, 0)`); tick();
  assert.strictEqual(step(), 2);
});

test('step 3 counts the cubs brought home, shows them on the way, and points at a tracked cub', () => {
  run(`S.wants.progress[0] = 2`); tick();
  assert.strictEqual(step(), 2); assert.strictEqual(run(`QuestLog.current(S.quests.log, QuestDefs.get('bear_cubs')).progress`), 2);
  assert.strictEqual(run(`QuestLog.countText(QuestLog.current(S.quests.log, QuestDefs.get('bear_cubs')).step, 2)`), ' (2/3)');
  const at = J(run(`(() => { const g = { questLog: S.quests.log, npcs: {}, worldMap: S.map, local: PA, treasureMaps: [], questMarks: [{ x: 70, y: 80, ring: 0, kind: 'lost' }] }; return Waypoints.questSpot(g, QuestDefs.get('bear_cubs'), QuestLog.current(S.quests.log, QuestDefs.get('bear_cubs')).step); })()`));
  assert.deepStrictEqual(at, { x: 70.5, y: 80.5 });
  run(`S.wants.progress[0] = 3`); tick();
  assert.strictEqual(step(), 3);
});

test('the last step goes back to the vet, who is where the villagers are; talking finishes it and pays out', () => {
  const at = J(run(`Waypoints.questSpot({ npcs: { n_v: { type: 'veterinarian', x: 33, y: 29 } }, worldMap: S.map }, QuestDefs.get('bear_cubs'), QuestDefs.get('bear_cubs').steps[3])`));
  assert.deepStrictEqual(at, { x: 33, y: 29 });
  assert.strictEqual(run(`QuestLog.markerFor(S.quests.log, 'veterinarian')`), '?');
  const coins = run(`S.inventories[A].count('gold_coin')`);
  run(`S.quests.onTalk(A, vet)`);
  assert.strictEqual(status(), 'done'); assert(run(`S.inventories[A].count('gold_coin')`) >= coins + 60 - 1);
});

test('a quest taken up AFTER the cave bear was calmed (or beaten) skips straight to reporting back', () => {
  run(`(() => { S.quests.log = QuestLog.empty(); S.wants.appeased[0] = true; S.quests.log.active.bear_cubs = { step: 1, progress: 0 }; })()`); tick();
  assert.strictEqual(step(), 3);
});

test('quest progress survives a save: the count of a cubs step is kept', () => {
  run(`(() => { S.wants.appeased = {}; S.wants.progress = {}; S.quests.log = QuestLog.empty(); S.quests.log.active.bear_cubs = { step: 2, progress: 2 }; })()`);
  const saved = J(run(`S.quests.exportState()`)); run(`S.quests.restore(${JSON.stringify(saved)})`);
  assert.strictEqual(run(`QuestLog.current(S.quests.log, QuestDefs.get('bear_cubs')).progress`), 2);
});

test('waypoints: quests, things of interest and home are separate groups; home always exists; the town shows only from afar', () => {
  const list = J(run(`(() => { PA.x = 60; PA.y = 60; S.quests.log = QuestLog.empty(); S.quests.log.active.baker_eggs = { step: 0, progress: 1 };
    return Waypoints.collect({ questLog: S.quests.log, npcs: {}, worldMap: S.map, local: PA, treasureMaps: [{ key: 't', tx: 70, ty: 71, kind: 'treasure' }], questMarks: [] }); })()`));
  const groups = id => list.filter(w => w.group === id);
  assert.strictEqual(groups('home').length, 1);
  assert.strictEqual(groups('quest').length, 1); assert(/Eggs/.test(groups('quest')[0].label)); assert(/1\/4/.test(groups('quest')[0].sub));
  assert(groups('interest').some(w => w.id === 'x:t') && groups('interest').some(w => w.id === 'town'));
  const near = J(run(`(() => { PA.x = 22; PA.y = 22; return Waypoints.collect({ questLog: QuestLog.empty(), npcs: {}, worldMap: S.map, local: PA, treasureMaps: [], questMarks: [] }); })()`));
  assert(!near.some(w => w.id === 'town'), 'no town pin when you are in town');
});


console.log(`${passed} passed`);
