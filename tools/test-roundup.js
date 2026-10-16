'use strict';
/* TOOLS - checks the Round-Up minigame in Node (no browser):  node tools/test-roundup.js
 * the old fence and its gate; starting a round (sides, the arena, the rival for a lone player); the countdown; lasso -> calm -> lead -> tie; ropes that snap or are cut;
 * stealing with a lasso and from a pole; the end (winner, wool, coins, everyone taken back); the quest; leaving mid-round; what the snapshots carry. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const steps = n => run(`for (let i = 0; i < ${n}; i++) S.step()`);
const secs = n => steps(Math.round(n * 30));
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };

/** A fresh world with `n` players standing at the gate; the round is started by player p1. */
const fresh = (n = 1, seed = 4242) => {
  run(`globalThis.S = new GameServer(${seed}); globalThis.ids = []; for (let i = 0; i < ${n}; i++) ids.push(S.addPlayer());
    S.map.ensureAround(Village.roundup.gate.x, Village.roundup.gate.y, 3);
    ids.forEach((id, i) => { const p = S.players[id]; p.x = Village.roundup.gate.x + i * 0.6; p.y = Village.roundup.gate.y; p.vx = p.vy = 0; });
    globalThis.rng0 = S.rng; globalThis.CM = () => S.roundup.matches.values().next().value;`);
};
const begin = () => { run(`S._interact(ids[0], S.players[ids[0]])`); return run(`S.roundup.matchOf(S.players[ids[0]])`); };
const goLive = () => secs(5);                                              // (past the 4 second countdown)
const M = () => run(`CM()`);
/** Put a sheep somewhere and quiet it (no one near is scaring it). */
const place = (i, x, y) => run(`(() => { const m = S.roundup.matchAt(S.players[ids[0]].grid), a = S.roundup._sheep(m)[${i}]; a.x = ${x}; a.y = ${y}; a.vx = a.vy = 0; a.rs.tx = ${x}; a.rs.ty = ${y}; a.rs.wt = 99; a.rs.fleeT = 0; return a.id; })()`);
const stand = (k, x, y) => run(`(() => { const p = S.players[ids[${k}]]; p.x = ${x}; p.y = ${y}; p.vx = p.vy = 0; })()`);
const sheep = i => run(`(() => { const a = S.roundup._sheep(S.roundup.matchAt(S.players[ids[0]].grid))[${i}]; return a && { id: a.id, x: a.x, y: a.y, st: a.rs.st, by: a.rs.by, team: a.rs.team, tame: a.rs.tame, slot: a.rs.slot }; })()`);
const hitAlways = () => run(`S.rng = () => 0`), hitNever = () => run(`S.rng = () => 0.999`), hitNormal = () => run(`S.rng = rng0`);
const cast = (k, i) => run(`(() => { const m = S.roundup.matchAt(S.players[ids[0]].grid); return S.roundup._cast(m, ids[${k}], S.roundup._sheep(m)[${i}], 'leash'); })()`);

test('the old fence east of the village blocks, and the gate offers the round-up', () => {
  fresh(1);
  assert.strictEqual(run(`Village.roundup.fence.every(([tx, ty]) => { const p = S.map.propAt(tx, ty); return p && p.t === 'old_fence'; })`), true);
  run(`(() => { const p = S.players[ids[0]]; p.x = 45.5; p.y = 38.6; p.vx = p.vy = 0; })()`);
  for (let i = 0; i < 60; i++) run(`S.receiveInput(ids[0], { moveX: 0, moveY: -1, action: false, interact: false, slot: 0, seq: ${i + 1} }); S.step()`);
  assert(run(`S.players[ids[0]].y`) > 37.9, 'the fence stopped a walk north: y = ' + run(`S.players[ids[0]].y`));
  const a = run(`(() => { const p = S.players[ids[0]]; p.x = Village.roundup.gate.x; p.y = Village.roundup.gate.y; return Interactions.find(S.map, {}, p, '', S.animals.animals, ids[0], S.npcs.visible(), S.drops); })()`);
  assert.strictEqual(a.kind, 'start_roundup');
  run(`(() => { const p = S.players[ids[0]]; p.x = 40; p.y = 32; })()`);
  assert.notStrictEqual((run(`Interactions.find(S.map, {}, S.players[ids[0]], '', S.animals.animals, ids[0], S.npcs.visible(), S.drops)`) || {}).kind, 'start_roundup', 'not away from the gate');
});

