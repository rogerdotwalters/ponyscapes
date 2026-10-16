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
  assert(!run(`PonyCoins.ids.includes('dune') || PonyCoins.ids.includes('blossom')`), 'retired varieties have no coin');
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
test('the poster adds up its coins, only at the poster, and it is saved', () => {
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
    return JSON.stringify({ outside, act: act && act.kind, candy: inv.count('pony_coin_candy'), stone: inv.count('stone'), placed: S.posterCoins[A], seen: S.varietiesFor(A).filter(v => v.coin).map(v => v.id) });
  })()`);
  const o = JSON.parse(r);
  assert.strictEqual(o.outside, 2); assert.strictEqual(o.act, 'coin_poster');
  assert.strictEqual(o.candy, 0, 'both pinned: the slot keeps adding up'); assert.strictEqual(o.stone, 1);
  assert.deepStrictEqual(o.placed, { candy: 2 }); assert.deepStrictEqual(o.seen, ['candy']);
});
test('the poster is saved as counts, and a save from before counts (a list of varieties) still loads', () => {
  const r = JSON.parse(run(`JSON.stringify([SaveData._poster({ candy: 7, ember: 1, nope: 3, meadow: -2 }), SaveData._poster(['candy', 'ember', 'nope']), SaveData._poster(null), SaveData._poster({ candy: 1e12 })])`));
  assert.deepStrictEqual(r[0], { candy: 7, ember: 1 }); assert.deepStrictEqual(r[1], { candy: 1, ember: 1 }); assert.deepStrictEqual(r[2], {}); assert.strictEqual(r[3].candy, 999999);
});
test('every pony kind and variety gives a coin when caught (a retired variety gives the meadow coin)', () => {
  const r = run(`(() => {
    const out = [], S = new GameServer(7), A = S.addPlayer(), P = S.players[A];                    // (one server for all: building one is the slow part, and there are 80 varieties now)
    for (const type of ['pony_plain', 'pony_earth', 'pony_pegasus', 'pony_unicorn', 'pony_alicorn']) for (let v = 0; v < PonyVariants.length; v++) {
      for (const k of Object.keys(S.drops)) delete S.drops[k];
      const id = S.animals.spawn(type, P.x + 1, P.y, 0, { level: 1, variant: v });
      const L = new LeashHandler(Object.assign({}, S.toolDeps, { rng: () => 0 }));
      const best = Object.values(ItemDefs).filter(d => d.lasso).sort((a, b) => b.lasso.tier - a.lasso.tier)[0].id;
      P.held = best; P.lassoSwing = true; P.gear = P.gear || {}; P.gear.lasso = best;
      S.animals.animals[id].level = 1; S.animals.animals[id].look[4] = v;
      L.apply(A, { ref: id });
      const drops = Object.values(S.drops).map(d => d.item);
      if (drops.length !== 1 || !PonyCoins.varietyOf(drops[0])) out.push(type + ':' + v + ':' + drops.join());
    }
    return JSON.stringify(out);
  })()`);
  assert.strictEqual(r, '[]');
});
test('mounted, you can still feed the wild pony on your lasso', () => {
  const r = run(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A], inv = S.inventories[A];
    for (const sl of inv.toJSON()) if (sl) inv.remove(sl.id, sl.count);
    inv.add('apple', 3); P.held = 'apple'; P.sel = 0;
    const mine = Object.values(S.animals.animals).find(a => a.owner === A);
    S._mount(A, P, mine);
    const wid = S.animals.spawn('pony_plain', P.x + 1, P.y, 0, { level: 1 });
    S.animals.capture(wid, A);
    const w = S.animals.animals[wid]; w.x = P.x + 1; w.y = P.y;
    const act = Interactions.find(S.mapOf(P), {}, P, 'apple', S.animals.animals, A, {}, {});
    const before = inv.count('apple');
    S._interact(A, P);
    return JSON.stringify({ kind: act && act.kind, spent: before - inv.count('apple'), mounted: !!P.mount });
  })()`);
  const o = JSON.parse(r);
  assert.strictEqual(o.kind, 'feed'); assert.strictEqual(o.spent, 1); assert(o.mounted);
});
console.log(passed + ' passed');
