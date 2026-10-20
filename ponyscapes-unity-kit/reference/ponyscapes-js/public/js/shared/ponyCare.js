'use strict';
/* SHARED (server) - PONY CARE: food, water, happiness and friendship for every pony you own. Everything is switched on by the host (Dev settings > Pony care, `settings.ponyCare`, OFF by
 * default) and every number is in CONFIG.sim.ponyCare (config.js) so it can be tested and tuned.
 *
 *   - Every owned pony has HUNGER and THIRST (100 = full) that drain all the time, and HAPPINESS. A pony in a stall eats and drinks from the bowls of its own stall; one outside drinks beside water
 *     and can be hand-fed apples.  Each pony needs its OWN stall (a second pony is allowed in only to breed: a stallion with a mare).
 *   - Fed and watered ponies grow happier (faster in a comfier stall). Hungry or thirsty ones grow unhappy. Unhappy for too long and the friendship drops; keep losing it while still unhappy and the pony runs away.
 *   - Manual first: you fill a stall's bowls (apples for food; a watering can or jugs of water for water). Then you can pay to AUTOMATE a stall: the desk's water / food TANK feeds it. A tank supplies
 *     a limited number of stalls: buy a tank once, automate stalls one by one, and buy more / bigger tanks when you run out.
 *   - The STABLE DESK (furniture `desk: true`) is the bank for your pony coins (they pay for every upgrade) and the office where tanks are bought.
 * State: this.care[roomGrid] = { tanks: { water: { size, count }, food: { size, count } }, stalls: { 'x,y': { fl, wl, cl, food, water, af, aw } } } (saved with the world, interiorSystem.js);
 * a pony carries hunger / thirst / happy / lowT / drops (saved with it, serverOwned.js). */
const PonyCare = {
  cfg: () => CONFIG.sim.ponyCare,
  isOn: server => !!(server.settings && server.settings.ponyCare),
  KINDS: ['food', 'water'],
  /** Give a pony its care numbers (a pony from before the system, or a new one, starts fed and content). */
  ensure(a) {
    const C = PonyCare.cfg();
    if (a.hunger === undefined) { a.hunger = C.hunger.max; a.thirst = C.thirst.max; a.happy = C.happiness.start; a.lowT = 0; a.drops = 0; }
    return a;
  },
  /** The pony coins in an Inventory (any variety). */
  coins: inv => (inv ? PonyCoins.ids.reduce((n, v) => n + inv.count(PonyCoins.itemOf(v)), 0) : 0),
  /** Take `n` pony coins out of an Inventory (the most plentiful variety first). False, and nothing taken, if there are not enough. */
  pay(inv, n) {
    if (!inv || PonyCare.coins(inv) < n) return false;
    let left = n;
    for (const v of PonyCoins.ids.slice().sort((a, b) => inv.count(PonyCoins.itemOf(b)) - inv.count(PonyCoins.itemOf(a)))) {
      const item = PonyCoins.itemOf(v), k = Math.min(left, inv.count(item));
      if (k > 0) { inv.remove(item, k); left -= k; }
      if (!left) break;
    }
    return true;
  },
  blankStall: () => ({ fl: 0, wl: 0, cl: 0, food: 0, water: 0, af: false, aw: false }),
  blankRoom: () => ({ cap: 0, tanks: { water: { size: 0, count: 0 }, food: { size: 0, count: 0 } }, stalls: {} }),
  /** How many stalls the tanks of a kind can feed, and how many are wired to them now. */
  supply(room, kind) { const t = room.tanks[kind], C = PonyCare.cfg().tank; return t.count * C.supply[t.size]; },
  used(room, kind) { const flag = kind === 'food' ? 'af' : 'aw'; return Object.values(room.stalls).filter(s => s[flag]).length; },
  bowlSize: (kind, level) => { const C = PonyCare.cfg(), b = kind === 'food' ? C.foodBowl : C.waterBowl; return b.size[Math.min(level, b.size.length - 1)]; },
  /** The grid and stall rec key of a pony's stall (or null). */
  stallOf(a) { const k = a.stall && Stable.parseKey(a.stall); return k ? { grid: k.grid, key: k.x + ',' + k.y } : null; },
  /** Pony sexes for the breeding guest rule. */
  sexOf: a => (a.look ? PonyLook.sexOf(a.look) : ''),
  /** What a stall's menu shows for a pony: [hunger, thirst, happiness, hearts], rounded. */
  statsOf(a, pid) { return a.hunger === undefined ? null : [Math.round(a.hunger), Math.round(a.thirst), Math.round(a.happy), a.hearts ? a.hearts(pid) : 0]; }
};

