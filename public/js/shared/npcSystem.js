'use strict';
/* SHARED (server) - the villagers: they live near their homes, wander a little, turn to face you when you come close, and speak when you talk to them.
 * They are not solid (they never block a door) and they do not fight. */
const NPC_ACTIVE_RADIUS = 48, NPC_NOTICE = 2.6, NPC_SPEED = 0.7;

class NpcSystem {
  constructor({ map, rng }) { Object.assign(this, { map, rng }); this.npcs = {}; }

  /** One villager per row of the NPC table, each placed on the nearest standable spot to its home. */
  populate() {
    for (const def of Npcs.all()) {
      this.map.ensureAround(def.home.x, def.home.y, 3);
      const spot = findLanding(this.map, def.home.x, def.home.y, 0.3), npc = new Npc('n_' + def.id, def, spot.x, spot.y);
      npc.home = { x: spot.x, y: spot.y }; npc.facing = this.rng() * Math.PI * 2; npc.timer = 1 + this.rng() * 4;
      this.npcs[npc.id] = npc;
    }
  }

  update(tick, humans) {
    for (const id in this.npcs) {
      const n = this.npcs[id];
      if (n.sayT > 0 && (n.sayT -= TICK_DT) <= 0) { n.say = ''; n.sayT = 0; }
      if (!humans.some(h => Math.hypot(h.x - n.x, h.y - n.y) < NPC_ACTIVE_RADIUS)) continue;
      const near = humans.reduce((best, h) => { const d = Math.hypot(h.x - n.x, h.y - n.y); return d < NPC_NOTICE && (!best || d < best.d) ? { h, d } : best; }, null);
      if (near) { n.state = 'idle'; n.vx = n.vy = 0; n.facing = Math.atan2(near.h.y - n.y, near.h.x - n.x); continue; }       // they turn to look at you
      this._wander(n);
    }
  }

  _wander(n) {
    const def = n.def;
    n.timer -= TICK_DT;
    if (n.state === 'idle') { n.vx = n.vy = 0; if (n.timer <= 0) this._pickSpot(n, def); return; }
    const dx = n.tx - n.x, dy = n.ty - n.y, d = Math.hypot(dx, dy);
    if (d < 0.15 || n.timer <= 0) { n.state = 'idle'; n.vx = n.vy = 0; n.timer = 2 + this.rng() * 5; return; }
    const [ux, uy] = isoNormalize(dx / d, dy / d), px = n.x, py = n.y;
    n.vx = ux * NPC_SPEED; n.vy = uy * NPC_SPEED; n.x += n.vx * TICK_DT; n.y += n.vy * TICK_DT;
    resolveCollisions(this.map, n, 0.25);
    n.facing = Math.atan2(dy, dx);
    if (Math.hypot(n.x - px, n.y - py) < 0.2 * NPC_SPEED * TICK_DT) { n.state = 'idle'; n.timer = 1; }                   // walked into something: stop and think again
  }

  _pickSpot(n, def) {
    const a = this.rng() * Math.PI * 2, r = this.rng() * def.radius, x = n.home.x + Math.cos(a) * r, y = n.home.y + Math.sin(a) * r;
    this.map.ensureAround(x, y, 1);
    if (circleBlocked(this.map, x, y, 0.25)) { n.timer = 1; return; }
    n.tx = x; n.ty = y; n.state = 'walk'; n.timer = 8;
  }

  /** Everything the clients need to draw them (there are only a few). */
  states() {
    const out = {};
    for (const id in this.npcs) { const n = this.npcs[id]; out[id] = { id, type: n.type, name: n.name, x: n.x, y: n.y, vx: n.vx, vy: n.vy, facing: n.facing, state: n.state, look: n.look, gear: n.gear, say: n.say }; }
    return out;
  }

  /** Make one speak (everyone nearby sees the bubble for a few seconds). */
  speak(n, text) { n.say = text; n.sayT = 5; }
}
