'use strict';
/* SHARED - the STABLE (data/buildings/pony_stable.js): a building you walk into, with a room of your own (like a home, but open to all) and STALLS (furniture with
 * `stall: true`, data/furniture/basic.js) where you keep your ponies. Stand beside a stall and press the interact key:
 *   - the stall is empty and you have a pony with you (the one you ride, else the nearest of yours): it is put in the stall
 *   - the stall holds one of yours: you take it out (it stands in front of the stall, free again; ride it, lead it on a rope, make it your main pony ...)
 * A stalled pony (`a.stall`, its key: room grid and stall tile) stays put, does not wander, does not follow you through doors and is not ridden until it is taken out;
 * it stays in the stable until you come back for it, and is saved with the world (serverOwned.js). The stalls count as shelter for a pony you have caught, too. */
const Stable = {
  REACH: 1.7,                                               // how close to a stall (tiles, from its edge) the key reaches it
  PICK_RANGE: 4.5,                                          // how far away a pony of yours can be to be stabled
  /** The stalls within reach of p in this room, nearest first: [{ f, def, dist }]. */
  stallsNear(map, p) { return HomeCrafts.near(map, p, def => def.stall).filter(h => h.dist <= Stable.REACH); },
  key: (grid, f) => `${grid}|${f.x},${f.y}`,
  /** Where a pony stands in a stall. */
  spot: f => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 - 0.05 }),
  /** Where a pony taken out is put: just in front of the stall. */
  front: f => ({ x: f.x + f.w / 2, y: f.y + f.h + 0.6 }),
  /** The pony standing in this stall (an animal with `stall` set, inside it), or null. */
  occupant(animals, p, f) {
    for (const id in animals) { const a = animals[id]; if (a.stall && sameGrid(a, p) && a.x >= f.x && a.x <= f.x + f.w && a.y >= f.y && a.y <= f.y + f.h) return a; }
    return null;
  },
  /** The pony that would go into an empty stall: the one you ride, else the nearest of yours within range that is not stalled already. */
  candidate(animals, p, selfId) {
    const mount = p.mount && animals[p.mount];
    if (mount && mount.owner === selfId) return mount;
    let best = null, bd = Stable.PICK_RANGE;
    for (const id in animals) {
      const a = animals[id], def = AnimalDefs[a.type], d = Math.hypot(a.x - p.x, a.y - p.y);
      if (a.owner === selfId && def && def.pony && !a.stall && !a.captor && !a.rider && sameGrid(a, p) && d <= bd) { best = a; bd = d; }
    }
    return best;
  },
  nameOf: a => (a.look && typeof PonyLook !== 'undefined' ? PonyLook.describe(a.look).name : AnimalDefs[a.type].name)
};

/** What the interact key does beside a stall (client + server). */
function findStall(map, p, heldItemId, animals = {}, selfId = p.id) {
  const [hit] = Stable.stallsNear(map, p);
  if (!hit || p.asleep) return null;
  const occ = Stable.occupant(animals, p, hit.f);
  if (occ) return occ.owner === selfId ? { kind: 'stall', label: `Take ${Stable.nameOf(occ)} out`, dist: hit.dist, fx: hit.f.x, fy: hit.f.y } : null;
  const a = Stable.candidate(animals, p, selfId);
  return a ? { kind: 'stall', label: `Stable ${Stable.nameOf(a)}`, dist: hit.dist, fx: hit.f.x, fy: hit.f.y } : null;
}
Interactions.extra.push(findStall);
InteractionHandlers.stall = (server, id, p, action) => server._useStall(id, p, action);

Object.assign(GameServer.prototype, {
  _useStall(id, p, action) {
    const hit = this._roomPiece(p, action, d => d.stall); if (!hit) return;
    const f = hit.f, animals = this.animals.animals, grid = gridOf(p), occ = Stable.occupant(animals, p, f);
    if (Math.hypot(p.x - clamp(p.x, f.x, f.x + f.w), p.y - clamp(p.y, f.y, f.y + f.h)) > Stable.REACH + 0.4) return;
    if (occ) {                                                                          // take it out
      if (occ.owner !== id) return;
      const at = Stable.front(f);
      delete occ.stall; delete occ.stallAt; occ.x = at.x; occ.y = at.y; occ.vx = occ.vy = 0; occ.home = { x: at.x, y: at.y }; occ.state = 'idle';
      this._notice(id, `${Stable.nameOf(occ)} is out of the stall`);
      this.pendingEvents.push({ type: 'unstalled', to: id, animal: occ.id, x: at.x, y: at.y, grid });
      return;
    }
    const a = Stable.candidate(animals, p, id);
    if (!a) { this._notice(id, 'Bring a pony of yours to the stall (ride it, or lead it on a rope)'); return; }
    if (p.mount === a.id) this._dismount(id, p);                                        // (off the saddle, into the stall)
    const at = Stable.spot(f);
    Object.assign(a, { stall: Stable.key(grid, f), stallAt: at, x: at.x, y: at.y, vx: 0, vy: 0, leashed: false, rider: '', home: { x: at.x, y: at.y }, state: 'idle', facing: Math.PI / 2 });
    this._notice(id, `${Stable.nameOf(a)} settles into the stall`);
    this.pendingEvents.push({ type: 'stalled', to: id, animal: a.id, x: at.x, y: at.y, grid });
  }
});
