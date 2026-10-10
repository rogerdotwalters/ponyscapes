'use strict';
/* TOOLS - checks the pony skill trees in Node (no browser):  node tools/test-skills.js
 * meadow ponies: Leaf Blast (a cone of leaves) and a power from the cutie mark, unlocked by the pony's level, fired from the saddle. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const MARKS = ['star', 'heart', 'flower', 'moon', 'cloud', 'apple', 'drop', 'note'];
/** The host riding an own meadow pony of `level` with this cutie mark, in the open near the village, facing east. */
const ride = (mark, level) => run(`(() => {
  globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.PA = S.players[A];
  const look = PonyLook.fromGene(7, 0); look[2] = PonyPalette.marks.indexOf('${mark}');
  const x = PA.x, y = PA.y, id = S.animals.spawn('pony_plain', x, y, 0, { level: ${level} }), a = S.animals.animals[id];
  a.look = look; a.owner = A; a.rider = A; PA.mount = id; PA.mountLevel = ${level}; PA.facing = 0; globalThis.PONY = a;
  S._updateCompanions(); return PA.abilities.slice();
})()`);
/** A creature of this type, `dx` tiles east (and `dy` south) of the rider. */
const foe = (type, dx, dy = 0) => run(`(() => { const id = S.animals.spawn('${type}', PA.x + ${dx}, PA.y + ${dy}, 0, { level: 1 }); S.animals.animals[id].hp = S.animals.animals[id].maxHp = 100; return id; })()`);
const hpOf = id => run(`S.animals.animals['${id}'].hp`);
const fire = i => run(`(() => { S.tick += 5; S._useRarityAbility(A, PA, ${i}); })()`);

test('a meadow pony\'s tree: Leaf Blast from level 3, its cutie-mark power from level 6; other varieties have none yet', () => {
  const tree = lvl => run(`PonySkills.tree(PonyLook.fromGene(7, 0), 'pony_plain', ${lvl}).map(s => [s.id, s.unlocked])`);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(tree(2))), [['leaf_blast', false], ['cutie_mark', false]]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(tree(3))), [['leaf_blast', true], ['cutie_mark', false]]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(tree(6))), [['leaf_blast', true], ['cutie_mark', true]]);
  assert.strictEqual(run(`PonySkills.tree(PonyLook.fromGene(7, 1), 'pony_plain', 30).length`), 0, 'a moss pony has no tree yet');
});

test('every meadow cutie mark has its own power', () => {
  const names = MARKS.map(m => run(`PonySkills.markAbility('${m}')`));
  assert(names.every(Boolean) && new Set(names).size === MARKS.length, names.join());
});

test('riding a pony of the right level gives the rider its skills (after rarity abilities)', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ride('star', 2))).filter(a => /leaf|mark/.test(a)), []);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ride('star', 3))).filter(a => /leaf|mark/.test(a)), ['leaf_blast']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ride('star', 6))).filter(a => /leaf|mark/.test(a)), ['leaf_blast', 'mark_star']);
});

test('Leaf Blast: a cone of leaves hurts hostile creatures ahead, not those behind or out of reach; it has a cooldown', () => {
  ride('flower', 3);
  const ahead = foe('slime', 2), aside = foe('slime', 0.5, 3), behind = foe('slime', -2), far = foe('slime', 6);
  const slot = run(`PA.abilities.indexOf('leaf_blast')`);
  fire(slot);
  assert(hpOf(ahead) < 100, 'hit ahead'); assert.strictEqual(hpOf(aside), 100, 'not beside'); assert.strictEqual(hpOf(behind), 100, 'not behind'); assert.strictEqual(hpOf(far), 100, 'not too far');
  const once = hpOf(ahead); fire(slot); assert.strictEqual(hpOf(ahead), once, 'on cooldown');
  assert(run(`PA.abilityCd[${slot}]`) > 6);
});

test('a skill grows with its pony\'s level', () => {
  ride('flower', 3); const a1 = foe('slime', 2); fire(run(`PA.abilities.indexOf('leaf_blast')`)); const weak = 100 - hpOf(a1);
  ride('flower', 30); const a2 = foe('slime', 2); fire(run(`PA.abilities.indexOf('leaf_blast')`)); const strong = 100 - hpOf(a2);
  assert(strong > weak * 2, weak + ' vs ' + strong);
});

test('cutie-mark powers: heart heals friends, drop heals you, apple fills the bag, star hurts, note and flower slow, cloud scares, moon speeds you', () => {
  const power = mark => { ride(mark, 6); return run(`PA.abilities.indexOf('mark_${mark}')`); };
  let s = power('heart'); const friend = run(`(() => { const b = S.addPlayer(), q = S.players[b]; q.x = PA.x + 1; q.y = PA.y; q.hp = 10; globalThis.B = b; return b; })()`);
  run('PA.hp = 10'); fire(s); assert(run('PA.hp') > 10 && run('S.players[B].hp') > 10, 'heart heals both');
  s = power('drop'); run('PA.hp = 10'); fire(s); assert(run('PA.hp') > 10, 'drop heals');
  s = power('apple'); run(`(() => { const inv = S.inventories[A]; inv.remove('knife', 1); })()`); const before = run(`S.inventories[A].count('apple')`); fire(s); assert.strictEqual(run(`S.inventories[A].count('apple')`) - before > 0, true, 'apples');
  s = power('star'); const f1 = foe('slime', 1.5); fire(s); assert(hpOf(f1) < 100, 'star hurts');
  s = power('note'); const f2 = foe('slime', 2); fire(s); assert(run(`S.animals.animals['${f2}'].slowT`) > 0, 'note slows');
  s = power('flower'); const f3 = foe('slime', 2); fire(s); assert(run(`S.animals.animals['${f3}'].slowT`) > 0, 'flower slows');
  s = power('cloud'); const rabbit = foe('rabbit', 2); fire(s); assert.notStrictEqual(run(`S.animals.animals['${rabbit}'].state`), 'idle', 'cloud scares');
  s = power('moon'); fire(s); assert(run('PA.dashT') > 0, 'moon speeds you');
});

test('input: four power slots', () => {
  assert.strictEqual(run(`sanitizeInput({ power: 4 }).power`), 4); assert.strictEqual(run(`sanitizeInput({ power: 9 }).power`), 4);
});

console.log(`${passed} passed`);
