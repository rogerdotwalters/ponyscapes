'use strict';
/* TOOLS - checks the dungeon system end to end in Node (no browser):  node tools/test-dungeon.js
 * enemy numbers, room PNGs <-> lists, the cliff / cave stamps over many seeds, and a GameServer walking a player through every room. */
const assert = require('assert'), fs = require('fs'), path = require('path');
const { run } = require('./headless')();
const png = require('./pngGrey'), { CaveRoom, RoomCode } = require('../public/js/shared/roomCodes');
let passed = 0;
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
    assert.strictEqual(run(`T.caveSites.objAt(${Math.floor(cave.x)}, ${Math.floor(cave.y)})`), 0);
    // from the yard in front of the mouth you can walk to open land 20 tiles away, through chunks the way the game builds them
    const reach = run(`(() => { const w = new World(${seed}), mx = ${Math.floor(cave.x)}, my = ${Math.floor(cave.y)};
      const seen = new Set([mx + ',' + my + 1]), q = [[mx, my + 2]], key = (x, y) => x + ',' + y; seen.add(key(mx, my + 2));
      for (let i = 0; i < q.length && q.length < 4000; i++) { const [x, y] = q[i]; if (Math.hypot(x - mx, y - my) > 20) return true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!seen.has(key(nx, ny)) && !w.navBlocked(nx, ny)) { seen.add(key(nx, ny)); q.push([nx, ny]); } } }
      return false; })()`);
    assert(reach, 'seed ' + seed + ': the yard in front of the cave is boxed in');
    const w = run(`(() => { const w = new World(${seed}); w.ensureAround(${cave.x}, ${cave.y}, 2);
      const prop = w.propAt(${Math.floor(cave.x)}, ${Math.floor(cave.y)});
      let cliffs = 0, solid = 0; for (const p of T.caveSites.list()) for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const o = T.caveSites.objAt(p.x0 + x, p.y0 + y); if (o) { cliffs++; if (w.isSolid(p.x0 + x, p.y0 + y)) solid++; } }
      return { prop: prop && { t: prop.t, dungeon: prop.dungeon }, cliffs, solid }; })()`);
    assert.strictEqual(JSON.stringify(w.prop), JSON.stringify({ t: 'cave', dungeon: 'cavern' }));
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
    log.push(['back outside', p.grid === '' && Math.hypot(p.x - mouth.x, p.y - (mouth.y + 1.6)) < 0.5]);
    return { log, counts };
  })()`);
  const kinds = out.log.map(l => l.join('=')).join(' | ');
  assert(kinds.includes('mouth=enter_dungeon') && kinds.includes('room0=dungeon:0:0'), kinds);
  assert(out.log.filter(l => l[0] === 'chestOffer').every(l => l[1] === 'dungeon_chest'), kinds);
  assert(out.log.filter(l => l[0] === 'chestGave').every(l => l[1] === true), kinds);
  assert(out.log.filter(l => l[0] === 'chestAgain').every(l => l[1] === true), kinds);
  assert(out.log.filter(l => l[0] === 'exitOffer').every(l => l[1] === 'dungeon_next'), kinds);
  assert.strictEqual(JSON.stringify(out.log.filter(l => l[0] === 'moved').map(l => l[1])), JSON.stringify(['dungeon:0:1', 'dungeon:0:2', '']), kinds);
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
      if (floor && o) bad++; if (!floor && !P.solidAt(x, y)) bad++;
      if (o) { blocks++; if (o === OBJ.CAVEROCK_LOW) low++; else if (o === OBJ.CAVEROCK_TALL) tall++; else bad++; if (R.walkable(x, y - 1) && o !== OBJ.CAVEROCK_LOW) bad++; }
      if (!floor && !o) deep++; }
    return { blocks, bad, low, tall, deep }; })()`);
  assert.strictEqual(r.bad, 0); assert(r.low > 20 && r.tall > 20 && r.deep > 100, JSON.stringify(r));
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

console.log(process.exitCode ? 'FAILED' : `all ${passed} checks passed`);
