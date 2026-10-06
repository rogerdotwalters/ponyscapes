'use strict';
/* SERVER-SIDE wildlife: spawning, simple AI (idle -> wander, flee from players, come to food), taming (leash, pets that
 * follow or stay near home), damage, drops, respawn.
 * Animals only think while a player is within ANIMAL_ACTIVE_RADIUS, so a big world costs nothing. */
const ANIMAL_ACCEL = 14, ANIMAL_TURN_RATE = 8, HURT_SPEED_FACTOR = 0.75;
const STEALTH_KEY = { idle: 'idle', sneak: 'sneak', walk: 'walk', run: 'run', row: 'walk' };

/** How an animal reacts to food in a player's hand: { radius, trust, approach } or null. Earth ponies ADORE apples:
 *  they notice them from much farther away, trust you for longer and trot up faster. Charisma widens everyone's trust. */
function lureFor(def, itemId, levels, buffs) {
  if (!def.lure || !ItemDB.getFood(itemId)) return null;
  const charm = Skills.trustFactor(levels) * (1 + ((buffs && buffs.friendship) || 0) / 100);     // Warm Heart ponies: animals trust you from farther
  if (def.id === 'pony_earth' && itemId === 'apple') return { radius: LURE_RADIUS * 1.8 * charm, trust: TRUST_SECONDS * 2, approach: 2.2 };
  return { radius: LURE_RADIUS * charm, trust: TRUST_SECONDS, approach: 1.5 };
}

class AnimalSystem {
  /** @param {{map, rng, getTick, emit, damagePlayer:(id,amount)=>void, getLights:()=>Array}} deps */
  constructor(deps) { Object.assign(this, deps); this.animals = {}; this.hostilesOff = false; this.nextId = 1; this.respawns = []; }

  /** @param {number} [gene] decides a pony's look (a chunk's herd always looks the same)
   *  @param {{level?:number, variant?:number}} [opts] born level (default: from the distance to the origin) and pony variety (default: from the biome here) */
  spawn(type, x, y, gene, opts = {}) {
    const def = AnimalDefs[type], id = 'a' + this.nextId++;
    const level = opts.level !== undefined ? opts.level : AnimalLevels.roll(type, x, y, this.rng(), this.map.layers);
    const variant = def.pony ? (opts.variant !== undefined ? opts.variant : PonyLook.variantOf(this.map.biome(Math.floor(x), Math.floor(y)))) : 0;
    let look = def.pony ? PonyLook.fromGene(gene !== undefined ? gene : Math.floor(this.rng() * 2147483647), variant, def.rarity) : null;   // its rarity is rolled at birth (rarity.js)
    if (look && opts.rarity) look = PonyLook.withRarity(look, opts.rarity);
    const maxHp = Math.max(1, Math.round(def.hp * AnimalLevels.hpFactor(level)));
    this.animals[id] = new Animal(id, type, x, y, { level, maxHp, facing: this.rng() * Math.PI * 2, timer: 1 + this.rng() * 4, look });
    return id;
  }

  /** Think + move every active animal, then handle respawns. `humans` are the player objects animals react to. */
  update(tick, humans) {
    for (const id in this.animals) {
      const a = this.animals[id];
      if (a.rider || !humans.some(h => Math.hypot(h.x - a.x, h.y - a.y) < ANIMAL_ACTIVE_RADIUS)) continue;     // a ridden pony is steered by its rider
      const def = AnimalDefs[a.type];
      this._think(a, def, humans, TICK_DT);
      this._move(a, def, TICK_DT);
    }
    this._runRespawns(tick, humans);
  }

  /** Who is in charge of this animal this tick: its owner / captor (a pet), or the behaviour its data names. */
  _think(a, def, humans, dt) {
    if (a.owner || a.captor) { this._thinkPet(a, def, humans, dt); return; }
    if (def.hostile) {
      if (this.hostilesOff) {                                                    // the host switched monsters off: they only wander, never chase or attack
        if (a.state !== 'wander') { a.state = 'idle'; if (!(a.timer > 0)) a.timer = 1; }
        this._wander(a, def, dt); return;
      }
      humans = humans.filter(h => !h.flying);                                    // nothing on the ground can reach a rider in the air
    }
    Behaviors.require(def.behavior || 'timid').think(this, a, def, humans, dt);
  }

