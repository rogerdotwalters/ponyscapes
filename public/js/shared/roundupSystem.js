'use strict';
/* SHARED - the Round-Up minigame (rules in js/data/minigames/roundup.js, the arena in roundupPlan.js, the quest in data/quests/shepherd_wool.js).
 *
 * START   Stand at the gate of the old fence east of the village (Village.roundup) and press Use: everybody standing near comes along, alternately to side 0 and side 1 (a lone player is
 *         matched with a computer Rival Rancher). They are taken into a new arena instance ('roundup:<n>'), a COUNTDOWN runs, and at GO the sheep scatter.
 * LASSO   The ordinary lasso throw (L / right click / the lasso button) at a sheep. A hit puts it on your ROPE: it strains while it calms, and the calm bar fills only while you
 *         stay within `rope.calm` of it (past `rope.max` the rope snaps). A calm sheep is LED: it trots after you. You can hold `rope.lead` ropes at once.
 * TIE     Use beside your own pole: every sheep you lead is tied up there (it counts for your side). Use beside the OTHER side's pole to untie one of theirs (slower for every
 *         defender standing near the pole): the sheep is then yours to lead home.
 * STEAL   A rival who walks across your rope CUTS it (the sheep bolts); a lasso thrown at a sheep somebody else is roping or leading takes it from them.
 * END     When the time is up (or every sheep is tied up) the side with more sheep on its pole wins. Wool and coins are shared out, the quest hears about it, and everyone is taken back.
 *
 * Sheep here are ordinary animals marked `game: 'roundup'` that this system drives itself (AnimalSystem leaves them alone); `rs` is their round-up state:
 *   { st: 'free' | 'roped' | 'led' | 'pole', team: side holding it (-1 none), by: who holds it ('' none), tame: 0..1, slot: place on the pole (-1 none), ... }
 * and is sent with the animal so every client can draw the ropes. */
const RoundupRules = Minigames.get('roundup');
const ROUNDUP_GATE_REACH = 1.7, ROUNDUP_GATHER = 9, ROUNDUP_POLE_REACH = 3.2, ROUNDUP_FLEE_RADIUS = 4.6, ROUNDUP_TEAMS = Object.freeze([
  Object.freeze({ name: 'Red Ranch', color: '#d9534f' }), Object.freeze({ name: 'Blue Ranch', color: '#3b7ddd' })]);

/** Distance from point (px, py) to the segment a-b. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 > 1e-9 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Pure (client + server): the Use key at the old fence's gate, or beside a pole in the arena. { kind, label, dist } or null. `animals` is every animal the caller knows. */
function findRoundupInteraction(map, p, held, animals, selfId = p.id) {
  if (p.boat || p.asleep || p.down > 0 || p.flying) return null;                                 // (on a pony is fine: ride up to the gate to bring it along)
  if (map.kind === 'world') {
    if (p.grid || !Village.roundup) return null;
    const d = Math.hypot(p.x - Village.roundup.gate.x, p.y - Village.roundup.gate.y);
    return d <= ROUNDUP_GATE_REACH ? { kind: 'start_roundup', label: 'Round up the flock', dist: d } : null;
  }
  if (map.kind !== 'roundup' || (p.rt !== 0 && p.rt !== 1) || p.rsteal > 0) return null;
  const mine = RoundupArena.poles[p.rt], other = RoundupArena.poles[1 - p.rt], dMine = Math.hypot(p.x - mine.x, p.y - mine.y), dOther = Math.hypot(p.x - other.x, p.y - other.y);
  let led = 0, held_ = 0, theirs = 0;
  for (const id in animals) {
    const rs = animals[id].rs;                                                                       // (the server's own sheep say st / team, the copies in a snapshot s / t)
    if (!rs || !sameGrid(animals[id], p)) continue;
    const st = rs.s || rs.st, team = rs.t !== undefined ? rs.t : rs.team;
    if (rs.by === selfId && (st === 'led' || st === 'roped')) held_++;
    if (rs.by === selfId && st === 'led') led++;
    if (st === 'pole' && team === 1 - p.rt) theirs++;
  }
  if (led && dMine <= ROUNDUP_POLE_REACH) return { kind: 'tie_sheep', label: led > 1 ? `Tie up ${led} sheep` : 'Tie up the sheep', dist: dMine };
  if (theirs && dOther <= RoundupRules.steal.reach && held_ < RoundupRules.rope.lead) return { kind: 'untie_sheep', label: 'Untie a sheep', dist: dOther };
  return null;
}
Interactions.extra.push(findRoundupInteraction);
InteractionHandlers.start_roundup = (server, id, p) => server.roundup.start(id, p);
InteractionHandlers.tie_sheep = (server, id, p) => server.roundup.tie(id, p);
InteractionHandlers.untie_sheep = (server, id, p) => server.roundup.beginSteal(id, p);

class RoundupSystem {
  constructor(server) { this.s = server; this.matches = new Map(); this.next = 1; this.cool = {}; }

