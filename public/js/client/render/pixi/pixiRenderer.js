'use strict';
/* CLIENT - the Pixi (WebGL) render backend, selected with ?renderer=pixi (see backend.js).
 *
 * It is the canvas Renderer with a different last step. Everything is still worked out by Renderer (what is on screen, in what order); the
 * ground's baked blocks are drawn as Pixi sprites, and whatever is still painted with the 2D API goes into a transparent screen-sized
 * layer (`this.canvas` / `this.ctx`, so every existing draw function works unchanged) that is uploaded as one texture on top. The port moves
 * more of the picture from that layer into sprites stage by stage; see tools/README-pixi.md.
 *
 * Coordinates match the canvas path exactly: the Pixi canvas is camera.pixelW x pixelH device pixels, the world container is scaled by
 * camera.scale and offset by the same rounded translation as Camera.applyTransform, and all textures are nearest-neighbour. */
class PixiRenderer extends Renderer {
  constructor(opts) {
    const layer = document.createElement('canvas');                                 // the 2D layer for what is not a sprite yet
    super({ ...opts, canvas: layer, ctxOptions: { alpha: true } });
    this.view = opts.canvas;                                                         // the page's #game: Pixi draws into it
    this.pixel = { w: 0, h: 0 };
    this.blocks = new Map();                                                         // block key -> { sprite, entry, canvas, seen }
    this.frameNo = 0; this._ready = false;
    this.blockSink = (entry, key, w, h) => this._block(entry, key, w, h);
    this.grassSink = (art, x, y, w, h) => this._grass(art, x, y, w, h);
    this.app = new PIXI.Application();
    this.world = new PIXI.Container(); this.terrain = new PIXI.Container(); this.grass = new PIXI.Container(); this.world.addChild(this.terrain, this.grass);
    this.ready = this.app.init({
      canvas: this.view, width: Math.max(1, this.canvas.width), height: Math.max(1, this.canvas.height), resolution: 1, autoDensity: false,
      antialias: false, backgroundAlpha: 1, background: OCEAN_COLOR, autoStart: false, preference: 'webgl', powerPreference: 'high-performance', roundPixels: false,
    }).then(() => {
      this.app.ticker.stop();
      this.app.stage.addChild(this.world);
      this.atlas = new DynamicAtlas(1024); this.grassPool = new SpritePool(this.grass);
      this.layerSprite = new PIXI.Sprite(); this.app.stage.addChild(this.layerSprite);   // (above the world: screen space, 1 canvas pixel = 1 device pixel)
      this._ready = true; this._fit();
    });
  }

  get backend() { return 'pixi'; }

  resize() { super.resize(); if (this._ready) this._fit(); }

  /** Size the Pixi canvas to the 2D layer and make a fresh texture for it. */
  _fit() {
    const w = this.canvas.width, h = this.canvas.height;
    if (w === this.pixel.w && h === this.pixel.h && this.layerSprite.texture !== PIXI.Texture.EMPTY) return;
    this.pixel = { w, h };
    this.app.renderer.resize(w, h);
    const old = this.layerSprite.texture;
    this.layerSprite.texture = this._textureOf(this.canvas);
    if (old && old !== PIXI.Texture.EMPTY) old.destroy(true);
  }

  /** A nearest-neighbour texture that reads straight from a canvas (call `texture.source.update()` after repainting the canvas). */
  _textureOf(canvas) {
    return new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: canvas, scaleMode: 'nearest', autoGenerateMipmaps: false }) });
  }

  _beginFrame(indoors) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this._ready) this.app.renderer.background.color = indoors ? 0x0b0d12 : OCEAN_COLOR;
    this.frameNo++;
    if (this._ready) this.grassPool.begin();
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

  /** A grass clump away from everyone: a sprite (the clumps near someone are drawn in the depth-sorted pass, on the layer). */
  _grass(art, x, y, w, h) {
    if (!this._ready) return;
    const t = this.atlas.texture(art.atlasKey, () => art);
    if (t) this.grassPool.place(t, x, y, w, h);
  }

  _endFrame() {
    if (!this._ready) return;
    this.grassPool.end(); this.atlas.flush();
    for (const b of this.blocks.values()) if (b.seen !== this.frameNo) b.sprite.visible = false;
    if (this.frameNo % 300 === 0) this._forgetBlocks();
    const cam = this.camera, s = cam.scale;
    this.world.scale.set(s); this.world.position.set(Math.round((cam.w / 2 - cam.x) * s), Math.round((cam.h / 2 - cam.y) * s));   // (= Camera.applyTransform)
    this.layerSprite.texture.source.update();
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
