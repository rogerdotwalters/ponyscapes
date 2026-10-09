'use strict';
/* TOOLS - checks the dungeon system end to end in Node (no browser):  node tools/test-dungeon.js
 * enemy numbers, room PNGs <-> lists, the cliff / cave stamps over many seeds, and a GameServer walking a player through every room. */
const assert = require('assert'), fs = require('fs'), path = require('path');
const { run } = require('./headless')();
const png = require('./pngGrey'), { CaveRoom, RoomCode } = require('../public/js/shared/roomCodes');
let passed = 0;
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);                // (compares by value, across the game's own context)
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

test('enemy numbers: from 1000, unique, one for every non-pony creature', () => {
  const all = run('EnemyCodes.all()'), codes = all.map(e => e.code);
  assert(codes.every(c => c >= 1000) && new Set(codes).size === codes.length);
  assert.strictEqual(all.length, run('Object.values(AnimalDefs).filter(d => !d.pony).length'));
  assert.strictEqual(run("EnemyCodes.codeOf('rabbit')"), 1000);
  assert.strictEqual(run('EnemyCodes.idOf(1028)'), 'snake');
  assert.strictEqual(run("EnemyCodes.codeOf('pony_plain')"), undefined);
});

test('room PNGs: 8-bit and 16-bit read back as the same 2D list', () => {
  const rows = [[1, 1, 1, 1, 1], [1, 2, 0, 4, 1], [1, 0, 1005, 5, 1], [1, 0, 0, 3, 1], [1, 1, 1, 1, 1]];
  const room = CaveRoom.fromRows('t', rows), grey16 = Uint16Array.from(rows.flat());
  const back16 = png.decode(png.encode(5, 5, grey16, 16));
  assert.deepStrictEqual(CaveRoom.fromGrey('t', 5, 5, back16.grey, back16.depth).toRows(), rows);
  const small = rows.map(r => r.map(c => (c >= 1000 ? 1 : c))), g8 = Uint16Array.from(small.flat().map(c => run(`(c => roomGreyOfCode(c))(${c})`)));
  const back8 = png.decode(png.encode(5, 5, g8, 8));
  assert.deepStrictEqual(CaveRoom.fromGrey('t', 5, 5, back8.grey, back8.depth).toRows(), small);
  assert.deepStrictEqual(room.problems(), []);
  assert.strictEqual(room.enemies[0].code, 1005);
  assert(CaveRoom.fromRows('x', [[1, 1], [1, 1]]).problems().length > 0);                          // no entrance / exit
});

test('the sample room PNGs match js/content/caveRooms.js', () => {
  const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
  const dir = path.join(__dirname, '..', 'public', 'assets', 'dungeons', 'rooms');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.png'))) {
    const id = f.slice(0, -4), img = png.decode(fs.readFileSync(path.join(dir, f))), room = CaveRoom.fromGrey(id, img.width, img.height, img.grey, img.depth);
    assert.deepStrictEqual(room.problems(), [], id);
    same(run(`CaveRooms.get('${id}').toRows()`), room.toRows(), id);
  }
  same([run('CaveRooms.get("cavern_3").w'), run('CaveRooms.get("cavern_3").h')], [100, 150]);
});

