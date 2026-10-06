'use strict';
/* CLIENT - creature sprite: birds. One drawer, several birds: sprite.variant = 'chicken' | 'duck' | 'owl'. */
CreatureSprites.register({
  id: 'bird',
  draw(s, { phase, speed, now, sprite, seed }) {
    const g = s.g, ctx = g.ctx, v = sprite.variant || 'chicken', walk = speed > 0.2;
    const hop = walk ? Math.abs(Math.sin(phase * 1.4)) * 2 : 0, peck = !walk && Math.sin(now / 700 + seed) > 0.8 ? 3 : 0;
    g.ellipse(0, 2, 8, 3.2, 'rgba(0,0,0,.25)');
    if (v === 'owl') {                                                       // upright, round-headed, big eyes, ear tufts, no gait
      const bob = Math.sin(now / 900 + seed) * 0.6;
      g.ellipse(0, -9 - bob, 6.4, 8.4, '#8a6f4d'); g.ellipse(1, -7 - bob, 4, 5.6, '#d9c7a3');           // body + pale chest
      g.ellipse(-3, -8 - bob, 2.2, 6, '#6e5639');                                                        // wing
      g.ellipse(1, -17 - bob, 6, 5.6, '#97795a');                                                        // head
      g.polygon([-3.5, -21 - bob, -2, -25 - bob, -0.2, -21 - bob], '#6e5639'); g.polygon([2.2, -21 - bob, 4, -25 - bob, 5.4, -21 - bob], '#6e5639');   // ear tufts
      g.ellipse(-1.4, -17 - bob, 2.6, 2.6, '#f6e7b4'); g.ellipse(3.6, -17 - bob, 2.6, 2.6, '#f6e7b4'); g.ellipse(-1.4, -17 - bob, 1.1, 1.4, '#2a1c14'); g.ellipse(3.6, -17 - bob, 1.1, 1.4, '#2a1c14');
      g.polygon([0.4, -15.4 - bob, 1.2, -13 - bob, 2, -15.4 - bob], '#e0a030');                          // beak
      ctx.strokeStyle = '#c9902a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-1.5, -2); ctx.lineTo(-1.5, 0); ctx.moveTo(2.5, -2); ctx.lineTo(2.5, 0); ctx.stroke();
      return;
    }
    const duck = v === 'duck', body = duck ? '#8b6b3e' : '#f4f0e6', wing = duck ? '#6f5430' : '#e2dac7', beak = duck ? '#f2c230' : '#f0a830';
    ctx.strokeStyle = '#e0a030'; ctx.lineWidth = 1.5; ctx.beginPath();                                    // legs
    const leg = walk ? Math.sin(phase * 1.6) * 2 : 0; ctx.moveTo(-1, -4 - hop); ctx.lineTo(-1 + leg, 0); ctx.moveTo(2, -4 - hop); ctx.lineTo(2 - leg, 0); ctx.stroke();
    g.polygon([-7, -9 - hop, -12, duck ? -11 - hop : -15 - hop, -6, -12 - hop], duck ? '#6f5430' : '#e8e1cf');   // tail
    g.ellipse(0, -8 - hop, 7.4, 5.6, body); g.ellipse(-1.2, -8 - hop, 4.4, 3.2, wing);                       // body + wing
    const hx = 6 + peck * 0.6, hy = -14 - hop + peck;
    g.ellipse(hx, hy, 3.6, 3.6, duck ? '#2f6b4b' : body);                                                      // head
    if (duck) g.ellipse(hx - 1, hy + 3.4, 3.4, 1, '#ffffff');                                                 // white neck ring
    else { g.ellipse(hx - 0.4, hy - 4, 1.4, 2, '#d93a2f'); g.ellipse(hx + 1, hy - 3.6, 1.3, 1.8, '#d93a2f'); g.ellipse(hx + 2, hy + 3, 1.2, 1.8, '#d93a2f'); }   // comb + wattle
    g.polygon([hx + 2.8, hy - 0.8, hx + (duck ? 8 : 6.2), hy + 0.6, hx + 2.8, hy + 1.6], beak);                // beak
    g.ellipse(hx + 1.2, hy - 0.8, 0.8, 0.8, '#241a14');
  }
});
