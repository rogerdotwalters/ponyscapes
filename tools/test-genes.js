'use strict';
/* TOOLS - the pony gene system in Node:  node tools/test-genes.js */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const J = src => JSON.parse(run(`JSON.stringify(${src})`));

test('the genes cover eyes, mane, body, hooves, head and tail, shapes and colours', () => {
  const ids = J('PonyGenes.LOCI.map(l => l.id)');
  for (const id of ['eyeShape', 'eyeColor', 'maneShape', 'maneColor', 'bodyShape', 'bodyColor', 'hoofShape', 'hoofColor', 'headShape', 'tailShape', 'tailColor', 'tailLink']) assert(ids.includes(id), id);
});
test('a pony from a gene number is the same every time, and its coat and mane slots are what its genes show', () => {
  assert.deepStrictEqual(J('PonyLook.fromGene(99, 0)'), J('PonyLook.fromGene(99, 0)'));
  for (let g = 1; g < 200; g++) { const l = J(`PonyLook.fromGene(${g}, ${g % 3})`); assert.strictEqual(l.length, run('PonyGenes.LEN')); const e = J(`PonyGenes.express(PonyLook.fromGene(${g}, ${g % 3}))`); assert.strictEqual(e.bodyColor, l[0]); assert.strictEqual(e.maneColor, l[1]); }
});
test('the first seven numbers of a pony are what they were before genes (saved herds look the same)', () => {
  assert.deepStrictEqual(J('PonyLook.fromGene(7, 0).slice(0, 7)'), [0, 0, 7, 16, 0, 0, 26576]);
});
test('an older pony (no genome) reads as classic, with its tail the colour of its mane', () => {
  const g = J('PonyLook.describe([3, 2, 1, 0, 0, 0, 200]).gene');
  assert.strictEqual(g.tailLinked, true); assert.deepStrictEqual(g.tailMane, J('PonyPalette.manes[2]'));
  for (const k of ['eyeShape', 'maneShape', 'tailShape', 'bodyShape', 'hoofShape', 'headShape']) assert.strictEqual(g[k], 0, k);
});
test('the matching-tail gene forces the tail to the mane colour; without it the tail is its own', () => {
  const at = id => run(`PonyGenes.at('${id}')`);
  const mk = (link, tail) => `(() => { const l = PonyLook.fromGene(5, 0); l[1] = 2; l[${7 + at('maneColor')}] = 2 * 65; l[${7 + at('tailColor')}] = ${tail} * 65; l[${7 + at('tailLink')}] = ${link} * 65; return PonyLook.describe(l).gene; })()`;
  assert.deepStrictEqual(J(mk(0, 5) + '.tailMane'), J('PonyPalette.manes[2]'));
  assert.deepStrictEqual(J(mk(1, 5) + '.tailMane'), J('PonyPalette.manes[5]'));
  assert.strictEqual(J(mk(0, 5) + '.tailLinked'), true); assert.strictEqual(J(mk(1, 5) + '.tailLinked'), false);
});
test('a recessive allele is carried: two carriers can have a foal that shows it, two without it cannot', () => {
  const r = J(`(() => {
    const at = PonyGenes.at('tailShape'), mk = pair => { const l = PonyLook.fromGene(3, 0); l[${7}+at] = pair; return l; };
    let rng = mulberry32(1), shown = 0, none = 0;
    for (let i = 0; i < 400; i++) { const f = PonyGenes.inherit(rng, mk(0 * 64 + 2), mk(0 * 64 + 2), 0); if (Math.min(Math.floor(f[at] / 64), f[at] % 64) === 2) shown++; }
    for (let i = 0; i < 400; i++) { const f = PonyGenes.inherit(rng, mk(0), mk(0), 0); if (Math.min(Math.floor(f[at] / 64), f[at] % 64) === 2) none++; }
    return { shown, none };
  })()`);
  assert(r.shown > 40 && r.shown < 160, 'about a quarter of foals of two carriers show it: ' + r.shown); assert(r.none < 60, 'only the odd mutation: ' + r.none);
});
test('foals of two ponies keep a valid genome that survives a save', () => {
  const r = J(`(() => { const S = new GameServer(5), A = PonyLook.fromGene(1, 0), B = PonyLook.fromGene(2, 0), f = S._foalLook({ look: A }, { look: B });
    return { len: f.length, ok: f.every(Number.isInteger), d: !!PonyLook.describe(f).gene.key }; })()`);
  assert.strictEqual(r.len, run('PonyGenes.LEN')); assert(r.ok && r.d);
});
console.log(passed + ' passed');
