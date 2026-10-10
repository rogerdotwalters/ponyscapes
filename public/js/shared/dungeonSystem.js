'use strict';
/* SHARED - the dungeons. The cave mouth in the cliffs takes you (and your mount, and any pet on a rope) through the dungeon's rooms. A dungeon with a `lair` ends in
 * its zone's guardian lair, the LAST layer: its own GRID ('cave:<zone>'), where the guardian waits in the arena, always the TOP level of its area; defeating it
 * opens the zones it guards for everyone. Also: the hint when you touch a shut gateway. */

/** Pure (client + server): is there a cave mouth to enter, or a way out, within reach? */
function findCaveInteraction(map, p) {
  if (map.kind === 'dungeon') return findDungeonInteraction(map, p);
  if (map.kind === 'cave') {                                                                // inside a cave: the way out
    const exit = map.exitPoint(), d = Math.hypot(p.x - exit.x, p.y - exit.y);
    return d <= 2.4 ? { kind: 'leave_cave', label: 'Back up the cave', dist: d, ring: map.plan.ring } : null;
  }
  if (map.grid) return null;                                                                // (no caves inside rooms)
  const mouths = map.terrain.caveSites ? map.terrain.caveSites.caves() : [];                // the room dungeons' mouths, in their cliffs
  for (const c of mouths) { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d <= CAVE_REACH) return { kind: 'enter_dungeon', label: 'Enter cave', dist: d, dungeon: c.index }; }
  return null;
}
const CAVE_REACH = 2.3, DUNGEON_REACH = 1.3, CHEST_REACH = 1.2;

/** Inside a room dungeon: the nearest of the way back (entrance patch), the way on (exit patch) and an unopened chest. */
function findDungeonInteraction(map, p) {
  const plan = map.plan, away = box => Math.hypot(p.x - clamp(p.x, box[0], box[2]), p.y - clamp(p.y, box[1], box[3]));
  let best = null;
  const offer = (action) => { if (action.dist <= action.reach && (!best || action.dist < best.dist)) best = action; };
  for (const box of plan.patch('entrance')) offer({ kind: 'dungeon_back', label: plan.first ? 'Leave cave' : 'Back to the last room', dist: away(box), reach: DUNGEON_REACH });
  for (const box of plan.patch('exit')) offer({ kind: 'dungeon_next', label: plan.dungeon.lair ? 'Down to the lair' : plan.last ? 'Leave cave' : 'On to the next room', dist: away(box), reach: DUNGEON_REACH });
  for (const c of plan.room.chests) {
    const prop = map.peekPropAt(c.x, c.y);
    if (prop && prop.t === 'dungeon_chest' && !prop.opened) offer({ kind: 'dungeon_chest', label: 'Open chest', dist: Math.max(0, Math.hypot(p.x - prop.x, p.y - prop.y) - prop.r), reach: CHEST_REACH, tx: c.x, ty: c.y });
  }
  return best;
}
/** The trapdoor in the castle's cellar (a furniture piece, data/furniture/castle.js): the way down into the dungeon whose `entrance` is 'castle'. */
function findCryptInteraction(map, p) {
  if (map.kind !== 'room' || !map.plan || map.plan.key !== 'cellar' || !map.plan.site || map.plan.site.id !== 'castle') return null;
  const f = map.plan.layout.furniture.find(g => g.id === 'trapdoor');
  if (!f) return null;
  const def = FurnitureDefs.get('trapdoor'), w = f.rot % 2 ? def.size[1] : def.size[0], h = f.rot % 2 ? def.size[0] : def.size[1];
  const dist = Math.hypot(p.x - clamp(p.x, f.x, f.x + w), p.y - clamp(p.y, f.y, f.y + h));
  return dist <= 1.0 ? { kind: 'enter_crypt', label: 'Down the trapdoor', dist } : null;
}
Interactions.extra.push(findCryptInteraction);
InteractionHandlers.enter_crypt = (server, id, p) => server.dungeons.enterCrypt(id, p);
Interactions.extra.push(findCaveInteraction);                                                // the interact key now knows about caves
InteractionHandlers.leave_cave = (server, id, p) => server.dungeons.leave(id, p);
InteractionHandlers.enter_dungeon = (server, id, p, action) => server.dungeons.enterDungeon(id, p, action.dungeon);
InteractionHandlers.dungeon_back = (server, id, p) => server.dungeons.stepRoom(id, p, -1);
InteractionHandlers.dungeon_next = (server, id, p) => server.dungeons.stepRoom(id, p, 1);
InteractionHandlers.dungeon_chest = (server, id, p, action) => server.dungeons.openChest(id, p, action.tx, action.ty);

