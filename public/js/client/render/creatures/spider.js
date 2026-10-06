'use strict';
/* CLIENT - creature sprite: spider */
CreatureSprites.register({
  id: 'spider',
  draw(s, { phase, speed, hunting }) {
    const g = s.g, ctx = g.ctx, swing = speed > 0.2 ? Math.sin(phase * 1.4) : 0;
    g.ellipse(0, 3, 24, 9, 'rgba(0,0,0,.28)');
    ctx.strokeStyle = '#1d1624'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
      const reach = 11 + i * 3.5, wob = Math.sin(phase * 1.4 + i * 1.6 + (side > 0 ? 0 : Math.PI)) * (speed > 0.2 ? 3 : 0);
      ctx.moveTo(side * 4, -11); ctx.lineTo(side * (reach * 0.9), -22 - i * 0.8 + wob * 0.4); ctx.lineTo(side * (reach * 1.35), 0 + wob * 0.3);
    }
    ctx.stroke(); ctx.lineCap = 'butt';
    g.ellipse(-5, -12 - Math.abs(swing), 10, 8, '#2b2233'); g.ellipse(-6, -15, 5, 3, 'rgba(120,90,160,.35)');   // abdomen
    g.ellipse(7, -11, 6.5, 5.5, '#352a40');                                                                      // head
    g.ellipse(9.5, -13, 1.7, 1.7, hunting ? '#ff3030' : '#c24a4a'); g.ellipse(6, -13.5, 1.4, 1.4, hunting ? '#ff3030' : '#c24a4a');
    ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(11, -8); ctx.lineTo(13, -4); ctx.moveTo(9, -7); ctx.lineTo(10, -3); ctx.stroke();   // fangs
  }
});