  _wander(a, def, dt) {
    a.timer -= dt;
    if (a.state === 'idle') {
      this._steerAlong(a, 0, 0, 0);
      if (a.timer <= 0) this._chooseWanderTarget(a);
    } else {                                                           // wander (or a leftover chase)
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      const moving = Math.hypot(a.vx, a.vy) > 0.25 * def.wanderSpeed;
      a.stuckT = moving ? 0 : a.stuckT + dt;
      if (d < 0.2 || a.timer <= 0 || a.stuckT > 0.8) { a.state = 'idle'; a.timer = 2 + this.rng() * 4; a.stuckT = 0; }
      else this._steerAlong(a, dx, dy, def.wanderSpeed);
    }
  }

  /** A tamed animal: on a leash it follows its owner; otherwise it potters about near the spot it was let go and never panics.
   *  A CAUGHT wild pony (captor, not yet owner) follows the same way but is restless: it breaks free unless you get it to shelter. */
  _thinkPet(a, def, humans, dt) {
    if (!a.owner) { this._tickCapture(a, dt); if (!a.captor) return; }                 // (it may just have broken free)
    if (!a.leashed) { a.hurt = false; this._wander(a, def, dt); return; }
    const leaderId = a.owner || a.captor, owner = humans.find(h => h.id === leaderId);
    if (!owner) {                                                                      // the leader is gone: let go where we stand
      if (a.captor) this.releaseWild(a.id); else { a.leashed = false; a.home = { x: a.x, y: a.y }; }
      return;
    }
    const d = Math.hypot(owner.x - a.x, owner.y - a.y);
    a.stuckT = (d > LEASH_FOLLOW_DISTANCE * 1.7 && Math.hypot(a.vx, a.vy) < 0.3) ? a.stuckT + dt : 0;
    if (d > LEASH_TELEPORT_DISTANCE || a.stuckT > LEASH_STUCK_SECONDS) {                // too far or wedged behind something: catch up
      a.x = owner.x - Math.cos(owner.facing) * 1.2; a.y = owner.y - Math.sin(owner.facing) * 1.2; a.stuckT = 0; a.vx = a.vy = 0;
      return;
    }
    a.state = d > LEASH_FOLLOW_DISTANCE ? 'follow' : 'idle';
    this._steerAlong(a, owner.x - a.x, owner.y - a.y, d > LEASH_FOLLOW_DISTANCE ? Math.min(def.followSpeed || def.wanderSpeed * 3, 0.5 + d * 1.5) : 0);
  }

  /** A caught pony settles inside shelter and frets outside it. */
  _tickCapture(a, dt) {
    const tick = this.getTick();
    if (tick - a.shelterTick > 30) { a.shelter = Shelter.find(this.map, a.x, a.y); a.shelterTick = tick; }
    if (a.shelter) { a.captureT = Math.max(0, a.captureT - dt * 2); a.warned = false; return; }
    a.captureT += dt;
    if (!a.warned && a.captureT >= CAPTURE_BREAK_SECONDS * CAPTURE_WARN_FRACTION) {
      a.warned = true; this.emit({ type: 'notice', to: a.captor, text: 'The pony is getting restless: lead it to a stable or a fenced pen' });
    }
    if (a.captureT >= CAPTURE_BREAK_SECONDS) {
      const captor = a.captor, x = a.x, y = a.y;
      this.releaseWild(a.id);
      this.emit({ type: 'brokeFree', to: captor, x, y }); this.emit({ type: 'notice', to: captor, text: 'The pony broke free!' });
    }
  }