test('cliff and cave stamps: same on every call, dry land, cave mouth open and reachable, cliffs solid', () => {
  for (const seed of [1, 7, 99, 2024, 31337, 424242]) {
    const T = run(`globalThis.T = new TerrainGenerator(${seed})`) && run('T');
    const list = run('T.caveSites.list().map(p => p.id + p.x0 + "," + p.y0 + p.flip).join("|")');
    assert.strictEqual(run('new TerrainGenerator(' + seed + ').caveSites.list().map(p => p.id + p.x0 + "," + p.y0 + p.flip).join("|")'), list);
    const cave = run('T.caveSites.caves()[0]');
    assert(cave, 'seed ' + seed + ' has a cave');
    assert.strictEqual(run(`T.caveSites.objAt(${Math.floor(cave.x)}, ${Math.floor(cave.y)})`), run('OBJ.CAVEMOUTH'));         // the mouth is a block of the cliff face
    assert.strictEqual(run(`T.caveSites.objAt(${Math.floor(cave.x)}, ${Math.floor(cave.y) + 1})`), 0);                // ... with open yard in front of it
    // from the yard in front of the mouth you can walk to open land 20 tiles away, through chunks the way the game builds them
    const reach = run(`(() => { const w = new World(${seed}), mx = ${Math.floor(cave.x)}, my = ${Math.floor(cave.y)};
      const seen = new Set([mx + ',' + my + 1]), q = [[mx, my + 2]], key = (x, y) => x + ',' + y; seen.add(key(mx, my + 2));
      for (let i = 0; i < q.length && q.length < 4000; i++) { const [x, y] = q[i]; if (Math.hypot(x - mx, y - my) > 20) return true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!seen.has(key(nx, ny)) && !w.navBlocked(nx, ny)) { seen.add(key(nx, ny)); q.push([nx, ny]); } } }
      return false; })()`);
    assert(reach, 'seed ' + seed + ': the yard in front of the cave is boxed in');
    const w = run(`(() => { const w = new World(${seed}); w.ensureAround(${cave.x}, ${cave.y}, 2);
      const mouthSolid = w.isSolid(${Math.floor(cave.x)}, ${Math.floor(cave.y)}), yardOpen = !w.isSolid(${Math.floor(cave.x)}, ${Math.floor(cave.y) + 1});
      let cliffs = 0, solid = 0; for (const p of T.caveSites.list()) for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const o = T.caveSites.objAt(p.x0 + x, p.y0 + y); if (o) { cliffs++; if (w.isSolid(p.x0 + x, p.y0 + y)) solid++; } }
      return { mouthSolid, yardOpen, cliffs, solid }; })()`);
    assert(w.mouthSolid && w.yardOpen, 'seed ' + seed);
    assert(w.cliffs > 100);
    run('for (const p of T.caveSites.list()) for (let y = -1; y <= p.h; y++) for (let x = -1; x <= p.w; x++) { const t = T.baseTile(p.x0 + x, p.y0 + y); if (t === TILE.WATER || t === TILE.SHALLOW) throw new Error("stamp on water at " + (p.x0 + x) + "," + (p.y0 + y)); }');
  }
});

test('a player walks the whole dungeon: in, room by room, chests, enemies, out', () => {
  const out = run(`(() => {
    const log = [], s = new GameServer(4242), id = s.addPlayer(), p = s.players[id], mouth = s.map.terrain.caveSites.caves()[0];
    for (const item of ['hoe', 'sickle', 'brush', 'watering_can', 'knife']) s.inventories[id].remove(item, 1);       // room in the pack for loot
    const at = (x, y) => { p.x = x; p.y = y; s.mapOf(p).ensureAround(x, y, 2); s.tick += 40; };
    const press = () => { s._interact(id, p); s.tick += 40; };
    at(mouth.x, mouth.y + 1.6);
    const find = findCaveInteraction(s.mapOf(p), p);
    log.push(['mouth', find && find.kind]);
    press();
    log.push(['room0', p.grid]);
    const counts = [];
    for (let r = 0; r < 3; r++) {
      const world = s.mapOf(p), plan = world.plan, room = plan.room;
      const here = Object.values(s.animals.animals).filter(a => a.grid === p.grid && !AnimalDefs[a.type].pony);
      counts.push([here.length, room.spawns.length + room.enemies.length]);
      // chests: open each one
      for (const c of room.chests) {
        at(c.x + 0.5, c.y + 1.4);
        for (const slot of s.inventories[id].toJSON()) if (slot) s.inventories[id].remove(slot.id, slot.count);       // an empty pack
        const near = findCaveInteraction(world, p); log.push(['chestOffer', near && near.kind]);
        const before = s.inventories[id].clone(); press();
        log.push(['chestGave', JSON.stringify(s.inventories[id].toJSON()) !== JSON.stringify(before.toJSON()) || s.inventories[id].purse !== before.purse]);
        press(); log.push(['chestAgain', findCaveInteraction(world, p) === null || findCaveInteraction(world, p).kind !== 'dungeon_chest']);
      }
      // the way on: stand beside the exit patch
      const e = room.exits[0]; const spot = plan._landing(room.exits); at(spot.x, spot.y);
      const act = findCaveInteraction(world, p); log.push(['exitOffer', act && act.kind]);
      press(); log.push(['moved', p.grid]);
    }
    // the last layer: the Cave Bear's lair, with its guardian in the arena; the way back up is the last room, and the entrances lead back out
    const boss = Object.values(s.animals.animals).filter(a => a.grid === 'cave:0' && AnimalDefs[a.type].boss).map(a => a.type);
    log.push(['lair', p.grid + ':' + boss.join()]);
    const up = DungeonSpace.exit(); at(up.x + 1.2, up.y);
    const leave = findCaveInteraction(s.mapOf(p), p); log.push(['lairExit', leave && leave.kind]);
    press(); log.push(['upstairs', p.grid]);
    for (let r = 2; r >= 0; r--) {
      const plan = s.mapOf(p).plan, spot = plan._landing(plan.room.entrances); at(spot.x, spot.y); press();
    }
    log.push(['back outside', p.grid === '' && Math.hypot(p.x - mouth.x, p.y - (mouth.y + 1.6)) < 0.5]);
    return { log, counts };
  })()`);
  const kinds = out.log.map(l => l.join('=')).join(' | ');
  assert(kinds.includes('mouth=enter_dungeon') && kinds.includes('room0=dungeon:0:0'), kinds);
  assert(out.log.filter(l => l[0] === 'chestOffer').every(l => l[1] === 'dungeon_chest'), kinds);
  assert(out.log.filter(l => l[0] === 'chestGave').every(l => l[1] === true), kinds);
  assert(out.log.filter(l => l[0] === 'chestAgain').every(l => l[1] === true), kinds);
  assert(out.log.filter(l => l[0] === 'exitOffer').every(l => l[1] === 'dungeon_next'), kinds);
  assert.strictEqual(JSON.stringify(out.log.filter(l => l[0] === 'moved').map(l => l[1])), JSON.stringify(['dungeon:0:1', 'dungeon:0:2', 'cave:0']), kinds);
  assert(kinds.includes('lair=cave:0:boss_cave_bear') && kinds.includes('lairExit=leave_cave') && kinds.includes('upstairs=dungeon:0:2'), kinds);
  assert(out.log.find(l => l[0] === 'back outside')[1], kinds);
  for (const [spawned, wanted] of out.counts) assert.strictEqual(spawned, wanted);
});

