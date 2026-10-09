'use strict';
/* SHARED - going into buildings. Walk up to a door and press the interact key: you (and your mount, and a pet on a rope) move to that building's
 * room, its own GRID (an instance: js/shared/grids.js). Shared buildings have one room for everyone ('room:<site>'); a player building (the home)
 * gives every player their own room ('room:<site>:<n>'), remembered by their player key (and saved with the world). The doormat takes you back out.
 * A shared building can hold SEVERAL rooms (the castle: def.rooms, 'room:<site>:<k>'), each its own grid; the doorways in a room's layout (`links`) lead to the
 * other rooms, and its doormat leads back (`exitTo`: the room before; none: outside). A building that was RESTORED has its other self's rooms (BuildingVersions). */

/** Pure (client + server): a door to go in by, or the doormat to go out by, within reach? */
function findBuildingInteraction(map, p) {
  if (map.kind === 'room') {
    const exit = map.exitPoint(), d = Math.hypot(p.x - exit.x, p.y - exit.y), L = map.plan.layout, site = map.plan.site;
    let best = d <= BUILDING_REACH ? { kind: 'leave_building', label: L.exitTo && site.def.rooms && site.def.rooms[L.exitTo] ? 'Back to ' + (Interiors.get(site.def.rooms[L.exitTo]) || { name: 'the last room' }).name : 'Go outside', dist: d } : null;
    for (const l of map.links()) {
      const ld = Math.hypot(p.x - l.x, p.y - l.y);
      if (ld <= BUILDING_REACH && (!best || ld < best.dist)) best = { kind: 'room_link', label: 'Go to ' + l.name, dist: ld, tx: l.tx, ty: l.ty };
    }
    return best;
  }
  if (map.grid) return null;
  const near = BuildingSites.nearDoor(p.x, p.y, BUILDING_REACH);
  if (!near) return null;
  if (near.site.def.locked) return { kind: 'locked_building', label: near.site.def.name + ' (locked)', dist: near.dist, site: near.site.index };   // the empty homes, for now
  return { kind: 'enter_building', label: near.site.def.instance === 'player' ? 'Go home' : 'Enter ' + near.site.def.name, dist: near.dist, site: near.site.index };
}
const BUILDING_REACH = 1.5;
Interactions.extra.push(findBuildingInteraction);
InteractionHandlers.enter_building = (server, id, p, action) => server.interiors.enter(id, p, action.site);
InteractionHandlers.leave_building = (server, id, p) => server.interiors.leave(id, p);
InteractionHandlers.room_link = (server, id, p, action) => server.interiors.link(id, p, action.tx, action.ty);

class InteriorSystem {
  constructor(server) { this.server = server; this.homes = {}; this.nextHome = 0; this.chests = {}; this.openChest = {}; this.chestSent = {}; this.versionsRev = 1; this.versionsSent = {}; BuildingVersions.apply([]); }   // (a new world starts with its buildings in ruins)   // chests: key (HomeCrafts.storeKey) -> Inventory

  /** The grid of the room this player goes into at a site: the shared one, or (a player building) their own copy. */
  gridFor(id, site) {
    if (site.def.instance !== 'player') return Grids.room(site.index);
    const key = this.server.playerKeys[id] || 'seat:' + id;                     // (a keyless test player: by seat)
    if (this.homes[key] === undefined) this.homes[key] = this.nextHome++;
    return Grids.room(site.index, this.homes[key]);
  }

  enter(id, p, siteIndex) {
    const s = this.server, site = BuildingSites.list[siteIndex];
    if (!site || site.def.locked || s.dungeons._cooling(id)) return;
    const grid = this.gridFor(id, site), room = s.grids.get(grid);
    if (room.grid !== grid) { s._notice(id, `The ${site.def.name} has nothing inside yet (make its room in level-editor.html)`); return; }
    const entry = room.entryPoint();
    s._moveToGrid(id, p, grid, entry.x, entry.y);
    p.facing = -Math.PI / 2 - Math.PI / 4;                                      // facing into the room
    s.pendingEvents.push({ type: 'enteredBuilding', to: id, building: site.id, name: site.def.name, x: entry.x, y: entry.y });
  }

  /** Through a doorway: to the other room of the same building that the doorway at tile (tx, ty) of this room leads to. */
  link(id, p, tx, ty) {
    const s = this.server, map = s.grids.of(p), site = Grids.siteOf(gridOf(p));
    if (!site || !map.plan || !map.plan.layout || s.dungeons._cooling(id)) return;
    const l = map.plan.layout.links.find(k => k.x === tx && k.y === ty);
    if (!l || Math.hypot(p.x - (l.x + 0.5), p.y - (l.y + 0.5)) > BUILDING_REACH + 0.5) return;
    const grid = Grids.roomOf(site, l.to), room = grid && s.grids.get(grid);
    if (!room || room.grid !== grid) { s._notice(id, `The way to the ${l.name} is blocked`); return; }
    const entry = room.entryPoint();
    s._moveToGrid(id, p, grid, entry.x, entry.y);
    p.facing = -Math.PI / 2 - Math.PI / 4;
    s.pendingEvents.push({ type: 'enteredBuilding', to: id, building: site.id, name: room.plan.layout.name, x: entry.x, y: entry.y });
  }