  /* ---------------------------------------- who is where ---------------------------------------- */
  matchAt(grid) { return grid ? this.matches.get(grid) || null : null; }
  matchOf(p) { return p ? this.matchAt(gridOf(p)) : null; }
  /** Is this player in a round (any phase)? */
  active(p) { return !!this.matchOf(p); }
  _who(m, pid) { return pid === 'rival' ? m.rival : this.s.players[pid]; }
  _name(m, pid) { const q = m.people[pid]; return q ? q.name : 'Somebody'; }
  _say(m, pid, text) { if (pid !== 'rival') this.s._notice(pid, text); }
  _emit(m, e) { e.grid = m.grid; this.s.pendingEvents.push(e); }
  _humans(m) { return m.order.filter(id => id !== 'rival'); }
  _score(m, team) { return m.teams[team].slots.filter(Boolean).length; }
  _world(m) { return this.s.grids.get(m.grid); }
  _sheep(m) { return m.sheep.map(id => this.s.animals.animals[id]).filter(Boolean); }
  /** The sheep this person holds on a rope (being calmed, or led). */
  _ropes(m, pid) { return this._sheep(m).filter(a => a.rs.by === pid && (a.rs.st === 'roped' || a.rs.st === 'led')); }
  _free(q) { return q && !gridOf(q) && !q.boat && !q.asleep && !(q.down > 0) && !q.flying && q.rt !== 0 && q.rt !== 1; }

