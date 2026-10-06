'use strict';
/* SHARED - circle-vs-world collision with wall sliding.
 * Obstacles are axis-aligned boxes: whole solid tiles, thin wall slabs (map.slabs), and prop circles.
 * `map` is a World (chunked, unbounded), so there are no edges to fall off.
 * Dead (felled) trees do not collide. */
const isSolid = (map, tx, ty) => map.isSolid(tx, ty);
const navBlocked = (map, tx, ty) => map.navBlocked(tx, ty);
const slabsAt = (map, tx, ty) => map.slabs[tileKey(tx, ty)];     // [[x0, y0, x1, y1], ...] | undefined

/** If the circle (p, r) overlaps the box, pushes p out, adds the push to `push`, returns true. */
function pushOutOfBox(p, r, x0, y0, x1, y1, push) {
  const dx = p.x - clamp(p.x, x0, x1), dy = p.y - clamp(p.y, y0, y1), d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  let nx, ny, pen;
  if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = r - d; }
  else {   // centre is inside the box: leave through the nearest face
    const l = p.x - x0, rt = x1 - p.x, t = p.y - y0, b = y1 - p.y, m = Math.min(l, rt, t, b);
    if (m === l) { nx = -1; ny = 0; pen = l + r; } else if (m === rt) { nx = 1; ny = 0; pen = rt + r; }
    else if (m === t) { nx = 0; ny = -1; pen = t + r; } else { nx = 0; ny = 1; pen = b + r; }
  }
  p.x += nx * pen; p.y += ny * pen; push.x += nx * pen; push.y += ny * pen;
  return true;
}

function circleOverlapsBox(x, y, r, x0, y0, x1, y1) {
  const dx = x - clamp(x, x0, x1), dy = y - clamp(y, y0, y1);
  return dx * dx + dy * dy < r * r;
}

/** Pushes player `p` (x, y, vx, vy) out of anything it overlaps and removes velocity into the surface. */
function resolveCollisions(map, p, r) {
  const push = { x: 0, y: 0 };
  for (let iter = 0; iter < 4; iter++) {
    let hit = false;
    const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r), y0 = Math.floor(p.y - r), y1 = Math.floor(p.y + r);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (isSolid(map, tx, ty) && pushOutOfBox(p, r, tx, ty, tx + 1, ty + 1, push)) hit = true;
      const slabs = slabsAt(map, tx, ty);
      if (slabs) for (const b of slabs) if (pushOutOfBox(p, r, b[0], b[1], b[2], b[3], push)) hit = true;
      const pr = map.propAt(tx, ty);
      if (pr && propBlocks(pr)) {
        const dx = p.x - pr.x, dy = p.y - pr.y, d = Math.hypot(dx, dy), min = r + pr.r;
        if (d < min) {
          const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0, pen = min - d;
          p.x += nx * pen; p.y += ny * pen; push.x += nx * pen; push.y += ny * pen; hit = true;
        }
      }
    }
    if (!hit) break;
  }
  const pushLen = Math.hypot(push.x, push.y);
  if (pushLen > 1e-6) {
    const nx = push.x / pushLen, ny = push.y / pushLen, into = p.vx * nx + p.vy * ny;
    if (into < 0) { p.vx -= into * nx; p.vy -= into * ny; }
  }
}

/** Read-only overlap test (used by path smoothing and tap targets). */
/** In the air nothing on the ground stops you (trees, water, fences, houses): only a ring's barrier and a cave wall are solid. */
const isFlightBlocked = (map, tx, ty) => !!map.grid || map.tile(tx, ty) === TILE.CAVE_WALL || !!map.layers.rings.barrierAt(tx, ty);
function resolveFlightCollisions(map, p, r) {
  const push = { x: 0, y: 0 };
  for (let iter = 0; iter < 4; iter++) {
    let hit = false;
    const x0 = Math.floor(p.x - r), x1 = Math.floor(p.x + r), y0 = Math.floor(p.y - r), y1 = Math.floor(p.y + r);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isFlightBlocked(map, tx, ty) && pushOutOfBox(p, r, tx, ty, tx + 1, ty + 1, push)) hit = true;
    if (!hit) break;
  }
  const len = Math.hypot(push.x, push.y);
  if (len > 1e-6) { const nx = push.x / len, ny = push.y / len, into = p.vx * nx + p.vy * ny; if (into < 0) { p.vx -= into * nx; p.vy -= into * ny; } }
}
/** The nearest spot (spiralling out from x, y) where a pony of radius r can stand: where a flight ends if it ends over water or trees. */
function findLanding(map, x, y, r) {
  if (!circleBlocked(map, x, y, r)) return { x, y };
  for (let d = 0.5; d <= 14; d += 0.5) for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d;
    if (!circleBlocked(map, sx, sy, r) && !map.layers.rings.barrierAt(Math.floor(sx), Math.floor(sy))) return { x: sx, y: sy };
  }
  return { x, y };
}

function circleBlocked(map, x, y, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (isSolid(map, tx, ty) && circleOverlapsBox(x, y, r, tx, ty, tx + 1, ty + 1)) return true;
    const slabs = slabsAt(map, tx, ty);
    if (slabs) for (const b of slabs) if (circleOverlapsBox(x, y, r, b[0], b[1], b[2], b[3])) return true;
    const pr = map.propAt(tx, ty);
    if (pr && propBlocks(pr) && Math.hypot(x - pr.x, y - pr.y) < r + pr.r) return true;
  }
  return false;
}
