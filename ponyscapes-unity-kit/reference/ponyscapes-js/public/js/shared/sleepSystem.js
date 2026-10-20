'use strict';
/* SHARED + SERVER-SIDE - sleep. There is no bedtime and nobody is ever put to bed: whenever your energy is below CONFIG.sim.energy.tiredBelow you may lie down, in your bed at home
 * or by CAMPING in the woods (a spot with trees around, nothing hostile near; a campfire beside you makes the night warmer and the rest faster). Sleeping gives your energy back;
 * you wake when you are rested (or press the button to get up). The bed in your own home is the only bed (furniture `bed` is `unique`).
 *
 * TIME: while anyone is awake the clock runs as usual. When EVERYONE playing is asleep at night (nightHour until wakeHour) the rest of the night is skipped: the clock jumps to the wake
 * hour, and everyone wakes up rested. Anything that hurts a sleeper wakes them.
 *
 * The pure part (the bed and the camp spot, and the "Sleep" / "Camp" / "Get up" button) runs on the client too, so the button labels itself; the server does the rest. */
const Sleep = {
  cfg: () => CONFIG.sim.sleep,
  /** Is it the night, when a night with everybody asleep is skipped (nightHour until wakeHour)? */
  isNight(hour) { const S = CONFIG.sim.sleep; return hour >= S.nightHour || hour < S.wakeHour; },
  /** Tired enough to sleep? */
  isTired(p) { return p.energy < CONFIG.sim.energy.tiredBelow; },
  /** The bed in a home room (a RoomPlan's furniture), or null. { x, y, w, h, cx, cy } */
  bedOf(map) {
    if (!map || map.kind !== 'room' || !map.plan || !map.plan.site || map.plan.site.def.instance !== 'player') return null;
    const f = map.plan.layout.furniture.find(g => g.id === 'bed');
    return f ? { x: f.x, y: f.y, w: f.w, h: f.h, cx: f.x + f.w / 2, cy: f.y + f.h / 2 } : null;
  },
  /** Where you stand when you get up: the free floor tile beside the bed nearest the way in, as { x, y }. */
  bedside(map, bed) {
    const plan = map.plan, entry = plan.entryPoint();
    let best = null;
    for (let ty = bed.y - 1; ty <= bed.y + bed.h; ty++) for (let tx = bed.x - 1; tx <= bed.x + bed.w; tx++) {
      if (tx >= bed.x && tx < bed.x + bed.w && ty >= bed.y && ty < bed.y + bed.h) continue;
      if (!plan.isFloor(tx, ty) || plan.solidAt(tx, ty)) continue;
      const d = Math.hypot(tx + 0.5 - entry.x, ty + 0.5 - entry.y);
      if (!best || d < best.d) best = { d, x: tx + 0.5, y: ty + 0.5 };
    }
    return best || { x: entry.x, y: entry.y };
  },
  /** How many living trees stand within `radius` tiles of the player (the woods). */
  treesAround(map, p, radius = CONFIG.sim.sleep.campRadius) {
    const cx = Math.floor(p.x), cy = Math.floor(p.y), r = Math.ceil(radius);
    let n = 0;
    for (let ty = cy - r; ty <= cy + r; ty++) for (let tx = cx - r; tx <= cx + r; tx++) {
      if (Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) > radius) continue;
      const tree = map.peekPropAt(tx, ty);
      if (!tree || tree.t !== 'tree') continue;
      const state = map.treeStates[tileKey(tx, ty)];
      if (state ? state.alive : tree.alive !== false) n++;
    }
    return n;
  },
  /** Can this player make camp where they stand? '' when they can, else the reason (shown as a notice). */
  campProblem(map, p, animals) {
    const S = CONFIG.sim.sleep;
    if (!map || map.kind !== 'world' || p.grid) return 'You can only camp outdoors';
    if (p.mount || p.boat || p.flying) return 'Get off your ride first';
    const tile = map.tile(Math.floor(p.x), Math.floor(p.y));
    if (isWaterTile(tile)) return 'You cannot camp in the water';
    if (Sleep.treesAround(map, p) < S.campTrees) return 'Find a spot in the woods to camp';
    for (const id in animals || {}) {
      const a = animals[id], def = AnimalDefs[a.type];
      if (def && def.hostile && !a.grid && Math.hypot(a.x - p.x, a.y - p.y) < S.campHostileRange) return `Something dangerous is near: it is not safe to camp`;
    }
    return '';
  },
  /** The interact button: Sleep next to your bed, Camp in the woods, Get up when you are asleep. Only offered when you are tired (or already asleep). */
  find(map, p, held, animals) {
    if (p.asleep) return { kind: 'sleep', label: 'Get up', dist: 0 };
    if (p.down > 0 || p.mount || p.boat) return null;
    const bed = Sleep.bedOf(map);
    if (bed) {
      const dist = Math.max(0, Math.hypot(p.x - clamp(p.x, bed.x, bed.x + bed.w), p.y - clamp(p.y, bed.y, bed.y + bed.h)));
      return dist > CONFIG.sim.sleep.bedReach ? null : { kind: 'sleep', label: 'Sleep', dist, bed };
    }
    if (!Sleep.isTired(p) || Sleep.campProblem(map, p, animals)) return null;
    return { kind: 'camp', label: 'Camp', dist: 2.2 };                                          // (a low priority: anything else you can do here comes first)
  }
};
Interactions.extra.push((map, p, held, animals) => { const b = Sleep.find(map, p, held, animals); return b && b.kind === 'sleep' ? b : null; });      // (camping is the fallback at the end of Interactions.find)
InteractionHandlers.sleep = (server, id, p, action) => server.sleep.useBed(id, p);
InteractionHandlers.camp = (server, id, p, action) => server.sleep.camp(id, p);

