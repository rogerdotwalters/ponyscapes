'use strict';
/* TOOLS - the stable's layout in Node:  node tools/test-stable.js
 * the main room is joined to a left and a right wing of stalls (3 rows each), and every stall's gate opens onto an aisle you can walk to from the front door. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const L = JSON.parse(run('JSON.stringify(PONYSCAPES_INTERIORS.pony_stable)'));
const floor = ch => 'whdsrbtmn'.includes(ch);

test('there are 12 stalls, 6 in each wing (3 rows of 2), each with a gate in its front wall', () => {
  const stalls = L.furniture.filter(f => f.id === 'stall'), gates = L.furniture.filter(f => f.id === 'stall_gate');
  assert.strictEqual(stalls.length, 12); assert.strictEqual(gates.length, 12);
  assert.strictEqual(stalls.filter(f => f.x < 11).length, 6); assert.strictEqual(stalls.filter(f => f.x > 20).length, 6);
  assert.deepStrictEqual([...new Set(stalls.map(f => f.y))].sort((a, b) => a - b), [1, 9, 17]);
  for (const s of stalls) assert(gates.some(g => g.x >= s.x && g.x < s.x + 4 && g.y === s.y + 4), `stall ${s.x},${s.y} has a gate`);
});
test('the main room holds the coin poster', () => assert(L.furniture.some(f => f.id === 'coin_poster' && f.x >= 11 && f.x < 21)));
test('from the front door you can walk to the aisle in front of every stall (gates are shut)', () => {
  const solid = new Set(L.furniture.filter(f => ['stall_gate'].includes(f.id)).map(f => f.x + ',' + f.y));
  const H = L.tiles.length, W = L.tiles[0].length, seen = new Set(), q = [[L.exit[0], L.exit[1] - 1]];
  while (q.length) {
    const [x, y] = q.pop(), k = x + ',' + y;
    if (seen.has(k) || x < 0 || y < 0 || x >= W || y >= H || !floor(L.tiles[y][x]) || solid.has(k)) continue;
    seen.add(k); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  for (const s of L.furniture.filter(f => f.id === 'stall')) assert(seen.has(`${s.x + 1},${s.y + 5}`), `the aisle in front of the stall at ${s.x},${s.y} is reachable`);
});
test('several ponies can be stabled, each in its own stall, in different wings', () => {
  const r = JSON.parse(run(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A];
    for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
    S.interiors.enter(A, P, BuildingSites.list.find(x => x.def.id === 'pony_stable').index);
    const L = S.mapOf(P).plan.layout, stalls = L.furniture.filter(f => f.id === 'stall'), picks = [stalls.find(f => f.x === 1 && f.y === 1), stalls.find(f => f.x === 27 && f.y === 9), stalls.find(f => f.x === 6 && f.y === 17)];
    const ids = [];
    for (const f of picks) {
      const id = S.animals.spawn('pony_plain', f.x + 1, f.y + 5.5, 0, { level: 1 }), a = S.animals.animals[id];
      a.owner = A; a.leashed = true; a.grid = gridOf(P); P.x = f.x + 1.5; P.y = f.y + 5.5; a.x = P.x + 0.5; a.y = P.y;
      S._stallPick(A, { act: 'in', animal: id, fx: f.x, fy: f.y }); ids.push(id);
    }
    return JSON.stringify(ids.map((id, i) => ({ stalled: !!S.animals.animals[id].stall, key: S.animals.animals[id].stall, at: picks[i].x + ',' + picks[i].y })));
  })()`));
  for (const o of r) { assert(o.stalled, JSON.stringify(r)); assert(o.key.endsWith('|' + o.at), o.key + ' vs ' + o.at); }
});
console.log(passed + ' passed');