class DungeonSystem {
  constructor(server) { this.server = server; this.bosses = {}; this.hintAt = {}; this.portalAt = {}; this.populated = new Set();
    this.waves = {}; this.cleared = new Set(); this.kingDown = new Set(); }          // the Slime Warren: wave state per room grid, rooms whose slimes are all beaten, kings that have fallen (this session)

  /** A short pause after every crossing, so a held key (or a double tap) cannot bounce you straight back through. */
  _cooling(id) { if ((this.portalAt[id] || -999) > this.server.tick - 20) return true; this.portalAt[id] = this.server.tick; return false; }

  /** Down into the guardian's lair, the last layer of the dungeon: from the last room's exit. */
  enterLair(id, p, ring) {
    const s = this.server, rings = s.map.layers.rings;
    if (!rings.isUnlocked(ring)) return;                                                    // (stepRoom has already paused the crossing)
    const entry = DungeonSpace.entry(), def = Fauna.bossOf(ring);
    s._moveToGrid(id, p, Grids.cave(ring), entry.x, entry.y);
    this.ensureBoss(ring);
    const down = s.worldProgress.isDefeated(ring);
    const q = def.wants && def.wants.quest, young = q && AnimalDefs[q.creature];
    s._notice(id, s.wants.appeased[ring] ? `The ${def.name} rests peacefully with her cubs` : down ? 'The lair is quiet: its guardian has been defeated'
      : `You enter the lair of the ${def.name}, a level ${AnimalLevels.roll(def.id, 0, 0, 0.5, null)} guardian.` + (q ? ` Fight her, or bring back her ${q.count} lost ${young ? young.name.toLowerCase() + 's' : 'young'} from ${rings.def(ring).name} (they come to you for fish). Carrying one, she will not attack you.` : ''));
    s.pendingEvents.push({ type: 'enteredCave', to: id, ring });
  }

  /* ---- room dungeons (js/data/dungeons/, rooms from PNGs: js/shared/roomCodes.js) ---- */

  /** The trapdoor in the castle's cellar -> the first room of the dungeon whose `entrance` is 'castle'. */
  enterCrypt(id, p) {
    const s = this.server, d = Dungeons.all().findIndex(def => def.entrance === 'castle'), def = Dungeons.all()[d];
    if (!def) return;
    const world = s.grids.get(Grids.dungeon(d, 0));
    if (world.kind !== 'dungeon') { s._notice(id, 'The way down is blocked by fallen stones'); return; }
    if (this._cooling(id)) return;
    p.returnTo = { grid: gridOf(p), x: p.x, y: p.y };
    const at = world.plan.entryPoint();
    s._moveToGrid(id, p, world.grid, at.x, at.y);
    this.populate(world); this.announce(id, world);
    s._notice(id, `You climb down into ${def.name}`);
    s.pendingEvents.push({ type: 'enteredCave', to: id, ring: def.ring });
  }

  /** The mouth of dungeon `d` in the overworld -> its first room. */
  enterDungeon(id, p, d) {
    const s = this.server, def = Dungeons.all()[d], mouth = s.map.terrain.caveSites.caves().find(c => c.index === d);
    if (!def || !mouth) return;
    const world = s.grids.get(Grids.dungeon(d, 0));
    if (world.kind !== 'dungeon') { s._notice(id, 'The way in is blocked by fallen rock'); return; }               // (its first room is missing from js/content/caveRooms.js)
    if (def.requires && !s.worldProgress.isDefeated(def.requires.defeated)) { if (!this._cooling(id)) s._notice(id, def.requires.text); return; }     // rubble, until the guardian is down
    if (this._cooling(id)) return;
    p.returnTo = { x: mouth.x, y: mouth.y + 1.6 };
    const at = world.plan.entryPoint();
    s._moveToGrid(id, p, world.grid, at.x, at.y);
    this.populate(world); this.announce(id, world);
    s._notice(id, `You enter ${def.name}`);
    s.pendingEvents.push({ type: 'enteredCave', to: id, ring: def.ring });
  }

