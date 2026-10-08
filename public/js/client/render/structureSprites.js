'use strict';
/* CLIENT - walls, towers and houses (tile-sized boxes so they depth-sort per tile). */
const StructureSprites = (() => {
  const V = CONFIG.view;
  const shadeHex = (hex, f) => { const n = parseInt(hex.slice(1), 16), k = t => Math.round(f < 1 ? t * f : t + (255 - t) * (f - 1)); return `rgb(${k((n >> 16) & 255)},${k((n >> 8) & 255)},${k(n & 255)})`; };

  function draw(g, item, cx, cy) {
    if (item.o >= INTERIOR_OBJ_BASE) InteriorSprites.wall(g, item.o, cx, cy, item);          // a room's wall (low ones at the front)
    else if (item.o === OBJ.WALL) drawWall(g, cx, cy, item);
    else if (item.o === OBJ.TOWER) drawTower(g, cx, cy, item);
    else if (isCliffObj(item.o) || isCaveRockObj(item.o)) drawRock(g, cx, cy, item);
    else drawHouse(g, item, cx, cy);
  }

  function drawBox(g, cx, cy, height, topColor, leftColor, rightColor, brickSpacing) {
    const ctx = g.ctx, Lx = cx - TILE_HALF_W, Rx = cx + TILE_HALF_W, Bx = cx, By = cy + TILE_HALF_H;
    g.polygon([Lx, cy, Bx, By, Bx, By - height, Lx, cy - height], leftColor);
    g.polygon([Bx, By, Rx, cy, Rx, cy - height, Bx, By - height], rightColor);
    g.polygon([cx, cy - TILE_HALF_H - height, Rx, cy - height, Bx, By - height, Lx, cy - height], topColor);
    if (brickSpacing) {
      ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let h = brickSpacing; h < height; h += brickSpacing) { ctx.moveTo(Lx, cy - h); ctx.lineTo(Bx, By - h); ctx.lineTo(Rx, cy - h); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Bx, By); ctx.lineTo(Bx, By - height); ctx.stroke();
  }

  /** A cliff / hill tile (layers/caveSites.js) or the wall of a room dungeon's cave: ray-cast pixel rock (pixelBuildings.js), the same craft as the village walls. */
  function drawRock(g, cx, cy, item) {
    const o = item.o;
    if (isCaveRockObj(o)) PixelBuildings.drawRock(g.ctx, 'cave', o === OBJ.CAVEROCK_LOW ? 0 : 1, item.tx, item.ty, cx, cy);
    else PixelBuildings.drawRock(g.ctx, 'cliff', o - OBJ.CLIFF1, item.tx, item.ty, cx, cy);
  }

  function drawWall(g, cx, cy, item) { PixelBuildings.drawPiece(g.ctx, 'wall', cx, cy, item && item.tx, item && item.ty); }                    // crenellated fieldstone (pixelBuildings.js)

  function drawTower(g, cx, cy, item) { PixelBuildings.drawPiece(g.ctx, 'tower', cx, cy, item && item.tx, item && item.ty); }                  // a stone watchtower with a pointed roof


  /** One tile of a building (BuildingSites): drawn in its own colours, the door tile with a sign. A building with its own picture
   *  (sprites.exterior) draws that once, at its front corner, and nothing on its other tiles. */
  function drawHouse(g, item, cx, cy) {
    const ctx = g.ctx, height = V.houseH, hasDoor = item.o === OBJ.DOOR, site = BuildingSites.at(item.tx, item.ty);
    const ext = site ? site.def.exterior : { wall: '#dccca6', side: '#b9a77f', roof: '#9c4a3b', trim: '#5a3f2a', sign: '#e8d6a8' };
    const img = site && site.def.sprites && site.def.sprites.exterior ? SpriteRegistry.image(site.def.sprites.exterior) : null;
    if (img) {
      if (item.tx !== site.x1 || item.ty !== site.y1) return;
      const left = isoX(site.x0, site.y1 + 1), right = isoX(site.x1 + 1, site.y0), w = right - left, h = w * img.naturalHeight / img.naturalWidth;
      ctx.drawImage(img, left, isoY(site.x1 + 1, site.y1 + 1) - h, w, h);
      return;
    }
    if (site) {                                                                     // the pixel-art building (pixelBuildings.js), a slice per front tile
      if (PixelBuildings.drawTile(ctx, site, item.tx, item.ty) && hasDoor) {
        const s = PixelBuildings.signAt(site), b = PixelBuildings.ART;                // the building's picture on its hanging sign
        ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a1c10';
        ctx.fillText(site.def.glyph || site.def.name[0], s.x + 5 * b, s.y + 8 * b);
      }
      return;
    }
    drawBox(g, cx, cy, height, ext.roof, ext.wall, ext.side, 0);
    drawRoofLines(ctx, cx, cy, height);
    drawTimberFrame(ctx, cx, cy, height, ext.trim);

    const onLeftFace = u => [cx - TILE_HALF_W + TILE_HALF_W * u, cy + TILE_HALF_H * u];
    const onRightFace = u => [cx + TILE_HALF_W * u, cy + TILE_HALF_H - TILE_HALF_H * u];
    const facePanel = (face, u0, u1, h0, h1, color) => {
      const a = face(u0), b = face(u1);
      g.polygon([a[0], a[1] - h0, b[0], b[1] - h0, b[0], b[1] - h1, a[0], a[1] - h1], color);
    };
    if (hasDoor) {
      facePanel(onLeftFace, 0.3, 0.7, 0, 46, ext.trim);
      facePanel(onLeftFace, 0.34, 0.66, 2, 42, shadeHex(ext.trim, 1.35));
      const knob = onLeftFace(0.6); g.ellipse(knob[0], knob[1] - 22, 1.8, 1.8, '#d9b45a');
      if (site) {                                                                   // the sign over the door: the building's picture
        facePanel(onLeftFace, 0.2, 0.8, 49, 63, ext.trim); facePanel(onLeftFace, 0.23, 0.77, 50.5, 61.5, ext.sign);
        const mid = onLeftFace(0.5); ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#222';
        ctx.fillText(site.def.glyph || site.def.name[0], mid[0], mid[1] - 56);
      }
    } else if (hash2(item.tx, item.ty) > 0.3) facePanel(onLeftFace, 0.3, 0.7, 28, 46, '#34495e');
    if (hash2(item.ty, item.tx) > 0.4) facePanel(onRightFace, 0.3, 0.7, 28, 46, '#2c3e50');
  }

  function drawRoofLines(ctx, cx, cy, height) {
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const o of [-0.5, 0, 0.5]) {
      ctx.moveTo(cx - TILE_HALF_W / 2 + o * TILE_HALF_W * 0.5, cy - height - TILE_HALF_H / 2 + o * TILE_HALF_H * 0.5);
      ctx.lineTo(cx + TILE_HALF_W / 2 + o * TILE_HALF_W * 0.5, cy - height + TILE_HALF_H / 2 + o * TILE_HALF_H * 0.5);
    }
    ctx.stroke();
  }

  function drawTimberFrame(ctx, cx, cy, height, color = '#5a3f2a') {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(cx - TILE_HALF_W, cy); ctx.lineTo(cx - TILE_HALF_W, cy - height);
    ctx.moveTo(cx - TILE_HALF_W, cy - height); ctx.lineTo(cx, cy + TILE_HALF_H - height); ctx.lineTo(cx + TILE_HALF_W, cy - height);
    ctx.moveTo(cx + TILE_HALF_W, cy); ctx.lineTo(cx + TILE_HALF_W, cy - height); ctx.stroke();
  }

  /* ---- player-built structures: thin slabs flush with one side of their tile ---- */
  const project = (x, y) => [(x - y) * TILE_HALF_W, (x + y) * TILE_HALF_H];

  /** A box with an arbitrary world-space footprint [x0,y0]-[x1,y1] (south and east faces are the visible ones). */
  function drawWorldBox(g, box, height, topColor, leftColor, rightColor, lift = 0) {
    const [x0, y0, x1, y1] = box;
    let [ax, ay] = project(x0, y0), [bx, by] = project(x1, y0), [cx, cy] = project(x1, y1), [dx, dy] = project(x0, y1);
    ay -= lift; by -= lift; cy -= lift; dy -= lift;                       // raised off the ground (fence rails)
    g.polygon([dx, dy, cx, cy, cx, cy - height, dx, dy - height], leftColor);
    g.polygon([cx, cy, bx, by, bx, by - height, cx, cy - height], rightColor);
    g.polygon([ax, ay - height, bx, by - height, cx, cy - height, dx, dy - height], topColor);
    return { ax, ay, bx, by, cx, cy, dx, dy };
  }

  const WALL_CHUNK_COUNT = 4;                                       // how many pieces a slab is cut into (see Renderer)
  const WOOD = { top: '#c9a066', left: '#a97a45', right: '#8a5f32' };
  const DOOR_WOOD = { top: '#a8763f', left: '#8a5a2c', right: '#6e4722' };

  /** Plank slab; `colors` / `extras` make windows and doors out of the same shape. */
  function drawWoodSlab(g, box, colors = WOOD) {
    const ctx = g.ctx, height = V.woodWallH;
    const pts = drawWorldBox(g, box, height, colors.top, colors.left, colors.right);
    const { ax, ay, dx, dy, cx, cy, bx, by } = pts;
    ctx.strokeStyle = 'rgba(60,35,15,.5)'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(dx, dy); ctx.lineTo(dx, dy - height);                  // plank seam at the start of every chunk
    ctx.moveTo(ax, ay - height); ctx.lineTo(dx, dy - height);
    ctx.stroke();
    ctx.strokeStyle = '#5a3f2a'; ctx.lineWidth = 2; ctx.beginPath();  // top + bottom rails along the visible faces
    for (const h of [height - 1, 7]) { ctx.moveTo(dx, dy - h); ctx.lineTo(cx, cy - h); ctx.lineTo(bx, by - h); }
    ctx.stroke();
    return pts;
  }

  /** The visible face of a slab as four corners at heights h0..h1: south face for walls running east-west, east face otherwise. */
  function faceQuad(pts, slot, h0, h1) {
    const alongX = slot === 'n' || slot === 's';
    const [px, py, qx, qy] = alongX ? [pts.dx, pts.dy, pts.cx, pts.cy] : [pts.cx, pts.cy, pts.bx, pts.by];
    return [px, py - h0, qx, qy - h0, qx, qy - h1, px, py - h1];
  }

  function drawWindowChunk(g, chunk) {
    const pts = drawWoodSlab(g, chunk.box);
    if (chunk.index !== 1 && chunk.index !== 2) return;               // the glass spans the two middle chunks
    const quad = faceQuad(pts, chunk.slot, 22, 48);
    g.polygon(quad, 'rgba(150,205,235,.6)');
    const ctx = g.ctx;
    ctx.strokeStyle = '#5a3f2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(quad[0], quad[1]); ctx.lineTo(quad[2], quad[3]); ctx.lineTo(quad[4], quad[5]); ctx.lineTo(quad[6], quad[7]); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(quad[0] + (quad[2] - quad[0]) * 0.2, quad[1] + (quad[3] - quad[1]) * 0.2 - 4); ctx.lineTo(quad[0] + (quad[2] - quad[0]) * 0.55, quad[1] + (quad[3] - quad[1]) * 0.55 - 22); ctx.stroke();
  }

  function drawDoorChunk(g, chunk) {
    const pts = drawWoodSlab(g, chunk.box, DOOR_WOOD), ctx = g.ctx;
    const quad = faceQuad(pts, chunk.slot, 4, V.woodWallH - 8);        // door leaf panel with a frame
    ctx.strokeStyle = '#3f2a16'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(quad[0], quad[1]); ctx.lineTo(quad[2], quad[3]); ctx.lineTo(quad[4], quad[5]); ctx.lineTo(quad[6], quad[7]); ctx.closePath(); ctx.stroke();
    if (chunk.index === 2) {                                           // handle
      const hx = (quad[0] + quad[2]) / 2, hy = (quad[1] + quad[3]) / 2 - V.woodWallH * 0.45;
      g.ellipse(hx, hy, 2.6, 2.6, '#e0b84a');
    }
  }

  /** An open door: the leaf swung 90 degrees into the tile, hinged at one end of the doorway. */
  function drawDoorLeaf(g, item) {
    if (item.low) drawWorldBox(g, item.box, 24, FENCE_WOOD.top, FENCE_WOOD.left, FENCE_WOOD.right);           // an open gate leaf
    else drawWorldBox(g, item.box, V.woodWallH - 4, DOOR_WOOD.top, DOOR_WOOD.left, DOOR_WOOD.right);
  }

  /* ---- fences and gates: low posts and two rails, so animals are penned in but you can still see them ---- */
  const FENCE_WOOD = { top: '#c4975a', left: '#a47040', right: '#835a30' }, FENCE_HEIGHT = 30;
  const postBox = (box, slot, atEnd) => {
    const [x0, y0, x1, y1] = box, w = 0.075;
    return (slot === 'n' || slot === 's') ? (atEnd ? [x1 - w, y0, x1, y1] : [x0, y0, x0 + w, y1]) : (atEnd ? [x0, y1 - w, x1, y1] : [x0, y0, x1, y0 + w]);
  };

  function drawFenceFrame(g, chunk) {
    drawWorldBox(g, chunk.box, 5, FENCE_WOOD.top, FENCE_WOOD.left, FENCE_WOOD.right, 8);
    drawWorldBox(g, chunk.box, 5, FENCE_WOOD.top, FENCE_WOOD.left, FENCE_WOOD.right, 20);
    if (chunk.index === 0) drawWorldBox(g, postBox(chunk.box, chunk.slot, false), FENCE_HEIGHT, '#d1a566', '#b07c46', '#8d6234');   // one post at each end of a tile's fence, rails between
    if (chunk.index === WALL_CHUNK_COUNT - 1) drawWorldBox(g, postBox(chunk.box, chunk.slot, true), FENCE_HEIGHT, '#d1a566', '#b07c46', '#8d6234');
  }

  function drawGateChunk(g, chunk) {                              // closed gate: the fence frame plus a braced panel in the middle
    drawFenceFrame(g, chunk);
    if (chunk.index !== 1 && chunk.index !== 2) return;
    const [x0, y0, x1, y1] = chunk.box, alongX = chunk.slot === 'n' || chunk.slot === 's';
    const [px, py, qx, qy] = alongX ? [...project(x0, y1), ...project(x1, y1)] : [...project(x1, y0), ...project(x1, y1)];
    const quad = [px, py - 5, qx, qy - 5, qx, qy - 25, px, py - 25], ctx = g.ctx;
    g.polygon(quad, 'rgba(150,100,55,.92)');
    ctx.strokeStyle = '#5a3f2a'; ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(quad[0], quad[1]); ctx.lineTo(quad[4], quad[5]); ctx.moveTo(quad[2], quad[3]); ctx.lineTo(quad[6], quad[7]);
    ctx.stroke();
  }

  function drawBuiltChunk(g, chunk) {
    if (chunk.structure === 'wood_fence') drawFenceFrame(g, chunk);
    else if (chunk.structure === 'wood_gate') drawGateChunk(g, chunk);
    else if (chunk.structure === 'wood_window') drawWindowChunk(g, chunk);
    else if (chunk.structure === 'wood_door') drawDoorChunk(g, chunk);
    else if (chunk.structure === 'wood_wall') drawWoodSlab(g, chunk.box);
  }

  /** Where the leaf of an open door stands (hinged at the north / west end of its doorway, swung into the tile). */
  function openDoorLeafBox(tx, ty, slot) {
    const t = WALL_THICKNESS, len = 0.8;
    switch (slot) {
      case 'n': return [tx, ty, tx + t, ty + len];
      case 's': return [tx, ty + 1 - len, tx + t, ty + 1];
      case 'w': return [tx, ty, tx + len, ty + t];
      default:  return [tx + 1 - len, ty, tx + 1, ty + t];
    }
  }

  /* ---- stations ---- */
  const tileCentre = (tx, ty) => [(tx - ty) * TILE_HALF_W, (tx + ty + 1) * TILE_HALF_H];

  function drawCraftingTable(g, tx, ty) {
    const ctx = g.ctx;
    drawWorldBox(g, [tx + 0.2, ty + 0.22, tx + 0.8, ty + 0.78], 18, '#8a5f32', '#8a5f32', '#6f4a28');            // legs / apron
    ctx.save(); ctx.translate(0, -18);
    const pts = drawWorldBox(g, [tx + 0.1, ty + 0.12, tx + 0.9, ty + 0.88], 7, '#d6ad72', '#b98a52', '#9a6f3c');  // table top
    ctx.restore();
    const topX = (pts.ax + pts.cx) / 2, topY = (pts.ay + pts.cy) / 2 - 25;                                         // tools lying on it
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(topX - 9, topY + 2); ctx.lineTo(topX + 3, topY - 3); ctx.stroke();
    g.polygon([topX + 1, topY - 7, topX + 9, topY - 4, topX + 6, topY + 1, topX - 1, topY - 2], '#8d8d93');
    ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(topX - 12, topY + 5); ctx.lineTo(topX - 3, topY + 3); ctx.stroke();
  }

  function drawClayFurnace(g, tx, ty) {
    const ctx = g.ctx, [cx, cy] = tileCentre(tx, ty);
    drawWorldBox(g, [tx + 0.14, ty + 0.14, tx + 0.86, ty + 0.86], 16, '#c98550', '#b4703f', '#955a30');           // base
    g.ellipse(cx, cy - 30, 25, 16, '#c4733f'); g.ellipse(cx - 6, cy - 36, 15, 9, '#d28a58');                     // dome
    ctx.fillStyle = '#2a1a12'; ctx.beginPath(); ctx.ellipse(cx + 7, cy - 18, 11, 8, 0, Math.PI, 0); ctx.fill();  // mouth
    ctx.fillRect(cx - 4, cy - 18, 22, 5);
    g.ellipse(cx + 7, cy - 17, 7, 4, '#ff9a3a'); g.ellipse(cx + 7, cy - 18, 3.5, 2, '#ffd36b');                  // fire glow
    drawWorldBox(g, [tx + 0.62, ty + 0.2, tx + 0.8, ty + 0.38], 56, '#a85f33', '#8f4f2b', '#74401f');            // chimney
  }

  /** A roofed stall: three plank walls, a pitched roof, hay and a water trough at the open front. */
  function drawStable(g, tx, ty) {
    const ctx = g.ctx, [cx, cy] = tileCentre(tx, ty);
    drawWorldBox(g, [tx + 0.08, ty + 0.08, tx + 0.92, ty + 0.92], 6, '#b98e55', '#a97a45', '#8a5f32');                // plank floor / base
    drawWorldBox(g, [tx + 0.1, ty + 0.1, tx + 0.9, ty + 0.2], 40, '#a97a45', '#8a5f32', '#8a5f32');                  // back wall
    drawWorldBox(g, [tx + 0.1, ty + 0.1, tx + 0.2, ty + 0.9], 40, '#a97a45', '#8a5f32', '#6f4a28');                  // side wall
    for (let i = 0; i < 4; i++) {                                                                                      // plank lines on the back wall
      const [x, y] = project(tx + 0.18 + i * 0.2, ty + 0.2); ctx.strokeStyle = 'rgba(60,35,15,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 40); ctx.stroke();
    }
    ctx.save(); ctx.translate(0, -42);
    drawWorldBox(g, [tx + 0.02, ty + 0.02, tx + 0.98, ty + 0.98], 6, '#c75b3c', '#a84a30', '#8a3c26');
    ctx.restore();
    const [hx, hy] = project(tx + 0.62, ty + 0.62);                                                                    // hay in the stall
    g.ellipse(hx, hy - 8, 13, 6, '#d9b64a'); g.ellipse(hx - 3, hy - 11, 8, 4, '#e8cc6a');
    ctx.strokeStyle = '#b8932f'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(hx + i * 4, hy - 9); ctx.lineTo(hx + i * 4 + 2, hy - 14); } ctx.stroke();
    const [tx2, ty2] = project(tx + 0.62, ty + 0.9);                                                                   // trough
    g.ellipse(tx2, ty2 - 4, 12, 5, '#6f4a28'); g.ellipse(tx2, ty2 - 5, 9, 3.4, '#4d86b0');
  }

  /** A ring of stones, crossed logs and a flickering flame. */
  function drawCampfire(g, tx, ty) {
    const ctx = g.ctx, [cx, cy] = tileCentre(tx, ty), t = Date.now() / 120, flick = Math.sin(t) * 2 + Math.sin(t * 1.7) * 1.5;
    g.ellipse(cx, cy, 30, 14, 'rgba(255,150,60,.16)');
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; g.ellipse(cx + Math.cos(a) * 17, cy + Math.sin(a) * 8, 5, 3.6, i % 2 ? '#8d8d93' : '#a8a8ae'); }
    ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(cx - 12, cy + 3); ctx.lineTo(cx + 11, cy - 5); ctx.moveTo(cx - 11, cy - 5); ctx.lineTo(cx + 12, cy + 3); ctx.stroke(); ctx.lineCap = 'butt';
    g.polygon([cx - 9, cy - 3, cx - 3 + flick * 0.4, cy - 22 - flick, cx + 2, cy - 12, cx + 6 - flick * 0.3, cy - 26 + flick, cx + 10, cy - 3], '#ff8a2a');
    g.polygon([cx - 5, cy - 3, cx + flick * 0.3, cy - 16 - flick * 0.5, cx + 6, cy - 3], '#ffd24a');
    g.ellipse(cx + 1, cy - 4, 3, 2, '#fff2b0');
  }

  /** A stockpile: a wooden pallet heaped with its resource, fuller the more it holds, with a level sign once upgraded. */
  function drawStockpile(g, type, tx, ty, fill, level) {
    const ctx = g.ctx, [cx, cy] = tileCentre(tx, ty), resource = StructureDefs[type].stockpile;
    PixelDecor.drawStockpile(ctx, resource, cx, cy, fill);                                                 // (pixel art: pixelDecor.js)
    if (level > 1) {                                                                                           // a little sign with its level
      ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 22, cy - 2); ctx.lineTo(cx + 22, cy - 26); ctx.stroke();
      g.roundRect(cx + 13, cy - 38, 18, 13, 3); ctx.fillStyle = '#e8d3a3'; ctx.fill();
      ctx.fillStyle = '#4a3624'; ctx.font = 'bold 10px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(level), cx + 22, cy - 31);
    }
  }

  /** `info` (optional): { fill 0..1, level } for stockpiles and upgraded buildings. A station item with a `placed` image is drawn from it. */
  function drawStation(g, type, tx, ty, info = null) {
    const img = SpriteRegistry.itemImage(StructureDefs[type] && StructureDefs[type].refundItemId, 'placed');
    if (img) { const [cx, cy] = tileCentre(tx, ty), w = TILE_HALF_W * 2, h = w * img.naturalHeight / img.naturalWidth; g.ctx.drawImage(img, cx - w / 2, cy + TILE_HALF_H - h, w, h); return; }
    if (StructureDefs[type] && StructureDefs[type].stockpile) drawStockpile(g, type, tx, ty, info ? info.fill : 0, info ? info.level : 1);
    else if (type === 'crafting_table') drawCraftingTable(g, tx, ty);
    else if (type === 'campfire') drawCampfire(g, tx, ty);
    else if (type === 'stable') drawStable(g, tx, ty);
    else drawClayFurnace(g, tx, ty);
  }

  /** A wood floor tile (drawn with the ground, under everything). */
  function drawFloor(ctx, cx, cy) {
    ctx.beginPath(); ctx.moveTo(cx, cy - TILE_HALF_H); ctx.lineTo(cx + TILE_HALF_W, cy); ctx.lineTo(cx, cy + TILE_HALF_H); ctx.lineTo(cx - TILE_HALF_W, cy); ctx.closePath();
    ctx.fillStyle = '#b98e55'; ctx.fill();
    ctx.strokeStyle = 'rgba(70,40,15,.38)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const u of [0.25, 0.5, 0.75]) {                                // planks run along the world x axis
      const sx = cx + u * -TILE_HALF_W, sy = cy - TILE_HALF_H + u * TILE_HALF_H;
      ctx.moveTo(sx, sy); ctx.lineTo(sx + TILE_HALF_W, sy + TILE_HALF_H);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,40,15,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  /** Translucent preview: green = can build here, red = blocked. */
  function drawGhost(g, target, cx, cy) {
    const ctx = g.ctx, rgb = target.valid ? '90,225,130' : '235,85,75';
    ctx.beginPath();
    ctx.moveTo(cx, cy - TILE_HALF_H); ctx.lineTo(cx + TILE_HALF_W, cy); ctx.lineTo(cx, cy + TILE_HALF_H); ctx.lineTo(cx - TILE_HALF_W, cy); ctx.closePath();
    ctx.fillStyle = `rgba(${rgb},.3)`; ctx.fill();
    ctx.strokeStyle = `rgba(${rgb},.95)`; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = target.valid ? 0.65 : 0.35;
    if (target.layer === 'floor') drawFloor(ctx, cx, cy);
    else if (target.layer === 'station') drawStation(g, target.structure, target.tx, target.ty);
    else {
      const [x0, y0, x1, y1] = slabBox(target.tx, target.ty, target.slot), alongX = target.slot === 'n' || target.slot === 's';
      for (let c = 0; c < 4; c++) {                                     // same chunks as the real piece, so doors / windows preview properly
        const f0 = c / 4, f1 = (c + 1) / 4;
        const box = alongX ? [lerp(x0, x1, f0), y0, lerp(x0, x1, f1), y1] : [x0, lerp(y0, y1, f0), x1, lerp(y0, y1, f1)];
        drawBuiltChunk(g, { structure: target.structure, box, slot: target.slot, index: c });
      }
    }
    ctx.globalAlpha = 1;
  }

  return { draw, drawBuiltChunk, drawDoorLeaf, openDoorLeafBox, drawStation, drawFloor, drawGhost };
})();
