'use strict';
/* TOOLS - mutations, hidden recessives, quality and names in Node:  node tools/test-mutations.js */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const J = src => JSON.parse(run(`JSON.stringify(${src})`));
// a pony whose mutation pair is [a, b] (allele indexes: 0 none, 1.. in data/ponies/mutations.js order)
const PRE = `const MI = PonyGenes.at('mutation'), idx = id => PonyGenes.LOCI[MI].alleles.findIndex(a => a.id === id);
  const pony = (a, b) => { const l = PonyLook.fromGene(21, 0); l[PonyGenes.BASE + MI] = a * 64 + b; return { look: l }; };
  const S = new GameServer(5), r = () => S.rng(), foal = (A, B) => ({ look: PonyGenes.sync([0, 0, 0, 0, 0, 0, 0].concat(PonyGenes.inherit(r, A.look, B.look, 0))) });
  const shows = k => PonyGenes.express(k.look).mutation;`;

test('mutations are a gene at the end of the table, and every one draws (a pearl pony is pearly, a midnight one dark, a silk mane flows)', () => {
  const r = J(`(() => { ${PRE}
    const last = PonyGenes.LOCI[PonyGenes.LOCI.length - 1].id, out = {};
    for (const m of PonyGenes.MUTATIONS) { const p = pony(idx(m.id), idx(m.id)), d = PonyLook.describe(p.look); out[m.id] = { shows: shows(p) === idx(m.id), coat: d.coat, glow: d.glow, accessory: d.accessory, key: d.gene.key, traits: d.gene.traits.some(t => t.part === 'Mutation') }; }
    const plain = PonyLook.describe(pony(0, 0).look);
    return { last, n: PonyGenes.MUTATIONS.length, out, plain: { coat: plain.coat, glow: plain.glow } }; })()`);
  assert.strictEqual(r.last, 'mutation'); assert(r.n >= 12);
  for (const id in r.out) { assert(r.out[id].shows && r.out[id].traits, id + ' shows'); }
  assert.strictEqual(r.out.pearl.coat, '#fdf8f2'); assert.strictEqual(r.out.midnight.coat, '#15151f'); assert(r.out.shimmer.glow, 'a shimmer pony glows'); assert.strictEqual(r.out.gilded.glow, '#ffd54f'); assert.notStrictEqual(r.out.gilded.coat, r.plain.coat);
  assert.strictEqual(r.out.starfreckle.accessory, 'stars'); assert.strictEqual(r.plain.glow, null);
  assert(new Set(Object.values(r.out).map(o => o.key)).size === r.n, 'each mutation draws differently (so sprites are cached apart)');
});
test('dominant mutations show with one copy; recessive ones only with two; a carrier looks like any ordinary pony', () => {
  const r = J(`(() => { ${PRE}
    const d = idx('gilded'), rc = idx('pearl'), plain = PonyLook.describe(pony(0, 0).look);
    const car = PonyLook.describe(pony(0, rc).look);
    return { dom: shows(pony(0, d)) === d, dom2: shows(pony(d, 0)) === d, recCarrier: shows(pony(0, rc)), recTwo: shows(pony(rc, rc)) === rc, carrierSame: car.coat === plain.coat && JSON.stringify(car.mane) === JSON.stringify(plain.mane) && car.glow === plain.glow && car.gene.traits.length === plain.gene.traits.length,
      mixed: shows(pony(rc, d)) === d, rows: Pedigree.genomeRows(pony(0, d).look).find(x => x.id === 'mutation'), rowsRec: Pedigree.genomeRows(pony(0, rc).look).find(x => x.id === 'mutation') }; })()`);
  assert(r.dom && r.dom2 && r.recTwo && r.mixed); assert.strictEqual(r.recCarrier, 0); assert(r.carrierSame, 'a hidden recessive changes nothing you can see');
  assert.strictEqual(r.rows.shown.name, 'Gilded'); assert.strictEqual(r.rowsRec.shown.name, 'None'); assert.strictEqual(r.rowsRec.hidden.name, 'Pearl', 'the genes view shows what it carries');
});
test('about 1 in 17 ordinary ponies carries a hidden recessive; hardly any show a dominant mutation; none show a recessive', () => {
  const r = J(`(() => { ${PRE}
    let carriers = 0, dom = 0, rec = 0, n = 6000;
    for (let g = 1; g <= n; g++) { const p = { look: PonyLook.fromGene(g * 13, 0) }, pair = PonyGenes.genomeOf(p.look)[MI], k = Math.max(...pair); if (k > 0 && !PonyGenes.LOCI[MI].alleles[k].dominant && pair[0] !== pair[1]) carriers++; if (shows(p) > 0) { if (PonyGenes.LOCI[MI].alleles[shows(p)].dominant) dom++; else rec++; } }
    return { carriers, dom, rec, n }; })()`);
  assert(r.carriers > r.n / 17 * 0.7 && r.carriers < r.n / 17 * 1.3, 'carriers: ' + r.carriers + ' of ' + r.n); assert(r.dom < r.n / 250 * 2 + 5, 'a dominant is very rare: ' + r.dom); assert.strictEqual(r.rec, 0, 'a wild pony never shows a recessive');
});
test('two carriers of the same recessive have a foal that shows it one time in four; a carrier bred to an ordinary pony never does (bar a new mutation)', () => {
  const r = J(`(() => { ${PRE}
    const rc = idx('pearl'); let both = 0, one = 0, n = 2000;
    for (let i = 0; i < n; i++) { if (shows(foal(pony(0, rc), pony(0, rc))) === rc) both++; if (shows(foal(pony(0, rc), pony(0, 0))) === rc) one++; }
    return { both, one, n }; })()`);
  assert(r.both > r.n * 0.25 * 0.8 && r.both < r.n * 0.25 * 1.2, 'a quarter: ' + r.both); assert(r.one < 12, 'a carrier and an ordinary pony: ' + r.one);
});
test('a brand-new viable mutation turns up in about 1 foal in 200, and it is inherited by the next generation', () => {
  const r = J(`(() => { ${PRE}
    let fresh = 0, n = 40000; for (let i = 0; i < n; i++) { const pair = PonyGenes.genomeOf(foal(pony(0, 0), pony(0, 0)).look)[MI]; if (pair[0] || pair[1]) fresh++; }
    const d = idx('gilded'); let kids = 0, m = 1500, hom = 0; for (let i = 0; i < m; i++) { const k = foal(pony(0, d), pony(0, 0)); if (shows(k) === d) kids++; const g = foal(k, pony(0, 0)); if (shows(g) === d) hom++; }
    return { fresh, n, kids, m, hom, odds: PonyGenes.MUTATION_ODDS }; })()`);
  assert.strictEqual(r.odds, 1 / 200); assert(r.fresh > r.n / 200 * 0.7 && r.fresh < r.n / 200 * 1.3, 'about 1 in 200: ' + r.fresh + ' of ' + r.n);
  assert(r.kids > r.m * 0.5 * 0.85 && r.kids < r.m * 0.5 * 1.15, 'a dominant mutation passes to about half the foals: ' + r.kids); assert(r.hom > r.m * 0.25 * 0.6, 'and on to the next generation: ' + r.hom);
});
test('a foal born with a mutation that shows is told about it, and saves keep the gene', () => {
  const r = J(`(() => { ${PRE}
    const A = pony(0, idx('gilded')), B = pony(0, idx('gilded'));
    const l = PonyGenes.sync([0, 0, 0, 0, 0, 0, 0].concat(PonyGenes.inherit(r, A.look, B.look, 0)));
    const saved = SaveData._pet({ type: 'pony_plain', level: 1, look: A.look, x: 1, y: 1 });
    return { len: l.length === PonyGenes.LEN, saved: saved.look.length === PonyGenes.LEN && saved.look[PonyGenes.BASE + MI] === A.look[PonyGenes.BASE + MI] }; })()`);
  assert(r.len && r.saved);
});
test('quality: a pony true to its morph scores high, mixed morph blood lowers it, chaos with many morphs is lowest, close inbreeding takes points off', () => {
  const r = J(`(() => { const S = new GameServer(4), rng = () => S.rng();
    const mk = (variety, sex, seed) => { const look = PonyLook.fromGene(seed || 5, Hybrids.variantIndex(variety)); look[6] = sex === 'f' ? 128 : 0; return { look }; };
    const foal = (A, B, variety, sex) => { const f = mk(variety, sex, 99); f.ped = Pedigree.foalNode(rng, A, B, 'F', sex, variety); return f; };
    const ember = mk('ember', 'm'), star = mk('star', 'f'), plasma1 = foal(ember, star, 'plasma', 'm'), plasma2 = foal(mk('ember', 'm', 8), mk('star', 'f', 9), 'plasma', 'f');
    const pure = foal(plasma1, plasma2, 'plasma', 'm');                                                       // plasma from plasma lines (both with ember and star ancestry)
    const mixed = foal(mk('frost', 'm', 3), mk('rainbow', 'f', 4), 'plasma', 'f');                           // a plasma pony whose parents are other morphs
    const soup = foal(plasma1, foal(mk('water', 'm', 6), mk('sun', 'f', 7), 'sunshower', 'f'), 'chaos', 'm');
    const chaosPure = foal(foal(mk('ember', 'm', 11), mk('frost', 'f', 12), 'chaos', 'm'), foal(mk('sun', 'm', 13), mk('moon', 'f', 14), 'chaos', 'f'), 'chaos', 'f');
    const founder = mk('plasma', 'm'), sib = { look: mk('plasma', 'f').look, ped: Pedigree.foalNode(rng, ember, star, 'Sis', 'f', 'plasma') }, bro = { look: mk('plasma', 'm').look, ped: Pedigree.foalNode(rng, ember, star, 'Bro', 'm', 'plasma') };
    const inbred = foal(sib, bro, 'plasma', 'm');
    const q = a => PonyQuality.of(a);
    return { founder: q(founder), pure: q(pure), mixed: q(mixed), soup: q(soup), chaosPure: q(chaosPure), inbred: q(inbred), ordinary: q(mk('meadow', 'f')) }; })()`);
  assert.strictEqual(r.founder.alignment, 1, 'foundation stock is fully aligned'); assert(r.pure.alignment > 0.99, 'plasma from plasma lines: ' + r.pure.alignment); assert(r.pure.score > r.mixed.score + 15, `pure ${r.pure.score} vs mixed ${r.mixed.score}`);
  assert(r.mixed.alignment < 0.1, 'a plasma with frost and rainbow parents is not true to its morph: ' + r.mixed.alignment); assert(r.soup.score < r.pure.score && r.soup.mix.length >= 3, 'chaos with many morphs in its blood scores lower');
  assert(r.soup.traits.some(t => /blood/.test(t)) && r.soup.traits.some(t => /unstable/.test(t)), r.soup.traits.join('|')); assert(r.chaosPure.alignment <= 0.51, 'chaos is only aligned with chaos, not with the morphs it came from: ' + r.chaosPure.alignment);
  assert(r.inbred.score < r.pure.score - 15, `a plasma bred brother to sister: ${r.inbred.score}`); assert(r.inbred.traits.some(t => /inbreeding/.test(t)));
  assert(r.pure.powerScale > 1 && r.mixed.powerScale < 1 && r.pure.powerScale <= 1.3 && r.mixed.powerScale >= 0.7, 'a hybrid power follows quality'); assert.strictEqual(r.ordinary.powerScale, 1);
  assert(['A', 'B', 'C', 'D', 'F'].includes(r.pure.grade));
});
test('hellfire is renamed Blazeheart (gentler for children), and the friendly morphs sit beside the fiery ones', () => {
  const r = J(`(() => { const h = HybridTable.get('hellfire'), v = PonyVariantTable.get('hellfire'), all = HybridTable.all(), soft = ['friendship', 'kindness', 'laughter', 'generosity', 'loyalty', 'honesty', 'sparkle', 'cuddle', 'twinkle', 'gumdrop', 'petalpuff', 'sunshower', 'harmony', 'unity', 'celebration', 'everbloom'];
    const text = [h.name, h.power.name, h.power.description, ...v.names].join(' ');
    return { name: h.name, kind: AnimalDefs[h.kind].name, text, soft: soft.map(id => { const x = HybridTable.get(id); return x ? x.power.effects.filter(e => ['heal', 'light', 'gift', 'slow', 'scare'].includes(e.kind) || e.value <= 10).length === x.power.effects.length || x.power.effects.some(e => e.kind === 'heal') : false; }), n: all.length }; })()`);
  assert.strictEqual(r.name, 'Blazeheart'); assert.strictEqual(r.kind, 'Blazeheart Pony'); assert(!/hell|inferno|brimstone|doom/i.test(r.text), r.text); assert(r.soft.every(Boolean), 'sixteen friendly morphs, all healing or cheering: ' + r.soft); assert(r.n >= 80);
});
test('there are many more storybook names, shared by every variety, and the names of saved ponies do not change', () => {
  const r = J(`(() => ({ pool: PonyNamePool.length, unique: new Set(PonyNamePool).size, own: PonyPalette.names.length, old: PonyNames.at(null, 16), first: PonyNames.at(null, 0), pooled: PonyNames.at(null, PonyPalette.names.length), frost: PonyNames.at(PonyVariants[2], 0), frostPool: PonyNames.at(PonyVariants[2], PonyVariants[2].names.length),
    seen: new Set(Array.from({ length: 400 }, (_, g) => PonyLook.describe(PonyLook.fromGene(g * 7, g % 3)).name)).size }))()`);
  assert(r.pool >= 80 && r.pool === r.unique); assert.strictEqual(r.old, 'Nimbus'); assert.strictEqual(r.first, 'Sprout'); assert.strictEqual(r.pooled, 'Sweetie'); assert(r.seen > 60, 'ponies use the long list: ' + r.seen);
});
console.log(`\n${passed} passed`);
