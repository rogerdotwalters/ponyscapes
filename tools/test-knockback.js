'use strict';
/* TOOLS - checks sword knockback in Node (no browser):  node tools/test-knockback.js */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const tiles = (damage, lv) => run(`knockTiles(${damage}, { s: { hunting: ${lv} }, a: { strength: ${lv} } })`);
// a creature 1 tile east of a spot on open ground, hit with the given knockback; how far it ends up from the spot after the shove plays out
const pushed = (type, tilesN) => run(`(() => {
  const S = new GameServer(4242), A = S.addPlayer(), P = S.players[A];
  const id = S.animals.spawn('${type}', P.x + 1, P.y), a = S.animals.animals[id], def = AnimalDefs[a.type];
  a.hp = 999; a.tvx = a.tvy = 0; const x0 = a.x;
  S.animals.damage(id, 1, { fromX: P.x, fromY: P.y, tiles: ${tilesN} });
  a.tvx = a.tvy = 0; for (let i = 0; i < 12; i++) { a.tvx = a.tvy = 0; a.vx = a.vy = 0; S.animals._move(a, def, TICK_DT); }
  return a.x - x0; })()`);

test('heavier swords and higher skill shove further', () => {
  assert(tiles(16, 1) > tiles(3, 1), 'broadsword beats wooden sword');
  assert(tiles(8, 30) > tiles(8, 1), 'a skilled hunter shoves further');
  assert(tiles(16, 1) < 3 && tiles(3, 1) > 0.3, 'but only a shove: ' + tiles(3, 1) + ' to ' + tiles(16, 99));
});

test('a hit slime slides away from the attacker by about that many tiles', () => {
  const d = pushed('slime', 1);
  assert(d > 0.6 && d <= 1.05, 'moved ' + d);
  assert(pushed('slime', 0.5) < d);
});

test('bosses barely budge', () => {
  assert(pushed('boss_cave_bear', 1) < pushed('slime', 1) / 2);
});

console.log(passed + ' passed');
