'use strict';
/* CLIENT - walls, towers and houses (tile-sized boxes so they depth-sort per tile). */
const StructureSprites = (() => {
  const V = CONFIG.view;
  const shadeHex = (hex, f) => { const n = parseInt(hex.slice(1), 16), k = t => Math.round(f < 1 ? t * f : t + (255 - t) * (f - 1)); return `rgb(${k((n >> 16) & 255)},${k((n >> 8) & 255)},${k(n & 255)})`; };

  function draw(g, item, cx, cy) {
    if (item.o >= INTERIOR_OBJ_BASE) InteriorSprites.wall(g, item.o, cx, cy, item);          // a room's wall (low ones at the front)
    else if (item.o === OBJ.WALL) drawWall(g, cx, cy, item);
    else if (item.o === OBJ.TOWER) drawTower(g, cx, cy, item);
    else if (isCliffObj(item.o) || isCaveRockObj(item.o) || item.o === OBJ.CAVEMOUTH || item.o === OBJ.CAVEMOUTH_IN) drawRock(g, cx, cy, item);
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
    if ((o === OBJ.CAVEMOUTH || o === OBJ.CAVEMOUTH_IN) && StructureSprites.sealed && StructureSprites.sealed(o, item.tx, item.ty)) {          // a cave mouth that is still shut (rubble until the bear is beaten; the way on until the slimes are)
      if (o === OBJ.CAVEMOUTH) PixelBuildings.drawRock(g.ctx, 'cliff', 2, item.tx, item.ty, cx, cy, item.look); else PixelBuildings.drawRock(g.ctx, 'cave', 1, item.tx, item.ty, cx, cy);
      return;
    }
    if (o === OBJ.CAVEMOUTH) PixelBuildings.drawRock(g.ctx, 'mouth', 1, item.tx, item.ty, cx, cy);
    else if (o === OBJ.CAVEMOUTH_IN) PixelBuildings.drawRock(g.ctx, 'cavemouth', 1, item.tx, item.ty, cx, cy);
    else if (isCaveRockObj(o)) PixelBuildings.drawRock(g.ctx, 'cave', o === OBJ.CAVEROCK_LOW ? 0 : 1, item.tx, item.ty, cx, cy);
    else PixelBuildings.drawRock(g.ctx, 'cliff', o - OBJ.CLIFF1, item.tx, item.ty, cx, cy, item.look);
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
    if (item.low) { const sp = spanOf(item.box); pixelPanel(g, sp, 5, 28, 0, 1); for (const lift of RAIL_LIFTS) pixelRail(g, sp, lift); }   // an open gate leaf: a braced panel between two rails
    else drawWorldBox(g, item.box, V.woodWallH - 4, DOOR_WOOD.top, DOOR_WOOD.left, DOOR_WOOD.right);
  }

  /* ---- fences and gates: low posts and two rails, so animals are penned in but you can still see them ---- */
  /* ---- fences and gates in hard-edged retro pixels (the same 1.5 px art pixel as the houses): inked rails with wood grain, capped posts, braced gates ---- */
  const FPX = 1.5, F_INK = '#1c140e', F_WOOD = ['#7a4f27', '#a8763f', '#c99a5b', '#e0b878'], F_PLANK = ['#b98a4e', '#d9b274', '#ecd196'];   // dark, mid, light, highlight
  const snap = v => Math.round(v / FPX) * FPX;
  /** Fill art pixels: a column (x) from art row r0 up to r1 above the ground point y, in a colour. Rows count upward from the ground. */
  function fcol(ctx, x, y, r0, r1, c) { ctx.fillStyle = c; ctx.fillRect(x, y - r1 * FPX, FPX, (r1 - r0) * FPX); }
  /** The centre line of a slab box in screen space: [x0, y0, x1, y1] (the long axis), and whether it runs along world x. */
  function spanOf(box) {
    const [x0, y0, x1, y1] = box, alongX = (x1 - x0) >= (y1 - y0);
    const [ax, ay] = alongX ? project(x0, (y0 + y1) / 2) : project((x0 + x1) / 2, y0), [bx, by] = alongX ? project(x1, (y0 + y1) / 2) : project((x0 + x1) / 2, y1);
    return [ax, ay, bx, by];
  }
  /** One 3-row inked rail along the span: ink above and below, wood between with a lit top row and a little grain. t0..t1: the part of the span to paint. */
  function pixelRail(g, sp, lift, t0 = 0, t1 = 1) {
    const ctx = g.ctx, [ax, ay, bx, by] = sp, n = Math.max(1, Math.round(Math.abs(bx - ax) / FPX)), r0 = Math.round(lift / FPX);
    for (let i = Math.floor(n * t0); i < Math.ceil(n * t1); i++) {
      const t = (i + 0.5) / n, x = snap(ax + (bx - ax) * t), y = snap(ay + (by - ay) * t);
      fcol(ctx, x, y, r0 - 1, r0, F_INK); fcol(ctx, x, y, r0, r0 + 1, F_WOOD[0]); fcol(ctx, x, y, r0 + 1, r0 + 3, F_WOOD[1]);
      if (i % 5 === 2) fcol(ctx, x, y, r0 + 2, r0 + 3, F_WOOD[0]);                                // a grain mark
      fcol(ctx, x, y, r0 + 3, r0 + 4, F_WOOD[2]); fcol(ctx, x, y, r0 + 4, r0 + 5, F_WOOD[3]); fcol(ctx, x, y, r0 + 5, r0 + 6, F_INK);
    }
  }
  /** A square post with a pale cap, ink all round, lit on its left face (art pixels: 4 wide, 20 tall). */
  function pixelPost(g, x, y) {
    const ctx = g.ctx, x0 = snap(x) - 2 * FPX;
    fcol(ctx, x0, y, 0, 21, F_INK); fcol(ctx, x0 + 3 * FPX, y, 0, 21, F_INK);                       // ink sides
    fcol(ctx, x0 + FPX, y, 0, 19, F_WOOD[2]); fcol(ctx, x0 + 2 * FPX, y, 0, 19, F_WOOD[1]);          // lit left, shaded right
    fcol(ctx, x0 + FPX, y, 6, 7, F_WOOD[1]); fcol(ctx, x0 + FPX, y, 13, 14, F_WOOD[1]);               // grain
    fcol(ctx, x0 + 2 * FPX, y, 4, 5, F_WOOD[0]); fcol(ctx, x0 + 2 * FPX, y, 11, 12, F_WOOD[0]);
    fcol(ctx, x0 - FPX, y, 19, 20, F_INK); fcol(ctx, x0 + 4 * FPX, y, 19, 20, F_INK);                // the cap overhangs the post
    fcol(ctx, x0, y, 19, 20, F_WOOD[3]); fcol(ctx, x0 + FPX, y, 19, 20, F_WOOD[3]); fcol(ctx, x0 + 2 * FPX, y, 19, 20, F_WOOD[2]); fcol(ctx, x0 + 3 * FPX, y, 19, 20, F_WOOD[1]);
    fcol(ctx, x0 - FPX, y, 20, 21, F_INK); fcol(ctx, x0, y, 20, 21, F_INK); fcol(ctx, x0 + FPX, y, 20, 21, F_INK); fcol(ctx, x0 + 2 * FPX, y, 20, 21, F_INK); fcol(ctx, x0 + 3 * FPX, y, 20, 21, F_INK); fcol(ctx, x0 + 4 * FPX, y, 20, 21, F_INK);
    fcol(ctx, x0, y, -1, 0, F_INK); fcol(ctx, x0 + FPX, y, -1, 0, F_INK); fcol(ctx, x0 + 2 * FPX, y, -1, 0, F_INK); fcol(ctx, x0 + 3 * FPX, y, -1, 0, F_INK);   // the foot
  }
  /** A plank panel between the rails with a diagonal brace (t0..t1 of the whole gate, so the brace runs through its chunks). */
  function pixelPanel(g, sp, lift0, lift1, t0, t1, g0 = 0, g1 = 1) {
    const ctx = g.ctx, [ax, ay, bx, by] = sp, n = Math.max(1, Math.round(Math.abs(bx - ax) / FPX)), r0 = Math.round(lift0 / FPX), r1 = Math.round(lift1 / FPX);
    for (let i = Math.floor(n * t0); i < Math.ceil(n * t1); i++) {
      const t = (i + 0.5) / n, x = snap(ax + (bx - ax) * t), y = snap(ay + (by - ay) * t), tg = g0 + (g1 - g0) * t;
      fcol(ctx, x, y, r0, r1, i % 3 === 0 ? F_PLANK[0] : i % 3 === 1 ? F_PLANK[1] : F_PLANK[2]);
      if (i % 5 === 4) fcol(ctx, x, y, r0, r1, '#5a3a1e');                                         // a seam between planks
      const brace = r0 + 1 + Math.round(tg * (r1 - r0 - 4));                                      // the diagonal brace, two pixels thick, inked
      fcol(ctx, x, y, brace - 1, brace + 3, F_INK); fcol(ctx, x, y, brace, brace + 2, F_WOOD[2]);
    }
  }
  const RAIL_LIFTS = [6, 19];
  function drawFenceFrame(g, chunk) {
    const sp = spanOf(chunk.box);
    for (const lift of RAIL_LIFTS) pixelRail(g, sp, lift);                                          // two rails ...
    if (chunk.index === 0) pixelPost(g, sp[0], sp[1]);                                              // ... between a post at each end of a tile's fence
    if (chunk.index === WALL_CHUNK_COUNT - 1) pixelPost(g, sp[2], sp[3]);
  }

  function drawGateChunk(g, chunk) {                              // closed gate: the fence frame plus a braced plank panel through the middle
    const sp = spanOf(chunk.box);
    if (chunk.index === 1 || chunk.index === 2) pixelPanel(g, sp, 5, 28, 0, 1, (chunk.index - 1) / 2, chunk.index / 2);
    drawFenceFrame(g, chunk);
    if (chunk.index === 1) pixelPost(g, sp[0], sp[1]);                                              // the gate's own posts
    if (chunk.index === 2) pixelPost(g, sp[2], sp[3]);
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

  /* ---- the stable and the barn: big buildings the size of the village's houses, ray-cast by the same pixel-art painter (pixelBuildings.js).
   *  Their tiles are drawn as slices, one per front tile, exactly like a house. ---- */
  const FARM_LOOKS = {
    stable: { wall: '#d9c18c', roof: '#8a3f2f', trim: '#4a3322', stone: '#8d8a83', glass: '#aab7e4', infill: 'planks', chimney: false, dormer: false, props: ['hay', 'barrels', 'lantern'] },
    barn:   { wall: '#b4382c', roof: '#5d4c47', trim: '#efe3cc', stone: '#8d8a83', glass: '#aab7e4', infill: 'planks', chimney: false, dormer: true, props: ['hay', 'crates', 'hay', 'lantern'] }
  };
  const farmSites = new Map();                                                                     // 'type@tx,ty' -> the house-like description PixelBuildings paints from
  function farmSite(a) {
    const id = `${a.type}@${a.tx},${a.ty}`;
    let site = farmSites.get(id);
    if (!site) {
      const def = StructureDefs[a.type], door = def.door || 1;
      site = { index: 'farm:' + id, id, x0: a.tx, y0: a.ty, x1: a.tx + a.w - 1, y1: a.ty + a.h - 1, w: a.w, h: a.h, facing: 's', doorX: a.tx + door, doorY: a.ty + a.h - 1, def: { name: def.name, exterior: FARM_LOOKS[a.type] } };
      farmSites.set(id, site);
    }
    return site;
  }
  /** One tile of a stable or barn: its slice of the building (the building is painted once). Returns nothing for a tile that is not on its front. */
  function drawFarmTile(g, info, type, tx, ty) {
    const a = info && info.anchor; if (!a) return;
    const site = farmSite(a);
    if (a.tx === tx && a.ty === ty && !info.complete) { for (const [x, y] of footprintOf(a.type, a.tx, a.ty)) PixelBuildings.drawTile(g.ctx, site, x, y); return; }   // (an old, one-tile stable: draw all of it from the anchor)
    PixelBuildings.drawTile(g.ctx, site, tx, ty);
    if (tx === site.doorX && ty === site.y1) {                                                      // the picture on the hanging sign by the door
      const sg = PixelBuildings.signAt(site), ctx = g.ctx;
      ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a1c10';
      ctx.fillText(a.type === 'barn' ? '\u{1F33E}' : '\u{1F40E}', sg.x + 5 * PixelBuildings.ART, sg.y + 8 * PixelBuildings.ART);
    }
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
    else if (StructureDefs[type].size || StructureDefs[type].partOf) drawFarmTile(g, info, type, tx, ty);
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
    else if (target.layer === 'station' && StructureDefs[target.structure].size) {                   // a big building: its whole footprint and the building itself
      const a = { type: target.structure, tx: target.tx, ty: target.ty, w: StructureDefs[target.structure].size[0], h: StructureDefs[target.structure].size[1] };
      ctx.globalAlpha = 1;
      for (const [fx, fy] of footprintOf(a.type, a.tx, a.ty)) {
        const [px, py] = project(fx, fy); ctx.beginPath(); ctx.moveTo(px, py + 0); ctx.lineTo(px + TILE_HALF_W, py + TILE_HALF_H); ctx.lineTo(px, py + 2 * TILE_HALF_H); ctx.lineTo(px - TILE_HALF_W, py + TILE_HALF_H); ctx.closePath();
        ctx.fillStyle = `rgba(${rgb},.22)`; ctx.fill(); ctx.strokeStyle = `rgba(${rgb},.7)`; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.globalAlpha = target.valid ? 0.7 : 0.4;
      for (const [fx, fy] of footprintOf(a.type, a.tx, a.ty)) PixelBuildings.drawTile(ctx, farmSite(a), fx, fy);
    }
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

  return { draw, drawBuiltChunk, drawDoorLeaf, openDoorLeafBox, drawStation, drawFloor, drawGhost, sealed: null };      // sealed(o, tx, ty): is this cave mouth still shut? (set by main.js)
})();
