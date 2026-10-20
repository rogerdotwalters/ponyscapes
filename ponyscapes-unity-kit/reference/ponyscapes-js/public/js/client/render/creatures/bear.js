'use strict';
/* CLIENT - creature sprite: bear (also the boss Cave Bear, just bigger and darker) */
CreatureSprites.register({
  id: 'bear',
  draw(s, { phase, speed, sprite, hunting }) {
    const g = s.g, ctx = g.ctx, col = sprite.color || '#5a3a22', dark = g.shade(col, 0.68), swing = speed > 0.2 ? Math.sin(phase) * 3.5 : 0, bob = speed > 0.2 ? Math.abs(Math.sin(phase)) * 1.2 : 0;
    g.ellipse(0, 3, 24, 7, 'rgba(0,0,0,.3)');
    ctx.fillStyle = dark; for (const [x, sw] of [[-12, swing], [-5, -swing]]) { ctx.fillRect(x - 3, -12 - bob, 6.5, 12); g.ellipse(x + sw * 0.3, 0, 4.4, 2.4, dark); }      // far legs
    g.ellipse(0, -21 - bob, 20, 11.5, col); g.ellipse(-5, -29 - bob, 9.5, 6, col); g.ellipse(1, -15 - bob, 13, 4.5, g.shade(col, 1.12));   // body, shoulder hump, belly
    ctx.fillStyle = col; for (const [x, sw] of [[11, -swing], [18, swing]]) { ctx.fillRect(x - 3.4, -13 - bob, 7, 13); g.ellipse(x + sw * 0.3 + 1, 0, 5, 2.6, dark); }          // near legs + paws
    g.ellipse(-19, -22 - bob, 3.4, 3.4, col);                                                                                                  // stub tail
    g.ellipse(24, -24 - bob, 9, 8, col); g.ellipse(31, -21 - bob, 5.4, 4, '#cdb08a'); g.ellipse(34.5, -22.5 - bob, 1.9, 1.5, '#1c1410');     // head, muzzle, nose
    g.ellipse(20, -31 - bob, 3, 3, dark); g.ellipse(27, -31.5 - bob, 3, 3, dark);                                                              // ears
    g.ellipse(27.5, -26 - bob, 1.5, 1.5, hunting ? '#ff4a2a' : '#140e0a');
    if (hunting) { ctx.strokeStyle = '#f2ead8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(31, -18 - bob); ctx.lineTo(32, -14.5 - bob); ctx.moveTo(34, -18.5 - bob); ctx.lineTo(34.5, -15 - bob); ctx.stroke(); }
  }
});
