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
  assert.deepStrictEqual(J('PonyLook.fromGene(7, 0).slice(2, 7)'), [7, 16, 0, 0, 26576]);
});
test('an older pony (no genome) reads as classic, with its tail the colour of its mane', () => {
  const g = J('PonyLook.describe([3, 2, 1, 0, 0, 0, 200]).gene');
  assert.strictEqual(g.tailLinked, true); assert.deepStrictEqual(g.tailMane, J('PonyPalette.manes[2]'));
  for (const k of ['eyeShape', 'maneShape', 'tailShape', 'bodyShape', 'hoofShape', 'headShape']) assert.strictEqual(g[k], 0, k);
});
test('the matching-tail gene forces the tail to the mane colour; without it the tail is its own', () => {
  const at = id => run(`PonyGenes.at('${id}')`);
  const mk = (link, tail) => `(() => { const l = PonyLook.fromGene(5, 0); l[1] = 2; l[${7 + at('maneColor')}] = 2 * 65; l[${7 + at('tailColor')}] = ${tail} * 65; l[${7 + at('tailLink')}] = ${link} * 65; l[${7 + at('manePattern')}] = 0; l[${7 + at('tailPattern')}] = 0; return PonyLook.describe(l).gene; })()`;
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
test('hair patterns: striped (classic), solid and multicolor; a matched tail takes the mane\'s pattern', () => {
  const at = id => run(`PonyGenes.at('${id}')`);
  const mk = (mp, tp, link) => `(() => { const l = PonyLook.fromGene(5, 0); l[${7 + at('manePattern')}] = ${mp} * 65; l[${7 + at('tailPattern')}] = ${tp} * 65; l[${7 + at('tailLink')}] = ${link} * 65; return PonyLook.describe(l).gene; })()`;
  assert.strictEqual(J(mk(1, 0, 0) + '.maneColors.length'), 1, 'solid is one colour');
  assert(J(mk(2, 0, 0) + '.maneColors.length') >= 4, 'multicolor has four or more');
  assert.strictEqual(J(mk(0, 0, 0) + '.maneColors.length'), J('PonyPalette.manes[PonyLook.fromGene(5, 0)[1]].length'), 'striped is the variety list as it is');
  assert.strictEqual(J(mk(1, 2, 0) + '.tailPattern'), 1, 'matched: the tail follows the mane'); assert.strictEqual(J(mk(1, 2, 1) + '.tailPattern'), 2, 'free: its own pattern');
  const hex = J(mk(2, 0, 0) + '.maneColors'); assert(hex.every(c => /^#[0-9a-f]{6}$/.test(c)), hex.join());
});
test('there are more snout shapes and more colours, and older looks (before the pattern genes) still read', () => {
  assert(run("PonyGeneTable.get('headShape').alleles.length") >= 7);
  assert(run('PonyPalette.coats.length') > 12 && run('PonyPalette.manes.length') > 10 && run("PonyGeneTable.get('eyeColor').alleles.length") >= 12 && run("PonyGeneTable.get('hoofColor').alleles.length") >= 10);
  const old = J('PonyLook.fromGene(9, 0).slice(0, 7 + PonyGenes.at(\'tailLink\') + 1)');                  // a genome saved before the last two genes existed
  const g = J(`PonyLook.describe(${JSON.stringify(old)}).gene`); assert.strictEqual(g.manePattern, 0); assert.strictEqual(g.tailPattern, 0);
});
test('wild meadow ponies show the whole range of coats', () => {
  const seen = new Set(); for (let g = 0; g < 400; g++) seen.add(J(`PonyLook.fromGene(${g}, 0)[0]`));
  assert(seen.size >= 20, 'coats seen: ' + seen.size);
  const pats = new Set(); for (let g = 0; g < 400; g++) pats.add(J(`PonyLook.describe(PonyLook.fromGene(${g}, 0)).gene.manePattern`)); assert.strictEqual(pats.size, 3);
});
test('skills are genes: an inherited talent shows in the tree at level 9, an older pony has none, and carriers pass it on', () => {
  const at = run("PonyGenes.at('talent')"), none = run("PonyGeneTable.get('talent').alleles.length - 1"), star = run("PonyGeneTable.get('talent').alleles.findIndex(a => a.id === 'mark_star')");
  assert.strictEqual(run('PonyGenes.talentOf([3, 2, 1, 0, 0, 0, 200])'), null, 'older ponies have no talent');
  const mk = pair => `(() => { const l = PonyLook.fromGene(7, 1); l[${7 + at}] = ${pair}; return l; })()`;       // a moss pony: no tree of its own, so the talent is its only skill
  const tree = (pair, lvl) => J(`PonySkills.tree(${mk(pair)}, 'pony_plain', ${lvl}).map(s => [s.id, s.unlocked, s.ability && s.ability.id])`);
  assert.deepStrictEqual(tree(star * 64 + none, 8), [['talent', false, 'mark_star']]);
  assert.deepStrictEqual(tree(star * 64 + none, 9), [['talent', true, 'mark_star']], 'a carried talent shows: the power alleles dominate "no talent"');
  assert.deepStrictEqual(tree(none * 65, 30), [], 'no talent, no skill');
  assert.deepStrictEqual(J(`PonySkills.unlocked(${mk(star * 64 + none)}, 'pony_plain', 12)`), ['mark_star']);
  const r = J(`(() => { const rng = mulberry32(3); let got = 0; for (let i = 0; i < 400; i++) { const f = PonyGenes.inherit(rng, ${mk(star * 64 + none)}, ${mk(none * 65)}, 1); const a = Math.floor(f[${at}] / 64), b = f[${at}] % 64; if (Math.min(a, b) === ${star}) got++; } return got; })()`);
  assert(r > 120 && r < 280, 'about half the foals of a talented parent inherit it: ' + r);
  assert(J("PonyLook.describe(PonyLook.fromGene(1, 0)).gene.traits.length") >= 6);
});
test('black and silver are recessive: carriers do not show them, two carriers sometimes have black or silver foals', () => {
  const R = run('PonyPalette.recessive.count'), nC = run('PonyPalette.coats.length'), nM = run('PonyPalette.manes.length');
  assert.strictEqual(R, 2); assert.strictEqual(run('PonyPalette.base.coats') + 0 < nC - R, true);
  const at = run("PonyGenes.at('bodyColor')"), black = nC - 2, silver = nC - 1;
  const mk = pair => `(() => { const l = PonyLook.fromGene(3, 0); l[${7 + at}] = ${pair}; return PonyGenes.sync(l); })()`;
  const coat = pair => J(`PonyGenes.express(${mk(pair)}).bodyColor`);
  assert.strictEqual(coat(4 * 64 + black), 4, 'a pony with one black allele shows the other colour');
  assert.strictEqual(coat(black * 64 + 4), 4);
  assert.strictEqual(coat(silver * 64 + 4), 4, 'silver is recessive too');
  assert.strictEqual(coat(black * 65), black, 'two black alleles: black'); assert.strictEqual(coat(silver * 65), silver);
  const r = J(`(() => { const rng = mulberry32(9); let b = 0, s = 0, n = 600; const A = ${mk(4 * 64 + black)}, B = ${mk(4 * 64 + silver)}, C = ${mk(4 * 64 + black)}, D = ${mk(4 * 64 + black)};
    for (let i = 0; i < n; i++) { const f = PonyGenes.inherit(rng, A, D, 0)[${at}]; if (Math.min(Math.floor(f / 64), f % 64) === ${black}) b++; }
    let none = 0; for (let i = 0; i < n; i++) { const f = PonyGenes.inherit(rng, ${mk(4 * 65)}, ${mk(5 * 65)}, 0)[${at}]; if (Math.min(Math.floor(f / 64), f % 64) >= ${black}) none++; }
    return { b, none }; })()`);
  assert(r.b > 90 && r.b < 220, 'two black carriers: about a quarter of the foals are black: ' + r.b); assert(r.none < 60, 'no carriers: only the odd mutation: ' + r.none);
  let wild = 0, carried = 0; for (let g = 0; g < 1500; g++) { const d = J(`PonyLook.describe(PonyLook.fromGene(${g}, 0)).gene.traits.map(t => t.text).join('|')`); if (/Black \(recessive\)|Silver \(recessive\)/.test(d)) wild++; if (/carries/.test(d)) carried++; }
  assert(wild > 0 && wild < 150, 'wild black and silver ponies are rare: ' + wild); assert(carried > wild, 'carriers are commoner than the ponies that show it');
  void nM;
});
console.log(passed + ' passed');
