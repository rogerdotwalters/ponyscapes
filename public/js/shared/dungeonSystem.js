'use strict';
/* SHARED - the caves. Entering takes you (and your mount, and any pet on a rope) to that ring's dungeon in cave space; its guardian waits in the
 * arena and is always the TOP level of its area; defeating it opens the next ring for everyone. Also: the hint when you touch a sealed barrier. */

/** Pure (client + server): is there a cave mouth to enter, or a way out, within reach? */
function findCaveInteraction(map, p) {
  const tx = Math.floor(p.x), ty = Math.floor(p.y), index = DungeonSpace.indexOf(tx, ty);
  if (index >= 0) {                                                                         // inside a cave: the way out
    const exit = DungeonSpace.exit(index), d = Math.hypot(p.x - exit.x, p.y - exit.y);
    return d <= 2.4 ? { kind: 'leave_cave', label: 'Leave cave', dist: d, ring: index } : null;
  }
  const rings = map.layers.rings;
  for (let ring = 0; ring < rings.count; ring++) {
    const site = map.layers.dungeons.site(ring), d = Math.hypot(p.x - site.x, p.y - site.y);
    if (d <= CAVE_REACH && rings.isUnlocked(ring)) return { kind: 'enter_cave', label: 'Enter cave', dist: d, ring };
  }
  return null;
}
const CAVE_REACH = 2.3;
Interactions.extra.push(findCaveInteraction);                                                // the interact key now knows about caves
InteractionHandlers.enter_cave = (server, id, p, action) => server.dungeons.enter(id, p, action.ring);
InteractionHandlers.leave_cave = (server, id, p) => server.dungeons.leave(id, p);

class DungeonSystem {
  constructor(server) { this.server = server; this.bosses = {}; this.hintAt = {}; this.portalAt = {}; }

  /** A short pause after every crossing, so a held key (or a double tap) cannot bounce you straight back through. */
  _cooling(id) { if ((this.portalAt[id] || -999) > this.server.tick - 20) return true; this.portalAt[id] = this.server.tick; return false; }

  _teleport(id, p, x, y) {
    const s = this.server;
    s.map.ensureAround(x, y, 2);
    p.x = x; p.y = y; p.vx = p.vy = 0;
    const mount = p.mount && s.animals.animals[p.mount];
    if (mount) { mount.x = x; mount.y = y; mount.vx = mount.vy = 0; }
    for (const a of Object.values(s.animals.animals)) {                                     // a pet on a rope comes too (it would otherwise be left frozen far away)
      if (a.leashed && (a.owner === id || a.captor === id) && a.id !== p.mount) { a.x = x - 0.8; a.y = y + 0.4; a.vx = a.vy = 0; }
    }
  }

  enter(id, p, ring) {
    const s = this.server, rings = s.map.layers.rings;
    if (!rings.isUnlocked(ring) || this._cooling(id)) return;
    const site = s.map.layers.dungeons.site(ring), entry = DungeonSpace.entry(ring), def = Fauna.bossOf(ring);
    p.returnTo = { x: site.x, y: site.y + 1.6 };
    this._teleport(id, p, entry.x, entry.y);
    this.ensureBoss(ring);
    const down = s.worldProgress.isDefeated(ring);
    s._notice(id, down ? 'The lair is quiet: its guardian has been defeated' : `You enter the lair of the ${def.name}. It is a level ${AnimalLevels.roll(def.id, 0, 0, 0.5, null)} guardian`);
    s.pendingEvents.push({ type: 'enteredCave', to: id, ring });
  }

  leave(id, p) {
    if (this._cooling(id)) return;
    const s = this.server, back = p.returnTo || (() => { const site = s.map.layers.dungeons.site(0); return { x: site.x, y: site.y + 1.6 }; })();
    this._teleport(id, p, back.x, back.y);
    p.returnTo = null;
    s.pendingEvents.push({ type: 'leftCave', to: id });
  }

  /** The guardian is placed in the arena (once, until it dies). */
  ensureBoss(ring) {
    const s = this.server;
    if (s.worldProgress.isDefeated(ring)) return;
    const current = s.animals.animals[this.bosses[ring]];
    if (current) return;
    const def = Fauna.bossOf(ring), arena = DungeonSpace.arena(ring);
    const id = s.animals.spawn(def.id, arena.x, arena.y, 0, { level: AnimalLevels.roll(def.id, arena.x, arena.y, 0.5, null) });
    s.animals.animals[id].home = { x: arena.x, y: arena.y };
    this.bosses[ring] = id;
  }

  /** AnimalSystem tells us whenever something dies. */
  onKilled(animal, def) {
    if (!def.boss) return;
    const s = this.server, ring = def.bossRing;
    delete this.bosses[ring];
    if (!s.worldProgress.defeatBoss(ring)) return;
    const R = s.map.layers.rings;
    s.pendingEvents.push({ type: 'bossDefeated', ring, name: def.name, nextRing: ring + 1 < R.count ? R.def(ring + 1).name : '', final: ring + 1 >= R.count });
    for (const pid in s.treasureMaps) {                                                      // everybody's scroll to this cave is used up
      const before = s.treasureMaps[pid].length;
      s.treasureMaps[pid] = s.treasureMaps[pid].filter(m => !(m.kind === 'dungeon' && m.ring === ring));
      if (s.treasureMaps[pid].length !== before) s.treasureRev[pid]++;
    }
  }

  /** Touching a sealed barrier tells you what to do about it (at most every few seconds). */
  tickHints(id, p) {
    if (this.server.tick % 30 !== 0 || DungeonSpace.contains(Math.floor(p.x), Math.floor(p.y))) return;
    const rings = this.server.map.layers.rings, ring = rings.barrierNear(p.x, p.y, 2.6);
    if (ring < 0 || (this.hintAt[id] || -999) > this.server.tick - 300) return;
    this.hintAt[id] = this.server.tick;
    const guard = rings.def(ring - 1);
    this.server._notice(id, `A shimmering barrier seals ${rings.def(ring).name}. Defeat the ${guard.bossName} in the cave hidden in ${guard.name} to open it`);
  }
}
