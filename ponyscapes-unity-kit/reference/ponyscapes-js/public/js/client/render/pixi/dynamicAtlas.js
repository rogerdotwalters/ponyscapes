'use strict';
/* CLIENT (Pixi backend) - small pictures made by the canvas painters (a grass clump, a shadow, a name tag) are packed into shared texture pages
 * so thousands of sprites share a few textures and Pixi can draw them in a handful of batches. A picture is added once, under a string key, the
 * first time it is needed (`atlas.texture(key, make)`); pages are shelf-packed, padded by 1 transparent pixel against bleeding, nearest-filtered,
 * and re-uploaded (one `source.update()` per dirty page) by `flush()`, which the renderer calls once a frame. Nothing is evicted: callers only
 * put in pictures from bounded sets. */
class DynamicAtlas {
  constructor(size = 1024) { this.size = size; this.pages = []; this.frames = new Map(); this.bytes = 0; }

  _newPage() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = this.size;
    const page = { canvas, ctx: canvas.getContext('2d'), x: 0, y: 0, rowH: 0, dirty: false, source: new PIXI.CanvasSource({ resource: canvas, scaleMode: 'nearest', autoGenerateMipmaps: false }) };
    page.ctx.imageSmoothingEnabled = false;
    this.pages.push(page); this.bytes += this.size * this.size * 4; return page;
  }

  /** The texture for `key`; `make()` returns the canvas to pack the first time (it is not called again). Null if the picture is bigger than a page. */
  texture(key, make) {
    let t = this.frames.get(key);
    if (t !== undefined) return t;
    const c = make(), w = c.width, h = c.height, pad = 1;
    if (w + 2 * pad > this.size || h + 2 * pad > this.size) { this.frames.set(key, null); return null; }
    let page = this.pages[this.pages.length - 1] || this._newPage();
    if (page.x + w + 2 * pad > this.size) { page.x = 0; page.y += page.rowH; page.rowH = 0; }          // next shelf
    if (page.y + h + 2 * pad > this.size) { page = this._newPage(); }
    const x = page.x + pad, y = page.y + pad;
    page.ctx.drawImage(c, x, y); page.x += w + 2 * pad; page.rowH = Math.max(page.rowH, h + 2 * pad); page.dirty = true;
    t = new PIXI.Texture({ source: page.source, frame: new PIXI.Rectangle(x, y, w, h) });
    this.frames.set(key, t); return t;
  }

  /** Upload the pages that gained pictures since the last flush. */
  flush() { for (const p of this.pages) if (p.dirty) { p.source.update(); p.dirty = false; } }

  destroy() { for (const p of this.pages) p.source.destroy(); this.pages = []; this.frames.clear(); }
}

/** A pool of sprites drawn in call order: begin(), place() each one, end() hides the unused. */
class SpritePool {
  constructor(container) { this.container = container; this.list = []; this.used = 0; }
  begin() { this.used = 0; }
  place(texture, x, y, w, h) {
    let s = this.list[this.used];
    if (!s) { s = new PIXI.Sprite(); this.container.addChild(s); this.list[this.used] = s; }
    this.used++;
    s.texture = texture; s.position.set(x, y); s.scale.set(w / texture.width, h / texture.height); s.visible = true;
    if (s.filters) s.filters = null;
    return s;
  }
  end() { for (let i = this.used; i < this.list.length; i++) this.list[i].visible = false; }
}
