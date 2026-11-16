'use strict';
/* TOOLS - checks the legendary ponies in Node (no browser):  node tools/test-legends.js
 * four named ponies, each one coat / mane / mark and always legendary; only the host can call them; they have a power and a coin; they are never wild and never bred (a foal is not a copy of one). */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 5).join('\n       ')); process.exitCode = 1; } };

test('the four are registered, each its own kind, with a fixed look', () => {
  assert.deepStrictEqual(JSON.parse(run(`JSON.stringify(Hybrids.legends())`)), ['twilight_sparkle', 'rainbow_dash', 'rarity', 'pinkie_pie', 'fluttershy', 'applejack']);
  assert.deepStrictEqual(JSON.parse(run(`JSON.stringify(Hybrids.legends().map(id => { const d = PonyLook.describe(Hybrids.legendLook(id)); return [d.name, d.rarity.id, AnimalDefs['pony_' + id].wings === true, AnimalDefs['pony_' + id].horn === true]; }))`)),
    [['Twilight Sparkle', 'legendary', true, true], ['Rainbow Dash', 'legendary', true, false], ['Rarity', 'legendary', false, true], ['Pinkie Pie', 'legendary', false, false], ['Fluttershy', 'legendary', true, false], ['Applejack', 'legendary', false, false]]);
  assert.strictEqual(run(`PonyLook.describe(Hybrids.legendLook('rainbow_dash')).trail.level`), 2);
});
test('a legend arrives as the host\'s own pony (the command is host-only: gameServer.js)', () => {
  run(`globalThis.S = new GameServer(5); globalThis.a = S.joinHuman(null, 'host', null, 'ka'); globalThis.b = S.joinHuman(null, 'friend', null, 'kb');
    S.handleCommand ? 0 : 0; S._devSpawnLegend('pinkie_pie');`);
  const mine = id => run(`Object.values(S.animals.animals).filter(x => x.owner === ${id} && x.type === 'pony_pinkie_pie').length`);
  assert.strictEqual(mine(JSON.stringify(run('a'))), 1);
  assert.strictEqual(mine(JSON.stringify(run('b'))), 0);
  assert.strictEqual(run(`(() => { const p = Object.values(S.animals.animals).find(x => x.type === 'pony_pinkie_pie'); return PonyLook.describe(p.look).name; })()`), 'Pinkie Pie');
  run(`S._devSpawnLegend('not_a_legend'); S._devSpawnLegend('meadow')`);
  assert.strictEqual(run(`Object.values(S.animals.animals).filter(x => PonyVariants[(x.look || [])[4] | 0].legend).length`), 1, 'unknown ids spawn nothing');
});
test('a legend has a power, a coin, is never wild and is not a hybrid to breed from', () => {
  for (const id of ['twilight_sparkle', 'rainbow_dash', 'rarity', 'pinkie_pie', 'fluttershy', 'applejack']) {
    assert.strictEqual(run(`PonySkills.tree(Hybrids.legendLook('${id}'), 'pony_${id}', 1).some(s => s.ability && s.unlocked)`), true, id + ' power');
    assert.strictEqual(run(`!!ItemDefs['pony_coin_${id}']`), true, id + ' coin');
    assert.strictEqual(run(`Hybrids.isHybrid('${id}')`), false);
  }
  assert.strictEqual(run(`Hybrids.possible('twilight_sparkle', 'rarity').length`), 0, 'no chaos from two legends');
});
test('a foal of a legend is not a copy of it', () => {
  run(`globalThis.F = new GameServer(9); F.joinHuman(null, 'h', null, 'k');`);
  const bad = run(`(() => { const L = Hybrids.legendLook('twilight_sparkle'); let n = 0; for (let i = 0; i < 60; i++) { const look = F._foalLook({ look: L }, { look: L }); if (PonyVariants[look[4] | 0].legend) n++; } return n; })()`);
  assert.strictEqual(bad, 0);
});
console.log(passed + ' passed');
