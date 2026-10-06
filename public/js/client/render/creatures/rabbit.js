'use strict';
/* CLIENT - creature sprite: rabbit */
CreatureSprites.register({
  id: 'rabbit',
  draw(s, { phase, speed }) {
    const g = s.g, hop = speed > 0.2 ? Math.abs(Math.sin(phase * 1.6)) * 6 : 0;
    g.ellipse(0, 2, 9, 4, 'rgba(0,0,0,.25)');
    g.ellipse(-3, -6 - hop, 6, 5.5, '#8f7456');                              // haunch
    g.ellipse(1, -7 - hop, 8, 5.5, '#a98d6c');                               // body
    g.ellipse(-9, -8 - hop, 2.4, 2.4, '#f3efe6');                            // tail
    g.ellipse(8, -11 - hop, 4.4, 3.8, '#a98d6c');                            // head
    g.ellipse(6, -17 - hop, 1.6, 5, '#a98d6c'); g.ellipse(9.5, -17 - hop, 1.6, 5, '#8f7456');   // ears
    g.ellipse(6, -17 - hop, 0.7, 3.2, '#e8b3b3');
    g.ellipse(10, -11.5 - hop, 1, 1, '#241a14'); g.ellipse(12, -10 - hop, 1, 0.8, '#d98a8a');
  }
});
