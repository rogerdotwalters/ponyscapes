'use strict';
/* TOOLS - pedigrees, inbreeding and the diversity rating in Node:  node tools/test-pedigree.js */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const J = src => JSON.parse(run(`JSON.stringify(${src})`));
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);
// tiny pedigree builder, in the page: n(uid, sire, dam)
const PRE = `const n = (u, s, d, x) => [u, u, x || 'm', s || null, d || null];`;

test('kinship is the textbook value: siblings 25%, half siblings 12.5%, first cousins 6.25%, unrelated 0', () => {
  const r = J(`(() => { ${PRE}
    const f1 = n('f001'), f2 = n('f002'), f3 = n('f003'), f4 = n('f004'), f5 = n('f005');
    const a = n('a001', f1, f2), b = n('b001', f1, f2), h = n('h001', f1, f3);
    const g = Pedigree.graph(a, b, h), c1 = n('c001', n('p001', f1, f2), f4), c2 = n('c002', n('q001', f1, f2), f5), g2 = Pedigree.graph(c1, c2);
    return { sibs: Pedigree.kinship(g, 'a001', 'b001'), half: Pedigree.kinship(g, 'a001', 'h001'), cousins: Pedigree.kinship(g2, 'c001', 'c002'), none: Pedigree.kinship(g, 'a001', 'f004'), self: Pedigree.kinship(g, 'a001', 'a001') }; })()`);
  near(r.sibs, 0.25, 'sibs'); near(r.half, 0.125, 'half'); near(r.cousins, 0.0625, 'first cousins'); near(r.none, 0, 'unrelated'); near(r.self, 0.5, 'self (a non-inbred pony)');
});
test('inbreeding coefficient of a foal is its parents\' kinship: sibling mating 25%, parent x offspring 25%, half siblings 12.5%, cousins once removed 3.1%', () => {
  const r = J(`(() => { ${PRE}
    const f1 = n('f001'), f2 = n('f002'), f3 = n('f003'), f4 = n('f004'), f5 = n('f005'), sire = n('s001', f1, f2), dam = n('d001', f3, f4);
    const a = n('a001', sire, dam), b = n('b001', sire, dam), h = n('h001', sire, n('d002', f5, n('f008')));
    const cousinA = n('c001', n('p001', f1, f2), n('f006')), cousinB = n('c002', n('q001', f1, f3), n('f007'));          // (they share only f1)
    return { sibs: Pedigree.coefficient(n('x001', a, b, 'f')), half: Pedigree.coefficient(n('x002', a, h, 'f')), parent: Pedigree.coefficient(n('x003', sire, a, 'f')), none: Pedigree.coefficient(n('x004', n('y001'), n('y002'))), cousins: Pedigree.coefficient(n('x005', cousinA, cousinB)) }; })()`);
  near(r.sibs, 0.25, 'full siblings'); near(r.half, 0.125, 'half siblings'); near(r.parent, 0.25, 'parent and offspring'); near(r.none, 0, 'unrelated parents');
  near(r.cousins, 0.03125, 'cousins once removed (they share one grandparent)');
});
test('the rating folds inbreeding and heterozygosity: outcrosses are A or B, siblings and close kin fall to D or F, and every mating has a named band', () => {
  const r = J(`(() => ({ out: Pedigree.rating(0, 0.7), mild: Pedigree.rating(0.03, 0.65), cousin: Pedigree.rating(0.0625, 0.6), half: Pedigree.rating(0.125, 0.55), sib: Pedigree.rating(0.25, 0.5), withRec: Pedigree.rating(0, 0.7, 3), bands: [0, 0.01, 0.04, 0.0625, 0.125, 0.25, 0.5].map(f => Pedigree.bandOf(f).name) }))()`);
  assert.strictEqual(r.out.grade, 'A'); assert.strictEqual(r.out.band.name, 'Outcross'); assert(['A', 'B'].includes(r.mild.grade), 'mild: ' + r.mild.grade);
  assert(r.cousin.score < r.mild.score && r.half.score < r.cousin.score && r.sib.score < r.half.score, 'closer kin always scores lower');
  assert(['D', 'F'].includes(r.half.grade) || r.half.grade === 'C'); assert.strictEqual(r.sib.grade, 'F'); assert(r.withRec.score < r.out.score, 'hidden recessives both carry cost points');
  assert.deepStrictEqual(r.bands, ['Outcross', 'Distant relations', 'Mild linebreeding', 'Linebreeding', 'Close inbreeding', 'Extreme inbreeding', 'Extreme inbreeding']);
});
test('a mating\'s report: unrelated founders are a perfect outcross, full siblings are 25% and flagged too close', () => {
  const r = J(`(() => {
    const S = new GameServer(3), mk = (sex, seed) => { const look = PonyLook.fromGene(seed, 0); look[6] = sex === 'f' ? 128 : 0; return { look }; };
    const A = mk('m', 11), B = mk('f', 22), out = Pedigree.pairReport(A, B, () => S.rng());
    const sire = mk('m', 33), dam = mk('f', 44); sire.ped = null;
    const sis = { look: mk('f', 55).look, ped: Pedigree.foalNode(() => S.rng(), sire, dam, 'Sis', 'f') }, bro = { look: mk('m', 66).look, ped: Pedigree.foalNode(() => S.rng(), sire, dam, 'Bro', 'm') };
    const close = Pedigree.pairReport(bro, sis, () => S.rng());
    return { out: { F: out.F, grade: out.rating.grade, band: out.rating.band.name, tooClose: out.tooClose, common: out.common.length }, close: { F: close.F, R: close.R, grade: close.rating.grade, tooClose: close.tooClose, common: close.common.map(c => c.name).sort() } };
  })()`);
  near(r.out.F, 0, 'unrelated'); assert.strictEqual(r.out.band, 'Outcross'); assert(!r.out.tooClose); assert.strictEqual(r.out.common, 0); assert(['A', 'B'].includes(r.out.grade), r.out.grade);
  near(r.close.F, 0.25, 'siblings'); near(r.close.R, 0.5, 'siblings are related by one half'); assert(r.close.tooClose); assert(['D', 'F'].includes(r.close.grade), r.close.grade); assert.strictEqual(r.close.common.length, 2, 'both parents are common ancestors');
});
test('a foal born in the stable remembers both parents, five generations deep, and the tree survives a save', () => {
  const r = J(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A];
    for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
    S.interiors.enter(A, P, BuildingSites.list.find(x => x.def.id === 'pony_stable').index);
    const map = S.mapOf(P), f = map.plan.layout.furniture.find(g => g.id === 'stall' && g.x === 6 && g.y === 1);
    const mk = sex => { const id = S.animals.spawn('pony_plain', f.x + 1, f.y + 5.5, 0, { level: 1 }), a = S.animals.animals[id]; a.look[6] = sex === 'f' ? 128 : 0; a.owner = A; a.leashed = true; a.grid = gridOf(P);
      P.x = f.x + 1.5; P.y = f.y + 5.5; a.x = P.x + 0.5; a.y = P.y; S._stallPick(A, { act: 'in', animal: id, fx: f.x, fy: f.y }); return a; };
    const sire = mk('m'), dam = mk('f');
    const menu = S._breedInfo(A, P, f, [sire, dam]);
    S._stallPick(A, { act: 'breed', fx: f.x, fy: f.y });
    for (let t = 0; t < 100; t += 1 / 30) S._breedTick(1 / 30);
    const foal = Object.values(S.animals.animals).find(x => x.owner === A && x.foal > 0);
    const out = { pair: menu.pair && { f: menu.pair.f, grade: menu.pair.grade, band: menu.pair.band }, tree: foal.ped, sireTree: sire.ped, damTree: dam.ped, foalName: Stable.nameOf(foal) };
    // a second generation: the foal grows up and is bred to a stranger, then the tree is two deep
    const stranger = { look: PonyLook.fromGene(99, 0), ped: null }; stranger.look[6] = 0;
    const next = Pedigree.foalNode(() => S.rng(), foal, stranger, 'Grandfoal', 'f');
    out.next = next; out.nextF = Pedigree.coefficient(next);
    const saved = JSON.parse(JSON.stringify(SaveData._pet({ type: foal.type, level: 1, look: foal.look, x: 1, y: 1, ped: foal.ped })));
    out.saved = saved.ped; out.badSaved = SaveData._pet({ type: foal.type, level: 1, look: foal.look, x: 1, y: 1, ped: ['x', 1, 2] }).ped === undefined;
    const sum = Pedigree.summaryOf(foal); out.sum = { f: sum.f, g: sum.g, sire: sum.sire, dam: sum.dam, gens: sum.gens };
    return out; })()`);
  assert(r.pair && r.pair.f === 0 && r.pair.band === 'Outcross', 'two founders are an outcross: ' + JSON.stringify(r.pair));
  assert.strictEqual(r.tree[1], r.foalName); assert.strictEqual(r.tree[3][0], r.sireTree[0], 'the sire is in the tree'); assert.strictEqual(r.tree[4][0], r.damTree[0], 'the dam is in the tree');
  assert.strictEqual(r.tree[3][2], 'm'); assert.strictEqual(r.tree[4][2], 'f');
  assert.strictEqual(r.next[4][3][0], r.tree[3][0], 'the grandfoal\'s grandsire is the first sire'); near(r.nextF, 0, 'the stranger is unrelated');
  assert.deepStrictEqual(r.saved, r.tree, 'the tree comes back from a save as it went in'); assert(r.badSaved, 'a damaged tree is dropped');
  assert.strictEqual(r.sum.f, 0); assert.strictEqual(r.sum.gens, 1); assert(r.sum.sire && r.sum.dam);
});
test('trees are cut off after five generations and check out when loaded', () => {
  const r = J(`(() => {
    let node = [Pedigree.newUid(), 'Root', 'm', null, null]; const ids = [node[0]];
    for (let i = 0; i < 9; i++) { node = [Pedigree.newUid(), 'Gen' + i, i % 2 ? 'f' : 'm', node, null]; ids.push(node[0]); }
    const f = Pedigree.foalNode(() => 0.5, { look: PonyLook.fromGene(1, 0), ped: node }, { look: PonyLook.fromGene(2, 0), ped: null }, 'Foal', 'm');
    const depth = n => (n ? 1 + Math.max(depth(n[3]), depth(n[4])) : 0);
    const big = [Pedigree.newUid(), 'Big', 'm', null, null]; let cur = big; for (let i = 0; i < 12; i++) { const p = [Pedigree.newUid(), 'P' + i, 'm', null, null]; cur[3] = p; cur = p; }
    return { depth: depth(f), clean: Pedigree.clean(f) !== undefined && Pedigree.clean(f) !== null, tooDeep: Pedigree.clean(big) === undefined, junk: [Pedigree.clean('x'), Pedigree.clean([1]), Pedigree.clean(['A!', 'n', 'm', null, null])].map(v => v === undefined), good: Pedigree.fromSave(f) !== null };
  })()`);
  assert.strictEqual(r.depth, 6, 'the foal and five generations above it'); assert(r.clean && r.good); assert(r.tooDeep, 'a tree deeper than allowed is refused');
  assert.deepStrictEqual(r.junk, [true, true, true]);
});
test('a herd of unrelated founders has the effective size of its head count; relatives shrink it, and the genes are counted', () => {
  const r = J(`(() => {
    const S = new GameServer(5), rng = () => S.rng(), mk = (seed, sex) => { const look = PonyLook.fromGene(seed, 0); look[6] = sex === 'f' ? 128 : 0; return { look }; };
    const five = [1, 2, 3, 4, 5].map(i => mk(i * 7, i % 2 ? 'm' : 'f')), a = Pedigree.herdReport(five, rng);
    const sire = mk(40, 'm'), dam = mk(41, 'f'), kin = [sire, dam, ...[0, 1, 2].map(i => { const f = mk(50 + i, 'f'); f.ped = Pedigree.foalNode(rng, sire, dam, 'F' + i, 'f'); return f; })], b = Pedigree.herdReport(kin, rng);
    return { a: { n: a.n, ne: a.ne, mk: a.meanKinship, founders: a.founders, fe: a.effectiveFounders, ho: a.ho, he: a.he, rich: a.richness, grade: a.grade }, b: { ne: b.ne, mk: b.meanKinship, founders: b.founders, fe: b.effectiveFounders, grade: b.grade, score: b.score }, one: Pedigree.herdReport([mk(1, 'm')], rng).ne, none: Pedigree.herdReport([], rng) };
  })()`);
  near(r.a.ne, 5, 'five unrelated ponies are worth five'); near(r.a.mk, 0.1, 'mean kinship 1/(2n)'); assert.strictEqual(r.a.founders, 5); near(r.a.fe, 5, 'five equal founders');
  assert(r.a.ho > 0 && r.a.ho <= 1 && r.a.he > 0 && r.a.rich >= 1.2, 'genes counted: ' + JSON.stringify(r.a));
  assert(r.b.ne < 5 && r.b.mk > r.a.mk, 'a family has more kinship and a smaller effective size'); assert.strictEqual(r.b.founders, 2); assert(r.b.fe <= 2.0001, 'two founders: ' + r.b.fe);
  near(r.one, 1, 'one pony is a herd of one'); assert.strictEqual(r.none, null);
});
test('the genes behind the rating: heterozygous loci, expected foal heterozygosity and hidden recessives both parents carry', () => {
  const r = J(`(() => {
    const L = PonyGenes.LOCI, at = id => PonyGenes.at(id), pairLook = (v, pairs) => { const l = PonyLook.fromGene(3, 0).slice(0, PonyGenes.BASE); for (let i = 0; i < L.length; i++) l.push((pairs[L[i].id] || [0, 0]).reduce((a, b) => a * 64 + b)); return PonyGenes.sync(l); };
    const homo = pairLook(0, {}), het = pairLook(0, { eyeShape: [0, 2], bodyShape: [0, 1] }), carrierA = pairLook(0, { tailShape: [0, 2] }), carrierB = pairLook(0, { tailShape: [1, 2] });
    const mg = Pedigree.matingGenes(carrierA, carrierB), mh = Pedigree.matingGenes(homo, homo);
    return { hHomo: Pedigree.heterozygosity(homo), hHet: Pedigree.heterozygosity(het), rows: Pedigree.genomeRows(het).filter(r => r.het).map(r => [r.id, r.shown.name, r.hidden.name]), shared: mg.shared, same: mh.het, shown: Pedigree.genomeRows(carrierA).find(r => r.id === 'tailShape') };
  })()`);
  near(r.hHomo, 0, 'no heterozygous loci'); assert(r.hHet > 0); assert.deepStrictEqual(r.rows.map(x => x[0]).sort(), ['bodyShape', 'eyeShape']);
  assert(r.shared.some(s => s.gene === 'Tail shape' && Math.abs(s.chance - 0.25) < 1e-9), 'both carry the same hidden tail shape: a quarter of foals show it: ' + JSON.stringify(r.shared));
  near(r.same, 0, 'two identical homozygous ponies give no heterozygosity'); assert.strictEqual(r.shown.hidden.name !== r.shown.shown.name, true);
});
test('the server answers the Pony Book: a pony\'s family tree with its offspring, and the herd\'s diversity', () => {
  const r = J(`(() => {
    const S = new GameServer(9), A = S.addPlayer();
    const mine = () => Object.values(S.animals.animals).filter(x => x.owner === A);
    const g = mine()[0]; const mate = S.animals.animals[S.animals.spawn('pony_plain', g.x + 1, g.y, 0, { level: 1 })]; mate.owner = A;
    g.look[6] = 0; mate.look[6] = 128;
    const foal = S.animals.animals[S.animals.spawn('pony_plain', g.x, g.y + 1, 0, { level: 1 })]; foal.owner = A; foal.look[6] = 128; foal.ped = Pedigree.foalNode(() => S.rng(), g, mate, Stable.nameOf(foal), 'f');
    S.pendingEvents.length = 0; S._lineage(A, g.id); S._herdGenetics(A);
    const ev = S.pendingEvents.filter(e => e.to === A), L = ev.find(e => e.type === 'lineage'), H = ev.find(e => e.type === 'herdGenetics'), other = (S._lineage('someoneElse', g.id), S.pendingEvents.filter(e => e.to === 'someoneElse').length);
    return { L: { founder: L.founder, kids: L.kids.map(k => [k.name, k.up]), foalName: Stable.nameOf(foal), grade: L.grade, f: L.f, tree: L.tree[0].length > 3 }, H: H.herd, other, pets: S.animals.petsOf(A, 0).filter(p => p.id === foal.id).map(p => p.gen) };
  })()`);
  assert(r.L.founder, 'a founder'); assert.deepStrictEqual(r.L.kids, [[r.L.foalName, 1]]); assert.strictEqual(r.L.f, 0); assert(r.H && r.H.n === 3 && r.H.founders === 2, JSON.stringify(r.H)); assert.strictEqual(r.other, 0, 'only the owner can look');
  assert.strictEqual(r.pets.length, 1); assert(r.pets[0].sire && r.pets[0].dam, 'the Pony Book gets the parents\' names every snapshot');
});

console.log(`\n${passed} passed`);
