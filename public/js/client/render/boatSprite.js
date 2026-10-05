'use strict';
/* CLIENT - a small rowing boat: shadow, hull, bench, oars that swing with the speed, wake. */
const BOAT_HULL = [[0.62, 0], [0.4, 0.2], [0, 0.26], [-0.4, 0.24], [-0.56, 0.14], [-0.56, -0.14], [-0.4, -0.24], [0, -0.26], [0.4, -0.2]];
const OAR_STROKES_PER_TILE = 6;

class BoatSprite {
  constructor(g) { this.g = g; this.state = {}; }
  phaseOf(id) { return this.state[id] ? this.state[id].phase : 0; }

  draw(boat, id, sx, sy, now) {
    const g = this.g, ctx = g.ctx;
    const st = this.state[id] || (this.state[id] = { phase: 0, last: now });
    const speed = Math.hypot(boat.vx || 0, boat.vy || 0);
    st.phase += speed * Math.min(0.1, (now - st.last) / 1000) * OAR_STROKES_PER_TILE; st.last = now;
    sy += Math.sin(now / 450 + id.charCodeAt(1)) * 1.4;                          // bobbing on the water

    const fx = Math.cos(boat.facing), fy = Math.sin(boat.facing), px = -fy, py = fx;
    const at = (u, v, lift = 0) => {                                              // boat-local tiles (forward, right) -> screen
      const [dx, dy] = IsoProjection.worldDeltaToScreen(u * fx + v * px, u * fy + v * py);
      return [sx + dx, sy + dy - lift];
    };
    const flat = pts => pts.flatMap(([u, v]) => at(u, v));
    const drawn = (pts, lift, fill) => g.polygon(pts.flatMap(([u, v]) => at(u, v, lift)), fill);

    ellipse2(ctx, sx, sy + 2, 54, 26, 'rgba(8,40,70,.28)');                       // dark water under the hull
    this._wake(ctx, at, speed, st.phase);
    drawn(BOAT_HULL, -6, '#4a2f1b');                                              // hull side (drawn lower)
    drawn(BOAT_HULL, 0, '#9a6b3d');                                               // rim
    drawn(BOAT_HULL.map(([u, v]) => [u * 0.84, v * 0.78]), 1, '#6b4727');         // inside
    drawn([[0.06, -0.21], [-0.1, -0.21], [-0.1, 0.21], [0.06, 0.21]], 2, '#b98e55');   // rowing bench

    for (const side of [-1, 1]) this._oar(ctx, at, side, st.phase);
  }

  _oar(ctx, at, side, phase) {
    const stroke = Math.sin(phase), lock = at(0.0, side * 0.24, 3);
    const tip = at(0.0 + 0.45 * stroke, side * 0.95, 0);
    ctx.strokeStyle = '#d2a96b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lock[0], lock[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.lineCap = 'butt';
    ellipse2(ctx, tip[0], tip[1], 7, 3.5, '#8a5f32');                             // blade
  }

  _wake(ctx, at, speed, phase) {
    if (speed < 0.3) return;
    ctx.strokeStyle = 'rgba(235,248,255,.45)'; ctx.lineWidth = 2; ctx.beginPath();
    for (const v of [-0.22, 0.22]) { const a = at(-0.6, v), b = at(-1.15 - 0.15 * Math.sin(phase * 2), v * 2.2); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
  }
}

function ellipse2(ctx, x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
