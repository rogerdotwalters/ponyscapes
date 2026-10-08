'use strict';
/* CLIENT (Pixi backend) - turns a CanvasRecorder result into a texture, once per picture.
 *
 * `stamp(rec, scale, kind)` looks the recording's hash up; on a miss it replays the recorded calls onto a texture page (at the camera's scale, so a
 * picture is as sharp as the canvas backend's live drawing) and remembers where. Pages are shelf-packed canvases wrapped as Pixi textures,
 * uploaded once per frame if anything was added (`flush`). Pictures that change all the time (people walking, things bobbing) go to small pages
 * of their own ('dynamic'), so the big, steady 'static' pages are not re-uploaded each time one of them changes. When a pool is full, its page
 * that has gone longest without being drawn is wiped and reused (its pictures are simply made again if they come back).
 * A change of scale (zoom, window resize) wipes everything. */
class StampCache {
  constructor() {
    this.pools = { static: { size: 2048, max: 4, pages: [] }, dynamic: { size: 1024, max: 8, pages: [] } };
    this.map = new Map(); this.scale = 0; this.frame = 0; this.stats = { made: 0, hits: 0, wipes: 0 };
  }

  beginFrame(scale) {
    this.frame++; this.stats.made = 0; this.stats.hits = 0;
    for (const pool of Object.values(this.pools)) {                                                 // (the one-frame overflow pages are dropped)
      if (!pool.pages.some(p => p.overflow)) continue;
      pool.pages = pool.pages.filter(p => { if (!p.overflow) return true; for (const k of p.keys) this.map.delete(k); p.source.destroy(); return false; });
    }
    if (scale !== this.scale) { this.clear(); this.scale = scale; }
  }

  clear() { for (const pool of Object.values(this.pools)) for (const p of pool.pages) this._wipe(p); this.map.clear(); }

  _wipe(p) { for (const k of p.keys) this.map.delete(k); p.keys.length = 0; p.x = p.y = p.rowH = 0; p.ctx.setTransform(1, 0, 0, 1, 0, 0); p.ctx.clearRect(0, 0, p.canvas.width, p.canvas.height); p.dirty = true; this.stats.wipes++; }

  _page(pool) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = pool.size;
    const page = { canvas, ctx: canvas.getContext('2d'), x: 0, y: 0, rowH: 0, keys: [], used: this.frame, dirty: false, source: new PIXI.CanvasSource({ resource: canvas, scaleMode: 'nearest', autoGenerateMipmaps: false }) };
    pool.pages.push(page); return page;
  }

  /** Room for a w x h picture (device pixels, 1px gutter): { page, x, y } or null if it can never fit. */
  _room(pool, w, h) {
    const need = (p, x, y) => (x + w + 1 <= pool.size && y + h + 1 <= pool.size);
    const fit = p => {
      if (p.x + w + 1 > pool.size) { p.x = 0; p.y += p.rowH; p.rowH = 0; }                      // next shelf
      if (!need(p, p.x, p.y)) return null;
      const spot = { page: p, x: p.x + 1, y: p.y + 1 }; p.x += w + 1; p.rowH = Math.max(p.rowH, h + 1); return spot;
    };
    if (w + 2 > pool.size || h + 2 > pool.size) return null;
    const last = pool.pages[pool.pages.length - 1]; let s = last && fit(last);
    if (s) return s;
    if (pool.pages.length < pool.max) return fit(this._page(pool));
    let oldest = pool.pages[0];                                                                    // a full pool: reuse the page that was drawn longest ago ...
    for (const p of pool.pages) if (p.used < oldest.used) oldest = p;
    if (oldest.used < this.frame) { this._wipe(oldest); pool.pages.splice(pool.pages.indexOf(oldest), 1); pool.pages.push(oldest); return fit(oldest); }
    const extra = this._page(pool); extra.overflow = true;                                          // ... unless every page was drawn this frame: a page for this frame only
    return fit(extra);
  }

  /** The picture for a finished recording `rec` of an item at world (ax, ay): { tex, ix, iy, w, h } or null if it drew nothing. (ix, iy) is the
   *  picture's top-left corner in device pixels relative to the anchor's device pixel, (w, h) its size in device pixels.
   *  `phased` (for things that stand still: buildings, props): the picture is painted with the anchor's own fractional device position, so it
   *  lands on the screen's pixels exactly as the canvas backend's drawing does (at a zoom that is not a whole number, a building's tile slices
   *  would otherwise show seams); one picture per phase (to 1/64 pixel). Else the anchor is snapped to a whole device pixel. */
  stamp(rec, ax, ay, kind = 'static', phased = false) {
    if (rec.empty) return null;
    const s = this.scale;
    let fx = 0, fy = 0;
    if (phased) { fx = Math.floor((ax * s - Math.floor(ax * s)) * 64) / 64; fy = Math.floor((ay * s - Math.floor(ay * s)) * 64) / 64; }
    const key = rec.h1 + ':' + rec.h2 + ':' + rec.ops.length + (phased ? ':' + fx + ',' + fy : '');
    let e = this.map.get(key);
    if (e) { e.page.used = this.frame; this.stats.hits++; return e; }
    const ix = Math.floor(fx + (rec.minX - rec.pad) * s), iy = Math.floor(fy + (rec.minY - rec.pad) * s);
    const w = Math.ceil(fx + (rec.maxX + rec.pad) * s) - ix, h = Math.ceil(fy + (rec.maxY + rec.pad) * s) - iy;
    if (w < 1 || h < 1) return null;
    let pool = this.pools[kind], spot = this._room(pool, w, h);
    if (!spot && kind === 'dynamic') { pool = this.pools.static; spot = this._room(pool, w, h); }      // (too big for the small pages)
    if (!spot) return null;                                                                        // (bigger than a page: skipped; nothing in the game is that large)
    const { page, x, y } = spot, ctx = page.ctx;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(x - ix + fx, y - iy + fy); ctx.scale(s, s); ctx.translate(-ax, -ay);            // (recorded coordinates are absolute: the anchor goes to its phase inside the picture)
    CanvasRecorder.replay(ctx, rec.ops);
    ctx.restore();
    page.dirty = true; page.used = this.frame; this.stats.made++;
    e = { tex: new PIXI.Texture({ source: page.source, frame: new PIXI.Rectangle(x, y, w, h) }), ix, iy, w, h, page };
    page.keys.push(key); this.map.set(key, e);
    return e;
  }

  flush() { for (const pool of Object.values(this.pools)) for (const p of pool.pages) if (p.dirty) { p.source.update(); p.dirty = false; } }
}
