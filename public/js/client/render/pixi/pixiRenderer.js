'use strict';
/* CLIENT - the Pixi (WebGL) render backend, selected with ?renderer=pixi (see backend.js and tools/README-pixi.md).
 *
 * It is the canvas Renderer with a different way of putting the frame on screen. Renderer still decides what is visible and in which order; this
 * class turns it into a Pixi scene, bottom to top:
 *
 *   terrain blocks (sprites)  ->  ground layer (a screen-sized 2D canvas: the live parts of the ground)  ->  grass + depth-sorted items (sprites)
 *   ->  overlay layer (a 2D canvas: building names, night, particles ...)
 *
 * Each depth-sorted item is still DRAWN by its existing canvas code, but into a CanvasRecorder; the recording becomes a cached texture
 * (StampCache) and the item a sprite, in sorted order, so Pixi (not a 2D canvas) composes the scene and a picture that has not changed is not
 * painted again. Later stages replace more of the recorded items with purpose-made sprites and move the layers' contents into Pixi too.
 *
 * Coordinates match the canvas path exactly: the Pixi canvas is camera.pixelW x pixelH device pixels, the world containers are scaled by
 * camera.scale and offset by the same rounded translation as Camera.applyTransform, and all textures are nearest-neighbour. */
class PixiRenderer extends Renderer {
  static _colours = new Map();

  /** Note when anything is painted on a 2D context: { dirty }. The painting methods are wrapped on the instance (a cheap flag, no Proxy). */
  static _watch(ctx) {
    const flag = { dirty: false };
    for (const name of ['fill', 'stroke', 'fillRect', 'strokeRect', 'drawImage', 'fillText', 'strokeText', 'putImageData']) {
      const inner = ctx[name]; ctx[name] = function (...args) { flag.dirty = true; return inner.apply(this, args); };
    }
    return flag;
  }

  constructor(opts) {
    const ground = document.createElement('canvas');                                // 2D layer 1: what is not a sprite yet, under the items
    super({ ...opts, canvas: ground, ctxOptions: { alpha: true } });
    this.view = opts.canvas;                                                         // the page's #game: Pixi draws into it
    this.groundCanvas = ground; this.groundCtx = this.ctx;
    this.overlayCanvas = document.createElement('canvas'); this.overlayCtx = this.overlayCanvas.getContext('2d');   // 2D layer 2: over the items
    this.pixel = { w: 0, h: 0 };
    this.groundDirty = PixiRenderer._watch(this.groundCtx); this.overlayDirty = PixiRenderer._watch(this.overlayCtx);   // (a layer nothing was painted on this frame is not uploaded or drawn)
    this.blocks = new Map();                                                         // terrain block key -> { sprite, entry, canvas, seen }
    this.seeThroughOn = new URLSearchParams(location.search).get('seethrough') !== '0';                 // ?seethrough=0 turns the effect off (for pixel comparisons with the canvas backend)
    this.frameNo = 0; this._ready = false; this.recorder = new CanvasRecorder.Recorder(); this.broken = new Set();
    this.blockSink = (entry, key, w, h) => this._block(entry, key, w, h);
    this.grassSink = (art, x, y, w, h) => this._grass(art, x, y, w, h);
    this.app = new PIXI.Application();
    this.worldA = new PIXI.Container(); this.terrain = new PIXI.Container(); this.worldA.addChild(this.terrain);        // under the ground layer
    this.worldB = new PIXI.Container(); this.grass = new PIXI.Container(); this.marker = new PIXI.Container(); this.items = new PIXI.Container();
    this.worldB.addChild(this.grass, this.marker, this.items);                       // over it: grass, the tap marker, the depth-sorted items
    this.worldC = new PIXI.Container(); this.names = new PIXI.Container(); this.worldC.addChild(this.names);                   // building names, over the items
    this.lightLayer = new PIXI.Container();                                          // night (lighting)
    this.worldD = new PIXI.Container(); this.particles = new PIXI.Container(); this.strokes = new PIXI.Container(); this.worldD.addChild(this.particles, this.strokes);   // particles, floating text
    this.ready = this.app.init({
      canvas: this.view, width: Math.max(1, this.canvas.width), height: Math.max(1, this.canvas.height), resolution: 1, autoDensity: false,
      antialias: false, backgroundAlpha: 1, background: OCEAN_COLOR, autoStart: false, preference: 'webgl', powerPreference: 'high-performance', roundPixels: false,
    }).then(() => {
      this.app.ticker.stop();
      this.groundSprite = new PIXI.Sprite(); this.overlaySprite = new PIXI.Sprite();
      this.app.stage.addChild(this.worldA, this.groundSprite, this.worldB, this.worldC, this.lightLayer, this.worldD, this.overlaySprite);
      this.atlas = new DynamicAtlas(1024); this.grassPool = new SpritePool(this.grass); this.itemPool = new SpritePool(this.items);
      this.markerPool = new SpritePool(this.marker); this.namePool = new SpritePool(this.names); this.strokePool = new SpritePool(this.strokes); this.particlePool = [];
      this.lighting = new PixiLighting(this, this.lightLayer);
      this.stamps = new StampCache(); this.seeThrough = SeeThrough.create();
      this._ready = true; this._fit();
    });
  }