  /** Walk through the entrance (-1: back a room) or the exit (+1: on a room) of the room you stand in. Past either end you are back outside. */
  stepRoom(id, p, dir) {
    const s = this.server, g = Grids.parse(gridOf(p)), def = g && g.kind === 'dungeon' && Dungeons.all()[g.dungeon];
    if (!def || this._cooling(id)) return;
    const next = g.room + dir;
    if (dir > 0 && def.waves && def.waves[g.room] && !this.cleared.has(gridOf(p))) { s._notice(id, `The way on is sealed. Defeat the slimes first (${this.left(gridOf(p))} left)`); return; }
    if (next >= def.rooms.length && def.lair !== undefined && dir > 0) { this.enterLair(id, p, def.ring); return; }          // past the last room: the guardian's lair
    if (next < 0 || next >= def.rooms.length) { this.leaveDungeon(id, p, g.dungeon); return; }
    const world = s.grids.get(Grids.dungeon(g.dungeon, next));
    if (world.kind !== 'dungeon') { s._notice(id, 'The way is blocked by fallen rock'); return; }
    const at = dir > 0 ? world.plan.entryPoint() : world.plan.arrivalFromNext();
    s._moveToGrid(id, p, world.grid, at.x, at.y);
    this.populate(world); this.announce(id, world);
    s._notice(id, `${def.name}: room ${next + 1} of ${def.rooms.length}${def.lair !== undefined ? ' (and the lair)' : ''}`);
  }

  /** Testing aid (the host, Dev settings): 'village', 'cave' (the first dungeon's mouth) or 'room:<n>' (inside its room n, as if you had walked in); 'warren' and 'warren:<n>' are the
   *  same for the Slime Warren (the second dungeon), whether or not the rubble has been cleared. */
  debugTeleport(id, p, to) {
    const s = this.server, caves = s.map.terrain.caveSites.caves(), mouth = caves[0], room = /^room:(\d{1,2})$/.exec(to), warren = /^warren(?::(\d{1,2}))?$/.exec(to), crypt = /^crypt(?::(\d{1,2}))?$/.exec(to);
    if (p.flying) { p.flying = false; p.flyT = 0; }
    if (to === 'village') { const at = Village.spawns[0]; s._moveToGrid(id, p, '', at.x, at.y); p.returnTo = null; }
    else if (to === 'cave' && mouth) { s._moveToGrid(id, p, '', mouth.x, mouth.y + 1.6); p.returnTo = null; }
    else if (crypt) {                                                                                         // the Slime Cellars, as if you had come down the castle's trapdoor
      const d = Dungeons.all().findIndex(def => def.entrance === 'castle'), world = d >= 0 && s.grids.get(Grids.dungeon(d, Number(crypt[1] || 0)));
      if (!world || world.kind !== 'dungeon') { s._notice(id, 'No such room'); return; }
      const site = BuildingSites.list.find(b => b.id === 'castle'), at = world.plan.entryPoint();
      p.returnTo = { grid: site ? Grids.room(site.index, Math.max(0, Grids.roomKeys(site).indexOf('cellar'))) : '', x: 6.5, y: 4.8 };
      s._moveToGrid(id, p, world.grid, at.x, at.y); this.populate(world); this.announce(id, world);
    }
    else if ((room || warren) && caves.length) {
      const d = warren ? 1 : 0, door = caves.find(c => c.index === d), n = Number(warren ? (warren[1] || 0) : room[1]);
      if (!door) { s._notice(id, 'No such cave'); return; }
      const world = s.grids.get(Grids.dungeon(d, n));
      if (world.kind !== 'dungeon') { s._notice(id, 'No such room'); return; }
      p.returnTo = { x: door.x, y: door.y + 1.6 };
      const at = world.plan.entryPoint();
      s._moveToGrid(id, p, world.grid, at.x, at.y); this.populate(world); this.announce(id, world);
    } else return;
    s._notice(id, 'Teleported');
  }

  /** Out of the dungeon, back to the cave mouth. */
  leaveDungeon(id, p, d) {
    const s = this.server, mouth = s.map.terrain.caveSites.caves().find(c => c.index === d), back = p.returnTo || (mouth ? { x: mouth.x, y: mouth.y + 1.6 } : { x: 20.5, y: 26.5 });
    s._moveToGrid(id, p, back.grid || '', back.x, back.y);                                   // (a cave mouth in the hills, or the castle cellar's trapdoor: `grid`)
    p.returnTo = null;
    s.pendingEvents.push({ type: 'leftCave', to: id });
  }

