'use strict';
/* SHARED - the caves. Entering takes you (and your mount, and any pet on a rope) to that ring's dungeon: its own GRID ('cave:<ring>'); its guardian waits in the
 * arena and is always the TOP level of its area; defeating it opens the next ring for everyone. Also: the hint when you touch a sealed barrier. */

/** Pure (client + server): is there a cave mouth to enter, or a way out, within reach? */
function findCaveInteraction(map, p) {
  if (map.kind === 'dungeon') return findDungeonInteraction(map, p);
  if (map.kind === 'cave') {                                                                // inside a cave: the way out
    const exit = map.exitPoint(), d = Math.hypot(p.x - exit.x, p.y - exit.y);
    return d <= 2.4 ? { kind: 'leave_cave', label: 'Leave cave', dist: d, ring: map.plan.ring } : null;
  }
  if (map.grid) return null;                                                                // (no caves inside rooms)
  const rings = map.layers.rings;
  for (let ring = 0; ring < rings.count; ring++) {
    const site = map.layers.dungeons.site(ring), d = Math.hypot(p.x - site.x, p.y - site.y);
    if (d <= CAVE_REACH && rings.isUnlocked(ring)) return { kind: 'enter_cave', label: 'Enter cave', dist: d, ring };
  }
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
  for (const box of plan.patch('exit')) offer({ kind: 'dungeon_next', label: plan.last ? 'Leave cave' : 'On to the next room', dist: away(box), reach: DUNGEON_REACH });
  for (const c of plan.room.chests) {
    const prop = map.peekPropAt(c.x, c.y);
    if (prop && prop.t === 'dungeon_chest' && !prop.opened) offer({ kind: 'dungeon_chest', label: 'Open chest', dist: Math.max(0, Math.hypot(p.x - prop.x, p.y - prop.y) - prop.r), reach: CHEST_REACH, tx: c.x, ty: c.y });
  }
  return best;
}
Interactions.extra.push(findCaveInteraction);                                                // the interact key now knows about caves
InteractionHandlers.enter_cave = (server, id, p, action) => server.dungeons.enter(id, p, action.ring);
InteractionHandlers.leave_cave = (server, id, p) => server.dungeons.leave(id, p);
InteractionHandlers.enter_dungeon = (server, id, p, action) => server.dungeons.enterDungeon(id, p, action.dungeon);
InteractionHandlers.dungeon_back = (server, id, p) => server.dungeons.stepRoom(id, p, -1);
InteractionHandlers.dungeon_next = (server, id, p) => server.dungeons.stepRoom(id, p, 1);
InteractionHandlers.dungeon_chest = (server, id, p, action) => server.dungeons.openChest(id, p, action.tx, action.ty);

class DungeonSystem {
  constructor(server) { this.server = server; this.bosses = {}; this.hintAt = {}; this.portalAt = {}; this.populated = new Set(); }

  /** A short pause after every crossing, so a held key (or a double tap) cannot bounce you straight back through. */
  _cooling(id) { if ((this.portalAt[id] || -999) > this.server.tick - 20) return true; this.portalAt[id] = this.server.tick; return false; }

  enter(id, p, ring) {
    const s = this.server, rings = s.map.layers.rings;
    if (!rings.isUnlocked(ring) || this._cooling(id)) return;
    const site = s.map.layers.dungeons.site(ring), entry = DungeonSpace.entry(), def = Fauna.bossOf(ring);
    p.returnTo = { x: site.x, y: site.y + 1.6 };
    s._moveToGrid(id, p, Grids.cave(ring), entry.x, entry.y);
    this.ensureBoss(ring);
    const down = s.worldProgress.isDefeated(ring);
    const q = def.wants && def.wants.quest, young = q && AnimalDefs[q.creature];
    s._notice(id, s.wants.appeased[ring] ? `The ${def.name} rests peacefully with her cubs` : down ? 'The lair is quiet: its guardian has been defeated'
      : `You enter the lair of the ${def.name}, a level ${AnimalLevels.roll(def.id, 0, 0, 0.5, null)} guardian.` + (q ? ` Fight her, or bring back her ${q.count} lost ${young ? young.name.toLowerCase() + 's' : 'young'} from ${rings.def(ring).name} (they come to you for fish). Carrying one, she will not attack you.` : ''));
    s.pendingEvents.push({ type: 'enteredCave', to: id, ring });
  }

  /* ---- room dungeons (js/data/dungeons/, rooms from PNGs: js/shared/roomCodes.js) ---- */

  /** The mouth of dungeon `d` in the overworld -> its first room. */
  enterDungeon(id, p, d) {
    const s = this.server, def = Dungeons.all()[d], mouth = s.map.terrain.caveSites.caves().find(c => c.index === d);
    if (!def || !mouth) return;
    const world = s.grids.get(Grids.dungeon(d, 0));
    if (world.kind !== 'dungeon') { s._notice(id, 'The way in is blocked by fallen rock'); return; }               // (its first room is missing from js/content/caveRooms.js)
    if (this._cooling(id)) return;
    p.returnTo = { x: mouth.x, y: mouth.y + 1.6 };
    const at = world.plan.entryPoint();
    s._moveToGrid(id, p, world.grid, at.x, at.y);
    this.populate(world);
    s._notice(id, `You enter ${def.name}`);
    s.pendingEvents.push({ type: 'enteredCave', to: id, ring: def.ring });
  }