  _chooseWanderTarget(a) {
    const angle = this.rng() * Math.PI * 2, dist = 1.5 + this.rng() * 4;
    let tx = a.x + Math.cos(angle) * dist, ty = a.y + Math.sin(angle) * dist;
    if (a.owner && a.home) {                                                           // pets stay near home
      const hx = tx - a.home.x, hy = ty - a.home.y, hd = Math.hypot(hx, hy);
      if (hd > PET_HOME_RADIUS) { tx = a.home.x + hx / hd * PET_HOME_RADIUS; ty = a.home.y + hy / hd * PET_HOME_RADIUS; }
    }
    a.tx = tx; a.ty = ty; a.state = 'wander'; a.timer = 8; a.stuckT = 0;
  }

  _steerAlong(a, dx, dy, speed) {
    const d = Math.hypot(dx, dy) || 1;
    let ux = dx / d, uy = dy / d;
    if (speed > 0 && d > 1e-6) [ux, uy] = isoNormalize(ux, uy);                      // same constant ON-SCREEN speed in every direction, like the player
    a.tvx = ux * speed; a.tvy = uy * speed;
  }

  _move(a, def, dt) {
    let pace = def.pony ? 1 : AnimalLevels.speedFactor(a.level);          // higher-level animals are a little quicker (a pony's level is already in its speed curve)
    if (a.slowT > 0) { a.slowT -= dt; pace *= a.slowF || 1; }             // chilled by a Frost Nova
    accelerateToward(a, (a.tvx || 0) * pace, (a.tvy || 0) * pace, ANIMAL_ACCEL * dt);
    a.x += a.vx * dt; a.y += a.vy * dt;
    resolveCollisions(this.map, a, def.radius);                         // water, trees, walls: animals stay out of them too
    if (Math.hypot(a.vx, a.vy) > 0.05) turnToward(a, Math.atan2(a.vy, a.vx), ANIMAL_TURN_RATE * dt);
  }

  /** Nearest animal whose body is within `reach` of the player: { id, animal, gap } or null. */
  nearestInReach(p, reach) {
    let best = null;
    for (const id in this.animals) {
      const a = this.animals[id], gap = Math.hypot(a.x - p.x, a.y - p.y) - AnimalDefs[a.type].radius;
      if (this._huntable(a) && gap <= reach && (!best || gap < best.gap)) best = { id, animal: a, gap };
    }
    return best;
  }

  /** Pets and protected species (ponies) are never prey. */
  _huntable(a) { return !a.owner && !AnimalDefs[a.type].protected; }

  /** Nearest animal you could put a leash on: tameable, and not somebody else's. */
  nearestTameable(p, reach) {
    let best = null;
    for (const id in this.animals) {
      const a = this.animals[id], def = AnimalDefs[a.type], gap = Math.hypot(a.x - p.x, a.y - p.y) - def.radius;
      if (def.tameable && !a.captor && !a.rider && (!a.owner || (a.owner === p.id && !a.leashed)) && gap <= reach && (!best || gap < best.gap)) best = { id, animal: a, gap };
    }
    return best;
  }

  /** The lasso's target: the best tameable animal within `reach` tiles, inside the throwing cone (or very close). */
  nearestLassoable(p, reach) {
    let best = null;
    for (const id in this.animals) {
      const a = this.animals[id], def = AnimalDefs[a.type];
      if (!def.tameable || a.captor || a.rider || (a.owner && (a.owner !== p.id || a.leashed))) continue;
      const gap = Math.hypot(a.x - p.x, a.y - p.y) - def.radius;
      if (gap > reach) continue;
      const off = Math.abs(wrapAngle(Math.atan2(a.y - p.y, a.x - p.x) - p.facing));
      if (gap > LASSO_CLOSE && off > LASSO_HALF_ANGLE) continue;
      const score = gap <= LASSO_CLOSE ? gap : gap + off * 1.5;           // within arm's length facing does not matter: whatever is right beside you is what you mean
      if (!best || score < best.score) best = { id, animal: a, gap, score };
    }
    return best;
  }

