'use strict';
/* SHARED - small, pure math helpers. */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** A Map that holds at most `max` entries and forgets the LEAST recently used one when full (get / set both count as use). Shared art caches
 *  use it instead of `clear()`-at-a-size-cap, which threw every picture away at once and made them all again (a hitch, then a pile of rework). */
class LruCache {
  constructor(max) { this.max = max; this.map = new Map(); }
  get size() { return this.map.size; }
  has(key) { return this.map.has(key); }
  get(key) {
    const v = this.map.get(key);
    if (v !== undefined) { this.map.delete(key); this.map.set(key, v); }
    return v;
  }
  set(key, value) {
    this.map.delete(key); this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
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
