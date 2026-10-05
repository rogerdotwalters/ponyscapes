'use strict';
/* SHARED - rowing boats: definition, movement on water, boarding / leaving rules.
 * A boat is a circle that may only sit on WATER tiles. While a player rows, the player is glued to the boat. */
const BoatDef = Object.freeze({
  radius: 0.45,
  cruiseSpeed: 1.7, fastSpeed: 2.6, slowSpeed: 0.8,   // tiles / second
  accel: 4, drag: 3,                                  // tiles / second^2 (momentum: boats glide a little)
  turnRate: 3.2,                                      // rad / second
  boardRange: 1.8,                                    // tiles from the player to the boat
  dismountRange: 2.2                                  // how far from the boat we look for a shore tile
});
const NO_INPUT = Object.freeze({ moveX: 0, moveY: 0, run: false, sneak: false });

function createBoat(id, spawn) {
  return { id, x: spawn.x, y: spawn.y, vx: 0, vy: 0, facing: spawn.facing || 0, occupant: '' };
}
const cloneBoat = b => Object.assign({}, b);

const boatTileBlocked = (map, tx, ty) => !isWaterTile(map.tile(tx, ty));      // boats float in deep water and in the shallows

function resolveBoatCollisions(map, boat, r) {
  const push = { x: 0, y: 0 };
  for (let iter = 0; iter < 4; iter++) {
    let hit = false;
    const x0 = Math.floor(boat.x - r), x1 = Math.floor(boat.x + r), y0 = Math.floor(boat.y - r), y1 = Math.floor(boat.y + r);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (boatTileBlocked(map, tx, ty) && pushOutOfBox(boat, r, tx, ty, tx + 1, ty + 1, push)) hit = true;
    }
    if (!hit) break;
  }
  const len = Math.hypot(push.x, push.y);
  if (len > 1e-6) {
    const nx = push.x / len, ny = push.y / len, into = boat.vx * nx + boat.vy * ny;
    if (into < 0) { boat.vx -= into * nx; boat.vy -= into * ny; }
  }
}

/** Advances a boat by dt. Input is the rower's input (world axes); NO_INPUT lets it drift to a stop. */
function stepBoat(boat, input, dt, map) {
  const B = BoatDef;
  let mx = input.moveX, my = input.moveY, mag = Math.hypot(mx, my);
  if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
  const moving = mag > 0.01;
  const top = input.run ? B.fastSpeed : input.sneak ? B.slowSpeed : B.cruiseSpeed;
  accelerateToward(boat, mx * top, my * top, (moving ? B.accel : B.drag) * dt);
  boat.x += boat.vx * dt; boat.y += boat.vy * dt;
  resolveBoatCollisions(map, boat, B.radius);
  if (mag > 0.1) turnToward(boat, Math.atan2(my, mx), B.turnRate * dt);
}

/** Moves a player who is rowing: the boat follows the input, the player sits at its centre. */
function stepRider(p, boat, input, dt, map) {
  stepBoat(boat, input, dt, map);
  p.x = boat.x; p.y = boat.y; p.vx = boat.vx; p.vy = boat.vy; p.facing = boat.facing;
  p.state = Math.hypot(boat.vx, boat.vy) < 0.1 ? 'idle' : 'row';
  p.ack = input.seq;
}

const BoatSystem = {
  /** Nearest unoccupied boat within boarding range, or null. */
  findBoardable(boats, p) {
    let best = null, bestDist = BoatDef.boardRange;
    for (const id in boats) {
      const boat = boats[id], d = Math.hypot(boat.x - p.x, boat.y - p.y);
      if (!boat.occupant && d < bestDist) { bestDist = d; best = boat; }
    }
    return best;
  },

  /** Nearest walkable shore tile centre near the boat, or null. */
  findLanding(map, boat) {
    const range = BoatDef.dismountRange;
    let best = null, bestDist = Infinity;
    for (let ty = Math.floor(boat.y - range); ty <= Math.floor(boat.y + range); ty++)
      for (let tx = Math.floor(boat.x - range); tx <= Math.floor(boat.x + range); tx++) {
        if (navBlocked(map, tx, ty)) continue;
        const cx = tx + 0.5, cy = ty + 0.5, d = Math.hypot(cx - boat.x, cy - boat.y);
        if (d > range || d >= bestDist || circleBlocked(map, cx, cy, CONFIG.sim.playerRadius)) continue;
        bestDist = d; best = { x: cx, y: cy };
      }
    return best;
  },

  board(id, p, boat) {
    boat.occupant = id; p.boat = boat.id;
    p.x = boat.x; p.y = boat.y; p.vx = boat.vx; p.vy = boat.vy; p.facing = boat.facing; p.state = 'idle';
    p.swingT = 0; p.swingHit = false;
  },

  leave(p, boat, spot) {
    boat.occupant = ''; p.boat = '';
    p.x = spot.x; p.y = spot.y; p.vx = 0; p.vy = 0; p.state = 'idle';
  }
};
