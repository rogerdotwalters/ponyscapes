'use strict';
/* TOOLS - the sky ponies in Node:  node tools/test-sky.js
 * water ponies in the rain, lightning ponies in thunderstorms, sun ponies at noon, star ponies at midnight; they fade with their sky unless caught, and breed true. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
const J = src => JSON.parse(run(`JSON.stringify(${src})`));
const KINDS = { water: 'pony_water', lightning: 'pony_lightning', sun: 'pony_sun', star: 'pony_star' };

test('four sky ponies, each with a kind, a variety after the moon, its own skills and a coin', () => {
  assert.deepStrictEqual(J('SkyPonyTable.ids()'), ['water', 'lightning', 'sun', 'star']);
  const ids = J('PonyVariants.map(v => v.id)'), moon = ids.indexOf('moon');
  for (const [id, kind] of Object.entries(KINDS)) {
    assert(ids.indexOf(id) > moon, id + ' comes after the moon: saved ponies point at varieties by index');
    assert.strictEqual(J(`AnimalDefs.${kind}.pony`), true); assert.strictEqual(J(`SkyPonies.kindOfVariant(${ids.indexOf(id)})`), kind);
    assert.strictEqual(J(`PonySkillTrees.get('${id}').skills.length`), 2); assert(J(`!!PonyCoins.itemOf('${id}')`));
  }
  assert.strictEqual(J('SkyPonies.kindOfVariant(0)'), null);
});
test('rarities: water and sun rare, lightning epic, star legendary', () => {
  assert.deepStrictEqual(Object.values(KINDS).map(k => run(`AnimalDefs.${k}.rarity`)), ['rare', 'epic', 'rare', 'legendary']);
  for (const [id, kind] of Object.entries(KINDS)) assert(J(`PonyLook.fromGene(5, ${J('PonyVariants.map(v => v.id)').indexOf(id)}, AnimalDefs.${kind}.rarity)[5]`) >= J(`rarityOf(AnimalDefs.${kind}.rarity).order`));
  assert.strictEqual(run("SkyPonies.better('legendary')"), 'legendary'); assert.strictEqual(run("SkyPonies.better('rare')"), 'epic');
});
test('each pony comes out only in its sky: rain, thunderstorm, full sun, peak night', () => {
  const m = (id, weather, hour) => J(`SkyPonies.matches(SkyPonyTable.get('${id}'), '${weather}', ${hour})`);
  assert(m('water', 'rain', 8) && m('water', 'downpour', 22) && !m('water', 'clear', 12) && !m('water', 'snow', 12));
  assert(m('lightning', 'thunderstorm', 3) && !m('lightning', 'rain', 3));
  assert(m('sun', 'clear', 12) && !m('sun', 'clear', 20) && !m('sun', 'rain', 12) && !m('sun', 'clear', 7));
  assert(m('star', 'clear', 23.5) && m('star', 'clear', 0.5) && !m('star', 'clear', 12) && !m('star', 'clear', 21) && !m('star', 'rain', 0));
  assert(J("SkyPonies.strength(SkyPonyTable.get('star'), { cur: {} }, 0)") > 0.99 && J("SkyPonies.strength(SkyPonyTable.get('star'), { cur: {} }, 23.2)") < 0.9);
});
/** A server with one player, the weather and the hour set, then `ticks` of the sky events (certain chance). */
const sky = (weather, hour, ticks = 600) => run(`(() => {
  globalThis.S = new GameServer(11); globalThis.A = S.addPlayer(); CONFIG.sim.sky.chanceScale = 1000;
  S.weather.type = '${weather}'; S.weather.cur.rain = 1; S.weather.cur.lightning = 1; GameSettings.setClock(S.tick, ${hour});
  const out = {}; for (let i = 0; i < ${ticks}; i++) { S.tick += 60; GameSettings.setClock(S.tick, ${hour}); S.skyEvents.update(S.tick); }
  for (const a of Object.values(S.animals.animals)) if (a.type.startsWith('pony_') && a.look && a.look[4] >= PonyVariants.findIndex(v => v.id === 'water')) out[a.type] = (out[a.type] || 0) + 1;
  return out; })()`);