  /** Chance a thrown lasso lands: calm animals are easy, running ones hard; far throws and clumsy hands cost, Horsemanship helps. */
  lassoChance(a, dist, levels, buffs) {
    const base = LASSO_BASE_CHANCE[a.state] !== undefined ? LASSO_BASE_CHANCE[a.state] : 0.5;
    const outlevelled = Math.max(0, (a.level || 1) - Skills._s(levels, 'horsemanship'));      // a pony stronger than you is harder to rope
    const charm = buffs ? ((buffs.luck || 0) + (buffs.friendship || 0)) / 200 : 0;             // lucky and well-liked riders throw better
    return clamp(base - Math.max(0, dist - LASSO_CLOSE) * 0.06 + Skills.lassoBonus(levels) + charm - 0.035 * outlevelled, 0.12, 0.95);
  }

  /** A missed throw spooks it. */
  startle(id, from) {
    const a = this.animals[id], def = AnimalDefs[a.type];
    a.state = 'flee'; a.fleeT = def.fleeSeconds; a.fx = a.x - from.x; a.fy = a.y - from.y; a.trustT = 0;
  }

  /* ---- keeping animals ---- */
  tame(id, ownerId) {
    const a = this.animals[id];
    a.owner = ownerId; a.leashed = true; a.home = { x: a.x, y: a.y }; a.state = 'idle'; a.fleeT = 0; a.hurt = false; a.hp = AnimalDefs[a.type].hp;
    return a;
  }
  /** A wild pony is caught on the lasso: it follows you, but is not yours until it has eaten its apples in shelter. */
  capture(id, captorId) {
    const a = this.animals[id];
    a.captor = captorId; a.leashed = true; a.trust = 0; a.captureT = 0; a.warned = false; a.shelter = null; a.shelterTick = -999;
    a.state = 'idle'; a.fleeT = 0; a.hurt = false; a.trustT = 0;
    return a;
  }
  /** One apple eaten. Returns { done, have, need }; at `need` apples the pony settles in as the captor's free pet. */
  feed(id, captorId, discount = 0) {
    const a = this.animals[id];
    if (!a || a.captor !== captorId) return null;
    const need = a.applesNeed = Math.max(1, AnimalLevels.applesNeeded(AnimalDefs[a.type], a.level) - discount);   // an upgraded stable settles it with fewer
    a.trust = Math.min(need, a.trust + 1);
    if (a.trust < need) return { done: false, have: a.trust, need };
    a.owner = captorId; a.captor = ''; a.leashed = false; a.home = { x: a.x, y: a.y }; a.captureT = 0; a.warned = false; a.state = 'idle'; a.hp = a.maxHp;
    return { done: true, have: a.trust, need };
  }
  /** Let a caught pony go: it bolts. Returns who held it. */
  releaseWild(id) {
    const a = this.animals[id], def = AnimalDefs[a.type], captor = a.captor, angle = this.rng() * Math.PI * 2;
    a.captor = ''; a.leashed = false; a.trust = 0; a.captureT = 0; a.warned = false;
    a.state = 'flee'; a.fleeT = def.fleeSeconds; a.fx = Math.cos(angle); a.fy = Math.sin(angle); a.trustT = 0;
    return captor;
  }
  unleash(id) { const a = this.animals[id]; a.leashed = false; a.home = { x: a.x, y: a.y }; a.state = 'idle'; return a; }
  /** Everything an owner has on a leash is let go (they left the game). */
  releaseOwner(ownerId) {
    for (const id in this.animals) {
      const a = this.animals[id];
      if (a.owner === ownerId && a.leashed) this.unleash(id);
      else if (a.captor === ownerId) this.releaseWild(id);
    }
  }
  /** Pick a small animal up. Returns its type. */
  pickup(id) { const a = this.animals[id]; delete this.animals[id]; return a.type; }
  /** Set a carried animal down as somebody's pet. */
  release(type, x, y, ownerId, gene, opts) {
    const id = this.spawn(type, x, y, gene, opts), a = this.animals[id];
    a.owner = ownerId; a.home = { x, y };
    return a;
  }

