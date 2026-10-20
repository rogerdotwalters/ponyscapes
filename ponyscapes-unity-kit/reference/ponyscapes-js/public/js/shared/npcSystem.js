'use strict';
/* SHARED (server) - the villagers. Each has their OWN HOME (a building site whose data names them as its `resident`) and, if they run a shop, a
 * workplace (their data's `works`: a building with `hours: [open, close]`, 8-17). They keep a day:
 *
 *   22:00-6:00   asleep in their home (out of sight: nobody can talk to them through a wall)
 *   6:30-21:00   about the village: they wander round their favourite spot (the `home` point in their data, with a `radius`)
 *   shopkeepers  walk to their shop in the morning and stand INSIDE it, behind their counter, from opening (8:00) until closing (17:00)
 *   21:00        everyone heads home.
 *
 * THE ROUTES between home, workplace and favourite spot are worked out ONCE, when the world is made (populate: an A* over the village), and walked
 * from then on, so a villager never has to think about the way. A villager nobody is near does not walk at all: they simply turn up where the
 * clock says they should be. They are not solid (they never block a door) and they do not fight; they turn to face you when you come close. */
const NPC_ACTIVE_RADIUS = 36, NPC_NOTICE = 2.6, NPC_SPEED = 0.7, NPC_WALK = 1.7;
const NPC_DAY = Object.freeze({ wake: 6.5, home: 21, sleep: 22, commute: 1.5 });      // hours: out of the house, heading home, in bed; how long before opening a keeper sets off

class NpcSystem {
  constructor({ map, rng, server }) { Object.assign(this, { map, rng, server }); this.npcs = {}; this.routes = {}; }

  /** One villager per row of the NPC table: placed where the clock says, and their routes worked out. */
  populate() {
    const hour = this._hour(this.server ? this.server.tick : 0);
    for (const def of Npcs.all()) {
      this.map.ensureAround(def.home.x, def.home.y, 3);
      const spot = findLanding(this.map, def.home.x, def.home.y, 0.3), npc = new Npc('n_' + def.id, def, spot.x, spot.y);
      npc.home = { x: spot.x, y: spot.y }; npc.facing = this.rng() * Math.PI * 2; npc.timer = 1 + this.rng() * 4;
      npc.houseSite = BuildingSites.list.find(s => s.def.resident === def.id) || null;
      npc.workSite = def.works ? BuildingSites.list.find(s => s.id === def.works) || null : null;
      npc.at = 'out'; npc.walk = null; npc.inside = false; npc.grid = '';
      this.npcs[npc.id] = npc;
      this.routes[def.id] = this._buildRoutes(npc);
      this._settle(npc, this._want(npc, hour));                                   // (the start of the world: wherever they should be at this hour)
    }
  }

  /* ---- the day ---- */
  _hour(tick) { return DayCycle.hourAt(tick); }
  /** Where this villager should be at this hour: 'home' (inside, asleep or at their door), 'work' (inside their shop) or 'out' (about the village). */
  _want(n, h) {
    if (h >= NPC_DAY.home || h < NPC_DAY.wake - 0.2) return n.houseSite ? 'home' : 'out';
    const hours = n.workSite && n.workSite.def.hours;
    if (hours && h >= hours[0] - NPC_DAY.commute && h < hours[1]) return 'work';
    return 'out';
  }

  /* ---- routes, built with the world ---- */
  _front(site) { const f = BuildingSites.doorFront(site); return { x: f.x, y: f.y }; }
  /** The places a villager walks between: the door of their home, the door of their shop, their favourite spot. */
  _places(n) {
    const out = { R: { x: n.home.x, y: n.home.y } };
    if (n.houseSite) out.H = this._front(n.houseSite);
    if (n.workSite) out.W = this._front(n.workSite);
    return out;
  }
  _buildRoutes(n) {
    const places = this._places(n), routes = {};
    for (const a of Object.keys(places)) for (const b of Object.keys(places)) {
      if (a === b) continue;
      routes[a + b] = this._route(places[a], places[b]);
    }
    return routes;
  }
  /** Waypoints from a to b over the village's ground (an A* with the corners smoothed); a straight line if there is no way (they are then helped along). */
  _route(a, b) {
    const m = this.map, steps = 8;
    for (let i = 0; i <= steps; i++) m.ensureAround(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps, 2);
    const pts = findPath(m, a.x, a.y, b.x, b.y);
    return (pts && pts.length ? pts : [{ x: a.x, y: a.y }, { x: b.x, y: b.y }]).map(p => ({ x: p.x, y: p.y }));
  }