test('going back a room arrives beside the exit you left by; the first entrance leads outside', () => {
  const out = run(`(() => {
    const s = new GameServer(4242), id = s.addPlayer(), p = s.players[id], mouth = s.map.terrain.caveSites.caves()[0];
    const go = () => { s.tick += 40; s._interact(id, p); s.tick += 40; };
    p.x = mouth.x; p.y = mouth.y + 1.6; s.map.ensureAround(p.x, p.y, 2); go();
    let plan = s.mapOf(p).plan, spot = plan._landing(plan.room.exits); p.x = spot.x; p.y = spot.y; go();           // on to room 1
    plan = s.mapOf(p).plan; spot = plan._landing(plan.room.entrances); p.x = spot.x; p.y = spot.y; go();           // ... and back to room 0
    const back = s.mapOf(p).plan, near = back._landing(back.room.exits);
    const r = { grid: p.grid, nearExit: Math.hypot(p.x - near.x, p.y - near.y) < 0.01 };
    spot = back._landing(back.room.entrances); p.x = spot.x; p.y = spot.y; go();                                    // the first room's entrance: outside
    r.out = p.grid; return r;
  })()`);
  assert.strictEqual(JSON.stringify(out), JSON.stringify({ grid: 'dungeon:0:0', nearExit: true, out: '' }));
});

test('cave walls: rock blocks only where wall meets floor, solid everywhere, low on the south / east side', () => {
  const r = run(`(() => { const w = new GameServer(4242).grids.get('dungeon:0:0'), P = w.plan, R = P.room; let blocks = 0, bad = 0, low = 0, tall = 0, deep = 0;
    for (let y = -2; y <= R.h + 1; y++) for (let x = -2; x <= R.w + 1; x++) { const o = P.objAt(x, y), floor = R.walkable(x, y);
      if (floor && o && o !== OBJ.CAVEMOUTH_IN) bad++; if (!floor && !P.solidAt(x, y)) bad++;
      if (o) { blocks++; if (o === OBJ.CAVEROCK_LOW) low++; else if (o === OBJ.CAVEROCK_TALL) tall++; else if (o !== OBJ.CAVEMOUTH_IN) bad++; if (R.walkable(x, y - 1) && o !== OBJ.CAVEROCK_LOW) bad++; }
      if (!floor && !o) deep++; }
    return { blocks, bad, low, tall, deep }; })()`);
  assert.strictEqual(r.bad, 0); assert(r.low > 20 && r.tall > 20 && r.deep > 100, JSON.stringify(r));
});

