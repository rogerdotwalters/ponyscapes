'use strict';
/* TOOLS - checks the Pony Inn and its Connect Four tables in Node (no browser):  node tools/test-connect4.js
 * the rules and the computer player; the inn in the village and Hattie behind her bar; sitting down, taking turns, winning, a rematch, standing up, playing the computer. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const secs = n => run(`for (let i = 0; i < ${Math.round(n * 30)}; i++) S.step()`);
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };
/** Fresh world, `n` players inside the inn, each beside a table (player 0 at the first table, the rest at the same one unless `apart`). */
const inn = (n = 2, seed = 4242) => {
  run(`globalThis.S = new GameServer(${seed}); globalThis.ids = []; for (let i = 0; i < ${n}; i++) ids.push(S.addPlayer());
    globalThis.site = BuildingSites.list.find(b => b.id === 'pony_inn'); globalThis.grid = Grids.room(site.index);
    ids.forEach((id, i) => { const p = S.players[id]; p.name = 'P' + (i + 1); const f = S.grids.get(grid).entryPoint(); S._moveToGrid(id, p, grid, 3 + i * 0.4, 4.6); });
    globalThis.table = () => S.connect4.tables.values().next().value;`);
};
const sit = k => run(`S._interact(ids[${k}], S.players[ids[${k}]])`);
const st = k => run(`S.connect4.stateFor(ids[${k}])`);
const drop = (k, c) => run(`S.connect4.drop(ids[${k}], ${c})`);

test('the rules: four in a row in every direction, and a full board is a draw', () => {
  const b = (cells) => run(`(() => { const b = ConnectFour.empty(); for (const [c, r, v] of ${JSON.stringify(cells)}) b[r * 7 + c] = v; return ConnectFour.winner(b); })()`);
  assert.strictEqual(b([[0, 5, 0], [1, 5, 0], [2, 5, 0], [3, 5, 0]]).who, 0, 'across');
  assert.strictEqual(b([[2, 2, 1], [2, 3, 1], [2, 4, 1], [2, 5, 1]]).who, 1, 'up');
  assert.strictEqual(b([[0, 5, 0], [1, 4, 0], [2, 3, 0], [3, 2, 0]]).who, 0, 'diagonal up');
  assert.strictEqual(b([[3, 2, 1], [4, 3, 1], [5, 4, 1], [6, 5, 1]]).who, 1, 'diagonal down');
  assert.strictEqual(b([[0, 5, 0], [1, 5, 0], [2, 5, 0], [3, 5, 1]]), null);
  assert.strictEqual(run(`ConnectFour.rowFor(ConnectFour.empty(), 3)`), 5); assert.strictEqual(run(`ConnectFour.rowFor(ConnectFour.empty(), 9)`), -1);
});

test('the computer takes a win, blocks a win, and plays the middle first', () => {
  const move = (cells, me) => run(`(() => { const b = ConnectFour.empty(); for (const [c, r, v] of ${JSON.stringify(cells)}) b[r * 7 + c] = v; return ConnectFour.bestMove(b, ${me}, 5, 0); })()`);
  assert.strictEqual(move([[0, 5, 1], [1, 5, 1], [2, 5, 1], [0, 4, 0], [1, 4, 0], [2, 4, 0]], 1), 3, 'wins at once');
  assert.strictEqual(move([[0, 5, 0], [1, 5, 0], [2, 5, 0], [6, 5, 1]], 1), 3, 'blocks');
  assert.strictEqual(move([], 0), 3, 'opens in the middle');
});

test('the computer is beatable but not silly: it never loses to a column-by-column player', () => {
  run(`(() => { let wins = 0; globalThis.gameResult = []; for (let g = 0; g < 8; g++) { const b = ConnectFour.empty(); let turn = g % 2; for (let i = 0; i < 42; i++) { let c; if (turn === 0) c = [0,1,2,3,4,5,6].find(x => ConnectFour.rowFor(b, x) >= 0); else c = ConnectFour.bestMove(b, 1, 4, 0.1); b[ConnectFour.rowFor(b, c) * 7 + c] = turn; const w = ConnectFour.winner(b); if (w) { gameResult.push(w.who); break; } turn = 1 - turn; } } })()`);
  assert(!run(`gameResult.includes(0)`), 'the naive player never wins');
});

test('the Pony Inn stands in the village, with Hattie behind the bar by day', () => {
  inn(1);
  assert(run(`!!site`)); assert.strictEqual(run(`S.grids.get(grid).kind`), 'room');
  run(`GameSettings.setClock(S.tick, 12)`); run(`S.npcs.update(S.tick, S._humans())`); secs(2);
  const hattie = run(`(() => { const n = S.npcs.npcs.n_innkeeper; return n && { grid: n.grid, x: n.x, y: n.y }; })()`);
  assert(hattie && hattie.grid === run('grid'), 'Hattie works inside the inn: ' + JSON.stringify(hattie));
  run(`S._moveToGrid(ids[0], S.players[ids[0]], '', 0, 0)`);
});

