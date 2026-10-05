'use strict';
/* CLIENT - canvas drawing primitives shared by all sprite modules. */
class Gfx {
  constructor(ctx) { this.ctx = ctx; this.shadeCache = {}; }

  polygon(points, fill) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
    c.closePath(); c.fillStyle = fill; c.fill();
  }
  roundRect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  ellipse(x, y, rx, ry, fill) { const c = this.ctx; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }

  /** Darken (f < 1) or lighten (f > 1) a #rrggbb colour. */
  shade(hex, f) {
    const key = hex + f; if (this.shadeCache[key]) return this.shadeCache[key];
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 1) { r *= f; g *= f; b *= f; } else { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
    return (this.shadeCache[key] = `rgb(${r | 0},${g | 0},${b | 0})`);
  }
}
