'use strict';
/* CLIENT - creature sprite: giant centipede (also the Centipede Queen). A wriggling row of plates with a leg on every side. */
CreatureSprites.register({
  id: 'centipede',
  draw(s, { phase, speed, sprite, hunting, now }) {
    const g = s.g, ctx = g.ctx, col = sprite.color || '#8a3a2a', wave = speed > 0.2 ? phase * 1.6 : now / 700;
    g.ellipse(0, 3, 30, 6, 'rgba(0,0,0,.28)');
    const N = 11, seg = i => ({ x: -26 + i * 5.4, y: -7 - Math.sin(wave + i * 0.55) * 2.6 - (i === N - 1 ? 2 : 0) });
    ctx.strokeStyle = '#3a2420'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < N; i++) { const p = seg(i), sw = Math.sin(wave * 1.3 + i * 0.9) * 3; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + sw - 1, p.y + 9); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - sw + 1, p.y - 8); }
    ctx.stroke(); ctx.lineCap = 'butt';
    for (let i = 0; i < N; i++) { const p = seg(i), last = i === N - 1; g.ellipse(p.x, p.y, last ? 6.4 : 5, last ? 5.6 : 4.6, i % 2 ? g.shade(col, 0.82) : col); }
    const h = seg(N - 1);
    g.ellipse(h.x + 2.5, h.y - 1, 1.3, 1.3, hunting ? '#ff3030' : '#ffd24a'); g.ellipse(h.x + 2.5, h.y + 2, 1.1, 1.1, hunting ? '#ff3030' : '#ffd24a');
    ctx.strokeStyle = '#2a1a16'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h.x + 5, h.y - 1); ctx.quadraticCurveTo(h.x + 10, h.y - 4, h.x + 12, h.y + 2); ctx.moveTo(h.x + 5, h.y + 3); ctx.quadraticCurveTo(h.x + 10, h.y + 7, h.x + 12, h.y + 3); ctx.stroke();   // mandibles
    ctx.strokeStyle = '#3a2420'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(h.x + 3, h.y - 4); ctx.lineTo(h.x + 12, h.y - 11); ctx.moveTo(h.x + 4, h.y - 3); ctx.lineTo(h.x + 14, h.y - 7); ctx.stroke();   // antennae
  }
});
