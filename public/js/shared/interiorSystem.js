'use strict';
/* SHARED - going into buildings. Walk up to a door and press the interact key: you (and your mount, and a pet on a rope) move to that building's
 * room, its own GRID (an instance: js/shared/grids.js). Shared buildings have one room for everyone ('room:<site>'); a player building (the home)
 * gives every player their own room ('room:<site>:<n>'), remembered by their player key (and saved with the world). The doormat takes you back out. */

/** Pure (client + server): a door to go in by, or the doormat to go out by, within reach? */
function findBuildingInteraction(map, p) {
  if (map.kind === 'room') {
    const exit = map.exitPoint(), d = Math.hypot(p.x - exit.x, p.y - exit.y);
    return d <= BUILDING_REACH ? { kind: 'leave_building', label: 'Go outside', dist: d } : null;
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

class InteriorSystem {
  constructor(server) { this.server = server; this.homes = {}; this.nextHome = 0; }

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

  leave(id, p) {
    const s = this.server, site = Grids.siteOf(gridOf(p));
    if (!gridOf(p) || s.dungeons._cooling(id)) return;
    const out = site ? BuildingSites.doorFront(site) : Village.spawns[0];
    s._moveToGrid(id, p, '', out.x, out.y);
    p.facing = Math.PI / 4;                                                     // facing away from the door
    s.pendingEvents.push({ type: 'leftBuilding', to: id, x: out.x, y: out.y });
  }

  /** For the world save: whose home is which room. */
  exportState() { return { homes: Object.assign({}, this.homes), nextHome: this.nextHome }; }
  restore(state) {
    if (!state || typeof state !== 'object') return;
    for (const [key, n] of Object.entries(state.homes || {})) if (/^(seat:)?[A-Za-z0-9_-]{1,64}$/.test(key) && Number.isInteger(n) && n >= 0 && n < 4000) this.homes[key] = n;
    this.nextHome = Math.max(Number.isInteger(state.nextHome) ? state.nextHome : 0, ...Object.values(this.homes).map(n => n + 1), 0);
  }
}
