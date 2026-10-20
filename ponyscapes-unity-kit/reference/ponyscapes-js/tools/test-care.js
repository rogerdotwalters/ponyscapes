'use strict';
/* TOOLS - pony care in Node:  node tools/test-care.js
 * food, water, happiness, friendship and running away; one pony per stall; the stable desk (bank, tanks, automation); parents locked while breeding. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
/* a world with one player standing in their stable, in front of stall (1,1), on = pony care switched on */
const SETUP = on => `
  const S = new GameServer(7), A = S.addPlayer(), P = S.players[A];
  for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
  S.interiors.enter(A, P, BuildingSites.list.find(x => x.def.id === 'pony_stable').index);
  { const inv = S.inventories[A]; for (const sl of inv.toJSON()) if (sl) inv.remove(sl.id, sl.count); }
  ${on ? 'S.applySetting("ponyCare", true);' : ''}
  const map = S.mapOf(P), L = map.plan.layout, F = (x, y) => L.furniture.find(g => g.id === 'stall' && g.x === x && g.y === y), f = F(1, 1);
  const mk = (sex, st = f) => { const id = S.animals.spawn('pony_plain', st.x + 1, st.y + 5.5, 0, { level: 1 }), a = S.animals.animals[id];
    a.look[6] = sex === 'f' ? 128 : 0; a.owner = A; a.leashed = true; a.grid = gridOf(P); P.x = st.x + 1.5; P.y = st.y + 5.5; a.x = P.x + 0.5; a.y = P.y;
    S._stallPick(A, { act: 'in', animal: id, fx: st.x, fy: st.y }); return a; };
  const tick = secs => { for (let t = 0; t < secs; t += 1 / 3) { S.tick += 10; S._careTick(1 / 30); } };
  const apple = Object.keys(ItemDefs).find(i => ItemDefs[i].apple), coin = PonyCoins.itemOf(PonyCoins.ids[0]);
  const bank = () => S._bankOfRoom(P), pick = (what, st = f) => S._stallPick(A, { act: 'care', what, animal: '', fx: st.x, fy: st.y });`;

