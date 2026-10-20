'use strict';
/* CLIENT - creature sprite: wild boar. Low and bulky with a bristled back, tusks and an angry eye. */
CreatureSprites.register({
  id: 'boar',
  draw(s, { phase, speed, now, sprite, seed, hunting }) {
    const g = s.g, ctx = g.ctx, color = sprite.color || '#6b4a3a', walk = speed > 0.2, swing = walk ? Math.sin(phase) * 2.6 : 0, bob = walk ? Math.abs(Math.sin(phase)) * 0.9 : Math.sin(now / 700 + seed) * 0.4;
    g.ellipse(0, 3, 15, 5.4, 'rgba(0,0,0,.28)');
    ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 2.8; ctx.beginPath();
    [[-8, swing], [-4, -swing], [5, -swing], [9, swing]].forEach(([x, w]) => { ctx.moveTo(x, -7); ctx.lineTo(x + w, 0); }); ctx.stroke();
    g.ellipse(-2, -11 - bob, 12.5, 7.6, color); g.ellipse(4, -9 - bob, 9, 4, g.shade(color, 1.18));            // heavy body + lighter flank
    ctx.strokeStyle = g.shade(color, 0.6); ctx.lineWidth = 1.4; ctx.beginPath();                                // a crest of bristles along the back
    for (let i = -9; i <= 7; i += 2.6) { ctx.moveTo(i, -17.4 - bob); ctx.lineTo(i + 0.8, -21 - bob); } ctx.stroke();
    ctx.strokeStyle = g.shade(color, 0.7); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-14, -12 - bob); ctx.quadraticCurveTo(-18, -14 - bob, -17, -9 - bob); ctx.stroke();   // little curly tail
    g.ellipse(12, -11 - bob, 6, 5.6, g.shade(color, 0.92)); g.ellipse(17.4, -9 - bob, 3.6, 3, g.shade(color, 1.3)); g.ellipse(19.4, -9.6 - bob, 1, 1.4, '#2a1c14');   // head, snout, nostril
    g.polygon([15.4, -7.4 - bob, 19.4, -12 - bob, 17.2, -7 - bob], '#f3eee3');                                  // tusk
    g.polygon([8.4, -15 - bob, 9.6, -19 - bob, 12, -15.4 - bob], g.shade(color, 0.75));                        // ear
    g.ellipse(13, -12.4 - bob, 1, 1, hunting ? '#ff4d4d' : '#1a1410');                                           // eye
  }
});
