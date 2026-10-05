'use strict';
/* CLIENT - the Map: the land around you, drawn from the terrain function (no chunks are generated for it), with you, your home,
 * stables, your ponies and the X of any treasure map you have read. World north is up.
 *   NEAR  65 tiles across, 4 px per tile: every tree, your ponies, stables.
 *   FAR   260 tiles across, 1 px per tile: the BIOMES, and rings at every 100 tiles out from the village marked with how strong the
 *         animals get there (levels SCALE FROM THE ORIGIN: the farther out, the higher the level and the rarer the ponies). */
const AREA_MAP_RADIUS = 32, AREA_MAP_LAYER_RADIUS = 48, AREA_MAP_PX = 4;
const FAR_MAP_SPAN = 640, FAR_MAP_LAYER = 760, FAR_MAP_STEP = 4, FAR_RING_EVERY = 250;       // the far view shows 640 tiles; its terrain image is a little bigger so you can wander before it is remade
const AREA_COLORS = { [TILE.GRASS]: '#6aa84f', [TILE.DIRT]: '#a98258', [TILE.STONE]: '#a9a59c', [TILE.WATER]: '#2c6b99', [TILE.SAND]: '#dccb94', [TILE.CLAY]: '#b8734a', [TILE.SHALLOW]: '#7bc3dc' };
/** Map colours for grass / dirt by biome (a little stronger than the ground so a biome reads at a glance). */
const BIOME_MAP_COLORS = { meadow: '#6aa84f', forest: '#3f7f3f', wetland: '#3f9a78', dry: '#b3ad55', highland: '#7d9a6c', blossom: '#f0a0c4', crystal: '#9fe0e6', starlit: '#5b5cc0', ember: '#c5552a', clay: '#b8734a', beach: '#dccb94' };

class MapUI {
  constructor({ panel, body, closeButton, game, onTreasure }) {
    this.panel = panel; this.body = body; this.game = game; this.onTreasure = onTreasure; this.layer = null; this.farLayer = null; this.sinceDraw = 1e9; this.canvas = null; this.zoom = 'near';
    closeButton.addEventListener('click', () => this.close());
  }
  get isOpen() { return !this.panel.hidden; }
  open() {
    this.panel.hidden = false; const size = (2 * AREA_MAP_RADIUS + 1) * AREA_MAP_PX;
    this.body.innerHTML = `<div class="mapcontent"><div class="mapwrap"><canvas id="areaMap" width="${size}" height="${size}"></canvas></div><div class="mapside">` +
      '<div class="mapzoom"><button id="zoomNear">Near</button><button id="zoomFar">Far</button></div>' +
      '<div class="maplegend"><span class="you">\u25CF you</span><span class="pet">\u25CF ponies</span><span class="home">\u2302 home</span><span class="stb">\u25A0 stable</span><span class="x">\u2716 treasure</span></div>' +
      '<div class="biomekey" id="biomeKey"></div>' +
      '<div class="mapinfo" id="areaInfo"></div><div class="mapnav"><button id="areaTreasure">Treasure maps</button></div></div></div>';
    this.canvas = this.body.querySelector('#areaMap');
    const t = this.body.querySelector('#areaTreasure'); if (t) t.addEventListener('click', () => this.onTreasure());
    const near = this.body.querySelector('#zoomNear'), far = this.body.querySelector('#zoomFar');
    if (near) near.addEventListener('click', () => this.setZoom('near')); if (far) far.addEventListener('click', () => this.setZoom('far'));
    this.setZoom(this.zoom);
  }
  close() { this.panel.hidden = true; this.canvas = null; }
  setZoom(zoom) {
    this.zoom = zoom; this.sinceDraw = 1e9;
    for (const [id, z] of [['#zoomNear', 'near'], ['#zoomFar', 'far']]) { const b = this.body.querySelector(id); if (b && b.classList) b.classList.toggle('on', z === zoom); }
    const key = this.body.querySelector('#biomeKey');
    if (key) key.innerHTML = zoom === 'far' ? ['blossom', 'crystal', 'starlit', 'ember'].map(b => `<span style="--c:${BIOME_MAP_COLORS[b]}">${BiomeNames[b]}</span>`).join('') : '';
    this.draw();
  }
  tick(frameMs) { if (this.isOpen && (this.sinceDraw += frameMs) > 250) { this.sinceDraw = 0; this.draw(); } }

