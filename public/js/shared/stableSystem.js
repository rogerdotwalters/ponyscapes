'use strict';
/* SHARED - the STABLE (data/buildings/pony_stable.js): a big building you walk into, with a room of your own (like a home, but open to all). Inside are walled STALLS
 * (furniture with `stall: true`, data/furniture/basic.js: a 4 x 4 pen), each with a GATE (furniture `gate: true`) in its front wall that opens by itself when anyone comes near and shuts again once they leave (never on someone standing in the pen or the gateway).
 *
 *   - Put a pony on a LEASH (the Leash button, like the lasso but for a pony that is already yours). Only a leashed pony can be stabled.
 *   - Stand beside an empty stall and press the interact key: a menu lists the ponies you have on a leash (and the gate); pick one and it goes in.
 *   - Beside a stall with a pony in it the key opens the menu of the ponies in this stable: TAKE OUT (it stands in front of the gate, free) or LET OUT
 *     (it goes out to the village and roams the village area only).
 *   - Walk up to a stabled pony holding an apple and press the key to feed it.
 *   - The same menu has a button to open or shut the stall's gate. A shut gate blocks you; a pony in a stall keeps to its own pen and potters about in it.
 * In multiplayer the whole party shares the HOST's stable (interiorSystem.gridFor), and the host decides what each guest may do there: 'full' (all of it), 'default' (feed, water and breed; stable and take out their own ponies) or 'none'.
 * A stalled pony (`a.stall`, its key: room grid and stall tile) does not follow you through doors and is not ridden until it is taken out; it is saved with the world. */
