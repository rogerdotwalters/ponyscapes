'use strict';
/* CLIENT - the mini map, upper right: the land right around you in the same isometric view as the game (what is up-screen in the game is up on the map), with you,
 * your home, the village, your ponies and where your quests point. It borrows the terrain image the big Map keeps (MapUI._terrain), so it costs almost nothing.
 * Tap / click it (or press - on a controller) to open the big Map. */
const MINI_RADIUS = 20;                       // tiles from you to the edge of the mini map
const MINI_EVERY_MS = 120;

class MiniMap {
  constructor({ canvas, game, mapUI, bus }) {
    this.canvas = canvas; this.game = game; this.mapUI = mapUI; this.since = 1e9;
    canvas.addEventListener('pointerdown', e => { e.preventDefault(); bus.emit('toggleMap'); });
    canvas.title = 'Mini map: click for the big map';
  }

  tick(frameMs) {
    this.since += frameMs;
    if (this.since < MINI_EVERY_MS) return;
    this.since = 0;
    this.draw();
  }

  draw() {
    const g = this.game, canvas = this.canvas;
    if (!g.local || !g.worldMap || !g.worldMap.terrain || canvas.hidden) return;
    const box = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2), size = Math.round(box.width * dpr);
    if (size < 16) return;
    if (canvas.width !== size || canvas.height !== size) { canvas.width = canvas.height = size; }
    const ctx = canvas.getContext('2d'), mid = size / 2;
    const me = g.grid ? Object.assign({}, g.local, g.outsidePosition()) : g.local;
    const tilePx = size / (2 * MINI_RADIUS + 1), K1 = 1, K2 = 0.5;
    ctx.fillStyle = '#1f4f73'; ctx.fillRect(0, 0, size, size);
    const layer = this.mapUI._terrain(me.x, me.y), L = AREA_MAP_LAYER_RADIUS;
    ctx.save(); ctx.translate(mid, mid); ctx.transform(K1, K2, -K1, K2, 0, 0); ctx.scale(tilePx / AREA_MAP_PX, tilePx / AREA_MAP_PX);
    ctx.drawImage(layer.canvas, -((me.x - layer.cx + L + 0.5) * AREA_MAP_PX), -((me.y - layer.cy + L + 0.5) * AREA_MAP_PX));
    ctx.restore();
    const toMap = (wx, wy) => { const dx = (wx - me.x) * tilePx, dy = (wy - me.y) * tilePx; return [mid + (dx - dy) * K1, mid + (dx + dy) * K2]; };
    const inside = (x, y) => x > 4 && y > 4 && x < size - 4 && y < size - 4;
    const u = size / 150;                                                  // (marks scale with the map)

    const [tx, ty] = toMap(Waypoints.TOWN.x, Waypoints.TOWN.y);          // the village: a star, or an arrow on the edge pointing the way
    if (inside(tx, ty)) { ctx.fillStyle = '#ffe9a8'; ctx.strokeStyle = '#6b3d1c'; ctx.lineWidth = 1.2 * u; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 2.6 : 6) * u; ctx.lineTo(tx + Math.cos(a) * r, ty + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else MapUI.edgeArrow(ctx, mid, tx, ty, '#e3a92b', '');
    const H = Village.home, [hx, hy] = toMap((H.x0 + H.x1 + 1) / 2, (H.y0 + H.y1 + 1) / 2);      // your home
    if (inside(hx, hy)) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#6b3d1c'; ctx.lineWidth = 1.2 * u; ctx.fillRect(hx - 4 * u, hy - 2 * u, 8 * u, 6 * u); ctx.strokeRect(hx - 4 * u, hy - 2 * u, 8 * u, 6 * u); ctx.fillStyle = '#b5482f'; ctx.beginPath(); ctx.moveTo(hx - 5 * u, hy - 2 * u); ctx.lineTo(hx, hy - 6 * u); ctx.lineTo(hx + 5 * u, hy - 2 * u); ctx.closePath(); ctx.fill(); }
    for (const pet of g.pets) {                                            // your ponies
      const [x, y] = toMap(pet.x, pet.y); if (!inside(x, y)) continue;
      ctx.fillStyle = pet.gentling ? '#ffd24a' : (PONY_KIND_COLORS[pet.type] || '#f48fb1'); ctx.strokeStyle = '#1b2a3a'; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(x, y, 3 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const wp of Waypoints.collect(g).filter(w => w.group === 'quest')) {     // where your quests point
      const [x, y] = toMap(wp.x, wp.y);
      if (!inside(x, y)) { MapUI.edgeArrow(ctx, mid, x, y, wp.color, ''); continue; }
      ctx.fillStyle = wp.color; ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(x, y, 3.6 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const fx = Math.cos(me.facing), fy = Math.sin(me.facing);                // you, pointing the way you face
    ctx.save(); ctx.translate(mid, mid); ctx.rotate(Math.atan2((fx + fy) * K2, (fx - fy) * K1));
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b3d73'; ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.moveTo(7 * u, 0); ctx.lineTo(-4.5 * u, -5 * u); ctx.lineTo(-2 * u, 0); ctx.lineTo(-4.5 * u, 5 * u); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
}
