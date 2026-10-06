'use strict';
/* SHARED - going into buildings. Walk up to a door and press the interact key: you (and your mount, and a pet on a rope) are put into that
 * building's room in interior space (InteriorSpace). Shared buildings have one room for everyone; a player building (the home) gives every
 * player their own room, remembered by their player key (and saved with the world). The doormat inside takes you back out to the door. */

/** Pure (client + server): a door to go in by, or the doormat to go out by, within reach? */
function findBuildingInteraction(map, p) {
  const tx = Math.floor(p.x), ty = Math.floor(p.y), index = InteriorSpace.indexOf(tx, ty);
  if (index >= 0) {
    const exit = InteriorSpace.exitPoint(index), d = exit ? Math.hypot(p.x - exit.x, p.y - exit.y) : Infinity;
    return d <= BUILDING_REACH ? { kind: 'leave_building', label: 'Go outside', dist: d } : null;
  }
  const near = BuildingSites.nearDoor(p.x, p.y, BUILDING_REACH);
  if (!near) return null;
  return { kind: 'enter_building', label: near.site.def.instance === 'player' ? 'Go home' : 'Enter ' + near.site.def.name, dist: near.dist, site: near.site.index };
}
const BUILDING_REACH = 1.5;
Interactions.extra.push(findBuildingInteraction);
InteractionHandlers.enter_building = (server, id, p, action) => server.interiors.enter(id, p, action.site);
InteractionHandlers.leave_building = (server, id, p) => server.interiors.leave(id, p);

class InteriorSystem {
  constructor(server) { this.server = server; this.homes = {}; this.nextHome = 0; }

  /** Which room this player goes into at a site: the shared one, or (a player building) their own. */
  instanceFor(id, site) {
    if (site.def.instance !== 'player') return site.index;
    const key = this.server.playerKeys[id] || 'seat:' + id;                     // (a bot or a keyless test player: by seat)
    if (this.homes[key] === undefined) this.homes[key] = this.nextHome++;
    return InteriorSpace.playerInstance(this.homes[key], site.index);
  }

  enter(id, p, siteIndex) {
    const s = this.server, site = BuildingSites.list[siteIndex];
    if (!site || s.dungeons._cooling(id)) return;
    const index = this.instanceFor(id, site), entry = InteriorSpace.entryPoint(index);
    if (!entry) { s._notice(id, `The ${site.def.name} has nothing inside yet (make its room in level-editor.html)`); return; }
    s.dungeons._teleport(id, p, entry.x, entry.y);
    p.facing = -Math.PI / 2 - Math.PI / 4;                                      // facing into the room
    s.pendingEvents.push({ type: 'enteredBuilding', to: id, building: site.id, name: site.def.name, x: entry.x, y: entry.y });
  }

  leave(id, p) {
    const s = this.server, index = InteriorSpace.indexOf(Math.floor(p.x), Math.floor(p.y)), site = InteriorSpace.siteOf(index);
    if (index < 0 || s.dungeons._cooling(id)) return;
    const out = site ? BuildingSites.doorFront(site) : Village.spawns[0];
    s.dungeons._teleport(id, p, out.x, out.y);
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
