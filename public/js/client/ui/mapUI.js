'use strict';
/* CLIENT - the Map: the land around you, drawn from the terrain function (no chunks are generated for it), with you, your home,
 * stables, your ponies and the X of any treasure map you have read. World north is up.
 *   NEAR  65 tiles across, 4 px per tile: every tree, your ponies, stables.
 *   FAR   260 tiles across, 1 px per tile: the BIOMES, and rings at every 100 tiles out from the village marked with how strong the
 *         animals get there (levels SCALE FROM THE ORIGIN: the farther out, the higher the level and the rarer the ponies). */
const AREA_MAP_RADIUS = 32, AREA_MAP_LAYER_RADIUS = 58, AREA_MAP_PX = 4;
/** The map is turned 45 degrees to match the isometric view of the world (world +x runs down-right on screen, +y down-left). */
/** The map uses the SAME 2:1 isometric projection as the world: a world step (dx, dy) lands at ((dx - dy) * K1, (dx + dy) * K2) with K2 = K1 / 2, so shapes, directions and distances read exactly like the game. */
const MAP_K1_NEAR = 1.0, MAP_K1_FAR = 1.3;
const FAR_MAP_SPAN = 640, FAR_MAP_LAYER = 1000, FAR_MAP_STEP = 4, FAR_RING_EVERY = 250;       // the far view shows 640 tiles; its terrain image is a little bigger so you can wander before it is remade
const AREA_COLORS = { [TILE.GRASS]: '#6aa84f', [TILE.DIRT]: '#a98258', [TILE.STONE]: '#a9a59c', [TILE.WATER]: '#2c6b99', [TILE.SAND]: '#dccb94', [TILE.CLAY]: '#b8734a', [TILE.SHALLOW]: '#7bc3dc' };
/** Map colours for grass / dirt by biome (a little stronger than the ground so a biome reads at a glance). */
const BIOME_MAP_COLORS = Object.fromEntries(Biomes.all().map(b => [b.id, b.mapColor]));      // (from the biome table)

