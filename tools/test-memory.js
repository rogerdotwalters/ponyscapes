'use strict';
/* TOOLS - checks the Memory game at the Pony Inn in Node (no browser):  node tools/test-memory.js
 * the deck; sitting down; playing alone; two players taking turns; pairs, mismatches and the end; a rematch; standing up; and that a player is never sent the faces of cards that are face down. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const secs = n => run(`for (let i = 0; i < ${Math.round(n * 30)}; i++) S.step()`);
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };
/** Fresh world, `n` players inside the inn beside the Memory table. */
const inn = (n = 2, seed = 4242) => {
  run(`globalThis.S = new GameServer(${seed}); globalThis.ids = []; for (let i = 0; i < ${n}; i++) ids.push(S.addPlayer());
    globalThis.site = BuildingSites.list.find(b => b.id === 'pony_inn'); globalThis.grid = Grids.room(site.index);
    ids.forEach((id, i) => { const p = S.players[id]; p.name = 'P' + (i + 1); S._moveToGrid(id, p, grid, 6.6 + i * 0.4, 8.3); });
    globalThis.table = () => S.memory.tables.values().next().value;`);
};
const sit = k => run(`S._interact(ids[${k}], S.players[ids[${k}]])`);
const st = k => run(`S.memory.stateFor(ids[${k}])`);
const flip = (k, i) => run(`S.memory.flip(ids[${k}], ${i})`);
/** Indices of a matching pair, and of two cards that do not match, read from the server's own deck. */
const pair = () => run(`(() => { const f = table().faces; const a = f.findIndex((v, i) => table().owner[i] < 0); const b = f.findIndex((v, i) => i !== a && v === f[a]); return [a, b]; })()`);
const miss = () => run(`(() => { const t = table(), f = t.faces; const a = f.findIndex((v, i) => t.owner[i] < 0); const b = f.findIndex((v, i) => i !== a && t.owner[i] < 0 && v !== f[a]); return [a, b]; })()`);
const solveAll = k => { for (let g = 0; g < 20 && st(k).status === 'playing'; g++) { const [a, b] = pair(); flip(k, a); flip(k, b); } };

test('the deck: fourteen pictures, two cards of each, shuffled, in the right mix; every picture is real', () => {
  const d = run(`MemoryGame.deck()`); assert.strictEqual(d.length, 28);
  const faces = [...new Set(d)]; assert.strictEqual(faces.length, 14, 'fourteen pictures');
  for (const f of faces) assert.strictEqual(d.filter(v => v === f).length, 2);
  const count = kind => faces.filter(f => run(`MemoryGame.POOL[${f}][0]`) === kind).length;
  assert.deepStrictEqual(['pony', 'animal', 'coin', 'item'].map(count), [5, 4, 3, 2], 'five ponies, four animals, three coins, two lassos');
  assert.notDeepStrictEqual(d, run(`MemoryGame.deck(() => 0.999)`), 'the rng shuffles');
  assert.notDeepStrictEqual([...new Set(d)].sort(), [...new Set(run(`MemoryGame.deck(() => 0.01)`))].sort(), 'a different mix of pictures each game');
  assert.strictEqual(run(`MemoryGame.POOL.every(([k, id, type]) => k === 'pony' ? PonyCoins.ids.includes(id) && !!AnimalDefs[type] : k === 'animal' ? !!AnimalDefs[type] : k === 'coin' ? Coins.TIERS.some(t => t.id === id) : !!ItemDefs[id] && !!ItemDB.getLasso(id))`), true, 'every picture is a real pony, animal, coin or lasso');
  assert(run(`MemoryGame.POOL.length`) <= 36, 'a card picture fits one base-36 character');
});

test('the Pony Inn has a Memory table that offers Play Memory; sitting waits for an opponent', () => {
  inn(2);
  const a = run(`Interactions.find(S.grids.get(grid), {}, S.players[ids[0]], '', {}, ids[0], {}, {})`);
  assert.strictEqual(a.kind, 'memory');
  sit(0);
  assert.strictEqual(st(0).status, 'waiting'); assert.strictEqual(st(0).seat, 0); assert.strictEqual(st(0).st, '.'.repeat(28));
  assert.strictEqual(run(`S.pendingEvents.some(e => e.type === 'openMemory' && e.to === ids[0])`), true);
  assert.strictEqual(st(1), null);
});

