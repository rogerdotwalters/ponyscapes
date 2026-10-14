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
  BREED_SECONDS: 90,                                        // how long the rainbow bar takes to fill when two ponies breed
  BREED_REST: 240,                                          // seconds a pony needs to rest after a foal
  FOAL_SECONDS: 300,                                        // how long a foal takes to grow up (it is smaller, and cannot be ridden, until then)
  PET_CAP: 30,                                              // the most ponies one person can keep (foals included)
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
  /** Every stall has a name of its own (the button that opens its menu wears it): by its place in the stable's layout. */
  NAMES: ['Meadow', 'Clover', 'Willow', 'Maple', 'Sunny', 'Breeze', 'Hazel', 'Juniper', 'Poppy', 'Rowan', 'Thistle', 'Bramble'],
  stallName(map, f) {
    const L = Stable.layoutOf(map), i = L ? L.furniture.filter(g => (FurnitureDefs.get(g.id) || {}).stall).findIndex(g => g.x === f.x && g.y === f.y) : -1;
    return i < 0 ? 'Stall' : Stable.NAMES[i % Stable.NAMES.length] + (i >= Stable.NAMES.length ? ' ' + (Math.floor(i / Stable.NAMES.length) + 1) : '');
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
  /** A pony that is breeding right now cannot be taken out, moved, fed or petted until the foal is born (or the breeding is stopped). */
  locked: a => !!a && a.breedP !== undefined,
  describe: (a, pid) => ({ id: a.id, name: Stable.nameOf(a), level: a.level || 1, type: a.type, sex: a.look ? PonyLook.sexOf(a.look) : '', care: typeof PonyCare !== 'undefined' ? PonyCare.statsOf(a, pid) || undefined : undefined, locked: Stable.locked(a) || undefined })
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

  /** The stall button (client: the one wearing the stall's name): open that stall's menu. */
  _openStall(id, cmd) {
    const p = this.players[id]; if (!p || p.asleep || p.down > 0 || p.hp <= 0) return;
    this._useStall(id, p, { fx: cmd.fx | 0, fy: cmd.fy | 0 });
  },

  /** The interact key at a stall: send the menu (the gate, and the ponies you could put in, or the ponies you could take out). */
  _useStall(id, p, action) {
    const hit = this._roomPiece(p, action, d => d.stall); if (!hit) return;
    const f = hit.f, animals = this.animals.animals, inside = Stable.occupants(animals, p, f), gate = Stable.gateOf(this.mapOf(p), f);
    if (Stable.rectDist(f, p) > Stable.REACH + 0.4) return;
    const mode = inside.length ? 'out' : 'in', list = inside.length ? Stable.stalledHere(animals, p, id) : Stable.leashed(animals, p, id);
    const care = PonyCare.isOn(this), breeding = (this.breeding || {})[Stable.key(gridOf(p), f)];
    let addable = inside.length < Stable.CAPACITY ? Stable.leashed(animals, p, id) : [], cap = Stable.CAPACITY;
    if (care) { cap = this._stallCap(inside); addable = inside.length >= cap || breeding ? [] : this._guestsFor(inside, Stable.leashed(animals, p, id)); }       // (one pony per stall; a second only to breed)
    else if (breeding) addable = [];
    // (options / mode: the old single menu; inside / addable / cap: the whole stall at once, for the shared stall's menu)
    this.pendingEvents.push({ type: 'stallMenu', to: id, mode, fx: f.x, fy: f.y, name: Stable.stallName(this.mapOf(p), f), gate: gate ? { open: gate.open } : null, options: list.map(Stable.describe),
      inside: inside.filter(a => a.owner === id).map(a => Stable.describe(a, id)), others: inside.filter(a => a.owner !== id).length, addable: addable.map(a => Stable.describe(a, id)), cap,
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
    const grid = gridOf(p);
    if (cmd.act === 'gate') { this._useGate(id, p, map, cmd); return; }
    if (cmd.act === 'breed' || cmd.act === 'breedStop') { this._breedPick(id, p, map, cmd); return; }
    if (cmd.act === 'care') { this._carePick(id, p, map, cmd); return; }
    if (!a || a.owner !== id || (!sameGrid(a, p) && !a.stall)) return;
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
    if (inside.length !== 2 || inside.some(a => a.owner !== id)) return { can: false, reason: 'Breeding needs exactly two of your ponies in the stall: a stallion and a mare' };
    const [a, b] = inside, sexes = [PonyLook.sexOf(a.look), PonyLook.sexOf(b.look)].sort().join('');
    if (sexes !== 'fm') return { can: false, reason: 'It takes a stallion and a mare' };
    const young = inside.find(x => x.foal > 0); if (young) return { can: false, reason: `${Stable.nameOf(young)} is still a foal` };
    const tired = inside.find(x => x.breedRest > 0); if (tired) return { can: false, reason: `${Stable.nameOf(tired)} needs a rest first` };
    const mine = Object.values(this.animals.animals).filter(x => x.owner === id && AnimalDefs[x.type].pony).length;
    if (mine >= Stable.PET_CAP) return { can: false, reason: `You already keep ${Stable.PET_CAP} ponies` };
    return { can: true, reason: '' };
  },
  /** The Breed button (and Stop) in a stall's menu. */
  _breedPick(id, p, map, cmd) {
    const f = map.plan.layout.furniture.find(g => g.x === (cmd.fx | 0) && g.y === (cmd.fy | 0) && (FurnitureDefs.get(g.id) || {}).stall);
    if (!f || Stable.rectDist(f, p) > Stable.REACH + 0.8) { this._notice(id, 'Stand beside the stall'); return; }
    const key = Stable.key(gridOf(p), f), going = (this.breeding = this.breeding || {})[key];
    if (cmd.act === 'breedStop') { if (going && going.owner === id) this._breedEnd(key, 'The ponies settle down again'); return; }
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
      if (going.t >= Stable.BREED_SECONDS) { this._breedEnd(key); this._bornFoal(going.owner, pair[0], pair[1], f, k.grid); }
    }
  },
  /** A foal from a stallion and a mare: it gets its looks from them (each trait from either one, now and then something new), their variety, and a rarity at least as good as the better parent. */
  _foalLook(a, b) {
    const A = a.look || [0, 0, 0, 0, 0, 0, 0], B = b.look || A, r = () => this.rng(), pickParent = r() < 0.5 ? A : B, variant = pickParent[4] | 0;
    const V = variant ? PonyVariants[variant] : null, P = PonyPalette, size = { 0: V ? V.coats.length : P.coats.length, 1: V ? V.manes.length : P.manes.length, 2: V ? V.marks.length : P.marks.length, 3: V ? V.names.length : P.names.length };
    const same = [A, B].filter(l => (l[4] | 0) === variant);
    const trait = i => (r() < 0.1 ? Math.floor(r() * size[i]) : (() => { const l = same[Math.floor(r() * same.length)]; return (l[i] | 0) < size[i] ? l[i] | 0 : Math.floor(r() * size[i]); })());
    const look = [trait(0), trait(1), trait(2), Math.floor(r() * size[3]), variant];
    look.push(Math.min(RarityOrder.length - 1, Math.max(A[5] | 0, B[5] | 0) + (r() < 0.12 ? 1 : 0)), Math.floor(r() * 65536));
    return look;
  },
  _bornFoal(owner, a, b, f, grid) {
    const mares = [a, b].filter(x => PonyLook.sexOf(x.look) === 'f'), kinds = [a.type, b.type], type = a.type === 'pony_alicorn' && b.type === 'pony_alicorn' ? 'pony_alicorn' : kinds[Math.floor(this.rng() * 2)];
    const at = Stable.front(f, Math.floor(this.rng() * 8)), foal = this.animals.release(type, at.x, at.y, owner, undefined, { level: 1, variant: 0, grid });
    foal.look = this._foalLook(a, b); foal.foal = Stable.FOAL_SECONDS; foal.home = { x: at.x, y: at.y }; foal.leashed = false;
    for (const x of [a, b]) x.breedRest = Stable.BREED_REST;
    if (this.players[owner]) this._remember(owner, foal);
    const info = PonyLook.sexInfo(PonyLook.sexOf(foal.look)), name = Stable.nameOf(foal);
    if (this.players[owner]) this._notice(owner, `A foal is born! ${name} ${info.symbol} (${AnimalDefs[type].name})`);
    this.pendingEvents.push({ type: 'foalBorn', to: owner, animal: foal.id, x: at.x, y: at.y, grid, name });
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