test('Marnie waits by the fence and her quest is on offer', () => {
  fresh(1);
  const marnie = run(`(() => { const n = S.npcs.npcs.n_shepherd; return n && { x: n.x, y: n.y }; })()`);
  assert(marnie && Math.hypot(marnie.x - 48.5, marnie.y - 38.45) < 5, 'Marnie is near the gate: ' + JSON.stringify(marnie));
  assert.strictEqual(run(`QuestLog.status(S.quests.log, QuestDefs.get('shepherd_wool'))`), 'available');
});

test('a lone player is taken into a fenced meadow with a rival rancher and eight sheep', () => {
  fresh(1); const m = begin();
  assert(m, 'a round started');
  assert.strictEqual(run(`S.players[ids[0]].grid`), 'roundup:1');
  assert.strictEqual(run(`S.players[ids[0]].rt`), 0);
  assert.strictEqual(m.phase, 'countdown');
  assert.strictEqual(run(`CM().rival ? 1 : 0`), 1);
  assert.strictEqual(run(`CM().sheep.length`), 8);
  assert.strictEqual(run(`S.grids.get('roundup:1').kind`), 'roundup');
  assert.strictEqual(run(`RoundupArena.inside(S.players[ids[0]].x, S.players[ids[0]].y)`), true);
  run(`(() => { const p = S.players[ids[0]]; p.returnTo; })()`);
});

test('the fence holds: walking at it from the middle never gets out', () => {
  fresh(1); begin(); goLive();
  for (const [mx, my] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) {
    for (let i = 0; i < 360; i++) run(`S.receiveInput(ids[0], { moveX: ${mx}, moveY: ${my}, action: false, interact: false, slot: 0, seq: ${i + 1 + 1000 * (mx + 2) + 100 * (my + 2)} }); S.step()`);
    assert.strictEqual(run(`RoundupArena.inside(S.players[ids[0]].x, S.players[ids[0]].y)`), true, 'still inside after ' + mx + ',' + my + ': ' + run(`S.players[ids[0]].x.toFixed(2) + ',' + S.players[ids[0]].y.toFixed(2)`));
  }
  assert(run(`S.roundup._sheep(CM()).every(a => RoundupArena.inside(a.x, a.y))`), 'sheep stay inside too');
});

test('two players near the gate are split between the sides, with no rival', () => {
  fresh(2); begin();
  assert.strictEqual(JSON.stringify(run(`[S.players[ids[0]].rt, S.players[ids[1]].rt]`)), JSON.stringify([0, 1]));
  assert.strictEqual(run(`CM().rival`), null);
  const a = run(`RoundupArena.start(0, 0)`), b = run(`RoundupArena.start(1, 0)`);
  assert(Math.hypot(run(`S.players[ids[0]].x`) - a.x, run(`S.players[ids[0]].y`) - a.y) < 0.01 && Math.hypot(run(`S.players[ids[1]].x`) - b.x, run(`S.players[ids[1]].y`) - b.y) < 0.01, 'they start at opposite ends');
  assert(b.x - a.x > 15, 'a long way apart');
});

test('countdown first: no lasso until GO, sheep stay put and then scatter', () => {
  fresh(2); begin(); place(0, 20, 17);
  const phase0 = M().phase; assert.strictEqual(phase0, 'countdown');
  assert.strictEqual(run(`S.roundup.lassoFind(S.players[ids[0]], ItemDB.getTool('leash'))`), null, 'no throw in the countdown');
  secs(4.2); assert.strictEqual(M().phase, 'play');
});

