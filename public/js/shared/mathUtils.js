'use strict';
/* SHARED - small, pure math helpers. */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** A Map that holds at most `max` entries and, when full, forgets one that has not been used lately (second chance: a get only sets a flag,
 *  so the hot path stays a plain lookup; eviction walks from the oldest, sparing -- and moving to the back -- any entry used since it was last
 *  passed over). Shared art caches use it instead of `clear()`-at-a-size-cap, which threw every picture away at once and made them all again. */
class LruCache {
  constructor(max) { this.max = max; this.map = new Map(); }
  get size() { return this.map.size; }
  has(key) { return this.map.has(key); }
  get(key) {
    const e = this.map.get(key);
    if (e === undefined) return undefined;
    e.used = true; return e.value;
  }
  set(key, value) {
    const e = this.map.get(key);
    if (e) { e.value = value; e.used = true; return this; }
    this.map.set(key, { value, used: false });
    while (this.map.size > this.max) {
      const [k, old] = this.map.entries().next().value;
      this.map.delete(k);
      if (old.used) { old.used = false; this.map.set(k, old); }               // used since we last looked: it gets another round
    }
    return this;
  }
  clear() { this.map.clear(); }
}

function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
const lerpAngle = (a, b, t) => wrapAngle(a + wrapAngle(b - a) * t);
const snapAngle8 = a => wrapAngle(Math.round(a / (Math.PI / 4)) * (Math.PI / 4));

/** Deterministic PRNG: same seed -> same sequence on client and server. */
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-tile noise in 0..1 (used for visual variation only). */
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
