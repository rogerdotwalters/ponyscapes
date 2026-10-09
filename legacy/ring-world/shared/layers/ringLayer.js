'use strict';
/* LAYER - the rings. Large, IMPERFECT rings around the village: distance from the centre is nudged by slow noise, so each boundary wanders by
 * a few dozen tiles instead of being a perfect circle. The layer answers "which ring is this tile in, and how deep into it?", and owns the
 * lock state: a ring stays walled off (a magical barrier along its inner edge) until the boss of the ring before it is defeated. */
class RingLayer {
  constructor(seed) {
    this.id = 'rings'; this.noise = new PerlinNoise(seed + 4001);
    this.unlocked = new Set([0]);                                           // the centre is always open
    this.width = CONFIG.world.ringWidth; this.wobble = CONFIG.world.ringWobble; this.count = Rings.size;
  }
  /** Distance from the centre, nudged by the noise: the "imperfect" part. */
  effectiveRadius(x, y) {
    const o = CONFIG.sim.levels.origin;
    return Math.hypot(x - o.x, y - o.y) + this.wobble * this.noise.fractal(x / 260, y / 260, 2);
  }
  /** { index, depth } : ring 0..4 and how far through it (0 at its inner edge, 1 at its outer edge). */
  at(x, y) {
    const r = Math.max(0, this.effectiveRadius(x, y)), index = Math.min(this.count - 1, Math.floor(r / this.width));
    return { index, depth: index === this.count - 1 ? Math.min(1, (r - index * this.width) / this.width) : (r - index * this.width) / this.width };
  }
  def(index) { return Rings.all().find(r => r.index === index); }

  /* ---- locks ---- */
  isUnlocked(index) { return this.unlocked.has(index); }
  unlock(index) { this.unlocked.add(index); }
  setUnlocked(list) { this.unlocked = new Set([0, ...list]); }
  unlockedList() { return [...this.unlocked].sort((a, b) => a - b); }
  /** The ring that is walled off at this tile, if any: a thin band along the inner edge of every locked ring. Cheap for the (vast) majority of tiles. */
  barrierAt(tx, ty) {
    const o = CONFIG.sim.levels.origin, dist = Math.hypot(tx + 0.5 - o.x, ty + 0.5 - o.y);
    const near = Math.round(dist / this.width);
    if (near < 1 || near >= this.count || this.unlocked.has(near) || Math.abs(dist - near * this.width) > this.wobble * 1.6) return false;
    return Math.abs(this.effectiveRadius(tx + 0.5, ty + 0.5) - near * this.width) < 1.25;
  }
  /** Which locked ring's barrier is within `range` tiles of (x, y)? (for the "the way is sealed" hint) */
  barrierNear(x, y, range) {
    const o = CONFIG.sim.levels.origin, dist = Math.hypot(x - o.x, y - o.y), near = Math.round(dist / this.width);
    if (near < 1 || near >= this.count || this.unlocked.has(near) || Math.abs(dist - near * this.width) > this.wobble * 1.6 + range) return -1;
    return Math.abs(this.effectiveRadius(x, y) - near * this.width) < range ? near : -1;
  }
}