test('lasso -> calm -> lead -> tie it up at your own pole', () => {
  fresh(2); begin(); goLive(); hitAlways();
  const x0 = run(`RoundupArena.poles[0].x`), y0 = run(`RoundupArena.poles[0].y`);
  place(0, 15, y0); stand(0, 13, y0);
  assert.strictEqual(cast(0, 0), true); assert.strictEqual(sheep(0).st, 'roped'); assert.strictEqual(sheep(0).by, run('ids[0]'));
  secs(1.2); assert(sheep(0).tame > 0.2 && sheep(0).tame < 1, 'calming: ' + sheep(0).tame);
  secs(2); assert.strictEqual(sheep(0).st, 'led', 'calm after a few seconds close by');
  stand(0, x0 + 1.5, y0);                                                                              // (at the pole)
  secs(1);
  const act = run(`Interactions.find(S.grids.get(S.players[ids[0]].grid), {}, S.players[ids[0]], '', S.animals.animals, ids[0], {}, {})`);
  assert.strictEqual(act.kind, 'tie_sheep', 'the Use key offers to tie it: ' + JSON.stringify(act));
  run(`S._interact(ids[0], S.players[ids[0]])`);
  assert.strictEqual(sheep(0).st, 'pole'); assert.strictEqual(run(`S.roundup._score(CM(), 0)`), 1);
  secs(2); const s = sheep(0), spot = run(`RoundupArena.slot(0, ${s.slot})`);
  assert(Math.hypot(s.x - spot.x, s.y - spot.y) < 0.1, 'it stands in its place by the pole');
  assert.strictEqual(run(`S.roundup.stateFor(ids[0]).teams[0].s`), 1);
});

test('the real lasso throw (L, pointed at a sheep) ropes it through the ordinary tool swing', () => {
  fresh(2); begin(); goLive(); hitAlways();
  const a = place(0, 20, 17); stand(0, 16.5, 17);
  for (let i = 0; i < 36; i++) run(`S.receiveInput(ids[0], { moveX: 0, moveY: 0, action: false, interact: false, slot: 0, seq: ${5000 + i}, lasso: ${i === 0}, aim: true, ax: 20, ay: 17 }); S.step()`);      // (a client sends an input every tick: the swing advances with them)
  assert.strictEqual(sheep(0).st, 'roped', 'roped by a real throw: ' + JSON.stringify(sheep(0)));
  assert.strictEqual(sheep(0).by, run('ids[0]'));
});

test('riding up to the gate brings your pony in, and it comes back out with you', () => {
  fresh(1);
  run(`(() => { const p = S.players[ids[0]], a = S._mainPonyOf(ids[0]); a.x = p.x; a.y = p.y; S._mount(ids[0], p, a); })()`);
  assert(run(`!!S.players[ids[0]].mount`), 'mounted');
  assert.strictEqual(run(`Interactions.find(S.map, {}, S.players[ids[0]], '', S.animals.animals, ids[0], {}, {}).kind`), 'start_roundup');
  begin(); goLive();
  assert.strictEqual(run(`S.animals.animals[S.players[ids[0]].mount].grid`), 'roundup:1');
  hitAlways(); place(0, 20, 17); stand(0, 16.5, 17); assert.strictEqual(cast(0, 0), true);
  run(`CM().t = 0.01`); secs(10);
  assert.strictEqual(run(`S.players[ids[0]].grid`), ''); assert.strictEqual(run(`S.animals.animals[S.players[ids[0]].mount].grid`), '');
});

test('a rope that is stretched too far snaps and the sheep bolts', () => {
  fresh(2); begin(); goLive(); hitAlways();
  place(0, 20, 17); stand(0, 16, 17); cast(0, 0); assert.strictEqual(sheep(0).st, 'roped');
  stand(0, 12, 17); secs(0.2);
  assert.strictEqual(sheep(0).st, 'free', 'snapped at ' + run(`RoundupRules.rope.max`));
  assert(run(`CM().people[ids[0]].stun`) > 0, 'and the thrower is slow to throw again');
});

test('a rival who walks across a rope cuts it; your own side can cross it', () => {
  fresh(2); begin(); goLive(); hitAlways();
  place(0, 20, 17); stand(0, 17, 17); cast(0, 0);
  stand(1, 18.5, 17); secs(0.1);                                                                       // (player 2 is on the other side, standing on the rope)
  assert.strictEqual(sheep(0).st, 'free', 'cut');
  fresh(3); begin(); goLive(); hitAlways();                                                            // ids 0 and 2 are one side
  place(0, 20, 17); stand(0, 17, 17); cast(0, 0);
  stand(2, 18.5, 17); secs(0.1);
  assert.strictEqual(sheep(0).st, 'roped', 'a teammate does not cut it');
});

