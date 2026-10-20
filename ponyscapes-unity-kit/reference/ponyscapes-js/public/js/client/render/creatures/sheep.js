'use strict';
/* CLIENT - creature sprite: sheep */
CreatureSprites.register({
  id: 'sheep',
  draw(s, { phase, speed, now }) {
    const g = s.g, ctx = g.ctx, swing = speed > 0.2 ? Math.sin(phase) * 2.5 : 0, bob = speed > 0.2 ? Math.abs(Math.sin(phase)) * 1 : Math.sin(now / 900) * 0.4;
    g.ellipse(0, 3, 15, 5.5, 'rgba(0,0,0,.25)');
    ctx.strokeStyle = '#3b3a3a'; ctx.lineWidth = 2.2; ctx.beginPath();
    [[-7, swing], [-3, -swing], [4, -swing], [8, swing]].forEach(([x, s]) => { ctx.moveTo(x, -8); ctx.lineTo(x + s, 0); });
    ctx.stroke();
    for (const [x, y, r, c] of [[-8, -13, 7, '#e6e1d3'], [8, -13, 7, '#e6e1d3'], [0, -11, 8, '#dcd6c6'], [-5, -17, 7.5, '#f2efe6'], [5, -17, 7.5, '#f2efe6'], [0, -19, 7, '#f7f4ec']]) g.ellipse(x, y - bob, r, r * 0.88, c);
    g.ellipse(13, -15 - bob, 5.2, 4.6, '#3b3a3a'); g.ellipse(10.5, -20 - bob, 3.4, 2.6, '#f2efe6');   // head + woolly forehead
    g.ellipse(9.5, -15 - bob, 1.7, 1.2, '#2a2929'); g.ellipse(14.5, -16 - bob, 1, 1, '#ffffff');
  }
});