test('the table offers Play Connect Four; sitting down waits for an opponent', () => {
  inn(2);
  const a = run(`Interactions.find(S.grids.get(grid), {}, S.players[ids[0]], '', {}, ids[0], {}, {})`);
  assert.strictEqual(a.kind, 'connect4');
  sit(0);
  assert.strictEqual(st(0).status, 'waiting'); assert.strictEqual(st(0).seat, 0);
  assert.strictEqual(run(`S.pendingEvents.some(e => e.type === 'openConnect4' && e.to === ids[0])`), true);
  assert.strictEqual(st(1), null, 'the other player is not at the table');
});

test('two players: the game starts, they take turns, invalid moves are ignored, four in a row wins', () => {
  inn(2); sit(0); sit(1);
  assert.strictEqual(st(0).status, 'playing'); assert.strictEqual(st(1).seat, 1);
  assert.notStrictEqual(st(0).tokens[0], st(0).tokens[1], 'two different pony coins');
  const first = st(0).turn, second = 1 - first;
  drop(second, 0); assert.strictEqual(st(0).board.replace(/\./g, '').length, 0, 'not your turn');
  for (let i = 0; i < 3; i++) { drop(first, i); drop(second, i); }                                            // first: 0,1,2 on the bottom; second: 0,1,2 above
  drop(first, 3);
  const s0 = st(0); assert.strictEqual(s0.status, 'done'); assert.strictEqual(s0.winner, first); assert.strictEqual(s0.line.length, 4);
  drop(second, 4); assert.strictEqual(st(0).board, s0.board, 'no moves after the end');
  assert.strictEqual(st(0).last.col, 3);
});

test('a column fills up and refuses another coin', () => {
  inn(2); sit(0); sit(1);
  let who = st(0).turn;
  for (let i = 0; i < 6; i++) { drop(who, 6); who = 1 - who; }
  const before = st(0).board; drop(who, 6); assert.strictEqual(st(0).board, before); assert.strictEqual(st(0).turn, who, 'it stays their turn');
});

test('a rematch needs both players, and the other side starts', () => {
  inn(2); sit(0); sit(1);
  const first = st(0).turn;
  for (let i = 0; i < 3; i++) { drop(first, i); drop(1 - first, i); } drop(first, 3);
  run(`S.connect4.again(ids[0])`); assert.strictEqual(st(0).status, 'done', 'waiting for the other');
  run(`S.connect4.again(ids[1])`); assert.strictEqual(st(0).status, 'playing'); assert.strictEqual(st(0).turn, 1 - first); assert.strictEqual(st(0).board.replace(/\./g, ''), '', 'a fresh board');
});

test('a third player cannot sit; leaving mid-game forfeits to the other and standing up frees the seat', () => {
  inn(3); sit(0); sit(1); sit(2);
  assert.strictEqual(st(2), null);
  run(`S.connect4.leave(ids[1])`);
  assert.strictEqual(st(0).status, 'done'); assert.strictEqual(st(0).winner, 0);
  sit(2); assert.strictEqual(st(2).seat, 1); assert.strictEqual(st(0).status, 'playing', 'a new game with the new player');
});

test('walking away from the table, or leaving the inn, stands you up', () => {
  inn(2); sit(0); sit(1);
  run(`S.players[ids[1]].x = 12; S.players[ids[1]].y = 1.5`); secs(1);
  assert.strictEqual(st(1), null); assert.strictEqual(st(0).status, 'done');
  run(`S._moveToGrid(ids[0], S.players[ids[0]], '', 10, 10)`); secs(1);
  assert.strictEqual(run(`S.connect4.tables.size`), 0, 'nobody left: the table is forgotten');
});

test('alone you can play the computer: it answers after a moment and plays the other coin', () => {
  inn(1); sit(0); run(`S.connect4.playAi(ids[0])`);
  const s = st(0); assert.strictEqual(s.ai, true); assert.strictEqual(s.status, 'playing'); assert.strictEqual(s.names[1], 'Hattie (computer)');
  assert.notStrictEqual(s.tokens[0], s.tokens[1]);
  if (s.turn !== 0) secs(2);
  assert.strictEqual(st(0).turn, 0, 'the computer has moved');
  drop(0, 3); assert.strictEqual(st(0).turn, 1); secs(2); assert.strictEqual(st(0).turn, 0);
  assert.strictEqual(st(0).board.replace(/\./g, '').length, s.turn === 0 ? 2 : 3, 'your coin and its answer (and its opening one, if it began)');
  run(`S.connect4.leave(ids[0])`); assert.strictEqual(run(`S.connect4.tables.size`), 0);
});

test('the game state reaches the player in the snapshot (and the host forgets it when they leave)', () => {
  inn(2); sit(0);
  assert.strictEqual(run(`SnapshotBuilder.snapshotsFor(S, [ids[0]])[ids[0]].connect4.status`), 'waiting');
  assert.strictEqual(run(`SnapshotBuilder.snapshotsFor(S, [ids[1]])[ids[1]].connect4`), null);
  run(`S.leaveHuman(ids[0])`); assert.strictEqual(run(`S.connect4.tables.size`), 0);
});

console.log(passed + ' passed');
