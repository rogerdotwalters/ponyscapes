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
test('the ribbon is drawn in the trail\'s own colours, with one band per colour', () => {
  const sandbox = { performance: { now: () => 0 }, Math, Map, Array, Object };
  const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'client', 'render', 'rainbowTrail.js'), 'utf8') + '\n;this.RainbowTrail = RainbowTrail;';
  const c = vm.createContext(sandbox); vm.runInContext(code, c);
  const T = sandbox.RainbowTrail, styles = [], widths = new Set();
  const g = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { styles.push(this.strokeStyle); widths.add(this.lineWidth); }, set globalAlpha(v) {} };
  const cols = ['#112233', '#445566', '#778899'];
  for (let i = 0; i < 12; i++) T.note('p1', i * 6, 0, i * 40, true, { level: 1, colors: cols });
  T.draw(g, 480);
  assert(styles.length > 0 && styles.every(s => cols.includes(s)), 'only its colours: ' + [...new Set(styles)]); assert.deepStrictEqual([...new Set(styles)].sort(), cols.slice().sort());
  styles.length = 0; for (let i = 0; i < 12; i++) T.note('p2', i * 6, 40, i * 40, true, { level: 3, colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#880000', '#008800'] });
  T.draw(g, 480); assert(new Set(styles).size >= 8, 'a grand rainbow has eight bands'); assert(Math.max(...widths) <= 5.3 && Math.min(...widths) >= 3, 'bands get thinner as there are more: ' + [...widths]);
});
console.log(`\n${passed} passed`);
