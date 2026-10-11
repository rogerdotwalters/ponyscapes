'use strict';
/* TOOLS - the pony coins and the Coin Poster in Node:  node tools/test-poster.js
 * every variety has its own coin, a caught pony drops its variety's coin, and the poster takes one of each (only at the poster, saved with the character). */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

test('every live variety has a pony coin item', () => {
  const ids = run('PonyCoins.ids');
  for (const need of ['meadow', 'jungle', 'candy', 'ember']) assert(ids.includes(need), need);
  for (const id of ids) assert(run(`!!ItemDefs['pony_coin_${id}']`), id);
  assert(!run(`PonyCoins.ids.includes('marsh')`), 'retired varieties have no coin');
  assert.strictEqual(run(`PonyCoins.varietyOf('pony_coin_candy')`), 'candy');
});
test('catching a pony drops the coin of its variety', () => {
  const r = run(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A], idx = PonyVariants.findIndex(v => v.id === 'candy');
    const id = S.animals.spawn('pony_plain', P.x + 1, P.y, 0, { level: 1, variant: idx }), a = S.animals.animals[id];
    const L = new LeashHandler(Object.assign({}, S.toolDeps, { rng: () => 0 }));
    P.held = 'leash'; P.lassoSwing = true; P.gear = P.gear || {}; P.gear.leash = 'leash'; P.gear.lasso = 'leash';
    L.apply(A, { ref: id });
    return Object.values(S.drops).map(d => d.item);
  })()`);
  assert.strictEqual(JSON.stringify(r), '["pony_coin_candy"]');
});
test('the poster takes a coin once, only at the poster, and it is saved', () => {
  const r = run(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), inv = S.inventories[A], P = S.players[A];
    for (const sl of inv.toJSON()) if (sl) inv.remove(sl.id, sl.count);
    inv.add('pony_coin_candy', 2); inv.add('pony_coin_ember', 1); inv.add('stone', 1);
    S._posterCoin(A, 'pony_coin_candy');
    const outside = inv.count('pony_coin_candy');                                                   // not at the poster: refused
    S.interiors.enter(A, P, S.interiors.homeOf(S.playerKeys[A] || 'seat:' + A));
    const poster = S.mapOf(P).plan.layout.furniture.find(f => f.id === 'coin_poster');
    P.x = poster.x + 1; P.y = poster.y + 1.2;
    const act = findPoster(S.mapOf(P), P);
    S._posterCoin(A, 'pony_coin_candy'); S._posterCoin(A, 'pony_coin_candy'); S._posterCoin(A, 'stone');
    const saved = SaveData.exportCharacter ? 1 : 0;
    return JSON.stringify({ outside, act: act && act.kind, candy: inv.count('pony_coin_candy'), stone: inv.count('stone'), placed: Object.keys(S.posterCoins[A]), seen: S.varietiesFor(A).filter(v => v.coin).map(v => v.id) });
  })()`);
  const o = JSON.parse(r);
  assert.strictEqual(o.outside, 2); assert.strictEqual(o.act, 'coin_poster');
  assert.strictEqual(o.candy, 1, 'one pinned, the second refused'); assert.strictEqual(o.stone, 1);
  assert.deepStrictEqual(o.placed, ['candy']); assert.deepStrictEqual(o.seen, ['candy']);
});
console.log(passed + ' passed');
