'use strict';
/* CLIENT - creature sprite: beastman. A horned, shaggy brute that walks on two legs with a club. */
CreatureSprites.register({
  id: 'beastman',
  draw(s, { phase, speed, sprite, hunting, animal, now }) {
    const g = s.g, ctx = g.ctx, fur = sprite.color || '#6b4a2a', dark = g.shade(fur, 0.68), swing = speed > 0.2 ? Math.sin(phase * 1.1) * 4 : 0, bob = speed > 0.2 ? Math.abs(Math.sin(phase * 1.1)) * 1.4 : Math.sin(now / 600) * 0.5;
    g.ellipse(0, 3, 12, 4.5, 'rgba(0,0,0,.28)');
    ctx.fillStyle = dark; ctx.fillRect(-6 + swing * 0.3, -16 - bob, 5.4, 16); ctx.fillRect(1 - swing * 0.3, -16 - bob, 5.4, 16);                  // legs
    g.ellipse(-3 + swing * 0.3, 0, 4.2, 2, '#241812'); g.ellipse(4 - swing * 0.3, 0, 4.2, 2, '#241812');
    g.roundRect(-8.5, -33 - bob, 17, 20, 5); ctx.fillStyle = fur; ctx.fill(); g.ellipse(0, -22 - bob, 6.5, 6, g.shade(fur, 1.15));              // torso + chest
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(-8.5, -15 - bob, 17, 5);                                                                           // loincloth
    ctx.strokeStyle = fur; ctx.lineWidth = 4.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-8, -30 - bob); ctx.lineTo(-12, -20 - bob - swing * 0.4); ctx.stroke();   // back arm
    const club = hunting ? -0.9 + Math.sin(now / 160) * 0.5 : 0.35;                                                                            // the club swings when it attacks
    ctx.beginPath(); ctx.moveTo(8, -30 - bob); ctx.lineTo(13, -21 - bob); ctx.stroke();
    ctx.save(); ctx.translate(13, -21 - bob); ctx.rotate(club); ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2, -20); ctx.stroke(); g.ellipse(2.4, -22, 4.4, 5.4, '#6a4a28'); ctx.restore(); ctx.lineCap = 'butt';
    g.ellipse(2, -39 - bob, 7, 7.2, fur); g.ellipse(8, -37 - bob, 4.4, 3.4, g.shade(fur, 1.22)); g.ellipse(10.4, -37.6 - bob, 1.2, 1, '#1a100c');          // head + snout
    ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-1, -44 - bob); ctx.quadraticCurveTo(-7, -49 - bob, -5, -54 - bob); ctx.moveTo(5, -45 - bob); ctx.quadraticCurveTo(11, -49 - bob, 8, -55 - bob); ctx.stroke(); ctx.lineCap = 'butt';   // horns
    g.ellipse(5.4, -40.6 - bob, 1.1, 1.1, hunting ? '#ff3a1a' : '#e8c24a');
  }
});
