'use strict';
/* SHARED - A* (8-way, no corner cutting) + line-of-sight smoothing + path following. */
function lineClear(map, ax, ay, bx, by, r) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (0.2 / TILE_SCALE)));
  for (let k = 0; k <= steps; k++) if (circleBlocked(map, lerp(ax, bx, k / steps), lerp(ay, by, k / steps), r)) return false;
  return true;
}

function nearestFreeTile(map, tx, ty, maxRing) {
  for (let ring = 0; ring <= maxRing; ring++)
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      if (!navBlocked(map, tx + dx, ty + dy)) return { x: tx + dx + 0.5, y: ty + dy + 0.5 };
    }
  return null;
}

class MinHeap {
  constructor() { this.items = []; }
  get length() { return this.items.length; }
  push(priority, value) {
    const a = this.items; a.push([priority, value]);
    let c = a.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (a[p][0] <= a[c][0]) break; [a[p], a[c]] = [a[c], a[p]]; c = p; }
  }
  pop() {
    const a = this.items, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
}

/** One orthogonal step is blocked by a blocked tile OR a wall on the edge between the two tiles. */
const stepBlocked = (map, x, y, dx, dy) => navBlocked(map, x + dx, y + dy) || edgeBlocked(map, x, y, dx, dy);
/** A diagonal step needs both L-shaped routes to be open (no corner cutting through walls). */
function diagonalOpen(map, x, y, dx, dy) {
  return !stepBlocked(map, x, y, dx, 0) && !stepBlocked(map, x + dx, y, 0, dy)
      && !stepBlocked(map, x, y, 0, dy) && !stepBlocked(map, x, y + dy, dx, 0);
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIAGONAL_COST = 1.41421356;

const MAX_SEARCH_NODES = 5000, MAX_SEARCH_DISTANCE = 90;     // keep A* bounded in an infinite world

/** Returns waypoints [{x,y}] from (sx,sy) to (gx,gy), or null when unreachable / too far. */
function findPath(map, sx, sy, gx, gy) {
  const stx = Math.floor(sx), sty = Math.floor(sy), gtx = Math.floor(gx), gty = Math.floor(gy);
  if (Math.abs(gx - sx) + Math.abs(gy - sy) > MAX_SEARCH_DISTANCE || navBlocked(map, gtx, gty)) return null;
  if (stx === gtx && sty === gty) return [{ x: gx, y: gy }];

  const cost = new Map(), cameFrom = new Map(), closed = new Set(), open = new MinHeap();
  const heuristic = (x, y) => { const dx = Math.abs(x - gtx), dy = Math.abs(y - gty); return dx + dy + (DIAGONAL_COST - 2) * Math.min(dx, dy); };
  const start = tileKey(stx, sty), goal = tileKey(gtx, gty);
  cost.set(start, 0); open.push(heuristic(stx, sty), start);

  while (open.length && closed.size < MAX_SEARCH_NODES) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (cur === goal) break;
    const cx = keyTileX(cur), cy = keyTileY(cur);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx, ny = cy + dy, diagonal = dx !== 0 && dy !== 0;
      if (diagonal ? !diagonalOpen(map, cx, cy, dx, dy) : stepBlocked(map, cx, cy, dx, dy)) continue;
      const nk = tileKey(nx, ny), newCost = cost.get(cur) + (diagonal ? DIAGONAL_COST : 1);
      if (newCost < (cost.has(nk) ? cost.get(nk) : Infinity)) { cost.set(nk, newCost); cameFrom.set(nk, cur); open.push(newCost + heuristic(nx, ny), nk); }
    }
  }
  if (!cameFrom.has(goal)) return null;

  const nodes = [];
  for (let k = goal; k !== start; k = cameFrom.get(k)) nodes.push({ x: keyTileX(k) + 0.5, y: keyTileY(k) + 0.5 });
  nodes.reverse();
  nodes[nodes.length - 1] = { x: gx, y: gy };
  nodes.unshift({ x: sx, y: sy });
  return smoothPath(map, nodes);
}

/** String-pulling: skip waypoints reachable in a straight, collider-clear line. */
function smoothPath(map, nodes) {
  const r = CONFIG.sim.playerRadius - 0.02, out = [];
  let i = 0;
  while (i < nodes.length - 1) {
    let j = nodes.length - 1;
    while (j > i + 1 && !lineClear(map, nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y, r)) j--;
    out.push(nodes[j]); i = j;
  }
  return out;
}

/* ---- path following (click-to-move) ---- */
const makeNav = pts => ({ pts, i: 0, best: Infinity, stuck: 0 });
const WAYPOINT_REACHED = 0.3 / TILE_SCALE, DESTINATION_REACHED = 0.12 / TILE_SCALE, STUCK_SECONDS = 1.2;

function steerAlongPath(nav, px, py, dt) {
  while (nav.i < nav.pts.length) {
    const w = nav.pts[nav.i], dx = w.x - px, dy = w.y - py, d = Math.hypot(dx, dy), last = nav.i === nav.pts.length - 1;
    if (d < (last ? DESTINATION_REACHED : WAYPOINT_REACHED)) { nav.i++; nav.best = Infinity; nav.stuck = 0; continue; }
    if (d < nav.best - 0.04 / TILE_SCALE) { nav.best = d; nav.stuck = 0; } else nav.stuck += dt;
    if (nav.stuck > STUCK_SECONDS) return { moveX: 0, moveY: 0, done: true };
    const ease = last ? clamp(d / (0.8 / TILE_SCALE), 0.25, 1) : 1;           // slow down into the destination
    return { moveX: dx / d * ease, moveY: dy / d * ease, done: false };
  }
  return { moveX: 0, moveY: 0, done: true };
}