test('alone: play alone counts your moves; a pair stays, a miss turns back down; all fourteen pairs end it', () => {
  inn(1); sit(0); run(`S.memory.playAlone(ids[0])`);
  let s = st(0); assert.strictEqual(s.status, 'playing'); assert.strictEqual(s.solo, true);
  const [m1, m2] = miss(); flip(0, m1); assert.strictEqual(st(0).st[m1], 'u'); flip(0, m2);
  s = st(0); assert.strictEqual(s.moves, 1); assert.strictEqual(s.st[m1], 'u', 'still showing'); flip(0, pair()[0]); assert.strictEqual(st(0).st.split('u').length - 1, 2, 'no third card while two are up');
  secs(2); s = st(0); assert.strictEqual(s.st.replace(/\./g, ''), '', 'both turned back down');
  const [a, b] = pair(); flip(0, a); flip(0, b); s = st(0); assert.strictEqual(s.st[a], 'm'); assert.strictEqual(s.st[b], 'm'); assert.strictEqual(s.score[0], 1); assert.strictEqual(s.turn, 0);
  solveAll(0); s = st(0); assert.strictEqual(s.status, 'done'); assert.strictEqual(s.score[0], 14); assert.strictEqual(s.moves, 15, 'one miss, fourteen pairs');
  run(`S.memory.again(ids[0])`); s = st(0); assert.strictEqual(s.status, 'playing'); assert.strictEqual(s.moves, 0); assert.strictEqual(s.st.replace(/\./g, ''), '');
  run(`S.memory.leave(ids[0])`); assert.strictEqual(run(`S.memory.tables.size`), 0);
});

test('two players take turns; a pair lets you go again; a miss passes the turn after a moment', () => {
  inn(2); sit(0); sit(1);
  const s = st(0); assert.strictEqual(s.status, 'playing'); assert.strictEqual(s.solo, false); assert.notStrictEqual(s.tokens[0], s.tokens[1]);
  const first = s.turn, second = 1 - first;
  flip(second, 0); assert.strictEqual(st(0).st[0], '.', 'not your turn');
  const [a, b] = pair(); flip(first, a); flip(first, b);
  assert.strictEqual(st(0).turn, first, 'a pair: again'); assert.strictEqual(st(0).score[first], 1); assert.strictEqual(st(0).own[a], String(first));
  const [x, y] = miss(); flip(first, x); flip(first, y); assert.strictEqual(st(0).turn, first, 'the cards are still showing');
  flip(second, pair()[0]); assert.strictEqual(st(1).st.split('u').length - 1, 2, 'nobody can flip while two are up');
  secs(2); assert.strictEqual(st(0).turn, second); assert.strictEqual(st(0).st[x], '.');
  assert.strictEqual(st(0).match.by, first);
});

test('the winner is whoever has more pairs; a rematch needs both and the other side starts', () => {
  inn(2); sit(0); sit(1);
  const first = st(0).turn; solveAll(first);
  const s = st(0); assert.strictEqual(s.status, 'done'); assert.strictEqual(s.winner, first); assert.strictEqual(s.score[first], 14);
  run(`S.memory.again(ids[0])`); assert.strictEqual(st(0).status, 'done');
  run(`S.memory.again(ids[1])`); assert.strictEqual(st(0).status, 'playing'); assert.strictEqual(st(0).turn, 1 - first); assert.strictEqual(st(0).score.join(), '0,0');
});

test('a player is only sent the faces of cards that are up or matched', () => {
  inn(2); sit(0); sit(1);
  const first = st(0).turn, [a] = pair(); flip(first, a);
  const s = st(1); assert.strictEqual(s.fc.replace(/-/g, '').length, 1); assert.notStrictEqual(s.fc[a], '-');
  assert.strictEqual(run(`JSON.stringify(S.memory.stateFor(ids[1])).includes(JSON.stringify(table().faces))`), false);
});

test('a third player cannot sit; leaving mid-game forfeits; nobody at the table forgets it', () => {
  inn(3); sit(0); sit(1); sit(2);
  assert.strictEqual(st(2), null);
  run(`S.memory.leave(ids[1])`); assert.strictEqual(st(0).status, 'done'); assert.strictEqual(st(0).winner, 0);
  inn(2); sit(0); sit(1); run(`S.players[ids[1]].x = 12; S.players[ids[1]].y = 1.5`); secs(1);
  assert.strictEqual(st(1), null); assert.strictEqual(st(0).status, 'done');
  run(`S._moveToGrid(ids[0], S.players[ids[0]], '', 10, 10)`); secs(1); assert.strictEqual(run(`S.memory.tables.size`), 0);
});

test('nobody can join a game somebody plays alone', () => {
  inn(2); sit(0); run(`S.memory.playAlone(ids[0])`); sit(1); assert.strictEqual(st(1), null);
});

test('the state reaches the player in the snapshot (and the host forgets it when they leave)', () => {
  inn(2); sit(0);
  assert.strictEqual(run(`SnapshotBuilder.snapshotsFor(S, [ids[0]])[ids[0]].memory.status`), 'waiting');
  assert.strictEqual(run(`SnapshotBuilder.snapshotsFor(S, [ids[1]])[ids[1]].memory`), null);
  run(`S.leaveHuman(ids[0])`); assert.strictEqual(run(`S.memory.tables.size`), 0);
});

console.log(passed + ' passed');
