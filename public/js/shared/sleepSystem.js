'use strict';
/* SHARED + SERVER-SIDE - sleep. From CONFIG.sim.sleep.tiredHour (22:00) you may lie down in your bed at home; anyone still on their feet at forceHour (02:00)
 * falls asleep (and is carried to their bed); everybody wakes at wakeHour (06:00), beside their bed. You only ever have the one bed: the bed in your own
 * home (furniture `bed` is `unique`).
 *
 * TIME: while anyone is awake the clock runs as usual. When EVERYONE playing is asleep the night is skipped: the clock jumps to the wake hour. (Penalties for staying
 * up are not in yet: the forced sleep is all that happens.)
 *
 * The pure part (the bed in a room, and the "Sleep" / "Get up" button) runs on the client too, so the button labels itself; the server does the rest. */
const Sleep = {
  cfg: () => CONFIG.sim.sleep,
  /** Is it the night, when you may be in bed (tiredHour until wakeHour)? */
  isNight(hour) { const S = CONFIG.sim.sleep; return hour >= S.tiredHour || hour < S.wakeHour; },
  /** Is it so late that the night puts everyone to bed (forceHour until wakeHour)? */
  isForced(hour) { const S = CONFIG.sim.sleep; return hour >= S.forceHour && hour < S.wakeHour; },
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
  /** The interact button next to your bed: Sleep (Get up when you are in it). */
  find(map, p) {
    const bed = Sleep.bedOf(map);
    if (!bed) return null;
    const dist = Math.max(0, Math.hypot(p.x - clamp(p.x, bed.x, bed.x + bed.w), p.y - clamp(p.y, bed.y, bed.y + bed.h)));
    if (dist > CONFIG.sim.sleep.bedReach) return null;
    return { kind: 'sleep', label: p.asleep ? 'Get up' : 'Sleep', dist: p.asleep ? 0 : dist, bed };
  }
};
Interactions.extra.push((map, p) => Sleep.find(map, p));
InteractionHandlers.sleep = (server, id, p, action) => server.sleep.useBed(id, p);

class SleepSystem {
  constructor(server) { this.s = server; this.nightNoted = {}; this.lateNoted = {}; }

  /** The bed in this player's own home: { grid, room, bed } or null (no home room drawn yet). */
  homeBed(id) {
    const s = this.s, site = BuildingSites.list.find(b => b.def.instance === 'player');
    if (!site) return null;
    const grid = s.interiors.gridFor(id, site), room = s.grids.get(grid);
    if (room.grid !== grid) return null;
    const bed = Sleep.bedOf(room);
    return bed ? { grid, room, bed } : null;
  }

  /** The bed button was pressed: lie down (at night) or get up (before the forced hour). */
  useBed(id, p) {
    const s = this.s, hour = DayCycle.hourAt(s.tick);
    if (p.asleep) {
      if (Sleep.isForced(hour)) { s._notice(id, 'It is too late to get up: you sleep until morning'); return; }
      this.wake(id, p, false);
      return;
    }
    if (!Sleep.isNight(hour)) { s._notice(id, `You are not tired yet: beds are for after ${CONFIG.sim.sleep.tiredHour}:00`); return; }
    this.lieDown(id, p, Sleep.bedOf(s.mapOf(p)), false);
  }

  /** Into bed: you lie on it, still and out of the way of everything. */
  lieDown(id, p, bed, forced) {
    const s = this.s;
    if (p.mount) s._dismount(id, p);
    if (p.boat) { const boat = s.boats[p.boat]; if (boat) boat.occupant = ''; p.boat = ''; }
    p.asleep = true; p.sleepT = 0; p.sleepForced = forced; p.state = 'idle'; p.swingT = 0; p.swingHit = false; p.vx = p.vy = 0;
    if (bed) { p.x = bed.cx; p.y = bed.cy; }
    s.pendingEvents.push({ type: 'fellAsleep', to: id, forced });
  }

  /** Up again, beside the bed (if that is where you are). */
  wake(id, p, morning) {
    const s = this.s, map = s.mapOf(p), bed = Sleep.bedOf(map);
    p.asleep = false; p.sleepT = 0; p.sleepForced = false; p.vx = p.vy = 0;
    if (bed) { const spot = Sleep.bedside(map, bed); p.x = spot.x; p.y = spot.y; p.facing = Math.atan2(bed.cy - spot.y, bed.cx - spot.x) + Math.PI; }
    s.pendingEvents.push({ type: 'wokeUp', to: id, morning });
    if (morning) s._notice(id, 'Good morning!');
  }

  /** Too late to stay up: carried to bed (your own, at home) and put to sleep. */
  forceSleep(id, p) {
    const s = this.s, home = this.homeBed(id);
    s._notice(id, 'You cannot keep your eyes open any longer...');
    if (home) {
      if (p.mount) s._dismount(id, p);
      if (p.boat) { const boat = s.boats[p.boat]; if (boat) boat.occupant = ''; p.boat = ''; }
      s._moveToGrid(id, p, home.grid, home.bed.cx, home.bed.cy);
      this.lieDown(id, p, home.bed, true);
    } else this.lieDown(id, p, null, true);                                                  // (no home room drawn: asleep where you stand)
  }

  /** Every tick: bedtime warnings, the forced sleep, the morning, and the skipped night when everyone is in bed. */
  update(tick) {
    const s = this.s, S = CONFIG.sim.sleep, hour = DayCycle.hourAt(tick), night = Sleep.isNight(hour), forced = Sleep.isForced(hour);
    const nightIndex = Math.floor((GameSettings.totalHours(tick) - 12) / 24);                    // (one number for the whole night, either side of midnight)
    const humans = s.humanIds();
    for (const id of humans) {
      const p = s.players[id];
      if (p.asleep) {
        p.sleepT += TICK_DT;
        if (!night) this.wake(id, p, true);
        continue;
      }
      if (forced) { this.forceSleep(id, p); continue; }
      if (night && this.nightNoted[id] !== nightIndex) { this.nightNoted[id] = nightIndex; s._notice(id, 'You are getting sleepy: your bed is at home'); }
      if (hour >= S.forceHour - 1 && hour < S.forceHour && this.lateNoted[id] !== nightIndex) { this.lateNoted[id] = nightIndex; s._notice(id, 'You can barely stay awake...'); }
    }
    if (night && humans.length && humans.every(id => s.players[id].asleep && s.players[id].sleepT >= S.fallAsleepSeconds)) this.skipToMorning(tick, hour);
  }

  /** Everyone is asleep: the clock jumps to the wake hour (the next one, today's if it is past midnight). */
  skipToMorning(tick, hour) {
    const s = this.s, total = GameSettings.totalHours(tick), midnight = Math.floor(total / 24) * 24;
    GameSettings.setClock(tick, midnight + (hour < CONFIG.sim.sleep.wakeHour ? 0 : 24) + CONFIG.sim.sleep.wakeHour);
    s.adminRev++;                                                                              // (everyone is told the new time)
    s.pendingEvents.push({ type: 'nightSkipped' });
  }
}