  /* ---------------------------------------- starting ---------------------------------------- */
  /** Use at the gate: everybody nearby (up to four) goes into a new arena. */
  start(id, p) {
    const s = this.s, R = RoundupRules;
    if (this.matchOf(p) || (this.cool[id] || 0) > s.tick) return;
    this.cool[id] = s.tick + 30;
    if (!this._free(p)) return;
    const gate = Village.roundup.gate;
    const crowd = s.humanIds().map(i => s.players[i]).filter(q => q && (q.id === id || (this._free(q) && Math.hypot(q.x - gate.x, q.y - gate.y) <= ROUNDUP_GATHER)))
      .sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : Math.hypot(a.x - gate.x, a.y - gate.y) - Math.hypot(b.x - gate.x, b.y - gate.y))).slice(0, CONFIG.sim.maxPlayers);
    const n = this.next++, grid = Grids.roundup(n), world = s.grids.get(grid);
    if (world.grid !== grid) { s._notice(id, 'The round-up field is not ready yet'); return; }
    const m = { n, grid, phase: 'countdown', t: R.seconds.countdown, people: {}, order: [], teams: ROUNDUP_TEAMS.map(t => ({ name: t.name, color: t.color, slots: [] })), sheep: [], rival: null, steals: {}, result: null, seed: (s.tick * 31 + n * 7919) | 0 };
    this.matches.set(grid, m);
    crowd.forEach((q, i) => {
      const team = i % 2, k = Math.floor(i / 2), at = RoundupArena.start(team, k);
      m.people[q.id] = { id: q.id, team, k, human: true, name: q.name || 'Player', stun: 0, tied: 0, stolen: 0, cut: 0 };
      m.order.push(q.id);
      q.returnTo = { grid: '', x: gate.x, y: gate.y + 0.3 };
      q.rt = team; q.rsteal = 0;
      s._moveToGrid(q.id, q, grid, at.x, at.y);
      q.facing = team ? Math.PI : 0;
    });
    for (const a of Object.values(s.animals.animals)) if (a.grid === grid && !a.game && !crowd.some(q => q.mount === a.id)) this._sendOut(a, gate);   // (pets and an unridden main pony wait outside: only the pony you ride in on comes along)
    if (crowd.length === 1) this._addRival(m);
    const count = R.sheep.base + R.sheep.extra * Math.max(0, crowd.length - 2);
    RoundupArena.sheepSpots(count, m.seed).forEach(spot => this._spawnSheep(m, spot));
    for (const q of crowd) {
      s._notice(q.id, `Round-Up! You are on ${m.teams[m.people[q.id].team].name}: lasso the sheep and tie them to your pole`);
      s.pendingEvents.push({ type: 'roundupStart', to: q.id, team: m.people[q.id].team, solo: !!m.rival });
    }
  }

  /** A pet or pony that followed its owner in is put back by the gate. */
  _sendOut(a, gate) {
    const map = this.s.map, spot = findLanding(map, gate.x - 1.5 - this.s.rng(), gate.y + 0.8 + this.s.rng(), AnimalDefs[a.type].radius);
    a.grid = ''; a.x = spot.x; a.y = spot.y; a.vx = a.vy = 0; a.home = { x: a.x, y: a.y }; a.state = 'idle';
  }

  _addRival(m) {
    const at = RoundupArena.start(1, 0);
    m.rival = { id: 'rival', type: 'roundup_rival', name: 'Rival Rancher', x: at.x, y: at.y, vx: 0, vy: 0, facing: Math.PI, state: 'idle', look: [0, 2, 4, 1, 7, 1], gear: { crown: '', outfit: 'garb_hunter', cape: '' }, say: '', grid: m.grid, ai: { cool: 2, goal: null, wait: 0 } };
    m.people.rival = { id: 'rival', team: 1, k: 0, human: false, name: 'Rival Rancher', stun: 0, tied: 0, stolen: 0, cut: 0 };
    m.order.push('rival');
  }

  _spawnSheep(m, spot) {
    const animals = this.s.animals, id = animals.spawn('sheep', spot.x, spot.y, undefined, { grid: m.grid, level: 1 }), a = animals.animals[id];
    a.game = 'roundup'; a.home = { x: spot.x, y: spot.y };
    a.rs = { st: 'free', team: -1, by: '', tame: 0, slot: -1, wt: 0.5 + this.s.rng() * 2, tx: spot.x, ty: spot.y, fleeT: 0, fx: 0, fy: 0 };
    m.sheep.push(id);
    return a;
  }

  /* ---------------------------------------- every tick ---------------------------------------- */
  update() {
    for (const m of [...this.matches.values()]) this._tick(m);
  }

  _tick(m) {
    const R = RoundupRules, dt = TICK_DT;
    this._prune(m);
    if (!this.matches.has(m.grid)) return;
    if (m.phase === 'countdown') {
      m.t -= dt;
      this._sheepStep(m, dt);
      if (m.t <= 0) { m.phase = 'play'; m.t = R.seconds.play; this._emit(m, { type: 'roundup', ev: 'go' }); for (const id of this._humans(m)) this.s._notice(id, 'GO!'); }
    } else if (m.phase === 'play') {
      m.t -= dt;
      for (const pid of m.order) { const q = m.people[pid]; if (q.stun > 0) q.stun = Math.max(0, q.stun - dt); }
      this._sheepStep(m, dt);
      this._rivalStep(m, dt);
      this._cuts(m);
      this._steals(m, dt);
      if (m.t <= 0 || !this._sheep(m).some(a => a.rs.st !== 'pole')) this._end(m);
    } else if (m.phase === 'over') {
      m.t -= dt;
      if (m.t <= 0) this._close(m, true);
    }
  }

  /** People who walked out of the arena (a teleport, a disconnect) leave the round; with no one left it is over. */
  _prune(m) {
    for (const pid of this._humans(m)) {
      const q = this.s.players[pid];
      if (q && gridOf(q) === m.grid) continue;
      this._leave(m, pid);
    }
    if (!this._humans(m).length) this._close(m, false);
  }
  _leave(m, pid) {
    const q = this.s.players[pid];
    if (q) { q.rt = -1; q.rsteal = 0; }
    for (const a of this._ropes(m, pid)) this._release(m, a, null);
    delete m.steals[pid]; delete m.people[pid]; m.order = m.order.filter(x => x !== pid);
  }
  /** A player's seat is going away: take them out of any round. */
  forget(id) { const p = this.s.players[id], m = this.matchOf(p); if (m && m.people[id]) { this._leave(m, id); if (!this._humans(m).length) this._close(m, false); } delete this.cool[id]; }

  /* ---------------------------------------- the sheep ---------------------------------------- */
  _sheepStep(m, dt) {
    for (const a of this._sheep(m)) {
      switch (a.rs.st) {
        case 'free': this._thinkFree(m, a, dt); break;
        case 'roped': this._thinkRoped(m, a, dt); break;
        case 'led': this._thinkLed(m, a, dt); break;
        case 'pole': this._thinkPole(m, a, dt); break;
      }
    }
  }

  /** Move a sheep toward a wanted velocity (smoothly), through the arena's walls. */
  _drive(m, a, wx, wy, speed, dt, accel = 9) {
    const k = Math.min(1, accel * dt), d = Math.hypot(wx, wy), r = AnimalDefs[a.type].radius;
    let tvx = 0, tvy = 0;
    if (d > 1e-6 && speed > 0) { [tvx, tvy] = isoNormalize(wx / d, wy / d); tvx *= speed; tvy *= speed; }
    a.vx += (tvx - a.vx) * k; a.vy += (tvy - a.vy) * k;
    a.x += a.vx * dt; a.y += a.vy * dt;
    resolveCollisions(this._world(m), a, r);
    RoundupArena.clampIn(a, r + 0.05);
    if (Math.hypot(a.vx, a.vy) > 0.08) turnToward(a, Math.atan2(a.vy, a.vx), 9 * dt);
    a.state = speed > 1.6 ? 'flee' : speed > 0.05 ? 'wander' : 'idle';
  }
  /** A push back toward the middle when close to the fence (so a sheep does not pin itself in a corner). */
  _inward(a) {
    const b = RoundupArena.box, margin = 2.6; let x = 0, y = 0;
    if (a.x < b.x0 + margin) x += (b.x0 + margin - a.x) / margin; if (a.x > b.x1 - margin) x -= (a.x - (b.x1 - margin)) / margin;
    if (a.y < b.y0 + margin) y += (b.y0 + margin - a.y) / margin; if (a.y > b.y1 - margin) y -= (a.y - (b.y1 - margin)) / margin;
    return [x, y];
  }

  _thinkFree(m, a, dt) {
    const rs = a.rs, R = RoundupRules;
    let fx = 0, fy = 0, scare = 0;
    if (m.phase === 'play') for (const pid of m.order) {                                              // run from anybody close
      const q = this._who(m, pid); if (!q) continue;
      const d = Math.hypot(a.x - q.x, a.y - q.y);
      if (d < ROUNDUP_FLEE_RADIUS) { const w = 1 - d / ROUNDUP_FLEE_RADIUS; fx += (a.x - q.x) / (d || 1) * w; fy += (a.y - q.y) / (d || 1) * w; scare = Math.max(scare, w); }
    }
    if (rs.fleeT > 0) { rs.fleeT -= dt; fx += rs.fx * 1.4; fy += rs.fy * 1.4; scare = Math.max(scare, 0.9); }
    const [ix, iy] = this._inward(a);
    if (scare > 0.02) {
      const wobble = Math.sin(this.s.tick / 9 + a.x) * 0.25;                                          // a little zig-zag
      this._drive(m, a, fx + ix * 1.2 - fy * wobble, fy + iy * 1.2 + fx * wobble, R.speed.flee * (0.55 + 0.45 * Math.min(1, scare * 1.6)), dt, 11);
      rs.wt = 0.4;
      return;
    }
    rs.wt -= dt;                                                                                      // calm: graze, and wander now and then
    if (rs.wt <= 0) {
      if (this.s.rng() < 0.45) { rs.tx = a.x; rs.ty = a.y; rs.wt = 1 + this.s.rng() * 2.5; }
      else { const ang = this.s.rng() * Math.PI * 2, len = 1.5 + this.s.rng() * 3.5; rs.tx = clamp(a.x + Math.cos(ang) * len, RoundupArena.box.x0 + 2, RoundupArena.box.x1 - 2); rs.ty = clamp(a.y + Math.sin(ang) * len, RoundupArena.box.y0 + 2, RoundupArena.box.y1 - 2); rs.wt = 2 + this.s.rng() * 2.5; }
    }
    const dx = rs.tx - a.x, dy = rs.ty - a.y, d = Math.hypot(dx, dy);
    if (d < 0.25) this._drive(m, a, 0, 0, 0, dt);
    else this._drive(m, a, dx + ix, dy + iy, R.speed.wander, dt);
  }

  /** On the rope and calming: it pulls back (sideways, mostly) and settles while its holder stays near. */
  _thinkRoped(m, a, dt) {
    const rs = a.rs, R = RoundupRules, h = this._who(m, rs.by);
    if (!h || !m.people[rs.by]) { this._release(m, a, null); return; }
    const dx = a.x - h.x, dy = a.y - h.y, d = Math.hypot(dx, dy) || 1e-6;
    if (d > R.rope.max) { this._snap(m, a, 'far'); return; }
    const sway = Math.sin(this.s.tick / 7 + a.y) , ux = dx / d, uy = dy / d;
    const pull = d < R.rope.calm - 0.6 ? 0.45 : 0;                                                      // (it strains outward only while it is well inside the calm range)
    this._drive(m, a, ux * pull - uy * sway * 0.8, uy * pull + ux * sway * 0.8, Math.min(1.4, 0.4 + Math.abs(sway) * 1.0), dt, 7);
    if (d <= R.rope.calm) rs.tame = Math.min(1, rs.tame + dt / R.rope.tame);
    if (rs.tame >= 1) {
      rs.st = 'led'; rs.tame = 1;
      this._emit(m, { type: 'roundup', ev: 'calm', x: a.x, y: a.y, id: a.id });
      this._say(m, rs.by, 'It has calmed down: lead it to your pole');
    }
  }

  /** A calm sheep trots after whoever leads it. */
  _thinkLed(m, a, dt) {
    const rs = a.rs, R = RoundupRules, h = this._who(m, rs.by);
    if (!h || !m.people[rs.by]) { this._release(m, a, null); return; }
    const dx = h.x - a.x, dy = h.y - a.y, d = Math.hypot(dx, dy);
    if (d > 10) { this._snap(m, a, 'lost'); return; }
    if (d > 1.7) this._drive(m, a, dx, dy, Math.min(R.speed.led, 0.5 + (d - 1.7) * 1.8), dt, 8);
    else this._drive(m, a, 0, 0, 0, dt, 8);
    for (const b of this._sheep(m)) {                                                                 // led sheep do not pile on top of one another
      if (b === a || b.rs.st === 'free' || b.rs.st === 'pole') continue;
      const sx = a.x - b.x, sy = a.y - b.y, sd = Math.hypot(sx, sy);
      if (sd < 0.7 && sd > 1e-4) { a.x += sx / sd * (0.7 - sd) * 0.25; a.y += sy / sd * (0.7 - sd) * 0.25; }
    }
  }

  /** Tied to a pole: it walks to its place in the ring and stays. */
  _thinkPole(m, a, dt) {
    const rs = a.rs, spot = RoundupArena.slot(rs.team, rs.slot), dx = spot.x - a.x, dy = spot.y - a.y, d = Math.hypot(dx, dy);
    if (d < 0.06) { a.x = spot.x; a.y = spot.y; a.vx = a.vy = 0; a.state = 'idle'; return; }
    a.x += clamp(dx, -2.6 * dt, 2.6 * dt); a.y += clamp(dy, -2.6 * dt, 2.6 * dt);                      // (straight to its place: nothing stands in the way)
    a.vx = dx / d * 1.4; a.vy = dy / d * 1.4; a.state = 'wander'; a.facing = Math.atan2(dy, dx);
  }

  /** A sheep is let go: free, and off in a hurry away from `from` (a person, or null). */
  _release(m, a, from) {
    const rs = a.rs;
    rs.st = 'free'; rs.team = -1; rs.by = ''; rs.tame = 0; rs.slot = -1; rs.wt = 0.3;
    if (from) { const dx = a.x - from.x, dy = a.y - from.y, d = Math.hypot(dx, dy) || 1; rs.fx = dx / d; rs.fy = dy / d; rs.fleeT = 1.6; }
    else { const ang = this.s.rng() * Math.PI * 2; rs.fx = Math.cos(ang); rs.fy = Math.sin(ang); rs.fleeT = 1.2; }
  }
  /** A rope breaks under strain (too far): the sheep bolts, and its holder is slow to throw again. */
  _snap(m, a, why) {
    const rs = a.rs, pid = rs.by, me = m.people[pid], q = this._who(m, pid);
    this._release(m, a, q);
    if (me) me.stun = Math.max(me.stun, RoundupRules.lasso.stun);
    this._emit(m, { type: 'roundup', ev: 'snap', x: a.x, y: a.y, id: a.id });
    if (me) this._say(m, pid, why === 'lost' ? 'The sheep got too far behind and slipped its rope' : 'The rope snapped! Keep it shorter');
  }

  /* ---------------------------------------- cutting ropes ---------------------------------------- */
  /** A rival who passes through a rope cuts it. */
  _cuts(m) {
    const cut = RoundupRules.rope.cut;
    for (const a of this._sheep(m)) {
      const rs = a.rs;
      if (rs.st !== 'roped' && rs.st !== 'led') continue;
      const h = this._who(m, rs.by); if (!h) continue;
      for (const pid of m.order) {
        const z = m.people[pid], q = this._who(m, pid);
        if (!z || !q || z.team === rs.team) continue;
        if (segmentDistance(q.x, q.y, h.x, h.y, a.x, a.y) > cut) continue;
        const holder = rs.by, me = m.people[holder];
        this._release(m, a, q);
        z.cut++;
        if (me) me.stun = Math.max(me.stun, RoundupRules.lasso.stun);
        this._emit(m, { type: 'roundup', ev: 'cut', x: (a.x + h.x) / 2, y: (a.y + h.y) / 2, id: a.id });
        this._say(m, holder, `${this._name(m, pid)} cut your rope!`);
        this._say(m, pid, 'You cut their rope!');
        break;
      }
    }
  }

  /* ---------------------------------------- the lasso ---------------------------------------- */
  /** The lasso swing began: which sheep is meant (the one pointed at, else the one in front), or null with a hint. */
  lassoFind(p, tool) {
    const m = this.matchOf(p), me = m && m.people[p.id], s = this.s;
    if (!m || !me) return null;
    if (m.phase !== 'play') { s._notice(p.id, m.phase === 'countdown' ? 'Wait for the whistle!' : 'The round is over'); return null; }
    if (me.stun > 0) { s._notice(p.id, 'Your rope is still tangled'); return null; }
    const aim = AimPoints[p.id];
    let best = null;
    for (const a of this._sheep(m)) {
      const rs = a.rs;
      if (rs.st === 'pole' || ((rs.st === 'roped' || rs.st === 'led') && rs.team === me.team)) continue;
      const r = AnimalDefs[a.type].radius, gap = Math.hypot(a.x - p.x, a.y - p.y) - r;
      if (gap > tool.reach) continue;
      const off = aim ? Math.hypot(a.x - aim.x, a.y - aim.y) - r : Infinity, angle = Math.abs(wrapAngle(Math.atan2(a.y - p.y, a.x - p.x) - p.facing));
      let score;
      if (off <= LASSO_AIM_SLACK) score = off - 10;                                                   // pointed at: nearest the pointer wins
      else if (gap <= LASSO_CLOSE) score = gap;
      else if (angle <= LASSO_HALF_ANGLE) score = gap + angle * 1.5;
      else continue;
      if (!best || score < best.score) best = { a, gap, score };
    }
    if (!best) { s._notice(p.id, 'Nothing to lasso there'); return null; }
    if (best.a.rs.st === 'free' && this._ropes(m, p.id).length >= RoundupRules.rope.lead) { s._notice(p.id, `Your hands are full: tie up the sheep you are leading first (${RoundupRules.rope.lead} at most)`); return null; }
    return { ref: best.a.id, x: best.a.x, y: best.a.y };
  }
  lassoValid(p, target, tool) {
    const m = this.matchOf(p), me = m && m.people[p.id], a = this.s.animals.animals[target.ref];
    if (!m || !me || !a || !a.rs || m.phase !== 'play' || me.stun > 0) return false;
    const rs = a.rs;
    if (rs.st === 'pole' || ((rs.st === 'roped' || rs.st === 'led') && rs.team === me.team)) return false;
    return Math.hypot(a.x - p.x, a.y - p.y) - AnimalDefs[a.type].radius <= tool.reach + 1.2;          // it may have moved while the loop was in the air
  }
  lassoApply(id, target) {
    const p = this.s.players[id], m = this.matchOf(p), a = this.s.animals.animals[target.ref];
    if (m && a && a.rs) this._cast(m, id, a, p.held);
  }

  /** `pid` throws a loop at sheep `a`: it lands (or not) by distance. A landed loop on a free sheep ropes it; on one that is held, it is stolen. */
  _cast(m, pid, a, item) {
    const R = RoundupRules, q = this._who(m, pid), me = m.people[pid], rs = a.rs;
    const reach = (ItemDB.getTool(item) || { reach: 5 }).reach, d = Math.hypot(a.x - q.x, a.y - q.y);
    let chance = lerp(R.lasso.near, R.lasso.far, clamp((d - 1.6) / Math.max(0.5, reach - 1.6), 0, 1));
    if (rs.st === 'free' && Math.hypot(a.vx, a.vy) > 1.6) chance -= 0.1;                                // harder on a running sheep
    if (rs.st === 'roped' || rs.st === 'led') chance -= 0.08;
    if (pid === 'rival') chance *= R.lasso.rivalLuck;
    const hit = this.s.rng() < chance;
    this._emit(m, { type: 'lasso', x0: q.x, y0: q.y, x1: a.x, y1: a.y, hit, by: pid, item: item || 'leash' });
    if (!hit) { const dx = a.x - q.x, dy = a.y - q.y, dd = Math.hypot(dx, dy) || 1; Object.assign(rs, { fx: dx / dd, fy: dy / dd, fleeT: Math.max(rs.fleeT, 1.1) }); this._say(m, pid, 'Missed! It bolted'); return false; }
    const from = rs.by, wasLed = rs.st === 'led', wasHeld = rs.st === 'roped' || rs.st === 'led';
    rs.st = 'roped'; rs.by = pid; rs.team = me.team; rs.slot = -1;
    rs.tame = wasHeld ? (wasLed ? R.rope.stolenStart : Math.max(0.2, Math.min(rs.tame, R.rope.stolenStart))) : 0;
    if (wasHeld && from && from !== pid) {
      const holder = m.people[from]; if (holder) holder.stolen++;
      this._emit(m, { type: 'roundup', ev: 'stolen', x: a.x, y: a.y, id: a.id });
      this._say(m, from, `${this._name(m, pid)} lassoed your sheep!`);
      this._say(m, pid, 'Got it! Hold it close until it calms');
    } else this._say(m, pid, 'Caught! Stay close while it calms down');
    return true;
  }

  /* ---------------------------------------- poles ---------------------------------------- */
  /** Use beside your own pole: every sheep you lead is tied up there. */
  tie(id, p) { const m = this.matchOf(p); if (m) this._tie(m, id); }
  _tie(m, pid) {
    const me = m.people[pid], q = this._who(m, pid);
    if (!me || !q || m.phase !== 'play') return 0;
    const pole = RoundupArena.poles[me.team], team = m.teams[me.team];
    if (Math.hypot(q.x - pole.x, q.y - pole.y) > ROUNDUP_POLE_REACH + 0.3) return 0;
    let tied = 0;
    for (const a of this._ropes(m, pid)) {
      if (a.rs.st !== 'led') continue;
      let k = 0; while (k < RoundupRules.arena.slots && team.slots[k]) k++;
      if (k >= RoundupRules.arena.slots) { this._say(m, pid, 'Your pole is full'); break; }
      team.slots[k] = a.id; Object.assign(a.rs, { st: 'pole', team: me.team, by: '', slot: k, tame: 1 });
      tied++; me.tied++;
      this._emit(m, { type: 'roundup', ev: 'tied', x: a.x, y: a.y, id: a.id, team: me.team });
    }
    if (tied && pid === 'rival' && m.rival) m.rival.ai.wait = RoundupRules.lasso.rivalPause;
    if (tied) this._say(m, pid, tied > 1 ? `${tied} sheep tied up! ${this._score(m, me.team)} on your pole` : `Tied up! ${this._score(m, me.team)} on your pole`);
    return tied;
  }

  /** Use beside the other side's pole: start untying one of their sheep. */
  beginSteal(id, p) { const m = this.matchOf(p); if (m) this._beginSteal(m, id); }
  _beginSteal(m, pid) {
    const me = m.people[pid], q = this._who(m, pid);
    if (!me || !q || m.phase !== 'play' || m.steals[pid] || me.stun > 0) return false;
    const victim = 1 - me.team, pole = RoundupArena.poles[victim];
    if (Math.hypot(q.x - pole.x, q.y - pole.y) > RoundupRules.steal.reach || !m.teams[victim].slots.some(Boolean)) return false;
    if (this._ropes(m, pid).length >= RoundupRules.rope.lead) { this._say(m, pid, 'Your hands are full'); return false; }
    m.steals[pid] = { team: victim, prog: 0 };
    if (pid !== 'rival') q.rsteal = 0.001;
    this._say(m, pid, 'Untying a sheep... stay by the pole');
    for (const h of this._humans(m)) if (m.people[h].team === victim) this._say(m, h, `${this._name(m, pid)} is untying one of your sheep!`);
    return true;
  }
  _steals(m, dt) {
    const R = RoundupRules.steal;
    for (const pid of Object.keys(m.steals)) {
      const st = m.steals[pid], me = m.people[pid], q = this._who(m, pid), pole = RoundupArena.poles[st.team];
      const stop = () => { delete m.steals[pid]; if (pid !== 'rival' && q) q.rsteal = 0; };
      if (!me || !q || me.stun > 0 || Math.hypot(q.x - pole.x, q.y - pole.y) > R.reach + 0.9 || !m.teams[st.team].slots.some(Boolean) || this._ropes(m, pid).length >= RoundupRules.rope.lead) { stop(); continue; }
      let guards = 0;
      for (const gid of m.order) {
        const g = m.people[gid], gq = this._who(m, gid);
        if (g && gq && g.team === st.team && Math.hypot(gq.x - pole.x, gq.y - pole.y) <= R.guard) guards++;
      }
      st.prog += dt / (R.base + R.perGuard * guards);
      if (pid !== 'rival') q.rsteal = Math.max(0.001, Math.min(1, st.prog));
      if (st.prog < 1) continue;
      const team = m.teams[st.team];
      let slot = -1;
      for (let k = team.slots.length - 1; k >= 0; k--) if (team.slots[k]) { slot = k; break; }
      const a = slot >= 0 && this.s.animals.animals[team.slots[slot]];
      stop();
      if (!a) continue;
      team.slots[slot] = null;
      Object.assign(a.rs, { st: 'led', team: me.team, by: pid, slot: -1, tame: 1 });
      me.stolen++;
      this._emit(m, { type: 'roundup', ev: 'untied', x: a.x, y: a.y, id: a.id, team: st.team });
      this._say(m, pid, 'Untied! Lead it back to your pole');
      for (const h of this._humans(m)) if (m.people[h].team === st.team) this._say(m, h, `${this._name(m, pid)} took a sheep from your pole!`);
    }
  }

  /* ---------------------------------------- the rival rancher ---------------------------------------- */
  _rivalStep(m, dt) {
    const r = m.rival;
    if (!r) return;
    const R = RoundupRules, me = m.people.rival, ai = r.ai, world = this._world(m), mine = RoundupArena.poles[1];
    ai.cool -= dt; ai.wait = Math.max(0, (ai.wait || 0) - dt);
    let goal = null, speed = R.speed.rival;
    const ropes = this._ropes(m, 'rival'), roped = ropes.filter(a => a.rs.st === 'roped'), led = ropes.filter(a => a.rs.st === 'led');
    const toward = (x, y) => ({ x, y });
    if (ai.wait > 0 || m.steals.rival) { goal = null; speed = 0; }                                     // busy untying a sheep, or catching its breath
    else if (roped.length) {                                                                          // stay close while it calms
      const a = roped.reduce((b, c) => (Math.hypot(c.x - r.x, c.y - r.y) < Math.hypot(b.x - r.x, b.y - r.y) ? c : b));
      if (Math.hypot(a.x - r.x, a.y - r.y) > R.rope.calm - 1.4) goal = toward(a.x, a.y); else speed = 0;
    } else if (led.length) {                                                                           // it takes each one home at once (it never leads two)
      goal = toward(mine.x - 1.4, mine.y);
      if (Math.hypot(r.x - mine.x, r.y - mine.y) <= ROUNDUP_POLE_REACH - 0.4) this._tie(m, 'rival');
    } else if (m.steals && Object.values(m.steals).some(s => s.team === 1)) {                          // somebody is raiding our pole: stand guard
      goal = toward(mine.x + 1.2, mine.y);
    } else {
      let best = null;
      for (const a of this._sheep(m)) {
        const rs = a.rs;
        if (rs.st === 'pole' || ((rs.st === 'roped' || rs.st === 'led') && rs.team === 1)) continue;
        const d = Math.hypot(a.x - r.x, a.y - r.y), score = d + (rs.st === 'free' ? 0 : 2.5) + (Math.hypot(a.x - mine.x, a.y - mine.y) > 14 ? 3 : 0);
        if (rs.st !== 'free' && d > 9) continue;
        if (!best || score < best.score) best = { a, d, score };
      }
      if (led.length && (!best || best.d > 7)) { goal = toward(mine.x - 1.4, mine.y); if (Math.hypot(r.x - mine.x, r.y - mine.y) <= ROUNDUP_POLE_REACH - 0.4) this._tie(m, 'rival'); }
      else if (best) {
        if (best.d <= 4.3 && ai.cool <= 0 && me.stun <= 0 && ropes.length < 1) { this._cast(m, 'rival', best.a, 'leash'); ai.cool = R.lasso.rivalEvery * (0.8 + this.s.rng() * 0.6); speed = 0; }
        else goal = toward(best.a.x, best.a.y);
      } else {                                                                                        // nothing left to catch: raid the other pole
        const theirs = RoundupArena.poles[0];
        if (m.teams[0].slots.some(Boolean)) { goal = toward(theirs.x + 1.6, theirs.y); if (Math.hypot(r.x - theirs.x, r.y - theirs.y) <= R.steal.reach - 0.3) this._beginSteal(m, 'rival'); }
        else goal = toward(mine.x + 2, mine.y);
      }
    }
    if (me.stun > 0) speed *= 0.4;
    let tvx = 0, tvy = 0;
    if (goal && speed > 0) {
      const dx = goal.x - r.x, dy = goal.y - r.y, d = Math.hypot(dx, dy);
      if (d > 0.5) { [tvx, tvy] = isoNormalize(dx / d, dy / d); tvx *= speed * Math.min(1, d / 1.2); tvy *= speed * Math.min(1, d / 1.2); }
    }
    const k = Math.min(1, 14 * dt);
    r.vx += (tvx - r.vx) * k; r.vy += (tvy - r.vy) * k;
    r.x += r.vx * dt; r.y += r.vy * dt;
    resolveCollisions(world, r, CONFIG.sim.playerRadius);
    RoundupArena.clampIn(r, 0.3);
    const sp = Math.hypot(r.vx, r.vy);
    r.state = sp > 0.3 ? 'walk' : 'idle';
    if (sp > 0.2) r.facing = Math.atan2(r.vy, r.vx); else if (roped.length) r.facing = Math.atan2(roped[0].y - r.y, roped[0].x - r.x);
  }
  /** The rival as a villager state (merged into the snapshot's villagers by GameServer.takeSnapshot, so every client draws it the way it draws anyone). */
  rivalStates() {
    const out = {};
    for (const m of this.matches.values()) if (m.rival) { const r = m.rival; out.rival = { id: 'rival', type: r.type, name: r.name, x: r.x, y: r.y, vx: r.vx, vy: r.vy, facing: r.facing, state: r.state, look: r.look, gear: r.gear, say: '', grid: m.grid }; }
    return out;
  }

  /* ---------------------------------------- the end ---------------------------------------- */
  _end(m) {
    const s = this.s, R = RoundupRules;
    m.phase = 'over'; m.t = R.seconds.over;
    for (const pid of Object.keys(m.steals)) { const q = this._who(m, pid); if (pid !== 'rival' && q) q.rsteal = 0; }
    m.steals = {};
    for (const a of this._sheep(m)) if (a.rs.st === 'roped' || a.rs.st === 'led') this._release(m, a, null);
    const scores = [this._score(m, 0), this._score(m, 1)], winner = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : -1;
    m.result = { scores, winner };
    for (const id of this._humans(m)) {
      const me = m.people[id], p = s.players[id], inventory = s.inventories[id];
      if (!p || !inventory) continue;
      const won = winner === me.team, wool = scores[me.team] * R.reward.woolPerSheep + (won ? R.reward.winWool : 0), coins = won ? R.reward.winCoins : 0;
      me.reward = { wool, coins };                                                                      // (handed over when they are back outside: _close)
      if (scores[me.team] > 0 && R.reward.xp && SkillDefs[R.reward.xp[0]]) s.progress.award(id, R.reward.xp[0], R.reward.xp[1] + 6 * scores[me.team]);
      s.pendingEvents.push({ type: 'roundupEnd', to: id, win: won, draw: winner < 0, scores, team: me.team, wool, coins });
      s._notice(id, winner < 0 ? `A draw, ${scores[0]} sheep each! +${wool} wool` : won ? `${m.teams[me.team].name} wins, ${scores[me.team]} to ${scores[1 - me.team]}! +${wool} wool, +${coins} coins` : `${m.teams[winner].name} wins, ${scores[winner]} to ${scores[me.team]}. +${wool} wool`);
    }
    this._emit(m, { type: 'roundup', ev: 'end', winner });
    if (s.quests && s.quests.onMinigame) s.quests.onMinigame('roundup', { ids: this._humans(m), best: Math.max(...this._humans(m).map(id => scores[m.people[id].team])) });
  }

  /** The result has been shown: everyone is taken back to the gate, the sheep and the arena are dropped. `bring`: false when nobody is there to take back. */
  _close(m, bring) {
    const s = this.s;
    if (!this.matches.has(m.grid)) return;
    this.matches.delete(m.grid);
    for (const id of this._humans(m)) {
      const p = s.players[id]; if (!p) continue;
      p.rt = -1; p.rsteal = 0;
      if (bring && gridOf(p) === m.grid) {
        const back = p.returnTo || { grid: '', x: Village.roundup.gate.x, y: Village.roundup.gate.y + 0.3 }, reward = (m.people[id] || {}).reward;
        s._moveToGrid(id, p, back.grid || '', back.x, back.y); p.returnTo = null; p.facing = -Math.PI / 2;
        s.pendingEvents.push({ type: 'roundupLeft', to: id });
        if (reward) {                                                                                   // the prize: wool (a full bag spills into the pony's pack, or the ground by the gate) and coins
          const inventory = s.inventories[id];
          if (reward.wool) { const left = inventory.add('wool', reward.wool); if (left > 0) s._stowOverflow(id, [{ id: 'wool', count: left }]); s.pendingEvents.push({ type: 'gain', to: id, item: 'wool', count: reward.wool }); }
          if (reward.coins) inventory.add('gold_coin', reward.coins);
          s.inventoryRev[id]++;
        }
      }
    }
    for (const id of m.sheep) delete s.animals.animals[id];
    s.grids.drop(m.grid);
  }

  /* ---------------------------------------- what the players are told ---------------------------------------- */
  /** The HUD's state for a player in an arena (null elsewhere). */
  stateFor(id) {
    const p = this.s.players[id], m = this.matchOf(p);
    if (!m) return null;
    const out = { ph: m.phase, t: Math.round(m.t * 10) / 10, you: m.people[id] ? m.people[id].team : -1, rival: !!m.rival, sheep: m.sheep.length,
      teams: m.teams.map((t, i) => ({ n: t.name, c: t.color, s: this._score(m, i), w: m.order.filter(x => m.people[x].team === i).map(x => m.people[x].name) })) };
    const steals = Object.keys(m.steals).map(pid => ({ by: pid, team: m.steals[pid].team, p: Math.round(m.steals[pid].prog * 100) / 100 }));
    if (steals.length) out.steals = steals;
    if (m.result) out.res = m.result;
    return out;
  }
}
