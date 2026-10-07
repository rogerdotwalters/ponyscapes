'use strict';
/* CLIENT - creature sprite: sheep */
CreatureSprites.register({
  id: 'sheep',
  draw(s, { phase, speed, now }) {
    const g = s.g, ctx = g.ctx, swing = speed > 0.2 ? Math.sin(phase) * 2.5 : 0, bob = speed > 0.2 ? Math.abs(Math.sin(phase)) * 1 : Math.sin(now / 900) * 0.4;
    g.ellipse(0, 3, 15, 5.5, 'rgba(0,0,0,.25)');
    ctx.strokeStyle = '#d6c09c'; ctx.lineWidth = 2.4; ctx.beginPath();                                // pale legs ...
    [[-7, swing], [-3, -swing], [4, -swing], [8, swing]].forEach(([x, s]) => { ctx.moveTo(x, -8); ctx.lineTo(x + s, -1.5); });
    ctx.stroke();
    [[-7, swing], [-3, -swing], [4, -swing], [8, swing]].forEach(([x, s]) => g.ellipse(x + s, -0.8, 1.6, 1.2, '#3a3330'));   // ... on dark hooves
    for (const [x, y, r, c] of [[-8, -13, 7, '#e3d2b2'], [8, -13, 7, '#e3d2b2'], [0, -11, 8, '#d9c7a6'], [-5, -17, 7.5, '#f0e2c6'], [5, -17, 7.5, '#f0e2c6'], [0, -19, 7, '#f6ecd6']]) g.ellipse(x, y - bob, r, r * 0.88, c);
    g.ellipse(13, -15 - bob, 5.2, 4.6, '#f4e9d8'); g.ellipse(10.5, -20 - bob, 3.4, 2.6, '#f0e2c6');   // pale face + woolly topknot
    g.ellipse(8.5, -17 - bob, 2.2, 1.2, '#e9a3a0');                                                   // pink ear
    g.ellipse(13, -16 - bob, 1.1, 1.1, '#2a1c14'); g.ellipse(17.4, -14 - bob, 1, 0.8, '#d98c8c');      // eye, pink nose
  }
});