class SleepSystem {
  constructor(server) { this.s = server; this.hurtHp = {}; }

  /** The bed button was pressed: lie down (when tired) or get up. */
  useBed(id, p) {
    const s = this.s;
    if (p.asleep) { this.wake(id, p, false); return; }
    if (!Sleep.isTired(p)) { s._notice(id, 'You are not tired'); return; }
    this.lieDown(id, p, Sleep.bedOf(s.mapOf(p)), false);
  }

  /** Camp where you stand: a bedroll in the woods. */
  camp(id, p) {
    const s = this.s;
    if (p.asleep) { this.wake(id, p, false); return; }
    if (!Sleep.isTired(p)) { s._notice(id, 'You are not tired'); return; }
    const problem = Sleep.campProblem(s.mapOf(p), p, s.animals.animals);
    if (problem) { s._notice(id, problem); return; }
    this.lieDown(id, p, null, true);
  }

  /** Down to sleep: you lie still and out of the way of everything. */
  lieDown(id, p, bed, camping) {
    const s = this.s;
    if (p.mount) s._dismount(id, p);
    if (p.boat) { const boat = s.boats[p.boat]; if (boat) boat.occupant = ''; p.boat = ''; }
    p.asleep = true; p.sleepT = 0; p.camping = !!camping; p.state = 'idle'; p.swingT = 0; p.swingHit = false; p.vx = p.vy = 0;
    if (bed) { p.x = bed.cx; p.y = bed.cy; }
    this.hurtHp[id] = p.hp;
    s.pendingEvents.push({ type: 'fellAsleep', to: id, camping: !!camping });
  }

  /** Up again, beside the bed (if that is where you are). `how`: 'rested' | 'morning' | 'hurt' | '' (you pressed the button). */
  wake(id, p, how) {
    const s = this.s, map = s.mapOf(p), bed = Sleep.bedOf(map);
    p.asleep = false; p.sleepT = 0; p.camping = false; p.vx = p.vy = 0;
    delete this.hurtHp[id];
    if (bed) { const spot = Sleep.bedside(map, bed); p.x = spot.x; p.y = spot.y; p.facing = Math.atan2(bed.cy - spot.y, bed.cx - spot.x) + Math.PI; }
    s.pendingEvents.push({ type: 'wokeUp', to: id, how });
    if (how === 'morning') s._notice(id, 'Good morning!');
    else if (how === 'rested') s._notice(id, 'You wake up feeling rested');
    else if (how === 'hurt') s._notice(id, 'You wake with a start!');
  }

  /** Is a campfire close enough to warm the camp? */
  _nearFire(p) { return this.s.lightCache.some(l => l.kind === 'campfire' && Math.hypot(l.x - p.x, l.y - p.y) <= l.radius); }

  /** Every tick: sleepers rest (and wake when rested, or hurt), and the night is skipped when everyone is in bed. */
  update(tick) {
    const s = this.s, S = CONFIG.sim.sleep, E = CONFIG.sim.energy, hour = DayCycle.hourAt(tick), night = Sleep.isNight(hour);
    const humans = s.humanIds();
    for (const id of humans) {
      const p = s.players[id];
      if (!p.asleep) continue;
      p.sleepT += TICK_DT;
      if (p.hp < (this.hurtHp[id] === undefined ? p.hp : this.hurtHp[id]) || p.hp <= 0) { this.wake(id, p, 'hurt'); continue; }
      this.hurtHp[id] = p.hp;
      const rate = !p.camping ? S.bedRest : this._nearFire(p) ? S.campFireRest : S.campRest;
      p.energy = Math.min(E.max, p.energy + rate * TICK_DT);
      if (p.energy >= E.max && p.sleepT >= S.fallAsleepSeconds) this.wake(id, p, 'rested');
    }
    if (night && humans.length && humans.every(id => s.players[id].asleep && s.players[id].sleepT >= S.fallAsleepSeconds)) this.skipToMorning(tick, hour);
  }

  /** Everyone is asleep: the clock jumps to the wake hour (the next one, today's if it is past midnight) and they wake rested. */
  skipToMorning(tick, hour) {
    const s = this.s, total = GameSettings.totalHours(tick), midnight = Math.floor(total / 24) * 24;
    GameSettings.setClock(tick, midnight + (hour < CONFIG.sim.sleep.wakeHour ? 0 : 24) + CONFIG.sim.sleep.wakeHour);
    s.adminRev++;                                                                              // (everyone is told the new time)
    s.pendingEvents.push({ type: 'nightSkipped' });
    for (const id of s.humanIds()) { const p = s.players[id]; p.energy = CONFIG.sim.energy.max; this.wake(id, p, 'morning'); }
  }
}