test('with pony care off (the default) nothing is hungry, thirsty or unhappy', () => {
  const r = JSON.parse(run(`(() => { ${SETUP(false)}
    const a = mk('m'); tick(3000); return JSON.stringify({ off: S.settings.ponyCare, hunger: a.hunger, stalled: !!a.stall, owner: a.owner === A });
  })()`));
  assert.strictEqual(r.off, false); assert.strictEqual(r.hunger, undefined); assert(r.stalled && r.owner);
});
test('with it on, ponies get hungry and thirsty, and a fed stalled pony eats and drinks from its own bowls', () => {
  const r = JSON.parse(run(`(() => { ${SETUP(true)}
    const a = mk('m'); tick(60); const drained = a.hunger < 100 && a.thirst < 100, h0 = a.hunger;
    P.sel = 0; const inv = S.inventories[A]; inv.add(apple, 30); inv.add('watering_can', 1);
    pick('fillFood'); pick('fillWater'); const rec = S._careStall(gridOf(P), f.x + ',' + f.y), bowls = [rec.food, rec.water];
    tick(1200); const rec2 = S._careStall(gridOf(P), f.x + ',' + f.y);
    return JSON.stringify({ drained, bowls, hunger: a.hunger, thirst: a.thirst, happy: a.happy, food: rec2.food, water: rec2.water });
  })()`));
  assert(r.drained); assert(r.bowls[0] > 0 && r.bowls[1] > 0, 'the bowls were filled: ' + r.bowls);
  assert(r.hunger > 60 && r.thirst > 60, 'it kept itself fed: ' + r.hunger + ' / ' + r.thirst); assert(r.food < r.bowls[0] && r.water < r.bowls[1], 'the bowls emptied'); assert(r.happy > 70, 'happy: ' + r.happy);
});
test('unfed ponies grow unhappy, lose friendship, and run away if it goes on', () => {
  const r = JSON.parse(run(`(() => { ${SETUP(true)}
    const a = mk('m'); a.befriend(A, 30, 99); const f0 = a.bond(A).into; tick(1900); const unhappy = a.happy, f1 = a.bond(A).into, stillMine = a.owner === A;
    tick(400); return JSON.stringify({ f0, unhappy, f1, stillMine, gone: a.owner === '', stalled: !!a.stall, hunger: a.hunger });
  })()`));
  assert(r.unhappy < 30, 'unhappy: ' + r.unhappy); assert(r.f1 < r.f0, 'friendship fell ' + r.f0 + ' -> ' + r.f1); assert(r.gone && !r.stalled, 'it ran away'); assert.strictEqual(r.hunger, undefined);
});
test('every pony needs its own stall: a second joins only to breed (a stallion and a mare)', () => {
  const r = JSON.parse(run(`(() => { ${SETUP(true)}
    const a = mk('m'), b = mk('m'), c = mk('f');
    S.pendingEvents.length = 0; S._useStall(A, P, { fx: f.x, fy: f.y }); const menu = S.pendingEvents.filter(e => e.type === 'stallMenu').pop();
    const g = F(6, 1), d = mk('m', g), e = mk('m', g);
    return JSON.stringify({ a: !!a.stall, b: !!b.stall, c: !!c.stall, cap: menu.cap, care: !!menu.care, d: !!d.stall, e: !!e.stall });
  })()`));
  assert(r.a && !r.b, 'the second stallion is refused'); assert(r.c, 'a mare may join'); assert.strictEqual(r.cap, 2); assert(r.care); assert(r.d && !r.e, 'one pony per stall');
});
test('parents cannot be removed, petted or fed while breeding', () => {
  const r = JSON.parse(run(`(() => { ${SETUP(true)}
    const m = mk('m'), fe = mk('f'); S._stallPick(A, { act: 'breed', fx: f.x, fy: f.y }); const going = Object.keys(S.breeding).length;
    S._stallPick(A, { act: 'out', animal: m.id }); S._stallPick(A, { act: 'roam', animal: fe.id });
    const third = mk('m'); const pet = S.friendship.act(A, m, 'pet'); S.inventories[A].add(apple, 2); const hungry = (m.hunger = 20); S._giveApple(A, apple, m);
    return JSON.stringify({ going, mIn: !!m.stall, fIn: !!fe.stall, third: !!third.stall, pet, apple: m.hunger === 20, still: Object.keys(S.breeding).length });
  })()`));
  assert.strictEqual(r.going, 1); assert(r.mIn && r.fIn, 'neither can be taken out'); assert(!r.third, 'no one can join'); assert.strictEqual(r.pet, null); assert(r.apple, 'no apples either'); assert.strictEqual(r.still, 1);
});
test('upgrades are paid in pony coins from the stable desk; tanks supply a limited number of stalls', () => {
  const r = JSON.parse(run(`(() => { ${SETUP(true)}
    const a = mk('m'), desk = L.furniture.find(g => g.id === 'stable_desk'); const near = { x: desk.x + 0.5, y: desk.y + 1.5, grid: gridOf(P) }; Object.assign(P, { x: desk.x + 0.5, y: desk.y + 1.5 });
    const out = {};
    S._deskPick(A, { act: 'buyTank', kind: 'water', fx: desk.x, fy: desk.y }); out.noMoney = S._careRoom(gridOf(P)).tanks.water.count;
    bank().add(coin, 200);
    S._deskPick(A, { act: 'buyTank', kind: 'water', fx: desk.x, fy: desk.y }); const room = S._careRoom(gridOf(P)); out.tank = [room.tanks.water.count, room.tanks.water.size, PonyCare.supply(room, 'water')]; out.bankAfter = PonyCare.coins(bank());
    Object.assign(P, { x: f.x + 1.5, y: f.y + 5.5 });
    pick('autoWater'); pick('autoFood'); const rec = S._careStall(gridOf(P), f.x + ',' + f.y); out.auto = [rec.aw, rec.af];
    pick('upWater'); out.bowl = rec.wl;
    for (const st of [F(6, 1), F(22, 1)]) { Object.assign(P, { x: st.x + 1.5, y: st.y + 5.5 }); pick('autoWater', st); }
    out.used = PonyCare.used(room, 'water');
    Object.assign(P, { x: desk.x + 0.5, y: desk.y + 1.5 });
    S._deskPick(A, { act: 'upTank', kind: 'water', fx: desk.x, fy: desk.y }); out.up = [room.tanks.water.size, PonyCare.supply(room, 'water')];
    tick(600); out.filled = rec.water > 0;
    return JSON.stringify(out);
  })()`));
  assert.strictEqual(r.noMoney, 0, 'a tank needs coins'); assert.deepStrictEqual(r.tank, [1, 1, 2]); assert(r.bankAfter < 200);
  assert.deepStrictEqual(r.auto, [true, false], 'water is wired, food has no tank yet'); assert.strictEqual(r.bowl, 1); assert.strictEqual(r.used, 2, 'a tank of 2 feeds just 2 stalls'); assert.deepStrictEqual(r.up, [2, 4]); assert(r.filled);
});
test('the care state survives a save: bowls, tanks and a pony\'s hunger', () => {
  const r = JSON.parse(run(`(() => { ${SETUP(true)}
    S.playerKeys[A] = 'k1'; S.tokenKeys[A] = 'k1'; const a = mk('m'); tick(100); S._careStall(gridOf(P), f.x + ',' + f.y).wl = 2; S._careRoom(gridOf(P)).tanks.food = { size: 2, count: 3 };
    const state = S.interiors.exportState(), clean = SaveData.careState(state.care), pet = SaveData._pet(Object.assign({}, S._exportOwnedPets()[0]));
    return JSON.stringify({ wl: clean[gridOf(P)].stalls[f.x + ',' + f.y].wl, food: clean[gridOf(P)].tanks.food, care: pet && pet.care, hunger: a.hunger });
  })()`));
  assert.strictEqual(r.wl, 2); assert.deepStrictEqual(r.food, { size: 2, count: 3 }); assert(r.care && Math.abs(r.care[0] - r.hunger) < 0.2, JSON.stringify(r));
});
console.log(passed + ' passed');