test('cave mouths, pools and stalagmites: mouths are solid blocks, pools wadeable and clear of markers, spires never on markers or water', () => {
  const r = run(`(() => { const out = { rooms: 0, mouths: 0, pools: 0, spires: 0, bad: [] };
    for (let n = 0; n < 3; n++) {
      const w = new GameServer(4242).grids.get('dungeon:0:' + n), P = w.plan, R = P.room; out.rooms++;
      for (const m of P.mouths) { const x = m % R.w, y = (m - x) / R.w; out.mouths++; if (P.objAt(x, y) !== OBJ.CAVEMOUTH_IN || !P.solidAt(x, y) || !R.walkable(x, y)) out.bad.push('mouth ' + x + ',' + y); }
      for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
        const code = R.code(x, y), t = P.tileAt(x, y);
        if (t === TILE.SHALLOW) { out.pools++; if (code !== 0 || P.solidAt(x, y)) out.bad.push('pool on ' + code); }
        if (code >= 2 && t === TILE.SHALLOW) out.bad.push('water on a marker');
      }
      for (let cy = 0; cy <= R.h >> 4; cy++) for (let cx = 0; cx <= R.w >> 4; cx++) for (const { prop } of P.propsIn(cx, cy)) {
        if (prop.t !== 'stalagmite') continue; out.spires++;
        const tx = Math.floor(prop.x), ty = Math.floor(prop.y);
        if (R.code(tx, ty) !== 0 || P.tileAt(tx, ty) === TILE.SHALLOW || P.clear.has(ty * R.w + tx)) out.bad.push('spire at ' + tx + ',' + ty);
      }
      // every marker can still be reached on foot through the real world's solidity (mouths and spire circles are no wall)
      const reach = (() => { const seen = new Set(), q = [[Math.floor(P.entryPoint().x), Math.floor(P.entryPoint().y)]]; seen.add(q[0] + '');
        for (let i = 0; i < q.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = q[i][0] + dx, ny = q[i][1] + dy; if (!seen.has(nx + ',' + ny) && !P.solidAt(nx, ny)) { seen.add(nx + ',' + ny); q.push([nx, ny]); } }
        return seen; })();
      for (const list of [R.chests, R.spawns]) for (const t of list) if (!reach.has(t.x + ',' + t.y)) out.bad.push('unreachable ' + t.x + ',' + t.y);
      const ex = P._landing(R.exits); if (!reach.has(Math.floor(ex.x) + ',' + Math.floor(ex.y))) out.bad.push('exit landing unreachable');
    }
    return out; })()`);
  assert.strictEqual(r.bad.length, 0, r.bad.slice(0, 5).join(' | ')); assert(r.mouths === 6 && r.pools > 30 && r.spires > 30, JSON.stringify(r));
});

test('the Old Cavern is mostly slimes with the odd wolf (weighted spawn nodes)', () => {
  const r = run(`(() => { const s = new GameServer(4242), tally = {}; let nodes = 0;
    for (let n = 0; n < 3; n++) { const w = s.grids.get('dungeon:0:' + n); s.dungeons.populate(w); nodes += w.plan.room.spawns.length + w.plan.room.enemies.length; }
    for (const a of Object.values(s.animals.animals)) if (a.grid && AnimalDefs[a.type] && !AnimalDefs[a.type].pony) tally[a.type] = (tally[a.type] || 0) + 1;
    const pool = s.dungeons.enemyPool(Dungeons.all()[0]), rolls = []; for (let i = 0; i < 1000; i++) rolls.push(s.dungeons.pick(pool, i / 1000));
    return { tally, nodes, wolfShare: rolls.filter(x => x === 'wolf').length / 1000, def: AnimalDefs.slime && AnimalDefs.slime.hostile, code: EnemyCodes.codeOf('slime') }; })()`);
  assert.strictEqual(r.def, true); assert.strictEqual(r.code, 1030);
  assert.strictEqual(Object.values(r.tally).reduce((a, b) => a + b, 0), r.nodes);
  assert(r.tally.slime > r.nodes * 0.7, JSON.stringify(r)); assert(!r.tally.wolf || r.tally.wolf < r.nodes * 0.25, JSON.stringify(r));
  assert(Math.abs(r.wolfShare - 0.1) < 0.01, JSON.stringify(r));
});

