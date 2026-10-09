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
  if (near.site.def.home) {                                                  // a home: only its owner goes in (p.home is the site this player was given, -1 = none)
    return p.home === near.site.index ? { kind: 'enter_building', label: 'Go home', dist: near.dist, site: near.site.index }
      : { kind: 'locked_building', label: near.site.def.name + ' (locked)', dist: near.dist, site: near.site.index };
  }
  if (near.site.def.locked) return { kind: 'locked_building', label: near.site.def.name + ' (locked)', dist: near.dist, site: near.site.index };
  return { kind: 'enter_building', label: 'Enter ' + near.site.def.name, dist: near.dist, site: near.site.index };
}
const BUILDING_REACH = 1.5;
Interactions.extra.push(findBuildingInteraction);
InteractionHandlers.enter_building = (server, id, p, action) => server.interiors.enter(id, p, action.site);
InteractionHandlers.leave_building = (server, id, p) => server.interiors.leave(id, p);

class InteriorSystem {
  constructor(server) { this.server = server; this.homes = {}; this.nextHome = 0; this.chests = {}; this.openChest = {}; this.chestSent = {}; this.owners = {}; }   // chests: key (HomeCrafts.storeKey) -> Inventory; owners: home site index -> { key, name, seen }

  /* ---- who lives where: the village has a few homes (data/buildings: `home: true`); each person who plays here is given one, kept by their player key ---- */
  homeSites() { return BuildingSites.list.filter(s => s.def.home); }
  /** The home site index this player key lives in, or -1. */
  homeOf(key) { for (const [site, o] of Object.entries(this.owners)) if (o.key === key) return Number(site); return -1; }
  /** Is there a home for this key (theirs already, or an empty one)? */
  canHome(key) { return this.homeOf(key) >= 0 || this.homeSites().some(s => !this.owners[s.index]); }
  /** Give this key a home (the one they have, else the first empty one: the host sits down first and gets the starter home). Returns the site index, or -1. */
  claimHome(key, name = '') {
    let site = this.homeOf(key);
    if (site < 0) { const free = this.homeSites().find(s => !this.owners[s.index]); if (!free) return -1; site = free.index; this.owners[site] = { key, name: '', seen: 0 }; }
    Object.assign(this.owners[site], { name: String(name || this.owners[site].name || '').slice(0, 24), seen: Date.now() });
    if (this.homes[key] === undefined) this.homes[key] = this.nextHome++;
    return site;
  }
  /** A player with a key leaves: note when their home was last lived in. */
  leave_(id) { const key = this.server.playerKeys[id], site = key ? this.homeOf(key) : -1; if (site >= 0) this.owners[site].seen = Date.now(); }
  /** Let go of a keyless seat's home (a test / solo seat: nothing to come back for). */
  releaseSeat(id) { const key = 'seat:' + id, site = this.homeOf(key); if (site >= 0) delete this.owners[site]; delete this.homes[key]; }
  /** Empty a home for somebody else: it is wiped (its chests and bins), its owner no longer lives there and, if they come back, they are given a NEW room. */
  clearHome(key) {
    const site = this.homeOf(key), n = this.homes[key];
    if (site >= 0) delete this.owners[site];
    if (n === undefined) return;
    delete this.homes[key];
    const prefix = Grids.room(site >= 0 ? site : this.homeSites()[0].index, n) + '|', all = this.homeSites().map(h => Grids.room(h.index, n) + '|');
    const wipe = table => { for (const k of Object.keys(table || {})) if (all.includes(k.slice(0, k.indexOf('|') + 1)) || k.startsWith(prefix)) delete table[k]; };
    wipe(this.chests); wipe(this.server.map.roomStores);
    for (const id of Object.keys(this.openChest)) if (this.openChest[id] && all.some(a => this.openChest[id].startsWith(a))) delete this.openChest[id];
    this.server.stockRev++;
  }
  /** Worlds saved before homes had owners: every player's room was a copy at the starter home. They are dealt the homes in order (the host first), and what
   *  stood in their rooms (chests, bins) moves with them. Anyone beyond the homes available has to be given a new one when they return. */
  _adoptOldHomes() {
    const sites = this.homeSites(), old = sites[0], rename = (table, from, to) => { for (const k of Object.keys(table || {})) if (k.startsWith(from)) { table[to + k.slice(from.length)] = table[k]; delete table[k]; } };
    if (!old) return;
    Object.entries(this.homes).sort((a, b) => a[1] - b[1]).forEach(([key, n], i) => {
      const site = sites[i];
      if (!site) { delete this.homes[key]; rename(this.chests, Grids.room(old.index, n) + '|', 'room:gone:' + n + '|'); return; }
      this.owners[site.index] = { key, name: '', seen: 0 };
      if (site.index !== old.index) { rename(this.chests, Grids.room(old.index, n) + '|', Grids.room(site.index, n) + '|'); rename(this.server.map.roomStores, Grids.room(old.index, n) + '|', Grids.room(site.index, n) + '|'); }
    });
  }
  /** For the Session panel: every home and who lives in it. */
  listHomes() {
    const s = this.server, online = new Set(Object.values(s.playerKeys));
    return this.homeSites().map(h => { const o = this.owners[h.index]; return { site: h.index, name: h.def.name, owner: o ? o.name || 'Player' : '', key: o ? o.key : '', online: !!(o && online.has(o.key)), seen: o ? o.seen : 0 }; });
  }