  /** What an owner sees in their Pony Book: every pet they own (wherever it is) + whether it is fenced in, plus wild ponies they are gentling. */
  petsOf(ownerId, tick) {
    const out = [];
    for (const id in this.animals) {
      const a = this.animals[id];
      if (a.owner !== ownerId && a.captor !== ownerId) continue;
      if (a.owner && tick - a.penTick > 30) { a.pen = PenSystem.analyze(this.map, a.x, a.y); a.penTick = tick; }
      const gentling = a.captor ? { have: a.trust, need: a.applesNeed || AnimalLevels.applesNeeded(AnimalDefs[a.type], a.level), sheltered: !!a.shelter, restless: Math.round(100 * a.captureT / CAPTURE_BREAK_SECONDS) } : null;
      out.push({ id, type: a.type, level: a.level, look: a.look, x: a.x, y: a.y, leashed: a.leashed, inPen: !!a.owner && a.pen.enclosed, penArea: a.owner && a.pen.enclosed ? a.pen.area : 0, gentling, riding: !!a.rider, xp: a.owner && AnimalDefs[a.type].pony ? PonyXp.progress(a) : null });
    }
    return out;
  }

  /** Nearest animal within `range` and within `halfAngle` radians of where the player faces: { id, animal } or null. */
  nearestInCone(p, range, halfAngle) {
    let best = null, bestDist = range;
    for (const id in this.animals) {
      const a = this.animals[id], d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d > bestDist || !this._huntable(a)) continue;
      if (Math.abs(wrapAngle(Math.atan2(a.y - p.y, a.x - p.x) - p.facing)) > halfAngle) continue;
      bestDist = d; best = { id, animal: a };
    }
    return best;
  }

  /** Hurts an animal. Returns { killed, drops:[{item,count}], animal }. */
  damage(id, amount) {
    const a = this.animals[id], def = AnimalDefs[a.type];
    a.hp -= amount; a.hurt = true; a.state = 'flee'; a.fleeT = def.fleeSeconds;
    if (a.hp > 0) return { killed: false, drops: [], animal: a };
    delete this.animals[id];
    if (this.onKilled) this.onKilled(a, def);
    if (!def.boss) this.respawns.push({ type: a.type, cx: Math.floor(a.x) >> CHUNK_SHIFT, cy: Math.floor(a.y) >> CHUNK_SHIFT, atTick: this.getTick() + secondsToTicks(ANIMAL_RESPAWN_SECONDS) });
    const drops = [];
    for (const d of def.drops) {
      if (d.chance !== undefined && this.rng() >= d.chance) continue;
      drops.push({ item: d.item, count: d.min + Math.floor(this.rng() * (d.max - d.min + 1)) });
    }
    return { killed: true, drops, animal: a };
  }

  /** A hunted animal is replaced later in the same chunk, out of sight of every player. */
  _runRespawns(tick, humans) {
    this.respawns = this.respawns.filter(r => {
      if (r.atTick > tick) return true;
      for (let attempt = 0; attempt < 20; attempt++) {
        const tx = r.cx * CHUNK_SIZE + Math.floor(this.rng() * CHUNK_SIZE), ty = r.cy * CHUNK_SIZE + Math.floor(this.rng() * CHUNK_SIZE);
        const tile = this.map.tile(tx, ty);
        if ((tile !== TILE.GRASS && tile !== TILE.DIRT) || this.map.navBlocked(tx, ty) || humans.some(h => Math.hypot(h.x - tx, h.y - ty) < 14)) continue;
        this.spawn(r.type, tx + 0.5, ty + 0.5);
        return false;
      }
      r.atTick = tick + secondsToTicks(30);                              // no room right now: try again later
      return true;
    });
  }

  /** Snapshot part: animals within sync range of any human. */
  states(humans) {
    const out = {};
    for (const id in this.animals) {
      const a = this.animals[id];
      if (humans.some(h => Math.hypot(h.x - a.x, h.y - a.y) < ANIMAL_SYNC_RADIUS)) {
        out[id] = { id, type: a.type, level: a.level, x: a.x, y: a.y, vx: a.vx, vy: a.vy, facing: a.facing, hp: a.hp, state: a.state, look: a.look, owner: a.owner, captor: a.captor, leashed: a.leashed, rider: a.rider };
      }
    }
    return out;
  }
}
