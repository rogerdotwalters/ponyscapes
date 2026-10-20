'use strict';
/* CLIENT - creature sprite: deer */
CreatureSprites.register({
  id: 'deer',
  draw(s, { phase, speed, seed, sprite }) {
    const g = s.g, ctx = g.ctx, swing = speed > 0.2 ? Math.sin(phase) * 4 : 0, bob = speed > 0.2 ? Math.abs(Math.sin(phase)) * 1.2 : 0;
    g.ellipse(0, 3, 18, 6.5, 'rgba(0,0,0,.25)');
    ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath();   // legs
    [[9, swing], [5, -swing], [-8, -swing], [-12, swing]].forEach(([x, s]) => { ctx.moveTo(x, -14 - bob); ctx.lineTo(x + s, 0); });
    ctx.stroke(); ctx.lineCap = 'butt';
    g.ellipse(0, -19 - bob, 15, 7.5, (sprite.color || '#a8794a')); g.ellipse(1, -16 - bob, 11, 4, '#c9a273');   // body + belly
    g.ellipse(-15, -22 - bob, 3.2, 4, '#f3efe6');                                             // white tail
    for (const [x, y] of [[-4, -23], [3, -24], [-9, -20]]) g.ellipse(x, y - bob, 1.3, 1.3, 'rgba(255,255,255,.7)');
    g.polygon([8, -24 - bob, 13, -24 - bob, 21, -34 - bob, 17, -35 - bob], (sprite.color || '#a8794a'));        // neck
    g.ellipse(21, -34 - bob, 6, 3.8, (sprite.color || '#a8794a')); g.ellipse(26, -33 - bob, 2.4, 2, '#3a2a1e'); // head + muzzle
    g.ellipse(18, -37 - bob, 1.6, 3, '#8d6238'); g.ellipse(23.5, -35.5 - bob, 1, 1, '#1a120c');
    if (seed % 2 === 0 || sprite.antlers) {                                                                     // stags carry antlers
      ctx.strokeStyle = '#d9c9a6'; ctx.lineWidth = 1.7; ctx.beginPath();
      ctx.moveTo(19, -37 - bob); ctx.lineTo(17, -46 - bob); ctx.moveTo(18, -42 - bob); ctx.lineTo(22, -46 - bob); ctx.moveTo(17.5, -45 - bob); ctx.lineTo(14, -48 - bob);
      if (sprite.antlers === 'great') { ctx.moveTo(19, -37 - bob); ctx.lineTo(20, -50 - bob); ctx.moveTo(19.5, -44 - bob); ctx.lineTo(25, -49 - bob); ctx.moveTo(20, -50 - bob); ctx.lineTo(24, -55 - bob); ctx.moveTo(17.5, -45 - bob); ctx.lineTo(11, -47 - bob); }
      ctx.stroke();
    }
  }
});
