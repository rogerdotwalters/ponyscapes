'use strict';
/* CLIENT - creature sprite: bat. Flutters a little above the ground. */
CreatureSprites.register({
  id: 'bat',
  draw(s, { sprite, now, speed, hunting }) {
    const g = s.g, ctx = g.ctx, col = sprite.color || '#3a2f4a', flap = Math.sin(now / 70), lift = 17 + Math.sin(now / 400) * 2 + (speed > 0.3 ? 2 : 0);
    g.ellipse(0, 3, 8, 3, 'rgba(0,0,0,.22)');
    for (const side of [-1, 1]) {
      const tipY = -lift - 10 * flap - 6, back = side * 4;
      g.polygon([side * 2, -lift - 1, side * 15 + back, tipY, side * 18 + back, tipY + 8, side * 10, -lift + 3, side * 6, -lift + 6, side * 2, -lift + 3], side < 0 ? g.shade(col, 0.8) : col);
    }
    g.ellipse(0, -lift, 4.6, 5.4, col); g.ellipse(2.2, -lift - 5.2, 3.4, 3.2, col);
    g.polygon([0.4, -lift - 7, 1.4, -lift - 12, 3, -lift - 7.4], col); g.polygon([3, -lift - 7.6, 5, -lift - 12, 5.4, -lift - 7], col);
    g.ellipse(3.6, -lift - 5.6, 0.9, 0.9, hunting ? '#ff3030' : '#e84a4a');
  }
});
