'use strict';
/* CLIENT - day / night. After the world is drawn, one overlay darkens the screen: a warm tint at sunrise and sunset, and
 * at night a cool dark blue with soft pools of light CUT OUT of it around the player, held torches and campfires.
 * The cut-outs need an off-screen layer; if the browser cannot provide one we fall back to a simple single pool. */
const LIGHT_RADIUS = 300, TILE_TO_SCREEN = Math.SQRT2;       // a light of r tiles reaches r * sqrt2 * half-tile-width pixels sideways

/** How dark the night is, as the overlay's opacity at midnight. A per-player preference (Menu > Night darkness), kept in this browser. */
const NightSetting = (() => {
  const KEY = 'ponyscapes.nightDarkness', MIN = 0.35, MAX = 0.95, DEFAULT = 0.76;
  let v = DEFAULT;
  try { const raw = parseFloat(localStorage.getItem(KEY)); if (raw >= MIN && raw <= MAX) v = raw; } catch (e) { /* private window: the default */ }
  return {
    MIN, MAX, DEFAULT, get value() { return v; },
    set(x) { v = Math.min(MAX, Math.max(MIN, x)); try { localStorage.setItem(KEY, String(v)); } catch (e) { /* lasts this session */ } }
  };
})();

/** The colour of each kind of light, and how hard it flickers (a torch gutters, a lantern burns steadily). */
const LIGHT_LOOK = {
  torch:    { rgb: [255, 150, 55],  glow: 0.36, flicker: 1 },
  campfire: { rgb: [255, 125, 40],  glow: 0.42, flicker: 0.8 },
  lantern:  { rgb: [255, 195, 95],  glow: 0.30, flicker: 0.35 },
  pony:     { rgb: [255, 240, 170], glow: 0.20, flicker: 0.25 }
};
/** A flame's brightness at time t (ms) as a multiplier around 1: a few sines at unrelated speeds read as random, and every light has its own phase. */
function lightFlicker(kind, x, y, t) {
  const look = LIGHT_LOOK[kind] || LIGHT_LOOK.torch, s = x * 3.1 + y * 1.7, k = t / 1000;
  const wave = Math.sin(k * 7.3 + s) * 0.05 + Math.sin(k * 12.9 + s * 1.7) * 0.04 + Math.sin(k * 23.0 + s * 2.3) * 0.03 + Math.sin(k * 3.1 + s * 0.6) * 0.03;
  return 1 + wave * look.flicker;
}

class Lighting {
  constructor() { this.layer = null; }

  /** @param {Array<{x,y,radius,kind}>} lights in canvas pixels (radius = horizontal reach) */
  draw(ctx, canvasW, canvasH, hour, playerX, playerY, scale, lights = []) {
    const dark = 1 - DayCycle.daylight(hour), glow = DayCycle.horizonGlow(hour);
    if (dark < 0.01 && glow < 0.01) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (glow > 0.01) { ctx.fillStyle = `rgba(255,150,70,${(0.2 * glow).toFixed(3)})`; ctx.fillRect(0, 0, canvasW, canvasH); }
    if (dark < 0.01) return;
    const alpha = NightSetting.value * dark;
    try { if (this._drawWithCutouts(ctx, canvasW, canvasH, alpha, playerX, playerY, scale, lights)) return; } catch (e) { this.layer = null; }
    const pool = ctx.createRadialGradient(playerX, playerY, LIGHT_RADIUS * scale * 0.12, playerX, playerY, LIGHT_RADIUS * scale);
    pool.addColorStop(0, `rgba(12,18,50,${(alpha * 0.2).toFixed(3)})`); pool.addColorStop(1, `rgba(6,10,38,${alpha.toFixed(3)})`);
    ctx.fillStyle = pool; ctx.fillRect(0, 0, canvasW, canvasH);
  }

  _drawWithCutouts(ctx, w, h, alpha, px, py, scale, lights) {
    if (typeof document === 'undefined') return false;
    const layer = this.layer || (this.layer = document.createElement('canvas'));
    if (layer.width !== w) layer.width = w;
    if (layer.height !== h) layer.height = h;
    const m = layer.getContext('2d');
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, w, h);
    m.fillStyle = `rgba(6,10,38,${alpha.toFixed(3)})`; m.fillRect(0, 0, w, h);
    m.globalCompositeOperation = 'destination-out';
    const cut = (x, y, rx, strength, squash) => {                    // a soft ellipse of light (the world is isometric, so lit circles are 2:1 ellipses)
      m.save(); m.translate(x, y); m.scale(1, squash);
      const gr = m.createRadialGradient(0, 0, rx * 0.08, 0, 0, rx);
      gr.addColorStop(0, `rgba(0,0,0,${strength})`); gr.addColorStop(0.55, `rgba(0,0,0,${strength * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = gr; m.fillRect(-rx, -rx, 2 * rx, 2 * rx); m.restore();
    };
    cut(px, py, LIGHT_RADIUS * scale, 0.78, 1);                       // the soft pool you always carry
    for (const l of lights) cut(l.x, l.y, l.radius, Math.min(1, 0.9 + (l.flick - 1) * 0.6), 0.5);
    m.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, 0, 0);
    ctx.globalCompositeOperation = 'lighter';                         // a warm glow on top of the cut-outs
    for (const l of lights) {
      const look = LIGHT_LOOK[l.kind] || LIGHT_LOOK.torch, [r, g, b] = look.rgb;
      ctx.save(); ctx.translate(l.x, l.y); ctx.scale(1, 0.5);
      const gr = ctx.createRadialGradient(0, 0, 2, 0, 0, l.radius * 0.9);
      gr.addColorStop(0, `rgba(${r},${g},${b},${(look.glow * l.flick).toFixed(3)})`); gr.addColorStop(0.5, `rgba(${r},${g},${b},${(look.glow * 0.35 * l.flick).toFixed(3)})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gr; ctx.fillRect(-l.radius, -l.radius, 2 * l.radius, 2 * l.radius); ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    return true;
  }
}