Object.assign(GameServer.prototype, {
  _careRoom(grid) { this.care = this.care || {}; return this.care[grid] || (this.care[grid] = PonyCare.blankRoom()); },
  _careStall(grid, key) { const room = this._careRoom(grid); return room.stalls[key] || (room.stalls[key] = PonyCare.blankStall()); },
  /** Is this room the stable of this player (the one whose coins and tanks you may spend)? Keyless test seats may use any. */
  _isMyStable(id, grid) {
    const key = this.playerKeys && this.playerKeys[id], n = key !== undefined ? this.interiors.homes[key] : undefined;
    return n === undefined || String(grid).endsWith(':' + n) || this._stableAccess(id) === 'full';
  },
  /** The stable desk piece within reach of p: { f, def } or null. */
  _deskNear(p, fx, fy) {
    const map = this.mapOf(p); if (!map || map.kind !== 'room') return null;
    const f = map.plan.layout.furniture.find(g => g.x === (fx | 0) && g.y === (fy | 0)), def = f && FurnitureDefs.get(f.id);
    return def && def.desk && Stable.rectDist(f, p) <= Stable.REACH + 0.6 ? { f, def } : null;
  },
  /** The Inventory behind the desk of this room (its bank), made on first use. */
  _deskBank(grid, f, def) {
    const key = HomeCrafts.storeKey(grid, f), S = this.interiors;
    if (!S.chests[key]) S.chests[key] = new Inventory(def.container.slots || HomeCrafts.CHEST_SLOTS);
    S.chests[key].only = def.container.only || '';
    return S.chests[key];
  },
  /** The bank of the desk in the room this player is in (the first desk there), or null. */
  _bankOfRoom(p) {
    const map = this.mapOf(p); if (!map || map.kind !== 'room') return null;
    const f = map.plan.layout.furniture.find(g => (FurnitureDefs.get(g.id) || {}).desk);
    return f ? this._deskBank(gridOf(p), f, FurnitureDefs.get(f.id)) : null;
  },

  /* ---------------------------------------- the stall's menu ---------------------------------------- */
  /** Care details for a stall's menu (null when the system is off). */
  _careMenu(id, p, f, inside) {
    if (!PonyCare.isOn(this)) return null;
    const C = PonyCare.cfg(), grid = gridOf(p), room = this._careRoom(grid), rec = this._careStall(grid, f.x + ',' + f.y), bank = this._bankOfRoom(p);
    const bowl = (kind, level, units, auto) => {
      const b = kind === 'food' ? C.foodBowl : C.waterBowl, supply = PonyCare.supply(room, kind), used = PonyCare.used(room, kind);
      return { level, max: b.size.length - 1, units: Math.round(units), size: PonyCare.bowlSize(kind, level), auto, upCost: level + 1 < b.size.length ? b.cost[level + 1] : null,
        autoCost: C.auto.cost, tank: supply > 0, room: supply - used };
    };
    return { food: bowl('food', rec.fl, rec.food, rec.af), water: bowl('water', rec.wl, rec.water, rec.aw), comfort: { level: rec.cl, max: C.comfort.cost.length - 1, upCost: rec.cl + 1 < C.comfort.cost.length ? C.comfort.cost[rec.cl + 1] : null },
      bank: PonyCare.coins(bank), mine: this._isMyStable(id, grid) };
  },

  /** A care button in a stall's menu: what = fillFood / fillWater / upFood / upWater / upComfort / autoFood / autoWater. */
  _carePick(id, p, map, cmd) {
    if (!PonyCare.isOn(this)) return;
    const f = map.plan.layout.furniture.find(g => g.x === (cmd.fx | 0) && g.y === (cmd.fy | 0) && (FurnitureDefs.get(g.id) || {}).stall);
    if (!f || Stable.rectDist(f, p) > Stable.REACH + 0.8) { this._notice(id, 'Stand beside the stall'); return; }
    const C = PonyCare.cfg(), grid = gridOf(p), rec = this._careStall(grid, f.x + ',' + f.y), room = this._careRoom(grid), what = String(cmd.what || ''), inv = this.inventories[id];
    const mine = this._isMyStable(id, grid);
    const spend = cost => {                                                       // pony coins come out of the desk's bank
      if (!mine) { this._notice(id, 'This is not your stable'); return false; }
      const bank = this._bankOfRoom(p);
      if (!PonyCare.pay(bank, cost)) { this._notice(id, `That costs ${cost} pony coin${cost === 1 ? '' : 's'}: put them in the stable desk first (you have ${PonyCare.coins(bank)} there)`); return false; }
      this.interiors.chestSent = {}; return true;
    };
    if (what === 'fillFood') {
      const size = PonyCare.bowlSize('food', rec.fl);
      if (rec.food >= size - 0.5) { this._notice(id, 'The food bowl is full'); return; }
      let missing = size - rec.food, used = 0;
      for (const slot of inv.slots.slice()) {
        if (!slot || !ItemDB.isApple(slot.id)) continue;
        while (missing > 0.5 && inv.has(slot.id, 1)) { inv.remove(slot.id, 1); used++; const add = Math.min(missing, C.appleBowl); rec.food += add; missing -= add; }
        if (missing <= 0.5) break;
      }
      if (!used) { this._notice(id, 'Bring apples to fill the food bowl'); return; }
      this.inventoryRev[id]++; this._notice(id, `Food bowl filled with ${used} apple${used === 1 ? '' : 's'} (${Math.round(rec.food)}/${size})`);
    } else if (what === 'fillWater') {
      const size = PonyCare.bowlSize('water', rec.wl);
      if (rec.water >= size - 0.5) { this._notice(id, 'The water bowl is full'); return; }
      if (inv.has('watering_can', 1)) { rec.water = size; this._notice(id, `You fill the water bowl from your watering can`); }
      else if (inv.has('jug_water', 1)) {
        let missing = size - rec.water, jugs = 0;
        while (missing > 0.5 && inv.has('jug_water', 1)) { inv.remove('jug_water', 1); inv.add('jug', 1); jugs++; const add = Math.min(missing, C.jugWater); rec.water += add; missing -= add; }
        this.inventoryRev[id]++; this._notice(id, `Water bowl filled with ${jugs} jug${jugs === 1 ? '' : 's'} (${Math.round(rec.water)}/${size})`);
      } else { this._notice(id, 'Bring a Watering Can (or jugs of water) to fill the water bowl'); return; }
    } else if (what === 'upFood' || what === 'upWater') {
      const kind = what === 'upFood' ? 'food' : 'water', lvl = kind === 'food' ? rec.fl : rec.wl, b = kind === 'food' ? C.foodBowl : C.waterBowl;
      if (lvl + 1 >= b.size.length) { this._notice(id, 'The bowl is already the biggest'); return; }
      if (!spend(b.cost[lvl + 1])) return;
      if (kind === 'food') rec.fl++; else rec.wl++;
      this._notice(id, `A bigger ${kind === 'food' ? 'food' : 'water'} bowl: it holds ${PonyCare.bowlSize(kind, lvl + 1)}`);
    } else if (what === 'upComfort') {
      if (rec.cl + 1 >= C.comfort.cost.length) { this._notice(id, 'The stall is as comfy as it gets'); return; }
      if (!spend(C.comfort.cost[rec.cl + 1])) return;
      rec.cl++; this._notice(id, 'Fresh bedding: ponies here grow happier faster');
    } else if (what === 'autoFood' || what === 'autoWater') {
      const kind = what === 'autoFood' ? 'food' : 'water', flag = kind === 'food' ? 'af' : 'aw';
      if (rec[flag]) { this._notice(id, `This stall is already fed by the ${kind} tank`); return; }
      if (PonyCare.supply(room, kind) <= 0) { this._notice(id, `Buy a ${kind} tank at the stable desk first`); return; }
      if (PonyCare.used(room, kind) >= PonyCare.supply(room, kind)) { this._notice(id, `Your ${kind} tanks are supplying all the stalls they can: buy another or a bigger tank at the desk`); return; }
      if (!spend(C.auto.cost)) return;
      rec[flag] = true; this._notice(id, `The ${kind} tank is wired to this stall`);
    } else return;
    this._useStall(id, p, { fx: f.x, fy: f.y });
  },

  /* ---------------------------------------- the desk ---------------------------------------- */
  _deskInfo(id, p, f, def) {
    const C = PonyCare.cfg(), grid = gridOf(p), room = this._careRoom(grid), bank = this._deskBank(grid, f, def), tank = kind => {
      const t = room.tanks[kind], none = t.count === 0;
      return { size: t.size, count: t.count, max: C.tank.maxCount, supply: PonyCare.supply(room, kind), used: PonyCare.used(room, kind),
        buyCost: none ? C.tank.buy[1] : t.count < C.tank.maxCount ? C.tank.buy[t.size] : null, upCost: !none && t.size + 1 < C.tank.supply.length ? C.tank.upsize[t.size] : null, perTank: C.tank.supply[none ? 1 : t.size] };
    };
    const cap = this._ponyCapOf(id), K = CONFIG.sim.ponyCap, mine = Object.values(this.animals.animals).filter(a => a.owner === id && AnimalDefs[a.type].pony);
    const access = id === this.hostId ? this._humans().filter(q => q && q.id !== id).map(q => ({ id: q.id, name: q.name || 'Player', level: this._stableAccess(q.id) })) : undefined;       // (the host's list of who may do what)
    return { access, fx: f.x, fy: f.y, bank: PonyCare.coins(bank), food: tank('food'), water: tank('water'), mine: this._isMyStable(id, grid), care: PonyCare.isOn(this),
      cap: { have: mine.length, max: cap, level: room.cap | 0, maxLevel: K.cost.length - 1, perLevel: K.perLevel, upCost: (room.cap | 0) + 1 < K.cost.length ? K.cost[(room.cap | 0) + 1] : null },
      ponies: mine.map(a => ({ id: a.id, name: Stable.nameOf(a), level: a.level || 1, sex: a.look ? PonyLook.sexOf(a.look) : '', type: a.type, main: !!a.main, locked: Stable.locked(a), ridden: !!a.rider, stalled: !!a.stall })) };
  },
  _useDesk(id, p, action) {
    const hit = this._deskNear(p, action.fx, action.fy); if (!hit) return;
    this.pendingEvents.push(Object.assign({ type: 'deskMenu', to: id }, this._deskInfo(id, p, hit.f, hit.def)));
  },
  /** A button in the desk's menu: storage (open the bank) / buyTank / upTank, for kind food or water. */
  _deskPick(id, cmd) {
    const p = this.players[id], hit = p && this._deskNear(p, cmd.fx, cmd.fy);
    if (!hit) return;
    const grid = gridOf(p), S = this.interiors;
    if (!this._isMyStable(id, grid)) { this._notice(id, 'This is not your stable'); return; }
    if (cmd.act === 'storage') {
      const key = HomeCrafts.storeKey(grid, hit.f); this._deskBank(grid, hit.f, hit.def);
      S.openChest[id] = key; delete S.chestSent[id]; this.pendingEvents.push({ type: 'openChest', to: id }); return;
    }
    const bankNow = this._deskBank(grid, hit.f, hit.def);
    if (cmd.act === 'upCap') {                                                    // a bigger stable: more ponies may be kept
      const K = CONFIG.sim.ponyCap, room = this._careRoom(grid), lvl = room.cap | 0;
      if (lvl + 1 >= K.cost.length) { this._notice(id, 'Your stable is as big as it gets'); return; }
      if (!PonyCare.pay(bankNow, K.cost[lvl + 1])) { this._notice(id, `That costs ${K.cost[lvl + 1]} pony coins: put them in the desk first (you have ${PonyCare.coins(bankNow)})`); return; }
      S.chestSent = {}; room.cap = lvl + 1; this._notice(id, `A bigger stable: you can now keep ${this._ponyCapOf(id)} ponies`);
    } else if (cmd.act === 'remove') {
      this._removePony(id, p, String(cmd.animal || ''));
    } else {
      const kind = cmd.kind === 'water' ? 'water' : cmd.kind === 'food' ? 'food' : '';
      if (!kind) return;
      if (!PonyCare.isOn(this)) { this._notice(id, 'Switch on Pony care (Menu) to use tanks'); return; }
      this._deskTank(id, p, hit, cmd, kind, grid);
      return;
    }
    this.pendingEvents.push(Object.assign({ type: 'deskMenu', to: id }, this._deskInfo(id, p, hit.f, hit.def)));
  },
  _deskTank(id, p, hit, cmd, kind, grid) {
    const S = this.interiors;
    const C = PonyCare.cfg().tank, room = this._careRoom(grid), t = room.tanks[kind], bank = this._deskBank(grid, hit.f, hit.def);
    const pay = cost => { if (!PonyCare.pay(bank, cost)) { this._notice(id, `That costs ${cost} pony coins: put them in the desk first (you have ${PonyCare.coins(bank)})`); return false; } S.chestSent = {}; return true; };
    if (cmd.act === 'buyTank') {
      if (t.count >= C.maxCount) { this._notice(id, 'You have as many tanks as fit'); return; }
      const size = t.count ? t.size : 1; if (!pay(C.buy[size])) return;
      t.size = size; t.count++; this._notice(id, `A ${kind} tank is installed. It feeds ${C.supply[size]} stalls: upgrade stalls to connect them`);
    } else if (cmd.act === 'upTank') {
      if (!t.count || t.size + 1 >= C.supply.length) { this._notice(id, t.count ? 'The tanks are as big as they get' : 'Buy a tank first'); return; }
      if (!pay(C.upsize[t.size])) return;
      t.size++; this._notice(id, `Bigger ${kind} tanks: each now feeds ${C.supply[t.size]} stalls`);
    } else return;
    this.pendingEvents.push(Object.assign({ type: 'deskMenu', to: id }, this._deskInfo(id, p, hit.f, hit.def)));
  },

  /* ---------------------------------------- the clock: hunger, thirst, happiness, friendship ---------------------------------------- */
  /** A pony of yours drank from open water, or is near some. */
  _nearWater(a, range) {
    const map = this.mapOf(a); if (!map || !map.tile) return false;
    for (let dx = -range; dx <= range; dx += 1) for (let dy = -range; dy <= range; dy += 1) { if (Math.hypot(dx, dy) > range) continue; const t = map.tile(Math.floor(a.x + dx), Math.floor(a.y + dy)); if (isWaterTile(t)) return true; }
    return false;
  },
  _careTick(dt) {
    if (!PonyCare.isOn(this) || this.tick % 10) return;
    dt *= 10;
    const C = PonyCare.cfg(), H = C.happiness, N = C.neglect, animals = this.animals.animals;
    for (const grid in (this.care || {})) {                                                             // automated stalls top their bowls up from the tanks
      const room = this.care[grid];
      for (const key in room.stalls) {
        const s = room.stalls[key];
        if (s.af) s.food = Math.min(PonyCare.bowlSize('food', s.fl), s.food + C.auto.refillPerSecond * dt);
        if (s.aw) s.water = Math.min(PonyCare.bowlSize('water', s.wl), s.water + C.auto.refillPerSecond * dt);
      }
    }
    for (const id of Object.keys(animals)) {
      const a = animals[id], def = AnimalDefs[a.type];
      if (!a.owner || !def || !def.pony || a.trial || a.captor) continue;
      PonyCare.ensure(a);
      a.hunger = Math.max(0, a.hunger - C.hunger.drain * dt); a.thirst = Math.max(0, a.thirst - C.thirst.drain * dt);
      const where = PonyCare.stallOf(a);
      if (where) {
        const s = this._careStall(where.grid, where.key);
        if (a.hunger < C.eatBelow && s.food > 0) { const take = Math.min(s.food, C.eatPerSecond * dt, C.hunger.max - a.hunger); a.hunger += take; s.food -= take; }
        if (a.thirst < C.eatBelow && s.water > 0) { const take = Math.min(s.water, C.eatPerSecond * dt, C.thirst.max - a.thirst); a.thirst += take; s.water -= take; }
      } else if (a.thirst < C.eatBelow && this._nearWater(a, Math.round(C.outside.drinkRange))) a.thirst = Math.min(C.thirst.max, a.thirst + C.outside.drinkPerSecond * dt);
      // happiness follows how well fed it is (a comfy stall lifts it faster)
      const worst = Math.min(a.hunger, a.thirst);
      if (worst <= 0) a.happy = Math.max(0, a.happy - H.fallEmpty * dt);
      else if (worst < H.hungryBelow) a.happy = Math.max(0, a.happy - H.fall * dt);
      else if (worst >= H.fedAbove) { const s = where && this._careStall(where.grid, where.key); a.happy = Math.min(100, a.happy + H.riseFed * (1 + (s ? H.comfort[Math.min(s.cl, H.comfort.length - 1)] : 0)) * dt); }
      this._careWarn(a, id);
      // unhappy for too long: friendship drops; still unhappy after a few drops: it runs away
      if (a.rider) continue;
      if (a.happy < H.low) {
        a.lowT = (a.lowT || 0) + dt;
        if (a.lowT >= N.seconds) {
          a.lowT -= N.every; a.drops = (a.drops || 0) + 1;
          a.befriend(a.owner, -N.friendLoss, 99); this.friendship._bump(a.owner);
          if (a.drops >= N.runAfter) { this._ponyRunsAway(a); continue; }
          if (this.players[a.owner]) this._notice(a.owner, `${Stable.nameOf(a)} is unhappy and grows distant. Feed and water it!`);
        }
      } else if (a.happy >= N.recoverAbove) { a.lowT = 0; a.drops = 0; }
      else a.lowT = Math.max(0, (a.lowT || 0) - dt);
    }
  },
  /** Tell the owner now and then that a pony is hungry or thirsty. */
  _careWarn(a, id) {
    const C = PonyCare.cfg(), low = C.happiness.hungryBelow, owner = this.players[a.owner];
    if (!owner) return;
    const hungry = a.hunger < low, thirsty = a.thirst < low, was = a.warnState || 0, now = (hungry ? 1 : 0) | (thirsty ? 2 : 0);
    if (now && now !== was) this._notice(a.owner, `${Stable.nameOf(a)} is ${hungry && thirsty ? 'hungry and thirsty' : hungry ? 'hungry' : 'thirsty'}`);
    a.warnState = now;
  },
  /** A pony leaves its owner and goes wild (it ran away, or was sent away from the desk's menu): out of its stall and through the stable door if it was inside. */
  _setFree(a) {
    const where = PonyCare.stallOf(a), grid = where ? where.grid : gridOf(a);
    if (a.stall) { for (const k of Object.keys(this.breeding || {})) if (k === a.stall) this._breedEnd(k); }
    if (a.stall && grid) {
      const site = Grids.siteOf(grid), at = site ? { x: site.frontX + 0.5 + (this.rng() - 0.5) * 1.5, y: site.frontY + 1.5 } : { x: a.x, y: a.y };
      delete a.grid; a.x = at.x; a.y = at.y;
    }
    delete a.stall; delete a.stallAt; delete a.stallBox; delete a.roam; delete a.breedP;
    Object.assign(a, { owner: '', leashed: false, main: false, rider: '', vx: 0, vy: 0, state: 'idle', home: { x: a.x, y: a.y }, hunger: undefined, thirst: undefined, happy: undefined, lowT: 0, drops: 0 });
  },
  /** The pony has had enough of being neglected: it leaves its owner and goes wild. */
  _ponyRunsAway(a) {
    const owner = a.owner, name = Stable.nameOf(a);
    this._setFree(a);
    if (this.players[owner]) this._notice(owner, `${name} ran away! It was neglected for too long`);
    this.pendingEvents.push({ type: 'ranAway', to: owner, animal: a.id, x: a.x, y: a.y, name });
  }
});

/** The stable desk: the interact key opens its menu (it is not an ordinary chest). */
function findDesk(map, p) {
  if (p.asleep || !map || map.kind !== 'room' || !map.plan || !map.plan.layout) return null;
  let best = null;
  for (const f of map.plan.layout.furniture) { const def = FurnitureDefs.get(f.id); if (def && def.desk) { const dist = Stable.rectDist(f, p); if (dist <= Stable.REACH && (!best || dist < best.dist)) best = { dist, f }; } }
  return best ? { kind: 'desk', label: 'Stable desk', dist: best.dist - 0.3, fx: best.f.x, fy: best.f.y } : null;
}
Interactions.extra.unshift(findDesk);
InteractionHandlers.desk = (server, id, p, action) => server._useDesk(id, p, action);
