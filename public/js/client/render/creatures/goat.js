'use strict';
/* CLIENT - creature sprite: goat. Sure-footed, horned and bearded. */
CreatureSprites.register({
  id: 'goat',
  draw(s, { phase, speed, now, seed }) {
    const g = s.g, ctx = g.ctx, walk = speed > 0.2, swing = walk ? Math.sin(phase) * 2.8 : 0, bob = walk ? Math.abs(Math.sin(phase)) * 0.9 : Math.sin(now / 900 + seed) * 0.4;
    g.ellipse(0, 3, 14, 5, 'rgba(0,0,0,.25)');
    ctx.strokeStyle = '#6b5a48'; ctx.lineWidth = 2.2; ctx.beginPath();
    [[-7, swing], [-3.5, -swing], [4, -swing], [8, swing]].forEach(([x, w]) => { ctx.moveTo(x, -9); ctx.lineTo(x + w, 0); }); ctx.stroke();
    g.polygon([-11, -14 - bob, -14, -17 - bob, -10.5, -12 - bob], '#d6cdbb');                                // stubby tail
    g.ellipse(-1, -13 - bob, 11.5, 6.4, '#e4dccb'); g.ellipse(0, -10.4 - bob, 8.5, 3, '#f3eee3');             // body + belly
    g.ellipse(-4, -15.4 - bob, 6, 3, '#d6cdbb');                                                                // shoulder shading
    g.ellipse(11, -18 - bob, 4.4, 4.4, '#e4dccb'); g.ellipse(14.4, -16.6 - bob, 3.4, 2.5, '#f3eee3');          // head + muzzle
    g.ellipse(16.4, -16.4 - bob, 1, 0.8, '#3a2a22'); g.ellipse(12.2, -19 - bob, 0.9, 1.2, '#241a14');         // nose + eye
    ctx.strokeStyle = '#8a7a63'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(9.6, -22 - bob); ctx.quadraticCurveTo(6, -29 - bob, 3, -27 - bob); ctx.moveTo(11.8, -22.4 - bob); ctx.quadraticCurveTo(10, -30 - bob, 6.4, -28.4 - bob); ctx.stroke();   // horns
    g.polygon([8.4, -20 - bob, 7, -24 - bob, 9.4, -22 - bob], '#d6cdbb');                                       // ear
    g.polygon([14, -14 - bob, 13.2, -9.4 - bob, 15.2, -13.6 - bob], '#f3eee3');                                 // beard
  }
});