  /** What a plain spawn node (4) of this dungeon can be: [{ id, weight }] from the dungeon's own list (ids, or [id, weight]), else the ring's hostile creatures. */
  enemyPool(def) {
    const listed = (def.enemies || []).map(e => (Array.isArray(e) ? { id: e[0], weight: +e[1] || 1 } : { id: e, weight: 1 })).filter(e => AnimalDefs[e.id] && !AnimalDefs[e.id].pony);
    return listed.length ? listed : Object.values(AnimalDefs).filter(d => d.hostile && !d.boss && !d.pony && d.ring === def.ring).map(d => ({ id: d.id, weight: 1 }));
  }
  /** One of the pool, by weight and a roll in [0, 1). */
  pick(pool, roll) { let r = roll * pool.reduce((n, e) => n + e.weight, 0); for (const e of pool) if ((r -= e.weight) < 0) return e.id; return pool[pool.length - 1].id; }

  /** The first time anyone enters a room, its enemies appear: a random one at every spawn node (4), exactly the named creature at every 1000+ code. */
  populate(world) {
    const s = this.server, plan = world.plan, grid = world.grid;
    if (this.populated.has(grid)) return;
    this.populated.add(grid);
    const def = plan.dungeon;
    if (def.waves && def.waves[plan.index]) { this.waves[grid] = Object.assign({ spawned: 0, timer: 2 }, def.waves[plan.index]); return; }       // the Warren: slimes come in waves (tick), not from nodes
    if (def.king && def.king.room === plan.index) { this.ensureKing(world); return; }
    const pool = this.enemyPool(plan.dungeon), seed = s.map.terrain.seed;
    const put = (type, x, y) => {
      const aid = s.animals.spawn(type, x + 0.5, y + 0.5, 0, { level: AnimalLevels.roll(type, x, y, hash3(seed, x, y, 31), null), grid });
      s.animals.animals[aid].home = { x: x + 0.5, y: y + 0.5 };
    };
    if (pool.length) for (const n of plan.room.spawns) put(this.pick(pool, hash3(seed, n.x, n.y, 30)), n.x, n.y);
    for (const e of plan.room.enemies) {
      const type = EnemyCodes.idOf(e.code) || (pool.length ? this.pick(pool, hash3(seed, e.x, e.y, 30)) : null);     // (a number no creature has: a plain node)
      if (type) put(type, e.x, e.y);
    }
  }

  /* ---- the Slime Warren: waves of slimes in every room, and the Slime King in the last ---- */

  /** Slimes still to beat in a room: the ones not yet spawned and the ones alive. */
  left(grid) {
    const w = this.waves[grid];
    return w ? Math.max(0, w.total - w.spawned) + Object.values(this.server.animals.animals).filter(a => a.wave && a.grid === grid).length : 0;
  }

  /** Tell a player who just arrived what this room is: how many slimes to beat (and, to their screen, whether the way on is already open). */
  announce(id, world) {
    const s = this.server, grid = world.grid, w = this.waves[grid], cleared = this.cleared.has(grid);
    if (!w && !(world.plan.dungeon.king && world.plan.dungeon.king.room === world.plan.index)) return;
    s.pendingEvents.push({ type: 'roomState', to: id, grid, cleared, left: this.left(grid) });
    if (w && !cleared) s._notice(id, `Slimes will keep coming. Defeat all ${w.total} to open the way on`);
    if (!w) s._notice(id, this.kingDown.has(grid) ? 'The way is quiet' : `The ${AnimalDefs[world.plan.dungeon.king.type || 'slime_king'].name} watches you from the middle of the arena`);
  }

  /** The Slime King is placed in the middle of his arena (once, until he dies). */
  ensureKing(world) {
    const s = this.server, grid = world.grid, plan = world.plan, def = plan.dungeon;
    const type = def.king.type || 'slime_king';
    if (this.kingDown.has(grid) || Object.values(s.animals.animals).some(a => a.type === type && a.grid === grid)) return;
    const R = plan.room, cx = Math.floor(R.w / 2), cy = Math.floor(R.h / 2);
    const id = s.animals.spawn(type, cx + 0.5, cy + 0.5, 0, { level: def.king.level, grid });
    s.animals.animals[id].home = { x: cx + 0.5, y: cy + 0.5 };
  }

