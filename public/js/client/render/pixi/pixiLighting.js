'use strict';
/* CLIENT (Pixi backend) - day and night, the same picture as lighting.js: a warm tint at sunrise and sunset; at night a cool dark blue over the whole
 * screen with soft pools of light CUT OUT of it round the player, held torches and campfires, and a warm glow added on top of the cut-outs.
 * The dark layer is a render texture: filled with the night colour, then a soft white-to-clear sprite per light drawn into it with the 'erase' blend
 * (the canvas version's destination-out). Same signature as Lighting.draw, so Renderer._drawLighting uses it unchanged. */
class PixiLighting {
  constructor(renderer, parent) {
    this.r = renderer;
    const radial = (stops, size = 256) => {                                                       // a round gradient picture; the sprite's size and alpha do the rest
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, size / 2 * stops.inner, size / 2, size / 2, size / 2);
      for (const [at, colour] of stops.list) gr.addColorStop(at, colour);
      g.fillStyle = gr; g.fillRect(0, 0, size, size); return PIXI.Texture.from(c);
    };
    this.cutTex = radial({ inner: 0.08, list: [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']] });                   // (= lighting.js's cut-out, strength 1)
    this.glowTex = radial({ inner: 0.01, list: [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']] });          // (white: each light tints it its own warm colour, lighting.js LIGHT_LOOK)
    this.horizon = new PIXI.Sprite(PIXI.Texture.WHITE); this.horizon.tint = 0xff9646;
    this.night = new PIXI.Sprite(); this.glows = new PIXI.Container();
    this.container = new PIXI.Container(); this.container.addChild(this.horizon, this.night, this.glows); parent.addChild(this.container);
    this.scene = new PIXI.Container(); this.dark = new PIXI.Sprite(PIXI.Texture.WHITE); this.dark.tint = 0x060a26; this.scene.addChild(this.dark);
    this.cuts = []; this.glowSprites = []; this.rt = null;
  }

  _rt(w, h) {
    if (this.rt && this.rt.width === w && this.rt.height === h) return;
    if (this.rt) this.rt.destroy(true);
    this.rt = PIXI.RenderTexture.create({ width: w, height: h, resolution: 1, scaleMode: 'linear' }); this.night.texture = this.rt;
  }

  /** @param {Array<{x,y,radius,kind}>} lights in device pixels (radius = horizontal reach) */
  draw(ctx, canvasW, canvasH, hour, playerX, playerY, scale, lights = []) {
    const dark = 1 - DayCycle.daylight(hour), glow = DayCycle.horizonGlow(hour);
    this.container.visible = dark >= 0.01 || glow >= 0.01;
    if (!this.container.visible) return;
    this.horizon.visible = glow > 0.01; this.horizon.width = canvasW; this.horizon.height = canvasH; this.horizon.alpha = 0.2 * glow;
    this.night.visible = this.glows.visible = dark >= 0.01;
    if (dark < 0.01) return;
    this._rt(canvasW, canvasH);
    this.dark.width = canvasW; this.dark.height = canvasH; this.dark.alpha = NightSetting.value * dark;
    let n = 0;
    const cut = (x, y, rx, strength, squash) => {                                                  // a soft ellipse of light (the world is isometric, so lit circles are 2:1 ellipses)
      let s = this.cuts[n];
      if (!s) { s = new PIXI.Sprite(this.cutTex); s.anchor.set(0.5); s.blendMode = 'erase'; this.cuts[n] = s; this.scene.addChild(s); }
      n++; s.visible = true; s.position.set(x, y); s.width = 2 * rx; s.height = 2 * rx * squash; s.alpha = strength;
    };
    const own = playerPool(scale);
    if (own.strength > 0.01) cut(playerX, playerY, own.radius, own.strength, 1);                    // the soft pool you always carry
    for (const l of lights) cut(l.x, l.y, l.radius, Math.min(1, 0.9 + (l.flick - 1) * 0.6), 0.5);
    for (let i = n; i < this.cuts.length; i++) this.cuts[i].visible = false;
    this.r.app.renderer.render({ container: this.scene, target: this.rt, clear: true, clearColor: [0, 0, 0, 0] });
    lights.forEach((l, i) => {                                                                     // a warm glow on top of the cut-outs
      let s = this.glowSprites[i];
      if (!s) { s = new PIXI.Sprite(this.glowTex); s.anchor.set(0.5); s.blendMode = 'add'; this.glowSprites[i] = s; this.glows.addChild(s); }
      const look = LIGHT_LOOK[l.kind] || LIGHT_LOOK.torch, [r, g, b] = look.rgb;
      s.visible = true; s.position.set(l.x, l.y); s.width = 2 * 0.9 * l.radius; s.height = 2 * 0.9 * l.radius * 0.5;
      s.tint = (r << 16) | (g << 8) | b; s.alpha = Math.min(1, look.glow * l.flick);
    });
    for (let i = lights.length; i < this.glowSprites.length; i++) this.glowSprites[i].visible = false;
  }
}
