'use strict';
/* TOOLS - checks the castle in Node (no browser):  node tools/test-castle.js
 * the castle stands on the keep's footprint with a door in its south wall; its rooms (a module each: js/content/castleRooms.js) come in a ruined and a restored
 * version with the same doorways; every room is its own instance, reachable and joined to the next by a doorway; restoring it walks visitors out and
 * rebuilds the rooms; the state is saved with the world and sent to every player. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

run(`globalThis.setup = () => {
  globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.PA = S.players[A];
  globalThis.SITE = BuildingSites.list.find(s => s.id === 'castle');
  const f = BuildingSites.doorFront(SITE); PA.x = f.x; PA.y = f.y; S.map.ensureAround(PA.x, PA.y, 2);
  return SITE.index;
}`);
const press = () => run('S.tick += 40; S._interact(A, PA); S.tick += 40');
const where = () => run('PA.grid');
const label = () => run('(() => { const a = Interactions.find(S.grids.of(PA), S.boats, PA, null, {}, A, {}, {}); return a && a.label })()');
/** Stand beside the doorway (or the doormat) to `name` in the room we are in. */
const goTo = name => run(`(() => { const m = S.grids.of(PA), l = m.links().find(k => k.name === ${JSON.stringify(name)}), L = m.plan.layout;
  const at = l ? m.plan.approachOf(l.tx, l.ty) : { x: m.exitPoint().x, y: m.exitPoint().y - 1 }; PA.x = at.x; PA.y = at.y; return !!(l || ${JSON.stringify(name)} === 'back'); })()`);

test('the castle fills the keep: 8 x 7 tiles with its door on the south face, the old walls and corner towers gone', () => {
  assert.strictEqual(run('setup()'), 18);
  assert.strictEqual(run('[SITE.x0, SITE.y0, SITE.w, SITE.h, SITE.doorX, SITE.doorY].join()'), '4,4,8,7,7,10');
  assert.strictEqual(run('Village.obj(7, 10)'), run('OBJ.DOOR'));
  assert.strictEqual(run('Village.obj(4, 4)'), run('OBJ.HOUSE'));
  assert(!run('Village.propAtTile(5, 5)'), 'no barrel left inside the walls');
});

test('it is ruined until it is restored: two versions of one building, each with its own rooms', () => {
  run('setup()');
  assert.strictEqual(run('SITE.def.id'), 'castle_ruins'); assert.strictEqual(run('SITE.def.exterior.ruined'), true);
  assert.strictEqual(run('Grids.roomKeys(SITE).length'), 9);
  assert.strictEqual(run('Grids.plan(Grids.roomOf(SITE, "greathall")).layout.id'), 'castle_greathall_ruined');
  run('BuildingVersions.apply(["castle"])');
  assert.strictEqual(run('SITE.def.id'), 'castle'); assert.strictEqual(run('Grids.plan(Grids.roomOf(SITE, "greathall")).layout.id'), 'castle_greathall');
  run('BuildingVersions.apply([])');
});

test('both versions: every room is its own grid, joined by doorways that the other room leads back through, and you can walk from the entrance to every doorway', () => {
  for (const restored of [false, true]) {
    run(`setup(); BuildingVersions.apply(${restored ? '["castle"]' : '[]'})`);
    const out = JSON.parse(run(`JSON.stringify(Grids.roomKeys(SITE).map(key => {
      const gid = Grids.roomOf(SITE, key), p = Grids.plan(gid), L = p.layout, e = p.entryPoint(), sx = Math.floor(e.x), sy = Math.floor(e.y), seen = new Set([sy * 100 + sx]), q = [[sx, sy]];
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (p.solidAt(nx, ny) || seen.has(ny * 100 + nx)) continue; seen.add(ny * 100 + nx); q.push([nx, ny]); } }
      const back = L.exitTo ? Grids.plan(Grids.roomOf(SITE, L.exitTo)).layout.links.some(l => l.to === key) : true;
      return { key, gid, reach: [L.exit, ...L.links.map(l => [l.x, l.y])].every(([x, y]) => seen.has(y * 100 + x)), targets: L.links.every(l => Grids.valid(Grids.roomOf(SITE, l.to))), back };
    }))`));
    assert.strictEqual(new Set(out.map(o => o.gid)).size, out.length, 'one grid each');
    for (const o of out) { assert(o.reach, o.key + ' reachable'); assert(o.targets, o.key + ' links'); assert(o.back, o.key + ' is the doorway its parent opens by'); }
  }
  run('BuildingVersions.apply([])');
});

test('the same rooms in both versions: same size, same doorways; the ruin has cold hearths, no lamps and holes in its walls', () => {
  for (const key of run('CastleRooms.KEYS')) {
    const a = run(`CastleRooms.layouts.castle_${key}`), b = run(`CastleRooms.layouts.castle_${key}_ruined`);
    assert.strictEqual(JSON.stringify([a.tiles.length, a.tiles[0].length, a.exit, a.links]), JSON.stringify([b.tiles.length, b.tiles[0].length, b.exit, b.links]), key);
  }
  const lights = layout => layout.furniture.filter(f => run(`!!(FurnitureDefs.get(${JSON.stringify(f.id)}).light)`)).length;
  assert(lights(run('CastleRooms.layouts.castle_greathall')) > 0); assert.strictEqual(lights(run('CastleRooms.layouts.castle_greathall_ruined')), 0);
  assert(run('CastleRooms.KEYS.some(k => CastleRooms.layouts["castle_" + k + "_ruined"].tiles.join("").includes("."))'), 'holes in the walls');
});

