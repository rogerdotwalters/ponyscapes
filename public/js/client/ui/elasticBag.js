'use strict';
/* CLIENT - the stretchy leather of the coin bag (coinBagUI.js). The sack's two side walls are rows of little springs - "rubberized vectors" - each with an
 * offset (how far that bit of wall is pushed OUT past the empty bag's shape, in art units):
 *   - the bag GROWS with what is in it: the walls' resting offset rises with the total weight of the coins (a curve that flattens out at restMax), so a fat purse
 *     sits in a fat bag. The neck barely stretches (it is tied shut), the belly most, and the bottom sags.
 *   - the coins PUSH the walls: every coin that presses into a wall adds force on the springs nearest it, so the leather bulges where a heap leans on it and
 *     wobbles back when it lets go.
 *   - TOLERANCES: no spring goes below minStretch (the empty bag's shape, a touch tighter) or past maxStretch (the leather will not give any more: a hard stop that
 *     loses the speed it hit it with). RESISTANCE: the nearer a spring is to its maxStretch the harder it pulls back (stiffness * (1 + resistance * strain^2)),
 *     and TENSION: neighbouring springs pull on each other, so a bulge spreads into a smooth curve instead of a spike.
 * Pure arithmetic (no DOM): tools/test-elasticbag.js runs it in Node.
 *   const bag = new ElasticBag(); bag.push(y, side, force) (per contact); bag.update(dt, weight); bag.edge(y, side) -> half width of the inside at height y. */
class ElasticBag {
  /** The knobs (art units; 1 unit = one pixel of the bag art). */
  static get CONFIG() {
    return {
      minStretch: -2,            // a wall never gets tighter than this (past the empty shape)
      maxStretch: 26,            // ... nor looser than this (the belly; the neck's limit is scaled down by its `give`)
      restMax: 20,               // the growth a full purse settles at (below maxStretch, so there is room left to bulge under load)
      sagMax: 12,                // how far the bottom sags down when full
      weightScale: 38,           // coin weight for ~63% of the growth (1 weight = a copper coin)
      stiffness: 70,             // spring constant of each wall spring
      resistance: 5,             // extra stiffness near the limit: stiffness * (1 + resistance * strain^2)
      tension: 60,               // pull between neighbouring springs (smooths the bulge)
      damping: 8,                // velocity damping
      bounce: 0.15,              // speed kept when a spring hits its limit
      pressGain: 500              // force added per unit of coin weight pushing a unit into the wall
    };
  }
  static get Y0() { return 22; }                                                                   // the first row that can stretch (the top of the belly)
  static get STEP() { return 6; }                                                                  // rows are this far apart
  static get ROWS() { return 25; }                                                                 // 22 ... 166
  static get BELLY() { return 135; }                                                               // where the walls turn into the rounded bottom

  constructor(config) {
    this.cfg = Object.assign(ElasticBag.CONFIG, config || {});
    const n = ElasticBag.ROWS;
    this.off = [new Float32Array(n), new Float32Array(n)];                                        // [left, right] offset of each spring
    this.vel = [new Float32Array(n), new Float32Array(n)];
    this.force = [new Float32Array(n), new Float32Array(n)];                                      // pressure from coins since the last update
    this.sag = 0; this.sagVel = 0; this.sagForce = 0;
    this.growth = 0;                                                                              // the resting offset the weight asks for (0 .. restMax)
    this.give = new Float32Array(n);                                                              // how much each row can stretch, 0..1 (the neck hardly does)
    for (let i = 0; i < n; i++) { const t = Math.min(1, Math.max(0, (ElasticBag.Y0 + i * ElasticBag.STEP - 40) / 60)); this.give[i] = 0.12 + 0.88 * t * t * (3 - 2 * t); }
  }

  /** Half the width of the empty sack at height y: a narrow neck, flaring into a round belly (the shape it stretches from). */
  static base(y) {
    if (y < 22) return 18;
    if (y < 40) return 18 + (y - 22) / 18 * 2;
    if (y < 100) { const t = (y - 40) / 60; return 20 + 36 * (t * t * (3 - 2 * t)); }
    if (y < 135) return 56 + 4 * (y - 100) / 35;
    return 60;
  }

  /** The resting growth a total coin weight asks for. */
  growthFor(weight) { return this.cfg.restMax * (1 - Math.exp(-Math.max(0, weight) / this.cfg.weightScale)); }