  /** The grid of the room this player goes into at a site: the shared one, or (a player building) their own copy. */
  gridFor(id, site) {
    if (!site.def.home) return Grids.room(site.index);
    const key = this.server.playerKeys[id] || 'seat:' + id;                     // (a keyless test player: by seat)
    if (this.homes[key] === undefined) this.homes[key] = this.nextHome++;
    return Grids.room(site.index, this.homes[key]);
  }

  enter(id, p, siteIndex) {
    const s = this.server, site = BuildingSites.list[siteIndex];
    if (!site || s.dungeons._cooling(id)) return;
    if (site.def.home) { const o = this.owners[site.index], mine = o && o.key === (s.playerKeys[id] || 'seat:' + id); if (!mine) { s._notice(id, o ? `This is ${o.name || 'somebody'}'s home` : 'This home is empty: it is kept for a new neighbour'); return; } }
    else if (site.def.locked) return;
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
  exportState() { const chests = {}; for (const [k, inv] of Object.entries(this.chests)) if (inv.used) chests[k] = inv.toJSON(); return { homes: Object.assign({}, this.homes), nextHome: this.nextHome, chests, owners: JSON.parse(JSON.stringify(this.owners)) }; }
  restore(state) {
    if (!state || typeof state !== 'object') return;
    for (const [key, n] of Object.entries(state.homes || {})) if (/^(seat:)?[A-Za-z0-9_-]{1,64}$/.test(key) && Number.isInteger(n) && n >= 0 && n < 4000) this.homes[key] = n;
    for (const [key, slots] of Object.entries(state.chests || {})) {                // (what lies in the worn chests)
      if (!/^[A-Za-z0-9_:|,.\-]{1,80}$/.test(key) || !Array.isArray(slots)) continue;
      const inv = new Inventory(HomeCrafts.CHEST_SLOTS);
      slots.slice(0, HomeCrafts.CHEST_SLOTS).forEach((c, i) => { if (c && typeof c.id === 'string' && ItemDefs[c.id] && Number.isInteger(c.count) && c.count > 0) inv.slots[i] = { id: c.id, count: Math.min(c.count, ItemDB.maxStack(c.id)) }; });
      this.chests[key] = inv;
    }
    const sites = new Set(this.homeSites().map(h => h.index));
    for (const [site, o] of Object.entries(state.owners || {})) if (sites.has(Number(site)) && o && typeof o.key === 'string' && /^(seat:)?[A-Za-z0-9_-]{1,64}$/.test(o.key) && this.homes[o.key] !== undefined) this.owners[site] = { key: o.key, name: String(o.name || '').slice(0, 24), seen: Number.isFinite(o.seen) ? o.seen : 0 };
    if (!state.owners) this._adoptOldHomes();                                    // a world saved before homes had owners
    this.nextHome = Math.max(Number.isInteger(state.nextHome) ? state.nextHome : 0, ...Object.values(this.homes).map(n => n + 1), 0);
  }
}
