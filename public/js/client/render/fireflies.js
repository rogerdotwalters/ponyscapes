'use strict';
/* CLIENT - fireflies. After dark, small swarms drift over the grass and blink, painted in screen space over the night (drawn with the weather). Nothing is sent: where a swarm lives comes from
 * a hash of the world cell it hangs over, so everyone sees the same ones in the same places. They keep to the grass of the overworld, and stay home in winter and in the rain. */
const FIREFLY_CELL = 5;                                                            // tiles: one swarm may live in each cell of this size
class Fireflies {
  constructor(game) { this.game = game; }

  /** How much of the night they are out for, 0..1 (none by day, in caves and rooms, in winter or heavy rain). */
  strength() {
    const g = this.game;
    if (!g.map || g.map.kind !== 'world') return 0;
    const dark = 1 - DayCycle.daylight(g.hour()), rain = (typeof Weather !== 'undefined' && Weather.view && Weather.view.rain) || 0;
    if (Seasons.at(g.clockTick).season.id === 'winter') return 0;
    return clamp((dark - 0.55) / 0.3, 0, 1) * clamp(1 - rain * 1.5, 0, 1);
  }

  /** Paint this frame's fireflies. `ctx` is in screen pixels; `camera` is the game's camera (cam.x / y / w / h in world pixels, scale). */
  draw(ctx, w, h, nowMs, camera) {
    const k = this.strength();
    if (k <= 0.01) return;
    const g = this.game, map = g.map, s = camera.scale, cap = CONFIG.sim.night.fireflies, t = nowMs / 1000;
    const tiles = camera.visibleTiles(), C = FIREFLY_CELL;
    const toScreen = (wx, wy, lift) => [(isoX(wx, wy) - camera.x + camera.w / 2) * s, (isoY(wx, wy) - lift - camera.y + camera.h / 2) * s];
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
    let drawn = 0;
    for (let cy = Math.floor(tiles.ty0 / C); cy <= Math.floor(tiles.ty1 / C) && drawn < cap; cy++) for (let cx = Math.floor(tiles.tx0 / C); cx <= Math.floor(tiles.tx1 / C) && drawn < cap; cx++) {
      const rng = mulberry32((cx * 73856093) ^ (cy * 19349663) ^ 0x51f1);
      if (rng() > 0.4) continue;                                                   // most cells have none
      const hx = (cx + rng()) * C, hy = (cy + rng()) * C, tile = map.tile(Math.floor(hx), Math.floor(hy));
      if (tile !== TILE.GRASS) continue;
      const flies = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < flies; i++) {
        const sp = 0.25 + rng() * 0.35, ph = rng() * 6.28, rx = 0.8 + rng() * 1.8, ry = 0.8 + rng() * 1.8, bl = 0.5 + rng() * 0.9, lift = 10 + rng() * 22;
        const wx = hx + Math.sin(t * sp + ph) * rx + Math.sin(t * sp * 2.3 + ph * 1.7) * 0.4, wy = hy + Math.cos(t * sp * 0.9 + ph) * ry;
        const blink = Math.max(0, Math.sin(t * bl * 2.2 + ph * 3)) ** 2;           // lit for a moment, dark for the next
        const a = blink * k;
        if (a < 0.04) continue;
        const [sx, sy] = toScreen(wx, wy, lift + Math.sin(t * 1.3 + ph) * 4);
        if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
        ctx.fillStyle = `rgba(190,255,90,${(0.16 * a).toFixed(3)})`; ctx.beginPath(); ctx.arc(sx, sy, 7 * s, 0, 6.2832); ctx.fill();
        ctx.fillStyle = `rgba(255,250,170,${(0.85 * a).toFixed(3)})`; ctx.beginPath(); ctx.arc(sx, sy, 1.7 * s, 0, 6.2832); ctx.fill();
        drawn++;
      }
    }
    ctx.restore();
  }
}
