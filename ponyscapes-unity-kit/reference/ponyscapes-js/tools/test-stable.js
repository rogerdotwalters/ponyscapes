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
test('up to four ponies share one stall (the fifth is refused) and stand apart', () => {
  const r = JSON.parse(run(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A];
    for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
    S.interiors.enter(A, P, BuildingSites.list.find(x => x.def.id === 'pony_stable').index);
    const f = S.mapOf(P).plan.layout.furniture.find(g => g.id === 'stall' && g.x === 1 && g.y === 1), ids = [];
    for (let i = 0; i < 5; i++) {
      const id = S.animals.spawn('pony_plain', f.x + 1, f.y + 5.5, 0, { level: 1 }), a = S.animals.animals[id];
      a.owner = A; a.leashed = true; a.grid = gridOf(P); P.x = f.x + 1.5; P.y = f.y + 5.5; a.x = P.x + 0.5; a.y = P.y;
      S._stallPick(A, { act: 'in', animal: id, fx: f.x, fy: f.y }); ids.push(id);
    }
    const A_ = S.animals.animals, fifth = !!A_[ids[4]].stall, inStall = ids.filter(id => A_[id].stall), spots = inStall.map(id => A_[id].stallAt.x + ',' + A_[id].stallAt.y);
    S.pendingEvents.length = 0; S._useStall(A, P, { fx: f.x, fy: f.y });
    const menu = S.pendingEvents.filter(e => e.type === 'stallMenu').pop();
    S._stallPick(A, { act: 'out', animal: inStall[1] });
    const again = S.animals.animals[ids[4]]; S._stallPick(A, { act: 'in', animal: ids[4], fx: f.x, fy: f.y });
    return JSON.stringify({ n: inStall.length, fifth, spots: new Set(spots).size, inside: menu.inside.length, cap: menu.cap, addable: menu.addable.length, outOk: !A_[inStall[1]].stall, refilled: !!again.stall });
  })()`));
  assert.strictEqual(r.n, 4); assert(!r.fifth, 'the fifth is refused'); assert.strictEqual(r.spots, 4, 'four different spots'); assert.strictEqual(r.inside, 4); assert.strictEqual(r.cap, 4);
  assert.strictEqual(r.addable, 0, 'a full stall offers nobody to add'); assert(r.outOk); assert(r.refilled, 'room again after one is taken out');
});
test('ponies are male or female: about half each, the same every time for the same look, and the book can say which', () => {
  const r = JSON.parse(run(`(() => {
    let f = 0, m = 0; for (let g = 1; g <= 400; g++) { const look = PonyLook.fromGene(g * 7919, 0); if (PonyLook.sexOf(look) === 'f') f++; else m++; }
    const look = PonyLook.fromGene(123456, 0);
    return JSON.stringify({ f, m, stable: PonyLook.sexOf(look) === PonyLook.sexOf(look.slice()), described: PonyLook.describe(look).sex, symbol: PonyLook.sexInfo('f').symbol + PonyLook.sexInfo('m').symbol });
  })()`));
  assert(r.f > 140 && r.m > 140, JSON.stringify(r)); assert(r.stable); assert(['f', 'm'].includes(r.described)); assert.strictEqual(r.symbol, '\u2640\u2642');
});
test('breeding: exactly a stallion and a mare alone in a stall; the bar fills; a foal is born and the pair rests', () => {
  const r = JSON.parse(run(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A], out = {};
    for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
    S.interiors.enter(A, P, BuildingSites.list.find(x => x.def.id === 'pony_stable').index);
    const map = S.mapOf(P), f = map.plan.layout.furniture.find(g => g.id === 'stall' && g.x === 6 && g.y === 1);
    const mk = (sex, type = 'pony_plain') => {
      const id = S.animals.spawn(type, f.x + 1, f.y + 5.5, 0, { level: 1 }), a = S.animals.animals[id];
      a.look[6] = sex === 'f' ? 128 : 0; a.owner = A; a.leashed = true; a.grid = gridOf(P); P.x = f.x + 1.5; P.y = f.y + 5.5; a.x = P.x + 0.5; a.y = P.y;
      S._stallPick(A, { act: 'in', animal: id, fx: f.x, fy: f.y }); return a;
    };
    const go = () => S._stallPick(A, { act: 'breed', fx: f.x, fy: f.y });
    const m1 = mk('m'); go(); out.oneAlone = Object.keys(S.breeding).length;
    const m2 = mk('m'); go(); out.twoMales = Object.keys(S.breeding).length;
    delete S.animals.animals[m2.id]; const fe = mk('f'); go(); out.started = Object.keys(S.breeding).length; out.barStart = fe.breedP;
    const ponies0 = Object.values(S.animals.animals).filter(x => x.owner === A).length;
    for (let t = 0; t < 45; t += 1 / 30) S._breedTick(1 / 30);
    out.half = Math.round(fe.breedP * 100) / 100;
    for (let t = 0; t < 50; t += 1 / 30) S._breedTick(1 / 30);
    const mine = Object.values(S.animals.animals).filter(x => x.owner === A), foal = mine.find(x => x.foal > 0);
    out.born = mine.length - ponies0; out.foalOwner = !!foal; out.foalSex = foal && PonyLook.sexOf(foal.look); out.rest = m1.breedRest > 0 && fe.breedRest > 0; out.done = Object.keys(S.breeding).length; out.barGone = fe.breedP === undefined;
    out.foalOut = foal && !foal.stall; out.canRide = !!findRide(Object.assign({}, P, { x: foal.x, y: foal.y }), { [foal.id]: foal }, A);
    // nobody can join a pair that is breeding: the parents are left alone
    S.animals.animals[m1.id].breedRest = 0; fe.breedRest = 0; go(); out.again = Object.keys(S.breeding).length;
    const third = mk('f'); S._breedTick(1 / 30); out.cancelled = Object.keys(S.breeding).length; out.thirdIn = !!third.stall;
    return JSON.stringify(out);
  })()`));
  assert.strictEqual(r.oneAlone, 0, 'one pony cannot breed'); assert.strictEqual(r.twoMales, 0, 'two stallions cannot'); assert.strictEqual(r.started, 1); assert.strictEqual(r.barStart, 0);
  assert(r.half > 0.4 && r.half < 0.6, 'the bar is half full at half the time: ' + r.half);
  assert.strictEqual(r.born, 1, 'one foal'); assert(r.foalOwner); assert(['f', 'm'].includes(r.foalSex)); assert(r.rest, 'the parents rest'); assert.strictEqual(r.done, 0); assert(r.barGone);
  assert(r.foalOut, 'the foal is born outside the stall'); assert(!r.canRide, 'a foal cannot be ridden yet');
  assert.strictEqual(r.again, 1, 'they can breed again once rested'); assert.strictEqual(r.cancelled, 1, 'a third pony is refused, the breeding goes on'); assert(!r.thirdIn);
});
test('every stall has a name of its own, shown on the stall button and in its menu', () => {
  const r = JSON.parse(run(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A];
    S.interiors.enter(A, P, BuildingSites.list.find(x => x.def.id === 'pony_stable').index);
    const map = S.mapOf(P), stalls = map.plan.layout.furniture.filter(g => g.id === 'stall'), names = stalls.map(f => Stable.stallName(map, f));
    const f = stalls[1]; P.x = f.x + 1.5; P.y = f.y + 5.5; S.pendingEvents.length = 0; S._openStall(A, { fx: f.x, fy: f.y });
    const menu = S.pendingEvents.find(e => e.type === 'stallMenu'), near = Stable.stallsNear(map, P)[0];
    return JSON.stringify({ n: names.length, unique: new Set(names).size, menuName: menu && menu.name, hint: near && Stable.stallName(map, near.f), first: names[0], label: findStall(map, P, '', {}, A).label });
  })()`));
  assert.strictEqual(r.n, 12); assert.strictEqual(r.unique, 12, 'twelve different names'); assert(r.menuName && r.menuName === r.hint, JSON.stringify(r)); assert(r.label.startsWith(r.menuName)); assert.strictEqual(r.first, 'Stable 1');
});
test('stalls can be renamed from the menu (and numbered again); stabling a main pony unsets it as main', () => {
  const r = JSON.parse(run(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A];
    for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
    S.interiors.enter(A, P, BuildingSites.list.find(x => x.def.id === 'pony_stable').index);
    const map = S.mapOf(P), f = map.plan.layout.furniture.find(g => g.id === 'stall' && g.x === 1 && g.y === 1); P.x = f.x + 1.5; P.y = f.y + 5.5;
    const out = { before: Stable.stallName(map, f) };
    S.pendingEvents.length = 0; S._stallPick(A, { act: 'rename', animal: '', fx: f.x, fy: f.y, what: '  Star<b>light  ' });
    out.after = Stable.stallName(map, f); out.menu = (S.pendingEvents.find(e => e.type === 'stallMenu') || {}).name; out.snap = S.stallNamesUpdateFor(A);
    const saved = SaveData.stallNameState(JSON.parse(JSON.stringify(S.stallNames))); out.saved = saved[gridOf(P)][f.x + ',' + f.y];
    S._stallPick(A, { act: 'rename', animal: '', fx: f.x, fy: f.y, what: '' }); out.reset = Stable.stallName(map, f);
    const id = S.animals.spawn('pony_plain', f.x + 1, f.y + 5.5, 0, { level: 1 }), a = S.animals.animals[id];
    a.owner = A; a.main = true; a.leashed = true; a.grid = gridOf(P); a.x = P.x + 0.5; a.y = P.y;
    S._stallPick(A, { act: 'in', animal: id, fx: f.x, fy: f.y }); out.stalled = !!a.stall; out.main = !!a.main;
    S._stallPick(A, { act: 'out', animal: id }); out.mainAfterOut = !!a.main;
    return JSON.stringify(out);
  })()`));
  assert.strictEqual(r.before, 'Stable 1'); assert.strictEqual(r.after, 'Starblight'); assert.strictEqual(r.menu, 'Starblight'); assert(r.snap && Object.values(r.snap).includes('Starblight'));
  assert.strictEqual(r.saved, 'Starblight'); assert.strictEqual(r.reset, 'Stable 1'); assert(r.stalled); assert.strictEqual(r.main, false, 'stabled: no longer main'); assert.strictEqual(r.mainAfterOut, false, 'taking it out does not make it main again');
});
test('a pony in a stall that is still marked main (old save) gives it up and is not pulled out to the player', () => {
  const r = JSON.parse(run(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A];
    for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
    S.interiors.enter(A, P, BuildingSites.list.find(x => x.def.id === 'pony_stable').index);
    const map = S.mapOf(P), f = map.plan.layout.furniture.find(g => g.id === 'stall' && g.x === 1 && g.y === 1); P.x = f.x + 1.5; P.y = f.y + 5.5;
    const id = S.animals.spawn('pony_plain', f.x + 1, f.y + 1, 0, { level: 1 }), a = S.animals.animals[id];
    a.owner = A; a.leashed = true; a.grid = gridOf(P); a.x = P.x + 0.5; a.y = P.y;
    S._stallPick(A, { act: 'in', animal: id, fx: f.x, fy: f.y });
    a.main = true;                                                                                      // (as an old save could leave it)
    const at = { x: a.x, y: a.y }; P.x += 9; P.y += 9;
    S._keepMainPoniesClose();
    return JSON.stringify({ stalled: !!a.stall, main: !!a.main, moved: Math.hypot(a.x - at.x, a.y - at.y), found: !!S._mainPonyOf(A) });
  })()`));
  assert(r.stalled); assert.strictEqual(r.main, false, 'a stalled pony is not the main pony'); assert.strictEqual(r.moved, 0, 'it stays in its stall'); assert.strictEqual(r.found, false);
});
test('dev: clear all ponies removes every pony (wild, owned, stalled, ridden) and nothing else, only for the host', () => {
  const r = JSON.parse(run(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A];
    const ponies = () => Object.values(S.animals.animals).filter(a => AnimalDefs[a.type].pony).length, others = () => Object.values(S.animals.animals).filter(a => !AnimalDefs[a.type].pony).length;
    S.animals.spawn('pony_plain', P.x + 5, P.y, 0, { level: 1 });                                               // a wild one
    const own = S.animals.animals[S.animals.spawn('pony_earth', P.x + 1, P.y, 0, { level: 1 })]; own.owner = A; own.breedP = 0;
    S.breeding = { 'x|1,1': { owner: A, ids: [own.id], t: 1 } };
    const guest = S.joinHuman ? S.joinHuman('prince', 'Friend') : null, hostId = S.hostId;
    const mid = ponies(); S.receiveCommand(guest, { type: 'clearPonies' });
    const out = { guestBlocked: !guest || ponies() === mid && mid > 0 };
    const before = { ponies: ponies(), others: others() };
    S.receiveCommand(hostId, { type: 'clearPonies' });
    Object.assign(out, { before, after: { ponies: ponies(), others: others() }, breeding: Object.keys(S.breeding).length, host: hostId === A });
    return JSON.stringify(out); })()`));
  assert(r.before.ponies >= 2, 'there were ponies'); assert.strictEqual(r.after.ponies, 0); assert.strictEqual(r.after.others, r.before.others, 'other animals stay'); assert.strictEqual(r.breeding, 0);
  assert(r.guestBlocked, 'a guest cannot clear them'); assert(r.host, 'the first player is the host');
});
test('multiplayer: everyone shares the host\'s stable, and the host sets what each guest may do', () => {
  const r = JSON.parse(run(`(() => {
    const S = new GameServer(7), H = S.addPlayer(), G = S.addPlayer(), site = BuildingSites.list.find(x => x.def.id === 'pony_stable').index, out = {};
    out.same = S.interiors.gridFor(H, BuildingSites.list[site]) === S.interiors.gridFor(G, BuildingSites.list[site]);
    out.levels = [S._stableAccess(H), S._stableAccess(G)];
    S._setStableAccess(G, { target: H, level: 'none' }); out.guestCannotSet = S._stableAccess(H) === 'full';
    const gp = S.players[G], hp = S.players[H];
    S._setStableAccess(H, { target: G, level: 'none' }); S.interiors.enter(G, gp, site); out.shutOut = !gridOf(gp);
    S._setStableAccess(H, { target: G, level: 'default' }); S.interiors.enter(G, gp, site); out.in = !!gridOf(gp);
    const a = { owner: H }, b = { owner: G };
    out.def = [S._canManage(G, a), S._canManage(G, b)];
    S._setStableAccess(H, { target: G, level: 'full' }); out.full = [S._canManage(G, a), S._canManage(G, b), S._isMyStable(G, gridOf(gp))];
    S._setStableAccess(H, { target: G, level: 'none' }); out.kicked = !gridOf(gp);
    return JSON.stringify(out); })()`));
  assert(r.same, 'one stable'); assert.deepStrictEqual(r.levels, ['full', 'default']); assert(r.guestCannotSet);
  assert(r.shutOut, 'no access: cannot enter'); assert(r.in, 'default: can enter');
  assert.deepStrictEqual(r.def, [false, true], 'default: only their own ponies'); assert.deepStrictEqual(r.full, [true, true, true]); assert(r.kicked, 'closing the stable walks a guest out');
});
console.log(passed + ' passed');
