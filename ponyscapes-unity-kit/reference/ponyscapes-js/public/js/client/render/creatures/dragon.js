'use strict';
/* CLIENT - creature sprite: dragon. One drawing for every dragon: the data's scale and colour make it a whelp, a young dragon, a dragon, an elder or a boss. */
CreatureSprites.register({
  id: 'dragon',
  draw(s, { animal, phase, speed, sprite, hunting, now }) {
    const g = s.g, ctx = g.ctx, col = sprite.color || '#4f9a5a', dark = g.shade(col, 0.66), light = g.shade(col, 1.3), swing = speed > 0.2 ? Math.sin(phase) * 3.5 : 0, bob = speed > 0.2 ? Math.abs(Math.sin(phase)) * 1.2 : Math.sin(now / 700) * 0.6;
    const flap = Math.sin(now / (hunting ? 140 : 260)) * 0.5;
    g.ellipse(0, 3, 24, 7, 'rgba(0,0,0,.3)');
    g.polygon([-2, -26 - bob, -10, -50 - bob + flap * 14, -24, -40 - bob, -28 - flap * 6, -30 - bob, -12, -24 - bob], dark);                 // far wing
    ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();                                                       // far legs
    [[-9, swing], [8, -swing]].forEach(([x, sw]) => { ctx.moveTo(x, -10 - bob); ctx.lineTo(x + sw, 0); }); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-13, -20 - bob); ctx.bezierCurveTo(-26, -16, -34, -10 + Math.sin(now / 500) * 3, -42, -14); ctx.lineTo(-40, -9); ctx.bezierCurveTo(-32, -3, -22, -8, -13, -12 - bob); ctx.closePath(); ctx.fill();   // tail
    g.polygon([-42, -14, -49, -17, -44, -9], dark);
    g.ellipse(0, -20 - bob, 17, 9.5, col); g.ellipse(3, -16 - bob, 12, 4.6, light);                                                          // body + pale belly
    for (let i = 0; i < 5; i++) g.polygon([-12 + i * 6, -27.5 - bob, -9 + i * 6, -33 - bob, -6 + i * 6, -27.5 - bob], dark);                  // back spikes
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();                                                        // near legs
    [[12, -swing], [-6, swing]].forEach(([x, sw]) => { ctx.moveTo(x, -10 - bob); ctx.lineTo(x + sw, 0); }); ctx.stroke(); ctx.lineCap = 'butt';
    g.polygon([9, -24 - bob, 14, -26 - bob, 23, -37 - bob, 18, -39 - bob], col);                                                              // neck
    g.ellipse(23, -37 - bob, 7.5, 4.8, col); g.polygon([28, -39 - bob, 37, -36 - bob, 28, -33 - bob], light);                                 // head + snout
    g.polygon([17, -41 - bob, 14, -50 - bob, 21, -42 - bob], '#e8dcc0'); g.polygon([22, -42 - bob, 21, -51 - bob, 26, -42 - bob], '#e8dcc0');    // horns
    g.ellipse(25, -39 - bob, 1.6, 1.6, hunting ? '#ff3a1a' : '#ffd24a');
    g.polygon([2, -27 - bob, 8, -52 - bob + flap * 14, 22, -43 - bob, 24 + flap * 6, -32 - bob, 10, -25 - bob], light);                       // near wing
    ctx.strokeStyle = dark; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(2, -27 - bob); ctx.lineTo(18, -41 - bob); ctx.moveTo(4, -26 - bob); ctx.lineTo(23, -34 - bob); ctx.stroke();
    if (hunting && (now % 900) < 380) {                                                                                                       // a lick of fire
      ctx.fillStyle = 'rgba(255,150,40,.92)'; ctx.beginPath(); ctx.moveTo(36, -36 - bob); ctx.lineTo(54, -41 - bob); ctx.lineTo(48, -36 - bob); ctx.lineTo(57, -32 - bob); ctx.lineTo(36, -33 - bob); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,120,.9)'; ctx.beginPath(); ctx.moveTo(36, -35.5 - bob); ctx.lineTo(46, -37 - bob); ctx.lineTo(36, -34 - bob); ctx.closePath(); ctx.fill();
    }
  }
});
