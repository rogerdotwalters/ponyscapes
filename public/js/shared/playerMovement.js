'use strict';
/* SHARED - player state + movement. Runs on the client (prediction) and the server (authority). */
function createPlayer(slot, spawn) {
  return {
    x: spawn.x, y: spawn.y, vx: 0, vy: 0, facing: Math.PI / 2, state: 'idle',
    color: CONFIG.sim.slotColors[slot], slot, ack: 0, name: '', appearance: CharacterLook.defaultFor(slot),
    sel: 0, held: '', swingT: 0, swingHit: false,         // written by the server's ToolSystem
    boat: '',                                             // id of the boat we are rowing, or ''
    hunger: CONFIG.sim.hunger.max, thirst: CONFIG.sim.thirst.max, eatT: 0,   // written by the server's VitalsSystem
    hungerMode: 'normal', thirstMode: 'normal',                              // the host can change these per player (see CONFIG.sim.vitalModes)
    id: 'p' + (slot + 1), hp: CONFIG.sim.health.max, hurtT: 0,               // health; damaged by monsters
    gear: createWardrobe(),                                                  // what you wear: crown, outfit, cape
    looted: false, emote: '', emoteT: 0, torchT: 0,
    lv: defaultLevels(), maxHp: CONFIG.sim.health.max,                       // skill / attribute LEVELS (public); the XP behind them stays on the server
    mount: '', mountLevel: 1,                                                // id of the pony we are riding (or ''), and its level (higher-level ponies run faster)
    flying: false, flyT: 0, flyDur: 0, flyCd: 0,                            // a pegasus's flight: in the air, seconds left, how long it lasts, seconds until the next one
    buffs: noBuffs(), companions: 0, carryStacks: 1,                         // what the ponies with you add (rarity.js), and stacks of each resource you may carry (stockpiles.js)
    abilities: [], abilityCd: [0, 0], dashT: 0, dashBoost: 0                 // the ridden pony's rarity abilities (H / K), their cooldowns, and a running Dash
  };
}
const noBuffs = () => ({ movement: 0, health: 0, luck: 0, friendship: 0, carry: 0 });
const clonePlayer = p => Object.assign({}, p, { gear: Object.assign({}, p.gear), buffs: Object.assign(noBuffs(), p.buffs), abilities: (p.abilities || []).slice(), abilityCd: (p.abilityCd || [0, 0]).slice() });

/** Never trust the wire: clamp everything. Input = { moveX, moveY, run, sneak, action, interact, slot, seq } (world axes).
 *  `interact` is true for exactly one tick per key press (board / leave a boat). */
/** A selectable hotbar slot (0..5). */
function sanitizeSlot(n) { return clamp(n | 0, 0, CONFIG.sim.inventory.hotbarSlots - 1); }

function sanitizeInput(i) {
  const num = v => (Number.isFinite(v) ? v : 0);
  return {
    moveX: clamp(num(i.moveX), -1, 1), moveY: clamp(num(i.moveY), -1, 1),
    run: !!i.run, sneak: !!i.sneak, action: !!i.action, interact: !!i.interact,
    slot: sanitizeSlot(i.slot), seq: i.seq | 0,
    power: clamp(i.power | 0, 0, 2)                                          // 1 / 2: fire the ridden pony's first / second rarity ability this tick
  };
}

/** Advances ONE player by dt seconds: acceleration, collision, facing. Pure; mutates only `p`. */
/** The isometric view squashes the screen's vertical axis by 2:1, so the SAME world speed looks twice as fast sideways as up or down the screen.
 *  This rescales a world-space move so its length ON SCREEN depends only on how hard you push, not on which way: walking up the screen is no
 *  longer a crawl and walking across it no longer a sprint. Moving along a world axis is unchanged (that is the reference speed). */
/** How far a world-space move LOOKS on screen, in "world-axis steps" (a step along a world axis = 1): used to time walk cycles so feet never slide. */
function isoLength(dx, dy) {
  const r = CONFIG.view.tileH / CONFIG.view.tileW;
  return Math.hypot(dx - dy, r * (dx + dy)) / Math.hypot(1, r);
}

