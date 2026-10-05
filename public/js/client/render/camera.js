'use strict';
/* CLIENT - smooth follow camera + screen<->world conversion. All drawing happens in iso space. */
class Camera {
  constructor() { this.cssW = 0; this.cssH = 0; this.dpr = 1; this.zoom = 1; this.scale = 1; this.w = 0; this.h = 0; this.x = 0; this.y = 0; this.initialised = false; }

  resize(cssW, cssH, devicePixelRatio) {
    const V = CONFIG.view;
    this.cssW = cssW; this.cssH = cssH;
    this.dpr = Math.min(devicePixelRatio || 1, V.maxDpr);
    this.zoom = clamp(Math.min(cssW / V.zoomRef.w, cssH / V.zoomRef.h), V.zoomMin, V.zoomMax);
    this.scale = this.dpr * this.zoom;
    const pixelW = Math.round(cssW * this.dpr), pixelH = Math.round(cssH * this.dpr);
    this.w = pixelW / this.scale; this.h = pixelH / this.scale;      // logical (zoomed) view size
    return { pixelW, pixelH };
  }

  follow(targetX, targetY, frameMs) {
    if (!this.initialised) { this.x = targetX; this.y = targetY; this.initialised = true; return; }
    const k = 1 - Math.exp(-frameMs / 1000 * CONFIG.view.camSmooth);
    this.x += (targetX - this.x) * k; this.y += (targetY - this.y) * k;
  }

  applyTransform(ctx) {
    const s = this.scale;
    ctx.setTransform(s, 0, 0, s, Math.round((this.w / 2 - this.x) * s), Math.round((this.h / 2 - this.y) * s));
  }

  /** Visible iso-space rectangle (with a margin) for culling. */
  bounds(margin = 40) {
    return { minX: this.x - this.w / 2 - margin, maxX: this.x + this.w / 2 + margin, minY: this.y - this.h / 2 - 20, maxY: this.y + this.h / 2 + 20 };
  }

  /** Rectangle of world tiles that may be visible (a bounding box of the diamond-shaped view). Extra room below
   *  for tall objects whose base is off screen. */
  visibleTiles(margin = 2) {
    const b = this.bounds(), tallObjects = 230, xs = [], ys = [];
    for (const [sx, sy] of [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY + tallObjects], [b.maxX, b.maxY + tallObjects]]) {
      const w = IsoProjection.toWorld(sx, sy); xs.push(w.x); ys.push(w.y);
    }
    return { tx0: Math.floor(Math.min(...xs)) - margin, tx1: Math.ceil(Math.max(...xs)) + margin, ty0: Math.floor(Math.min(...ys)) - margin, ty1: Math.ceil(Math.max(...ys)) + margin };
  }

  /** CSS pixel position -> world tile position. */
  screenToWorld(cssX, cssY) {
    return IsoProjection.toWorld(cssX / this.zoom - this.w / 2 + this.x, cssY / this.zoom - this.h / 2 + this.y);
  }
}
