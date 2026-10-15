'use strict';
/* CLIENT - biome effects: the animated little details that make a biome look like itself. A biome's data names one (effect: 'snow'); each is
 * registered here. tint() recolours the whole tile first (optional); detail() draws on tiles whose noise passes `above`. */
const BiomeEffects = new Registry('biome effects', { required: ['above'] });
const _glow = (ctx, x, y, r, rgba) => { ctx.fillStyle = rgba; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };

BiomeEffects.register({ id: 'petals', above: 0.5, detail(ctx, x, y, noise, tx, ty, t) {
  for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#ffb3d1', '#ffffff', '#ff8fbd'][(tx + ty + i) % 3]; ctx.beginPath(); ctx.arc(x + (i - 1) * 7 * DETAIL, y + ((i * 5) % 7 - 3) * DETAIL, 1.7, 0, Math.PI * 2); ctx.fill(); }
} });
BiomeEffects.register({ id: 'glints', above: 0.72, detail(ctx, x, y, noise, tx, ty, t) {
  const tw = 0.55 + 0.45 * Math.sin(t * 2 + tx * 1.7 + ty); ctx.fillStyle = `rgba(235,252,255,${(0.5 + 0.5 * tw).toFixed(2)})`;
  ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 2.4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 2.4, y); ctx.closePath(); ctx.fill();
} });
BiomeEffects.register({ id: 'stars', above: 0.55, detail(ctx, x, y, noise, tx, ty, t) {
  const tw = 0.5 + 0.5 * Math.sin(t * 1.6 + tx * 2.3 + ty * 1.1); _glow(ctx, x, y, 1.3 + tw * 1.1, `rgba(${noise > 0.8 ? '150,255,240' : '205,190,255'},${(0.25 + 0.7 * tw).toFixed(2)})`);
} });
BiomeEffects.register({ id: 'embers', above: 0.62, detail(ctx, x, y, noise, tx, ty, t) {
  const fl = 0.5 + 0.5 * Math.sin(t * 5 + tx * 3.1 + ty * 1.7); ctx.fillStyle = `rgba(255,${120 + (fl * 90) | 0},40,${(0.35 + 0.55 * fl).toFixed(2)})`; ctx.fillRect(x - 1.2, y - 1, 2.6, 2);
} });
BiomeEffects.register({ id: 'snow', above: 0.5, detail(ctx, x, y, noise, tx, ty, t) {                 // drifting sparkles on the snow
  const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + tx * 1.9 + ty * 2.7); ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.5 * tw).toFixed(2)})`; ctx.fillRect(x - 1, y - 1, 2.2, 2.2); ctx.fillRect(x + 6 * DETAIL, y + 3 * DETAIL, 1.4, 1.4);
} });
BiomeEffects.register({ id: 'sprinkles', above: 0.42, detail(ctx, x, y, noise, tx, ty, t) {           // candy sprinkles
  for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#ff4081', '#ffffff', '#40c4ff', '#ffd740', '#69f0ae'][(tx * 3 + ty + i) % 5]; ctx.save(); ctx.translate(x + (i - 1.5) * 6 * DETAIL, y + ((i * 7) % 5 - 2) * DETAIL); ctx.rotate(i * 1.3 + tx); ctx.fillRect(-2, -0.6, 4, 1.3); ctx.restore(); }
} });
BiomeEffects.register({ id: 'rainbow', above: 0.7,                                                      // every tile a slightly different colour of the rainbow
  tint(ctx, tx, ty, t) { ctx.fillStyle = `hsla(${(tx * 11 + ty * 7 + t * 12) % 360},85%,70%,0.24)`; ctx.fill(); },
  detail(ctx, x, y, noise, tx, ty, t) { for (let i = 0; i < 3; i++) _glow(ctx, x + (i - 1) * 6 * DETAIL, y, 1.6, `hsla(${(tx * 40 + i * 70 + t * 40) % 360},95%,65%,.85)`); } });
BiomeEffects.register({ id: 'fireflies', above: 0.7, detail(ctx, x, y, noise, tx, ty, t) {
  const fl = Math.sin(t * 2.2 + tx * 1.3 + ty * 2.9); if (fl < 0.2) return; _glow(ctx, x + Math.sin(t + tx) * 4, y - 3 + Math.cos(t * 1.3 + ty) * 3, 1.6, `rgba(220,255,120,${(0.3 + 0.6 * fl).toFixed(2)})`);
} });

/* The Waterlands: little droplets and ripple rings on the wet ground. */
BiomeEffects.register({ id: 'ripples', above: 0.62, detail(ctx, x, y, noise, tx, ty, t) {
  const ph = (((t * 0.6 + tx * 0.37 + ty * 0.53) % 1) + 1) % 1, r = 1.5 + ph * 5; ctx.strokeStyle = `rgba(235,250,255,${(0.6 * (1 - ph)).toFixed(2)})`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
} });
/* The Rainbow Skies: the ground is cloud, washed in drifting rainbow colours, with soft white clouds puffed up here and there. */
BiomeEffects.register({ id: 'rainbowclouds', above: 0.55,
  tint(ctx, tx, ty, t) { ctx.fillStyle = `hsla(${(tx * 9 + ty * 6 + t * 10) % 360},80%,72%,0.16)`; ctx.fill(); },
  detail(ctx, x, y, noise, tx, ty, t) {
    const drift = Math.sin(t * 0.4 + tx * 0.8 + ty * 0.5) * 2.2, s = 0.8 + noise * 0.7, cx = x + drift, cy = y - 3 * DETAIL;
    ctx.fillStyle = 'rgba(120,140,190,.22)'; ctx.beginPath(); ctx.ellipse(cx, cy + 5 * s, 11 * s, 3.2 * s, 0, 0, Math.PI * 2); ctx.fill();                      // its soft shadow
    for (const [dx, dy, r] of [[-6, 1, 4.6], [0, -2, 6], [6, 1, 4.8], [2, 2, 5]]) _glow(ctx, cx + dx * s, cy + dy * s, r * s, 'rgba(255,255,255,.93)');
    for (const [dx, dy, r] of [[-5, 3, 3], [3, 4, 3.4]]) _glow(ctx, cx + dx * s, cy + dy * s, r * s, 'rgba(226,232,250,.8)');                                     // the shaded underside
  } });