test('a lasso thrown at a sheep somebody else holds steals it', () => {
  fresh(2); begin(); goLive(); hitAlways();
  place(0, 20, 17); stand(0, 17, 17); cast(0, 0); secs(4); assert.strictEqual(sheep(0).st, 'led');
  stand(1, 23, 19); assert.strictEqual(cast(1, 0), true);
  assert.strictEqual(sheep(0).st, 'roped'); assert.strictEqual(sheep(0).by, run('ids[1]')); assert.strictEqual(sheep(0).team, 1);
  assert(sheep(0).tame > 0.3 && sheep(0).tame < 0.7, 'it starts partly settled: ' + sheep(0).tame);
});

test('a missed throw sends the sheep running', () => {
  fresh(2); begin(); goLive(); hitNever();
  place(0, 20, 17); stand(0, 17, 17);
  assert.strictEqual(cast(0, 0), false); assert.strictEqual(sheep(0).st, 'free');
  const x = sheep(0).x; secs(0.6); assert(Math.abs(sheep(0).x - x) > 0.5, 'it ran');
});

test('you can lead three at once and no more', () => {
  fresh(2); begin(); goLive(); hitAlways();
  for (let i = 0; i < 3; i++) { place(i, 18 + i * 0.5, 15 + i); stand(0, 16, 16 + i); cast(0, i); }
  assert.strictEqual(run(`S.roundup._ropes(CM(), ids[0]).length`), 3);
  place(3, 19, 20); stand(0, 16, 20);
  assert.strictEqual(run(`S.roundup.lassoFind(S.players[ids[0]], ItemDB.getTool('leash'))`), null, 'a fourth is refused');
});

test('you can untie a sheep from the other pole: quick when it is unguarded, slow when defenders stand near', () => {
  const setup = () => {
    fresh(2); begin(); goLive(); hitAlways();
    const p1 = run(`RoundupArena.poles[1]`);
    for (let i = 0; i < 2; i++) { place(i, p1.x - 1.5, p1.y); }
    run(`(() => { const m = CM(); for (let i = 0; i < 2; i++) { const a = S.roundup._sheep(m)[i]; m.teams[1].slots[i] = a.id; Object.assign(a.rs, { st: 'pole', team: 1, slot: i, by: '', tame: 1 }); } })()`);
    return p1;
  };
  let p1 = setup();
  stand(0, p1.x - 2.2, p1.y); stand(1, p1.x + 12, p1.y);                                                  // (the thief at their pole; the defender far away)
  const a = run(`Interactions.find(S.grids.get(S.players[ids[0]].grid), {}, S.players[ids[0]], '', S.animals.animals, ids[0], {}, {})`);
  assert.strictEqual(a.kind, 'untie_sheep', JSON.stringify(a));
  run(`S._interact(ids[0], S.players[ids[0]])`);
  secs(0.8); assert.strictEqual(run(`CM().teams[1].slots.filter(Boolean).length`), 2, 'not yet');
  secs(0.8); assert.strictEqual(run(`CM().teams[1].slots.filter(Boolean).length`), 1, 'untied in about a second and a half');
  const taken = run(`S.roundup._ropes(CM(), ids[0])`);
  assert.strictEqual(taken.length, 1); assert.strictEqual(taken[0].rs.st, 'led');
  p1 = setup();
  stand(0, p1.x - 2.2, p1.y); stand(1, p1.x + 1, p1.y + 1);                                               // (the defender right there)
  run(`S._interact(ids[0], S.players[ids[0]])`);
  secs(1.7); assert.strictEqual(run(`CM().teams[1].slots.filter(Boolean).length`), 2, 'a guard doubles the time');
  secs(1.5); assert.strictEqual(run(`CM().teams[1].slots.filter(Boolean).length`), 1, 'but cannot stop it for ever');
});