  leave(id, p) {
    const s = this.server, site = Grids.siteOf(gridOf(p));
    if (!gridOf(p) || s.dungeons._cooling(id)) return;
    const map = s.grids.of(p), back = site && map.plan && map.plan.layout && map.plan.layout.exitTo;
    const prev = back && Grids.roomOf(site, back), room = prev && s.grids.get(prev);
    if (room && room.grid === prev) {                                           // a room inside the building: back through the doorway we came by
      const here = Grids.parse(gridOf(p)), mine = Grids.roomKeys(site)[here.n === undefined ? 0 : here.n];
      const l = room.plan.layout.links.find(k => k.to === mine), at = l ? room.plan.approachOf(l.x, l.y) : room.entryPoint();
      s._moveToGrid(id, p, prev, at.x, at.y);
      p.facing = Math.PI / 4;
      s.pendingEvents.push({ type: 'enteredBuilding', to: id, building: site.id, name: room.plan.layout.name, x: at.x, y: at.y });
      return;
    }
    const out = site ? BuildingSites.doorFront(site) : Village.spawns[0];
    s._moveToGrid(id, p, '', out.x, out.y);
    p.facing = Math.PI / 4;                                                     // facing away from the door
    s.pendingEvents.push({ type: 'leftBuilding', to: id, x: out.x, y: out.y });
  }

  /** Restore a building (or let it fall to ruin again): everyone inside is walked out to its door, its rooms are forgotten (rebuilt from the other self's
   *  layouts when next entered) and every player is told. Returns true if that changed anything. */
  setRestored(id, on) {
    const s = this.server, site = BuildingSites.list.find(b => b.id === id);
    if (!site || !BuildingDefs.get(id).ruinedAs || !BuildingVersions.set(id, on)) return false;
    for (const pid of Object.keys(s.players)) {
      const p = s.players[pid], g = Grids.parse(gridOf(p));
      if (g && g.kind === 'room' && g.site === site.index) { const out = BuildingSites.doorFront(site); s._moveToGrid(pid, p, '', out.x, out.y); s.pendingEvents.push({ type: 'leftBuilding', to: pid, x: out.x, y: out.y }); }
    }
    for (const gid of s.grids.ids()) { const g = Grids.parse(gid); if (g && g.kind === 'room' && g.site === site.index) s.grids.drop(gid); }
    this.versionsRev++;
    this._syncSettings();
    return true;
  }
  /** The host's Settings checkbox follows the castle. */
  _syncSettings() { const st = this.server.settings; if (st && st.castleRestored !== BuildingVersions.isRestored('castle')) { st.castleRestored = BuildingVersions.isRestored('castle'); this.server.settingsRev++; } }
  /** Which buildings are restored, only when that changed since last sent to this player (else null). */
  versionsFor(id) {
    if (this.versionsSent[id] === this.versionsRev) return null;
    this.versionsSent[id] = this.versionsRev;
    return BuildingVersions.wire();
  }

  /** For the world save: whose home is which room. */
  exportState() { const chests = {}; for (const [k, inv] of Object.entries(this.chests)) if (inv.used) chests[k] = inv.toJSON(); return { homes: Object.assign({}, this.homes), nextHome: this.nextHome, chests, restored: BuildingVersions.wire() }; }
  restore(state) {
    if (!state || typeof state !== 'object') return;
    BuildingVersions.apply(state.restored); this.versionsRev++; this._syncSettings();
    for (const [key, n] of Object.entries(state.homes || {})) if (/^(seat:)?[A-Za-z0-9_-]{1,64}$/.test(key) && Number.isInteger(n) && n >= 0 && n < 4000) this.homes[key] = n;
    for (const [key, slots] of Object.entries(state.chests || {})) {                // (what lies in the worn chests)
      if (!/^[A-Za-z0-9_:|,.\-]{1,80}$/.test(key) || !Array.isArray(slots)) continue;
      const inv = new Inventory(HomeCrafts.CHEST_SLOTS);
      slots.slice(0, HomeCrafts.CHEST_SLOTS).forEach((c, i) => { if (c && typeof c.id === 'string' && ItemDefs[c.id] && Number.isInteger(c.count) && c.count > 0) inv.slots[i] = { id: c.id, count: Math.min(c.count, ItemDB.maxStack(c.id)) }; });
      this.chests[key] = inv;
    }
    this.nextHome = Math.max(Number.isInteger(state.nextHome) ? state.nextHome : 0, ...Object.values(this.homes).map(n => n + 1), 0);
  }
}
