'use strict';
/* CLIENT - small things that every creature and player draws every frame (a soft shadow, a name tag, the arrow showing which way someone faces) are
 * painted once into a little canvas and STAMPED with one drawImage afterwards, instead of being rebuilt from paths and text each frame.
 *
 * A stamp is baked at the camera's current scale (the renderer sets `SpriteCache.scale` each frame), so it is as crisp as the live drawing was,
 * and it is placed on a whole device pixel (the camera's translation is already whole), so it never blurs. A zoom change just bakes new ones.
 * Mirroring uses the same idea: a pixel-flipped copy of a picture is made once, so a left-facing creature is one drawImage, not a
 * save / translate / scale / drawImage / restore. */
const SpriteCache = {
  scale: 1,                                              // the world -> device scale (camera scale), set by the renderer each frame
  stamps: new LruCache(800),
  flipped: new LruCache(1500),
  widths: new LruCache(800),
  _ruler: null,

  /** Draw what `paint(g)` draws (with `g` a Gfx whose origin is (ox, oy) inside a w x h box) so that the origin lands on (x, y). Baked once per key. */
  stamp(ctx, key, w, h, ox, oy, paint, x, y) {
    const s = this.scale, k = key + '@' + s;
    let c = this.stamps.get(k);
    if (!c) {
      c = document.createElement('canvas'); c.width = Math.ceil(w * s); c.height = Math.ceil(h * s);
      const g = c.getContext('2d'); g.scale(s, s); g.translate(ox, oy);
      paint(new Gfx(g));
      this.stamps.set(k, c);
    }
    ctx.drawImage(c, Math.round((x - ox) * s) / s, Math.round((y - oy) * s) / s, c.width / s, c.height / s);
  },

  /** A soft elliptical ground shadow centred on (x, y). */
  shadow(ctx, x, y, rx, ry, alpha) {
    const qx = Math.round(rx * 2) / 2, qy = Math.round(ry * 2) / 2, qa = Math.round(alpha * 50) / 50;
    this.stamp(ctx, 's' + qx + '|' + qy + '|' + qa, qx * 2 + 2, qy * 2 + 2, qx + 1, qy + 1, g => g.ellipse(0, 0, qx, qy, `rgba(0,0,0,${qa})`), x, y);
  },

  /** The width of a line of text in a font (measured once per line). */
  textWidth(font, text) {
    const k = font + '|' + text;
    let w = this.widths.get(k);
    if (w === undefined) {
      const ctx = (this._ruler || (this._ruler = document.createElement('canvas').getContext('2d')));
      ctx.font = font; w = ctx.measureText(text).width; this.widths.set(k, w);
    }
    return w;
  },

  /** `canvas` mirrored left-right (made once per key). */
  mirror(key, canvas) {
    let m = this.flipped.get(key);
    if (!m || m.width !== canvas.width || m.height !== canvas.height) {
      m = document.createElement('canvas'); m.width = canvas.width; m.height = canvas.height;
      const g = m.getContext('2d'); g.translate(m.width, 0); g.scale(-1, 1); g.drawImage(canvas, 0, 0);
      this.flipped.set(key, m);
    }
    return m;
  },
};
