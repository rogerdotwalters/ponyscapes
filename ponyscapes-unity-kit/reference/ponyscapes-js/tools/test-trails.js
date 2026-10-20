'use strict';
/* TOOLS - rainbow trails in Node:  node tools/test-trails.js   (the trail gene, its colours (the mane's), breeding it, and drawing it) */
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { run, ctx } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const J = src => JSON.parse(run(`JSON.stringify(${src})`));
const PRE = `const TI = PonyGenes.at('trail'), ri = PonyVariants.findIndex(v => v.id === 'rainbow'), S = new GameServer(3), r = () => S.rng();
  const pony = (a, b, variant = 0, seed = 21) => { const l = PonyLook.fromGene(seed, variant); l[PonyGenes.BASE + TI] = a * 64 + b; return { look: l }; };
  const lvl = look => PonyGenes.express(look).trail, foal = (A, B, v = 0) => [0, 0, 0, 0, v, 0, 0].concat(PonyGenes.inherit(r, A.look, B.look, v));`;

test('the trail is a gene at the end of the table; rainbow-themed varieties always have one, a few plain ponies have a short one, and one copy of a weak trail stays hidden', () => {
  const r = J(`(() => { ${PRE}
    const rainbowish = PonyVariants.map((v, i) => i).filter(i => PonyVariants[i].accessory === 'rainbow'), all = rainbowish.every(i => { for (let g = 1; g < 60; g++) if (lvl(PonyLook.fromGene(g * 3, i)) < 2) return false; return true; });
    let plain = 0, n = 3000; for (let g = 1; g <= n; g++) if (lvl(PonyLook.fromGene(g * 7, 0)) > 0) plain++;
    return { last: PonyGenes.LOCI[PonyGenes.LOCI.length - 1].id, rainbowish: rainbowish.map(i => PonyVariants[i].id), all, plain, n, hidden: lvl(pony(0, 1).look), shown: lvl(pony(1, 1).look), strong: lvl(pony(2, 3).look) }; })()`);
  assert.strictEqual(r.last, 'trail'); assert(r.rainbowish.includes('rainbow') && r.rainbowish.includes('prism') && r.rainbowish.length >= 5, r.rainbowish.join()); assert(r.all, 'every rainbow-themed pony has a rainbow');
  assert(r.plain > 0 && r.plain < r.n * 0.04, 'a few plain ponies: ' + r.plain); assert.strictEqual(r.hidden, 0, 'one copy of a short trail is hidden'); assert.strictEqual(r.shown, 1); assert.strictEqual(r.strong, 2);
});
test('the trail takes the colours of the pony\'s mane (3, 6 or 8 bands by size), and a deeper mane gives a deeper trail', () => {
  const r = J(`(() => { ${PRE}
    const maneOf = look => PonyLook.describe(look).gene.maneColors, mk = (a, b) => { const p = pony(a, b); p.look[PonyGenes.BASE + PonyGenes.at('manePattern')] = 0; return p; };
    const out = {};
    for (const [lv, a, b] of [[1, 1, 1], [2, 2, 2], [3, 3, 3]]) { const p = mk(a, b), t = PonyLook.describe(p.look).trail, m = maneOf(p.look); out[lv] = { n: t.colors.length, level: t.level, first: t.colors[0] === m[0], last: t.colors[t.colors.length - 1] === m[m.length - 1], mane: m.length }; }
    const p = mk(2, 2), deep = mk(2, 2); deep.look[PonyGenes.BASE + PonyGenes.at('maneShade')] = 3 * 64 + 3;
    const lum = hex => PonyGenes.toHsl(hex)[2], light = PonyLook.describe(p.look).trail.colors.map(lum), darker = PonyLook.describe(deep.look).trail.colors.map(lum);
    const solid = mk(2, 2); solid.look[PonyGenes.BASE + PonyGenes.at('manePattern')] = 1 * 64 + 1; const st = PonyLook.describe(solid.look).trail.colors;
    const none = PonyLook.describe(pony(0, 0).look).trail;
    return { out, deeper: darker.every((v, i) => v < light[i]), solid: st.length, solidRamp: PonyGenes.toHsl(st[0])[2] > PonyGenes.toHsl(st[st.length - 1])[2], none }; })()`);
  assert.deepStrictEqual([r.out[1].n, r.out[2].n, r.out[3].n], [3, 6, 8]); for (const k of [1, 2, 3]) assert(r.out[k].first && r.out[k].last, 'its first and last colours are its mane\'s: ' + JSON.stringify(r.out[k]));
  assert(r.deeper, 'a deeper mane, a deeper trail'); assert.strictEqual(r.solid, 6); assert(r.solidRamp, 'a one-colour mane runs from light to deep'); assert.strictEqual(r.none, null);
});
test('breeding: two rainbows make a rainbow or a grander one, a rainbow and a plain pony a short trail, two plain ponies none; rainbow-themed foals always trail', () => {
  const r = J(`(() => { ${PRE}
    const tally = (A, B, v = 0) => { const c = {}; for (let i = 0; i < 1200; i++) { const k = lvl(foal(A, B, v)); c[k] = (c[k] || 0) + 1; } return c; };
    const rb = pony(2, 2, ri), pl = pony(0, 0), grand = pony(3, 3), prism = PonyVariants.findIndex(v => v.id === 'prism');
    return { rbrb: tally(rb, rb, ri), rbpl: tally(rb, pl, 0), plpl: tally(pl, pl), grand: tally(grand, grand, ri), prismFoal: tally(pl, pl, prism), crossPlain: tally(rb, pl, ri) }; })()`);
  assert(r.rbrb['3'] > 1200 * 0.2 && r.rbrb['3'] < 1200 * 0.6 && r.rbrb['2'] > 1200 * 0.4 && !r.rbrb['1'], 'two rainbows: some intensify: ' + JSON.stringify(r.rbrb));
  assert(r.rbpl['1'] > 1100 && !r.rbpl['3'], 'a rainbow and a plain pony: a short trail: ' + JSON.stringify(r.rbpl)); assert(r.plpl['0'] > 1180, JSON.stringify(r.plpl));
  assert(r.grand['3'] > 1150, 'grand stays grand'); assert(!r.prismFoal['0'] && !r.prismFoal['1'], 'a prism foal always has a rainbow: ' + JSON.stringify(r.prismFoal)); assert(!r.crossPlain['0'] && !r.crossPlain['1']);
});
test('the stall forecasts the trail of a pair, and the chances add up', () => {
  const r = J(`(() => { ${PRE}
    const f = (A, B) => ColorBreeding.forecastTrail(A.look, B.look), a = f(pony(2, 2, ri), pony(0, 0)), b = f(pony(2, 2, ri), pony(2, 2, ri)), c = f(pony(0, 0), pony(0, 0));
    const v = S._crossView({ type: 'pony_plain', look: pony(2, 2, ri).look }, { type: 'pony_plain', look: pony(0, 0).look }).trail;
    const sum = x => x.chances.reduce((s, y) => s + y.chance, 0);
    return { a, b, c, sums: [sum(a), sum(b), sum(c)], view: v.chances, colors: v.colors.length }; })()`);
  assert(r.sums.every(s => Math.abs(s - 1) < 0.02), 'chances: ' + r.sums); assert.strictEqual(r.a.chances[0].name, 'Short trail'); assert(r.b.chances.some(x => x.level === 3 && Math.abs(x.chance - 0.3) < 0.01), JSON.stringify(r.b.chances)); assert.deepStrictEqual(r.c.chances.map(x => x.level), [0]);
  assert(r.view.every(x => Number.isInteger(x.chance)) && r.colors > 0);
});
test('the trail gene is saved with the pony and passes down with the genome', () => {
  const r = J(`(() => { ${PRE}
    const p = pony(2, 3, ri), saved = SaveData._pet({ type: 'pony_plain', level: 1, look: p.look, x: 1, y: 1 });
    return { len: saved.look.length === PonyGenes.LEN, same: saved.look[PonyGenes.BASE + TI] === p.look[PonyGenes.BASE + TI], level: lvl(saved.look), old: lvl(p.look.slice(0, PonyGenes.BASE + TI)) }; })()`);
  assert(r.len && r.same); assert.strictEqual(r.level, 2); assert.strictEqual(r.old, 0, 'an older pony (no trail gene) has none');
});
const loadTrail = () => {
  const sandbox = { performance: { now: () => 0 }, Math, Map, Array, Object };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'client', 'render', 'rainbowTrail.js'), 'utf8') + '\n;this.RainbowTrail = RainbowTrail;', vm.createContext(sandbox));
  return sandbox.RainbowTrail;
};
const fakeCtx = () => { const g = { styles: [], widths: new Set(), save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { g.styles.push(this.strokeStyle); g.widths.add(this.lineWidth); }, set globalAlpha(v) {} }; return g; };
test('the ribbon is drawn in the trail\'s own colours, one band per colour, in pieces', () => {
  const T = loadTrail(), g = fakeCtx(), cols = ['#112233', '#445566', '#778899'];
  for (let i = 0; i < 12; i++) T.note('p1', i * 6, 0, i * 40, true, { level: 1, colors: cols }, 10 + i * 0.1);
  for (const it of T.items(480)) T.drawPiece(g, it, 480);
  assert(g.styles.length > 0 && g.styles.every(s => cols.includes(s)), 'only its colours: ' + [...new Set(g.styles)]); assert.deepStrictEqual([...new Set(g.styles)].sort(), cols.slice().sort());
  const h = fakeCtx(); for (let i = 0; i < 12; i++) T.note('p2', i * 6, 40, i * 40, true, { level: 3, colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#880000', '#008800'] }, 10);
  for (const it of T.items(480)) if (it.id === 'p2') T.drawPiece(h, it, 480);
  assert(new Set(h.styles).size >= 8, 'a grand rainbow has eight bands'); assert(Math.max(...h.widths) <= 5.3 && Math.min(...h.widths) >= 3, 'bands get thinner as there are more: ' + [...h.widths]);
});
test('the ribbon is depth-sorted into the picture: behind the pony that lays it, behind what is in front of it, in front of what is behind it', () => {
  const T = loadTrail(), cols = ['#ff0000', '#00ff00', '#0000ff'];
  // a pony running down the picture (its depth grows from 10 to 14): the ribbon behind it lies at smaller depths
  for (let i = 0; i < 60; i++) T.note('down', i * 4, i * 2, i * 10, true, { level: 2, colors: cols }, 10 + i * 4 / 60);
  const down = T.items(600).filter(x => x.id === 'down'), pony = 14;
  assert(down.length >= 4, 'the ribbon is several pieces: ' + down.length); assert(down.every(x => x.depth < pony), 'every piece is behind its pony');
  const depths = down.map(x => x.depth); assert(Math.max(...depths) - Math.min(...depths) > 1, 'pieces keep their own depths (a tree between them and the pony can hide the right ones)');
  const tree = 12.5; assert(down.some(x => x.depth < tree) && down.some(x => x.depth > tree), 'the pieces either side of a tree sort either side of it');
  // a pony running up the picture (depth shrinking): the ribbon lies in front, at greater depths, except what is close to the pony itself, which stays behind it
  for (let i = 0; i < 60; i++) T.note('up', i * 4, 200 - i * 2, i * 10, true, { level: 2, colors: cols }, 30 - i * 4 / 60);
  const up = T.items(600).filter(x => x.id === 'up'), ponyUp = 30 - 59 * 4 / 60;
  assert(up.some(x => x.depth > ponyUp + 1), 'far pieces of the ribbon of a pony running away are in front of it'); assert(up.filter(x => Math.abs(x.depth - ponyUp) < 1.4).every(x => x.depth < ponyUp), 'but never over the pony itself');
  const seen = T.items(600); assert(seen.every(x => x.kind === 'trail' && Number.isFinite(x.gx) && Number.isFinite(x.gy)), 'each piece has a place and a kind the renderer sorts');
});
test('a still pony lays nothing and what it laid fades away; the pieces carry a snapshot of the points', () => {
  const T = loadTrail(); for (let i = 0; i < 20; i++) T.note('s', i * 5, 0, i * 20, true, { level: 1, colors: ['#111111', '#222222'] }, 5);
  const before = T.items(400); assert(before.length > 0);
  T.note('s', 100, 0, 420, false, { level: 1, colors: ['#111111', '#222222'] }, 5); assert.strictEqual(T.items(420).reduce((n, x) => n + x.pts.length, 0) >= before.reduce((n, x) => n + x.pts.length, 0) - 2, true, 'standing still adds no points');
  assert.strictEqual(T.items(400 + 5000).length, 0, 'it has all faded');
  const snap = before[0].pts.length; T.note('s2', 0, 0, 0, true, { level: 2, colors: ['#111111', '#222222'] }, 5); assert.strictEqual(before[0].pts.length, snap, 'a piece is a snapshot');
});
console.log(`\n${passed} passed`);
