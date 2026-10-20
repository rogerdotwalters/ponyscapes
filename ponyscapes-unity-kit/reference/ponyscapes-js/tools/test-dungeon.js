'use strict';
/* TOOLS - checks the dungeon system end to end in Node (no browser):  node tools/test-dungeon.js
 * enemy numbers, room PNGs <-> lists, the cliff / cave stamps over many seeds, and a GameServer walking a player through every room. */
const assert = require('assert'), fs = require('fs'), path = require('path');
const { run } = require('./headless')();
const png = require('./pngGrey'), { CaveRoom, RoomCode } = require('../public/js/shared/roomCodes');
let passed = 0;
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);                // (compares by value, across the game's own context)
const test = (name, fn) => { const t0 = Date.now(); try { fn(); passed++; console.log('  ok   ' + name + (Date.now() - t0 > 4000 ? `  (${((Date.now() - t0) / 1000).toFixed(1)}s)` : '')); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };

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

const ZONES = JSON.parse(JSON.stringify(run('Zones.all().map(z => ({ id: z.id, index: z.index, parent: z.parent || null, biome: z.biome, locked: !!z.locked, fauna: z.fauna === undefined ? z.index : z.fauna, unlockedBy: z.unlockedBy || null }))')));

test('zone tree: the Forest has the Candy Lands, the Waterlands, the Giant Forest and the Jungle; the Jungle has the Crystal Hollow, the Lava Fields and the Rainbow Skies', () => {
  const kids = id => ZONES.filter(z => z.parent === id).map(z => z.id).sort().join();
  assert.strictEqual(kids('meadows'), 'forest,mushroom,orchard'); assert.strictEqual(kids('forest'), 'candy,giant_forest,jungle,water'); assert.strictEqual(kids('jungle'), 'crystal,lava,rainbow');
  const by = id => ZONES.find(z => z.id === id);
  assert.deepStrictEqual(ZONES.map(z => z.index), ZONES.map((z, i) => i), 'indices run 0..n with no gap');
  assert(by('jungle').locked && by('jungle').unlockedBy === 'forest' && by('rainbow').locked && by('rainbow').unlockedBy === 'jungle', 'the Jungle follows the Forest, the Rainbow Skies the Jungle');
  assert(!by('candy').locked && !by('water').locked && !by('giant_forest').locked && !by('crystal').locked && !by('lava').locked, 'the sub zones are open once you are in their parent');
  assert.deepStrictEqual(['candy', 'fire', 'crystal', 'rainbow'].map(b => run(`!!Biomes.get('${b}').water`)), [true, true, true, true], 'syrup, molten and icy lakes');
});

test('zone graph: sub zones are placed round their parent from the seed, touch it, and keep clear of each other (many seeds)', () => {
  const sigs = new Set();
  for (const seed of [1, 7, 99, 4242, 31337, 424242, ...Array.from({ length: 60 }, (_, i) => 1000 + i * 977)]) {
    const r = JSON.parse(JSON.stringify(run(`(() => { const Z = new World(${seed}).terrain.layers.zones, n = Z.layout(), o = CONFIG.sim.levels.origin;
      const pairs = []; for (const a of n) for (const b of n) if (a.def.index < b.def.index) pairs.push({ a: a.def.id, b: b.def.id, related: a.parent === b || b.parent === a, gap: Math.hypot(a.x - b.x, a.y - b.y) / (a.r + b.r) });
      return { count: n.length, root: [n[0].x, n[0].y, o.x, o.y], pairs, sig: n.map(q => [Math.round(q.x), Math.round(q.y), Math.round(q.r)]).join() }; })()`)));
    assert.strictEqual(r.count, ZONES.length); same(r.root.slice(0, 2), r.root.slice(2), 'the root zone is at the village');
    for (const p of r.pairs) { if (p.related) assert(p.gap > 0.8 && p.gap < 0.97, 'a sub zone overlaps its parent a little: ' + JSON.stringify(p) + ' seed ' + seed); else assert(p.gap >= 0.97, 'zones keep clear: ' + JSON.stringify(p) + ' seed ' + seed); }
    sigs.add(r.sig);
  }
  assert(sigs.size >= 60, 'different seeds lay the zones out differently');
  assert.strictEqual(run('new World(4242).terrain.layers.zones.layout().map(q => Math.round(q.x) + "," + Math.round(q.y)).join()'), run('new World(4242).terrain.layers.zones.layout().map(q => Math.round(q.x) + "," + Math.round(q.y)).join()'), 'same seed, same layout');
});

test('zone graph: every zone has its biome, cliff walls, a gateway to its parent, and open sea round the map behind an invisible barrier', () => {
  const r = JSON.parse(JSON.stringify(run(`(() => { const w = new World(4242), T = w.terrain, Z = T.layers.zones, n = Z.layout(), o = CONFIG.sim.levels.origin, out = { biomes: [], fauna: [], gates: {}, walls: 0, wallsSolid: true };
    for (const q of n) { out.biomes.push(T.layers.biomes.at(Math.floor(q.x), Math.floor(q.y))); out.fauna.push(Z.faunaAt(q.x, q.y)); }
    const R = Math.ceil(Z.edge) + 20;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const tx = Math.floor(o.x + x), ty = Math.floor(o.y + y), k = Z.kindAt(tx, ty);
      if (k === ZONE_KIND.GATE) out.gates[Z._chunk(tx, ty).gate[((ty & 15) << 4) | (tx & 15)]] = true;
      if (k === ZONE_KIND.WALL && (x + y) % 5 === 0) { out.walls++; if (!isCliffObj(T.objAt(tx, ty)) || T.baseTile(tx, ty) !== TILE.STONE) out.wallsSolid = false; }
    }
    const farAt = Math.floor(o.x + Z.edge + 40), at = Math.floor(o.y);
    out.far = [Z.kindAt(farAt, at), Z.barrierAt(farAt, at), T.baseTile(farAt, at) === TILE.WATER];
    out.cliffLook = ['normal', 'forest', 'apple', 'mushroom', 'giant_forest', 'water', 'candy', 'jungle', 'crystal', 'fire', 'rainbow'].map(b => !!(Biomes.get(b) || {}).cliff);
    return out; })()`)));
  same(r.biomes, ZONES.map(z => z.biome), 'each zone has its biome'); same(r.fauna, ZONES.map(z => z.fauna), 'and its creature tier');
  for (const z of ZONES) assert.strictEqual(!!r.gates[z.index], !!z.parent, 'a gateway into every sub zone (and none into the root): ' + z.id);
  assert(r.walls > 800 && r.wallsSolid, 'cliff walls are solid cliffs on stone');
  assert(r.far[0] === 4 && r.far[1] === true && r.far[2] === true, 'beyond the sea is an invisible barrier over water: ' + JSON.stringify(r.far));
  assert(r.cliffLook.slice(1).every(x => x) && !r.cliffLook[0], 'every zone but the meadow has cliffs in its own colours');
});

test('zone graph: gateways switch on and off; walking from the village reaches exactly the zones whose whole chain of gateways is open', () => {
  for (const seed of [4242, 7]) {
    const r = JSON.parse(JSON.stringify(run(`(() => { const w = new World(${seed}), T = w.terrain, Z = T.layers.zones, o = CONFIG.sim.levels.origin, n = Z.layout();
      const ok = (x, y) => { const k = Z.kindAt(x, y); return (k === ZONE_KIND.LAND || k === ZONE_KIND.GATE) && !Z.barrierAt(x, y); };
      const reach = () => { const R = Math.ceil(Z.edge), seen = new Set(), key = (x, y) => (x + 2000) * 5000 + y + 2000, q = [[Math.floor(o.x), Math.floor(o.y)]]; seen.add(key(q[0][0], q[0][1]));
        for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (Math.abs(nx - o.x) > R || Math.abs(ny - o.y) > R || seen.has(key(nx, ny)) || !ok(nx, ny)) continue; seen.add(key(nx, ny)); q.push([nx, ny]); } }
        return n.map(z => seen.has(key(Math.floor(z.x), Math.floor(z.y)))); };
      const open = () => Z.unlockedList(), states = [];
      states.push(['start', reach(), open()]);
      Z.unlock(1); states.push(['forest open', reach(), open()]);
      Z.unlock(7); states.push(['jungle open', reach(), open()]);
      Z.unlock(10); states.push(['rainbow open', reach(), open()]);
      Z.lock(1); states.push(['forest shut again', reach(), open()]);
      Z.lock(2); states.push(['orchard shut', reach(), open()]);
      const ws = new GameServer(${seed}); ws.worldProgress.defeatBoss(0); const afterBoss = ws.map.layers.rings.isUnlocked(1); ws.worldProgress.setGate(1, false); const closedByHand = !ws.map.layers.rings.isUnlocked(1);
      const w2 = new GameServer(${seed}); w2.worldProgress.restore([], { 2: false, 7: true }); const restored = [w2.map.layers.rings.isUnlocked(2), w2.map.layers.rings.isUnlocked(3), w2.map.layers.rings.isUnlocked(1), w2.map.layers.rings.isUnlocked(7)];
      return { states, afterBoss, closedByHand, restored }; })()`)));
    const byId = Object.fromEntries(ZONES.map(z => [z.id, z]));
    const expected = open => ZONES.map(z => { for (let c = z; c.parent; c = byId[c.parent]) if (!open.includes(c.index)) return false; return true; });
    for (const [name, reach, open] of r.states) same(reach, expected(open), `${name} (seed ${seed}): reached ${JSON.stringify(reach)}`);
    same(r.states[0][1].map((v, i) => v ? ZONES[i].id : null).filter(Boolean), ['meadows', 'orchard', 'mushroom'], 'at the start: the meadows and their open sub zones');
    assert(r.afterBoss && r.closedByHand); same(r.restored, [false, true, false, true]);
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

test('plant lists: each zone grows exactly the trees, berries and mushrooms its list says', () => {
  const r = run(`(() => { const w = new World(4242), Z = w.terrain.layers.zones, out = {};
    for (const n of Z.layout()) {
      const trees = {}, drops = new Set(), berries = {}, mush = {}; let badVariant = 0;
      for (let dy = -48; dy <= 48; dy += 16) for (let dx = -48; dx <= 48; dx += 16) { const x = Math.floor(n.x + dx), y = Math.floor(n.y + dy); if (Z.at(x, y).index !== n.def.index || Z.kindAt(x, y) !== ZONE_KIND.LAND) continue; w.ensureAround(x, y, 1); }
      for (const c of w.chunks.values()) for (const p of c.props) {
        const tx = Math.floor(p.x), ty = Math.floor(p.y); if (Z.at(tx, ty).index !== n.def.index || Z.kindAt(tx, ty) !== ZONE_KIND.LAND) continue;
        if (p.t === 'tree') { const sp = TreeSpecies.of(p); trees[sp] = (trees[sp] || 0) + 1; if (p.forage) drops.add(p.drop); if (p.sp && (p.v % 2 === 1) !== (TreeSpecies.get(sp).look === "pine")) badVariant++; }
        else if (p.t === 'bush' && p.plant === 'mushroom') mush[p.berry] = (mush[p.berry] || 0) + 1;
        else if (p.t === 'bush' && (w.tile(tx, ty) === TILE.GRASS || w.tile(tx, ty) === TILE.DIRT)) berries[p.berry] = (berries[p.berry] || 0) + 1;
      }
      out[n.def.id] = { trees, drops: [...drops], berries, mush, badVariant };
    }
    return out; })()`);
  const keys = o => Object.keys(o).sort().join();
  assert.strictEqual(keys(r.meadows.trees), 'apple,pine', 'meadow: apples and some pine, no oak: ' + JSON.stringify(r.meadows.trees));
  assert(r.meadows.trees.apple > r.meadows.trees.pine, 'meadow: more apples than pines'); assert.strictEqual(keys(r.meadows.berries), 'raspberry'); assert.strictEqual(keys(r.meadows.mush), '');
  assert.strictEqual(keys(r.orchard.trees), 'apple,oak', 'orchard: oak and apples, no pine: ' + JSON.stringify(r.orchard.trees)); assert(r.orchard.drops.length >= 3, 'orchard: various apples: ' + r.orchard.drops);
  assert.strictEqual(keys(r.forest.trees), 'hard_pine,spruce', 'forest: hard pine and spruce: ' + JSON.stringify(r.forest.trees)); assert.strictEqual(keys(r.forest.berries), 'blackberry'); assert.strictEqual(keys(r.forest.mush), '');
  assert.strictEqual(keys(r.mushroom.trees), 'ash', 'mushroom kingdom: ash: ' + JSON.stringify(r.mushroom.trees)); assert(Object.keys(r.mushroom.mush).length >= 4, 'mushroom kingdom: various mushrooms: ' + JSON.stringify(r.mushroom.mush));
  for (const z of Object.values(r)) assert.strictEqual(z.badVariant, 0, 'pines are drawn as pines and leafy trees as leafy ones');
  for (const z of ZONES) {                                                                                                // every zone, old and new: only the trees and berries its biome's list allows
    const list = JSON.parse(JSON.stringify(run(`(() => { const f = Flora.get('${z.biome}'); return f ? { trees: f.trees.map(t => t[0]), bushes: f.bushes.map(t => t[0]), mush: !!f.mushrooms } : null; })()`)));
    assert(list, 'every zone has a plant list: ' + z.id);
    for (const sp of Object.keys(r[z.id].trees)) assert(list.trees.includes(sp), `${z.id} grows ${sp}, which its list does not allow`);
    for (const b of Object.keys(r[z.id].berries)) assert(list.bushes.includes(b), `${z.id} has ${b} bushes, which its list does not allow`);
    assert.strictEqual(Object.keys(r[z.id].mush).length > 0, list.mush && z.id === 'mushroom', 'mushrooms only where the list has them: ' + z.id);
    assert(Object.keys(r[z.id].trees).length > 0 || z.id === 'water' || z.id === 'meadows', 'trees grow in ' + z.id + ': ' + JSON.stringify(r[z.id].trees));
  }
  assert.strictEqual(keys(r.giant_forest.trees), 'great_oak,redwood', 'the Giant Forest grows only giants: ' + JSON.stringify(r.giant_forest.trees)); assert.strictEqual(keys(r.candy.trees), 'candy_pine,gumdrop');
  assert.strictEqual(keys(r.jungle.trees), 'fig,mahogany'); assert.strictEqual(keys(r.crystal.trees), 'crystal_pine,crystal_tree'); assert.strictEqual(keys(r.lava.trees), 'cinder_oak,ember_pine'); assert.strictEqual(keys(r.rainbow.trees), 'cloud_tree,rainbow_pine');
});

test('giant trees: a redwood or great oak stands bigger, blocks more ground and drops more logs than a normal tree', () => {
  const r = JSON.parse(JSON.stringify(run(`(() => { const w = new World(4242), Z = w.terrain.layers.zones, n = Z.layout()[6], big = [], small = [];
    for (let dy = -40; dy <= 40; dy += 16) for (let dx = -40; dx <= 40; dx += 16) w.ensureAround(Math.floor(n.x + dx), Math.floor(n.y + dy), 1);
    const m = Z.layout()[0]; for (let dy = -40; dy <= 40; dy += 16) for (let dx = -40; dx <= 40; dx += 16) w.ensureAround(Math.floor(m.x + 40 + dx), Math.floor(m.y + 40 + dy), 1);
    for (const c of w.chunks.values()) for (const p of c.props) if (p.t === 'tree' && p.sp) (['redwood', 'great_oak'].includes(p.sp) ? big : small).push(p.r);
    return { zone: n.def.id, big: Math.min(...big), bigN: big.length, small: Math.max(...small), logs: [TreeSpecies.get('redwood').logs, TreeSpecies.get('great_oak').logs, TreeSpecies.get('oak').logs || 1], scale: [TreeSpecies.get('redwood').scale, TreeSpecies.get('great_oak').scale] }; })()`)));
  assert.strictEqual(r.zone, 'giant_forest'); assert(r.bigN > 3, 'there are giants: ' + r.bigN); assert(r.big > r.small * 1.5, 'giants are wider: ' + r.big + ' vs ' + r.small);
  same(r.logs, [2, 2, 1]); assert(r.scale.every(x => x >= 1.8));
});

test('the Waterlands have a water park: a wave pool, a slide tower of cliff blocks, a lazy river and a kiddie pool, on dry ground, made of wadeable and deep water', () => {
  let found = 0;
  for (const seed of [4242, 7, 99, 31337, 1005, 2982, 3959, 4936]) {
    const r = JSON.parse(JSON.stringify(run(`(() => { const w = new World(${seed}), T = w.terrain, Z = T.layers.zones, parks = T.caveSites.list().filter(p => p.id === 'water_park');
      if (parks.length !== 1) return { n: parks.length };
      const p = parks[0], tiles = {}, objs = new Set(); let inZone = true;
      for (let y = p.y0; y < p.y0 + p.h; y++) for (let x = p.x0; x < p.x0 + p.w; x++) { const t = T.tile(x, y); tiles[t] = (tiles[t] || 0) + 1; const o = T.objAt(x, y); if (o) objs.add(o); if (Z.at(x, y).index !== 5) inZone = false; }
      w.ensureAround(p.x0 + 5, p.y0 + 5, 2);
      let shallowOpen = false, deepSolid = false, towerSolid = false;
      for (let y = p.y0; y < p.y0 + p.h; y++) for (let x = p.x0; x < p.x0 + p.w; x++) { const t = T.tile(x, y); if (t === TILE.SHALLOW && !w.isSolid(x, y)) shallowOpen = true; if (t === TILE.WATER && w.isSolid(x, y)) deepSolid = true; if (isCliffObj(T.objAt(x, y)) && w.isSolid(x, y)) towerSolid = true; }
      return { n: 1, inZone, shallow: tiles[TILE.SHALLOW] || 0, deep: tiles[TILE.WATER] || 0, sand: tiles[TILE.SAND] || 0, cliffs: objs.size, shallowOpen, deepSolid, towerSolid }; })()`)));
    if (r.n === 0) continue;
    found++;
    assert(r.inZone && r.shallow > 100 && r.deep > 40 && r.sand > 100 && r.cliffs >= 2 && r.shallowOpen && r.deepSolid && r.towerSolid, 'seed ' + seed + ': ' + JSON.stringify(r));
  }
  assert(found >= 7, 'a water park in nearly every world: ' + found + ' of 8');
});

test('dev tools: teleport to any zone, and switch a gateway from the host', () => {
  const r = JSON.parse(JSON.stringify(run(`(() => { const s = new GameServer(4242), id = s.addPlayer(), p = s.players[id], Z = s.map.layers.zones, out = [];
    for (const z of Zones.all()) { s.receiveCommand(id, { type: 'debugTeleport', to: 'zone:' + z.id }); out.push([z.id, Z.at(p.x, p.y).index === z.index, Z.kindAt(Math.floor(p.x), Math.floor(p.y)) === 0]); }
    s.receiveCommand(id, { type: 'debugTeleport', to: 'zone:nowhere' });
    const before = Z.isUnlocked(7); s.receiveCommand(id, { type: 'debugGate', zone: 7, open: true }); const opened = Z.isUnlocked(7); s.receiveCommand(id, { type: 'debugGate', zone: 7, open: false }); const shut = !Z.isUnlocked(7);
    s.hostId = 'someone else'; s.receiveCommand(id, { type: 'debugGate', zone: 7, open: true }); const refused = !Z.isUnlocked(7);
    return { out, before, opened, shut, refused }; })()`)));
  assert(r.out.every(([, inZone, land]) => inZone && land), 'each teleport lands in its zone on open ground: ' + JSON.stringify(r.out.filter(x => !x[1] || !x[2])));
  assert(!r.before && r.opened && r.shut && r.refused, 'the gateway switch works for the host only');
});


test('plant spreading: trees seed their own kind beside them, in season, in their own biome, never on walls or gateways, and within the daily cap', () => {
  const r = run(`(() => { const s = new GameServer(4242), id = s.addPlayer(), p = s.players[id], Z = s.map.layers.zones, T = s.map.terrain, found = [], dayIn = i => { for (let d = 0; d < 400; d++) if (Seasons.indexOfDay(d + 1) === i) return d; };
    const result = { zones: {}, perDayMax: 0, bad: [], grown: 0 };
    for (const n of Z.layout()) {
      p.x = n.x; p.y = n.y; s.map.ensureAround(n.x, n.y, 4);
      const before = Object.keys(s._farm()).length, species = {};
      for (let day = 0; day < 40; day++) { const d = dayIn(day % 4); const got = s._spreadFlora(d); result.perDayMax = Math.max(result.perDayMax, got); }
      for (const [key, e] of Object.entries(s._farm())) { if (!Groves.isKey(key) || e.g) continue; const [tx, ty] = Groves.tileOf(key);
        if (Z.at(tx, ty).index !== n.def.index) continue;
        species[e.t] = (species[e.t] || 0) + 1;
        if (!Flora.allows(T.layers.biomes.at(tx, ty), e.t)) result.bad.push('wrong biome ' + e.t + '@' + tx + ',' + ty);
        if (Z.kindAt(tx, ty) !== ZONE_KIND.LAND || Z.wallDistance(tx, ty) < 2) result.bad.push('on a wall or gate ' + tx + ',' + ty);
        let near = false; for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { const q = s.map.peekPropAt(tx + x, ty + y); if (q && q.t === 'tree' && TreeSpecies.of(q) === e.t) near = true; }
        if (!near) result.bad.push('no parent ' + e.t + '@' + tx + ',' + ty);
      }
      result.zones[n.def.id] = species;
      for (const key of Object.keys(s._farm())) if (Groves.isKey(key)) delete s._farm()[key];                  // (a clean farm for the next zone, so the daily cap is not spent already)
    }
    p.x = Z.layout()[0].x; p.y = Z.layout()[0].y; s.map.ensureAround(p.x, p.y, 4); for (let day = 0; day < 40; day++) s._spreadFlora(dayIn(day % 4));
    const waiting = Object.entries(s._farm()).filter(([k, e]) => Groves.isKey(k) && !e.g);
    result.waiting = waiting.length;
    for (const [k, e] of waiting) for (let i = 0; i < 20 && !e.g; i++) s._growGrove(k, e);           // let them all grow up
    for (const [k, e] of waiting) { const [tx, ty] = Groves.tileOf(k), q = s.map.peekPropAt(tx, ty); if (e.g && q && q.t === 'tree' && q.sp === e.t) result.grown++; }
    result.grownOf = waiting.filter(([k, e]) => e.g && s.map.peekChunkOfTile(...Groves.tileOf(k))).length;
    return result; })()`);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.bad)), [], 'every sprout is right: ' + r.bad.slice(0, 4));
  assert(r.perDayMax <= 12 && r.waiting <= 300, 'daily cap: ' + r.perDayMax + ' / waiting ' + r.waiting);
  const sp = id => Object.keys(r.zones[id]).sort().join();
  assert(r.zones.meadows.apple > 0 && r.zones.orchard.oak > 0 && (r.zones.forest.spruce > 0 || r.zones.forest.hard_pine > 0) && r.zones.mushroom.ash > 0, 'trees sprout in every zone: ' + JSON.stringify(r.zones));
  assert(!/oak/.test(sp('meadows')) && !/pine/.test(sp('orchard')) && !/apple|oak|\bpine\b/.test(sp('forest')) && sp('mushroom') === 'ash', 'only the zone\'s own kinds: ' + JSON.stringify(r.zones));
  assert(r.grownOf > 0 && r.grown === r.grownOf, 'a grown sapling stands as a tree of its kind: ' + r.grown + ' of ' + r.grownOf);
});

test('open ground: trees stay sparse enough to walk through, and wild ponies are plentiful (a zone holds many pony regions, not one)', () => {
  const r = run(`(() => { const w = new World(4242), T = w.terrain, Z = T.layers.zones, out = { trees: {}, regions: 0, sameCell: false, farCell: false };
    for (const n of Z.layout()) { let g = 0, t = 0; for (let y = -n.r; y <= n.r; y += 2) for (let x = -n.r; x <= n.r; x += 2) { const tx = Math.floor(n.x + x), ty = Math.floor(n.y + y); if (Z.at(tx, ty).index !== n.def.index || Z.kindAt(tx, ty) !== 0 || T.tile(tx, ty) !== TILE.GRASS) continue; g++; if (T.hasTree(tx, ty, TILE.GRASS)) t++; } out.trees[n.def.id] = t / g; }
    const B = T.layers.biomes, m = Z.layout()[0], x = Math.floor(m.x), y = Math.floor(m.y), cell = CONFIG.world.ponyCell;
    out.sameCell = B.regionKey(x, y) === B.regionKey(x + 1, y + 1) || B.regionKey(x, y) === B.regionKey(x - 1, y - 1); out.farCell = B.regionKey(x, y) !== B.regionKey(x + 2 * cell, y);
    const keys = new Set(); for (let dy = -50; dy <= 50; dy += 5) for (let dx = -50; dx <= 50; dx += 5) keys.add(B.regionKey(x + dx, y + dy)); out.regions = keys.size;
    const s = new GameServer(4242), id = s.addPlayer(), p = s.players[id]; p.x = m.x + 20; p.y = m.y; s.map.ensureAround(p.x, p.y, 4);
    for (let tick = 0, mornings = 0, last = -1; tick < 60 * 60 * 100 && mornings < 4; tick += 60) { const mo = s.wildPonies.morningAt(tick); if (mo !== last) { last = mo; mornings++; } for (let k = 0; k < 4; k++) s.wildPonies.update(tick); }
    out.ponies = Object.values(s.animals.animals).filter(a => s.wildPonies.isWild(a) && Math.hypot(a.x - p.x, a.y - p.y) < 40).length; return out; })()`);
  assert(r.trees.meadows <= 0.05 && r.trees.orchard <= 0.08 && r.trees.mushroom <= 0.09 && r.trees.forest <= 0.15, 'tree share of grass: ' + JSON.stringify(r.trees));
  assert(r.trees.forest > r.trees.meadows, 'the forest is still the woodiest');
  assert(r.farCell && r.regions >= 4, 'a zone is cut into several pony regions: ' + r.regions);
  assert(r.ponies >= 12, 'wild ponies within 40 tiles after a few mornings: ' + r.ponies);
});

console.log(process.exitCode ? 'FAILED' : `all ${passed} checks passed`);