  /** Once a tick: every room with someone in it that is not yet clear brings in slimes, up to its limits. */
  update() {
    const s = this.server;
    for (const grid in this.waves) {
      const w = this.waves[grid];
      if (this.cleared.has(grid)) continue;
      const here = Object.values(s.players).filter(p => gridOf(p) === grid && s.inputQueues[p.id]);
      if (!here.length) continue;
      const alive = Object.values(s.animals.animals).filter(a => a.wave && a.grid === grid).length;
      if (w.spawned >= w.total) { if (!alive) this.clear(grid, here); continue; }
      w.timer -= TICK_DT;
      if (w.timer > 0 || alive >= w.max) continue;
      if (this.spawnSlime(grid, w, here)) { w.timer = w.rate; w.spawned++; }
    }
  }

  /** One slime at a random open floor tile, as far from everyone as it can be (at least 7 tiles away if the room allows it). */
  spawnSlime(grid, w, here) {
    const s = this.server, world = s.grids.get(grid), plan = world.plan, R = plan.room;
    let best = null;
    for (let t = 0; t < 40; t++) {
      const x = 1 + Math.floor(s.rng() * (R.w - 2)), y = 1 + Math.floor(s.rng() * (R.h - 2));
      if (R.code(x, y) !== RoomCode.FLOOR || plan.isPool(x, y)) continue;
      const far = Math.min(...here.map(p => Math.hypot(p.x - x - 0.5, p.y - y - 0.5)));
      if (!best || far > best.far) best = { x, y, far };
      if (far >= 7) break;
    }
    if (!best) return false;
    const id = s.animals.spawn('slime', best.x + 0.5, best.y + 0.5, 0, { level: w.level, grid }), a = s.animals.animals[id];
    a.home = { x: best.x + 0.5, y: best.y + 0.5 }; a.wave = true;
    s.pendingEvents.push({ type: 'slimePuff', x: a.x, y: a.y, grid });
    return true;
  }

  /** Every slime of a room is beaten: the way on opens. */
  clear(grid, here) {
    const s = this.server, plan = s.grids.get(grid).plan;
    this.cleared.add(grid);
    const exit = plan._middle(plan.room.exits);
    s.pendingEvents.push({ type: 'roomCleared', grid, tx: exit.x, ty: exit.y });
    for (const p of here) s._notice(p.id, plan.last ? 'The room is clear' : 'The way on has opened!');
  }

  /** What a chest holds: the dungeon's `loot` table, rolled from the chest's place (every player who opens a fresh chest would see the same pile, but a chest opens once). */
  rollLoot(def, tx, ty) {
    const table = LootTables.chestOf(def), seed = this.server.map.terrain.seed, out = [];
    table.forEach((e, i) => {
      if (!ItemDefs[e.item] || hash3(seed, tx, ty, 40 + i) >= (e.chance === undefined ? 1 : e.chance)) return;
      out.push({ item: e.item, count: (e.min || 1) + Math.floor(hash3(seed, tx, ty, 60 + i) * ((e.max || e.min || 1) - (e.min || 1) + 1)) });
    });
    return out;
  }

  openChest(id, p, tx, ty) {
    const s = this.server, g = Grids.parse(gridOf(p)), map = s.mapOf(p), prop = g && g.kind === 'dungeon' ? map.peekPropAt(tx, ty) : null;
    if (!prop || prop.t !== 'dungeon_chest') return;
    const key = DungeonState.key(gridOf(p), tx, ty);
    if (prop.opened || DungeonState.opened.has(key)) { s._notice(id, 'This chest is empty'); return; }
    const loot = this.rollLoot(map.plan.dungeon, tx, ty), inventory = s.inventories[id], trial = inventory.clone();
    if (!loot.every(l => trial.add(l.item, l.count) === 0)) { s._notice(id, 'Make room in your pack first'); return; }
    for (const l of loot) { inventory.add(l.item, l.count); s.pendingEvents.push({ type: 'gain', to: id, item: l.item, count: l.count }); }
    DungeonState.opened.add(key); prop.opened = true; s.inventoryRev[id]++;
    s.pendingEvents.push({ type: 'dungeonChest', tx, ty });                                  // (everyone in the room sees it open)
  }