  /** Walk through the entrance (-1: back a room) or the exit (+1: on a room) of the room you stand in. Past either end you are back outside. */
  stepRoom(id, p, dir) {
    const s = this.server, g = Grids.parse(gridOf(p)), def = g && g.kind === 'dungeon' && Dungeons.all()[g.dungeon];
    if (!def || this._cooling(id)) return;
    const next = g.room + dir;
    if (next < 0 || next >= def.rooms.length) { this.leaveDungeon(id, p, g.dungeon); return; }
    const world = s.grids.get(Grids.dungeon(g.dungeon, next));
    if (world.kind !== 'dungeon') { s._notice(id, 'The way is blocked by fallen rock'); return; }
    const at = dir > 0 ? world.plan.entryPoint() : world.plan.arrivalFromNext();
    s._moveToGrid(id, p, world.grid, at.x, at.y);
    this.populate(world);
    s._notice(id, `${def.name}: room ${next + 1} of ${def.rooms.length}`);
  }

  /** Testing aid (the host, Dev settings): 'village', 'cave' (the first dungeon's mouth) or 'room:<n>' (inside its room n, as if you had walked in). */
  debugTeleport(id, p, to) {
    const s = this.server, mouth = s.map.terrain.caveSites.caves()[0], room = /^room:(\d{1,2})$/.exec(to);
    if (p.flying) { p.flying = false; p.flyT = 0; }
    if (to === 'village') { const at = Village.spawns[0]; s._moveToGrid(id, p, '', at.x, at.y); p.returnTo = null; }
    else if (to === 'cave' && mouth) { s._moveToGrid(id, p, '', mouth.x, mouth.y + 1.6); p.returnTo = null; }
    else if (room && mouth) {
      const world = s.grids.get(Grids.dungeon(0, Number(room[1])));
      if (world.kind !== 'dungeon') { s._notice(id, 'No such room'); return; }
      p.returnTo = { x: mouth.x, y: mouth.y + 1.6 };
      const at = world.plan.entryPoint();
      s._moveToGrid(id, p, world.grid, at.x, at.y); this.populate(world);
    } else return;
    s._notice(id, 'Teleported');
  }

  /** Out of the dungeon, back to the cave mouth. */
  leaveDungeon(id, p, d) {
    const s = this.server, mouth = s.map.terrain.caveSites.caves().find(c => c.index === d), back = p.returnTo || (mouth ? { x: mouth.x, y: mouth.y + 1.6 } : { x: 20.5, y: 26.5 });
    s._moveToGrid(id, p, '', back.x, back.y);
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

  /** What a chest holds: the dungeon's `loot` table, rolled from the chest's place (every player who opens a fresh chest would see the same pile, but a chest opens once). */
  rollLoot(def, tx, ty) {
    const table = def.loot && def.loot.length ? def.loot : [{ item: 'gold_coin', min: 10, max: 30 }], seed = this.server.map.terrain.seed, out = [];
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

  leave(id, p) {
    if (this._cooling(id)) return;
    const s = this.server, g = Grids.parse(gridOf(p)), ring = g && g.kind === 'cave' ? g.ring : 0;
    const back = p.returnTo || (() => { const site = s.map.layers.dungeons.site(ring); return { x: site.x, y: site.y + 1.6 }; })();
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
    if (!def.boss) return;
    delete this.bosses[def.bossRing];
    this.conquer(def.bossRing, def.name, false);
  }

  /** A ring's guardian is beaten (or appeased: wantSystem.js): the next ring opens for everyone. */
  conquer(ring, name, appeased) {
    const s = this.server;
    if (!s.worldProgress.defeatBoss(ring)) return;
    const R = s.map.layers.rings;
    s.pendingEvents.push({ type: 'bossDefeated', ring, name, appeased: !!appeased, nextRing: ring + 1 < R.count ? R.def(ring + 1).name : '', final: ring + 1 >= R.count });
    for (const pid in s.treasureMaps) {                                                      // everybody's scroll to this cave is used up
      const before = s.treasureMaps[pid].length;
      s.treasureMaps[pid] = s.treasureMaps[pid].filter(m => !(m.kind === 'dungeon' && m.ring === ring));
      if (s.treasureMaps[pid].length !== before) s.treasureRev[pid]++;
    }
  }

  /** Touching a sealed barrier tells you what to do about it (at most every few seconds). */
  tickHints(id, p) {
    if (this.server.tick % 30 !== 0 || gridOf(p)) return;
    const rings = this.server.map.layers.rings, ring = rings.barrierNear(p.x, p.y, 2.6);
    if (ring < 0 || (this.hintAt[id] || -999) > this.server.tick - 300) return;
    this.hintAt[id] = this.server.tick;
    const guard = rings.def(ring - 1);
    this.server._notice(id, `A shimmering barrier seals ${rings.def(ring).name}. Defeat the ${guard.bossName} in the cave hidden in ${guard.name} to open it`);
  }
}