  get backend() { return 'pixi'; }

  resize() { super.resize(); if (this._ready) this._fit(); }

  /** Size the Pixi canvas and both 2D layers to the camera's pixel size, with fresh textures for the layers. */
  _fit() {
    const w = this.groundCanvas.width, h = this.groundCanvas.height;
    if (w === this.pixel.w && h === this.pixel.h && this.groundSprite.texture !== PIXI.Texture.EMPTY) return;
    this.pixel = { w, h };
    this.overlayCanvas.width = w; this.overlayCanvas.height = h;
    this.app.renderer.resize(w, h);
    for (const [sprite, canvas] of [[this.groundSprite, this.groundCanvas], [this.overlaySprite, this.overlayCanvas]]) {
      const old = sprite.texture;
      sprite.texture = this._textureOf(canvas);
      if (old && old !== PIXI.Texture.EMPTY) old.destroy(true);
    }
  }

  /** A nearest-neighbour texture that reads straight from a canvas (call `texture.source.update()` after repainting the canvas). */
  _textureOf(canvas) {
    return new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: canvas, scaleMode: 'nearest', autoGenerateMipmaps: false }) });
  }

  /** Point all the existing draw code at one of the 2D layers. */
  _useLayer(canvas, ctx) { this.canvas = canvas; this.ctx = ctx; this.g.ctx = ctx; }

  _beginFrame(indoors) {
    this._useLayer(this.groundCanvas, this.groundCtx);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.groundDirty.dirty = this.overlayDirty.dirty = false;
    if (this._ready) { this.app.renderer.background.color = indoors ? 0x0b0d12 : OCEAN_COLOR; for (const p of [this.grassPool, this.itemPool, this.markerPool, this.namePool, this.strokePool]) p.begin(); this.stamps.beginFrame(this.camera.scale); PaletteSwap.tick(); }
    this.frameNo++;
  }

  /** The ground's baked blocks (terrainRenderer.js) are textures; one is re-uploaded only when the terrain renderer baked it again. */
  _block(entry, key, w, h) {
    if (!this._ready) return;
    let b = this.blocks.get(key);
    if (!b) { b = { sprite: new PIXI.Sprite(), entry: null, canvas: null, seen: 0 }; this.terrain.addChild(b.sprite); this.blocks.set(key, b); }
    if (b.entry !== entry) {
      const c = entry.canvas;
      if (b.canvas !== c || b.sprite.texture.width !== c.width || b.sprite.texture.height !== c.height) {
        const old = b.sprite.texture; b.sprite.texture = this._textureOf(c); b.canvas = c;
        if (old && old !== PIXI.Texture.EMPTY) old.destroy(true);
      } else b.sprite.texture.source.update();                                      // (same canvas painted again)
      b.entry = entry;
    }
    const t = b.sprite.texture;
    b.sprite.position.set(entry.x0, entry.y0); b.sprite.scale.set(w / t.width, h / t.height); b.sprite.visible = true; b.seen = this.frameNo;
  }

  /** A grass clump away from everyone: a sprite under the items (the clumps near someone are placed among the items, in depth order). */
  _grass(art, x, y, w, h) {
    if (!this._ready) return;
    const t = this.atlas.texture(art.atlasKey, () => art);
    if (t) this.grassPool.place(t, x, y, w, h);
  }

  /* ---- the depth-sorted items ---- */

  /** Where an item stands (the origin of its drawing). */
  _anchorOf(item) {
    if (item.gx !== undefined) return [item.gx, item.gy];
    const e = item.animal || item.npc || item.p || item.boat;
    return [isoX(e.x, e.y), isoY(e.x, e.y)];
  }

  /** Items that change picture all the time go to the small texture pages. */
  _poolOf(item) {
    if (item.kind === 'structure' || item.kind === 'built' || item.kind === 'doorLeaf' || item.kind === 'station' || item.kind === 'sapling' || item.kind === 'crop') return 'static';
    if (item.kind === 'prop') { const t = item.prop.t; return t === 'tree' || t === 'bush' || t === 'hedge' || t === 'stone' || t === 'flax' || t === 'chest' || t === 'clay' || t === 'barrel' || t === 'critter_home' || t === 'well' ? 'static' : 'dynamic'; }
    return 'dynamic';
  }

  _drawWorld(items, now) {
    if (!this._ready) return;
    const s = this.camera.scale, rec = this.recorder, real = this.ctx, cam = this.camera, me = this.players && this.players[this.game.myId];
    const ox = Math.round((cam.w / 2 - cam.x) * s), oy = Math.round((cam.h / 2 - cam.y) * s);                      // (the world's offset on screen, as in _endFrame)
    let hole = null;                                                                                  // the see-through effect: the player's place on screen
    if (this.seeThroughOn && me && !me.boat) {
      const lift = (me.lift || 0) * FLY_HEIGHT, reach = 78 * s;
      hole = { depth: me.x + me.y + (me.lift || 0) * 4, wx: me.x, wy: me.y, x: ox + isoX(me.x, me.y) * s, y: oy + (isoY(me.x, me.y) - 20 - lift) * s, inner: 34 * s, outer: reach, squash: 1.35 };
      this.seeThrough.set(hole.x, hole.y, hole.inner, hole.outer);
    }
    const view = cam.bounds();
    for (const item of items) {
      if (item.kind === 'grass') {                                                    // a clump near someone: already a picture
        if (item.art) { const t = this.atlas.texture(item.art.atlasKey, () => item.art); if (t) this.itemPool.place(t, item.x, item.y, item.w, item.h); }
        continue;
      }
      let [ax, ay] = this._anchorOf(item);
      if (ax < view.minX - 150 || ax > view.maxX + 150 || ay < view.minY - 120 || ay > view.maxY + 300) continue;       // (off screen: the canvas path lets the canvas clip these; here they would be painted for nothing)
      const pool = this._poolOf(item), still = pool === 'static';
      if (!still) { ax = Math.round(ax * s) / s; ay = Math.round(ay * s) / s; }       // (something that moves is anchored on a whole device pixel: then what it draws in whole pixels (shadows, tags) is the same picture however far it has walked)
      rec.begin(ax, ay, !still);
      this.ctx = this.g.ctx = rec;                                                    // (the item's own drawing code now records)
      try { this._drawItem(item, now); }
      catch (e) { if (!this.broken.has(item.kind)) { this.broken.add(item.kind); console.error('pixi: drawing a "' + item.kind + '" failed:', e); } }
      finally { this.ctx = this.g.ctx = real; }
      const last = rec.end(), snap = still ? Math.floor : Math.round, bx = snap(ax * s), by = snap(ay * s);
      for (const part of last.parts) {                                                // (a figure splits the item: what was drawn before it, the figure, what follows)
        if (part.rec) this._placeStamp(part.rec, ax, ay, bx, by, pool, still, item, hole, ox, oy);
        else this._placeFigure(part.figure, ax, ay, bx, by);
      }
      this._placeStamp(last, ax, ay, bx, by, pool, still, item, hole, ox, oy);
    }
    this._useLayer(this.overlayCanvas, this.overlayCtx);                              // what follows (names, night, particles) goes on top
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.camera.applyTransform(this.ctx);
  }

  /** Run some of the base class's drawing (building names, the tap marker, floating text) into the recorder and show it as sprites in `pool`. The
   *  drawing is world-space; (ax, ay) is where the recording is anchored (still: nothing in it changes position). */
  _asSprites(pool, ax, ay, still, paint) {
    const rec = this.recorder, real = this.ctx, s = this.camera.scale;
    if (!still) { ax = Math.round(ax * s) / s; ay = Math.round(ay * s) / s; }
    rec.begin(ax, ay, !still);
    this.ctx = this.g.ctx = rec;
    try { paint(); } catch (e) { if (!this.broken.has('overlay')) { this.broken.add('overlay'); console.error('pixi: overlay drawing failed:', e); } } finally { this.ctx = this.g.ctx = real; }
    const last = rec.end(), snap = still ? Math.floor : Math.round, bx = snap(ax * s), by = snap(ay * s);
    for (const part of last.parts.map(p => p.rec).concat([last])) {
      const e = this.stamps.stamp(part, ax, ay, still ? 'static' : 'dynamic', still);
      if (e) pool.place(e.tex, (bx + e.ix) / s, (by + e.iy) / s, e.w / s, e.h / s);
    }
  }

  _drawBuildingNames(me) { if (this._ready) this._asSprites(this.namePool, 0, 0, true, () => super._drawBuildingNames(me)); }
  _drawTapMarker(now) {
    if (!this._ready) return;
    const m = this.getTapMarker(now);
    if (m) this._asSprites(this.markerPool, isoX(m.x, m.y), isoY(m.x, m.y), false, () => super._drawTapMarker(now));
  }

  _drawWeather(frameMs) { if (this._ready) super._drawWeather(frameMs); }

  /** Particles are sprites (a tinted white square each); arrows, lassos and floating text are drawn by the effects code into the recorder. */
  _drawEffects(frameMs) {
    if (!this._ready) return;
    const fx = this.effects, dt = frameMs / 1000;
    fx.advanceParticles(dt);
    const list = this.particlePool;
    fx.particles.forEach((p, i) => {
      let sp = list[i];
      if (!sp) { sp = new PIXI.Sprite(PIXI.Texture.WHITE); list[i] = sp; this.particles.addChild(sp); }
      sp.visible = true; sp.position.set(p.x, p.y); sp.width = sp.height = p.size; sp.alpha = 1 - p.age / p.life; sp.tint = PixiRenderer.colour(p.color);
    });
    for (let i = fx.particles.length; i < list.length; i++) list[i].visible = false;
    this._asSprites(this.strokePool, 0, 0, false, () => fx.drawStrokes(this.g, dt));
  }

  /** '#rrggbb' -> number (particle colours repeat: parsed once). */
  static colour(css) { let n = PixiRenderer._colours.get(css); if (n === undefined) { n = css[0] === '#' ? parseInt(css.slice(1), 16) : 0xffffff; PixiRenderer._colours.set(css, n); } return n; }

  /** One recording as a sprite (anchor (ax, ay) is on device pixel (bx, by)); a building in front of the player gets the see-through filter. */
  _placeStamp(r, ax, ay, bx, by, pool, still, item, hole, ox, oy) {
    const s = this.camera.scale, e = this.stamps.stamp(r, ax, ay, pool, still);
    if (!e) return;
    const px = bx + e.ix, py = by + e.iy, sprite = this.itemPool.place(e.tex, px / s, py / s, e.w / s, e.h / s);
    if (hole && this._hidesPlayer(item, hole)) {                                                          // cut it away round you
      const l = ox + px, t = oy + py, dx = Math.max(l - hole.x, 0, hole.x - (l + e.w)), dy = Math.max(t - hole.y, 0, hole.y - (t + e.h)) / hole.squash;
      if (Math.hypot(dx, dy) < hole.outer) { sprite.filters = [this.seeThrough.filter]; this._footprint(item); }
    }
  }

  /** Does this wall / building stand in front of the player with the player entirely behind it (not just off to one side)? Fences, gates and
   *  props (trees...) never count: you can see through them already. */
  _hidesPlayer(item, hole) {
    if (item.kind === 'structure') return item.depth > hole.depth && hole.wx < item.tx + 1 && hole.wy < item.ty + 1;
    if (item.kind !== 'built') return false;
    const def = StructureDefs[item.structure];
    return !(def && def.fence) && item.depth > hole.depth && hole.wx < item.box[2] && hole.wy < item.box[3];
  }

  /** A building tile that is cut away shows its footprint as black void on the ground (under the items), so you can see where you cannot walk. */
  _footprint(item) {
    if (item.kind !== 'structure' || item.o === OBJ.DOOR) return;
    const ctx = this.groundCtx, { tx, ty } = item;
    ctx.save(); this.camera.applyTransform(ctx);
    ctx.fillStyle = '#000'; ctx.beginPath();
    ctx.moveTo(isoX(tx, ty), isoY(tx, ty)); ctx.lineTo(isoX(tx + 1, ty), isoY(tx + 1, ty)); ctx.lineTo(isoX(tx + 1, ty + 1), isoY(tx + 1, ty + 1)); ctx.lineTo(isoX(tx, ty + 1), isoY(tx, ty + 1));
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  /** A pony or character in marker colours (see paletteFilter.js), as one sprite with the palette swap on it. */
  _placeFigure(f, ax, ay, bx, by) {
    const s = this.camera.scale, tex = this.atlas.texture(f.frame.key, f.frame.make);
    if (!tex) return;
    const w = Math.round(f.dw * s), h = Math.round(f.dh * s), px = bx + Math.round((f.dx - ax) * s), py = by + Math.round((f.dy - ay) * s);
    const sprite = this.itemPool.place(tex, px / s, py / s, w / s, h / s);
    if (f.mirror) { sprite.scale.x = -sprite.scale.x; sprite.position.x += w / s; }
    sprite.filters = [PaletteSwap.filterFor(f.lut.key, f.lut.make, f.wash)];
  }

  _endFrame() {
    if (!this._ready) return;
    for (const b of this.blocks.values()) if (b.seen !== this.frameNo) b.sprite.visible = false;
    if (this.frameNo % 300 === 0) this._forgetBlocks();
    for (const p of [this.grassPool, this.itemPool, this.markerPool, this.namePool, this.strokePool]) p.end();
    this.atlas.flush(); this.stamps.flush();
    const cam = this.camera, s = cam.scale, ox = Math.round((cam.w / 2 - cam.x) * s), oy = Math.round((cam.h / 2 - cam.y) * s);
    for (const w of [this.worldA, this.worldB, this.worldC, this.worldD]) { w.scale.set(s); w.position.set(ox, oy); }                       // (= Camera.applyTransform)
    this.groundSprite.visible = this.groundDirty.dirty; this.overlaySprite.visible = this.overlayDirty.dirty;
    if (this.groundDirty.dirty) this.groundSprite.texture.source.update();
    if (this.overlayDirty.dirty) this.overlaySprite.texture.source.update();
    this._useLayer(this.groundCanvas, this.groundCtx);
    this.app.render();
  }

  /** Free the textures of blocks not seen for ~10 s. */
  _forgetBlocks() {
    for (const [key, b] of this.blocks) {
      if (this.frameNo - b.seen < 600) continue;
      this.terrain.removeChild(b.sprite); b.sprite.destroy({ texture: true, textureSource: true }); this.blocks.delete(key);
    }
  }
}