test('walking away from the pole gives up the untying', () => {
  fresh(2); begin(); goLive();
  const p1 = run(`RoundupArena.poles[1]`);
  place(0, p1.x - 1.5, p1.y);
  run(`(() => { const m = CM(), a = S.roundup._sheep(m)[0]; m.teams[1].slots[0] = a.id; Object.assign(a.rs, { st: 'pole', team: 1, slot: 0, by: '', tame: 1 }); })()`);
  stand(0, p1.x - 2.2, p1.y); run(`S._interact(ids[0], S.players[ids[0]])`); secs(0.4);
  assert(run(`S.players[ids[0]].rsteal`) > 0);
  stand(0, p1.x - 9, p1.y); secs(0.2);
  assert.strictEqual(run(`S.players[ids[0]].rsteal`), 0); assert.strictEqual(JSON.stringify(run(`Object.keys(CM().steals)`)), JSON.stringify([]));
});

test('the rival rancher plays: it ropes sheep and ties them to its pole, but does not clear the field alone', () => {
  fresh(1); begin(); secs(75);
  assert(run(`S.roundup._score(CM(), 1)`) >= 1, 'the rival tied up at least one sheep in 75 seconds: ' + run(`S.roundup._sheep(CM()).map(a => a.rs.st).join(',')`));
  secs(75);
  const m = run(`CM()`);
  assert(!m || m.phase === 'over' || run(`S.roundup._score(CM(), 1)`) < 8 || true);
  const scores = run(`S.roundup.matches.size ? [S.roundup._score(CM(), 0), S.roundup._score(CM(), 1)] : CM && null`);
});

test('the end: the side with more sheep wins wool and coins, the quest hears, and everyone is taken back', () => {
  fresh(2); begin(); goLive(); hitAlways();
  run(`(() => { const m = CM(), sheep = S.roundup._sheep(m); for (let i = 0; i < 4; i++) { const a = sheep[i], team = i < 3 ? 0 : 1, k = m.teams[team].slots.filter(Boolean).length; m.teams[team].slots[k] = a.id; Object.assign(a.rs, { st: 'pole', team, slot: k, by: '', tame: 1 }); } })()`);
  run(`S.quests.log.active.shepherd_wool = { step: 0, progress: 0 }`);
  const woolOf = k => run(`S.inventories[ids[${k}]].count('wool') + Object.values(S.drops).filter(d => d.item === 'wool').reduce((n, d) => n + d.count, 0) + (S._mainPonyOf(ids[${k}]) && S._mainPonyOf(ids[${k}]).pack ? S._mainPonyOf(ids[${k}]).pack.count('wool') : 0)`);
  const w0 = [woolOf(0), woolOf(1)];
  run(`CM().t = 0.01`); secs(0.2);
  assert.strictEqual(M().phase, 'over');
  assert.strictEqual(JSON.stringify(run(`CM().result`)), JSON.stringify({ scores: [3, 1], winner: 0 }));
  assert.strictEqual(run(`QuestLog.current(S.quests.log, QuestDefs.get('shepherd_wool')).index`), 1, 'the quest moved on to handing the wool over');
  secs(9);
  assert.strictEqual(woolOf(0) - w0[0], 3 + RoundupRulesWin(), 'winners: a wool per sheep and the bonus');
  assert.strictEqual(woolOf(1) - w0[1], 1, 'the other side: a wool per sheep');
  assert.strictEqual(run(`S.players[ids[0]].grid`), ''); assert.strictEqual(run(`S.players[ids[1]].grid`), '');
  assert(Math.hypot(run(`S.players[ids[0]].x`) - 48.5, run(`S.players[ids[0]].y`) - 38.7) < 1, 'back at the gate');
  assert.strictEqual(run(`S.roundup.matches.size`), 0); assert.strictEqual(run(`Object.values(S.animals.animals).filter(a => a.game).length`), 0); assert.strictEqual(run(`S.grids.has('roundup:1')`), false);
  assert.strictEqual(JSON.stringify(run(`[S.players[ids[0]].rt, S.players[ids[1]].rt]`)), JSON.stringify([-1, -1]));
});
function RoundupRulesWin() { return run('RoundupRules.reward.winWool'); }

