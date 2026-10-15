'use strict';
/* TOOLS - the stable's size, sending ponies away and the pony vendor:  node tools/test-trade.js */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };
const SETUP = `
  const S = new GameServer(7), A = S.addPlayer(), P = S.players[A];
  for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
  { const inv = S.inventories[A]; for (const sl of inv.toJSON()) if (sl) inv.remove(sl.id, sl.count); }
  S.interiors.enter(A, P, BuildingSites.list.find(x => x.def.id === 'pony_stable').index);
  const map = S.mapOf(P), L = map.plan.layout, desk = L.furniture.find(g => g.id === 'stable_desk'), vend = L.furniture.find(g => g.id === 'pony_vendor');
  const at = f => Object.assign(P, { x: f.x + f.w / 2, y: f.y + 1.6 });
  const pony = (main = false, type = 'pony_plain') => { const id = S.animals.spawn(type, P.x, P.y, 0, { level: 3 }), a = S.animals.animals[id]; a.owner = A; a.grid = gridOf(P); a.main = main; return a; };
  const bank = () => S._bankOfRoom(P), coin = PonyCoins.itemOf(PonyCoins.ids[0]), gold = () => Math.floor(S.inventories[A].purse / Coins.value('gold_coin'));`;

test('you start with room for 100 ponies; a stable upgrade, paid in pony coins from the desk, adds 25 each time', () => {
  assert.strictEqual(JSON.parse(run('JSON.stringify([CONFIG.sim.ponyCap.base, CONFIG.sim.ponyCap.perLevel, SaveData.MAX_PETS])')).join(), '100,25,400');
  const r = JSON.parse(run(`(() => { ${SETUP}
    at(desk); const out = { cap0: S._ponyCapOf(A) };
    S._deskPick(A, { act: 'upCap', fx: desk.x, fy: desk.y }); out.noCoins = S._ponyCapOf(A);
    bank().add(coin, 200); const before = PonyCare.coins(bank());
    S._deskPick(A, { act: 'upCap', fx: desk.x, fy: desk.y }); out.cap1 = S._ponyCapOf(A); out.paid = before - PonyCare.coins(bank());
    S.pendingEvents.length = 0; S._deskPick(A, { act: 'upCap', fx: desk.x, fy: desk.y }); const ev = S.pendingEvents.find(e => e.type === 'deskMenu'); out.cap2 = ev.cap.max; out.level = ev.cap.level;
    for (let i = 0; i < 6; i++) S._deskPick(A, { act: 'upCap', fx: desk.x, fy: desk.y }); out.top = S._ponyCapOf(A);
    const saved = SaveData.careState(JSON.parse(JSON.stringify(S.care))); out.saved = saved[S._stableGridOf(A)].cap;
    return JSON.stringify(out); })()`));
  assert.strictEqual(r.cap0, 100); assert.strictEqual(r.noCoins, 100, 'no coins, no upgrade'); assert.strictEqual(r.cap1, 125); assert.strictEqual(r.paid, 10); assert.strictEqual(r.cap2, 150); assert.strictEqual(r.level, 2);
  assert.strictEqual(r.top, 225, 'the biggest stable keeps 225'); assert.strictEqual(r.saved, 5, 'the level is saved');
});
test('breeding stops at the limit', () => {
  const r = JSON.parse(run(`(() => { ${SETUP} CONFIG.sim.ponyCap.base = 30;
    const f = L.furniture.find(g => g.id === 'stall' && g.x === 1 && g.y === 1); P.x = f.x + 1.5; P.y = f.y + 5.5;
    const mk = sex => { const a = pony(); a.look[6] = sex === 'f' ? 128 : 0; a.leashed = true; a.x = P.x + 0.5; a.y = P.y; S._stallPick(A, { act: 'in', animal: a.id, fx: f.x, fy: f.y }); return a; };
    mk('m'); mk('f'); for (let i = 0; i < 28; i++) pony();
    const full = S._breedInfo(A, P, f, Stable.occupants(S.animals.animals, P, f));
    S._careRoom(S._stableGridOf(A)).cap = 1; const roomy = S._breedInfo(A, P, f, Stable.occupants(S.animals.animals, P, f));
    return JSON.stringify({ n: S._ponyCount(A), full, roomy }); })()`));
  assert.strictEqual(r.n, 30); assert.strictEqual(r.full.can, false); assert(/30 ponies/.test(r.full.reason)); assert.strictEqual(r.roomy.can, true);
});
test('the desk lists your ponies and sends one away (never the main pony); it goes wild', () => {
  const r = JSON.parse(run(`(() => { ${SETUP}
    at(desk); const main = pony(true), other = pony();
    S.pendingEvents.length = 0; S._deskPick(A, { act: 'remove', animal: main.id, fx: desk.x, fy: desk.y }); const kept = main.owner === A;
    S._deskPick(A, { act: 'remove', animal: other.id, fx: desk.x, fy: desk.y }); const menu = S.pendingEvents.filter(e => e.type === 'deskMenu').pop();
    return JSON.stringify({ kept, gone: other.owner === '', listed: menu.ponies.length, care: menu.care }); })()`));
  assert(r.kept, 'main pony stays'); assert(r.gone, 'the other went wild'); assert.strictEqual(r.listed, 1); assert.strictEqual(r.care, false, 'the desk works with pony care off');
});
test('the vendor sells ponies for gold (the same stock for the day) and buys yours for half', () => {
  const r = JSON.parse(run(`(() => { ${SETUP}
    at(vend); S.inventories[A].add('gold_coin', 500); const g0 = gold();
    S.pendingEvents.length = 0; S._useVendor(A, P, { fx: vend.x, fy: vend.y }); const menu = S.pendingEvents.find(e => e.type === 'vendorMenu'), item = menu.buy[0];
    const again = PonyTrade.stock(gridOf(P), S._vendorDay())[0].gene === PonyTrade.stock(gridOf(P), S._vendorDay())[0].gene;
    S._vendorPick(A, { act: 'buy', index: 0, fx: vend.x, fy: vend.y }); const bought = Object.values(S.animals.animals).find(a => a.owner === A);
    S._vendorPick(A, { act: 'buy', index: 0, fx: vend.x, fy: vend.y }); const count = S._ponyCount(A);
    const spent = g0 - gold(), look = bought && bought.look, same = look && PonyLook.fromGene(PonyTrade.stock(gridOf(P), S._vendorDay())[0].gene, 0, AnimalDefs[bought.type].rarity).join() === look.join();
    const g1 = gold(); bought.main = true; S._vendorPick(A, { act: 'sell', animal: bought.id, fx: vend.x, fy: vend.y }); const mainKept = !!S.animals.animals[bought.id];
    bought.main = false; S._vendorPick(A, { act: 'sell', animal: bought.id, fx: vend.x, fy: vend.y });
    return JSON.stringify({ n: menu.buy.length, price: item.price, again, spent, count, same, mainKept, sold: !S.animals.animals[bought.id], got: gold() - g1, sellPrice: PonyTrade.sellPrice(bought.type, bought.level, bought.look) }); })()`));
  assert.strictEqual(r.n, 4); assert(r.again, 'the same stock for the day'); assert.strictEqual(r.spent, r.price, 'paid the price'); assert.strictEqual(r.count, 1, 'a pony is sold once'); assert(r.same, 'you get the pony you saw');
  assert(r.mainKept, 'the main pony is not sold'); assert(r.sold); assert.strictEqual(r.got, r.sellPrice); assert(r.sellPrice <= Math.ceil(r.price / 2) + 0, 'half price: ' + r.sellPrice + ' vs ' + r.price);
});
test('the vendor will not sell without gold or above your limit', () => {
  const r = JSON.parse(run(`(() => { ${SETUP} CONFIG.sim.ponyCap.base = 30;
    at(vend); S.inventories[A].setCoins(Coins.empty()); S._vendorPick(A, { act: 'buy', index: 0, fx: vend.x, fy: vend.y }); const poor = S._ponyCount(A);
    S.inventories[A].add('gold_coin', 5000); for (let i = 0; i < 30; i++) pony();
    S._vendorPick(A, { act: 'buy', index: 1, fx: vend.x, fy: vend.y }); return JSON.stringify({ poor, n: S._ponyCount(A) }); })()`));
  assert.strictEqual(r.poor, 0); assert.strictEqual(r.n, 30);
});
console.log(passed + ' passed');
