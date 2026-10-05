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
    id: 'p' + (slot + 1), hp: CONFIG.sim.health.max, hurtT: 0,               // health; damaged by spiders, protected by armour
    gear: createGear(), drawn: false,                                        // worn equipment; is the sheathed sword out?
    looted: false, emote: '', emoteT: 0, torchT: 0,
    lv: defaultLevels(), maxHp: CONFIG.sim.health.max,                       // skill / attribute LEVELS (public); the XP behind them stays on the server
    mount: '', mountLevel: 1                                                 // id of the pony we are riding (or ''), and its level (higher-level ponies run faster)
  };
}
const clonePlayer = p => Object.assign({}, p, { gear: Object.assign({}, p.gear) });

/** Never trust the wire: clamp everything. Input = { moveX, moveY, run, sneak, action, interact, slot, seq } (world axes).
 *  `interact` is true for exactly one tick per key press (board / leave a boat). */
/** A selectable bar slot: the main hotbar (0..5) or the tool-belt bar (beltStart..). */
function sanitizeSlot(value) {
  const n = value | 0, inv = CONFIG.sim.inventory;
  return n >= inv.beltStart && n < inv.beltStart + inv.beltSlots ? n : clamp(n, 0, inv.hotbarSlots - 1);
}

function sanitizeInput(i) {
  const num = v => (Number.isFinite(v) ? v : 0);
  return {
    moveX: clamp(num(i.moveX), -1, 1), moveY: clamp(num(i.moveY), -1, 1),
    run: !!i.run, sneak: !!i.sneak, action: !!i.action, interact: !!i.interact,
    drawn: !!i.drawn, slot: sanitizeSlot(i.slot), seq: i.seq | 0
  };
}

/** Advances ONE player by dt seconds: acceleration, collision, facing. Pure; mutates only `p`. */
function stepPlayer(p, input, dt, map) {
  const C = CONFIG.sim;
  let mx = input.moveX, my = input.moveY, mag = Math.hypot(mx, my);
  if (mag > 1) { mx /= mag; my /= mag; mag = 1; }               // diagonals are not faster
  const moving = mag > 0.01;
  const modeOf = mode => C.vitalModes[mode] || C.vitalModes.normal;          // unknown / missing mode = normal
  const starving = p.hunger <= 0 && modeOf(p.hungerMode).penalty;           // 'superficial' / 'off' modes never hurt
  const parched = p.thirst <= 0 && modeOf(p.thirstMode).penalty;
  const weak = starving || parched;                            // no sprinting, slower walk
  const slowdown = (starving ? C.hunger.starvingSpeedFactor : 1) * (parched ? C.thirst.slowFactor : 1);
  const wading = map.tile(Math.floor(p.x), Math.floor(p.y)) === TILE.SHALLOW ? C.wadeSpeedFactor : 1;
  const riding = !!p.mount, R = C.ride;                                    // on a pony: faster, a little wider, scaled by Horsemanship
  const mountPace = riding ? Skills.rideFactor(p.lv) * AnimalLevels.rideSpeedFactor(p.mountLevel) : 1;
  const walk = riding ? R.walkSpeed * mountPace : C.walkSpeed * Skills.speedFactor(p.lv);
  const topSpeed = (weak ? walk * slowdown : input.run ? (riding ? R.runSpeed * mountPace : C.runSpeed * Skills.speedFactor(p.lv)) : input.sneak && !riding ? C.sneakSpeed : walk) * wading;

  accelerateToward(p, mx * topSpeed, my * topSpeed, movementRate(p, mx * topSpeed, my * topSpeed, moving) * dt);
  p.x += p.vx * dt; p.y += p.vy * dt;
  resolveCollisions(map, p, riding ? R.radius : C.playerRadius);

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