test('in the rain a water pony steps out; under a full noon sun a sun pony; in a thunderstorm a lightning pony; at midnight a star pony', () => {
  assert(JSON.parse(JSON.stringify(sky('rain', 9))).pony_water >= 1);
  assert(JSON.parse(JSON.stringify(sky('thunderstorm', 9))).pony_lightning >= 1);
  assert(JSON.parse(JSON.stringify(sky('clear', 12))).pony_sun >= 1);
  assert(JSON.parse(JSON.stringify(sky('clear', 0))).pony_star >= 1);
});
test('the wrong sky brings nothing, and the sky ending takes the uncaught ones (a caught one stays)', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sky('clear', 9))), {});
  const r = JSON.parse(JSON.stringify(run(`(() => {
    globalThis.S = new GameServer(11); globalThis.A = S.addPlayer(); CONFIG.sim.sky.chanceScale = 1000;
    S.weather.type = 'rain'; GameSettings.setClock(S.tick, 9); S.weather.cur.rain = 0.5;
    for (let i = 0; i < 200; i++) { S.tick += 60; GameSettings.setClock(S.tick, 9); S.skyEvents.update(S.tick); }
    const water = Object.values(S.animals.animals).filter(a => a.type === 'pony_water'), had = water.length;
    if (water[0]) water[0].owner = A;                                                   // somebody caught it
    S.weather.type = 'clear'; S.tick += 60; S.skyEvents.update(S.tick);
    return { had, left: Object.values(S.animals.animals).filter(a => a.type === 'pony_water').length }; })()`)));
  assert(r.had >= 1 && r.left === 1, JSON.stringify(r));
});
test('a strong sky can bring a better pony; a light one never does', () => {
  const rarities = (rain) => JSON.parse(JSON.stringify(run(`(() => { const out = []; for (let seed = 1; seed < 60; seed++) { const S = new GameServer(seed), A = S.addPlayer(); CONFIG.sim.sky.chanceScale = 1000;
    S.weather.type = 'rain'; S.weather.cur.rain = ${rain}; GameSettings.setClock(S.tick, 9);
    for (let i = 0; i < 80; i++) { S.tick += 60; GameSettings.setClock(S.tick, 9); S.skyEvents.update(S.tick); }
    for (const a of Object.values(S.animals.animals)) if (a.type === 'pony_water') out.push(a.look[5]); } return out; })()`)));
  const strong = rarities(1), light = rarities(0.3), rare = run("rarityOf('rare').order");
  const epicShare = a => a.filter(r => r > rare).length / a.length;
  assert(light.length && strong.length && strong.every(r => r >= rare) && light.every(r => r >= rare), 'never below its kind\'s rarity');
  assert(epicShare(strong) > epicShare(light) + 0.1, 'a downpour makes better ponies far more often: ' + epicShare(strong).toFixed(2) + ' vs ' + epicShare(light).toFixed(2));
});
test('breeding: two water ponies have a water pony foal; a water and a meadow pony have a foal of one variety that is its own kind; sky foals keep rarity', () => {
  const foals = JSON.parse(JSON.stringify(run(`(() => { const S = new GameServer(5), w = PonyVariants.findIndex(v => v.id === 'water'), out = { pure: 0, mixOk: 0, n: 0 };
    const mk = (type, variant, seed) => ({ type, look: PonyLook.fromGene(seed, variant, AnimalDefs[type].rarity) });
    for (let i = 0; i < 40; i++) {
      const A = mk('pony_water', w, 1 + i), B = mk('pony_water', w, 100 + i), look = S._foalLook(A, B); if (look[4] === w) out.pure++;
      const C = mk('pony_plain', 0, 200 + i), look2 = S._foalLook(A, C), kind = SkyPonies.kindOfVariant(look2[4]); out.n++;
      if ((look2[4] === w) === (kind === 'pony_water')) out.mixOk++;
    } return out; })()`)));
  assert.strictEqual(foals.pure, 40); assert.strictEqual(foals.mixOk, foals.n);
});
test('dev spawner: any kind or a random one, each pony with a fully random look, owned by the host', () => {
  const r = JSON.parse(JSON.stringify(run(`(() => { const S = new GameServer(3), A = S.addPlayer(); S.hostId = A;
    const before = Object.keys(S.animals.animals); S._devSpawnPonies('pony_star', 1); S._devSpawnPonies('random', 12);
    const fresh = Object.values(S.animals.animals).filter(a => !before.includes(a.id)), types = new Set(fresh.map(a => a.type)), looks = new Set(fresh.map(a => PonyLook.describe(a.look).gene.key));
    const star = fresh.find(a => a.type === 'pony_star');
    return { n: fresh.length, owned: fresh.every(a => a.owner === A), types: types.size, looks: looks.size, starVariant: PonyVariants[star.look[4]].id, valid: fresh.every(a => a.look.length === PonyGenes.LEN && a.look.every(Number.isInteger)) }; })()`)));
  assert.strictEqual(r.n, 13); assert(r.owned && r.valid); assert(r.types >= 3 && r.looks >= 8, JSON.stringify(r)); assert.strictEqual(r.starVariant, 'star');
});
test('dev spawner: a chosen kind and variety (a moon or sky kind keeps its own variety)', () => {
  const r = JSON.parse(JSON.stringify(run(`(() => { const S = new GameServer(4), A = S.addPlayer(); S.hostId = A; const had = Object.keys(S.animals.animals), mk = () => Object.values(S.animals.animals).filter(a => !had.includes(a.id));
    S._devSpawnPonies('pony_unicorn', 5, 'frost'); const a = mk().map(x => [x.type, PonyVariants[x.look[4]].id]);
    S._devSpawnPonies('pony_water', 1, 'frost'); const w = mk().find(x => x.type === 'pony_water');
    return { a, water: PonyVariants[w.look[4]].id }; })()`)));
  assert.strictEqual(r.a.length, 5); assert(r.a.every(([t, v]) => t === 'pony_unicorn' && v === 'frost'), JSON.stringify(r.a)); assert.strictEqual(r.water, 'water');
});
console.log(passed + ' passed');