const Stable = {
  REACH: 2.6,                                               // how close to a stall (tiles, from its edge) the key reaches it
  GATE_REACH: 1.25,                                         // ... and to a gate
  BREED_SECONDS: 90,                                        // how long the rainbow bar takes to fill when two ponies breed
  BREED_REST: 240,                                          // seconds a pony needs to rest after a foal (the cooldown shown beside the pony and on the Breed button)
  GATE_NEAR: 1.7,                                           // a gate swings open when anyone is this close (tiles from its middle)
  FOAL_SECONDS: 300,                                        // how long a foal takes to grow up (it is smaller, and cannot be ridden, until then)
  CAPACITY: 4,                                              // ponies that can share one stall
  /** Where the ponies in a pen stand (the four corners of the middle of a 4 x 4 pen), as offsets from the stall's top-left corner. */
  SLOTS: [[1.0, 1.7], [3.0, 1.7], [1.0, 3.1], [3.0, 3.1]],
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
  /** Every stall has a name of its own: "Stable 1", "Stable 2" ... by its place in the stable's layout, until its owner renames it (map.stallNames, kept by the server and sent with the snapshot). */
  NAME_MAX: 16,
  cleanName: raw => String(raw == null ? '' : raw).replace(/[^A-Za-z0-9 '\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, Stable.NAME_MAX),
  stallName(map, f) {
    const custom = map && map.stallNames && map.stallNames[f.x + ',' + f.y];
    if (custom) return custom;
    const L = Stable.layoutOf(map), i = L ? L.furniture.filter(g => (FurnitureDefs.get(g.id) || {}).stall).findIndex(g => g.x === f.x && g.y === f.y) : -1;
    return i < 0 ? 'Stable' : 'Stable ' + (i + 1);
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
  /** Where a pony stands when it is put in a stall: the first free corner of the pen (given the ponies already in it), else the middle. */
  spot(f, others = []) {
    const slots = Stable.SLOTS.map(([dx, dy]) => ({ x: f.x + dx * f.w / 4, y: f.y + dy * f.h / 4 }));
    const free = slots.find(sl => !others.some(o => Math.hypot((o.stallAt || o).x - sl.x, (o.stallAt || o).y - sl.y) < 0.9));
    return free || { x: f.x + f.w / 2, y: f.y + f.h / 2 };
  },
  /** Where a pony taken out is put: in the aisle, just in front of the stall's gate. */
  front: (f, k = 0) => ({ x: f.x + 1.0 + (k % 4) * 0.8, y: f.y + f.h + 1.4 + (Math.floor(k / 4) % 2) * 0.5 }),
  /** The pony standing in this stall (an animal with `stall` set, inside it), or null. */
  occupant(animals, p, f) { return Stable.occupants(animals, p, f)[0] || null; },
  /** Every pony standing in this stall (up to CAPACITY of them). */
  occupants(animals, p, f) {
    const out = [];
    for (const id in animals) { const a = animals[id]; if (a.stall && sameGrid(a, p) && a.x >= f.x && a.x <= f.x + f.w && a.y >= f.y && a.y <= f.y + f.h) out.push(a); }
    return out;
  },
  /** Every pony of yours in a stall of this room. */
  stalledHere(animals, p, selfId) {                         // (selfId null: everyone's)
    const prefix = gridOf(p) + '|', out = [];
    for (const id in animals) { const a = animals[id]; if ((selfId === null || a.owner === selfId) && a.stall && a.stall.startsWith(prefix)) out.push(a); }
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
  /** A pony that is breeding right now cannot be taken out, moved, fed or petted until the foal is born (or the breeding is stopped). */
  locked: a => !!a && a.breedP !== undefined,
  /** Seconds as "3:05" (a cooldown clock). */
  clock: t => { const s = Math.max(0, Math.ceil(t)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  /** A foal's approximate age in whole minutes (it is born when `foal` is FOAL_SECONDS and grown up at 0); 0 for a newborn. */
  ageMin: a => (a && a.foal > 0 ? Math.max(0, Math.floor((Stable.FOAL_SECONDS - a.foal) / 60)) : 0),
  describe: (a, pid) => ({ id: a.id, age: a.foal > 0 ? Stable.ageMin(a) : undefined, rest: a.breedRest > 0 ? Math.ceil(a.breedRest) : undefined, name: Stable.nameOf(a), level: a.level || 1, type: a.type, sex: a.look ? PonyLook.sexOf(a.look) : '', care: typeof PonyCare !== 'undefined' ? PonyCare.statsOf(a, pid) || undefined : undefined, locked: Stable.locked(a) || undefined })
};

/** What the interact key does in a stable (client + server): feed a stabled pony you hold an apple for, else a stall's menu. */
function findStall(map, p, heldItemId, animals = {}, selfId = p.id) {
  if (p.asleep || !Stable.layoutOf(map)) return null;
  const [hit] = Stable.stallsNear(map, p);
  if (!hit) return null;
  const occs = Stable.occupants(animals, p, hit.f), occ = occs.filter(o => o.owner === selfId && !Stable.locked(o)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  if (occ && ItemDB.isApple(heldItemId) && Math.hypot(occ.x - p.x, occ.y - p.y) <= Stable.FEED_REACH) return { kind: 'stallFeed', label: `Feed ${Stable.nameOf(occ)}`, dist: hit.dist - 0.5, animal: occ };
  const name = Stable.stallName(map, hit.f), label = `${name}: ${!occs.length ? 'stable a pony' : 'stable menu'}`;
  return { kind: 'stall', mode: occs.length ? 'out' : 'in', label, name, dist: hit.dist, fx: hit.f.x, fy: hit.f.y };
}
Interactions.extra.push(findStall);
InteractionHandlers.stall = (server, id, p, action) => server._useStall(id, p, action);
InteractionHandlers.stallFeed = (server, id, p, action) => { const a = server.animals.animals[action.animal.id]; if (a && a.stall && server._stableAccess(id) !== 'none') server._giveApple(id, p.held, a); };

Object.assign(GameServer.prototype, {
  /* ---------------------------------------- who may do what in the (shared) stable ---------------------------------------- */
  /** What this player may do in the stable: 'full' (the host always), 'default' (feed, water, breed, and stable / take out their own ponies) or 'none'. Set by the host per player (kept by player key, saved with the world). */
  _stableAccess(id) {
    if (id === this.hostId || !this.hostId) return 'full';
    const level = (this.interiors.stableAcl || {})[this.playerKeys[id] || 'seat:' + id];
    return level === 'none' || level === 'full' ? level : 'default';
  },
  /** May this player stable / take out / let out this pony? Their own, or anyone's with full access. */
  _canManage(id, a) { const lv = this._stableAccess(id); return lv === 'full' || (lv === 'default' && a.owner === id); },
  /** The host sets a guest's access (from the stable desk): cmd = { target: player id, level: 'none' | 'default' | 'full' }. */
  _setStableAccess(id, cmd) {
    const t = this.players[cmd.target], level = ['none', 'default', 'full'].includes(cmd.level) ? cmd.level : null;
    if (id !== this.hostId || !t || !level || cmd.target === this.hostId) return;
    const key = this.playerKeys[cmd.target] || 'seat:' + cmd.target, acl = this.interiors.stableAcl = this.interiors.stableAcl || {};
    if (level === 'default') delete acl[key]; else acl[key] = level;
    const site = Grids.siteOf(gridOf(t));
    if (level === 'none' && site && site.def.stable) this.interiors.leave(cmd.target, t);                // (shut out: walked back to the door)
    this._notice(cmd.target, level === 'none' ? 'The host has closed the stable to you' : level === 'full' ? 'The host gave you full access to the stable' : 'You may feed, water and breed in the stable');
    this._notice(id, `${t.name || 'Player'}: stable access ${level === 'default' ? 'default (feed, water, breed)' : level}`);
  },
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

  /** Make the room's map carry the stall names the server keeps for it (so Stable.stallName sees them). */
  _syncStallNames(p) {
    const grid = gridOf(p), map = grid ? this.mapOf(p) : null;
    if (!map || !Stable.layoutOf(map)) return null;
    this.stallNames = this.stallNames || {};
    return (map.stallNames = this.stallNames[grid] || (this.stallNames[grid] = {}));
  },
  /** Rename a stall from its menu (an empty name goes back to "Stable N"). Your own stable only. */
  _renameStall(id, p, map, cmd) {
    if (this._stableAccess(id) !== 'full') { this._notice(id, 'Only the host (or a player with full access) can rename stalls'); return; }
    const f = map.plan.layout.furniture.find(g => g.x === (cmd.fx | 0) && g.y === (cmd.fy | 0) && (FurnitureDefs.get(g.id) || {}).stall);
    if (!f || Stable.rectDist(f, p) > Stable.REACH + 0.8) { this._notice(id, 'Stand beside the stall'); return; }
    if (!this._isMyStable(id, gridOf(p))) { this._notice(id, 'This is not your stable'); return; }
    const names = this._syncStallNames(p), key = f.x + ',' + f.y, name = Stable.cleanName(cmd.what);
    if (name) names[key] = name; else delete names[key];
    this._notice(id, name ? `The stall is now called ${name}` : 'The stall has its number back');
    this.namesRev = (this.namesRev || 0) + 1;
    this._useStall(id, p, { fx: f.x, fy: f.y });
  },
  /** For the snapshot: the stall names of the room this player is in (only when they changed, or the player came into a room). */
  stallNamesUpdateFor(id) {
    const p = this.players[id], names = p ? this._syncStallNames(p) : null, key = names ? gridOf(p) + '|' + JSON.stringify(names) : '';
    this.namesSent = this.namesSent || {};
    if (this.namesSent[id] === key) return null;
    this.namesSent[id] = key;
    return names ? Object.assign({}, names) : null;
  },

  /** The stall button (client: the one wearing the stall's name): open that stall's menu. */
  _openStall(id, cmd) {
    const p = this.players[id]; if (!p || p.asleep || p.down > 0 || p.hp <= 0) return;
    this._useStall(id, p, { fx: cmd.fx | 0, fy: cmd.fy | 0 });
  },

  /** The interact key at a stall: send the menu (the gate, and the ponies you could put in, or the ponies you could take out). */
  _useStall(id, p, action) {
    this._syncStallNames(p);
    if (this._stableAccess(id) === 'none') { this._notice(id, 'The host has not given you access to this stable'); return; }
    const hit = this._roomPiece(p, action, d => d.stall); if (!hit) return;
    const f = hit.f, animals = this.animals.animals, inside = Stable.occupants(animals, p, f), gate = Stable.gateOf(this.mapOf(p), f);
    if (Stable.rectDist(f, p) > Stable.REACH + 0.4) return;
    const mode = inside.length ? 'out' : 'in', list = inside.length ? Stable.stalledHere(animals, p, this._stableAccess(id) === 'full' ? null : id) : Stable.leashed(animals, p, id);
    const care = PonyCare.isOn(this), breeding = (this.breeding || {})[Stable.key(gridOf(p), f)];
    let addable = inside.length < Stable.CAPACITY ? Stable.leashed(animals, p, id) : [], cap = Stable.CAPACITY;
    if (care) { cap = this._stallCap(inside); addable = inside.length >= cap || breeding ? [] : this._guestsFor(inside, Stable.leashed(animals, p, id)); }       // (one pony per stall; a second only to breed)
    else if (breeding) addable = [];
    // (options / mode: the old single menu; inside / addable / cap: the whole stall at once, for the shared stall's menu)
    this.pendingEvents.push({ type: 'stallMenu', to: id, mode, fx: f.x, fy: f.y, name: Stable.stallName(this.mapOf(p), f), gate: gate ? { open: gate.open } : null, options: list.map(Stable.describe),
      inside: inside.map(a => Object.assign(Stable.describe(a, id), { manage: this._canManage(id, a) })), others: 0, addable: addable.map(a => Stable.describe(a, id)), cap,
      breed: this._breedInfo(id, p, f, inside), care: this._careMenu(id, p, f, inside) });
  },

  /** With pony care on, a stall holds ONE pony (its bowls are its own); a second joins only to breed. */
  _stallCap: inside => (inside.length ? 2 : 1),
  /** The leashed ponies that could join the one in the stall: the opposite sex, for breeding. */
  _guestsFor(inside, leashed) {
    if (!inside.length) return leashed;
    if (inside.length !== 1) return [];
    const sex = PonyCare.sexOf(inside[0]);
    return leashed.filter(x => { const s = PonyCare.sexOf(x); return s && sex && s !== sex; });
  },

  /** A choice in the stall menu: act = 'in' (put the pony in the stall at fx, fy), 'out' (take it out in front of its gate) or 'roam' (let it out into the village). */
  _stallPick(id, cmd) {
    const p = this.players[id], map = p && this.mapOf(p), animals = this.animals.animals, a = animals[cmd.animal];
    if (!p || !Stable.layoutOf(map) || p.asleep) return;
    if (this._stableAccess(id) === 'none') { this._notice(id, 'The host has not given you access to this stable'); return; }
    const grid = gridOf(p);
    if (cmd.act === 'breed' || cmd.act === 'breedStop') { this._breedPick(id, p, map, cmd); return; }
    if (cmd.act === 'care') { this._carePick(id, p, map, cmd); return; }
    if (cmd.act === 'rename') { this._renameStall(id, p, map, cmd); return; }
    if (!a || !this._canManage(id, a) || (!sameGrid(a, p) && !a.stall)) return;
    if (cmd.act === 'in') {
      const f = map.plan.layout.furniture.find(g => g.x === (cmd.fx | 0) && g.y === (cmd.fy | 0) && (FurnitureDefs.get(g.id) || {}).stall);
      if (!f || Stable.rectDist(f, p) > Stable.REACH + 0.8) { this._notice(id, 'Stand beside the stall'); return; }
      const sharing = Stable.occupants(animals, p, f), care = PonyCare.isOn(this);
      if ((this.breeding || {})[Stable.key(grid, f)]) { this._notice(id, 'The ponies in that stall are breeding: leave them be'); return; }
      const cap = care ? this._stallCap(sharing) : Stable.CAPACITY;
      if (sharing.length >= cap) { this._notice(id, care ? 'Every pony needs its own stall (a second one only joins to breed)' : `That stall is full (${Stable.CAPACITY} ponies)`); return; }
      if (care && sharing.length === 1 && !this._guestsFor(sharing, [a]).length) { this._notice(id, 'Every pony needs its own stall: only a stallion and a mare can share one, to breed'); return; }
      if (!Stable.leashed(animals, p, id).includes(a)) { this._notice(id, 'Only a pony on a leash can be stabled'); return; }
      const at = Stable.spot(f, sharing);
      Object.assign(a, { stall: Stable.key(grid, f), stallAt: at, stallBox: Stable.box(f), x: at.x, y: at.y, vx: 0, vy: 0, leashed: false, rider: '', home: at, state: 'idle', facing: Math.PI / 2 });
      delete a.roam;
      if (a.main) { a.main = false; this._notice(id, `${Stable.nameOf(a)} is no longer your main pony: set it again after taking it out`); }
      this._notice(id, `${Stable.nameOf(a)} settles into the stall`);
      this.pendingEvents.push({ type: 'stalled', to: id, animal: a.id, x: at.x, y: at.y, grid });
      return;
    }
    if (!a.stall || !a.stall.startsWith(grid + '|')) return;                                 // (only from inside the stable the pony is in)
    if (Stable.locked(a)) { this._notice(id, `${Stable.nameOf(a)} is breeding: leave the pair alone until the foal is born (or stop the breeding)`); return; }
    const f = Stable.pieceOfKey(a.stall), name = Stable.nameOf(a);
    delete a.stall; delete a.stallAt; delete a.stallBox; a.vx = a.vy = 0; a.state = 'idle'; a.leashed = false;
    if (cmd.act === 'roam') {                                                                // out of the door: into the village, to roam there
      const site = Grids.siteOf(grid), at = site ? { x: site.frontX + 0.5 + (this.rng() - 0.5) * 1.5, y: site.frontY + 1.2 } : { x: p.x, y: p.y };
      delete a.grid; Object.assign(a, { x: at.x, y: at.y, home: { x: at.x, y: at.y }, roam: true });
      this._notice(id, `${name} trots out into the village`);
      this.pendingEvents.push({ type: 'unstalled', to: id, animal: a.id, x: p.x, y: p.y, grid, roam: true });
      return;
    }
    const at = f ? Stable.front(f, Math.floor(this.rng() * 8)) : { x: p.x, y: p.y };
    Object.assign(a, { x: at.x, y: at.y, home: { x: at.x, y: at.y } });
    this._notice(id, `${name} is out of the stall`);
    this.pendingEvents.push({ type: 'unstalled', to: id, animal: a.id, x: at.x, y: at.y, grid });
  },

  /* ---------------------------------------- breeding: two ponies alone in a stall, a stallion and a mare ---------------------------------------- */
  /** Can the ponies in this stall breed now? { can, reason, pct } (pct: how far the rainbow bar is, or null when nothing is going on). Needs exactly two ponies of yours: a stallion and a mare. */
  _breedInfo(id, p, f, inside) {
    const key = Stable.key(gridOf(p), f), going = (this.breeding || {})[key];
    if (going) return { can: false, busy: true, reason: 'Breeding', pct: Math.round(going.t / Stable.BREED_SECONDS * 100) };
    if (inside.length !== 2 || inside.some(a => !a.owner)) return { can: false, reason: 'Breeding needs exactly two ponies in the stall: a stallion and a mare' };
    const [a, b] = inside, sexes = [PonyLook.sexOf(a.look), PonyLook.sexOf(b.look)].sort().join('');
    if (sexes !== 'fm') return { can: false, reason: 'It takes a stallion and a mare' };
    const pair = this._pairView(a, b);
    pair.cross = this._crossView(a, b);
    const young = inside.find(x => x.foal > 0); if (young) return { can: false, reason: `${Stable.nameOf(young)} is still a foal (about ${Stable.ageMin(young)} min old)`, pair };
    const tired = inside.find(x => x.breedRest > 0); if (tired) return { can: false, reason: `${Stable.nameOf(tired)} needs a rest first (${Stable.clock(tired.breedRest)} left)`, pair, rest: Math.ceil(Math.max(...inside.map(x => x.breedRest || 0))) };
    const keeper = (inside.find(x => PonyLook.sexOf(x.look) === 'f') || a).owner;                       // (the foal goes to the mare's owner, who needs the room)
    const mine = Object.values(this.animals.animals).filter(x => x.owner === keeper && AnimalDefs[x.type].pony).length;
    const cap = this._ponyCapOf(keeper);
    if (mine >= cap) return { can: false, reason: `You already keep ${cap} ponies: upgrade your stable at the desk`, pair };
    return { can: true, reason: '', pair };
  },
  /** The Breed button (and Stop) in a stall's menu. */
  _breedPick(id, p, map, cmd) {
    const f = map.plan.layout.furniture.find(g => g.x === (cmd.fx | 0) && g.y === (cmd.fy | 0) && (FurnitureDefs.get(g.id) || {}).stall);
    if (!f || Stable.rectDist(f, p) > Stable.REACH + 0.8) { this._notice(id, 'Stand beside the stall'); return; }
    const key = Stable.key(gridOf(p), f), going = (this.breeding = this.breeding || {})[key];
    if (cmd.act === 'breedStop') { if (going && (going.owner === id || this._stableAccess(id) === 'full')) this._breedEnd(key, 'The ponies settle down again'); return; }
    if (going) return;
    const inside = Stable.occupants(this.animals.animals, p, f), info = this._breedInfo(id, p, f, inside);
    if (!info.can) { this._notice(id, info.reason); return; }
    this.breeding[key] = { owner: id, ids: inside.map(a => a.id), t: 0 };
    for (const a of inside) a.breedP = 0;
    this._notice(id, 'The pair nuzzle each other... the bar fills as they bond');
    this.pendingEvents.push({ type: 'breedStart', to: id, x: f.x + f.w / 2, y: f.y + f.h / 2, grid: gridOf(p) });
  },
  _breedEnd(key, why) {
    const going = this.breeding && this.breeding[key]; if (!going) return;
    for (const aid of going.ids) { const a = this.animals.animals[aid]; if (a) delete a.breedP; }
    delete this.breeding[key];
    if (why && this.players[going.owner]) this._notice(going.owner, why);
  },
  /** Every tick: the bars fill, a pair that is no longer alone in its stall stops, a full bar brings a foal; foals grow and tired ponies rest. */
  _breedTick(dt) {
    const animals = this.animals.animals;
    for (const aid in animals) { const a = animals[aid]; if (a.foal > 0) a.foal = Math.max(0, a.foal - dt); if (a.breedRest > 0) a.breedRest = Math.max(0, a.breedRest - dt); }
    for (const key of Object.keys(this.breeding || {})) {
      const going = this.breeding[key], k = Stable.parseKey(key), f = Stable.pieceOfKey(key), pair = going.ids.map(i => animals[i]);
      const inside = f && k ? Stable.occupants(animals, { grid: k.grid }, f) : [];
      if (!f || pair.some(a => !a) || inside.length !== 2 || !pair.every(a => inside.includes(a))) { this._breedEnd(key, 'The breeding stops: the stall must hold just the two ponies'); continue; }
      going.t += dt;
      for (const a of pair) a.breedP = Math.min(1, going.t / Stable.BREED_SECONDS);
      if (going.t >= Stable.BREED_SECONDS) { this._breedEnd(key); const mare = pair.find(x => PonyLook.sexOf(x.look) === 'f') || pair[0]; this._bornFoal(mare.owner, pair[0], pair[1], f, k.grid); if (going.owner !== mare.owner && this.players[going.owner]) this._notice(going.owner, 'A foal is born! It belongs to the mare\'s owner'); }
    }
  },
  /** A foal from a stallion and a mare: its genes come from them, one allele of each gene from each parent (PonyGenes.inherit: so a trait both carry can come out, and now and then something new),
   *  its cutie mark from either, their variety, and a rarity at least as good as the better parent. */
  _foalLook(a, b) {
    const A = a.look || [0, 0, 0, 0, 0, 0, 0], B = b.look || A, r = () => this.rng(), pickParent = r() < 0.5 ? A : B;
    const idOf = l => (PonyVariants[l[4] | 0] || PonyVariants[0]).id, hybrid = Hybrids.cross(r, idOf(A), idOf(B)), variant = hybrid ? Hybrids.variantIndex(hybrid.id) : pickParent[4] | 0;   // (a recipe's hybrid: shared/hybrids.js)
    const V = variant ? PonyVariants[variant] : null, P = PonyPalette, marks = (V || P).marks.length, names = PonyNames.count(V);
    const same = [A, B].filter(l => (l[4] | 0) === variant);
    const mark = r() < 0.1 || !same.length ? Math.floor(r() * marks) : (() => { const l = same[Math.floor(r() * same.length)]; return (l[2] | 0) < marks ? l[2] | 0 : Math.floor(r() * marks); })();
    const look = [0, 0, mark, Math.floor(r() * names), variant];
    look.push(Math.min(RarityOrder.length - 1, Math.max(A[5] | 0, B[5] | 0, hybrid ? rarityOf(hybrid.rarity).order : 0) + (r() < 0.12 ? 1 : 0)), Math.floor(r() * 65536));
    look.push(...ColorBreeding.apply(r, A, B, variant, PonyGenes.inherit(r, A, B, variant)));                                // (blues deepen, red and blue make purple ...: shared/colorBreeding.js)
    return PonyGenes.sync(look);                                                              // (the coat and mane slots show what the genes say)
  },
  _bornFoal(owner, a, b, f, grid) {
    const look = this._foalLook(a, b), kinds = [a.type, b.type], bound = SkyPonies.kindOfVariant(look[4]);                  // (a moon, sky or hybrid variety is always its own kind of pony)
    const free = kinds.filter(k => !SkyPonies.isBound(k)), crossed = bound || free.length < 2 ? null : Hybrids.kindCross(() => this.rng(), a.type, b.type);   // (a pegasus and a unicorn may have an alicorn: shared/hybrids.js)
    const type = bound || crossed || (a.type === 'pony_alicorn' && b.type === 'pony_alicorn' ? 'pony_alicorn' : free.length ? free[Math.floor(this.rng() * free.length)] : 'pony_plain');
    const at = Stable.front(f, Math.floor(this.rng() * 8)), foal = this.animals.release(type, at.x, at.y, owner, undefined, { level: 1, variant: 0, grid });
    foal.look = look; foal.foal = Stable.FOAL_SECONDS; foal.home = { x: at.x, y: at.y }; foal.leashed = false;
    for (const x of [a, b]) x.breedRest = Stable.BREED_REST;
    if (this.players[owner]) this._remember(owner, foal);
    const info = PonyLook.sexInfo(PonyLook.sexOf(foal.look)), name = Stable.nameOf(foal);
    foal.ped = Pedigree.foalNode(() => this.rng(), a, b, name, PonyLook.sexOf(foal.look), PonyVariants[look[4] | 0].id);                                // (its family tree: both parents' trees, five generations deep: shared/ponyPedigree.js)
    const rep = Pedigree.reportOf(foal), inbred = rep.F > 1e-9 ? ` Inbreeding ${Pedigree.pct(rep.F)}%.` : '';
    const pv = [a, b].map(x => (x.look ? x.look[4] | 0 : 0)), isNew = Hybrids.isHybrid(PonyVariants[look[4] | 0].id) && !pv.includes(look[4] | 0), hy = HybridTable.get(PonyVariants[look[4] | 0].id);
    if (isNew) this._dropOnGround(PonyCoins.itemOf(hy.id), 1, at.x, at.y, grid);                                         // (a hybrid is never wild: its collector coin comes with its first foal)
    else if (crossed && this.players[owner]) this._notice(owner, `${AnimalDefs[type].name}! A new kind of pony`);
    const mi = PonyGenes.express(look).mutation, seen = [a, b].map(x => (x.look ? PonyGenes.express(x.look).mutation : 0)), mut = mi && !seen.includes(mi) ? PonyGenes.MUTATIONS[mi - 1] : null;     // (a mutation that shows and neither parent had)
    const tl = PonyGenes.express(look).trail, pt = Math.max(...[a, b].map(x => (x.look ? PonyGenes.express(x.look).trail : 0)));
    if (tl > pt && tl >= 2 && this.players[owner]) this._notice(owner, `${name} lays a ${PonyGenes.LOCI[PonyGenes.at('trail')].alleles[tl].name.toLowerCase()}: grander than either parent's!`);                  // (a trail that two strong parents intensified)
    if (mut && this.players[owner]) this._notice(owner, `MUTATION! ${name} was born with the ${mut.name} mutation: ${mut.desc}. It can pass it on`);
    if (this.players[owner]) this._notice(owner, isNew ? `HYBRID! ${PonyVariants[look[4] | 0].name} ${AnimalDefs[type].name}: ${name} ${info.symbol} is a brand new kind. Diversity ${rep.rating.grade}.${inbred}` : `A foal is born! ${name} ${info.symbol} (${AnimalDefs[type].name}). Diversity ${rep.rating.grade} (${rep.rating.word}).${inbred}`);
    this.pendingEvents.push({ type: 'foalBorn', to: owner, animal: foal.id, x: at.x, y: at.y, grid, name, hybrid: isNew ? hy.name : undefined, mutation: mut ? mut.name : undefined });
  },

  /* ---------------------------------------- pedigrees: family trees, inbreeding and the diversity rating (shared/ponyPedigree.js) ---------------------------------------- */
  /** The ratings of a mating as the stall menu shows them (numbers rounded; the client decides how much of it to show). */
  _pairView(a, b) {
    const r = Pedigree.pairReport(a, b, () => this.rng()), P = Pedigree.pct;
    return { f: P(r.F), rel: P(r.R, 1), het: P(r.het, 0), score: r.rating.score, grade: r.rating.grade, word: r.rating.word, color: r.rating.color, band: r.rating.band.name, note: r.rating.band.note, depth: r.depth, tooClose: r.tooClose,
      shared: r.shared.map(s => ({ gene: s.gene, allele: s.allele.name, color: s.allele.color, chance: P(s.chance, 0) })), common: r.common.map(c => ({ name: c.name, sex: c.sex, up: c.up })) };
  },
  /** What two ponies could make besides a copy of a parent: hybrids (by their varieties) and new kinds (by their kinds), with the chance of each per foal. */
  _crossView(a, b) {
    const idOf = x => (PonyVariants[(x.look && x.look[4]) | 0] || PonyVariants[0]).id, P = Pedigree.pct;
    const hybrids = Hybrids.possible(idOf(a), idOf(b)).map(h => ({ name: h.name, chance: P(h.chance, 0), rarity: h.rarity, color: rarityOf(h.rarity).color }));
    const kinds = SkyPonies.isBound(a.type) || SkyPonies.isBound(b.type) ? [] : Hybrids.kindOptions(a.type, b.type).map(k => ({ name: k.name, chance: P(k.chance, 1) }));
    const colors = ColorBreeding.forecast(a.look || [0, 0, 0, 0, 0, 0, 0], b.look || a.look || [0, 0, 0, 0, 0, 0, 0]);
    const trail = ColorBreeding.forecastTrail(a.look || [0, 0, 0, 0, 0, 0, 0], b.look || a.look || [0, 0, 0, 0, 0, 0, 0], colors[1].result ? [colors[1].result.color] : null);
    trail.chances = trail.chances.map(c => ({ level: c.level, name: c.name, chance: Pedigree.pct(c.chance, 0) }));
    return { hybrids, kinds, colors, trail, from: [PonyVariants[(a.look && a.look[4]) | 0].name, PonyVariants[(b.look && b.look[4]) | 0].name] };
  },
  /** A pony's family tree, genes and descendants (the Pony Book's Family tree button). */
  _lineage(id, aid) {
    const a = this.animals.animals[aid];
    if (!a || a.owner !== id || !a.look || !AnimalDefs[a.type].pony) return;
    const ped = Pedigree.ensure(a, () => this.rng()), rep = Pedigree.reportOf(a), P = Pedigree.pct, g = Pedigree.graph(ped);
    const common = ped[Pedigree.S] && ped[Pedigree.D] ? Pedigree.commonAncestors(g, ped[Pedigree.S][0], ped[Pedigree.D][0]).map(c => ({ name: c.name, sex: c.sex, up: c.up })) : [];
    const kids = [];
    for (const x of Object.values(this.animals.animals)) {
      if (x === a || x.owner !== id || !x.ped) continue;
      const up = Pedigree.depthOfAncestor(x.ped, ped[Pedigree.U]); if (up) kids.push({ id: x.id, name: Stable.nameOf(x), sex: PonyLook.sexOf(x.look), up });
    }
    kids.sort((p, q) => p.up - q.up);
    this.pendingEvents.push({ type: 'lineage', to: id, animal: aid, name: Stable.nameOf(a), sex: PonyLook.sexOf(a.look), tree: ped, kids,
      f: P(rep.F), rel: P(Math.min(1, 2 * rep.F), 1), het: P(rep.het, 0), score: rep.rating.score, grade: rep.rating.grade, word: rep.rating.word, color: rep.rating.color, band: rep.rating.band.name, note: rep.rating.band.note, common,
      known: rep.known, gens: rep.gens, founder: rep.founder });
  },
  /** The diversity of everything the player keeps (the Pony Book's herd card). */
  _herdGenetics(id) {
    const mine = Object.values(this.animals.animals).filter(x => x.owner === id && x.look && AnimalDefs[x.type].pony), r = Pedigree.herdReport(mine, () => this.rng()), P = Pedigree.pct;
    this.pendingEvents.push({ type: 'herdGenetics', to: id, herd: r ? { n: r.n, mk: P(r.meanKinship), ne: Math.round(r.ne * 10) / 10, founders: r.founders, fe: Math.round(r.effectiveFounders * 10) / 10, rich: Math.round(r.richness * 10) / 10,
      he: P(r.he, 0), ho: P(r.ho, 0), fis: P(r.fis, 0), meanF: P(r.meanF), score: r.score, grade: r.grade, word: r.word, color: r.color } : null });
  },

  /** Every tick the gates of every stable with someone in it swing by themselves: open while a player is near, shut again when they have gone. A gate never shuts on a player in the gateway or in the pen. */
  _gateTick() {
    const seen = {};
    for (const p of Object.values(this.players)) {
      const grid = gridOf(p); if (!grid || seen[grid]) continue;
      seen[grid] = 1;
      const map = this.mapOf(p), L = map && map.setGate ? Stable.layoutOf(map) : null; if (!L) continue;
      const here = Object.values(this.players).filter(q => gridOf(q) === grid && q.hp > 0);
      for (const f of L.furniture) {
        if (!(FurnitureDefs.get(f.id) || {}).stall) continue;
        const gate = Stable.gateOf(map, f); if (!gate) continue;
        const gx = gate.f.x + 0.5, gy = gate.f.y + 0.5;
        const stuck = here.some(q => (q.x >= f.x - 0.4 && q.x <= f.x + f.w + 0.4 && q.y >= f.y - 0.4 && q.y <= f.y + f.h + 0.4) || (Math.abs(q.x - gx) < 0.9 && Math.abs(q.y - gy) < 0.9));
        const want = stuck || here.some(q => Math.hypot(q.x - gx, q.y - gy) <= Stable.GATE_NEAR);
        if (want !== gate.open) { map.setGate(gate.f.x, gate.f.y, want); this.pendingEvents.push({ type: 'door', tx: gate.f.x, ty: gate.f.y, open: want, grid }); }
      }
    }
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