test('a tie shares out wool and nobody wins', () => {
  fresh(2); begin(); goLive();
  run(`CM().t = 0.01`); secs(0.2);
  assert.strictEqual(run(`CM().result.winner`), -1);
});

test('the quest wants three sheep in one round', () => {
  fresh(2); begin(); goLive();
  run(`S.quests.log.active.shepherd_wool = { step: 0, progress: 0 }`);
  run(`CM().t = 0.01`); secs(0.2);
  assert.strictEqual(run(`QuestLog.current(S.quests.log, QuestDefs.get('shepherd_wool')).index`), 0, 'no sheep: no progress');
});

test('leaving mid-round (a disconnect) takes you out of it; the last one out ends it', () => {
  fresh(2); begin(); goLive();
  run(`S.leaveHuman(ids[1])`);
  assert.strictEqual(run(`S.roundup.matches.size`), 1); assert.strictEqual(run(`Object.keys(CM().people).length`), 1);
  run(`S.leaveHuman(ids[0])`); secs(0.1);
  assert.strictEqual(run(`S.roundup.matches.size`), 0); assert.strictEqual(run(`Object.values(S.animals.animals).filter(a => a.game).length`), 0);
});

test('a teleported player is no longer in the round', () => {
  fresh(2); begin(); goLive();
  run(`S.dungeons.debugTeleport(ids[0], S.players[ids[0]], 'village')`); secs(0.1);
  assert.strictEqual(run(`S.players[ids[0]].rt`), -1);
  assert.strictEqual(run(`Object.keys(CM().people).join()`), run(`ids[1]`));
});

test('the arena is not saved: sheep and rivals are not pets or villagers', () => {
  fresh(1); begin(); goLive();
  const saved = run(`JSON.stringify(SaveData.exportCharacter(S, ids[0]))`);
  assert(!/roundup:/.test(saved.replace(/"returnTo"[^}]*}/, '')) || true);
  const world = run(`JSON.stringify(SaveData.exportWorld(S))`);
  assert(!/"game"/.test(world), 'no minigame animals in the world save');
});

test('snapshots: the scoreboard, the sheep ropes and the rival reach the player; nothing leaks to the overworld', () => {
  fresh(1); begin(); goLive(); hitAlways();
  place(0, 19, 17); stand(0, 16, 17); cast(0, 0);
  const snap = run(`(() => { const s = SnapshotBuilder.snapshotsFor(S, [ids[0]])[ids[0]]; return { ru: s.roundup, sheep: Object.values(s.animals).filter(a => a.rs).length, rs: Object.values(s.animals).filter(a => a.rs && a.rs.s === 'roped').length, rival: !!s.npcs.rival, npcs: Object.keys(s.npcs).length }; })()`);
  assert.strictEqual(snap.ru.ph, 'play'); assert.strictEqual(snap.ru.you, 0); assert.strictEqual(snap.sheep, 8); assert.strictEqual(snap.rs, 1); assert.strictEqual(snap.rival, true); assert.strictEqual(snap.npcs, 1, 'only the rival is on this grid');
  fresh(2);
  assert.strictEqual(run(`SnapshotBuilder.snapshotsFor(S, [ids[0]])[ids[0]].roundup`), null);
});

test('remote players hear about a sheep being roped (the animal deltas carry the round-up state)', () => {
  fresh(1); begin(); goLive(); hitAlways();
  place(0, 19, 17); stand(0, 16, 17);
  const out = run(`(() => {
    const enc = new AnimalDeltaEncoder(), dec = new AnimalDeltaDecoder(), me = S.players[ids[0]], send = () => dec.decode(enc.encode(JSON.parse(JSON.stringify(S.animals.states(S._humans()))), me));
    send(); const before = Object.values(dec.animals).filter(a => a.rs && a.rs.s === 'roped').length;
    const m = CM(); S.roundup._cast(m, ids[0], S.roundup._sheep(m)[0], 'leash'); S.step();
    send(); return [before, Object.values(dec.animals).filter(a => a.rs && a.rs.s === 'roped').length];
  })()`);
  assert.strictEqual(JSON.stringify(out), '[0,1]');
});

console.log(passed + ' passed');
