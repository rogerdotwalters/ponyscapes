'use strict';
/* TOOLS - checks teleporting to a friend and the villager sync in Node (no browser):  node tools/test-teleport.js */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const world = () => run(`(() => { globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.B = S.addPlayer(); globalThis.PA = S.players[A]; globalThis.PB = S.players[B]; })()`);

test('teleporting to a friend in a dungeon puts you on their grid, beside them', () => {
  world();
  run(`S.dungeons.debugTeleport(B, PB, 'crypt:1')`);
  run(`S.receiveCommand(A, { type: 'teleportTo', who: B })`);
  assert.strictEqual(run(`gridOf(PA) === gridOf(PB) && gridOf(PB) !== ''`), true);
  assert(run(`Math.hypot(PA.x - PB.x, PA.y - PB.y) < 2`));
});

test('and back to the overworld; a cooldown stops instant hops; you cannot teleport while down', () => {
  world();
  run(`S.dungeons.debugTeleport(B, PB, 'crypt:1')`); run(`S.receiveCommand(A, { type: 'teleportTo', who: B })`);
  run(`S.dungeons.debugTeleport(B, PB, 'village')`); run(`S.receiveCommand(A, { type: 'teleportTo', who: B })`);
  assert.notStrictEqual(run(`gridOf(PA)`), '', 'cooldown keeps A where they were');
  run(`PA.tpReadyAt = 0; PA.down = 5`); run(`S.receiveCommand(A, { type: 'teleportTo', who: B })`);
  assert.notStrictEqual(run(`gridOf(PA)`), '', 'down: no teleport');
  run(`PA.down = 0`); run(`S.receiveCommand(A, { type: 'teleportTo', who: B })`);
  assert.strictEqual(run(`gridOf(PA)`), '');
});

console.log(passed + ' passed');
