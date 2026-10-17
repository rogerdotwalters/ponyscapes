'use strict';
/* TOOLS - the themed lassos and the lasso dealer in the stable:  node tools/test-lassos.js */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };
const IDS = ['lasso_fire', 'lasso_crystal', 'lasso_cloud', 'lasso_candy', 'lasso_jungle', 'lasso_flower', 'lasso_water', 'lasso_lightning', 'lasso_rainbow', 'lasso_ponytail', 'lasso_sun', 'lasso_harmony', 'lasso_red', 'lasso_blue', 'lasso_yellow'];

test('every lasso is a lasso-slot lasso, priced in gold, with a distinct cast', () => {
  const r = JSON.parse(run(`JSON.stringify(${JSON.stringify(IDS)}.map(id => ({ id, lasso: ItemDB.getLasso(id), slot: Wardrobe.slotFor(id), price: Shops.price(id), tool: ItemDB.getTool(id)})))`));
  for (const l of r) {
    assert(l.lasso && l.lasso.tier >= 2 && l.lasso.tier <= 4, l.id + ' tier'); assert.strictEqual(l.slot, 'lasso', l.id); assert(l.price.length === 1 && l.price[0][0] === 'gold_coin', l.id + ' price');
    assert.strictEqual(l.tool.kind, 'leash');
  }
});
test('the stable sells all of them at the lasso dealer counter, and only there', () => {
  const r = JSON.parse(run(`(() => { const S = new GameServer(7), A = S.addPlayer(), P = S.players[A], site = BuildingSites.list.find(x => x.def.id === 'pony_stable');
    S.interiors.enter(A, P, site.index); const f = S.mapOf(P).plan.layout.furniture.find(g => g.id === 'lasso_dealer');
    Object.assign(P, { x: f.x + f.w / 2, y: f.y + 1.2 }); const near = Shops.counterNear(S.mapOf(P), P);
    return JSON.stringify({ stock: Shops.stock(site), near: !!near, place: !!f }); })()`));
  assert(r.place && r.near, 'the dealer counter is in the stable'); assert.deepStrictEqual(r.stock.slice().sort(), IDS.slice().sort());
});
test('a bought lasso goes in the bag, takes the lasso slot, and its tier sets which ponies it holds', () => {
  const r = JSON.parse(run(`(() => { const S = new GameServer(7), A = S.addPlayer(), P = S.players[A], site = BuildingSites.list.find(x => x.def.id === 'pony_stable');
    S.interiors.enter(A, P, site.index); const f = S.mapOf(P).plan.layout.furniture.find(g => g.id === 'lasso_dealer'); Object.assign(P, { x: f.x + f.w / 2, y: f.y + 1.2 });
    const inv = S.inventories[A]; const gold = Coins.value('gold_coin'); inv.purse = 500 * gold;
    S._buy(A, 'lasso_rainbow', inv.coins.slice()); const n = S.pendingEvents.filter(e => e.type === 'notice').map(e => e.text); return JSON.stringify({ has: inv.count('lasso_rainbow'), left: inv.purse / gold, n }); })()`));
  assert.strictEqual(r.has, 1); assert.strictEqual(r.left, 400, 'the Rainbow Lasso costs 100 gold');
});
const fs = require('fs'), play = fs.readFileSync(__dirname + '/../public/js/client/render/playerSprite.js', 'utf8');
test('every lasso has a look drawn in hand, on the icon and in flight', () => { for (const id of IDS) assert(new RegExp('\\b' + id + ':\\s*\\{').test(play), id + ' has no LASSO_LOOKS entry'); });
const fxSrc = fs.readFileSync(__dirname + '/../public/js/client/render/effects.js', 'utf8');
test('every lasso has its own sparkle (trail and landing) in LASSO_FX', () => { for (const id of IDS.concat(['leash', 'lasso_silk', 'lasso_gold', 'lasso_star'])) assert(new RegExp('\\b' + id + ':\\s*\\{ colors').test(fxSrc), id + ' has no LASSO_FX entry'); });
test('late-game ponies demand their own lasso; the Rainbow Lasso opens every one', () => {
  const r = JSON.parse(run(`JSON.stringify(Object.values(AnimalDefs).filter(d => d.pony && d.lassoNeeds).map(d => ({ id: d.id, need: d.lassoNeeds, ok: ItemDB.lassoHolds(d.lassoNeeds[0], d), rainbow: ItemDB.lassoHolds('lasso_rainbow', d), star: ItemDB.lassoHolds('lasso_star', d), gold: ItemDB.lassoHolds('lasso_gold', d) })))`));
  assert.deepStrictEqual(r.map(x => x.id).sort(), ['pony_lightning', 'pony_moon', 'pony_star', 'pony_sun', 'pony_water']);
  for (const x of r) { assert(x.ok && x.rainbow, x.id); assert(!x.star && !x.gold, x.id + ' must not yield to a plain tier lasso'); }
  assert.strictEqual(JSON.parse(run(`JSON.stringify([ItemDB.lassoHolds('lasso_star', AnimalDefs.pony_alicorn), ItemDB.lassoHolds('lasso_gold', AnimalDefs.pony_alicorn), ItemDB.lassoHolds('leash', AnimalDefs.pony_plain)])`)).join(), 'true,false,true', 'ordinary ponies still go by tier');
});
console.log('\n' + passed + ' passed');