test('debug teleport: village, cave mouth and each dungeon room (host only)', () => {
  const r = run(`(() => { const s = new GameServer(4242), id = s.addPlayer(), p = s.players[id], out = [], mouth = s.map.terrain.caveSites.caves()[0];
    for (const to of ['cave', 'room:2', 'room:0', 'village', 'room:9']) { s.receiveCommand(id, { type: 'debugTeleport', to }); out.push(p.grid + '@' + Math.round(p.x) + ',' + Math.round(p.y)); }
    s.receiveCommand(id, { type: 'debugTeleport', to: 'room:1' }); s.hostId = 'someone else'; const before = p.grid; s.receiveCommand(id, { type: 'debugTeleport', to: 'cave' });
    return { out, mouth: [Math.round(mouth.x), Math.round(mouth.y + 1.6)], refused: p.grid === before }; })()`);
  assert.strictEqual(r.out[0], '@' + r.mouth.join(',')); assert.strictEqual(r.out[1].split('@')[0], 'dungeon:0:2'); assert.strictEqual(r.out[2].split('@')[0], 'dungeon:0:0');
  assert.strictEqual(r.out[3].split('@')[0], ''); assert.strictEqual(r.out[4].split('@')[0], '');                      // (room:9 does not exist: you stay where you were)
  assert(r.refused);
});

test('zone graph: sub zones are placed round their parent from the seed, touch it, and keep clear of each other', () => {
  const sigs = new Set();
  for (const seed of [1, 7, 99, 4242, 31337, 424242]) {
    const r = run(`(() => { const Z = new World(${seed}).terrain.layers.zones, n = Z.layout(), o = CONFIG.sim.levels.origin;
      const again = new World(${seed}).terrain.layers.zones.layout().map(q => [Math.round(q.x), Math.round(q.y), Math.round(q.r)]).join();
      const pairs = []; for (const a of n) for (const b of n) if (a.def.index < b.def.index) pairs.push({ a: a.def.id, b: b.def.id, related: a.parent === b || b.parent === a, gap: Math.hypot(a.x - b.x, a.y - b.y) / (a.r + b.r) });
      return { count: n.length, root: [n[0].x, n[0].y, o.x, o.y], pairs, sig: n.map(q => [Math.round(q.x), Math.round(q.y), Math.round(q.r)]).join(), again }; })()`);
    assert.strictEqual(r.count, 4); same(r.root.slice(0, 2), r.root.slice(2), 'the root zone is at the village'); assert.strictEqual(r.sig, r.again, 'same seed, same layout');
    for (const p of r.pairs) { if (p.related) assert(p.gap > 0.8 && p.gap < 0.95, 'a sub zone overlaps its parent a little: ' + JSON.stringify(p)); else assert(p.gap >= 1.05, 'zones keep clear: ' + JSON.stringify(p)); }
    sigs.add(r.sig);
  }
  assert(sigs.size >= 5, 'different seeds lay the zones out differently');
});

test('zone graph: every zone has its biome, cliff walls of that biome, a gateway to its parent, and open sea round the map behind an invisible barrier', () => {
  const r = run(`(() => { const w = new World(4242), T = w.terrain, Z = T.layers.zones, n = Z.layout(), o = CONFIG.sim.levels.origin, out = { biomes: [], fauna: [], gates: [], walls: 0, wallsSolid: true, sea: [], far: [] };
    for (const q of n) { out.biomes.push(T.layers.biomes.at(Math.floor(q.x), Math.floor(q.y))); out.fauna.push(Z.faunaAt(q.x, q.y)); }
    for (let y = -300; y <= 300; y++) for (let x = -300; x <= 300; x++) {
      const tx = Math.floor(o.x + x), ty = Math.floor(o.y + y), k = Z.kindAt(tx, ty);
      if (k === ZONE_KIND.GATE) out.gates[Z._chunk(tx, ty).gate[((ty & 15) << 4) | (tx & 15)]] = true;
      if (k === ZONE_KIND.WALL && x % 3 === 0) { out.walls++; if (!isCliffObj(T.objAt(tx, ty)) || T.baseTile(tx, ty) !== TILE.STONE) out.wallsSolid = false; }
    }
    const sea = Z.kindAt(Math.floor(o.x + Z.edge - 8), Math.floor(o.y)), farAt = Math.floor(o.x + Z.edge + 40);
    out.seaKind = [Z.kindAt(Math.floor(o.x - n[0].r - 8), Math.floor(o.y + 3 * 0)), Z.kindAt(farAt, Math.floor(o.y)), Z.barrierAt(farAt, Math.floor(o.y)), T.baseTile(farAt, Math.floor(o.y)) === TILE.WATER];
    out.cliffLook = ['normal', 'forest', 'apple', 'mushroom'].map(b => !!(Biomes.get(b) || {}).cliff);
    return out; })()`);
  same(r.biomes, ['normal', 'forest', 'apple', 'mushroom']); same(r.fauna, [0, 1, 0, 0]);
  assert(r.gates[1] && r.gates[2] && r.gates[3] && !r.gates[0], 'a gateway into each sub zone: ' + JSON.stringify(r.gates));
  assert(r.walls > 500 && r.wallsSolid, 'cliff walls are solid cliffs on stone');
  assert(r.seaKind[1] === 4 && r.seaKind[2] === true && r.seaKind[3] === true, 'beyond the sea is an invisible barrier over water: ' + JSON.stringify(r.seaKind));
  same(r.cliffLook, [false, true, true, true]);
});

