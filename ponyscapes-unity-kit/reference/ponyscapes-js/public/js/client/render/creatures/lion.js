'use strict';
/* CLIENT - creature sprites: lion, and the manticore (a lion with bat wings and a scorpion's tail) */
const LionBody = {
  draw(s, { phase, speed, sprite, hunting, now }, manticore) {
    const g = s.g, ctx = g.ctx, col = sprite.color || '#c9a24a', dark = g.shade(col, 0.72), swing = speed > 0.2 ? Math.sin(phase * 1.2) * 4.5 : 0, bob = speed > 0.2 ? Math.abs(Math.sin(phase * 1.2)) * 1.5 : 0;
    g.ellipse(0, 3, 22, 6.5, 'rgba(0,0,0,.28)');
    if (manticore) {                                                                         // bat-like wings behind the shoulders
      const flap = Math.sin(now / 260) * 0.2;
      for (const side of [-1, 1]) g.polygon([2 + side * 2, -29 - bob, -8 + side * 4, -52 - bob + flap * 20, -22 + side * 3, -44 - bob, -26 + side * 3, -30 - bob, -13, -26 - bob], side < 0 ? '#7a2e1c' : '#a3452a');
    }
    ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
    [[12, -swing], [7, swing], [-10, swing], [-14, -swing]].forEach(([x, sw]) => { ctx.moveTo(x, -13 - bob); ctx.lineTo(x + sw, 0); }); ctx.stroke(); ctx.lineCap = 'butt';
    g.ellipse(-1, -19 - bob, 18, 8.5, col); g.ellipse(1, -15 - bob, 13, 3.6, g.shade(col, 1.15));
    ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.beginPath();                              // tail
    if (manticore) {                                                                         // a scorpion's tail arching over the back, ending in a sting
      ctx.moveTo(-17, -22 - bob); ctx.bezierCurveTo(-30, -26 - bob, -32, -48 - bob, -16, -46 - bob); ctx.stroke(); g.polygon([-16, -49 - bob, -9, -45 - bob, -15, -42.5 - bob], '#3a1f1a');
      for (const [x, y] of [[-27, -30], [-29, -40], [-24, -46]]) g.ellipse(x, y - bob, 2.1, 2.1, dark);
    } else { ctx.moveTo(-17, -22 - bob); ctx.bezierCurveTo(-26, -22 - bob, -26, -33 - bob, -23, -34 - bob); ctx.stroke(); g.ellipse(-23, -35 - bob, 3.2, 3.6, dark); }
    g.ellipse(19, -28 - bob, 11.5, 11.5, manticore ? '#5a2a1a' : g.shade(col, 0.62));        // the mane
    g.ellipse(22, -26 - bob, 6.8, 6.2, manticore ? '#e0b48a' : col); g.ellipse(27, -23.5 - bob, 3.8, 2.8, g.shade(col, 1.18)); g.ellipse(30, -24.5 - bob, 1.4, 1.1, '#2a1a14');
    g.ellipse(19, -34 - bob, 2.2, 2.4, dark); g.ellipse(24.5, -26.5 - bob, 1.2, 1.2, hunting ? '#ff3a1a' : '#241810');
    if (hunting) { ctx.strokeStyle = '#f4ecd6'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(27, -22 - bob); ctx.lineTo(28, -19 - bob); ctx.stroke(); }
  }
};
CreatureSprites.register({ id: 'lion', draw(s, info) { LionBody.draw(s, info, false); } });
CreatureSprites.register({ id: 'manticore', draw(s, info) { LionBody.draw(s, info, true); } });
