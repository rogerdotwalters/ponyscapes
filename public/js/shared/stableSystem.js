'use strict';
/* SHARED - the STABLE (data/buildings/pony_stable.js): a big building you walk into, with a room of your own (like a home, but open to all). Inside are walled STALLS
 * (furniture with `stall: true`, data/furniture/basic.js: a 4 x 4 pen), each with a GATE (furniture `gate: true`) in its front wall that you open and close.
 *
 *   - Put a pony on a LEASH (the Leash button, like the lasso but for a pony that is already yours). Only a leashed pony can be stabled.
 *   - Stand beside an empty stall and press the interact key: a menu lists the ponies you have on a leash (and the gate); pick one and it goes in.
 *   - Beside a stall with a pony in it the key opens the menu of the ponies in this stable: TAKE OUT (it stands in front of the gate, free) or LET OUT
 *     (it goes out to the village and roams the village area only).
 *   - Walk up to a stabled pony holding an apple and press the key to feed it.
 *   - The same menu has a button to open or shut the stall's gate. A shut gate blocks you; a pony in a stall keeps to its own pen and potters about in it.
 * A stalled pony (`a.stall`, its key: room grid and stall tile) does not follow you through doors and is not ridden until it is taken out; it is saved with the world. */
const Stable = {
  REACH: 2.6,                                               // how close to a stall (tiles, from its edge) the key reaches it
  GATE_REACH: 1.25,                                         // ... and to a gate
  FEED_REACH: 1.9,                                          // how close to the pony itself, holding an apple, the key feeds it
  LEASH_RANGE: 8,                                           // how far away a pony of yours can be to be put on a leash
  /** Distance from p to the rectangle of a furniture piece. */
  rectDist: (f, p) => Math.hypot(Math.max(f.x - p.x, 0, p.x - (f.x + f.w)), Math.max(f.y - p.y, 0, p.y - (f.y + f.h))),
  layoutOf: map => (map && map.kind === 'room' && map.plan && map.plan.layout ? map.plan.layout : null),
  /** The stalls within reach of p in this room, nearest first: [{ f, def, dist }]. */
  stallsNear(map, p) {
    const L = Stable.layoutOf(map), out = [];
    if (!L) return out;
    for (const f of L.furniture) { const def = FurnitureDefs.get(f.id); if (def && def.stall) { const dist = Stable.rectDist(f, p); if (dist <= Stable.REACH) out.push({ f, def, dist }); } }
    return out.sort((a, b) => a.dist - b.dist);
  },
  /** The gate in the front wall of a stall: { f, open } or null. */
  gateOf(map, stall) {
    const L = Stable.layoutOf(map);
    const f = L && L.furniture.find(g => (FurnitureDefs.get(g.id) || {}).gate && g.x >= stall.x && g.x < stall.x + stall.w && g.y === stall.y + stall.h);
    return f ? { f, open: !!(map.isGateOpen && map.isGateOpen(f.x, f.y)) } : null;
  },
  key: (grid, f) => `${grid}|${f.x},${f.y}`,
  /** The grid and tile of a stall key. */
  parseKey(key) { const m = /^(room:[0-9:]{1,24})\|(\d{1,3}),(\d{1,3})$/.exec(key || ''); return m ? { grid: m[1], x: +m[2], y: +m[3] } : null; },
  /** The furniture piece (a stall) behind a stall key, or null. */
  pieceOfKey(key) {
    const k = Stable.parseKey(key), plan = k && Grids.plan(k.grid);
    return plan && plan.layout ? plan.layout.furniture.find(f => f.x === k.x && f.y === k.y && (FurnitureDefs.get(f.id) || {}).stall) || null : null;
  },
  /** The pen of a stall: the box a pony in it keeps to. */
  box: f => ({ x0: f.x, y0: f.y, x1: f.x + f.w, y1: f.y + f.h }),
  boxOfKey(key) { const f = Stable.pieceOfKey(key); return f ? Stable.box(f) : null; },
  /** Where a pony stands when it is put in a stall (the middle of the pen). */
  spot: f => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 }),
  /** Where a pony taken out is put: in the aisle, just in front of the stall's gate. */
  front: f => ({ x: f.x + 1.5, y: f.y + f.h + 1.6 }),
  /** The pony standing in this stall (an animal with `stall` set, inside it), or null. */
  occupant(animals, p, f) {
    for (const id in animals) { const a = animals[id]; if (a.stall && sameGrid(a, p) && a.x >= f.x && a.x <= f.x + f.w && a.y >= f.y && a.y <= f.y + f.h) return a; }
    return null;
  },
  /** Every pony of yours in a stall of this room. */
  stalledHere(animals, p, selfId) {
    const prefix = gridOf(p) + '|', out = [];
    for (const id in animals) { const a = animals[id]; if (a.owner === selfId && a.stall && a.stall.startsWith(prefix)) out.push(a); }
    return out;
  },
  /** The ponies of yours on a leash that could go into a stall: in this room with you, not stalled, not ridden. */
  leashed(animals, p, selfId) {
    const out = [];
    for (const id in animals) {
      const a = animals[id], def = AnimalDefs[a.type];
      if (a.owner === selfId && a.leashed && def && def.pony && !a.stall && !a.captor && !a.rider && sameGrid(a, p) && Math.hypot(a.x - p.x, a.y - p.y) <= 16) out.push(a);
    }
    return out;
  },
  /** The pony of yours nearest to p that a Leash could catch (not leashed, not stalled, not ridden), or null. An aimed point (a click) wins over distance. */
  leashTarget(animals, p, selfId, aim) {
    let best = null, bs = Infinity;
    for (const id in animals) {
      const a = animals[id], def = AnimalDefs[a.type], d = Math.hypot(a.x - p.x, a.y - p.y);
      if (a.owner !== selfId || !def || !def.pony || a.leashed || a.stall || a.captor || a.rider || !sameGrid(a, p) || d > Stable.LEASH_RANGE) continue;
      const score = aim ? Math.hypot(a.x - aim.x, a.y - aim.y) * 2 + d * 0.1 : d;
      if (score < bs) { best = a; bs = score; }
    }
    return best;
  },
  nameOf: a => (a.look && typeof PonyLook !== 'undefined' ? PonyLook.describe(a.look).name : AnimalDefs[a.type].name),
  /** What a menu shows for a pony. */
  describe: a => ({ id: a.id, name: Stable.nameOf(a), level: a.level || 1, type: a.type })
};