  /** Terrain colour of a tile, tinted by biome. */
  _color(T, tx, ty) {
    const tile = T.tile(tx, ty);
    if (tile === TILE.GRASS || tile === TILE.DIRT) return BIOME_MAP_COLORS[T.biomeAt(tx, ty, tile)] || AREA_COLORS[tile];
    return AREA_COLORS[tile] || '#6aa84f';
  }

  /** A big terrain image around a centre, re-made only when you wander far from where it was made. */
  _terrain(cx, cy) {
    if (this.layer && Math.hypot(this.layer.cx - cx, this.layer.cy - cy) < 12) return this.layer;
    const R = AREA_MAP_LAYER_RADIUS, px = AREA_MAP_PX, size = (2 * R + 1) * px, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d'), T = this.game.map.terrain, fx = Math.floor(cx), fy = Math.floor(cy);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const tx = fx + dx, ty = fy + dy, tile = T.tile(tx, ty), x = (dx + R) * px, y = (dy + R) * px;
      ctx.fillStyle = this._color(T, tx, ty); ctx.fillRect(x, y, px, px);
      if (tile === TILE.GRASS && T.hasTree(tx, ty, tile)) { ctx.fillStyle = 'rgba(20,60,25,.55)'; ctx.fillRect(x + 1, y + 1, px - 2, px - 2); }
    }
    return (this.layer = { canvas, cx: fx + 0.5, cy: fy + 0.5 });
  }

  /** The zoomed-out terrain: every 4th tile, 1 px each, remade when you have moved 50 tiles. */
  _farTerrain(cx, cy) {
    if (this.farLayer && Math.hypot(this.farLayer.cx - cx, this.farLayer.cy - cy) < 50) return this.farLayer;
    const half = FAR_MAP_LAYER / 2, canvas = document.createElement('canvas');
    canvas.width = canvas.height = FAR_MAP_LAYER;
    const ctx = canvas.getContext('2d'), T = this.game.map.terrain, fx = Math.floor(cx), fy = Math.floor(cy);
    for (let dy = -half; dy < half; dy += FAR_MAP_STEP) for (let dx = -half; dx < half; dx += FAR_MAP_STEP) {
      ctx.fillStyle = this._color(T, fx + dx, fy + dy); ctx.fillRect(dx + half, dy + half, FAR_MAP_STEP, FAR_MAP_STEP);
    }
    return (this.farLayer = { canvas, cx: fx + 0.5, cy: fy + 0.5 });
  }

  draw() {
    const canvas = this.canvas; if (!canvas) return;
    const g = this.game, me = g.local, ctx = canvas.getContext('2d'), size = canvas.width, mid = size / 2, far = this.zoom === 'far';
    const px = far ? size / FAR_MAP_SPAN : size / (2 * AREA_MAP_RADIUS + 1), span = far ? FAR_MAP_SPAN / 2 : AREA_MAP_RADIUS;
    ctx.fillStyle = '#2c6b99'; ctx.fillRect(0, 0, size, size);
    if (far) {
      const layer = this._farTerrain(me.x, me.y), margin = (FAR_MAP_LAYER - FAR_MAP_SPAN) / 2;      // the window of the layer that is centred on you
      ctx.drawImage(layer.canvas, me.x - layer.cx + margin, me.y - layer.cy + margin, FAR_MAP_SPAN, FAR_MAP_SPAN, 0, 0, size, size);
    }
    else {
      const layer = this._terrain(me.x, me.y), L = AREA_MAP_LAYER_RADIUS;
      const sx = (layer.cx - me.x) * px + (L + 0.5) * px - mid, sy = (layer.cy - me.y) * px + (L + 0.5) * px - mid;
      ctx.drawImage(layer.canvas, sx, sy, size, size, 0, 0, size, size);
    }
    const toMap = (wx, wy) => [mid + (wx - me.x) * px, mid + (wy - me.y) * px], inside = (x, y) => x > 3 && y > 3 && x < size - 3 && y < size - 3;
    ctx.strokeStyle = 'rgba(70,45,20,.9)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, size - 3, size - 3);

    const O = CONFIG.sim.levels.origin, [ox, oy] = toMap(O.x, O.y);                                          // the origin, and (far) rings of rising level round it
    if (far) {
      ctx.font = 'bold 10px Georgia'; ctx.textAlign = 'left';
      for (let r = FAR_RING_EVERY; r <= 1000; r += FAR_RING_EVERY) {
        const rr = r * px; if (rr - Math.hypot(ox - mid, oy - mid) > mid * 1.5 && rr > size * 2) break;
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(ox, oy, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        for (let k = 0; k < 24; k++) {                                                                       // label where the ring crosses the map: the first spot that is in view
          const a = -Math.PI / 4 + ((k + r / FAR_RING_EVERY * 5) % 24) * Math.PI / 12, lx = ox + Math.cos(a) * rr, ly = oy + Math.sin(a) * rr;
          if (lx < 22 || ly < 24 || lx > size - 42 || ly > size - 14) continue;
          const txt = `Lv ${AnimalLevels.zoneLevel(O.x + r, O.y)}`; ctx.fillStyle = 'rgba(10,20,30,.75)'; ctx.fillRect(lx - 2, ly - 9, ctx.measureText(txt).width + 6, 12); ctx.fillStyle = '#ffe9a8'; ctx.fillText(txt, lx + 1, ly); break;
        }
      }
    }
    if (inside(ox, oy)) { ctx.fillStyle = '#ffe9a8'; ctx.strokeStyle = '#6b3d1c'; ctx.lineWidth = 1.4; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3 : 7; ctx.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); }

    if (!far) {
      const H = Village.home, [hx, hy] = toMap((H.x0 + H.x1 + 1) / 2, (H.y0 + H.y1 + 1) / 2);                       // home
      if (inside(hx, hy)) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#6b3d1c'; ctx.lineWidth = 1.6; ctx.fillRect(hx - 5, hy - 2, 10, 7); ctx.strokeRect(hx - 5, hy - 2, 10, 7); ctx.fillStyle = '#b5482f'; ctx.beginPath(); ctx.moveTo(hx - 7, hy - 2); ctx.lineTo(hx, hy - 9); ctx.lineTo(hx + 7, hy - 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      for (const key in g.map.built) {                                                                               // stables
        const tile = g.map.built[key]; if (!tile || tile.c !== 'stable') continue;
        const [x, y] = toMap(keyTileX(key) + 0.5, keyTileY(key) + 0.5); if (!inside(x, y)) continue;
        ctx.fillStyle = '#8a5a2c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeRect(x - 4, y - 4, 8, 8);
      }
    }
    for (const pet of g.pets) {                                                                                       // your ponies (and ones you are gentling)
      const [x, y] = toMap(pet.x, pet.y); if (!inside(x, y)) continue;
      ctx.fillStyle = pet.gentling ? '#ffd24a' : (PONY_KIND_COLORS[pet.type] || '#f48fb1'); ctx.strokeStyle = '#1b2a3a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, far ? 2.4 : 3.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    let nearest = null;
    for (const m of g.treasureMaps) {                                                                                 // treasure
      const wx = m.tx + 0.5, wy = m.ty + 0.5, d = Math.hypot(wx - me.x, wy - me.y); if (!nearest || d < nearest.d) nearest = { d, wx, wy };
      const [x, y] = toMap(wx, wy); if (!inside(x, y)) continue;
      const k = far ? 4 : 6; ctx.strokeStyle = '#c0392b'; ctx.lineWidth = far ? 2.4 : 3; ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
    }
    if (nearest && Math.max(Math.abs(nearest.wx - me.x), Math.abs(nearest.wy - me.y)) > span) {                       // off the map: an arrow on the border
      const a = Math.atan2(nearest.wy - me.y, nearest.wx - me.x), r = mid - 11;
      ctx.save(); ctx.translate(mid + Math.cos(a) * r, mid + Math.sin(a) * r); ctx.rotate(a); ctx.fillStyle = '#c0392b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -7); ctx.lineTo(-2, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.translate(mid, mid); ctx.rotate(me.facing);                                                       // you
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b3d73'; ctx.lineWidth = 2; const k = far ? 0.7 : 1; ctx.beginPath(); ctx.moveTo(8 * k, 0); ctx.lineTo(-5 * k, -5.5 * k); ctx.lineTo(-2.5 * k, 0); ctx.lineTo(-5 * k, 5.5 * k); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = 'rgba(40,25,10,.9)'; ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'center'; ctx.fillText('N', mid, 15);

    const info = this.body.querySelector('#areaInfo');
    if (info) {
      const dist = AnimalLevels.distance(me.x, me.y), zone = AnimalLevels.zoneLevel(me.x, me.y), biome = isWaterTile(g.map.tile(Math.floor(me.x), Math.floor(me.y))) ? 'Open water' : (BiomeNames[g.map.biome(Math.floor(me.x), Math.floor(me.y))] || '');
      info.innerHTML = `<b>${biome}</b> &middot; ${Math.round(dist)} tiles from the village<br>Wild animals here are about <b>level ${zone}</b>` +
        (nearest ? `<br>Nearest treasure X: about ${Math.round(nearest.d)} tiles away.` : '');
    }
  }
}