test('zone graph: gateways switch on and off; walking from the village reaches only the zones whose gateways are open', () => {
  for (const seed of [4242, 7]) {
    const r = run(`(() => { const w = new World(${seed}), T = w.terrain, Z = T.layers.zones, o = CONFIG.sim.levels.origin, n = Z.layout();
      const ok = (x, y) => { const k = Z.kindAt(x, y); return (k === ZONE_KIND.LAND || k === ZONE_KIND.GATE) && !Z.barrierAt(x, y); };
      const reach = () => { const R = Math.ceil(Z.edge), seen = new Set(), key = (x, y) => (x + 1000) * 4000 + y + 1000, q = [[Math.floor(o.x), Math.floor(o.y)]]; seen.add(key(q[0][0], q[0][1]));
        for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (Math.abs(nx - o.x) > R || Math.abs(ny - o.y) > R || seen.has(key(nx, ny)) || !ok(nx, ny)) continue; seen.add(key(nx, ny)); q.push([nx, ny]); } }
        return n.map(z => seen.has(key(Math.floor(z.x), Math.floor(z.y)))); };
      const start = reach(); Z.unlock(1); const opened = reach(); Z.lock(1); const shut = reach(); Z.lock(2); const orchardShut = reach();
      const ws = new GameServer(${seed}); ws.worldProgress.defeatBoss(0); const afterBoss = ws.map.layers.rings.isUnlocked(1); ws.worldProgress.setGate(1, false); const closedByHand = !ws.map.layers.rings.isUnlocked(1);
      const w2 = new GameServer(${seed}); w2.worldProgress.restore([], { 2: false }); const restored = [w2.map.layers.rings.isUnlocked(2), w2.map.layers.rings.isUnlocked(3), w2.map.layers.rings.isUnlocked(1)];
      return { start, opened, shut, orchardShut, afterBoss, closedByHand, restored, wire: new WorldProgress(Z).toWire() }; })()`);
    same(r.start, [true, false, true, true], 'the forest gate starts shut: ' + JSON.stringify(r.start));
    same(r.opened, [true, true, true, true]); same(r.shut, [true, false, true, true]); same(r.orchardShut, [true, false, false, true]);
    assert(r.afterBoss && r.closedByHand); same(r.restored, [false, true, false]);
  }
});

test('zone graph: a shut gateway is solid and bare, an open one is walkable ground', () => {
  const r = run(`(() => { const w = new World(4242), T = w.terrain, Z = T.layers.zones, o = CONFIG.sim.levels.origin; let gate = null;
    for (let y = -200; y <= 200 && !gate; y++) for (let x = -200; x <= 200; x++) { const tx = Math.floor(o.x + x), ty = Math.floor(o.y + y); if (Z.kindAt(tx, ty) === ZONE_KIND.GATE && Z._chunk(tx, ty).gate[((ty & 15) << 4) | (tx & 15)] === 1) { gate = [tx, ty]; break; } }
    w.ensureAround(gate[0], gate[1], 2);
    const shut = [w.isSolid(gate[0], gate[1]), Z.gateAt(gate[0], gate[1]), T.baseTile(gate[0], gate[1]) === TILE.DIRT, !!w.peekPropAt(gate[0] + 0.5, gate[1] + 0.5)];
    Z.unlock(1); const open = [w.isSolid(gate[0], gate[1]), Z.gateAt(gate[0], gate[1]), w.navBlocked(gate[0], gate[1])];
    return { shut, open }; })()`);
  same(r.shut, [true, 1, true, false]); same(r.open, [false, -1, false]);
});

console.log(process.exitCode ? 'FAILED' : `all ${passed} checks passed`);