/** What the interact key does in a stable (client + server): feed a stabled pony you hold an apple for, else a stall's menu. */
function findStall(map, p, heldItemId, animals = {}, selfId = p.id) {
  if (p.asleep || !Stable.layoutOf(map)) return null;
  const [hit] = Stable.stallsNear(map, p);
  if (!hit) return null;
  const occ = Stable.occupant(animals, p, hit.f);
  if (occ && occ.owner === selfId && ItemDB.isApple(heldItemId) && Math.hypot(occ.x - p.x, occ.y - p.y) <= Stable.FEED_REACH) return { kind: 'stallFeed', label: `Feed ${Stable.nameOf(occ)}`, dist: hit.dist - 0.5, animal: occ };
  return { kind: 'stall', mode: occ ? 'out' : 'in', label: occ ? 'Take a pony out' : 'Stable a pony', dist: hit.dist, fx: hit.f.x, fy: hit.f.y };
}
Interactions.extra.push(findStall);
InteractionHandlers.stall = (server, id, p, action) => server._useStall(id, p, action);
InteractionHandlers.stallFeed = (server, id, p, action) => { const a = server.animals.animals[action.animal.id]; if (a && a.owner === id && a.stall) server._giveApple(id, p.held, a); };

Object.assign(GameServer.prototype, {
  /** The Leash button: throw a leash on the pony of yours nearest to you (or at the point you aimed at). It then follows you and can be stabled. */
  _leashPony(id) {
    const p = this.players[id];
    if (!p || p.down > 0 || p.hp <= 0 || p.asleep || p.mount) return;
    const animals = this.animals.animals, a = Stable.leashTarget(animals, p, id, AimPoints[id]);
    if (!a) { this._notice(id, Object.values(animals).some(x => x.owner === id && x.leashed && sameGrid(x, p)) ? 'Your ponies are already on a leash' : 'No pony of yours is close enough to leash'); return; }
    const cap = Skills.leashCap(p.lv);
    if (this.animals.leashedCount(id) >= cap) { this._notice(id, `Your rope is full: ${cap} animals at most. Untie one first`); return; }
    a.leashed = true; delete a.roam; a.home = { x: a.x, y: a.y }; a.state = 'idle';
    this._logLeash(id, a);
    this.pendingEvents.push({ type: 'lasso', x0: p.x, y0: p.y, x1: a.x, y1: a.y, hit: true, by: id, item: (p.gear && p.gear.lasso) || 'leash', leash: true });
    this._notice(id, `${Stable.nameOf(a)} is on a leash`);
  },

  /** The interact key at a stall: send the menu (the gate, and the ponies you could put in, or the ponies you could take out). */
  _useStall(id, p, action) {
    const hit = this._roomPiece(p, action, d => d.stall); if (!hit) return;
    const f = hit.f, animals = this.animals.animals, occ = Stable.occupant(animals, p, f), gate = Stable.gateOf(this.mapOf(p), f);
    if (Stable.rectDist(f, p) > Stable.REACH + 0.4) return;
    const mode = occ ? 'out' : 'in', list = occ ? Stable.stalledHere(animals, p, id) : Stable.leashed(animals, p, id);
    this.pendingEvents.push({ type: 'stallMenu', to: id, mode, fx: f.x, fy: f.y, gate: gate ? { open: gate.open } : null, options: list.map(Stable.describe) });
  },

  /** A choice in the stall menu: act = 'in' (put the pony in the stall at fx, fy), 'out' (take it out in front of its gate) or 'roam' (let it out into the village). */
  _stallPick(id, cmd) {
    const p = this.players[id], map = p && this.mapOf(p), animals = this.animals.animals, a = animals[cmd.animal];
    if (!p || !Stable.layoutOf(map) || p.asleep) return;
    const grid = gridOf(p);
    if (cmd.act === 'gate') { this._useGate(id, p, map, cmd); return; }
    if (!a || a.owner !== id || (!sameGrid(a, p) && !a.stall)) return;
    if (cmd.act === 'in') {
      const f = map.plan.layout.furniture.find(g => g.x === (cmd.fx | 0) && g.y === (cmd.fy | 0) && (FurnitureDefs.get(g.id) || {}).stall);
      if (!f || Stable.rectDist(f, p) > Stable.REACH + 0.8) { this._notice(id, 'Stand beside the stall'); return; }
      if (Stable.occupant(animals, p, f)) { this._notice(id, 'That stall is taken'); return; }
      if (!Stable.leashed(animals, p, id).includes(a)) { this._notice(id, 'Only a pony on a leash can be stabled'); return; }
      const at = Stable.spot(f);
      Object.assign(a, { stall: Stable.key(grid, f), stallAt: at, stallBox: Stable.box(f), x: at.x, y: at.y, vx: 0, vy: 0, leashed: false, rider: '', home: at, state: 'idle', facing: Math.PI / 2 });
      delete a.roam;
      this._notice(id, `${Stable.nameOf(a)} settles into the stall`);
      this.pendingEvents.push({ type: 'stalled', to: id, animal: a.id, x: at.x, y: at.y, grid });
      return;
    }
    if (!a.stall || !a.stall.startsWith(grid + '|')) return;                                 // (only from inside the stable the pony is in)
    const f = Stable.pieceOfKey(a.stall), name = Stable.nameOf(a);
    delete a.stall; delete a.stallAt; delete a.stallBox; a.vx = a.vy = 0; a.state = 'idle'; a.leashed = false;
    if (cmd.act === 'roam') {                                                                // out of the door: into the village, to roam there
      const site = Grids.siteOf(grid), at = site ? { x: site.frontX + 0.5 + (this.rng() - 0.5) * 1.5, y: site.frontY + 1.2 } : { x: p.x, y: p.y };
      delete a.grid; Object.assign(a, { x: at.x, y: at.y, home: { x: at.x, y: at.y }, roam: true });
      this._notice(id, `${name} trots out into the village`);
      this.pendingEvents.push({ type: 'unstalled', to: id, animal: a.id, x: p.x, y: p.y, grid, roam: true });
      return;
    }
    const at = f ? Stable.front(f) : { x: p.x, y: p.y };
    Object.assign(a, { x: at.x, y: at.y, home: { x: at.x, y: at.y } });
    this._notice(id, `${name} is out of the stall`);
    this.pendingEvents.push({ type: 'unstalled', to: id, animal: a.id, x: at.x, y: at.y, grid });
  },

  /** Open or shut the gate of the stall at (fx, fy) (from its menu). */
  _useGate(id, p, map, cmd) {
    const f = map.plan.layout.furniture.find(g => g.x === (cmd.fx | 0) && g.y === (cmd.fy | 0) && (FurnitureDefs.get(g.id) || {}).stall);
    if (!f || Stable.rectDist(f, p) > Stable.REACH + 0.8 || !map.setGate) { this._notice(id, 'Stand beside the stall'); return; }
    const gate = Stable.gateOf(map, f); if (!gate) return;
    map.setGate(gate.f.x, gate.f.y, !gate.open);
    this.pendingEvents.push({ type: 'door', tx: gate.f.x, ty: gate.f.y, open: !gate.open, grid: gridOf(p) });
  },

  /** For the snapshot: the open gates of the room this player is in (only when they changed, or the player came into a room). */
  gatesUpdateFor(id) {
    const p = this.players[id], grid = gridOf(p), map = grid ? this.mapOf(p) : null;
    const open = map && map.openGates ? [...map.openGates].sort() : [], key = grid ? grid + '|' + open.join(';') : '';
    this.gatesSent = this.gatesSent || {};
    if (this.gatesSent[id] === key) return null;
    this.gatesSent[id] = key;
    return grid ? open : null;
  }
});
