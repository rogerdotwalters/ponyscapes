'use strict';
/* TOOLS - crossbreeding in Node:  node tools/test-hybrids.js   (hybrid varieties, new kinds of pony, their powers and coins) */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const J = src => JSON.parse(run(`JSON.stringify(${src})`));

test('every hybrid is a whole pony: a variety at the end of the table, its own kind, a skill tree with a real power, and a collector coin', () => {
  const r = J(`(() => { const bad = [], all = HybridTable.all(), base = PonyVariants.findIndex(v => v.id === 'star') + 1;
    for (const h of all) {
      const i = PonyVariants.findIndex(v => v.id === h.id), kind = AnimalDefs[h.kind], tree = PonySkillTrees.get(h.id), ab = SkillAbilityDefs[h.power.id];
      if (i < base) bad.push(h.id + ' is not after the older varieties');
      if (!kind || !kind.pony || kind.weight !== 0) bad.push(h.id + ' kind');
      if (SkyPonies.kindOfVariant(i) !== h.kind || !SkyPonies.isBound(h.kind)) bad.push(h.id + ' is not tied to its kind');
      if (!tree || !ab || !ab.effectDefs.every(Boolean) || !ab.effectDefs.length) bad.push(h.id + ' power');
      if (!PonyCoins.itemOf(h.id) || !ItemDefs[PonyCoins.itemOf(h.id)]) bad.push(h.id + ' coin');
      for (const p of h.parents) if (!PonyVariantTable.has(p) || !(HybridTable.has(p) || !PonyVariantTable.get(p).legacy)) bad.push(h.id + ' parent ' + p);
      if (h.parents.length && h.parents[0] === h.parents[1]) bad.push(h.id + ' same parents');
      const look = PonyLook.fromGene(5, i); if (!PonyLook.describe(look).coat) bad.push(h.id + ' look');
    }
    const keys = all.filter(h => h.parents.length).map(h => h.parents.slice().sort().join('+')); if (new Set(keys).size !== keys.length) bad.push('two recipes share parents');
    return { n: all.length, bad }; })()`);
  assert(r.n >= 60, 'plenty of hybrids: ' + r.n); assert.deepStrictEqual(r.bad, []);
});
test('Ember x Star makes Plasma (35% of foals, either way round); other pairs make none; hybrids cross into hybrids and Chaos', () => {
  const r = J(`(() => { const S = new GameServer(4), mk = (v, kind, sex) => { const l = PonyLook.fromGene(7, Hybrids.variantIndex(v)); l[6] = sex === 'f' ? 128 : 0; return { type: kind, look: l, ped: null }; };
    const tally = (A, B) => { const c = {}; for (let i = 0; i < 800; i++) { const id = PonyVariants[S._foalLook(A, B)[4]].id; c[id] = (c[id] || 0) + 1; } return c; };
    return { ab: tally(mk('ember', 'pony_plain', 'm'), mk('star', 'pony_plain', 'f')), ba: tally(mk('star', 'pony_plain', 'm'), mk('ember', 'pony_plain', 'f')), none: tally(mk('moss', 'pony_plain', 'm'), mk('ember', 'pony_plain', 'f')),
      tier3: tally(mk('plasma', 'pony_plasma', 'm'), mk('nebula', 'pony_nebula', 'f')), chaos: tally(mk('plasma', 'pony_plasma', 'm'), mk('prism', 'pony_prism', 'f')), same: tally(mk('plasma', 'pony_plasma', 'm'), mk('plasma', 'pony_plasma', 'f')),
      poss: Hybrids.possible('star', 'ember').map(h => h.id), possNone: Hybrids.possible('moss', 'ember').length }; })()`);
  for (const t of [r.ab, r.ba]) { assert(t.plasma > 800 * 0.35 * 0.7 && t.plasma < 800 * 0.35 * 1.3, 'about 35% plasma: ' + t.plasma); assert(t.ember && t.star, 'the rest take after a parent'); }
  assert.deepStrictEqual(Object.keys(r.none).sort(), ['ember', 'moss']); assert(r.tier3.supernova > 100 && r.tier3.supernova < 400, 'supernova: ' + r.tier3.supernova);
  assert(r.chaos.chaos > 20, 'two hybrids with no recipe may make chaos: ' + JSON.stringify(r.chaos)); assert.deepStrictEqual(Object.keys(r.same).sort(), ['plasma'], 'two plasma ponies breed true');
  assert.deepStrictEqual(r.poss, ['plasma']); assert.strictEqual(r.possNone, 0);
});
test('pegasus x unicorn may have an alicorn, an alicorn with either too; plain ponies may rise a step; nothing else changes kind', () => {
  const r = J(`(() => { const S = new GameServer(4), rng = () => S.rng(), n = 4000, t = (a, b) => { const c = {}; for (let i = 0; i < n; i++) { const k = Hybrids.kindCross(rng, a, b) || 'usual'; c[k] = (c[k] || 0) + 1; } return c; };
    return { pu: t('pony_pegasus', 'pony_unicorn'), ap: t('pony_alicorn', 'pony_pegasus'), pp: t('pony_plain', 'pony_plain'), ee: t('pony_earth', 'pony_earth'), uu: t('pony_unicorn', 'pony_unicorn'), opts: Hybrids.kindOptions('pony_pegasus', 'pony_unicorn').map(o => o.kind) }; })()`);
  assert(r.pu.pony_alicorn > n(0.22 * 0.7) && r.pu.pony_alicorn < n(0.22 * 1.3), 'alicorn about 22%: ' + r.pu.pony_alicorn); assert(r.ap.pony_alicorn > n(0.4 * 0.8), 'alicorn x pegasus 40%');
  assert(r.pp.pony_earth > 300 && r.pp.pony_earth < 520 && !r.pp.pony_pegasus, 'plain: about 10% earth (5% each parent): ' + JSON.stringify(r.pp)); assert(r.ee.pony_pegasus > 0 && r.ee.pony_unicorn > 0);
  assert.deepStrictEqual(Object.keys(r.uu), ['usual']); assert(r.opts.includes('pony_alicorn'));
  function n(x) { return 4000 * x; }
});
test('a hybrid foal born in the stable is its own kind, never wild, with its collector coin on the ground and a notice, and it keeps its variety through a save', () => {
  const r = J(`(() => {
    const S = new GameServer(7), A = S.addPlayer(), P = S.players[A];
    for (const k of Object.keys(S.animals.animals)) if (S.animals.animals[k].owner === A) delete S.animals.animals[k];
    S.interiors.enter(A, P, BuildingSites.list.find(x => x.def.id === 'pony_stable').index);
    const map = S.mapOf(P), f = map.plan.layout.furniture.find(g => g.id === 'stall' && g.x === 6 && g.y === 1);
    const mk = (sex, variant) => { const id = S.animals.spawn('pony_plain', f.x + 1, f.y + 5.5, 0, { level: 1, variant: Hybrids.variantIndex(variant) }), a = S.animals.animals[id]; a.look[6] = sex === 'f' ? 128 : 0; a.owner = A; a.leashed = true; a.grid = gridOf(P);
      P.x = f.x + 1.5; P.y = f.y + 5.5; a.x = P.x + 0.5; a.y = P.y; S._stallPick(A, { act: 'in', animal: id, fx: f.x, fy: f.y }); return a; };
    const m = mk('m', 'ember'), fe = mk('f', 'star');
    const info = S._breedInfo(A, P, f, [m, fe]);
    S.rng = () => 0.001;                                                                       // (every roll succeeds)
    S._stallPick(A, { act: 'breed', fx: f.x, fy: f.y });
    for (let t = 0; t < 100; t += 1 / 30) S._breedTick(1 / 30);
    const foal = Object.values(S.animals.animals).find(x => x.owner === A && x.foal > 0), notices = S.pendingEvents.filter(e => e.type === 'notice' && e.to === A).map(e => e.text), born = S.pendingEvents.find(e => e.type === 'foalBorn');
    const drops = Object.values(S.drops || {}).concat(S.groundItems ? Object.values(S.groundItems) : []);
    const saved = SaveData._pet({ type: foal.type, level: 1, look: foal.look, x: 1, y: 1 });
    return { cross: info.pair.cross, type: foal.type, variety: PonyVariants[foal.look[4]].id, rarity: RarityOrder[foal.look[5]], born: born && born.hybrid, hybridNotice: notices.some(t => t.startsWith('HYBRID!')),
      coin: JSON.stringify(S.drops || S.groundItems || S.items || {}).includes('pony_coin_plasma') || JSON.stringify(Object.keys(S).filter(k => /drop|ground/i.test(k)).map(k => S[k])).includes('pony_coin_plasma'), saved: saved.look[4] === foal.look[4], tree: PonySkills.unlocked(foal.look, foal.type, 6) };
  })()`);
  assert.strictEqual(r.cross.hybrids[0].name, 'Plasma'); assert.strictEqual(r.type, 'pony_plasma'); assert.strictEqual(r.variety, 'plasma'); assert.strictEqual(r.rarity, 'legendary');
  assert.strictEqual(r.born, 'Plasma'); assert(r.hybridNotice, 'a notice says it is a hybrid'); assert(r.coin, 'its collector coin is on the ground'); assert(r.saved); assert(r.tree.includes('hybrid_plasma'), 'its own power: ' + r.tree);
});
test('hybrids never spawn wild and are not in the dev spawner\'s random varieties', () => {
  const r = J(`(() => ({ wildKinds: Object.values(AnimalDefs).filter(d => d.pony && d.weight > 0).map(d => d.id).filter(id => HybridTable.all().some(h => h.kind === id)),
    pickable: PonyVariants.map((v, i) => i).filter(i => !PonyVariants[i].legacy && !SkyPonies.kindOfVariant(i)).some(i => Hybrids.isHybrid(PonyVariants[i].id)) }))()`);
  assert.deepStrictEqual(r.wildKinds, []); assert.strictEqual(r.pickable, false);
});
console.log(`\n${passed} passed`);
