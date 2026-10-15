'use strict';
/* TOOLS - colour breeding in Node:  node tools/test-colors.js   (blues, purples and reds intensify; some mix, some dominate, neutrals do nothing) */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const J = src => JSON.parse(run(`JSON.stringify(${src})`));
// a pony of a plain colour pair (coat index, mane index) with natural depth, and a foal roller
const PRE = `const pony = (coat, mane, sd = 0) => { const l = PonyLook.fromGene(11, 0); l[6] = 0; const set = (id, a, b) => { l[PonyGenes.BASE + PonyGenes.at(id)] = a * 64 + b; };
  set('bodyColor', coat, coat); set('maneColor', mane, mane); set('tailColor', mane, mane); set('coatShade', sd, sd); set('maneShade', 0, 0); PonyGenes.sync(l); return { look: l }; };
  const S = new GameServer(3), r = () => S.rng(), foal = (A, B) => { const look = [0, 0, 0, 0, 0, 0, 0].concat(ColorBreeding.apply(r, A.look, B.look, 0, PonyGenes.inherit(r, A.look, B.look, 0))); PonyGenes.sync(look); return { look }; };`;

test('colours fall into families by hue, and whites, greys, blacks, silvers and browns are neutral', () => {
  const r = J(`['#a9d4f5', '#9fb7e8', '#cdb4f0', '#e8a0a8', '#f7c6d9', '#fbe7a1', '#b8ecd0', '#f9c79a', '#f4eef7', '#d9d9e8', '#1b1b22', '#c9ced8', '#8a6a52', '#c9a27e'].map(h => { const c = ColorBreeding.classify(h); return c.neutral ? 'neutral' : c.fam; })`);
  assert.deepStrictEqual(r, ['blue', 'blue', 'purple', 'red', 'pink', 'yellow', 'green', 'orange', 'neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'neutral']);
});
test('the rules: blue, purple and red intensify; some pairs dominate; the rest mix; yellow and green alone do nothing', () => {
  const r = J(`(() => { const f = (a, b) => ColorBreeding.ruleFor(a, b); return { bb: f('blue', 'blue').rule, pp: f('purple', 'purple').rule, rr: f('red', 'red').rule, yy: f('yellow', 'yellow').rule, gg: f('green', 'green').rule,
    pinkPurple: f('pink', 'purple'), orangeRed: f('red', 'orange'), blueRed: f('blue', 'red').rule, blueYellow: f('yellow', 'blue').rule, aquaBlue: f('aqua', 'blue') }; })()`);
  assert.deepStrictEqual([r.bb, r.pp, r.rr], ['intensify', 'intensify', 'intensify']); assert.strictEqual(r.yy, 'none'); assert.strictEqual(r.gg, 'none');
  assert.deepStrictEqual(r.pinkPurple, { rule: 'dominant', winner: 'purple' }); assert.strictEqual(r.orangeRed.winner, 'red'); assert.strictEqual(r.blueRed, 'mix'); assert.strictEqual(r.blueYellow, 'mix'); assert.strictEqual(r.aquaBlue.winner, 'blue');
});
test('a light blue bred with a light blue gives a deeper blue, and it keeps deepening generation by generation up to intense', () => {
  const r = J(`(() => { ${PRE}
    let A = pony(3, 2), B = pony(3, 2); const trail = [], lum = hex => PonyGenes.toHsl(hex)[2];
    for (let g = 0; g < 6; g++) { const k = foal(A, B), e = PonyGenes.express(k.look); trail.push({ depth: e.coatShade, l: lum(PonyLook.describe(k.look).coat), fam: ColorBreeding.classify(PonyLook.describe(k.look).coat).fam }); A = k; B = foal(A, pony(3, 2)); }
    let deeper = 0, same = 0, n = 400; for (let i = 0; i < n; i++) { const e = PonyGenes.express(foal(pony(3, 2), pony(3, 2)).look); if (e.coatShade > 0) deeper++; else same++; }
    return { trail, deeper, max: Math.max(...trail.map(t => t.depth)) }; })()`);
  assert(r.deeper > 400 * 0.7, 'most foals of two light blues are deeper: ' + r.deeper); assert(r.trail.every(t => t.fam === 'blue'), 'it stays a blue'); assert(r.trail[2].l < r.trail[0].l - 0.05 || r.trail[3].l < r.trail[0].l, 'and it really is darker');
  assert.strictEqual(r.max, 4, 'intense is the deepest');
});
test('purples and reds intensify too', () => {
  const r = J(`(() => { ${PRE}
    const t = (c) => { let deeper = 0; for (let i = 0; i < 300; i++) if (PonyGenes.express(foal(pony(c, 2), pony(c, 2)).look).coatShade > 0) deeper++; return deeper; };
    return { purple: t(2), red: t(7), yellow: t(5), neutral: t(9) }; })()`);
  assert(r.purple > 200 && r.red > 200, JSON.stringify(r)); assert(r.yellow < 60 && r.neutral < 60, 'yellow and grey do nothing: ' + JSON.stringify(r));
});
test('colours mix: blue and red make purple, blue and yellow make green, red and yellow make orange; purple beats pink', () => {
  const r = J(`(() => { ${PRE}
    const fam = (a, b) => { const c = {}; for (let i = 0; i < 300; i++) { const e = PonyGenes.express(foal(pony(a, 2), pony(b, 2)).look), k = ColorBreeding.classify(PonyPalette.coats[e.bodyColor]); const key = k.neutral ? 'neutral' : k.fam; c[key] = (c[key] || 0) + 1; } return c; };
    return { br: fam(3, 7), by: fam(3, 5), ry: fam(7, 5), pp: fam(2, 1) }; })()`);
  assert(r.br.purple > 200, JSON.stringify(r.br)); assert(r.by.green > 200, JSON.stringify(r.by)); assert(r.ry.orange > 200, JSON.stringify(r.ry)); assert(r.pp.purple > 200 && (r.pp.pink || 0) < 45, JSON.stringify(r.pp));
});
test('a neutral does nothing: grey, white and brown ponies bred with blues pass on the plain genes', () => {
  const r = J(`(() => { ${PRE}
    const d = (a, b) => ColorBreeding.decide(() => 0.5, pony(a, 2).look, pony(b, 2).look, 0, { id: 'bodyColor', shade: 'coatShade', slot: 0 }).rule;
    return { whiteBlue: d(0, 3), greyBlue: d(9, 3), brownRed: d(13, 7), yellowYellow: d(5, 22), blueBlue: d(3, 8) }; })()`);
  assert.deepStrictEqual(r, { whiteBlue: 'none', greyBlue: 'none', brownRed: 'none', yellowYellow: 'none', blueBlue: 'intensify' });
});
test('depth shows: natural is the variety colour exactly (older ponies unchanged), and each step is deeper, never lighter', () => {
  const r = J(`(() => { const hex = '#a9d4f5', lum = h => PonyGenes.toHsl(h)[2], steps = [0, 1, 2, 3, 4].map(d => PonyGenes.shade(hex, d));
    const old = PonyLook.fromGene(9, 0).slice(0, 7 + PonyGenes.at('talent') + 1);                                // a genome from before the depth genes
    return { same: steps[0] === hex, l: steps.map(lum), oldDepth: PonyGenes.express(old).coatShade, oldCoat: PonyLook.describe(old).coat === PonyPalette.coats[old[0]], len: PonyLook.fromGene(3, 0).length === PonyGenes.LEN }; })()`);
  assert(r.same); for (let i = 1; i < 5; i++) assert(r.l[i] < r.l[i - 1], 'deeper each step: ' + r.l.join()); assert.strictEqual(r.oldDepth, 0); assert(r.oldCoat); assert(r.len);
});
test('the stall forecasts the colours of a pair before they breed', () => {
  const r = J(`(() => { ${PRE}
    const a = ColorBreeding.forecast(pony(3, 2).look, pony(3, 2).look), b = ColorBreeding.forecast(pony(3, 2).look, pony(7, 2).look), c = ColorBreeding.forecast(pony(9, 2).look, pony(3, 2).look);
    return { a: a[0], b: b[0], c: c[0], cross: S._crossView({ type: 'pony_plain', look: pony(3, 2).look }, { type: 'pony_plain', look: pony(3, 2).look }).colors.length }; })()`);
  assert.strictEqual(r.a.rule, 'intensify'); assert(/blue/i.test(r.a.result.name) && r.a.result.name !== r.a.a.name, 'a deeper blue than a light blue: ' + JSON.stringify(r.a)); assert.strictEqual(r.b.rule, 'mix'); assert(/purple/i.test(r.b.result.name), r.b.result.name);
  assert.strictEqual(r.c.rule, 'none'); assert.strictEqual(r.c.result, null); assert.strictEqual(r.cross, 2);
});
console.log(`\n${passed} passed`);