class MapUI {
  /** A little compass: a disc with N, and a tick pointing the way north really goes on screen (world -y = up and to the right). */
  static compass(ctx, cx, cy, K1, K2) {
    const dx = K1, dy = -K2, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.strokeStyle = 'rgba(70,45,20,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(cx + ux * 13, cy + uy * 13); ctx.lineTo(cx + ux * 6 - uy * 3.5, cy + uy * 6 + ux * 3.5); ctx.lineTo(cx + ux * 6 + uy * 3.5, cy + uy * 6 - ux * 3.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(40,25,10,.95)'; ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', cx - ux * 2.5, cy - uy * 2.5 + 0.5); ctx.restore();
  }

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
    if (key) key.innerHTML = zoom === 'far' ? Biomes.where(b => !b.terrainOnly).map(b => `<span style="--c:${BIOME_MAP_COLORS[b.id]}">${b.name} <small>${b.rarity}</small></span>`).join('') : '';
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
    if (this.layer && Math.hypot(this.layer.cx - cx, this.layer.cy - cy) < 5) return this.layer;
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
    const locks = this.game.map.layers.rings.unlockedList().join();
    if (this.farLayer && this.farLayer.locks === locks && Math.hypot(this.farLayer.cx - cx, this.farLayer.cy - cy) < 50) return this.farLayer;
    const half = FAR_MAP_LAYER / 2, canvas = document.createElement('canvas');
    canvas.width = canvas.height = FAR_MAP_LAYER;
    const ctx = canvas.getContext('2d'), T = this.game.map.terrain, rings = this.game.map.layers.rings, fx = Math.floor(cx), fy = Math.floor(cy), S = FAR_MAP_STEP;
    for (let dy = -half; dy < half; dy += FAR_MAP_STEP) for (let dx = -half; dx < half; dx += FAR_MAP_STEP) {
      const x = fx + dx, y = fy + dy, ring = rings.at(x, y).index;
      ctx.fillStyle = this._color(T, x, y); ctx.fillRect(dx + half, dy + half, S, S);
      if (!rings.isUnlocked(ring)) { ctx.fillStyle = 'rgba(30,12,60,.38)'; ctx.fillRect(dx + half, dy + half, S, S); }                 // a sealed ring is dimmed
      if (rings.at(x + S, y).index !== ring || rings.at(x, y + S).index !== ring) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(dx + half, dy + half, S, S); }   // the (imperfect) edge between two rings
    }
    return (this.farLayer = { canvas, cx: fx + 0.5, cy: fy + 0.5, locks });
  }

  draw() {
    const canvas = this.canvas; if (!canvas) return;
    const g = this.game, me = g.local, ctx = canvas.getContext('2d'), size = canvas.width, mid = size / 2, far = this.zoom === 'far';
    const px = far ? size / FAR_MAP_SPAN : size / (2 * AREA_MAP_RADIUS + 1), span = far ? FAR_MAP_SPAN / 2 : AREA_MAP_RADIUS;
    ctx.fillStyle = '#2c6b99'; ctx.fillRect(0, 0, size, size);
    /* The world is drawn ISOMETRICALLY (turned 45 degrees), so the map is turned the same way: what is up-screen in the game is up-map here, and walking
     * down-right in the game moves you down-right on the map. Terrain is drawn in a rotated frame; text and icons are placed with toMap() and stay upright. */
    const K1 = far ? MAP_K1_FAR : MAP_K1_NEAR, K2 = K1 / 2;
    ctx.save(); ctx.translate(mid, mid); ctx.transform(K1, K2, -K1, K2, 0, 0);
    if (far) {
      const layer = this._farTerrain(me.x, me.y); ctx.scale(px, px);
      ctx.drawImage(layer.canvas, -(me.x - layer.cx + 0.5 + FAR_MAP_LAYER / 2), -(me.y - layer.cy + 0.5 + FAR_MAP_LAYER / 2));
    } else {
      const layer = this._terrain(me.x, me.y), L = AREA_MAP_LAYER_RADIUS;
      ctx.drawImage(layer.canvas, -((me.x - layer.cx + L + 0.5) * px), -((me.y - layer.cy + L + 0.5) * px));
    }
    ctx.restore();
    const toMap = (wx, wy) => { const dx = (wx - me.x) * px, dy = (wy - me.y) * px; return [mid + (dx - dy) * K1, mid + (dx + dy) * K2]; }, inside = (x, y) => x > 3 && y > 3 && x < size - 3 && y < size - 3;
    ctx.strokeStyle = 'rgba(70,45,20,.9)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, size - 3, size - 3);

    const O = CONFIG.sim.levels.origin, [ox, oy] = toMap(O.x, O.y);                                          // the origin, and (far) rings of rising level round it
    if (far) {
      ctx.font = 'bold 10px Georgia'; ctx.textAlign = 'left';
      const rings = g.map.layers.rings;
      for (const def of Rings.all()) {                                                                         // name each ring where it is in view
        const mid = (def.index + 0.5) * rings.width, locked = !rings.isUnlocked(def.index), txt = `${locked ? '\u{1F512} ' : ''}${def.name}  Lv ${def.levelMin}-${def.levelMax}`;
        for (let k = 0; k < 36; k++) {
          const a = -Math.PI / 4 + k * Math.PI / 18, [lx, ly] = toMap(O.x + Math.cos(a) * (def.index ? mid : 120), O.y + Math.sin(a) * (def.index ? mid : 120));
          if (lx < 30 || ly < 26 || lx > size - 150 || ly > size - 14) continue;
          ctx.fillStyle = 'rgba(10,20,30,.78)'; ctx.fillRect(lx - 3, ly - 9, ctx.measureText(txt).width + 8, 13); ctx.fillStyle = def.color; ctx.fillText(txt, lx + 1, ly + 1); break;
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
      if (m.kind === 'dungeon') { const rr = far ? 4 : 6; ctx.fillStyle = '#3a1f5a'; ctx.strokeStyle = '#e8d0ff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, rr, Math.PI, 0); ctx.lineTo(x + rr, y + rr * 0.8); ctx.lineTo(x - rr, y + rr * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); continue; }          // a cave mouth
      const k = far ? 4 : 6; ctx.strokeStyle = '#c0392b'; ctx.lineWidth = far ? 2.4 : 3; ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
    }
    const nm = nearest && toMap(nearest.wx, nearest.wy);
    if (nearest && !inside(nm[0], nm[1])) {                                                                              // off the map: an arrow on the border
      const a = Math.atan2(nm[1] - mid, nm[0] - mid), r = mid - 11;
      ctx.save(); ctx.translate(mid + Math.cos(a) * r, mid + Math.sin(a) * r); ctx.rotate(a); ctx.fillStyle = '#c0392b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -7); ctx.lineTo(-2, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    const fx = Math.cos(me.facing), fy = Math.sin(me.facing);
    ctx.save(); ctx.translate(mid, mid); ctx.rotate(Math.atan2((fx + fy) * K2, (fx - fy) * K1));                                  // you, pointing the way the world points
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b3d73'; ctx.lineWidth = 2; const k = far ? 0.7 : 1; ctx.beginPath(); ctx.moveTo(8 * k, 0); ctx.lineTo(-5 * k, -5.5 * k); ctx.lineTo(-2.5 * k, 0); ctx.lineTo(-5 * k, 5.5 * k); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    MapUI.compass(ctx, size - 24, 24, K1, K2);                                                                          // north is up-right in an isometric view

    const info = this.body.querySelector('#areaInfo');
    if (info) {
      const dist = AnimalLevels.distance(me.x, me.y), zone = AnimalLevels.zoneLevel(me.x, me.y, g.map.layers), biome = isWaterTile(g.map.tile(Math.floor(me.x), Math.floor(me.y))) ? 'Open water' : (BiomeNames[g.map.biome(Math.floor(me.x), Math.floor(me.y))] || '');
      const rings = g.map.layers.rings, ring = rings.def(rings.at(me.x, me.y).index);
      info.innerHTML = `<b>${biome}</b> &middot; ${Math.round(dist)} tiles from the village<br><span style="color:${ring.color}">${ring.name}</span> &middot; wild things here are about <b>level ${zone}</b>${rings.isUnlocked(ring.index) ? '' : ' &middot; \u{1F512} sealed until its guardian falls'}` +
        (nearest ? `<br>Nearest treasure X: about ${Math.round(nearest.d)} tiles away.` : '');
    }
  }
}