test('walking in: the door asks "Enter", the doormat takes you out, each doorway takes you to the next room and back', () => {
  run('setup()');
  assert.strictEqual(label(), 'Enter Ruined Castle');
  press(); assert.strictEqual(where(), 'room:18');
  assert.strictEqual(run('S.grids.of(PA).plan.layout.id'), 'castle_gatehall_ruined');
  goTo('Great Hall'); assert.strictEqual(label(), 'Go to Great Hall');
  press(); assert.strictEqual(where(), 'room:18:1');
  assert.strictEqual(run('S.grids.of(PA).plan.layout.exitTo'), 'gatehall');
  goTo('Library'); press(); assert.strictEqual(where(), 'room:18:6');
  goTo('back'); assert.strictEqual(label(), 'Back to Great Hall');
  press(); assert.strictEqual(where(), 'room:18:1');
  assert(run('(() => { const m = S.grids.of(PA), l = m.links().find(k => k.to === "library"); return Math.hypot(PA.x - l.x, PA.y - l.y) < 2.2 })()'), 'back through the doorway we left by');
  goTo('Lord\'s Solar'); press(); assert.strictEqual(where(), 'room:18:8');
  goTo('back'); press(); goTo('back'); press(); assert.strictEqual(where(), 'room:18', 'the hall');
  goTo('Guardroom'); press(); goTo('Cellar'); press(); assert.strictEqual(where(), 'room:18:3');
  goTo('back'); press(); goTo('back'); press(); goTo('back'); assert.strictEqual(label(), 'Go outside');
  press(); assert.strictEqual(where(), '');
  assert(Math.abs(run('PA.y') - 11.45) < 0.01, 'out at the gate');
});

test('too far from a doorway does nothing', () => {
  run('setup()'); press();
  run('PA.x += 4'); const g = where(); run('S.interiors.link(A, PA, 6, 0)'); assert.strictEqual(where(), g);
});

test('restoring the castle walks visitors out, forgets its ruined rooms, and the state is saved and sent', () => {
  run('setup()'); press(); goTo('Great Hall'); press();
  assert.strictEqual(where(), 'room:18:1'); assert(run('S.grids.has("room:18:1")'));
  run('SnapshotBuilder.welcomeFor(S, A)'); assert.strictEqual(run('S.interiors.versionsFor(A)'), null, 'told at the welcome');
  assert.strictEqual(run('S.interiors.setRestored("castle", true)'), true);
  assert.strictEqual(where(), '', 'walked out'); assert(!run('S.grids.has("room:18:1")'), 'rooms forgotten');
  assert.strictEqual(run('JSON.stringify(S.interiors.versionsFor(A))'), '["castle"]'); assert.strictEqual(run('S.interiors.versionsFor(A)'), null);
  assert.strictEqual(label(), 'Enter Castle'); press();
  assert.strictEqual(run('S.grids.of(PA).plan.layout.id'), 'castle_gatehall');
  const world = JSON.parse(JSON.stringify(run('SaveData.exportWorld(S)')));
  assert.strictEqual(JSON.stringify(world.interiors.restored), '["castle"]');
  run('BuildingVersions.apply([])');
  run(`globalThis.W = ${JSON.stringify(world)}`); run('globalThis.S2 = new GameServer(4242)');
  assert.strictEqual(run('SITE.def.id'), 'castle_ruins', 'a new world starts in ruins');
  run('S2.interiors.restore(W.interiors)'); assert.strictEqual(run('SITE.def.id'), 'castle', 'a saved restoration comes back');
  assert.strictEqual(run('S.interiors.setRestored("castle", true)'), false, 'nothing changes twice');
  assert.strictEqual(run('S.interiors.setRestored("player_home", true)'), false, 'only a building with a ruined self can be restored');
  assert.strictEqual(run('JSON.stringify(SnapshotBuilder.welcomeFor(S2, S2.addPlayer()).versions)'), '["castle"]');
  run('BuildingVersions.apply([])');
});

test('the host can restore it from Settings, and the checkbox follows the castle', () => {
  run('setup()'); assert.strictEqual(run('S.settings.castleRestored'), false);
  run(`S.receiveCommand(A, { type: 'setting', key: 'castleRestored', value: true })`);
  assert.strictEqual(run('SITE.def.id'), 'castle'); assert.strictEqual(run('S.settings.castleRestored'), true);
  run(`S.receiveCommand(A, { type: 'setting', key: 'castleRestored', value: false })`);
  assert.strictEqual(run('SITE.def.id'), 'castle_ruins'); assert.strictEqual(run('S.settings.castleRestored'), false);
});

console.log(`${passed} passed`);
