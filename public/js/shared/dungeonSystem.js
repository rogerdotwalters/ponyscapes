'use strict';
/* SHARED - the caves. Entering takes you (and your mount, and any pet on a rope) to that ring's dungeon: its own GRID ('cave:<ring>'); its guardian waits in the
 * arena and is always the TOP level of its area; defeating it opens the next ring for everyone. Also: the hint when you touch a sealed barrier. */

/** Pure (client + server): is there a cave mouth to enter, or a way out, within reach? */
function findCaveInteraction(map, p) {
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