  /* ---- placing and moving ---- */
  /** Is anyone where they could see this villager: in the same room, or out in the village near them (a keeper: near their shop's door)? */
  _humansNear(n, humans) {
    const ref = n.grid && n.workSite ? this._front(n.workSite) : n;
    return humans.some(h => (n.grid && gridOf(h) === n.grid) || (!gridOf(h) && Math.hypot(h.x - ref.x, h.y - ref.y) < NPC_ACTIVE_RADIUS));
  }

  /** Put a villager straight at one of the three places (no walking). */
  _settle(n, where) {
    n.walk = null; n.at = where; n.vx = n.vy = 0; n.state = 'idle';
    if (where === 'home') { const f = this._front(n.houseSite); n.x = f.x; n.y = f.y; n.inside = true; n.grid = ''; return; }
    n.inside = false;
    if (where === 'work') {
      const spot = this._keeperSpot(n);
      if (spot) { n.grid = spot.grid; n.x = spot.x; n.y = spot.y; n.facing = spot.facing; n.keeper = spot; return; }
      where = n.at = 'out';                                                       // (a shop with no room drawn yet: they stay outside)
    }
    n.grid = '';
    const home = n.home;
    n.x = home.x; n.y = home.y; n.tx = home.x; n.ty = home.y; n.timer = 1 + this.rng() * 3;
  }