function isoNormalize(mx, my) {
  const mag = Math.hypot(mx, my);
  if (mag < 1e-6) return [mx, my];
  const r = CONFIG.view.tileH / CONFIG.view.tileW, onScreen = Math.hypot(mx - my, r * (mx + my)), k = mag * Math.hypot(1, r) / onScreen;
  return [mx * k, my * k];
}

function stepPlayer(p, input, dt, map) {
  const C = CONFIG.sim;
  let mx = input.moveX, my = input.moveY, mag = Math.hypot(mx, my);
  if (mag > 1) { mx /= mag; my /= mag; mag = 1; }               // diagonals are not faster
  const moving = mag > 0.01;
  if (moving) [mx, my] = isoNormalize(mx, my);                  // ...and every screen direction is the same speed
  const modeOf = mode => C.vitalModes[mode] || C.vitalModes.normal;          // unknown / missing mode = normal
  const starving = p.hunger <= 0 && modeOf(p.hungerMode).penalty;           // 'superficial' / 'off' modes never hurt
  const parched = p.thirst <= 0 && modeOf(p.thirstMode).penalty;
  const weak = starving || parched;                            // no sprinting, slower walk
  const slowdown = (starving ? C.hunger.starvingSpeedFactor : 1) * (parched ? C.thirst.slowFactor : 1);
  const riding = !!p.mount, R = C.ride, flying = riding && !!p.flying;                    // in the air: no wading, a little faster, and only barriers and cave walls stop you
  const wading = !flying && map.tile(Math.floor(p.x), Math.floor(p.y)) === TILE.SHALLOW ? C.wadeSpeedFactor : 1;                                    // on a pony: faster, a little wider, scaled by Horsemanship
  const boost = (1 + ((p.buffs && p.buffs.movement) || 0) / 100) * (p.dashT > 0 ? 1 + (p.dashBoost || 0) / 100 : 1);   // pony buffs, and a Dash
  if (p.dashT > 0) p.dashT = Math.max(0, p.dashT - dt);
  const mountPace = (riding ? Skills.rideFactor(p.lv) * AnimalLevels.rideSpeedFactor(p.mountLevel) : 1) * boost;
  const walk = riding ? R.walkSpeed * mountPace : C.walkSpeed * Skills.speedFactor(p.lv) * boost;
  const topSpeed = (weak ? walk * slowdown : input.run ? (riding ? R.runSpeed * mountPace : C.runSpeed * Skills.speedFactor(p.lv) * boost) : input.sneak && !riding ? C.sneakSpeed : walk) * wading * (flying ? PonyAbilities.get('fly').speedFactor : 1);

  accelerateToward(p, mx * topSpeed, my * topSpeed, movementRate(p, mx * topSpeed, my * topSpeed, moving) * dt);
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (flying) resolveFlightCollisions(map, p, R.radius); else resolveCollisions(map, p, riding ? R.radius : C.playerRadius);

  if (mag > 0.1) turnToward(p, snapAngle8(Math.atan2(my, mx)), C.turnRate * dt);
  p.state = Math.hypot(p.vx, p.vy) < 0.15 / TILE_SCALE ? 'idle' : input.run && !weak ? 'run' : input.sneak ? 'sneak' : 'walk';
  p.ack = input.seq;
}

/** Speeding up in the direction we are already heading uses `accel`; anything else (stopping, slowing, turning
 *  around) brakes hard with `decel`, so the character stops dead instead of sliding. */
function movementRate(p, targetVx, targetVy, moving) {
  const C = CONFIG.sim, speed = Math.hypot(p.vx, p.vy), targetSpeed = Math.hypot(targetVx, targetVy);
  if (!moving) return C.decel;
  const alignment = speed < 1e-6 ? 1 : (p.vx * targetVx + p.vy * targetVy) / (speed * targetSpeed);
  return targetSpeed >= speed && alignment > 0.5 ? C.accel : C.decel;
}

function accelerateToward(p, targetVx, targetVy, maxChange) {
  const ax = targetVx - p.vx, ay = targetVy - p.vy, d = Math.hypot(ax, ay);
  if (d <= maxChange) { p.vx = targetVx; p.vy = targetVy; }
  else { p.vx += ax / d * maxChange; p.vy += ay / d * maxChange; }
}

function turnToward(p, targetAngle, maxStep) {
  p.facing = wrapAngle(p.facing + clamp(wrapAngle(targetAngle - p.facing), -maxStep, maxStep));
}
