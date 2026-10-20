'use strict';
/* CLIENT - the friendship hearts that float over an animal or a villager: three hearts, filled from the left (a partly filled heart shows a part of it), in
 * the colour of the friendship level. The TIER of the level decides how they are painted:
 *   basic     flat colour with a little highlight           pastel    soft, with a milky sheen
 *   metallic  a metal gradient with a gleam sweeping across it           electric  a glowing neon core with crackling sparks and a pulse */
const HeartMeter = {
  SIZE: 5.2,

  _shade(hex, k) { const n = parseInt(hex.slice(1), 16), c = v => Math.max(0, Math.min(255, Math.round(v * k))); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c).map(v => v.toString(16).padStart(2, '0')).join(''); },
  _path(ctx, x, y, s) {
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.95);
    ctx.bezierCurveTo(x - s * 1.55, y - s * 0.1, x - s * 0.95, y - s * 1.35, x, y - s * 0.42);
    ctx.bezierCurveTo(x + s * 0.95, y - s * 1.35, x + s * 1.55, y - s * 0.1, x, y + s * 0.95); ctx.closePath();
  },

  /** @param bond { level, into } or null (no friendship yet: three empty hearts, faint)  @param opts { faint, label } */
  draw(ctx, cx, cy, bond, now, opts = {}) {
    const s = HeartMeter.SIZE, step = s * 2.35, level = bond ? bond.level : 1, info = Friendship.info(level), hearts = bond ? Friendship.hearts(bond) : 0;
    if (typeof ctx.cut === 'function') ctx.cut();                                  // (the Pixi backend: the hearts are a picture of their own)
    ctx.save();
    if (!bond || opts.faint) ctx.globalAlpha = 0.55;
    for (let i = 0; i < 3; i++) HeartMeter._one(ctx, cx + (i - 1) * step, cy, s, info, clamp(hearts - i, 0, 1), now, i);
    if (bond && level > 1) {                                                           // the level number, small, to the right
      ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(10,18,28,.85)'; ctx.strokeText('' + level, cx + 1.5 * step + 1, cy + 0.5);
      ctx.fillStyle = info.color; ctx.fillText('' + level, cx + 1.5 * step + 1, cy + 0.5);
    }
    ctx.restore();
    if (typeof ctx.cut === 'function') ctx.cut();
  },

  _one(ctx, x, y, s, info, fill, now, idx) {
    const tier = info.tier, color = info.color, pulse = tier === 'electric' ? 1 + 0.09 * Math.sin(now / 120 + idx * 1.7) : 1, S = s * pulse;
    HeartMeter._path(ctx, x, y, S); ctx.fillStyle = 'rgba(10,18,28,.6)'; ctx.fill();                       // the empty heart
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.38)'; ctx.stroke();
    if (fill <= 0) return;
    if (tier === 'electric') { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 9 + 4 * Math.sin(now / 90 + idx); HeartMeter._path(ctx, x, y, S); ctx.fillStyle = color; ctx.globalAlpha = 0.55 * fill; ctx.fill(); ctx.restore(); }   // a halo
    ctx.save();
    HeartMeter._path(ctx, x, y, S); ctx.clip();
    if (fill < 1) { ctx.beginPath(); ctx.rect(x - S * 1.7, y - S * 1.7, S * 3.4 * fill, S * 3.4); ctx.clip(); }       // a partly filled heart
    if (tier === 'basic') {
      ctx.fillStyle = color; ctx.fillRect(x - S * 2, y - S * 2, S * 4, S * 4);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - S * 0.55, y - S * 0.45, S * 0.34, S * 0.2, -0.6, 0, Math.PI * 2); ctx.fill();
    } else if (tier === 'pastel') {
      const grad = ctx.createRadialGradient(x - S * 0.4, y - S * 0.5, 0, x, y, S * 1.5); grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.45, color); grad.addColorStop(1, HeartMeter._shade(color, 0.86));
      ctx.fillStyle = grad; ctx.fillRect(x - S * 2, y - S * 2, S * 4, S * 4);
    } else if (tier === 'metallic') {
      const grad = ctx.createLinearGradient(x - S, y - S, x + S, y + S); grad.addColorStop(0, HeartMeter._shade(color, 1.55)); grad.addColorStop(0.32, color); grad.addColorStop(0.58, HeartMeter._shade(color, 0.55)); grad.addColorStop(0.8, HeartMeter._shade(color, 1.25)); grad.addColorStop(1, HeartMeter._shade(color, 0.7));
      ctx.fillStyle = grad; ctx.fillRect(x - S * 2, y - S * 2, S * 4, S * 4);
      const sweep = ((now / 14 + idx * 9) % (S * 7)) - S * 3;                                                          // a gleam that sweeps across, one heart after another
      ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.beginPath(); ctx.moveTo(x + sweep - S * 0.5, y - S * 1.6); ctx.lineTo(x + sweep + S * 0.1, y - S * 1.6); ctx.lineTo(x + sweep - S * 0.9, y + S * 1.6); ctx.lineTo(x + sweep - S * 1.5, y + S * 1.6); ctx.closePath(); ctx.fill();
    } else {                                                                                                           // electric: a white-hot core in the neon colour
      ctx.fillStyle = color; ctx.fillRect(x - S * 2, y - S * 2, S * 4, S * 4);
      ctx.fillStyle = 'rgba(255,255,255,.82)'; HeartMeter._path(ctx, x, y - S * 0.06, S * 0.52); ctx.fill();
    }
    ctx.restore();
    HeartMeter._path(ctx, x, y, S); ctx.lineWidth = 1; ctx.strokeStyle = tier === 'electric' ? '#ffffff' : HeartMeter._shade(color, tier === 'pastel' ? 0.78 : 0.6); ctx.globalAlpha = tier === 'electric' ? 0.7 : 1; ctx.stroke(); ctx.globalAlpha = 1;
    if (tier === 'electric') HeartMeter._sparks(ctx, x, y, S, color, now, idx);
  },

  /** Little jagged bolts that flicker around an electric heart (a new pattern every ~90 ms). */
  _sparks(ctx, x, y, s, color, now, idx) {
    const bucket = Math.floor(now / 90) + idx * 31;
    ctx.save(); ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const r1 = Math.sin(bucket * 12.9898 + k * 78.233) * 43758.5453, r = r1 - Math.floor(r1);                       // a cheap per-bucket random
      if (r < 0.35) continue;
      const a = r * Math.PI * 2 * 3.7 + k, d0 = s * 1.15, d1 = s * (1.75 + r * 0.5), mx = x + Math.cos(a + 0.35) * (d0 + d1) / 2, my = y + Math.sin(a + 0.35) * (d0 + d1) / 2 + (r - 0.5) * 2;
      ctx.strokeStyle = k % 2 ? '#ffffff' : color; ctx.shadowColor = color; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0 - s * 0.1); ctx.lineTo(mx, my); ctx.lineTo(x + Math.cos(a - 0.1) * d1, y + Math.sin(a - 0.1) * d1 - s * 0.1); ctx.stroke();
    }
    ctx.restore();
  }
};
