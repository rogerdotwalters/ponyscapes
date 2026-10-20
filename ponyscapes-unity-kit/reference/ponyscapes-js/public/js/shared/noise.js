'use strict';
/* SHARED - seeded 2D gradient (Perlin) noise + fractal layering.
 * Speed notes: the permutation table is built once, there are no allocations per sample, and the gradient is an
 * 8-direction table lookup instead of a trig/vector computation. */
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function gradient(hash, x, y) {
  switch (hash & 7) {
    case 0: return x + y;  case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
    case 4: return x;      case 5: return -x;     case 6: return y;     default: return -y;
  }
}

class PerlinNoise {
  constructor(seed) {
    const rng = mulberry32(seed), p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Smooth noise, roughly in [-1, 1]. */
  sample(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const u = fade(xf), v = fade(yf), p = this.perm;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const top = gradient(aa, xf, yf) + u * (gradient(ba, xf - 1, yf) - gradient(aa, xf, yf));
    const bottom = gradient(ab, xf, yf - 1) + u * (gradient(bb, xf - 1, yf - 1) - gradient(ab, xf, yf - 1));
    return top + v * (bottom - top);
  }

  /** Several octaves layered together: each one twice as detailed and half as strong. Normalised to ~[-1, 1]. */
  fractal(x, y, octaves, gain = 0.5) {
    let sum = 0, amplitude = 1, frequency = 1, total = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amplitude * this.sample(x * frequency, y * frequency);
      total += amplitude; amplitude *= gain; frequency *= 2;
    }
    return sum / total;
  }
}

/** Deterministic per-tile random number in [0, 1); different `salt`s give independent streams. */
function hash3(seed, x, y, salt) {
  let h = (Math.imul(x ^ seed, 374761393) + Math.imul(y ^ (salt | 0), 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