  /** Up out of the lair: back into the last room of the dungeon it ends (or, for a lair no dungeon owns, outside). */
  leave(id, p) {
    if (this._cooling(id)) return;
    const s = this.server, g = Grids.parse(gridOf(p)), ring = g && g.kind === 'cave' ? g.ring : 0;
    const d = Dungeons.all().findIndex(def => def.lair !== undefined && def.ring === ring), def = Dungeons.all()[d];
    if (def) {
      const world = s.grids.get(Grids.dungeon(d, def.rooms.length - 1));
      if (world.kind === 'dungeon') { const at = world.plan.arrivalFromNext(); s._moveToGrid(id, p, world.grid, at.x, at.y); this.populate(world); this.announce(id, world); return; }
    }
    const site = s.map.layers.dungeons.site(ring), back = p.returnTo || { x: site.x, y: site.y + 1.6 };
    s._moveToGrid(id, p, '', back.x, back.y);
    p.returnTo = null;
    s.pendingEvents.push({ type: 'leftCave', to: id });
  }

  /** The guardian is placed in the arena (once, until it dies). */
  ensureBoss(ring) {
    const s = this.server, calm = s.wants.appeased[ring];
    if (s.worldProgress.isDefeated(ring) && !calm) return;                       // (an appeased guardian stays, peacefully, with its young)
    const current = s.animals.animals[this.bosses[ring]];
    if (current) return;
    const def = Fauna.bossOf(ring), arena = DungeonSpace.arena();
    const id = s.animals.spawn(def.id, arena.x, arena.y, 0, { level: AnimalLevels.roll(def.id, arena.x, arena.y, 0.5, null), grid: Grids.cave(ring) });
    s.animals.animals[id].home = { x: arena.x, y: arena.y };
    this.bosses[ring] = id;
    if (calm) s.wants.restoreCalmBoss(ring, s.animals.animals[id]); else s.wants.refresh(s.animals.animals[id]);
  }

  /** AnimalSystem tells us whenever something dies. */
  onKilled(animal, def) {
    if (def.king) { this.kingFell(animal, def); return; }
    if (!def.boss) return;
    delete this.bosses[def.bossRing];
    this.conquer(def.bossRing, def.name, false);
  }

  /** The Slime King falls: his arena is quiet, and everybody in it is told. */
  kingFell(animal, def) {
    const s = this.server, grid = gridOf(animal);
    this.kingDown.add(grid);
    s.pendingEvents.push({ type: 'kingDefeated', grid, x: animal.x, y: animal.y });
    for (const p of Object.values(s.players)) if (gridOf(p) === grid) s._notice(p.id, `The ${def.name} is defeated! The slimes here are quiet at last`);
  }

  /** A ring's guardian is beaten (or appeased: wantSystem.js): the next ring opens for everyone. */
  conquer(ring, name, appeased) {
    const s = this.server;
    if (!s.worldProgress.defeatBoss(ring)) return;
    if (ring === 0) { s.settings.bearDefeated = true; s.settingsRev++; }                  // (the Act 1 checkbox in Settings follows)
    const opened = s.worldProgress.opens(ring).map(z => z.name);
    s.pendingEvents.push({ type: 'bossDefeated', ring, name, appeased: !!appeased, nextRing: opened.join(' and '), final: !opened.length });
    for (const pid in s.treasureMaps) {                                                      // everybody's scroll to this cave is used up
      const before = s.treasureMaps[pid].length;
      s.treasureMaps[pid] = s.treasureMaps[pid].filter(m => !(m.kind === 'dungeon' && m.ring === ring));
      if (s.treasureMaps[pid].length !== before) s.treasureRev[pid]++;
    }
  }

  /** Touching a shut gateway tells you what to do about it (at most every few seconds). */
  tickHints(id, p) {
    if (this.server.tick % 30 !== 0 || gridOf(p)) return;
    const rings = this.server.map.layers.rings, ring = rings.barrierNear(p.x, p.y, 2.6);
    if (ring < 0 || (this.hintAt[id] || -999) > this.server.tick - 300) return;
    this.hintAt[id] = this.server.tick;
    const sealed = rings.def(ring), guard = Zones.all().find(z => z.id === sealed.unlockedBy);
    this.server._notice(id, guard && guard.bossName ? `A shimmering barrier seals the way to ${sealed.name}. Defeat the ${guard.bossName} in the lair at the bottom of the cave in ${guard.name} to open it` : `A shimmering barrier seals the way to ${sealed.name}. Something must open it first`);
  }
}