  /** Where a shopkeeper stands inside their shop: beside the furniture their building names (`keeper`), on the side away from the wall. */
  _keeperSpot(n) {
    const site = n.workSite; if (!site) return null;
    const grid = Grids.room(site.index), room = this.server.grids.get(grid);
    if (!room || room.grid !== grid || !room.plan) return null;
    const plan = room.plan, L = plan.layout, f = L.furniture.find(g => g.id === site.def.keeper) || L.furniture.find(g => FurnitureDefs.get(g.id) && FurnitureDefs.get(g.id).shop);
    const exit = plan.exitPoint(), free = (x, y) => plan.isFloor(Math.floor(x), Math.floor(y)) && !plan.solidAt(Math.floor(x), Math.floor(y));
    let spot = null;
    if (f) for (const [dx, dy] of [[f.w / 2, -0.5], [f.w / 2, f.h + 0.5], [-0.5, f.h / 2], [f.w + 0.5, f.h / 2]]) if (free(f.x + dx, f.y + dy)) { spot = { x: f.x + dx, y: f.y + dy }; break; }
    if (!spot) {                                                                 // no such furniture: the free floor nearest the middle of the back of the room
      let best = null;
      for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
        if (!free(tx + 0.5, ty + 0.5)) continue;
        const d = Math.hypot(tx + 0.5 - exit.x, ty - 1.5);
        if (!best || d < best.d) best = { d, x: tx + 0.5, y: ty + 0.5 };
      }
      spot = best;
    }
    return spot ? { grid, x: spot.x, y: spot.y, facing: Math.atan2(exit.y - spot.y, exit.x - spot.x) } : null;
  }

  update(tick, humans) {
    const hour = this._hour(tick);
    for (const id in this.npcs) {
      const n = this.npcs[id];
      if (n.sayT > 0 && (n.sayT -= TICK_DT) <= 0) { n.say = ''; n.sayT = 0; }
      const want = this._want(n, hour), awake = this._humansNear(n, humans);
      if (!n.walk && n.at !== want) {                                              // time to go somewhere else
        if (awake) this._leave(n, want); else this._settle(n, want);
      }
      if (n.walk) {
        if (!awake) { this._settle(n, n.walk.to); continue; }                       // nobody can see them: they are simply there
        this._follow(n);
        continue;
      }
      if (n.inside) continue;
      const nearby = humans.filter(h => gridOf(h) === gridOf(n));
      if (!nearby.length || (!n.grid && !awake)) continue;
      const near = nearby.reduce((best, h) => { const d = Math.hypot(h.x - n.x, h.y - n.y); return d < NPC_NOTICE && (!best || d < best.d) ? { h, d } : best; }, null);
      if (near) { n.state = 'idle'; n.vx = n.vy = 0; n.facing = Math.atan2(near.h.y - n.y, near.h.x - n.x); continue; }       // they turn to look at you
      if (n.grid) { n.state = 'idle'; n.vx = n.vy = 0; if (n.keeper) n.facing = n.keeper.facing; continue; }                    // a keeper stays at their post
      this._wander(n);
    }
  }

  /** Leave the place they are in and set off for `to` along the route built for it. */
  _leave(n, to) {
    const from = n.at, key = (from === 'home' ? 'H' : from === 'work' ? 'W' : 'R') + (to === 'home' ? 'H' : to === 'work' ? 'W' : 'R'), route = this.routes[n.def.id][key];
    if (!route) { this._settle(n, to); return; }
    if (from === 'home') { const f = this._front(n.houseSite); n.x = f.x; n.y = f.y; n.inside = false; }       // out of the door
    else if (from === 'work') { const f = this._front(n.workSite); n.x = f.x; n.y = f.y; n.grid = ''; }                // out of the shop
    const pts = route.slice();
    if (from === 'out' && Math.hypot(pts[0].x - n.x, pts[0].y - n.y) > 0.3) pts.unshift({ x: n.x, y: n.y });             // (from wherever they were wandering)
    n.walk = { to, pts, i: 0, stuck: 0, best: Infinity };
    n.state = 'walk';
  }

  /** One step along the walk; arriving ends it (they go inside, or begin to wander). */
  _follow(n) {
    const w = n.walk, speed = NPC_WALK * GameSettings.speed();
    let target = w.pts[Math.min(w.i, w.pts.length - 1)], dx = target.x - n.x, dy = target.y - n.y, d = Math.hypot(dx, dy);
    while (d < 0.2 && w.i < w.pts.length - 1) { w.i++; w.best = Infinity; w.stuck = 0; target = w.pts[w.i]; dx = target.x - n.x; dy = target.y - n.y; d = Math.hypot(dx, dy); }
    if (d < 0.25 && w.i >= w.pts.length - 1) { this._settle(n, w.to); return; }
    const [ux, uy] = isoNormalize(dx / d, dy / d), px = n.x, py = n.y;
    n.vx = ux * speed; n.vy = uy * speed; n.x += n.vx * TICK_DT; n.y += n.vy * TICK_DT;
    resolveCollisions(this.map, n, 0.25);
    n.facing = Math.atan2(dy, dx); n.state = 'walk';
    if (d < w.best - 0.02) { w.best = d; w.stuck = 0; } else if ((w.stuck += TICK_DT) > 1.5) { n.x = target.x; n.y = target.y; w.stuck = 0; w.best = Infinity; }   // jammed on something: helped to the next point
  }

  _wander(n) {
    const def = n.def;
    n.timer -= TICK_DT;
    if (n.state !== 'wander') { n.state = 'idle'; n.vx = n.vy = 0; if (n.timer <= 0) this._pickSpot(n, def); return; }
    const dx = n.tx - n.x, dy = n.ty - n.y, d = Math.hypot(dx, dy);
    if (d < 0.15 || n.timer <= 0) { n.state = 'idle'; n.vx = n.vy = 0; n.timer = 2 + this.rng() * 5; return; }
    const [ux, uy] = isoNormalize(dx / d, dy / d), px = n.x, py = n.y;
    const speed = NPC_SPEED * GameSettings.speed();
    n.vx = ux * speed; n.vy = uy * speed; n.x += n.vx * TICK_DT; n.y += n.vy * TICK_DT;
    resolveCollisions(this.map, n, 0.25);
    n.facing = Math.atan2(dy, dx);
    if (Math.hypot(n.x - px, n.y - py) < 0.2 * NPC_SPEED * TICK_DT) { n.state = 'idle'; n.timer = 1; }                   // walked into something: stop and think again
  }

  _pickSpot(n, def) {
    const a = this.rng() * Math.PI * 2, r = this.rng() * def.radius, x = n.home.x + Math.cos(a) * r, y = n.home.y + Math.sin(a) * r;
    this.map.ensureAround(x, y, 1);
    if (circleBlocked(this.map, x, y, 0.25)) { n.timer = 1; return; }
    n.tx = x; n.ty = y; n.state = 'wander'; n.timer = 8;
  }

  /** The villagers anyone could see right now (not those indoors at home). */
  visible() { const out = {}; for (const id in this.npcs) if (!this.npcs[id].inside) out[id] = this.npcs[id]; return out; }

  /** Everything the clients need to draw them (there are only a few): each says which grid it is on (a keeper is in their shop's room). */
  states() {
    const out = {};
    for (const id in this.npcs) {
      const n = this.npcs[id]; if (n.inside) continue;
      out[id] = { id, type: n.type, name: n.name, x: n.x, y: n.y, vx: n.vx, vy: n.vy, facing: n.facing, state: n.state === 'walk' ? 'walk' : n.state === 'wander' ? 'walk' : 'idle', look: n.look, gear: n.gear, say: n.say, grid: n.grid || undefined };
    }
    return out;
  }

  /** Make one speak (everyone nearby sees the bubble for a few seconds). */
  speak(n, text) { n.say = text; n.sayT = 5; }
}