  _at(side, y) {                                                                                    // the offset of a side at height y (springs in between are blended)
    const f = Math.min(ElasticBag.ROWS - 1, Math.max(0, (y - ElasticBag.Y0) / ElasticBag.STEP)), i = Math.floor(f), j = Math.min(ElasticBag.ROWS - 1, i + 1), t = f - i;
    return this.off[side][i] * (1 - t) + this.off[side][j] * t;
  }
  /** How far the inside of the bag reaches from the centre line, on a side (0 left, 1 right), at height y. Below the belly it is the rounded bottom, which sags. */
  edge(y, side) {
    const B = ElasticBag.BELLY;
    if (y <= B) return ElasticBag.base(y) + (y < ElasticBag.Y0 ? 0 : this._at(side, y));
    const k = (y - B) / (30 + this.sag);
    return k >= 1 ? 0 : (60 + this._at(side, B)) * Math.sqrt(1 - k * k);
  }
  /** The lowest point inside the bag. */
  bottom() { return ElasticBag.BELLY + 30 + this.sag; }
  /** How stretched the leather is at height y on a side: 0 (empty shape) .. 1 (at its limit). */
  strain(y, side) { const i = Math.min(ElasticBag.ROWS - 1, Math.max(0, Math.round((y - ElasticBag.Y0) / ElasticBag.STEP))); return Math.max(0, Math.min(1, this.off[side][i] / this._max(i))); }
  _max(i) { return Math.max(1, this.cfg.maxStretch * this.give[i]); }

  /** A coin presses `amount` (art units of overlap x the coin's weight) into the wall at height y. */
  push(y, side, amount) {
    const f = Math.min(ElasticBag.ROWS - 1, Math.max(0, (y - ElasticBag.Y0) / ElasticBag.STEP)), i = Math.floor(f), j = Math.min(ElasticBag.ROWS - 1, i + 1), t = f - i;
    this.force[side][i] += amount * (1 - t); this.force[side][j] += amount * t;
  }
  /** A coin presses into the floor. */
  pushFloor(amount) { this.sagForce += amount; }

  /** Advance the springs. `weight` is the total weight of the coins in the bag (it sets the resting size), `contacts` how many collision passes the forces were summed over. */
  update(dt, weight, contacts = 1) {
    const c = this.cfg, n = ElasticBag.ROWS, g = this.growth = this.growthFor(weight), inv = 1 / Math.max(1, contacts);
    for (let s = 0; s < 2; s++) {
      const x = this.off[s], v = this.vel[s], F = this.force[s];
      for (let i = 0; i < n; i++) {
        const max = this._max(i), rest = Math.min(max, g * this.give[i]), strain = Math.max(0, x[i] / max);
        const k = c.stiffness * (1 + c.resistance * strain * strain), nb = ((x[i > 0 ? i - 1 : i]) + (x[i < n - 1 ? i + 1 : i]) - 2 * x[i]) * c.tension;
        const a = -k * (x[i] - rest) + nb - c.damping * v[i] + F[i] * inv * c.pressGain;
        v[i] += a * dt;
      }
      for (let i = 0; i < n; i++) {
        const max = this._max(i); x[i] += v[i] * dt;
        if (x[i] > max) { x[i] = max; v[i] = v[i] > 0 ? -v[i] * c.bounce : v[i]; } else if (x[i] < c.minStretch) { x[i] = c.minStretch; v[i] = v[i] < 0 ? -v[i] * c.bounce : v[i]; }
        F[i] = 0;
      }
    }
    const restSag = c.sagMax * (g / c.restMax), ks = c.stiffness * (1 + c.resistance * Math.pow(Math.max(0, this.sag / c.sagMax), 2));
    this.sagVel += (-ks * (this.sag - restSag) - c.damping * this.sagVel + this.sagForce * inv * c.pressGain) * dt; this.sag += this.sagVel * dt;
    if (this.sag > c.sagMax * 1.5) { this.sag = c.sagMax * 1.5; this.sagVel = this.sagVel > 0 ? -this.sagVel * c.bounce : this.sagVel; } else if (this.sag < 0) { this.sag = 0; this.sagVel = Math.max(0, this.sagVel); }
    this.sagForce = 0;
  }
}
