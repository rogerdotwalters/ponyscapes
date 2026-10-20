'use strict';
/* CLIENT - orchestrates a frame. Reads state, never mutates it. */
const WALL_CHUNKS = 4;

const FLY_HEIGHT = 46;                                    // pixels a flying pegasus and its rider are drawn above the ground at full height

class Renderer {
  get backend() { return 'canvas'; }

  constructor({ canvas, game, effects, getTapMarker, ctxOptions = { alpha: false } }) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', ctxOptions);        // (the Pixi backend draws what is still canvas art into a transparent layer: pixiRenderer.js)
    this.g = new Gfx(this.ctx); this.game = game; this.effects = effects; this.getTapMarker = getTapMarker;
    this.camera = new Camera(); this.playerSprite = new PlayerSprite(this.g); this.boatSprite = new BoatSprite(this.g); this.animalSprite = new AnimalSprite(this.g); this.lighting = new Lighting(); this.builtItems = [];
    game.events.on('builtChanged', () => this.rebuildBuilt());
    game.events.on('gridChanged', () => this.rebuildBuilt());                       // (another grid: its own buildings, or none)
  }

  resize() {
    const { pixelW, pixelH } = this.camera.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
    this.canvas.width = pixelW; this.canvas.height = pixelH;
  }

  /** Structures and props of one chunk, built once and kept on the chunk (they are dropped with it). */
  _chunkItems(chunk) {
    if (chunk.renderItems) return chunk.renderItems;
    const items = [];
    for (let ly = 0; ly < CHUNK_SIZE; ly++) for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const o = chunk.obj[(ly << CHUNK_SHIFT) | lx];
      if (!o) continue;
      const tx = chunk.cx * CHUNK_SIZE + lx, ty = chunk.cy * CHUNK_SIZE + ly, item = { kind: 'structure', depth: tx + ty + 1, o, tx, ty, gx: (tx - ty) * TILE_HALF_W, gy: (tx + ty + 1) * TILE_HALF_H };
      const plan = this.game.map.plan;
      if (o >= INTERIOR_OBJ_BASE && plan && plan.wallIsLow) {                           // a room's wall: low at the front, a window on the side facing in
        Object.assign(item, { low: plan.wallIsLow(tx, ty), windowS: plan.isFloor(tx, ty + 1), windowE: plan.isFloor(tx + 1, ty) });
      }
      if (isCliffObj(o) || o === OBJ.CAVEMOUTH) item.look = this.game.map.biome(tx, ty);                          // a cliff is the colour of its zone's biome
      items.push(item);
    }
    for (const prop of chunk.props) {
      let depth = prop.x + prop.y;
      if (prop.t === 'furniture') {                                                      // a rug lies flat: it sorts by its back corner, so it is never drawn over someone standing on its near half
        const def = FurnitureDefs.get(prop.id);
        if (def && !def.height && !def.solid) depth -= (prop.w + prop.h) / 2 + 0.01;
        else if (def && def.stall && prop.w >= 3 && prop.h >= 3) depth -= (prop.w + prop.h) / 2 - 0.05;        // a roomy pen is a low straw floor with a trough and a hay heap at its back: it sorts by its back corner, so people and ponies standing in it are drawn over the straw
        else if (def && def.poster) depth -= prop.h / 2 - 0.06;                         // a wall poster sorts by the wall it hangs on (the back edge of its tile), so anyone standing in front of it is drawn over it
      }
      items.push({ kind: 'prop', depth, prop, key: tileKey(Math.floor(prop.x), Math.floor(prop.y)), gx: isoX(prop.x, prop.y), gy: isoY(prop.x, prop.y) });
    }
    items.sort((a, b) => a.depth - b.depth);                                          // (sorted once here: the frame only merges sorted lists)
    return (chunk.renderItems = items);
  }

  /** Player-built walls change at runtime, so they live in their own list. A long slab is cut into short
   *  chunks so the painter's algorithm can slot players in front of / behind each part of it correctly. */
  rebuildBuilt() {
    const map = this.game.map;
    this.builtItems = []; this.builtVersion = (this.builtVersion || 0) + 1;
    for (const key of Object.keys(map.built)) {
      const tx = keyTileX(key), ty = keyTileY(key);
      for (const slot of Object.keys(map.built[key])) {
        const type = map.built[key][slot];
        if (slot === 'c') { this.builtItems.push({ kind: 'station', depth: tx + ty + 1, type, tx, ty, gx: (tx - ty) * TILE_HALF_W, gy: (tx + ty + 1) * TILE_HALF_H }); continue; }
        if (type === 'wood_door_open' || type === 'wood_gate_open') {      // an open door / gate is a single leaf, not a chunked slab
          const box = StructureSprites.openDoorLeafBox(tx, ty, slot), cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
          this.builtItems.push({ kind: 'doorLeaf', depth: cx + cy, box, low: type === 'wood_gate_open', gx: isoX(cx, cy), gy: isoY(cx, cy) });
          continue;
        }
        const [x0, y0, x1, y1] = slabBox(tx, ty, slot), alongX = slot === 'n' || slot === 's';
        for (let c = 0; c < WALL_CHUNKS; c++) {
          const f0 = c / WALL_CHUNKS, f1 = (c + 1) / WALL_CHUNKS;
          const box = alongX ? [lerp(x0, x1, f0), y0, lerp(x0, x1, f1), y1] : [x0, lerp(y0, y1, f0), x1, lerp(y0, y1, f1)];
          const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
          this.builtItems.push({ kind: 'built', depth: cx + cy, structure: type, slot, index: c, box, gx: isoX(cx, cy), gy: isoY(cx, cy) });
        }
      }
    }
    this.builtItems.sort((a, b) => a.depth - b.depth);
  }

  render(state, frameMs, now) {
    this.players = state.players; this.npcsNow = state.npcs; PixelPony.beginFrame();
    const me = state.players[this.game.myId], ctx = this.ctx;
    this.camera.follow(isoX(me.x, me.y), isoY(me.x, me.y) - 18, frameMs);

    const indoors = this.game.map.kind !== 'world';                                  // a room or a cave: darkness all round
    this._beginFrame(indoors);
    this.camera.applyTransform(ctx);
    const bounds = this.camera.bounds();
    SpriteCache.scale = this.camera.scale;                                           // (shadows and name tags are baked at this scale: spriteCache.js)

    const tiles = this.camera.visibleTiles();
    const date = Seasons.at(this.game.clockTick);                                   // the season colours the grass and the trees; watered soil stays dark today
    TerrainRenderer.setDate(date.season.id, date.day); PropSprites.seasonTint = date.season.treeTint;
    if (!this.groundLook || this.groundMap !== this.game.worldMap) { this.groundMap = this.game.worldMap; this.groundLook = (x, y) => TerrainRenderer.lookOf(this.groundMap, x, y); PixelBuildings.useGround(this.groundLook); }   // buildings meet the ground they stand on
    TerrainRenderer.setScale(this.camera.scale); TerrainRenderer.draw(this.g, this.game.map, bounds, tiles, now, this.blockSink);
    const movers = [];                                                              // whoever pushes the grass aside (grassRenderer.js)
    for (const group of [state.players, state.animals, state.npcs]) for (const id in (group || {})) { const m = group[id]; if (m && !m.boat && !m.flying) movers.push(m); }
    this.nearGrass = GrassRenderer.draw(this.ctx, this.game.map, bounds, tiles, this.game.clockTick, now, movers, this.grassSink);
    this._drawTapMarker(now);
    this._drawWorld(this._sortedWorldItems(state, bounds, tiles), now);
    if (!indoors) this._drawBuildingNames(me);
    this._drawLighting(me, state);
    this._drawWeather(frameMs);                      // clouds, rain, snow and lightning over the night, under the particles
    this._drawEffects(frameMs);                      // particles and floating text sit above the night overlay
    this._endFrame();
  }

  /** The depth-sorted items, back to front. (PixiRenderer turns each into a sprite instead; it then draws what comes after on its own layer.) */
  _drawWorld(items, now) { for (const item of items) this._drawItem(item, now); }

  /** Backend hooks. The canvas backend paints the background itself and has nothing to finish; PixiRenderer overrides both (and sets `blockSink`). */
  _beginFrame(indoors) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = indoors ? '#0b0d12' : OCEAN_COLOR; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  _endFrame() {}
  _drawEffects(frameMs) { this.effects.draw(this.g, frameMs); }
  /** The sky (weatherFx.js), painted in screen space on whatever surface is on top now. */
  _drawWeather(frameMs) {
    (this.fireflies || (this.fireflies = new Fireflies(this.game))).draw(this.ctx, this.canvas.width, this.canvas.height, performance.now(), this.camera);      // (night only: fireflies.js)
    const fx = this.effects.weather; if (!fx) return;
    fx.draw(this.ctx, this.canvas.width, this.canvas.height, frameMs / 1000, this.camera.dpr, this.camera);
    this.camera.applyTransform(this.ctx);
  }

  /** Time-of-day overlay, centred on the player, with pools of light from torches and campfires. */
  _drawLighting(me, state) {
    const cam = this.camera, s = cam.scale, toScreen = (wx, wy, lift = 0) => [(isoX(wx, wy) - cam.x + cam.w / 2) * s, (isoY(wx, wy) - lift - cam.y + cam.h / 2) * s];
    const [px, py] = toScreen(me.x, me.y, 18);
    const dark = DayCycle.daylight(this.game.hour()) < CONFIG.sim.light.darkBelow;
    let found = LightSources.collect(this.game.map, Object.values(state.players), state.animals, dark);
    if (this.game.map.kind === 'world' && DayCycle.daylight(this.game.hour()) < CONFIG.sim.light.darkBelow + 0.25) {      // the lanterns beside the village doors come on at dusk (looks only: spiders ignore them)
      for (const site of BuildingSites.list) {
        const ex = site.def.exterior || {};
        if (!(ex.props || ['lantern']).includes('lantern') || Math.hypot(site.doorX - me.x, site.doorY - me.y) > 40) continue;
        found.push({ x: site.facing === 'e' ? site.doorX + 1 : site.doorX + 0.5, y: site.facing === 'e' ? site.doorY + 0.5 : site.doorY + 1, radius: 4.5, kind: 'lantern' });
      }
    }
    if (found.length > CONFIG.view.maxLightsTouch && matchMedia('(pointer: coarse)').matches) {          // phones: each light is a full-screen gradient, so keep the nearest few
      const near = l => Math.hypot(l.x - me.x, l.y - me.y);
      found = found.sort((a, b) => near(a) - near(b)).slice(0, CONFIG.view.maxLightsTouch);
    }
    const lights = found.map(l => {
      const [x, y] = toScreen(l.x, l.y, l.kind === 'torch' ? 24 : l.kind === 'lantern' ? 30 : l.kind === 'pony' ? 22 : 6);
      const flick = lightFlicker(l.kind, l.x, l.y, performance.now());                // the flame's brightness; the pool of light breathes with it
      return { x, y, radius: l.radius * TILE_TO_SCREEN * TILE_HALF_W * s * (1 + (flick - 1) * 0.5), kind: l.kind, flick, rgb: l.look ? PonyLook.auraRgb(l.look) : undefined };   // (a pony's light shines in its own colour)
    });
    this.lighting.draw(this.ctx, this.canvas.width, this.canvas.height, this.game.map.kind === 'cave' || this.game.map.kind === 'dungeon' ? 0 : this.game.map.kind === 'room' || this.game.map.kind === 'roundup' ? 12 : this.game.hour(), px, py, s, lights);      // (the round-up is always played in daylight)
    this.camera.applyTransform(this.ctx);
  }

  /** The name of each building near you, on a little banner above its door. */
  _drawBuildingNames(me) {
    const ctx = this.ctx;
    for (const site of BuildingSites.list) {
      const f = BuildingSites.doorFront(site);
      if (Math.hypot(f.x - me.x, f.y - me.y) > 14) continue;
      const nx = site.facing === 'e' ? site.doorX + 1 : site.doorX + 0.5, ny = site.facing === 'e' ? site.doorY + 0.5 : site.doorY + 1, x = isoX(nx, ny), y = isoY(nx, ny) - PixelBuildings.groundFloorHeight() - 50;   // (over the door, below the eaves)
      ctx.font = '600 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(site.def.name).width + 16;
      this.g.roundRect(x - w / 2, y - 10, w, 20, 8); ctx.fillStyle = 'rgba(20,28,40,.78)'; ctx.fill();
      ctx.fillStyle = site.def.exterior.sign || '#f4e6c1'; ctx.fillText(site.def.name, x, y + 0.5);
    }
  }

  /** A speech bubble above someone's head, its text wrapped to a few short lines. */
  _drawBubble(g, sx, bottom, text) {
    const ctx = g.ctx; if (typeof ctx.cut === 'function') ctx.cut();                                  // (the Pixi backend: the bubble is a picture of its own)
    ctx.font = '11px Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const words = text.split(' '), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > 150 && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    const lh = 14, width = Math.max(...lines.map(l => ctx.measureText(l).width)) + 14, height = lines.length * lh + 8, x0 = sx - width / 2, y0 = bottom - height;
    g.roundRect(x0, y0, width, height, 8); ctx.fillStyle = 'rgba(255,252,240,.96)'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(60,40,20,.7)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 5, bottom - 0.5); ctx.lineTo(sx + 1, bottom + 7); ctx.lineTo(sx + 5, bottom - 0.5); ctx.closePath(); ctx.fillStyle = 'rgba(255,252,240,.96)'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a1c10'; lines.forEach((l, i) => ctx.fillText(l, x0 + 7, y0 + 4 + lh / 2 + i * lh));
    if (typeof ctx.cut === 'function') ctx.cut();
  }

  /** Everything that never moves (the chunks' structures and props, the player-built walls), depth-sorted. It is merged and sorted again only when the
   *  chunks in view, a chunk's list or the built walls change, not every frame. */
  _staticSorted(tiles) {
    const lists = [], sig = [this.builtVersion, tiles.tx0 >> CHUNK_SHIFT, tiles.tx1 >> CHUNK_SHIFT, tiles.ty0 >> CHUNK_SHIFT, tiles.ty1 >> CHUNK_SHIFT, this.game.map];
    for (let cy = tiles.ty0 >> CHUNK_SHIFT; cy <= tiles.ty1 >> CHUNK_SHIFT; cy++) for (let cx = tiles.tx0 >> CHUNK_SHIFT; cx <= tiles.tx1 >> CHUNK_SHIFT; cx++) lists.push(this._chunkItems(this.game.map.chunk(cx, cy)));
    const c = this._staticCache;
    if (c && c.sig.length === sig.length && c.sig.every((v, i) => v === sig[i]) && c.lists.length === lists.length && c.lists.every((l, i) => l === lists[i])) return c.items;
    const items = this.builtItems.slice();
    for (const l of lists) for (const item of l) items.push(item);
    items.sort((a, b2) => a.depth - b2.depth);
    this._staticCache = { sig, lists, items };
    return items;
  }

  /** The crops and saplings of the fields, indexed once per farm table (the client is handed a whole new table whenever a field changes). */
  _farmItems(farm) {
    if (this._farmIndex && this._farmIndex.farm === farm) return this._farmIndex.list;
    const list = [];
    for (const key in farm) {
      const plot = farm[key];
      if (Groves.isKey(key)) {                                                       // a sapling growing (groves.js); a grown one is a tree prop
        if (plot.g) continue;
        const [tx, ty] = Groves.tileOf(key);
        list.push({ kind: 'sapling', depth: tx + ty + 0.9, gx: isoX(tx + 0.5, ty + 0.5), gy: isoY(tx + 0.5, ty + 0.5), plot, tx, ty });
        continue;
      }
      if (!Farming.isKey(key)) continue;
      const [tx, ty] = Farming.tileOf(key);                                           // a field: each covered crop stands on its own plot
      for (let n = 0; n < 9; n++) {
        const cell = plot.cells[n];
        if (!cell.c || !cell.v) continue;
        const wx = tx + (n % 3 + 0.5) / 3, wy = ty + (Math.floor(n / 3) + 0.5) / 3;
        list.push({ kind: 'crop', depth: wx + wy - 0.1, gx: isoX(wx, wy), gy: isoY(wx, wy), plot: cell, tx, ty, sway: tx * 131 + ty + n * 17 });      // (each plot sways on its own)
      }
    }
    this._farmIndex = { farm, list };
    return list;
  }

  _sortedWorldItems(state, b, tiles) {
    const visible = s => s.gx > b.minX - 70 && s.gx < b.maxX + 70 && s.gy > b.minY - 20 && s.gy < b.maxY + 230;
    const still = [];
    for (const item of this._staticSorted(tiles)) if (visible(item)) still.push(item);       // (filtering keeps the order)
    const moving = [];
    const target = this.game.buildTarget;
    if (target) moving.push({ kind: 'ghost', depth: target.tx + target.ty + 1, target, gx: (target.tx - target.ty) * TILE_HALF_W, gy: (target.tx + target.ty + 1) * TILE_HALF_H });
    for (const id in state.animals) { const a = state.animals[id]; moving.push({ kind: 'animal', depth: a.x + a.y + (a.rider ? (SpriteRegistry.dirOf(a.facing) === 'down' ? 0.05 : -0.05) : 0) + (a.lift || 0) * 4, id, animal: a }); }   // a ridden pony is drawn just under its rider (but over it when it faces the camera: its head and chest come before the rider)
    for (const id in (state.npcs || {})) { const n = state.npcs[id]; moving.push({ kind: 'npc', depth: n.x + n.y, id, npc: n }); }
    for (const gr of this.nearGrass || []) moving.push({ kind: 'grass', depth: gr.depth, draw: gr.draw });   // the grass around people's feet
    for (const piece of RainbowTrail.items(performance.now())) moving.push(piece);                           // the rainbows ponies leave behind them, in pieces sorted by depth (rainbowTrail.js)
    const farm = this.game.map.farm;                                                 // crops growing in the fields (farming.js)
    if (farm) for (const item of this._farmItems(farm)) if (item.tx >= tiles.tx0 && item.tx <= tiles.tx1 && item.ty >= tiles.ty0 && item.ty <= tiles.ty1) moving.push(item);
    this.frameState = state;
    { const fx = this.coinFx || (this.coinFx = { sims: new Map(), base: null }); if (fx.base === null) { fx.base = 0; for (const id in (state.drops || {})) fx.base = Math.max(fx.base, parseInt(id.slice(1), 10) || 0); } }   // (piles already lying there when the game starts do not get thrown)
    for (const id in (state.drops || {})) { const d = state.drops[id]; moving.push({ kind: 'drop', depth: d.x + d.y - 0.3, gx: isoX(d.x, d.y), gy: isoY(d.x, d.y), drop: d }); }   // items dropped on the ground
    if (this.game.map.kind === 'world') for (const node of PuzzleNodes.all()) moving.push({ kind: 'puzzleNode', depth: node.x + node.y, gx: isoX(node.x, node.y), gy: isoY(node.x, node.y), node });   // the old stones (questSystem.js)
    for (const id in state.boats) { const boat = state.boats[id]; moving.push({ kind: 'boat', depth: boat.x + boat.y - 0.25, id, boat }); }   // under its rider
    for (const id in state.players) { const p = state.players[id]; moving.push({ kind: 'player', depth: p.x + p.y + (p.lift || 0) * 4, id, p }); }
    moving.sort((a, b2) => a.depth - b2.depth);                                      // painter's algorithm on x + y: sort the few that move, then merge
    const out = new Array(still.length + moving.length);
    let i = 0, j = 0, k = 0;
    while (i < still.length && j < moving.length) out[k++] = still[i].depth <= moving[j].depth ? still[i++] : moving[j++];
    while (i < still.length) out[k++] = still[i++];
    while (j < moving.length) out[k++] = moving[j++];
    return out;
  }

  _drawItem(item, now) {
    if (item.kind === 'trail') return RainbowTrail.drawPiece(this.ctx, item, now);
    if (item.kind === 'grass') { const sm = this.ctx.imageSmoothingEnabled; this.ctx.imageSmoothingEnabled = false; item.draw(); this.ctx.imageSmoothingEnabled = sm; return; }
    const g = this.g;
    if (item.kind === 'structure') return StructureSprites.draw(g, item, item.gx, item.gy);
    if (item.kind === 'built') return StructureSprites.drawBuiltChunk(g, item);
    if (item.kind === 'station') return StructureSprites.drawStation(g, item.type, item.tx, item.ty, this._stationInfo(item));
    if (item.kind === 'doorLeaf') return StructureSprites.drawDoorLeaf(g, item);
    if (item.kind === 'ghost') return StructureSprites.drawGhost(g, item.target, item.gx, item.gy);
    if (item.kind === 'animal') {
      const a = item.animal, sx = isoX(a.x, a.y), sy = isoY(a.x, a.y);
      const me = this.game.local, lvs = me.lv ? me.lv.s : {}, def = AnimalDefs[a.type];
      const close = Math.hypot(a.x - me.x, a.y - me.y), friend = this.game.friendOf(item.id);
      const view = { friend, invite: !friend && close < 2.8 && canBefriendAnimal(a.type) && !a.captor && a.state !== 'flee', near: close < 9, wantNear: close < (def.boss ? 16 : 9), holding: this.game.heldItemId(), ref: def.pony || def.tameable ? (lvs.horsemanship || 1) : (lvs.hunting || 1) };   // level colours compare with the skill you would use on it
      if (a.rs) { view.near = false; view.invite = false; view.wantNear = false; if (a.rs.g) RoundupSprites.goldAura(this.ctx, sx, sy, now); if (a.rs.s !== 'free') RoundupSprites.ring(this.ctx, sx, sy, 15, 6, a.rs.t); }      // a Round-Up sheep: no name tag, a ring in the colour of the side that has it
      const lift = a.lift || 0;
      if (lift > 0) g.ellipse(sx, sy + 3, 20 * (1 - 0.3 * lift), 7 * (1 - 0.3 * lift), `rgba(0,0,0,${(0.3 * (1 - 0.4 * lift)).toFixed(2)})`);        // the shadow stays on the ground as the pair climbs
      if (a.foal > 0) { const k = 0.62 + 0.38 * (1 - a.foal); this.ctx.save(); this.ctx.translate(sx, sy); this.ctx.scale(k, k); this.ctx.translate(-sx, -sy); }          // a foal is smaller until it has grown
      this.animalSprite.draw(a, item.id, sx, sy - lift * FLY_HEIGHT, now, view);
      if (a.foal > 0) this.ctx.restore();
      if (a.rs) { this._drawRoundupRope(a, sx, sy, now); if (a.rs.g) RoundupSprites.goldSparkle(this.ctx, sx, sy, now); }
      const holder = a.owner || a.captor;
      if (a.leashed && holder && this.players && this.players[holder]) this._drawLeash(sx, sy, a, this.players[holder]);
      if (a.captor && a.tame !== undefined) { this._drawTameBar(sx, sy - lift * FLY_HEIGHT, a.tame, now); this._drawRopeBar(sx, sy - lift * FLY_HEIGHT, a.rope === undefined ? 1 : a.rope, now); }
      else if (a.breed !== undefined) this._drawTameBar(sx, sy - lift * FLY_HEIGHT, a.breed, now);                      // breeding in a stall: the same rainbow bar
      return;
    }
    if (item.kind === 'npc') {                                                           // a villager: drawn with the same sprite as a player
      const n = item.npc, sx = isoX(n.x, n.y), sy = isoY(n.x, n.y), def = Npcs.get(n.type), friend = this.game.friendOf(item.id), close = Math.hypot(n.x - this.game.local.x, n.y - this.game.local.y);
      if (n.type === 'roundup_rival') RoundupSprites.ring(this.ctx, sx, sy, 14, 6, 1);
      const pose = this.playerSprite.draw({ id: item.id, slot: [...item.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 8, name: def ? `${n.name} \u00b7 ${def.role}` : n.name, appearance: n.look, gear: n.gear, x: n.x, y: n.y, vx: n.vx, vy: n.vy, facing: n.facing, state: n.state === 'walk' ? 'walk' : 'idle', held: '', swingT: 0, hurtT: 0, mount: '', boat: '', emote: '', emoteT: 0 }, item.id, sx, sy, false, now, 0, false);
      const top = pose.headY - 40;
      if (friend || close < 2.8) HeartMeter.draw(g.ctx, sx, top, friend, now);
      const mark = n.say ? '' : QuestLog.markerFor(this.game.questLog, n.type);                // a ! or ? over someone with a quest (not while they talk)
      if (mark) QuestSprites.marker(g.ctx, sx, top - 12, mark, now);
      if (n.say) this._drawBubble(g, sx, top - 44, n.say);                          // (above the floating +hearts / +xp text that rises from the head)
      return;
    }
    if (item.kind === 'drop') return this._drawDrop(item.gx, item.gy, item.drop, now);
    if (item.kind === 'puzzleNode') return QuestSprites.node(this.ctx, item.gx, item.gy, item.node, !!QuestLog.needing(this.game.questLog, item.node.id), now);
    if (item.kind === 'crop') return PixelCrops.draw(this.ctx, item.gx + this.effects.sway(item.sway, now, 2), item.gy, item.plot, FIELD_CROP_SCALE);   // (bending in the wind)
    if (item.kind === 'sapling') { const biome = this.game.map.biome(item.tx, item.ty); return PixelProps.drawSapling(this.ctx, item.gx + this.effects.sway(item.tx * 131 + item.ty, now, 3), item.gy, item.plot.t, Groves.growth(item.plot), TREE_TINT[biome] || PropSprites.seasonTint); }
    if (item.kind === 'boat') return this.boatSprite.draw(item.boat, item.id, isoX(item.boat.x, item.boat.y), isoY(item.boat.x, item.boat.y), now);
    if (item.kind === 'player') {
      const p = item.p;
      if (p.asleep) return this._drawSleeper(g, isoX(p.x, p.y), isoY(p.x, p.y), p, now);
      const rowPhase = p.boat ? this.boatSprite.phaseOf(p.boat) : 0;
      const wading = !p.boat && !p.mount && this.game.map.tile(Math.floor(p.x), Math.floor(p.y)) === TILE.SHALLOW;
      if ((p.rt === 0 || p.rt === 1) && this.game.roundup) RoundupSprites.ring(this.ctx, isoX(p.x, p.y), isoY(p.x, p.y), 14, 6, p.rt);      // in a Round-Up: a ring in the colour of your side
      return this.playerSprite.draw(p, item.id, isoX(p.x, p.y), isoY(p.x, p.y) - (p.lift || 0) * FLY_HEIGHT, item.id === this.game.myId, now, rowPhase, wading);
    }
    const prop = item.prop;
    if (prop.t === 'tree') {
      if (prop.alive) PropSprites.drawTree(g, item.gx, item.gy, prop.v, this.effects.treeShakeX(item.key, now), prop.forage ? prop : null, this.game.map.biome(Math.floor(prop.x), Math.floor(prop.y)), prop.sp);
      else {
        PropSprites.drawStump(g, item.gx, item.gy);
        const fall = this.effects.fall(item.key, now);                                  // just felled: the tree topples, then breaks into logs
        if (fall) PropSprites.drawFallingTree(g, item.gx, item.gy, prop.v, fall.angle, fall.alpha, this.game.map.biome(Math.floor(prop.x), Math.floor(prop.y)), prop.sp);
      }
    } else if (prop.t === 'bush' && prop.plant === 'mushroom') {
      PropSprites.drawMushroom(g, item.gx, item.gy, prop, this.effects.treeShakeX(item.key, now, 1.5));
    } else if (prop.t === 'bush') {
      for (const id in this.players || {}) { const q = this.players[id]; if (q && !q.flying && Math.hypot(q.x - prop.x, q.y - prop.y) < 0.55) { this.effects.rustle(item.key, prop.x, prop.y); break; } }      // brushing past shakes it, as a tree shakes when chopped
      PropSprites.drawBush(g, item.gx, item.gy, prop, this.effects.treeShakeX(item.key, now, 2.5), this.game.map.biome(Math.floor(prop.x), Math.floor(prop.y)));
    }
    else if (prop.t === 'hedge') { if (prop.alive) PropSprites.drawHedge(g, item.gx, item.gy, prop, this.effects.treeShakeX(item.key, now, 1.2), this.game.map.biome(Math.floor(prop.x), Math.floor(prop.y))); }
    else if (prop.t === 'stone') { if (prop.ripe) PropSprites.drawStone(g, item.gx, item.gy, prop.v); }
    else if (prop.t === 'flax') PropSprites.drawFlax(g, item.gx, item.gy, prop);
    else if (prop.t === 'chest') PropSprites.drawChest(g, item.gx, item.gy, !!(this.game.local && this.game.local.looted));
    else if (prop.t === 'stalagmite') PixelBuildings.drawSpire(g.ctx, prop.v | 0, item.gx, item.gy);
    else if (prop.t === 'old_fence') RoundupSprites.fence(this.ctx, item.gx, item.gy, prop.v);
    else if (prop.t === 'roundup_sign') RoundupSprites.sign(this.ctx, item.gx, item.gy);
    else if (prop.t === 'flowers') RoundupSprites.flowers(this.ctx, item.gx, item.gy, prop.v, now);
    else if (prop.t === 'roundup_pole') {
      const ru = this.game.roundup;
      RoundupSprites.pole(this.ctx, item.gx, item.gy, prop.team, { score: ru ? ru.teams[prop.team].s : 0 }, now);
    }
    else if (prop.t === 'dungeon_chest') PropSprites.drawChest(g, item.gx, item.gy, !!prop.opened);
    else if (prop.t === 'clay') { if (prop.ripe) PropSprites.drawClay(g, item.gx, item.gy, prop.v); }
    else if (prop.t === 'mound') { if (prop.ripe) PropSprites.drawMound(g, item.gx, item.gy, prop.v, now); }
    else if (prop.t === 'bottle') { if (prop.ripe) PropSprites.drawBottle(g, item.gx, item.gy, prop.v, now); }
    else if (prop.t === 'barrel') PropSprites.drawBarrel(g, item.gx, item.gy);
    else if (prop.t === 'critter_home') PropSprites.drawCritterHome(g, item.gx, item.gy, prop.kind, prop.v);
    else if (prop.t === 'loot') { if (prop.ripe) this._drawLoot(item.gx, item.gy, prop, now); }
    else if (prop.t === 'cave') PropSprites.drawCave(g, item.gx, item.gy, prop.ring, now);
    else if (prop.t === 'portal') PropSprites.drawPortal(g, item.gx, item.gy, now);
    else if (prop.t === 'furniture') {
      const def = FurnitureDefs.get(prop.id);
      if (def && def.store) {                                                               // a bin: how full it is, and a label with its count
        const key = HomeCrafts.storeKey(this.game.grid, { x: Math.round(prop.x - prop.w / 2), y: Math.round(prop.y - prop.h / 2) }), n = HomeCrafts.storeCount(this.game.worldMap, key), cap = def.store.capacity || 500;
        prop.fill = n / cap;
        InteriorSprites.furniture(g, prop, now);
        const ctx = this.ctx, label = `${ItemDefs[def.store.item].name} ${n} / ${cap}`, x = isoX(prop.x, prop.y), y = isoY(prop.x, prop.y) - (def.height || 20) - 26;
        ctx.font = '600 11px Georgia, serif'; ctx.textAlign = 'center'; const w = ctx.measureText(label).width + 12;
        g.roundRect(x - w / 2, y - 8, w, 16, 6); ctx.fillStyle = 'rgba(10,18,28,.62)'; ctx.fill(); ctx.fillStyle = '#f2efe6'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y);
      } else InteriorSprites.furniture(g, prop, now);
    }
    else if (prop.t === 'tracks') { if (!(this.game.defeated || []).includes(prop.ring)) this._drawTracks(item.gx, item.gy, prop, now); }   // (gone once the young are home)
    else PropSprites.drawWell(g, item.gx, item.gy);
  }

  /** Someone asleep in bed: the character themself, lying on the pillow in their own skin, hair and outfit colours under a blanket, drawn in
   *  the same chunky outlined pixels as the rest of the characters, with pixel Zs drifting up. */
  _drawSleeper(g, sx, sy, p, now) {
    const ctx = g.ctx, L = this.playerSprite._look(p.appearance), U = PixelCharacter.util, u = 2, O = '#24170f';
    const breathe = Math.round(Math.sin(now / 700 + (p.slot | 0)) * 0.6);
    sy -= 14;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(sx + x * u), Math.round(sy + y * u), w * u, h * u); };
    const box = (x, y, w, h, c) => { R(x - 1, y - 1, w + 2, h + 2, O); R(x, y, w, h, c); };          // an outlined block
    const hair = L.hair, skin = L.skin, blanket = p.color || L.outfit || '#5b7fb5', trim = L.trim || '#f2c14e';
    g.ellipse(sx, sy + 3, 20, 7, 'rgba(0,0,0,.2)');
    if (p.camping) { box(-17, -4, 36, 11, '#8a6a43'); R(-17, -4, 36, 1, '#a98558'); R(-16, 5, 34, 1, '#6e5233'); R(19, -3, 2, 9, '#5d452b'); }       // camping: a bedroll on the ground
    box(-15, -3, 11, 6, '#f3eee2'); R(-15, -3, 11, 1, '#fffaf0');                                    // the pillow
    box(-13, -9, 8, 8, skin);                                                                         // the head (outlined as a whole)
    R(-13, -9, 8, 3, hair); R(-13, -9, 8, 1, U.light(hair, 0.22)); R(-13, -6, 2, 4, U.shade(hair, 0.9));   // hair over the top and down the back of the head
    if (L.princess || L.hairKind === 'medium' || L.hairKind === 'afro') R(-13, -2, 3, 3, hair);       // long hair spilling onto the pillow
    R(-10, -4, 2, 1, U.shade(skin, 0.45)); R(-7, -4, 2, 1, U.shade(skin, 0.45));                      // closed eyes
    R(-10, -2, 1, 1, U.mix(skin, '#e26a6a', 0.45)); R(-6, -2, 1, 1, U.mix(skin, '#e26a6a', 0.45));    // rosy cheeks
    R(-9, -1, 2, 1, U.shade(skin, 0.65));                                                             // a sleeping mouth
    box(-6, -3 + breathe * 0.5, 17, 7, blanket); R(-6, -3 + breathe * 0.5, 17, 1, U.light(blanket, 0.28)); R(-6, 1, 17, 1, U.shade(blanket, 0.8));
    R(-6, -1, 2, 5, trim);                                                                            // the folded-over trim
    for (let i = 0; i < 4; i++) R(-1 + i * 3, 0, 1, 3, U.shade(blanket, 0.88));                       // blanket folds
    box(11, 0, 3, 3, U.shade(L.shoe || '#6b4428', 1));                                                // a boot poking out at the foot
    ctx.fillStyle = '#e8eeff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < 3; i++) {                                                                     // Z, z, z rising and fading, chunky like pixel text
      const t = ((now / 1800) + i / 3) % 1, z = 7 + i * 3;
      ctx.globalAlpha = Math.sin(t * Math.PI); ctx.font = `bold ${z + 4}px "Courier New", monospace`;
      const x = sx - 4 + t * 16 + i * 2, y = sy - 16 - t * 24;
      ctx.fillStyle = '#24170f'; ctx.fillText('z', x + 1, y + 1); ctx.fillStyle = '#e8eeff'; ctx.fillText('z', x, y);
    }
    ctx.globalAlpha = 1;
  }

  /** The rope between a leashed animal's neck and its owner's hand. */
  /** How full a stockpile is and which level it (or any upgraded building) is at. */
  _stationInfo(item) {
    const map = this.game.map, key = tileKey(item.tx, item.ty), pile = map.stockpiles[key];
    const fill = pile ? Stockpiles.total(pile) / Math.max(1, Stockpiles.capacity(map, key)) : 0;
    return { fill, level: Buildings.level(map, key), anchor: anchorOf(map, item.tx, item.ty), complete: BuildSystem.complete(map, item.tx, item.ty) };           // (anchor: the big building this tile belongs to)
  }

  /** An item lying in the world: its `ground` image, or its icon, bobbing gently over a glow in its rarity's colour. */
  _drawLoot(gx, gy, prop, now) {
    const ctx = this.ctx, rarity = ItemDB.rarity(prop.drop), bob = prop.air ? 0 : Math.sin(now / 420 + prop.x * 3) * 2;
    const img = SpriteRegistry.itemImage(prop.drop, 'ground') || ItemIcons.image(prop.drop);
    if (!prop.air) this.g.ellipse(gx, gy, 11, 5, rarity.order ? rarity.color + '66' : 'rgba(0,0,0,.25)');
    if (img) { const size = 26, h = size * img.naturalHeight / img.naturalWidth; ctx.drawImage(img, gx - size / 2, gy - h - 2 + bob, size, h); }
    if (rarity.order) { ctx.fillStyle = rarity.color; ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(now / 300)); ctx.beginPath(); ctx.arc(gx + 9, gy - 22 + bob, 2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  }

  /** Small glowing paw prints in a cave (a lost cub's trail): two little prints, pulsing one after the other along the trail. */
  _drawTracks(gx, gy, prop, now) {
    const ctx = this.ctx, wave = 0.5 + 0.5 * Math.sin(now / 420 - prop.v * 0.9);
    for (const [dx, dy, k] of [[-7, -3, 0], [6, 3, 1]]) {
      const x = gx + dx, y = gy + dy, a = 0.35 + 0.55 * (k ? 1 - wave : wave);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 14); glow.addColorStop(0, `rgba(150,230,255,${(a * 0.55).toFixed(2)})`); glow.addColorStop(1, 'rgba(150,230,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 14, y - 14, 28, 28);
      ctx.fillStyle = `rgba(210,250,255,${a.toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(x, y, 3.4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      for (let t = 0; t < 4; t++) { ctx.beginPath(); ctx.ellipse(x - 3.6 + t * 2.4, y - 3.4 - (t === 1 || t === 2 ? 0.8 : 0), 1, 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  /** A pile of dropped coins: up to 8 little pixel coins with physics (client-side only; the server just knows the pile). A new pile is THROWN from whoever is nearest
   *  (or falls from above if nobody is): the coins arc, bounce on the ground, tumble and roll to a stop and then lie flat in a loose scatter. Piles that were already
   *  there when you arrived lie flat at once. */
  _drawCoinPile(d, now) {
    const sim = this._pileSim(d, now);
    const ctx = this.ctx, tier = CoinFx.tierOf(d.item), order = sim.coins.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));
    for (const c of order) {
      if (c.hidden) continue;
      const sx = isoX(c.x, c.y), sy = isoY(c.x, c.y), r = CoinFx.radius(d.item);
      ctx.fillStyle = `rgba(0,0,0,${(0.3 * Math.max(0.25, 1 - c.z / 70)).toFixed(2)})`;                                         // a shadow that shrinks with height
      ctx.beginPath(); ctx.ellipse(sx, sy, r * (1 - Math.min(0.4, c.z / 90)), r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.imageSmoothingEnabled = false;
      CoinArt.draw(ctx, sx, sy - c.z - r * 0.5, r, c.f, tier);
    }
    if (d.count > 1) { const gx = isoX(d.x, d.y), gy = isoY(d.x, d.y); ctx.font = '600 10px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText('x' + d.count, gx + 13, gy - 4); ctx.fillStyle = '#fff'; ctx.fillText('x' + d.count, gx + 13, gy - 4); }
  }
  /** The physics state of a pile (made the first time it is seen; a bigger or smaller stack adds or removes pieces) and stepped to `now`. */
  _pileSim(d, now) {
    const fx = this.coinFx, state = this.frameState || {};
    let sim = fx.sims.get(d.id);
    if (!sim) {
      if (fx.sims.size > 300) fx.sims.clear();
      const num = parseInt(d.id.slice(1), 10) || 0;
      let thrower = null, best = 6;
      for (const id in (state.players || {})) { const p = state.players[id], dist = Math.hypot(p.x - d.x, p.y - d.y); if (dist < best) { best = dist; thrower = p; } }
      sim = CoinFx.make(d, num > fx.base ? thrower : null, num > fx.base, now);
      fx.sims.set(d.id, sim);
    } else if (sim.count !== d.count) CoinFx.resize(sim, d);
    CoinFx.step(sim, now);
    return sim;
  }

  /** A stack of any other item on the ground (logs, fruit, wool ...): up to 3 pieces with the same physics as coins (coinFx.js). A new one is thrown from whoever is nearest
   *  (or falls from above, as a log off a felled tree does): it arcs, bounces, wobbles, rolls on and lies still. Stacks already there when you arrive lie still at once. */
  _drawItemPile(d, now) {
    const sim = this._pileSim(d, now), ctx = this.ctx, order = sim.coins.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y)), seed = parseInt(d.id.slice(1), 10) || 0;
    const rarity = ItemDB.rarity(d.item);
    for (const c of order) {
      if (c.hidden) continue;
      const sx = isoX(c.x, c.y), sy = isoY(c.x, c.y);
      ctx.fillStyle = `rgba(0,0,0,${(0.25 * Math.max(0.25, 1 - c.z / 70)).toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, 10 * (1 - Math.min(0.4, c.z / 90)), 4.5, 0, 0, Math.PI * 2); ctx.fill();
      if (rarity.order) this.g.ellipse(sx, sy, 11, 5, rarity.color + '44');
      ctx.save(); ctx.translate(sx, sy - c.z); ctx.rotate(c.rot || 0);
      if (PixelGround[d.item]) PixelGround[d.item](ctx, 0, 0, seed, 0); else this._drawLoot(0, 0, { drop: d.item, x: d.x, air: true }, now);
      ctx.restore();
    }
    if (d.count > 1) { const gx = isoX(d.x, d.y), gy = isoY(d.x, d.y); ctx.font = '600 10px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText('x' + d.count, gx + 11, gy - 2); ctx.fillStyle = '#fff'; ctx.fillText('x' + d.count, gx + 11, gy - 2); }
  }

  /** A pile on the ground, coins or anything else: it is thrown or dropped in, bounces and comes to rest (coinFx.js). */
  _drawDrop(gx, gy, d, now) {
    if (CoinFx.isCoin(d.item)) this._drawCoinPile(d, now); else this._drawItemPile(d, now);
  }

  /** A Round-Up sheep's rope: to whoever has it (a person), or to the ring of the pole it is tied to; a sheep still being calmed shows its bar. */
  _drawRoundupRope(a, sx, sy, now) {
    const rs = a.rs, ctx = this.ctx;
    if (rs.s === 'free') return;
    if (rs.s === 'pole') { const pole = RoundupArena.poles[rs.t], r = RoundupSprites.poleRing(isoX(pole.x, pole.y), isoY(pole.x, pole.y)); RoundupSprites.rope(ctx, r.x, r.y, sx, sy - 14, rs.t, false); return; }
    const holder = (this.players && this.players[rs.by]) || (this.npcsNow && this.npcsNow[rs.by]);
    if (!holder) return;
    const taut = rs.s === 'roped' && Math.hypot(a.x - holder.x, a.y - holder.y) > RoundupRules.rope.calm;
    RoundupSprites.rope(ctx, isoX(holder.x, holder.y), isoY(holder.x, holder.y) - 18, sx, sy - 14, rs.t, taut || rs.c !== undefined);
    if (rs.c !== undefined) {                                                                          // a tug of war: the second roper's rope, and a bar that swings between the two sides
      const chal = (this.players && this.players[rs.cb]) || (this.npcsNow && this.npcsNow[rs.cb]);
      if (chal) RoundupSprites.rope(ctx, isoX(chal.x, chal.y), isoY(chal.x, chal.y) - 18, sx, sy - 10, 1 - rs.t, true);
      const w = 54, h = 9, x = Math.round(sx - w / 2), y = Math.round(sy - 50), cut = Math.round(w * rs.c);
      ctx.fillStyle = 'rgba(8,14,24,.85)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = RoundupSprites.TEAM[rs.t]; ctx.fillRect(x, y, cut, h); ctx.fillStyle = RoundupSprites.TEAM[1 - rs.t]; ctx.fillRect(x + cut, y, w - cut, h);
      ctx.fillStyle = '#fff'; ctx.fillRect(x + cut - 1, y - 3, 2, h + 6);
    } else if (rs.s === 'roped') this._drawTameBar(sx, sy + 16, rs.p, now);
  }

  /** The taming timer over a caught pony: a bar that fills with rainbow as it is gentled (0..1; it only grows once it has been fed the fruit it wants). */
  _drawTameBar(sx, sy, fill, now) {
    const ctx = this.ctx, w = 46, h = 9, x = Math.round(sx - w / 2), y = Math.round(sy - 58);
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,24,.78)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    if (fill > 0) {
      const g = ctx.createLinearGradient(x, 0, x + w, 0), shift = (now / 900) % 1;
      ['#ff5d5d', '#ffb04a', '#ffe45c', '#6fe07a', '#4ac3ff', '#9a7bff', '#ff7bd1'].forEach((c, i, all) => g.addColorStop(Math.min(1, Math.max(0, (i / (all.length - 1) + shift * 0.08))), c));
      ctx.fillStyle = g; ctx.fillRect(x, y, Math.max(1, Math.round(w * Math.min(1, fill))), h);
      ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x, y, Math.max(1, Math.round(w * Math.min(1, fill))), 2);
    }
    ctx.strokeStyle = '#f2e6cf'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    ctx.restore();
  }

  /** The lasso's integrity over a caught pony: full when new, it shortens (and reddens) as the rope strains. */
  _drawRopeBar(sx, sy, rope, now) {
    const ctx = this.ctx, w = 46, h = 5, x = Math.round(sx - w / 2), y = Math.round(sy - 70), low = rope < 0.35;
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,24,.78)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = low ? (Math.floor(now / 200) % 2 ? '#ff5d5d' : '#b83a3a') : rope < 0.65 ? '#ffb04a' : '#d8b878';
    ctx.fillRect(x, y, Math.max(0, Math.round(w * Math.min(1, rope))), h);
    ctx.strokeStyle = '#f2e6cf'; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    ctx.restore();
  }

  _drawLeash(sx, sy, animal, owner) {
    const ctx = this.ctx, def = AnimalDefs[animal.type], ox = isoX(owner.x, owner.y), oy = isoY(owner.x, owner.y);
    const taut = animal.captor && Math.hypot(animal.x - owner.x, animal.y - owner.y) >= ROPE_LENGTH - 0.15;       // at the end of the rope: pulled straight
    const ax = sx, ay = sy - (def.pony ? 30 : 18), bx = ox, by = oy - 20, sag = taut ? 0 : 6 + Math.hypot(bx - ax, by - ay) * 0.12;
    ctx.strokeStyle = taut ? '#d8c08a' : '#8a6a3c'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + sag, bx, by); ctx.stroke();
    ctx.strokeStyle = '#c9a66a'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  _drawTapMarker(now) {
    const marker = this.getTapMarker(now);
    if (!marker) return;
    const ctx = this.ctx, pulse = 1 + Math.sin(now / 150) * 0.12, r = marker.r || 1;     // (r: a highlighted target is ringed larger)
    ctx.strokeStyle = marker.r ? 'rgba(255,248,200,.95)' : 'rgba(255,240,170,.9)'; ctx.lineWidth = marker.r ? 3 : 2; ctx.beginPath();
    ctx.ellipse(isoX(marker.x, marker.y), isoY(marker.x, marker.y), 16 * TILE_SCALE * pulse * r, 8 * TILE_SCALE * pulse * r, 0, 0, Math.PI * 2); ctx.stroke();
  }
}
